'use strict';

// In-memory fake of a live event source (lt-6qo T2).
//
// Replays scripted events and records every method call, so tests can prove the read-only
// source only reads (on/off/connect/disconnect) and never sends or writes. `connectBehavior`
// can force a failure to exercise the reconnect ladder without a real network or key.

const EventEmitter = require('events');

class FakeLiveSource extends EventEmitter {
  constructor({ connectBehavior = 'open' } = {}) {
    super();
    this.connectBehavior = connectBehavior;
    this.calls = [];
    this.connected = false;
  }

  async connect(username) {
    this.calls.push({ method: 'connect', username });
    if (this.connectBehavior === 'fail') throw new Error('connect refused');
    this.connected = true;
    return true;
  }

  async disconnect() {
    this.calls.push({ method: 'disconnect' });
    this.connected = false;
  }

  // Outbound methods. A read-only bridge must never reach these, so they record and throw.
  async write() {
    this.calls.push({ method: 'write' });
    throw new Error('write must not be called');
  }

  async send() {
    this.calls.push({ method: 'send' });
    throw new Error('send must not be called');
  }

  async reply() {
    this.calls.push({ method: 'reply' });
    throw new Error('reply must not be called');
  }

  chat(text, extra = {}) {
    this.emit('chat', { comment: text, ...extra });
    return this;
  }

  gift(data = {}) {
    this.emit('gift', data);
    return this;
  }

  follow(data = { action: 1 }) {
    this.emit('social', data);
    return this;
  }

  share(data = { action: 2 }) {
    this.emit('social', data);
    return this;
  }

  disconnectEvent(payload = {}) {
    this.emit('disconnected', payload);
    return this;
  }

  methodsCalled() {
    return this.calls.map(call => call.method);
  }
}

function createFakeLiveSource(options) {
  return new FakeLiveSource(options);
}

module.exports = { FakeLiveSource, createFakeLiveSource };
