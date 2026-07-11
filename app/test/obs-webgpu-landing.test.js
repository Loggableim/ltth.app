const fs = require('fs');
const path = require('path');

const locales = ['de', 'en', 'es', 'fr'];
const root = path.join(__dirname, '..', '..');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function getTranslation(locale, key) {
  if (Object.prototype.hasOwnProperty.call(locale, key)) return locale[key];
  return key.split('.').reduce((current, segment) => current && current[segment], locale);
}

describe('OBS WebGPU landing page', () => {
  test('is linked to the official WebGPU build and exposes localized copy', () => {
    const page = fs.readFileSync(path.join(root, 'obs-webgpu.html'), 'utf8');
    expect(page).toContain('https://github.com/Loggableim/obs-studio-webgpu');
    expect(page).toContain('https://github.com/Loggableim/obs-studio-webgpu/releases');

    const keys = [...page.matchAll(/data-i18n(?:="([^"]+)"|-(?:title|alt|aria-label)="([^"]+)")/g)]
      .map(match => match[1] || match[2]);
    expect(keys.length).toBeGreaterThan(20);
    keys.forEach(key => {
      locales.forEach(locale => {
        const localeFile = path.join(root, 'locales', `${locale}.json`);
        const value = getTranslation(readJson(localeFile), key);
        expect(value).toEqual(expect.any(String));
        expect(value.trim()).not.toBe('');
      });
    });
  });

  test('is discoverable from the feature and download surfaces', () => {
    ['features/emoji-rain.html', 'features/overlays.html', 'download.html', '_partials/footer.html'].forEach(relativeFile => {
      const source = fs.readFileSync(path.join(root, relativeFile), 'utf8');
      expect(source).toContain('/obs-webgpu.html');
    });
  });

  test('is documented in the localized Emoji Rain wiki pages', () => {
    const headings = {
      de: 'OBS WebGPU für LTTH',
      en: 'OBS WebGPU for LTTH',
      es: 'OBS WebGPU para LTTH',
      fr: 'OBS WebGPU pour LTTH'
    };
    locales.forEach(locale => {
      const page = fs.readFileSync(path.join(root, 'app', 'wiki', locale, 'Features', 'Emoji-Rain.md'), 'utf8');
      expect(page).toContain(headings[locale]);
      expect(page).toContain('https://github.com/Loggableim/obs-studio-webgpu/releases');
      expect(page).toContain('/obs-webgpu.html');
    });
  });
});
