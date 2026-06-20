class RelevanceEngine {
  isIgnored(message) {
    const text = this._normalize(message);
    if (!text) return true;
    if (text.length < 3) return true;
    if (/^!/.test(text)) return true;
    if (/https?:\/\/|www\./i.test(text)) return true;
    return false;
  }

  isGreeting(message) {
    const text = this._normalize(message);
    return /\b(hallo|hello|hey|hi|moin|servus|guten tag|good morning|good evening)\b/i.test(text);
  }

  isThanks(message) {
    const text = this._normalize(message);
    return /\b(danke|dankeschon|dankeschoen|thanks|thank you|ty|thx)\b/i.test(text);
  }

  score(message) {
    const text = this._normalize(message);
    if (this.isIgnored(text)) return 0.1;

    let score = 0.25;
    if (/[?？]$/.test(text) || /^(why|how|what|when|where|wer|wie|was|wann|warum|wo)\b/i.test(text)) {
      score += 0.35;
    }
    if (/\b(work|happen|happening|funktioniert|passiert|geht|help|hilfe|explain|erklar|erklär)\b/i.test(text)) {
      score += 0.2;
    }
    if (this.isGreeting(text) || this.isThanks(text)) {
      score += 0.3;
    }
    if (text.length > 40) {
      score += 0.1;
    }

    return Math.min(1, score);
  }

  evaluate(message, threshold = 0.6) {
    const score = this.score(message);
    const effectiveThreshold = Math.min(Number(threshold) || 0.6, 0.8);

    if (this.isGreeting(message)) {
      return { shouldRespond: true, score, reason: 'greeting' };
    }
    if (this.isThanks(message)) {
      return { shouldRespond: true, score, reason: 'thanks' };
    }
    if (this.isIgnored(message)) {
      return { shouldRespond: false, score, reason: 'ignored' };
    }

    return {
      shouldRespond: score >= effectiveThreshold,
      score,
      reason: score >= effectiveThreshold ? 'relevant' : 'low_relevance'
    };
  }

  _normalize(message) {
    return String(message || '').trim();
  }
}

module.exports = RelevanceEngine;
