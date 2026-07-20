# Schnorrbecher Jar Containment and Gift Sizes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Remove the visible virtual tube above the Schnorrbecher, make every gift value band use a configurable fixed icon size, and allow up to 3,000 physical gift icons.

**Architecture:** The persisted plugin configuration owns ten numeric gift-size fields and the 3,000-object ceiling. The browser overlay uses matching safe defaults to resolve a gift value to its fixed pixel size and keeps non-overflow gifts inside the visible glass contour with a corrective position clamp rather than walls above the artwork. The admin form exposes the saved values; focused Jest tests protect all public behavior.

**Tech Stack:** CommonJS, Matter.js, Express plugin API, Socket.IO, JSDOM, Jest, Archiver.

## Global Constraints

- Keep the plugin in \`app/plugins/schnorrbecher/\` and use 2-space CommonJS JavaScript.
- Physical collision segments end at the visible opening; never create a guard segment above it.
- Each size band is 16–240 px and then multiplied by the existing global \`iconScale\` (0.25–3), with the final size also clamped to 16–240 px.
- \`maxPhysicalIcons\` is 20–3,000 everywhere and defaults to 300.
- Never change the real Coin Jar total when compacting visual gift representations.
- Rebuild the official store ZIP and update its SHA-256 when package content changes.

---

### Task 1: Persist gift size bands and expose numeric controls

**Files:**

- Modify: \`app/plugins/schnorrbecher/lib/config.js:1-118\`
- Modify: \`app/plugins/schnorrbecher/ui.js:4-7\`
- Modify: \`app/plugins/schnorrbecher/ui.html:56-69\`
- Modify: \`app/plugins/schnorrbecher/test/config-and-store.test.js:17-36\`
- Modify: \`app/plugins/schnorrbecher/test/admin-ui.test.js:45-53\`
- Modify: \`app/plugins/schnorrbecher/test/plugin-integration.test.js:129-136\`

**Interfaces:**

- Consumes: the existing flat configuration payload sent by \`SchnorrbecherAdmin.collectConfig()\`.
- Produces: \`DEFAULT_GIFT_SIZES\`, ten normalized \`giftSize*\` config properties, and an API configuration payload that permits \`maxPhysicalIcons: 3000\`.

- [ ] **Step 1: Write the failing configuration and UI tests**

Add the ten size keys to the unsafe-input test and assert that 99,999 is capped at 3,000 while each size is capped at 240:

\`\`\`js
expect(normalizeConfig({
  maxPhysicalIcons: 99999,
  giftSize1: 0,
  giftSize1000To1999: 99999
})).toMatchObject({
  maxPhysicalIcons: 3000,
  giftSize1: 16,
  giftSize1000To1999: 240
});
\`\`\`

Add static UI assertions for \`giftSize1\`, \`giftSize5000Plus\`, \`1 Coin (px)\`, \`5000+ Coins (px)\`, and the exact \`max="3000"\` object cap. Extend the admin test DOM with the configuration form and a numeric size input; assert that \`collectConfig().giftSize1\` is a number. Change the configuration-endpoint expectation from 600 to 3,000.

- [ ] **Step 2: Run test to verify it fails**

Run:

\`\`\`powershell
Set-Location app
npx jest --runInBand plugins/schnorrbecher/test/config-and-store.test.js plugins/schnorrbecher/test/admin-ui.test.js plugins/schnorrbecher/test/plugin-integration.test.js
\`\`\`

Expected: failures report the current 600 maximum and missing \`giftSize*\` form/config fields.

- [ ] **Step 3: Write minimal implementation**

Declare the exact defaults before \`DEFAULT_CONFIG\` in \`lib/config.js\`:

\`\`\`js
const DEFAULT_GIFT_SIZES = Object.freeze({
  giftSize1: 32,
  giftSize2To10: 40,
  giftSize11To29: 50,
  giftSize30To99: 62,
  giftSize100To199: 76,
  giftSize200To499: 92,
  giftSize500To999: 110,
  giftSize1000To1999: 132,
  giftSize2000To4999: 158,
  giftSize5000Plus: 180
});
\`\`\`

Spread these defaults into \`DEFAULT_CONFIG\`. In \`normalizeConfig\`, use this exact normalization and spread its values into the returned config:

\`\`\`js
const giftSizes = Object.fromEntries(Object.entries(DEFAULT_GIFT_SIZES)
  .map(([key, fallback]) => [key, Math.round(clamp(input[key], fallback, 16, 240))]));
\`\`\`

Change the backend \`maxPhysicalIcons\` upper bound to 3,000 and export \`DEFAULT_GIFT_SIZES\`. Append every \`giftSize*\` key to \`NUMBER_FIELDS\` in \`ui.js\`.

In \`ui.html\`, change the maximum physical icon input from 600 to 3,000 and add ten \`type="number"\`, \`min="16"\`, \`max="240"\`, \`step="1"\` inputs immediately after global Icon-Skalierung. Use these exact labels and defaults: \`1 Coin (px)\` 32, \`2–10 Coins (px)\` 40, \`11–29 Coins (px)\` 50, \`30–99 Coins (px)\` 62, \`100–199 Coins (px)\` 76, \`200–499 Coins (px)\` 92, \`500–999 Coins (px)\` 110, \`1000–1999 Coins (px)\` 132, \`2000–4999 Coins (px)\` 158, \`5000+ Coins (px)\` 180.

- [ ] **Step 4: Run test to verify it passes**

Run the command from Step 2.

Expected: all selected suites pass; the endpoint returns 3,000 for oversized input and the UI serializes all size fields as numbers.

- [ ] **Step 5: Commit**

\`\`\`powershell
git add -- app/plugins/schnorrbecher/lib/config.js app/plugins/schnorrbecher/ui.js app/plugins/schnorrbecher/ui.html app/plugins/schnorrbecher/test/config-and-store.test.js app/plugins/schnorrbecher/test/admin-ui.test.js app/plugins/schnorrbecher/test/plugin-integration.test.js
git commit -m "feat: configure schnorrbecher gift size bands"
\`\`\`

### Task 2: Replace virtual guards with visible-contour containment and fixed sizes

**Files:**

- Modify: \`app/plugins/schnorrbecher/overlay/coincup.js:4-620\`
- Modify: \`app/plugins/schnorrbecher/test/overlay-controller.test.js:1-160\`

**Interfaces:**

- Consumes: normalized \`giftSize*\`, \`iconScale\`, \`maxPhysicalIcons\`, Matter body position and \`overflow\`.
- Produces: \`calculateGiftSize(value, config)\`, \`calculateJarInteriorBounds(physicsBounds, y)\`, \`calculateJarContainmentPosition(position, radius, physicsBounds)\`, and an overlay without guard walls above the rim.

- [ ] **Step 1: Write the failing overlay controller tests**

Replace the guard-wall test with:

\`\`\`js
expect(calculateJarWallSegments(calculateJarPhysicsBounds(renderBounds, 'arcade'))).toEqual({
  leftWall: {
    start: { x: 826, y: 406 },
    end: { x: 806, y: 757 }
  },
  rightWall: {
    start: { x: 1094, y: 406 },
    end: { x: 1114, y: 757 }
  }
});
\`\`\`

Add a \`config\` containing the ten defaults and test value thresholds:

\`\`\`js
expect(calculateGiftSize(1, config)).toBe(32);
expect(calculateGiftSize(10, config)).toBe(40);
expect(calculateGiftSize(29, config)).toBe(50);
expect(calculateGiftSize(999, config)).toBe(110);
expect(calculateGiftSize(1000, config)).toBe(132);
expect(calculateGiftSize(5000, config)).toBe(180);
expect(calculateGiftSize(1000, { ...config, iconScale: 0.5 })).toBe(66);
\`\`\`

Add an arcade-contour test showing a center left of the visible side at y 600 is projected inside by its radius, while a body above \`opening.y\` is not treated as escaped. Add an \`applyConfig({ maxPhysicalIcons: 99999 })\` unit test expecting 3,000.

- [ ] **Step 2: Run test to verify it fails**

Run:

\`\`\`powershell
Set-Location app
npx jest --runInBand plugins/schnorrbecher/test/overlay-controller.test.js
\`\`\`

Expected: the old guard objects, logarithmic size helper, and 600 overlay cap cause failures.

- [ ] **Step 3: Write minimal implementation**

Replace \`calculateJarWallSegments\` with:

\`\`\`js
function calculateJarWallSegments(physicsBounds) {
  return {
    leftWall: physicsBounds.leftWall,
    rightWall: physicsBounds.rightWall
  };
}
\`\`\`

Define the same \`DEFAULT_GIFT_SIZES\` object as Task 1 in the browser-only overlay. Add \`calculateGiftSize(value, config)\`: select \`giftSize1\`, \`giftSize2To10\`, \`giftSize11To29\`, \`giftSize30To99\`, \`giftSize100To199\`, \`giftSize200To499\`, \`giftSize500To999\`, \`giftSize1000To1999\`, \`giftSize2000To4999\`, or \`giftSize5000Plus\` by ascending value; clamp the base and rounded scaled result to 16–240.

Add \`calculateJarInteriorBounds(physicsBounds, y)\` to linearly interpolate both wall x positions from opening to floor. Add \`calculateJarContainmentPosition(position, radius, physicsBounds)\` to clamp y from \`opening.y + radius\` to \`floor.y - radius\`, then clamp x to the interpolated sides plus/minus the radius.

In \`_rebuildWalls\`, construct only two sloped walls, the glass floor, and the three scene spill bounds. In \`applyConfig\`, normalize the ten fields to 16–240 and use 3,000 as the maximum. In \`_createCoin\`, use \`calculateGiftSize(payload.totalValue, this.config)\`; do not apply the compact tier multiplier to normal gift sizes.

In \`_updateBodies\`, after speed limiting and before off-screen cleanup, examine only non-overflow bodies at or below the opening. If the body center is outside the interpolated sides or below the floor, call:

\`\`\`js
Body.setPosition(body, calculateJarContainmentPosition(body.position, body.circleRadius, this.physicsBounds));
Body.setVelocity(body, {
  x: body.velocity.x * 0.2,
  y: Math.max(0, Math.min(1.5, body.velocity.y))
});
\`\`\`

Do not reposition bodies above the opening or \`body.plugin.overflow === true\`. Export all three helpers with the existing overlay helpers.

- [ ] **Step 4: Run test to verify it passes**

Run the command from Step 2.

Expected: no segment exists above the visible opening, fixed sizes follow every threshold, escaped normal gifts are projected inward, and the browser cap is 3,000.

- [ ] **Step 5: Commit**

\`\`\`powershell
git add -- app/plugins/schnorrbecher/overlay/coincup.js app/plugins/schnorrbecher/test/overlay-controller.test.js
git commit -m "fix: align schnorrbecher walls and gift sizes"
\`\`\`

### Task 3: Update user guidance, package the plugin, and validate the store artifact

**Files:**

- Modify: \`app/plugins/schnorrbecher/README.md:5-37\`
- Modify: \`plugin-store.json:1013-1033\`
- Modify: \`plugin-store/packages/schnorrbecher-1.0.0.zip\`
- Modify: \`app/plugins/schnorrbecher/test/plugin-integration.test.js\`
- Modify: \`app/test/plugin-store-registry.test.js\`

**Interfaces:**

- Consumes: final plugin sources and the existing official package URL.
- Produces: documentation for the 3,000 icon ceiling/fixed size bands and a ZIP whose SHA-256 equals the registry entry.

- [ ] **Step 1: Write the failing documentation and checksum assertions**

Extend a focused package assertion to require \`maxCoins=<20-3000>\` and \`5000+\` in the plugin README. Extend the plugin-store registry test to calculate the SHA-256 for \`plugin-store/packages/schnorrbecher-1.0.0.zip\` and compare it with the \`schnorrbecher\` registry entry.

- [ ] **Step 2: Run test to verify it fails**

Run:

\`\`\`powershell
Set-Location app
npx jest --runInBand plugins/schnorrbecher/test/plugin-integration.test.js test/plugin-store-registry.test.js
\`\`\`

Expected: README text and, after source changes, ZIP checksum checks fail until the package is rebuilt and registered.

- [ ] **Step 3: Write minimal documentation and rebuild the ZIP**

Change the OBS parameter documentation to \`maxCoins=<20-3000>\`. State that ten fixed, configurable pixel sizes cover \`1 Coin\` through \`5000+ Coins\`, while global \`iconScale\` scales all bands together.

Rebuild the archive with the plugin directory at its root:

\`\`\`powershell
Push-Location app
node -e "const fs=require('fs');const archiver=require('archiver');const output=fs.createWriteStream('../plugin-store/packages/schnorrbecher-1.0.0.zip');const archive=archiver('zip',{zlib:{level:9}});archive.on('error',error=>{throw error});output.on('close',()=>console.log(archive.pointer()));archive.pipe(output);archive.directory('plugins/schnorrbecher/',false);archive.finalize();"
Pop-Location
\`\`\`

Read the new hash with:

\`\`\`powershell
(Get-FileHash plugin-store/packages/schnorrbecher-1.0.0.zip -Algorithm SHA256).Hash.ToLowerInvariant()
\`\`\`

Use \`apply_patch\` to replace only the \`schnorrbecher\` registry entry's \`sha256\` value with that computed value.

- [ ] **Step 4: Run test to verify it passes**

Run:

\`\`\`powershell
Set-Location app
npx jest --runInBand plugins/schnorrbecher/test test/plugin-store-registry.test.js
npm run lint -- --quiet
Set-Location ..
tar -tf plugin-store/packages/schnorrbecher-1.0.0.zip | Select-String 'overlay/coincup.js|lib/config.js|ui.html|README.md'
\`\`\`

Expected: focused tests and lint pass, the ZIP contains the modified files at archive root, and the registry SHA matches the package.

- [ ] **Step 5: Commit**

\`\`\`powershell
git add -- app/plugins/schnorrbecher/README.md plugin-store.json plugin-store/packages/schnorrbecher-1.0.0.zip app/plugins/schnorrbecher/test/plugin-integration.test.js app/test/plugin-store-registry.test.js
git commit -m "chore: package schnorrbecher size controls"
\`\`\`

### Task 4: Confirm the real local overlay surface

**Files:**

- Modify: none
- Test: running local Schnorrbecher plugin and \`http://localhost:3000/overlay/coincup?transparent=1\`

**Interfaces:**

- Consumes: the reloaded plugin, the test-gift route, and the browser-source Socket.IO connection.
- Produces: runtime evidence that gifts use catalog artwork, vary in size, and do not form an invisible tube above the glass.

- [ ] **Step 1: Reload only Schnorrbecher and reset state**

\`\`\`powershell
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/plugins/schnorrbecher/reload'
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/coin-jar/reset' -ContentType 'application/json' -Body '{"reason":"verification"}'
\`\`\`

- [ ] **Step 2: Set distinct bands and emit gifts**

\`\`\`powershell
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/coin-jar/config' -ContentType 'application/json' -Body '{"giftSize1":32,"giftSize1000To1999":132,"maxPhysicalIcons":3000}'
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/coin-jar/test-gift' -ContentType 'application/json' -Body '{"value":1,"giftName":"One Coin"}'
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/coin-jar/test-gift' -ContentType 'application/json' -Body '{"value":1000,"giftName":"One Thousand Coins"}'
\`\`\`

- [ ] **Step 3: Inspect the browser source**

Open the OBS URL at 16:9, wait for spawns to settle, and inspect the rendered DOM/screenshot. Confirm catalog artwork has no tile frame, the 1,000-value icon is visibly larger than the 1-value icon, no collision behavior exists above the visible opening, and a 25-gift burst leaves the top visually open.

- [ ] **Step 4: Preserve runtime state**

Run \`git status --short\`. Do not stage or commit runtime files produced by verification.
