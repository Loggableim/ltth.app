/**
 * STT Ticker - Text Buffer
 *
 * Puffert eingehende Transkript-Segmente.
 * JEDES Segment wird einzeln gespeichert — kein Merging, kein Überspringen.
 * Der Buffer hält bis zu bufferSize Segmente, ältere verfallen nach maxTextAge.
 */

class TextBuffer {
  constructor(config) {
    this.config = config;
    this.segments = [];
    this.lastOutput = { text: '', lines: [], segments: [], timestamp: 0 };

    this.cleanupInterval = setInterval(() => {
      this._expireOldSegments();
    }, 5000);
  }

  push(segment) {
    const text = String(segment.text || '').trim();
    if (!text) return;

    const cleaned = this._cleanStutter(text);

    this.segments.push({
      raw: text,
      cleaned: cleaned,
      timestamp: segment.timestamp || Date.now(),
      latencyMs: segment.latencyMs || 0,
      provider: segment.provider || 'unknown',
      translation: segment.translation || null
    });

    // Buffer-Größe begrenzen (älteste zuerst raus)
    const maxSize = this.config.bufferSize || 20;
    while (this.segments.length > maxSize) {
      this.segments.shift();
    }

    this._rebuildOutput();
  }

  getCurrent() {
    return this.lastOutput;
  }

  clear() {
    this.segments = [];
    this.lastOutput = { text: '', lines: [], segments: [], timestamp: 0 };
  }

  getStats() {
    return {
      segmentCount: this.segments.length,
      lastOutputLength: this.lastOutput.text.length,
      lastOutputLines: this.lastOutput.lines.length,
      oldestSegmentAge: this.segments.length > 0
        ? (Date.now() - this.segments[0].timestamp) / 1000
        : 0
    };
  }

  updateConfig(config) {
    this.config = config;
    this._rebuildOutput();
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.segments = [];
  }

  // ==================== Private ====================

  _rebuildOutput() {
    this._expireOldSegments();

    if (this.segments.length === 0) {
      this.lastOutput = { text: '', lines: [], segments: [], timestamp: 0 };
      return;
    }

    const maxChars = this.config.maxCharsPerLine || 80;

    const segmentOutputs = this.segments.map(s => {
      const lines = this._wrapText(s.cleaned, maxChars);
      let translation = null;
      if (s.translation && s.translation.translated) {
        translation = {
          text: s.translation.text,
          lines: this._wrapText(s.translation.text, maxChars),
          translated: true,
          color: s.translation.color,
          model: s.translation.model
        };
      }
      return {
        text: s.cleaned,
        lines,
        translation,
        timestamp: s.timestamp,
        provider: s.provider
      };
    });

    const fullText = segmentOutputs.map(s => s.text).join(' ');

    this.lastOutput = {
      text: fullText,
      lines: segmentOutputs.flatMap(s => s.lines),
      segments: segmentOutputs,
      timestamp: Date.now()
    };
  }

  _cleanStutter(text) {
    let cleaned = text.replace(/\b(\w+)\s+(?=\1\b)/gi, '');
    cleaned = cleaned.replace(/\b((\w+\s+\w+)\s+)\2\b/gi, '$2');
    cleaned = cleaned.replace(/\b(\w)\s+(?=\1\b)/gi, '');
    cleaned = cleaned.replace(/\b(\w+)\s+(?=\1\b)/gi, '');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return cleaned;
  }

  _wrapText(text, maxChars) {
    if (!text) return [];
    if (text.length <= maxChars) return [text];
    const words = text.split(/\s+/);
    const lines = [];
    let currentLine = '';
    for (const word of words) {
      if ((currentLine + ' ' + word).trim().length <= maxChars) {
        currentLine = (currentLine + ' ' + word).trim();
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  }

  _expireOldSegments() {
    const maxAge = (this.config.maxTextAge || 60) * 1000;
    const now = Date.now();
    const before = this.segments.length;
    this.segments = this.segments.filter(s => (now - s.timestamp) < maxAge);
    if (this.segments.length !== before) {
      this._rebuildOutput();
    }
  }
}

module.exports = TextBuffer;
