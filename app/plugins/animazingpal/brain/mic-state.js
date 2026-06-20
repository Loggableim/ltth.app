const EventEmitter = require('events');

class MicState extends EventEmitter {
  constructor() {
    super();
    this.active = false;
    this.changedAt = Date.now();
  }

  isActive() {
    return this.active;
  }

  markActive() {
    this.active = true;
    this.changedAt = Date.now();
    this.emit('active');
  }

  markIdle() {
    this.active = false;
    this.changedAt = Date.now();
    this.emit('idle');
  }

  getTimeSinceChange() {
    return Date.now() - this.changedAt;
  }
}

module.exports = MicState;
