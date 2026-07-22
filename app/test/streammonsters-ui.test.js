const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

function response(payload) {
  return { ok: true, json: async () => payload };
}

function bootUi() {
  const html = fs.readFileSync(path.join(process.cwd(), 'plugins', 'streamalchemy', 'streammonsters-ui.html'), 'utf8');
  const fetchMock = jest.fn(async (url, options = {}) => {
    if (url === '/api/status') return response({ username: 'creator_live' });
    if (url === '/api/streammonsters/state') return response({
      success: true,
      config: { creatorName: '', hatchDurationMs: 1800000, maxUnhatchedEggs: 3, elementRules: 'deterministic' },
      pool: []
    });
    if (url === '/api/streammonsters/gift-catalog') return response({
      success: true,
      gifts: [{ giftId: 5655, giftName: 'Rose', coinValue: 1 }]
    });
    if (url === '/api/streammonsters/pool') return response({ success: true, entries: [] });
    if (url === '/api/streammonsters/config' && options.method === 'POST') return response({ success: true });
    if (url === '/api/streammonsters/demo' && options.method === 'POST') return response({ success: true, demo: true });
    if (url === '/api/streammonsters/pool/prepare' && options.method === 'POST') return response({ success: true, entries: [] });
    throw new Error(`Unexpected request: ${url}`);
  });
  const dom = new JSDOM(html, {
    url: 'http://localhost:3000/streammonsters/ui',
    runScripts: 'dangerously',
    beforeParse(window) { window.fetch = fetchMock; }
  });
  return { dom, fetchMock };
}

async function waitFor(assertion) {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  assertion();
}

describe('Stream Monsters creator wizard', () => {
  test('uses the connected creator as a default that can be saved as an override', async () => {
    const { dom, fetchMock } = bootUi();
    await waitFor(() => expect(dom.window.document.getElementById('creatorName').value).toBe('creator_live'));

    dom.window.document.getElementById('creatorName').value = 'The Egg Forge';
    dom.window.document.getElementById('saveSetup').click();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/streammonsters/config', expect.objectContaining({ method: 'POST' })));
    const saveCall = fetchMock.mock.calls.find(([url, options]) => url === '/api/streammonsters/config' && options.method === 'POST');
    expect(JSON.parse(saveCall[1].body)).toEqual(expect.objectContaining({ creatorName: 'The Egg Forge' }));
    dom.window.close();
  });

  test('contains the five-minute setup, generation preparation, OBS and transparency surfaces', () => {
    const html = fs.readFileSync(path.join(process.cwd(), 'plugins', 'streamalchemy', 'streammonsters-ui.html'), 'utf8');

    expect(html).toContain('Stream Monsters');
    expect(html).toContain('id="creatorName"');
    expect(html).toContain('id="queueGift"');
    expect(html).toContain('id="catalogGift"');
    expect(html).toContain('id="preparePool"');
    expect(html).toContain('id="localRuntimeStatus"');
    expect(html).toContain('window.confirm');
    expect(html).toContain('id="creatorMetrics"');
    expect(html).toContain('id="runDemo"');
    expect(html).toContain('!inventory');
    expect(html).toContain('deterministic');
    expect(html).toContain('/streammonsters/overlay');
  });
});
