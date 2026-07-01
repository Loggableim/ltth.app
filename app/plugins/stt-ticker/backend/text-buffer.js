/**
 * STT Ticker - Text Buffer
 *
 * Puffert eingehende Transkript-Segmente und sorgt für:
 * - Glättung (Stotter-Korrektur, Duplikat-Entfernung)
 * - Zeilenumbrüche bei maxCharsPerLine
 * - Automatisches Verwerfen alter Segmente (maxTextAge)
 * - Stabile Ausgabe (Text flackert nicht bei Korrekturen)
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
    }, 5000); // Alle 5 Sekunden aufräumen
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
   */
  getCurrent() {
    return this.lastOutput;
  }

  /**
   * Buffer leeren.
   */
  clear() {
    this.segments = [];
    this.lastOutput = {
      text: '',
      lines: [],
      segments: [],
      timestamp: 0
    };
  }

  /**
   * Stats abrufen.
   */
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

  /**
   * Config aktualisieren.
   */
  updateConfig(config) {
    this.config = config;
    this._rebuildOutput();
  }

  /**
   * Cleanup.
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.segments = [];
  }

  // ==================== Private Methods ====================

  /**
   * Ausgabe aus allen Segmenten neu aufbauen.
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

    // NUR das NEUESTE Segment als Haupttext senden
    const latest = this.segments[this.segments.length - 1];
    const latestText = latest.cleaned;

    // Letzte Übersetzung nehmen (vom neuesten Segment)
    const lastTranslation = latest.translation || null;

    // Zeilenumbrüche für den aktuellen Text
    const maxChars = this.config.maxCharsPerLine || 80;
    const lines = this._wrapText(latestText, maxChars);

    // Übersetzung auch in Zeilen umbrechen
    let translationOutput = null;
    if (lastTranslation && lastTranslation.translated) {
      const transLines = this._wrapText(lastTranslation.text, maxChars);
      translationOutput = {
        text: lastTranslation.text,
        lines: transLines,
        translated: true,
        color: lastTranslation.color,
        model: lastTranslation.model
      };
    }

    this.lastOutput = {
      text: latestText,
      lines: lines,
      segments: this.segments.map(s => ({
        text: s.cleaned,
        timestamp: s.timestamp,
        provider: s.provider
      })),
      translation: translationOutput,
      timestamp: Date.now()
    };
  }

  /**
   * Stotter-Korrektur: Entfernt wiederholte Wörter.
   * "ich ich ich meine" → "ich meine"
   * "das das ist" → "das ist"
   */
  _cleanStutter(text) {
    // 1. Wiederholte Wörter entfernen (2+ Mal hintereinander)
    // "ich ich ich meine" → "ich meine"
    let cleaned = text.replace(/\b(\w+)\s+(?=\1\b)/gi, '');

    // 2. Wiederholte Wortgruppen (2 Wörter) entfernen
    // "ich habe ich habe" → "ich habe"
    cleaned = cleaned.replace(/\b((\w+\s+\w+)\s+)\2\b/gi, '$2');

    // 3. Einzelbuchstaben-Wiederholungen: "a a a" → "a"
    cleaned = cleaned.replace(/\b(\w)\s+(?=\1\b)/gi, '');

    // 4. Nochmal Runde 1 für Fälle die durch Runde 3 neu entstanden sind
    cleaned = cleaned.replace(/\b(\w+)\s+(?=\1\b)/gi, '');

    // 5. Mehrfache Leerzeichen entfernen
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
  }

  /**
   * Text-Ähnlichkeit zwischen zwei Strings berechnen (0.0 - 1.0).
   * Nutzt einfache Wort-Überlappung.
   */
  _textSimilarity(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1.0;

    const wordsA = a.toLowerCase().split(/\s+/).filter(Boolean);
    const wordsB = b.toLowerCase().split(/\s+/).filter(Boolean);

    // Wenn einer der Texte sehr kurz ist, exakten Match prüfen
    if (wordsA.length <= 2 || wordsB.length <= 2) {
      return a.toLowerCase() === b.toLowerCase() ? 1.0 : 0.0;
    }

    // Jaccard-Ähnlichkeit auf Wortebene
    const setA = new Set(wordsA);
    const setB = new Set(wordsB);
    const intersection = new Set([...setA].filter(w => setB.has(w)));
    const union = new Set([...setA, ...setB]);

    return intersection.size / union.size;
  }

  /**
   * Text in Zeilen umbrechen (an Wortgrenzen).
   */
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

  /**
   * Alte Segmente entfernen (älter als maxTextAge).
   */
  _expireOldSegments() {
    const maxAge = (this.config.maxTextAge || 30) * 1000;
    const now = Date.now();
    const before = this.segments.length;

    this.segments = this.segments.filter(s => (now - s.timestamp) < maxAge);

    // Wenn sich was geändert hat, Ausgabe neu aufbauen
    if (this.segments.length !== before) {
      this._rebuildOutput();
    }
  }
}

module.exports = TextBuffer;
