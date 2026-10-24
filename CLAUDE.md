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

- Developer request is source of truth. Do exactly what developer asks.
- TZ (`docs/ZERO DAY — Техническое задание.md`) and other `docs/*.md` are reference only. Not mandatory. Read them only when request needs context.
- No need to check request against specifications or discuss conflicts with them.
- Never modify specification `.md` files in `docs/` without explicit developer request.
- Optimize for token use first. Read only relevant files and avoid repeated context.
- Optimize for time second. Make shortest viable change and stop when request is met.
- Do not add over-engineering, speculative features, or unrelated cleanup.
- Do not run failure-test cycles or extra checks. Run only smallest relevant check when needed.
- Ask developer about clarifications, disputes, or unsolvable problems.
- Preserve existing behavior unless request requires change.

# Task tracking

- Task plan (`docs/ZERO_DAY_Задачи.md`, `docs/ZERO_DAY_План_задач.html`) is not mandatory. No need to find, take, or close a task ID before work.
- Do not edit tracker or status page unless developer asks.
- If developer asks to update statuses: run `git pull --rebase` first, edit only requested IDs point by point, keep both files in sync, never commit conflict markers.

# Push procedure

Every `git push` follows these steps, in order. No exceptions, including small or docs-only pushes.

1. `git status`: commit only intended files. Never commit secrets or unrelated changes.
2. Check status files for conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`).
3. If status files changed: read `git diff --cached` of them. Every changed status line must come from an explicit developer request.
4. Commit with a short Conventional Commit message. No AI attribution.
5. `git pull --rebase`. In status file conflicts keep every status from both sides; never take whole-file "ours" or "theirs". Repeat steps 2-3 after resolving.
6. Rerun the smallest relevant check if code changed during rebase.
7. `git push`. Never use `--force` or `--force-with-lease` on `main` without explicit developer approval.

# Authorship and style

- Never mention AI, assistants, models, or tools as author. No `Co-Authored-By`, no "Generated with", no AI signatures in commits, PRs, code, comments, or docs.
- Write commits and PRs like a team developer: short Conventional Commit message, no AI phrasing.
- Keep comments minimal. Comment only non-obvious "why". No comments restating code.
- No emoji in code, comments, commits, PRs, or docs.
