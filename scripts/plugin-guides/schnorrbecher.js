'use strict';

const { applyOverlayEntryPoints, exactLocalUrlExpectation } = require('../lib/guide-overlay-entry-points');

function localized(de, en, es, fr) {
  return { de, en, es, fr };
}

function workflowStep({ id, route, selector, action, copy, stateChange = false, evidenceSelector = selector }) {
  const instructions = Object.fromEntries(Object.entries(copy).map(([locale, value]) => [locale, {
    title: value.title,
    body: value.body,
    expected: value.expected
  }]));
  return {
    id,
    copy,
    capture: {
      route,
      assertVisible: selector,
      focusText: Object.fromEntries(Object.entries(copy).map(([locale, value]) => [locale, value.title])),
      action: { type: action, stepId: id },
      expected: Object.fromEntries(Object.entries(copy).map(([locale, value]) => [locale, value.expected]))
    },
    workflow: {
      route,
      instructions,
      operations: [
        { type: 'goto', route },
        { type: action, selector }
      ],
      postconditions: [
        { type: 'http-status', expected: [200, 304] },
        { type: 'url', expected: exactLocalUrlExpectation(route) },
        ...(evidenceSelector === selector ? [] : [{ type: 'visible', selector }]),
        { type: 'visible', selector: evidenceSelector },
        { type: 'console', expected: 'no-errors' }
      ],
      captureRule: {
        selector: evidenceSelector,
        viewport: { width: 1440, height: 900 },
        stateChange
      }
    }
  };
}

module.exports = Object.freeze(applyOverlayEntryPoints({
  id: 'schnorrbecher',
  route: '/schnorrbecher/ui',
  topic: localized(
    'Geschenkeglas, lokale Testwerte und OBS-Overlay',
    'gift jar, local test values, and OBS overlay',
    'tarro de regalos, valores de prueba locales y overlay de OBS',
    'bocal de cadeaux, valeurs de test locales et overlay OBS'
  ),
  test: localized(
    'ein lokales Testgeschenk',
    'a local test gift',
    'un regalo de prueba local',
    'un cadeau de test local'
  ),
  expected: localized(
    'der Testwert erscheint im isolierten Becher, ohne eine LIVE-Szene zu verändern',
    'the test value appears in the isolated jar without changing a LIVE scene',
    'el valor de prueba aparece en el tarro aislado sin cambiar una escena LIVE',
    'la valeur de test apparaît dans le bocal isolé sans modifier une scène LIVE'
  ),
  requirement: 'obs',
  safety: 'obs',
  mode: 'ui',
  overlay: '/overlay/coincup?transparent=1',
  overlayWorkflowStepIds: ['coin-jar-overlay'],
  related: ['gift-catalog', 'goals'],
  copy: {
    de: {
      title: 'Schnorrbecher',
      summary: 'Schnorrbecher richtet Geschenkeglas, lokale Testwerte und OBS-Overlay ein, ohne eine LIVE-Szene zu verändern.',
      firstResult: 'der Testwert erscheint im isolierten Becher, ohne eine LIVE-Szene zu verändern',
      requirements: 'LTTH Dashboard und eine nicht gesendete OBS-Testszene. Dieser Ablauf behandelt Geschenkeglas, lokale Testwerte und OBS-Overlay.',
      safety: 'Nutze nur das isolierte Testprofil und eine nicht gesendete OBS-Szene. Der Test-Button erzeugt kein TikTok-LIVE-Ereignis.',
      troubleshooting: 'Wenn der Becher nicht reagiert, öffne die lokale Steuerung, prüfe den sichtbaren Status und wiederhole das Testgeschenk.',
      related: ['gift-catalog', 'goals']
    },
    en: {
      title: 'Schnorrbecher',
      summary: 'Schnorrbecher configures the gift jar, local test values, and OBS overlay without changing a LIVE scene.',
      firstResult: 'the test value appears in the isolated jar without changing a LIVE scene',
      requirements: 'LTTH Dashboard and an OBS test scene that is not live. This workflow covers the gift jar, local test values, and OBS overlay.',
      safety: 'Use only the isolated test profile and a non-live OBS scene. The test button does not create a TikTok LIVE event.',
      troubleshooting: 'If the jar does not react, open the local control surface, check the visible status, and repeat the test gift.',
      related: ['gift-catalog', 'goals']
    },
    es: {
      title: 'Schnorrbecher',
      summary: 'Schnorrbecher configura el tarro de regalos, los valores de prueba locales y el overlay de OBS sin cambiar una escena LIVE.',
      firstResult: 'el valor de prueba aparece en el tarro aislado sin cambiar una escena LIVE',
      requirements: 'El panel de LTTH y una escena de prueba de OBS que no esté en directo. Este flujo cubre el tarro de regalos, los valores de prueba locales y el overlay de OBS.',
      safety: 'Usa solo el perfil de prueba aislado y una escena de OBS no emitida. El botón de prueba no crea un evento de TikTok LIVE.',
      troubleshooting: 'Si el tarro no reacciona, abre la superficie de control local, comprueba el estado visible y repite el regalo de prueba.',
      related: ['gift-catalog', 'goals']
    },
    fr: {
      title: 'Schnorrbecher',
      summary: 'Schnorrbecher configure le bocal de cadeaux, les valeurs de test locales et l’overlay OBS sans modifier une scène LIVE.',
      firstResult: 'la valeur de test apparaît dans le bocal isolé sans modifier une scène LIVE',
      requirements: 'Le tableau de bord LTTH et une scène de test OBS non diffusée. Ce flux couvre le bocal de cadeaux, les valeurs de test locales et l’overlay OBS.',
      safety: 'Utilisez uniquement le profil de test isolé et une scène OBS non diffusée. Le bouton de test ne crée pas d’événement TikTok LIVE.',
      troubleshooting: 'Si le bocal ne réagit pas, ouvrez la surface de contrôle locale, vérifiez l’état visible puis répétez le cadeau de test.',
      related: ['gift-catalog', 'goals']
    }
  },
  steps: [
    workflowStep({
      id: 'coin-jar-config',
      route: '/schnorrbecher/ui',
      selector: '#coin-jar-config',
      action: 'open-plugin-surface',
      copy: {
        de: { title: 'Becher im Testprofil konfigurieren', body: 'Öffne die sichtbare Konfiguration des Geschenkeglases. Ändere nur Werte im isolierten Testprofil und speichere keine LIVE-Zugangsdaten.', expected: 'Die vollständige Becher-Konfiguration ist sichtbar.', alt: 'Schnorrbecher Konfiguration im Testprofil' },
        en: { title: 'Configure the jar in the test profile', body: 'Open the visible gift-jar configuration. Change values only in the isolated test profile and do not save LIVE credentials.', expected: 'The complete jar configuration is visible.', alt: 'Schnorrbecher configuration in the test profile' },
        es: { title: 'Configura el tarro en el perfil de prueba', body: 'Abre la configuración visible del tarro de regalos. Cambia valores solo en el perfil de prueba aislado y no guardes credenciales LIVE.', expected: 'La configuración completa del tarro está visible.', alt: 'Configuración de Schnorrbecher en el perfil de prueba' },
        fr: { title: 'Configurez le bocal dans le profil de test', body: 'Ouvrez la configuration visible du bocal de cadeaux. Modifiez les valeurs uniquement dans le profil de test isolé et n’enregistrez pas d’identifiants LIVE.', expected: 'La configuration complète du bocal est visible.', alt: 'Configuration de Schnorrbecher dans le profil de test' }
      }
    }),
    workflowStep({
      id: 'test-gift',
      route: '/schnorrbecher/ui',
      selector: '#test-gift',
      action: 'run-local-preview',
      stateChange: true,
      evidenceSelector: '#total-value',
      copy: {
        de: { title: 'Lokales Testgeschenk auslösen', body: 'Wähle bei Bedarf einen lokalen Testwert und löse Test Gift aus. Die Aktion arbeitet nur in der temporären Testinstanz.', expected: 'Der Gesamtwert erhöht sich nach dem lokalen Testgeschenk.', alt: 'Lokales Schnorrbecher Testgeschenk' },
        en: { title: 'Trigger a local test gift', body: 'Choose a local test value if needed and trigger Test Gift. The action runs only in the temporary test instance.', expected: 'The total value increases after the local test gift.', alt: 'Local Schnorrbecher test gift' },
        es: { title: 'Activa un regalo de prueba local', body: 'Elige un valor de prueba local si es necesario y activa Test Gift. La acción se ejecuta solo en la instancia de prueba temporal.', expected: 'El valor total aumenta después del regalo de prueba local.', alt: 'Regalo de prueba local de Schnorrbecher' },
        fr: { title: 'Déclenchez un cadeau de test local', body: 'Choisissez si nécessaire une valeur de test locale puis déclenchez Test Gift. L’action s’exécute uniquement dans l’instance de test temporaire.', expected: 'La valeur totale augmente après le cadeau de test local.', alt: 'Cadeau de test local Schnorrbecher' }
      }
    }),
    workflowStep({
      id: 'coin-jar-overlay',
      route: '/schnorrbecher/ui',
      selector: '#overlay-url',
      action: 'open-overlay-preview',
      copy: {
        de: { title: 'OBS-Overlay-URL prüfen', body: 'Prüfe die sichtbare Browser-Source-URL und verwende sie nur in einer nicht gesendeten OBS-Testszene.', expected: 'Die lokale Overlay-URL ist sichtbar und kopierbar.', alt: 'Schnorrbecher OBS Overlay-URL' },
        en: { title: 'Verify the OBS overlay URL', body: 'Check the visible browser-source URL and use it only in an OBS test scene that is not live.', expected: 'The local overlay URL is visible and can be copied.', alt: 'Schnorrbecher OBS overlay URL' },
        es: { title: 'Comprueba la URL del overlay de OBS', body: 'Comprueba la URL visible de la fuente de navegador y úsala solo en una escena de prueba de OBS que no esté en directo.', expected: 'La URL local del overlay está visible y se puede copiar.', alt: 'URL del overlay de OBS de Schnorrbecher' },
        fr: { title: 'Vérifiez l’URL de l’overlay OBS', body: 'Vérifiez l’URL visible de la source navigateur et utilisez-la uniquement dans une scène de test OBS non diffusée.', expected: 'L’URL locale de l’overlay est visible et peut être copiée.', alt: 'URL de l’overlay OBS Schnorrbecher' }
      }
    })
  ]
}, {
  'coin-jar-overlay': {
    route: '/schnorrbecher/ui',
    selector: '#overlay-url',
    copy: {
      de: { title: 'OBS-Overlay-URL prüfen', body: 'Prüfe die sichtbare Browser-Source-URL und verwende sie nur in einer nicht gesendeten OBS-Testszene.', expected: 'Die lokale Overlay-URL ist sichtbar und kopierbar.', alt: 'Schnorrbecher OBS Overlay-URL' },
      en: { title: 'Verify the OBS overlay URL', body: 'Check the visible browser-source URL and use it only in an OBS test scene that is not live.', expected: 'The local overlay URL is visible and can be copied.', alt: 'Schnorrbecher OBS overlay URL' },
      es: { title: 'Comprueba la URL del overlay de OBS', body: 'Comprueba la URL visible de la fuente de navegador y úsala solo en una escena de prueba de OBS que no esté en directo.', expected: 'La URL local del overlay está visible y se puede copiar.', alt: 'URL del overlay de OBS de Schnorrbecher' },
      fr: { title: 'Vérifiez l’URL de l’overlay OBS', body: 'Vérifiez l’URL visible de la source navigateur et utilisez-la uniquement dans une scène de test OBS non diffusée.', expected: 'L’URL locale de l’overlay est visible et peut être copiée.', alt: 'URL de l’overlay OBS Schnorrbecher' }
    }
  }
}));
