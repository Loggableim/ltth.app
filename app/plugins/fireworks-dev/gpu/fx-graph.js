(function () {
  class FxGraph {
    constructor(canvasEl, fxEl) {
      this.canvasEl = canvasEl;
      this.fxEl = fxEl;
      this.screenPulseEl = document.getElementById('fireworks-dev-screenpulse');
      this.popupLayerEl = document.getElementById('fireworks-dev-popups');
      this.ctx = canvasEl.getContext('2d');
      this.particles = [];
      this.rockets = [];
      this.imageCache = new Map();
      this.paletteCache = new Map();
      this.config = {
        giftVisualMappings: {},
        finalePatternProfiles: {}
      };
      this.width = 0;
      this.height = 0;
      this.lastTime = 0;
      this.resize();
    }

    configure(config = {}) {
      this.config = {
        ...this.config,
        ...config,
        giftVisualMappings: config.giftVisualMappings || this.config.giftVisualMappings || {},
        finalePatternProfiles: config.finalePatternProfiles || this.config.finalePatternProfiles || {}
      };
    }

    resize(scale = 1) {
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.canvasEl.width = Math.floor(this.width * scale);
      this.canvasEl.height = Math.floor(this.height * scale);
      this.canvasEl.style.width = `${this.width}px`;
      this.canvasEl.style.height = `${this.height}px`;
      this.ctx.setTransform(scale, 0, 0, scale, 0, 0);
    }

    queueBurst(payload, theme, profile, encounterState) {
      const resolvedPayload = this.applyGiftEffectProfile(payload);
      if (this.shouldLaunchGiftRocket(resolvedPayload)) {
        this.launchGiftRocket(resolvedPayload, theme, profile, encounterState);
        return;
      }
      this.emitBurst(resolvedPayload, theme, profile, encounterState);
    }

    emitBurst(payload, theme, profile, encounterState, override = {}) {
      const count = this.resolveParticleCount(payload, profile, encounterState);
      const centerX = (payload.position?.x || 0.5) * this.width;
      const centerY = (payload.position?.y || 0.45) * this.height;
      const pattern = this.buildPattern(payload, encounterState);
      const palette = override.palette || this.resolvePalette(payload, theme);
      const points = this.generatePatternPoints(pattern, count, payload.intensity || 1, encounterState.phaseLabel);

      for (let i = 0; i < points.length && this.particles.length < profile.actorCap; i++) {
        const point = points[i];
        const color = palette[i % palette.length];
        const particle = {
          x: centerX,
          y: centerY,
          vx: point.vx,
          vy: point.vy,
          alpha: 1,
          size: point.size,
          color,
          trailAlpha: profile.trailAlpha,
          life: point.life,
          gravity: point.gravity,
          drag: point.drag,
          kind: point.kind || 'core',
          renderAs: point.renderAs || 'circle',
          imageSrc: point.imageSrc || null,
          outlineOnly: point.outlineOnly === true
        };
        this.decorateLegacyParticle(particle, payload, i, count);
        this.particles.push(particle);
      }

      this.spawnLegacyShapeEffect(payload, theme, profile, centerX, centerY);
      this.spawnFlash(centerX, centerY, theme, profile);
      this.spawnScreenPulse();

      if (payload.shockwaveEnabled !== false && payload.impactLevel !== 'light') {
        this.spawnShockwave(centerX, centerY, profile);
      }
      if (payload.heatHazeEnabled && ((payload.intensity || 1) >= 1.8 || encounterState.attackClass === 'ultimate')) {
        this.fxEl.classList.remove('heat-haze');
        void this.fxEl.offsetWidth;
        this.fxEl.classList.add('heat-haze');
      }

      if (profile.secondaryBurstFactor > 0.12) {
        this.queueSecondaryBurst(centerX, centerY, theme, profile, encounterState);
      }

      if (payload.giftPopupEnabled !== false && payload.username && (payload.coins || payload.giftImage || payload.combo > 1)) {
        this.showGiftPopup(centerX, payload, theme);
      }

      if (theme.key === 'neon-reactor') {
        this.spawnRibbonField(centerX, centerY, theme, profile);
      } else if (theme.key === 'celestial-titan') {
        this.spawnPrismField(centerX, centerY, theme, profile);
      } else {
        this.spawnSmoke(centerX, centerY, theme);
        this.spawnEmberSpray(centerX, centerY, theme, profile);
      }
    }

    shouldLaunchGiftRocket(payload) {
      return !!(payload.giftImage && !payload.ultimateTier && payload.reason !== 'goal-progress' && payload.reason !== 'follow');
    }

    launchGiftRocket(payload, theme, profile, encounterState) {
      const targetX = (payload.position?.x || 0.5) * this.width;
      const targetY = (payload.position?.y || 0.45) * this.height;
      const palette = this.resolvePalette(payload, theme);
      const rocketProfile = this.resolveGiftRocketProfile(payload);
      const particleBase = payload.particleCount || 60;

      for (let i = 0; i < rocketProfile.count; i++) {
        const laneRatio = rocketProfile.count === 1 ? 0 : (i / (rocketProfile.count - 1)) - 0.5;
        const laneOffset = laneRatio * rocketProfile.spread;
        const perRocketPayload = {
          ...payload,
          particleCount: Math.max(24, Math.round(particleBase / rocketProfile.count * (i === Math.floor(rocketProfile.count / 2) ? 1.12 : 0.88))),
          intensity: Math.max(0.8, (payload.intensity || 1) * rocketProfile.intensityMultiplier),
          shape: rocketProfile.shapeSequence[i % rocketProfile.shapeSequence.length] || payload.shape
        };

        this.rockets.push({
          startX: targetX + laneOffset + (Math.random() - 0.5) * rocketProfile.wobble,
          startY: this.height + 80 + i * 12,
          targetX: targetX + laneOffset * rocketProfile.convergeFactor,
          targetY,
          duration: Math.max(380, rocketProfile.duration + i * rocketProfile.staggerMs),
          elapsed: 0,
          delayMs: i * rocketProfile.staggerMs,
          imageSrc: payload.giftImage,
          trailPalette: palette,
          payload: perRocketPayload,
          theme,
          profile,
          encounterState,
          variant: rocketProfile.variant,
          arcHeight: rocketProfile.arcHeight,
          trailWidth: rocketProfile.trailWidth,
          glowScale: rocketProfile.glowScale,
          boosterSparks: rocketProfile.boosterSparks,
          escortOpacity: i === Math.floor(rocketProfile.count / 2) ? 1 : 0.82
        });
      }

      if (payload.giftImage) {
        const cachedImage = this.loadImage(payload.giftImage);
        if (cachedImage && cachedImage.complete) {
          this.extractPaletteFromImage(payload.giftImage);
        }
      }
    }

    resolveGiftRocketProfile(payload) {
      const tier = payload.tier || 'medium';
      const giftProfile = this.resolveGiftEffectProfile(payload);
      const profiles = {
        small: {
          variant: 'dart',
          count: 1,
          spread: 0,
          duration: 480,
          staggerMs: 0,
          arcHeight: 24,
          trailWidth: 4,
          glowScale: 1,
          wobble: 20,
          boosterSparks: 1,
          convergeFactor: 0,
          intensityMultiplier: 0.92,
          shapeSequence: giftProfile.rocketShapeSequence || [payload.shape || 'burst']
        },
        medium: {
          variant: 'flare',
          count: 1,
          spread: 0,
          duration: 560,
          staggerMs: 0,
          arcHeight: 42,
          trailWidth: 6,
          glowScale: 1.08,
          wobble: 34,
          boosterSparks: 3,
          convergeFactor: 0,
          intensityMultiplier: 1,
          shapeSequence: giftProfile.rocketShapeSequence || [payload.shape || 'burst']
        },
        big: {
          variant: 'comet',
          count: 2,
          spread: 120,
          duration: 640,
          staggerMs: 70,
          arcHeight: 58,
          trailWidth: 7,
          glowScale: 1.16,
          wobble: 28,
          boosterSparks: 5,
          convergeFactor: 0.4,
          intensityMultiplier: 1.08,
          shapeSequence: giftProfile.rocketShapeSequence || [payload.shape || 'burst', 'star']
        },
        massive: {
          variant: 'siege',
          count: 3,
          spread: 190,
          duration: 760,
          staggerMs: 90,
          arcHeight: 76,
          trailWidth: 8,
          glowScale: 1.28,
          wobble: 24,
          boosterSparks: 8,
          convergeFactor: 0.18,
          intensityMultiplier: 1.14,
          shapeSequence: giftProfile.rocketShapeSequence || [payload.shape || 'burst', 'ring', 'star']
        }
      };

      return profiles[tier] || profiles.medium;
    }

    queueFinale(payload, theme, profile, encounterState) {
      const finaleProfile = this.resolveFinaleProfile(payload, encounterState);
      const burstPositions = this.generateFinalePositions(finaleProfile);

      burstPositions.forEach((position, i) => {
        this.queueBurst({
          ...payload,
          shape: finaleProfile.shapeSequence[i % finaleProfile.shapeSequence.length],
          position,
          patternOverride: finaleProfile.patternSequence[i % finaleProfile.patternSequence.length],
          shapes: finaleProfile.shapeSequence,
          intensity: (payload.intensity || 3) * finaleProfile.intensityMultiplier + Math.random() * finaleProfile.intensityJitter,
          particleCount: Math.round((payload.intensity || 3) * finaleProfile.particleMultiplier),
          impactLevel: 'ultimate',
          ultimateTier: payload.ultimateTier || finaleProfile.ultimateTier,
          cameraImpulse: Math.max(payload.cameraImpulse || 0, finaleProfile.cameraImpulse || 0),
          screenFxPreset: payload.screenFxPreset || finaleProfile.screenFxPreset,
          finalePattern: finaleProfile.finalePattern
        }, theme, profile, encounterState || { attackClass: 'ultimate', phaseLabel: 'Phase 3' });
      });

      finaleProfile.followUpWaves.forEach((wave) => {
        setTimeout(() => {
          wave.positions.forEach((position, index) => {
            this.queueBurst({
              ...payload,
              shape: wave.shapeSequence[index % wave.shapeSequence.length],
              position,
              patternOverride: wave.patternSequence[index % wave.patternSequence.length],
              intensity: (payload.intensity || 3) * wave.intensityMultiplier,
              particleCount: Math.round((payload.intensity || 3) * wave.particleMultiplier),
              impactLevel: 'ultimate',
              ultimateTier: payload.ultimateTier || finaleProfile.ultimateTier,
              cameraImpulse: Math.max(payload.cameraImpulse || 0, wave.cameraImpulse || finaleProfile.cameraImpulse || 0),
              screenFxPreset: payload.screenFxPreset || finaleProfile.screenFxPreset,
              finalePattern: finaleProfile.finalePattern
            }, theme, profile, encounterState || { attackClass: 'ultimate', phaseLabel: 'Phase 3' });
          });
        }, wave.delayMs);
      });
    }

    resolveParticleCount(payload, profile, encounterState) {
      const base = Math.round((payload.particleCount || 60) * Math.max(0.55, payload.intensity || 1));
      const phaseBonus = encounterState.phaseLabel === 'Phase 3' ? 1.18 : encounterState.phaseLabel === 'Phase 2' ? 1.06 : 1;
      return Math.min(profile.particleBudget, Math.round(base * phaseBonus));
    }

    buildPattern(payload, encounterState) {
      if (payload.patternOverride) {
        return payload.patternOverride;
      }
      if (payload.ultimateTier || encounterState.attackClass === 'ultimate') {
        return 'nova';
      }
      if (encounterState.attackClass === 'cataclysm') {
        return 'crossfire';
      }
      if (payload.shape === 'ring') {
        return 'ring';
      }
      if (payload.shape === 'double-ring') {
        return 'double-ring';
      }
      if (payload.shape === 'spiral') {
        return 'spiral';
      }
      if (payload.shape === 'paws') {
        return 'paw-burst';
      }
      if (payload.shape === 'star' || encounterState.attackClass === 'raid') {
        return 'fan';
      }
      if (payload.shape === 'heart') {
        return 'lobe';
      }
      return 'burst';
    }

    applyGiftEffectProfile(payload) {
      const giftProfile = this.resolveGiftEffectProfile(payload);
      if (!giftProfile) {
        return payload;
      }

      return {
        ...payload,
        shape: payload.shape || giftProfile.shape,
        shapes: payload.shapes || giftProfile.shapes,
        patternOverride: payload.patternOverride || giftProfile.patternOverride,
        finalePattern: payload.finalePattern || giftProfile.finalePattern,
        rocketShapeSequence: payload.rocketShapeSequence || giftProfile.rocketShapeSequence,
        giftPopupPosition: payload.giftPopupPosition || giftProfile.giftPopupPosition,
        screenFxPreset: payload.screenFxPreset || giftProfile.screenFxPreset,
        cameraImpulse: payload.cameraImpulse ?? giftProfile.cameraImpulse,
        hudLabel: payload.hudLabel || giftProfile.hudLabel
      };
    }

    resolveGiftEffectProfile(payload) {
      const configuredProfile = this.resolveConfiguredGiftEffectProfile(payload);
      if (configuredProfile) {
        return configuredProfile;
      }

      const giftName = String(payload.giftName || payload.hudLabel || '').trim().toLowerCase();
      const tier = payload.tier || 'medium';
      const massiveFallback = tier === 'massive' || (payload.coins || 0) >= 1000;

      if (giftName.includes('rose')) {
        return {
          shape: 'heart',
          shapes: ['heart', 'heart', 'ring', 'star', 'heart'],
          rocketShapeSequence: ['heart', 'ring'],
          patternOverride: 'lobe',
          finalePattern: 'rose-garden',
          giftPopupPosition: 'middle',
          screenFxPreset: 'bloom',
          cameraImpulse: 0.2,
          hudLabel: payload.hudLabel || 'Rose bloom finale'
        };
      }

      if (giftName.includes('finger heart') || giftName.includes('heart') || giftName.includes('love')) {
        return {
          shape: 'heart',
          shapes: ['heart', 'heart', 'star', 'ring', 'heart'],
          rocketShapeSequence: ['heart', 'heart'],
          patternOverride: 'lobe',
          finalePattern: 'heart-cascade',
          giftPopupPosition: 'middle',
          screenFxPreset: 'pulse',
          cameraImpulse: 0.26,
          hudLabel: payload.hudLabel || 'Heart cascade'
        };
      }

      if (giftName.includes('paw') || giftName.includes('corgi') || giftName.includes('dog')) {
        return {
          shape: 'paws',
          shapes: ['paws', 'paws', 'star', 'ring'],
          rocketShapeSequence: ['paws', 'star'],
          patternOverride: 'paw-burst',
          finalePattern: 'paw-parade',
          giftPopupPosition: 'bottom',
          screenFxPreset: 'spark',
          cameraImpulse: 0.24,
          hudLabel: payload.hudLabel || 'Paw parade'
        };
      }

      if (giftName.includes('money gun') || giftName.includes('money') || giftName.includes('gg') || giftName.includes('cash')) {
        return {
          shape: 'star',
          shapes: ['star', 'ring', 'star', 'burst'],
          rocketShapeSequence: ['star', 'ring'],
          patternOverride: 'fan',
          finalePattern: 'money-fan',
          giftPopupPosition: 'top',
          screenFxPreset: 'flare',
          cameraImpulse: 0.34,
          hudLabel: payload.hudLabel || 'Money fan barrage'
        };
      }

      if (giftName.includes('perfume') || giftName.includes('swan') || giftName.includes('cap')) {
        return {
          shape: 'spiral',
          shapes: ['spiral', 'ring', 'star', 'spiral'],
          rocketShapeSequence: ['spiral', 'ring'],
          patternOverride: 'spiral',
          finalePattern: 'perfume-fountain',
          giftPopupPosition: 'top',
          screenFxPreset: 'mist',
          cameraImpulse: 0.28,
          hudLabel: payload.hudLabel || 'Perfume fountain'
        };
      }

      if (giftName.includes('donut') || giftName.includes('cake') || giftName.includes('cookie')) {
        return {
          shape: 'ring',
          shapes: ['ring', 'ring', 'star', 'burst'],
          rocketShapeSequence: ['ring', 'star'],
          patternOverride: 'ring',
          finalePattern: 'sugar-ring',
          giftPopupPosition: 'middle',
          screenFxPreset: 'spark',
          cameraImpulse: 0.22,
          hudLabel: payload.hudLabel || 'Sugar ring'
        };
      }

      if (giftName.includes('galaxy') || giftName.includes('universe') || giftName.includes('nebula')) {
        return {
          shape: 'spiral',
          shapes: ['spiral', 'ring', 'star', 'burst', 'spiral'],
          rocketShapeSequence: ['spiral', 'ring', 'star'],
          patternOverride: 'nova',
          finalePattern: 'galaxy-helix',
          giftPopupPosition: 'top',
          screenFxPreset: 'prism',
          cameraImpulse: 0.48,
          hudLabel: payload.hudLabel || 'Galaxy helix'
        };
      }

      if (giftName.includes('lion') || giftName.includes('castle') || giftName.includes('whale') || giftName.includes('phoenix') || massiveFallback) {
        return {
          shape: 'ring',
          shapes: ['ring', 'star', 'burst', 'spiral', 'ring'],
          rocketShapeSequence: ['ring', 'star', 'burst'],
          patternOverride: 'crossfire',
          finalePattern: 'siege-crown',
          giftPopupPosition: 'top',
          screenFxPreset: 'cathedral',
          cameraImpulse: 0.62,
          hudLabel: payload.hudLabel || 'Siege crown finale'
        };
      }

      return null;
    }

    resolveConfiguredGiftEffectProfile(payload) {
      const mappings = this.config.giftVisualMappings || {};
      const giftIdKey = payload.giftId !== undefined && payload.giftId !== null
        ? String(payload.giftId)
        : null;
      const normalizedGiftName = String(payload.giftName || '').trim().toLowerCase();

      let mapping = giftIdKey ? mappings[giftIdKey] : null;
      if (!mapping && normalizedGiftName) {
        mapping = Object.values(mappings).find((candidate) =>
          String(candidate?.giftName || '').trim().toLowerCase() === normalizedGiftName
        ) || null;
      }

      if (!mapping) {
        return null;
      }

      return {
        shape: mapping.shape || payload.shape || 'burst',
        shapes: Array.isArray(mapping.shapes) && mapping.shapes.length
          ? mapping.shapes
          : [mapping.shape || payload.shape || 'burst'],
        rocketShapeSequence: Array.isArray(mapping.rocketShapeSequence) && mapping.rocketShapeSequence.length
          ? mapping.rocketShapeSequence
          : null,
        patternOverride: mapping.patternOverride || null,
        finalePattern: mapping.finalePattern || null,
        giftPopupPosition: mapping.giftPopupPosition || payload.giftPopupPosition || 'bottom',
        screenFxPreset: mapping.screenFxPreset || null,
        cameraImpulse: mapping.cameraImpulse || 0,
        hudLabel: mapping.hudLabel || payload.hudLabel || null
      };
    }

    resolveFinaleProfile(payload, encounterState) {
      const giftProfile = this.resolveGiftEffectProfile(payload) || {};
      const configuredPatterns = this.config.finalePatternProfiles || {};
      const defaultShapes = Array.isArray(payload.shapes) && payload.shapes.length
        ? payload.shapes
        : giftProfile.shapes || ['burst', 'heart', 'star', 'ring', 'double-ring', 'spiral', 'paws'];
      const defaultPatterns = giftProfile.patternOverride
        ? [giftProfile.patternOverride]
        : ['nova', 'fan', 'crossfire', 'ring', 'double-ring'];
      const tier = payload.tier || 'medium';
      const baseProfiles = {
        small: {
          finalePattern: payload.finalePattern || giftProfile.finalePattern || configuredPatterns.small || 'line-sweep',
          shapeSequence: defaultShapes,
          patternSequence: defaultPatterns,
          burstCount: payload.burstCount || 5,
          intensityMultiplier: 0.78,
          intensityJitter: 0.55,
          particleMultiplier: 48,
          cameraImpulse: 0.26,
          screenFxPreset: giftProfile.screenFxPreset || 'flare',
          ultimateTier: payload.ultimateTier || 'finale',
          followUpWaves: []
        },
        medium: {
          finalePattern: payload.finalePattern || giftProfile.finalePattern || configuredPatterns.medium || 'arc-sweep',
          shapeSequence: defaultShapes,
          patternSequence: defaultPatterns,
          burstCount: payload.burstCount || 6,
          intensityMultiplier: 0.84,
          intensityJitter: 0.72,
          particleMultiplier: 56,
          cameraImpulse: 0.32,
          screenFxPreset: giftProfile.screenFxPreset || 'pulse',
          ultimateTier: payload.ultimateTier || 'finale',
          followUpWaves: []
        },
        big: {
          finalePattern: payload.finalePattern || giftProfile.finalePattern || configuredPatterns.big || 'crown-arc',
          shapeSequence: defaultShapes,
          patternSequence: defaultPatterns,
          burstCount: payload.burstCount || 8,
          intensityMultiplier: 0.94,
          intensityJitter: 0.78,
          particleMultiplier: 66,
          cameraImpulse: 0.44,
          screenFxPreset: giftProfile.screenFxPreset || 'bloom',
          ultimateTier: payload.ultimateTier || 'grand-finale',
          followUpWaves: []
        },
        massive: {
          finalePattern: payload.finalePattern || giftProfile.finalePattern || configuredPatterns.massive || 'siege-crown',
          shapeSequence: giftProfile.shapes || ['ring', 'double-ring', 'star', 'burst', 'spiral', 'heart', 'paws'],
          patternSequence: ['crossfire', 'nova', 'fan', 'ring', 'double-ring', 'spiral'],
          burstCount: payload.burstCount || 10,
          intensityMultiplier: 1.08,
          intensityJitter: 0.92,
          particleMultiplier: 78,
          cameraImpulse: 0.62,
          screenFxPreset: giftProfile.screenFxPreset || 'cathedral',
          ultimateTier: payload.ultimateTier || 'massive-finale',
          followUpWaves: []
        }
      };

      const finaleProfile = {
        ...(baseProfiles[tier] || baseProfiles.medium),
        finalePattern: payload.finalePattern || giftProfile.finalePattern || (baseProfiles[tier] || baseProfiles.medium).finalePattern,
        shapeSequence: payload.shapes || (baseProfiles[tier] || baseProfiles.medium).shapeSequence,
        patternSequence: payload.patternOverride ? [payload.patternOverride] : (baseProfiles[tier] || baseProfiles.medium).patternSequence,
        cameraImpulse: Math.max(payload.cameraImpulse || 0, giftProfile.cameraImpulse || (baseProfiles[tier] || baseProfiles.medium).cameraImpulse),
        screenFxPreset: payload.screenFxPreset || giftProfile.screenFxPreset || (baseProfiles[tier] || baseProfiles.medium).screenFxPreset
      };

      finaleProfile.followUpWaves = this.buildFollowUpFinaleWaves(finaleProfile, payload, encounterState);
      return finaleProfile;
    }

    generateFinalePositions(finaleProfile) {
      const count = finaleProfile.burstCount;
      const positions = [];
      const pattern = finaleProfile.finalePattern;

      for (let i = 0; i < count; i++) {
        const ratio = count === 1 ? 0.5 : i / (count - 1);
        let x = 0.14 + ratio * 0.72;
        let y = 0.18 + Math.random() * 0.24;

        if (pattern === 'rose-garden') {
          x = 0.2 + ratio * 0.6;
          y = 0.3 + Math.sin(ratio * Math.PI * 2) * 0.08 + (i % 2 === 0 ? -0.03 : 0.03);
        } else if (pattern === 'line-sweep') {
          x = 0.16 + ratio * 0.68;
          y = 0.4 + (i % 2 === 0 ? -0.06 : 0.04);
        } else if (pattern === 'arc-sweep') {
          x = 0.14 + ratio * 0.72;
          y = 0.52 - Math.sin(ratio * Math.PI) * 0.22;
        } else if (pattern === 'crown-arc') {
          x = 0.16 + ratio * 0.68;
          y = 0.18 + Math.abs(Math.sin(ratio * Math.PI * 3)) * 0.14;
        } else if (pattern === 'heart-cascade') {
          x = 0.25 + ratio * 0.5;
          y = 0.18 + ratio * 0.34;
        } else if (pattern === 'money-fan') {
          x = 0.18 + ratio * 0.64;
          y = 0.52 - Math.sin(ratio * Math.PI) * 0.2;
        } else if (pattern === 'galaxy-helix') {
          const angle = ratio * Math.PI * 2.2;
          const radius = 0.08 + ratio * 0.2;
          x = 0.5 + Math.cos(angle) * radius;
          y = 0.34 + Math.sin(angle * 1.2) * 0.18;
        } else if (pattern === 'siege-crown') {
          x = 0.12 + ratio * 0.76;
          y = 0.14 + Math.abs(Math.cos(ratio * Math.PI * 2)) * 0.16;
        } else if (pattern === 'paw-parade') {
          x = 0.22 + ratio * 0.56;
          y = 0.24 + Math.sin(ratio * Math.PI * 4) * 0.05;
        } else if (pattern === 'perfume-fountain') {
          x = 0.5 + (ratio - 0.5) * 0.3;
          y = 0.48 - Math.sin(ratio * Math.PI) * 0.24;
        } else if (pattern === 'sugar-ring') {
          const angle = ratio * Math.PI * 2;
          x = 0.5 + Math.cos(angle) * 0.22;
          y = 0.33 + Math.sin(angle) * 0.12;
        }

        positions.push({
          x: Math.max(0.08, Math.min(0.92, x)),
          y: Math.max(0.12, Math.min(0.74, y))
        });
      }

      return positions;
    }

    buildFollowUpFinaleWaves(finaleProfile, payload, encounterState) {
      if (finaleProfile.finalePattern === 'crown-arc') {
        return [
          {
            delayMs: 190,
            positions: [
              { x: 0.24, y: 0.36 },
              { x: 0.5, y: 0.18 },
              { x: 0.76, y: 0.36 }
            ],
            shapeSequence: ['double-ring', 'star', 'double-ring'],
            patternSequence: ['double-ring', 'nova', 'double-ring'],
            intensityMultiplier: 0.98,
            particleMultiplier: 68,
            cameraImpulse: 0.36
          }
        ];
      }

      if (finaleProfile.finalePattern === 'arc-sweep') {
        return [
          {
            delayMs: 220,
            positions: [
              { x: 0.3, y: 0.38 },
              { x: 0.5, y: 0.26 },
              { x: 0.7, y: 0.38 }
            ],
            shapeSequence: ['ring', 'heart', 'ring'],
            patternSequence: ['ring', 'lobe', 'ring'],
            intensityMultiplier: 0.82,
            particleMultiplier: 56,
            cameraImpulse: 0.24
          }
        ];
      }

      if (finaleProfile.finalePattern === 'line-sweep') {
        return [
          {
            delayMs: 150,
            positions: [
              { x: 0.22, y: 0.48 },
              { x: 0.5, y: 0.4 },
              { x: 0.78, y: 0.48 }
            ],
            shapeSequence: ['burst', 'star', 'burst'],
            patternSequence: ['fan', 'fan', 'fan'],
            intensityMultiplier: 0.74,
            particleMultiplier: 46,
            cameraImpulse: 0.18
          }
        ];
      }

      if (finaleProfile.finalePattern === 'siege-crown') {
        return [
          {
            delayMs: 180,
            positions: [
              { x: 0.3, y: 0.26 },
              { x: 0.5, y: 0.18 },
              { x: 0.7, y: 0.26 }
            ],
            shapeSequence: ['ring', 'star', 'ring'],
            patternSequence: ['crossfire', 'nova', 'crossfire'],
            intensityMultiplier: 1.12,
            particleMultiplier: 72,
            cameraImpulse: 0.54
          },
          {
            delayMs: 360,
            positions: [
              { x: 0.22, y: 0.42 },
              { x: 0.5, y: 0.3 },
              { x: 0.78, y: 0.42 }
            ],
            shapeSequence: ['burst', 'spiral', 'burst'],
            patternSequence: ['fan', 'nova', 'fan'],
            intensityMultiplier: 0.96,
            particleMultiplier: 64,
            cameraImpulse: 0.46
          }
        ];
      }

      if (finaleProfile.finalePattern === 'galaxy-helix') {
        return [
          {
            delayMs: 220,
            positions: [
              { x: 0.36, y: 0.24 },
              { x: 0.5, y: 0.38 },
              { x: 0.64, y: 0.24 }
            ],
            shapeSequence: ['spiral', 'ring', 'spiral'],
            patternSequence: ['nova', 'ring', 'nova'],
            intensityMultiplier: 0.92,
            particleMultiplier: 62,
            cameraImpulse: 0.38
          }
        ];
      }

      if (finaleProfile.finalePattern === 'heart-cascade' || finaleProfile.finalePattern === 'rose-garden') {
        return [
          {
            delayMs: 180,
            positions: [
              { x: 0.38, y: 0.3 },
              { x: 0.5, y: 0.22 },
              { x: 0.62, y: 0.3 }
            ],
            shapeSequence: ['heart', 'heart', 'heart'],
            patternSequence: ['lobe', 'lobe', 'lobe'],
            intensityMultiplier: 0.82,
            particleMultiplier: 52,
            cameraImpulse: 0.2
          }
        ];
      }

      if (encounterState.attackClass === 'ultimate') {
        return [
          {
            delayMs: 260,
            positions: [
              { x: 0.32, y: 0.34 },
              { x: 0.68, y: 0.34 }
            ],
            shapeSequence: ['star', 'ring'],
            patternSequence: ['fan', 'ring'],
            intensityMultiplier: 0.84,
            particleMultiplier: 54,
            cameraImpulse: 0.28
          }
        ];
      }

      return [];
    }

    generatePatternPoints(pattern, count, intensity, phaseLabel) {
      const points = [];
      const phaseBoost = phaseLabel === 'Phase 3' ? 1.1 : phaseLabel === 'Phase 2' ? 1.04 : 1;

      for (let i = 0; i < count; i++) {
        const ratio = i / Math.max(1, count - 1);
        let angle = Math.PI * 2 * ratio;
        let speed = (0.9 + Math.random() * 2.8 + intensity * 1.6) * phaseBoost;

        if (pattern === 'spiral') {
          angle = Math.PI * 5 * ratio + Math.random() * 0.18;
        } else if (pattern === 'double-ring') {
          const shell = i % 2;
          angle = Math.PI * 2 * ratio + (shell === 0 ? 0 : Math.PI / Math.max(6, count / 8));
          speed *= shell === 0 ? 0.94 : 1.24;
        } else if (pattern === 'paw-burst') {
          const cluster = i % 5;
          const clusterAngles = [-Math.PI * 0.88, -Math.PI * 0.56, -Math.PI * 0.24, Math.PI * 0.08, Math.PI * 0.42];
          angle = clusterAngles[cluster] + (Math.random() - 0.5) * 0.26;
          speed *= cluster === 0 ? 1.32 : 0.96;
        } else if (pattern === 'fan') {
          angle = (-Math.PI / 1.4) + ratio * (Math.PI / 1.8) + Math.random() * 0.12;
          speed *= 1.18;
        } else if (pattern === 'crossfire') {
          const arm = i % 4;
          angle = arm * (Math.PI / 2) + (Math.random() - 0.5) * 0.26;
          speed *= 1.26;
        } else if (pattern === 'lobe') {
          angle = Math.PI * 2 * ratio;
          speed *= 0.86 + Math.sin(angle * 2) * 0.16;
        } else if (pattern === 'nova') {
          angle = Math.PI * 2 * ratio + Math.random() * 0.14;
          speed *= 1.34;
        }

        points.push({
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - Math.random() * 1.6,
          size: 1.8 + Math.random() * 3.8 + (pattern === 'nova' ? 0.8 : 0),
          life: 0.65 + Math.random() * 0.95,
          gravity: pattern === 'fan' ? 0.06 : 0.085,
          drag: pattern === 'crossfire' ? 0.988 : 0.992,
          kind: pattern === 'nova' ? 'prism' : 'core'
        });
      }

      return points;
    }

    decorateLegacyParticle(particle, payload, index, totalCount) {
      if (payload.userAvatar && Math.random() < (payload.avatarParticleChance || 0.3)) {
        particle.renderAs = 'image';
        particle.imageSrc = payload.userAvatar;
        particle.size *= 1.45;
        return;
      }

      if (payload.giftImage && index % Math.max(3, Math.round(totalCount / 16)) === 0) {
        particle.renderAs = 'image';
        particle.imageSrc = payload.giftImage;
        particle.size *= 1.38;
        return;
      }

      if (payload.shape === 'heart') {
        particle.renderAs = 'heart';
        particle.size *= 1.18;
        return;
      }

      if (payload.shape === 'paws') {
        particle.renderAs = 'paw';
        particle.size *= 1.2;
        return;
      }

      if (payload.shape === 'star') {
        particle.renderAs = 'star';
        particle.size *= 1.08;
        return;
      }

      if (payload.shape === 'ring' || payload.shape === 'double-ring') {
        particle.renderAs = 'ring';
        particle.outlineOnly = true;
      }
    }

    spawnLegacyShapeEffect(payload, theme, profile, centerX, centerY) {
      if (payload.shape === 'burst') {
        const burstDelay = 180 + Math.random() * 140;
        setTimeout(() => {
          this.spawnSecondaryMiniBurst(centerX, centerY, theme, profile);
        }, burstDelay);
      }

      if (payload.shape === 'spiral') {
        const spiralDelay = 220 + Math.random() * 180;
        setTimeout(() => {
          this.spawnSecondarySpiralBurst(centerX, centerY, theme, profile);
        }, spiralDelay);
      }

      if (payload.shape === 'heart') {
        setTimeout(() => {
          this.spawnHeartVolley(centerX, centerY, theme, profile);
        }, 120);
      }

      if (payload.shape === 'paws') {
        setTimeout(() => {
          this.spawnPawVolley(centerX, centerY, theme, profile);
        }, 120);
      }

      if (payload.shape === 'ring') {
        this.spawnShockwave(centerX, centerY, {
          shockwaveScale: (profile.shockwaveScale || 1) * 1.15
        });
      }

      if (payload.shape === 'double-ring') {
        this.spawnShockwave(centerX, centerY, {
          shockwaveScale: (profile.shockwaveScale || 1) * 1.08
        });
        setTimeout(() => {
          this.spawnShockwave(centerX, centerY, {
            shockwaveScale: (profile.shockwaveScale || 1) * 1.42
          });
        }, 130);
      }
    }

    queueSecondaryBurst(centerX, centerY, theme, profile, encounterState) {
      const residueCount = Math.max(10, Math.round(profile.particleBudget * profile.secondaryBurstFactor * 0.18));
      setTimeout(() => {
        for (let i = 0; i < residueCount && this.particles.length < profile.actorCap; i++) {
          const angle = Math.PI * 2 * (i / residueCount) + Math.random() * 0.4;
          const speed = 0.7 + Math.random() * (encounterState.attackClass === 'ultimate' ? 3.1 : 1.9);
          this.particles.push({
            x: centerX,
            y: centerY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            alpha: 1,
            size: 1.2 + Math.random() * 2.2,
            color: theme.palette[(i + 1) % theme.palette.length],
            trailAlpha: Math.max(0.12, profile.trailAlpha - 0.06),
            life: 0.42 + Math.random() * 0.54,
            gravity: 0.05,
            drag: 0.988,
            kind: 'residue',
            renderAs: 'circle'
          });
        }
      }, encounterState.attackClass === 'ultimate' ? 110 : 150);
    }

    spawnSecondaryMiniBurst(centerX, centerY, theme, profile) {
      const count = Math.max(6, Math.round(profile.particleBudget * 0.08));
      for (let i = 0; i < count && this.particles.length < profile.actorCap; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.16;
        const speed = 1 + Math.random() * 2.2;
        this.particles.push({
          x: centerX,
          y: centerY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          alpha: 1,
          size: 1 + Math.random() * 1.8,
          color: theme.palette[i % theme.palette.length],
          trailAlpha: 0.08,
          life: 0.4 + Math.random() * 0.36,
          gravity: 0.06,
          drag: 0.987,
          kind: 'spark',
          renderAs: 'circle'
        });
      }
    }

    spawnSecondarySpiralBurst(centerX, centerY, theme, profile) {
      const count = Math.max(8, Math.round(profile.particleBudget * 0.1));
      for (let i = 0; i < count && this.particles.length < profile.actorCap; i++) {
        const angle = (i / count) * Math.PI * 3.2;
        const speed = 0.8 + (i / count) * 2.6;
        this.particles.push({
          x: centerX,
          y: centerY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          alpha: 1,
          size: 1.2 + Math.random() * 1.8,
          color: theme.palette[(i + 2) % theme.palette.length],
          trailAlpha: 0.12,
          life: 0.48 + Math.random() * 0.42,
          gravity: 0.05,
          drag: 0.989,
          kind: 'spiral',
          renderAs: 'star'
        });
      }
    }

    spawnHeartVolley(centerX, centerY, theme, profile) {
      const count = Math.max(10, Math.round(profile.particleBudget * 0.12));
      for (let i = 0; i < count && this.particles.length < profile.actorCap; i++) {
        const t = (i / Math.max(1, count - 1)) * Math.PI * 2;
        const xCurve = 16 * Math.pow(Math.sin(t), 3);
        const yCurve = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        this.particles.push({
          x: centerX,
          y: centerY,
          vx: xCurve * 0.12,
          vy: yCurve * 0.12,
          alpha: 1,
          size: 2 + Math.random() * 2.2,
          color: theme.palette[i % theme.palette.length],
          trailAlpha: 0.1,
          life: 0.55 + Math.random() * 0.5,
          gravity: 0.045,
          drag: 0.989,
          kind: 'heart-volley',
          renderAs: 'heart'
        });
      }
    }

    spawnPawVolley(centerX, centerY, theme, profile) {
      const pads = [
        { x: 0, y: 0, scale: 1.28 },
        { x: -18, y: -16, scale: 0.78 },
        { x: 18, y: -16, scale: 0.78 },
        { x: -8, y: -30, scale: 0.72 },
        { x: 8, y: -30, scale: 0.72 }
      ];

      pads.forEach((pad, index) => {
        for (let i = 0; i < 3 && this.particles.length < profile.actorCap; i++) {
          this.particles.push({
            x: centerX + pad.x,
            y: centerY + pad.y,
            vx: (Math.random() - 0.5) * 1.6,
            vy: -0.4 - Math.random() * 1.8,
            alpha: 1,
            size: pad.scale * (2.4 + Math.random() * 1.6),
            color: theme.palette[(index + i) % theme.palette.length],
            trailAlpha: 0.08,
            life: 0.5 + Math.random() * 0.4,
            gravity: 0.035,
            drag: 0.991,
            kind: 'paw-volley',
            renderAs: 'paw'
          });
        }
      });
    }

    spawnFlash(x, y, theme, profile) {
      const flash = document.createElement('div');
      flash.className = 'fx-flash';
      flash.style.background = `radial-gradient(circle at ${x}px ${y}px, ${theme.flashColor} 0%, rgba(255,255,255,0) 58%)`;
      flash.style.opacity = String(profile.flashAlpha);
      this.fxEl.appendChild(flash);
      setTimeout(() => flash.remove(), 360);
    }

    spawnScreenPulse() {
      if (!this.screenPulseEl) {
        return;
      }
      this.screenPulseEl.classList.remove('active');
      void this.screenPulseEl.offsetWidth;
      this.screenPulseEl.classList.add('active');
    }

    spawnShockwave(x, y, profile) {
      const node = document.createElement('div');
      node.className = 'fx-shockwave';
      node.style.left = `${x}px`;
      node.style.top = `${y}px`;
      node.style.transform = `translate(-50%, -50%) scale(${profile.shockwaveScale})`;
      this.fxEl.appendChild(node);
      setTimeout(() => node.remove(), 780);
    }

    spawnRibbonField(x, y, theme, profile) {
      for (let i = 0; i < profile.ribbonCount; i++) {
        const node = document.createElement('div');
        node.className = 'fx-ribbon';
        node.style.left = `${x}px`;
        node.style.top = `${y}px`;
        node.style.width = `${100 + Math.random() * 150}px`;
        node.style.background = theme.ribbon;
        node.style.transform = `rotate(${Math.random() * 360}deg)`;
        this.fxEl.appendChild(node);
        setTimeout(() => node.remove(), 560);
      }
    }

    spawnPrismField(x, y, theme, profile) {
      const count = 3 + profile.ribbonCount;
      for (let i = 0; i < count; i++) {
        const node = document.createElement('div');
        node.className = 'fx-prism';
        node.style.left = `${x + (Math.random() - 0.5) * 80}px`;
        node.style.top = `${y + (Math.random() - 0.5) * 40}px`;
        node.style.background = theme.palette[i % theme.palette.length];
        this.fxEl.appendChild(node);
        setTimeout(() => node.remove(), 660);
      }
    }

    spawnSmoke(x, y, theme) {
      const node = document.createElement('div');
      node.className = 'fx-smoke';
      node.style.left = `${x}px`;
      node.style.top = `${y}px`;
      node.style.background = theme.smokeColor;
      this.fxEl.appendChild(node);
      setTimeout(() => node.remove(), 1240);
    }

    spawnEmberSpray(x, y, theme, profile) {
      const count = Math.max(6, Math.round(10 * profile.debrisFactor));
      for (let i = 0; i < count && this.particles.length < profile.actorCap; i++) {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.9;
        const speed = 1.2 + Math.random() * 2.6;
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          alpha: 1,
          size: 1.2 + Math.random() * 1.8,
          color: theme.palette[i % theme.palette.length],
          trailAlpha: 0.1,
          life: 0.6 + Math.random() * 0.5,
          gravity: 0.1,
          drag: 0.985,
          kind: 'ember',
          renderAs: 'circle'
        });
      }
    }

    showGiftPopup(centerX, payload, theme) {
      if (!this.popupLayerEl) {
        return;
      }

      const popup = document.createElement('div');
      popup.className = 'fx-gift-popup';
      popup.style.left = `${this.resolvePopupX(centerX, payload.giftPopupPosition)}px`;
      popup.style.bottom = this.resolvePopupBottom(payload.giftPopupPosition);
      popup.style.borderColor = this.makeAlphaColor(theme.accent || theme.palette[0], 0.42);
      popup.style.boxShadow = `0 0 28px ${this.makeAlphaColor(theme.primary || theme.palette[0], 0.24)}`;

      if (payload.giftImage || payload.userAvatar) {
        const image = document.createElement('img');
        image.src = payload.giftImage || payload.userAvatar;
        image.alt = payload.username || 'gift';
        popup.appendChild(image);
      }

      const textWrap = document.createElement('div');
      textWrap.className = 'fx-gift-popup-text';

      const title = document.createElement('div');
      title.className = 'fx-gift-popup-title';
      title.textContent = payload.username || 'Arena';
      textWrap.appendChild(title);

      const detail = document.createElement('div');
      detail.className = 'fx-gift-popup-detail';
      const coinsText = payload.coins ? `${payload.coins} coins` : payload.hudLabel || 'Special effect';
      detail.textContent = coinsText;
      textWrap.appendChild(detail);

      if ((payload.combo || 1) > 1) {
        const combo = document.createElement('div');
        combo.className = 'fx-gift-popup-combo';
        combo.textContent = `${payload.combo}x COMBO`;
        textWrap.appendChild(combo);
      }

      popup.appendChild(textWrap);
      this.popupLayerEl.appendChild(popup);
      setTimeout(() => popup.remove(), 2200);
    }

    resolvePopupX(centerX, popupPosition) {
      if (typeof popupPosition === 'object' && typeof popupPosition.x === 'number') {
        return popupPosition.x * this.width;
      }
      if (popupPosition === 'top' || popupPosition === 'middle' || popupPosition === 'bottom') {
        return Math.max(150, Math.min(this.width - 150, centerX));
      }
      return Math.max(150, Math.min(this.width - 150, centerX));
    }

    resolvePopupBottom(popupPosition) {
      if (typeof popupPosition === 'object' && typeof popupPosition.y === 'number') {
        return `${Math.max(20, (1 - popupPosition.y) * this.height)}px`;
      }
      if (popupPosition === 'top') {
        return `${Math.round(this.height * 0.72)}px`;
      }
      if (popupPosition === 'middle') {
        return `${Math.round(this.height * 0.46)}px`;
      }
      return '48px';
    }

    loadImage(src) {
      if (!src) {
        return null;
      }

      if (!this.imageCache.has(src)) {
        const image = new Image();
        image.decoding = 'async';
        image.crossOrigin = 'anonymous';
        image.src = src;
        this.imageCache.set(src, image);
      }

      return this.imageCache.get(src);
    }

    resolvePalette(payload, theme) {
      if (Array.isArray(payload.colors) && payload.colors.length) {
        return payload.colors;
      }

      if (payload.giftImage) {
        const cachedPalette = this.paletteCache.get(payload.giftImage);
        if (cachedPalette && cachedPalette.length) {
          return cachedPalette;
        }

        const extractedPalette = this.extractPaletteFromImage(payload.giftImage);
        if (extractedPalette && extractedPalette.length) {
          return extractedPalette;
        }
      }

      return theme.palette;
    }

    extractPaletteFromImage(src) {
      const image = this.loadImage(src);
      if (!image || !image.complete || !image.naturalWidth) {
        return this.paletteCache.get(src) || null;
      }

      try {
        const sampleCanvas = document.createElement('canvas');
        sampleCanvas.width = 12;
        sampleCanvas.height = 12;
        const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
        sampleCtx.drawImage(image, 0, 0, 12, 12);
        const { data } = sampleCtx.getImageData(0, 0, 12, 12);
        const buckets = new Map();

        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3];
          if (alpha < 140) {
            continue;
          }
          const r = Math.round(data[i] / 32) * 32;
          const g = Math.round(data[i + 1] / 32) * 32;
          const b = Math.round(data[i + 2] / 32) * 32;
          const key = `${r},${g},${b}`;
          buckets.set(key, (buckets.get(key) || 0) + 1);
        }

        const palette = [...buckets.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([key]) => {
            const [r, g, b] = key.split(',').map(Number);
            return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
          });

        if (palette.length) {
          this.paletteCache.set(src, palette);
          return palette;
        }
      } catch (error) {
        return this.paletteCache.get(src) || null;
      }

      return this.paletteCache.get(src) || null;
    }

    update(now) {
      if (!this.lastTime) {
        this.lastTime = now;
      }
      const delta = Math.min(0.033, (now - this.lastTime) / 1000);
      this.lastTime = now;

      this.ctx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);
      this.ctx.globalCompositeOperation = 'lighter';

      for (let i = this.rockets.length - 1; i >= 0; i--) {
        const rocket = this.rockets[i];
        rocket.elapsed += delta * 1000;
        if (rocket.elapsed < rocket.delayMs) {
          continue;
        }
        const activeElapsed = rocket.elapsed - rocket.delayMs;
        const progress = Math.min(1, activeElapsed / rocket.duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        const arcLift = Math.sin(progress * Math.PI) * rocket.arcHeight;
        const x = rocket.startX + (rocket.targetX - rocket.startX) * eased + Math.sin(progress * Math.PI * 2) * (rocket.variant === 'flare' ? 6 : rocket.variant === 'siege' ? 10 : 3);
        const y = rocket.startY + (rocket.targetY - rocket.startY) * eased - arcLift;
        rocket.currentX = x;
        rocket.currentY = y;

        this.drawRocketTrail(rocket, progress);
        this.drawGiftRocket(rocket, x, y, progress);
        this.spawnRocketBoosterSparks(rocket, progress);

        if (progress >= 1) {
          const resolvedPalette = this.resolvePalette(rocket.payload, rocket.theme) || rocket.trailPalette;
          this.emitBurst(rocket.payload, rocket.theme, rocket.profile, rocket.encounterState, {
            palette: resolvedPalette
          });
          this.rockets.splice(i, 1);
        }
      }

      for (let i = this.particles.length - 1; i >= 0; i--) {
        const particle = this.particles[i];
        particle.life -= delta;
        particle.alpha = Math.max(0, particle.life);
        particle.x += particle.vx * 60 * delta;
        particle.y += particle.vy * 60 * delta;
        particle.vy += particle.gravity || 0.08;
        particle.vx *= particle.drag || 0.992;
        particle.vy *= particle.drag || 0.992;

        const glowRadius = particle.kind === 'prism' ? particle.size * 4.2 : particle.kind === 'ember' ? particle.size * 2.8 : particle.size * 3.4;
        this.drawParticleGlow(particle, glowRadius);
        this.drawParticleCore(particle);
        this.drawParticleTrail(particle);

        if (particle.life <= 0) {
          this.particles.splice(i, 1);
        }
      }
    }

    drawRocketTrail(rocket, progress) {
      const fromX = rocket.currentX;
      const fromY = rocket.currentY;
      const tailX = fromX - (rocket.targetX - rocket.startX) * 0.04;
      const tailY = fromY + Math.max(26, (rocket.startY - rocket.targetY) * 0.12);
      const trailGradient = this.ctx.createLinearGradient(fromX, fromY, tailX, tailY);
      const primary = rocket.trailPalette[0] || rocket.theme.primary;
      const secondary = rocket.trailPalette[1] || rocket.theme.accent;
      trailGradient.addColorStop(0, this.makeAlphaColor(primary, 0.92));
      trailGradient.addColorStop(1, this.makeAlphaColor(secondary, Math.max(0, 0.12 - progress * 0.08)));
      this.ctx.save();
      this.ctx.strokeStyle = trailGradient;
      this.ctx.lineWidth = rocket.trailWidth || 6;
      this.ctx.lineCap = 'round';
      this.ctx.beginPath();
      this.ctx.moveTo(fromX, fromY);
      this.ctx.lineTo(tailX, tailY);
      this.ctx.stroke();
      this.ctx.restore();
    }

    drawGiftRocket(rocket, x, y, progress) {
      const image = this.loadImage(rocket.imageSrc);
      const size = (30 - progress * 4) * (rocket.glowScale || 1);
      if (image && image.complete && image.naturalWidth > 0) {
        this.ctx.save();
        this.ctx.globalAlpha = 0.96 * (rocket.escortOpacity || 1);
        this.ctx.shadowColor = this.makeAlphaColor(rocket.trailPalette[0] || rocket.theme.primary, 0.48);
        this.ctx.shadowBlur = 20 * (rocket.glowScale || 1);
        this.ctx.drawImage(image, x - size / 2, y - size / 2, size, size);
        this.ctx.restore();
        return;
      }

      this.ctx.save();
      this.ctx.fillStyle = this.makeAlphaColor(rocket.trailPalette[0] || rocket.theme.primary, 0.95 * (rocket.escortOpacity || 1));
      this.ctx.beginPath();
      this.ctx.arc(x, y, size * 0.26, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }

    spawnRocketBoosterSparks(rocket, progress) {
      if (!rocket.boosterSparks || this.particles.length >= rocket.profile.actorCap) {
        return;
      }

      const sparkChance = rocket.variant === 'siege' ? 0.85 : rocket.variant === 'comet' ? 0.55 : 0.35;
      if (Math.random() > sparkChance) {
        return;
      }

      const sparkCount = Math.min(rocket.boosterSparks, Math.max(1, Math.round(rocket.boosterSparks * (1 - progress * 0.45))));
      for (let i = 0; i < sparkCount && this.particles.length < rocket.profile.actorCap; i++) {
        const angle = Math.PI / 2 + (Math.random() - 0.5) * 0.8;
        const speed = 0.4 + Math.random() * 1.4;
        this.particles.push({
          x: rocket.currentX + (Math.random() - 0.5) * 6,
          y: rocket.currentY + 10 + Math.random() * 8,
          vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 0.6,
          vy: Math.sin(angle) * speed + 0.6,
          alpha: 0.9,
          size: 0.9 + Math.random() * 1.5,
          color: rocket.trailPalette[(i + 1) % rocket.trailPalette.length] || rocket.theme.accent,
          trailAlpha: 0.04,
          life: 0.16 + Math.random() * 0.18,
          gravity: 0.03,
          drag: 0.984,
          kind: 'booster',
          renderAs: 'circle'
        });
      }
    }

    drawParticleGlow(particle, glowRadius) {
      const gradient = this.ctx.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, glowRadius);
      gradient.addColorStop(0, this.makeAlphaColor(particle.color, particle.alpha));
      gradient.addColorStop(1, this.makeAlphaColor(particle.color, 0));
      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(particle.x, particle.y, glowRadius, 0, Math.PI * 2);
      this.ctx.fill();
    }

    drawParticleCore(particle) {
      if (particle.renderAs === 'image') {
        const image = this.loadImage(particle.imageSrc);
        if (image && image.complete && image.naturalWidth > 0) {
          const size = particle.size * 4.2;
          this.ctx.save();
          this.ctx.globalAlpha = particle.alpha * 0.92;
          this.ctx.drawImage(image, particle.x - size / 2, particle.y - size / 2, size, size);
          this.ctx.restore();
          return;
        }
      }

      if (particle.renderAs === 'heart') {
        this.drawGlyphParticle('\u2665', particle, particle.size * 3.2);
        return;
      }

      if (particle.renderAs === 'paw') {
        this.drawGlyphParticle('\ud83d\udc3e', particle, particle.size * 2.8);
        return;
      }

      if (particle.renderAs === 'star') {
        this.drawStarParticle(particle);
        return;
      }

      if (particle.renderAs === 'ring') {
        this.ctx.save();
        this.ctx.globalAlpha = particle.alpha * 0.9;
        this.ctx.strokeStyle = this.makeAlphaColor(particle.color, particle.alpha);
        this.ctx.lineWidth = Math.max(1.4, particle.size * 0.56);
        this.ctx.beginPath();
        this.ctx.arc(particle.x, particle.y, particle.size * 1.35, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.restore();
        return;
      }

      this.ctx.fillStyle = this.makeAlphaColor(particle.color, particle.alpha * 0.85);
      this.ctx.beginPath();
      this.ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      this.ctx.fill();
    }

    drawGlyphParticle(glyph, particle, fontSize) {
      this.ctx.save();
      this.ctx.globalAlpha = particle.alpha;
      this.ctx.fillStyle = this.makeAlphaColor(particle.color, particle.alpha);
      this.ctx.font = `${Math.max(12, fontSize)}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(glyph, particle.x, particle.y);
      this.ctx.restore();
    }

    drawStarParticle(particle) {
      const radius = particle.size * 1.85;
      this.ctx.save();
      this.ctx.globalAlpha = particle.alpha;
      this.ctx.fillStyle = this.makeAlphaColor(particle.color, particle.alpha);
      this.ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const outerAngle = -Math.PI / 2 + i * ((Math.PI * 2) / 5);
        const innerAngle = outerAngle + Math.PI / 5;
        const outerX = particle.x + Math.cos(outerAngle) * radius;
        const outerY = particle.y + Math.sin(outerAngle) * radius;
        const innerX = particle.x + Math.cos(innerAngle) * radius * 0.45;
        const innerY = particle.y + Math.sin(innerAngle) * radius * 0.45;
        if (i === 0) {
          this.ctx.moveTo(outerX, outerY);
        } else {
          this.ctx.lineTo(outerX, outerY);
        }
        this.ctx.lineTo(innerX, innerY);
      }
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.restore();
    }

    drawParticleTrail(particle) {
      this.ctx.strokeStyle = this.makeAlphaColor(particle.color, particle.alpha * particle.trailAlpha);
      this.ctx.lineWidth = Math.max(1, particle.size * 0.9);
      this.ctx.beginPath();
      this.ctx.moveTo(particle.x, particle.y);
      this.ctx.lineTo(
        particle.x - particle.vx * (particle.kind === 'ember' ? 2.6 : 1.8),
        particle.y - particle.vy * (particle.kind === 'ember' ? 2.6 : 1.8)
      );
      this.ctx.stroke();
    }

    makeAlphaColor(hex, alpha) {
      const clean = String(hex || '#ffffff').replace('#', '');
      const r = parseInt(clean.substring(0, 2), 16);
      const g = parseInt(clean.substring(2, 4), 16);
      const b = parseInt(clean.substring(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }

  window.FireworksDevFxGraph = FxGraph;
})();
