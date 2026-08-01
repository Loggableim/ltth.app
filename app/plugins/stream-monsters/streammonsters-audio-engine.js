(function attachStreamMonstersAudioEngine(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StreamMonstersAudioEngine = api;
}(typeof globalThis === 'object' ? globalThis : this, () => {
  'use strict';

  const CHANNELS = Object.freeze(['master', 'ui', 'egg', 'battle', 'reward']);
  const DEFAULT_CHANNELS = Object.freeze(Object.fromEntries(
    CHANNELS.map(channel => [channel, Object.freeze({ enabled: true, volume: 0.8 })])
  ));

  function clampVolume(value, fallback = 0.8) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(0, Math.min(1, numeric));
  }

  function normalizeChannelConfig(input = {}) {
    return Object.fromEntries(CHANNELS.map(channel => {
      const current = input?.[channel] || DEFAULT_CHANNELS[channel];
      return [channel, {
        enabled: current.enabled !== false,
        volume: clampVolume(current.volume, DEFAULT_CHANNELS[channel].volume)
      }];
    }));
  }

  function stableHash(value) {
    let hash = 2166136261;
    for (const char of String(value || '')) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function variantIndex(eventId, length) {
    const count = Math.max(1, Number(length) || 1);
    return stableHash(eventId) % count;
  }

  function selectVariant(manifest, cueId, eventId) {
    const variants = manifest?.cues?.[cueId]?.variants;
    if (!Array.isArray(variants) || !variants.length) return null;
    return variants[variantIndex(eventId, variants.length)] || null;
  }

  function assetUrl(assetPath) {
    const value = String(assetPath || '');
    if (value.startsWith('/')) return value;
    if (value.startsWith('assets/')) return `/plugins/stream-monsters/${value}`;
    return value;
  }

  function createAudioEngine({
    context,
    manifest,
    fetchAsset = (...args) => fetch(...args),
    config = {}
  } = {}) {
    let channelConfig = normalizeChannelConfig(config);
    const buffers = new Map();
    const pending = new Map();
    if (!context) {
      return {
        preload: async () => false,
        play: async () => false,
        configure: value => {
          channelConfig = normalizeChannelConfig(value);
          return channelConfig;
        },
        status: () => ({
          ready: false,
          cached: 0,
          channels: channelConfig,
          limiter: false,
          ducking: false,
          reason: 'audio_context_unavailable'
        })
      };
    }

    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.12;
    limiter.connect(context.destination);
    const masterGain = context.createGain();
    masterGain.connect(limiter);
    const channelGains = Object.fromEntries(
      CHANNELS.filter(channel => channel !== 'master').map(channel => {
        const node = context.createGain();
        node.connect(masterGain);
        return [channel, node];
      })
    );
    let duckingUsed = false;

    function applyConfig() {
      masterGain.gain.value = channelConfig.master.enabled ? channelConfig.master.volume : 0;
      Object.entries(channelGains).forEach(([channel, node]) => {
        const value = channelConfig[channel];
        node.gain.value = value.enabled ? value.volume : 0;
      });
    }
    applyConfig();

    function automateDucking(focusedChannel, startAt, duck) {
      if (!duck || typeof duck !== 'object') return false;
      const amount = clampVolume(duck.amount, 0.4);
      const durationMs = Math.max(120, Math.min(5_000, Number(duck.durationMs) || 800));
      const attackAt = startAt + 0.03;
      const restoreAt = startAt + (durationMs / 1000);
      Object.entries(channelGains).forEach(([channel, node]) => {
        if (channel === focusedChannel) return;
        const baseline = channelConfig[channel].enabled
          ? channelConfig[channel].volume
          : 0;
        const gain = node.gain;
        if (
          typeof gain?.cancelScheduledValues !== 'function' ||
          typeof gain?.setValueAtTime !== 'function' ||
          typeof gain?.linearRampToValueAtTime !== 'function'
        ) return;
        gain.cancelScheduledValues(startAt);
        gain.setValueAtTime(baseline, startAt);
        gain.linearRampToValueAtTime(baseline * amount, attackAt);
        gain.setValueAtTime(baseline * amount, Math.max(attackAt, restoreAt - 0.08));
        gain.linearRampToValueAtTime(baseline, restoreAt);
      });
      duckingUsed = true;
      return true;
    }

    async function loadVariant(variant) {
      const key = variant?.assetPath;
      if (!key) return null;
      if (buffers.has(key)) return buffers.get(key);
      if (pending.has(key)) return pending.get(key);
      const request = (async () => {
        const response = await fetchAsset(assetUrl(key));
        if (!response?.ok) throw new Error(`STREAM_MONSTERS_AUDIO_HTTP_${response?.status || 0}`);
        const raw = await response.arrayBuffer();
        const decoded = await context.decodeAudioData(raw.slice ? raw.slice(0) : raw);
        buffers.set(key, decoded);
        pending.delete(key);
        return decoded;
      })().catch(error => {
        pending.delete(key);
        throw error;
      });
      pending.set(key, request);
      return request;
    }

    async function preload() {
      const variants = Object.values(manifest?.cues || {})
        .flatMap(cue => Array.isArray(cue.variants) ? cue.variants : []);
      const unique = [...new Map(variants.map(variant => [variant.assetPath, variant])).values()];
      const results = await Promise.allSettled(unique.map(loadVariant));
      return results.every(result => result.status === 'fulfilled');
    }

    async function play(cueId, { eventId = cueId, delayMs = 0, duck = false } = {}) {
      try {
        const cue = manifest?.cues?.[cueId];
        if (!cue || !channelGains[cue.channel]) return false;
        if (!channelConfig.master.enabled || !channelConfig[cue.channel]?.enabled) return false;
        const variant = selectVariant(manifest, cueId, eventId);
        if (!variant) return false;
        const buffer = await loadVariant(variant);
        if (!buffer) return false;
        const source = context.createBufferSource();
        source.buffer = buffer;
        const cueGain = context.createGain();
        cueGain.gain.value = 10 ** ((Number(cue.gainDb) || 0) / 20);
        source.connect(cueGain);
        cueGain.connect(channelGains[cue.channel]);
        const startAt = context.currentTime + (Math.max(0, Number(delayMs) || 0) / 1000);
        automateDucking(cue.channel, startAt, duck);
        source.start(startAt);
        return true;
      } catch {
        return false;
      }
    }

    return {
      preload,
      play,
      configure(value) {
        channelConfig = normalizeChannelConfig(value);
        applyConfig();
        return channelConfig;
      },
      status: () => ({
        ready: true,
        cached: buffers.size,
        channels: channelConfig,
        limiter: true,
        ducking: duckingUsed
      })
    };
  }

  return {
    CHANNELS,
    normalizeChannelConfig,
    stableHash,
    variantIndex,
    selectVariant,
    assetUrl,
    createAudioEngine
  };
}));
