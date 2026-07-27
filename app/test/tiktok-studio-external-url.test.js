'use strict';

const fs = require('fs');
const path = require('path');
const { copyExternal } = require('../public/js/tiktok-studio-url');

describe('TikTok Studio external overlay URLs', () => {
  test('VDO.Ninja exposes its generated Director URL through the shared action', () => {
    const html = fs.readFileSync(
      path.join(__dirname, '..', 'plugins', 'vdoninja', 'ui.html'),
      'utf8'
    );

    expect(html).toContain('<script src="/js/tiktok-studio-url.js"></script>');
    expect(html).toContain('data-copy-tiktok-studio-url');
    expect(html).toContain('data-tiktok-studio-url-mode="external"');
    expect(html).toContain('data-overlay-url-source="#directorUrl"');
    expect(html).toContain('data-i18n="common.tiktok_studio.copy_url"');
  });

  test('copies a generated HTTPS Director URL unchanged', async () => {
    const directorURL =
      'https://vdo.ninja/?director=room-7&cleanoutput&transparent';
    const fetchImpl = jest.fn();
    const writeText = jest.fn().mockResolvedValue(undefined);

    await expect(copyExternal(directorURL, {
      locationHref: 'http://127.0.0.1:3000/vdoninja/ui',
      fetchImpl,
      navigatorRef: { clipboard: { writeText } },
      documentRef: null
    })).resolves.toBe(directorURL);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith(directorURL);
  });
});
