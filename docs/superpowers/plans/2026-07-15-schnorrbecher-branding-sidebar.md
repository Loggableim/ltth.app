# Schnorrbecher Branding and Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Give Schnorrbecher generated transparent glass designs and branding, render real gift-catalog icons without coin styling, and expose the active plugin in the Visual FX sidebar.

**Architecture:** The server keeps resolving gift image URLs from the gift catalog. The browser overlay maps config.jarStyle to a plugin-owned transparent jar PNG while CSS renders physical gift sprites and a fallback frame. Dashboard navigation stays static but is gated by data-plugin="schnorrbecher" so activation controls visibility.

**Tech Stack:** CommonJS, Jest, JSDOM, Matter.js, static PNG assets, browser CSS, GitHub Pages plugin-store ZIP.

## Global Constraints

- Keep all plugin assets below app/plugins/schnorrbecher/assets/.
- classic, mason, and arcade are the only supported jar styles; invalid values normalize to classic.
- Falling objects are gift catalog icons, never generated coin sprites.
- All generated PNG assets have alpha transparency with transparent corners and no chroma-key fringe.
- The Visual FX sidebar entry and content view use data-plugin="schnorrbecher".
- Rebuild the released store ZIP and registry checksum after source or asset changes.

---

### Task 1: Add test-first branding configuration and overlay gift rendering

**Files:**
- Modify: app/plugins/schnorrbecher/lib/config.js
- Modify: app/plugins/schnorrbecher/overlay/coincup.js
- Modify: app/plugins/schnorrbecher/overlay/coincup.css
- Modify: app/plugins/schnorrbecher/test/config-and-store.test.js
- Modify: app/plugins/schnorrbecher/test/overlay-controller.test.js
- Modify: app/plugins/schnorrbecher/test/overlay-markup.test.js

**Interfaces:**
- Consumes: CoinJarConfig.jarStyle, payload.giftImage, and existing applyConfig(config).
- Produces: normalized jarStyle, data-jar-style on the overlay glass container, and gift-sprite DOM elements.

- [ ] **Step 1: Write the failing configuration test**

~~~js
expect(normalizeConfig({}).jarStyle).toBe('classic');
expect(normalizeConfig({ jarStyle: 'arcade' }).jarStyle).toBe('arcade');
expect(normalizeConfig({ jarStyle: 'unknown' }).jarStyle).toBe('classic');
~~~

- [ ] **Step 2: Run test to verify it fails**

Run: node node_modules/jest/bin/jest.js --runInBand plugins/schnorrbecher/test/config-and-store.test.js

Expected: FAIL because jarStyle is missing from normalized configuration.

- [ ] **Step 3: Write minimal configuration normalization**

~~~js
const JAR_STYLES = new Set(['classic', 'mason', 'arcade']);

function normalizeJarStyle(value) {
  return JAR_STYLES.has(value) ? value : 'classic';
}

// DEFAULT_CONFIG
jarStyle: 'classic',

// normalizeConfig return value
jarStyle: normalizeJarStyle(input.jarStyle),
~~~

- [ ] **Step 4: Run the configuration test to verify it passes**

Run: node node_modules/jest/bin/jest.js --runInBand plugins/schnorrbecher/test/config-and-store.test.js

Expected: PASS.

- [ ] **Step 5: Write the failing overlay behavior tests**

~~~js
controller.applyConfig({ jarStyle: 'arcade' });
expect(document.querySelector('#coin-jar').dataset.jarStyle).toBe('arcade');

const sprite = controller._createSprite({ giftName: 'Rose', giftImage: 'https://example.test/rose.png' }, 64, 0);
expect(sprite.className).toContain('gift-sprite');
expect(sprite.querySelector('img').src).toBe('https://example.test/rose.png');
expect(sprite.className).not.toContain('coin-sprite');
~~~

- [ ] **Step 6: Run the overlay tests to verify they fail**

Run: node node_modules/jest/bin/jest.js --runInBand plugins/schnorrbecher/test/overlay-controller.test.js plugins/schnorrbecher/test/overlay-markup.test.js

Expected: FAIL because the overlay exposes neither data-jar-style nor gift-sprite.

- [ ] **Step 7: Implement neutral gift sprites and style selection**

~~~js
const JAR_ASSET_BY_STYLE = {
  classic: '/plugins/schnorrbecher/assets/jars/classic.png',
  mason: '/plugins/schnorrbecher/assets/jars/mason.png',
  arcade: '/plugins/schnorrbecher/assets/jars/arcade.png'
};

const jarStyle = JAR_ASSET_BY_STYLE[this.config.jarStyle] ? this.config.jarStyle : 'classic';
jar.dataset.jarStyle = jarStyle;
jar.style.setProperty('--jar-artwork', 'url("' + JAR_ASSET_BY_STYLE[jarStyle] + '")');

element.className = 'gift-sprite gift-tier-' + tier;
// Keep the resolved image and use the neutral gift fallback glyph on load failure.
~~~

Use #coin-jar only as the artwork layer and remove the gold radial gradient, circular coin border, and coin naming from CSS. Preserve existing Matter.js collisions and object-fit: contain for the catalog image.

- [ ] **Step 8: Run all Schnorrbecher unit suites**

Run: node node_modules/jest/bin/jest.js --runInBand plugins/schnorrbecher/test/config-and-store.test.js plugins/schnorrbecher/test/overlay-controller.test.js plugins/schnorrbecher/test/overlay-markup.test.js

Expected: PASS.

### Task 2: Generate, freistellen, and register plugin-owned assets

**Files:**
- Create: app/plugins/schnorrbecher/assets/branding/schnorrbecher-icon.png
- Create: app/plugins/schnorrbecher/assets/branding/schnorrbecher-logo.png
- Create: app/plugins/schnorrbecher/assets/jars/classic.png
- Create: app/plugins/schnorrbecher/assets/jars/mason.png
- Create: app/plugins/schnorrbecher/assets/jars/arcade.png
- Modify: app/plugins/schnorrbecher/plugin.json
- Modify: app/plugins/schnorrbecher/test/plugin-integration.test.js

**Interfaces:**
- Consumes: generated raster assets with a chroma-key background.
- Produces: alpha PNG assets and manifest icon/logo paths served by the plugin static route.

- [ ] **Step 1: Write the failing asset/manifest test**

~~~js
const manifest = JSON.parse(fs.readFileSync(pluginPath('plugin.json'), 'utf8'));
expect(manifest.icon).toBe('/plugins/schnorrbecher/assets/branding/schnorrbecher-icon.png');
expect(manifest.logo).toBe('/plugins/schnorrbecher/assets/branding/schnorrbecher-logo.png');

for (const asset of ['branding/schnorrbecher-icon.png', 'branding/schnorrbecher-logo.png', 'jars/classic.png', 'jars/mason.png', 'jars/arcade.png']) {
  expect(fs.existsSync(pluginPath('assets', asset))).toBe(true);
}
~~~

- [ ] **Step 2: Run the manifest test to verify it fails**

Run: node node_modules/jest/bin/jest.js --runInBand plugins/schnorrbecher/test/plugin-integration.test.js

Expected: FAIL because branding fields and assets do not exist.

- [ ] **Step 3: Generate and alpha-convert artwork**

Generate each production asset with the built-in image tool on a flat #00ff00 background. Copy it under the plugin asset path. Run the installed remove_chroma_key.py helper with auto-key border, soft matte, transparent threshold 12, opaque threshold 220, and despill.

Verify every output with Pillow: RGBA mode, all four corners alpha 0, and a non-empty alpha bounding box. Use a classic glass for the square icon and wide logo mark; make all three jars front-facing, open at the top, and free of coins so catalog gift icons remain the only falling content.

- [ ] **Step 4: Register the assets in the manifest**

~~~json
"icon": "/plugins/schnorrbecher/assets/branding/schnorrbecher-icon.png",
"logo": "/plugins/schnorrbecher/assets/branding/schnorrbecher-logo.png"
~~~

- [ ] **Step 5: Run the manifest test to verify it passes**

Run: node node_modules/jest/bin/jest.js --runInBand plugins/schnorrbecher/test/plugin-integration.test.js

Expected: PASS.

### Task 3: Add the Visual FX dashboard entry and glass-style administration

**Files:**
- Modify: app/plugins/schnorrbecher/ui.html
- Modify: app/plugins/schnorrbecher/test/admin-ui.test.js
- Modify: app/public/dashboard.html
- Modify: app/test/plugin-store-registry.test.js

**Interfaces:**
- Consumes: jarStyle through the existing configuration form and plugin static assets.
- Produces: a selectable jarStyle form control, a gated Visual FX sidebar link, and a matching iframe content view.

- [ ] **Step 1: Write failing UI and sidebar assertions**

~~~js
expect(document.querySelector('[name="jarStyle"]')).not.toBeNull();
expect(dashboardHtml).toContain('data-view="schnorrbecher"');
expect(dashboardHtml).toContain('data-plugin="schnorrbecher"');
expect(dashboardHtml).toContain('data-src="/schnorrbecher/ui"');
~~~

- [ ] **Step 2: Run focused tests to verify they fail**

Run: node node_modules/jest/bin/jest.js --runInBand plugins/schnorrbecher/test/admin-ui.test.js test/plugin-store-registry.test.js

Expected: FAIL because the choice control and dashboard route are absent.

- [ ] **Step 3: Implement controls and navigation**

~~~html
<select id="jar-style" name="jarStyle">
  <option value="classic">Klassischer Becher</option>
  <option value="mason">Mason Jar</option>
  <option value="arcade">Neon Arcade</option>
</select>

<a href="#" class="sidebar-item" data-view="schnorrbecher" data-plugin="schnorrbecher" data-tooltip="Schnorrbecher">
  <img src="/plugins/schnorrbecher/assets/branding/schnorrbecher-icon.png" alt="" class="sidebar-plugin-icon" aria-hidden="true">
  <span class="sidebar-item-text">Schnorrbecher</span>
</a>
~~~

Place the link in the existing Visual FX category. Add div id="view-schnorrbecher" class="content-view" data-plugin="schnorrbecher" with an iframe data-src="/schnorrbecher/ui" near the other plugin views.

- [ ] **Step 4: Run UI and sidebar tests to verify they pass**

Run: node node_modules/jest/bin/jest.js --runInBand plugins/schnorrbecher/test/admin-ui.test.js test/plugin-store-registry.test.js

Expected: PASS.

### Task 4: Rebuild the store package and complete verification

**Files:**
- Modify: plugin-store/packages/schnorrbecher-1.0.0.zip
- Modify: plugin-store.json
- Modify: app/test/plugin-store-registry.test.js

**Interfaces:**
- Consumes: final Schnorrbecher plugin directory.
- Produces: distributable ZIP with all branding assets and a matching SHA-256 registry checksum.

- [ ] **Step 1: Write the failing package-content assertion**

~~~js
expect(zipEntries).toEqual(expect.arrayContaining([
  'assets/branding/schnorrbecher-icon.png',
  'assets/branding/schnorrbecher-logo.png',
  'assets/jars/classic.png',
  'assets/jars/mason.png',
  'assets/jars/arcade.png'
]));
~~~

- [ ] **Step 2: Run the registry/package test to verify it fails**

Run: node node_modules/jest/bin/jest.js --runInBand test/plugin-store-registry.test.js

Expected: FAIL because the existing ZIP predates the assets.

- [ ] **Step 3: Rebuild ZIP and checksum**

Create a ZIP containing plugin runtime sources, UI, overlay, README, and all new assets, excluding tests and plugin data. Compute SHA-256 and replace the schnorrbecher registry checksum in plugin-store.json.

- [ ] **Step 4: Run final targeted verification**

~~~powershell
node node_modules/jest/bin/jest.js --runInBand test/plugin-store-registry.test.js plugins/schnorrbecher/test
npm run lint -- --quiet
git diff --check origin/main...HEAD
~~~

Expected: every focused suite passes, lint exits 0, and git diff --check prints no errors.

- [ ] **Step 5: Commit the reviewed feature scope**

~~~powershell
git add -- app/plugins/schnorrbecher app/public/dashboard.html app/test/plugin-store-registry.test.js plugin-store.json plugin-store/packages/schnorrbecher-1.0.0.zip docs/superpowers
git commit -m "feat(schnorrbecher): add branded glass variants"
~~~
