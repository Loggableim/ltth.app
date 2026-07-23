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
      config: { creatorName: '', hatchDurationMs: 300000, maxUnhatchedEggs: 3, elementRules: 'deterministic', artPoolTarget: 3 },
      pool: [],
      hype: { points: 0, charged_eggs: 0 },
      season: { season_id: 'season-1', starts_at_ms: 1, ends_at_ms: 2 }
    });
    if (url.startsWith('/api/streammonsters/state?userId=')) return response({
      success: true,
      viewer: {
        eggs: [],
        monsters: [{
          monster_id: 'monster-1',
          name: 'Fizzlet',
          level: 2,
          element: 'Ember',
          personality: 'Brave',
          xp: 12,
          image_url: '/monster.png'
        }],
        selectedMonster: { monster_id: 'monster-1', name: 'Fizzlet' },
        achievements: [{ achievement_key: 'first_hatch' }],
        rank: { rank: 'Silver', points: 120, title: 'Silver Collector', badge: 'silver', frame: 'silver' }
      }
    });
    if (url.startsWith('/api/streammonsters/gift-catalog')) return response({
      success: true,
      gifts: [{ giftId: 5655, giftName: 'Rose', coinValue: 1, imageUrl: '/rose.png' }],
      total: 1086,
      offset: 0,
      limit: 40
    });
    if (url === '/api/streammonsters/gift-mappings') return response({ success: true, mappings: [] });
    if (url === '/api/streammonsters/pool') return response({ success: true, coverage: [] });
    if (url.startsWith('/api/streammonsters/leaderboard')) return response({ success: true, entries: [] });
    if (url === '/api/streamalchemy/providers/status') return response({
      success: true,
      providers: [
        { provider: 'localComfy', state: 'ready', model: 'flux-local' },
        { provider: 'openai', state: 'missing_api_key', detail: 'API key missing' }
      ]
    });
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

  test('contains the five market-ready areas, gift search, twelve eggs, OBS and full demo surfaces', () => {
    const html = fs.readFileSync(path.join(process.cwd(), 'plugins', 'streamalchemy', 'streammonsters-ui.html'), 'utf8');

    expect(html).toContain('Stream Monsters');
    expect(html).toContain('id="creatorName"');
    expect(html).toContain('Live-Readiness');
    expect(html).toContain('Geschenke-Mapping');
    expect(html).toContain('Art Lab');
    expect(html).toContain('Zuschauer-Sammlungen');
    expect(html).toContain('Saison &amp; Liga');
    expect(html).toContain('id="giftSearch"');
    expect(html).toContain('id="giftCatalog"');
    expect(html).toContain('id="saveGiftMapping"');
    expect(html).toContain('id="preparePool"');
    expect(html).toContain('id="poolTarget"');
    expect(html).toContain('id="localRuntimeStatus"');
    expect(html).toContain('id="provider-localComfy"');
    expect(html).toContain('id="provider-openai"');
    expect(html).toContain('id="viewerSummary"');
    expect(html).toContain('id="creatorMetrics"');
    expect(html).toContain('id="runDemo"');
    expect((html.match(/class="egg-card(?: charged)?"/g) || [])).toHaveLength(12);
    expect(html).toContain('!hatch');
    expect(html).toContain('!rank');
    expect(html).toContain('deterministisch');
    expect(html).toContain('/api/streammonsters/gift-mappings');
    expect(html).toContain('/streammonsters/overlay');
  });

  test('shows live provider status plus viewer rank, achievements and active monster', async () => {
    const { dom } = bootUi();
    await waitFor(() => expect(dom.window.document.getElementById('provider-localComfy').textContent)
      .toContain('flux-local'));

    dom.window.document.getElementById('viewerSearch').value = 'viewer_a';
    dom.window.document.getElementById('loadViewer').click();

    await waitFor(() => expect(dom.window.document.getElementById('viewerSummary').textContent)
      .toContain('Silber'));
    expect(dom.window.document.getElementById('viewerSummary').textContent).toContain('first hatch');
    expect(dom.window.document.getElementById('viewerCollection').textContent).toContain('AKTIV');
    dom.window.close();
  });
});
