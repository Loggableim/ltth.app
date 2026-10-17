(function (root) {
  'use strict';

  const NUMBER_FIELDS = new Set([
    'jarWidth', 'jarHeight', 'jarX', 'jarY', 'iconScale', 'maxPhysicalIcons',
    'giftSize1', 'giftSize2To10', 'giftSize11To29', 'giftSize30To99', 'giftSize100To199',
    'giftSize200To499', 'giftSize500To999', 'giftSize1000To1999', 'giftSize2000To4999',
    'giftSize5000Plus', 'spawnMultiplier', 'spawnDelayMs', 'soundVolume', 'jarOpacity',
    'counterFontSize'
  ]);

  class SchnorrbecherAdmin {
    constructor(dependencies = {}) {
      this.document = dependencies.document || root.document;
      this.fetch = dependencies.fetch || root.fetch?.bind(root);
      this.location = dependencies.location || root.location;
      this.confirm = dependencies.confirm || root.confirm?.bind(root) || (() => true);
      this.clipboard = dependencies.clipboard || root.navigator?.clipboard;
      this.socket = dependencies.socket || (typeof root.io === 'function' ? root.io() : null);
      this.config = {};
      this.i18nReady = root.i18n?.ready || Promise.resolve();
    }

    tr(key, params = {}) {
      const fullKey = `plugins.schnorrbecher.legacy.${key}`;
      const translated = root.i18n?.t?.(fullKey, params);
      return translated && translated !== fullKey ? translated : fullKey;
    }

    query(selector) {
      return this.document?.querySelector?.(selector) || null;
    }

    renderStatus(status = {}) {
      const formatter = new Intl.NumberFormat();
      const state = status.state || {};
      const setText = (selector, value) => {
        const element = this.query(selector);
        if (element) element.textContent = value;
      };
      setText('#total-value', formatter.format(state.totalCoinValue || 0));
      setText('#physical-count', String(status.physicalCoinCount || 0));
      setText('#pending-count', String(status.pendingSpawns || 0));
      setText('#connection-status', 'Verbunden');
      setText('#livestream-status', status.livestreamStatus === 'active' ? 'LIVE' : 'Wartet auf LIVE');

      const overlayUrl = this.query('#overlay-url');
      if (overlayUrl) overlayUrl.value = `${this.location.origin}/overlay/coincup?transparent=1`;
      if (status.config) this.renderConfig(status.config);
    }

    renderConfig(config = {}) {
      this.config = { ...this.config, ...config };
      const form = this.query('#coin-jar-config');
      if (!form) return;
      for (const [key, value] of Object.entries(this.config)) {
        const element = form.elements.namedItem(key);
        if (!element) continue;
        if (element.type === 'checkbox') element.checked = value === true;
        else element.value = value ?? '';
      }
      const preview = this.query('#overlay-preview');
      if (preview && !preview.src) preview.src = `${this.location.origin}/overlay/coincup?transparent=1&showCounter=1`;
    }

    async request(url, options = {}) {
      if (!this.fetch) throw new Error('Fetch is unavailable');
      const response = await this.fetch(url, options);
      if (!response.ok) throw new Error(`Request failed: ${url}`);
      return response.json();
    }

    post(url, body = {}) {
      return this.request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    }

    async load() {
      await this.i18nReady;
      root.i18n?.updateDOM?.();
      const state = await this.request('/api/coin-jar/state');
      this.renderStatus(state);
      this.bind();
      this.refreshLegacyStatus();
      return state;
    }

    async refreshLegacyStatus() {
      const status = await this.request('/api/coin-jar/legacy-data/status');
      const panel = this.query('#legacy-data-panel');
      if (panel) panel.hidden = !status.hasLegacyData;
      const message = this.query('#legacy-data-status');
      if (message && status.hasLegacyData) {
        message.textContent = this.tr('found', { profile: status.targetProfile || this.tr('activeProfile'), config: this.tr(status.targetConfigExists ? 'yes' : 'no'), state: this.tr(status.targetStateExists ? 'yes' : 'no') });
      }
      return status;
    }

    async previewLegacyData() {
      const preview = await this.request('/api/coin-jar/legacy-data/preview');
      const panel = this.query('#legacy-data-preview');
      if (panel) panel.hidden = false;
      const config = this.query('#import-legacy-config');
      const state = this.query('#import-legacy-state');
      if (config) { config.disabled = !preview.config.canImport; config.checked = false; }
      if (state) { state.disabled = !preview.state.importAllowed; state.checked = false; }
      const text = this.query('#legacy-data-preview-text');
      if (text) text.textContent = this.tr('preview', { config: this.tr(preview.config.available ? (preview.config.canImport ? 'available' : 'conflict') : 'missing'), state: preview.state.available ? this.tr('stateValue', { value: preview.state.totalCoinValue, note: preview.state.note }) : this.tr('missing') });
      return preview;
    }

    async importLegacyData() {
      const includeConfig = this.query('#import-legacy-config')?.checked === true;
      const includePersistentState = this.query('#import-legacy-state')?.checked === true;
      if (!includeConfig && !includePersistentState) throw new Error(this.tr('selectAtLeastOne'));
      if (!this.confirm(this.tr('confirm'))) return null;
      const result = await this.post('/api/coin-jar/legacy-data/import', { confirm: true, includeConfig, includePersistentState });
      this.showMessage(this.tr('complete'), 'success');
      return result;
    }

    bind() {
      const bindClick = (selector, callback) => this.query(selector)?.addEventListener('click', async () => {
        try {
          await callback();
          await this.refreshStatus();
        } catch (error) {
          this.showMessage(error.message, 'error');
        }
      });
      bindClick('#test-gift', () => this.triggerTestGift());
      bindClick('#add-coins', () => this.addCoins());
      bindClick('#reset-coin-jar', () => this.reset());
      bindClick('#clear-event-cache', () => this.clearEventCache());
      bindClick('#copy-overlay-url', () => this.copyOverlayUrl());
      bindClick('#preview-legacy-data', () => this.previewLegacyData());
      bindClick('#import-legacy-data', () => this.importLegacyData());

      this.query('#coin-jar-config')?.addEventListener('submit', async event => {
        event.preventDefault();
        try {
          await this.saveConfig();
          this.showMessage('Konfiguration gespeichert.', 'success');
        } catch (error) {
          this.showMessage(error.message, 'error');
        }
      });

      if (this.socket?.on) {
        this.socket.on('coinJar.sync', payload => this.renderStatus({
          state: payload,
          config: payload.config,
          livestreamStatus: payload.livestreamStatus
        }));
        this.socket.on('coinJar.config', config => this.renderConfig(config));
        this.socket.on('connect', () => this.socket.emit('coinJar.sync.request'));
      }
    }

    collectConfig() {
      const form = this.query('#coin-jar-config');
      if (!form) return {};
      const result = {};
      for (const element of form.elements) {
        if (!element.name || element.disabled) continue;
        if (element.type === 'checkbox') result[element.name] = element.checked;
        else if (NUMBER_FIELDS.has(element.name)) result[element.name] = Number(element.value);
        else result[element.name] = element.value;
      }
      return result;
    }

    async saveConfig() {
      const response = await this.post('/api/coin-jar/config', this.collectConfig());
      this.renderConfig(response.config || {});
      return response;
    }

    triggerTestGift() {
      const value = Number(this.query('#test-gift-value')?.value) || 100;
      return this.post('/api/coin-jar/test-gift', { value, giftName: 'Test Gift', senderName: 'LTTH Test' });
    }

    addCoins() {
      return this.post('/api/coin-jar/test-gift', { value: 100, senderName: 'LTTH Test' });
    }

    reset() {
      const confirmationRequired = this.config.requireResetConfirmation !== false;
      if (confirmationRequired && !this.confirm('Coin Jar wirklich vollständig zurücksetzen?')) return Promise.resolve(null);
      return this.post('/api/coin-jar/reset', { reason: 'admin' });
    }

    clearEventCache() {
      return this.post('/api/coin-jar/event-cache/clear');
    }

    async refreshStatus() {
      const state = await this.request('/api/coin-jar/state');
      this.renderStatus(state);
      return state;
    }

    async copyOverlayUrl() {
      const input = this.query('#overlay-url');
      if (!input) return;
      input.select();
      if (this.clipboard?.writeText) await this.clipboard.writeText(input.value);
      else this.document.execCommand?.('copy');
      this.showMessage('Overlay-URL kopiert.', 'success');
    }

    showMessage(message, level = 'success') {
      const element = this.query('#admin-message');
      if (!element) return;
      element.textContent = message;
      element.dataset.level = level;
    }
  }

  const exports = { SchnorrbecherAdmin };
  if (typeof module !== 'undefined' && module.exports) module.exports = exports;
  root.SchnorrbecherAdmin = SchnorrbecherAdmin;

  if (root.document && typeof module === 'undefined') {
    root.addEventListener('DOMContentLoaded', () => {
      const admin = new SchnorrbecherAdmin();
      root.__schnorrbecherAdmin = admin;
      admin.load().catch(error => admin.showMessage(error.message, 'error'));
    });
  }
}(typeof window !== 'undefined' ? window : globalThis));
