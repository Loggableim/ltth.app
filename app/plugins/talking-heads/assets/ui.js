(() => {
  'use strict';

  const state = { config: {}, catalog: null, preparedSprites: null };
  const MESSAGES = {
    configSaved: 'Lokale Figurenauswahl gespeichert.',
    framesPrepared: 'Lokale TTS-Frames erfolgreich vorbereitet.',
    previewStarted: 'TTS-Vorschau gestartet.',
    animationStarted: 'Animationstest gestartet.'
  };
  const el = (id) => document.getElementById(id);

  function message(key) {
    const translationKey = `plugins.talking-heads.talking_heads_ui.local_assets.messages.${key}`;
    if (window.i18n && typeof window.i18n.t === 'function') {
      return window.i18n.t(translationKey) || MESSAGES[key];
    }
    return MESSAGES[key];
  }

  function currentPack() {
    const packId = el('assetPack').value;
    return state.catalog?.packs?.find((pack) => pack.id === packId) || null;
  }

  function setStatus(message, isError = false) {
    const target = el('assetStatus');
    target.textContent = message;
    target.style.color = isError ? 'var(--color-accent-danger, #b91c1c)' : 'var(--color-text-secondary, #4b5563)';
  }

  function notify(message, type = 'success') {
    const toast = el('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.style.display = 'block';
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => { toast.style.display = 'none'; }, 3800);
  }

  function createOption(value, label = value) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    return option;
  }

  function renderPacks() {
    const select = el('assetPack');
    select.replaceChildren();
    for (const pack of state.catalog.packs) {
      select.append(createOption(pack.id, pack.name));
    }
    select.value = state.config.assetPack || 'boba';
    if (!select.value) select.selectedIndex = 0;
    renderCharacters(state.config.assetCharacter);
  }

  function renderCharacters(preferredCharacter) {
    const pack = currentPack();
    const select = el('assetCharacter');
    select.replaceChildren();
    for (const character of pack.characters) {
      select.append(createOption(character));
    }
    select.value = preferredCharacter || pack.characters[0];
    if (!select.value) select.selectedIndex = 0;
    renderOptions(state.config.assetOptions || {});
    updateSummary();
  }

  function titleForOption(key) {
    return ({ eye: 'Augen', eyes: 'Augen', hair: 'Haare', mouth: 'Mund' })[key] || key;
  }

  function renderOptions(savedOptions) {
    const pack = currentPack();
    const container = el('assetOptions');
    container.replaceChildren();
    for (const [key, values] of Object.entries(pack.options || {})) {
      if (key === 'body' || key === 'head') continue;
      const group = document.createElement('div');
      group.className = 'form-group';
      const label = document.createElement('label');
      label.className = 'form-label';
      label.htmlFor = `assetOption_${key}`;
      label.textContent = titleForOption(key);
      const select = document.createElement('select');
      select.className = 'form-select';
      select.id = `assetOption_${key}`;
      select.dataset.optionKey = key;
      for (const value of values) select.append(createOption(value));
      select.value = savedOptions[key] || values[0];
      if (!select.value) select.selectedIndex = 0;
      select.addEventListener('change', updateSummary);
      group.append(label, select);
      container.append(group);
    }
  }

  function readSelection() {
    const options = {};
    document.querySelectorAll('[data-option-key]').forEach((select) => {
      options[select.dataset.optionKey] = select.value;
    });
    return {
      assetPack: el('assetPack').value,
      assetCharacter: el('assetCharacter').value,
      assetOptions: options
    };
  }

  function readConfig() {
    return {
      ...readSelection(),
      enabled: el('enabled').checked,
      requireSubscriber: el('requireSubscriber').checked,
      requireCustomVoice: el('requireCustomVoice').checked,
      rolePermission: el('rolePermission').value,
      animationDuration: Number(el('animationDuration').value) || 5000,
      avatarLotteryEnabled: el('avatarLotteryEnabled').checked,
      lotteryGiftId: el('lotteryGiftId').value.trim(),
      lotteryGiftNames: el('lotteryGiftNames').value.split(',').map((name) => name.trim()).filter(Boolean),
      lotteryAnimationDuration: Number(el('lotteryAnimationDuration').value) || 2600
    };
  }

  function updateSummary() {
    const pack = currentPack();
    const selection = readSelection();
    const parts = [pack?.name, selection.assetCharacter];
    for (const value of Object.values(selection.assetOptions)) parts.push(value);
    el('assetSelectionSummary').textContent = parts.filter(Boolean).join(' · ');
  }

  function applyConfig(config) {
    state.config = { ...state.config, ...config };
    el('enabled').checked = Boolean(state.config.enabled);
    el('requireSubscriber').checked = Boolean(state.config.requireSubscriber);
    el('requireCustomVoice').checked = Boolean(state.config.requireCustomVoice);
    el('rolePermission').value = state.config.rolePermission || 'all';
    el('animationDuration').value = state.config.animationDuration || 5000;
    el('avatarLotteryEnabled').checked = state.config.avatarLotteryEnabled !== false;
    el('lotteryGiftId').value = state.config.lotteryGiftId || '';
    el('lotteryGiftNames').value = (state.config.lotteryGiftNames || ['Heart Me', 'Team Heart', 'Team Herz']).join(', ');
    el('lotteryAnimationDuration').value = state.config.lotteryAnimationDuration || 2600;
    renderPacks();
  }

  async function postJson(url, body = {}) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) throw new Error(data.error || 'Die Anfrage ist fehlgeschlagen.');
    return data;
  }

  function showPreparedSprites(spriteUrls) {
    state.preparedSprites = spriteUrls;
    if (spriteUrls?.idle_neutral) el('assetPreview').src = spriteUrls.idle_neutral;
  }

  async function saveConfig({ quiet = false } = {}) {
    const button = el('saveConfigBtn');
    button.disabled = true;
    try {
      const data = await postJson('/api/talkingheads/config', readConfig());
      state.catalog = data.assetCatalog || state.catalog;
      applyConfig(data.config);
      if (!quiet) {
        setStatus('Auswahl gespeichert.');
        notify(message('configSaved'));
      }
      return data;
    } finally {
      button.disabled = false;
    }
  }

  async function prepareAssets() {
    const button = el('prepareAssetBtn');
    button.disabled = true;
    setStatus('Lokale Frames werden vorbereitet …');
    try {
      const data = await postJson('/api/talkingheads/test-generate', readSelection());
      showPreparedSprites(data.spriteUrls);
      setStatus(`Fertig: ${data.sprites} lokale TTS-Frames bereit.`);
      notify(message('framesPrepared'));
    } catch (error) {
      setStatus(error.message, true);
      notify(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function previewTts() {
    const button = el('previewTtsBtn');
    button.disabled = true;
    try {
      await saveConfig({ quiet: true });
      const data = await postJson('/api/talkingheads/preview-tts', {
        ...readSelection(),
        text: el('previewText').value
      });
      setStatus(`TTS-Vorschau gestartet (${data.assetSelection.packId} / ${data.assetSelection.characterId}).`);
      notify(message('previewStarted'));
    } catch (error) {
      setStatus(error.message, true);
      notify(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function testAnimation() {
    const button = el('testAnimationBtn');
    button.disabled = true;
    try {
      await saveConfig({ quiet: true });
      await postJson('/api/talkingheads/test-animation', {
        ...readSelection(),
        userId: 'talkingheads_local_test',
        username: 'Lokale Vorschau',
        duration: Number(el('animationDuration').value) || 5000
      });
      setStatus('Animation an das Overlay gesendet.');
      notify(message('animationStarted'));
    } catch (error) {
      setStatus(error.message, true);
      notify(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function initialize() {
    try {
      setStatus('Lokale Bibliotheken werden geladen …');
      const response = await fetch('/api/talkingheads/config');
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Konfiguration konnte nicht geladen werden.');
      state.catalog = data.assetCatalog;
      applyConfig(data.config || {});
      setStatus('Bereit – keine Bild-API erforderlich.');
    } catch (error) {
      setStatus(error.message, true);
      notify(error.message, 'error');
    }

    el('assetPack').addEventListener('change', () => {
      renderCharacters();
      state.preparedSprites = null;
      el('assetPreview').removeAttribute('src');
    });
    el('assetCharacter').addEventListener('change', updateSummary);
    el('saveConfigBtn').addEventListener('click', () => saveConfig().catch((error) => notify(error.message, 'error')));
    el('prepareAssetBtn').addEventListener('click', prepareAssets);
    el('previewTtsBtn').addEventListener('click', previewTts);
    el('testAnimationBtn').addEventListener('click', testAnimation);
  }

  document.addEventListener('DOMContentLoaded', initialize);
})();
