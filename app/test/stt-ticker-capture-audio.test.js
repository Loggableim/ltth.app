const {
  analyzeVoiceActivity,
  floatToLinear16,
  DeepgramVadGate
} = require('../plugins/stt-ticker/capture-audio');

function samples(length, value) {
  return Float32Array.from({ length }, () => value);
}

describe('STT Ticker capture audio helpers', () => {
  test('converts normalized float samples to little-endian Linear16', () => {
    const bytes = floatToLinear16(Float32Array.from([-2, -1, 0, 0.5, 1, 2]));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    expect(Array.from({ length: 6 }, (_, index) => view.getInt16(index * 2, true)))
      .toEqual([-32768, -32768, 0, 16384, 32767, 32767]);
  });

  test('uses configured RMS and speech-ratio thresholds', () => {
    expect(analyzeVoiceActivity(samples(100, 0.02), 1000, {
      rmsThreshold: 0.012,
      minSpeechRatio: 0.04
    })).toMatchObject({ hasSpeech: true, chunkMs: 100 });

    expect(analyzeVoiceActivity(samples(100, 0.001), 1000, {
      rmsThreshold: 0.012,
      minSpeechRatio: 0.04
    })).toMatchObject({ hasSpeech: false, chunkMs: 100 });
  });

  test('opens only after minimum speech and closes after sustained silence', () => {
    const gate = new DeepgramVadGate({
      enabled: true,
      rmsThreshold: 0.012,
      minSpeechRatio: 0.04,
      minChunkMs: 600,
      sustainedSilenceMs: 500
    }, 1000);

    const first = gate.process(samples(300, 0.03));
    const second = gate.process(samples(300, 0.03));
    const trailing = gate.process(samples(300, 0));
    const boundary = gate.process(samples(300, 0));
    const longSilence = gate.process(samples(300, 0));

    expect(first.frames).toHaveLength(0);
    expect(second.frames).toHaveLength(2);
    expect(second.state).toBe('speech');
    expect(trailing.frames).toHaveLength(1);
    expect(boundary.frames).toHaveLength(1);
    expect(boundary.utteranceBoundary).toBe(true);
    expect(longSilence.frames).toHaveLength(0);
    expect(longSilence.state).toBe('silence');
  });

  test('passes every frame when VAD is disabled', () => {
    const gate = new DeepgramVadGate({ enabled: false }, 16000);
    const result = gate.process(samples(160, 0));

    expect(result.frames).toHaveLength(1);
    expect(result.state).toBe('speech');
  });
});
