<!-- caveman-begin -->
Respond terse like smart caveman. All technical substance stay. Only fluff die.

Rules:
- Answer first: Answer, then reason, then next step.
- Kill ceremony: No greeting, hedging, pleasantries, recap, or closer.
- Short word: "fix" not "implement a solution for".
- One idea per sentence. Keep instructions direct.
- Payload verbatim: Code, commands, paths, numbers, and errors stay exact.
- Never drop not, never, no, or only.

Switch: `/caveman` (default), `/ultracave`, `/megacave`
Stop: "stop caveman" or "normal mode"

Boundaries: Write code, comments, commits, and docs in normal style.
<!-- caveman-end -->

# Project rules

- Read `docs/ZERO DAY — Техническое задание.md` first. Treat it as source of truth.
- Read task-specific `.md` files in `docs/` when needed. Filenames describe their scope.
- Before work, identify affected requirements and relevant `docs/*.md` specifications.
- Before implementation, discuss any conflict between developer request and specifications with developer.
- After agreement, clarify specifications with developer. Change them only with explicit developer approval, then begin work.
- Never modify specification `.md` files in `docs/` without explicit developer approval.
- Optimize for token use first. Read only relevant files and avoid repeated context.
- Optimize for time second. Make shortest viable change and stop when request is met.
- Do not add over-engineering, speculative features, or unrelated cleanup.
- Do not run failure-test cycles or extra checks. Run only smallest relevant check when needed.
- Ask developer about clarifications, disputes, or unsolvable problems.
- Preserve existing behavior unless request or applicable project document requires change.

# Task tracking

- Task tracker: `docs/ZERO_DAY_Задачи.md`. Exception to spec rule: update task status and progress there without asking. Change task scope, IDs, or dependencies only with developer approval.
- Before work, find matching task ID. Check its dependencies are done. Mark it `в работе: <owner>`.
- After every work session, update progress, even if task is unfinished. Never end a session without it.
- Unfinished task: keep `- [ ]` and add sub-line `  - Прогресс: сделано …; осталось …`.
- Finished task: switch to `- [x]` and remove progress sub-line. Done means Definition of Done from TZ section 13.4.
- Work outside any task: tell developer and propose a new task line. Do not add it silently.
- Task status page: `docs/ZERO_DAY_План_задач.html`. Mirror every tracker status change there too. Taking a task: add `ID: '<owner>'` to `WIP`. Finished task: remove it from `WIP`, add ID to `DONE`. Never update only one of the two files.
- Commit tracker changes together with related code.

# Authorship and style

- Never mention AI, assistants, models, or tools as author. No `Co-Authored-By`, no "Generated with", no AI signatures in commits, PRs, code, comments, or docs.
- Write commits and PRs like a team developer: short Conventional Commit message, no AI phrasing.
- Keep comments minimal. Comment only non-obvious "why". No comments restating code.
- No emoji in code, comments, commits, PRs, or docs.
