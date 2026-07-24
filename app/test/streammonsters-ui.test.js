const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const overlayRuntime = require('../plugins/streamalchemy/streammonsters-overlay-runtime');
const creatorRuntime = require('../plugins/streamalchemy/streammonsters-creator-runtime');

function response(payload) {
  return { ok: true, json: async () => payload };
}

function errorResponse(error) {
  return { ok: false, json: async () => ({ error }) };
}

function bootUi({ runtimeFetch, locale = null } = {}) {
  const html = fs.readFileSync(path.join(process.cwd(), 'plugins', 'streamalchemy', 'streammonsters-ui.html'), 'utf8');
  const localeText = locale
    ? JSON.parse(fs.readFileSync(
      path.join(process.cwd(), 'plugins', 'streamalchemy', 'locales', `${locale}.json`),
      'utf8'
    )).plugins.streamalchemy.ui.monsters
    : null;
  const fetchMock = jest.fn(async (url, options = {}) => {
    if (runtimeFetch) {
      const runtimeResponse = await runtimeFetch(url, options);
      if (runtimeResponse) return runtimeResponse;
    }
    if (url === '/api/status') return response({ username: 'creator_live' });
    if (url === '/api/streammonsters/state') return response({
      success: true,
      config: { creatorName: '', hatchDurationMs: 300000, maxUnhatchedEggs: 3, elementRules: 'deterministic', artPoolTarget: 3 },
      effectiveHatchDurationMs: 120000,
      eggCounts: { incubating: 2, queued: 3, ready: 1 },
      pool: [],
      hype: { points: 0, charged_eggs: 0 },
      heartChain: { chain_length: 4 },
      streamMission: { mission_key: 'six_hatches', progress: 2, target: 6 },
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
    if (url.startsWith('/api/streammonsters/monster-catalog')) return response({
      success: true,
      templates: Array.from({ length: 24 }, (_, index) => ({
        templateId: `template-${index}`,
        name: `Monster ${index}`,
        element: ['Ember','Tide','Grove','Gale','Volt','Lunar'][Math.floor(index / 4)],
        assetPath: `/monster-${index}.png`,
        owned: index === 0,
        silhouette: index !== 0,
        mastery: index === 0 ? { points: 17, unlocks: ['title'] } : null
      })),
      dex: { owned: 0, total: 24 },
      essence: [{ element: 'Ember', amount: 5, unlocks: ['aura'] }],
      cosmetics: ['frame:ember']
    });
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
    beforeParse(window) {
      window.fetch = fetchMock;
      window.StreamMonstersOverlayRuntime = overlayRuntime;
      window.StreamMonstersCreatorRuntime = creatorRuntime;
      window.i18n = {
        init: async () => {},
        updateDOM: () => {},
        t: (key, params = {}) => {
          const prefix = 'plugins.streamalchemy.ui.monsters.';
          if (localeText && key.startsWith(prefix)) {
            const translated = localeText[key.slice(prefix.length)] || key;
            return translated.replace(/\{\{(\w+)\}\}/g, (match, name) => (
              Object.prototype.hasOwnProperty.call(params, name) ? params[name] : match
            ));
          }
          return ({
            'plugins.streamalchemy.ui.monsters.achievementFirstHatch': 'Erster Schlupf'
          }[key] || key);
        }
      };
    }
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
  test.each([
    ['de', {
      STREAM_MONSTERS_RUNTIME_NOT_INSTALLED: 'Installiere zuerst die empfohlene Runtime.',
      STREAM_MONSTERS_RUNTIME_VERIFY_ADAPTER_MISMATCH: 'Wähle den installierten Grafikadapter aus oder installiere die Runtime für den ausgewählten Adapter neu.',
      STREAM_MONSTERS_RUNTIME_VERIFY_PROFILE_MISMATCH: 'Wähle das installierte Runtime-Profil aus oder installiere die Runtime für das ausgewählte Profil neu.'
    }],
    ['en', {
      STREAM_MONSTERS_RUNTIME_NOT_INSTALLED: 'Install the recommended runtime first.',
      STREAM_MONSTERS_RUNTIME_VERIFY_ADAPTER_MISMATCH: 'Select the installed graphics adapter or reinstall the runtime for the selected adapter.',
      STREAM_MONSTERS_RUNTIME_VERIFY_PROFILE_MISMATCH: 'Select the installed runtime profile or reinstall the runtime for the selected profile.'
    }],
    ['es', {
      STREAM_MONSTERS_RUNTIME_NOT_INSTALLED: 'Instala primero el runtime recomendado.',
      STREAM_MONSTERS_RUNTIME_VERIFY_ADAPTER_MISMATCH: 'Selecciona el adaptador gráfico instalado o reinstala el runtime para el adaptador seleccionado.',
      STREAM_MONSTERS_RUNTIME_VERIFY_PROFILE_MISMATCH: 'Selecciona el perfil de runtime instalado o reinstala el runtime para el perfil seleccionado.'
    }],
    ['fr', {
      STREAM_MONSTERS_RUNTIME_NOT_INSTALLED: 'Installez d’abord le runtime recommandé.',
      STREAM_MONSTERS_RUNTIME_VERIFY_ADAPTER_MISMATCH: 'Sélectionnez l’adaptateur graphique installé ou réinstallez le runtime pour l’adaptateur sélectionné.',
      STREAM_MONSTERS_RUNTIME_VERIFY_PROFILE_MISMATCH: 'Sélectionnez le profil de runtime installé ou réinstallez le runtime pour le profil sélectionné.'
    }]
  ])('renders actionable managed-runtime verification errors in %s without the generic fallback', async (locale, expectedMessages) => {
    const runtimeStatus = {
      success: true,
      adapters: [{ id: 'gpu-1', name: 'NVIDIA RTX 4060', vramMb: 8192 }],
      selectedAdapterId: 'gpu-1',
      recommendation: {
        supported: true,
        profileId: 'nvidia-standard',
        reasonCode: 'supported_profile'
      },
      profiles: [{ id: 'nvidia-standard', label: 'NVIDIA RTX 20+', backend: 'cuda' }],
      runtimeDetails: { profileId: 'nvidia-standard', backend: 'cuda', adapterId: 'gpu-1' },
      installDetails: {},
      model: { license: 'OpenRAIL++' }
    };
    const genericFallback = JSON.parse(fs.readFileSync(
      path.join(process.cwd(), 'plugins', 'streamalchemy', 'locales', `${locale}.json`),
      'utf8'
    )).plugins.streamalchemy.ui.monsters.runtimeErrorUnknown;

    for (const [errorCode, expectedMessage] of Object.entries(expectedMessages)) {
      const { dom } = bootUi({
        locale,
        runtimeFetch: async (url, options) => {
          if (url.startsWith('/api/streammonsters/local-runtime/status')) return response(runtimeStatus);
          if (url === '/api/streammonsters/local-runtime/verify' && options.method === 'POST') {
            return errorResponse(errorCode);
          }
          return null;
        }
      });
      await waitFor(() => expect(dom.window.document.getElementById('runtimeAdapters').value).toBe('gpu-1'));
      dom.window.document.getElementById('runtimeVerify').click();
      await waitFor(() => expect(dom.window.document.getElementById('notice').textContent).toBe(expectedMessage));
      expect(dom.window.document.getElementById('notice').textContent).not.toBe(genericFallback);
      dom.window.close();
    }
  });

  test('starts a fresh install job with the remembered request after cancel and resume', async () => {
    let installCount = 0;
    const runtimeStatus = {
      success: true,
      adapters: [{ id: 'gpu-1', name: 'NVIDIA RTX 4060', vramMb: 8192 }],
      selectedAdapterId: 'gpu-1',
      recommendation: {
        supported: true,
        profileId: 'nvidia-standard',
        reasonCode: 'supported_profile',
        width: 768,
        height: 768,
        steps: 4
      },
      profiles: [{ id: 'nvidia-standard', label: 'NVIDIA RTX 20+', backend: 'cuda' }],
      runtimeDetails: { profileId: 'nvidia-standard', backend: 'cuda', adapterId: 'gpu-1' },
      installDetails: {},
      model: { license: 'OpenRAIL++' }
    };
    const { dom, fetchMock } = bootUi({
      runtimeFetch: async (url, options) => {
        if (url.startsWith('/api/streammonsters/local-runtime/status')) return response(runtimeStatus);
        if (url === '/api/streammonsters/local-runtime/install' && options.method === 'POST') {
          installCount += 1;
          return response({ jobId: `runtime-job-${installCount}`, state: 'queued' });
        }
        if (url === '/api/streammonsters/local-runtime/install/runtime-job-1' && !options.method) {
          return response({ jobId: 'runtime-job-1', state: 'running', progress: { phase: 'runtime_download', completedBytes: 4, totalBytes: 10 } });
        }
        if (url === '/api/streammonsters/local-runtime/install/runtime-job-1' && options.method === 'DELETE') {
          return response({ jobId: 'runtime-job-1', state: 'cancelled', progress: { phase: 'cancelled' } });
        }
        if (url === '/api/streammonsters/local-runtime/install/runtime-job-2' && !options.method) {
          return response({ jobId: 'runtime-job-2', state: 'running', progress: { phase: 'model_download', completedBytes: 5, totalBytes: 10 } });
        }
        return null;
      }
    });
    await waitFor(() => expect(dom.window.document.getElementById('runtimeAdapters').value).toBe('gpu-1'));
    dom.window.document.getElementById('runtimeLicenseAccepted').checked = true;

    dom.window.document.getElementById('runtimeInstall').click();
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url, options]) => (
      url === '/api/streammonsters/local-runtime/install' && options.method === 'POST'
    ))).toHaveLength(1));
    dom.window.document.getElementById('runtimeCancel').click();
    await waitFor(() => expect(dom.window.localStorage.getItem('streammonsters-runtime-job-id')).toBeNull());
    dom.window.document.getElementById('runtimeResume').click();

    await waitFor(() => expect(fetchMock.mock.calls.filter(([url, options]) => (
      url === '/api/streammonsters/local-runtime/install' && options.method === 'POST'
    ))).toHaveLength(2));
    const resumedPost = fetchMock.mock.calls.filter(([url, options]) => (
      url === '/api/streammonsters/local-runtime/install' && options.method === 'POST'
    ))[1];
    expect(JSON.parse(resumedPost[1].body)).toEqual({
      adapterId: 'gpu-1',
      profileId: 'nvidia-standard',
      acceptModelLicense: true
    });
    await waitFor(() => expect(dom.window.document.getElementById('runtimeProgress').value).toBe(50));
    dom.window.close();
  });

  test('labels an unsupported adapter with its localized recovery path, never the official path', async () => {
    const base = {
      success: true,
      adapters: [
        { id: 'gpu-1', name: 'NVIDIA RTX 4060', vramMb: 8192 },
        { id: 'gpu-2', name: 'Legacy AMD', vramMb: 4096 }
      ],
      profiles: [{ id: 'nvidia-standard', label: 'NVIDIA RTX 20+', backend: 'cuda' }],
      model: { license: 'OpenRAIL++' },
      installDetails: {}
    };
    const { dom } = bootUi({
      runtimeFetch: async url => {
        if (url === '/api/streammonsters/local-runtime/status?adapterId=gpu-2') {
          return response({
            ...base,
            selectedAdapterId: 'gpu-2',
            recommendation: { supported: false, reasonCode: 'unsupported_adapter' },
            runtimeDetails: { profileId: null, backend: null, adapterId: 'gpu-2' },
            installDetails: null
          });
        }
        if (url === '/api/streammonsters/local-runtime/status') {
          return response({
            ...base,
            selectedAdapterId: 'gpu-1',
            recommendation: { supported: true, profileId: 'nvidia-standard', reasonCode: 'supported_profile' },
            runtimeDetails: { profileId: 'nvidia-standard', backend: 'cuda', adapterId: 'gpu-1' }
          });
        }
        return null;
      }
    });
    await waitFor(() => expect(dom.window.document.getElementById('runtimeAdapters').value).toBe('gpu-1'));
    const adapters = dom.window.document.getElementById('runtimeAdapters');
    adapters.value = 'gpu-2';
    adapters.dispatchEvent(new dom.window.Event('change'));

    await waitFor(() => expect(dom.window.document.getElementById('runtimeRecommendation').textContent)
      .toContain('Nicht unterstützt'));
    expect(dom.window.document.getElementById('runtimeRecommendation').textContent)
      .not.toContain('Offizieller Runtime-Pfad');
    expect(dom.window.document.getElementById('runtimeRecovery').textContent)
      .toContain('Remote-Provider');
    dom.window.close();
  });

  test('uses the connected creator as a default that can be saved as an override', async () => {
    const { dom, fetchMock } = bootUi();
    await waitFor(() => expect(dom.window.document.getElementById('creatorName').value).toBe('creator_live'));

    dom.window.document.getElementById('creatorName').value = 'The Egg Forge';
    dom.window.document.getElementById('saveSetup').click();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/streammonsters/config', expect.objectContaining({ method: 'POST' })));
    const saveCall = fetchMock.mock.calls.find(([url, options]) => url === '/api/streammonsters/config' && options.method === 'POST');
    expect(JSON.parse(saveCall[1].body)).toEqual(expect.objectContaining({
      creatorName: 'The Egg Forge',
      hatchDurationMs: 300000,
      visualPack: 'furry',
      landscapeAnchor: 'bottom-center',
      landscapeScale: 100,
      portraitAnchor: 'center',
      portraitScale: 100,
      giftMappingCustomized: false
    }));
    dom.window.close();
  });

  test('renders real readiness, Heart Chain, mission and all 24 Dex slots', async () => {
    const { dom } = bootUi({ locale:'en' });
    await waitFor(() => expect(dom.window.document.querySelectorAll('#monsterDex .dex-slot')).toHaveLength(24));

    expect(dom.window.document.getElementById('creatorMetrics').textContent)
      .toMatch(/2 active.*3 queued.*1 ready.*2m/);
    expect(dom.window.document.getElementById('heartChainStatus').textContent).toContain('4');
    expect(dom.window.document.getElementById('streamMissionStatus').textContent).toMatch(/2\s*\/\s*6/);
    expect(dom.window.document.querySelectorAll('#monsterDex .dex-slot.locked')).toHaveLength(23);
    expect(dom.window.document.getElementById('dexElementProgress').textContent).toMatch(/Ember.*1\/4/);
    const ownedCard = dom.window.document.querySelector('#monsterDex .dex-slot:not(.locked)');
    expect(ownedCard.textContent).toMatch(/first found/i);
    expect(ownedCard.textContent).toContain('17/25');
    expect(ownedCard.textContent).toContain('title');
    expect(ownedCard.textContent).toContain('aura');
    expect(ownedCard.textContent).toContain('frame:ember');
    dom.window.close();
  });

  test('keeps mapping customization true after manual PUT and a later setup save', async () => {
    const { dom, fetchMock } = bootUi({
      runtimeFetch: async (url, options) => {
        if (url === '/api/streammonsters/gift-mappings/5655' && options.method === 'PUT') {
          return response({ success: true });
        }
        return null;
      }
    });
    await waitFor(() => expect(dom.window.document.querySelector('#giftCatalog button')).not.toBeNull());
    dom.window.document.querySelector('#giftCatalog button').click();
    dom.window.document.getElementById('saveGiftMapping').click();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/streammonsters/gift-mappings/5655',
      expect.objectContaining({ method: 'PUT' })
    ));
    await waitFor(() => expect(dom.window.document.getElementById('notice').textContent).toContain('Rose'));
    dom.window.document.getElementById('saveSetup').click();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/streammonsters/config',
      expect.objectContaining({ method: 'POST' })
    ));
    const setupCall = fetchMock.mock.calls.filter(([url]) => url === '/api/streammonsters/config').at(-1);
    expect(JSON.parse(setupCall[1].body).giftMappingCustomized).toBe(true);
    dom.window.close();
  });

  test('keeps mapping customization true after manual DELETE and a later setup save', async () => {
    let mappingsLoaded = 0;
    const { dom, fetchMock } = bootUi({
      runtimeFetch: async (url, options) => {
        if (url === '/api/streammonsters/gift-mappings' && !options.method) {
          mappingsLoaded += 1;
          return response({
            success: true,
            mappings: mappingsLoaded === 1
              ? [{ gift_id: 5655, gift_name: 'Rose', coin_value: 1, image_url: '/rose.png' }]
              : []
          });
        }
        if (url === '/api/streammonsters/gift-mappings/5655' && options.method === 'DELETE') {
          return response({ success: true, removed: true });
        }
        return null;
      }
    });
    await waitFor(() => expect(dom.window.document.querySelector('#mappingList button')).not.toBeNull());
    dom.window.document.querySelector('#mappingList button').click();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/streammonsters/gift-mappings/5655',
      expect.objectContaining({ method: 'DELETE' })
    ));
    await waitFor(() => expect(dom.window.document.querySelector('#mappingList button')).toBeNull());
    dom.window.document.getElementById('saveSetup').click();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/streammonsters/config',
      expect.objectContaining({ method: 'POST' })
    ));
    const setupCall = fetchMock.mock.calls.filter(([url]) => url === '/api/streammonsters/config').at(-1);
    expect(JSON.parse(setupCall[1].body).giftMappingCustomized).toBe(true);
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
    expect(dom.window.document.getElementById('viewerSummary').textContent).toContain('Erster Schlupf');
    expect(dom.window.document.getElementById('viewerCollection').textContent).toContain('AKTIV');
    dom.window.close();
  });
});
