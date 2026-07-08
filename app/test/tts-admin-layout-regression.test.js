const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

describe('TTS admin panel layout regressions', () => {
  let adminPanelHtml;
  let adminPanelJs;

  beforeAll(() => {
    adminPanelHtml = fs.readFileSync(
      path.join(__dirname, '..', 'plugins', 'tts', 'ui', 'admin-panel.html'),
      'utf8'
    );
    adminPanelJs = fs.readFileSync(
      path.join(__dirname, '..', 'plugins', 'tts', 'ui', 'tts-admin-production.js'),
      'utf8'
    );
  });

  test('moves the save button into the sidebar footer', () => {
    expect(adminPanelHtml).toContain('id="saveConfigBtnSidebar"');
    expect(adminPanelHtml).toContain('<div class="tts-sidebar-footer">');
    expect(adminPanelHtml).not.toContain('id="saveConfigBtnTop"');
    expect(adminPanelHtml).not.toContain('id="saveConfigBtn" class="bg-green-600');
  });

  test('keeps the landing area only on the configuration tab', () => {
    expect(adminPanelHtml).toContain('id="tts-config-landing"');
    expect(adminPanelHtml).not.toContain('class="tts-hero-footer"');
    expect(adminPanelHtml).not.toContain('class="tts-hero-actions"');
    expect(adminPanelHtml).not.toContain('id="tts-tab-open-link"');
    expect(adminPanelHtml).not.toContain('Open in New Tab');
    expect(adminPanelJs).toContain('const configLanding = document.getElementById(\'tts-config-landing\');');
    expect(adminPanelJs).toContain("configLanding.classList.toggle('hidden', tabName !== 'config');");
  });

  test('uses user-facing hero copy', () => {
    expect(adminPanelHtml).toContain('Alles f\u00fcr dein TTS an einem Ort');
    expect(adminPanelHtml).not.toContain('High-density, wide-screen admin surface');
  });

  test('hides the landing area when switching to a non-config tab', () => {
    const dom = new JSDOM(`<!doctype html>
      <html>
        <body>
          <div id="tts-config-landing" class="tts-config-landing"></div>
          <div id="content-config" class="tab-content"></div>
          <div id="content-queue" class="tab-content hidden"></div>
          <button class="tab-button" data-tab="config"></button>
          <button class="tab-button" data-tab="queue"></button>
        </body>
      </html>`, {
      runScripts: 'outside-only',
      url: 'http://localhost/plugins/tts/ui/admin-panel.html'
    });

    dom.window.eval(adminPanelJs);

    try {
      expect(typeof dom.window.switchTab).toBe('function');

      dom.window.switchTab('queue');

      const configLanding = dom.window.document.getElementById('tts-config-landing');
      const queueContent = dom.window.document.getElementById('content-queue');

      expect(configLanding.classList.contains('hidden')).toBe(true);
      expect(queueContent.classList.contains('hidden')).toBe(false);

      dom.window.switchTab('config');

      expect(configLanding.classList.contains('hidden')).toBe(false);
    } finally {
      dom.window.close();
    }
  });

  test('uses a compact two-column hero with the status below the subtitle', () => {
    expect(adminPanelHtml).toMatch(/\.tts-hero\s*{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*4fr\)\s+minmax\(240px,\s*1fr\);[\s\S]*?gap:\s*12px\s+20px;[\s\S]*?padding:\s*12px\s+18px\s+14px;[\s\S]*?}/m);
    expect(adminPanelHtml).toMatch(/\.tts-summary-grid\s*{[\s\S]*?grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);[\s\S]*?gap:\s*10px;[\s\S]*?margin-bottom:\s*0;[\s\S]*?}/m);
    expect(adminPanelHtml).toMatch(/\.tts-summary-card\s*{[\s\S]*?min-height:\s*82px;[\s\S]*?padding:\s*14px\s+16px;[\s\S]*?gap:\s*6px;[\s\S]*?}/m);
    expect(adminPanelHtml).toMatch(/\.tts-hero-logo-stage\s*{[\s\S]*?display:\s*grid;[\s\S]*?justify-items:\s*center;[\s\S]*?align-content:\s*start;[\s\S]*?gap:\s*8px;[\s\S]*?padding-top:\s*2px;[\s\S]*?}/m);
    expect(adminPanelHtml).toMatch(/\.tts-hero-logo\s*{[\s\S]*?width:\s*min\(360px,\s*100%\);[\s\S]*?max-height:\s*92px;[\s\S]*?}/m);
    expect(adminPanelHtml).toMatch(/\.tts-hero-subtitle\s*{[\s\S]*?text-align:\s*center;[\s\S]*?max-width:\s*30ch;[\s\S]*?}/m);
    expect(adminPanelHtml).toContain('id="init-status" class="tts-pill tts-hero-status"');

    const dom = new JSDOM(adminPanelHtml);
    const hero = dom.window.document.querySelector('#tts-config-landing .tts-hero');
    const summaryGrid = hero.querySelector('.tts-summary-grid');
    const logoStage = hero.querySelector('.tts-hero-logo-stage');
    const subtitle = logoStage.querySelector('.tts-hero-subtitle');
    const status = logoStage.querySelector('#init-status');

    expect(hero.children).toHaveLength(2);
    expect(hero.firstElementChild).toBe(summaryGrid);
    expect(hero.lastElementChild).toBe(logoStage);
    expect(summaryGrid.children).toHaveLength(4);
    expect(logoStage.children).toHaveLength(3);
    expect(logoStage.children[0].tagName).toBe('IMG');
    expect(logoStage.children[1]).toBe(subtitle);
    expect(logoStage.children[2]).toBe(status);
    expect(subtitle.textContent).toContain('Alles f\u00fcr dein TTS an einem Ort');
    expect(status.textContent).toContain('Initializing');
  });
});
