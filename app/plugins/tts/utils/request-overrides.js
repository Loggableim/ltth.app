'use strict';

function finiteOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function resolveTtsRequestOverrides(params = {}, config = {}) {
  const globalPitch = finiteOr(config.defaultFishaudioPitch, 0);
  const globalSynthesisVolume = finiteOr(config.defaultFishaudioVolume, 1);
  const globalPlaybackVolume = finiteOr(config.volume, 100);
  const globalSpeed = finiteOr(config.speed, 1);

  return {
    emotion: typeof params.emotion === 'string' && params.emotion.trim()
      ? params.emotion.trim()
      : (config.defaultFishaudioEmotion || 'neutral'),
    pitch: clamp(finiteOr(params.pitch, globalPitch), -12, 12),
    synthesisVolume: clamp(finiteOr(params.synthesisVolume, globalSynthesisVolume), 0, 2),
    playbackVolume: clamp(finiteOr(params.volume, globalPlaybackVolume), 0, 100),
    speed: clamp(finiteOr(params.speed, globalSpeed), 0.5, 2),
    streaming: typeof params.streaming === 'boolean'
      ? params.streaming
      : config.performanceMode !== 'quality',
    duckOtherAudio: typeof params.duckOtherAudio === 'boolean'
      ? params.duckOtherAudio
      : config.duckOtherAudio === true
  };
}

module.exports = { resolveTtsRequestOverrides };
