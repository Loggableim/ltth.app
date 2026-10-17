const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.resolve(__dirname, '../../../app/node_modules/playwright'));
const browserPath = process.env.MOCKUP_EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const locales = {
  de: { heading: 'Dashboard-Richtungen vergleichen', cards: ['Creator-Überblick', 'Live-Konsole', 'Arbeitsbereiche'], language: 'Sprache wählen', theme: 'Darstellung umschalten' },
  en: { heading: 'Compare dashboard directions', cards: ['Creator overview', 'Live console', 'Workspaces'], language: 'Choose language', theme: 'Switch appearance' },
  es: { heading: 'Comparar direcciones del panel', cards: ['Resumen de creador', 'Consola en directo', 'Áreas de trabajo'], language: 'Elegir idioma', theme: 'Cambiar apariencia' },
  fr: { heading: 'Comparer les pistes de tableau de bord', cards: ['Vue créateur', 'Console live', 'Espaces de travail'], language: 'Choisir la langue', theme: 'Changer l’apparence' }
};
const widths = [320, 390, 720];
const galleryPath = path.join(__dirname, 'index.html');
const galleryUrl = 'file:///' + galleryPath.replace(/\\/g, '/');
let overflowChecks = 0;

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: browserPath });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(5000);
    const errors = [];
    const external = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', request => { if (/^https?:/i.test(request.url())) external.push(request.url()); });
    await page.goto(galleryUrl);
    if (await page.locator('h1').count() !== 1 || await page.locator('h2').count() !== 3) throw new Error('Überschriftenhierarchie unerwartet');
    if (await page.getByRole('main').count() !== 1 || await page.getByRole('navigation', { name: 'Begleitmaterial' }).count() !== 1) throw new Error('Landmarks/Navigation nicht semantisch benannt');
    if (await page.locator('article.card').count() !== 3) throw new Error('Es werden nicht genau drei Vergleichskarten angezeigt');

    const targets = ['01-overview.html', '02-live-console.html', '03-workspaces.html', 'FEATURE-PARITY-MATRIX.md', 'README-Vergleich.md', 'ACCESSIBILITY-AUDIT.md', 'DESIGN-ABNAHME-FARBEN.md'];
    for (const target of targets) if (!fs.existsSync(path.join(__dirname, target))) throw new Error('Lokales Linkziel fehlt: ' + target);
    const hrefs = await page.locator('a[href]').evaluateAll(anchors => anchors.map(a => a.getAttribute('href')));
    for (const target of targets) if (!hrefs.includes(target)) throw new Error('Link fehlt: ' + target);
    const linkNames = await page.locator('a[href]').evaluateAll(anchors => anchors.map(a => (a.getAttribute('aria-label') || a.innerText || '').trim()));
    if (linkNames.some(name => !name)) throw new Error('Mindestens ein Link hat keinen zugänglichen Namen');
    const imageStatus = await page.locator('img').evaluateAll(imgs => imgs.map(img => ({ alt: img.alt, width: img.naturalWidth })));
    if (imageStatus.length !== 3 || imageStatus.some(img => !img.alt || img.width === 0)) throw new Error('Lokale Vorschau fehlt oder hat keinen Alternativtext: ' + JSON.stringify(imageStatus));

    // Keyboard access to the skip link, named selector, and theme control.
    await page.keyboard.press('Tab');
    if (!(await page.evaluate(() => document.activeElement.classList.contains('skip')))) throw new Error('Skip-Link ist nicht der erste Tastaturstopp');
    await page.keyboard.press('Enter');
    if (!new URL(page.url()).hash.endsWith('main')) throw new Error('Skip-Link springt nicht zum Hauptinhalt');
    await page.locator('#locale').focus();
    if (!(await page.locator('#locale').evaluate(el => el === document.activeElement))) throw new Error('Sprachwahl ist nicht tastaturfokussierbar');

    for (const [locale, expected] of Object.entries(locales)) {
      await page.locator('#locale').selectOption(locale);
      if (await page.locator('html').getAttribute('lang') !== locale) throw new Error('lang-Attribut stimmt nicht: ' + locale);
      if (await page.locator('h1').innerText() !== expected.heading) throw new Error('Hauptüberschrift nicht lokalisiert: ' + locale);
      if (await page.locator('#locale').getAttribute('aria-label') !== expected.language) throw new Error('Sprachwahl nicht benannt: ' + locale);
      if (await page.locator('#mode').getAttribute('aria-label') !== expected.theme) throw new Error('Theme-Kontrolle nicht benannt: ' + locale);
      for (let i = 0; i < 3; i++) if (await page.locator('article.card h2').nth(i).innerText() !== expected.cards[i]) throw new Error('Kartenüberschrift falsch übersetzt: ' + locale + ' / ' + i);
      const theme = page.locator('#mode');
      for (const width of widths) {
        await page.setViewportSize({ width, height: 844 });
        const d = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
        overflowChecks++;
        if (d.scroll > d.client) throw new Error('Horizontaler Überlauf: ' + locale + ' / ' + width + 'px / ' + JSON.stringify(d));
        await theme.focus(); await page.keyboard.press('Enter');
        const light = await page.evaluate(() => ({ mode: document.documentElement.dataset.mode, client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
        overflowChecks++;
        if (light.mode !== 'day' || light.scroll > light.client) throw new Error('Tagmodus/Überlauf: ' + locale + ' / ' + width + 'px / ' + JSON.stringify(light));
        await page.keyboard.press('Enter');
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await theme.focus(); await page.keyboard.press('Enter');
      if (await page.locator('html').getAttribute('data-mode') !== 'day' || await theme.getAttribute('aria-pressed') !== 'true') throw new Error('Tagmodus/ARIA-Zustand fehlgeschlagen');
      await page.keyboard.press('Enter');
      if (await page.locator('html').getAttribute('data-mode') !== 'night' || await theme.getAttribute('aria-pressed') !== 'false') throw new Error('Nachtmodus/ARIA-Zustand fehlgeschlagen');
    }

    // Exercise actual local prototype links in separate tabs.
    for (const [index, target] of ['01-overview.html', '02-live-console.html', '03-workspaces.html'].entries()) {
      const popupPromise = page.waitForEvent('popup');
      const openLink = page.locator('article.card').nth(index).locator('a.open');
      await openLink.focus();
      await page.keyboard.press('Enter');
      const popup = await popupPromise;
      await popup.waitForURL(url => url.pathname.endsWith('/' + target), { timeout: 5000 });
      await popup.waitForLoadState('domcontentloaded');
      if (!popup.url().endsWith('/' + target)) throw new Error('Mockup-Link öffnete falsches Ziel: ' + popup.url());
      await popup.close();
    }
    if (errors.length) throw new Error('JavaScript-Fehler: ' + errors.join('; '));
    if (external.length) throw new Error('Externe Requests: ' + external.join(', '));
    console.log('PASS — 3 lokale Mockups und 3 Begleitlinks vorhanden; 3 Preview-Bilder geladen; 4 Locales; Skip-Link, Semantik, Labels, Theme-Tastatur und ' + overflowChecks + ' Overflow-Messungen über Tag/Nacht; 3 Mockup-Links geöffnet; keine externen Requests/JS-Fehler.');
    await page.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
