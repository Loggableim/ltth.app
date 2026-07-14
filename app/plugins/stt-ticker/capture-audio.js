(function exposeCaptureAudio(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SttTickerCaptureAudio = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createCaptureAudio() {
  function analyzeVoiceActivity(samples, sampleRate, config = {}) {
    if (!samples || samples.length === 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) {
      return { hasSpeech: false, rms: 0, speechRatio: 0, chunkMs: 0 };
    }

    const rmsThreshold = Number(config.rmsThreshold) || 0.012;
    const minSpeechRatio = Number(config.minSpeechRatio) || 0.04;
    const loudThreshold = rmsThreshold * 0.5;
    let sumSquares = 0;
    let loudSamples = 0;

    for (let index = 0; index < samples.length; index++) {
      const sample = Number(samples[index]) || 0;
      sumSquares += sample * sample;
      if (Math.abs(sample) > loudThreshold) loudSamples++;
    }

    const rms = Math.sqrt(sumSquares / samples.length);
    const speechRatio = loudSamples / samples.length;
    return {
      hasSpeech: rms >= rmsThreshold && speechRatio >= minSpeechRatio,
      rms,
      speechRatio,
      chunkMs: Math.round((samples.length / sampleRate) * 1000)
    };
  }

  function floatToLinear16(samples) {
    const output = new Uint8Array((samples?.length || 0) * 2);
    const view = new DataView(output.buffer);
    for (let index = 0; index < (samples?.length || 0); index++) {
      const sample = Math.max(-1, Math.min(1, Number(samples[index]) || 0));
      const value = sample < 0
        ? Math.round(sample * 32768)
        : Math.round(sample * 32767);
      view.setInt16(index * 2, value, true);
    }
    return output;
  }

  class DeepgramVadGate {
    constructor(config = {}, sampleRate = 16000) {
      this.config = { ...config };
      this.sampleRate = sampleRate;
      this.pendingSpeech = [];
      this.pendingSpeechMs = 0;
      this.silenceMs = 0;
      this.open = false;
    }

    updateConfig(config = {}) {
      this.config = { ...config };
    }

    reset() {
      this.pendingSpeech = [];
      this.pendingSpeechMs = 0;
      this.silenceMs = 0;
      this.open = false;
    }

    process(samples) {
      const frame = Float32Array.from(samples || []);
      const analysis = analyzeVoiceActivity(frame, this.sampleRate, this.config);
      if (this.config.enabled === false) {
        return {
          frames: frame.length ? [frame] : [],
          utteranceBoundary: false,
          state: 'speech',
          analysis
        };
      }

      if (analysis.hasSpeech) {
        this.silenceMs = 0;
        if (this.open) {
          return { frames: [frame], utteranceBoundary: false, state: 'speech', analysis };
        }

        this.pendingSpeech.push(frame);
        this.pendingSpeechMs += analysis.chunkMs;
        const minChunkMs = Math.max(0, Number(this.config.minChunkMs) || 600);
        if (this.pendingSpeechMs >= minChunkMs) {
          const frames = this.pendingSpeech;
          this.pendingSpeech = [];
          this.pendingSpeechMs = 0;
          this.open = true;
          return { frames, utteranceBoundary: false, state: 'speech', analysis };
        }
        return { frames: [], utteranceBoundary: false, state: 'pending', analysis };
      }

      this.pendingSpeech = [];
      this.pendingSpeechMs = 0;
      if (!this.open) {
        return { frames: [], utteranceBoundary: false, state: 'silence', analysis };
      }

      this.silenceMs += analysis.chunkMs;
      const sustainedSilenceMs = Math.max(0, Number(this.config.sustainedSilenceMs) || 1500);
      const utteranceBoundary = this.silenceMs >= sustainedSilenceMs;
      if (utteranceBoundary) {
        this.open = false;
        this.silenceMs = 0;
      }
      return {
        frames: frame.length ? [frame] : [],
        utteranceBoundary,
        state: utteranceBoundary ? 'silence' : 'trailing-silence',
        analysis
      };
    }
  }

  return { analyzeVoiceActivity, floatToLinear16, DeepgramVadGate };
}));
