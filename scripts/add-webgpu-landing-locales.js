const fs = require('fs');
const path = require('path');

const translations = {
  de: {
    'webgpuLanding.eyebrow': 'OBS + WebGPU',
    'webgpuLanding.title': 'Mehr GPU. Mehr Live-Momente.',
    'webgpuLanding.subtitle': 'Nutze LTTH-Plugins mit WebGPU-Unterstützung in einer speziell abgestimmten OBS-Version von Loggableim.',
    'webgpuLanding.primaryCta': 'OBS WebGPU herunterladen',
    'webgpuLanding.secondaryCta': 'Plugins ansehen',
    'webgpuLanding.badge': 'Offizielles OBS-WebGPU-Build',
    'webgpuLanding.sectionTitle': 'Für GPU-Plugins gemacht',
    'webgpuLanding.sectionText': 'WebGPU-Plugins entlasten die CPU und bringen flüssige Partikel, Effekte und Overlays direkt in deine Szene.',
    'webgpuLanding.cardRuntimeTitle': 'Eigene OBS-Laufzeit',
    'webgpuLanding.cardRuntimeText': 'Installiere das WebGPU-Build parallel zu deinem bestehenden OBS und wähle es gezielt für GPU-Overlays.',
    'webgpuLanding.cardPerformanceTitle': 'Mehr Reserven für den Stream',
    'webgpuLanding.cardPerformanceText': 'Instanziertes Rendering hält große Effektmengen flüssig, während dein Stream stabil bleibt.',
    'webgpuLanding.cardReadyTitle': 'Bereit für LTTH',
    'webgpuLanding.cardReadyText': 'WebGPU Emoji Rain, WebGPU Fireworks und weitere GPU-Effekte sind für diesen Workflow vorbereitet.',
    'webgpuLanding.stepsTitle': 'In drei Schritten startklar',
    'webgpuLanding.step1Title': 'OBS WebGPU installieren',
    'webgpuLanding.step1Text': 'Lade den aktuellen Build aus dem offiziellen GitHub-Repository herunter.',
    'webgpuLanding.step2Title': 'LTTH starten',
    'webgpuLanding.step2Text': 'Starte LTTH und aktiviere die Plugins, die du im Live-Setup brauchst.',
    'webgpuLanding.step3Title': 'Overlay in OBS einfügen',
    'webgpuLanding.step3Text': 'Kopiere die Overlay-URL aus LTTH in deine WebGPU-OBS-Szene.',
    'webgpuLanding.note': 'Hinweis: Das Build ist ein separates OBS-Programm und wird vom LTTH-Team des Repositories gepflegt.',
    'webgpuLanding.repoCta': 'Repository und Releases öffnen',
    'webgpuLanding.pluginsCta': 'WebGPU-Plugins in LTTH'
  },
  en: {
    'webgpuLanding.eyebrow': 'OBS + WebGPU',
    'webgpuLanding.title': 'More GPU. More live moments.',
    'webgpuLanding.subtitle': 'Use LTTH plugins with WebGPU support in a dedicated OBS build maintained by Loggableim.',
    'webgpuLanding.primaryCta': 'Download OBS WebGPU',
    'webgpuLanding.secondaryCta': 'Explore plugins',
    'webgpuLanding.badge': 'Official OBS WebGPU build',
    'webgpuLanding.sectionTitle': 'Built for GPU plugins',
    'webgpuLanding.sectionText': 'WebGPU plugins move demanding rendering off the CPU and keep particles, effects, and overlays smooth in your scene.',
    'webgpuLanding.cardRuntimeTitle': 'A dedicated OBS runtime',
    'webgpuLanding.cardRuntimeText': 'Install the WebGPU build next to your existing OBS and choose it when you need GPU overlays.',
    'webgpuLanding.cardPerformanceTitle': 'More headroom for your stream',
    'webgpuLanding.cardPerformanceText': 'Instanced rendering keeps large effect counts fluid while your stream stays stable.',
    'webgpuLanding.cardReadyTitle': 'Ready for LTTH',
    'webgpuLanding.cardReadyText': 'WebGPU Emoji Rain, WebGPU Fireworks, and more GPU effects are prepared for this workflow.',
    'webgpuLanding.stepsTitle': 'Three steps to go live',
    'webgpuLanding.step1Title': 'Install OBS WebGPU',
    'webgpuLanding.step1Text': 'Download the current build from the official GitHub repository.',
    'webgpuLanding.step2Title': 'Start LTTH',
    'webgpuLanding.step2Text': 'Launch LTTH and enable the plugins you need for your live setup.',
    'webgpuLanding.step3Title': 'Add the overlay to OBS',
    'webgpuLanding.step3Text': 'Copy the overlay URL from LTTH into your WebGPU OBS scene.',
    'webgpuLanding.note': 'Note: This is a separate OBS application maintained by the team behind the repository.',
    'webgpuLanding.repoCta': 'Open repository and releases',
    'webgpuLanding.pluginsCta': 'WebGPU plugins in LTTH'
  },
  es: {
    'webgpuLanding.eyebrow': 'OBS + WebGPU',
    'webgpuLanding.title': 'Más GPU. Más momentos en directo.',
    'webgpuLanding.subtitle': 'Usa plugins de LTTH con WebGPU en una versión de OBS específica mantenida por Loggableim.',
    'webgpuLanding.primaryCta': 'Descargar OBS WebGPU',
    'webgpuLanding.secondaryCta': 'Ver plugins',
    'webgpuLanding.badge': 'Build oficial de OBS WebGPU',
    'webgpuLanding.sectionTitle': 'Creado para plugins GPU',
    'webgpuLanding.sectionText': 'Los plugins WebGPU descargan el renderizado de la CPU y mantienen fluidos los efectos, partículas y overlays.',
    'webgpuLanding.cardRuntimeTitle': 'Una ejecución OBS dedicada',
    'webgpuLanding.cardRuntimeText': 'Instala el build WebGPU junto a tu OBS actual y úsalo cuando necesites overlays GPU.',
    'webgpuLanding.cardPerformanceTitle': 'Más margen para tu stream',
    'webgpuLanding.cardPerformanceText': 'El renderizado instanciado mantiene fluidos muchos efectos mientras el stream sigue estable.',
    'webgpuLanding.cardReadyTitle': 'Listo para LTTH',
    'webgpuLanding.cardReadyText': 'WebGPU Emoji Rain, WebGPU Fireworks y más efectos GPU están preparados para este flujo.',
    'webgpuLanding.stepsTitle': 'Tres pasos para salir en directo',
    'webgpuLanding.step1Title': 'Instala OBS WebGPU',
    'webgpuLanding.step1Text': 'Descarga la versión actual desde el repositorio oficial de GitHub.',
    'webgpuLanding.step2Title': 'Inicia LTTH',
    'webgpuLanding.step2Text': 'Abre LTTH y activa los plugins que necesitas para tu directo.',
    'webgpuLanding.step3Title': 'Añade el overlay a OBS',
    'webgpuLanding.step3Text': 'Copia la URL del overlay de LTTH en tu escena de OBS WebGPU.',
    'webgpuLanding.note': 'Nota: Es una aplicación OBS independiente mantenida por el equipo del repositorio.',
    'webgpuLanding.repoCta': 'Abrir repositorio y versiones',
    'webgpuLanding.pluginsCta': 'Plugins WebGPU en LTTH'
  },
  fr: {
    'webgpuLanding.eyebrow': 'OBS + WebGPU',
    'webgpuLanding.title': 'Plus de GPU. Plus de moments live.',
    'webgpuLanding.subtitle': 'Utilisez les plugins LTTH compatibles WebGPU dans une version OBS dédiée maintenue par Loggableim.',
    'webgpuLanding.primaryCta': 'Télécharger OBS WebGPU',
    'webgpuLanding.secondaryCta': 'Voir les plugins',
    'webgpuLanding.badge': 'Build OBS WebGPU officiel',
    'webgpuLanding.sectionTitle': 'Pensé pour les plugins GPU',
    'webgpuLanding.sectionText': 'Les plugins WebGPU déportent le rendu lourd du CPU et gardent particules, effets et overlays fluides.',
    'webgpuLanding.cardRuntimeTitle': 'Un runtime OBS dédié',
    'webgpuLanding.cardRuntimeText': 'Installez le build WebGPU à côté de votre OBS actuel et choisissez-le pour les overlays GPU.',
    'webgpuLanding.cardPerformanceTitle': 'Plus de marge pour le stream',
    'webgpuLanding.cardPerformanceText': 'Le rendu instancié garde de nombreux effets fluides et votre stream stable.',
    'webgpuLanding.cardReadyTitle': 'Prêt pour LTTH',
    'webgpuLanding.cardReadyText': 'WebGPU Emoji Rain, WebGPU Fireworks et d’autres effets GPU sont prêts pour ce workflow.',
    'webgpuLanding.stepsTitle': 'Trois étapes pour démarrer',
    'webgpuLanding.step1Title': 'Installer OBS WebGPU',
    'webgpuLanding.step1Text': 'Téléchargez le build actuel depuis le dépôt GitHub officiel.',
    'webgpuLanding.step2Title': 'Lancer LTTH',
    'webgpuLanding.step2Text': 'Ouvrez LTTH et activez les plugins nécessaires à votre live.',
    'webgpuLanding.step3Title': 'Ajouter l’overlay dans OBS',
    'webgpuLanding.step3Text': 'Copiez l’URL de l’overlay LTTH dans votre scène OBS WebGPU.',
    'webgpuLanding.note': 'Remarque : il s’agit d’une application OBS séparée, maintenue par l’équipe du dépôt.',
    'webgpuLanding.repoCta': 'Ouvrir le dépôt et les releases',
    'webgpuLanding.pluginsCta': 'Plugins WebGPU dans LTTH'
  }
};

const metaDescriptions = {
  de: 'OBS WebGPU f\u00fcr LTTH-Plugins',
  en: 'OBS WebGPU for LTTH plugins',
  es: 'OBS WebGPU para plugins de LTTH',
  fr: 'OBS WebGPU pour les plugins LTTH'
};

for (const [locale, additions] of Object.entries(translations)) {
  const file = path.join(__dirname, '..', 'locales', `${locale}.json`);
  const current = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, `${JSON.stringify({ ...current, ...additions, 'webgpuLanding.metaDescription': metaDescriptions[locale] }, null, 2)}\n`, 'utf8');
}
