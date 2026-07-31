# Stream Monsters TikTok Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a German, nine-slide Stream Monsters TikTok image carousel in native 1080 x 1920 portrait, delivered as an editable PowerPoint and exact-size JPG slides.

**Architecture:** Build a single editable deck with `@oai/artifact-tool` in a temporary build folder. It uses the existing Stream Monsters and LTTH brand assets, contains source notes in speaker notes, and exports one JPG per slide after rendering the PowerPoint for visual QA.

**Tech Stack:** Node.js ES modules, `@oai/artifact-tool`, PowerPoint export, ImageMagick, presentation render/test helpers.

## Global Constraints

- Final deliverables must be written only under `C:\Users\logga\Documents\ltth_codex\marketing`.
- Every feed image must be JPG and exactly 1080 x 1920 pixels.
- Visible copy is German and aimed at TikTok viewers; the final slide also addresses streamers.
- Use authentic Stream Monsters monster art and the Stream Monsters/LTTH logos; do not generate substitute monster art.
- Use dark violet/cyan/gold visual language, large readable type, and no text walls or accidental overlap.
- Include source notes in every slide that contains a non-trivial claim or externally sourced asset.
- Preserve the user's unrelated worktree changes and do not publish or deploy anything.

---

### Task 1: Establish the carousel content, sources, and asset manifest

**Files:**
- Create: `C:\Users\logga\Documents\ltth_codex\marketing\streammonsters-carousel-build\source-notes.txt`
- Create: `C:\Users\logga\Documents\ltth_codex\marketing\streammonsters-carousel-build\slide-plan.txt`
- Review: `streammonsters/index.html`
- Review: `app/plugins/streamalchemy/backend/streammonsters/catalog.js`
- Review: existing transparent logo and monster assets under `app/plugins/streamalchemy/assets/`

**Interfaces:**
- Consumes: public guide facts, command syntax, element/monster catalog, confirmed transparent source assets.
- Produces: a nine-slide copy outline and asset map that the build module embeds without network dependencies.

- [ ] **Step 1: Record only verified public-facing claims and command constraints**

Record a source line for each claim used in slides: the public Stream Monsters guide, catalog entries for Ashfang/Neonclaw/Tsuki, and the command guidance that `A/B/C` belongs to active fighters during a battle.

- [ ] **Step 2: Define the nine-slide audience story**

Write the exact short-copy sequence: cover; collect-hatch-fight loop; element overview; egg commands; arena commands; Ashfang; Neonclaw; Tsuki; viewer-and-streamer CTA.

- [ ] **Step 3: Validate asset uniqueness and image suitability**

Use a distinct monster or egg image for each slide wherever practical. Confirm all hero assets are transparent raster images and preserve their native subject framing with `fit: "contain"`.

### Task 2: Build the editable portrait PowerPoint

**Files:**
- Create: `C:\Users\logga\Documents\ltth_codex\marketing\streammonsters-carousel-build\build-streammonsters-carousel.mjs`
- Create: `C:\Users\logga\Documents\ltth_codex\marketing\Stream_Monsters_TikTok_Carousel_1080x1920.pptx`

**Interfaces:**
- Consumes: the Task 1 source-notes and slide-plan files plus byte-backed PNG/WebP assets.
- Produces: an editable 1080 x 1920 PowerPoint with nine slides, source speaker notes, and stable named text/image objects for inspection.

- [ ] **Step 1: Initialize the Artifact Tool workspace**

Run `setup_artifact_tool_workspace.mjs` against the dedicated build folder before executing the module.

- [ ] **Step 2: Write the deck module with safe layout primitives**

Use `Presentation.create({ slideSize: { width: 1080, height: 1920 } })`. Implement shared helpers for full-canvas dark backgrounds, readable title/subtitle text, embedded byte-backed images, source speaker notes, and small page markers. Do not build decorative vector illustrations; let authentic monster art carry the composition.

- [ ] **Step 3: Materialize the nine-slide narrative**

Keep each slide to one audience-facing claim, make the cover minimal, and reserve sufficient quiet space around titles. Use `!eier`, `!hatch`, `!battle`, `!choose <slot>`, and `A / B / C` only in the two command slides. Make the last slide's URL and creator CTA dominant.

- [ ] **Step 4: Export and inspect initial PPTX state**

Export the `.pptx`, run `presentation.inspect({ kind: "slide,textbox,shape,image,notes" })`, and confirm nine slides, required source notes, the final URL, and no unresolved placeholder text.

### Task 3: Render, export JPGs, and perform visual QA

**Files:**
- Create: `C:\Users\logga\Documents\ltth_codex\marketing\Stream_Monsters_TikTok_Carousel_JPG\slide-01.jpg`
- Create: `C:\Users\logga\Documents\ltth_codex\marketing\Stream_Monsters_TikTok_Carousel_JPG\slide-02.jpg`
- Create: `C:\Users\logga\Documents\ltth_codex\marketing\Stream_Monsters_TikTok_Carousel_JPG\slide-03.jpg`
- Create: `C:\Users\logga\Documents\ltth_codex\marketing\Stream_Monsters_TikTok_Carousel_JPG\slide-04.jpg`
- Create: `C:\Users\logga\Documents\ltth_codex\marketing\Stream_Monsters_TikTok_Carousel_JPG\slide-05.jpg`
- Create: `C:\Users\logga\Documents\ltth_codex\marketing\Stream_Monsters_TikTok_Carousel_JPG\slide-06.jpg`
- Create: `C:\Users\logga\Documents\ltth_codex\marketing\Stream_Monsters_TikTok_Carousel_JPG\slide-07.jpg`
- Create: `C:\Users\logga\Documents\ltth_codex\marketing\Stream_Monsters_TikTok_Carousel_JPG\slide-08.jpg`
- Create: `C:\Users\logga\Documents\ltth_codex\marketing\Stream_Monsters_TikTok_Carousel_JPG\slide-09.jpg`
- Create: `C:\Users\logga\Documents\ltth_codex\marketing\Stream_Monsters_TikTok_Carousel_JPG\contact-sheet.jpg`

**Interfaces:**
- Consumes: the final `.pptx` from Task 2.
- Produces: nine TikTok-ready JPG images and visual evidence used for final acceptance.

- [ ] **Step 1: Render every PowerPoint slide to a lossless preview**

Run `render_slides.py` on the final PowerPoint and retain the rendered PNGs inside the temporary build folder only.

- [ ] **Step 2: Convert the rendered slides into final JPEGs**

Run ImageMagick with high JPEG quality and explicit `1080x1920!` output geometry. Use deterministic names `slide-01.jpg` through `slide-09.jpg`.

- [ ] **Step 3: Run structural and geometry checks**

Run `slides_test.py` against the PowerPoint. Use ImageMagick `identify` to verify every final image reports `1080 1920` and ensure exactly nine slide JPGs exist.

- [ ] **Step 4: Inspect full-size slides and the deck contact sheet**

Inspect all nine rendered slide images individually, then inspect a montage for story rhythm and consistency. Correct any wrapping, crop, contrast, or unintended overlap in the build module and repeat the export if necessary.

### Task 4: Package and hand off the carousel

**Files:**
- Deliver: `C:\Users\logga\Documents\ltth_codex\marketing\Stream_Monsters_TikTok_Carousel_1080x1920.pptx`
- Deliver: `C:\Users\logga\Documents\ltth_codex\marketing\Stream_Monsters_TikTok_Carousel_JPG\`

**Interfaces:**
- Consumes: verified editable PPTX and validated JPG exports.
- Produces: a concise handoff with an output citation, output locations, and no deployment action.

- [ ] **Step 1: Confirm deliverable completeness**

Verify that the PPTX and all nine JPG slides exist at their promised absolute paths, and that the contact sheet is present only as optional local review material.

- [ ] **Step 2: Hand off the results**

Provide the PPTX citation and the JPG-folder link. State that the carousel is German, native 1080 x 1920, and includes the viewer plus streamer CTA.

## Self-Review

- **Spec coverage:** Tasks 1–3 cover the requested intro, monster overview, commands, featured monsters, logos, high-portrait TikTok format, and source-backed CTA. Task 4 covers the requested delivery path.
- **Placeholder scan:** No TBD/TODO markers or unspecified content remain.
- **Type consistency:** The build module produces the PPTX Task 3 renders; Task 3 produces the JPGs Task 4 hands off.
