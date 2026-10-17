const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(path.resolve(__dirname, '../../../../app/node_modules/playwright'));
const browserPath = process.env.MOCKUP_EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const files = ['01-overview.html', '02-live-console.html', '03-workspaces.html'];
const locales = ['de', 'en', 'es', 'fr'];
const widths = [320, 390, 720];
const expectedLabels = {
  de: { locale: 'Sprache wählen', theme: 'Darstellung umschalten' },
  en: { locale: 'Choose language', theme: 'Switch appearance' },
  es: { locale: 'Elegir idioma', theme: 'Cambiar apariencia' },
  fr: { locale: 'Choisir la langue', theme: 'Changer l’apparence' }
};
let checks = 0, overflowChecks = 0, externalRequests = 0, jsErrors = 0, localeRuns = 0, stateFlows = 0;
function assert(ok, message) { checks++; if (!ok) throw new Error(message); }
async function dimensions(page, label) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });
    const dim = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    overflowChecks++;
    assert(dim.scroll <= dim.client, `${label}: overflow at ${width}px: ${JSON.stringify(dim)}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
}
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: browserPath });
  try {
    for (const file of files) for (const locale of locales) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      page.on('request', request => { if (/^https?:/i.test(request.url())) externalRequests++; });
      page.on('pageerror', () => { jsErrors++; });
      const url = pathToFileURL(path.join(__dirname, file)).href;
      await page.goto(url, { waitUntil: 'load' });
      await page.locator('#locale').selectOption(locale);
      assert(await page.locator('html').getAttribute('lang') === locale, `${file}/${locale}: lang`);
      assert(await page.locator('#locale').getAttribute('aria-label') === expectedLabels[locale].locale, `${file}/${locale}: locale control name`);
      assert(await page.locator('#mode').getAttribute('aria-label') === expectedLabels[locale].theme, `${file}/${locale}: theme control name`);
      assert(await page.locator('#profile-select').getAttribute('aria-label') === ({ de: 'Demo-Profil wählen', en: 'Choose demo profile', es: 'Elegir perfil de demostración', fr: 'Choisir un profil de démo' })[locale], `${file}/${locale}: profile control name`);
      assert(await page.locator('#event-content').getAttribute('aria-busy') === 'true', `${file}/${locale}: initial loading state`);
      await dimensions(page, `${file}/${locale}/loading/night`);
      await page.locator('#retry').waitFor({ state: 'visible', timeout: 2500 });
      assert(await page.locator('#event-content .error-text').isVisible(), `${file}/${locale}: error copy missing`);
      await dimensions(page, `${file}/${locale}/error/night`);
      if (file === files[0] && locale === 'de') await page.screenshot({ path: path.join(__dirname, '01-overview.png'), fullPage: true });
      if (file === files[1] && locale === 'de') await page.screenshot({ path: path.join(__dirname, '02-live-console.png'), fullPage: true });
      if (file === files[2] && locale === 'de') await page.screenshot({ path: path.join(__dirname, '03-workspaces.png'), fullPage: true });
      await page.locator('#retry').focus();
      await page.keyboard.press('Enter');
      assert(await page.locator('#event-content').getAttribute('aria-busy') === 'true', `${file}/${locale}: retry did not enter loading`);
      await page.locator('#show-filled').waitFor({ state: 'visible', timeout: 2500 });
      assert(await page.locator('#event-content .empty-state').isVisible(), `${file}/${locale}: empty state missing`);
      await dimensions(page, `${file}/${locale}/empty/night`);
      await page.locator('#profile-select').selectOption('demo-b');
      const activeB = await page.locator('#active-profile').innerText();
      assert(activeB.length > 0, `${file}/${locale}: active profile B missing`);
      assert((await page.locator('#profile-announcement').innerText()).includes(activeB), `${file}/${locale}: active profile announcement`);
      await page.locator('#show-filled').focus();
      await page.keyboard.press('Enter');
      assert(await page.locator('#event-content .event-row').count() === 2, `${file}/${locale}: filled history missing for profile B`);
      await dimensions(page, `${file}/${locale}/filled/night`);
      await page.locator('#profile-select').selectOption('demo-a');
      assert((await page.locator('#active-profile').innerText()).length > 0, `${file}/${locale}: active profile A missing after switch back`);
      assert(await page.locator('#event-content .event-row').count() === 0, `${file}/${locale}: profile A should have no synthetic events`);
      await page.locator('#profile-select').selectOption('demo-b');
      assert(await page.locator('#event-content .event-row').count() === 2, `${file}/${locale}: profile B history did not update immediately`);
      const mode = page.locator('#mode');
      const nightBackground = await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor);
      await mode.focus(); await page.keyboard.press('Enter');
      assert(await page.locator('html').getAttribute('data-theme') === 'day', `${file}/${locale}: keyboard day toggle`);
      assert(await mode.getAttribute('aria-pressed') === 'true', `${file}/${locale}: mode aria state`);
      assert((await mode.getAttribute('aria-label')).length > 0, `${file}/${locale}: localized theme label missing`);
      const dayBackground = await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor);
      assert(dayBackground !== nightBackground, `${file}/${locale}: theme must invert the surface`);
      await dimensions(page, `${file}/${locale}/filled/day`);
      await mode.focus(); await page.keyboard.press('Enter');
      assert(await page.locator('html').getAttribute('data-theme') === 'night', `${file}/${locale}: keyboard night toggle`);
      await page.locator('input[name=connection][value=live]').check();
      assert((await page.locator('#connection-state').innerText()).length > 0, `${file}/${locale}: connection state missing`);
      if (file === files[1]) assert(await page.locator('#side-connection').innerText() === await page.locator('#connection-state').innerText(), `${file}/${locale}: console status sync`);
      if (file === files[2]) {
        const brokenAnchors = await page.locator('.workspace-nav a').evaluateAll(links => links.filter(link => !document.getElementById(decodeURIComponent(link.hash.slice(1)))).map(link => link.hash));
        assert(brokenAnchors.length === 0, `${file}/${locale}: workspace navigation targets missing: ${brokenAnchors.join(',')}`);
      }
      await dimensions(page, `${file}/${locale}/filled/night`);
      localeRuns++; stateFlows++; await page.close();
      console.log(`PASS ${file} ${locale}: loading/error/retry/empty/filled, profile A↔B, theme, connection and viewport checks`);
    }
    const gallery = await browser.newPage({ viewport: { width: 320, height: 844 } });
    gallery.on('request', request => { if (/^https?:/i.test(request.url())) externalRequests++; });
    gallery.on('pageerror', () => { jsErrors++; });
    await gallery.goto(pathToFileURL(path.join(__dirname, 'index.html')).href, { waitUntil: 'load' });
    assert(await gallery.locator('.gallery-card').count() === 3, 'gallery must show all three variants');
    assert(await gallery.locator('.gallery-card img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)), 'all preview screenshots must load locally');
    assert(await gallery.locator('.gallery-card a.button-link').count() === 3, 'gallery must link to all three interactive mockups');
    const galleryWidth = await gallery.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    assert(galleryWidth.scroll <= galleryWidth.client, `gallery overflow at 320px: ${JSON.stringify(galleryWidth)}`);
    await gallery.close();
  } finally { await browser.close(); }
  if (externalRequests || jsErrors) throw new Error(`external=${externalRequests} jsErrors=${jsErrors}`);
  console.log(JSON.stringify({ status: 'PASS', variants: files.length, locales: localeRuns, fullStateFlows: stateFlows, assertions: checks, overflowMeasurements: overflowChecks, viewportWidths: widths, themes: ['night', 'day'], externalRequests, jsErrors }, null, 2));
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
