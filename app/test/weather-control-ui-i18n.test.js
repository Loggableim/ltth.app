const fs = require('fs');
const path = require('path');

describe('Weather Control preview localization', () => {
  test('uses the shipped translate helper when the preview button changes state', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'weather-control', 'ui.html'), 'utf8');

    expect(source).not.toContain("i18nTranslate('buttons.preview_off')");
    expect(source).not.toContain("i18nTranslate('buttons.preview_on')");
    expect(source).toContain("weatherText('plugins.weather-control.buttons.preview_off'");
    expect(source).toContain("weatherText('plugins.weather-control.buttons.preview_on'");
  });
});
