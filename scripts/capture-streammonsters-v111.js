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

function captureCode({ baseUrl, locale, creatorPath, arenaPath }) {
  return `async page => {
    const baseUrl = ${JSON.stringify(baseUrl)};
    const locale = ${JSON.stringify(locale)};
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

    await page.setViewportSize({ width: 1080, height: 1920 });
    await page.goto(
      baseUrl + '/streammonsters/overlay?layout=portrait&lang=' + locale + '&quality=high',
      { waitUntil: 'domcontentloaded' }
    );
    await page.waitForSelector('#battle', { state: 'attached' });
    await page.waitForTimeout(1800);
    const demo = await page.evaluate(async () => {
      const response = await fetch('/api/streammonsters/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scene: 'special',
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
    let activeEffect = await page.waitForFunction(() => {
      const canvas = document.getElementById('battle-effects-canvas');
      return canvas?.dataset.effectScene === 'special' &&
        Boolean(canvas?.dataset.effectPhase);
    }, null, { timeout: 2500 }).then(() => true).catch(() => false);
    let effectSource = 'demo-event';
    if (!activeEffect) {
      effectSource = 'deterministic-capture-harness';
      await page.evaluate(async () => {
        const canvas = document.getElementById('battle-effects-canvas');
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
      activeEffect = await page.waitForFunction(() => {
        const canvas = document.getElementById('battle-effects-canvas');
        return canvas?.dataset.effectScene === 'special' &&
          Boolean(canvas?.dataset.effectPhase);
      }, null, { timeout: 5000 }).then(() => true).catch(() => false);
    }
    if (activeEffect) await page.waitForTimeout(320);
    const arenaState = await page.evaluate(() => {
      const battle = document.getElementById('battle');
      const canvas = document.getElementById('battle-effects-canvas');
      return {
        battleActive: battle?.dataset.active || '',
        battlePhase: battle?.dataset.phase || '',
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
        lang: locale,
        activeEffect,
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
        lang: result.locale,
        theme: 'cid',
        ...(renderer ? { renderer, effect } : {})
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
        `${captureCode({ baseUrl, locale, creatorPath, arenaPath })}\n`,
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
      captureResults.push(
        parseRunCodeResult(stdout) || {
          locale,
          arena: {
            renderer: {
              mode: 'unknown',
              backend: 'unknown',
              fallbackReason: 'playwright-cli-result-unparsed'
            }
          }
        }
      );
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
  updateManifest
};
