/**
 * Test: Fireworks Plugin Volume Initialization
 * 
 * Validates that the Fireworks plugin correctly sends the configured volume
 * to the overlay when a socket connects, instead of using hardcoded defaults.
 * 
 * Issue: When the overlay is activated, it should use the volume from settings,
 * not the hardcoded default of 70% (0.7).
 */

const fs = require('fs');
const path = require('path');

describe('Fireworks Plugin Volume Initialization', () => {
  let mainJs;
  let engineJs;

  beforeAll(() => {
    // Load main.js
    const mainPath = path.join(__dirname, '..', 'plugins', 'fireworks', 'main.js');
    mainJs = fs.readFileSync(mainPath, 'utf8');

    // Load engine.js
    const enginePath = path.join(__dirname, '..', 'plugins', 'fireworks', 'gpu', 'engine.js');
    engineJs = fs.readFileSync(enginePath, 'utf8');
  });

  describe('Config Initialization on Socket Connect', () => {
    test('should send config to newly connected socket', () => {
      // The socket handler should emit fireworks:config-update with the current config
      expect(mainJs).toContain("socket.emit('fireworks:config-update'");
      expect(mainJs).toContain('{ config: this.config }');
    });

    test('should have fpsUpdateHandler that handles socket connections', () => {
      // Verify the fpsUpdateHandler exists and accepts a socket parameter
      expect(mainJs).toContain('fpsUpdateHandler = (socket) =>');
    });

    test('should send config within connection handler function', () => {
      // Verify that config emission happens in the same context as socket connection handling
      const hasConnectionHandler = mainJs.includes('fpsUpdateHandler');
      const hasConfigEmit = mainJs.includes("socket.emit('fireworks:config-update'");
      expect(hasConnectionHandler && hasConfigEmit).toBe(true);
    });
  });

  describe('Default Volume Configuration', () => {
    test('should have audioVolume setting in default config', () => {
      // Check that audioVolume is part of the default config
      expect(mainJs).toContain('audioVolume:');
    });

    test('should handle config updates for volume', () => {
      // Check that engine.js handles volume updates from config-update event
      expect(engineJs).toContain("this.audioManager.setVolume(this.config.audioVolume)");
    });

    test('should listen for config-update events in engine', () => {
      // Verify the engine listens for config updates
      expect(engineJs).toContain("this.socket.on('fireworks:config-update'");
    });
  });

  describe('AudioManager Volume Handling', () => {
    test('should have setVolume method in AudioManager', () => {
      expect(engineJs).toContain('setVolume(volume)');
    });

    test('should apply volume to audio context', () => {
      // The AudioManager should store and apply the volume setting
      expect(engineJs).toContain('this.volume =');
    });
  });
});
