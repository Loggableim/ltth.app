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
const { assertNoBlockedNetworkAttempts, createCaptureReceipt, isAllowedCaptureNetworkUrl } = require('./lib/capture-receipt');
const {
  assertWorkflowOperationsExecuted,
  createBlockedNetworkEvidence,
  INTERACTION_OPERATION_TYPES
} = require('./lib/docs-capture-workflow-runner');
const {
  captureFailureContext: readBoundedFailureContext,
  closeCaptureBrowser,
  closeCapturePage,
  isCaptureTimeout,
  recoverCapturePage,
  runWithTimeout,
  stopCaptureAppChild
} = require('./lib/docs-capture-lifecycle');

const REPO_ROOT = path.resolve(__dirname, '..');
const APP_VERSION = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'app', 'package.json'), 'utf8')).version;
const SCREENSHOT_ROOT = path.join(REPO_ROOT, 'screenshots');
const COLLECTION = process.env.SCREENSHOT_COLLECTION === 'docs' ? 'docs' : 'product';
const MANIFEST_PATH = path.join(SCREENSHOT_ROOT, COLLECTION === 'docs' ? 'docs-capture-manifest.json' : 'product-capture-manifest.json');
const EXTERNAL_BASE_URL = (process.env.SCREENSHOT_BASE_URL || '').replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.SCREENSHOT_TIMEOUT_MS || 60000);
const WAIT_AFTER_LOAD_MS = Number(process.env.SCREENSHOT_WAIT_AFTER_LOAD_MS || 1500);
const ASSET_TIMEOUT_MS = Number(process.env.SCREENSHOT_ASSET_TIMEOUT_MS || 20000);
const LIFECYCLE_TIMEOUT_MS = Number(process.env.SCREENSHOT_LIFECYCLE_TIMEOUT_MS || 5000);
const FAILURE_CONTEXT_TIMEOUT_MS = Number(process.env.SCREENSHOT_FAILURE_CONTEXT_TIMEOUT_MS || 1000);
const DEBUG_CAPTURE = process.env.SCREENSHOT_DEBUG_CAPTURE === 'true';
const START_APP = process.env.SCREENSHOT_START_APP !== 'false';
const RUNTIME_PLUGIN_ROUTE_PREFIXES = new Set(['flame-overlay', 'visual-fx-frame-webgpu']);
const DOCUMENTATION_DEMO_INPUT_VALUES = Object.freeze({
  'emoji-rain/choose-emojis': '💧, ✨, 🎉'
});
const SUPPORTED_LOCAL_PREPARATIONS = new Set([
  'create-demo-goal-overlay',
  'create-demo-timer',
  'create-demo-timer-overlay',
  'open-fireworks-settings',
  'open-flame-frame-tab',
  'open-flame-motion-tab',
  'open-goal-create-modal',
  'open-milestone-tier-modal',
  'open-minecraft-chat-tab',
  'open-minecraft-setup-tab',
  'open-music-bot-settings',
  'open-openshock-safety-tab',
  'open-quiz-overlay-config-tab',
  'open-quiz-questions-tab',
  'open-soundboard-event-sounds',
  'open-soundboard-obs-overlay',
  'open-spotlight-preview',
  'open-spotlight-settings',
  'open-store-admin-view',
  'open-streamalchemy-settings',
  'select-local-tikfinity',
  'start-local-manual-game',
  'start-local-quiz'
]);

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
  return runWithTimeout(promise, {
    label: `capturing ${label}`,
    timeoutMs: ASSET_TIMEOUT_MS
  });
}

function debugCapturePhase(label) {
  if (DEBUG_CAPTURE) console.log(`[docs-capture] ${label}`);
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
  if (!match || url.pathname.startsWith('/plugins/') || RUNTIME_PLUGIN_ROUTE_PREFIXES.has(match[1]) || ['api', 'js', 'css', 'images', 'assets', 'fonts', 'locales'].includes(match[1])) return false;
  const resource = match[2];
  if (!/^(?:assets\/|.*\.(?:js|css|png|jpe?g|gif|svg|webp|woff2?|mp3|wav|json))/i.test(resource)) return false;
  url.pathname = `/plugins/${match[1]}/${resource}`;
  request.continue({ url: url.toString() });
  return true;
}

async function attachPluginAssetRewrite(page) {
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = request.url();
    // Puppeteer request interception must be resolved by a single handler.
    // Recording and resolving the same event in two listeners can deadlock a
    // page before its i18n client has initialized.
    if (/^https?:/i.test(url) && isAllowedCaptureNetworkUrl(url)) {
      page.__docsCaptureNetwork.push({
        url,
        method: request.method(),
        resourceType: request.resourceType()
      });
    }
    if (!isAllowedCaptureNetworkUrl(url)) {
      page.__docsCaptureBlockedNetwork.push(createBlockedNetworkEvidence({
        url,
        method: request.method(),
        resourceType: request.resourceType()
      }));
      request.abort('blockedbyclient').catch(() => {});
      return;
    }
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
  if (COLLECTION === 'docs' && !START_APP) {
    throw new Error('Documentation screenshots require an isolated local LTTH process');
  }
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
    let cleanupDiagnostic = '';
    try {
      await stopIsolatedApp({ child, profileDir }, profileName);
    } catch (cleanupError) {
      cleanupDiagnostic = `\nStartup cleanup failed: ${cleanupError.message}`;
    }
    throw new Error(`${error.message}${cleanupDiagnostic}\n${startupLog || 'No startup output was emitted.'}`);
  }
}

async function stopIsolatedApp(app, label = 'isolated LTTH app') {
  let cleanupError = null;
  try {
    await stopCaptureAppChild(app.child, { label, timeoutMs: LIFECYCLE_TIMEOUT_MS });
  } catch (error) {
    cleanupError = error;
  }
  try {
    if (app.profileDir && app.profileDir.startsWith(path.join(os.tmpdir(), 'ltth-docs-capture-'))) {
      fs.rmSync(app.profileDir, { recursive: true, force: true });
    }
  } catch (error) {
    if (!cleanupError) cleanupError = error;
  }
  if (cleanupError) throw cleanupError;
}

function applyCaptureDocumentSettings(lang) {
  localStorage.setItem('dashboard-theme', 'cid');
  localStorage.setItem('app_locale', lang);
  const root = document.documentElement;
  if (!root) {
    document.addEventListener('DOMContentLoaded', () => applyCaptureDocumentSettings(lang), { once: true });
    return;
  }
  root.setAttribute('data-theme', 'cid');
  root.lang = lang;
  root.dataset.lang = lang;
}

function isBlockedExternalRequestConsoleError(message) {
  const location = message.location();
  return message.type() === 'error'
    && message.text().includes('net::ERR_BLOCKED_BY_CLIENT')
    && /^https?:/i.test(location.url || '')
    && !isAllowedCaptureNetworkUrl(location.url);
}

async function configurePage(page, locale) {
  page.__docsCaptureConsoleErrors = [];
  page.__docsCaptureNetwork = [];
  page.__docsCaptureBlockedNetwork = [];
  page.on('console', (message) => {
    if (isBlockedExternalRequestConsoleError(message)) return;
    if (message.type() === 'error') {
      const location = message.location();
      page.__docsCaptureConsoleErrors.push(
        location.url ? `${message.text()} (${location.url}:${location.lineNumber})` : message.text()
      );
    }
  });
  page.on('pageerror', (error) => page.__docsCaptureConsoleErrors.push(error.message));
  await page.evaluateOnNewDocument(applyCaptureDocumentSettings, locale);
}

async function synchronizeCaptureLocale(page, locale) {
  debugCapturePhase(`locale:${locale}: wait-i18n-init`);
  await page.waitForFunction(() => {
    return !window.i18n
      || typeof window.i18n.setLocale !== 'function'
      || window.i18n.initialized !== false;
  }, { timeout: LIFECYCLE_TIMEOUT_MS });
  debugCapturePhase(`locale:${locale}: apply`);
  await page.evaluate(async (lang) => {
    document.documentElement.lang = lang;
    document.documentElement.dataset.lang = lang;
    document.documentElement.setAttribute('data-theme', 'cid');
    localStorage.setItem('dashboard-theme', 'cid');
    localStorage.setItem('app_locale', lang);
    if (window.i18n && typeof window.i18n.setLocale === 'function') {
      await window.i18n.setLocale(lang);
      window.i18n.updateDOM?.();
    }
    if (window.I18n && typeof window.I18n.load === 'function') {
      await window.I18n.load(lang);
      window.I18n.apply?.();
    }
  }, locale);
  debugCapturePhase(`locale:${locale}: applied`);
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

async function observeControlState(page, selector) {
  return page.evaluate((controlSelector) => {
    const control = document.querySelector(controlSelector);
    if (!control) throw new Error(`Capture selector not found: ${controlSelector}`);
    const style = getComputedStyle(control);
    const rect = control.getBoundingClientRect();
    return {
      visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width >= 2 && rect.height >= 2,
      text: (control.innerText || control.textContent || control.getAttribute('aria-label') || '').trim(),
      value: 'value' in control ? control.value : null,
      checked: 'checked' in control ? Boolean(control.checked) : null,
      className: typeof control.className === 'string' ? control.className : '',
      ariaExpanded: control.getAttribute('aria-expanded')
    };
  }, selector);
}

async function applySafeStepState(page, asset, locale) {
  // Screenshots never invoke a real device, external credential flow, print,
  // or production stream action. A guide may explicitly opt into one local
  // safe button action in its temporary profile; every other button remains
  // untouched.
  const interactions = [];
  const captureLabel = `${locale}/${asset.id || `${asset.guideId}/${asset.stepId}`}`;
  debugCapturePhase(`${captureLabel}: local-state-locale`);
  await synchronizeCaptureLocale(page, locale);
  debugCapturePhase(`${captureLabel}: local-state-preparation`);
  const preparationSelector = asset.action?.preparationEvidenceSelector
    || asset.action?.inputSelector
    || asset.action?.clickSelector
    || asset.selector;
  const preparationBefore = asset.action?.prepare
    ? await observeControlState(page, preparationSelector).catch(() => null)
    : null;
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
      const openModal = document.getElementById('create-first-goal-btn')
        || document.getElementById('create-goal-btn');
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
  if (asset.action && asset.action.prepare === 'open-music-bot-settings') {
    await page.evaluate(() => {
      const openSettings = document.getElementById('musicbot-onboarding-settings');
      if (!(openSettings instanceof HTMLButtonElement) || openSettings.disabled) {
        throw new Error('Music Bot settings button is unavailable');
      }
      openSettings.click();
    });
    await page.waitForFunction(() => {
      const control = document.getElementById('duplicate-detection');
      if (!control) return false;
      const style = getComputedStyle(control);
      const rect = control.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width >= 2 && rect.height >= 2;
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
  if (asset.action && asset.action.prepare) {
    if (!SUPPORTED_LOCAL_PREPARATIONS.has(asset.action.prepare)) {
      throw new Error(`Unsupported local documentation preparation: ${asset.action.prepare}`);
    }
    const selector = asset.action.preparationEvidenceSelector
      || asset.action.inputSelector
      || asset.action.clickSelector
      || asset.selector;
    const observed = await observeControlState(page, selector);
    if (!observed.visible) {
      throw new Error(`Local documentation preparation ${asset.action.prepare} has no visible DOM evidence at ${selector}`);
    }
    interactions.push({
      type: 'prepare',
      selector,
      status: 'performed',
      observed: true,
      name: asset.action.prepare,
      before: preparationBefore,
      changed: !preparationBefore || JSON.stringify(preparationBefore) !== JSON.stringify(observed),
      after: observed
    });
    // Some safe local workflows are completely performed by their named
    // preparation (for example starting a test-only quiz). Record that real
    // preparation as the declared operation as well, so the receipt can prove
    // both the prerequisite and the resulting local workflow without
    // inventing a second button click.
    if (!asset.action.allowClick
      && asset.action.type !== 'set-demo-value'
      && INTERACTION_OPERATION_TYPES.has(asset.action.type)) {
      const evidenceSelector = asset.action.evidenceSelector || asset.selector || selector;
      const evidenceAfter = evidenceSelector === selector
        ? observed
        : await observeControlState(page, evidenceSelector);
      interactions.push({
        type: asset.action.type,
        selector: evidenceSelector,
        status: 'performed',
        observed: true,
        preparation: asset.action.prepare,
        before: preparationBefore,
        after: evidenceAfter,
        changed: !preparationBefore || JSON.stringify(preparationBefore) !== JSON.stringify(evidenceAfter)
      });
    }
  }
  if (asset.action && asset.action.type === 'set-demo-value') {
    const demoValue = DOCUMENTATION_DEMO_INPUT_VALUES[`${asset.guideId}/${asset.stepId}`] || 'LTTH docs demo';
    const interaction = await page.evaluate((selector, value) => {
      const field = document.querySelector(selector);
      if (!field || !['INPUT', 'TEXTAREA', 'SELECT'].includes(field.tagName)) {
        throw new Error(`Demo value target is not an editable control: ${selector}`);
      }
      const before = { value: field.value, checked: 'checked' in field ? Boolean(field.checked) : null };
      let exercised = false;
      if (field.tagName === 'SELECT') {
        const option = [...field.options].find((candidate) => !candidate.disabled && candidate.value && candidate.value !== field.value)
          || [...field.options].find((candidate) => !candidate.disabled && candidate.value)
          || field.options[0];
        if (option) field.value = option.value;
      } else if (field.type === 'checkbox') {
        // The default in a fresh profile can already be the desired enabled
        // state. Exercise the shipped control through the opposite local
        // state first, then leave the documented enabled state in place.
        if (field.checked) {
          field.checked = false;
          field.dispatchEvent(new Event('input', { bubbles: true }));
          field.dispatchEvent(new Event('change', { bubbles: true }));
          exercised = true;
        }
        field.checked = true;
      } else if (!['button', 'submit', 'password', 'file'].includes(field.type)) {
        field.value = value;
      } else {
        throw new Error(`Demo value target is not writable: ${selector}`);
      }
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      const after = { value: field.value, checked: 'checked' in field ? Boolean(field.checked) : null };
      return {
        type: 'set-demo-value',
        selector,
        status: 'performed',
        observed: true,
        before,
        after,
        changed: before.value !== after.value || before.checked !== after.checked || exercised
      };
    }, asset.action.inputSelector || asset.selector, demoValue);
    interactions.push(interaction);
  }
  if (asset.action && asset.action.allowClick) {
    const selector = asset.action.clickSelector || asset.selector;
    const evidenceSelector = asset.action.evidenceSelector || asset.selector || selector;
    const before = await observeControlState(page, selector);
    const evidenceBefore = evidenceSelector === selector
      ? before
      : await observeControlState(page, evidenceSelector);
    const dialogConfirmation = asset.action.confirmDialog === true
      ? new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Local documentation confirmation did not open for ${selector}`)), 2000);
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
      })
      : null;
    debugCapturePhase(`${captureLabel}: local-state-click`);
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
    }, selector, asset.action.type, asset.guideId);
    debugCapturePhase(`${captureLabel}: local-state-settle`);
    if (dialogConfirmation) await dialogConfirmation;
    await new Promise((resolve) => setTimeout(resolve, asset.action.settleMs || 250));
    const after = await observeControlState(page, selector);
    const evidenceAfter = evidenceSelector === selector
      ? after
      : await observeControlState(page, evidenceSelector);
    interactions.push({
      type: asset.action.type,
      selector,
      status: 'performed',
      observed: true,
      before,
      after,
      evidence: {
        selector: evidenceSelector,
        before: evidenceBefore,
        after: evidenceAfter
      },
      changed: JSON.stringify(before) !== JSON.stringify(after)
        || JSON.stringify(evidenceBefore) !== JSON.stringify(evidenceAfter)
    });
  }
  return interactions;
}

async function prepareAdvancedTimerOverlay(page, baseUrl, asset, locale) {
  const setupRoute = '/plugins/advanced-timer/ui.html';
  const setupResponse = await page.goto(urlFor(baseUrl, setupRoute, locale), {
    waitUntil: 'domcontentloaded',
    timeout: TIMEOUT_MS
  });
  if (!setupResponse || setupResponse.status() >= 400) {
    throw new Error(`HTTP ${setupResponse ? setupResponse.status() : 'no response'} while preparing Advanced Timer overlay`);
  }
  await new Promise((resolve) => setTimeout(resolve, WAIT_AFTER_LOAD_MS));
  const interactions = await applySafeStepState(page, {
    guideId: asset.guideId,
    action: {
      type: 'run-local-preview',
      prepare: 'create-demo-timer',
      allowClick: true,
      clickSelector: '#timer-form button[type="submit"]',
      settleMs: 750
    }
  }, locale);
  const timerId = await page.evaluate(async () => {
    const response = await fetch('/api/advanced-timer/timers');
    const data = await response.json();
    const timer = data.timers?.find((candidate) => (
      candidate.name === 'LTTH docs countdown' && Number(candidate.initial_duration) === 90
    ));
    if (!data.success || !timer?.id) {
      throw new Error('Advanced Timer local documentation timer was not created');
    }
    return timer.id;
  });
  const overlayUrl = new URL(urlFor(baseUrl, asset.route, locale));
  overlayUrl.searchParams.set('timer', timerId);
  interactions.push({
    type: 'prepare',
    name: 'create-demo-timer-overlay',
    selector: '#timer-container',
    status: 'performed',
    observed: true,
    changed: Boolean(timerId),
    timerId
  });
  return {
    url: overlayUrl.toString(),
    interactions,
    navigations: [{ route: setupRoute, observed: true }],
    preparation: [
      { type: 'create-demo-timer', selector: '#timer-form button[type="submit"]', observed: true },
      { type: 'use-created-overlay-url', selector: '#timer-container', timerId, observed: true }
    ]
  };
}

async function prepareGoalsOverlay(page, baseUrl, asset, locale) {
  const setupRoute = '/goals/ui';
  const setupResponse = await page.goto(urlFor(baseUrl, setupRoute, locale), {
    waitUntil: 'domcontentloaded',
    timeout: TIMEOUT_MS
  });
  if (!setupResponse || setupResponse.status() >= 400) {
    throw new Error(`HTTP ${setupResponse ? setupResponse.status() : 'no response'} while preparing Goal overlay`);
  }
  await new Promise((resolve) => setTimeout(resolve, WAIT_AFTER_LOAD_MS));
  const interactions = await applySafeStepState(page, {
    guideId: asset.guideId,
    action: { prepare: 'open-goal-create-modal', preparationEvidenceSelector: '#goal-modal' }
  }, locale);
  const submitSelector = '#goal-form button[type="submit"]';
  const beforeSubmit = await observeControlState(page, submitSelector);
  await page.evaluate(() => {
    const name = document.getElementById('goal-name');
    const target = document.getElementById('goal-target');
    const form = document.getElementById('goal-form');
    if (!(name instanceof HTMLInputElement) || !(target instanceof HTMLInputElement) || !(form instanceof HTMLFormElement)) {
      throw new Error('Goal demo form is unavailable');
    }
    name.value = 'LTTH docs goal';
    target.value = '100';
    for (const field of [name, target]) {
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }
    form.requestSubmit();
  });
  const goalId = await page.waitForFunction(async () => {
    const response = await fetch('/api/goals');
    const data = await response.json();
    return data.goals?.find((goal) => goal.name === 'LTTH docs goal')?.id || false;
  }, { timeout: 5000 }).then((handle) => handle.jsonValue());
  const afterSubmit = await observeControlState(page, submitSelector);
  interactions.push({
    type: 'run-local-preview',
    selector: submitSelector,
    status: 'performed',
    observed: true,
    before: beforeSubmit,
    after: afterSubmit,
    changed: JSON.stringify(beforeSubmit) !== JSON.stringify(afterSubmit)
  });
  const overlayUrl = new URL(urlFor(baseUrl, asset.route, locale));
  overlayUrl.searchParams.set('id', goalId);
  interactions.push({
    type: 'prepare',
    name: 'create-demo-goal-overlay',
    selector: '#goal-container',
    status: 'performed',
    observed: true,
    changed: Boolean(goalId),
    goalId
  });
  return {
    url: overlayUrl.toString(),
    interactions,
    navigations: [{ route: setupRoute, observed: true }],
    preparation: [
      { type: 'create-demo-goal', selector: '#goal-form button[type="submit"]', observed: true },
      { type: 'use-created-overlay-url', selector: '#goal-container', goalId, observed: true }
    ]
  };
}

function screenshotClipForAnchor(viewport, anchorRect, crop = null) {
  const requestedWidth = crop?.width || 640;
  const requestedHeight = crop?.height || 560;
  const width = Math.min(viewport.clientWidth, requestedWidth);
  const height = Math.min(viewport.height, requestedHeight);
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
  // A browser page is reused inside one isolated plugin process. Console
  // evidence belongs to this workflow step only, never to a prior step.
  page.__docsCaptureConsoleErrors = [];
  page.__docsCaptureNetwork = [];
  page.__docsCaptureBlockedNetwork = [];
  page.__docsCaptureInteractions = [];
  const captureLabel = `${locale}/${asset.id}`;
  debugCapturePhase(`${captureLabel}: configure`);
  await page.setViewport(asset.viewport);
  // Every guide must run its shipped localization. Interactive Story uses its
  // own real `?demo=1` mode, which avoids its live status/config requests and
  // socket connection while retaining the fully localized product UI.
  await page.setJavaScriptEnabled(true);
  debugCapturePhase(`${captureLabel}: navigate`);
  const advancedTimerOverlay = asset.action && asset.action.prepare === 'create-demo-timer-overlay'
    ? await prepareAdvancedTimerOverlay(page, baseUrl, asset, locale)
    : null;
  const goalsOverlay = asset.action && asset.action.prepare === 'create-demo-goal-overlay'
    ? await prepareGoalsOverlay(page, baseUrl, asset, locale)
    : null;
  const prepareStoreAdmin = asset.action && asset.action.prepare === 'open-store-admin-view';
  if (prepareStoreAdmin) {
    await page.evaluateOnNewDocument(() => {
      sessionStorage.setItem('ltth_store_auth_signed_out', '1');
    });
  }
  const response = await page.goto(advancedTimerOverlay?.url || goalsOverlay?.url || urlFor(baseUrl, asset.route, locale), { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
  if (!response || response.status() >= 400) throw new Error(`HTTP ${response ? response.status() : 'no response'} for ${asset.route}`);
  // Store initialization automatically opens the external account bridge for
  // a fresh profile. Clear the local bridge session as soon as its shipped
  // dashboard scripts are available so the documented, real signed-out panel
  // can render before a browser navigation begins.
  const prepareImmediately = prepareStoreAdmin;
  const specialOverlayPreparation = Boolean(advancedTimerOverlay || goalsOverlay);
  page.__docsCaptureInteractions = [
    ...(advancedTimerOverlay?.interactions || []),
    ...(goalsOverlay?.interactions || [])
  ];
  if (prepareImmediately) {
    page.__docsCaptureInteractions.push(...await applySafeStepState(page, asset, locale));
  } else {
    await new Promise((resolve) => setTimeout(resolve, WAIT_AFTER_LOAD_MS));
  }
  debugCapturePhase(`${captureLabel}: apply-local-state`);
  if (!prepareImmediately && !specialOverlayPreparation) {
    page.__docsCaptureInteractions.push(...await applySafeStepState(page, asset, locale));
  }
  // Some shipped controls are created only after a real settings/preview
  // workflow. Run that workflow first, then let the generic tab helper reveal
  // a static parent pane if the anchor still needs it.
  const tabPreparation = await activateContainingTab(page, asset.selector);
  debugCapturePhase(`${captureLabel}: apply-locale`);
  // Some dashboard views load their own i18n client after the initial page
  // setup. Reapply the requested locale after a real navigation/modal action
  // and immediately before language evidence is recorded.
  await synchronizeCaptureLocale(page, locale);
  debugCapturePhase(`${captureLabel}: inspect-anchor`);
  const preparation = [...(advancedTimerOverlay?.preparation || []), ...(goalsOverlay?.preparation || []), tabPreparation].filter(Boolean);
  const focus = await assertRenderedAnchor(page, asset.selector);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const observedSelectors = [...new Set([
    asset.selector,
    asset.action?.inputSelector,
    ...asset.workflow.operations.map((operation) => operation.selector),
    ...asset.workflow.postconditions.map((condition) => condition.selector)
  ].filter(Boolean))];
  const state = await page.evaluate((lang, anchorSelector, selectors) => {
    const anchor = document.querySelector(anchorSelector);
    const rect = anchor && anchor.getBoundingClientRect();
    const controlState = (selector) => {
      const element = document.querySelector(selector);
      const controlRect = element && element.getBoundingClientRect();
      const style = element && getComputedStyle(element);
      const visible = Boolean(element && style && controlRect && style.display !== 'none' && style.visibility !== 'hidden' && controlRect.width >= 2 && controlRect.height >= 2);
      return {
        visible,
        text: (element?.innerText || element?.textContent || element?.value || element?.getAttribute('aria-label') || '').trim(),
        value: element && 'value' in element ? element.value : null,
        checked: element && 'checked' in element ? Boolean(element.checked) : null,
        overlay: Boolean(element && (element.matches('canvas, [data-overlay], .overlay, #overlay-root, #canvas-container') || element.querySelector('canvas, [data-overlay], .overlay, #overlay-root')))
      };
    };
    return {
      lang: document.documentElement.lang || document.documentElement.getAttribute('data-lang') || null,
      i18n: window.i18n && typeof window.i18n.getLocale === 'function' ? window.i18n.getLocale() : (window.I18n && window.I18n.currentLang) || document.documentElement.lang || null,
      theme: document.documentElement.getAttribute('data-theme') || null,
      route: `${location.pathname}${location.search}`,
      anchorText: (anchor?.innerText || anchor?.value || anchor?.getAttribute('aria-label') || '').trim(),
      anchorValue: anchor && 'value' in anchor ? anchor.value : null,
      anchorChecked: anchor && 'checked' in anchor ? Boolean(anchor.checked) : null,
      overlayVisible: Boolean(document.querySelector('canvas, [data-overlay], .overlay, #overlay-root')),
      controls: Object.fromEntries(selectors.map((selector) => {
        return [selector, controlState(selector)];
      })),
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
  }, locale, asset.selector, observedSelectors);
  debugCapturePhase(`${captureLabel}: verify-workflow`);
  if (state.lang !== locale) throw new Error(`Document language is ${state.lang || 'unset'}, expected ${locale}`);
  if (state.theme !== 'cid') throw new Error(`Theme is ${state.theme || 'unset'}, expected cid`);
  if (!state.anchorRect) throw new Error(`Capture anchor has no rendered geometry: ${asset.selector}`);
  const executedOperations = assertWorkflowOperationsExecuted({
    workflow: asset.workflow,
    state: {
      ...state,
      navigations: [
        ...(advancedTimerOverlay?.navigations || []),
        ...(goalsOverlay?.navigations || [])
      ]
    },
    interactions: page.__docsCaptureInteractions,
    preparation
  });
  const screenshotClip = screenshotClipForAnchor(state.viewport, state.anchorRect, asset.workflow.captureRule.imageCrop);
  const target = outputPath(asset, locale);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  await page.screenshot({ path: target, type: 'png', clip: screenshotClip });
  debugCapturePhase(`${captureLabel}: record-receipt`);
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
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const output = {
    locale,
    id: asset.id,
    guideId: asset.guideId,
    stepId: asset.stepId,
    path: path.relative(REPO_ROOT, target).replace(/\\/g, '/'),
    route: asset.route,
    selector: asset.selector,
    action: asset.action,
    workflow: asset.workflow,
    executedOperations,
    httpStatus: response.status(),
    fixture: asset.fixture,
    focus,
    preparation,
    state,
    screenshotClip,
    sha256,
    bytes: bytes.length
  };
  output.receipt = createCaptureReceipt({
    asset,
    locale,
    appVersion: APP_VERSION,
    screenshotPath: output.path,
    httpStatus: output.httpStatus,
    state,
    preparation,
    sha256,
    consoleErrors: page.__docsCaptureConsoleErrors,
    network: page.__docsCaptureNetwork,
    interactions: page.__docsCaptureInteractions
  });
  output.receipt.executedOperations = executedOperations;
  output.receipt.blockedNetwork = [...page.__docsCaptureBlockedNetwork];
  assertNoBlockedNetworkAttempts(output.receipt.blockedNetwork);
  const failedPostconditions = output.receipt.postconditions.filter((condition) => !condition.passed);
  if (failedPostconditions.length) {
    throw new Error(`Workflow postconditions failed for ${asset.guideId}/${asset.stepId}: ${JSON.stringify(failedPostconditions)}`);
  }
  return output;
}

async function captureFailureContext(page, label) {
  return readBoundedFailureContext(() => page.evaluate(() => {
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
  }), {
    label,
    timeoutMs: FAILURE_CONTEXT_TIMEOUT_MS
  });
}

async function captureDocs(spec, assets, locales) {
  const puppeteer = loadPuppeteer();
  const executablePath = browserExecutablePath();
  const outputs = [];
  const failures = [];
  const createCapturePage = async (browser, locale, label) => {
    const page = await runWithTimeout(() => browser.newPage(), {
      label: `creating capture page for ${label}`,
      timeoutMs: LIFECYCLE_TIMEOUT_MS
    });
    await runWithTimeout(() => configurePage(page, locale), {
      label: `configuring capture page for ${label}`,
      timeoutMs: LIFECYCLE_TIMEOUT_MS
    });
    await runWithTimeout(() => attachPluginAssetRewrite(page), {
      label: `configuring capture requests for ${label}`,
      timeoutMs: LIFECYCLE_TIMEOUT_MS
    });
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
      const guideLabel = `${locale}/${guideId}`;
      let app;
      let browser;
      let page;
      try {
        console.log(`Capturing ${guideLabel} (${guideAssets.length} steps)`);
        app = await startIsolatedApp(`${guideId}-${locale}`, guideId);
        browser = await runWithTimeout(() => puppeteer.launch({
          headless: 'new',
          ...(executablePath ? { executablePath } : {}),
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        }), {
          label: `starting capture browser for ${guideLabel}`,
          timeoutMs: LIFECYCLE_TIMEOUT_MS
        });
        page = await createCapturePage(browser, locale, guideLabel);
        for (const asset of guideAssets) {
          try {
            outputs.push(await withTimeout(captureAsset(page, app.baseUrl, asset, locale), `${locale}/${asset.id}`));
          } catch (error) {
            const timedOut = isCaptureTimeout(error);
            const context = timedOut ? [] : await captureFailureContext(page, `${locale}/${asset.id}`);
            const diagnostic = context.length ? ` Visible page message: ${context.join(' | ')}` : '';
            const startupLog = app?.getStartupLog?.() || '';
            const relevantLog = startupLog.split(/\r?\n/)
              .filter((line) => /plugin|config-import|error|failed/i.test(line))
              .slice(-30)
              .join(' | ');
            const startupDiagnostic = relevantLog ? ` Startup log: ${relevantLog}` : '';
            failures.push({ locale, id: asset.id, guideId, stepId: asset.stepId, route: asset.route, selector: asset.selector, error: `${error.message}${diagnostic}${startupDiagnostic}` });
            if (timedOut) {
              page = await recoverCapturePage({
                closePage: () => page.close(),
                createPage: () => createCapturePage(browser, locale, guideLabel),
                label: `${locale}/${asset.id}`,
                timeoutMs: LIFECYCLE_TIMEOUT_MS
              });
            }
          }
        }
      } catch (error) {
        for (const asset of guideAssets) failures.push({ locale, id: asset.id, guideId, stepId: asset.stepId, route: asset.route, selector: asset.selector, error: `Capture guide session failed: ${error.message}` });
      } finally {
        const cleanupErrors = [];
        if (page) {
          try {
            await closeCapturePage(() => page.close(), {
              label: guideLabel,
              timeoutMs: LIFECYCLE_TIMEOUT_MS
            });
          } catch (error) {
            cleanupErrors.push(error);
          }
        }
        if (browser) {
          try {
            await closeCaptureBrowser(browser, {
              label: guideLabel,
              timeoutMs: LIFECYCLE_TIMEOUT_MS
            });
          } catch (error) {
            cleanupErrors.push(error);
          }
        }
        if (app) {
          try {
            await stopIsolatedApp(app, guideLabel);
          } catch (error) {
            cleanupErrors.push(error);
          }
        }
        if (cleanupErrors.length) {
          const lifecycleError = cleanupErrors.map((error) => error.message).join(' | ');
          for (const asset of guideAssets) failures.push({ locale, id: asset.id, guideId, stepId: asset.stepId, route: asset.route, selector: asset.selector, error: `Capture lifecycle cleanup failed: ${lifecycleError}` });
        }
      }
    }
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
          await configurePage(page, locale);
          await attachPluginAssetRewrite(page);
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
  const expectedClipWidth = Math.min(
    output.state?.viewport?.clientWidth || 0,
    asset.workflow.captureRule.imageCrop?.width || 640
  );
  return output.guideId === asset.guideId
    && output.stepId === asset.stepId
    && output.route === asset.route
    && output.selector === asset.selector
    && JSON.stringify(output.action) === JSON.stringify(asset.action)
    && JSON.stringify(output.workflow) === JSON.stringify(asset.workflow)
    && JSON.stringify(output.receipt?.operations) === JSON.stringify(asset.workflow.operations)
    && Array.isArray(output.receipt?.executedOperations)
    && output.receipt.executedOperations.length === asset.workflow.operations.length
    && output.receipt.executedOperations.every((operation) => operation?.observed === true)
    && output.receipt?.postconditions?.every((condition) => condition.passed === true)
    && output.receipt?.schemaVersion === 2
    && Array.isArray(output.receipt?.network)
    && output.receipt.network.every((entry) => isAllowedCaptureNetworkUrl(entry.url))
    && Array.isArray(output.receipt?.blockedNetwork)
    && output.receipt.blockedNetwork.every((entry) => entry?.attempted === true
      && entry.disposition === 'blocked'
      && !isAllowedCaptureNetworkUrl(entry.url))
    && Array.isArray(output.receipt?.console)
        && output.receipt.console.length === 0
        && output.focus?.selector === asset.selector
        && output.screenshotClip
        && output.screenshotClip.width === expectedClipWidth
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
