const fs = require('fs');
const path = require('path');

describe('AnimazingPal live-host configuration UI', () => {
  const html = fs.readFileSync(path.join(__dirname, '../plugins/animazingpal/ui.html'), 'utf8');
  const uiScript = fs.readFileSync(path.join(__dirname, '../plugins/animazingpal/ui.js'), 'utf8');
  const script = fs.readFileSync(path.join(__dirname, '../plugins/animazingpal/live-host-ui.js'), 'utf8');

  test('exposes the live-host tab and section controls', () => {
    expect(html).toContain('data-tab="livehost"');
    expect(html).toContain('id="tab-livehost"');
    expect(html).toContain('/plugins/animazingpal/live-host-ui.js');
    expect(script).toContain('data-livehost-save');
    expect(script).toContain('data-livehost-reset');
    expect(script).toContain('Sicherer Livetest');
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
    expect(script).toContain('viewerMemory');
    expect(script).toContain('avatarBundles');
  });

  test('gift mappings use catalog and action dropdowns instead of prompt-only entry', () => {
    expect(html).toContain('id="giftMappingGift"');
    expect(html).toContain('id="giftMappingActionType"');
    expect(html).toContain('id="giftMappingActionValue"');
    expect(script).toContain('/api/gift-catalog');
    expect(script).toContain('populateGiftMappingForm');
    expect(script).not.toContain("prompt('TikTok Gift-Name");
  });

  test('ChatPal tab is not exposed in the standalone host UI', () => {
    expect(html).not.toContain('data-tab="chatpal"');
    expect(html).not.toContain('id="tab-chatpal"');
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
    expect(uiScript).toContain('playAnimazingPalTTS');
    expect(uiScript).toContain('window.TTSOutputRouter.routeAudioElement');
  });

  test('live-host UI exposes operator diagnostics for audio and runtime health', () => {
    expect(script).toContain('renderAudioRoutingStatus');
    expect(script).toContain('renderRuntimeDiagnostics');
    expect(script).toContain('liveHostAudioRoutingStatus');
    expect(script).toContain('liveHostRuntimeDiagnostics');
    expect(script).toContain('/api/tts/status');
    expect(script).toContain('/api/tts/queue');
    expect(script).toContain('setSinkId nicht verfügbar');
  });
});
