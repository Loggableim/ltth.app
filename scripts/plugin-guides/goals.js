'use strict';

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
module.exports = Object.freeze({
  "id": "goals",
  "route": "/plugins/goals/ui.html",
  "topic": {
    "de": "Zielwert, Fortschrittsanzeige und Reset-Regel",
    "en": "goal value, progress display, and reset rule",
    "es": "valor de objetivo, visualización de progreso y regla de reinicio",
    "fr": "valeur d’objectif, affichage de progression et règle de remise à zéro"
  },
  "test": {
    "de": "einen lokalen Fortschrittsimpuls",
    "en": "a local progress pulse",
    "es": "un impulso de progreso local",
    "fr": "une impulsion de progression locale"
  },
  "expected": {
    "de": "die Fortschrittsanzeige ändert sich nur im Testprofil",
    "en": "the progress display changes only in the test profile",
    "es": "la visualización de progreso cambia solo en el perfil de prueba",
    "fr": "l’affichage de progression change uniquement dans le profil de test"
  },
  "requirement": "obs",
  "safety": "obs",
  "mode": "ui",
  "overlay": "/goals/overlay",
  "related": [
    "advanced-timer",
    "milestone-leaderboard"
  ],
  "copy": {
    "de": {
      "title": "Live Goals",
      "summary": "Live Goals richtet Zielwert, Fortschrittsanzeige und Reset-Regel ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "die Fortschrittsanzeige ändert sich nur im Testprofil",
      "requirements": "LTTH Dashboard; für die Ausgabe zusätzlich eine OBS-Testszene. Dieser konkrete Live Goals-Ablauf behandelt Zielwert, Fortschrittsanzeige und Reset-Regel.",
      "safety": "Nutze eine nicht gesendete OBS-Testszene; LIVE-Ausgaben bleiben deaktiviert. Dieser konkrete Live Goals-Ablauf behandelt Zielwert, Fortschrittsanzeige und Reset-Regel.",
      "troubleshooting": "Wenn Zielwert, Fortschrittsanzeige und Reset-Regel nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "advanced-timer",
        "milestone-leaderboard"
      ]
    },
    "en": {
      "title": "Live Goals",
      "summary": "Live Goals configures goal value, progress display, and reset rule with a safe local check instead of a LIVE trigger.",
      "firstResult": "the progress display changes only in the test profile",
      "requirements": "LTTH Dashboard; use an OBS test scene for output. This Live Goals workflow specifically covers goal value, progress display, and reset rule.",
      "safety": "Use an OBS test scene that is not live; LIVE output remains disabled. This Live Goals workflow specifically covers goal value, progress display, and reset rule.",
      "troubleshooting": "If goal value, progress display, and reset rule is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "advanced-timer",
        "milestone-leaderboard"
      ]
    },
    "es": {
      "title": "Live Goals",
      "summary": "Live Goals configura valor de objetivo, visualización de progreso y regla de reinicio mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "la visualización de progreso cambia solo en el perfil de prueba",
      "requirements": "El panel de LTTH y una escena de prueba de OBS para la salida. Este flujo concreto de Live Goals trata valor de objetivo, visualización de progreso y regla de reinicio.",
      "safety": "Usa una escena de prueba de OBS que no esté al aire; la salida LIVE permanece desactivada. Este flujo concreto de Live Goals trata valor de objetivo, visualización de progreso y regla de reinicio.",
      "troubleshooting": "Si valor de objetivo, visualización de progreso y regla de reinicio no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "advanced-timer",
        "milestone-leaderboard"
      ]
    },
    "fr": {
      "title": "Live Goals",
      "summary": "Live Goals configure valeur d’objectif, affichage de progression et règle de remise à zéro avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "l’affichage de progression change uniquement dans le profil de test",
      "requirements": "Le tableau de bord LTTH et une scène de test OBS pour la sortie. Ce flux spécifique de Live Goals couvre valeur d’objectif, affichage de progression et règle de remise à zéro.",
      "safety": "Utilisez une scène de test OBS non diffusée ; la sortie LIVE reste désactivée. Ce flux spécifique de Live Goals couvre valeur d’objectif, affichage de progression et règle de remise à zéro.",
      "troubleshooting": "Si valeur d’objectif, affichage de progression et règle de remise à zéro n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "advanced-timer",
        "milestone-leaderboard"
      ]
    }
  },
  "steps": [
    {
      "id": "goals-card",
      "copy": {
        "de": {
          "title": "Goals Card im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Goals Card von Zielwert, Fortschrittsanzeige und Reset-Regel. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "alt": "Goals Card im Testprofil konfigurieren - Zielwert, Fortschrittsanzeige und Reset-Regel"
        },
        "en": {
          "title": "Configure Goals Card in the test profile",
          "body": "Work in the visible Goals Card area of goal value, progress display, and reset rule. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The relevant plugin surface is visibly identified.",
          "alt": "Configure Goals Card in the test profile - goal value, progress display, and reset rule"
        },
        "es": {
          "title": "Configura Goals Card en el perfil de prueba",
          "body": "Trabaja en el area visible Goals Card de valor de objetivo, visualización de progreso y regla de reinicio. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La superficie correspondiente del plugin queda identificada.",
          "alt": "Configura Goals Card en el perfil de prueba - valor de objetivo, visualización de progreso y regla de reinicio"
        },
        "fr": {
          "title": "Configurez Goals Card dans le profil de test",
          "body": "Travaillez dans la zone visible Goals Card de valeur d’objectif, affichage de progression et règle de remise à zéro. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La surface de plugin correspondante est clairement visible.",
          "alt": "Configurez Goals Card dans le profil de test - valeur d’objectif, affichage de progression et règle de remise à zéro"
        }
      },
      "capture": {
        "route": "/plugins/goals/ui.html",
        "assertVisible": "#goals-container",
        "focusText": {
          "de": "Goals Card im Testprofil konfigurieren",
          "en": "Configure Goals Card in the test profile",
          "es": "Configura Goals Card en el perfil de prueba",
          "fr": "Configurez Goals Card dans le profil de test"
        },
        "action": {
          "type": "open-plugin-surface",
          "stepId": "goals-card"
        },
        "expected": {
          "de": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "en": "The relevant plugin surface is visibly identified.",
          "es": "La superficie correspondiente del plugin queda identificada.",
          "fr": "La surface de plugin correspondante est clairement visible."
        }
      },
      "workflow": {
        "route": "/plugins/goals/ui.html",
        "instructions": {
          "de": {
            "title": "Goals Card im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Goals Card von Zielwert, Fortschrittsanzeige und Reset-Regel. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar."
          },
          "en": {
            "title": "Configure Goals Card in the test profile",
            "body": "Work in the visible Goals Card area of goal value, progress display, and reset rule. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The relevant plugin surface is visibly identified."
          },
          "es": {
            "title": "Configura Goals Card en el perfil de prueba",
            "body": "Trabaja en el area visible Goals Card de valor de objetivo, visualización de progreso y regla de reinicio. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La superficie correspondiente del plugin queda identificada."
          },
          "fr": {
            "title": "Configurez Goals Card dans le profil de test",
            "body": "Travaillez dans la zone visible Goals Card de valeur d’objectif, affichage de progression et règle de remise à zéro. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La surface de plugin correspondante est clairement visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/goals/ui.html"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#goals-container"
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
              "path": "/plugins/goals/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#goals-container"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#goals-container",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "goal-target",
      "copy": {
        "de": {
          "title": "Goal Target im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Goal Target von Zielwert, Fortschrittsanzeige und Reset-Regel. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Goal Target im Testprofil konfigurieren - Zielwert, Fortschrittsanzeige und Reset-Regel"
        },
        "en": {
          "title": "Configure Goal Target in the test profile",
          "body": "Work in the visible Goal Target area of goal value, progress display, and reset rule. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Goal Target in the test profile - goal value, progress display, and reset rule"
        },
        "es": {
          "title": "Configura Goal Target en el perfil de prueba",
          "body": "Trabaja en el area visible Goal Target de valor de objetivo, visualización de progreso y regla de reinicio. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Goal Target en el perfil de prueba - valor de objetivo, visualización de progreso y regla de reinicio"
        },
        "fr": {
          "title": "Configurez Goal Target dans le profil de test",
          "body": "Travaillez dans la zone visible Goal Target de valeur d’objectif, affichage de progression et règle de remise à zéro. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Goal Target dans le profil de test - valeur d’objectif, affichage de progression et règle de remise à zéro"
        }
      },
      "capture": {
        "route": "/plugins/goals/ui.html",
        "assertVisible": "#goal-target",
        "focusText": {
          "de": "Goal Target im Testprofil konfigurieren",
          "en": "Configure Goal Target in the test profile",
          "es": "Configura Goal Target en el perfil de prueba",
          "fr": "Configurez Goal Target dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "prepare": "open-goal-create-modal",
          "stepId": "goal-target"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/goals/ui.html",
        "instructions": {
          "de": {
            "title": "Goal Target im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Goal Target von Zielwert, Fortschrittsanzeige und Reset-Regel. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Goal Target in the test profile",
            "body": "Work in the visible Goal Target area of goal value, progress display, and reset rule. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Goal Target en el perfil de prueba",
            "body": "Trabaja en el area visible Goal Target de valor de objetivo, visualización de progreso y regla de reinicio. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Goal Target dans le profil de test",
            "body": "Travaillez dans la zone visible Goal Target de valeur d’objectif, affichage de progression et règle de remise à zéro. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/goals/ui.html"
          },
          {
            "type": "prepare",
            "name": "open-goal-create-modal"
          },
          {
            "type": "set-demo-value",
            "selector": "#goal-target"
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
              "path": "/plugins/goals/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#goal-target"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#goal-target",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "reset-rule",
      "copy": {
        "de": {
          "title": "Reset Rule im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Reset Rule von Zielwert, Fortschrittsanzeige und Reset-Regel. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Reset Rule im Testprofil konfigurieren - Zielwert, Fortschrittsanzeige und Reset-Regel"
        },
        "en": {
          "title": "Configure Reset Rule in the test profile",
          "body": "Work in the visible Reset Rule area of goal value, progress display, and reset rule. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Reset Rule in the test profile - goal value, progress display, and reset rule"
        },
        "es": {
          "title": "Configura Reset Rule en el perfil de prueba",
          "body": "Trabaja en el area visible Reset Rule de valor de objetivo, visualización de progreso y regla de reinicio. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Reset Rule en el perfil de prueba - valor de objetivo, visualización de progreso y regla de reinicio"
        },
        "fr": {
          "title": "Configurez Reset Rule dans le profil de test",
          "body": "Travaillez dans la zone visible Reset Rule de valeur d’objectif, affichage de progression et règle de remise à zéro. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Reset Rule dans le profil de test - valeur d’objectif, affichage de progression et règle de remise à zéro"
        }
      },
      "capture": {
        "route": "/plugins/goals/ui.html",
        "assertVisible": "#goal-on-reach",
        "focusText": {
          "de": "Reset Rule im Testprofil konfigurieren",
          "en": "Configure Reset Rule in the test profile",
          "es": "Configura Reset Rule en el perfil de prueba",
          "fr": "Configurez Reset Rule dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "prepare": "open-goal-create-modal",
          "stepId": "reset-rule"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/goals/ui.html",
        "instructions": {
          "de": {
            "title": "Reset Rule im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Reset Rule von Zielwert, Fortschrittsanzeige und Reset-Regel. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Reset Rule in the test profile",
            "body": "Work in the visible Reset Rule area of goal value, progress display, and reset rule. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Reset Rule en el perfil de prueba",
            "body": "Trabaja en el area visible Reset Rule de valor de objetivo, visualización de progreso y regla de reinicio. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Reset Rule dans le profil de test",
            "body": "Travaillez dans la zone visible Reset Rule de valeur d’objectif, affichage de progression et règle de remise à zéro. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/goals/ui.html"
          },
          {
            "type": "prepare",
            "name": "open-goal-create-modal"
          },
          {
            "type": "set-demo-value",
            "selector": "#goal-on-reach"
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
              "path": "/plugins/goals/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#goal-on-reach"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#goal-on-reach",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "progress-pulse",
      "copy": {
        "de": {
          "title": "Progress Pulse lokal testen",
          "body": "Fuehre Progress Pulse nur mit einen lokalen Fortschrittsimpuls im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
          "expected": "die Fortschrittsanzeige ändert sich nur im Testprofil",
          "alt": "Progress Pulse lokal testen - Zielwert, Fortschrittsanzeige und Reset-Regel"
        },
        "en": {
          "title": "Test Progress Pulse locally",
          "body": "Run Progress Pulse only with a local progress pulse in the isolated test profile; no LIVE source, hardware, or external connection is used.",
          "expected": "the progress display changes only in the test profile",
          "alt": "Test Progress Pulse locally - goal value, progress display, and reset rule"
        },
        "es": {
          "title": "Prueba Progress Pulse localmente",
          "body": "Ejecuta Progress Pulse solo con un impulso de progreso local en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
          "expected": "la visualización de progreso cambia solo en el perfil de prueba",
          "alt": "Prueba Progress Pulse localmente - valor de objetivo, visualización de progreso y regla de reinicio"
        },
        "fr": {
          "title": "Testez Progress Pulse localement",
          "body": "Executez Progress Pulse uniquement avec une impulsion de progression locale dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
          "expected": "l’affichage de progression change uniquement dans le profil de test",
          "alt": "Testez Progress Pulse localement - valeur d’objectif, affichage de progression et règle de remise à zéro"
        }
      },
      "capture": {
        "route": "/plugins/goals/ui.html",
        "assertVisible": "#goal-preview-frame",
        "focusText": {
          "de": "Progress Pulse lokal testen",
          "en": "Test Progress Pulse locally",
          "es": "Prueba Progress Pulse localmente",
          "fr": "Testez Progress Pulse localement"
        },
        "action": {
          "type": "run-local-preview",
          "prepare": "open-goal-create-modal",
          "stepId": "progress-pulse"
        },
        "expected": {
          "de": "die Fortschrittsanzeige ändert sich nur im Testprofil",
          "en": "the progress display changes only in the test profile",
          "es": "la visualización de progreso cambia solo en el perfil de prueba",
          "fr": "l’affichage de progression change uniquement dans le profil de test"
        }
      },
      "workflow": {
        "route": "/plugins/goals/ui.html",
        "instructions": {
          "de": {
            "title": "Progress Pulse lokal testen",
            "body": "Fuehre Progress Pulse nur mit einen lokalen Fortschrittsimpuls im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
            "expected": "die Fortschrittsanzeige ändert sich nur im Testprofil"
          },
          "en": {
            "title": "Test Progress Pulse locally",
            "body": "Run Progress Pulse only with a local progress pulse in the isolated test profile; no LIVE source, hardware, or external connection is used.",
            "expected": "the progress display changes only in the test profile"
          },
          "es": {
            "title": "Prueba Progress Pulse localmente",
            "body": "Ejecuta Progress Pulse solo con un impulso de progreso local en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
            "expected": "la visualización de progreso cambia solo en el perfil de prueba"
          },
          "fr": {
            "title": "Testez Progress Pulse localement",
            "body": "Executez Progress Pulse uniquement avec une impulsion de progression locale dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
            "expected": "l’affichage de progression change uniquement dans le profil de test"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/goals/ui.html"
          },
          {
            "type": "prepare",
            "name": "open-goal-create-modal"
          },
          {
            "type": "run-local-preview",
            "selector": "#goal-preview-frame"
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
              "path": "/plugins/goals/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#goal-preview-frame"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#goal-preview-frame",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "goal-overlay",
      "copy": {
        "de": {
          "title": "Goal Overlay als Overlay-Vorschau oeffnen",
          "body": "Erstelle zuerst ein lokales Testziel und oeffne anschliessend dessen echte Goal-Overlay-URL mit dem erzeugten id-Parameter nur in einer nicht sendenden OBS-Testszene.",
          "expected": "die Fortschrittsanzeige ändert sich nur im Testprofil",
          "alt": "Goal Overlay als Overlay-Vorschau oeffnen - Zielwert, Fortschrittsanzeige und Reset-Regel"
        },
        "en": {
          "title": "Open Goal Overlay as an overlay preview",
          "body": "First create a local test goal, then open its real Goal Overlay URL with the generated id parameter only in an OBS test scene that is not live.",
          "expected": "the progress display changes only in the test profile",
          "alt": "Open Goal Overlay as an overlay preview - goal value, progress display, and reset rule"
        },
        "es": {
          "title": "Abre Goal Overlay como vista previa de overlay",
          "body": "Primero crea un objetivo de prueba local y despues abre su URL real de Goal Overlay con el parametro id generado solo en una escena de prueba de OBS que no esta al aire.",
          "expected": "la visualización de progreso cambia solo en el perfil de prueba",
          "alt": "Abre Goal Overlay como vista previa de overlay - valor de objetivo, visualización de progreso y regla de reinicio"
        },
        "fr": {
          "title": "Ouvrez Goal Overlay comme apercu overlay",
          "body": "Creez d abord un objectif de test local, puis ouvrez sa vraie URL Goal Overlay avec le parametre id genere uniquement dans une scene de test OBS non diffusee.",
          "expected": "l’affichage de progression change uniquement dans le profil de test",
          "alt": "Ouvrez Goal Overlay comme apercu overlay - valeur d’objectif, affichage de progression et règle de remise à zéro"
        }
      },
      "capture": {
        "route": "/goals/overlay",
        "assertVisible": "#goal-container",
        "focusText": {
          "de": "Goal Overlay als Overlay-Vorschau oeffnen",
          "en": "Open Goal Overlay as an overlay preview",
          "es": "Abre Goal Overlay como vista previa de overlay",
          "fr": "Ouvrez Goal Overlay comme apercu overlay"
        },
        "action": {
          "type": "open-overlay-preview",
          "prepare": "create-demo-goal-overlay",
          "stepId": "goal-overlay"
        },
        "expected": {
          "de": "die Fortschrittsanzeige ändert sich nur im Testprofil",
          "en": "the progress display changes only in the test profile",
          "es": "la visualización de progreso cambia solo en el perfil de prueba",
          "fr": "l’affichage de progression change uniquement dans le profil de test"
        }
      },
      "workflow": {
        "route": "/goals/overlay",
        "instructions": {
          "de": {
            "title": "Goal Overlay als Overlay-Vorschau oeffnen",
            "body": "Erstelle zuerst ein lokales Testziel und oeffne anschliessend dessen echte Goal-Overlay-URL mit dem erzeugten id-Parameter nur in einer nicht sendenden OBS-Testszene.",
            "expected": "die Fortschrittsanzeige ändert sich nur im Testprofil"
          },
          "en": {
            "title": "Open Goal Overlay as an overlay preview",
            "body": "First create a local test goal, then open its real Goal Overlay URL with the generated id parameter only in an OBS test scene that is not live.",
            "expected": "the progress display changes only in the test profile"
          },
          "es": {
            "title": "Abre Goal Overlay como vista previa de overlay",
            "body": "Primero crea un objetivo de prueba local y despues abre su URL real de Goal Overlay con el parametro id generado solo en una escena de prueba de OBS que no esta al aire.",
            "expected": "la visualización de progreso cambia solo en el perfil de prueba"
          },
          "fr": {
            "title": "Ouvrez Goal Overlay comme apercu overlay",
            "body": "Creez d abord un objectif de test local, puis ouvrez sa vraie URL Goal Overlay avec le parametre id genere uniquement dans une scene de test OBS non diffusee.",
            "expected": "l’affichage de progression change uniquement dans le profil de test"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/goals/ui"
          },
          {
            "type": "prepare",
            "name": "create-demo-goal"
          },
          {
            "type": "run-local-preview",
            "selector": "#goal-form button[type=\"submit\"]"
          },
          {
            "type": "goto",
            "route": "/goals/overlay"
          },
          {
            "type": "open-overlay-preview",
            "selector": "#goal-container"
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
              "path": "/goals/overlay",
              "query": {"id":"non-empty","lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#goal-container"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#goal-container",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "goal-reset",
      "copy": {
        "de": {
          "title": "Goal Reset im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Goal Reset von Zielwert, Fortschrittsanzeige und Reset-Regel. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die Testkonfiguration ist nachvollziehbar und sicher gespeichert.",
          "alt": "Goal Reset im Testprofil konfigurieren - Zielwert, Fortschrittsanzeige und Reset-Regel"
        },
        "en": {
          "title": "Configure Goal Reset in the test profile",
          "body": "Work in the visible Goal Reset area of goal value, progress display, and reset rule. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The test configuration is saved safely and can be reviewed.",
          "alt": "Configure Goal Reset in the test profile - goal value, progress display, and reset rule"
        },
        "es": {
          "title": "Configura Goal Reset en el perfil de prueba",
          "body": "Trabaja en el area visible Goal Reset de valor de objetivo, visualización de progreso y regla de reinicio. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La configuración de prueba se guarda de forma segura y puede revisarse.",
          "alt": "Configura Goal Reset en el perfil de prueba - valor de objetivo, visualización de progreso y regla de reinicio"
        },
        "fr": {
          "title": "Configurez Goal Reset dans le profil de test",
          "body": "Travaillez dans la zone visible Goal Reset de valeur d’objectif, affichage de progression et règle de remise à zéro. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La configuration de test est enregistrée de manière sûre et vérifiable.",
          "alt": "Configurez Goal Reset dans le profil de test - valeur d’objectif, affichage de progression et règle de remise à zéro"
        }
      },
      "capture": {
        "route": "/plugins/goals/ui.html",
        "assertVisible": "#goal-form",
        "focusText": {
          "de": "Goal Reset im Testprofil konfigurieren",
          "en": "Configure Goal Reset in the test profile",
          "es": "Configura Goal Reset en el perfil de prueba",
          "fr": "Configurez Goal Reset dans le profil de test"
        },
        "action": {
          "type": "save-demo-config",
          "prepare": "open-goal-create-modal",
          "stepId": "goal-reset"
        },
        "expected": {
          "de": "Die Testkonfiguration ist nachvollziehbar und sicher gespeichert.",
          "en": "The test configuration is saved safely and can be reviewed.",
          "es": "La configuración de prueba se guarda de forma segura y puede revisarse.",
          "fr": "La configuration de test est enregistrée de manière sûre et vérifiable."
        }
      },
      "workflow": {
        "route": "/plugins/goals/ui.html",
        "instructions": {
          "de": {
            "title": "Goal Reset im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Goal Reset von Zielwert, Fortschrittsanzeige und Reset-Regel. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die Testkonfiguration ist nachvollziehbar und sicher gespeichert."
          },
          "en": {
            "title": "Configure Goal Reset in the test profile",
            "body": "Work in the visible Goal Reset area of goal value, progress display, and reset rule. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The test configuration is saved safely and can be reviewed."
          },
          "es": {
            "title": "Configura Goal Reset en el perfil de prueba",
            "body": "Trabaja en el area visible Goal Reset de valor de objetivo, visualización de progreso y regla de reinicio. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La configuración de prueba se guarda de forma segura y puede revisarse."
          },
          "fr": {
            "title": "Configurez Goal Reset dans le profil de test",
            "body": "Travaillez dans la zone visible Goal Reset de valeur d’objectif, affichage de progression et règle de remise à zéro. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La configuration de test est enregistrée de manière sûre et vérifiable."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/goals/ui.html"
          },
          {
            "type": "prepare",
            "name": "open-goal-create-modal"
          },
          {
            "type": "save-demo-config",
            "selector": "#goal-form"
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
              "path": "/plugins/goals/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#goal-form"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#goal-form",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    }
  ]
});
