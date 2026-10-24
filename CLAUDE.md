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
- After completing a task and adding tests, ensure they run in GitHub Actions. Prefer existing discovery commands; add or update CI only when discovery does not cover them.
- Ask developer about clarifications, disputes, or unsolvable problems.
- Preserve existing behavior unless request or applicable project document requires change.

# Task tracking

- Task tracker: `docs/ZERO_DAY_Задачи.md`. Exception to spec rule: update status and progress of your current task there without asking (see Status protection). Change task scope, IDs, or dependencies only with developer approval.
- Before work, find matching task ID. Check its dependencies are done. Mark it `в работе: <owner>`.
- After every work session, update progress, even if task is unfinished. Never end a session without it.
- Unfinished task: keep `- [ ]` and add sub-line `  - Прогресс: сделано …; осталось …`.
- Finished task: switch to `- [x]` and remove progress sub-line. Done means Definition of Done from TZ section 13.4.
- Work outside any task: tell developer and propose a new task line. Do not add it silently.
- Task status page: `docs/ZERO_DAY_План_задач.html`. Mirror every tracker status change there too. Taking a task: add `ID: '<owner>'` to `WIP`. Finished task: remove it from `WIP`, add ID to `DONE`. Never update only one of the two files.
- Commit tracker changes together with related code.

## Status protection

- Your current task = task ID the developer gave you or you took in this session. Change status, owner, and progress only of it.
- Never change status, owner, or progress of any other task unless the developer explicitly asks for that task ID. This covers reopening done tasks, closing tasks, reassigning owners, and "fixing" mismatches between the two status files.
- Found a status that looks wrong or a mismatch between tracker and status page: report it to the developer. Do not fix it yourself.
- Edit statuses point by point. In `docs/ZERO_DAY_План_задач.html` add or remove only your own IDs inside `DONE`, `DONE_BY`, and `WIP`. Never rewrite these lines from memory, an old copy, or another branch.
- Run `git pull --rebase` before editing status files, so you edit the current version.
- Before every `git push`, run `git pull --rebase`. Resolve conflicts by the rules below, rerun the relevant check, then push.
- Merge or rebase conflict in status files: keep every status from both sides, then apply only your own change. Never resolve with "ours" or "theirs" for the whole file. If two sides disagree on one task, ask the developer.
- Never commit conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`). Check status files for them before every commit.
- Before a commit, read `git diff` of status files. Every changed status line must belong to your current task or to an explicit developer request.

# Push procedure

Every `git push` follows these steps, in order. No exceptions, including small or docs-only pushes.

1. `git status`: commit only intended files. Never commit secrets or unrelated changes.
2. Check status files for conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`).
3. Read `git diff --cached` of status files. Every changed status line must belong to your current task or to an explicit developer request.
4. Commit with a short Conventional Commit message. Tracker changes go together with related code. No AI attribution.
5. `git pull --rebase`. Resolve conflicts by Status protection rules. Repeat steps 2-3 after resolving.
6. Rerun the smallest relevant check if code changed during rebase.
7. `git push`. Never use `--force` or `--force-with-lease` on `main` without explicit developer approval.

# Authorship and style

- Never mention AI, assistants, models, or tools as author. No `Co-Authored-By`, no "Generated with", no AI signatures in commits, PRs, code, comments, or docs.
- Write commits and PRs like a team developer: short Conventional Commit message, no AI phrasing.
- Keep comments minimal. Comment only non-obvious "why". No comments restating code.
- No emoji in code, comments, commits, PRs, or docs.
