'use strict';

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
module.exports = Object.freeze({
  "id": "milestone-leaderboard",
  "route": "/plugins/milestone-leaderboard/vendor/gift-milestone/ui.html",
  "topic": {
    "de": "XP-Regeln, Meilenstein und Ranglistenanzeige",
    "en": "XP rules, milestone, and leaderboard display",
    "es": "reglas de XP, hito y visualización de clasificación",
    "fr": "règles XP, jalon et affichage du classement"
  },
  "test": {
    "de": "einen lokalen XP-Impuls",
    "en": "a local XP pulse",
    "es": "un impulso de XP local",
    "fr": "une impulsion XP locale"
  },
  "expected": {
    "de": "ein Demonutzer erscheint in der Ranglisten-Vorschau",
    "en": "a demo user appears in the leaderboard preview",
    "es": "un usuario demo aparece en la vista previa de clasificación",
    "fr": "un utilisateur démo apparaît dans l’aperçu du classement"
  },
  "requirement": "obs",
  "safety": "obs",
  "mode": "ui",
  "overlay": "/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/leaderboard.html",
  "related": [
    "goals",
    "toptier"
  ],
  "copy": {
    "de": {
      "title": "Viewer XP",
      "summary": "Viewer XP richtet XP-Regeln, Meilenstein und Ranglistenanzeige ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "ein Demonutzer erscheint in der Ranglisten-Vorschau",
      "requirements": "LTTH Dashboard; für die Ausgabe zusätzlich eine OBS-Testszene. Dieser konkrete Viewer XP-Ablauf behandelt XP-Regeln, Meilenstein und Ranglistenanzeige.",
      "safety": "Nutze eine nicht gesendete OBS-Testszene; LIVE-Ausgaben bleiben deaktiviert. Dieser konkrete Viewer XP-Ablauf behandelt XP-Regeln, Meilenstein und Ranglistenanzeige.",
      "troubleshooting": "Wenn XP-Regeln, Meilenstein und Ranglistenanzeige nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "goals",
        "toptier"
      ]
    },
    "en": {
      "title": "Viewer XP",
      "summary": "Viewer XP configures XP rules, milestone, and leaderboard display with a safe local check instead of a LIVE trigger.",
      "firstResult": "a demo user appears in the leaderboard preview",
      "requirements": "LTTH Dashboard; use an OBS test scene for output. This Viewer XP workflow specifically covers XP rules, milestone, and leaderboard display.",
      "safety": "Use an OBS test scene that is not live; LIVE output remains disabled. This Viewer XP workflow specifically covers XP rules, milestone, and leaderboard display.",
      "troubleshooting": "If XP rules, milestone, and leaderboard display is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "goals",
        "toptier"
      ]
    },
    "es": {
      "title": "Viewer XP",
      "summary": "Viewer XP configura reglas de XP, hito y visualización de clasificación mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "un usuario demo aparece en la vista previa de clasificación",
      "requirements": "El panel de LTTH y una escena de prueba de OBS para la salida. Este flujo concreto de Viewer XP trata reglas de XP, hito y visualización de clasificación.",
      "safety": "Usa una escena de prueba de OBS que no esté al aire; la salida LIVE permanece desactivada. Este flujo concreto de Viewer XP trata reglas de XP, hito y visualización de clasificación.",
      "troubleshooting": "Si reglas de XP, hito y visualización de clasificación no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "goals",
        "toptier"
      ]
    },
    "fr": {
      "title": "Viewer XP",
      "summary": "Viewer XP configure règles XP, jalon et affichage du classement avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "un utilisateur démo apparaît dans l’aperçu du classement",
      "requirements": "Le tableau de bord LTTH et une scène de test OBS pour la sortie. Ce flux spécifique de Viewer XP couvre règles XP, jalon et affichage du classement.",
      "safety": "Utilisez une scène de test OBS non diffusée ; la sortie LIVE reste désactivée. Ce flux spécifique de Viewer XP couvre règles XP, jalon et affichage du classement.",
      "troubleshooting": "Si règles XP, jalon et affichage du classement n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "goals",
        "toptier"
      ]
    }
  },
  "steps": [
    {
      "id": "xp-card",
      "copy": {
        "de": {
          "title": "XP Card im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich XP Card von XP-Regeln, Meilenstein und Ranglistenanzeige. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "alt": "XP Card im Testprofil konfigurieren - XP-Regeln, Meilenstein und Ranglistenanzeige"
        },
        "en": {
          "title": "Configure XP Card in the test profile",
          "body": "Work in the visible XP Card area of XP rules, milestone, and leaderboard display. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The relevant plugin surface is visibly identified.",
          "alt": "Configure XP Card in the test profile - XP rules, milestone, and leaderboard display"
        },
        "es": {
          "title": "Configura XP Card en el perfil de prueba",
          "body": "Trabaja en el area visible XP Card de reglas de XP, hito y visualización de clasificación. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La superficie correspondiente del plugin queda identificada.",
          "alt": "Configura XP Card en el perfil de prueba - reglas de XP, hito y visualización de clasificación"
        },
        "fr": {
          "title": "Configurez XP Card dans le profil de test",
          "body": "Travaillez dans la zone visible XP Card de règles XP, jalon et affichage du classement. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La surface de plugin correspondante est clairement visible.",
          "alt": "Configurez XP Card dans le profil de test - règles XP, jalon et affichage du classement"
        }
      },
      "capture": {
        "route": "/plugins/milestone-leaderboard/vendor/gift-milestone/ui.html",
        "assertVisible": "#tiersList",
        "focusText": {
          "de": "XP Card im Testprofil konfigurieren",
          "en": "Configure XP Card in the test profile",
          "es": "Configura XP Card en el perfil de prueba",
          "fr": "Configurez XP Card dans le profil de test"
        },
        "action": {
          "type": "open-plugin-surface",
          "stepId": "xp-card"
        },
        "expected": {
          "de": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "en": "The relevant plugin surface is visibly identified.",
          "es": "La superficie correspondiente del plugin queda identificada.",
          "fr": "La surface de plugin correspondante est clairement visible."
        }
      },
      "workflow": {
        "route": "/plugins/milestone-leaderboard/vendor/gift-milestone/ui.html",
        "instructions": {
          "de": {
            "title": "XP Card im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich XP Card von XP-Regeln, Meilenstein und Ranglistenanzeige. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar."
          },
          "en": {
            "title": "Configure XP Card in the test profile",
            "body": "Work in the visible XP Card area of XP rules, milestone, and leaderboard display. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The relevant plugin surface is visibly identified."
          },
          "es": {
            "title": "Configura XP Card en el perfil de prueba",
            "body": "Trabaja en el area visible XP Card de reglas de XP, hito y visualización de clasificación. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La superficie correspondiente del plugin queda identificada."
          },
          "fr": {
            "title": "Configurez XP Card dans le profil de test",
            "body": "Travaillez dans la zone visible XP Card de règles XP, jalon et affichage du classement. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La surface de plugin correspondante est clairement visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/milestone-leaderboard/vendor/gift-milestone/ui.html"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#tiersList"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/milestone-leaderboard/vendor/gift-milestone/ui.html"
          },
          {
            "type": "visible",
            "selector": "#tiersList"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#tiersList",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "xp-rule",
      "copy": {
        "de": {
          "title": "XP Rule im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich XP Rule von XP-Regeln, Meilenstein und Ranglistenanzeige. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "XP Rule im Testprofil konfigurieren - XP-Regeln, Meilenstein und Ranglistenanzeige"
        },
        "en": {
          "title": "Configure XP Rule in the test profile",
          "body": "Work in the visible XP Rule area of XP rules, milestone, and leaderboard display. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure XP Rule in the test profile - XP rules, milestone, and leaderboard display"
        },
        "es": {
          "title": "Configura XP Rule en el perfil de prueba",
          "body": "Trabaja en el area visible XP Rule de reglas de XP, hito y visualización de clasificación. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura XP Rule en el perfil de prueba - reglas de XP, hito y visualización de clasificación"
        },
        "fr": {
          "title": "Configurez XP Rule dans le profil de test",
          "body": "Travaillez dans la zone visible XP Rule de règles XP, jalon et affichage du classement. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez XP Rule dans le profil de test - règles XP, jalon et affichage du classement"
        }
      },
      "capture": {
        "route": "/plugins/milestone-leaderboard/vendor/gift-milestone/ui.html",
        "assertVisible": "#tierThreshold",
        "focusText": {
          "de": "XP Rule im Testprofil konfigurieren",
          "en": "Configure XP Rule in the test profile",
          "es": "Configura XP Rule en el perfil de prueba",
          "fr": "Configurez XP Rule dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "prepare": "open-milestone-tier-modal",
          "stepId": "xp-rule"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/milestone-leaderboard/vendor/gift-milestone/ui.html",
        "instructions": {
          "de": {
            "title": "XP Rule im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich XP Rule von XP-Regeln, Meilenstein und Ranglistenanzeige. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure XP Rule in the test profile",
            "body": "Work in the visible XP Rule area of XP rules, milestone, and leaderboard display. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura XP Rule en el perfil de prueba",
            "body": "Trabaja en el area visible XP Rule de reglas de XP, hito y visualización de clasificación. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez XP Rule dans le profil de test",
            "body": "Travaillez dans la zone visible XP Rule de règles XP, jalon et affichage du classement. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/milestone-leaderboard/vendor/gift-milestone/ui.html"
          },
          {
            "type": "prepare",
            "name": "open-milestone-tier-modal"
          },
          {
            "type": "set-demo-value",
            "selector": "#tierThreshold"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/milestone-leaderboard/vendor/gift-milestone/ui.html"
          },
          {
            "type": "visible",
            "selector": "#tierThreshold"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#tierThreshold",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "milestone",
      "copy": {
        "de": {
          "title": "Milestone im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Milestone von XP-Regeln, Meilenstein und Ranglistenanzeige. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Milestone im Testprofil konfigurieren - XP-Regeln, Meilenstein und Ranglistenanzeige"
        },
        "en": {
          "title": "Configure Milestone in the test profile",
          "body": "Work in the visible Milestone area of XP rules, milestone, and leaderboard display. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Milestone in the test profile - XP rules, milestone, and leaderboard display"
        },
        "es": {
          "title": "Configura Milestone en el perfil de prueba",
          "body": "Trabaja en el area visible Milestone de reglas de XP, hito y visualización de clasificación. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Milestone en el perfil de prueba - reglas de XP, hito y visualización de clasificación"
        },
        "fr": {
          "title": "Configurez Milestone dans le profil de test",
          "body": "Travaillez dans la zone visible Milestone de règles XP, jalon et affichage du classement. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Milestone dans le profil de test - règles XP, jalon et affichage du classement"
        }
      },
      "capture": {
        "route": "/plugins/milestone-leaderboard/vendor/gift-milestone/ui.html",
        "assertVisible": "#tierName",
        "focusText": {
          "de": "Milestone im Testprofil konfigurieren",
          "en": "Configure Milestone in the test profile",
          "es": "Configura Milestone en el perfil de prueba",
          "fr": "Configurez Milestone dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "prepare": "open-milestone-tier-modal",
          "stepId": "milestone"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/milestone-leaderboard/vendor/gift-milestone/ui.html",
        "instructions": {
          "de": {
            "title": "Milestone im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Milestone von XP-Regeln, Meilenstein und Ranglistenanzeige. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Milestone in the test profile",
            "body": "Work in the visible Milestone area of XP rules, milestone, and leaderboard display. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Milestone en el perfil de prueba",
            "body": "Trabaja en el area visible Milestone de reglas de XP, hito y visualización de clasificación. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Milestone dans le profil de test",
            "body": "Travaillez dans la zone visible Milestone de règles XP, jalon et affichage du classement. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/milestone-leaderboard/vendor/gift-milestone/ui.html"
          },
          {
            "type": "prepare",
            "name": "open-milestone-tier-modal"
          },
          {
            "type": "set-demo-value",
            "selector": "#tierName"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/milestone-leaderboard/vendor/gift-milestone/ui.html"
          },
          {
            "type": "visible",
            "selector": "#tierName"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#tierName",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "xp-pulse",
      "copy": {
        "de": {
          "title": "XP Pulse lokal testen",
          "body": "Fuehre XP Pulse nur mit einen lokalen XP-Impuls im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
          "expected": "ein Demonutzer erscheint in der Ranglisten-Vorschau",
          "alt": "XP Pulse lokal testen - XP-Regeln, Meilenstein und Ranglistenanzeige"
        },
        "en": {
          "title": "Test XP Pulse locally",
          "body": "Run XP Pulse only with a local XP pulse in the isolated test profile; no LIVE source, hardware, or external connection is used.",
          "expected": "a demo user appears in the leaderboard preview",
          "alt": "Test XP Pulse locally - XP rules, milestone, and leaderboard display"
        },
        "es": {
          "title": "Prueba XP Pulse localmente",
          "body": "Ejecuta XP Pulse solo con un impulso de XP local en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
          "expected": "un usuario demo aparece en la vista previa de clasificación",
          "alt": "Prueba XP Pulse localmente - reglas de XP, hito y visualización de clasificación"
        },
        "fr": {
          "title": "Testez XP Pulse localement",
          "body": "Executez XP Pulse uniquement avec une impulsion XP locale dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
          "expected": "un utilisateur démo apparaît dans l’aperçu du classement",
          "alt": "Testez XP Pulse localement - règles XP, jalon et affichage du classement"
        }
      },
      "capture": {
        "route": "/plugins/milestone-leaderboard/vendor/gift-milestone/ui.html",
        "assertVisible": "#testButton",
        "focusText": {
          "de": "XP Pulse lokal testen",
          "en": "Test XP Pulse locally",
          "es": "Prueba XP Pulse localmente",
          "fr": "Testez XP Pulse localement"
        },
        "action": {
          "type": "run-local-preview",
          "stepId": "xp-pulse"
        },
        "expected": {
          "de": "ein Demonutzer erscheint in der Ranglisten-Vorschau",
          "en": "a demo user appears in the leaderboard preview",
          "es": "un usuario demo aparece en la vista previa de clasificación",
          "fr": "un utilisateur démo apparaît dans l’aperçu du classement"
        }
      },
      "workflow": {
        "route": "/plugins/milestone-leaderboard/vendor/gift-milestone/ui.html",
        "instructions": {
          "de": {
            "title": "XP Pulse lokal testen",
            "body": "Fuehre XP Pulse nur mit einen lokalen XP-Impuls im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
            "expected": "ein Demonutzer erscheint in der Ranglisten-Vorschau"
          },
          "en": {
            "title": "Test XP Pulse locally",
            "body": "Run XP Pulse only with a local XP pulse in the isolated test profile; no LIVE source, hardware, or external connection is used.",
            "expected": "a demo user appears in the leaderboard preview"
          },
          "es": {
            "title": "Prueba XP Pulse localmente",
            "body": "Ejecuta XP Pulse solo con un impulso de XP local en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
            "expected": "un usuario demo aparece en la vista previa de clasificación"
          },
          "fr": {
            "title": "Testez XP Pulse localement",
            "body": "Executez XP Pulse uniquement avec une impulsion XP locale dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
            "expected": "un utilisateur démo apparaît dans l’aperçu du classement"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/milestone-leaderboard/vendor/gift-milestone/ui.html"
          },
          {
            "type": "run-local-preview",
            "selector": "#testButton"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/milestone-leaderboard/vendor/gift-milestone/ui.html"
          },
          {
            "type": "visible",
            "selector": "#testButton"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#testButton",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "leaderboard-overlay",
      "copy": {
        "de": {
          "title": "Leaderboard Overlay als Overlay-Vorschau oeffnen",
          "body": "Oeffne die echte Leaderboard Overlay-Oberflaeche nur in einer nicht sendenden OBS-Testszene. Ohne lokales Testereignis kann sie leer oder transparent bleiben; es werden keine Demo-Inhalte eingefuegt.",
          "expected": "ein Demonutzer erscheint in der Ranglisten-Vorschau",
          "alt": "Leaderboard Overlay als Overlay-Vorschau oeffnen - XP-Regeln, Meilenstein und Ranglistenanzeige"
        },
        "en": {
          "title": "Open Leaderboard Overlay as an overlay preview",
          "body": "Open the real Leaderboard Overlay surface only in an OBS test scene that is not live. Without a local test event, it can remain empty or transparent; no demo content is inserted.",
          "expected": "a demo user appears in the leaderboard preview",
          "alt": "Open Leaderboard Overlay as an overlay preview - XP rules, milestone, and leaderboard display"
        },
        "es": {
          "title": "Abre Leaderboard Overlay como vista previa de overlay",
          "body": "Abre la superficie real Leaderboard Overlay solo en una escena de prueba de OBS que no esta al aire. Sin un evento local de prueba, puede quedar vacia o transparente; no se inserta contenido demo.",
          "expected": "un usuario demo aparece en la vista previa de clasificación",
          "alt": "Abre Leaderboard Overlay como vista previa de overlay - reglas de XP, hito y visualización de clasificación"
        },
        "fr": {
          "title": "Ouvrez Leaderboard Overlay comme apercu overlay",
          "body": "Ouvrez la vraie surface Leaderboard Overlay uniquement dans une scene de test OBS non diffusee. Sans evenement de test local, elle peut rester vide ou transparente ; aucun contenu de demonstration nest insere.",
          "expected": "un utilisateur démo apparaît dans l’aperçu du classement",
          "alt": "Ouvrez Leaderboard Overlay comme apercu overlay - règles XP, jalon et affichage du classement"
        }
      },
      "capture": {
        "route": "/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/leaderboard.html",
        "assertVisible": "#leaderboardList",
        "focusText": {
          "de": "Leaderboard Overlay als Overlay-Vorschau oeffnen",
          "en": "Open Leaderboard Overlay as an overlay preview",
          "es": "Abre Leaderboard Overlay como vista previa de overlay",
          "fr": "Ouvrez Leaderboard Overlay comme apercu overlay"
        },
        "action": {
          "type": "open-overlay-preview",
          "stepId": "leaderboard-overlay"
        },
        "expected": {
          "de": "ein Demonutzer erscheint in der Ranglisten-Vorschau",
          "en": "a demo user appears in the leaderboard preview",
          "es": "un usuario demo aparece en la vista previa de clasificación",
          "fr": "un utilisateur démo apparaît dans l’aperçu du classement"
        }
      },
      "workflow": {
        "route": "/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/leaderboard.html",
        "instructions": {
          "de": {
            "title": "Leaderboard Overlay als Overlay-Vorschau oeffnen",
            "body": "Oeffne die echte Leaderboard Overlay-Oberflaeche nur in einer nicht sendenden OBS-Testszene. Ohne lokales Testereignis kann sie leer oder transparent bleiben; es werden keine Demo-Inhalte eingefuegt.",
            "expected": "ein Demonutzer erscheint in der Ranglisten-Vorschau"
          },
          "en": {
            "title": "Open Leaderboard Overlay as an overlay preview",
            "body": "Open the real Leaderboard Overlay surface only in an OBS test scene that is not live. Without a local test event, it can remain empty or transparent; no demo content is inserted.",
            "expected": "a demo user appears in the leaderboard preview"
          },
          "es": {
            "title": "Abre Leaderboard Overlay como vista previa de overlay",
            "body": "Abre la superficie real Leaderboard Overlay solo en una escena de prueba de OBS que no esta al aire. Sin un evento local de prueba, puede quedar vacia o transparente; no se inserta contenido demo.",
            "expected": "un usuario demo aparece en la vista previa de clasificación"
          },
          "fr": {
            "title": "Ouvrez Leaderboard Overlay comme apercu overlay",
            "body": "Ouvrez la vraie surface Leaderboard Overlay uniquement dans une scene de test OBS non diffusee. Sans evenement de test local, elle peut rester vide ou transparente ; aucun contenu de demonstration nest insere.",
            "expected": "un utilisateur démo apparaît dans l’aperçu du classement"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/leaderboard.html"
          },
          {
            "type": "open-overlay-preview",
            "selector": "#leaderboardList"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/leaderboard.html"
          },
          {
            "type": "visible",
            "selector": "#leaderboardList"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#leaderboardList",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "xp-reset",
      "copy": {
        "de": {
          "title": "XP Reset sicher zuruecksetzen",
          "body": "Entferne nur die Demo-Werte fuer XP Reset, bevor du XP-Regeln, Meilenstein und Ranglistenanzeige produktiv vorbereitest.",
          "expected": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "alt": "XP Reset sicher zuruecksetzen - XP-Regeln, Meilenstein und Ranglistenanzeige"
        },
        "en": {
          "title": "Reset XP Reset safely",
          "body": "Remove only the demo values for XP Reset before preparing XP rules, milestone, and leaderboard display for production.",
          "expected": "The test profile remains free of production impact.",
          "alt": "Reset XP Reset safely - XP rules, milestone, and leaderboard display"
        },
        "es": {
          "title": "Restablece XP Reset con seguridad",
          "body": "Elimina solo los valores demo de XP Reset antes de preparar reglas de XP, hito y visualización de clasificación para produccion.",
          "expected": "El perfil de prueba permanece sin impacto de producción.",
          "alt": "Restablece XP Reset con seguridad - reglas de XP, hito y visualización de clasificación"
        },
        "fr": {
          "title": "Reinitialisez XP Reset en securite",
          "body": "Supprimez uniquement les valeurs demo de XP Reset avant de preparer règles XP, jalon et affichage du classement pour la production.",
          "expected": "Le profil de test reste sans impact de production.",
          "alt": "Reinitialisez XP Reset en securite - règles XP, jalon et affichage du classement"
        }
      },
      "capture": {
        "route": "/plugins/milestone-leaderboard/vendor/gift-milestone/ui.html",
        "assertVisible": "#resetAllUsersButton",
        "focusText": {
          "de": "XP Reset sicher zuruecksetzen",
          "en": "Reset XP Reset safely",
          "es": "Restablece XP Reset con seguridad",
          "fr": "Reinitialisez XP Reset en securite"
        },
        "action": {
          "type": "reset-demo-state",
          "stepId": "xp-reset"
        },
        "expected": {
          "de": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "en": "The test profile remains free of production impact.",
          "es": "El perfil de prueba permanece sin impacto de producción.",
          "fr": "Le profil de test reste sans impact de production."
        }
      },
      "workflow": {
        "route": "/plugins/milestone-leaderboard/vendor/gift-milestone/ui.html",
        "instructions": {
          "de": {
            "title": "XP Reset sicher zuruecksetzen",
            "body": "Entferne nur die Demo-Werte fuer XP Reset, bevor du XP-Regeln, Meilenstein und Ranglistenanzeige produktiv vorbereitest.",
            "expected": "Das Testprofil bleibt ohne produktive Auswirkung."
          },
          "en": {
            "title": "Reset XP Reset safely",
            "body": "Remove only the demo values for XP Reset before preparing XP rules, milestone, and leaderboard display for production.",
            "expected": "The test profile remains free of production impact."
          },
          "es": {
            "title": "Restablece XP Reset con seguridad",
            "body": "Elimina solo los valores demo de XP Reset antes de preparar reglas de XP, hito y visualización de clasificación para produccion.",
            "expected": "El perfil de prueba permanece sin impacto de producción."
          },
          "fr": {
            "title": "Reinitialisez XP Reset en securite",
            "body": "Supprimez uniquement les valeurs demo de XP Reset avant de preparer règles XP, jalon et affichage du classement pour la production.",
            "expected": "Le profil de test reste sans impact de production."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/milestone-leaderboard/vendor/gift-milestone/ui.html"
          },
          {
            "type": "reset-demo-state",
            "selector": "#resetAllUsersButton"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/milestone-leaderboard/vendor/gift-milestone/ui.html"
          },
          {
            "type": "visible",
            "selector": "#resetAllUsersButton"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#resetAllUsersButton",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    }
  ]
});
