# Documentation Archive Policy

`docs_archive/` contains historical implementation reports, migration notes, bug-fix summaries, experiments, and older planning documents. These files are retained for context, but they are not active project instructions.

## Active Documentation

Use these first:

- `README.md`
- `AGENTS.md`
- `DOCUMENTATION_INDEX.md`
- `docs/SNAPSHOT_STATUS.md`
- `infos/llm_start_here.md`
- `infos/ARCHITECTURE.md`
- `infos/DEVELOPMENT.md`
- `infos/PLUGIN_DEVELOPMENT.md`
- `app/wiki/` for user-facing German documentation

## Archive Rules

- Do not cite `docs_archive/` as current behavior without verifying the code.
- Do not update archive files for ordinary feature work.
- If an archived document contains still-useful information, promote the relevant part into an active doc and leave the archive unchanged.
- If a future cleanup deletes the archive, first confirm that no active docs link to the deleted files.

## Known Archive Drift

Archive files may mention:

- Previous plugin counts.
- Old migration paths.
- Removed or renamed plugin directories.
- GitHub workflows that no longer match this snapshot.
- Electron/NW.js/Tauri migration experiments.
