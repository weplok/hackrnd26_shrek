-- Caveman Blocks usage telemetry: wire contract blocks/v1, documented at
-- https://github.com/caveman-ai/blocks/blob/main/docs/TELEMETRY.md. Written
-- only by the blocks-telemetry Edge Function (service role); anon and
-- authenticated have no access. Rate limits share the CLI telemetry's counter
-- rows, so one sender's budget and the global ceiling cover both products.
create table public.blocks_events (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  -- Client IP as seen by the edge (cf-connecting-ip), not client-supplied.
  ip inet,
  ts timestamptz not null,
  anonymous_id uuid not null,
  event text not null check (event in ('first_run', 'command_run', 'daily_usage')),
  cli_version text,
  os text not null,
  arch text not null,
  install_channel text,
  -- the install id is shared with the Caveman CLI (public.cli_events)
  linked boolean not null default false,
  -- command_run
  command text,
  subcommand text,
  -- add/run only, and only first-party names: the function stores null for
  -- any other name, so a user's block names never land here.
  block text,
  duration_ms bigint,
  exit_class text,
  error_class text,
  -- command_run of a successful scan
  scan_window_days bigint,
  scan_commands bigint,
  scan_scripts bigint,
  scan_edits bigint,
  scan_shapes bigint,
  scan_repeated_shapes bigint,
  scan_covered_shapes bigint,
  scan_covered_scripts bigint,
  scan_top_count bigint,
  -- daily_usage: counts for the UTC day `day`, sent a day or more later
  day date,
  repos_active bigint,
  sessions bigint,
  scripts bigint,
  hints bigint,
  hints_followed bigint,
  promote_hints bigint,
  calls bigint,
  runs bigint,
  runs_failed bigint,
  runs_user bigint,
  verify_pass bigint,
  verify_fail bigint,
  bytes_full bigint,
  bytes_returned bigint,
  blocks_first_party bigint,
  blocks_user bigint,
  -- first-party block name -> runs; harness -> distinct sessions
  first_party_runs jsonb,
  harness_sessions jsonb,
  -- The daily dedupe and the analytics date a row by `day` exactly when it
  -- is a daily_usage row.
  constraint blocks_events_day_check check ((event = 'daily_usage') = (day is not null)),
  constraint blocks_events_command_check check (
    (event = 'command_run') = (command is not null) and (event = 'command_run') = (exit_class is not null)
  ),
  -- jsonb_each in the analytics views fails on anything but an object.
  constraint blocks_events_maps_check check (
    jsonb_typeof(first_party_runs) = 'object' and jsonb_typeof(harness_sessions) = 'object'
  )
);

comment on table public.blocks_events is
  'Caveman Blocks telemetry events. RLS on with no policies on purpose: only the service role (blocks-telemetry Edge Function) writes.';

create index blocks_events_received_at_idx on public.blocks_events (received_at);

-- Serves the new-install lookup in the trigger and deletion requests by id.
create index blocks_events_anonymous_id_idx on public.blocks_events (anonymous_id);

-- Only rows still holding an IP, so the daily IP-retention job never rescans
-- cleared rows.
create index blocks_events_ip_retention_idx on public.blocks_events (received_at) where ip is not null;

-- One daily_usage row per install and UTC day. Serves the trigger's dedupe
-- lookup; unique so a duplicate can never be stored by any path.
create unique index blocks_events_daily_usage_idx on public.blocks_events (anonymous_id, day)
  where event = 'daily_usage';

alter table public.blocks_events enable row level security;

-- This project still has the old default grants (anon/authenticated get ALL on
-- new public tables), so strip them explicitly. The service role needs SELECT
-- for the trigger's lookups; it inserts through the Data API.
revoke all on table public.blocks_events from anon, authenticated, service_role;
revoke all on sequence public.blocks_events_id_seq from anon, authenticated, service_role;
grant select, insert on table public.blocks_events to service_role;

-- Same limits as the current private.cli_events_rate_limit(), on the same
-- counter rows; see 20260925040000_cli_telemetry_abuse_retention.sql for the
-- lockout arithmetic. Rows over a limit are skipped (BEFORE trigger returns
-- NULL) instead of failing the batch.
create function private.blocks_events_rate_limit()
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
  -- Per-sender limits count attempts, so a flood spends its own budget.
  insert into private.cli_events_rate as r (bucket, minute, n)
  values (v_bucket, v_minute, 1)
  on conflict (bucket, minute) do update set n = r.n + 1
  returning r.n into v_n;
  if v_n > 30 then
    return null;
  end if;

  insert into private.cli_events_rate_daily as r (bucket, day, n)
  values (v_bucket, v_day, 1)
  on conflict (bucket, day) do update set n = r.n + 1
  returning r.n into v_n;
  if v_n > 5000 then
    return null;
  end if;

  -- A day's daily_usage is stored once, first write wins, so a client that
  -- resends after a lost acknowledgement never double counts. Checked here:
  -- after the per-sender counters, so a resend spends its sender's budget
  -- like any attempt, and a concurrent resend from the same sender has
  -- already waited on the counter rows above until the first write committed
  -- (this statement then sees it); before the global ceiling and the
  -- new-install count, so a row that adds nothing never spends shared
  -- capacity or a new-install slot. The advisory lock covers a concurrent
  -- resend from another bucket (a host's IPv4 and IPv6 address);
  -- blocks_events_daily_usage_idx is the backstop.
  --
  -- The lock is only ever tried, never waited for. An earlier row of the same
  -- batch may already hold the global counter row below, so waiting here while
  -- the other transaction waits for that row is a deadlock that aborts a whole
  -- batch and stalls every sender behind the global row. If someone else holds
  -- the lock they are storing this install's day right now: skip ours. Should
  -- their row then not be stored after all (their transaction rolls back, or
  -- a limit below drops it), the day is lost: the client's next flush does not
  -- resend it. The key is two integers, not text, so it cannot depend on a
  -- session's DateStyle.
  --
  -- Accepted: whoever knows an install id can store that install's day first
  -- (an all-zero row) and so suppress the real one. The id is a random UUID
  -- shown only to its owner; there is no cheaper fix without authentication.
  if new.event = 'daily_usage' then
    if not pg_try_advisory_xact_lock(hashtext(new.anonymous_id::text), new.day - date '2000-01-01') then
      return null;
    end if;
    if exists (
      select 1 from public.blocks_events e
      where e.event = 'daily_usage' and e.anonymous_id = new.anonymous_id and e.day = new.day
    ) then
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

  -- New installs per sender per day, checked last so an event another limit
  -- dropped never spends a slot. The 500 slots are shared with cli_events; an
  -- id is new here when blocks_events has never stored it, even if the CLI has
  -- (a linked install spends one slot on its first Blocks event).
  if not exists (select 1 from public.blocks_events e where e.anonymous_id = new.anonymous_id) then
    insert into private.cli_events_new_ids as r (bucket, day, n)
    values (v_bucket, v_day, 1)
    on conflict (bucket, day) do update set n = r.n + 1
    returning r.n into v_n;
    if v_n > 500 then
      return null;
    end if;
  end if;

  return new;
end;
$$;

create trigger blocks_events_rate_limit
before insert on public.blocks_events
for each row execute function private.blocks_events_rate_limit();

-- Retention, as the blocks contract states and as cli_events has (cli jobs run
-- at 03:17 and 03:37, the counter prune every 10 minutes). The existing
-- cli-events-rate-prune job already prunes the shared counter tables.
select cron.schedule(
  'blocks-events-ip-retention',
  '27 3 * * *',
  $$update public.blocks_events set ip = null where ip is not null and received_at < now() - interval '90 days'$$
);

select cron.schedule(
  'blocks-events-retention',
  '47 3 * * *',
  $$delete from public.blocks_events where received_at < now() - interval '13 months'$$
);

-- Deletion request for one install (the blocks contract's "Delete what was
-- sent"), run in the SQL editor:
--   delete from public.blocks_events where anonymous_id = '<install id>';
-- blocks_events_anonymous_id_idx serves it. A linked install shares its id
-- with public.cli_events; delete there too when the request covers both.
