const fs = require('fs');
const path = require('path');

describe('OSC-Bridge runtime localization', () => {
  const pluginDir = path.join(__dirname, '..', 'plugins', 'osc-bridge');

  test.each(['en', 'de', 'es', 'fr'])('%s translates OSCQuery discovery feedback', locale => {
    const translations = JSON.parse(fs.readFileSync(path.join(pluginDir, 'locales', `${locale}.json`), 'utf8'));
    const runtime = translations.osc_bridge.runtime.oscquery;

    expect(runtime).toEqual(expect.objectContaining({
      unknown_error: expect.any(String),
      discovery_failed: expect.any(String),
      next_steps: expect.any(String),
      host: expect.any(String),
      port: expect.any(String),
      scanned: expect.any(String),
      found: expect.any(String),
      scanning: expect.any(String)
    }));
    expect(translations.generated['cf0c3c65e548']).toContain('mDNS');
    expect(translations.generated['3ec1fee24ad6']).toContain('mDNS');
    expect(translations.generated['3ec1fee24ad6']).not.toContain('9001-9020');
  });

  test('formats dynamic OSCQuery feedback through the shared i18n client', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'osc-bridge-ui.js'), 'utf8');

    expect(source).toContain('function translateOscBridge');
    expect(source).toContain("translateOscBridge('runtime.oscquery.discovery_failed'");
    expect(source).toContain("translateOscBridge('runtime.oscquery.found'");
    const markup = fs.readFileSync(path.join(pluginDir, 'ui.html'), 'utf8');
    expect(markup).toContain('via mDNS');
  });
});
