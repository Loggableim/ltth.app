(function () {
  'use strict';

  const PROVIDERS = ['openai', 'gemini', 'openrouter', 'ollama'];
  const EVENTS = ['chat', 'gift', 'follow', 'share', 'like', 'subscribe', 'join'];
  const PROFILE_FIELDS = ['display_name', 'language', 'tags', 'is_vip', 'vip_tier', 'total_visits', 'total_comments', 'total_gifts_sent', 'total_coins_spent'];
  const LIVE_HOST_HEALTH_REFRESH_MS = 10000;
  const state = {
    config: null,
    voices: [],
    gifts: [],
    avatars: [],
    personalities: [],
    devices: [],
    inputDevices: [],
    asrStatus: {},
    status: {},
    ttsStatus: {},
    ttsQueue: {},
    preflight: null,
    greetingWarmup: {
      running: false,
      lastResult: null,
      lastError: null
    },
    healthTimer: null,
    healthRefreshing: false,
    lastHealthAt: null,
    loaded: false,
    hostAsr: {
      recording: false,
      stream: null,
      recorder: null,
      audioContext: null,
      sourceNode: null,
      processorNode: null,
      wavChunks: [],
      wavSampleRate: 16000,
      segmentTimer: null,
      lastTranscript: null,
      lastUpload: null,
      lastSignal: null,
      lastSkip: null,
      lastError: null
    }
  };

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  function get(path, fallback = '') {
    let value = state.config;
    for (const part of path.split('.')) value = value?.[part];
    return value ?? fallback;
  }

  function set(target, path, value) {
    const parts = path.split('.');
    const leaf = parts.pop();
    let cursor = target;
    for (const part of parts) cursor = cursor[part] ||= {};
    cursor[leaf] = value;
  }

  function input(path, label, options = {}) {
    const type = options.type || 'text';
    const value = get(path, options.fallback ?? '');
    if (type === 'checkbox') {
      return `<label class="flex items-center gap-2"><input type="checkbox" data-lh="${path}" ${value ? 'checked' : ''}><span>${escapeHtml(label)}</span></label>`;
    }
    if (type === 'select') {
      const choices = options.options || [];
      return `<label class="block"><span class="text-gray-400 text-sm">${escapeHtml(label)}</span><select class="select" data-lh="${path}">${choices.map(choice => {
        const item = typeof choice === 'string' ? { value: choice, label: choice } : choice;
        return `<option value="${escapeHtml(item.value)}" ${String(value) === String(item.value) ? 'selected' : ''}>${escapeHtml(item.label)}</option>`;
      }).join('')}</select></label>`;
    }
    const attrs = ['min', 'max', 'step', 'placeholder'].filter(key => options[key] !== undefined)
      .map(key => `${key}="${escapeHtml(options[key])}"`).join(' ');
    return `<label class="block"><span class="text-gray-400 text-sm">${escapeHtml(label)}</span><input class="input" type="${type}" data-lh="${path}" value="${escapeHtml(type === 'password' ? '' : value)}" ${attrs}></label>`;
  }

  function textarea(path, label, rows = 3) {
    return `<label class="block"><span class="text-gray-400 text-sm">${escapeHtml(label)}</span><textarea class="input" rows="${rows}" data-lh="${path}">${escapeHtml(get(path))}</textarea></label>`;
  }

  function actions(section) {
    return `<div class="flex gap-2 mt-4"><button class="btn btn-primary" data-livehost-save="${section}">Speichern</button><button class="btn btn-secondary" data-livehost-reset="${section}">Bereich zurücksetzen</button><span class="text-sm text-gray-400 self-center" data-validation="${section}"></span></div>`;
  }

  function providerCard(providerName) {
    const base = `providers.${providerName}`;
    const configured = get(`${base}.apiKeyConfigured`, false);
    return `<details class="card mt-3" ${state.config.provider === providerName ? 'open' : ''}>
      <summary class="font-bold cursor-pointer uppercase">${providerName} ${configured ? '• Key konfiguriert' : '• kein Key'}</summary>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
        ${input(`${base}.model`, 'Modell')}${input(`${base}.baseUrl`, 'Base-URL')}
        ${input(`${base}.apiKey`, 'API-Key', { type: 'password', placeholder: configured ? 'Konfiguriert – leer lassen zum Behalten' : 'API-Key' })}
        ${input(`${base}.timeoutMs`, 'Timeout (ms)', { type: 'number', min: 1000, max: 120000 })}
        ${input(`${base}.maxRetries`, 'Retries', { type: 'number', min: 0, max: 10 })}
        ${input(`${base}.retryBackoffMs`, 'Backoff (ms)', { type: 'number', min: 0, max: 30000 })}
        ${input(`${base}.temperature`, 'Temperature', { type: 'number', min: 0, max: 2, step: 0.05 })}
        ${input(`${base}.maxResponseTokens`, 'Max Tokens', { type: 'number', min: 16, max: 4096 })}
        ${input(`${base}.presencePenalty`, 'Presence Penalty', { type: 'number', min: -2, max: 2, step: 0.1 })}
        ${input(`${base}.frequencyPenalty`, 'Frequency Penalty', { type: 'number', min: -2, max: 2, step: 0.1 })}
        ${input(`${base}.thinking`, 'Thinking-Modus', { type: 'checkbox' })}
        <button class="btn btn-secondary" data-clear-key="${providerName}">API-Key explizit löschen</button>
      </div>
    </details>`;
  }

  function eventCard(type) {
    const base = `events.${type}`;
    return `<details class="card" ${['chat', 'gift'].includes(type) ? 'open' : ''}><summary class="font-bold cursor-pointer uppercase">${type}</summary>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
        ${input(`${base}.enabled`, 'Aktiv', { type: 'checkbox' })}${input(`${base}.brainEnabled`, 'Brain-Antwort', { type: 'checkbox' })}
        ${input(`${base}.templateEnabled`, 'Feste Vorlage', { type: 'checkbox' })}${input(`${base}.avatarActionEnabled`, 'Avataraktion', { type: 'checkbox' })}
        ${input(`${base}.probability`, 'Wahrscheinlichkeit 0–1', { type: 'number', min: 0, max: 1, step: 0.01 })}
        ${input(`${base}.cooldownMs`, 'Cooldown (ms)', { type: 'number', min: 0, max: 3600000 })}
        ${input(`${base}.priority`, 'Priorität 0–100', { type: 'number', min: 0, max: 100 })}
        ${input(`${base}.minCoins`, 'Minimum Coins', { type: 'number', min: 0 })}
        ${input(`${base}.minLikes`, 'Minimum Likes', { type: 'number', min: 0 })}
        ${input(`${base}.minQuantity`, 'Minimum Anzahl', { type: 'number', min: 1 })}
        ${input(`${base}.voiceId`, 'Fish-Stimme', { type: 'select', options: voiceOptions() })}
        ${input(`${base}.emotion`, 'Emotion')}${input(`${base}.pitch`, 'Pitch', { type: 'number', min: -12, max: 12, step: 0.1 })}
        ${input(`${base}.volume`, 'Lautstärke', { type: 'number', min: 0, max: 100 })}${input(`${base}.speed`, 'Tempo', { type: 'number', min: 0.5, max: 2, step: 0.05 })}
      </div><div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">${textarea(`${base}.prompt`, 'Eigener Prompt')}${textarea(`${base}.template`, 'Text-Template')}</div></details>`;
  }

  function voiceOptions() {
    return [{ value: '', label: 'Globale Host-Stimme' }, ...state.voices.map(voice => ({ value: voice.id, label: voice.name }))];
  }

  function populateGiftMappingForm(selectId = 'giftMappingGift') {
    const select = document.getElementById(selectId);
    if (!select) return;
    const selected = select.value;
    select.innerHTML = '<option value="">Gift aus Katalog wÃ¤hlen...</option>';
    state.gifts.forEach(gift => {
      const option = document.createElement('option');
      option.value = gift.id || gift.name;
      option.textContent = `${gift.name || gift.id}${gift.id ? ` (#${gift.id})` : ''}`;
      option.dataset.giftName = gift.name || '';
      select.appendChild(option);
    });
    if ([...select.options].some(option => option.value === selected)) select.value = selected;
  }

  function deviceOptions() {
    const options = [
      { value: '', label: 'Standardgerät' },
      ...state.devices.map(device => ({
        value: device.source === 'system' ? `system:${device.deviceId}` : device.deviceId,
        label: `${device.label || device.deviceId}${device.source === 'system' ? ' (System-Fallback)' : ''}`
      }))
    ];
    const configuredId = get('audio.outputDeviceId');
    if (configuredId && !options.some(option => option.value === configuredId)) {
      options.splice(1, 0, {
        value: configuredId,
        label: `${get('audio.outputDeviceLabel') || configuredId} (nicht freigegeben / neu auswählen)`
      });
    }
    return options;
  }

  function hostInputOptions() {
    const options = [
      { value: '', label: 'Browser-Standardmikrofon' },
      ...state.inputDevices.map(device => ({
        value: device.deviceId,
        label: device.label || device.deviceId
      }))
    ];
    const configuredId = get('asr.deviceId');
    if (configuredId && !options.some(option => option.value === configuredId)) {
      options.splice(1, 0, {
        value: configuredId,
        label: `${get('asr.deviceLabel') || configuredId} (nicht freigegeben / neu auswaehlen)`
      });
    }
    return options;
  }

  function isUnsafeHostMic(device = {}) {
    const label = String(device.label || '').toLocaleLowerCase();
    return /\b(cable|vb-audio|monitor|loopback|stereo mix|wasapi|output|speaker|lautsprecher)\b/.test(label);
  }

  function supportsSinkId() {
    return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
  }

  function renderAudioRoutingStatus() {
    const outputLabel = get('audio.outputDeviceLabel') || 'Windows-Standardgerät';
    const outputId = get('audio.outputDeviceId');
    const sinkSupported = supportsSinkId();
    const ttsStatus = state.ttsStatus.status || state.ttsStatus;
    const ttsReady = ttsStatus.initialized !== false;
    const ttsEngine = ttsStatus.defaultEngine || ttsStatus.config?.defaultEngine || 'unbekannt';
    const queueSize = state.ttsQueue.queue?.size ?? state.ttsQueue.size ?? state.ttsQueue.queueSize ?? 0;
    const currentText = state.ttsQueue.queue?.currentItem?.text || state.ttsQueue.currentItem?.text || '';
    const playback = window.animazingPalTTSPlaybackState || {};
    const lastRouting = playback.lastRouting || {};
    const lastError = playback.lastError || '';
    const sinkClass = sinkSupported ? 'text-green-400' : 'text-yellow-300';
    const routingHint = sinkSupported
      ? 'Browser kann das gespeicherte Ausgabegerät direkt ansteuern.'
      : 'setSinkId nicht verfügbar: Audio läuft über das Windows-Standardgerät. Setze Windows-Standardausgabe auf CABLE Input oder nutze Chrome/Edge mit Audiogerätefreigabe.';

    return `<div id="liveHostAudioRoutingStatus" class="rounded-lg border border-gray-700 bg-gray-900/70 p-3 text-sm">
      <div class="font-semibold mb-2">Audio-Betriebsstatus</div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div>Fish.audio: <strong class="${ttsReady ? 'text-green-400' : 'text-red-400'}">${ttsReady ? 'bereit' : 'nicht bereit'}</strong> (${escapeHtml(ttsEngine)})</div>
        <div>Ausgabe: <strong>${escapeHtml(outputLabel)}</strong>${outputId ? '' : ' (Default)'}</div>
        <div>setSinkId: <strong class="${sinkClass}">${sinkSupported ? 'verfügbar' : 'nicht verfügbar'}</strong></div>
        <div>TTS-Queue: <strong>${escapeHtml(queueSize)}</strong>${currentText ? ` · ${escapeHtml(String(currentText).slice(0, 80))}` : ''}</div>
        <div>Browser-Playback: <strong class="${lastError ? 'text-red-400' : 'text-green-400'}">${escapeHtml(playback.status || 'idle')}</strong></div>
        <div>Letztes Routing: <strong class="${lastRouting.routed === false ? 'text-yellow-300' : 'text-gray-200'}">${lastRouting.routed === false ? 'nicht geroutet' : lastRouting.routed === true ? 'geroutet' : 'unbekannt'}</strong></div>
      </div>
      ${lastError ? `<p class="text-xs text-red-300 mt-2">Letzter Browser-TTS-Fehler: ${escapeHtml(lastError)}</p>` : ''}
      ${lastRouting.reason ? `<p class="text-xs text-yellow-300 mt-2">Routing-Hinweis: ${escapeHtml(lastRouting.reason)}</p>` : ''}
      <p class="text-xs text-gray-400 mt-2">${escapeHtml(routingHint)}</p>
    </div>`;
  }

  function renderRuntimeDiagnostics() {
    const runtime = state.status.liveHostRuntime || {};
    const diagnostics = runtime.diagnostics || {};
    const movement = diagnostics.lastMovementTest || null;
    const idleMotion = diagnostics.lastIdleMotion || null;
    const ttsProbe = diagnostics.lastTtsProbe || null;
    const lastEventResult = diagnostics.lastEventResult || null;
    const browserHeartbeat = runtime.browserHeartbeat || {};
    const sourceStatus = runtime.sourceStatus || {};
    const sourceEventStatus = runtime.sourceEventStatus || {};
    const lastHealth = state.lastHealthAt ? new Date(state.lastHealthAt).toLocaleTimeString() : 'noch nicht aktualisiert';
    return `<div id="liveHostRuntimeDiagnostics" class="rounded-lg border border-gray-700 bg-gray-900/70 p-3 text-sm mt-3">
      <div class="flex flex-wrap items-center gap-2 mb-2">
        <div class="font-semibold flex-1">24/7 Runtime-Schutz</div>
        <span class="text-xs text-gray-400">Health: ${escapeHtml(lastHealth)}</span>
        <button class="btn btn-secondary btn-sm" data-refresh-livehost-health>Health aktualisieren</button>
        <button class="btn btn-secondary btn-sm" data-movement-test>Animaze Bewegung testen</button>
        <button class="btn btn-secondary btn-sm" data-tts-probe>TTS Probe</button>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-4 gap-2">
        <div>Speaking: <strong>${runtime.speaking ? 'ja' : 'nein'}</strong></div>
        <div>Animaze: <strong class="${runtime.animazeConnected ? 'text-green-400' : 'text-red-400'}">${runtime.animazeConnected ? 'verbunden' : 'getrennt'}</strong></div>
        <div>Reconnect: <strong>${runtime.animazeReconnectScheduled ? `geplant (${runtime.animazeReconnectAttempts || 0})` : 'nein'}</strong></div>
        <div>Slots/Minute: <strong>${escapeHtml(runtime.responseSlotsUsedLastMinute ?? 0)}</strong></div>
        <div>Dedupe-Cache: <strong>${escapeHtml(runtime.dedupeCacheSize ?? 0)}</strong></div>
        <div>Deduped/Rate-limited: <strong>${escapeHtml(diagnostics.dedupedEvents ?? 0)} / ${escapeHtml(diagnostics.rateLimitedResponses ?? 0)}</strong></div>
        <div>Events Host/Speak/Skip: <strong>${escapeHtml(diagnostics.processedEvents ?? 0)} / ${escapeHtml(diagnostics.respondedEvents ?? 0)} / ${escapeHtml(diagnostics.skippedEvents ?? 0)}</strong></div>
        <div>Idle-Skips: <strong>${escapeHtml(diagnostics.idleMotionSkipped ?? 0)}</strong></div>
        <div>Browser-Host: <strong class="${browserHeartbeat.present && !browserHeartbeat.stale ? 'text-green-400' : 'text-red-300'}">${browserHeartbeat.present ? (browserHeartbeat.stale ? 'stale' : 'aktiv') : 'unbekannt'}</strong></div>
        <div>TikTok-Quelle: <strong class="${sourceStatus.connectedToSource ? 'text-green-400' : sourceStatus.autoConnect ? 'text-yellow-300' : 'text-red-300'}">${sourceStatus.connectedToSource ? 'verbunden' : sourceStatus.autoConnect ? 'watchdog' : 'getrennt'}</strong></div>
        <div>TikTok-Events: <strong class="${sourceEventStatus.seen && !sourceEventStatus.stale ? 'text-green-400' : 'text-yellow-300'}">${sourceEventStatus.seen ? (sourceEventStatus.stale ? 'stale' : 'aktiv') : 'noch keine'}</strong></div>
      </div>
      ${browserHeartbeat.present ? `<p class="text-xs ${browserHeartbeat.stale ? 'text-red-300' : 'text-gray-400'} mt-2">Browser-Heartbeat: ${escapeHtml(browserHeartbeat.ageMs ?? '?')}ms alt · Audio ${browserHeartbeat.audioUnlocked ? 'frei' : 'gesperrt'} · Device ${browserHeartbeat.configuredOutputDeviceAvailable ? 'verfügbar' : 'fehlt'}</p>` : '<p class="text-xs text-red-300 mt-2">Kein Browser-Heartbeat empfangen. Standalone-Tab offen lassen.</p>'}
      ${sourceStatus.configured ? `<p class="text-xs ${sourceStatus.connectedToSource ? 'text-gray-400' : 'text-yellow-300'} mt-2">TikTok-Quelle: @${escapeHtml(sourceStatus.username || '?')} · aktuell ${escapeHtml(sourceStatus.currentUsername || 'nicht verbunden')} · Reconnects ${escapeHtml(sourceStatus.reconnectAttempts || 0)}${sourceStatus.lastReconnectError ? ` · ${escapeHtml(sourceStatus.lastReconnectError)}` : ''}</p>` : '<p class="text-xs text-red-300 mt-2">Keine TikTok-Quelle konfiguriert.</p>'}
      ${lastEventResult ? `<p class="text-xs ${lastEventResult.responded ? 'text-green-400' : 'text-yellow-300'} mt-2">Letztes Host-Event: ${escapeHtml(lastEventResult.eventType || '?')} · ${lastEventResult.responded ? 'gesprochen' : 'nicht gesprochen'} · ${escapeHtml(lastEventResult.reason || 'ohne Grund')}</p>` : '<p class="text-xs text-yellow-300 mt-2">Letztes Host-Event: noch keines verarbeitet.</p>'}
      ${ttsProbe ? `<p class="text-xs ${ttsProbe.success ? 'text-green-400' : 'text-red-300'} mt-2">TTS-Probe: ${ttsProbe.success ? 'ok' : 'fehlgeschlagen'} · ${escapeHtml(ttsProbe.engine || 'fishaudio')}${ttsProbe.error ? ` · ${escapeHtml(ttsProbe.error)}` : ''}</p>` : '<p class="text-xs text-yellow-300 mt-2">Noch keine TTS-Probe in dieser Laufzeit.</p>'}
      ${movement ? `<p class="text-xs ${movement.success ? 'text-green-400' : 'text-red-300'} mt-2">Letzter Bewegungstest: ${movement.success ? 'gesendet' : 'fehlgeschlagen'}${movement.name || movement.index !== undefined ? ` · ${escapeHtml(movement.name || movement.index)}` : ''}${movement.error ? ` · ${escapeHtml(movement.error)}` : ''}</p>` : '<p class="text-xs text-yellow-300 mt-2">Noch kein Animaze-Bewegungstest in dieser Laufzeit.</p>'}
      ${idleMotion ? `<p class="text-xs ${idleMotion.success ? 'text-green-400' : 'text-yellow-300'} mt-2">Letzte Auto-Idle-Motion: ${escapeHtml(idleMotion.reason || 'unbekannt')}${idleMotion.name ? ` · ${escapeHtml(idleMotion.name)}` : ''}</p>` : '<p class="text-xs text-yellow-300 mt-2">Noch keine automatische Idle-Motion in dieser Laufzeit.</p>'}
      ${diagnostics.lastRateLimitedAt ? `<p class="text-xs text-yellow-300 mt-2">Letztes Rate-Limit: ${escapeHtml(diagnostics.lastRateLimitedAt)}</p>` : ''}
    </div>`;
  }

  function renderHostAsr() {
    const status = state.asrStatus.status || state.asrStatus || {};
    const counters = status.counters || {};
    const lastDecision = status.lastDecision || state.status.liveHostRuntime?.diagnostics?.lastHostSpeechDecision || null;
    const lastUpload = state.hostAsr.lastUpload || {};
    const selectedDevice = state.inputDevices.find(device => device.deviceId === get('asr.deviceId')) || {};
    const unsafeSelected = selectedDevice.deviceId ? isUnsafeHostMic(selectedDevice) : false;
    const readyClass = status.ready ? 'text-green-400' : 'text-yellow-300';
    const recordingClass = state.hostAsr.recording ? 'text-green-400' : 'text-gray-400';
    return `<section class="mt-4"><div class="card"><h2 class="text-xl font-bold mb-3">Host-STT / Streamer-Mikrofon</h2>
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
        ${input('asr.enabled', 'Host-STT aktiv', { type: 'checkbox' })}
        ${input('asr.deviceId', 'Mikrofon fuer Streamer -> AI Host', { type: 'select', options: hostInputOptions() })}
        ${input('asr.unsafeOverride', 'Loopback-Risiko erlauben', { type: 'checkbox' })}
        ${input('asr.language', 'STT-Sprache')}
        ${input('asr.silenceTimeoutMs', 'Stille-Fenster (ms)', { type: 'number', min: 250, max: 5000 })}
        ${input('asr.maxSegmentMs', 'Segmentlaenge (ms)', { type: 'number', min: 1000, max: 30000 })}
        ${input('asr.minTranscriptChars', 'Min. Zeichen', { type: 'number', min: 1, max: 500 })}
        ${input('asr.speechRmsThreshold', 'Speech RMS Schwelle', { type: 'number', min: 0, max: 0.25, step: 0.001 })}
        ${input('asr.speechPeakThreshold', 'Speech Peak Schwelle', { type: 'number', min: 0, max: 1, step: 0.001 })}
        ${input('asr.minSpeechMs', 'Min. Sprachdauer (ms)', { type: 'number', min: 0, max: 5000 })}
        ${input('asr.maxAudioBytes', 'Max. Audio Bytes', { type: 'number', min: 1024, max: 8388608 })}
        ${input('asr.rateLimitMax', 'Uploads/Fenster', { type: 'number', min: 1, max: 120 })}
        ${input('asr.rateLimitWindowMs', 'Rate-Fenster (ms)', { type: 'number', min: 1000, max: 3600000 })}
      </div>
      <div class="rounded-lg border border-gray-700 bg-gray-900/70 p-3 text-sm mt-3">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div>Backend: <strong class="${readyClass}">${status.ready ? 'bereit' : 'nicht bereit'}</strong></div>
          <div>Aufnahme: <strong class="${recordingClass}">${state.hostAsr.recording ? 'laeuft' : 'gestoppt'}</strong></div>
          <div>Fish.audio: <strong class="${status.fishConfigured ? 'text-green-400' : 'text-red-300'}">${status.fishConfigured ? 'konfiguriert' : 'fehlt'}</strong></div>
          <div>Transkripte/Akzeptiert: <strong>${escapeHtml(counters.transcribed ?? 0)} / ${escapeHtml(counters.accepted ?? 0)}</strong></div>
          <div>Blockiert/Fehler: <strong>${escapeHtml(counters.rejected ?? 0)} / ${escapeHtml(counters.errors ?? 0)}</strong></div>
          <div>Latenz: <strong>${escapeHtml(status.lastLatencyMs ?? lastUpload.latencyMs ?? '-')}ms</strong></div>
        </div>
        ${unsafeSelected && !get('asr.unsafeOverride') ? '<p class="text-xs text-red-300 mt-2">Ausgewaehltes Geraet wirkt wie Loopback/Monitor. Fuer echte Streamer-Kommunikation ein physisches Mikrofon waehlen oder Override bewusst aktivieren.</p>' : ''}
        ${state.hostAsr.lastTranscript ? `<p class="text-xs text-gray-300 mt-2">Letztes Transkript: ${escapeHtml(state.hostAsr.lastTranscript)}</p>` : ''}
        ${state.hostAsr.lastSignal ? `<p class="text-xs text-gray-400 mt-2">Letztes Mikrofonsignal: RMS ${escapeHtml(state.hostAsr.lastSignal.rms)} / Peak ${escapeHtml(state.hostAsr.lastSignal.peak)} / ${escapeHtml(state.hostAsr.lastSignal.durationMs)} ms</p>` : ''}
        ${state.hostAsr.lastSkip ? `<p class="text-xs text-yellow-300 mt-2">Letztes Segment nicht hochgeladen: ${escapeHtml(state.hostAsr.lastSkip.reason)}</p>` : ''}
        ${lastDecision ? `<p class="text-xs ${lastDecision.respond === false ? 'text-yellow-300' : 'text-green-400'} mt-2">Letzte Host-Decision: ${lastDecision.respond === false ? 'nicht antworten' : 'antworten'} - ${escapeHtml(lastDecision.reason || 'unknown')} - Score ${escapeHtml(lastDecision.score ?? '-')}</p>` : '<p class="text-xs text-gray-400 mt-2">Noch keine Host-Decision.</p>'}
        ${state.hostAsr.lastError ? `<p class="text-xs text-red-300 mt-2">STT-Fehler: ${escapeHtml(state.hostAsr.lastError)}</p>` : ''}
      </div>
      <div class="flex flex-wrap gap-2 mt-3">
        <button class="btn btn-secondary" data-refresh-input-devices>Host-Mikros aktualisieren/freigeben</button>
        <button class="btn btn-secondary" data-asr-status>STT-Status pruefen</button>
        <button class="btn btn-success" data-asr-start ${state.hostAsr.recording ? 'disabled' : ''}>Host-STT starten</button>
        <button class="btn btn-danger" data-asr-stop ${state.hostAsr.recording ? '' : 'disabled'}>Host-STT stoppen</button>
      </div>
      ${actions('asr')}</div></section>`;
  }

  function renderPreflightStatus() {
    if (!state.preflight) {
      return `<div id="liveHostPreflightStatus" class="text-sm text-gray-400">Noch kein Preflight ausgeführt.</div>`;
    }

    const border = state.preflight.ready ? 'border-green-700 bg-green-950/30' : 'border-red-700 bg-red-950/30';
    const summary = state.preflight.summary || { ok: 0, warnings: 0, errors: 0 };
    const checks = state.preflight.checks || [];
    return `<div id="liveHostPreflightStatus" class="mt-3 rounded-lg border ${border} p-3 text-sm">
      <div class="font-semibold">${state.preflight.ready ? 'Preflight bereit' : 'Preflight blockiert'} · OK ${summary.ok || 0} · Warnungen ${summary.warnings || 0} · Fehler ${summary.errors || 0}</div>
      <div class="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
        ${checks.map(check => `<div class="rounded border border-gray-700 bg-gray-900/70 p-2">
          <div><strong>${escapeHtml(check.label)}</strong> <span class="${check.status === 'ok' ? 'text-green-400' : check.status === 'warn' ? 'text-yellow-300' : 'text-red-400'}">${escapeHtml(check.status)}</span></div>
          <div class="text-gray-300">${escapeHtml(check.detail)}</div>
          ${check.action ? `<div class="text-xs text-gray-400 mt-1">Aktion: ${escapeHtml(check.action)}</div>` : ''}
        </div>`).join('')}
      </div>
    </div>`;
  }

  function getBrowserPreflightState() {
    const audio = document.getElementById('animazingpal-tts-audio');
    const configuredOutputDeviceAvailable = isConfiguredOutputDeviceAvailable();
    const outputSelect = document.querySelector('[data-lh="audio.outputDeviceId"]');
    const sinkSupported = Boolean(audio?.setSinkId) || supportsSinkId();
    return {
      browser: {
        sinkSupported,
        audioUnlocked: window.audioUnlocked === true || window.animazingPalAudioUnlocked === true,
        configuredOutputDeviceAvailable,
        selectedOutputDeviceId: outputSelect?.value || '',
        playback: window.animazingPalTTSPlaybackState || null
      }
    };
  }

  function isConfiguredOutputDeviceAvailable() {
    const configuredId = get('audio.outputDeviceId');
    if (!configuredId) return true;
    if (configuredId.startsWith('system:')) return true;
    return state.devices.some(device => device.source !== 'system' && device.deviceId === configuredId);
  }

  function render() {
    const root = document.getElementById('liveHostSettings');
    if (!root || !state.config) return;
    root.innerHTML = `
      <div class="card flex flex-wrap items-center gap-3"><h2 class="text-xl font-bold flex-1">Intelligenter Live Host</h2>
        ${input('enabled', 'Live Host aktiv', { type: 'checkbox' })}
        ${input('operatingMode', 'Betriebsmodus', { type: 'select', options: [
          { value: 'standalone', label: 'Standalone Host' },
          { value: 'sidekick', label: 'Sidekick / Streamer-Assistent' }
        ] })}
        <button class="btn btn-primary" data-livehost-save="enabled">Aktivierung speichern</button>
        <button class="btn btn-primary" data-livehost-save="operatingMode">Modus speichern</button>
        <button class="btn btn-primary" data-preflight-check>24/7 Preflight prüfen</button>
        <button class="btn btn-success" data-preset="production-24-7">24/7 Produktionsprofil</button>
        <button class="btn btn-secondary" data-livehost-reset="all">Alle Einstellungen zurücksetzen</button>
        <p class="basis-full text-sm text-yellow-300">Pflicht-Setup: TikTok-Kanal, Fish.audio-Stimme und CABLE-Ausgabegerät auswählen; danach den Preflight ausführen.</p>
        <div class="basis-full">${renderPreflightStatus()}</div>
      </div>
      <section class="mt-4"><div class="card"><h2 class="text-xl font-bold mb-3">TikTok-LIVE-Ereignisquelle</h2><div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        ${input('source.watchdogIntervalMs', 'Watchdog-Intervall (ms)', { type: 'number', min: 5000, max: 300000 })}
        ${input('source.eventStaleMs', 'Event-Stale-Schwelle (ms)', { type: 'number', min: 30000, max: 3600000 })}
        ${input('source.reconnectOnEventStale', 'Bei stale Events reconnecten', { type: 'checkbox' })}
        ${input('source.username', 'Öffentlicher LIVE-Kanal')}${input('source.autoConnect', 'Automatisch lesend verbinden', { type: 'checkbox' })}
        <p class="text-sm text-gray-400">Nur eingehende Ereignisse. AnimazingPal sendet keine Chats, Likes, Follows oder Gifts an den fremden Kanal.</p>
      </div><button class="btn btn-success mt-3" data-source-connect>Jetzt lesend verbinden</button>${actions('source')}</div></section>
      ${renderGreetingWarmup()}
      <section class="mt-4"><div class="card"><h2 class="text-xl font-bold mb-3">Brain-Provider</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">${input('provider', 'Aktiver Provider', { type: 'select', options: PROVIDERS })}</div>
        <label class="block mt-3"><span class="text-gray-400 text-sm">Aktive Persönlichkeit</span><select class="select" id="liveHostPersonality"><option value="">Aktuelle Persönlichkeit beibehalten</option>${state.personalities.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('')}</select></label>
        ${PROVIDERS.map(providerCard).join('')}<button class="btn btn-secondary mt-3" data-provider-test>Aktiven Provider und Modell testen</button>${actions('providers')}</div></section>
      <section class="mt-4"><div class="card"><h2 class="text-xl font-bold mb-3">Antwortverhalten</h2><div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        ${input('response.decisionMode', 'Entscheidung', { type: 'select', options: [
          { value: 'auto', label: 'Host entscheidet automatisch' },
          { value: 'probability', label: 'Wahrscheinlichkeit nutzen' },
          { value: 'always', label: 'Immer antworten' },
          { value: 'off', label: 'Nie antworten' }
        ] })}
        ${input('response.minDecisionScore', 'Min. Entscheidungs-Score', { type: 'number', min: 0, max: 1, step: 0.01 })}
        ${input('response.maxResponsesPerMinute', 'Antworten/Minute', { type: 'number', min: 1, max: 120 })}
        ${input('response.chatProbability', 'Chat-Wahrscheinlichkeit', { type: 'number', min: 0, max: 1, step: 0.01 })}
        ${input('response.hostReplyProbability', 'Host-STT Antwortgate', { type: 'number', min: 0, max: 1, step: 0.01 })}
        ${input('response.hostMinConfidence', 'Host-STT Mindestconfidence', { type: 'number', min: 0, max: 1, step: 0.01 })}
        ${input('response.hostContextCooldownMs', 'Host-STT aktive Pause (ms)', { type: 'number', min: 0, max: 3600000 })}
        ${input('response.hostOvertalkCooldownMs', 'Anti-Overtalk (ms)', { type: 'number', min: 0, max: 300000 })}
        ${input('response.hostLongFormWordLimit', 'Langform-Wortlimit', { type: 'number', min: 1, max: 500 })}
        ${input('response.sidekickName', 'Sidekick-Name global')}
        ${input('response.maxSentences', 'Max. Sätze', { type: 'number', min: 1, max: 10 })}${input('response.maxCharacters', 'Max. Zeichen', { type: 'number', min: 20, max: 4000 })}
        ${input('response.language', 'Sprache')}${input('response.cacheEnabled', 'Cache aktiv', { type: 'checkbox' })}
        ${input('response.cacheTtlMs', 'Cache TTL (ms)', { type: 'number', min: 0 })}${input('response.contextMessages', 'Kontextnachrichten', { type: 'number', min: 0, max: 100 })}
        ${input('response.queueLimit', 'Queue-Limit', { type: 'number', min: 1, max: 1000 })}${input('response.queueWarnRatio', 'Queue-Warnschwelle 0-1', { type: 'number', min: 0, max: 1, step: 0.05 })}${input('response.queuePolicy', 'Abbruchverhalten', { type: 'select', options: ['drop-lowest', 'drop-oldest', 'reject-new'] })}
        ${input('response.speakCooldownMs', 'Sprech-Cooldown (ms)', { type: 'number', min: 0, max: 60000 })}
        ${input('response.silenceWarnAfterEvents', 'Silence-Warnung nach Events', { type: 'number', min: 1, max: 1000 })}
      </div><div class="mt-3">${textarea('response.systemPrompt', 'Systemprompt', 5)}</div>${actions('response')}</div></section>
      ${renderHostAsr()}
      <section class="mt-4"><h2 class="text-xl font-bold mb-3">Ereignisse</h2><div class="grid grid-cols-1 gap-3">${EVENTS.map(eventCard).join('')}</div>${actions('events')}</section>
      ${renderTtsAudio()}
      ${renderMemory()}
      ${renderBundles()}
      ${renderIdleMotion()}
      ${renderDiagnostics()}
    `;
    bind();
  }

  function renderGreetingWarmup() {
    const warmup = state.greetingWarmup || {};
    const result = warmup.lastResult || null;
    const streamer = get('viewerMemory.streamerId') || get('source.username') || 'pupcid';
    const voice = get('tts.voiceId') || 'Globale Host-Stimme';
    const runningLabel = warmup.running ? 'Warmup läuft...' : 'Top-20 Begrüßungen vorerzeugen';
    const status = result
      ? `<div class="mt-3 rounded-lg border ${result.success ? 'border-green-700 bg-green-950/30 text-green-200' : 'border-yellow-700 bg-yellow-950/30 text-yellow-100'} p-3 text-sm">
          <div class="font-semibold">Letzter Warmup: ${result.success ? 'abgeschlossen' : 'teilweise abgeschlossen'}</div>
          <div>Streamer: ${escapeHtml(result.streamerId || streamer)} · User gefunden: ${escapeHtml(result.foundUsers ?? 0)} · Generiert: ${escapeHtml(result.generated ?? 0)} · Zielvarianten: ${escapeHtml(result.targetVariants ?? 3)}</div>
          ${Array.isArray(result.errors) && result.errors.length ? `<div class="text-red-300 mt-1">Fehler: ${escapeHtml(result.errors.map(item => `${item.username}: ${item.error}`).join('; '))}</div>` : ''}
        </div>`
      : '<p class="text-xs text-gray-500 mt-3">Noch kein Warmup in dieser Browser-Session ausgeführt.</p>';
    return `<section class="mt-4"><div class="card">
      <h2 class="text-xl font-bold mb-3">Begrüßungs-Warmup</h2>
      <p class="text-sm text-gray-400 mb-3">Erzeugt gecachte Begrüßungsvarianten inklusive Fish.audio-Audio. Danach werden bekannte Viewer ohne neuen LLM-/TTS-Call begrüßt.</p>
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
        <label class="block md:col-span-2"><span class="text-gray-400 text-sm">Streamer-Profil</span><input class="input" id="greetingWarmupStreamer" value="${escapeHtml(streamer)}" placeholder="pupcid"></label>
        <label class="block"><span class="text-gray-400 text-sm">Top-User Limit</span><input class="input" id="greetingWarmupLimit" type="number" min="1" max="100" value="20"></label>
        <label class="block"><span class="text-gray-400 text-sm">Varianten/User</span><input class="input" id="greetingWarmupVariants" type="number" min="1" max="3" value="3"></label>
      </div>
      <div class="flex flex-wrap items-center gap-3 mt-3">
        <button class="btn btn-success" data-greeting-warmup ${warmup.running ? 'disabled' : ''}>${escapeHtml(runningLabel)}</button>
        <span class="text-sm text-gray-400">Stimme: ${escapeHtml(voice)} · Standard: Top-20 × 3 Varianten</span>
      </div>
      ${warmup.lastError ? `<p class="text-sm text-red-300 mt-3">Warmup-Fehler: ${escapeHtml(warmup.lastError)}</p>` : ''}
      ${status}
    </div></section>`;
  }

  function renderTtsAudio() {
    return `<section class="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4"><div class="card"><h2 class="text-xl font-bold mb-3">Fish.audio</h2><div class="grid grid-cols-2 gap-3">
      ${input('tts.enabled', 'TTS aktiv', { type: 'checkbox' })}${input('tts.voiceId', 'Globale Host-Stimme', { type: 'select', options: voiceOptions() })}
      ${input('tts.emotion', 'Emotion')}${input('tts.pitch', 'Pitch', { type: 'number', min: -12, max: 12, step: 0.1 })}
      ${input('tts.volume', 'Lautstärke', { type: 'number', min: 0, max: 100 })}${input('tts.speed', 'Tempo', { type: 'number', min: 0.5, max: 2, step: 0.05 })}
      ${input('tts.streaming', 'Streaming', { type: 'checkbox' })}${input('tts.priority', 'Queue-Priorität', { type: 'number', min: 0, max: 100 })}
      ${input('tts.duckOtherAudio', 'Audio-Ducking', { type: 'checkbox' })}${input('tts.fallbackBehavior', 'Fallback', { type: 'select', options: ['silent', 'default-voice', 'error'] })}${input('tts.probeStaleMs', 'Probe-Stale nach ms', { type: 'number', min: 30000, max: 86400000 })}
    </div><label class="block mt-3"><span class="text-gray-400 text-sm">Testtext</span><input id="liveHostTestText" class="input" value="Hallo, ich bin dein intelligenter AnimazingPal Live Host."></label><button class="btn btn-success mt-3" data-speak-test>Sprachtest</button>${actions('tts')}</div>
    <div class="card"><h2 class="text-xl font-bold mb-3">Audio-Routing</h2><div class="grid grid-cols-1 gap-3">
      ${input('audio.outputDeviceId', 'Wiedergabegerät', { type: 'select', options: deviceOptions() })}
      ${input('audio.monitoringEnabled', 'Monitoring aktiv', { type: 'checkbox' })}${input('audio.monitoringVolume', 'Monitoring-Lautstärke', { type: 'number', min: 0, max: 100 })}
      ${input('audio.missingDeviceBehavior', 'Fehlendes Gerät', { type: 'select', options: ['mute', 'default', 'error'] })}
      ${renderAudioRoutingStatus()}
      <p class="text-xs text-gray-500">System-Fallback-Geräte kommen von Windows. Für direktes Browser-Routing muss das Gerät über den Auswahlbutton freigegeben sein; sonst nutzt der Player das Windows-Standardgerät.</p>
      <button class="btn btn-success" data-pick-output-device>Audiogerät auswählen und speichern</button>
      <button class="btn btn-secondary" data-refresh-devices>Geräte aktualisieren</button>
    </div>${actions('audio')}</div></section>`;
  }

  function renderMemory() {
    const allowed = get('viewerMemory.allowedProfileFields', []);
    return `<section class="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4"><div class="card"><h2 class="text-xl font-bold mb-3">Viewer Profiles & Long-Term Memory</h2><div class="grid grid-cols-2 gap-3">
      ${input('viewerMemory.enabled', 'Viewer Memory aktiv', { type: 'checkbox' })}${input('viewerMemory.streamerId', 'Streamer-ID')}
      ${input('viewerMemory.maxMemories', 'Max. Erinnerungen', { type: 'number', min: 1, max: 100 })}${input('viewerMemory.minimumImportance', 'Min. Wichtigkeit', { type: 'number', min: 0, max: 1, step: 0.05 })}
      ${input('viewerMemory.writeMemories', 'Erinnerungen schreiben', { type: 'checkbox' })}${input('viewerMemory.includeInsights', 'Insights lesen', { type: 'checkbox' })}
      ${input('viewerMemory.includeGiftHistory', 'Geschenkverlauf lesen', { type: 'checkbox' })}
    </div><p class="text-gray-400 text-sm mt-3">Freigegebene Profilfelder</p><div class="grid grid-cols-2 gap-2">${PROFILE_FIELDS.map(field => `<label><input type="checkbox" data-profile-field="${field}" ${allowed.includes(field) ? 'checked' : ''}> ${field}</label>`).join('')}</div>${actions('viewerMemory')}</div>
    <div class="card"><h2 class="text-xl font-bold mb-3">Datenschutz</h2><div class="grid grid-cols-1 gap-3">
      ${input('privacy.includeNotes', 'Interne Notizen einbeziehen', { type: 'checkbox' })}${input('privacy.includeBirthday', 'Geburtstag einbeziehen', { type: 'checkbox' })}${input('privacy.includeContactFields', 'Kontaktfelder einbeziehen', { type: 'checkbox' })}${input('privacy.redactPromptPayloads', 'Prompt-Payloads redigieren', { type: 'checkbox' })}
    </div>${actions('privacy')}</div></section>`;
  }

  function renderBundles() {
    const bundles = get('avatarBundles', []);
    return `<section class="mt-4"><div class="card"><h2 class="text-xl font-bold mb-3">Geschenkekatalog → Avatar-Bundles</h2>
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
        ${input('avatarSwitch.enabled', 'Auto-Switch aktiv', { type: 'checkbox' })}${input('avatarSwitch.persistUntilNextSwitch', 'Bis zum nächsten Switch aktiv', { type: 'checkbox' })}
        ${input('avatarSwitch.revertAfterMs', 'Zurücksetzen nach ms', { type: 'number', min: 0 })}${input('avatarSwitch.matchGiftNameFallback', 'Gift-Name-Fallback', { type: 'checkbox' })}${input('avatarSwitch.waitForRepeatEnd', 'Streak-Ende abwarten', { type: 'checkbox' })}
      </div>
      <div id="avatarBundleList" class="mt-4 space-y-2">${bundles.length ? bundles.map(bundle => `<div class="flex items-center gap-2 bg-gray-800 p-2 rounded"><strong class="flex-1">${escapeHtml(bundle.name || bundle.id)}${bundle.sidekickName ? ` (${escapeHtml(bundle.sidekickName)})` : ''}</strong><span class="text-gray-400">${escapeHtml((bundle.giftIds || bundle.gifts || []).join(', '))}</span><button class="btn btn-secondary" data-bundle-edit="${escapeHtml(bundle.id)}">Bearbeiten</button><button class="btn btn-success" data-bundle-activate="${escapeHtml(bundle.id)}">Aktivieren</button><button class="btn btn-danger" data-bundle-delete="${escapeHtml(bundle.id)}">Löschen</button></div>`).join('') : '<p class="text-gray-400">Noch keine Bundles.</p>'}</div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
        <input class="input" id="bundleId" placeholder="Bundle-ID"><input class="input" id="bundleName" placeholder="Anzeigename">
        <input class="input" id="bundleSidekickName" placeholder="Sidekick-Name für diesen Avatar">
        <select class="select" id="bundleAvatar"><option value="">Avatar wählen</option>${state.avatars.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('')}</select>
        <select class="select" id="bundlePersonality"><option value="">Persönlichkeit wählen</option>${state.personalities.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('')}</select>
        <select class="select" id="bundleVoice">${voiceOptions().map(item => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`).join('')}</select>
        <input class="input" id="bundleEmotion" placeholder="Emotion"><input class="input" id="bundlePitch" type="number" min="-12" max="12" step="0.1" placeholder="Pitch">
        <input class="input" id="bundleVolume" type="number" min="0" max="100" placeholder="Lautstärke"><input class="input" id="bundleSpeed" type="number" min="0.5" max="2" step="0.05" placeholder="Tempo">
        <input class="input" id="bundlePriority" type="number" min="0" max="100" placeholder="Queue-Priorität">
        <input class="input md:col-span-2" id="bundleGiftNames" placeholder="Gift-Namen als Fallback, kommasepariert">
        <select class="select md:col-span-2" id="bundleGifts" multiple size="6">${state.gifts.map(gift => `<option value="${escapeHtml(gift.id)}">${escapeHtml(gift.name)} (#${escapeHtml(gift.id)})</option>`).join('')}</select>
        <button class="btn btn-primary" data-bundle-save>Bundle hinzufügen/aktualisieren</button>
      </div>${actions('avatarBundles')}${actions('avatarSwitch')}</div></section>`;
  }

  function renderIdleMotion() {
    return `<section class="mt-4"><div class="card"><h2 class="text-xl font-bold mb-3">Idle-Motion</h2>
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
        ${input('idleMotion.enabled', 'Automatische Bewegung aktiv', { type: 'checkbox' })}
        ${input('idleMotion.intervalMs', 'Intervall (ms)', { type: 'number', min: 3000, max: 600000 })}
        ${input('idleMotion.jitterMs', 'Zufalls-Jitter (ms)', { type: 'number', min: 0, max: 120000 })}
        ${input('idleMotion.actionType', 'Aktionstyp', { type: 'select', options: [
          { value: 'idle', label: 'Idle-Animation bevorzugen' },
          { value: 'specialAction', label: 'Special Action bevorzugen' },
          { value: 'emote', label: 'Emote bevorzugen' }
        ] })}
        ${input('idleMotion.fallbackToSpecialAction', 'Fallback erlauben', { type: 'checkbox' })}
        ${input('idleMotion.includeEmotes', 'Emotes einbeziehen', { type: 'checkbox' })}
        ${input('idleMotion.alternateActionTypes', 'Idle/Special/Emote rotieren', { type: 'checkbox' })}
        ${input('idleMotion.pauseWhileSpeaking', 'Beim Sprechen pausieren', { type: 'checkbox' })}
        ${input('idleMotion.cooldownAfterActionMs', 'Cooldown nach Aktion (ms)', { type: 'number', min: 0, max: 600000 })}
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
        ${textarea('idleMotion.preferNames', 'Bevorzugte Animationsnamen, kommasepariert')}
        ${textarea('idleMotion.avoidNames', 'Zu vermeidende Namen, kommasepariert')}
      </div>
      <p class="text-sm text-gray-400 mt-3">Damit der Avatar nicht einfriert: bevorzugt Explaining/Walking/Bored/Victory und vermeidet Motionless. Änderungen greifen nach Speichern ohne Neustart.</p>
      ${actions('idleMotion')}</div></section>`;
  }

  function renderDiagnostics() {
    return `<section class="mt-4"><div class="card"><h2 class="text-xl font-bold mb-3">Diagnose</h2><div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      ${input('diagnostics.verboseLogging', 'Verbose Logging', { type: 'checkbox' })}${input('diagnostics.emitEvents', 'Diagnoseereignisse', { type: 'checkbox' })}${input('diagnostics.retainLastErrors', 'Letzte Fehler behalten', { type: 'number', min: 0, max: 100 })}${input('diagnostics.browserHeartbeatStaleMs', 'Browser-Heartbeat stale nach ms', { type: 'number', min: 5000, max: 300000 })}${input('diagnostics.movementProbeStaleMs', 'Motion-Test stale nach ms', { type: 'number', min: 30000, max: 86400000 })}${input('diagnostics.includePromptBodies', 'Prompt-Inhalte loggen', { type: 'checkbox' })}
    </div>${renderRuntimeDiagnostics()}<p class="text-sm text-gray-400 mt-3" id="liveHostStatus">TikTok, Provider, Fish.audio, Audio und Animaze werden über die Live-Statusanzeige überwacht.</p>${actions('diagnostics')}</div></section>`;
  }

  function valueOf(element) {
    if (element.type === 'checkbox') return element.checked;
    if (element.type === 'number') return element.value === '' ? null : Number(element.value);
    if (['idleMotion.preferNames', 'idleMotion.avoidNames'].includes(element.dataset.lh)) {
      return String(element.value || '').split(',').map(item => item.trim()).filter(Boolean);
    }
    return element.value;
  }

  function collect(section) {
    const patch = {};
    document.querySelectorAll('[data-lh]').forEach(element => {
      const path = element.dataset.lh;
      if (section !== 'all' && path !== section && !path.startsWith(`${section}.`)) return;
      if (element.type === 'password' && !element.value) return;
      set(patch, path, valueOf(element));
    });
    if (section === 'viewerMemory' || section === 'all') {
      set(patch, 'viewerMemory.allowedProfileFields', [...document.querySelectorAll('[data-profile-field]:checked')].map(item => item.dataset.profileField));
    }
    if (section === 'audio' || section === 'all') {
      const device = document.querySelector('[data-lh="audio.outputDeviceId"]');
      set(patch, 'audio.outputDeviceLabel', device?.selectedOptions?.[0]?.textContent || '');
    }
    if (section === 'asr' || section === 'all') {
      const device = document.querySelector('[data-lh="asr.deviceId"]');
      set(patch, 'asr.deviceLabel', device?.selectedOptions?.[0]?.textContent || '');
    }
    return patch;
  }

  async function request(url, options = {}) {
    const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
    const body = await response.json();
    if (!response.ok || body.success === false) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  }

  function notify(message, error = false) {
    if (typeof window.showToast === 'function') return window.showToast(message, error ? 'error' : 'success');
    const status = document.getElementById('liveHostStatus');
    if (status) status.textContent = message;
  }

  async function save(section) {
    const patch = section === 'avatarBundles'
      ? { avatarBundles: state.config.avatarBundles, activeAvatarBundleId: state.config.activeAvatarBundleId }
      : collect(section);
    if (section === 'providers') {
      patch.provider = document.querySelector('[data-lh="provider"]').value;
    }
    const body = await request('/api/animazingpal/live-host/config', { method: 'POST', body: JSON.stringify(patch) });
    state.config = body.config;
    render();
    notify(`${section} gespeichert`);
  }

  function mergeDevices(...groups) {
    const devices = [];
    const seen = new Set();
    for (const group of groups) {
      for (const device of group || []) {
        const label = device.label || device.deviceId;
        const key = `${device.source || 'browser'}:${device.deviceId || label}`.toLowerCase();
        if (!label || seen.has(key)) continue;
        seen.add(key);
        devices.push(device);
      }
    }
    return devices;
  }

  async function loadBrowserDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter(device => device.kind === 'audiooutput')
        .map(device => ({ deviceId: device.deviceId, label: device.label || device.deviceId, source: 'browser' }));
    } catch (error) {
      notify(`Audiogeräte nicht lesbar: ${error.message}`, true);
      return [];
    }
  }

  async function loadHostInputDevices(requestPermission = false) {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    let permissionStream = null;
    try {
      if (requestPermission && navigator.mediaDevices.getUserMedia) {
        permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      state.inputDevices = devices
        .filter(device => device.kind === 'audioinput')
        .map(device => ({ deviceId: device.deviceId, label: device.label || device.deviceId, source: 'browser' }));
      return state.inputDevices;
    } catch (error) {
      notify(`Host-Mikrofone nicht lesbar: ${error.message}`, true);
      return state.inputDevices || [];
    } finally {
      permissionStream?.getTracks?.().forEach(track => track.stop());
    }
  }

  async function loadSystemDevices() {
    try {
      const payload = await request('/api/animazingpal/live-host/audio-devices');
      return (payload.devices || []).map(device => ({ ...device, source: device.source || 'system' }));
    } catch {
      return [];
    }
  }

  async function loadDevices() {
    const [browserDevices, systemDevices] = await Promise.all([loadBrowserDevices(), loadSystemDevices()]);
    state.devices = mergeDevices(browserDevices, systemDevices);
  }

  async function pickOutputDevice() {
    if (!navigator.mediaDevices?.selectAudioOutput) {
      throw new Error('Dieser Browser unterstützt die explizite Audiogeräteauswahl nicht. Bitte Chrome oder Edge verwenden.');
    }
    const device = await navigator.mediaDevices.selectAudioOutput();
    if (!device?.deviceId) throw new Error('Kein Audiogerät ausgewählt');
    state.devices = [...state.devices.filter(item => item.deviceId !== device.deviceId), device];
    const body = await request('/api/animazingpal/live-host/config', {
      method: 'POST',
      body: JSON.stringify({ audio: {
        ...state.config.audio,
        outputDeviceId: device.deviceId,
        outputDeviceLabel: device.label || 'Ausgewähltes Audiogerät'
      } })
    });
    state.config = body.config;
    render();
    notify(`Audiogerät gespeichert: ${device.label || device.deviceId}`);
  }

  async function runPreflight() {
    const body = await request('/api/animazingpal/live-host/preflight', {
      method: 'POST',
      body: JSON.stringify(getBrowserPreflightState())
    });
    state.preflight = body.preflight;
    render();
    notify(state.preflight.ready ? '24/7 Preflight bereit' : '24/7 Preflight hat blockierende Fehler', !state.preflight.ready);
  }

  async function sendBrowserHeartbeat() {
    return request('/api/animazingpal/live-host/browser-heartbeat', {
      method: 'POST',
      body: JSON.stringify(getBrowserPreflightState())
    }).catch(() => null);
  }

  async function refreshLiveHostHealth() {
    if (!state.loaded || state.healthRefreshing) return;
    state.healthRefreshing = true;
    try {
      await sendBrowserHeartbeat();
      if (document.visibilityState === 'hidden') return;
      const [status, ttsStatus, ttsQueue] = await Promise.all([
        request('/api/animazingpal/status').catch(() => state.status || {}),
        request('/api/tts/status').catch(() => state.ttsStatus || {}),
        request('/api/tts/queue').catch(() => state.ttsQueue || {})
      ]);
      state.status = status || state.status || {};
      state.ttsStatus = ttsStatus || state.ttsStatus || {};
      state.ttsQueue = ttsQueue || state.ttsQueue || {};
      state.lastHealthAt = new Date().toISOString();
      normalizeStatus(state.status);
      render();
    } finally {
      state.healthRefreshing = false;
    }
  }

  async function runMovementTest() {
    const result = await request('/api/animazingpal/live-host/movement-test', {
      method: 'POST',
      body: '{}'
    });
    await refreshLiveHostHealth();
    notify(result.success
      ? `Animaze Bewegungstest gesendet: ${result.name || result.index}`
      : `Animaze Bewegungstest fehlgeschlagen: ${result.error || 'unbekannt'}`, !result.success);
  }

  async function runTtsProbe() {
    const result = await request('/api/animazingpal/live-host/tts-probe', {
      method: 'POST',
      body: JSON.stringify({ speak: false })
    });
    await refreshLiveHostHealth();
    notify(result.success
      ? 'TTS Probe ok'
      : `TTS Probe fehlgeschlagen: ${result.error || 'unbekannt'}`, !result.success);
  }

  function getSelectedHostMic() {
    const deviceId = get('asr.deviceId');
    return state.inputDevices.find(device => device.deviceId === deviceId) || null;
  }

  function buildLiveHostAsrConstraintList(deviceId) {
    const constraints = [];
    if (deviceId) {
      const exactDevice = { deviceId: { exact: deviceId } };
      const idealDevice = { deviceId: { ideal: deviceId } };
      constraints.push({ label: 'genau + DSP', audio: { ...exactDevice, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      constraints.push({ label: 'genau', audio: { ...exactDevice } });
      constraints.push({ label: 'ideal + DSP', audio: { ...idealDevice, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      constraints.push({ label: 'ideal', audio: { ...idealDevice } });
    }
    constraints.push({ label: 'Standard + DSP', audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    constraints.push({ label: 'Standard', audio: true });
    return constraints;
  }

  async function requestHostAsrStream(deviceId) {
    let lastError = null;
    let lastMessages = [];
    for (const attempt of buildLiveHostAsrConstraintList(deviceId)) {
      try {
        return await navigator.mediaDevices.getUserMedia({ audio: attempt.audio });
      } catch (error) {
        lastError = error;
        const detail = error.message || error.name || 'unknown';
        lastMessages.push(`${attempt.label}: ${detail}`);
      }
    }
    const message = lastError
      ? `Mikrofon-Konfigurationskonflikt (${lastError.name || 'Error'}): ${lastError.message || 'unbekannt'}.`
        + ` Versuchte Varianten: ${lastMessages.join(' | ')}`
      : 'Mikrofon konnte nicht gestartet werden.';
    const finalError = new Error(message);
    finalError.name = lastError?.name || 'ConstraintsNotSatisfied';
    finalError.code = lastError?.name || 'not-satisfied';
    throw finalError;
  }

  function getHostMicQuery() {
    const device = getSelectedHostMic();
    const params = new URLSearchParams();
    params.set('micDeviceId', get('asr.deviceId') || '');
    params.set('micLabel', device?.label || get('asr.deviceLabel') || '');
    params.set('micBlocked', device ? String(isUnsafeHostMic(device)) : 'false');
    params.set('micUnsafeOverride', String(get('asr.unsafeOverride', false)));
    return params.toString();
  }

  async function refreshAsrStatus() {
    const body = await request(`/api/animazingpal/live-host/stt/status?${getHostMicQuery()}`);
    state.asrStatus = body.status || {};
    render();
    return state.asrStatus;
  }

  async function uploadHostAsrBlob(blob, transcribeOnly = false) {
    if (!blob || blob.size === 0) return null;
    const form = new FormData();
    if (blob.type === 'audio/wav') {
      form.append('audio', blob, 'host-stt.wav');
    } else {
      const extension = blob.type.includes('ogg') ? 'ogg' : 'webm';
      form.append('audio', blob, `host-stt.${extension}`);
    }
    form.append('transcribeOnly', transcribeOnly ? 'true' : 'false');
    const response = await fetch(`/api/animazingpal/live-host/stt/transcribe?${getHostMicQuery()}`, {
      method: 'POST',
      body: form
    });
    const body = await response.json();
    if (!response.ok || body.success === false) {
      const error = body.error?.message || body.error || `HTTP ${response.status}`;
      throw new Error(error);
    }
    state.asrStatus = body.diagnostics || state.asrStatus || {};
    state.hostAsr.lastUpload = body;
    state.hostAsr.lastTranscript = body.transcript?.text || state.hostAsr.lastTranscript;
    state.hostAsr.lastError = null;
    return body;
  }

  function mergeHostAsrSamples(chunks) {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const samples = new Float32Array(totalLength);
    let offset = 0;
    chunks.forEach(chunk => {
      samples.set(chunk, offset);
      offset += chunk.length;
    });
    return samples;
  }

  function downsampleHostAsrSamples(samples, inputRate, targetRate = 16000) {
    if (!samples.length || !Number.isFinite(inputRate) || inputRate <= targetRate) return samples;
    const ratio = inputRate / targetRate;
    const length = Math.floor(samples.length / ratio);
    const result = new Float32Array(length);
    for (let index = 0; index < length; index += 1) {
      const start = Math.floor(index * ratio);
      const end = Math.min(samples.length, Math.floor((index + 1) * ratio));
      let sum = 0;
      for (let sourceIndex = start; sourceIndex < end; sourceIndex += 1) sum += samples[sourceIndex];
      result[index] = sum / Math.max(1, end - start);
    }
    return result;
  }

  function encodeHostAsrWav(chunks, sampleRate) {
    const samples = downsampleHostAsrSamples(mergeHostAsrSamples(chunks), sampleRate, 16000);
    const wavSampleRate = sampleRate > 16000 ? 16000 : sampleRate;
    const dataBytes = samples.length * 2;
    const buffer = new ArrayBuffer(44 + dataBytes);
    const view = new DataView(buffer);
    const writeAscii = (offset, text) => {
      for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
    };

    writeAscii(0, 'RIFF');
    view.setUint32(4, 36 + dataBytes, true);
    writeAscii(8, 'WAVE');
    writeAscii(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, wavSampleRate, true);
    view.setUint32(28, wavSampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeAscii(36, 'data');
    view.setUint32(40, dataBytes, true);

    let offset = 44;
    for (let index = 0; index < samples.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, samples[index]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }

    return buffer;
  }

  function analyzeHostAsrSignal(chunks, sampleRate) {
    const samples = mergeHostAsrSamples(chunks);
    if (!samples.length) return { rms: 0, peak: 0, durationMs: 0, samples: 0 };
    let sumSquares = 0;
    let peak = 0;
    for (let index = 0; index < samples.length; index += 1) {
      const value = samples[index];
      sumSquares += value * value;
      peak = Math.max(peak, Math.abs(value));
    }
    return {
      rms: Number(Math.sqrt(sumSquares / samples.length).toFixed(5)),
      peak: Number(peak.toFixed(5)),
      durationMs: Math.round((samples.length / Math.max(1, sampleRate || 16000)) * 1000),
      samples: samples.length
    };
  }

  function shouldUploadHostAsrSegment(signal) {
    const minSpeechMs = Number(get('asr.minSpeechMs', 300)) || 0;
    const rmsThreshold = Number(get('asr.speechRmsThreshold', 0.008)) || 0;
    const peakThreshold = Number(get('asr.speechPeakThreshold', 0.04)) || 0;
    if (!signal || signal.durationMs < minSpeechMs) {
      return { upload: false, reason: 'too-short' };
    }
    if (signal.rms < rmsThreshold && signal.peak < peakThreshold) {
      return { upload: false, reason: 'silence-gated' };
    }
    return { upload: true, reason: 'speech-detected' };
  }

  async function startHostAsr() {
    await save('asr');
    await loadHostInputDevices(false);
    const device = getSelectedHostMic();
    if (device && isUnsafeHostMic(device) && !get('asr.unsafeOverride')) {
      throw new Error('Ausgewaehltes Host-Mikrofon wirkt wie Loopback/Monitor. Override aktivieren oder echtes Mikrofon waehlen.');
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!navigator.mediaDevices?.getUserMedia || !AudioContextClass) {
      throw new Error('Dieser Browser unterstuetzt getUserMedia/WebAudio nicht.');
    }
    const stream = await requestHostAsrStream(get('asr.deviceId'));
    const audioContext = new AudioContextClass();
    if (audioContext.state === 'suspended') await audioContext.resume();
    const sourceNode = audioContext.createMediaStreamSource(stream);
    const processorNode = audioContext.createScriptProcessor(4096, 1, 1);
    processorNode.onaudioprocess = event => {
      if (!state.hostAsr.recording) return;
      const input = event.inputBuffer.getChannelData(0);
      state.hostAsr.wavChunks.push(new Float32Array(input));
      const output = event.outputBuffer.getChannelData(0);
      output.fill(0);
    };
    sourceNode.connect(processorNode);
    processorNode.connect(audioContext.destination);
    state.hostAsr.stream = stream;
    state.hostAsr.audioContext = audioContext;
    state.hostAsr.sourceNode = sourceNode;
    state.hostAsr.processorNode = processorNode;
    state.hostAsr.wavSampleRate = audioContext.sampleRate;
    state.hostAsr.wavChunks = [];
    state.hostAsr.recording = true;
    startHostAsrSegment();
    await refreshAsrStatus();
    notify('Host-STT gestartet');
  }

  function startHostAsrSegment() {
    if (!state.hostAsr.recording || !state.hostAsr.stream) return;
    const segmentMs = Math.max(1000, Number(get('asr.maxSegmentMs', 8000)) || 8000);
    state.hostAsr.segmentTimer = setTimeout(() => {
      flushHostAsrSegment();
    }, segmentMs);
  }

  function flushHostAsrSegment() {
    if (state.hostAsr.segmentTimer) {
      clearTimeout(state.hostAsr.segmentTimer);
      state.hostAsr.segmentTimer = null;
    }
    const chunks = state.hostAsr.wavChunks || [];
    state.hostAsr.wavChunks = [];
    if (state.hostAsr.recording) startHostAsrSegment();
    if (!chunks.length) return;
    const signal = analyzeHostAsrSignal(chunks, state.hostAsr.wavSampleRate || 16000);
    state.hostAsr.lastSignal = signal;
    const gate = shouldUploadHostAsrSegment(signal);
    if (!gate.upload) {
      state.hostAsr.lastSkip = { reason: gate.reason, signal, at: new Date().toISOString() };
      state.hostAsr.lastError = null;
      render();
      return;
    }
    state.hostAsr.lastSkip = null;
    const wavBuffer = encodeHostAsrWav(chunks, state.hostAsr.wavSampleRate || 16000);
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    uploadHostAsrBlob(blob, false)
      .then(() => {
        if (state.hostAsr.recording) render();
      })
      .catch(error => {
        state.hostAsr.lastError = error.message;
        render();
      });
  }

  function stopHostAsr() {
    if (state.hostAsr.segmentTimer) {
      clearTimeout(state.hostAsr.segmentTimer);
      state.hostAsr.segmentTimer = null;
    }
    const wasRecording = state.hostAsr.recording;
    state.hostAsr.recording = false;
    if (wasRecording) flushHostAsrSegment();
    state.hostAsr.processorNode?.disconnect?.();
    state.hostAsr.sourceNode?.disconnect?.();
    state.hostAsr.audioContext?.close?.().catch(() => {});
    state.hostAsr.stream?.getTracks?.().forEach(track => track.stop());
    state.hostAsr.stream = null;
    state.hostAsr.recorder = null;
    state.hostAsr.audioContext = null;
    state.hostAsr.sourceNode = null;
    state.hostAsr.processorNode = null;
    state.hostAsr.wavChunks = [];
    render();
    notify('Host-STT gestoppt');
  }

  function startLiveHostHealthRefresh() {
    if (state.healthTimer) clearInterval(state.healthTimer);
    state.healthTimer = setInterval(() => refreshLiveHostHealth().catch(error => notify(error.message, true)), LIVE_HOST_HEALTH_REFRESH_MS);
  }

  function normalizeVoices(payload) {
    const source = payload.voices?.fishaudio || payload.fishaudio || {};
    return Array.isArray(source)
      ? source.map(item => ({ id: item.id || item.voice_id || item.name, name: item.name || item.id }))
      : Object.entries(source).map(([id, item]) => ({ id, name: typeof item === 'string' ? item : item.name || id }));
  }

  function firstPresentAvatarField(avatar, fields) {
    for (const field of fields) {
      const value = avatar?.[field];
      if (value === null || value === undefined) continue;
      const text = String(value).trim();
      if (!text || /\b(undefined|null)\b|\[object Object\]/i.test(text)) continue;
      return text;
    }
    return '';
  }

  function normalizePlatformLabel(value) {
    const text = String(value || '').trim();
    if (!text || /\b(undefined|null)\b|\[object Object\]/i.test(text)) return 'animaze';
    return text;
  }

  function normalizeStatus(payload) {
    const platform = normalizePlatformLabel(payload.activePlatform || payload.platformState?.key || 'animaze');
    const data = payload.platformData || payload.animazeData || payload.platformState?.data || {};
    state.avatars = (data.avatars || []).map(avatar => {
      const id = firstPresentAvatarField(avatar, ['modelID', 'itemName', 'id', 'name', 'friendlyName', 'modelName']);
      const name = firstPresentAvatarField(avatar, ['modelName', 'friendlyName', 'name', 'itemName', 'id', 'modelID']) || 'Unbenannter Avatar';
      return { id, name: `${platform}: ${name}` };
    }).filter(avatar => avatar.id);
  }

  function saveBundle() {
    const id = document.getElementById('bundleId').value.trim();
    if (!id) return notify('Bundle-ID fehlt', true);
    const bundle = {
      id, name: document.getElementById('bundleName').value.trim() || id,
      sidekickName: document.getElementById('bundleSidekickName').value.trim(),
      avatarName: document.getElementById('bundleAvatar').value,
      personalityId: document.getElementById('bundlePersonality').value,
      voiceId: document.getElementById('bundleVoice').value,
      emotion: document.getElementById('bundleEmotion').value.trim(),
      pitch: Number(document.getElementById('bundlePitch').value || 0),
      volume: Number(document.getElementById('bundleVolume').value || 80),
      speed: Number(document.getElementById('bundleSpeed').value || 1),
      priority: Number(document.getElementById('bundlePriority').value || state.config.tts.priority),
      giftIds: [...document.getElementById('bundleGifts').selectedOptions].map(option => option.value),
      giftNames: document.getElementById('bundleGiftNames').value.split(',').map(value => value.trim()).filter(Boolean)
    };
    const index = state.config.avatarBundles.findIndex(item => item.id === id);
    if (index >= 0) state.config.avatarBundles[index] = bundle;
    else state.config.avatarBundles.push(bundle);
    save('avatarBundles').catch(error => notify(error.message, true));
  }

  function editBundle(id) {
    const bundle = state.config.avatarBundles.find(item => item.id === id);
    if (!bundle) return;
    for (const [field, value] of Object.entries({ bundleId: bundle.id, bundleName: bundle.name, bundleSidekickName: bundle.sidekickName, bundleAvatar: bundle.avatarName, bundlePersonality: bundle.personalityId, bundleVoice: bundle.voiceId, bundleEmotion: bundle.emotion, bundlePitch: bundle.pitch, bundleVolume: bundle.volume, bundleSpeed: bundle.speed, bundlePriority: bundle.priority, bundleGiftNames: (bundle.giftNames || []).join(', ') })) {
      const element = document.getElementById(field); if (element) element.value = value ?? '';
    }
    const gifts = new Set(bundle.giftIds || bundle.gifts || []);
    for (const option of document.getElementById('bundleGifts').options) option.selected = gifts.has(option.value);
  }

  async function runGreetingWarmup() {
    const streamerId = document.getElementById('greetingWarmupStreamer')?.value?.trim() || get('viewerMemory.streamerId') || get('source.username') || 'pupcid';
    const limit = Math.max(1, Math.min(100, Number(document.getElementById('greetingWarmupLimit')?.value || 20)));
    const variants = Math.max(1, Math.min(3, Number(document.getElementById('greetingWarmupVariants')?.value || 3)));
    state.greetingWarmup.running = true;
    state.greetingWarmup.lastError = null;
    render();
    try {
      const result = await request('/api/animazingpal/live-host/greetings/warm', {
        method: 'POST',
        body: JSON.stringify({ streamerId, limit, variants })
      });
      state.greetingWarmup.lastResult = result;
      state.greetingWarmup.lastError = null;
      notify(`Begrüßungs-Warmup: ${result.generated || 0} Varianten generiert`);
    } catch (error) {
      state.greetingWarmup.lastError = error.message;
      notify(error.message, true);
    } finally {
      state.greetingWarmup.running = false;
      render();
    }
  }

  function bind() {
    document.querySelectorAll('[data-livehost-save]').forEach(button => button.onclick = () => save(button.dataset.livehostSave).catch(error => notify(error.message, true)));
    document.querySelectorAll('[data-livehost-reset]').forEach(button => button.onclick = async () => {
      if (!window.confirm(`Bereich ${button.dataset.livehostReset} wirklich zurücksetzen? API-Keys bleiben erhalten.`)) return;
      try { const body = await request('/api/animazingpal/live-host/reset', { method: 'POST', body: JSON.stringify({ section: button.dataset.livehostReset }) }); state.config = body.config; render(); } catch (error) { notify(error.message, true); }
    });
    document.querySelector('[data-preset]')?.addEventListener('click', async event => { try { const body = await request('/api/animazingpal/live-host/preset', { method: 'POST', body: JSON.stringify({ preset: event.currentTarget.dataset.preset }) }); state.config = body.config; render(); notify('24/7 Produktionsprofil angewendet'); } catch (error) { notify(error.message, true); } });
    document.querySelector('[data-speak-test]')?.addEventListener('click', () => request('/api/animazingpal/live-host/speak-test', { method: 'POST', body: JSON.stringify({ text: document.getElementById('liveHostTestText').value }) }).then(() => notify('Sprachtest gestartet')).catch(error => notify(error.message, true)));
    document.querySelector('[data-provider-test]')?.addEventListener('click', async () => {
      try {
        await save('providers');
        const result = await request('/api/animazingpal/brain/test', { method: 'POST', body: '{}' });
        notify(`Provider-Test erfolgreich${result.response ? `: ${result.response}` : ''}`);
      } catch (error) { notify(error.message, true); }
    });
    document.querySelector('[data-source-connect]')?.addEventListener('click', async () => {
      try {
        await save('source');
        const username = document.querySelector('[data-lh="source.username"]').value;
        const result = await request('/api/animazingpal/live-host/source/connect', { method: 'POST', body: JSON.stringify({ username }) });
        notify(`Lesend mit @${result.username} verbunden`);
      } catch (error) { notify(error.message, true); }
    });
    document.querySelector('[data-greeting-warmup]')?.addEventListener('click', () => runGreetingWarmup().catch(error => notify(error.message, true)));
    document.getElementById('liveHostPersonality')?.addEventListener('change', event => {
      if (!event.target.value) return;
      request('/api/animazingpal/brain/personality/set', { method: 'POST', body: JSON.stringify({ personality: event.target.value }) }).then(() => notify('Persönlichkeit aktiviert')).catch(error => notify(error.message, true));
    });
    document.querySelector('[data-refresh-devices]')?.addEventListener('click', () => loadDevices().then(render));
    document.querySelector('[data-refresh-input-devices]')?.addEventListener('click', () => loadHostInputDevices(true).then(render));
    document.querySelector('[data-asr-status]')?.addEventListener('click', () => refreshAsrStatus().then(() => notify('Host-STT Status aktualisiert')).catch(error => notify(error.message, true)));
    document.querySelector('[data-asr-start]')?.addEventListener('click', () => startHostAsr().catch(error => {
      state.hostAsr.lastError = error.message;
      render();
      notify(error.message, true);
    }));
    document.querySelector('[data-asr-stop]')?.addEventListener('click', stopHostAsr);
    document.querySelector('[data-refresh-livehost-health]')?.addEventListener('click', () => refreshLiveHostHealth().catch(error => notify(error.message, true)));
    document.querySelector('[data-movement-test]')?.addEventListener('click', () => runMovementTest().catch(error => notify(error.message, true)));
    document.querySelector('[data-tts-probe]')?.addEventListener('click', () => runTtsProbe().catch(error => notify(error.message, true)));
    document.querySelector('[data-pick-output-device]')?.addEventListener('click', () => pickOutputDevice().catch(error => notify(error.message, true)));
    document.querySelector('[data-preflight-check]')?.addEventListener('click', () => runPreflight().catch(error => notify(error.message, true)));
    document.querySelector('[data-bundle-save]')?.addEventListener('click', saveBundle);
    document.querySelectorAll('[data-bundle-edit]').forEach(button => button.onclick = () => editBundle(button.dataset.bundleEdit));
    document.querySelectorAll('[data-bundle-delete]').forEach(button => button.onclick = () => {
      state.config.avatarBundles = state.config.avatarBundles.filter(item => item.id !== button.dataset.bundleDelete);
      if (state.config.activeAvatarBundleId === button.dataset.bundleDelete) state.config.activeAvatarBundleId = '';
      save('avatarBundles').catch(error => notify(error.message, true));
    });
    document.querySelectorAll('[data-bundle-activate]').forEach(button => button.onclick = () => request('/api/animazingpal/live-host/avatar/activate', { method: 'POST', body: JSON.stringify({ bundleId: button.dataset.bundleActivate }) }).then(() => notify('Avatar-Bundle aktiviert')).catch(error => notify(error.message, true)));
    document.querySelectorAll('[data-clear-key]').forEach(button => button.onclick = () => request('/api/animazingpal/live-host/config', { method: 'POST', body: JSON.stringify({ providers: { [button.dataset.clearKey]: { clearApiKey: true } } }) }).then(body => { state.config = body.config; render(); notify('API-Key gelöscht'); }).catch(error => notify(error.message, true)));
  }

  async function initialize() {
    if (state.loaded) return;
    try {
      const [config, voices, gifts, status, personalities, ttsStatus, ttsQueue] = await Promise.all([
        request('/api/animazingpal/live-host/config'),
        request('/api/tts/voices?engine=fishaudio').catch(() => ({ voices: {} })),
        request('/api/gift-catalog').catch(() => ({ catalog: [] })),
        request('/api/animazingpal/status').catch(() => ({})),
        request('/api/animazingpal/brain/personalities').catch(() => ({ personalities: [] })),
        request('/api/tts/status').catch(() => ({})),
        request('/api/tts/queue').catch(() => ({}))
      ]);
      state.config = config.config;
      state.status = status || {};
      state.ttsStatus = ttsStatus || {};
      state.ttsQueue = ttsQueue || {};
      state.voices = normalizeVoices(voices);
      state.gifts = (gifts.catalog || []).map(item => ({
        id: String(item.id ?? item.giftId ?? item.gift_id),
        name: item.name || item.giftName || item.gift_name || item.id || item.gift_id
      }));
      state.personalities = (personalities.personalities || []).map(item => ({ id: item.name || item.id, name: item.displayName || item.name || item.id }));
      normalizeStatus(status);
      await loadDevices();
      await loadHostInputDevices(false);
      state.asrStatus = await request('/api/animazingpal/live-host/stt/status').then(body => body.status || {}).catch(() => ({}));
      state.loaded = true;
      render();
      startLiveHostHealthRefresh();
    } catch (error) {
      document.getElementById('liveHostSettings').innerHTML = `<div class="card text-red-400">Live-Host-Konfiguration konnte nicht geladen werden: ${escapeHtml(error.message)}</div>`;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('[data-tab="settings"]')?.addEventListener('click', initialize);
    document.querySelector('[data-tab="livehost"]')?.addEventListener('click', initialize);
    window.addEventListener('animazingpal:tts-playback-state', () => {
      if (state.loaded) render();
    });
  });
}());
