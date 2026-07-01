/**
 * STT Ticker - Text Buffer
 *
 * Puffert eingehende Transkript-Segmente und sorgt für:
 * - Glättung (Stotter-Korrektur, Duplikat-Entfernung)
 * - Zeilenumbrüche bei maxCharsPerLine
 * - Automatisches Verwerfen alter Segmente (maxTextAge)
 * - Fließende Ausgabe: ALLE aktiven Segmente werden gesendet
 */

class TextBuffer {
  constructor(config) {
    this.config = config;

    // Ringbuffer für Segmente
    this.segments = [];

    // Letzte vollständige Ausgabe (für Stabilität)
    this.lastOutput = {
      text: '',
      lines: [],
      segments: [],
      timestamp: 0
    };

    // Cleanup-Intervall
    this.cleanupInterval = setInterval(() => {
      this._expireOldSegments();
    }, 5000);
  }

  /**
   * Neues Transkript-Segment in den Buffer einfügen.
   */
  push(segment) {
    const text = String(segment.text || '').trim();
    if (!text) return;

    // Stotter-Korrektur anwenden
    const cleaned = this._cleanStutter(text);

    // Prüfen, ob das Segment signifikant anders ist als das letzte
    const lastSegment = this.segments[this.segments.length - 1];
    if (lastSegment) {
      const similarity = this._textSimilarity(cleaned, lastSegment.cleaned);
      if (similarity > 0.85) {
        // Sehr ähnlich → letztes Segment aktualisieren statt neues hinzufügen
        lastSegment.cleaned = cleaned;
        lastSegment.raw = text;
        lastSegment.timestamp = segment.timestamp || Date.now();
        lastSegment.latencyMs = segment.latencyMs || 0;
        lastSegment.provider = segment.provider || lastSegment.provider;
        if (segment.translation) lastSegment.translation = segment.translation;
        this._rebuildOutput();
        return;
      }
    }

    // Neues Segment hinzufügen
    this.segments.push({
      raw: text,
      cleaned: cleaned,
      timestamp: segment.timestamp || Date.now(),
      latencyMs: segment.latencyMs || 0,
      provider: segment.provider || 'unknown',
      translation: segment.translation || null
    });

    // Buffer-Größe begrenzen
    const maxSize = this.config.bufferSize || 10;
    while (this.segments.length > maxSize) {
      this.segments.shift();
    }

    this._rebuildOutput();
  }

  /**
   * Aktuelle geglättete Ausgabe abrufen.
   * Gibt ALLE aktiven Segmente zurück (nicht nur das neueste).
   */
  getCurrent() {
    return this.lastOutput;
  }

  clear() {
    this.segments = [];
    this.lastOutput = {
      text: '',
      lines: [],
      segments: [],
      timestamp: 0
    };
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

  // ==================== Private Methods ====================

  /**
   * Ausgabe aus ALLEN Segmenten neu aufbauen.
   * Sendet jedes Segment einzeln mit eigener Übersetzung.
   */
  _rebuildOutput() {
    this._expireOldSegments();

    if (this.segments.length === 0) {
      this.lastOutput = {
        text: '',
        lines: [],
        segments: [],
        timestamp: 0
      };
      return;
    }

    const maxChars = this.config.maxCharsPerLine || 80;

    // Jedes Segment als eigenes Objekt mit Text + Übersetzung
    const segmentOutputs = this.segments.map(s => {
      const lines = this._wrapText(s.cleaned, maxChars);
      let translation = null;
      if (s.translation && s.translation.translated) {
        const transLines = this._wrapText(s.translation.text, maxChars);
        translation = {
          text: s.translation.text,
          lines: transLines,
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

    // Haupttext = alle Segmente konkateniert (für Abwärtskompatibilität)
    const fullText = segmentOutputs.map(s => s.text).join(' ');

    this.lastOutput = {
      text: fullText,
      lines: segmentOutputs.flatMap(s => s.lines),
      segments: segmentOutputs,
      timestamp: Date.now()
    };
  }

  /**
   * Stotter-Korrektur: Entfernt wiederholte Wörter.
   */
  _cleanStutter(text) {
    let cleaned = text.replace(/\b(\w+)\s+(?=\1\b)/gi, '');
    cleaned = cleaned.replace(/\b((\w+\s+\w+)\s+)\2\b/gi, '$2');
    cleaned = cleaned.replace(/\b(\w)\s+(?=\1\b)/gi, '');
    cleaned = cleaned.replace(/\b(\w+)\s+(?=\1\b)/gi, '');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return cleaned;
  }

  /**
   * Text-Ähnlichkeit zwischen zwei Strings (0.0 - 1.0).
   */
  _textSimilarity(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1.0;

    const wordsA = a.toLowerCase().split(/\s+/).filter(Boolean);
    const wordsB = b.toLowerCase().split(/\s+/).filter(Boolean);

    if (wordsA.length <= 2 || wordsB.length <= 2) {
      return a.toLowerCase() === b.toLowerCase() ? 1.0 : 0.0;
    }

    const setA = new Set(wordsA);
    const setB = new Set(wordsB);
    const intersection = new Set([...setA].filter(w => setB.has(w)));
    const union = new Set([...setA, ...setB]);

    return intersection.size / union.size;
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
    const maxAge = (this.config.maxTextAge || 30) * 1000;
    const now = Date.now();
    const before = this.segments.length;

    this.segments = this.segments.filter(s => (now - s.timestamp) < maxAge);

    if (this.segments.length !== before) {
      this._rebuildOutput();
    }
  }
}

module.exports = TextBuffer;
