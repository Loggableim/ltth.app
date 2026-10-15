const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'theme-manager.js'), 'utf8');
const locales = Object.fromEntries(['de', 'en', 'es', 'fr'].map((locale) => [
  locale,
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', `${locale}.json`), 'utf8'))
]));

function getValue(data, key) {
  return key.split('.').reduce((value, part) => value?.[part], data);
}

function loadThemeManager(locale = 'en') {
  const dom = new JSDOM('<!doctype html><html><body><div class="topbar-right"></div></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost:3000/dashboard.html'
  });
  const languageListeners = [];
  const changeListeners = [];
  dom.window.i18n = {
    ready: Promise.resolve(),
    t: (key) => getValue(locales[locale], key) ?? key,
    onLanguageChange: (callback) => languageListeners.push(callback),
    onChange: (callback) => changeListeners.push(callback),
    setLocale: (next) => {
      locale = next;
      languageListeners.forEach((callback) => callback(next));
      changeListeners.forEach((callback) => callback(next));
    }
  };
  dom.window.eval(`${source}\nwindow.__themeManager = themeManager;`);
  return dom;
}

function expectLocale(dom, locale) {
  const { document } = dom.window;
  const config = locales[locale].theme.selector;
  expect(document.querySelector('#theme-toggle-btn').title).toBe(config.title);
  const activeTheme = dom.window.__themeManager.getCurrentTheme();
  expect(document.querySelector('.theme-toggle-label').textContent).toBe(config.options[activeTheme].name);
  for (const [themeKey, translation] of Object.entries(config.options)) {
    const option = document.querySelector(`[data-theme-option="${themeKey}"]`);
    expect(option.querySelector('.theme-option-name-text').textContent).toBe(translation.name);
    expect(option.querySelector('.theme-option-description').textContent).toBe(translation.description);
    if (translation.badge) expect(option.querySelector('.theme-option-badge').textContent).toBe(translation.badge);
  }
}

describe('Theme selector translations', () => {
  test.each(['de', 'en', 'es', 'fr'])('renders all theme labels and descriptions in %s', async (locale) => {
    const dom = loadThemeManager(locale);
    await dom.window.i18n.ready;
    await Promise.resolve();
    expectLocale(dom, locale);
    dom.window.close();
  });

  test('updates the existing selector in the same tab when the locale changes', async () => {
    const dom = loadThemeManager('de');
    await dom.window.i18n.ready;
    await Promise.resolve();
    expectLocale(dom, 'de');

    dom.window.i18n.setLocale('fr');

    expectLocale(dom, 'fr');
    expect(dom.window.document.querySelectorAll('#theme-toggle-btn').length).toBe(1);
    dom.window.__themeManager.setTheme('day');
    expect(dom.window.document.querySelector('.theme-toggle-label').textContent).toBe(
      locales.fr.theme.selector.options.day.name
    );
    dom.window.close();
  });
});
