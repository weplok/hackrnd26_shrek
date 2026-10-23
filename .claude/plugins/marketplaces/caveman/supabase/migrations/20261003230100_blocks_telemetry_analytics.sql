-- Product analytics over public.blocks_events, in the same analytics schema as
-- the CLI views: not exposed through the Data API and nothing granted to
-- anon/authenticated; read it from the SQL editor or a direct connection.
--
-- A "user" is one Caveman Blocks install: the install id saved in Blocks'
-- telemetry.json. A linked install reuses the Caveman CLI's install id, so the
-- same id can also appear in public.cli_events (analytics.product_overlap).
-- One person on two machines counts twice; telemetry off then on starts a new
-- id.
--
-- Activity is dated by UTC day: a daily_usage row by its `day` (the day it
-- counts, delivered a day or more later), every other event by server
-- received_at, never the client-claimed ts:
--   coalesce(day, (received_at at time zone 'utc')::date)
-- So the latest days keep filling in for up to a week as daily_usage arrives.
--
-- Usage figures (sessions, scripts, hints, runs, bytes) come from daily_usage
-- only and are counts the hook and runner recorded. sessions is a per-day,
-- per-repo distinct count, so a session active on two UTC days or in two repos
-- counts twice. bytes_withheld is block output the agent did not receive, a
-- byte count, not a token or cost figure: per install and day,
-- greatest(bytes_full - bytes_returned, 0). The runner's wrapper can return
-- more bytes than a block printed, so the difference can be negative.
--
-- ponytail: plain views recompute on every read; materialize the heavy ones
-- once the table is large. blocks_daily goes first: its 30-day range join is a
-- nested loop, measured at about 65 s and 2 GB of sort spill on 1M rows.

create view analytics.blocks_users with (security_invoker = true) as
with e as (
  -- Named columns, not *: the view then depends only on what it reads, so an
  -- unrelated column can still be dropped or retyped.
  select
    id, anonymous_id, event, cli_version, os, arch, install_channel, linked, ip,
    command, subcommand, exit_class,
    sessions, scripts, hints, hints_followed, runs, bytes_full, bytes_returned,
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
  coalesce(sum(greatest(bytes_full - bytes_returned, 0)), 0) as bytes_withheld
from e
group by anonymous_id;

-- Windows are N UTC days ending today: active_1d is today only, matching
-- analytics.blocks_daily's dau.
create view analytics.blocks_summary with (security_invoker = true) as
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
  round(100.0 * usage.followed_capped / nullif(usage.hints_30d, 0), 1) as hint_follow_pct_30d
from u, usage;

create view analytics.blocks_daily with (security_invoker = true) as
with activity as (
  select
    coalesce(day, (received_at at time zone 'utc')::date) as day,
    anonymous_id,
    count(*) as events,
    count(*) filter (where event = 'command_run' and exit_class = 'error') as command_errors,
    coalesce(sum(sessions), 0) as sessions,
    coalesce(sum(scripts), 0) as scripts,
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
  coalesce(sum(a.bytes_withheld) filter (where a.day = d.day), 0) as bytes_withheld
from days d
left join activity a on a.day > d.day - 30 and a.day <= d.day
group by d.day;

-- Same shape as analytics.retention_weekly. Offsets with zero retained users
-- have no row (read a missing offset as 0).
create view analytics.blocks_retention_weekly with (security_invoker = true) as
with activity as (
  select distinct
    anonymous_id,
    date_trunc('week', coalesce(day, (received_at at time zone 'utc')::date)::timestamp)::date as week
  from public.blocks_events
),
cohorts as (select anonymous_id, min(week) as cohort_week from activity group by 1),
sizes as (select cohort_week, count(*) as cohort_size from cohorts group by 1)
select
  c.cohort_week,
  s.cohort_size,
  (a.week - c.cohort_week) / 7 as week_offset,
  count(*) as retained_users,
  round(100.0 * count(*) / s.cohort_size, 1) as retained_pct,
  bool_or(a.week = date_trunc('week', now() at time zone 'utc')::date) as partial_week
from cohorts c
join activity a using (anonymous_id)
join sizes s using (cohort_week)
group by 1, 2, 3;

-- Installs that ever reached each step. The steps are not ordered: an install
-- can run blocks without ever running scan.
create view analytics.blocks_funnel with (security_invoker = true) as
select
  count(*) as installs,
  count(*) filter (where has_scan) as scanned,
  count(*) filter (where has_init) as initialized,
  count(*) filter (where has_hooks_install) as hooks_installed,
  count(*) filter (where hints > 0) as hint_shown,
  count(*) filter (where hints_followed > 0) as hint_followed,
  count(*) filter (where has_block_runs) as block_run
from analytics.blocks_users;

-- Per first-party block: successful adds (command_run add) and runs (daily
-- first_party_runs). Names the receiver did not know yet are not here.
create view analytics.blocks_block_usage with (security_invoker = true) as
with adds as (
  select block, count(*) as adds, count(distinct anonymous_id) as users_added
  from public.blocks_events
  where event = 'command_run' and command = 'add' and exit_class = 'ok' and block is not null
  group by block
),
runs as (
  select
    r.key as block,
    sum(r.value::bigint) as runs,
    count(distinct e.anonymous_id) filter (where r.value::bigint > 0) as users_ran,
    coalesce(sum(r.value::bigint) filter (where e.day > (now() at time zone 'utc')::date - 30), 0) as runs_30d
  from public.blocks_events e
  cross join lateral jsonb_each(e.first_party_runs) r
  where e.event = 'daily_usage'
  group by r.key
)
select
  block,
  coalesce(adds.adds, 0) as adds,
  coalesce(adds.users_added, 0) as users_added,
  coalesce(runs.runs, 0) as runs,
  coalesce(runs.users_ran, 0) as users_ran,
  coalesce(runs.runs_30d, 0) as runs_30d
from adds
full join runs using (block);

-- Per harness, from daily harness_sessions (per-day distinct sessions).
create view analytics.blocks_harness_usage with (security_invoker = true) as
select
  h.key as harness,
  sum(h.value::bigint) as sessions,
  count(distinct e.anonymous_id) filter (where h.value::bigint > 0) as users,
  coalesce(sum(h.value::bigint) filter (where e.day > (now() at time zone 'utc')::date - 30), 0) as sessions_30d,
  count(distinct e.anonymous_id) filter (where h.value::bigint > 0 and e.day > (now() at time zone 'utc')::date - 30) as users_30d
from public.blocks_events e
cross join lateral jsonb_each(e.harness_sessions) h
where e.event = 'daily_usage'
group by h.key;

-- Per install, the totals of its latest successful scan.
create view analytics.blocks_scan with (security_invoker = true) as
select distinct on (anonymous_id)
  anonymous_id,
  received_at as scanned_at,
  scan_window_days,
  scan_commands,
  scan_scripts,
  scan_edits,
  scan_shapes,
  scan_repeated_shapes,
  scan_covered_shapes,
  scan_covered_scripts,
  scan_top_count
from public.blocks_events
where event = 'command_run' and command = 'scan' and exit_class = 'ok'
order by anonymous_id, id desc;

-- Blocks installs that are also Caveman CLI installs: linked is the install's
-- latest flag; also_in_cli_events matches the id in public.cli_events.
create view analytics.product_overlap with (security_invoker = true) as
select
  count(*) as blocks_installs,
  count(*) filter (where u.linked) as linked_installs,
  count(*) filter (
    where exists (select 1 from public.cli_events c where c.anonymous_id = u.anonymous_id)
  ) as also_in_cli_events
from analytics.blocks_users u;
