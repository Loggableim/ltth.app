# Plugin Store Appstore UI Design

Date: 2026-07-04

## Goal

Turn the current Plugin Store UI from a Plugin Manager-like list into a real appstore experience while preserving all existing management capabilities.

The store should feel like a browsable marketplace for official LTTH plugins first. Installed plugin administration remains available, but it should no longer dominate the first impression.

## Scope

This design covers the dashboard Plugin Store UI in `app/public/dashboard.html` and `app/public/js/plugin-manager.js`.

It does not change the backend store contract except for using existing fields more fully:

- `installed`
- `updateAvailable`
- `official`
- `community`
- `channel`
- `badges`
- `packageUrl`
- `screenshots`
- `sourceName`
- `category`

## Information Architecture

The plugin area becomes a store surface with four top-level modes:

1. `Store`
2. `Installed`
3. `Updates`
4. `Sources`

`Store` is the default visible mode when opening Plugin Store. It is for discovering and installing plugins.

`Installed` keeps the existing manager behavior: enable, disable, reload, delete, upload ZIP, dev-status filters, and compact mode where useful.

`Updates` shows only installed plugins with `updateAvailable === true`.

`Sources` contains official source status and the community opt-in flow. Community source controls move out of the main Store grid.

## Store Layout

The Store mode should use a marketplace-style layout:

- Header strip with title, source label, community status, and update count.
- Large search input with category chips.
- Featured row for important/preinstalled/core plugins.
- Main responsive plugin grid.

The grid should avoid manager controls. Each card focuses on discovery:

- plugin icon/avatar
- plugin name
- one-line description
- badges
- category
- version
- primary action

Primary actions:

- `Install` when `packageUrl` exists and plugin is not installed.
- `Update` when installed and `updateAvailable`.
- `Open` or `Manage` when installed and current.
- `Catalog Only` disabled only if no package exists.

## Visual Direction

The UI should feel like a quiet desktop appstore, not a marketing landing page.

Use restrained dark dashboard styling from the existing app:

- no oversized hero
- no floating nested cards
- cards only for plugin items
- compact, scannable badges
- icons in action buttons
- stable card heights so grids do not jump

Cards should be richer than the manager list but still operational:

- app icon block on the left/top
- name and description
- small metadata row
- action button aligned consistently

## Categories

Store category chips:

- All
- Featured
- Overlays
- Audio & TTS
- Games
- Automation
- Integrations
- Utilities
- Open Beta

Category mapping can initially use existing `category`, `type`, `channel`, and known plugin ids. It does not need a new backend schema for the first pass.

## Detail Drawer

Clicking a plugin card opens a right-side detail drawer.

Drawer content:

- icon, name, badges
- longer description
- version and installed version
- source name
- category
- author
- install/update/manage action
- screenshots area if `screenshots` exists
- compatibility text if `minLtthVersion` exists
- Open Beta note when `channel === 'open-beta'`

The drawer should be dismissible via close button, Escape, and outside click.

The drawer should not replace the existing plugin config UI. For installed plugins, `Manage` can switch to Installed mode and focus the plugin card, or later deep-link into plugin config if that exists.

## Installed Mode

Installed mode keeps the current manager affordances, but visually separates itself from Store:

- header: `Installed Plugins`
- existing search/filter/sort controls
- existing enable/disable/reload/delete controls
- ZIP upload remains here

This preserves power-user operations without making Store look like admin tooling.

## Updates Mode

Updates mode is a focused list/grid:

- empty state: `All plugins are up to date`
- update cards show current version and available version
- official updates are normal
- community updates carry a source warning
- optional `Update all` only applies to official LTTH plugins

If install/update package URLs are unavailable, the update action is disabled with a clear reason.

## Sources Mode

Sources mode owns all registry configuration:

- official source status card
- community disabled state with explanation
- opt-in button
- after opt-in: add source form and configured source list

Community warning copy should be practical:

> Community plugin sources can install code from third-party registries. Only add sources you trust.

Community plugins must always show a `Community` badge in Store and detail drawer.

## Empty, Loading, And Error States

Store loading:

- skeleton plugin cards or compact loading row

Official fallback:

- no warning banner in normal Store grid if bundled official catalog is available

Community source failure:

- visible non-blocking warning in Sources mode
- compact warning banner in Store only when at least one enabled community source fails

No search results:

- `No plugins match this search`
- keep category chips and search visible

No packages:

- card action `Catalog Only`
- detail drawer explains that installation package is not available yet

## Accessibility And Responsiveness

Keyboard:

- tab through mode nav, search, chips, cards, drawer actions
- Escape closes drawer

Responsive:

- desktop: 3-column grid plus drawer
- tablet: 2-column grid
- mobile: 1-column grid, drawer becomes full-screen sheet

Text must not overflow card/action containers. Button labels must stay stable.

## Implementation Boundaries

Prefer a focused frontend refactor inside `plugin-manager.js`:

- keep API calls unchanged
- add `currentStoreMode`
- add `selectedStorePlugin`
- add derived collections: featured, updates, categories
- split render functions by mode

Do not introduce a frontend framework.

Do not remove existing manager functions.

## Verification

Automated:

- `plugin-manager-listing.test.js` should assert the new modes and drawer hooks exist.
- Store route tests stay green.
- Registry package test stays green.
- Full Jest suite should pass with runtime Node.

Rendered:

- Playwright checks dashboard Store mode:
  - Store opens as appstore grid
  - 37 cards visible in fallback/offline mode
  - category chips visible
  - Community controls are not in main Store grid
  - Sources mode shows opt-in state
  - detail drawer opens on card click
  - no false source error banner

Website:

- No required change unless screenshots/copy need updating after final UI.

## Design Decisions

Use generated icon avatars for plugins in the first pass. A later pass can add real plugin icons/screenshots to each registry entry.

Use a right-side drawer on desktop and full-screen sheet on mobile.

Make `Store` the default mode inside Plugin Store.
