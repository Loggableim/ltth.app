'use strict';

const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { buildSpec } = require('./product-screenshot-spec');
const { prepareDocsPluginFixture } = require('./lib/docs-capture-plugin-fixture');

const REPO_ROOT = path.resolve(__dirname, '..');
const APP_ROOT = path.join(REPO_ROOT, 'app');
const SCREENSHOT_ROOT = path.join(REPO_ROOT, 'screenshots');
const MANIFEST_PATH = path.join(SCREENSHOT_ROOT, 'product-capture-manifest.json');
const IDS = Object.freeze([
  'stream-monsters-creator-1.11',
  'stream-monsters-arena-portrait-1.11'
]);
const LOCALES = Object.freeze(['de', 'en', 'es', 'fr']);
const SUPPORTED_LOCALES = new Set(LOCALES);
const VIEWPORTS = Object.freeze({
  'stream-monsters-creator-1.11': Object.freeze({ width: 1920, height: 1080 }),
  'stream-monsters-arena-portrait-1.11': Object.freeze({ width: 1080, height: 1920 })
});

function sha256(filename) {
  return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

function outputPath(id, locale) {
  const base = locale === 'en' ? SCREENSHOT_ROOT : path.join(SCREENSHOT_ROOT, locale);
  return path.join(base, 'features', `${id}.png`);
}

function pngDimensions(filename) {
  const bytes = fs.readFileSync(filename);
  if (bytes.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error(`Capture is not a PNG: ${filename}`);
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  };
}

function validateArenaCaptureReceipt(receipt = {}) {
  const requestedLocale = String(receipt.requestedLocale || '').trim().toLowerCase();
  const renderedLocale = String(receipt.renderedLocale || '').trim().toLowerCase();
  const language = receipt.overlayLanguage && typeof receipt.overlayLanguage === 'object'
    ? receipt.overlayLanguage
    : {};
  const primaryLocale = String(language.primaryLocale || '').trim().toLowerCase();
  const configuredLocales = Array.isArray(language.locales)
    ? language.locales.map(locale => String(locale || '').trim().toLowerCase())
    : [];
  if (
    !SUPPORTED_LOCALES.has(requestedLocale) ||
    primaryLocale !== requestedLocale ||
    configuredLocales.length !== 1 ||
    configuredLocales[0] !== requestedLocale ||
    renderedLocale !== requestedLocale
  ) {
    throw new Error(
      `Arena locale receipt mismatch: requested=${requestedLocale || 'none'}, ` +
      `configured=${JSON.stringify(language)}, rendered=${renderedLocale || 'none'}`
    );
  }
  const readability = receipt.readability && typeof receipt.readability === 'object'
    ? receipt.readability
    : {};
  const hasText = value => typeof value === 'string' && value.trim().length > 0;
  const statBlocks = Array.isArray(readability.statBlocks) ? readability.statBlocks : [];
  const skillCards = Array.isArray(readability.skillCards) ? readability.skillCards : [];
  const skillChoices = skillCards.map(card => String(card?.choice || '').trim());
  const readable = (
    receipt.localePhase === 'stable' &&
    ['choice', 'action'].includes(String(receipt.battlePhase || '')) &&
    readability.roundVisible === true &&
    readability.commandPromptVisible === true &&
    hasText(readability.roundLabel) &&
    hasText(readability.commandPrompt) &&
    Array.isArray(readability.fighterNames) &&
    readability.fighterNames.length === 2 &&
    readability.fighterNames.every(hasText) &&
    statBlocks.length === 2 &&
    statBlocks.every(block => (
      block?.visible === true &&
      hasText(block.hp) &&
      hasText(block.shield) &&
      hasText(block.special)
    )) &&
    skillCards.length === 6 &&
    skillCards.every(card => (
      card?.visible === true &&
      hasText(card.choice) &&
      hasText(card.name) &&
      hasText(card.copy)
    )) &&
    ['A', 'B', 'C'].every(choice => (
      skillChoices.filter(candidate => candidate === choice).length === 2
    ))
  );
  if (!readable) {
    throw new Error(`Arena capture is not in a stable readable phase: ${JSON.stringify({
      localePhase: receipt.localePhase,
      battlePhase: receipt.battlePhase,
      readability
    })}`);
  }
  if (
    receipt.activeEffect !== true ||
    !hasText(receipt.effectScene) ||
    !hasText(receipt.effectSignature) ||
    !hasText(receipt.effectMotifs)
  ) {
    throw new Error('Arena capture has no active deterministic effect receipt');
  }
  const renderer = receipt.renderer && typeof receipt.renderer === 'object'
    ? receipt.renderer
    : {};
  if (
    !hasText(renderer.mode) ||
    !hasText(renderer.backend) ||
    renderer.mode === 'unknown' ||
    renderer.backend === 'unknown'
  ) {
    throw new Error(`Arena capture renderer is unknown: ${JSON.stringify(renderer)}`);
  }
  return receipt;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForHealth(baseUrl, child) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 90_000) {
    if (child.exitCode !== null) {
      throw new Error(`Isolated LTTH process exited with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`, {
        signal: AbortSignal.timeout(1_000)
      });
      if (response.ok) return;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('Timed out waiting for isolated LTTH capture process');
}

function runPlaywright(args, env) {
  const executable = process.platform === 'win32'
    ? path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node_modules', 'npm', 'bin', 'npx-cli.js')
    : 'npx';
  const command = process.platform === 'win32' ? process.execPath : executable;
  const commandArgs = process.platform === 'win32'
    ? [executable, '--yes', '--package', '@playwright/cli', 'playwright-cli', ...args]
    : ['--yes', '--package', '@playwright/cli', 'playwright-cli', ...args];
  const result = spawnSync(
    command,
    commandArgs,
    {
      cwd: REPO_ROOT,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `playwright-cli ${args[0]} failed (${result.status}):\n${result.stdout || ''}${result.stderr || ''}`
    );
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.stdout || '';
}

function captureCode({
  baseUrl,
  locale,
  creatorPath,
  arenaPath,
  captureCreator = true
}) {
  const creatorCapture = captureCreator
    ? `
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(baseUrl + '/streammonsters/ui?lang=' + locale, {
      waitUntil: 'domcontentloaded'
    });
    await page.waitForSelector('#live-center', { state: 'visible' });
    await page.waitForFunction(() => {
      const notice = document.getElementById('notice');
      return notice && !/geladen|loading|cargando|chargement/i.test(notice.textContent || '');
    }, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2200);
    await page.screenshot({ path: ${JSON.stringify(creatorPath)} });
`
    : '';
  return `async page => {
    const baseUrl = ${JSON.stringify(baseUrl)};
    const locale = ${JSON.stringify(locale)};
    ${creatorCapture}

    const configResult = await page.evaluate(async locale => {
      const response = await fetch('/api/streammonsters/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          overlayLanguage: {
            primaryLocale: locale,
            locales: [locale],
            secondsPerLocale: 5
          }
        })
      });
      const body = await response.json().catch(() => null);
      return {
        status: response.status,
        body
      };
    }, locale);
    if (configResult.status !== 200 || !configResult.body?.config?.overlayLanguage) {
      throw new Error(
        'Overlay locale configuration returned HTTP ' + configResult.status +
        ': ' + JSON.stringify(configResult.body)
      );
    }
    const configuredOverlayLanguage = configResult.body.config.overlayLanguage;

    await page.setViewportSize({ width: 1080, height: 1920 });
    await page.goto(
      baseUrl + '/streammonsters/overlay?layout=portrait&lang=' + locale + '&quality=high',
      { waitUntil: 'domcontentloaded' }
    );
    await page.waitForSelector('#battle', { state: 'attached' });
    await page.evaluate(() => {
      const text = id => String(document.getElementById(id)?.textContent || '').trim();
      const visible = element => {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity || 1) > 0.05 &&
          rect.width > 0 &&
          rect.height > 0
        );
      };
      window.__readStreamMonstersArenaCapture = () => {
        const battle = document.getElementById('battle');
        const choiceSurface = document.getElementById('arena-choice-surface');
        const skillCards = Array.from(
          document.querySelectorAll('#arena-choice-surface .arena-skill-card')
        ).map(card => ({
          visible: visible(card) && visible(choiceSurface),
          choice: String(card.querySelector('.skill-choice')?.textContent || '').trim(),
          name: String(card.querySelector('.skill-name')?.textContent || '').trim(),
          copy: String(card.querySelector('.skill-copy')?.textContent || '').trim()
        }));
        const statBlocks = [1, 2].map(slot => ({
          visible: visible(document.getElementById('arena-fighter-' + slot)),
          hp: text('arena-hp-text-' + slot),
          shield: text('arena-shield-label-' + slot),
          special: text('arena-special-label-' + slot)
        }));
        return {
          renderedLocale: String(document.documentElement.lang || '').trim().toLowerCase(),
          battlePhase: String(battle?.dataset.phase || '').trim(),
          roundLabel: text('arena-round'),
          roundVisible: visible(document.getElementById('arena-round')),
          commandPrompt: text('arena-skill-prompt'),
          commandPromptVisible: visible(document.getElementById('arena-skill-prompt')),
          fighterNames: [text('arena-name-1'), text('arena-name-2')],
          statBlocks,
          skillCards,
          spritesReady: [1, 2].every(slot => {
            const image = document.getElementById('arena-image-' + slot);
            return Boolean(image?.complete && image?.naturalWidth > 0 && visible(image));
          })
        };
      };
    });
    let demo = null;
    let battleOpened = false;
    for (let attempt = 0; attempt < 10 && !battleOpened; attempt += 1) {
      demo = await page.evaluate(async () => {
        const response = await fetch('/api/streammonsters/demo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scene: 'match',
            templateId: 'pulse',
            layout: 'portrait',
            anchor: 'center',
            scale: 100
          })
        });
        return { status: response.status, body: await response.text() };
      });
      if (demo.status !== 200) {
        throw new Error('Demo endpoint returned HTTP ' + demo.status + ': ' + demo.body);
      }
      battleOpened = await page.waitForFunction(() => (
        window.__readStreamMonstersArenaCapture?.().battlePhase === 'choice'
      ), null, { timeout: 1250, polling: 100 }).then(() => true).catch(() => false);
    }
    if (!battleOpened) {
      const observed = await page.evaluate(() => (
        window.__readStreamMonstersArenaCapture?.() || null
      ));
      throw new Error(
        'Demo event never reached the overlay after 10 readiness probes: ' +
        JSON.stringify(observed)
      );
    }

    try {
      await page.waitForFunction(locale => {
        const state = window.__readStreamMonstersArenaCapture?.();
        const hasText = value => typeof value === 'string' && value.trim().length > 0;
        const choices = Array.isArray(state?.skillCards)
          ? state.skillCards.map(card => card.choice)
          : [];
        const readable = Boolean(
          state &&
          state.renderedLocale === locale &&
          state.battlePhase === 'choice' &&
          state.roundVisible &&
          state.commandPromptVisible &&
          hasText(state.roundLabel) &&
          hasText(state.commandPrompt) &&
          state.fighterNames?.length === 2 &&
          state.fighterNames.every(hasText) &&
          state.statBlocks?.length === 2 &&
          state.statBlocks.every(block => (
            block.visible &&
            hasText(block.hp) &&
            hasText(block.shield) &&
            hasText(block.special)
          )) &&
          state.skillCards?.length === 6 &&
          state.skillCards.every(card => (
            card.visible &&
            hasText(card.choice) &&
            hasText(card.name) &&
            hasText(card.copy)
          )) &&
          ['A', 'B', 'C'].every(choice => (
            choices.filter(candidate => candidate === choice).length === 2
          )) &&
          state.spritesReady
        );
        if (!readable) {
          delete window.__smArenaStableSignature;
          delete window.__smArenaStableSince;
          return false;
        }
        const signature = JSON.stringify(state);
        if (window.__smArenaStableSignature !== signature) {
          window.__smArenaStableSignature = signature;
          window.__smArenaStableSince = performance.now();
          return false;
        }
        return performance.now() - window.__smArenaStableSince >= 600;
      }, locale, { timeout: 15000, polling: 100 });
    } catch (error) {
      const observed = await page.evaluate(() => (
        window.__readStreamMonstersArenaCapture?.() || null
      ));
      throw new Error(
        'Arena did not reach a stable readable phase: ' +
        JSON.stringify(observed) +
        ' (' + error.message + ')'
      );
    }

    const effectSource = 'deterministic-capture-harness';
    await page.evaluate(async () => {
      const canvas = document.getElementById('battle-effects-canvas');
      if (!canvas || !window.StreamMonstersEffectsRenderer?.createEffectsRenderer) {
        throw new Error('Stream Monsters effects renderer is unavailable');
      }
      const renderer = window.StreamMonstersEffectsRenderer.createEffectsRenderer({
        canvas,
        quality: 'high'
      });
      await renderer.init();
      window.__streamMonstersCaptureRenderer = renderer;
      window.__streamMonstersCapturePlayback = renderer.play('special', {
        element: 'Volt',
        vfxKey: 'pulse:special',
        actorSlot: 1,
        targetSlot: 2,
        origin: { x: 0.28, y: 0.48 },
        targetOrigin: { x: 0.72, y: 0.48 },
        durationMs: 2200,
        quality: 'high',
        scale: 1.15
      });
    });
    await page.waitForFunction(locale => {
      const canvas = document.getElementById('battle-effects-canvas');
      const state = window.__readStreamMonstersArenaCapture?.();
      return (
        canvas?.dataset.effectScene === 'special' &&
        canvas?.dataset.effectPhase === 'element-signature' &&
        state?.renderedLocale === locale &&
        state?.battlePhase === 'choice' &&
        state?.skillCards?.length === 6 &&
        state.skillCards.every(card => card.visible && card.name && card.copy)
      );
    }, locale, { timeout: 8000, polling: 50 });

    const arenaState = await page.evaluate(async () => {
      const battle = document.getElementById('battle');
      const canvas = document.getElementById('battle-effects-canvas');
      const readability = window.__readStreamMonstersArenaCapture?.() || {};
      const stateResponse = await fetch('/api/streammonsters/state');
      const publicState = stateResponse.ok
        ? await stateResponse.json().catch(() => null)
        : null;
      return {
        battleActive: battle?.dataset.active || '',
        battlePhase: battle?.dataset.phase || '',
        renderedLocale: readability.renderedLocale || '',
        localePhase: 'stable',
        readability,
        publicOverlayLanguage: publicState?.config?.overlayLanguage || null,
        effectScene: canvas?.dataset.effectScene || '',
        effectPhase: canvas?.dataset.effectPhase || '',
        effectSignature: canvas?.dataset.effectSignature || '',
        effectMotifs: canvas?.dataset.effectMotifs || '',
        renderer: {
          mode: canvas?.dataset.renderer || 'unknown',
          backend: canvas?.dataset.rendererBackend || 'unknown',
          fallbackReason: canvas?.dataset.fallbackReason || ''
        }
      };
    });
    await page.screenshot({ path: ${JSON.stringify(arenaPath)} });
    return {
      locale,
      creator: {
        lang: locale
      },
      arena: {
        requestedLocale: locale,
        overlayLanguage: configuredOverlayLanguage,
        activeEffect: true,
        effectSource,
        ...arenaState
      }
    };
  }`;
}

function parseRunCodeResult(output) {
  const match = output.match(/### Result\s*\n([\s\S]*?)(?:\n### |\s*$)/);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch (_) {
    return null;
  }
}

function replaceScopedEntries(entries, replacements, {
  keyOf,
  retiredIdMap = {}
}) {
  const available = new Map(replacements.map(entry => [keyOf(entry), entry]));
  const emitted = new Set();
  const merged = [];
  for (const entry of entries || []) {
    const replacementId = retiredIdMap[entry.id] || entry.id;
    const candidate = { ...entry, id: replacementId };
    const replacementKey = keyOf(candidate);
    if (available.has(replacementKey)) {
      if (!emitted.has(replacementKey)) {
        merged.push(available.get(replacementKey));
        emitted.add(replacementKey);
      }
      continue;
    }
    merged.push(entry);
  }
  for (const [replacementKey, replacement] of available) {
    if (!emitted.has(replacementKey)) merged.push(replacement);
  }
  return merged;
}

function updateManifest(captureResults) {
  const current = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const spec = buildSpec(REPO_ROOT);
  const selectedAssets = spec.assets.filter(asset => IDS.includes(asset.id));
  if (selectedAssets.length !== IDS.length) {
    throw new Error(`Screenshot spec is missing 1.11 assets: ${IDS.join(', ')}`);
  }
  const retiredIdMap = {
    'stream-monsters-creator-1.5': 'stream-monsters-creator-1.11',
    'stream-monsters-arena-portrait-1.5': 'stream-monsters-arena-portrait-1.11'
  };
  const outputs = captureResults.flatMap(result => IDS.map(id => {
    const filename = outputPath(id, result.locale);
    const route = selectedAssets.find(asset => asset.id === id).route;
    const renderer = id === 'stream-monsters-arena-portrait-1.11'
      ? result.arena?.renderer || { mode: 'unknown', backend: 'unknown', fallbackReason: '' }
      : null;
    const effect = id === 'stream-monsters-arena-portrait-1.11'
      ? {
          active: result.arena?.activeEffect === true,
          source: result.arena?.effectSource || 'unknown',
          scene: result.arena?.effectScene || '',
          phase: result.arena?.effectPhase || '',
          signature: result.arena?.effectSignature || '',
          motifs: result.arena?.effectMotifs || ''
        }
      : null;
    return {
      locale: result.locale,
      id,
      path: path.relative(REPO_ROOT, filename).replace(/\\/g, '/'),
      route,
      state: {
        lang: id === 'stream-monsters-arena-portrait-1.11'
          ? result.arena.renderedLocale
          : result.locale,
        theme: 'cid',
        ...(renderer ? {
          renderedLocale: result.arena.renderedLocale,
          localePhase: result.arena.localePhase,
          overlayLanguage: result.arena.overlayLanguage,
          battlePhase: result.arena.battlePhase,
          readability: {
            roundVisible: result.arena.readability.roundVisible,
            commandPromptVisible: result.arena.readability.commandPromptVisible,
            fighterCount: result.arena.readability.fighterNames.length,
            statBlockCount: result.arena.readability.statBlocks.length,
            skillCardCount: result.arena.readability.skillCards.length,
            roundLabel: result.arena.readability.roundLabel,
            commandPrompt: result.arena.readability.commandPrompt
          },
          renderer,
          effect
        } : {})
      },
      sha256: sha256(filename),
      bytes: fs.statSync(filename).size
    };
  }));
  const assets = replaceScopedEntries(current.assets, selectedAssets, {
    keyOf: asset => asset.id,
    retiredIdMap
  });
  const mergedOutputs = replaceScopedEntries(current.outputs, outputs, {
    keyOf: output => `${output.locale}:${output.id}`,
    retiredIdMap
  });
  const next = {
    ...current,
    version: spec.version,
    source: 'current-workspace',
    locales: [...LOCALES],
    assets,
    sourceUrl: 'isolated-local-process',
    capturedAt: new Date().toISOString(),
    requestedLocales: [...LOCALES],
    requestedIds: [...IDS],
    outputs: mergedOutputs,
    failures: []
  };
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}

async function main() {
  const arenaOnly = process.argv.includes('--arena-only');
  const port = await freePort();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-sm111-capture-'));
  const capturePluginDir = prepareDocsPluginFixture(REPO_ROOT, profileDir, 'streamalchemy');
  const childEnv = {
    ...process.env,
    LOCALAPPDATA: profileDir,
    LTTH_PORT: String(port),
    LTTH_DOCS_CAPTURE: 'true',
    LTTH_DOCS_SAFE_MODE: 'true',
    LTTH_DISABLE_TIKTOK_AUTO_RECONNECT: 'true',
    LTTH_NO_BROWSER: 'true',
    DISABLE_SWAGGER: 'true',
    LTTH_BIND_ADDRESS: '127.0.0.1',
    LTTH_DOCS_CAPTURE_PLUGIN_DIR: capturePluginDir
  };
  const child = spawn(process.execPath, [path.join(APP_ROOT, 'server.js')], {
    cwd: APP_ROOT,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  let startupLog = '';
  const appendLog = chunk => {
    startupLog = `${startupLog}${chunk.toString()}`.slice(-24_000);
  };
  child.stdout.on('data', appendLog);
  child.stderr.on('data', appendLog);
  const baseUrl = `http://127.0.0.1:${port}`;
  const session = `streammonsters-v111-${process.pid}`;
  const captureResults = [];
  try {
    await waitForHealth(baseUrl, child);
    runPlaywright(
      ['--session', session, 'open', `${baseUrl}/streammonsters/ui?lang=en`, '--browser', 'chrome'],
      childEnv
    );
    for (const locale of LOCALES) {
      const creatorPath = outputPath('stream-monsters-creator-1.11', locale);
      const arenaPath = outputPath('stream-monsters-arena-portrait-1.11', locale);
      const playwrightCodePath = path.join(profileDir, `capture-${locale}.js`);
      fs.mkdirSync(path.dirname(creatorPath), { recursive: true });
      fs.mkdirSync(path.dirname(arenaPath), { recursive: true });
      fs.writeFileSync(
        playwrightCodePath,
        `${captureCode({
          baseUrl,
          locale,
          creatorPath,
          arenaPath,
          captureCreator: !arenaOnly
        })}\n`,
        'utf8'
      );
      const stdout = runPlaywright(
        [
          '--session',
          session,
          'run-code',
          '--filename',
          playwrightCodePath
        ],
        childEnv
      );
      const parsed = parseRunCodeResult(stdout);
      if (!parsed) {
        throw new Error(
          `Could not parse Playwright receipt for locale ${locale}:\n` +
          String(stdout || '').slice(-8_000)
        );
      }
      validateArenaCaptureReceipt(parsed.arena);
      captureResults.push(parsed);
      for (const [id, dimensions] of Object.entries(VIEWPORTS)) {
        const filename = outputPath(id, locale);
        const actual = pngDimensions(filename);
        if (actual.width !== dimensions.width || actual.height !== dimensions.height) {
          throw new Error(
            `${locale}/${id} is ${actual.width}x${actual.height}, expected ${dimensions.width}x${dimensions.height}`
          );
        }
      }
    }
    updateManifest(captureResults);
    for (const result of captureResults) {
      console.log(`${result.locale}: ${JSON.stringify(result.arena?.renderer || {})}`);
    }
    console.log('Captured Stream Monsters 1.11 in an isolated free-port LTTH profile.');
  } catch (error) {
    throw new Error(`${error.message}\nIsolated LTTH startup log:\n${startupLog}`);
  } finally {
    try {
      runPlaywright(['--session', session, 'close'], childEnv);
    } catch (_) {}
    if (child.exitCode === null) child.kill();
    await new Promise(resolve => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', resolve);
      setTimeout(resolve, 5_000).unref();
    });
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  captureCode,
  pngDimensions,
  replaceScopedEntries,
  updateManifest,
  validateArenaCaptureReceipt
};
