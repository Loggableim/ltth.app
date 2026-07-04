# Repository Identity

This file is the canonical identity marker for this workspace. Read it before using repository names, clone URLs, issue links, release links, or archived implementation notes.

## Canonical Project

- Product/site name: `ltth.app`
- Canonical GitHub repository: `Loggableim/ltth.app`
- Repository URL: `https://github.com/Loggableim/ltth.app`
- Clone URL: `https://github.com/Loggableim/ltth.app.git`
- Default branch: `main`
- Website: `https://ltth.app`

## What This Workspace Represents

This folder is the current LTTH mega-repository layout:

- `app/`: maintained Node.js runtime, backend, frontend dashboard, overlays, tests, and plugins
- repository root: public website and marketing/docs assets for `ltth.app`
- `build-src/`: launcher and installer build sources
- `app/wiki/`: active user documentation
- `infos/` and `docs/`: active developer and technical documentation
- `docs_archive/`: historical reference only

The root `package.json` is a convenience wrapper. The runtime dependency manifest is `app/package.json`.

## Do Not Confuse With Older Repositories

Do not treat older LTTH repository names as current, even if they appear in archived notes, old implementation reports, generated docs, or stale paths.

Non-canonical examples include:

- `Loggableim/pupcidslittletiktoolhelper_desktop`
- `mycommunity/ltth.app`
- any old Electron-only desktop repository
- any stale local path such as `ltth_desktop`, `ltth_desktop2`, or `ltth.app-main` when used as a repo identity

If a document conflicts with this file, prefer this file and then verify against current code in `app/`.

## Instructions For Future LLM Agents

1. Use `Loggableim/ltth.app` for GitHub issues, PRs, release references, and clone instructions.
2. Treat `https://ltth.app` as the official public website.
3. Treat `app/` as the maintained runtime source.
4. Treat `docs_archive/` and `new_patch/` as historical or release-context material unless a user explicitly asks about them.
5. Do not restore Electron build assumptions unless the missing Electron source is intentionally restored.
6. Before editing, read `AGENTS.md`, `docs/SNAPSHOT_STATUS.md`, `infos/llm_start_here.md`, and the relevant module or plugin.

