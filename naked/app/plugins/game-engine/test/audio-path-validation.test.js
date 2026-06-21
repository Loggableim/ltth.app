/**
 * Audio path safety helpers.
 */

const path = require('path');
const GameEnginePlugin = require('../main');

describe('Audio path validation', () => {
  let plugin;

  beforeEach(() => {
    plugin = new GameEnginePlugin({
      log: jest.fn(),
      getSocketIO: () => ({ on: jest.fn(), emit: jest.fn() }),
      getDatabase: () => ({})
    });
  });

  test('allows expected mp3 filenames with spaces', () => {
    expect(plugin._isSafeAudioFilename('challenge accepted.mp3')).toBe(true);
    expect(plugin._isSafeAudioFilename('spinning sound.mp3')).toBe(true);
    expect(plugin._isSafeAudioFilename('price 1 audio.mp3')).toBe(true);
  });

  test('rejects traversal and non-mp3 audio filenames', () => {
    expect(plugin._isSafeAudioFilename('../secret.mp3')).toBe(false);
    expect(plugin._isSafeAudioFilename('..\\secret.mp3')).toBe(false);
    expect(plugin._isSafeAudioFilename('sound.wav')).toBe(false);
    expect(plugin._isSafeAudioFilename('sound.mp3.exe')).toBe(false);
  });

  test('safe join keeps resolved paths under the base directory', () => {
    const baseDir = path.resolve('C:/tmp/game-engine/sounds');

    expect(plugin._safeJoin(baseDir, 'wheel', 'lost.mp3')).toBe(path.join(baseDir, 'wheel', 'lost.mp3'));
    expect(plugin._safeJoin(baseDir, '..', 'secret.mp3')).toBeNull();
  });

  test('sanitizes wheel audio route fields', () => {
    expect(plugin._sanitizeNumericId('3')).toBe('3');
    expect(plugin._sanitizeNumericId('../3')).toBe('1');
    expect(plugin._sanitizeWheelAudioType('spinning')).toBe('spinning');
    expect(plugin._sanitizeWheelAudioType('../spinning')).toBeNull();
  });
});
