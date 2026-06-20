const { resolveTtsRequestOverrides } = require('../plugins/tts/utils/request-overrides');

describe('TTS per-request fine settings', () => {
  test('uses AnimazingPal request values without changing global TTS config', () => {
    const globalConfig = {
      defaultFishaudioEmotion: 'neutral', defaultFishaudioPitch: 0, defaultFishaudioVolume: 1,
      volume: 80, speed: 1, duckOtherAudio: true, performanceMode: 'fast'
    };

    const overrides = resolveTtsRequestOverrides({
      source: 'animazingpal', emotion: 'amused', pitch: 3, volume: 67, speed: 1.2,
      streaming: false, duckOtherAudio: false
    }, globalConfig);

    expect(overrides).toEqual({
      emotion: 'amused', pitch: 3, synthesisVolume: 1, playbackVolume: 67,
      speed: 1.2, streaming: false, duckOtherAudio: false
    });
    expect(globalConfig.speed).toBe(1);
  });

  test('clamps malformed request values and falls back to global config', () => {
    const overrides = resolveTtsRequestOverrides({ pitch: 999, volume: -2, speed: 9 }, {
      defaultFishaudioEmotion: 'warm', defaultFishaudioPitch: 1, defaultFishaudioVolume: 0.9,
      volume: 75, speed: 1, duckOtherAudio: true, performanceMode: 'quality'
    });

    expect(overrides.pitch).toBe(12);
    expect(overrides.playbackVolume).toBe(0);
    expect(overrides.speed).toBe(2);
    expect(overrides.streaming).toBe(false);
  });
});
