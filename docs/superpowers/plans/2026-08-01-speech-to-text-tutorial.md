# LTTH Speech-to-Text Tutorial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a polished German and English TikTok carousel for the current LTTH STT Ticker plugin using real app screenshots and verified plugin facts.

**Architecture:** Copy selected read-only app screenshots into the marketing tutorial's `source/app-screenshots/` folder. A standalone CommonJS SVG renderer composes those screenshots inside the LTTH vertical visual system; a Puppeteer exporter creates matching 1080×1920 PNGs.

**Tech Stack:** Node.js, SVG, Chromium/Puppeteer, ImageMagick, PowerShell QA.

## Global Constraints

- Keep all tutorial deliverables under `C:\Users\logga\Documents\ltth_codex\marketing\ltth-speech-to-text-tutorial`.
- Produce 10 German and 10 English slides, each as SVG and PNG at 1080×1920.
- Use actual app screenshots from the current checkout as evidence, not fabricated replacements.
- Keep Fish.audio as the practical/default path and present Deepgram as an explicit alternative; do not expose API keys or secrets.
- Explain only verified current routes and UI options: `/stt-ticker`, `/overlay/stt-ticker`, capture flow, provider/language settings, translation, designs/themes, and OBS Browser Source setup.
- Keep screenshots readable through cropping, framing, and one focal screen per slide; never use an error, blank, or obsolete screenshot.

---

### Task 1: Stage the app screenshots

**Files:**
- Create: `marketing/ltth-speech-to-text-tutorial/source/app-screenshots/`
- Copy: selected files from `screenshots/de/features/` and `screenshots/de/docs/plugins/stt-ticker/`

**Interfaces:**
- The renderer consumes portable files under `source/app-screenshots/`.
- The README records the original source paths for traceability.

- [ ] Copy the feature overview, OBS URL/capture, configuration, style, night, and vision-impaired captures into the tutorial source folder.
- [ ] Verify each staged image has non-zero dimensions and no visible error or empty placeholder state.
- [ ] Keep the source names stable so the SVG renderer can reference them with relative paths.

### Task 2: Build the DE/EN slide renderer

**Files:**
- Create: `marketing/ltth-speech-to-text-tutorial/source/render-speech-to-text.js`

**Interfaces:**
- Produces `de/*.svg`, `en/*.svg`, and `source/storyboard.json`.
- Uses locale copy, shared LTTH layout helpers, and screenshot paths relative to each slide.

- [ ] Build 10 scenes: hook, purpose/accessibility, audio-to-overlay flow, provider choice, activation/capture, language/translation, styles/themes, OBS source, accessibility/night modes, CTA.
- [ ] Keep screenshots as framed app evidence and surround them with concise beginner-oriented copy.
- [ ] Preserve German/English parity while shortening English lines where needed for the same visual hierarchy.
- [ ] Include source metadata in `storyboard.json` for every screenshot-backed slide.

### Task 3: Export and document

**Files:**
- Create: `marketing/ltth-speech-to-text-tutorial/source/render-pngs.js`
- Create: `marketing/ltth-speech-to-text-tutorial/README.md`
- Create: `marketing/ltth-speech-to-text-tutorial/source/contact-sheet-de.png`
- Create: `marketing/ltth-speech-to-text-tutorial/source/contact-sheet-en.png`

- [ ] Render every SVG in Chromium at 1080×1920.
- [ ] Document rebuild commands, source screenshots, routes, provider wording, and output folders.
- [ ] Build one 5×2 contact sheet per language in slide order.

### Task 4: Verify the package

**Files:**
- Read-only verification of the tutorial folder and staged source screenshots.

- [ ] Confirm 10 DE SVGs, 10 EN SVGs, 10 DE PNGs, and 10 EN PNGs.
- [ ] Confirm every PNG is exactly 1080×1920.
- [ ] Parse `storyboard.json` and confirm language counts plus screenshot provenance entries.
- [ ] Run `node --check` on both renderer scripts.
- [ ] Scan generated files for `undefined`, `NaN`, `file://`, `TODO`, `TBD`, API-key-like strings, and visible error text.
- [ ] Inspect both contact sheets and representative full-size slides for screenshot legibility, clipping, overlap, and language parity.
