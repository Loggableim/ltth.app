'use strict';

const { applyOverlayEntryPoints } = require('../lib/guide-overlay-entry-points');

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
module.exports = Object.freeze(applyOverlayEntryPoints({
  "id": "streamalchemy",
  "route": "/plugins/streamalchemy/ui.html",
  "topic": {
    "de": "Automationsregel, Auslöser und Aktionskette",
    "en": "automation rule, trigger, and action chain",
    "es": "regla de automatización, disparador y cadena de acciones",
    "fr": "règle d’automatisation, déclencheur et chaîne d’actions"
  },
  "test": {
    "de": "einen lokalen Trockenlauf",
    "en": "a local dry run",
    "es": "una ejecución en seco local",
    "fr": "un essai à blanc local"
  },
  "expected": {
    "de": "die Regel protokolliert den Trockenlauf, ohne LIVE-Aktionen auszuführen",
    "en": "the rule logs the dry run without executing LIVE actions",
    "es": "la regla registra la ejecución en seco sin realizar acciones LIVE",
    "fr": "la règle journalise l’essai à blanc sans exécuter d’actions LIVE"
  },
  "requirement": "standard",
  "safety": "local",
  "mode": "ui",
  "overlay": "/plugins/streamalchemy/overlay.html",
  "related": [
    "api-bridge",
    "gcce"
  ],
  "copy": {
    "de": {
      "title": "StreamAlchemy",
      "summary": "StreamAlchemy richtet Automationsregel, Auslöser und Aktionskette ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "die Regel protokolliert den Trockenlauf, ohne LIVE-Aktionen auszuführen",
      "requirements": "LTTH Dashboard und ein lokales Testprofil. Dieser konkrete StreamAlchemy-Ablauf behandelt Automationsregel, Auslöser und Aktionskette.",
      "safety": "Verwende ausschließlich Demo-Ereignisse und ein temporäres Testprofil. Dieser konkrete StreamAlchemy-Ablauf behandelt Automationsregel, Auslöser und Aktionskette.",
      "troubleshooting": "Wenn Automationsregel, Auslöser und Aktionskette nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "api-bridge",
        "gcce"
      ]
    },
    "en": {
      "title": "StreamAlchemy",
      "summary": "StreamAlchemy configures automation rule, trigger, and action chain with a safe local check instead of a LIVE trigger.",
      "firstResult": "the rule logs the dry run without executing LIVE actions",
      "requirements": "LTTH Dashboard and a local test profile. This StreamAlchemy workflow specifically covers automation rule, trigger, and action chain.",
      "safety": "Use demo events and a temporary test profile only. This StreamAlchemy workflow specifically covers automation rule, trigger, and action chain.",
      "troubleshooting": "If automation rule, trigger, and action chain is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "api-bridge",
        "gcce"
      ]
    },
    "es": {
      "title": "StreamAlchemy",
      "summary": "StreamAlchemy configura regla de automatización, disparador y cadena de acciones mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "la regla registra la ejecución en seco sin realizar acciones LIVE",
      "requirements": "El panel de LTTH y un perfil de prueba local. Este flujo concreto de StreamAlchemy trata regla de automatización, disparador y cadena de acciones.",
      "safety": "Usa solo eventos de demostración y un perfil de prueba temporal. Este flujo concreto de StreamAlchemy trata regla de automatización, disparador y cadena de acciones.",
      "troubleshooting": "Si regla de automatización, disparador y cadena de acciones no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "api-bridge",
        "gcce"
      ]
    },
    "fr": {
      "title": "StreamAlchemy",
      "summary": "StreamAlchemy configure règle d’automatisation, déclencheur et chaîne d’actions avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "la règle journalise l’essai à blanc sans exécuter d’actions LIVE",
      "requirements": "Le tableau de bord LTTH et un profil de test local. Ce flux spécifique de StreamAlchemy couvre règle d’automatisation, déclencheur et chaîne d’actions.",
      "safety": "Utilisez uniquement des événements de démonstration et un profil de test temporaire. Ce flux spécifique de StreamAlchemy couvre règle d’automatisation, déclencheur et chaîne d’actions.",
      "troubleshooting": "Si règle d’automatisation, déclencheur et chaîne d’actions n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "api-bridge",
        "gcce"
      ]
    }
  },
  "steps": [
    {
      "id": "alchemy-card",
      "copy": {
        "de": {
          "title": "Alchemy Card im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Alchemy Card von Automationsregel, Auslöser und Aktionskette. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "alt": "Alchemy Card im Testprofil konfigurieren - Automationsregel, Auslöser und Aktionskette"
        },
        "en": {
          "title": "Configure Alchemy Card in the test profile",
          "body": "Work in the visible Alchemy Card area of automation rule, trigger, and action chain. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The relevant plugin surface is visibly identified.",
          "alt": "Configure Alchemy Card in the test profile - automation rule, trigger, and action chain"
        },
        "es": {
          "title": "Configura Alchemy Card en el perfil de prueba",
          "body": "Trabaja en el area visible Alchemy Card de regla de automatización, disparador y cadena de acciones. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La superficie correspondiente del plugin queda identificada.",
          "alt": "Configura Alchemy Card en el perfil de prueba - regla de automatización, disparador y cadena de acciones"
        },
        "fr": {
          "title": "Configurez Alchemy Card dans le profil de test",
          "body": "Travaillez dans la zone visible Alchemy Card de règle d’automatisation, déclencheur et chaîne d’actions. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La surface de plugin correspondante est clairement visible.",
          "alt": "Configurez Alchemy Card dans le profil de test - règle d’automatisation, déclencheur et chaîne d’actions"
        }
      },
      "capture": {
        "route": "/plugins/streamalchemy/ui.html",
        "assertVisible": "#settingsForm",
        "focusText": {
          "de": "Alchemy Card im Testprofil konfigurieren",
          "en": "Configure Alchemy Card in the test profile",
          "es": "Configura Alchemy Card en el perfil de prueba",
          "fr": "Configurez Alchemy Card dans le profil de test"
        },
        "action": {
          "type": "open-plugin-surface",
          "prepare": "open-streamalchemy-settings",
          "stepId": "alchemy-card"
        },
        "expected": {
          "de": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "en": "The relevant plugin surface is visibly identified.",
          "es": "La superficie correspondiente del plugin queda identificada.",
          "fr": "La surface de plugin correspondante est clairement visible."
        }
      },
      "workflow": {
        "route": "/plugins/streamalchemy/ui.html",
        "instructions": {
          "de": {
            "title": "Alchemy Card im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Alchemy Card von Automationsregel, Auslöser und Aktionskette. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar."
          },
          "en": {
            "title": "Configure Alchemy Card in the test profile",
            "body": "Work in the visible Alchemy Card area of automation rule, trigger, and action chain. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The relevant plugin surface is visibly identified."
          },
          "es": {
            "title": "Configura Alchemy Card en el perfil de prueba",
            "body": "Trabaja en el area visible Alchemy Card de regla de automatización, disparador y cadena de acciones. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La superficie correspondiente del plugin queda identificada."
          },
          "fr": {
            "title": "Configurez Alchemy Card dans le profil de test",
            "body": "Travaillez dans la zone visible Alchemy Card de règle d’automatisation, déclencheur et chaîne d’actions. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La surface de plugin correspondante est clairement visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/streamalchemy/ui.html"
          },
          {
            "type": "prepare",
            "name": "open-streamalchemy-settings"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#settingsForm"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": 200
          },
          {
            "type": "url",
            "expected": {
              "path": "/plugins/streamalchemy/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#settingsForm"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#settingsForm",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "automation-rule",
      "copy": {
        "de": {
          "title": "Automation Rule im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Automation Rule von Automationsregel, Auslöser und Aktionskette. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Automation Rule im Testprofil konfigurieren - Automationsregel, Auslöser und Aktionskette"
        },
        "en": {
          "title": "Configure Automation Rule in the test profile",
          "body": "Work in the visible Automation Rule area of automation rule, trigger, and action chain. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Automation Rule in the test profile - automation rule, trigger, and action chain"
        },
        "es": {
          "title": "Configura Automation Rule en el perfil de prueba",
          "body": "Trabaja en el area visible Automation Rule de regla de automatización, disparador y cadena de acciones. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Automation Rule en el perfil de prueba - regla de automatización, disparador y cadena de acciones"
        },
        "fr": {
          "title": "Configurez Automation Rule dans le profil de test",
          "body": "Travaillez dans la zone visible Automation Rule de règle d’automatisation, déclencheur et chaîne d’actions. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Automation Rule dans le profil de test - règle d’automatisation, déclencheur et chaîne d’actions"
        }
      },
      "capture": {
        "route": "/plugins/streamalchemy/ui.html",
        "assertVisible": "#generationMode",
        "focusText": {
          "de": "Automation Rule im Testprofil konfigurieren",
          "en": "Configure Automation Rule in the test profile",
          "es": "Configura Automation Rule en el perfil de prueba",
          "fr": "Configurez Automation Rule dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "prepare": "open-streamalchemy-settings",
          "stepId": "automation-rule"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/streamalchemy/ui.html",
        "instructions": {
          "de": {
            "title": "Automation Rule im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Automation Rule von Automationsregel, Auslöser und Aktionskette. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Automation Rule in the test profile",
            "body": "Work in the visible Automation Rule area of automation rule, trigger, and action chain. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Automation Rule en el perfil de prueba",
            "body": "Trabaja en el area visible Automation Rule de regla de automatización, disparador y cadena de acciones. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Automation Rule dans le profil de test",
            "body": "Travaillez dans la zone visible Automation Rule de règle d’automatisation, déclencheur et chaîne d’actions. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/streamalchemy/ui.html"
          },
          {
            "type": "prepare",
            "name": "open-streamalchemy-settings"
          },
          {
            "type": "set-demo-value",
            "selector": "#generationMode"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": 200
          },
          {
            "type": "url",
            "expected": {
              "path": "/plugins/streamalchemy/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#generationMode"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#generationMode",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "action-chain",
      "copy": {
        "de": {
          "title": "Action Chain im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Action Chain von Automationsregel, Auslöser und Aktionskette. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Action Chain im Testprofil konfigurieren - Automationsregel, Auslöser und Aktionskette"
        },
        "en": {
          "title": "Configure Action Chain in the test profile",
          "body": "Work in the visible Action Chain area of automation rule, trigger, and action chain. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Action Chain in the test profile - automation rule, trigger, and action chain"
        },
        "es": {
          "title": "Configura Action Chain en el perfil de prueba",
          "body": "Trabaja en el area visible Action Chain de regla de automatización, disparador y cadena de acciones. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Action Chain en el perfil de prueba - regla de automatización, disparador y cadena de acciones"
        },
        "fr": {
          "title": "Configurez Action Chain dans le profil de test",
          "body": "Travaillez dans la zone visible Action Chain de règle d’automatisation, déclencheur et chaîne d’actions. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Action Chain dans le profil de test - règle d’automatisation, déclencheur et chaîne d’actions"
        }
      },
      "capture": {
        "route": "/plugins/streamalchemy/ui.html",
        "assertVisible": "#defaultStyle",
        "focusText": {
          "de": "Action Chain im Testprofil konfigurieren",
          "en": "Configure Action Chain in the test profile",
          "es": "Configura Action Chain en el perfil de prueba",
          "fr": "Configurez Action Chain dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "prepare": "open-streamalchemy-settings",
          "stepId": "action-chain"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/streamalchemy/ui.html",
        "instructions": {
          "de": {
            "title": "Action Chain im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Action Chain von Automationsregel, Auslöser und Aktionskette. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Action Chain in the test profile",
            "body": "Work in the visible Action Chain area of automation rule, trigger, and action chain. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Action Chain en el perfil de prueba",
            "body": "Trabaja en el area visible Action Chain de regla de automatización, disparador y cadena de acciones. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Action Chain dans le profil de test",
            "body": "Travaillez dans la zone visible Action Chain de règle d’automatisation, déclencheur et chaîne d’actions. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/streamalchemy/ui.html"
          },
          {
            "type": "prepare",
            "name": "open-streamalchemy-settings"
          },
          {
            "type": "set-demo-value",
            "selector": "#defaultStyle"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": 200
          },
          {
            "type": "url",
            "expected": {
              "path": "/plugins/streamalchemy/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#defaultStyle"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#defaultStyle",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "rule-dry-run",
      "copy": {
        "de": {
          "title": "Rule DRY RUN lokal testen",
          "body": "Fuehre Rule DRY RUN nur mit einen lokalen Trockenlauf im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
          "expected": "die Regel protokolliert den Trockenlauf, ohne LIVE-Aktionen auszuführen",
          "alt": "Rule DRY RUN lokal testen - Automationsregel, Auslöser und Aktionskette"
        },
        "en": {
          "title": "Test Rule DRY RUN locally",
          "body": "Run Rule DRY RUN only with a local dry run in the isolated test profile; no LIVE source, hardware, or external connection is used.",
          "expected": "the rule logs the dry run without executing LIVE actions",
          "alt": "Test Rule DRY RUN locally - automation rule, trigger, and action chain"
        },
        "es": {
          "title": "Prueba Rule DRY RUN localmente",
          "body": "Ejecuta Rule DRY RUN solo con una ejecución en seco local en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
          "expected": "la regla registra la ejecución en seco sin realizar acciones LIVE",
          "alt": "Prueba Rule DRY RUN localmente - regla de automatización, disparador y cadena de acciones"
        },
        "fr": {
          "title": "Testez Rule DRY RUN localement",
          "body": "Executez Rule DRY RUN uniquement avec un essai à blanc local dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
          "expected": "la règle journalise l’essai à blanc sans exécuter d’actions LIVE",
          "alt": "Testez Rule DRY RUN localement - règle d’automatisation, déclencheur et chaîne d’actions"
        }
      },
      "capture": {
        "route": "/plugins/streamalchemy/ui.html",
        "assertVisible": "#runLocalTestBtn",
        "focusText": {
          "de": "Rule DRY RUN lokal testen",
          "en": "Test Rule DRY RUN locally",
          "es": "Prueba Rule DRY RUN localmente",
          "fr": "Testez Rule DRY RUN localement"
        },
        "action": {
          "type": "run-local-preview",
          "prepare": "open-streamalchemy-settings",
          "stepId": "rule-dry-run"
        },
        "expected": {
          "de": "die Regel protokolliert den Trockenlauf, ohne LIVE-Aktionen auszuführen",
          "en": "the rule logs the dry run without executing LIVE actions",
          "es": "la regla registra la ejecución en seco sin realizar acciones LIVE",
          "fr": "la règle journalise l’essai à blanc sans exécuter d’actions LIVE"
        }
      },
      "workflow": {
        "route": "/plugins/streamalchemy/ui.html",
        "instructions": {
          "de": {
            "title": "Rule DRY RUN lokal testen",
            "body": "Fuehre Rule DRY RUN nur mit einen lokalen Trockenlauf im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
            "expected": "die Regel protokolliert den Trockenlauf, ohne LIVE-Aktionen auszuführen"
          },
          "en": {
            "title": "Test Rule DRY RUN locally",
            "body": "Run Rule DRY RUN only with a local dry run in the isolated test profile; no LIVE source, hardware, or external connection is used.",
            "expected": "the rule logs the dry run without executing LIVE actions"
          },
          "es": {
            "title": "Prueba Rule DRY RUN localmente",
            "body": "Ejecuta Rule DRY RUN solo con una ejecución en seco local en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
            "expected": "la regla registra la ejecución en seco sin realizar acciones LIVE"
          },
          "fr": {
            "title": "Testez Rule DRY RUN localement",
            "body": "Executez Rule DRY RUN uniquement avec un essai à blanc local dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
            "expected": "la règle journalise l’essai à blanc sans exécuter d’actions LIVE"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/streamalchemy/ui.html"
          },
          {
            "type": "prepare",
            "name": "open-streamalchemy-settings"
          },
          {
            "type": "run-local-preview",
            "selector": "#runLocalTestBtn"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": 200
          },
          {
            "type": "url",
            "expected": {
              "path": "/plugins/streamalchemy/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#runLocalTestBtn"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#runLocalTestBtn",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "alchemy-overlay",
      "copy": {
        "de": {
          "title": "Alchemy Overlay als Overlay-Vorschau oeffnen",
          "body": "Oeffne die echte Alchemy Overlay-Oberflaeche nur in einer nicht sendenden OBS-Testszene. Ohne lokales Testereignis kann sie leer oder transparent bleiben; es werden keine Demo-Inhalte eingefuegt.",
          "expected": "die Regel protokolliert den Trockenlauf, ohne LIVE-Aktionen auszuführen",
          "alt": "Alchemy Overlay als Overlay-Vorschau oeffnen - Automationsregel, Auslöser und Aktionskette"
        },
        "en": {
          "title": "Open Alchemy Overlay as an overlay preview",
          "body": "Open the real Alchemy Overlay surface only in an OBS test scene that is not live. Without a local test event, it can remain empty or transparent; no demo content is inserted.",
          "expected": "the rule logs the dry run without executing LIVE actions",
          "alt": "Open Alchemy Overlay as an overlay preview - automation rule, trigger, and action chain"
        },
        "es": {
          "title": "Abre Alchemy Overlay como vista previa de overlay",
          "body": "Abre la superficie real Alchemy Overlay solo en una escena de prueba de OBS que no esta al aire. Sin un evento local de prueba, puede quedar vacia o transparente; no se inserta contenido demo.",
          "expected": "la regla registra la ejecución en seco sin realizar acciones LIVE",
          "alt": "Abre Alchemy Overlay como vista previa de overlay - regla de automatización, disparador y cadena de acciones"
        },
        "fr": {
          "title": "Ouvrez Alchemy Overlay comme apercu overlay",
          "body": "Ouvrez la vraie surface Alchemy Overlay uniquement dans une scene de test OBS non diffusee. Sans evenement de test local, elle peut rester vide ou transparente ; aucun contenu de demonstration nest insere.",
          "expected": "la règle journalise l’essai à blanc sans exécuter d’actions LIVE",
          "alt": "Ouvrez Alchemy Overlay comme apercu overlay - règle d’automatisation, déclencheur et chaîne d’actions"
        }
      },
      "capture": {
        "route": "/plugins/streamalchemy/overlay.html",
        "assertVisible": "#craftPanel",
        "focusText": {
          "de": "Alchemy Overlay als Overlay-Vorschau oeffnen",
          "en": "Open Alchemy Overlay as an overlay preview",
          "es": "Abre Alchemy Overlay como vista previa de overlay",
          "fr": "Ouvrez Alchemy Overlay comme apercu overlay"
        },
        "action": {
          "type": "open-overlay-preview",
          "stepId": "alchemy-overlay"
        },
        "expected": {
          "de": "die Regel protokolliert den Trockenlauf, ohne LIVE-Aktionen auszuführen",
          "en": "the rule logs the dry run without executing LIVE actions",
          "es": "la regla registra la ejecución en seco sin realizar acciones LIVE",
          "fr": "la règle journalise l’essai à blanc sans exécuter d’actions LIVE"
        }
      },
      "workflow": {
        "route": "/plugins/streamalchemy/overlay.html",
        "instructions": {
          "de": {
            "title": "Alchemy Overlay als Overlay-Vorschau oeffnen",
            "body": "Oeffne die echte Alchemy Overlay-Oberflaeche nur in einer nicht sendenden OBS-Testszene. Ohne lokales Testereignis kann sie leer oder transparent bleiben; es werden keine Demo-Inhalte eingefuegt.",
            "expected": "die Regel protokolliert den Trockenlauf, ohne LIVE-Aktionen auszuführen"
          },
          "en": {
            "title": "Open Alchemy Overlay as an overlay preview",
            "body": "Open the real Alchemy Overlay surface only in an OBS test scene that is not live. Without a local test event, it can remain empty or transparent; no demo content is inserted.",
            "expected": "the rule logs the dry run without executing LIVE actions"
          },
          "es": {
            "title": "Abre Alchemy Overlay como vista previa de overlay",
            "body": "Abre la superficie real Alchemy Overlay solo en una escena de prueba de OBS que no esta al aire. Sin un evento local de prueba, puede quedar vacia o transparente; no se inserta contenido demo.",
            "expected": "la regla registra la ejecución en seco sin realizar acciones LIVE"
          },
          "fr": {
            "title": "Ouvrez Alchemy Overlay comme apercu overlay",
            "body": "Ouvrez la vraie surface Alchemy Overlay uniquement dans une scene de test OBS non diffusee. Sans evenement de test local, elle peut rester vide ou transparente ; aucun contenu de demonstration nest insere.",
            "expected": "la règle journalise l’essai à blanc sans exécuter d’actions LIVE"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/streamalchemy/overlay.html"
          },
          {
            "type": "open-overlay-preview",
            "selector": "#craftPanel"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": 200
          },
          {
            "type": "url",
            "expected": {
              "path": "/plugins/streamalchemy/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#craftPanel"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#craftPanel",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "rule-reset",
      "copy": {
        "de": {
          "title": "Rule Reset sicher zuruecksetzen",
          "body": "Entferne nur die Demo-Werte fuer Rule Reset, bevor du Automationsregel, Auslöser und Aktionskette produktiv vorbereitest.",
          "expected": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "alt": "Rule Reset sicher zuruecksetzen - Automationsregel, Auslöser und Aktionskette"
        },
        "en": {
          "title": "Reset Rule Reset safely",
          "body": "Remove only the demo values for Rule Reset before preparing automation rule, trigger, and action chain for production.",
          "expected": "The test profile remains free of production impact.",
          "alt": "Reset Rule Reset safely - automation rule, trigger, and action chain"
        },
        "es": {
          "title": "Restablece Rule Reset con seguridad",
          "body": "Elimina solo los valores demo de Rule Reset antes de preparar regla de automatización, disparador y cadena de acciones para produccion.",
          "expected": "El perfil de prueba permanece sin impacto de producción.",
          "alt": "Restablece Rule Reset con seguridad - regla de automatización, disparador y cadena de acciones"
        },
        "fr": {
          "title": "Reinitialisez Rule Reset en securite",
          "body": "Supprimez uniquement les valeurs demo de Rule Reset avant de preparer règle d’automatisation, déclencheur et chaîne d’actions pour la production.",
          "expected": "Le profil de test reste sans impact de production.",
          "alt": "Reinitialisez Rule Reset en securite - règle d’automatisation, déclencheur et chaîne d’actions"
        }
      },
      "capture": {
        "route": "/plugins/streamalchemy/ui.html",
        "assertVisible": "#refreshBtn",
        "focusText": {
          "de": "Rule Reset sicher zuruecksetzen",
          "en": "Reset Rule Reset safely",
          "es": "Restablece Rule Reset con seguridad",
          "fr": "Reinitialisez Rule Reset en securite"
        },
        "action": {
          "type": "reset-demo-state",
          "stepId": "rule-reset"
        },
        "expected": {
          "de": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "en": "The test profile remains free of production impact.",
          "es": "El perfil de prueba permanece sin impacto de producción.",
          "fr": "Le profil de test reste sans impact de production."
        }
      },
      "workflow": {
        "route": "/plugins/streamalchemy/ui.html",
        "instructions": {
          "de": {
            "title": "Rule Reset sicher zuruecksetzen",
            "body": "Entferne nur die Demo-Werte fuer Rule Reset, bevor du Automationsregel, Auslöser und Aktionskette produktiv vorbereitest.",
            "expected": "Das Testprofil bleibt ohne produktive Auswirkung."
          },
          "en": {
            "title": "Reset Rule Reset safely",
            "body": "Remove only the demo values for Rule Reset before preparing automation rule, trigger, and action chain for production.",
            "expected": "The test profile remains free of production impact."
          },
          "es": {
            "title": "Restablece Rule Reset con seguridad",
            "body": "Elimina solo los valores demo de Rule Reset antes de preparar regla de automatización, disparador y cadena de acciones para produccion.",
            "expected": "El perfil de prueba permanece sin impacto de producción."
          },
          "fr": {
            "title": "Reinitialisez Rule Reset en securite",
            "body": "Supprimez uniquement les valeurs demo de Rule Reset avant de preparer règle d’automatisation, déclencheur et chaîne d’actions pour la production.",
            "expected": "Le profil de test reste sans impact de production."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/streamalchemy/ui.html"
          },
          {
            "type": "reset-demo-state",
            "selector": "#refreshBtn"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": 200
          },
          {
            "type": "url",
            "expected": {
              "path": "/plugins/streamalchemy/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#refreshBtn"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#refreshBtn",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    }
  ]
}, {
  'alchemy-overlay': {
    route: '/plugins/streamalchemy/ui.html',
    selector: 'a[href="/streamalchemy/overlay"]',
    imageCrop: { width: 420, height: 260 },
    copy: {
      de: { title: 'Alchemy-Overlay-Link in den Einstellungen öffnen', body: 'Öffne den sichtbaren Alchemy-Overlay-Link zunächst nur aus den Einstellungen und richte ihn bei Bedarf in einer nicht sendenden OBS-Testszene ein. Ein Rendering wird erst durch ein lokales Regelereignis ausgelöst.', expected: 'Der sichtbare Link führt zum Alchemy-Overlay und macht den nächsten OBS-Schritt nachvollziehbar.' },
      en: { title: 'Open the Alchemy overlay link from Settings', body: 'First open the visible Alchemy overlay link from Settings and, if needed, add it in a non-live OBS test scene. Rendering starts only after a local rule event.', expected: 'The visible link leads to the Alchemy overlay and makes the next OBS step clear.' },
      es: { title: 'Abre el enlace del overlay Alchemy desde Ajustes', body: 'Abre primero el enlace visible del overlay Alchemy desde Ajustes y, si hace falta, añádelo en una escena de prueba de OBS que no está en directo. El renderizado solo empieza después de un evento local de regla.', expected: 'El enlace visible lleva al overlay Alchemy y deja claro el siguiente paso de OBS.' },
      fr: { title: 'Ouvrez le lien de l’overlay Alchemy depuis les réglages', body: 'Ouvrez d’abord le lien visible de l’overlay Alchemy depuis les réglages et, si nécessaire, ajoutez-le dans une scène de test OBS hors diffusion. Le rendu ne commence qu’après un événement de règle local.', expected: 'Le lien visible mène à l’overlay Alchemy et rend la prochaine étape OBS compréhensible.' }
    }
  }
}));
