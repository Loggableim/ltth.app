'use strict';

const settingsSchema = require('../lib/settings-schema');

describe('ClarityHUD color-named boolean settings', () => {
  const colorNamedFlags = ['colorblindSafeMode', 'usernameColorByTeamLevel'];

  test.each(['chat', 'full'])('validates %s defaults and both boolean values', dock => {
    const defaults = settingsSchema.getDefaults(dock);
    expect(settingsSchema.validateSettings(dock, defaults).valid).toBe(true);

    for (const value of [false, true]) {
      const candidate = { ...defaults };
      for (const key of colorNamedFlags) candidate[key] = value;
      const result = settingsSchema.validateSettings(dock, candidate);
      expect(result.valid).toBe(true);
      for (const key of colorNamedFlags) expect(result.sanitized[key]).toBe(value);
    }
  });

  test.each(colorNamedFlags)('rejects a non-boolean value for %s', key => {
    const candidate = { ...settingsSchema.getDefaults('chat'), [key]: 'true' };
    const result = settingsSchema.validateSettings('chat', candidate);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(`${key} must be a boolean`);
  });

  test('continues validating real color values and rejecting unknown settings', () => {
    const defaults = settingsSchema.getDefaults('chat');
    const validColor = settingsSchema.validateSettings('chat', { ...defaults, fontColor: '#123ABC' });
    expect(validColor.valid).toBe(true);
    expect(validColor.sanitized.fontColor).toBe('#123ABC');

    const invalidColor = settingsSchema.validateSettings('chat', { ...defaults, fontColor: 'not-a-color' });
    expect(invalidColor.valid).toBe(false);
    expect(invalidColor.errors).toContain('fontColor must be a valid color');

    const unknownSetting = settingsSchema.validateSettings('chat', { ...defaults, futureColorFlag: true });
    expect(unknownSetting.valid).toBe(false);
    expect(unknownSetting.errors).toContain('futureColorFlag is not a supported setting for chat');
  });

  test('leaves multi and stream defaults valid', () => {
    for (const dock of ['multi', 'stream']) {
      expect(settingsSchema.validateSettings(dock, settingsSchema.getDefaults(dock)).valid).toBe(true);
    }
  });
});
