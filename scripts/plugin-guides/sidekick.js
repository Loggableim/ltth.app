'use strict';

// Sidekick is still an independent plugin. Its guide covers the local
// configuration surface and does not trigger avatar, speech, or LIVE actions.
module.exports = Object.freeze({
  id: 'sidekick',
  route: '/plugins/sidekick/ui.html',
  topic: {
    de: 'Status und lokale Avatar-Verbindung',
    en: 'status and local avatar connection',
    es: 'estado y conexión local del avatar',
    fr: 'état et connexion locale de l’avatar'
  },
  test: {
    de: 'die lokale Statusansicht',
    en: 'the local status view',
    es: 'la vista de estado local',
    fr: 'la vue d’état locale'
  },
  expected: {
    de: 'die Statusansicht ist sichtbar, ohne Avatar oder LIVE-Dienst zu verbinden',
    en: 'the status view is visible without connecting an avatar or LIVE service',
    es: 'la vista de estado está visible sin conectar un avatar ni un servicio LIVE',
    fr: 'la vue d’état est visible sans connecter d’avatar ni de service LIVE'
  },
  requirement: 'local',
  safety: 'local',
  mode: 'ui',
  overlay: null,
  related: ['animazingpal'],
  copy: {
    de: {
      title: 'Sidekick',
      summary: 'Sidekick zeigt Status und lokale Avatar-Verbindung in einer sicheren lokalen Prüfung.',
      firstResult: 'die Statusansicht ist sichtbar, ohne Avatar oder LIVE-Dienst zu verbinden',
      requirements: 'LTTH Dashboard; für diesen Prüfschritt ist keine Avatar- oder TikTok-Verbindung erforderlich.',
      safety: 'Verbinde keinen Avatar und löse keine Sprache, Geschenke oder LIVE-Ereignisse aus. Dieser Ablauf öffnet nur die lokale Statusansicht.',
      troubleshooting: 'Wenn die lokale Statusansicht nicht erscheint, prüfe zuerst Pluginstatus und lokale Route.',
      related: ['animazingpal']
    },
    en: {
      title: 'Sidekick',
      summary: 'Sidekick presents status and the local avatar connection in a safe local check.',
      firstResult: 'the status view is visible without connecting an avatar or LIVE service',
      requirements: 'LTTH Dashboard; this check does not require an avatar or TikTok connection.',
      safety: 'Do not connect an avatar or trigger speech, gifts, or LIVE events. This workflow only opens the local status view.',
      troubleshooting: 'If the local status view does not appear, first check the plugin status and local route.',
      related: ['animazingpal']
    },
    es: {
      title: 'Sidekick',
      summary: 'Sidekick presenta el estado y la conexión local del avatar mediante una comprobación local segura.',
      firstResult: 'la vista de estado está visible sin conectar un avatar ni un servicio LIVE',
      requirements: 'Panel de LTTH; esta comprobación no requiere conexión con un avatar ni con TikTok.',
      safety: 'No conectes un avatar ni actives voz, regalos o eventos LIVE. Este flujo solo abre la vista de estado local.',
      troubleshooting: 'Si no aparece la vista de estado local, comprueba primero el estado del plugin y la ruta local.',
      related: ['animazingpal']
    },
    fr: {
      title: 'Sidekick',
      summary: 'Sidekick présente l’état et la connexion locale de l’avatar lors d’un contrôle local sans risque.',
      firstResult: 'la vue d’état est visible sans connecter d’avatar ni de service LIVE',
      requirements: 'Tableau de bord LTTH ; ce contrôle ne nécessite aucune connexion à un avatar ni à TikTok.',
      safety: 'Ne connectez aucun avatar et ne déclenchez ni parole, ni cadeau, ni événement LIVE. Ce parcours ouvre uniquement la vue d’état locale.',
      troubleshooting: 'Si la vue d’état locale ne s’affiche pas, vérifiez d’abord l’état du plugin et la route locale.',
      related: ['animazingpal']
    }
  },
  steps: [
    {
      id: 'status-view',
      copy: {
        de: {
          title: 'Lokale Statusansicht öffnen',
          body: 'Öffne Sidekicks Statusregisterkarte. Dieser Schritt baut weder eine Avatar- noch eine LIVE-Verbindung auf und löst kein Sidekick-Ereignis aus.',
          expected: 'Die Statusregisterkarte ist sichtbar; Avatar- und LIVE-Verbindungen bleiben unangetastet.',
          alt: 'Lokale Sidekick-Statusansicht'
        },
        en: {
          title: 'Open the local status view',
          body: 'Open Sidekick’s Status tab. This step establishes no avatar or LIVE-service connection and triggers no Sidekick event.',
          expected: 'The Status tab is visible; avatar and LIVE connections remain untouched.',
          alt: 'Local Sidekick status view'
        },
        es: {
          title: 'Abre la vista de estado local',
          body: 'Abre la pestaña Estado de Sidekick. Este paso no establece conexión con un avatar ni con un servicio LIVE y no activa ningún evento de Sidekick.',
          expected: 'La pestaña Estado está visible; las conexiones del avatar y de LIVE no se modifican.',
          alt: 'Vista de estado local de Sidekick'
        },
        fr: {
          title: 'Ouvrir la vue d’état locale',
          body: 'Ouvrez l’onglet État de Sidekick. Cette étape n’établit aucune connexion avec un avatar ou un service LIVE et ne déclenche aucun événement Sidekick.',
          expected: 'L’onglet État est visible ; les connexions de l’avatar et LIVE restent inchangées.',
          alt: 'Vue d’état locale de Sidekick'
        }
      },
      capture: {
        route: '/plugins/sidekick/ui.html',
        assertVisible: '#tab-status',
        focusText: {
          de: 'Lokale Statusansicht öffnen',
          en: 'Open the local status view',
          es: 'Abre la vista de estado local',
          fr: 'Ouvrir la vue d’état locale'
        },
        action: { type: 'open-plugin-surface', stepId: 'status-view' },
        expected: {
          de: 'Die Statusregisterkarte ist sichtbar; Avatar- und LIVE-Verbindungen bleiben unangetastet.',
          en: 'The Status tab is visible; avatar and LIVE connections remain untouched.',
          es: 'La pestaña Estado está visible; las conexiones del avatar y de LIVE no se modifican.',
          fr: 'L’onglet État est visible ; les connexions de l’avatar et LIVE restent inchangées.'
        }
      },
      workflow: {
        route: '/plugins/sidekick/ui.html',
        instructions: {
          de: { title: 'Lokale Statusansicht öffnen', body: 'Öffne Sidekicks Statusregisterkarte. Dieser Schritt baut weder eine Avatar- noch eine LIVE-Verbindung auf und löst kein Sidekick-Ereignis aus.', expected: 'Die Statusregisterkarte ist sichtbar; Avatar- und LIVE-Verbindungen bleiben unangetastet.' },
          en: { title: 'Open the local status view', body: 'Open Sidekick’s Status tab. This step establishes no avatar or LIVE-service connection and triggers no Sidekick event.', expected: 'The Status tab is visible; avatar and LIVE connections remain untouched.' },
          es: { title: 'Abre la vista de estado local', body: 'Abre la pestaña Estado de Sidekick. Este paso no establece conexión con un avatar ni con un servicio LIVE y no activa ningún evento de Sidekick.', expected: 'La pestaña Estado está visible; las conexiones del avatar y de LIVE no se modifican.' },
          fr: { title: 'Ouvrir la vue d’état locale', body: 'Ouvrez l’onglet État de Sidekick. Cette étape n’établit aucune connexion avec un avatar ou un service LIVE et ne déclenche aucun événement Sidekick.', expected: 'L’onglet État est visible ; les connexions de l’avatar et LIVE restent inchangées.' }
        },
        operations: [
          { type: 'goto', route: '/plugins/sidekick/ui.html' },
          { type: 'open-plugin-surface', selector: '#tab-status' }
        ],
        postconditions: [
          { type: 'http-status', expected: 200 },
          { type: 'url', expected: { path: '/plugins/sidekick/ui.html', query: { lang: '$locale' }, exactQuery: true } },
          { type: 'visible', selector: '#tab-status' },
          { type: 'console', expected: 'no-errors' }
        ],
        captureRule: {
          selector: '#tab-status',
          viewport: { width: 1440, height: 900 },
          imageCrop: { width: 1400, height: 620 },
          stateChange: false
        }
      }
    }
  ]
});
