-- analytics.blocks_funnel: hooks_installed also counts installs whose hook ran.
--
-- `caveman on scripts` (the Caveman CLI) runs `caveman-blocks hooks install`
-- with no terminal, and a non-interactive command sends no command_run, so a
-- hub install never has has_hooks_install. Its daily_usage proves the hook
-- ran: sessions, calls or scripts above zero only come from the hook.
--
-- Only hooks_installed changes; columns keep their names, order and types, so
-- create or replace leaves the view in place. blocks_users.has_hooks_install
-- still means a successful interactive hooks install.
create or replace view analytics.blocks_funnel with (security_invoker = true) as
select
  count(*) as installs,
  count(*) filter (where has_scan) as scanned,
  count(*) filter (where has_init) as initialized,
  count(*) filter (
    where has_hooks_install or exists (
      select 1
      from public.blocks_events d
      where d.anonymous_id = u.anonymous_id
        and d.event = 'daily_usage'
        and (d.sessions > 0 or d.calls > 0 or d.scripts > 0)
    )
  ) as hooks_installed,
  count(*) filter (where hints > 0) as hint_shown,
  count(*) filter (where hints_followed > 0) as hint_followed,
  count(*) filter (where has_block_runs) as block_run
from analytics.blocks_users u;
