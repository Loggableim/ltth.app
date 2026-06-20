const EventEmitter = require('events');

class SpeechState extends EventEmitter {
  constructor() {
    super();
    this.speaking = false;
    this.startedAt = null;
    this.endedAt = null;
  }

  isSpeaking() {
    return this.speaking;
  }

  markStarted() {
    this.speaking = true;
    this.startedAt = Date.now();
    this.endedAt = null;
    this.emit('started');
  }

  markEnded() {
    this.speaking = false;
    this.endedAt = Date.now();
    this.emit('ended');
  }

  getSpeechDuration() {
    if (!this.startedAt) return 0;
    const end = this.endedAt || Date.now();
    return Math.max(0, end - this.startedAt);
  }
}

module.exports = SpeechState;
