'use strict';

const { applyOverlayEntryPoints } = require('../lib/guide-overlay-entry-points');

const UI_ROUTE = '/webgpu-weather-control/ui';
const OVERLAY_ROUTE = '/webgpu-weather-control/overlay';

function localized(de, en, es, fr) {
  return { de, en, es, fr };
}

function step({ id, selector, action, copy }) {
  const title = Object.fromEntries(Object.entries(copy).map(([locale, value]) => [locale, value.title]));
  const expected = Object.fromEntries(Object.entries(copy).map(([locale, value]) => [locale, value.expected]));
  return {
    id,
    copy: Object.fromEntries(Object.entries(copy).map(([locale, value]) => [locale, {
      ...value,
      alt: value.alt || value.title
    }])),
    capture: {
      route: UI_ROUTE,
      assertVisible: selector,
      focusText: title,
      action: { ...action, stepId: id },
      expected
    },
    workflow: {
      route: UI_ROUTE,
      instructions: Object.fromEntries(Object.entries(copy).map(([locale, value]) => [locale, ({
        title: value.title,
        body: value.body,
        expected: value.expected
      })])),
      operations: [
        { type: 'goto', route: UI_ROUTE },
        { type: action.type, selector: action.clickSelector || action.inputSelector || selector }
      ],
      postconditions: [
        { type: 'http-status', expected: [200, 304] },
        { type: 'url', expected: { path: UI_ROUTE, query: { lang: '$locale' }, exactQuery: true } },
        { type: 'visible', selector },
        ...(action.evidenceSelector ? [{ type: 'visible', selector: action.evidenceSelector }] : []),
        { type: 'console', expected: 'no-errors' }
      ],
      captureRule: {
        selector: action.evidenceSelector || selector,
        viewport: { width: 1440, height: 900 },
        stateChange: Boolean(action.allowClick || action.type === 'set-demo-value')
      }
    }
  };
}

const guide = {
  id: 'webgpu-weather-control',
  route: UI_ROUTE,
  topic: localized(
    'cinematische WebGPU-Wettereffekte und adaptive 1080p60-Qualität',
    'cinematic WebGPU weather effects and adaptive 1080p60 quality',
    'efectos meteorológicos WebGPU cinematográficos y calidad adaptativa 1080p60',
    'effets météo WebGPU cinématographiques et qualité adaptative 1080p60'
  ),
  test: localized(
    'eine lokale WebGPU-Regenvorschau',
    'a local WebGPU rain preview',
    'una vista previa local de lluvia WebGPU',
    'un aperçu local de pluie WebGPU'
  ),
  expected: localized(
    'die 1080p-Vorschau zeigt den Effekt ohne LIVE-Ausgabe',
    'the 1080p preview shows the effect without LIVE output',
    'la vista previa a 1080p muestra el efecto sin salida LIVE',
    'l’aperçu 1080p affiche l’effet sans sortie LIVE'
  ),
  requirement: 'obs',
  safety: 'obs',
  mode: 'ui',
  overlay: OVERLAY_ROUTE,
  overlayWorkflowStepIds: ['webgpu-weather-overlay'],
  related: ['weather-control', 'webgpu-fireworks', 'webgpu-emoji-rain'],
  copy: {
    de: {
      title: 'WebGPU Wetterkontrolle',
      summary: 'WebGPU Wetterkontrolle richtet cineastische WebGPU-Wettereffekte und adaptive 1080p60-Qualität in einer isolierten Vorschau ein.',
      firstResult: 'die 1080p-Vorschau zeigt den Effekt ohne LIVE-Ausgabe',
      requirements: 'LTTH Dashboard und ein Browser mit aktivem WebGPU; für die spätere Ausgabe eine nicht sendende OBS-Testszene.',
      safety: 'Nutze nur die lokale Vorschau und eine nicht sendende OBS-Testszene. Community-Automation und LIVE-Ausgabe bleiben deaktiviert.',
      troubleshooting: 'Wenn die WebGPU-Vorschau transparent bleibt, prüfe den Renderer-Status, das Qualitätsprofil und die Browser-WebGPU-Unterstützung auf der lokalen Plugin-Route.'
    },
    en: {
      title: 'WebGPU Weather Control',
      summary: 'WebGPU Weather Control configures cinematic WebGPU weather effects and adaptive 1080p60 quality in an isolated preview.',
      firstResult: 'the 1080p preview shows the effect without LIVE output',
      requirements: 'LTTH Dashboard and a browser with WebGPU enabled; use a non-live OBS test scene for later output.',
      safety: 'Use only the local preview and a non-live OBS test scene. Community automation and LIVE output remain disabled.',
      troubleshooting: 'If the WebGPU preview stays transparent, check renderer status, the quality profile, and browser WebGPU support on the local plugin route.'
    },
    es: {
      title: 'Control meteorológico WebGPU',
      summary: 'Control meteorológico WebGPU configura efectos cinematográficos WebGPU y calidad adaptativa 1080p60 en una vista previa aislada.',
      firstResult: 'la vista previa a 1080p muestra el efecto sin salida LIVE',
      requirements: 'Panel de LTTH y un navegador con WebGPU activado; usa una escena de prueba de OBS sin emisión para la salida posterior.',
      safety: 'Usa solo la vista previa local y una escena de prueba de OBS sin emisión. La automatización comunitaria y la salida LIVE permanecen desactivadas.',
      troubleshooting: 'Si la vista previa WebGPU permanece transparente, revisa el estado del renderizador, el perfil de calidad y la compatibilidad WebGPU del navegador en la ruta local del plugin.'
    },
    fr: {
      title: 'Contrôle météo WebGPU',
      summary: 'Contrôle météo WebGPU configure des effets météo WebGPU cinématographiques et une qualité adaptative 1080p60 dans un aperçu isolé.',
      firstResult: 'l’aperçu 1080p affiche l’effet sans sortie LIVE',
      requirements: 'Tableau de bord LTTH et navigateur avec WebGPU activé ; utilisez ensuite une scène de test OBS hors diffusion.',
      safety: 'Utilisez uniquement l’aperçu local et une scène de test OBS hors diffusion. L’automatisation communautaire et la sortie LIVE restent désactivées.',
      troubleshooting: 'Si l’aperçu WebGPU reste transparent, vérifiez l’état du moteur, le profil de qualité et la prise en charge WebGPU du navigateur sur la route locale du plugin.'
    }
  },
  steps: [
    step({
      id: 'webgpu-weather-status',
      selector: '#statusAlert',
      action: { type: 'open-plugin-surface' },
      copy: {
        de: { title: 'Renderer-Status im Testprofil prüfen', body: 'Öffne die WebGPU Wetterkontrolle und prüfe den Statusbereich, bevor du Effekte aktivierst. Die isolierte Konfiguration liegt auf /webgpu-weather-control/ui.', expected: 'Der Statusbereich der eigenen WebGPU-Wetteroberfläche ist sichtbar.' },
        en: { title: 'Check renderer status in the test profile', body: 'Open WebGPU Weather Control and inspect the status area before enabling effects. The isolated configuration is at /webgpu-weather-control/ui.', expected: 'The status area of the dedicated WebGPU weather surface is visible.' },
        es: { title: 'Comprueba el estado del renderizador en el perfil de prueba', body: 'Abre Control meteorológico WebGPU y revisa el área de estado antes de activar efectos. La configuración aislada está en /webgpu-weather-control/ui.', expected: 'El área de estado de la superficie meteorológica WebGPU dedicada está visible.' },
        fr: { title: 'Vérifiez l’état du moteur dans le profil de test', body: 'Ouvrez Contrôle météo WebGPU et vérifiez la zone d’état avant d’activer des effets. La configuration isolée est sur /webgpu-weather-control/ui.', expected: 'La zone d’état de la surface météo WebGPU dédiée est visible.' }
      }
    }),
    step({
      id: 'webgpu-weather-quality',
      selector: '#qualityPreset',
      action: { type: 'set-demo-value', inputSelector: '#qualityPreset' },
      copy: {
        de: { title: 'Adaptive Qualität auf Auto belassen', body: 'Kontrolliere auf /webgpu-weather-control/ui das Auswahlfeld „Qualitätsprofil“ (#qualityPreset) und verwende Auto für die lokale 1080p60-Vorschau.', expected: 'Das Qualitätsprofil ist sichtbar und kann für die Vorschau auf Auto stehen.' },
        en: { title: 'Keep adaptive quality on Auto', body: 'On /webgpu-weather-control/ui, review the “Quality preset” selector (#qualityPreset) and use Auto for the local 1080p60 preview.', expected: 'The quality preset is visible and can remain on Auto for preview.' },
        es: { title: 'Mantén la calidad adaptativa en Auto', body: 'En /webgpu-weather-control/ui, revisa el selector «Perfil de calidad» (#qualityPreset) y usa Auto para la vista previa local a 1080p60.', expected: 'El perfil de calidad está visible y puede permanecer en Auto para la vista previa.' },
        fr: { title: 'Conservez la qualité adaptative sur Auto', body: 'Sur /webgpu-weather-control/ui, vérifiez le sélecteur « Profil de qualité » (#qualityPreset) et utilisez Auto pour l’aperçu local 1080p60.', expected: 'Le profil de qualité est visible et peut rester sur Auto pour l’aperçu.' }
      }
    }),
    step({
      id: 'webgpu-weather-rain-preview',
      selector: '#testRainEffectBtn',
      action: { type: 'run-local-preview', allowClick: true, clickSelector: '#testRainEffectBtn', evidenceSelector: '#statusAlert', settleMs: 750 },
      copy: {
        de: { title: 'Cineastische Regenvorschau lokal starten', body: 'Klicke auf /webgpu-weather-control/ui auf „Test Rain Effect“ (#testRainEffectBtn). Der Test rendert nur eine lokale WebGPU-Vorschau und sendet keinen LIVE-Trigger.', expected: 'Der Statusbereich bestätigt die gestartete lokale Regenvorschau.' },
        en: { title: 'Start the cinematic rain preview locally', body: 'On /webgpu-weather-control/ui, click “Test Rain Effect” (#testRainEffectBtn). The test renders only a local WebGPU preview and sends no LIVE trigger.', expected: 'The status area confirms that the local rain preview started.' },
        es: { title: 'Inicia localmente la vista previa cinematográfica de lluvia', body: 'En /webgpu-weather-control/ui, haz clic en «Test Rain Effect» (#testRainEffectBtn). La prueba renderiza solo una vista previa WebGPU local y no envía un disparador LIVE.', expected: 'El área de estado confirma que la vista previa local de lluvia se inició.' },
        fr: { title: 'Démarrez localement l’aperçu de pluie cinématographique', body: 'Sur /webgpu-weather-control/ui, cliquez sur « Test Rain Effect » (#testRainEffectBtn). Le test ne rend qu’un aperçu WebGPU local et n’envoie aucun déclencheur LIVE.', expected: 'La zone d’état confirme le démarrage de l’aperçu local de pluie.' }
      }
    }),
    step({
      id: 'webgpu-weather-community-hud',
      selector: '#gamificationOverlayEnabled + .slider',
      action: { type: 'open-plugin-surface' },
      copy: {
        de: { title: 'Community-HUD separat kontrollieren', body: 'Prüfe auf /webgpu-weather-control/ui den separaten Schalter „Community-Info im Overlay anzeigen“ (#gamificationOverlayEnabled). Er bleibt für die sichere Testvorschau deaktiviert.', expected: 'Der unabhängige Community-HUD-Schalter ist sichtbar.' },
        en: { title: 'Review the community HUD separately', body: 'On /webgpu-weather-control/ui, inspect the separate “Show community info in overlay” toggle (#gamificationOverlayEnabled). Keep it disabled for the safe test preview.', expected: 'The independent community HUD toggle is visible.' },
        es: { title: 'Revisa el HUD comunitario por separado', body: 'En /webgpu-weather-control/ui, revisa el interruptor independiente «Mostrar información de la comunidad en el overlay» (#gamificationOverlayEnabled). Déjalo desactivado para la vista previa segura.', expected: 'El interruptor independiente del HUD comunitario está visible.' },
        fr: { title: 'Contrôlez séparément le HUD communautaire', body: 'Sur /webgpu-weather-control/ui, vérifiez le bouton indépendant « Afficher les informations de communauté dans l’overlay » (#gamificationOverlayEnabled). Laissez-le désactivé pour l’aperçu sûr.', expected: 'Le bouton indépendant du HUD communautaire est visible.' }
      }
    }),
    step({
      id: 'webgpu-weather-overlay',
      selector: '#overlayUrl',
      action: { type: 'open-plugin-surface' },
      copy: {
        de: { title: 'WebGPU-Overlay-URL für OBS übernehmen', body: 'Prüfe die sichtbare URL auf /webgpu-weather-control/ui, bevor du /webgpu-weather-control/overlay in einer nicht sendenden OBS-Testszene als Browserquelle verwendest.', expected: 'Die Overlay-URL ist sichtbar und kann für eine Testquelle übernommen werden.' },
        en: { title: 'Use the WebGPU overlay URL for OBS', body: 'Review the visible URL on /webgpu-weather-control/ui before using /webgpu-weather-control/overlay as a browser source in a non-live OBS test scene.', expected: 'The overlay URL is visible and can be used for a test source.' },
        es: { title: 'Usa la URL del overlay WebGPU para OBS', body: 'Revisa la URL visible en /webgpu-weather-control/ui antes de usar /webgpu-weather-control/overlay como fuente de navegador en una escena de prueba de OBS sin emisión.', expected: 'La URL del overlay está visible y puede usarse para una fuente de prueba.' },
        fr: { title: 'Utilisez l’URL de l’overlay WebGPU pour OBS', body: 'Vérifiez l’URL visible sur /webgpu-weather-control/ui avant d’utiliser /webgpu-weather-control/overlay comme source navigateur dans une scène de test OBS hors diffusion.', expected: 'L’URL de l’overlay est visible et peut servir à une source de test.' }
      }
    }),
    step({
      id: 'webgpu-weather-preview-stop',
      selector: '#stopAllPreviewBtn',
      action: { type: 'run-local-preview', allowClick: true, clickSelector: '#stopAllPreviewBtn', evidenceSelector: '#statusAlert', settleMs: 250 },
      copy: {
        de: { title: 'Lokale WebGPU-Vorschau sauber beenden', body: 'Klicke nach dem Test auf /webgpu-weather-control/ui auf „Stop All“ (#stopAllPreviewBtn). Das beendet nur Vorschau-Effekte und ändert keine gespeicherte Konfiguration.', expected: 'Der Statusbereich bestätigt, dass die lokale Vorschau gestoppt wurde.' },
        en: { title: 'Cleanly stop the local WebGPU preview', body: 'After testing, click “Stop All” (#stopAllPreviewBtn) on /webgpu-weather-control/ui. This stops preview effects only and does not change saved configuration.', expected: 'The status area confirms that the local preview stopped.' },
        es: { title: 'Detén limpiamente la vista previa WebGPU local', body: 'Después de probar, haz clic en «Stop All» (#stopAllPreviewBtn) en /webgpu-weather-control/ui. Esto solo detiene efectos de vista previa y no cambia la configuración guardada.', expected: 'El área de estado confirma que la vista previa local se detuvo.' },
        fr: { title: 'Arrêtez proprement l’aperçu WebGPU local', body: 'Après le test, cliquez sur « Stop All » (#stopAllPreviewBtn) sur /webgpu-weather-control/ui. Cela arrête uniquement les effets d’aperçu et ne modifie pas la configuration enregistrée.', expected: 'La zone d’état confirme l’arrêt de l’aperçu local.' }
      }
    })
  ]
};

module.exports = Object.freeze(applyOverlayEntryPoints(guide, {
  'webgpu-weather-overlay': {
    route: UI_ROUTE,
    selector: '#overlayUrl',
    copy: {
      de: { title: 'WebGPU-Overlay-URL für OBS übernehmen', body: 'Prüfe die sichtbare URL in der WebGPU Wetterkontrolle, bevor du sie in einer nicht sendenden OBS-Testszene verwendest.', expected: 'Die sichtbare Overlay-URL kann für die OBS-Testquelle übernommen werden.' },
      en: { title: 'Use the WebGPU overlay URL for OBS', body: 'Review the visible URL in WebGPU Weather Control before using it in a non-live OBS test scene.', expected: 'The visible overlay URL can be used for the OBS test source.' },
      es: { title: 'Usa la URL del overlay WebGPU para OBS', body: 'Revisa la URL visible en Control meteorológico WebGPU antes de usarla en una escena de prueba de OBS sin emisión.', expected: 'La URL visible del overlay puede usarse para la fuente de prueba de OBS.' },
      fr: { title: 'Utilisez l’URL de l’overlay WebGPU pour OBS', body: 'Vérifiez l’URL visible dans Contrôle météo WebGPU avant de l’utiliser dans une scène de test OBS hors diffusion.', expected: 'L’URL visible de l’overlay peut être utilisée pour la source de test OBS.' }
    }
  }
}));
