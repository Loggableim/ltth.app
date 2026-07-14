const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

describe('public i18n document language', () => {
  test('keeps data-lang aligned with the requested documentation locale', async () => {
    const dom = new JSDOM('<!doctype html><html lang="de" data-lang="de"><head></head><body></body></html>', {
      url: 'https://ltth.app/docs/plugins/emoji-rain.html?lang=en',
      runScripts: 'outside-only'
    });
    const fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    dom.window.fetch = fetch;
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'i18n.js'), 'utf8'),
      dom.getInternalVMContext()
    );

    await dom.window.I18n.init('en');

    expect(dom.window.document.documentElement.lang).toBe('en');
    expect(dom.window.document.documentElement.dataset.lang).toBe('en');
  });
});
