# Screenshots Directory

This directory contains screenshots for documentation and testing purposes.

## Instructions for LLMs/AI Agents

When taking screenshots during development, testing, or documentation:

1. **ALWAYS save screenshots in this directory**: `/screenshots/`
2. **Use descriptive filenames** that clearly indicate what is shown
3. **Update this README** with a new entry for each screenshot
4. **Include context** about what the screenshot demonstrates

## Screenshot Index

### Logo Changes (2024-12-06)

**logo-nightmode-expanded.png**
- Shows: Sidebar in expanded state with new LTTH logo in night mode
- Context: New logo implementation with 96% width and subtle rounded corners (4px border-radius)
- Theme: Night mode
- State: Sidebar expanded

**logo-nightmode-collapsed.png**
- Shows: Sidebar in collapsed state with new mini LTTH logo in night mode
- Context: Mini logo variant for collapsed sidebar
- Theme: Night mode  
- State: Sidebar collapsed
- URL: https://github.com/user-attachments/assets/c40bfc62-c991-4d32-86d4-8124b02e160c

**logo-daymode-expanded.png**
- Shows: Sidebar in expanded state with new LTTH logo in day mode
- Context: Light theme logo variant
- Theme: Day mode
- State: Sidebar expanded
- URL: https://github.com/user-attachments/assets/2a2cf779-e913-407c-b9ea-12745fa9efe7

**logo-highcontrast-expanded.png**
- Shows: Sidebar in expanded state with new LTTH logo in high contrast mode
- Context: High contrast theme logo variant for vision-impaired users
- Theme: High contrast mode
- State: Sidebar expanded
- URL: https://github.com/user-attachments/assets/2a88d6a0-e05f-444c-b4ce-bad2c7ed10ff

---

## Accessibility Audit Captures

These screenshots document the theme variants that were checked during the UI audit.

**viewer-profiles-night.png**
- Shows: Viewer Profiles dashboard in Night Mode
- Context: Baseline dark-theme rendering for leaderboard and analytics views
- Theme: Night

**viewer-profiles-contrast.png**
- Shows: Viewer Profiles dashboard in High Contrast Mode
- Context: Accessibility comparison with stronger separation and brighter contrast
- Theme: High Contrast

**viewer-profiles-vision-impaired.png**
- Shows: Viewer Profiles dashboard in Vision-Impaired Mode
- Context: Distinct accessibility variant with larger spacing and stronger type
- Theme: Vision-Impaired

**stt-ticker-night.png**
- Shows: STT Ticker settings in Night Mode
- Context: Baseline dark-theme view for the subtitle overlay admin screen
- Theme: Night

**stt-ticker-vision-impaired.png**
- Shows: STT Ticker settings in Vision-Impaired Mode
- Context: Accessibility variant with more generous spacing and clearer controls
- Theme: Vision-Impaired

**stt-ticker-overlay-url.png**
- Shows: STT Ticker Overlay tab with dual-language design, top-right position, maxLines=2, and 42px font size encoded in the OBS URL
- Context: Documents the verified OBS parameter wiring from the Admin UI into the Browser Source URL
- Theme: Night
- State: Overlay URL builder configured for OBS

**stt-ticker-capture-obs-url.png**
- Shows: STT Ticker Capture page with the OBS URL helper and Multi-Language preview
- Context: Documents the standalone capture route used while streaming
- Theme: Night
- State: Capture idle, ready to start

**stt-ticker-overlay-render.png**
- Shows: Idle OBS overlay render with the configured top-right dual-language panel
- Context: Documents the direct `/overlay/stt-ticker` render target before transcript data arrives
- Theme: Night
- State: OBS render idle

**flame-overlay-night.png**
- Shows: Flame Overlay settings in Night Mode
- Context: Baseline rendering for the visual effects overlay admin screen
- Theme: Night

**flame-overlay-vision-impaired.png**
- Shows: Flame Overlay settings in Vision-Impaired Mode
- Context: Accessibility variant with more readable controls and spacing
- Theme: Vision-Impaired

**viewer-xp.png**
- Shows: Viewer XP feature page preview
- Context: Main screenshot used for the viewer level and progress overview page
- Theme: Dark theme

## Browser Screenshot Imports

The following files were promoted from the local browser capture set into the canonical `screenshots/features/` folder:

- `advanced-timer.png`
- `clarityhud.png`
- `config-import.png`
- `dashboard.png`
- `flows-editor.png`
- `fireworks.png`
- `gift-milestone.png`
- `gcce-hud.png`
- `gcce.png`
- `goals-overlay.png`
- `game-engine.png`
- `lastevent.png`
- `interactive-story.png`
- `multicam.png`
- `music-bot.png`
- `openshock.png`
- `osc-bridge.png`
- `plugin-chatango-dashboard.png`
- `quiz-show.png`
- `settings.png`
- `soundboard.png`
- `talking-heads.png`
- `sidekick-dashboard.png`
- `api-bridge-admin.png`
- `plugins.png`
- `stt-capture.png`
- `stt-ticker-night.png`
- `stream-alchemy.png`
- `thermal-printer.png`
- `toptier.png`
- `tts.png`
- `viewer-profiles-night.png`
- `viewer-xp-leaderboard.png`
- `viewer-xp.png`
- `vdoninja.png`
- `weather-control.png`
- `webgpu-emoji-rain-dashboard.png`

The legacy site-level screenshot set from `assets/screenshots/` was mirrored into `screenshots/features/` as well, so the marketing pages, plugin overview pages, changelog, and plugin store can all reference the same canonical screenshot folder.

## Format for New Entries

When adding screenshots, use this format:

```markdown
**filename.png**
- Shows: Brief description of what is visible
- Context: Why this screenshot was taken / what it demonstrates
- Theme: (if applicable) Day/Night/High Contrast mode
- State: (if applicable) Any specific UI state
```
