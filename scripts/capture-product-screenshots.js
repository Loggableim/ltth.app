'use strict';

const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { buildSpec, LOCALES: PRODUCT_LOCALES } = require('./product-screenshot-spec');
const { buildDocsSpec, LOCALES: DOCS_LOCALES } = require('./docs-screenshot-spec');
const { prepareDocsPluginFixture } = require('./lib/docs-capture-plugin-fixture');

const REPO_ROOT = path.resolve(__dirname, '..');
const SCREENSHOT_ROOT = path.join(REPO_ROOT, 'screenshots');
const COLLECTION = process.env.SCREENSHOT_COLLECTION === 'docs' ? 'docs' : 'product';
const MANIFEST_PATH = path.join(SCREENSHOT_ROOT, COLLECTION === 'docs' ? 'docs-capture-manifest.json' : 'product-capture-manifest.json');
const EXTERNAL_BASE_URL = (process.env.SCREENSHOT_BASE_URL || '').replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.SCREENSHOT_TIMEOUT_MS || 60000);
const WAIT_AFTER_LOAD_MS = Number(process.env.SCREENSHOT_WAIT_AFTER_LOAD_MS || 1500);
const ASSET_TIMEOUT_MS = Number(process.env.SCREENSHOT_ASSET_TIMEOUT_MS || 20000);
const START_APP = process.env.SCREENSHOT_START_APP !== 'false';

function loadPuppeteer() {
  const candidates = [
    path.join(REPO_ROOT, 'app', 'node_modules', 'puppeteer'),
    path.join(REPO_ROOT, 'app', 'node_modules', 'puppeteer-core'),
    'puppeteer',
    'puppeteer-core'
  ];
  let lastError;
  for (const candidate of candidates) {
    try { return require(candidate); } catch (error) { lastError = error; }
  }
  throw lastError;
}

function browserExecutablePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const candidates = process.platform === 'win32'
    ? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe']
    : [];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function outputPath(asset, locale) {
  const relative = asset.canonical.replace(/^\/screenshots\//, '');
  return path.join(locale === 'en' ? SCREENSHOT_ROOT : path.join(SCREENSHOT_ROOT, locale), relative);
}

function urlFor(baseUrl, route, locale) {
  const url = new URL(route, baseUrl);
  url.searchParams.set('lang', locale);
  return url.toString();
}

function specHash(spec) {
  return crypto.createHash('sha256').update(JSON.stringify({ version: spec.version, assets: spec.assets })).digest('hex');
}

function withTimeout(promise, label) {
  let timeout;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error(`Timed out after ${ASSET_TIMEOUT_MS}ms while capturing ${label}`)), ASSET_TIMEOUT_MS);
    })
  ]).finally(() => clearTimeout(timeout));
}

function rewritePluginAssetRequest(request) {
  const url = new URL(request.url());
  const aliases = {
    '/advanced-timer/ui.js': '/plugins/advanced-timer/ui/ui.js',
    '/advanced-timer/overlay.js': '/plugins/advanced-timer/overlay/overlay.js',
    '/openshock/openshock_overlay.js': '/plugins/openshock/overlay/openshock_overlay.js',
    '/openshock/openshock_overlay.css': '/plugins/openshock/overlay/openshock_overlay.css'
  };
  if (aliases[url.pathname]) {
    url.pathname = aliases[url.pathname];
    request.continue({ url: url.toString() });
    return true;
  }
  const match = url.pathname.match(/^\/([a-z0-9-]+)\/(.+)$/i);
  if (!match || url.pathname.startsWith('/plugins/') || ['api', 'js', 'css', 'images', 'assets', 'locales'].includes(match[1])) return false;
  const resource = match[2];
  if (!/^(?:assets\/|.*\.(?:js|css|png|jpe?g|gif|svg|webp|woff2?|mp3|wav|json))/i.test(resource)) return false;
  url.pathname = `/plugins/${match[1]}/${resource}`;
  request.continue({ url: url.toString() });
  return true;
}

async function attachPluginAssetRewrite(page) {
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (!rewritePluginAssetRequest(request)) request.continue();
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function waitForServer(child, baseUrl) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(async () => {
      if (child.exitCode !== null) {
        clearInterval(timer);
        reject(new Error(`App exited before capture started (code ${child.exitCode})`));
        return;
      }
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1000);
        const response = await fetch(`${baseUrl}/api/health`, { signal: controller.signal });
        clearTimeout(timeout);
        if (response.ok) {
          clearInterval(timer);
          resolve();
          return;
        }
      } catch (_) {
        // The isolated app is still starting.
      }
      if (Date.now() - started > 90000) {
        clearInterval(timer);
        reject(new Error('Timed out waiting for the isolated LTTH app'));
      }
    }, 500);
  });
}

async function startIsolatedApp(profileName, guideId = null) {
  if (!START_APP) {
    if (!EXTERNAL_BASE_URL) throw new Error('SCREENSHOT_BASE_URL is required when SCREENSHOT_START_APP=false');
    return { baseUrl: EXTERNAL_BASE_URL, child: null, profileDir: null };
  }
  const port = await freePort();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), `ltth-docs-capture-${profileName}-`));
  const docsCapturePluginDir = COLLECTION === 'docs' ? prepareDocsPluginFixture(REPO_ROOT, profileDir, guideId) : null;
  const child = spawn(process.execPath, [path.join(REPO_ROOT, 'app', 'server.js')], {
    cwd: path.join(REPO_ROOT, 'app'),
    env: {
      ...process.env,
      LOCALAPPDATA: profileDir,
      LTTH_PORT: String(port),
      LTTH_DOCS_CAPTURE: 'true',
      LTTH_DOCS_SAFE_MODE: 'true',
      LTTH_DISABLE_TIKTOK_AUTO_RECONNECT: 'true',
      LTTH_NO_BROWSER: 'true',
      DISABLE_SWAGGER: 'true',
      LTTH_BIND_ADDRESS: '127.0.0.1',
      ...(docsCapturePluginDir ? { LTTH_DOCS_CAPTURE_PLUGIN_DIR: docsCapturePluginDir } : {})
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let startupLog = '';
  const appendStartupLog = (chunk) => {
    startupLog = `${startupLog}${chunk.toString()}`.slice(-16000);
  };
  child.stdout.on('data', appendStartupLog);
  child.stderr.on('data', appendStartupLog);
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForServer(child, baseUrl);
      return { baseUrl, child, profileDir, getStartupLog: () => startupLog };
  } catch (error) {
    if (child.exitCode === null) child.kill();
    if (profileDir.startsWith(path.join(os.tmpdir(), 'ltth-docs-capture-'))) fs.rmSync(profileDir, { recursive: true, force: true });
    throw new Error(`${error.message}\n${startupLog || 'No startup output was emitted.'}`);
  }
}

async function stopIsolatedApp(app) {
  if (app.child && app.child.exitCode === null) {
    await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(finish, 5000);
      app.child.once('exit', finish);
      app.child.kill();
    });
  }
  if (app.profileDir && app.profileDir.startsWith(path.join(os.tmpdir(), 'ltth-docs-capture-'))) {
    fs.rmSync(app.profileDir, { recursive: true, force: true });
  }
}

async function configurePage(page, locale) {
  await page.evaluateOnNewDocument((lang) => {
    localStorage.setItem('dashboard-theme', 'cid');
    localStorage.setItem('app_locale', lang);
    document.documentElement.setAttribute('data-theme', 'cid');
    document.documentElement.lang = lang;
  }, locale);
}

async function activateContainingTab(page, selector) {
  const activated = await page.evaluate((anchorSelector) => {
    const target = document.querySelector(anchorSelector);
    if (!target) throw new Error(`Capture selector not found: ${anchorSelector}`);
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width >= 2 && rect.height >= 2;
    };
    if (visible(target)) return null;
    // A number of plugin panels hide the tab pane itself rather than a child
    // of it. Include the target in the lookup so `#tab-profiles` activates
    // its real `[data-tab="profiles"]` control as well.
    for (let parent = target; parent; parent = parent.parentElement) {
      // Shipped plugin UIs use tab-*, content-*, panel-*, and plain ids on a
      // `.tab-content` pane. The matching control is still clicked in the
      // real UI rather than changing a pane class directly.
      const match = parent.id && parent.id.match(/^(?:tab|content|panel)-(.+)$/);
      const tabName = match ? match[1] : (parent.id && parent.classList.contains('tab-content') ? parent.id : null);
      if (!tabName) continue;
      const trigger = document.querySelector(`[data-tab="${CSS.escape(tabName)}"], #sidebar-tab-${CSS.escape(tabName)}`);
      if (trigger && !trigger.disabled) {
        trigger.click();
        return { type: 'activate-tab', selector: trigger.matches('[data-tab]') ? `[data-tab="${tabName}"]` : `#sidebar-tab-${tabName}` };
      }
    }
    return null;
  }, selector);
  if (activated) await new Promise((resolve) => setTimeout(resolve, 120));
  return activated;
}

async function assertRenderedAnchor(page, selector) {
  return page.evaluate((anchorSelector) => {
    const anchor = document.querySelector(anchorSelector);
    if (!anchor) {
      const activeView = document.querySelector('.content-view.active')?.id || null;
      throw new Error(`Capture selector not found: ${anchorSelector}; runtime=${location.href}; activeView=${activeView}; title=${document.title}`);
    }
    const style = getComputedStyle(anchor);
    const rect = anchor.getBoundingClientRect();
    if (style.display === 'none' || style.visibility === 'hidden' || rect.width < 2 || rect.height < 2) {
      throw new Error(`Capture selector is not visibly rendered: ${anchorSelector}`);
    }
        // Keep the actual page at its normal left edge. The saved image may crop
        // around this real anchor, but capture never changes layout or DOM state.
    anchor.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    window.scrollTo({ left: 0, top: window.scrollY, behavior: 'instant' });
    return {
      selector: anchorSelector,
      text: (anchor.innerText || anchor.value || anchor.getAttribute('aria-label') || '').trim().slice(0, 160)
    };
  }, selector);
}

async function applySafeStepState(page, asset, locale) {
  // Screenshots never invoke a real device, external credential flow, print,
  // or production stream action. A guide may explicitly opt into one local
  // safe button action in its temporary profile; every other button remains
  // untouched.
  await page.evaluate((lang) => {
    document.documentElement.lang = lang;
    document.documentElement.setAttribute('data-theme', 'cid');
    localStorage.setItem('dashboard-theme', 'cid');
    localStorage.setItem('app_locale', lang);
  }, locale);
  if (asset.action && asset.action.prepare === 'create-demo-timer') {
    await page.evaluate(() => {
      const createTab = document.querySelector('.at-nav-btn[data-tab="create"]');
      if (!(createTab instanceof HTMLButtonElement) || createTab.disabled) {
        throw new Error('Advanced Timer create-tab control is unavailable');
      }
      createTab.click();
      const name = document.getElementById('timer-name');
      const duration = document.getElementById('initial-duration');
      if (!(name instanceof HTMLInputElement) || !(duration instanceof HTMLInputElement)) {
        throw new Error('Advanced Timer demo fields are unavailable');
      }
      name.value = 'LTTH docs countdown';
      duration.value = '90';
      for (const field of [name, duration]) {
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  if (asset.action && asset.action.prepare === 'select-local-tikfinity') {
    await page.evaluate(() => {
      const card = document.querySelector('#card-tikfinity.source-card[data-source="tikfinity"]');
      if (!card) throw new Error('TikFinity source card is unavailable');
      card.click();
    });
    await page.waitForFunction(() => {
      const control = document.querySelector('#btn-save-tikfinity');
      if (!control) return false;
      const style = getComputedStyle(control);
      const rect = control.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width >= 2 && rect.height >= 2;
    }, { timeout: 2000 });
  }
  if (asset.action && asset.action.prepare === 'open-goal-create-modal') {
    await page.evaluate(() => {
      const openModal = document.getElementById('create-first-goal-btn');
      if (!(openModal instanceof HTMLButtonElement) || openModal.disabled) {
        throw new Error('Goals create button is unavailable');
      }
      openModal.click();
    });
    await page.waitForFunction(() => {
      const modal = document.getElementById('goal-modal');
      return Boolean(modal && modal.classList.contains('active') && getComputedStyle(modal).display !== 'none');
    }, { timeout: 2000 });
  }
  if (asset.action && asset.action.prepare === 'open-milestone-tier-modal') {
    await page.evaluate(() => {
      const openModal = document.getElementById('addTierButton');
      if (!(openModal instanceof HTMLButtonElement) || openModal.disabled) throw new Error('Milestone Leaderboard add-tier button is unavailable');
      openModal.click();
    });
    await page.waitForFunction(() => {
      const modal = document.getElementById('tierModal');
      return Boolean(modal && modal.classList.contains('active') && getComputedStyle(modal).display !== 'none');
    }, { timeout: 2000 });
  }
  if (asset.action && asset.action.prepare === 'open-openshock-safety-tab') {
    await page.evaluate(() => {
      const tab = document.querySelector('.tab-button[data-tab="safety"]');
      if (!(tab instanceof HTMLButtonElement) || tab.disabled) throw new Error('OpenShock Safety tab is unavailable');
      tab.click();
    });
    await page.waitForFunction(() => {
      const panel = document.getElementById('safety');
      return Boolean(panel && panel.classList.contains('active') && getComputedStyle(panel).display !== 'none');
    }, { timeout: 2000 });
  }
  if (asset.action && asset.action.prepare === 'open-quiz-questions-tab') {
    await page.evaluate(() => {
      const tab = document.querySelector('.tab-button[data-tab="questions"]');
      if (!(tab instanceof HTMLButtonElement) || tab.disabled) throw new Error('Quiz Show questions tab is unavailable');
      tab.click();
    });
    await page.waitForFunction(() => {
      const panel = document.getElementById('questions');
      return Boolean(panel && panel.classList.contains('active') && getComputedStyle(panel).display !== 'none');
    }, { timeout: 2000 });
  }
  if (asset.action && asset.action.prepare === 'open-store-admin-view') {
    await page.evaluate(async () => {
      if (!window.StoreAuth || typeof window.StoreAuth.clearBridgeSession !== 'function') {
        throw new Error('Store Admin auth state is unavailable');
      }
      // Use the shipped signed-out state in the isolated capture profile. This
      // prevents the real account bridge from navigating away before its UI is
      // visible and never touches an account, source, or installed package.
      await window.StoreAuth.clearBridgeSession(true);
      if (!window.NavigationManager || typeof window.NavigationManager.switchView !== 'function') {
        throw new Error('Store Admin navigation is unavailable');
      }
      window.NavigationManager.switchView('plugins');
    });
    await page.waitForFunction(() => {
      const view = document.getElementById('view-plugins');
      const signIn = document.querySelector('[data-store-auth-mode="sign-in"]');
      return Boolean(view && view.classList.contains('active') && getComputedStyle(view).display !== 'none' && signIn && getComputedStyle(signIn).display !== 'none');
    }, { timeout: 4000 });
  }
  if (asset.action && asset.action.prepare === 'open-spotlight-settings') {
    await page.waitForFunction(() => document.querySelector('.overlay-card button[data-action="settings"][data-type="chatter"]'), { timeout: 3000 });
    await page.evaluate(() => {
      const openSettings = document.querySelector('.overlay-card button[data-action="settings"][data-type="chatter"]');
      if (!(openSettings instanceof HTMLButtonElement) || openSettings.disabled) throw new Error('Spotlight chatter settings button is unavailable');
      openSettings.click();
    });
    await page.waitForFunction(() => {
      const modal = document.getElementById('settings-modal');
      const form = document.getElementById('settings-form-container');
      return Boolean(modal && modal.classList.contains('active') && form && getComputedStyle(form).display !== 'none');
    }, { timeout: 3000 });
  }
  if (asset.action && asset.action.prepare === 'open-spotlight-preview') {
    await page.waitForFunction(() => document.querySelector('.overlay-card button[data-action="preview"][data-type="chatter"]'), { timeout: 3000 });
    await page.evaluate(() => {
      const openPreview = document.querySelector('.overlay-card button[data-action="preview"][data-type="chatter"]');
      if (!(openPreview instanceof HTMLButtonElement) || openPreview.disabled) throw new Error('Spotlight chatter preview button is unavailable');
      openPreview.click();
    });
    await page.waitForFunction(() => {
      const modal = document.getElementById('preview-modal');
      const frame = document.getElementById('preview-frame');
      return Boolean(modal && modal.classList.contains('active') && frame && getComputedStyle(frame).display !== 'none');
    }, { timeout: 3000 });
  }
  if (asset.action && asset.action.prepare === 'open-streamalchemy-settings') {
    await page.evaluate(() => {
      const tab = document.querySelector('.nav button[data-target="settings"]');
      if (!(tab instanceof HTMLButtonElement) || tab.disabled) throw new Error('StreamAlchemy Settings tab is unavailable');
      tab.click();
    });
    await page.waitForFunction(() => {
      const settings = document.querySelector('.view[data-view="settings"]');
      return Boolean(settings && settings.classList.contains('active') && getComputedStyle(settings).display !== 'none');
    }, { timeout: 2000 });
  }
  if (asset.action && asset.action.prepare === 'start-local-quiz') {
    const localQuizAlreadyRunning = await page.evaluate(() => {
      const timer = document.getElementById('timerDisplay');
      return Boolean(timer && !timer.classList.contains('hidden') && getComputedStyle(timer).display !== 'none');
    });
    if (!localQuizAlreadyRunning) {
      await page.evaluate(() => {
        const questionsTab = document.querySelector('.tab-button[data-tab="questions"]');
        if (!(questionsTab instanceof HTMLButtonElement) || questionsTab.disabled) throw new Error('Quiz Show questions tab is unavailable');
        questionsTab.click();
        const values = {
          questionInput: 'Which workflow stays local?',
          answerA: 'The isolated test workflow',
          answerB: 'A LIVE production stream',
          answerC: 'An external device test',
          answerD: 'A remote account action',
          questionCategory: 'LTTH docs'
        };
        for (const [id, value] of Object.entries(values)) {
          const field = document.getElementById(id);
          if (!(field instanceof HTMLInputElement)) throw new Error(`Quiz Show demo field is unavailable: ${id}`);
          field.value = value;
          field.dispatchEvent(new Event('input', { bubbles: true }));
          field.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const add = document.getElementById('addQuestionBtn');
        if (!(add instanceof HTMLButtonElement) || add.disabled) throw new Error('Quiz Show add-question button is unavailable');
        add.click();
      });
      await page.waitForFunction(() => document.getElementById('questionInput')?.value === '', { timeout: 4000 });
      await page.evaluate(() => {
        const dashboardTab = document.querySelector('.tab-button[data-tab="dashboard"]');
        if (!(dashboardTab instanceof HTMLButtonElement) || dashboardTab.disabled) throw new Error('Quiz Show dashboard tab is unavailable');
        dashboardTab.click();
        const start = document.getElementById('startQuizBtn');
        if (!(start instanceof HTMLButtonElement) || start.disabled) throw new Error('Quiz Show start button is unavailable after adding the local question');
        start.click();
      });
    }
    await page.waitForFunction(() => {
      const timer = document.getElementById('timerDisplay');
      const stop = document.getElementById('stopQuizBtn');
      return Boolean(timer && !timer.classList.contains('hidden') && getComputedStyle(timer).display !== 'none' && stop && !stop.disabled);
    }, { timeout: 4000 });
  }
  if (asset.action && asset.action.prepare === 'open-quiz-overlay-config-tab') {
    await page.evaluate(() => {
      const tab = document.querySelector('.tab-button[data-tab="overlay-config"]');
      if (!(tab instanceof HTMLButtonElement) || tab.disabled) throw new Error('Quiz Show overlay-configuration tab is unavailable');
      tab.click();
    });
    await page.waitForFunction(() => {
      const panel = document.getElementById('overlay-config');
      return Boolean(panel && panel.classList.contains('active') && getComputedStyle(panel).display !== 'none');
    }, { timeout: 2000 });
  }
  if (asset.action && /^open-soundboard-(?:event-sounds|obs-overlay)$/.test(asset.action.prepare)) {
    const view = asset.action.prepare === 'open-soundboard-event-sounds' ? 'event-sounds' : 'obs-overlay';
    await page.evaluate((targetView) => {
      const tab = document.querySelector(`.soundboard-nav-btn[data-soundboard-view="${targetView}"]`);
      if (!(tab instanceof HTMLButtonElement) || tab.disabled) throw new Error(`Soundboard ${targetView} workspace is unavailable`);
      tab.click();
    }, view);
    await page.waitForFunction((targetView) => {
      const panel = document.querySelector(`[data-workspace-panel="${targetView}"]`);
      return Boolean(panel && panel.classList.contains('active') && getComputedStyle(panel).display !== 'none');
    }, { timeout: 2000 }, view);
  }
  if (asset.action && /^open-minecraft-(?:chat|setup)-tab$/.test(asset.action.prepare)) {
    const tabName = asset.action.prepare === 'open-minecraft-chat-tab' ? 'chat' : 'setup';
    await page.evaluate((targetTab) => {
      const tab = document.querySelector(`.mc-tab[data-tab="${targetTab}"]`);
      if (!(tab instanceof HTMLButtonElement) || tab.disabled) throw new Error(`Minecraft ${targetTab} tab is unavailable`);
      tab.click();
    }, tabName);
    await page.waitForFunction((targetTab) => {
      const panel = document.getElementById(`${targetTab}-tab`);
      return Boolean(panel && panel.classList.contains('active') && getComputedStyle(panel).display !== 'none');
    }, { timeout: 2000 }, tabName);
  }
  if (asset.action && asset.action.prepare === 'open-fireworks-settings') {
    await page.evaluate(() => {
      const tab = document.querySelector('.tab-button[data-tab="settings"]');
      if (!(tab instanceof HTMLButtonElement) || tab.disabled) throw new Error('Fireworks settings tab is unavailable');
      tab.click();
    });
    await page.waitForFunction(() => {
      const panel = document.getElementById('settings');
      return panel && getComputedStyle(panel).display !== 'none';
    }, { timeout: 2000 });
  }
  if (asset.action && /^open-flame-(?:frame|motion)-tab$/.test(asset.action.prepare)) {
    const tabName = asset.action.prepare === 'open-flame-frame-tab' ? 'frame' : 'motion';
    await page.evaluate((targetTab) => {
      const tab = document.querySelector(`.tab-btn[data-tab-target="${targetTab}"]`);
      if (!(tab instanceof HTMLButtonElement) || tab.disabled) throw new Error(`Flame Overlay ${targetTab} tab is unavailable`);
      tab.click();
    }, tabName);
    await page.waitForFunction((targetTab) => {
      const panel = document.querySelector(`.tab-pane[data-tab="${targetTab}"]`);
      return panel && !panel.classList.contains('hidden') && getComputedStyle(panel).display !== 'none';
    }, { timeout: 2000 }, tabName);
  }
  if (asset.action && asset.action.prepare === 'start-local-manual-game') {
    await page.evaluate(() => {
      const tab = document.querySelector('.tab[data-tab="manual-mode"]');
      if (!(tab instanceof HTMLButtonElement) || tab.disabled) throw new Error('Game Engine manual-mode tab is unavailable');
      tab.click();
    });
    await page.waitForFunction(() => {
      const start = document.getElementById('start-manual-game');
      const style = start && getComputedStyle(start);
      return Boolean(style && style.display !== 'none' && style.visibility !== 'hidden');
    }, { timeout: 2000 });
    const manualGameAlreadyActive = await page.evaluate(() => {
      const controls = document.getElementById('manual-game-controls');
      const style = controls && getComputedStyle(controls);
      return Boolean(style && style.display !== 'none' && style.visibility !== 'hidden');
    });
    if (!manualGameAlreadyActive) {
      await page.evaluate(() => {
        const start = document.getElementById('start-manual-game');
        if (!(start instanceof HTMLButtonElement) || start.disabled) throw new Error('Game Engine local test button is unavailable');
        start.click();
      });
    }
    try {
      await page.waitForFunction(() => {
        const controls = document.getElementById('manual-game-controls');
        const style = controls && getComputedStyle(controls);
        return Boolean(style && style.display !== 'none' && style.visibility !== 'hidden');
      }, { timeout: 3000 });
    } catch (_) {
      const state = await page.evaluate(() => {
        const controls = document.getElementById('manual-game-controls');
        const error = document.getElementById('error-message');
        const success = document.getElementById('success-message');
        const style = controls && getComputedStyle(controls);
        return {
          controlsDisplay: style?.display || null,
          controlsVisibility: style?.visibility || null,
          error: error?.innerText?.trim() || null,
          success: success?.innerText?.trim() || null
        };
      });
      throw new Error(`Game Engine manual session did not render controls: ${JSON.stringify(state)}`);
    }
  }
  if (asset.action && asset.action.type === 'set-demo-value') {
    await page.evaluate((selector) => {
      const field = document.querySelector(selector);
      if (!field || !['INPUT', 'TEXTAREA', 'SELECT'].includes(field.tagName)) return;
      if (field.tagName === 'SELECT') {
        const option = [...field.options].find((candidate) => !candidate.disabled && candidate.value) || field.options[0];
        if (option) field.value = option.value;
      } else if (field.type === 'checkbox') {
        field.checked = true;
      } else if (!['button', 'submit', 'password', 'file'].includes(field.type)) {
        field.value = 'LTTH docs demo';
      }
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }, asset.action.inputSelector || asset.selector);
  }
  if (asset.action && asset.action.allowClick) {
    await page.evaluate((selector, actionType, guideId) => {
      const control = document.querySelector(selector);
      if (!control) throw new Error(`Capture selector not found: ${selector}`);
      const isLocalSourceCard = actionType === 'select-local-source'
        && guideId === 'data-source'
        && control.matches('#card-tikfinity.source-card[data-source="tikfinity"]');
      if (!(control instanceof HTMLButtonElement || control instanceof HTMLInputElement || control.getAttribute('role') === 'button' || isLocalSourceCard)) {
        throw new Error(`Declared local action is not a clickable control: ${selector}`);
      }
      if (control.disabled) throw new Error(`Declared local action is disabled: ${selector}`);
      control.click();
    }, asset.action.clickSelector || asset.selector, asset.action.type, asset.guideId);
    await new Promise((resolve) => setTimeout(resolve, asset.action.settleMs || 250));
  }
}

function screenshotClipForAnchor(viewport, anchorRect) {
  const width = Math.min(viewport.clientWidth, 640);
  const height = Math.min(viewport.height, 560);
  const anchorCenterX = viewport.scrollX + anchorRect.left + (anchorRect.width / 2);
  const anchorCenter = viewport.scrollY + anchorRect.top + (anchorRect.height / 2);
  const maxX = Math.max(0, viewport.scrollWidth - width);
  const maxY = Math.max(0, viewport.scrollHeight - height);
  return {
    // Each capture is a direct crop of the shipped UI around its real anchor.
    // It makes the documented control readable without injecting focus chrome
    // or modifying the page's natural scroll/layout state.
    x: Math.round(Math.max(0, Math.min(anchorCenterX - (width / 2), maxX))),
    y: Math.round(Math.max(0, Math.min(anchorCenter - (height / 2), maxY))),
    width,
    height
  };
}

async function captureAsset(page, baseUrl, asset, locale) {
  await page.setViewport(asset.viewport);
  // Overlay renderers can start live sockets, WebGL loops, or audio engines on
  // load. For documentation we preserve their shipped markup and styles while
  // preventing that unsafe runtime work in the isolated capture browser.
  const needsOpenShockDemo = asset.guideId === 'openshock' && asset.action && asset.action.type === 'open-overlay-preview';
  // Interactive Story has a large, self-starting admin runtime that begins
  // status polling before a test story has been configured. The shipped HTML
  // already contains the complete configuration UI, so documenting its safe
  // empty state must not start that runtime or make a network request.
  const staticOnly = needsOpenShockDemo || asset.guideId === 'interactive-story';
  await page.setJavaScriptEnabled(!staticOnly);
  const response = await page.goto(urlFor(baseUrl, asset.route, locale), { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
  if (!response || response.status() >= 400) throw new Error(`HTTP ${response ? response.status() : 'no response'} for ${asset.route}`);
  // Store initialization automatically opens the external account bridge for
  // a fresh profile. Clear the local bridge session as soon as its shipped
  // dashboard scripts are available so the documented, real signed-out panel
  // can render before a browser navigation begins.
  const prepareImmediately = asset.action && asset.action.prepare === 'open-store-admin-view';
  if (prepareImmediately) {
    await applySafeStepState(page, asset, locale);
  } else {
    await new Promise((resolve) => setTimeout(resolve, WAIT_AFTER_LOAD_MS));
  }
  if (needsOpenShockDemo) {
    await page.setJavaScriptEnabled(true);
    await page.addScriptTag({ url: `${baseUrl}/plugins/openshock/overlay/openshock_overlay.js` });
    await page.waitForFunction(() => typeof window.handleCommandSent === 'function', { timeout: 3000 });
    await page.evaluate(() => window.handleCommandSent({
      type: 'vibrate',
      intensity: 20,
      duration: 800,
      deviceName: 'Offline demo device',
      username: 'Demo user',
      source: 'docs-demo'
    }));
  }
  if (!prepareImmediately) await applySafeStepState(page, asset, locale);
  // Some shipped controls are created only after a real settings/preview
  // workflow. Run that workflow first, then let the generic tab helper reveal
  // a static parent pane if the anchor still needs it.
  const tabPreparation = await activateContainingTab(page, asset.selector);
  const preparation = [tabPreparation].filter(Boolean);
  const focus = await assertRenderedAnchor(page, asset.selector);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const state = await page.evaluate((lang, anchorSelector) => {
    const anchor = document.querySelector(anchorSelector);
    const rect = anchor && anchor.getBoundingClientRect();
    return {
      lang: document.documentElement.lang || document.documentElement.getAttribute('data-lang') || null,
      i18n: window.i18n && typeof window.i18n.getLocale === 'function' ? window.i18n.getLocale() : (window.I18n && window.I18n.currentLang) || document.documentElement.lang || null,
      theme: document.documentElement.getAttribute('data-theme') || null,
      route: `${location.pathname}${location.search}`,
          viewport: {
            scrollX: window.scrollX,
            scrollY: window.scrollY,
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            scrollHeight: document.documentElement.scrollHeight,
            height: window.innerHeight
      },
      anchorRect: rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null
    };
  }, locale, asset.selector);
  if (state.lang !== locale) throw new Error(`Document language is ${state.lang || 'unset'}, expected ${locale}`);
  if (state.theme !== 'cid') throw new Error(`Theme is ${state.theme || 'unset'}, expected cid`);
  if (!state.anchorRect) throw new Error(`Capture anchor has no rendered geometry: ${asset.selector}`);
  const screenshotClip = screenshotClipForAnchor(state.viewport, state.anchorRect);
  const target = outputPath(asset, locale);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  await page.screenshot({ path: target, type: 'png', clip: screenshotClip });
  const bytes = fs.readFileSync(target);
  if (asset.action && asset.action.cleanupSelector === '#end-manual-game') {
    const cleanupConfirmation = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Game Engine local cleanup confirmation did not open')), 2000);
      page.once('dialog', async (dialog) => {
        try {
          await dialog.accept();
          clearTimeout(timeout);
          resolve();
        } catch (error) {
          clearTimeout(timeout);
          reject(error);
        }
      });
    });
    await page.evaluate(() => {
      const endGame = document.getElementById('end-manual-game');
      if (!(endGame instanceof HTMLButtonElement) || endGame.disabled) throw new Error('Game Engine local cleanup button is unavailable');
      endGame.click();
    });
    await cleanupConfirmation;
    await page.waitForFunction(() => {
      const controls = document.getElementById('manual-game-controls');
      return Boolean(controls && getComputedStyle(controls).display === 'none');
    }, { timeout: 3000 });
  }
  if (asset.action && asset.action.cleanupSelector === '#stopQuizBtn') {
    const cleanupConfirmation = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Quiz Show local cleanup confirmation did not open')), 2000);
      page.once('dialog', async (dialog) => {
        try {
          await dialog.accept();
          clearTimeout(timeout);
          resolve();
        } catch (error) {
          clearTimeout(timeout);
          reject(error);
        }
      });
    });
    await page.evaluate(() => {
      const stop = document.getElementById('stopQuizBtn');
      if (!(stop instanceof HTMLButtonElement) || stop.disabled) throw new Error('Quiz Show local cleanup button is unavailable');
      stop.click();
    });
    await cleanupConfirmation;
    await page.waitForFunction(() => {
      const timer = document.getElementById('timerDisplay');
      const start = document.getElementById('startQuizBtn');
      return Boolean(timer && timer.classList.contains('hidden') && start && !start.disabled);
    }, { timeout: 3000 });
  }
  return {
    locale,
    id: asset.id,
    guideId: asset.guideId,
    stepId: asset.stepId,
    path: path.relative(REPO_ROOT, target).replace(/\\/g, '/'),
    route: asset.route,
    selector: asset.selector,
    action: asset.action,
    fixture: asset.fixture,
    focus,
    preparation,
    state,
    screenshotClip,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length
  };
}

async function captureFailureContext(page) {
  return page.evaluate(() => {
    const isVisible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width >= 2 && rect.height >= 2;
    };
    return [...document.querySelectorAll('.alert, .toast, [role="alert"]')]
      .filter(isVisible)
      .map((element) => (element.innerText || element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 240))
      .filter(Boolean)
      .slice(0, 3);
  }).catch(() => []);
}

async function captureDocs(spec, assets, locales) {
  const puppeteer = loadPuppeteer();
  const executablePath = browserExecutablePath();
  const browser = await puppeteer.launch({ headless: 'new', ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const outputs = [];
  const failures = [];
  try {
    const createCapturePage = async (locale) => {
      const page = await browser.newPage();
      await attachPluginAssetRewrite(page);
      await configurePage(page, locale);
      return page;
    };
    const byGuide = new Map();
    for (const asset of assets) {
      const group = byGuide.get(asset.guideId) || [];
      group.push(asset);
      byGuide.set(asset.guideId, group);
    }
    for (const locale of locales) {
      for (const [guideId, guideAssets] of byGuide) {
        let app;
        let page;
        try {
          console.log(`Capturing ${locale}/${guideId} (${guideAssets.length} steps)`);
          app = await startIsolatedApp(`${guideId}-${locale}`, guideId);
          page = await createCapturePage(locale);
          for (const asset of guideAssets) {
            try {
              outputs.push(await withTimeout(captureAsset(page, app.baseUrl, asset, locale), `${locale}/${asset.id}`));
            } catch (error) {
              const context = await captureFailureContext(page);
              const diagnostic = context.length ? ` Visible page message: ${context.join(' | ')}` : '';
              const startupLog = app?.getStartupLog?.() || '';
              const relevantLog = startupLog.split(/\r?\n/)
                .filter((line) => /plugin|config-import|error|failed/i.test(line))
                .slice(-30)
                .join(' | ');
              const startupDiagnostic = relevantLog ? ` Startup log: ${relevantLog}` : '';
              failures.push({ locale, id: asset.id, guideId, stepId: asset.stepId, route: asset.route, selector: asset.selector, error: `${error.message}${diagnostic}${startupDiagnostic}` });
              if (error.message.includes('Timed out after')) {
                await page.close().catch(() => {});
                page = await createCapturePage(locale);
              }
            }
          }
        } catch (error) {
          for (const asset of guideAssets) failures.push({ locale, id: asset.id, guideId, stepId: asset.stepId, route: asset.route, selector: asset.selector, error: `Isolated guide process failed: ${error.message}` });
        } finally {
          if (page) await page.close();
          if (app) await stopIsolatedApp(app);
        }
      }
    }
  } finally {
    await browser.close();
  }
  return { outputs, failures };
}

async function captureProduct(spec, assets, locales) {
  // The product collection retains the historical shared-process behavior;
  // docs always use captureDocs above because each guide must be isolated.
  const puppeteer = loadPuppeteer();
  const executablePath = browserExecutablePath();
  const app = await startIsolatedApp('product');
  const browser = await puppeteer.launch({ headless: 'new', ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const outputs = [];
  const failures = [];
  try {
    for (const locale of locales) {
      const page = await browser.newPage();
      await attachPluginAssetRewrite(page);
      await configurePage(page, locale);
      for (const asset of assets) {
        try { outputs.push(await captureAsset(page, app.baseUrl, asset, locale)); } catch (error) { failures.push({ locale, id: asset.id, route: asset.route, error: error.message }); }
      }
      await page.close();
    }
  } finally {
    await browser.close();
    await stopIsolatedApp(app);
  }
  return { outputs, failures };
}

function compatibleDocsOutput(output, expectedById) {
  const asset = expectedById.get(output.id);
  if (!asset || !DOCS_LOCALES.includes(output.locale)) return false;
  return output.guideId === asset.guideId
    && output.stepId === asset.stepId
    && output.route === asset.route
    && output.selector === asset.selector
    && JSON.stringify(output.action) === JSON.stringify(asset.action)
        && output.focus?.selector === asset.selector
        && output.screenshotClip
        && output.screenshotClip.width === Math.min(output.state?.viewport?.clientWidth || 0, 640)
    && output.state?.lang === output.locale
    && output.state?.i18n === output.locale
    && output.state?.theme === 'cid';
}

function mergePartialDocsOutputs(spec, newOutputs) {
  const expectedById = new Map(spec.assets.map((asset) => [asset.id, asset]));
  const byKey = new Map();
  if (fs.existsSync(MANIFEST_PATH)) {
    const existing = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    for (const output of existing.outputs || []) {
      if (compatibleDocsOutput(output, expectedById)) byKey.set(`${output.locale}:${output.id}`, output);
    }
  }
  for (const output of newOutputs) byKey.set(`${output.locale}:${output.id}`, output);
  return DOCS_LOCALES.flatMap((locale) => spec.assets.map((asset) => byKey.get(`${locale}:${asset.id}`)).filter(Boolean));
}

async function capture() {
  const fullSpec = COLLECTION === 'docs' ? buildDocsSpec(REPO_ROOT) : buildSpec(REPO_ROOT);
  const locales = (process.env.SCREENSHOT_LANGS || (COLLECTION === 'docs' ? DOCS_LOCALES : PRODUCT_LOCALES).join(','))
    .split(',').map((value) => value.trim().toLowerCase()).filter((value) => (COLLECTION === 'docs' ? DOCS_LOCALES : PRODUCT_LOCALES).includes(value));
  if (!locales.length) throw new Error('SCREENSHOT_LANGS must contain supported locales');
  let assets = [...fullSpec.assets];
  const requestedIds = (process.env.SCREENSHOT_IDS || '').split(',').map((value) => value.trim()).filter(Boolean);
  if (requestedIds.length) assets = assets.filter((asset) => requestedIds.includes(asset.id));
  const limit = Number(process.env.SCREENSHOT_LIMIT || 0);
  if (limit > 0) assets = assets.slice(0, limit);
  if (!assets.length) throw new Error('No capture assets selected');

  const result = COLLECTION === 'docs' ? await captureDocs(fullSpec, assets, locales) : await captureProduct(fullSpec, assets, locales);
  const partialDocsCapture = COLLECTION === 'docs' && (requestedIds.length > 0 || limit > 0 || locales.length !== DOCS_LOCALES.length);
  const outputs = partialDocsCapture ? mergePartialDocsOutputs(fullSpec, result.outputs) : result.outputs;
  const fullHash = specHash(fullSpec);
  const manifest = {
    ...fullSpec,
    collection: COLLECTION,
    sourceUrl: START_APP ? 'isolated-local-process' : EXTERNAL_BASE_URL,
    capturedAt: new Date().toISOString(),
    specHash: fullHash,
    requestedLocales: locales,
    requestedIds: assets.map((asset) => asset.id),
    outputs,
    failures: result.failures
  };
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Captured ${result.outputs.length} screenshots; ${result.failures.length} failed. Manifest now contains ${outputs.length} current captures.`);
  console.log(`Manifest: ${path.relative(REPO_ROOT, MANIFEST_PATH)}`);
  if (result.failures.length) process.exitCode = 1;
}

capture().catch((error) => {
  console.error(`Fatal screenshot capture error: ${error.stack || error.message}`);
  process.exitCode = 1;
});
