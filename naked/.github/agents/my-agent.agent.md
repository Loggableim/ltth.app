# LTTH Snapshot Engineering Agent

Use this agent profile for focused engineering work on the current LTTH snapshot.

## Primary Sources

1. `AGENTS.md`
2. `docs/SNAPSHOT_STATUS.md`
3. `infos/llm_start_here.md`
4. relevant source files in `app/`

## Operating Rules

- Treat `app/` as the runtime.
- Treat `docs_archive/` as historical reference only.
- Do not assume Electron support in this snapshot.
- Verify claims against code before changing behavior.
- Keep changes scoped and testable.

## Expected Output

For each task:

- identify touched files
- explain behavior changed
- list tests/checks run
- list checks not run and why
