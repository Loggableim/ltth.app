# Screenshot Documentation – ltth.app

This directory contains screenshots and screenshot infrastructure for the ltth.app feature pages.

---

## Directory Structure

```
screenshots/
├── README_SCREENSHOTS.md          # This file
├── mocks/                         # Standalone HTML mock UIs (self-contained, no dependencies)
│   ├── tts.html
│   ├── soundboard.html
│   ├── alerts.html
│   ├── goals.html
│   ├── flow-engine.html
│   ├── dashboard.html
│   ├── overlays.html
│   ├── multicam.html
│   ├── osc-bridge.html
│   ├── animazingpal.html
│   ├── vdoninja.html
│   ├── viewer-xp.html
│   ├── security.html
│   ├── plugin-system.html
│   ├── slot-machine.html
│   ├── game-engine.html
│   ├── emoji-rain.html
│   ├── auto-updater.html
│   ├── chat-commands.html
│   └── tikfinity-api.html
├── features/                      # Captured feature screenshots (generated via Puppeteer)
│   ├── .gitkeep                   # Keeps the directory tracked by git
│   ├── tts.png                    # ✅ Generated from mock
│   ├── soundboard.png             # ✅ Generated from mock
│   └── ...                        # 20 total — see status table below
├── 01_homepage_hero.png           # Website-level screenshots
└── ...
```

---

## How to Generate Screenshots

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
- Render it at **1280×800** viewport
- Save the result to `screenshots/features/<name>.png`

### 3. Verify Output

After capture, all 20 feature screenshots will be in `screenshots/features/`.
The feature pages in `features/*.html` reference these via `<img src="/screenshots/features/<name>.png">`.

---

## Feature Pages & Screenshot Status

| Feature Page | Screenshot Source | Status |
|---|---|---|
| `features/tts.html` | `/assets/screenshots/tts-admin.png` | ✅ Real screenshot |
| `features/soundboard.html` | `/assets/screenshots/soundboard.png` | ✅ Generated from mock |
| `features/goals.html` | `/assets/screenshots/goals-overlay.png` | ✅ Real screenshot |
| `features/flow-engine.html` | `/assets/screenshots/flows-editor.png` | ✅ Real screenshot |
| `features/dashboard.html` | `/assets/screenshots/dashboard-main.png` | ✅ Real screenshot |
| `features/overlays.html` | `/assets/screenshots/overlay-preview.png` | ✅ Generated from mock |
| `features/plugin-system.html` | `/assets/screenshots/plugins.png` | ✅ Generated from mock |
| `features/alerts.html` | `/screenshots/features/alerts.png` | ✅ Generated from mock |
| `features/animazingpal.html` | `/screenshots/features/animazingpal.png` | ✅ Generated from mock |
| `features/auto-updater.html` | `/screenshots/features/auto-updater.png` | ✅ Generated from mock |
| `features/chat-commands.html` | `/screenshots/features/chat-commands.png` | ✅ Generated from mock |
| `features/emoji-rain.html` | `/screenshots/features/emoji-rain.png` | ✅ Generated from mock |
| `features/game-engine.html` | `/screenshots/features/game-engine.png` | ✅ Generated from mock |
| `features/multicam.html` | `/screenshots/features/multicam.png` | ✅ Generated from mock |
| `features/osc-bridge.html` | `/screenshots/features/osc-bridge.png` | ✅ Generated from mock |
| `features/security.html` | `/screenshots/features/security.png` | ✅ Generated from mock |
| `features/slot-machine.html` | `/screenshots/features/slot-machine.png` | ✅ Generated from mock |
| `features/tikfinity-api.html` | `/screenshots/features/tikfinity-api.png` | ✅ Generated from mock |
| `features/vdoninja.html` | `/screenshots/features/vdoninja.png` | ✅ Generated from mock |
| `features/viewer-xp.html` | `/screenshots/features/viewer-xp.png` | ✅ Generated from mock |

---

## Replacing Mock Screenshots with Real Ones

Once the app is running and you have captured real screenshots:

1. Take a 1280×800 (or larger) screenshot of the actual feature UI
2. Save it as `screenshots/features/<name>.png` (overwriting the mock)
3. Commit the new screenshot

The feature pages use `onerror="this.style.display='none'"` so missing images
are hidden gracefully – no broken image elements.

---

## Mock Design Notes

Each mock in `screenshots/mocks/` is:
- **Completely self-contained** – no external CSS/JS dependencies
- **Dark themed** – matches ltth.app's design (`#0e0f10` bg, `#12a116` primary green)
- **Fixed 1280×800** – matches the viewport used by the capture script
- **Realistic UI** – shows plausible feature data to give visitors a genuine feel

---

## Legacy Website Screenshots

The root-level `screenshots/*.png` files (e.g. `01_homepage_hero.png`) are
website-level screenshots of the marketing pages. They are separate from the
feature-page screenshots documented above.
