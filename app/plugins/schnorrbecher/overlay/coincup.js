(function (root) {
  'use strict';

  const DEFAULT_RENDER_CONFIG = {
    enabled: true,
    jarWidth: 460,
    jarHeight: 580,
    jarX: 50,
    jarY: 82,
    iconScale: 1,
    maxPhysicalIcons: 300,
    spawnMultiplier: 1,
    spawnDelayMs: 80,
    showCounter: true,
    showGiftPopup: true,
    showSenderName: true,
    showGiftImage: true,
    counterLabel: 'Gifts',
    jarLabel: 'Schnorr Becher',
    physicsEnabled: true,
    soundEnabled: false,
    soundVolume: 0.35,
    jarBorderColor: '#f6d365',
    jarOpacity: 0.22,
    counterFontFamily: 'Arial, sans-serif',
    counterFontSize: 42,
    counterColor: '#ffffff'
  };

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function calculateJarBounds(viewport, config) {
    const width = finiteNumber(config.jarWidth, DEFAULT_RENDER_CONFIG.jarWidth);
    const height = finiteNumber(config.jarHeight, DEFAULT_RENDER_CONFIG.jarHeight);
    const centerX = viewport.width * (finiteNumber(config.jarX, DEFAULT_RENDER_CONFIG.jarX) / 100);
    const centerY = viewport.height * (finiteNumber(config.jarY, DEFAULT_RENDER_CONFIG.jarY) / 100);
    return {
      left: Math.round(centerX - width / 2),
      right: Math.round(centerX + width / 2),
      top: Math.round(centerY - height),
      bottom: Math.round(centerY),
      width,
      height,
      centerX: Math.round(centerX),
      centerY: Math.round(centerY)
    };
  }

  function calculateCoinSize(value, scale) {
    const safeValue = Math.max(1, finiteNumber(value, 1));
    const safeScale = clamp(finiteNumber(scale, 1), 0.25, 3);
    const base = 34 + Math.log10(safeValue) * 18;
    return Math.round(clamp(base * safeScale, 34, 180));
  }

  function planVisualCoins(payload, config, currentCount) {
    const maximum = Math.max(1, Math.floor(finiteNumber(config.maxPhysicalIcons, 300)));
    const requested = Math.max(1, Math.floor(finiteNumber(payload.visualCoins, 1)));
    const available = Math.max(0, maximum - currentCount);
    return {
      requested,
      spawnCount: Math.min(requested, available),
      compact: requested > available,
      overflow: currentCount + requested >= maximum
    };
  }

  function parseQueryConfig(location) {
    if (!location || !location.search) return {};
    const query = new URLSearchParams(location.search);
    const config = {};
    if (query.has('showCounter')) config.showCounter = query.get('showCounter') !== '0';
    if (query.has('maxCoins')) config.maxPhysicalIcons = finiteNumber(query.get('maxCoins'), DEFAULT_RENDER_CONFIG.maxPhysicalIcons);
    if (query.has('scale')) config.iconScale = finiteNumber(query.get('scale'), DEFAULT_RENDER_CONFIG.iconScale);
    if (query.has('debug')) config.debug = query.get('debug') === '1';
    return config;
  }

  class CoinJarOverlay {
    constructor(dependencies = {}) {
      this.window = dependencies.window || root;
      this.document = dependencies.document || root.document;
      this.Matter = dependencies.Matter || root.Matter;
      this.socket = dependencies.socket || (typeof root.io === 'function'
        ? root.io({ reconnectionDelay: 1000, reconnectionDelayMax: 30000 })
        : null);
      this.AudioContext = dependencies.AudioContext || root.AudioContext || root.webkitAudioContext;
      this.random = dependencies.random || Math.random;
      this.setTimeoutFn = dependencies.setTimeoutFn || root.setTimeout.bind(root);
      this.clearTimeoutFn = dependencies.clearTimeoutFn || root.clearTimeout.bind(root);
      this.requestAnimationFrame = dependencies.requestAnimationFrame || root.requestAnimationFrame?.bind(root);
      this.cancelAnimationFrame = dependencies.cancelAnimationFrame || root.cancelAnimationFrame?.bind(root);
      this.config = { ...DEFAULT_RENDER_CONFIG, ...parseQueryConfig(this.window.location) };
      this.generation = 0;
      this.queue = [];
      this.bodies = [];
      this.walls = [];
      this.spawnTimer = null;
      this.counterFrame = null;
      this.counterValue = 0;
      this.counterTarget = 0;
      this.lastSoundAt = 0;
      this.bounds = null;
      this.elements = {};
      this._boundResize = () => this.resize();

      this._findElements();
      if (this.Matter && this.document && this.config.physicsEnabled !== false) {
        this._initializePhysics();
      }
      if (this.window?.addEventListener) this.window.addEventListener('resize', this._boundResize);
      this.bindSocket();
      this.applyConfig(this.config);
    }

    _findElements() {
      if (!this.document?.getElementById) return;
      this.elements = {
        scene: this.document.getElementById('coin-jar-scene'),
        jar: this.document.getElementById('coin-jar'),
        jarLabel: this.document.querySelector?.('.jar-label'),
        counter: this.document.getElementById('coin-jar-counter'),
        sprites: this.document.getElementById('coin-jar-sprites'),
        popup: this.document.getElementById('gift-popup'),
        debug: this.document.getElementById('coin-jar-debug')
      };
    }

    _initializePhysics() {
      const { Engine, Runner, Events } = this.Matter;
      this.engine = Engine.create({ gravity: { x: 0, y: 1, scale: 0.001 } });
      this.runner = Runner.create();
      Runner.run(this.runner, this.engine);
      Events.on(this.engine, 'afterUpdate', () => this._updateBodies());
      Events.on(this.engine, 'collisionStart', event => this._handleCollisions(event));
      this.resize();
    }

    _viewport() {
      return {
        width: finiteNumber(this.window?.innerWidth, 1920),
        height: finiteNumber(this.window?.innerHeight, 1080)
      };
    }

    resize() {
      this.bounds = calculateJarBounds(this._viewport(), this.config);
      const { jar, scene } = this.elements;
      if (scene?.style) {
        scene.style.setProperty('--jar-left', `${this.bounds.left}px`);
        scene.style.setProperty('--jar-top', `${this.bounds.top}px`);
        scene.style.setProperty('--jar-width', `${this.bounds.width}px`);
        scene.style.setProperty('--jar-height', `${this.bounds.height}px`);
      }
      if (jar?.style) {
        jar.style.width = `${this.bounds.width}px`;
        jar.style.height = `${this.bounds.height}px`;
        jar.style.left = `${this.bounds.centerX}px`;
        jar.style.top = `${this.bounds.bottom}px`;
      }
      this._rebuildWalls();
    }

    _rebuildWalls() {
      if (!this.engine || !this.Matter || !this.bounds) return;
      const { Bodies, Composite } = this.Matter;
      for (const wall of this.walls) Composite.remove(this.engine.world, wall);
      const thickness = 24;
      const centerY = (this.bounds.top + this.bounds.bottom) / 2;
      this.walls = [
        Bodies.rectangle(this.bounds.left - thickness / 2, centerY, thickness, this.bounds.height + thickness, { isStatic: true }),
        Bodies.rectangle(this.bounds.right + thickness / 2, centerY, thickness, this.bounds.height + thickness, { isStatic: true }),
        Bodies.rectangle(this.bounds.centerX, this.bounds.bottom + thickness / 2, this.bounds.width + thickness * 2, thickness, { isStatic: true })
      ];
      Composite.add(this.engine.world, this.walls);
    }

    applyConfig(config = {}) {
      this.config = { ...this.config, ...(config || {}) };
      this.config.maxPhysicalIcons = Math.floor(clamp(finiteNumber(this.config.maxPhysicalIcons, 300), 20, 600));
      this.config.iconScale = clamp(finiteNumber(this.config.iconScale, 1), 0.25, 3);
      this.config.spawnMultiplier = clamp(finiteNumber(this.config.spawnMultiplier, 1), 0.1, 5);
      this.config.spawnDelayMs = Math.floor(clamp(finiteNumber(this.config.spawnDelayMs, 80), 20, 1000));
      this.config.jarOpacity = clamp(finiteNumber(this.config.jarOpacity, 0.22), 0, 1);
      const { scene, jar, jarLabel, counter, debug } = this.elements;
      if (scene?.style) {
        scene.style.setProperty('--jar-border-color', this.config.jarBorderColor || DEFAULT_RENDER_CONFIG.jarBorderColor);
        scene.style.setProperty('--jar-opacity', this.config.jarOpacity);
      }
      if (jarLabel) jarLabel.textContent = this.config.jarLabel || '';
      if (counter?.style) {
        counter.style.display = this.config.showCounter === false ? 'none' : '';
        counter.style.fontFamily = this.config.counterFontFamily || DEFAULT_RENDER_CONFIG.counterFontFamily;
        counter.style.fontSize = `${finiteNumber(this.config.counterFontSize, 42)}px`;
        counter.style.color = this.config.counterColor || DEFAULT_RENDER_CONFIG.counterColor;
      }
      if (debug?.style) debug.style.display = this.config.debug ? 'block' : 'none';
      this.resize();
      this._renderCounter(true);
    }

    bindSocket() {
      if (!this.socket?.on) return;
      this.socket.on('connect', () => this.socket.emit('coinJar.sync.request'));
      this.socket.on('coinJar.sync', payload => this.applySync(payload));
      this.socket.on('coinJar.add', payload => this.enqueueSpawn(payload));
      this.socket.on('coinJar.reset', payload => this.clear(payload));
      this.socket.on('coinJar.config', payload => this.applyConfig(payload));
    }

    applySync(payload = {}) {
      if (payload.config) this.applyConfig(payload.config);
      this.clear({ generation: payload.generation, preserveCounter: true, useIncomingGeneration: true });
      this.generation = Math.max(this.generation, finiteNumber(payload.generation, this.generation));
      this.counterValue = finiteNumber(payload.totalCoinValue, 0);
      this.counterTarget = this.counterValue;
      this._renderCounter(true);
      const count = Math.min(this.config.maxPhysicalIcons, Math.max(0, Math.floor(finiteNumber(payload.visualCoinCount, 0))));
      for (let index = 0; index < count; index += 1) {
        this._createCoin({
          totalValue: Math.max(1, finiteNumber(payload.totalCoinValue, 1) / Math.max(1, count)),
          giftName: 'Coin',
          visualCoins: 1,
          generation: this.generation
        }, { settled: true, overflow: false, tier: index > 180 ? 1 : 0 });
      }
      this._emitTelemetry();
    }

    enqueueSpawn(payload = {}) {
      if (finiteNumber(payload.generation, this.generation) < this.generation || this.config.enabled === false) return;
      if (payload.generation !== undefined) this.generation = Math.max(this.generation, finiteNumber(payload.generation, this.generation));
      this.counterTarget = Math.max(this.counterTarget, finiteNumber(payload.totalCoinValue, this.counterTarget));
      this._renderCounter();
      if (this.config.showGiftPopup !== false) this._showGiftPopup(payload);

      const requested = Math.max(1, Math.floor(finiteNumber(payload.visualCoins, 1)));
      this._compactFor(requested);
      const plan = planVisualCoins(payload, this.config, this.bodies.length);
      const count = Math.min(requested, Math.max(0, this.config.maxPhysicalIcons - this.bodies.length));
      const overflow = plan.overflow || this._isJarFull();
      for (let index = 0; index < count; index += 1) {
        this.queue.push({ payload, generation: this.generation, overflow, tier: 0 });
      }
      this._scheduleSpawn();
      this._emitTelemetry();
    }

    _compactFor(requested) {
      const limit = this.config.maxPhysicalIcons;
      while (this.bodies.length + requested > limit && this._compactBodies()) {
        // Each compaction replaces ten small bodies with a larger representative body.
      }
    }

    _compactBodies() {
      const candidates = this.bodies
        .filter(body => !body.plugin?.overflow && (body.plugin?.tier || 0) < 2)
        .sort((left, right) => (left.plugin?.tier || 0) - (right.plugin?.tier || 0));
      if (candidates.length < 10) return false;
      const group = candidates.slice(0, 10);
      const tier = Math.min(2, (group[0].plugin?.tier || 0) + 1);
      const average = group.reduce((result, body) => ({
        x: result.x + body.position.x / group.length,
        y: result.y + body.position.y / group.length
      }), { x: 0, y: 0 });
      for (const body of group) this._removeBody(body);
      this._createCoin({ totalValue: 10, giftName: 'Compressed Coin', visualCoins: 1 }, {
        settled: true,
        tier,
        position: average,
        overflow: false
      });
      return true;
    }

    _isJarFull() {
      const inJar = this.bodies.filter(body => !body.plugin?.overflow).length;
      return inJar >= Math.max(24, Math.floor(this.config.maxPhysicalIcons * 0.8));
    }

    _scheduleSpawn() {
      if (this.spawnTimer || this.queue.length === 0) return;
      const item = this.queue.shift();
      const delay = Math.round((40 + this.random() * 80) * this.config.spawnMultiplier);
      this.spawnTimer = this.setTimeoutFn(() => {
        this.spawnTimer = null;
        if (item.generation === this.generation) this._createCoin(item.payload, item);
        this._emitTelemetry();
        this._scheduleSpawn();
      }, delay);
    }

    _createCoin(payload = {}, options = {}) {
      if (!this.engine || !this.Matter || !this.bounds || this.bodies.length >= this.config.maxPhysicalIcons) return null;
      const { Bodies, Body, Composite } = this.Matter;
      const tier = options.tier || 0;
      const size = calculateCoinSize(payload.totalValue, this.config.iconScale) * (1 + tier * 0.35);
      const overflow = options.overflow === true;
      const side = this.random() < 0.5 ? -1 : 1;
      const x = options.position?.x ?? (overflow
        ? (side < 0 ? this.bounds.left - 50 - this.random() * 160 : this.bounds.right + 50 + this.random() * 160)
        : this.bounds.left + size / 2 + this.random() * Math.max(1, this.bounds.width - size));
      const y = options.position?.y ?? (options.settled
        ? this.bounds.top + size + this.random() * Math.max(1, this.bounds.height - size * 2)
        : this.bounds.top - 30 - this.random() * 120);
      const body = Bodies.circle(x, y, size / 2, {
        restitution: 0.15,
        friction: 0.35,
        frictionAir: 0.01,
        density: 0.002,
        angle: this.random() * Math.PI * 2
      });
      Body.setVelocity(body, { x: -1.5 + this.random() * 3, y: options.settled ? 0 : this.random() * 0.4 });
      Body.setAngularVelocity(body, -0.08 + this.random() * 0.16);
      body.plugin = {
        element: this._createSprite(payload, size, tier),
        tier,
        overflow,
        value: finiteNumber(payload.totalValue, 1)
      };
      Composite.add(this.engine.world, body);
      this.bodies.push(body);
      return body;
    }

    _createSprite(payload, size, tier) {
      if (!this.elements.sprites || !this.document?.createElement) return null;
      const element = this.document.createElement('div');
      element.className = `coin-sprite coin-tier-${tier}`;
      element.style.width = `${size}px`;
      element.style.height = `${size}px`;
      element.setAttribute('aria-label', payload.giftName || 'Gift');
      if (this.config.showGiftImage !== false && payload.giftImage) {
        const image = this.document.createElement('img');
        image.src = payload.giftImage;
        image.alt = '';
        image.addEventListener('error', () => {
          image.remove();
          element.classList.add('coin-fallback');
          element.textContent = '✦';
        }, { once: true });
        element.appendChild(image);
      } else {
        element.classList.add('coin-fallback');
        element.textContent = '✦';
      }
      this.elements.sprites.appendChild(element);
      return element;
    }

    _updateBodies() {
      if (!this.bounds) return;
      const maximumSpeed = 18;
      const margin = 320;
      for (const body of [...this.bodies]) {
        const speed = Math.hypot(body.velocity.x, body.velocity.y);
        if (speed > maximumSpeed && this.Matter?.Body) {
          this.Matter.Body.setVelocity(body, {
            x: body.velocity.x / speed * maximumSpeed,
            y: body.velocity.y / speed * maximumSpeed
          });
        }
        if (body.position.x < -margin || body.position.x > this._viewport().width + margin || body.position.y > this._viewport().height + margin) {
          this._removeBody(body);
          continue;
        }
        const element = body.plugin?.element;
        if (element?.style) {
          element.style.transform = `translate3d(${body.position.x - body.circleRadius}px, ${body.position.y - body.circleRadius}px, 0) rotate(${body.angle}rad)`;
        }
      }
      this._renderDebug();
    }

    _removeBody(body) {
      if (this.Matter?.Composite && this.engine) this.Matter.Composite.remove(this.engine.world, body);
      body.plugin?.element?.remove?.();
      this.bodies = this.bodies.filter(candidate => candidate !== body);
    }

    _handleCollisions(event) {
      if (event.pairs?.some(pair => pair.bodyA.plugin || pair.bodyB.plugin)) this._playImpactSound(event);
    }

    _playImpactSound(event) {
      if (this.config.soundEnabled !== true || !this.AudioContext) return;
      const now = Date.now();
      if (now - this.lastSoundAt < 110) return;
      this.lastSoundAt = now;
      try {
        this.audioContext = this.audioContext || new this.AudioContext();
        const oscillator = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        const largeGift = event.pairs?.some(pair => Math.max(pair.bodyA.plugin?.value || 0, pair.bodyB.plugin?.value || 0) >= 500);
        oscillator.frequency.value = largeGift ? 720 : 520;
        gain.gain.value = clamp(finiteNumber(this.config.soundVolume, 0.35), 0, 1) * 0.08;
        oscillator.connect(gain).connect(this.audioContext.destination);
        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + 0.06);
      } catch (_) {
        // Browser sources can reject audio until a gesture; the visual must continue silently.
      }
    }

    _showGiftPopup(payload) {
      const popup = this.elements.popup;
      if (!popup) return;
      const sender = this.config.showSenderName === false ? '' : (payload.senderName ? `${payload.senderName} ` : '');
      popup.textContent = `${sender}${payload.giftName || 'Gift'} +${finiteNumber(payload.totalValue, 0).toLocaleString()}`;
      popup.hidden = false;
      if (this.popupTimer) this.clearTimeoutFn(this.popupTimer);
      this.popupTimer = this.setTimeoutFn(() => { popup.hidden = true; }, 2400);
    }

    setCounter(value) {
      this.counterTarget = Math.max(0, finiteNumber(value, 0));
      this._renderCounter();
    }

    _renderCounter(immediate = false) {
      if (immediate) this.counterValue = this.counterTarget;
      if (!immediate && Math.abs(this.counterTarget - this.counterValue) > 0.5) {
        this.counterValue += (this.counterTarget - this.counterValue) * 0.2;
      } else {
        this.counterValue = this.counterTarget;
      }
      const counter = this.elements?.counter;
      if (counter) counter.textContent = `${Math.round(this.counterValue).toLocaleString()} ${this.config.counterLabel || ''}`.trim();
      if (!immediate && this.counterValue !== this.counterTarget && this.requestAnimationFrame) {
        if (this.counterFrame) this.cancelAnimationFrame?.(this.counterFrame);
        this.counterFrame = this.requestAnimationFrame(() => this._renderCounter());
      }
    }

    _emitTelemetry() {
      this.socket?.emit?.('coinJar.telemetry', {
        physicalCoinCount: this.bodies.length,
        pendingSpawns: this.queue.length + (this.spawnTimer ? 1 : 0)
      });
      this._renderDebug();
    }

    _renderDebug() {
      if (this.elements?.debug && this.config?.debug) {
        this.elements.debug.textContent = `Bodies: ${this.bodies.length} · Queue: ${this.queue.length} · Gen: ${this.generation}`;
      }
    }

    clear(payload = {}) {
      const incomingGeneration = finiteNumber(payload.generation, this.generation + 1);
      this.generation = payload.useIncomingGeneration === true
        ? incomingGeneration
        : Math.max(this.generation + 1, incomingGeneration);
      if (this.spawnTimer) this.clearTimeoutFn(this.spawnTimer);
      if (this.popupTimer) this.clearTimeoutFn(this.popupTimer);
      this.spawnTimer = null;
      this.popupTimer = null;
      this.queue = [];
      for (const body of [...(this.bodies || [])]) this._removeBody(body);
      this.bodies = [];
      if (payload.preserveCounter !== true) {
        this.counterValue = 0;
        this.counterTarget = 0;
        this._renderCounter?.(true);
      }
      if (this.elements?.popup) this.elements.popup.hidden = true;
      this._emitTelemetry?.();
    }

    destroy() {
      this.clear({ preserveCounter: true });
      if (this.counterFrame) this.cancelAnimationFrame?.(this.counterFrame);
      if (this.window?.removeEventListener) this.window.removeEventListener('resize', this._boundResize);
      if (this.Matter?.Runner && this.runner) this.Matter.Runner.stop(this.runner);
      if (this.Matter?.Engine && this.engine) this.Matter.Engine.clear(this.engine);
    }
  }

  const exports = { calculateJarBounds, calculateCoinSize, planVisualCoins, CoinJarOverlay };
  if (typeof module !== 'undefined' && module.exports) module.exports = exports;
  root.CoinJarOverlay = CoinJarOverlay;
  root.CoinJarOverlayHelpers = exports;

  if (root.document && typeof root.addEventListener === 'function') {
    root.addEventListener('DOMContentLoaded', () => {
      if (!root.__schnorrbecherOverlay) root.__schnorrbecherOverlay = new CoinJarOverlay();
    });
  }
}(typeof window !== 'undefined' ? window : globalThis));
