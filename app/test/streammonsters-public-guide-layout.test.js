const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const websiteRoot = path.join(__dirname, '..', '..');
const guideSource = fs.readFileSync(
  path.join(websiteRoot, 'js', 'streammonsters-guide.js'),
  'utf8'
);
const pacingSource = fs.readFileSync(
  path.join(
    websiteRoot,
    'app',
    'plugins',
    'streamalchemy',
    'streammonsters-rules-v8-pacing.js'
  ),
  'utf8'
);
const guideHtml = fs.readFileSync(
  path.join(websiteRoot, 'streammonsters', 'index.html'),
  'utf8'
);

describe('Stream Monsters public guide layout bootstrap', () => {
  test('initializes the injected layout when the guide script loads after DOMContentLoaded', async () => {
    const dom = new JSDOM(guideHtml, {
      runScripts: 'outside-only',
      url: 'https://ltth.app/streammonsters/'
    });
    const init = jest.fn().mockResolvedValue();

    Object.defineProperty(dom.window.document, 'readyState', {
      configurable: true,
      value: 'complete'
    });
    const addEventListener = dom.window.document.addEventListener.bind(dom.window.document);
    dom.window.document.addEventListener = (type, listener, options) => {
      if (type === 'DOMContentLoaded') return undefined;
      return addEventListener(type, listener, options);
    };
    dom.window.LTTHLayout = { init };
    dom.window.eval(pacingSource);
    dom.window.eval(guideSource);

    await Promise.resolve();

    expect(init).toHaveBeenCalledTimes(1);
    dom.window.close();
  });
});
