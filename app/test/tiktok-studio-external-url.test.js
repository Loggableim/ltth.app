'use strict';

const fs = require('fs');
const path = require('path');
const { copyExternal } = require('../public/js/tiktok-studio-url');

describe('TikTok Studio external overlay URLs', () => {
  const directorURL =
    'https://vdo.ninja/?director=0123456789ab&password=0123456789abcdef&cleanoutput&api=0123456789ab';

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

  test.each([
    'https://evil.example/?director=0123456789ab&password=0123456789abcdef&cleanoutput&api=0123456789ab',
    'https://vdo.ninja.evil.example/?director=0123456789ab&password=0123456789abcdef&cleanoutput&api=0123456789ab',
    'https://user:pass@vdo.ninja/?director=0123456789ab&password=0123456789abcdef&cleanoutput&api=0123456789ab',
    'https://vdo.ninja:8443/?director=0123456789ab&password=0123456789abcdef&cleanoutput&api=0123456789ab',
    'https://vdo.ninja:443/?director=0123456789ab&password=0123456789abcdef&cleanoutput&api=0123456789ab',
    'https://vdo.ninja/director?director=0123456789ab&password=0123456789abcdef&cleanoutput&api=0123456789ab',
    'https://vdo.ninja/?director=0123456789ab&cleanoutput&api=0123456789ab',
    'https://vdo.ninja/?password=0123456789abcdef&director=0123456789ab&cleanoutput&api=0123456789ab',
    'https://vdo.ninja/?director=0123456789ab&password=0123456789abcdef&api=0123456789ab',
    'https://vdo.ninja/?director=0123456789ab&password=0123456789abcdef&cleanoutput&api=ba9876543210',
    'https://vdo.ninja/?director=0123456789ab&password=0123456789abcdef&cleanoutput&api=0123456789ab&extra=1',
    'HTTPS://vdo.ninja/?director=0123456789ab&password=0123456789abcdef&cleanoutput&api=0123456789ab',
    'https://vdo.ninja/?director=0123456789ab&password=0123456789abcdef&cleanoutput&api=0123456789ab#fragment',
    'http://127.0.0.1:3000/goals/overlay'
  ])('rejects noncanonical or unauthorized external URL %s', async rawUrl => {
    const writeText = jest.fn();

    await expect(copyExternal(rawUrl, {
      locationHref: 'http://127.0.0.1:3000/vdoninja/ui',
      navigatorRef: { clipboard: { writeText } },
      documentRef: null
    })).rejects.toMatchObject({
      code: expect.stringMatching(
        /^(?:URL_CREDENTIALS_NOT_ALLOWED|EXTERNAL_VDO_DIRECTOR_URL_REQUIRED)$/
      )
    });
    expect(writeText).not.toHaveBeenCalled();
  });
});
