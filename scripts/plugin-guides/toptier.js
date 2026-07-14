'use strict';

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
module.exports = Object.freeze({
  "id": "toptier",
  "route": "/plugins/toptier/ui.html",
  "topic": {
    "de": "Ranking-Regel, Schwelle und Anzeigestil",
    "en": "ranking rule, threshold, and display style",
    "es": "regla de ranking, umbral y estilo de visualización",
    "fr": "règle de classement, seuil et style d’affichage"
  },
  "test": {
    "de": "einen lokalen Ranglistenwert",
    "en": "a local leaderboard value",
    "es": "un valor de clasificación local",
    "fr": "une valeur de classement locale"
  },
  "expected": {
    "de": "die Top-Tier-Karte zeigt den Demo-Rang in der Vorschau",
    "en": "the Top Tier card shows the demo rank in preview",
    "es": "la tarjeta Top Tier muestra el rango demo en la vista previa",
    "fr": "la carte Top Tier affiche le rang démo dans l’aperçu"
  },
  "requirement": "obs",
  "safety": "obs",
  "mode": "ui",
  "overlay": "/plugins/toptier/overlay.html",
  "related": [
    "milestone-leaderboard",
    "spotlight"
  ],
  "copy": {
    "de": {
      "title": "Top Tier",
      "summary": "Top Tier richtet Ranking-Regel, Schwelle und Anzeigestil ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "die Top-Tier-Karte zeigt den Demo-Rang in der Vorschau",
      "requirements": "LTTH Dashboard; für die Ausgabe zusätzlich eine OBS-Testszene. Dieser konkrete Top Tier-Ablauf behandelt Ranking-Regel, Schwelle und Anzeigestil.",
      "safety": "Nutze eine nicht gesendete OBS-Testszene; LIVE-Ausgaben bleiben deaktiviert. Dieser konkrete Top Tier-Ablauf behandelt Ranking-Regel, Schwelle und Anzeigestil.",
      "troubleshooting": "Wenn Ranking-Regel, Schwelle und Anzeigestil nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "milestone-leaderboard",
        "spotlight"
      ]
    },
    "en": {
      "title": "Top Tier",
      "summary": "Top Tier configures ranking rule, threshold, and display style with a safe local check instead of a LIVE trigger.",
      "firstResult": "the Top Tier card shows the demo rank in preview",
      "requirements": "LTTH Dashboard; use an OBS test scene for output. This Top Tier workflow specifically covers ranking rule, threshold, and display style.",
      "safety": "Use an OBS test scene that is not live; LIVE output remains disabled. This Top Tier workflow specifically covers ranking rule, threshold, and display style.",
      "troubleshooting": "If ranking rule, threshold, and display style is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "milestone-leaderboard",
        "spotlight"
      ]
    },
    "es": {
      "title": "Top Tier",
      "summary": "Top Tier configura regla de ranking, umbral y estilo de visualización mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "la tarjeta Top Tier muestra el rango demo en la vista previa",
      "requirements": "El panel de LTTH y una escena de prueba de OBS para la salida. Este flujo concreto de Top Tier trata regla de ranking, umbral y estilo de visualización.",
      "safety": "Usa una escena de prueba de OBS que no esté al aire; la salida LIVE permanece desactivada. Este flujo concreto de Top Tier trata regla de ranking, umbral y estilo de visualización.",
      "troubleshooting": "Si regla de ranking, umbral y estilo de visualización no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "milestone-leaderboard",
        "spotlight"
      ]
    },
    "fr": {
      "title": "Top Tier",
      "summary": "Top Tier configure règle de classement, seuil et style d’affichage avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "la carte Top Tier affiche le rang démo dans l’aperçu",
      "requirements": "Le tableau de bord LTTH et une scène de test OBS pour la sortie. Ce flux spécifique de Top Tier couvre règle de classement, seuil et style d’affichage.",
      "safety": "Utilisez une scène de test OBS non diffusée ; la sortie LIVE reste désactivée. Ce flux spécifique de Top Tier couvre règle de classement, seuil et style d’affichage.",
      "troubleshooting": "Si règle de classement, seuil et style d’affichage n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "milestone-leaderboard",
        "spotlight"
      ]
    }
  },
  "steps": [
    {
      "id": "tier-card",
      "copy": {
        "de": {
          "title": "Tier Card im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Tier Card von Ranking-Regel, Schwelle und Anzeigestil. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "alt": "Tier Card im Testprofil konfigurieren - Ranking-Regel, Schwelle und Anzeigestil"
        },
        "en": {
          "title": "Configure Tier Card in the test profile",
          "body": "Work in the visible Tier Card area of ranking rule, threshold, and display style. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The relevant plugin surface is visibly identified.",
          "alt": "Configure Tier Card in the test profile - ranking rule, threshold, and display style"
        },
        "es": {
          "title": "Configura Tier Card en el perfil de prueba",
          "body": "Trabaja en el area visible Tier Card de regla de ranking, umbral y estilo de visualización. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La superficie correspondiente del plugin queda identificada.",
          "alt": "Configura Tier Card en el perfil de prueba - regla de ranking, umbral y estilo de visualización"
        },
        "fr": {
          "title": "Configurez Tier Card dans le profil de test",
          "body": "Travaillez dans la zone visible Tier Card de règle de classement, seuil et style d’affichage. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La surface de plugin correspondante est clairement visible.",
          "alt": "Configurez Tier Card dans le profil de test - règle de classement, seuil et style d’affichage"
        }
      },
      "capture": {
        "route": "/plugins/toptier/ui.html",
        "assertVisible": "#panel-live",
        "focusText": {
          "de": "Tier Card im Testprofil konfigurieren",
          "en": "Configure Tier Card in the test profile",
          "es": "Configura Tier Card en el perfil de prueba",
          "fr": "Configurez Tier Card dans le profil de test"
        },
        "action": {
          "type": "open-plugin-surface",
          "stepId": "tier-card"
        },
        "expected": {
          "de": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "en": "The relevant plugin surface is visibly identified.",
          "es": "La superficie correspondiente del plugin queda identificada.",
          "fr": "La surface de plugin correspondante est clairement visible."
        }
      },
      "workflow": {
        "route": "/plugins/toptier/ui.html",
        "instructions": {
          "de": {
            "title": "Tier Card im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Tier Card von Ranking-Regel, Schwelle und Anzeigestil. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar."
          },
          "en": {
            "title": "Configure Tier Card in the test profile",
            "body": "Work in the visible Tier Card area of ranking rule, threshold, and display style. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The relevant plugin surface is visibly identified."
          },
          "es": {
            "title": "Configura Tier Card en el perfil de prueba",
            "body": "Trabaja en el area visible Tier Card de regla de ranking, umbral y estilo de visualización. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La superficie correspondiente del plugin queda identificada."
          },
          "fr": {
            "title": "Configurez Tier Card dans le profil de test",
            "body": "Travaillez dans la zone visible Tier Card de règle de classement, seuil et style d’affichage. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La surface de plugin correspondante est clairement visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/toptier/ui.html"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#panel-live"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/toptier/ui.html"
          },
          {
            "type": "visible",
            "selector": "#panel-live"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#panel-live",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "ranking-rule",
      "copy": {
        "de": {
          "title": "Ranking Rule im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Ranking Rule von Ranking-Regel, Schwelle und Anzeigestil. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Ranking Rule im Testprofil konfigurieren - Ranking-Regel, Schwelle und Anzeigestil"
        },
        "en": {
          "title": "Configure Ranking Rule in the test profile",
          "body": "Work in the visible Ranking Rule area of ranking rule, threshold, and display style. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Ranking Rule in the test profile - ranking rule, threshold, and display style"
        },
        "es": {
          "title": "Configura Ranking Rule en el perfil de prueba",
          "body": "Trabaja en el area visible Ranking Rule de regla de ranking, umbral y estilo de visualización. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Ranking Rule en el perfil de prueba - regla de ranking, umbral y estilo de visualización"
        },
        "fr": {
          "title": "Configurez Ranking Rule dans le profil de test",
          "body": "Travaillez dans la zone visible Ranking Rule de règle de classement, seuil et style d’affichage. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Ranking Rule dans le profil de test - règle de classement, seuil et style d’affichage"
        }
      },
      "capture": {
        "route": "/plugins/toptier/ui.html",
        "assertVisible": "#decay-enabled",
        "focusText": {
          "de": "Ranking Rule im Testprofil konfigurieren",
          "en": "Configure Ranking Rule in the test profile",
          "es": "Configura Ranking Rule en el perfil de prueba",
          "fr": "Configurez Ranking Rule dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "ranking-rule"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/toptier/ui.html",
        "instructions": {
          "de": {
            "title": "Ranking Rule im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Ranking Rule von Ranking-Regel, Schwelle und Anzeigestil. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Ranking Rule in the test profile",
            "body": "Work in the visible Ranking Rule area of ranking rule, threshold, and display style. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Ranking Rule en el perfil de prueba",
            "body": "Trabaja en el area visible Ranking Rule de regla de ranking, umbral y estilo de visualización. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Ranking Rule dans le profil de test",
            "body": "Travaillez dans la zone visible Ranking Rule de règle de classement, seuil et style d’affichage. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/toptier/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#decay-enabled"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/toptier/ui.html"
          },
          {
            "type": "visible",
            "selector": "#decay-enabled"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#decay-enabled",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "tier-threshold",
      "copy": {
        "de": {
          "title": "Tier Threshold im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Tier Threshold von Ranking-Regel, Schwelle und Anzeigestil. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Tier Threshold im Testprofil konfigurieren - Ranking-Regel, Schwelle und Anzeigestil"
        },
        "en": {
          "title": "Configure Tier Threshold in the test profile",
          "body": "Work in the visible Tier Threshold area of ranking rule, threshold, and display style. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Tier Threshold in the test profile - ranking rule, threshold, and display style"
        },
        "es": {
          "title": "Configura Tier Threshold en el perfil de prueba",
          "body": "Trabaja en el area visible Tier Threshold de regla de ranking, umbral y estilo de visualización. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Tier Threshold en el perfil de prueba - regla de ranking, umbral y estilo de visualización"
        },
        "fr": {
          "title": "Configurez Tier Threshold dans le profil de test",
          "body": "Travaillez dans la zone visible Tier Threshold de règle de classement, seuil et style d’affichage. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Tier Threshold dans le profil de test - règle de classement, seuil et style d’affichage"
        }
      },
      "capture": {
        "route": "/plugins/toptier/ui.html",
        "assertVisible": "#test-overlay",
        "focusText": {
          "de": "Tier Threshold im Testprofil konfigurieren",
          "en": "Configure Tier Threshold in the test profile",
          "es": "Configura Tier Threshold en el perfil de prueba",
          "fr": "Configurez Tier Threshold dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "tier-threshold"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/toptier/ui.html",
        "instructions": {
          "de": {
            "title": "Tier Threshold im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Tier Threshold von Ranking-Regel, Schwelle und Anzeigestil. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Tier Threshold in the test profile",
            "body": "Work in the visible Tier Threshold area of ranking rule, threshold, and display style. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Tier Threshold en el perfil de prueba",
            "body": "Trabaja en el area visible Tier Threshold de regla de ranking, umbral y estilo de visualización. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Tier Threshold dans le profil de test",
            "body": "Travaillez dans la zone visible Tier Threshold de règle de classement, seuil et style d’affichage. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/toptier/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#test-overlay"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/toptier/ui.html"
          },
          {
            "type": "visible",
            "selector": "#test-overlay"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#test-overlay",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "rank-preview",
      "copy": {
        "de": {
          "title": "Rank Preview lokal testen",
          "body": "Fuehre Rank Preview nur mit einen lokalen Ranglistenwert im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
          "expected": "die Top-Tier-Karte zeigt den Demo-Rang in der Vorschau",
          "alt": "Rank Preview lokal testen - Ranking-Regel, Schwelle und Anzeigestil"
        },
        "en": {
          "title": "Test Rank Preview locally",
          "body": "Run Rank Preview only with a local leaderboard value in the isolated test profile; no LIVE source, hardware, or external connection is used.",
          "expected": "the Top Tier card shows the demo rank in preview",
          "alt": "Test Rank Preview locally - ranking rule, threshold, and display style"
        },
        "es": {
          "title": "Prueba Rank Preview localmente",
          "body": "Ejecuta Rank Preview solo con un valor de clasificación local en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
          "expected": "la tarjeta Top Tier muestra el rango demo en la vista previa",
          "alt": "Prueba Rank Preview localmente - regla de ranking, umbral y estilo de visualización"
        },
        "fr": {
          "title": "Testez Rank Preview localement",
          "body": "Executez Rank Preview uniquement avec une valeur de classement locale dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
          "expected": "la carte Top Tier affiche le rang démo dans l’aperçu",
          "alt": "Testez Rank Preview localement - règle de classement, seuil et style d’affichage"
        }
      },
      "capture": {
        "route": "/plugins/toptier/ui.html",
        "assertVisible": "#panel-obs",
        "focusText": {
          "de": "Rank Preview lokal testen",
          "en": "Test Rank Preview locally",
          "es": "Prueba Rank Preview localmente",
          "fr": "Testez Rank Preview localement"
        },
        "action": {
          "type": "run-local-preview",
          "stepId": "rank-preview"
        },
        "expected": {
          "de": "die Top-Tier-Karte zeigt den Demo-Rang in der Vorschau",
          "en": "the Top Tier card shows the demo rank in preview",
          "es": "la tarjeta Top Tier muestra el rango demo en la vista previa",
          "fr": "la carte Top Tier affiche le rang démo dans l’aperçu"
        }
      },
      "workflow": {
        "route": "/plugins/toptier/ui.html",
        "instructions": {
          "de": {
            "title": "Rank Preview lokal testen",
            "body": "Fuehre Rank Preview nur mit einen lokalen Ranglistenwert im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
            "expected": "die Top-Tier-Karte zeigt den Demo-Rang in der Vorschau"
          },
          "en": {
            "title": "Test Rank Preview locally",
            "body": "Run Rank Preview only with a local leaderboard value in the isolated test profile; no LIVE source, hardware, or external connection is used.",
            "expected": "the Top Tier card shows the demo rank in preview"
          },
          "es": {
            "title": "Prueba Rank Preview localmente",
            "body": "Ejecuta Rank Preview solo con un valor de clasificación local en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
            "expected": "la tarjeta Top Tier muestra el rango demo en la vista previa"
          },
          "fr": {
            "title": "Testez Rank Preview localement",
            "body": "Executez Rank Preview uniquement avec une valeur de classement locale dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
            "expected": "la carte Top Tier affiche le rang démo dans l’aperçu"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/toptier/ui.html"
          },
          {
            "type": "run-local-preview",
            "selector": "#panel-obs"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/toptier/ui.html"
          },
          {
            "type": "visible",
            "selector": "#panel-obs"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#panel-obs",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "tier-overlay",
      "copy": {
        "de": {
          "title": "Tier Overlay als Overlay-Vorschau oeffnen",
          "body": "Oeffne die echte Tier Overlay-Oberflaeche nur in einer nicht sendenden OBS-Testszene. Ohne lokales Testereignis kann sie leer oder transparent bleiben; es werden keine Demo-Inhalte eingefuegt.",
          "expected": "die Top-Tier-Karte zeigt den Demo-Rang in der Vorschau",
          "alt": "Tier Overlay als Overlay-Vorschau oeffnen - Ranking-Regel, Schwelle und Anzeigestil"
        },
        "en": {
          "title": "Open Tier Overlay as an overlay preview",
          "body": "Open the real Tier Overlay surface only in an OBS test scene that is not live. Without a local test event, it can remain empty or transparent; no demo content is inserted.",
          "expected": "the Top Tier card shows the demo rank in preview",
          "alt": "Open Tier Overlay as an overlay preview - ranking rule, threshold, and display style"
        },
        "es": {
          "title": "Abre Tier Overlay como vista previa de overlay",
          "body": "Abre la superficie real Tier Overlay solo en una escena de prueba de OBS que no esta al aire. Sin un evento local de prueba, puede quedar vacia o transparente; no se inserta contenido demo.",
          "expected": "la tarjeta Top Tier muestra el rango demo en la vista previa",
          "alt": "Abre Tier Overlay como vista previa de overlay - regla de ranking, umbral y estilo de visualización"
        },
        "fr": {
          "title": "Ouvrez Tier Overlay comme apercu overlay",
          "body": "Ouvrez la vraie surface Tier Overlay uniquement dans une scene de test OBS non diffusee. Sans evenement de test local, elle peut rester vide ou transparente ; aucun contenu de demonstration nest insere.",
          "expected": "la carte Top Tier affiche le rang démo dans l’aperçu",
          "alt": "Ouvrez Tier Overlay comme apercu overlay - règle de classement, seuil et style d’affichage"
        }
      },
      "capture": {
        "route": "/plugins/toptier/overlay.html",
        "assertVisible": "#tt-root",
        "focusText": {
          "de": "Tier Overlay als Overlay-Vorschau oeffnen",
          "en": "Open Tier Overlay as an overlay preview",
          "es": "Abre Tier Overlay como vista previa de overlay",
          "fr": "Ouvrez Tier Overlay comme apercu overlay"
        },
        "action": {
          "type": "open-overlay-preview",
          "stepId": "tier-overlay"
        },
        "expected": {
          "de": "die Top-Tier-Karte zeigt den Demo-Rang in der Vorschau",
          "en": "the Top Tier card shows the demo rank in preview",
          "es": "la tarjeta Top Tier muestra el rango demo en la vista previa",
          "fr": "la carte Top Tier affiche le rang démo dans l’aperçu"
        }
      },
      "workflow": {
        "route": "/plugins/toptier/overlay.html",
        "instructions": {
          "de": {
            "title": "Tier Overlay als Overlay-Vorschau oeffnen",
            "body": "Oeffne die echte Tier Overlay-Oberflaeche nur in einer nicht sendenden OBS-Testszene. Ohne lokales Testereignis kann sie leer oder transparent bleiben; es werden keine Demo-Inhalte eingefuegt.",
            "expected": "die Top-Tier-Karte zeigt den Demo-Rang in der Vorschau"
          },
          "en": {
            "title": "Open Tier Overlay as an overlay preview",
            "body": "Open the real Tier Overlay surface only in an OBS test scene that is not live. Without a local test event, it can remain empty or transparent; no demo content is inserted.",
            "expected": "the Top Tier card shows the demo rank in preview"
          },
          "es": {
            "title": "Abre Tier Overlay como vista previa de overlay",
            "body": "Abre la superficie real Tier Overlay solo en una escena de prueba de OBS que no esta al aire. Sin un evento local de prueba, puede quedar vacia o transparente; no se inserta contenido demo.",
            "expected": "la tarjeta Top Tier muestra el rango demo en la vista previa"
          },
          "fr": {
            "title": "Ouvrez Tier Overlay comme apercu overlay",
            "body": "Ouvrez la vraie surface Tier Overlay uniquement dans une scene de test OBS non diffusee. Sans evenement de test local, elle peut rester vide ou transparente ; aucun contenu de demonstration nest insere.",
            "expected": "la carte Top Tier affiche le rang démo dans l’aperçu"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/toptier/overlay.html"
          },
          {
            "type": "open-overlay-preview",
            "selector": "#tt-root"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/toptier/overlay.html"
          },
          {
            "type": "visible",
            "selector": "#tt-root"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#tt-root",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "tier-reset",
      "copy": {
        "de": {
          "title": "Tier Reset sicher zuruecksetzen",
          "body": "Entferne nur die Demo-Werte fuer Tier Reset, bevor du Ranking-Regel, Schwelle und Anzeigestil produktiv vorbereitest.",
          "expected": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "alt": "Tier Reset sicher zuruecksetzen - Ranking-Regel, Schwelle und Anzeigestil"
        },
        "en": {
          "title": "Reset Tier Reset safely",
          "body": "Remove only the demo values for Tier Reset before preparing ranking rule, threshold, and display style for production.",
          "expected": "The test profile remains free of production impact.",
          "alt": "Reset Tier Reset safely - ranking rule, threshold, and display style"
        },
        "es": {
          "title": "Restablece Tier Reset con seguridad",
          "body": "Elimina solo los valores demo de Tier Reset antes de preparar regla de ranking, umbral y estilo de visualización para produccion.",
          "expected": "El perfil de prueba permanece sin impacto de producción.",
          "alt": "Restablece Tier Reset con seguridad - regla de ranking, umbral y estilo de visualización"
        },
        "fr": {
          "title": "Reinitialisez Tier Reset en securite",
          "body": "Supprimez uniquement les valeurs demo de Tier Reset avant de preparer règle de classement, seuil et style d’affichage pour la production.",
          "expected": "Le profil de test reste sans impact de production.",
          "alt": "Reinitialisez Tier Reset en securite - règle de classement, seuil et style d’affichage"
        }
      },
      "capture": {
        "route": "/plugins/toptier/ui.html",
        "assertVisible": "#reset-all",
        "focusText": {
          "de": "Tier Reset sicher zuruecksetzen",
          "en": "Reset Tier Reset safely",
          "es": "Restablece Tier Reset con seguridad",
          "fr": "Reinitialisez Tier Reset en securite"
        },
        "action": {
          "type": "reset-demo-state",
          "stepId": "tier-reset"
        },
        "expected": {
          "de": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "en": "The test profile remains free of production impact.",
          "es": "El perfil de prueba permanece sin impacto de producción.",
          "fr": "Le profil de test reste sans impact de production."
        }
      },
      "workflow": {
        "route": "/plugins/toptier/ui.html",
        "instructions": {
          "de": {
            "title": "Tier Reset sicher zuruecksetzen",
            "body": "Entferne nur die Demo-Werte fuer Tier Reset, bevor du Ranking-Regel, Schwelle und Anzeigestil produktiv vorbereitest.",
            "expected": "Das Testprofil bleibt ohne produktive Auswirkung."
          },
          "en": {
            "title": "Reset Tier Reset safely",
            "body": "Remove only the demo values for Tier Reset before preparing ranking rule, threshold, and display style for production.",
            "expected": "The test profile remains free of production impact."
          },
          "es": {
            "title": "Restablece Tier Reset con seguridad",
            "body": "Elimina solo los valores demo de Tier Reset antes de preparar regla de ranking, umbral y estilo de visualización para produccion.",
            "expected": "El perfil de prueba permanece sin impacto de producción."
          },
          "fr": {
            "title": "Reinitialisez Tier Reset en securite",
            "body": "Supprimez uniquement les valeurs demo de Tier Reset avant de preparer règle de classement, seuil et style d’affichage pour la production.",
            "expected": "Le profil de test reste sans impact de production."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/toptier/ui.html"
          },
          {
            "type": "reset-demo-state",
            "selector": "#reset-all"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/toptier/ui.html"
          },
          {
            "type": "visible",
            "selector": "#reset-all"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#reset-all",
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
