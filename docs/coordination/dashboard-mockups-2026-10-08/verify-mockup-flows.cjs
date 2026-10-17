const path = require('node:path');
const { chromium } = require(path.resolve(__dirname, '../../../app/node_modules/playwright'));
const browserPath = process.env.MOCKUP_EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const allFiles = ['01-overview.html', '02-live-console.html', '03-workspaces.html'];
const files = process.env.MOCKUP_VARIANT ? allFiles.filter(f => f.startsWith(process.env.MOCKUP_VARIANT)) : allFiles;
const allLocales = ['de', 'en', 'es', 'fr'];
const locales = process.env.MOCKUP_LOCALE ? allLocales.filter(l => l === process.env.MOCKUP_LOCALE) : allLocales;
const widths = [320, 390, 720];
const localized = {
  en: { soundboard: 'Soundboard', diagnostics: 'Diagnostics & safety', stop: 'Confirm OpenShock emergency stop', back: 'Back', search: 'Search synthetic tools', safety: 'This demo sends no command to any device.', inert: 'No real emergency stop is triggered.', feedback: 'No device was contacted.', plugin: 'no installation, network access, or real weather/overlay function.' },
  es: { soundboard: 'Soundboard', diagnostics: 'Diagnóstico y seguridad', stop: 'Confirmar parada de emergencia de OpenShock', back: 'Volver', search: 'Buscar herramientas sintéticas', safety: 'Esta demostración no envía órdenes a ningún dispositivo.', inert: 'No se activa ninguna parada de emergencia real.', feedback: 'No se contactó con ningún dispositivo.', plugin: 'sin instalación, acceso a la red ni función meteorológica/de superposición real.' },
  fr: { soundboard: 'Soundboard', diagnostics: 'Diagnostic et sécurité', stop: 'Confirmer l’arrêt d’urgence OpenShock', back: 'Retour', search: 'Rechercher des outils synthétiques', safety: 'Cette démo n’envoie aucune commande à un appareil.', inert: 'Aucun arrêt d’urgence réel n’est déclenché.', feedback: 'Aucun appareil n’a été contacté.', plugin: 'aucune installation, aucun accès réseau ni fonction météo/incrustation réelle.' },
  de: { soundboard: 'Soundboard', diagnostics: 'Diagnose & Sicherheit', stop: 'OpenShock-Notstopp bestätigen', back: 'Zurück', search: 'Synthetische Werkzeuge suchen', safety: 'Diese Demo sendet keinen Befehl an ein Gerät.', inert: 'Es wird kein echter Notstopp ausgelöst.', feedback: 'Kein Gerät wurde angesprochen.', plugin: 'keine Installation, kein Netzwerkzugriff und keine echte Wetter-/Overlay-Funktion.' }
};
const localeNames = { de: 'Sprache wählen', en: 'Choose language', es: 'Elegir idioma', fr: 'Choisir la langue' };
const themeNames = { de: 'Darstellung umschalten', en: 'Switch appearance', es: 'Cambiar apariencia', fr: 'Changer l’apparence' };
const rootUrl = 'file:///' + path.resolve(__dirname).replace(/\\/g, '/') + '/';
let overflowMeasurements = 0;
let localeRuns = 0;
let flowRuns = 0;

async function activate(page, locator, key = 'Enter') {
  await locator.focus();
  await page.keyboard.press(key);
}
async function back(page, locale) {
  await activate(page, page.locator('#demo-detail [data-demo-back]'));
  const label = await page.locator('#demo-detail [data-demo-back]').innerText();
  if (label !== localized[locale].back) throw new Error('Zurück-Label falsch in ' + locale + ': ' + label);
}
async function expectFocused(page, locator, label) {
  if (!(await locator.evaluate(el => el === document.activeElement))) throw new Error(label + ': erwarteter Fokus fehlt');
}
async function checkOverflow(page, file, locale, label) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });
    const dim = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    overflowMeasurements++;
    if (dim.scroll > dim.client) throw new Error(file + ' ' + locale + ' ' + label + ' Overflow bei ' + width + 'px: ' + JSON.stringify(dim));
  }
  await page.setViewportSize({ width: 390, height: 844 });
}
async function verifyTranslation(page, file, locale, where) {
  await page.waitForTimeout(10); // allow local mutation observer to translate generated demo nodes
  const state = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    selection: document.querySelector('#locale')?.value,
    missing: window.LTTH_I18N.untranslated(),
    localeLabel: document.querySelector('#locale')?.getAttribute('aria-label'),
    themeLabel: document.querySelector('#mode')?.getAttribute('aria-label'),
    title: document.title
  }));
  if (state.lang !== locale || state.selection !== locale) throw new Error(file + ' Locale-Attribut/Schalter falsch: ' + JSON.stringify(state));
  if (state.localeLabel !== localeNames[locale] || state.themeLabel !== themeNames[locale]) throw new Error(file + ' ' + locale + ' Bedienelement-Labels fehlen: ' + JSON.stringify(state));
  if (locale !== 'de' && state.missing.length) throw new Error(file + ' ' + locale + ' unübersetzte UI-Texte in ' + where + ': ' + state.missing.join(' | '));
  if (locale !== 'de' && /Überblick|Arbeitsbereiche|Konsole/.test(state.title)) throw new Error(file + ' ' + locale + ' Seitentitel nicht lokalisiert: ' + state.title);
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: browserPath });
  try {
    for (const file of files) {
      const variant = file.startsWith('01') ? '01' : file.startsWith('02') ? '02' : '03';
      for (const locale of locales) {
        localeRuns++;
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        page.setDefaultTimeout(5000);
        const errors = [];
        const externalRequests = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => { if (/^https?:/i.test(request.url())) externalRequests.push(request.url()); });
        await page.goto(rootUrl + file);
        console.log('START ' + file + ' [' + locale + ']');
        if (!(await page.locator('#locale').isVisible())) throw new Error(file + ': Sprachumschalter fehlt');
        const localeSelect = page.locator('#locale');
        await localeSelect.focus();
        if (!(await localeSelect.evaluate(el => el === document.activeElement))) throw new Error(file + ' ' + locale + ': Sprachumschalter erhält keinen Tastaturfokus');
        await localeSelect.selectOption(locale);
        await verifyTranslation(page, file, locale, 'Startansicht');
        const theme = page.locator('#mode');
        await activate(page, theme);
        if (await page.locator('html').getAttribute('data-mode') !== 'day') throw new Error(file + ' ' + locale + ': Tagmodus nicht erreichbar');
        await activate(page, theme);
        if (await page.locator('html').getAttribute('data-mode') !== 'night') throw new Error(file + ' ' + locale + ': Nachtmodus nicht erreichbar');

        for (const state of ['offline', 'connected', 'live']) {
          await activate(page, page.locator('.steps button[data-demo-state="' + state + '"]'), 'Space');
          if (await page.locator('html').getAttribute('data-demo-state') !== state) throw new Error(file + ' ' + locale + ': Statuswechsel ' + state + ' fehlgeschlagen');
          if (await page.locator('.steps button[aria-pressed="true"]').count() !== 1) throw new Error(file + ' ' + locale + ': Statusauswahl nicht eindeutig');
        const announcement = await page.locator('.demo-announcement').textContent();
          if (!announcement.includes(state === 'live' ? '184' : '0')) throw new Error(file + ' ' + locale + ': Status-/Kennzahlansage unvollständig');
        if (state === 'live' && (await page.locator('.demo-flow [data-shared="viewers"]').innerText()) !== '184') throw new Error(file + ' ' + locale + ': gemeinsame KPI wurden nicht aktualisiert');
          await verifyTranslation(page, file, locale, 'Status ' + state);
        }
        // The visible connection CTA must advance the same local state machine.
        const cta = page.locator('.connect,.primary').first();
        const ctaLabels = {
          de: { connected: 'LIVE starten ->', live: 'Demo zurücksetzen ->', offline: 'Verbinden ->' },
          en: { connected: 'Start LIVE ->', live: 'Reset demo ->', offline: 'Connect ->' },
          es: { connected: 'Iniciar LIVE ->', live: 'Reiniciar demo ->', offline: 'Conectar ->' },
          fr: { connected: 'Démarrer LIVE ->', live: 'Réinitialiser la démo ->', offline: 'Se connecter ->' }
        };
        await activate(page, page.locator('.steps button[data-demo-state="offline"]'), 'Space');
        for (const state of ['connected', 'live', 'offline']) {
          await activate(page, cta, 'Space');
          if (await page.locator('html').getAttribute('data-demo-state') !== state) throw new Error(file + ' ' + locale + ': CTA-Statuswechsel ' + state + ' fehlgeschlagen');
          if ((await cta.innerText()).replace(/\s+/g, ' ').trim() !== ctaLabels[locale][state]) throw new Error(file + ' ' + locale + ': CTA-Label falsch nach ' + state + ': ' + await cta.innerText());
          await verifyTranslation(page, file, locale, 'CTA-Status ' + state);
        }
        await checkOverflow(page, file, locale, 'Start/Status');

        // Task 1: Soundboard, directly in 01/02 and via Audio workspace in 03.
        const soundOrigin = variant === '03' ? page.locator('.demo-tool') : page.locator('[data-demo-open="soundboard"]').first();
        await activate(page, soundOrigin);
        if (variant === '03') {
          await expectFocused(page, page.locator('#demo-detail-title'), file + ' Audio workspace');
          await verifyTranslation(page, file, locale, 'Audio workspace');
          await activate(page, page.locator('#demo-detail [data-demo-open="soundboard"]'));
        }
        await expectFocused(page, page.locator('#demo-detail-title'), file + ' Soundboard');
        if (await page.locator('#demo-detail-title').innerText() !== localized[locale].soundboard) throw new Error(file + ' ' + locale + ': Soundboard-Ansicht falsch übersetzt');
        if (!(await page.locator('#demo-detail').innerText()).includes('No sound')) {
          const text = (await page.locator('#demo-detail').innerText()).toLowerCase();
          if (!text.includes('kein audio') && !text.includes('no audio') && !text.includes('no sound') && !text.includes('ningún sonido') && !text.includes('no se reproduce audio') && !text.includes('aucun son')) throw new Error(file + ' ' + locale + ': inerte Soundboard-Warnung fehlt: ' + text);
        }
        await checkOverflow(page, file, locale, 'Soundboard');
        await back(page, locale);
        if (variant === '03') await back(page, locale);
        if (!(await page.locator('#demo-detail').isHidden())) throw new Error(file + ' ' + locale + ': Soundboard-Rückkehr fehlgeschlagen');
        await expectFocused(page, soundOrigin, file + ' Soundboard return focus');
        await verifyTranslation(page, file, locale, 'Soundboard zurück');
        flowRuns++;

        // Task 2: diagnostics and inert OpenShock confirmation.
        if (variant === '01') {
          await activate(page, page.locator('[data-demo-open="catalog"]'));
          await activate(page, page.locator('#demo-detail [data-demo-open="diagnostics"]'));
        } else if (variant === '02') {
          await activate(page, page.locator('.demo-diagnostic-entry'));
        } else {
          await activate(page, page.locator('.demo-mobile-nav [data-demo-open="stream-area"]'));
          await activate(page, page.locator('#demo-detail [data-demo-open="diagnostics"]'));
        }
        await verifyTranslation(page, file, locale, 'Diagnose');
        await expectFocused(page, page.locator('#demo-detail-title'), file + ' diagnostics');
        const diagHeading = await page.locator('#demo-detail-title').innerText();
        if (diagHeading !== localized[locale].diagnostics) throw new Error(file + ' ' + locale + ': Diagnose-Titel falsch übersetzt: ' + diagHeading);
        if (!(await page.locator('#demo-detail').innerText()).includes(localized[locale].safety)) throw new Error(file + ' ' + locale + ': Sicherheitswarnung fehlt/falsch');
        await checkOverflow(page, file, locale, 'Diagnose');
        await activate(page, page.locator('#demo-detail [data-demo-open="stop-confirm"]'));
        await verifyTranslation(page, file, locale, 'OpenShock-Bestätigung');
        if (await page.locator('#demo-detail-title').innerText() !== localized[locale].stop) throw new Error(file + ' ' + locale + ': Bestätigungstitel falsch übersetzt');
        if (!(await page.locator('#demo-detail').innerText()).includes(localized[locale].inert)) throw new Error(file + ' ' + locale + ': Notstopp-Inertheit nicht erklärt');
        await checkOverflow(page, file, locale, 'Notstopp-Bestätigung');
        await activate(page, page.locator('[data-demo-confirm-stop]'));
        if (!(await page.locator('#demo-detail-feedback').innerText()).includes(localized[locale].feedback)) throw new Error(file + ' ' + locale + ': synthetische Bestätigung falsch übersetzt');
        await verifyTranslation(page, file, locale, 'OpenShock-Bestätigung');
        await back(page, locale); await back(page, locale);
        if (variant !== '02') await back(page, locale);
        if (!(await page.locator('#demo-detail').isHidden())) throw new Error(file + ' ' + locale + ': Diagnose-Rückkehr fehlgeschlagen');
        flowRuns++;

        // Task 3: search and open the rare WebGPU Weather view.
        const catalogOrigin = variant === '01' ? page.locator('[data-demo-open="catalog"]')
          : variant === '02' ? page.locator('.rail [data-demo-open="catalog"]')
          : page.locator('.demo-mobile-nav [data-demo-open="catalog"]');
        await activate(page, catalogOrigin);
        await verifyTranslation(page, file, locale, 'Suchkatalog');
        await checkOverflow(page, file, locale, 'Katalog ohne Suche');
        const search = page.getByRole('searchbox', { name: localized[locale].search });
        await search.fill('no such result');
        if (!(await page.locator('[data-result]').isHidden())) throw new Error(file + ' ' + locale + ': lokaler Suchfilter fehlgeschlagen');
        await search.fill('webgpu weather control');
        if (!(await page.locator('[data-result]').isVisible())) throw new Error(file + ' ' + locale + ': Demo-Suchergebnis fehlt');
        await verifyTranslation(page, file, locale, 'Suchkatalog');
        await checkOverflow(page, file, locale, 'Katalog/Suche');
        await activate(page, page.locator('#demo-detail [data-demo-open="plugin-detail"]'));
        await verifyTranslation(page, file, locale, 'WebGPU Weather-Ansicht');
        await expectFocused(page, page.locator('#demo-detail-title'), file + ' plugin detail');
        if (!(await page.locator('#demo-detail').innerText()).toLowerCase().includes(localized[locale].plugin.toLowerCase())) throw new Error(file + ' ' + locale + ': Plugin-Warnung fehlt/falsch');
        await verifyTranslation(page, file, locale, 'WebGPU Weather-Ansicht');
        await checkOverflow(page, file, locale, 'Plugin-Detail');
        await back(page, locale); await expectFocused(page, page.locator('#demo-detail-title'), file + ' catalog return');
        await back(page, locale); await expectFocused(page, catalogOrigin, file + ' catalog opener focus');
        if (!(await page.locator('#demo-detail').isHidden())) throw new Error(file + ' ' + locale + ': Katalog-Rückkehr fehlgeschlagen');
        flowRuns++;

        if (errors.length) throw new Error(file + ' ' + locale + ' JavaScript-Fehler: ' + errors.join('; '));
        if (externalRequests.length) throw new Error(file + ' ' + locale + ' externe Requests: ' + externalRequests.join(', '));
        console.log(file + ' [' + locale + ']: PASS — 3 Flows, Status, Theme, Fokus/Tastatur, 21 Overflow-Messungen, lokal');
        await page.close();
      }
    }
    console.log('GESAMT PASS — ' + localeRuns + ' Variante/Locale-Kombinationen, ' + flowRuns + ' Aufgaben-Flüsse, ' + overflowMeasurements + ' Overflow-Messungen; keine HTTP(S)-Requests oder JavaScript-Fehler.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
