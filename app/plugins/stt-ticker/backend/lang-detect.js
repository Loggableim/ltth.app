/**
 * STT Ticker - Language Detection (Heuristic)
 *
 * Leichtgewichtige EN/DE-Erkennung anhand von:
 *  - Diakritika (ä, ö, ü, ß) → starkes DE-Signal
 *  - Top-Funktionswörtern für DE und EN (Stopwords)
 *  - Confidence-Score (Differenz der Treffer)
 *
 * Vorteil: kein API-Call, keine Tokens, sofort verfügbar,
 * gut genug für Live-Caption-Routing in 95 % der Fälle.
 */

const DIACRITICS_DE = /[äöüÄÖÜß]/;

const STOPWORDS_DE = new Set([
  'der', 'die', 'das', 'und', 'ist', 'sind', 'war', 'hat', 'haben', 'wird',
  'werden', 'ein', 'eine', 'einer', 'eines', 'einem', 'einen',
  'nicht', 'auch', 'sehr', 'ganz', 'noch', 'schon', 'mal', 'ja', 'nein',
  'auf', 'für', 'mit', 'von', 'zu', 'bei', 'aus', 'nach', 'über', 'unter',
  'vor', 'zwischen', 'durch', 'gegen', 'ohne', 'um',
  'den', 'dem', 'des',
  'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'sie',
  'mein', 'dein', 'sein', 'ihr', 'unser', 'euer',
  'mich', 'dich', 'sich', 'uns', 'euch',
  'meine', 'deine', 'seine', 'ihre', 'unsere',
  'hier', 'dort', 'da', 'dann', 'wenn', 'weil', 'dass', 'damit', 'sodass',
  'aber', 'doch', 'sondern', 'oder', 'denn',
  'als', 'seit', 'während', 'bevor', 'nachdem', 'bis',
  'wie', 'was', 'wer', 'wo', 'wann', 'warum', 'weshalb', 'wieso', 'welche', 'wessen',
  'kann', 'konnte', 'muss', 'musste', 'soll', 'sollte', 'will', 'wollte',
  'möchte', 'mag', 'darf', 'durfte',
  'kein', 'keine', 'keiner', 'keinem', 'keinen',
  'alle', 'alles', 'viele', 'wenige', 'mehr', 'weniger',
  'jetzt', 'heute', 'morgen', 'gestern',
  'danke', 'bitte', 'gern', 'gerne',
  'so', 'genau', 'richtig', 'falsch', 'okay',
  'okay', 'ok', 'hallo', 'hi', 'tschüss', 'tschüss',
  'zum', 'zur', 'beim', 'vom', 'ins', 'ans', 'aufs', 'um', 'ums'
]);

const STOPWORDS_EN = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'done',
  'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'its', 'our', 'their', 'mine', 'yours', 'hers', 'ours', 'theirs',
  'this', 'that', 'these', 'those',
  'in', 'on', 'at', 'by', 'for', 'with', 'from', 'to', 'of', 'into', 'through',
  'during', 'before', 'after', 'above', 'below', 'up', 'down', 'over', 'under',
  'between', 'among', 'against', 'about', 'around',
  'not', 'no', 'yes', 'so', 'very', 'too', 'just', 'also', 'still', 'already', 'yet',
  'if', 'when', 'while', 'where', 'what', 'who', 'whom', 'whose', 'why', 'how', 'which',
  'because', 'since', 'until', 'than', 'as', 'like',
  'all', 'any', 'some', 'many', 'few', 'more', 'less', 'most', 'least',
  'one', 'two', 'three', 'first', 'second', 'last', 'next',
  'here', 'there', 'now', 'then', 'today', 'tomorrow', 'yesterday',
  'thanks', 'thank', 'please', 'welcome', 'hello', 'hi', 'bye', 'goodbye',
  'right', 'wrong', 'okay', 'ok', 'yeah', 'yep', 'nope',
  'let', 'lets', 'let\'s', 'gonna', 'wanna', 'gotta',
  'isn\'t', 'aren\'t', 'wasn\'t', 'weren\'t', 'don\'t', 'doesn\'t', 'didn\'t',
  'won\'t', 'wouldn\'t', 'shouldn\'t', 'couldn\'t', 'can\'t', 'cannot',
  'i\'m', 'you\'re', 'he\'s', 'she\'s', 'it\'s', 'we\'re', 'they\'re',
  'i\'ve', 'you\'ve', 'we\'ve', 'they\'ve',
  'i\'ll', 'you\'ll', 'we\'ll', 'they\'ll', 'he\'ll', 'she\'ll'
]);

/**
 * Erkenne Sprache eines Textes.
 * Returns: { lang: 'de'|'en'|'unknown', confidence: number }
 */
function detectLanguage(text, options = {}) {
  const minConfidence = options.minConfidence ?? 0.15;
  const unknownPolicy = options.unknownPolicy ?? 'auto';

  if (typeof text !== 'string' || text.trim().length < 4) {
    return applyPolicy({ lang: 'unknown', confidence: 0 }, unknownPolicy, options.fallback);
  }

  // Diakritika: starkes Signal
  if (DIACRITICS_DE.test(text)) {
    return { lang: 'de', confidence: 1.0 };
  }

  // Normalisiere und tokenisiere
  const normalized = text
    .toLowerCase()
    .replace(/[''ʼ]/g, '\'')
    .replace(/[^\w\s'’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = normalized.split(/\s+/).filter(t => t.length > 1 && !/^\d+$/.test(t));
  if (tokens.length < 2) {
    return applyPolicy({ lang: 'unknown', confidence: 0 }, unknownPolicy, options.fallback);
  }

  let deScore = 0;
  let enScore = 0;

  for (const tok of tokens) {
    // Wort mit Apostroph nur ersten Teil prüfen ("don't" → "don")
    const clean = tok.replace(/['’].*$/, '').replace(/.*?['’]/, '');
    if (STOPWORDS_DE.has(tok) || STOPWORDS_DE.has(clean)) deScore++;
    if (STOPWORDS_EN.has(tok) || STOPWORDS_EN.has(clean)) enScore++;
  }

  const total = deScore + enScore;
  if (total === 0) {
    return applyPolicy({ lang: 'unknown', confidence: 0 }, unknownPolicy, options.fallback);
  }

  // Confidence = Anteil der dominierenden Sprache minus Anteil der anderen
  const deRatio = deScore / total;
  const enRatio = enScore / total;
  const diff = Math.abs(deRatio - enRatio);

  if (deScore > enScore) {
    return applyPolicy({ lang: 'de', confidence: deRatio }, unknownPolicy, options.fallback, diff < minConfidence);
  }
  if (enScore > deScore) {
    return applyPolicy({ lang: 'en', confidence: enRatio }, unknownPolicy, options.fallback, diff < minConfidence);
  }

  return applyPolicy({ lang: 'unknown', confidence: 0 }, unknownPolicy, options.fallback);
}

function applyPolicy(result, unknownPolicy, fallback, isLowConfidence = false) {
  if (result.lang !== 'unknown' && !isLowConfidence) return result;
  if (result.lang !== 'unknown') {
    // Low confidence → noch unknown
    return mapUnknown(unknownPolicy, fallback);
  }
  return mapUnknown(unknownPolicy, fallback);
}

function mapUnknown(unknownPolicy, fallback) {
  if (unknownPolicy === 'de' || fallback === 'de') return { lang: 'de', confidence: 0 };
  if (unknownPolicy === 'en' || fallback === 'en') return { lang: 'en', confidence: 0 };
  // 'auto' → fallback aus Optionen oder 'en'
  return { lang: fallback || 'en', confidence: 0 };
}

function splitIntoSentences(text) {
  return (String(text || '').match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [])
    .map(sentence => sentence.trim())
    .filter(Boolean);
}

/**
 * Splits a transcript at provider pause boundaries or sentence boundaries and
 * assigns every resulting caption fragment to one display language.
 */
function routeTranscriptSegments(transcript = {}, config = {}) {
  const providerSegments = Array.isArray(transcript.segments)
    ? transcript.segments.filter(segment => segment && typeof segment.text === 'string' && segment.text.trim())
    : [];
  const sourceSegments = providerSegments.length > 0
    ? providerSegments
    : [{ text: transcript.text || '' }];
  const defaultLanguage = config.multiLanguage?.defaultLanguage
    || config.translation?.autoDetectDefault
    || config.asr?.fallbackLanguage
    || 'de';
  const detectionConfig = config.langDetect || {};

  return sourceSegments.flatMap(segment => splitIntoSentences(segment.text).map(text => {
    const detected = detectLanguage(text, {
      minConfidence: detectionConfig.minConfidence ?? 0.15,
      unknownPolicy: 'auto',
      fallback: defaultLanguage
    });
    const confidentlyDetected = Number(detected.confidence) > 0;

    return {
      text,
      language: confidentlyDetected ? detected.lang : defaultLanguage,
      languageSource: confidentlyDetected ? 'segment-heuristic' : 'segment-fallback',
      start: segment.start,
      end: segment.end
    };
  }));
}

module.exports = {
  detectLanguage,
  routeTranscriptSegments,
  // Exportiert für Tests
  _STOPWORDS_DE: STOPWORDS_DE,
  _STOPWORDS_EN: STOPWORDS_EN,
  _DIACRITICS_DE: DIACRITICS_DE
};
