'use strict';

const UI_ROUTE = '/streammonsters/ui';
const OVERLAY_ROUTE = '/streammonsters/overlay';
const LOCALES = ['de', 'en', 'es', 'fr'];

function localizedFields(copy, field) {
  return Object.fromEntries(LOCALES.map((locale) => [locale, copy[locale][field]]));
}

function workflowInstructions(copy) {
  return Object.fromEntries(LOCALES.map((locale) => [locale, {
    title: copy[locale].title,
    body: copy[locale].body,
    expected: copy[locale].expected
  }]));
}

function readOnlyStep(id, selector, copy) {
  return {
    id,
    copy,
    capture: {
      route: UI_ROUTE,
      assertVisible: selector,
      focusText: localizedFields(copy, 'title'),
      action: {
        type: 'open-plugin-surface',
        stepId: id
      },
      expected: localizedFields(copy, 'expected')
    },
    workflow: {
      route: UI_ROUTE,
      instructions: workflowInstructions(copy),
      operations: [
        { type: 'goto', route: UI_ROUTE },
        { type: 'open-plugin-surface', selector }
      ],
      postconditions: [
        { type: 'http-status', expected: [200, 304] },
        {
          type: 'url',
          expected: {
            path: UI_ROUTE,
            query: { lang: '$locale' },
            exactQuery: true
          }
        },
        { type: 'visible', selector },
        { type: 'console', expected: 'no-errors' }
      ],
      captureRule: {
        selector,
        viewport: { width: 1440, height: 900 },
        stateChange: false
      }
    }
  };
}

// Complete editorial and workflow contract for Stream Monsters 1.5. The
// workflow remains read-only so documentation captures cannot change a
// viewer's permanent collection or a creator's live configuration.
module.exports = Object.freeze({
  id: 'streamalchemy',
  route: UI_ROUTE,
  topic: {
    de: 'Geschenk-Eier, 72 Formen und interaktive A/B/C-Arena',
    en: 'gift eggs, 72 forms, and the interactive A/B/C arena',
    es: 'huevos por regalos, 72 formas y la arena interactiva A/B/C',
    fr: 'œufs obtenus par cadeaux, 72 formes et arène interactive A/B/C'
  },
  test: {
    de: 'die lokale Stream-Monsters-1.5-Vorschau',
    en: 'the local Stream Monsters 1.5 preview',
    es: 'la vista previa local de Stream Monsters 1.5',
    fr: 'l’aperçu local de Stream Monsters 1.5'
  },
  expected: {
    de: 'Gift-Mapping, 72-Formen-Katalog, A/B/C-Arena und Portrait-Overlay sind sichtbar',
    en: 'gift mapping, the 72-form catalog, the A/B/C arena, and the portrait overlay are visible',
    es: 'se ven el mapeo de regalos, el catálogo de 72 formas, la arena A/B/C y el overlay vertical',
    fr: 'le mappage des cadeaux, le catalogue de 72 formes, l’arène A/B/C et l’overlay portrait sont visibles'
  },
  requirement: 'standard',
  safety: 'local',
  mode: 'ui',
  overlay: OVERLAY_ROUTE,
  overlayWorkflowStepIds: ['alchemy-overlay'],
  related: [
    'gcce',
    'gift-catalog'
  ],
  excludedIntegrationValues: [
    '/api/streammonsters/art/:filename'
  ],
  copy: {
    de: {
      title: 'Stream Monsters',
      summary: 'Stream Monsters 1.5 verbindet ausschließlich durch aktivierte Gifts erzeugte Eier, 72 gebündelte Furry-Formen mit kosmetischer Evolution, permanenten Fortschritt und interaktive A/B/C-Duelle in einer Portrait-first-Arena.',
      firstResult: 'Der Creator zeigt Live-Bereitschaft, Gifts-only-Eier, alle 72 Formen, die A/B/C-Arena und die OBS-Browserquelle, ohne eine LIVE-Aktion auszulösen.',
      requirements: 'LTTH 1.4.1 mit Stream Monsters 1.5. Für den lokalen Aufbau genügt der Creator; TikTok, GCCE und OBS werden erst für den Sendebetrieb benötigt.',
      safety: 'Verwende für die Prüfung nur die lokalen Vorschauen. Eier entstehen ausschließlich aus aktivierten Gifts; Gifts verändern keine Kampfwerte oder Gewinnchancen. Stream Monsters 1.5 enthält kein Art Lab, keine Bildgenerierung und keinen Modell-Installer.',
      troubleshooting: 'Wenn Gifts, 72 Formen oder die A/B/C-Vorschau fehlen, prüfe den Plugin-Status, öffne /streammonsters/ui neu und kontrolliere die Hinweise im Live Center.',
      related: ['gcce', 'gift-catalog']
    },
    en: {
      title: 'Stream Monsters',
      summary: 'Stream Monsters 1.5 combines eggs created only by enabled gifts, 72 bundled Furry forms with cosmetic evolution, permanent progression, and interactive A/B/C battles in a portrait-first arena.',
      firstResult: 'The Creator shows live readiness, gifts-only eggs, all 72 forms, the A/B/C arena, and the OBS browser source without triggering a LIVE action.',
      requirements: 'LTTH 1.4.1 with Stream Monsters 1.5. The Creator is enough for local setup; TikTok, GCCE, and OBS are needed only for broadcast operation.',
      safety: 'Use local previews only while checking the setup. Eggs come only from enabled gifts; gifts never change combat stats or win odds. Stream Monsters 1.5 includes no Art Lab, image generation, or model installer.',
      troubleshooting: 'If gifts, the 72 forms, or the A/B/C preview are missing, check the plugin status, reopen /streammonsters/ui, and review the Live Center warnings.',
      related: ['gcce', 'gift-catalog']
    },
    es: {
      title: 'Stream Monsters',
      summary: 'Stream Monsters 1.5 combina huevos creados solo por regalos activados, 72 formas Furry incluidas con evolución cosmética, progreso permanente y combates interactivos A/B/C en una arena pensada para formato vertical.',
      firstResult: 'Creator muestra la preparación para directo, los huevos solo por regalos, las 72 formas, la arena A/B/C y la fuente de navegador de OBS sin activar ninguna acción LIVE.',
      requirements: 'LTTH 1.4.1 con Stream Monsters 1.5. Creator basta para la configuración local; TikTok, GCCE y OBS solo son necesarios para emitir.',
      safety: 'Usa únicamente las vistas previas locales durante la comprobación. Los huevos proceden solo de regalos activados; los regalos nunca cambian estadísticas de combate ni probabilidades de victoria. Stream Monsters 1.5 no incluye Art Lab, generación de imágenes ni instalador de modelos.',
      troubleshooting: 'Si faltan los regalos, las 72 formas o la vista previa A/B/C, comprueba el estado del plugin, vuelve a abrir /streammonsters/ui y revisa los avisos de Live Center.',
      related: ['gcce', 'gift-catalog']
    },
    fr: {
      title: 'Stream Monsters',
      summary: 'Stream Monsters 1.5 réunit des œufs créés uniquement par les cadeaux activés, 72 formes Furry intégrées avec évolution cosmétique, une progression permanente et des combats interactifs A/B/C dans une arène pensée pour le portrait.',
      firstResult: 'Le Creator affiche l’état de préparation, les œufs obtenus uniquement par cadeaux, les 72 formes, l’arène A/B/C et la source navigateur OBS sans déclencher d’action LIVE.',
      requirements: 'LTTH 1.4.1 avec Stream Monsters 1.5. Le Creator suffit pour la configuration locale ; TikTok, GCCE et OBS ne sont nécessaires que pour la diffusion.',
      safety: 'Utilisez uniquement les aperçus locaux pendant la vérification. Les œufs proviennent exclusivement des cadeaux activés ; les cadeaux ne modifient jamais les statistiques de combat ni les chances de victoire. Stream Monsters 1.5 ne comprend ni Art Lab, ni génération d’images, ni installateur de modèles.',
      troubleshooting: 'Si les cadeaux, les 72 formes ou l’aperçu A/B/C manquent, vérifiez l’état du plugin, rouvrez /streammonsters/ui et consultez les avertissements du Live Center.',
      related: ['gcce', 'gift-catalog']
    }
  },
  steps: [
    readOnlyStep('alchemy-card', '#live-center', {
      de: {
        title: 'Live Center und Sendebereitschaft prüfen',
        body: 'Öffne den Stream-Monsters-Creator und prüfe TikTok-, GCCE-, OBS-, Plugin-, Ei-, Arena-, Renderer- und Audio-Status. Behebe sichtbare Warnungen, bevor du live gehst.',
        expected: 'Das Live Center zeigt alle relevanten Broadcast-Zustände in einer Ansicht.',
        alt: 'Stream Monsters 1.5 Live Center mit Broadcast-Status'
      },
      en: {
        title: 'Check the Live Center and broadcast readiness',
        body: 'Open the Stream Monsters Creator and review TikTok, GCCE, OBS, plugin, egg, arena, renderer, and audio status. Resolve visible warnings before going live.',
        expected: 'The Live Center shows every relevant broadcast state in one view.',
        alt: 'Stream Monsters 1.5 Live Center with broadcast status'
      },
      es: {
        title: 'Comprueba Live Center y la preparación para emitir',
        body: 'Abre Stream Monsters Creator y revisa el estado de TikTok, GCCE, OBS, el plugin, los huevos, la arena, el renderizador y el audio. Resuelve los avisos visibles antes del directo.',
        expected: 'Live Center muestra todos los estados importantes de emisión en una sola vista.',
        alt: 'Live Center de Stream Monsters 1.5 con estado de emisión'
      },
      fr: {
        title: 'Vérifiez le Live Center et la préparation à la diffusion',
        body: 'Ouvrez le Creator Stream Monsters et vérifiez l’état de TikTok, GCCE, OBS, du plugin, des œufs, de l’arène, du rendu et de l’audio. Corrigez les avertissements visibles avant le direct.',
        expected: 'Le Live Center affiche tous les états de diffusion importants dans une seule vue.',
        alt: 'Live Center de Stream Monsters 1.5 avec état de diffusion'
      }
    }),
    readOnlyStep('automation-rule', '#gifts-chat', {
      de: {
        title: 'Gifts-only-Eier und Chat-Aliase einrichten',
        body: 'Wähle im vollständigen TikTok-Gift-Katalog ein Geschenk, ordne Spawn oder Boost und ein Element zu und prüfe die konfliktfreien Chat-Aliase. Ohne aktiviertes Gift entsteht kein Ei.',
        expected: 'Die Gifts-&-Chat-Ansicht zeigt aktive Gift-Mappings und die verfügbaren Ei-, Monster- und Battle-Kommandos.',
        alt: 'Stream Monsters 1.5 Gifts-only-Eier und Chat-Aliase'
      },
      en: {
        title: 'Set up gifts-only eggs and chat aliases',
        body: 'Choose a gift from the complete TikTok gift catalog, assign Spawn or Boost and an element, then review conflict-free chat aliases. No egg is created without an enabled gift.',
        expected: 'The Gifts & Chat view shows enabled gift mappings and the available egg, monster, and battle commands.',
        alt: 'Stream Monsters 1.5 gifts-only eggs and chat aliases'
      },
      es: {
        title: 'Configura huevos solo por regalos y alias de chat',
        body: 'Elige un regalo del catálogo completo de TikTok, asigna Spawn o Boost y un elemento, y revisa los alias de chat sin conflictos. Sin un regalo activado no se crea ningún huevo.',
        expected: 'La vista Gifts & Chat muestra los mapeos activos y los comandos de huevos, monstruos y combate disponibles.',
        alt: 'Huevos solo por regalos y alias de chat en Stream Monsters 1.5'
      },
      fr: {
        title: 'Configurez les œufs par cadeaux et les alias du chat',
        body: 'Choisissez un cadeau dans le catalogue TikTok complet, attribuez Spawn ou Boost et un élément, puis vérifiez les alias de chat sans conflit. Aucun œuf n’est créé sans cadeau activé.',
        expected: 'La vue Gifts & Chat affiche les mappages actifs et les commandes disponibles pour les œufs, monstres et combats.',
        alt: 'Œufs par cadeaux et alias de chat dans Stream Monsters 1.5'
      }
    }),
    readOnlyStep('action-chain', '#asset-library', {
      de: {
        title: '72 gebündelte Formen und Evolution kontrollieren',
        body: 'Prüfe 24 Vorlagen mit je drei verifizierten Furry-Stufen. Evolution II benötigt Meisterschaft 25 und 3 Essenz; Evolution III benötigt Meisterschaft 50 und insgesamt 8 Essenz. Die Evolution bleibt rein kosmetisch.',
        expected: 'Die Asset-Bibliothek bestätigt 72 gebündelte Formen und den Kenney-Notfall-Fallback.',
        alt: 'Stream Monsters 1.5 Asset-Bibliothek mit 72 Furry-Formen'
      },
      en: {
        title: 'Verify 72 bundled forms and evolution',
        body: 'Review 24 templates with three verified Furry stages each. Evolution II requires mastery 25 and 3 essence spent; Evolution III requires mastery 50 and 8 total essence spent. Evolution remains cosmetic only.',
        expected: 'The asset library confirms 72 bundled forms and the emergency Kenney fallback.',
        alt: 'Stream Monsters 1.5 asset library with 72 Furry forms'
      },
      es: {
        title: 'Comprueba las 72 formas incluidas y la evolución',
        body: 'Revisa 24 plantillas con tres etapas Furry verificadas cada una. Evolución II requiere maestría 25 y 3 de esencia gastada; Evolución III requiere maestría 50 y 8 de esencia total gastada. La evolución es solo cosmética.',
        expected: 'La biblioteca de recursos confirma 72 formas incluidas y el fallback de emergencia de Kenney.',
        alt: 'Biblioteca de Stream Monsters 1.5 con 72 formas Furry'
      },
      fr: {
        title: 'Vérifiez les 72 formes intégrées et l’évolution',
        body: 'Examinez 24 modèles avec trois stades Furry vérifiés chacun. L’évolution II exige la maîtrise 25 et 3 essences dépensées ; l’évolution III exige la maîtrise 50 et 8 essences dépensées au total. L’évolution reste purement cosmétique.',
        expected: 'La bibliothèque confirme 72 formes intégrées et le fallback d’urgence Kenney.',
        alt: 'Bibliothèque Stream Monsters 1.5 avec 72 formes Furry'
      }
    }),
    readOnlyStep('rule-dry-run', '#portraitStagePreview', {
      de: {
        title: 'Interaktive A/B/C-Arena im Portrait prüfen',
        body: 'Prüfe die 1080×1920-Vorschau mit zwei Kämpfern, HP, Spezialenergie und den Aktionen A, B und C. Die unteren 26 Prozent bleiben als TikTok-Chat-Safe-Zone frei.',
        expected: 'Die Portrait-Vorschau zeigt das interaktive A/B/C-Kampflayout und die reservierte Chat-Zone.',
        alt: 'Stream Monsters 1.5 Portrait-Arena mit A/B/C-Aktionen'
      },
      en: {
        title: 'Check the interactive A/B/C arena in portrait',
        body: 'Review the 1080×1920 preview with two fighters, HP, special energy, and the A, B, and C actions. The lower 26 percent remains reserved as the TikTok chat safe zone.',
        expected: 'The portrait preview shows the interactive A/B/C battle layout and reserved chat zone.',
        alt: 'Stream Monsters 1.5 portrait arena with A/B/C actions'
      },
      es: {
        title: 'Comprueba la arena interactiva A/B/C en vertical',
        body: 'Revisa la vista previa 1080×1920 con dos luchadores, HP, energía especial y las acciones A, B y C. El 26 por ciento inferior queda reservado como zona segura para el chat de TikTok.',
        expected: 'La vista vertical muestra el combate interactivo A/B/C y la zona de chat reservada.',
        alt: 'Arena vertical de Stream Monsters 1.5 con acciones A/B/C'
      },
      fr: {
        title: 'Vérifiez l’arène interactive A/B/C en portrait',
        body: 'Examinez l’aperçu 1080×1920 avec deux combattants, les PV, l’énergie spéciale et les actions A, B et C. Les 26 pour cent inférieurs restent réservés comme zone sûre pour le chat TikTok.',
        expected: 'L’aperçu portrait montre le combat interactif A/B/C et la zone de chat réservée.',
        alt: 'Arène portrait Stream Monsters 1.5 avec actions A/B/C'
      }
    }),
    readOnlyStep('alchemy-overlay', '#overlayUrl', {
      de: {
        title: 'Stream-Monsters-Overlay in OBS eintragen',
        body: 'Kopiere /streammonsters/overlay in eine OBS-Browserquelle. Wähle Portrait 1080×1920 oder Landscape 1920×1080 und prüfe Renderer-Qualität, Safe-Zone und die fünf Audio-Kanäle mit einer lokalen Demo.',
        expected: 'Die echte Overlay-URL und alle Broadcast-Vorschauen sind im Creator sichtbar.',
        alt: 'Stream Monsters 1.5 OBS-Overlay-URL und Portrait-Vorschau'
      },
      en: {
        title: 'Add the Stream Monsters overlay to OBS',
        body: 'Copy /streammonsters/overlay into an OBS browser source. Choose portrait 1080×1920 or landscape 1920×1080, then review renderer quality, safe zones, and the five audio channels with a local demo.',
        expected: 'The real overlay URL and every broadcast preview are visible in the Creator.',
        alt: 'Stream Monsters 1.5 OBS overlay URL and portrait preview'
      },
      es: {
        title: 'Añade el overlay de Stream Monsters a OBS',
        body: 'Copia /streammonsters/overlay en una fuente de navegador de OBS. Elige vertical 1080×1920 u horizontal 1920×1080 y comprueba la calidad del renderizador, las zonas seguras y los cinco canales de audio con una demo local.',
        expected: 'La URL real del overlay y todas las vistas de emisión son visibles en Creator.',
        alt: 'URL del overlay OBS y vista vertical de Stream Monsters 1.5'
      },
      fr: {
        title: 'Ajoutez l’overlay Stream Monsters à OBS',
        body: 'Copiez /streammonsters/overlay dans une source navigateur OBS. Choisissez le portrait 1080×1920 ou le paysage 1920×1080, puis vérifiez la qualité du rendu, les zones sûres et les cinq canaux audio avec une démo locale.',
        expected: 'L’URL réelle de l’overlay et tous les aperçus de diffusion sont visibles dans le Creator.',
        alt: 'URL de l’overlay OBS et aperçu portrait de Stream Monsters 1.5'
      }
    }),
    readOnlyStep('rule-reset', '#community-seasons', {
      de: {
        title: 'Permanenten Fortschritt schützen',
        body: 'Prüfe Sammlung, Arena Rating, Collector Score und Saison-Countdown nur lesend. Sammlung, Evolution, Level und Statpunkte bleiben saisonübergreifend permanent; die Doku-Prüfung setzt keine Zuschauerdaten zurück.',
        expected: 'Die Community-Ansicht trennt saisonale Ranglisten vom permanenten Monster-Fortschritt.',
        alt: 'Stream Monsters 1.5 Community- und Saisonansicht'
      },
      en: {
        title: 'Protect permanent progression',
        body: 'Review collections, Arena Rating, Collector Score, and the season countdown without changing them. Collections, evolution, levels, and stat points remain permanent across seasons; the documentation check resets no viewer data.',
        expected: 'The community view separates seasonal leaderboards from permanent monster progression.',
        alt: 'Stream Monsters 1.5 community and season view'
      },
      es: {
        title: 'Protege el progreso permanente',
        body: 'Revisa las colecciones, Arena Rating, Collector Score y la cuenta atrás de temporada sin modificarlos. Colección, evolución, niveles y puntos de estadísticas permanecen entre temporadas; la comprobación de documentación no reinicia datos.',
        expected: 'La vista de comunidad separa las clasificaciones de temporada del progreso permanente de los monstruos.',
        alt: 'Vista de comunidad y temporadas de Stream Monsters 1.5'
      },
      fr: {
        title: 'Protégez la progression permanente',
        body: 'Consultez les collections, l’Arena Rating, le Collector Score et le compte à rebours de saison sans les modifier. Collection, évolution, niveaux et points de statistiques restent permanents entre les saisons ; la vérification de documentation ne réinitialise aucune donnée.',
        expected: 'La vue Communauté sépare les classements saisonniers de la progression permanente des monstres.',
        alt: 'Vue Communauté et saisons de Stream Monsters 1.5'
      }
    })
  ]
});
