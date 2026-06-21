(function () {
  class SceneDirector {
    constructor(options) {
      this.socket = options.socket;
      this.rootEl = options.rootEl;
      this.themeManager = options.themeManager;
      this.performanceScaler = options.performanceScaler;
      this.hudController = options.hudController;
      this.encounterController = options.encounterController;
      this.audioDirector = options.audioDirector;
      this.webglScene = options.webglScene;
      this.fxGraph = options.fxGraph;
      this.config = {};
      this.lastFrameAt = 0;
    }

    configure(config) {
      this.config = { ...this.config, ...config };
      const theme = this.themeManager.applyTheme(this.config.theme);
      this.themeManager.setBackdropEnabled(this.config.sceneBackdropEnabled !== false);
      this.themeManager.setBackdropOpacity(this.config.sceneBackdropOpacity);
      this.themeManager.setLayerConfig(this.config.sceneLayerVisibility, this.config.sceneLayerOpacity);
      const profile = this.performanceScaler.setProfile(this.config.qualityProfile || 'ultra');
      this.audioDirector.configure(this.config);
      this.hudController.setTheme(theme);
      this.hudController.setVisible(this.config.hudEnabled !== false);
      this.encounterController.setEncounterMode(this.config.encounterMode);
      this.webglScene.configure({
        theme,
        profile,
        backdropEnabled: this.config.sceneBackdropEnabled !== false,
        backdropOpacity: this.config.sceneBackdropOpacity
      });
      this.webglScene.updateEncounter(this.encounterController.getState('skirmish', 'Arena idle'));
      this.webglScene.resize(profile.resolutionScale);
      if (typeof this.fxGraph.configure === 'function') {
        this.fxGraph.configure(this.config);
      }
      this.fxGraph.resize(profile.resolutionScale);
      this.hudController.updateEncounter(
        this.encounterController.getState('skirmish', 'Arena idle'),
        this.performanceScaler.profileName
      );
    }

    handleTrigger(payload) {
      const theme = this.themeManager.applyTheme(payload.theme || this.config.theme);
      const profileName = this.pickProfile(payload.qualityProfile || this.config.qualityProfile);
      const profile = this.performanceScaler.setProfile(profileName);
      const state = this.encounterController.handleTrigger(payload);

      this.hudController.setTheme(theme);
      this.hudController.updateEncounter(state, profileName);
      this.webglScene.setTheme(theme);
      this.webglScene.setProfile(profile);
      this.webglScene.updateEncounter(state);
      this.webglScene.pulseImpact(payload, state);
      this.fxGraph.queueBurst(payload, theme, profile, state);
      this.audioDirector.play(payload, theme);

      if (payload.ultimateTier) {
        this.hudController.showBanner(payload.hudLabel || 'Ultimate unleashed');
        this.encounterController.consumeUltimate();
      } else if (state.attackClass === 'cataclysm') {
        this.hudController.showBanner(payload.hudLabel || 'Cataclysm barrage');
      } else if (state.attackClass === 'raid') {
        this.hudController.showBanner(payload.hudLabel || 'Raid attack pattern');
      }

      this.applyCameraImpulse(payload.cameraImpulse || 0);
    }

    handleFinale(payload) {
      const theme = this.themeManager.applyTheme(payload.theme || this.config.theme);
      const profileName = this.pickProfile(payload.qualityProfile || this.config.qualityProfile || 'ultra');
      const profile = this.performanceScaler.setProfile(profileName);
      const state = this.encounterController.getState('ultimate', payload.hudLabel || 'Arena finale');

      this.webglScene.setTheme(theme);
      this.webglScene.setProfile(profile);
      this.webglScene.updateEncounter(state);
      this.webglScene.pulseImpact({
        ...payload,
        intensity: Math.max(payload.intensity || 3, 3.5),
        ultimateTier: payload.ultimateTier || 'finale'
      }, state);
      this.fxGraph.queueFinale(payload, theme, profile, state);
      this.audioDirector.play(payload, theme);
      this.hudController.setTheme(theme);
      this.hudController.updateEncounter(state, profileName);
      this.hudController.showBanner(payload.hudLabel || 'Arena finale');
      this.applyCameraImpulse(payload.cameraImpulse || 0.5);
    }

    handleFollower(payload) {
      this.hudController.showFollower(payload);
      this.hudController.showBanner(`${payload.username} entered the arena`);
    }

    pickProfile(requestedProfile) {
      const recommended = this.performanceScaler.getRecommendedProfile();
      if (this.config.proMode) {
        return requestedProfile || recommended;
      }

      const order = ['low', 'medium', 'high', 'ultra'];
      const requestedIndex = Math.max(0, order.indexOf(requestedProfile || 'ultra'));
      const recommendedIndex = Math.max(0, order.indexOf(recommended));
      return order[Math.min(requestedIndex, recommendedIndex)];
    }

    applyCameraImpulse(intensity) {
      if (!intensity) {
        return;
      }

      const x = (Math.random() - 0.5) * intensity * 24;
      const y = (Math.random() - 0.5) * intensity * 18;
      const scale = 1 + Math.min(0.05, intensity * 0.032);
      this.rootEl.style.setProperty('--camera-x', `${x}px`);
      this.rootEl.style.setProperty('--camera-y', `${y}px`);
      this.rootEl.style.setProperty('--camera-scale', String(scale));
      setTimeout(() => {
        this.rootEl.style.setProperty('--camera-x', '0px');
        this.rootEl.style.setProperty('--camera-y', '0px');
        this.rootEl.style.setProperty('--camera-scale', '1');
      }, 120);
    }

    tick(now) {
      if (!this.lastFrameAt) {
        this.lastFrameAt = now;
      }
      const frameMs = now - this.lastFrameAt;
      this.lastFrameAt = now;

      const recommendedProfile = this.performanceScaler.recordFrame(frameMs);
      if (!this.config.proMode && recommendedProfile !== this.performanceScaler.profileName) {
        const profile = this.performanceScaler.setProfile(recommendedProfile);
        this.webglScene.setProfile(profile);
        this.webglScene.resize(profile.resolutionScale);
        this.fxGraph.resize(profile.resolutionScale);
      }

      this.encounterController.decay();
      this.webglScene.updateEncounter(
        this.encounterController.getState(this.encounterController.attackClass, this.encounterController.combo > 0 ? 'Arena pressure rising' : 'Arena idle')
      );
      this.webglScene.render(now);
      this.fxGraph.update(now);
      this.hudController.updateEncounter(
        this.encounterController.getState(this.encounterController.attackClass, this.encounterController.combo > 0 ? 'Arena pressure rising' : 'Arena idle'),
        this.performanceScaler.profileName
      );
      this.socket.emit('fireworks-dev:fps-update', {
        fps: Math.round(this.performanceScaler.getAverageFps()),
        timestamp: Date.now()
      });
    }
  }

  window.FireworksDevSceneDirector = SceneDirector;
})();
