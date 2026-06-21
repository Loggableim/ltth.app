# LTTH Documentation Index

This index reflects the current local snapshot.

## Start Here

- [README.md](README.md): project overview and commands
- [AGENTS.md](AGENTS.md): required orientation for coding agents
- [docs/SNAPSHOT_STATUS.md](docs/SNAPSHOT_STATUS.md): current workspace facts, gaps, dependency state
- [infos/llm_start_here.md](infos/llm_start_here.md): technical onboarding for future development

## Active Developer Docs

- [infos/ARCHITECTURE.md](infos/ARCHITECTURE.md): current architecture map
- [infos/DEVELOPMENT.md](infos/DEVELOPMENT.md): setup, run, test, and workflow notes
- [infos/PLUGIN_DEVELOPMENT.md](infos/PLUGIN_DEVELOPMENT.md): PluginAPI and plugin lifecycle
- [infos/CONTRIBUTING.md](infos/CONTRIBUTING.md): coding and review rules for this snapshot
- [infos/TESTING.md](infos/TESTING.md): test strategy and commands
- [infos/SECURITY.md](infos/SECURITY.md): security rules

## User Documentation

German user-facing docs live in [app/wiki](app/wiki):

- [Getting Started](app/wiki/Getting-Started.md)
- [Installation & Setup](app/wiki/Installation-&-Setup.md)
- [Konfiguration](app/wiki/Konfiguration.md)
- [Plugin-Liste](app/wiki/Plugin-Liste.md)
- [Overlays & Alerts](app/wiki/Overlays-&-Alerts.md)
- [FAQ & Troubleshooting](app/wiki/FAQ-&-Troubleshooting.md)
- [API Reference](app/wiki/API-Reference.md)

These pages may still include older wording. When a user-facing feature changes, update the matching wiki page in the same task.

## Technical Notes

- [docs/ARCHIVE_POLICY.md](docs/ARCHIVE_POLICY.md): how to treat archived docs
- [docs/BROWSER_CONSOLE_WARNINGS.md](docs/BROWSER_CONSOLE_WARNINGS.md)
- [docs/PER_USER_GAIN_CONTROL_IMPLEMENTATION.md](docs/PER_USER_GAIN_CONTROL_IMPLEMENTATION.md)
- [docs/SOUNDBOARD_ANIMATION_MEMORY_FIX.md](docs/SOUNDBOARD_ANIMATION_MEMORY_FIX.md)
- `app/docs/`: feature-specific implementation guides

## Historical Reference

- `docs_archive/` is retained only for historical context.
- Do not treat archived implementation reports as current instructions.
- Verify archived claims against code before using them.

## Build And Runtime

Runtime source:

- `app/server.js`
- `app/modules/`
- `app/plugins/`
- `app/public/`

Launcher source:

- `build-src/`

Removed from active docs/scripts:

- stale Electron build assumptions
- obsolete launcher workflow paths
- obsolete plugin-specific CI paths
