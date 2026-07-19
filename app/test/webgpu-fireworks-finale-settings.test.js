const fs = require('fs');
const path = require('path');

const FireworksPlugin = require('../plugins/webgpu-fireworks/main');

const pluginRoot = path.join(__dirname, '..', 'plugins', 'webgpu-fireworks');
const read = relative => fs.readFileSync(path.join(pluginRoot, relative), 'utf8');

describe('WebGPU Fireworks finale settings and telemetry', () => {
  test('offers every curated finale style and length with Auto plus Medium defaults', () => {
    const html = read('ui/settings.html');

    expect(html).toContain('id="finale-style"');
    expect(html).toContain('id="finale-length"');
    for (const style of [
      'auto',
      'classic-crescendo',
      'symmetric-salute',
      'sky-ballet',
      'thunder-finale',
      'nishiki-kamuro',
      'aurora-cathedral',
      'royal-brocade',
      'phoenix-ascension',
      'furry-celebration'
    ]) {
      expect(html).toContain(`<option value="${style}"`);
    }
    for (const length of ['short', 'medium', 'long']) {
      expect(html).toContain(`<option value="${length}"`);
    }
    expect(html).toMatch(/<option value="auto"[^>]*selected/);
    expect(html).toMatch(/<option value="medium"[^>]*selected/);
    expect(html).toContain('/plugins/webgpu-fireworks/ui/show-style-options.js');
    expect(html).toContain('href="/webgpu-fireworks/designer"');
  });

  test('binds finale selectors to config and sends the exact selected object from the test button', () => {
    const source = read('ui/settings.js');
    const triggerSource = source.slice(source.indexOf('async function triggerFinale()'), source.indexOf('async function testSuperfanFinale()'));

    expect(source).toContain("document.getElementById('finale-style').value = config.goalFinaleStyle || 'auto'");
    expect(source).toContain("document.getElementById('finale-length').value = config.goalFinaleLength || 'medium'");
    expect(source).toContain('config.goalFinaleStyle = this.value');
    expect(source).toContain('config.goalFinaleLength = this.value');
    expect(source).toContain('refreshFinaleShowSelectors');
    expect(triggerSource).toContain("document.getElementById('finale-style').value");
    expect(triggerSource).toContain("document.getElementById('finale-length').value");
    expect(triggerSource).toContain('style: style');
    expect(triggerSource).toContain('length: length');
    expect(triggerSource).toContain('intensity: intensity');
    expect(triggerSource).not.toContain('duration');
  });

  test('renders active finale, phase and queue telemetry in the runtime card', () => {
    const html = read('ui/settings.html');
    const source = read('ui/settings.js');
    const helper = read('ui/show-style-options.js');

    expect(html).toContain('id="webgpu-finale-active"');
    expect(html).toContain('id="webgpu-finale-phase"');
    expect(html).toContain('id="webgpu-finale-queue"');
    expect(source).toContain("document.getElementById('webgpu-finale-active')");
    expect(source).toContain("document.getElementById('webgpu-finale-phase')");
    expect(source).toContain("document.getElementById('webgpu-finale-queue')");
    expect(source).toContain('showOptions.formatRuntimeFinaleStatus(renderer');
    expect(helper).toContain('renderer.finaleStyle');
    expect(helper).toContain('renderer.finalePhase');
    expect(helper).toContain('renderer.finaleQueueLength');
  });

  test('sanitizes finale renderer telemetry and exposes idle offline defaults', () => {
    let connectionHandler;
    const api = {
      getPluginDataDir: () => __dirname,
      registerSocketConnection: handler => { connectionHandler = handler; },
      log: jest.fn()
    };
    const plugin = new FireworksPlugin(api);
    plugin.config = { visualStyle: 'premium-hybrid' };
    plugin.registerSocketHandlers();

    const handlers = new Map();
    const socket = {
      id: 'overlay-1',
      emit: jest.fn(),
      on: jest.fn((event, handler) => handlers.set(event, handler))
    };
    connectionHandler(socket);
    handlers.get('webgpu-fireworks:renderer-status')({
      state: 'ready',
      finaleActive: true,
      finaleId: 'goal:likes:100',
      finaleStyle: 'sky-ballet',
      finaleLength: 'long',
      finalePhase: 'highlight',
      finaleQueueLength: 7.9,
      finaleError: 'recoverable renderer fault'
    });

    expect(plugin.getRendererStatus()).toMatchObject({
      finaleActive: true,
      finaleId: 'goal:likes:100',
      finaleStyle: 'sky-ballet',
      finaleLength: 'long',
      finalePhase: 'highlight',
      finaleQueueLength: 7,
      finaleError: 'recoverable renderer fault'
    });

    plugin.overlayTelemetry.clear();
    expect(plugin.getRendererStatus()).toMatchObject({
      finaleActive: false,
      finaleId: null,
      finaleStyle: null,
      finaleLength: null,
      finalePhase: 'idle',
      finaleQueueLength: 0,
      finaleError: null
    });
  });

  test.each(['de', 'en', 'es', 'fr'])('%s locale defines finale choreography labels', locale => {
    const parsed = JSON.parse(read(`locales/${locale}.json`));
    const translations = parsed.plugins['webgpu-fireworks'].webgpu_fireworks;
    for (const key of [
      'finale_style', 'finale_length', 'finale_style_auto', 'finale_style_classic_crescendo',
      'finale_style_symmetric_salute', 'finale_style_sky_ballet', 'finale_style_thunder_finale',
      'finale_length_short', 'finale_length_medium', 'finale_length_long',
      'finale_active_show', 'finale_phase', 'finale_queue'
    ]) {
      expect(typeof translations[key]).toBe('string');
      expect(translations[key].trim()).not.toBe('');
    }
  });

  test('uses accurate German finale labels', () => {
    const de = JSON.parse(read('locales/de.json')).plugins['webgpu-fireworks'].webgpu_fireworks;
    expect(de).toMatchObject({
      finale_style: 'Showstil',
      finale_length: 'Showlänge',
      finale_style_auto: 'Auto (abwechselnd)',
      finale_length_short: 'Kurz (10 s)',
      finale_length_medium: 'Mittel (18 s)',
      finale_length_long: 'Lang (28 s)',
      finale_active_show: 'Aktive Show',
      finale_phase: 'Phase',
      finale_queue: 'Warteschlange'
    });
  });
});
