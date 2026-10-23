-- Caveman Blocks telemetry, after 20261003230000/20261003230100 went live:
--   1. daily_usage may carry scripts_bytes, the bytes of the inline scripts
--      captured (a count, never the text; the function caps it below 2^36 like
--      the other byte counts). Null on rows from clients that predate it, so a
--      bytes-per-script figure must divide by scripts only over rows where it
--      is not null. Summed in blocks_users, blocks_summary (30d), blocks_daily.
--   2. A daily_usage row no longer loses its day to a busy address. Behind an
--      office NAT, commands could spend the shared 30/min per sender, and a
--      dropped day is never resent (the sender only sees 202). Daily rows now
--      have their own per-sender minute counter instead.
--   3. The new-install limit runs before the global ceiling, so rows with
--      forged fresh ids that it rejects never spend the shared global budget.
-- private.cli_events_rate_limit() (the cli_events path) is not touched.

alter table public.blocks_events add column if not exists scripts_bytes bigint;
comment on column public.blocks_events.scripts_bytes is
  'daily_usage: bytes of the inline scripts captured (a count, never the text); null from clients that predate the field.';

-- Per-sender per-minute count of daily_usage rows, apart from
-- private.cli_events_rate so commands and CLI events cannot crowd a day out.
create table if not exists private.blocks_daily_rate (
  bucket cidr not null,
  minute timestamptz not null,
  n integer not null,
  primary key (bucket, minute)
);
alter table private.blocks_daily_rate enable row level security;
revoke all on table private.blocks_daily_rate from public, anon, authenticated;
grant select, insert, update on table private.blocks_daily_rate to service_role;

select cron.schedule(
  'blocks-daily-rate-prune',
  '*/10 * * * *',
  $$delete from private.blocks_daily_rate where minute < now() - interval '10 minutes'$$
);

-- Order, per row:
--   daily_usage: own per-sender minute count (300), then the dedupe. Every
--     daily attempt is counted there, duplicates and resends included, so a
--     flood of copies of one day is metered; a resend then spends nothing
--     else (no daily count, no new-install slot, no global capacity).
--   other events: the per-sender minute count shared with cli_events (30).
--   all: per-sender daily count (5000, shared), new installs per sender per
--     day (500, shared), global ceiling (10000/min, shared).
-- Rows over a limit are skipped (BEFORE trigger returns NULL), never failing
-- the batch. See 20260925040000_cli_telemetry_abuse_retention.sql for the
-- lockout arithmetic. With daily rows off the shared minute count, one
-- address adds at most 5000 attempts a day to the global ceiling whatever ids
-- it forges, and fresh ids are bounded by the new-install count first.
create or replace function private.blocks_events_rate_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_minute timestamptz := date_trunc('minute', now());
  v_day date := (now() at time zone 'utc')::date;
  -- IPv4 per address, IPv6 per /48. Rows without an IP share one bucket.
  v_bucket cidr := coalesce(
    network(set_masklen(new.ip, case family(new.ip) when 6 then 48 else 32 end)),
    '0.0.0.0/0'
  );
  v_n integer;
begin
  if new.event = 'daily_usage' then
    -- 300 a minute: one row per install and day, so this is an office of
    -- hundreds flushing the same minute. A concurrent resend from the same
    -- sender waits on this counter row until the first write commits, so the
    -- dedupe below then sees it.
    insert into private.blocks_daily_rate as r (bucket, minute, n)
    values (v_bucket, v_minute, 1)
    on conflict (bucket, minute) do update set n = r.n + 1
    returning r.n into v_n;
    if v_n > 300 then
      return null;
    end if;

    -- A day's daily_usage is stored once, first write wins, so a client that
    -- resends after a lost acknowledgement never double counts. A duplicate
    -- earlier in the same batch is visible here too. The advisory lock covers
    -- a concurrent resend from another bucket (a host's IPv4 and IPv6
    -- address); blocks_events_daily_usage_idx is the backstop.
    --
    -- The lock is only ever tried, never waited for: an earlier row of the
    -- same batch may already hold a counter row below, so waiting here while
    -- the other transaction waits for that row is a deadlock. If someone else
    -- holds it they are storing this install's day right now: skip ours.
    -- Should their row then not be stored after all, the day is lost: the
    -- client's next flush does not resend it. The key is two integers, not
    -- text, so it cannot depend on a session's DateStyle.
    --
    -- Accepted: whoever knows an install id can store that install's day
    -- first (an all-zero row) and so suppress the real one. The id is a random
    -- UUID shown only to its owner; there is no cheaper fix without
    -- authentication.
    if not pg_try_advisory_xact_lock(hashtext(new.anonymous_id::text), new.day - date '2000-01-01') then
      return null;
    end if;
    if exists (
      select 1 from public.blocks_events e
      where e.event = 'daily_usage' and e.anonymous_id = new.anonymous_id and e.day = new.day
    ) then
      return null;
    end if;
  else
    insert into private.cli_events_rate as r (bucket, minute, n)
    values (v_bucket, v_minute, 1)
    on conflict (bucket, minute) do update set n = r.n + 1
    returning r.n into v_n;
    if v_n > 30 then
      return null;
    end if;
  end if;

  insert into private.cli_events_rate_daily as r (bucket, day, n)
  values (v_bucket, v_day, 1)
  on conflict (bucket, day) do update set n = r.n + 1
  returning r.n into v_n;
  if v_n > 5000 then
    return null;
  end if;

  -- New installs per sender per day, before the global ceiling so a forged
  -- fresh id it rejects never spends shared capacity. The 500 slots are
  -- shared with cli_events; an id is new here when blocks_events has never
  -- stored it, even if the CLI has. Accepted: a row the global ceiling then
  -- drops has spent a slot, and its id spends another when it comes back.
  if not exists (select 1 from public.blocks_events e where e.anonymous_id = new.anonymous_id) then
    insert into private.cli_events_new_ids as r (bucket, day, n)
    values (v_bucket, v_day, 1)
    on conflict (bucket, day) do update set n = r.n + 1
    returning r.n into v_n;
    if v_n > 500 then
      return null;
    end if;
  end if;

  -- Global ceiling ('::/0' row), shared with cli_events. Keep the 10000 in
  -- step with public.cli_events_global_full(), which the Edge Function asks.
  insert into private.cli_events_rate as r (bucket, minute, n)
  values ('::/0', v_minute, 1)
  on conflict (bucket, minute) do update set n = r.n + 1
  returning r.n into v_n;
  if v_n > 10000 then
    return null;
  end if;

  return new;
end;
$$;

-- The views gain scripts_bytes as their last column: create or replace can
-- only append, and appending leaves the views that read these
-- (blocks_summary, blocks_funnel, product_overlap) in place.
create or replace view analytics.blocks_users with (security_invoker = true) as
with e as (
  -- Named columns, not *: the view then depends only on what it reads, so an
  -- unrelated column can still be dropped or retyped.
  select
    id, anonymous_id, event, cli_version, os, arch, install_channel, linked, ip,
    command, subcommand, exit_class,
    sessions, scripts, scripts_bytes, hints, hints_followed, runs, bytes_full, bytes_returned,
    coalesce(day, (received_at at time zone 'utc')::date) as active_on
  from public.blocks_events
)
select
  anonymous_id,
  min(active_on) as first_seen,
  max(active_on) as last_seen,
  count(distinct active_on) as active_days,
  count(*) as events,
  count(*) filter (where event = 'command_run') as commands,
  count(*) filter (where exit_class = 'error') as errors,
  (array_agg(cli_version order by id desc) filter (where cli_version is not null))[1] as cli_version,
  (array_agg(os order by id desc))[1] as os,
  (array_agg(arch order by id desc))[1] as arch,
  (array_agg(install_channel order by id desc) filter (where install_channel is not null))[1] as install_channel,
  (array_agg(linked order by id desc))[1] as linked,
  (array_agg(ip order by id desc) filter (where ip is not null))[1] as last_ip,
  count(distinct ip) as distinct_ips,
  case
    when max(active_on) > (now() at time zone 'utc')::date - 7 then 'active'
    when max(active_on) > (now() at time zone 'utc')::date - 30 then 'at_risk'
    else 'churned'
  end as status,
  -- Activation steps count successful commands only: a failed hooks install
  -- installed nothing.
  count(*) filter (where command = 'scan' and exit_class = 'ok') > 0 as has_scan,
  count(*) filter (where command = 'init' and exit_class = 'ok') > 0 as has_init,
  count(*) filter (where command = 'hooks' and subcommand = 'install' and exit_class = 'ok') > 0 as has_hooks_install,
  count(*) filter (where command = 'add' and exit_class = 'ok') > 0 as has_add,
  count(*) filter (where runs > 0) > 0 as has_block_runs,
  coalesce(sum(sessions), 0) as sessions,
  coalesce(sum(scripts), 0) as scripts,
  coalesce(sum(hints), 0) as hints,
  coalesce(sum(hints_followed), 0) as hints_followed,
  coalesce(sum(runs), 0) as runs,
  coalesce(sum(greatest(bytes_full - bytes_returned, 0)), 0) as bytes_withheld,
  coalesce(sum(scripts_bytes), 0) as scripts_bytes
from e
group by anonymous_id;

create or replace view analytics.blocks_summary with (security_invoker = true) as
with u as (
  select
    count(*) as users_total,
    count(*) filter (where last_seen > (now() at time zone 'utc')::date - 1) as active_1d,
    count(*) filter (where last_seen > (now() at time zone 'utc')::date - 7) as active_7d,
    count(*) filter (where last_seen > (now() at time zone 'utc')::date - 30) as active_30d,
    count(*) filter (where first_seen > (now() at time zone 'utc')::date - 7) as new_7d,
    count(*) filter (where first_seen > (now() at time zone 'utc')::date - 30) as new_30d,
    count(*) filter (where status = 'churned') as churned,
    count(*) filter (where linked) as linked_users
  from analytics.blocks_users
),
per_install as (
  select
    sum(sessions) as sessions,
    sum(hints) as hints,
    sum(hints_followed) as hints_followed,
    sum(runs) as runs,
    sum(scripts_bytes) as scripts_bytes,
    sum(greatest(bytes_full - bytes_returned, 0)) as bytes_withheld
  from public.blocks_events
  where event = 'daily_usage' and day > (now() at time zone 'utc')::date - 30
  group by anonymous_id
),
usage as (
  select
    coalesce(sum(sessions), 0) as sessions_30d,
    coalesce(sum(hints), 0) as hints_30d,
    coalesce(sum(hints_followed), 0) as hints_followed_30d,
    coalesce(sum(runs), 0) as runs_30d,
    coalesce(sum(scripts_bytes), 0) as scripts_bytes_30d,
    coalesce(sum(bytes_withheld), 0) as bytes_withheld_30d,
    -- An install never counts more follows than hints here, so one forged
    -- row (the endpoint is unauthenticated) cannot push the rate past 100.
    coalesce(sum(least(hints_followed, hints)), 0) as followed_capped
  from per_install
)
select
  u.*,
  usage.sessions_30d,
  usage.hints_30d,
  usage.hints_followed_30d,
  usage.runs_30d,
  usage.bytes_withheld_30d,
  -- share of counted hints followed by a call of the hinted block
  round(100.0 * usage.followed_capped / nullif(usage.hints_30d, 0), 1) as hint_follow_pct_30d,
  usage.scripts_bytes_30d
from u, usage;

create or replace view analytics.blocks_daily with (security_invoker = true) as
with activity as (
  select
    coalesce(day, (received_at at time zone 'utc')::date) as day,
    anonymous_id,
    count(*) as events,
    count(*) filter (where event = 'command_run' and exit_class = 'error') as command_errors,
    coalesce(sum(sessions), 0) as sessions,
    coalesce(sum(scripts), 0) as scripts,
    coalesce(sum(scripts_bytes), 0) as scripts_bytes,
    coalesce(sum(hints), 0) as hints,
    coalesce(sum(hints_followed), 0) as hints_followed,
    coalesce(sum(promote_hints), 0) as promote_hints,
    coalesce(sum(calls), 0) as calls,
    coalesce(sum(runs), 0) as runs,
    coalesce(sum(runs_failed), 0) as runs_failed,
    coalesce(sum(runs_user), 0) as runs_user,
    coalesce(sum(verify_pass), 0) as verify_pass,
    coalesce(sum(verify_fail), 0) as verify_fail,
    coalesce(sum(greatest(bytes_full - bytes_returned, 0)), 0) as bytes_withheld
  from public.blocks_events
  group by 1, 2
),
first_day as (select anonymous_id, min(day) as day from activity group by 1),
days as (
  select g::date as day
  from (select min(day) as lo from activity) b,
       generate_series(b.lo, (now() at time zone 'utc')::date, interval '1 day') g
)
select
  d.day,
  count(distinct a.anonymous_id) filter (where a.day = d.day) as dau,
  count(distinct a.anonymous_id) filter (where a.day > d.day - 7) as wau,
  count(distinct a.anonymous_id) as mau,
  (select count(*) from first_day f where f.day = d.day) as new_users,
  coalesce(sum(a.events) filter (where a.day = d.day), 0) as events,
  coalesce(sum(a.command_errors) filter (where a.day = d.day), 0) as command_errors,
  coalesce(sum(a.sessions) filter (where a.day = d.day), 0) as sessions,
  coalesce(sum(a.scripts) filter (where a.day = d.day), 0) as scripts,
  coalesce(sum(a.hints) filter (where a.day = d.day), 0) as hints,
  coalesce(sum(a.hints_followed) filter (where a.day = d.day), 0) as hints_followed,
  coalesce(sum(a.promote_hints) filter (where a.day = d.day), 0) as promote_hints,
  coalesce(sum(a.calls) filter (where a.day = d.day), 0) as calls,
  coalesce(sum(a.runs) filter (where a.day = d.day), 0) as runs,
  coalesce(sum(a.runs_failed) filter (where a.day = d.day), 0) as runs_failed,
  coalesce(sum(a.runs_user) filter (where a.day = d.day), 0) as runs_user,
  coalesce(sum(a.verify_pass) filter (where a.day = d.day), 0) as verify_pass,
  coalesce(sum(a.verify_fail) filter (where a.day = d.day), 0) as verify_fail,
  coalesce(sum(a.bytes_withheld) filter (where a.day = d.day), 0) as bytes_withheld,
  coalesce(sum(a.scripts_bytes) filter (where a.day = d.day), 0) as scripts_bytes
from days d
left join activity a on a.day > d.day - 30 and a.day <= d.day
group by d.day;
