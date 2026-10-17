'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const { chromium } = require('../../app/node_modules/playwright');

const ROOT = path.resolve(__dirname, '../..');
const HOST_SCRIPT = path.join(__dirname, 'host-viewerxp-fixture.js');
const OUTPUT = path.join(ROOT, 'output/playwright/viewerxp');
const RENDERERS = [
  { page: 'xp-bar', event: 'profile' },
  { page: 'leaderboard', event: 'leaderboard' },
  { page: 'level-up', event: 'level-up' }
];
const SOURCE_PATHS = [
  'app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/xp-bar.html',
  'app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/leaderboard.html',
  'app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/level-up.html',
  'app/public/js/i18n-client.js',
  'app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/viewer-xp-i18n.js',
  'app/node_modules/socket.io/client-dist/socket.io.js',
  'app/plugins/milestone-leaderboard/locales/de.json',
  'app/plugins/milestone-leaderboard/locales/fr.json',
  'scripts/obs-pilot/host-viewerxp-fixture.js',
  'scripts/obs-pilot/run-viewerxp-browser-proof.js'
];

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function collectSourcePins() {
  return Object.fromEntries(SOURCE_PATHS.map(sourcePath => {
    const bytes = fs.readFileSync(path.join(ROOT, sourcePath));
    return [sourcePath, { bytes: bytes.length, sha256: sha256(bytes) }];
  }));
}

function createLineReader(stream) {
  const input = readline.createInterface({ input: stream });
  const pending = [];
  const waiting = [];
  input.on('line', line => {
    const waiter = waiting.shift();
    if (waiter) waiter.resolve(line);
    else pending.push(line);
  });
  input.on('close', () => {
    for (const waiter of waiting.splice(0)) waiter.reject(new Error('Fixture process closed its output'));
  });
  return () => pending.length
    ? Promise.resolve(pending.shift())
    : new Promise((resolve, reject) => waiting.push({ resolve, reject }));
}

async function main() {
  fs.mkdirSync(OUTPUT, { recursive: true });
  const sourcePinsBefore = collectSourcePins();
  const fixtureProcess = spawn(process.execPath, [HOST_SCRIPT], {
    cwd: ROOT,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  const fixtureExit = new Promise(resolve => fixtureProcess.once('exit', (code, signal) => resolve({ code, signal })));
  const nextLine = createLineReader(fixtureProcess.stdout);
  let stderr = '';
  fixtureProcess.stderr.setEncoding('utf8');
  fixtureProcess.stderr.on('data', chunk => { stderr += chunk; });
  let browser;
  const result = {
    scope: 'source-bound loopback browser fixture; no LTTH server, user data, database, OBS, or external network',
    host: null,
    browser: null,
    captures: [],
    browserErrors: [],
    requestFailures: []
  };

  async function fixtureCommand(command) {
    fixtureProcess.stdin.write(`${JSON.stringify(command)}\n`);
    const response = JSON.parse(await nextLine());
    if (response.status !== 'ok') throw new Error(`Fixture rejected ${command.command}: ${response.error}`);
    return response;
  }

  try {
    result.host = JSON.parse(await nextLine());
    assert.equal(result.host.status, 'listening');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'de-DE' });
    result.browser = {
      engine: 'Chromium',
      version: browser.version(),
      viewport: { width: 1280, height: 800 },
      playwrightVersion: require('../../app/node_modules/playwright/package.json').version
    };

    for (const renderer of RENDERERS) {
      const page = await context.newPage();
      page.on('pageerror', error => result.browserErrors.push(`${renderer.page}: ${error.message}`));
      page.on('console', message => {
        if (message.type() === 'error') result.browserErrors.push(`${renderer.page}: ${message.text()}`);
      });
      page.on('requestfailed', request => result.requestFailures.push(`${renderer.page}: ${request.url()} (${request.failure()?.errorText || 'failed'})`));
      const extra = renderer.page === 'xp-bar' ? '&autoHide=false'
        : renderer.page === 'leaderboard' ? '&refresh=60000'
          : '&sound=false&duration=60000';
      const url = `${result.host.origin}/overlay/viewer-xp/${renderer.page}?lang=de${extra}`;
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.documentElement.lang === 'de' && window.socket?.connected === true, null, { timeout: 10000 });
      await fixtureCommand({ command: renderer.event });

      if (renderer.page === 'xp-bar') {
        await page.locator('#xpContainer.visible').waitFor({ state: 'visible', timeout: 5000 });
      } else if (renderer.page === 'leaderboard') {
        await page.locator('.leaderboard-item').waitFor({ state: 'visible', timeout: 5000 });
      } else {
        await page.locator('#levelUpContainer.show').waitFor({ state: 'visible', timeout: 5000 });
      }

      const beforeUrl = page.url();
      const before = await page.evaluate(pageName => {
        if (pageName === 'xp-bar') return {
          name: document.querySelector('#username')?.textContent,
          label: document.querySelector('#levelBadge')?.textContent,
          xp: document.querySelector('#xpText')?.textContent.trim(),
          visible: document.querySelector('#xpContainer')?.classList.contains('visible')
        };
        if (pageName === 'leaderboard') return {
          name: document.querySelector('.viewer-name')?.textContent.trim(),
          label: document.querySelector('.level-badge')?.textContent,
          xp: document.querySelector('.xp-amount')?.textContent,
          heading: document.querySelector('h1')?.textContent,
          visible: Boolean(document.querySelector('.leaderboard-item'))
        };
        return {
          name: document.querySelector('#username')?.textContent,
          label: document.querySelector('.level-up-title')?.textContent,
          oldLevel: document.querySelector('#oldLevel')?.textContent,
          newLevel: document.querySelector('#newLevel')?.textContent,
          visible: document.querySelector('#levelUpContainer')?.classList.contains('show')
        };
      }, renderer.page);
      assert.equal(before.visible, true, `${renderer.page} did not visibly render its synthetic event`);
      assert.equal(before.name, 'Fixture Viewer');
      if (renderer.page !== 'level-up') assert.equal(before.label, 'Stufe 7');
      if (renderer.page === 'xp-bar') assert.equal(before.xp, '11 / 40 XP');
      if (renderer.page === 'leaderboard') assert.equal(before.xp, '321 XP');
      if (renderer.page === 'level-up') {
        assert.equal(before.oldLevel, '7');
        assert.equal(before.newLevel, '8');
      }

      const dePath = path.join(OUTPUT, `${renderer.page}-de.png`);
      await page.screenshot({ path: dePath, fullPage: true, animations: 'disabled' });
      await fixtureCommand({ command: 'locale', locale: 'fr' });
      await page.waitForFunction(pageName => {
        if (document.documentElement.lang !== 'fr') return false;
        if (pageName === 'xp-bar') return document.querySelector('#levelBadge')?.textContent === 'Niveau 7';
        if (pageName === 'leaderboard') return document.querySelector('.level-badge')?.textContent === 'Niveau 7';
        return document.querySelector('.level-up-title')?.textContent.includes('NIVEAU SUPÉRIEUR');
      }, renderer.page, { timeout: 10000 });
      const afterUrl = page.url();
      const after = await page.evaluate(pageName => {
        if (pageName === 'xp-bar') return {
          name: document.querySelector('#username')?.textContent,
          label: document.querySelector('#levelBadge')?.textContent,
          xp: document.querySelector('#xpText')?.textContent.trim(),
          visible: document.querySelector('#xpContainer')?.classList.contains('visible')
        };
        if (pageName === 'leaderboard') return {
          name: document.querySelector('.viewer-name')?.textContent.trim(),
          label: document.querySelector('.level-badge')?.textContent,
          xp: document.querySelector('.xp-amount')?.textContent,
          heading: document.querySelector('h1')?.textContent,
          visible: Boolean(document.querySelector('.leaderboard-item'))
        };
        return {
          name: document.querySelector('#username')?.textContent,
          label: document.querySelector('.level-up-title')?.textContent,
          oldLevel: document.querySelector('#oldLevel')?.textContent,
          newLevel: document.querySelector('#newLevel')?.textContent,
          visible: document.querySelector('#levelUpContainer')?.classList.contains('show')
        };
      }, renderer.page);
      assert.equal(afterUrl, beforeUrl, `${renderer.page} URL changed during locale update`);
      assert.equal(after.visible, true);
      assert.equal(after.name, before.name);
      if (renderer.page !== 'level-up') assert.equal(after.label, 'Niveau 7');
      if (renderer.page === 'xp-bar') assert.equal(after.xp, before.xp);
      if (renderer.page === 'leaderboard') {
        assert.equal(after.xp, before.xp);
        assert.match(after.heading, /Meilleurs téléspectateurs/);
      }
      if (renderer.page === 'level-up') {
        assert.equal(after.oldLevel, before.oldLevel);
        assert.equal(after.newLevel, before.newLevel);
      }

      const frPath = path.join(OUTPUT, `${renderer.page}-fr.png`);
      await page.screenshot({ path: frPath, fullPage: true, animations: 'disabled' });
      result.captures.push({
        page: renderer.page,
        urlBefore: beforeUrl,
        urlAfter: afterUrl,
        unchangedUrl: beforeUrl === afterUrl,
        de: before,
        fr: after,
        screenshots: Object.fromEntries([dePath, frPath].map(file => {
          const bytes = fs.readFileSync(file);
          return [path.basename(file), { path: path.relative(ROOT, file).replace(/\\/g, '/'), bytes: bytes.length, sha256: sha256(bytes) }];
        }))
      });
      await page.close();
    }

    assert.deepEqual(result.browserErrors, []);
    assert.deepEqual(result.requestFailures, []);
    result.fixturePreClose = await fixtureCommand({ command: 'getstats' });
    assert.equal(result.fixturePreClose.denied, 0);
    assert.equal(result.fixturePreClose.clients, 0);
    const sourcePinsAfter = collectSourcePins();
    assert.deepEqual(sourcePinsAfter, sourcePinsBefore, 'pinned sources changed during browser capture');
    for (const served of result.fixturePreClose.servedSources) {
      assert.deepEqual(
        { bytes: served.bytes, sha256: served.sha256 },
        sourcePinsBefore[served.sourcePath],
        `served asset differs from its pinned source: ${served.sourcePath}`
      );
    }
    for (const renderer of RENDERERS) {
      const sourcePath = `app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/${renderer.page}.html`;
      const served = result.fixturePreClose.servedSources.filter(entry => entry.sourcePath === sourcePath);
      assert.equal(served.length, 1, `expected exactly one served copy of ${sourcePath}`);
    }
    result.sourcePins = { beforeCapture: sourcePinsBefore, afterCapture: sourcePinsAfter };
    await context.close();
    await browser.close();
    browser = null;
    const closeResponse = await fixtureCommand({ command: 'close' });
    assert.equal(closeResponse.closed, true);
    assert.equal(closeResponse.clients, 0);
    const exit = await fixtureExit;
    if (exit.code !== 0) throw new Error(`Fixture process exited ${exit.code}: ${stderr}`);
    result.fixtureShutdown = { response: closeResponse, processExit: exit, stderr: stderr.trim() };
    fs.writeFileSync(path.join(OUTPUT, 'run.json'), `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ status: 'passed', run: 'output/playwright/viewerxp/run.json', captures: result.captures.length, screenshots: result.captures.flatMap(item => Object.keys(item.screenshots)), fixtureUid: result.host.hostUid })}\n`);
  } catch (error) {
    if (browser) await browser.close().catch(() => {});
    fixtureProcess.stdin.write('{"command":"close"}\n');
    fixtureProcess.stdin.end();
    process.stderr.write(`${error.stack || error.message}\n${stderr}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();
