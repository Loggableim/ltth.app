# Screenshot Documentation â€“ ltth.app

This directory contains screenshots and screenshot infrastructure for the ltth.app feature pages.

---

## Directory Structure

```
screenshots/
â”œâ”€â”€ README_SCREENSHOTS.md          # This file
â”œâ”€â”€ mocks/                         # Standalone HTML mock UIs (self-contained, no dependencies)
â”‚   â”œâ”€â”€ tts.html
â”‚   â”œâ”€â”€ soundboard.html
â”‚   â”œâ”€â”€ alerts.html
â”‚   â”œâ”€â”€ goals.html
â”‚   â”œâ”€â”€ flow-engine.html
â”‚   â”œâ”€â”€ dashboard.html
â”‚   â”œâ”€â”€ overlays.html
â”‚   â”œâ”€â”€ multicam.html
â”‚   â”œâ”€â”€ osc-bridge.html
â”‚   â”œâ”€â”€ animazingpal.html
â”‚   â”œâ”€â”€ vdoninja.html
â”‚   â”œâ”€â”€ viewer-xp.html
â”‚   â”œâ”€â”€ security.html
â”‚   â”œâ”€â”€ plugin-system.html
â”‚   â”œâ”€â”€ slot-machine.html
â”‚   â”œâ”€â”€ game-engine.html
â”‚   â”œâ”€â”€ emoji-rain.html
â”‚   â”œâ”€â”€ auto-updater.html
â”‚   â”œâ”€â”€ chat-commands.html
â”‚   â””â”€â”€ 
â”œâ”€â”€ features/                      # Captured feature screenshots (generated via Puppeteer)
â”‚   â”œâ”€â”€ .gitkeep                   # Keeps the directory tracked by git
â”‚   â”œâ”€â”€ tts.png                    # âœ… Generated from mock
â”‚   â”œâ”€â”€ soundboard.png             # âœ… Generated from mock
â”‚   â””â”€â”€ ...                        # current audit captures â€” see status table below
â”œâ”€â”€ 01_homepage_hero.png           # Website-level screenshots
â””â”€â”€ ...
```

---

## How to Generate Screenshots

### 1b) Automatic CI capture

There is an automated GitHub Action at `.github/workflows/website-screenshots.yml` that can:

- run on schedule (`cron`) every day at 04:00 UTC
- run manually (`workflow_dispatch`)
- capture both EN and DE screenshots in one run
- upload captured files as workflow artifacts

Manual workflow trigger fields:

```bash
languages: en,de
auto_commit: false
```

Set `auto_commit: true` to let the workflow push updated screenshot PNGs back to
the repository in the same branch that triggered the run.

### 1. Install Dependencies

```bash
npm install puppeteer
```

### 2. Run the Capture Script

```bash
node scripts/capture-screenshots.js
```

This will:
- Open each mock HTML file from `screenshots/mocks/`
- Render it at **1280Ã—800** viewport
- Save the result to `screenshots/features/<name>.png`

To capture the live website pages that are intended for CI scheduling:

```bash
node scripts/capture-live-screenshots.js
```

Useful environment overrides:

```bash
SCREENSHOT_LANGS=en,de
SCREENSHOT_BASE_URL=https://ltth.app
SCREENSHOT_VIEWPORT_WIDTH=1280
SCREENSHOT_VIEWPORT_HEIGHT=800
```

### 3. Verify Output

After capture, all feature screenshots in `FEATURE_PAGES` (the current capture set) are
in `screenshots/features/` (EN) and `screenshots/de/features/` (DE).
The feature pages in `features/*.html` reference these via `<img src="/screenshots/features/<name>.png">`.

---

## Feature Pages & Screenshot Status

| Feature Page | Screenshot Source | Status |
|---|---|---|
| `features/tts.html` | `/screenshots/features/tts.png` | ✅ Real screenshot |
| `features/soundboard.html` | `/screenshots/features/soundboard.png` | ✅ Real screenshot |
| `features/goals.html` | `/screenshots/features/goals-overlay.png` | ✅ Real screenshot |
| `features/flow-engine.html` | `/screenshots/features/flows-editor.png` | ✅ Real screenshot |
| `features/dashboard.html` | `/screenshots/features/dashboard.png` | ✅ Real screenshot |
| `features/overlays.html` | `/screenshots/features/webgpu-emoji-rain-dashboard.png` | ✅ Real screenshot |
| `features/plugin-system.html` | `/screenshots/features/plugins.png` | ✅ Real screenshot |
| `features/api-bridge.html` | `/screenshots/features/api-bridge-admin.png` | ✅ Real screenshot |
| `features/plugin-advanced-timer.html` | `/screenshots/features/advanced-timer.png` | ✅ Real screenshot |
| `features/plugin-clarity-hud.html` | `/screenshots/features/clarityhud.png` | ✅ Real screenshot |
| `features/plugin-config-import.html` | `/screenshots/features/config-import.png` | ✅ Real screenshot |
| `features/plugin-chatango.html` | `/screenshots/features/plugin-chatango-dashboard.png` | ✅ Real screenshot |
| `features/plugin-gift-milestone.html` | `/screenshots/features/gift-milestone.png` | ✅ Real screenshot |
| `features/plugin-lastevent-spotlight.html` | `/screenshots/features/lastevent.png` | ✅ Real screenshot |
| `features/plugin-gcce.html` | `/screenshots/features/gcce.png` | ✅ Real screenshot |
| `features/plugin-gcce-hud.html` | `/screenshots/features/gcce-hud.png` | ✅ Real screenshot |
| `features/plugin-music-bot.html` | `/screenshots/features/music-bot.png` | ✅ Real screenshot |
| `features/plugin-quiz-show.html` | `/screenshots/features/quiz-show.png` | ✅ Real screenshot |
| `features/plugin-thermal-printer.html` | `/screenshots/features/thermal-printer.png` | ✅ Real screenshot |
| `features/plugin-vulkan-rockets.html` | `/screenshots/features/fireworks.png` | ✅ Real screenshot |
| `features/plugin-leaderboard.html` | `/screenshots/features/viewer-profiles-night.png`, `/screenshots/features/viewer-profiles-contrast.png`, `/screenshots/features/viewer-profiles-vision-impaired.png` | ✅ Accessibility audit screenshots |
| `features/stt-ticker.html` | `/screenshots/features/stt-ticker-night.png`, `/screenshots/features/stt-ticker-vision-impaired.png`, `/screenshots/features/stt-ticker-overlay-url.png`, `/screenshots/features/stt-ticker-capture-obs-url.png` | ✅ Accessibility and OBS parameter screenshots |
| `features/flame-overlay.html` | `/screenshots/features/flame-overlay-night.png`, `/screenshots/features/flame-overlay-vision-impaired.png` | ✅ Accessibility audit screenshots |
| `features/talking-heads.html` | `/screenshots/features/talking-heads.png` | ✅ Real screenshot |
| `features/toptier.html` | `/screenshots/features/toptier.png` | ✅ Real screenshot |
| `features/viewer-xp.html` | `/screenshots/features/viewer-xp.png` | ✅ Real screenshot |
| `features/alerts.html` | `/screenshots/features/alerts.png` | ✅ Generated from mock |
| `features/animazingpal.html` | `/screenshots/features/animazingpal.png` | ✅ Generated from mock |
| `features/auto-updater.html` | `/screenshots/features/auto-updater.png` | ✅ Generated from mock |
| `features/chat-commands.html` | `/screenshots/features/chat-commands.png` | ✅ Generated from mock |
| `features/emoji-rain.html` | `/screenshots/features/emoji-rain.png` | ✅ Generated from mock |
| `features/game-engine.html` | `/screenshots/features/game-engine.png` | ✅ Real screenshot |
| `features/multicam.html` | `/screenshots/features/multicam.png` | ✅ Generated from mock |
| `features/osc-bridge.html` | `/screenshots/features/osc-bridge.png` | ✅ Generated from mock |
| `features/security.html` | `/screenshots/features/security.png` | ✅ Generated from mock |
| `features/slot-machine.html` | `/screenshots/features/slot-machine.png` | ✅ Generated from mock |
| `features/` | `/screenshots/features/tikfinity-api.png` | ✅ Generated from mock |
| `features/vdoninja.html` | `/screenshots/features/vdoninja.png` | ✅ Real screenshot |
| `features/sidekick.html` | `/screenshots/features/sidekick-dashboard.png` | ✅ Real screenshot |

---

The older website and plugin-store screenshot references were also normalized to `/screenshots/features/` so the same image set now powers the feature pages, `index.html`, `plugins.html`, `changelog.html`, and `plugin-store.json`.

## Replacing Mock Screenshots with Real Ones

Once the app is running and you have captured real screenshots:

1. Take a 1280Ã—800 (or larger) screenshot of the actual feature UI
2. Save it as `screenshots/features/<name>.png` (overwriting the mock)
3. Commit the new screenshot

The feature pages use `onerror="this.style.display='none'"` so missing images
are hidden gracefully â€“ no broken image elements.

---

## Mock Design Notes

Each mock in `screenshots/mocks/` is:
- **Completely self-contained** â€“ no external CSS/JS dependencies
- **Dark themed** â€“ matches ltth.app's design (`#0e0f10` bg, `#12a116` primary green)
- **Fixed 1280Ã—800** â€“ matches the viewport used by the capture script
- **Realistic UI** â€“ shows plausible feature data to give visitors a genuine feel

---

## Legacy Website Screenshots

The root-level `screenshots/*.png` files (e.g. `01_homepage_hero.png`) are
website-level screenshots of the marketing pages. They are separate from the
feature-page screenshots documented above.

## Current Product Capture Set (2026-07-11)

The public product screenshot set is generated from the current app workspace in
the Cid theme, with an isolated demo profile and no TikTok account connection.
The versioned specification covers 76 public asset IDs in four locales (304
PNG outputs):

- English keeps the canonical paths under `screenshots/features/`.
- German, Spanish, and French use `screenshots/<locale>/features/`.
- `screenshots/product-capture-manifest.json` records the capture version,
  route, locale, theme, output path, and failures.
- `screenshots/contact-sheets/{de,en,es,fr}.png` provides the visual review
  sheets for the complete locale sets.

Refresh locally with `runtime/node/node.exe scripts/capture-product-screenshots.js`.
Use `SCREENSHOT_LANGS`, `SCREENSHOT_IDS`, and `SCREENSHOT_START_APP=false` for
targeted captures or an already-running app. Verify the complete set with
`runtime/node/node.exe scripts/verify-public-screenshot-coverage.js`.



