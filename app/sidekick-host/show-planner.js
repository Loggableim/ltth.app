'use strict';

// ShowPlanner runs a fixed rotation of plugin ports. Only the active port's commands are live.
class ShowPlanner {
  constructor(ports) {
    if (!Array.isArray(ports) || ports.length < 2) {
      throw new Error('ShowPlanner needs at least two plugin ports');
    }
    const ids = new Set();
    for (const port of ports) {
      if (ids.has(port.id)) throw new Error(`ShowPlanner: duplicate plugin id ${port.id}`);
      ids.add(port.id);
    }
    this.ports = [...ports];
    this.index = 0;
  }

  active() {
    return this.ports[this.index];
  }

  allowedCommands() {
    return [...this.active().commands];
  }

  // Switch to the next plugin in the rotation. Returns the newly active port id.
  advance() {
    this.index = (this.index + 1) % this.ports.length;
    return this.active().id;
  }

  switchTo(pluginId) {
    const index = this.ports.findIndex(port => port.id === pluginId);
    if (index < 0) throw new Error(`ShowPlanner: unknown plugin ${pluginId}`);
    this.index = index;
    return this.active().id;
  }
}

module.exports = { ShowPlanner };
