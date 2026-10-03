const {
  analyzeVoiceActivity,
  analyzeSpeechChunk,
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

  test('preserves short replies despite legacy minimum speech and closes after silence', () => {
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

    expect(first.frames).toHaveLength(1);
    expect(second.frames).toHaveLength(1);
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


test('live gate retains a bounded quiet onset before a short bilingual reply', () => {
  const gate = new DeepgramVadGate({ preRollMs: 300, minChunkMs: 600 }, 1000);
  gate.process(samples(200, 0.001));
  gate.process(samples(200, 0.002));
  const reply = gate.process(samples(100, 0.03));
  expect(reply.frames.map(frame => frame.length)).toEqual([100, 200, 100]);
  expect(reply.state).toBe('speech');
  gate.reset();
  expect(gate.process(samples(100, 0.03)).frames).toHaveLength(1);
});


test('upload VAD preserves a short reply surrounded by several seconds of silence', () => {
  const chunk = samples(5000, 0);
  chunk.set(samples(100, 0.04), 2200);
  expect(analyzeVoiceActivity(chunk, 1000).hasSpeech).toBe(false);
  expect(analyzeSpeechChunk(chunk, 1000).hasSpeech).toBe(true);
  expect(analyzeSpeechChunk(samples(5000, 0), 1000).hasSpeech).toBe(false);
});
