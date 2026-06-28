const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { buildLiveHostDefaults } = require('../plugins/animazingpal/brain/live-host-config');

describe('AnimazingPal live-host configuration UI', () => {
  const html = fs.readFileSync(path.join(__dirname, '../plugins/animazingpal/ui.html'), 'utf8');
  const uiScript = fs.readFileSync(path.join(__dirname, '../plugins/animazingpal/ui.js'), 'utf8');
  const ttsScript = fs.readFileSync(path.join(__dirname, '../plugins/tts/main.js'), 'utf8');
  const script = fs.readFileSync(path.join(__dirname, '../plugins/animazingpal/live-host-ui.js'), 'utf8');

  test('exposes the live-host tab and section controls', () => {
    expect(html).toContain('data-tab="livehost"');
    expect(html).toContain('id="tab-livehost"');
    expect(html).toContain('/plugins/animazingpal/live-host-ui.js');
    expect(script).toContain('data-livehost-save');
    expect(script).toContain('data-livehost-reset');
    expect(script).toContain('24/7 Produktionsprofil');
  });

  test('covers providers, events, viewer memory, voices, audio and avatar bundles', () => {
    for (const provider of ['openai', 'gemini', 'openrouter', 'ollama']) {
      expect(script).toContain(provider);
    }
    for (const event of ['chat', 'gift', 'follow', 'share', 'like', 'subscribe', 'join']) {
      expect(script).toContain(event);
    }
    expect(script).toContain('/api/tts/voices?engine=fishaudio');
    expect(script).toContain('/api/gift-catalog');
    expect(script).toContain('/api/animazingpal/live-host/audio-devices');
    expect(script).toContain('/api/animazingpal/live-host/source/connect');
    expect(script).toContain('navigator.mediaDevices.enumerateDevices');
    expect(script).toContain('navigator.mediaDevices.selectAudioOutput');
    expect(script).toContain('data-pick-output-device');
    expect(script).toContain('animaze.audioOutputDeviceId');
    expect(script).toContain('animaze.audioOutputDeviceLabel');
    expect(script).toContain('Animaze-Ausgabe / Virtual Cable');
    expect(script).toContain('Browser-Fallback / Monitoring');
    expect(script).toContain('viewerMemory');
    expect(script).toContain('avatarBundles');
    expect(script).toContain('response.queueWarnRatio');
  });

  test('every ordinary backend default has a matching editor control', () => {
    const defaults = buildLiveHostDefaults();
    const internal = new Set([
      'source.readOnly', 'tts.engine', 'audio.outputDeviceLabel',
      'viewerMemory.allowedProfileFields', 'avatarBundles', 'activeAvatarBundleId'
    ]);
    const leaves = [];
    const visit = (value, prefix = '') => {
      if (Array.isArray(value) || value === null || typeof value !== 'object') {
        leaves.push(prefix);
        return;
      }
      for (const [key, child] of Object.entries(value)) visit(child, prefix ? `${prefix}.${key}` : key);
    };
    visit(defaults);

    for (const field of leaves.filter(field => !internal.has(field) && !field.startsWith('providers.') && !field.startsWith('events.'))) {
      expect(script).toContain(`'${field}'`);
    }
    for (const field of Object.keys(defaults.providers.ollama)) {
      expect(script).toContain(`\`${'${base}.'}${field}\``);
    }
    for (const field of Object.keys(defaults.events.chat)) {
      expect(script).toContain(`\`${'${base}.'}${field}\``);
    }
  });

  test('gift mappings use catalog and action dropdowns instead of prompt-only entry', () => {
    expect(html).toContain('id="giftMappingGift"');
    expect(html).toContain('id="giftMappingActionType"');
    expect(html).toContain('id="giftMappingActionValue"');
    expect(script).toContain('/api/gift-catalog');
    expect(script).toContain('populateGiftMappingForm');
    expect(script).not.toContain("prompt('TikTok Gift-Name");
  });

  test('standalone production UI has no visible or wired ChatPal controls', () => {
    expect(html).not.toContain('data-tab="chatpal"');
    expect(html).not.toContain('id="tab-chatpal"');
    expect(html).not.toContain('id="chatpalMessage"');
    expect(html).not.toContain('id="chatpalUseEcho"');
    expect(html).not.toContain('data-action="send-chatpal"');
    expect(html).not.toContain('TikTok Chat an ChatPal weiterleiten');
    expect(html).not.toContain('ChatPal Nachricht (optional)');
    expect(uiScript).not.toContain('sendChatpalMessage');
    expect(uiScript).not.toContain('updateChatSettings');
  });

  test('UI presents one canonical production activation control', () => {
    expect((script.match(/input\('enabled'/g) || [])).toHaveLength(1);
    expect(script).toContain('data-livehost-save="enabled"');
    expect(script).toContain('data-preset="production-24-7"');
    expect(script).toContain('24/7 Produktionsprofil');
    expect(script).toContain('Pflicht-Setup');
    expect(html).toContain('id="settingsPort" value="9000"');
  });

  test('avatar bundle editor preserves all backend-supported mapping fields', () => {
    expect(script).toContain('id="bundlePriority"');
    expect(script).toContain('id="bundleGiftNames"');
    expect(script).toContain('priority: Number(document.getElementById(\'bundlePriority\')');
    expect(script).toContain('giftNames:');
    expect(script).toContain("{ value: 'emote', label: 'Emote bevorzugen' }");
  });

  test('keeps the main tab bar readable on narrow screens', () => {
    expect(html).toContain('data-animazingpal-tabs');
    expect(html).toContain('overflow-x-auto');
    expect(html).toContain('flex-wrap');
  });

  test('never attempts to read stored API keys back into inputs', () => {
    expect(script).toContain('apiKeyConfigured');
    expect(script).not.toContain('value="${provider.apiKey}');
  });

  test('standalone UI consumes TTS playback events and routes audio output', () => {
    expect(html).toContain('id="animazingpal-tts-audio"');
    expect(html).toContain('/js/audio-unlock.js');
    expect(html).toContain('/js/tts-output-router.js');
    expect(uiScript).toContain("socket.on('tts:play'");
    expect(uiScript).toContain("socket.on('tts:stream:chunk'");
    expect(uiScript).toContain("socket.on('tts:stream:end'");
    expect(uiScript).toContain("socket.on('tts:playback:error'");
    expect(uiScript).toContain('playAnimazingPalTTS');
    expect(uiScript).toContain('recordAnimazingPalTTSPlayback');
    expect(uiScript).toContain('window.animazingPalTTSPlaybackState');
    expect(uiScript).toContain('window.TTSOutputRouter.routeAudioElement');
    expect(uiScript).toContain('lastRouting');
    expect(script).toContain('tts.probeStaleMs');
    expect(uiScript).toContain('ALLOWED_ANIMAZINGPAL_TTS_SOURCES');
    expect(uiScript).toContain('isAnimazingPalTTSSource(data)');
    expect(uiScript).toContain("if (!isAnimazingPalTTSSource(data)) return;");
  });

  test('animazingpal UI filters incoming TTS to own speech sources', () => {
    expect(ttsScript).toContain("source: item.source || 'unknown'");
    expect(uiScript).toContain('animazingpal');
    expect(uiScript).toContain('animazingpal-host-speech-output');
  });

  test('live-host UI exposes operator diagnostics for audio and runtime health', () => {
    expect(script).toContain('renderAudioRoutingStatus');
    expect(script).toContain('renderRuntimeDiagnostics');
    expect(script).toContain('liveHostAudioRoutingStatus');
    expect(script).toContain('liveHostRuntimeDiagnostics');
    expect(script).toContain('/api/tts/status');
    expect(script).toContain('/api/tts/queue');
    expect(script).toContain('animazingPalTTSPlaybackState');
    expect(script).toContain('animazingpal:tts-playback-state');
    expect(script).toContain('lastError');
    expect(script).toContain('setSinkId nicht verfügbar');
  });

  test('live-host UI exposes a preflight check before unattended operation', () => {
    expect(script).toContain('runPreflight');
    expect(script).toContain('/api/animazingpal/live-host/preflight');
    expect(script).toContain('data-preflight-check');
    expect(script).toContain('liveHostPreflightStatus');
    expect(script).toContain('sinkSupported');
    expect(script).toContain('audioUnlocked');
    expect(script).toContain('configuredOutputDeviceAvailable');
    expect(script).toContain('playback: window.animazingPalTTSPlaybackState');
    expect(script).toContain('isConfiguredOutputDeviceAvailable');
  });

  test('live-host UI exposes a manual Animaze movement probe', () => {
    expect(script).toContain('data-movement-test');
    expect(script).toContain('/api/animazingpal/live-host/movement-test');
    expect(script).toContain('Animaze Bewegung testen');
    expect(script).toContain('lastMovementTest');
    expect(script).toContain('diagnostics.browserHeartbeatStaleMs');
    expect(script).toContain('diagnostics.movementProbeStaleMs');
  });

  test('live-host UI exposes and binds a TTS pipeline probe', () => {
    expect(script).toContain('data-tts-probe');
    expect(script).toContain('runTtsProbe');
    expect(script).toContain('/api/animazingpal/live-host/tts-probe');
    expect(script).toContain('lastTtsProbe');
  });

  test('live-host UI exposes configurable automatic idle motion', () => {
    expect(script).toContain('renderIdleMotion');
    expect(script).toContain('idleMotion.enabled');
    expect(script).toContain('idleMotion.intervalMs');
    expect(script).toContain('idleMotion.jitterMs');
    expect(script).toContain('idleMotion.includeEmotes');
    expect(script).toContain('idleMotion.alternateActionTypes');
    expect(script).toContain('Idle/Special/Emote rotieren');
    expect(script).toContain('idleMotion.preferNames');
    expect(script).toContain('idleMotion.avoidNames');
    expect(script).toContain('lastIdleMotion');
    expect(script).toContain('idleMotionSkipped');
  });

  test('avatar dropdown normalizes Animaze friendlyName and itemName without undefined labels', () => {
    expect(script).toContain("['modelID', 'itemName', 'id', 'name', 'friendlyName', 'modelName']");
    expect(script).toContain("['modelName', 'friendlyName', 'name', 'itemName', 'id', 'modelID']");
    expect(script).toContain('firstPresentAvatarField');
    expect(script).toContain('\\b(undefined|null)\\b|\\[object Object\\]');
    expect(script).toContain('Unbenannter Avatar');
    expect(script).not.toContain('${platform}: ${avatar.modelName || avatar.name || avatar.id}');
  });

  test('avatar dropdown does not render Animaze undefined labels from malformed avatar data', async () => {
    const dom = new JSDOM('<!doctype html><button data-tab="livehost"></button><div id="liveHostSettings"></div>', {
      runScripts: 'outside-only',
      url: 'http://127.0.0.1:3000/animazingpal/ui'
    });

    const responses = {
      '/api/animazingpal/live-host/config': { config: { providers: {}, avatarBundles: [], avatarSwitch: {}, events: {}, audio: {}, diagnostics: {} } },
      '/api/tts/voices?engine=fishaudio': { voices: {} },
      '/api/gift-catalog': { catalog: [] },
      '/api/animazingpal/status': {
        activePlatform: 'animaze',
        animazeData: {
          avatars: [{ modelID: 'avatar-42', modelName: 'animaze undefined' }]
        }
      },
      '/api/animazingpal/brain/personalities': { personalities: [] },
      '/api/tts/status': {},
      '/api/tts/queue': {},
      '/api/animazingpal/live-host/audio-devices': { devices: [] }
    };

    dom.window.fetch = jest.fn(async url => ({
      ok: true,
      json: async () => responses[String(url)] || {}
    }));
    dom.window.setInterval = jest.fn(() => 1);
    dom.window.clearInterval = jest.fn();
    dom.window.navigator.mediaDevices = { enumerateDevices: jest.fn(async () => []) };
    dom.window.eval(script);
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));

    dom.window.document.querySelector('[data-tab="livehost"]').click();
    await new Promise(resolve => setImmediate(resolve));

    const avatarOptions = [...dom.window.document.querySelectorAll('#bundleAvatar option')].map(option => option.textContent);
    expect(avatarOptions).toContain('animaze: avatar-42');
    expect(avatarOptions.join('\n')).not.toMatch(/undefined/i);
  });

  test('avatar dropdown sanitizes malformed platform labels', async () => {
    const dom = new JSDOM('<!doctype html><button data-tab="livehost"></button><div id="liveHostSettings"></div>', {
      runScripts: 'outside-only',
      url: 'http://127.0.0.1:3000/animazingpal/ui'
    });

    const responses = {
      '/api/animazingpal/live-host/config': { config: { providers: {}, avatarBundles: [], avatarSwitch: {}, events: {}, audio: {}, diagnostics: {} } },
      '/api/tts/voices?engine=fishaudio': { voices: {} },
      '/api/gift-catalog': { catalog: [] },
      '/api/animazingpal/status': {
        activePlatform: 'animaze undefined',
        animazeData: {
          avatars: [{ modelID: 'avatar-42', modelName: 'Test Avatar' }]
        }
      },
      '/api/animazingpal/brain/personalities': { personalities: [] },
      '/api/tts/status': {},
      '/api/tts/queue': {},
      '/api/animazingpal/live-host/audio-devices': { devices: [] }
    };

    dom.window.fetch = jest.fn(async url => ({
      ok: true,
      json: async () => responses[String(url)] || {}
    }));
    dom.window.setInterval = jest.fn(() => 1);
    dom.window.clearInterval = jest.fn();
    dom.window.navigator.mediaDevices = { enumerateDevices: jest.fn(async () => []) };
    dom.window.eval(script);
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));

    dom.window.document.querySelector('[data-tab="livehost"]').click();
    await new Promise(resolve => setImmediate(resolve));

    const avatarOptions = [...dom.window.document.querySelectorAll('#bundleAvatar option')].map(option => option.textContent);
    expect(avatarOptions).toContain('animaze: Test Avatar');
    expect(avatarOptions.join('\n')).not.toMatch(/undefined/i);
  });

  test('live-host UI refreshes runtime health continuously for unattended operation', () => {
    expect(script).toContain('LIVE_HOST_HEALTH_REFRESH_MS');
    expect(script).toContain('refreshLiveHostHealth');
    expect(script).toContain('startLiveHostHealthRefresh');
    expect(script).toContain('setInterval(() => refreshLiveHostHealth()');
    expect(script).toContain('data-refresh-livehost-health');
    expect(script).toContain('document.visibilityState');
    expect(script).toContain('lastHealthAt');
  });

  test('live-host UI sends browser heartbeats for unattended audio routing', () => {
    expect(script).toContain('sendBrowserHeartbeat');
    expect(script).toContain('/api/animazingpal/live-host/browser-heartbeat');
    expect(script).toContain('browserHeartbeat');
    expect(script).toContain('Browser-Host');
    expect(script).toContain('Standalone-Tab offen lassen');
    expect(script).toContain('await sendBrowserHeartbeat()');
  });

  test('live-host UI surfaces TikTok source watchdog state', () => {
    expect(script).toContain('sourceStatus');
    expect(script).toContain('sourceEventStatus');
    expect(script).toContain('source.watchdogIntervalMs');
    expect(script).toContain('source.eventStaleMs');
    expect(script).toContain('source.reconnectOnEventStale');
    expect(script).toContain('TikTok-Quelle');
    expect(script).toContain('TikTok-Events');
    expect(script).toContain('connectedToSource');
    expect(script).toContain('lastReconnectError');
  });

  test('live-host UI surfaces last event outcome diagnostics', () => {
    expect(script).toContain('lastEventResult');
    expect(script).toContain('Letztes Host-Event');
    expect(script).toContain('response.silenceWarnAfterEvents');
    expect(script).toContain('Silence-Warnung nach Events');
    expect(script).toContain('processedEvents');
    expect(script).toContain('respondedEvents');
    expect(script).toContain('skippedEvents');
  });

  test('Animaze reconnect settings explain unlimited unattended retries', () => {
    expect(html).toContain('0 = unbegrenzt');
  });
});
