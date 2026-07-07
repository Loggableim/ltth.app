# CoinBattle Dashboard Rework Design

Date: 2026-07-07

## Goal

Rework the CoinBattle admin UI into a modern, wide-screen, three-column dashboard inspired by the provided mockup while preserving every existing feature, data flow, and control path.

The result should feel cleaner, denser, and easier to scan on large monitors without changing the underlying behavior of matches, leaderboards, settings, overlays, simulation, or persistence.

## Scope

This design covers the CoinBattle plugin presentation layer and its branding assets:

- `app/plugins/coinbattle/ui.html`
- `app/plugins/coinbattle/ui.js`
- `app/plugins/coinbattle/ui/ui-improvements.css`
- `app/plugins/coinbattle/plugin.json`
- `app/public/dashboard.html`
- `plugin-store.json`
- `app/plugins/coinbattle/assets/coinbattle-icon.png`
- `app/plugins/coinbattle/assets/coinbattle-logo-wide.png`

The source artwork comes from the user-provided `coinbattleicon.png` and `coinbattlelogo.png` files. The checkerboard background must be removed so the final icon and logo render as clean transparent PNG assets.

## Non-Goals

- No backend API changes.
- No database schema changes.
- No feature removal or simplification.
- No mobile-first redesign.
- No Electron shell work.
- No rewrite of CoinBattle business logic.

## Information Architecture

The current tab model stays in place because `ui.js` already drives the page through existing tab and element IDs.

Top-level sections remain:

1. `Control`
2. `Settings`
3. `Leaderboard`
4. `History`

The structural change is inside those sections:

- `Control` becomes the main dashboard surface with a strong three-column layout.
- `Settings` becomes a grouped setup dashboard instead of a long vertical form.
- `Leaderboard` becomes a scannable management and ranking area with clearer hierarchy.
- `History` becomes a compact activity timeline with stronger list styling.

The design should preserve all existing controls and IDs so `ui.js` continues to work without behavioral changes.

## Layout System

The page should use a dashboard shell built for wide screens first:

- A compact top header with branding on the left, page summary in the middle, and language selector on the right.
- A three-column content grid on wide monitors.
- A controlled collapse to two columns on medium screens.
- A single-column stack only when the viewport becomes too narrow to keep the dashboard readable.

Recommended column roles:

- Left column: match operations, quick actions, and key control states.
- Center column: the main live arena, current match focus, stats, and the most important active content.
- Right column: leaderboard context, overlay preview, summary panels, and management shortcuts.

This layout should avoid mobile-specific behavior beyond graceful stacking. The primary target is a desktop or OBS-style admin monitor.

## Visual Direction

The visual language should move closer to the mockup:

- Dark, polished surfaces with a confident game-dashboard feel.
- Gold and emerald accents for brand energy.
- Clear separators, stronger section headers, and more disciplined spacing.
- Cards should look intentional and structural, not decorative.
- The center area should feel like a stage, not a generic form page.

Theme handling must remain robust across:

- `day`
- `night`
- `cid`
- `contrast`
- `vision-impaired`

Theme behavior rules:

- `day`: lighter surfaces, crisp borders, readable dark text, restrained gold accents.
- `night`: deep charcoal and green-black surfaces with luminous but controlled highlights.
- `cid`: black and forest-green surfaces with explicit borders and high legibility.
- `contrast` and `vision-impaired`: flat fills, thick borders, no low-opacity text, no washed-out glows, no critical labels conveyed only by color.

The design must not depend on transparency alone for hierarchy. In the high-contrast themes, key surfaces should remain fully opaque.

## Brand System

CoinBattle needs its own identity inside LTTH:

- `coinbattle-icon.png` is the square sidebar/app icon.
- `coinbattle-logo-wide.png` is the in-app and app-store logo.

Usage rules:

- The sidebar should show the square icon instead of the generic Lucide `coins` glyph.
- The dashboard header should show the wide logo, not a checkerboarded source image.
- The plugin store registry should expose both `icon` and `logo` for CoinBattle.
- The plugin manifest should also expose both fields so local fallback and packaged installs stay consistent.

The branding assets must be visually centered and trimmed to content bounds. The final files should not preserve the checkerboard background from the source artwork.

## Component Plan

The rework should be assembled from a small set of reusable dashboard pieces:

- `BrandStrip`: logo, subtitle, and language selector.
- `MetricTiles`: match status, time remaining, total coins, participants.
- `CommandRail`: start, end, pause, extend, multiplier, and simulation controls.
- `LiveStage`: current match hero panel and active multiplier display.
- `LeaderboardPanel`: current match leaderboard, season leaderboard, weekly leaderboard, and lifetime leaderboard.
- `SettingsGroup`: grouped cards for gameplay, team, likes points, pyramid mode, display settings, post-match display, and overlay config.
- `HistoryTimeline`: match history list with export affordances.

Each component should improve scanability without changing the underlying control IDs or event listeners.

## File Responsibilities

- `app/plugins/coinbattle/ui.html`: define the new dashboard shell, maintain the existing control IDs, and load the redesign stylesheet.
- `app/plugins/coinbattle/ui/ui-improvements.css`: hold the CoinBattle-specific layout system, visual tokens, and theme overrides.
- `app/plugins/coinbattle/ui.js`: keep the business logic intact; only adapt DOM-targeted rendering if needed to support the new layout wrappers.
- `app/plugins/coinbattle/plugin.json`: declare the plugin `icon` and `logo` for LTTH UI surfaces and the plugin store.
- `app/public/dashboard.html`: swap the CoinBattle sidebar entry to the square icon asset and show the branded view header.
- `plugin-store.json`: add the CoinBattle `icon` and `logo` fields so the store shows the correct branding.

If the packaged store ZIP is rebuilt later, it should include the same manifest fields and the same cleaned assets.

## Constraints

The following must remain true after the rework:

- Match start, end, pause, resume, extend, and multiplier actions still work.
- Offline simulation still works.
- Overlay URL generation still works.
- Leaderboard loading and season management still work.
- Player deletion and history export still work.
- Likes-as-points and pyramid mode remain fully accessible.
- The current socket events and REST endpoints stay unchanged.
- The UI must not rename or remove existing IDs used by `ui.js`.

## Acceptance Criteria

The redesign is complete when all of the following are true:

- The control area reads as a three-column dashboard on wide screens instead of a long stacked form.
- The layout stays readable and usable on smaller monitors without horizontal scrolling.
- The CoinBattle sidebar entry shows a proper transparent icon asset.
- The dashboard header and plugin store show the wide logo asset without the checkerboard background.
- `day`, `night`, `cid`, `contrast`, and `vision-impaired` all remain readable and consistent.
- No feature, control, overlay option, or admin action has been removed.
- The existing CoinBattle JavaScript logic still operates against the same element IDs and network endpoints.
- The design visually feels closer to the provided mockup: clearer hierarchy, less clutter, more purposeful brand presence.

