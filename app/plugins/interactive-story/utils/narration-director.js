const EMOTIONS = new Set([
  'neutral', 'happy', 'sad', 'angry', 'excited', 'calm', 'nervous', 'confident', 'surprised', 'scared', 'worried', 'frustrated', 'curious', 'hopeful', 'nostalgic', 'determined', 'amused'
]);
const DELIVERIES = new Set(['in a hurry tone', 'shouting', 'screaming', 'whispering', 'soft tone', 'laughing', 'chuckling', 'sobbing', 'sighing', 'panting', 'gasping', 'break', 'long-break']);

class NarrationDirector {
  constructor({ model = 's1', mode = 'auto', logger = null } = {}) {
    this.model = model;
    this.mode = mode;
    this.logger = logger;
  }

  static stripMarkers(text) {
    return String(text || '').replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
  }

  static renderMarker(emotion, delivery, model) {
    const wrapper = /^s2/i.test(String(model || '')) ? ['[', ']'] : ['(', ')'];
    const cues = [];
    if (EMOTIONS.has(emotion) && emotion !== 'neutral') cues.push(emotion);
    if (DELIVERIES.has(delivery)) cues.push(delivery);
    return cues.map(cue => `${wrapper[0]}${cue}${wrapper[1]}`).join(' ');
  }

  prepareChapter(chapter, { theme = '' } = {}) {
    const displayText = NarrationDirector.stripMarkers(chapter && chapter.content);
    const sentences = String(displayText).match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map(sentence => sentence.trim()).filter(Boolean) || [];
    const metadata = Array.isArray(chapter && chapter.narrationSegments) ? chapter.narrationSegments : [];
    const segments = sentences.map((text, index) => this._applyMode(this._segmentFor(text, metadata[index], theme)));
    const ttsText = this.mode === 'off' ? displayText : segments.map(segment => {
      const marker = NarrationDirector.renderMarker(segment.emotion, segment.delivery, this.model);
      return marker ? `${marker} ${segment.text}` : segment.text;
    }).join(' ');
    return { displayText, segments, ttsText };
  }

  _applyMode(segment) {
    if (this.mode === 'calm') {
      return { ...segment, emotion: 'calm', delivery: 'soft tone' };
    }
    if (this.mode === 'dramatic') {
      return { ...segment, emotion: 'determined', delivery: /!/.test(segment.text) ? 'shouting' : null };
    }
    return segment;
  }

  _segmentFor(text, candidate, theme) {
    const suppliedText = NarrationDirector.stripMarkers(candidate && candidate.text);
    const matchesSentence = suppliedText && suppliedText === text;
    const emotion = matchesSentence && EMOTIONS.has(candidate.emotion) ? candidate.emotion : null;
    const delivery = matchesSentence && DELIVERIES.has(candidate.delivery) ? candidate.delivery : null;
    if (emotion || delivery) return { text, emotion: emotion || 'neutral', delivery };
    const tense = /shadow|dragon|cave|lunges|attack|danger|run|scream|schatten|drache|höhle|stürzt|gefahr|renn|schrei/.test(text.toLowerCase());
    if (tense && /fantasy|horror|mystery|adventure/.test(String(theme).toLowerCase())) return { text, emotion: 'scared', delivery: /!/.test(text) ? 'shouting' : null };
    return { text, emotion: 'neutral', delivery: null };
  }
}

module.exports = NarrationDirector;
