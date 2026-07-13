/**
 * STT Ticker - Text Buffer
 *
 * Puffert eingehende Transkript-Segmente.
 * JEDES Segment wird einzeln gespeichert — kein Merging, kein Überspringen.
 * Der Buffer hält bis zu bufferSize Segmente, ältere verfallen nach maxTextAge.
 *
 * Dual-Language-Modus:
 *  - Wenn config.dualLanguage.enabled → Segmente werden nach Sprache sortiert
 *    in zwei separate Outputs (topText / bottomText) zusammengeführt.
 *  - Wenn aus → klassischer Modus (text + lines)
 */

class TextBuffer {
  constructor(config) {
    this.config = config;
    this.segments = [];
    this.lastOutput = this._emptyOutput();
    this._nextId = 1; // monoton steigende ID pro Segment

    this.cleanupInterval = setInterval(() => {
      this._expireOldSegments();
    }, 5000);
  }

  push(segment) {
    const text = String(segment.text || '').trim();
    if (!text) return;

    const cleaned = this._cleanStutter(text);

    this.segments.push({
      id: this._nextId++,        // monoton steigend pro Segment
      raw: text,
      cleaned: cleaned,
      timestamp: segment.timestamp || Date.now(),
      latencyMs: segment.latencyMs || 0,
      provider: segment.provider || 'unknown',
      language: segment.language || 'unknown',
      languageSource: segment.languageSource || 'fallback',
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
    this.lastOutput = this._emptyOutput();
  }

  getStats() {
    const dual = this.config.dualLanguage || {};
    return {
      segmentCount: this.segments.length,
      lastOutputLength: this.lastOutput.text.length,
      lastOutputLines: (this.lastOutput.lines || []).length,
      oldestSegmentAge: this.segments.length > 0
        ? (Date.now() - this.segments[0].timestamp) / 1000
        : 0,
      dualMode: !!dual.enabled,
      topLanguage: dual.topLanguage || 'en',
      bottomLanguage: dual.bottomLanguage || 'de'
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

  _emptyOutput() {
    return {
      text: '',
      lines: [],
      segments: [],
      timestamp: 0,
      dual: null,
      multi: null
    };
  }

  _rebuildOutput() {
    this._expireOldSegments();

    if (this.segments.length === 0) {
      this.lastOutput = this._emptyOutput();
      return;
    }

    const maxChars = this.config.maxCharsPerLine || 80;
    const dual = this.config.dualLanguage || {};

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
      // Multi-Translation: carry through for N-language output
      let translations = null;
      if (s.translation && s.translation.translations) {
        translations = s.translation.translations;
      }
      return {
        id: s.id,                  // wichtig: durchschleifen für Client-Diff
        text: s.cleaned,
        lines,
        translation,
        translations,              // multi-language translations
        timestamp: s.timestamp,
        provider: s.provider,
        language: s.language,
        languageSource: s.languageSource
      };
    });

    const fullText = segmentOutputs.map(s => s.text).join(' ');

    const output = {
      text: fullText,
      lines: segmentOutputs.flatMap(s => s.lines),
      segments: segmentOutputs,
      timestamp: Date.now()
    };

    if (dual.enabled) {
      output.dual = this._buildDualOutput(segmentOutputs, dual, maxChars);
    } else {
      output.dual = null;
    }

    // Multi-Language Output (N Zeilen)
    const multiCfg = this.config.multiLanguage || {};
    if (multiCfg.enabled && Array.isArray(multiCfg.outputLanguages) && multiCfg.outputLanguages.length > 0) {
      output.multi = this._buildMultiOutput(segmentOutputs, multiCfg, maxChars);
    } else {
      output.multi = null;
    }

    this.lastOutput = output;
  }

  /**
   * Baut die zwei getrennten Sprach-Zeilen für Dual-Modus.
   * - Segmente werden nach Sprache gefiltert
   * - "Unknown" Segmente gehen je nach showUnknownOnTop auf top oder bottom
   * - Wenn eine Sprache gar keine Segmente hat → leerer String (Overlay blendet aus)
   * - Die letzten N Zeilen pro Sprache (maxLines)
   */
  _buildDualOutput(segmentOutputs, dual, maxChars) {
    const topLang = dual.topLanguage || 'en';
    const botLang = dual.bottomLanguage || 'de';
    const maxLines = this.config.maxLines || 2;

    const matchesLang = (seg, lang) => {
      if (seg.language === lang) return true;
      if (seg.language === 'unknown' || !seg.language) {
        return !!dual.showUnknownOnTop && lang === topLang;
      }
      return false;
    };

    const topSegs = segmentOutputs
      .filter(s => matchesLang(s, topLang))
      .slice(-maxLines);
    const botSegs = segmentOutputs
      .filter(s => matchesLang(s, botLang))
      .slice(-maxLines);

    const topText = topSegs.map(s => s.cleaned || s.text).join(' ');
    const botText = botSegs.map(s => s.cleaned || s.text).join(' ');

    // Übersetzungen mit einbeziehen (z. B. wenn Übersetzung in der Sprache der Zeile ist)
    let topTranslation = null;
    let botTranslation = null;
    if (topSegs.length > 0) {
      const lastTrans = topSegs[topSegs.length - 1].translation;
      if (lastTrans && lastTrans.translated) {
        topTranslation = {
          text: lastTrans.text,
          color: lastTrans.color
        };
      }
    }
    if (botSegs.length > 0) {
      const lastTrans = botSegs[botSegs.length - 1].translation;
      if (lastTrans && lastTrans.translated) {
        botTranslation = {
          text: lastTrans.text,
          color: lastTrans.color
        };
      }
    }

    return {
      enabled: true,
      topLanguage: topLang,
      bottomLanguage: botLang,
      topColor: dual.topColor || '#FFD700',
      bottomColor: dual.bottomColor || '#FFFFFF',
      topText,
      bottomText: botText,
      topLines: this._wrapText(topText, maxChars),
      bottomLines: this._wrapText(botText, maxChars),
      topTranslation,
      botTranslation,
      topSegmentCount: topSegs.length,
      botSegmentCount: botSegs.length
    };
  }

  /**
   * Baut N Zeilen Output für Multi-Language-Modus.
   * Zeile 0 = Original (defaultLanguage), Zeile 1..N = Übersetzungen.
   * Jede Zeile hat: { language, text, color, lines }
   */
  _buildMultiOutput(segmentOutputs, multiCfg, maxChars) {
    const defaultLang = multiCfg.defaultLanguage || 'de';
    const outputLangs = multiCfg.outputLanguages || [];
    const colors = multiCfg.colors || {};
    const maxLines = this.config.maxLines || 2;

    // Jede konfigurierte Sprache erhält entweder ihren Originaltext oder die
    // zugehörige Übersetzung. Dadurch bleibt ein als Englisch erkanntes
    // Segment sichtbar, auch wenn Deutsch die Standardzeile ist.
    const languages = Array.from(new Set([defaultLang, ...outputLangs]));
    const lines = languages.map(lang => {
      const sourceSegments = segmentOutputs
        .filter(segment => segment.language === lang || (
          lang === defaultLang && (segment.language === 'unknown' || !segment.language)
        ))
        .slice(-maxLines);
      const sourceText = sourceSegments.map(segment => segment.text).join(' ');

      let translatedText = '';
      for (const segment of segmentOutputs) {
        if (segment.translations?.[lang]?.text) {
          translatedText = segment.translations[lang].text;
        }
      }

      return {
        language: lang,
        text: sourceText || translatedText,
        color: colors[lang] || (lang === defaultLang ? '#FFFFFF' : '#FFD700'),
        type: lang === defaultLang ? 'original' : 'translation'
      };
    });

    return {
      enabled: true,
      defaultLanguage: defaultLang,
      outputLanguages: outputLangs,
      lines,
      colors
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
