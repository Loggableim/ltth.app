'use strict';

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
module.exports = Object.freeze({
  "id": "openshock",
  "route": "/plugins/openshock/ui.html",
  "topic": {
    "de": "Sicherheitslimit, Queue und Gerätezuordnung",
    "en": "safety limit, queue, and device mapping",
    "es": "límite de seguridad, cola y asignación de dispositivo",
    "fr": "limite de sécurité, file et mappage d’appareil"
  },
  "test": {
    "de": "die eingebaute Simulation ohne Token und Gerät",
    "en": "the built-in simulation without a token or device",
    "es": "la simulación integrada sin token ni dispositivo",
    "fr": "la simulation intégrée sans jeton ni appareil"
  },
  "expected": {
    "de": "der Ablauf wird als Simulation angezeigt und löst keine Haptik aus",
    "en": "the flow is shown as a simulation and triggers no haptics",
    "es": "el flujo se muestra como simulación y no activa háptica",
    "fr": "le flux est affiché comme simulation et ne déclenche aucune haptique"
  },
  "requirement": "hardware",
  "safety": "hardware",
  "mode": "ui",
  "overlay": "/plugins/openshock/overlay/openshock_overlay.html",
  "related": [
    "game-engine",
    "thermal-printer"
  ],
  "copy": {
    "de": {
      "title": "Hybridshock",
      "summary": "Hybridshock richtet Sicherheitslimit, Queue und Gerätezuordnung ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "der Ablauf wird als Simulation angezeigt und löst keine Haptik aus",
      "requirements": "LTTH Dashboard; Hardware bleibt ausgeschaltet oder wird simuliert. Dieser konkrete Hybridshock-Ablauf behandelt Sicherheitslimit, Queue und Gerätezuordnung.",
      "safety": "Keine Hardware auslösen: Verbindung, Druck und Haptik bleiben im Demo- oder Offline-Zustand. Dieser konkrete Hybridshock-Ablauf behandelt Sicherheitslimit, Queue und Gerätezuordnung.",
      "troubleshooting": "Wenn Sicherheitslimit, Queue und Gerätezuordnung nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "game-engine",
        "thermal-printer"
      ]
    },
    "en": {
      "title": "Hybridshock",
      "summary": "Hybridshock configures safety limit, queue, and device mapping with a safe local check instead of a LIVE trigger.",
      "firstResult": "the flow is shown as a simulation and triggers no haptics",
      "requirements": "LTTH Dashboard; hardware remains powered off or simulated. This Hybridshock workflow specifically covers safety limit, queue, and device mapping.",
      "safety": "Do not trigger hardware: connection, printing, and haptics stay in demo or offline state. This Hybridshock workflow specifically covers safety limit, queue, and device mapping.",
      "troubleshooting": "If safety limit, queue, and device mapping is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "game-engine",
        "thermal-printer"
      ]
    },
    "es": {
      "title": "Hybridshock",
      "summary": "Hybridshock configura límite de seguridad, cola y asignación de dispositivo mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "el flujo se muestra como simulación y no activa háptica",
      "requirements": "El panel de LTTH; el hardware permanece apagado o simulado. Este flujo concreto de Hybridshock trata límite de seguridad, cola y asignación de dispositivo.",
      "safety": "No actives hardware: conexión, impresión y háptica permanecen en modo demo o sin conexión. Este flujo concreto de Hybridshock trata límite de seguridad, cola y asignación de dispositivo.",
      "troubleshooting": "Si límite de seguridad, cola y asignación de dispositivo no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "game-engine",
        "thermal-printer"
      ]
    },
    "fr": {
      "title": "Hybridshock",
      "summary": "Hybridshock configure limite de sécurité, file et mappage d’appareil avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "le flux est affiché comme simulation et ne déclenche aucune haptique",
      "requirements": "Le tableau de bord LTTH ; le matériel reste éteint ou simulé. Ce flux spécifique de Hybridshock couvre limite de sécurité, file et mappage d’appareil.",
      "safety": "Ne déclenchez aucun matériel : connexion, impression et haptique restent en démo ou hors ligne. Ce flux spécifique de Hybridshock couvre limite de sécurité, file et mappage d’appareil.",
      "troubleshooting": "Si limite de sécurité, file et mappage d’appareil n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "game-engine",
        "thermal-printer"
      ]
    }
  },
  "steps": [
    {
      "id": "safety-card",
      "copy": {
        "de": {
          "title": "Safety Card im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Safety Card von Sicherheitslimit, Queue und Gerätezuordnung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "alt": "Safety Card im Testprofil konfigurieren - Sicherheitslimit, Queue und Gerätezuordnung"
        },
        "en": {
          "title": "Configure Safety Card in the test profile",
          "body": "Work in the visible Safety Card area of safety limit, queue, and device mapping. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The relevant plugin surface is visibly identified.",
          "alt": "Configure Safety Card in the test profile - safety limit, queue, and device mapping"
        },
        "es": {
          "title": "Configura Safety Card en el perfil de prueba",
          "body": "Trabaja en el area visible Safety Card de límite de seguridad, cola y asignación de dispositivo. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La superficie correspondiente del plugin queda identificada.",
          "alt": "Configura Safety Card en el perfil de prueba - límite de seguridad, cola y asignación de dispositivo"
        },
        "fr": {
          "title": "Configurez Safety Card dans le profil de test",
          "body": "Travaillez dans la zone visible Safety Card de limite de sécurité, file et mappage d’appareil. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La surface de plugin correspondante est clairement visible.",
          "alt": "Configurez Safety Card dans le profil de test - limite de sécurité, file et mappage d’appareil"
        }
      },
      "capture": {
        "route": "/plugins/openshock/ui.html",
        "assertVisible": "#safety",
        "focusText": {
          "de": "Safety Card im Testprofil konfigurieren",
          "en": "Configure Safety Card in the test profile",
          "es": "Configura Safety Card en el perfil de prueba",
          "fr": "Configurez Safety Card dans le profil de test"
        },
        "action": {
          "type": "open-plugin-surface",
          "prepare": "open-openshock-safety-tab",
          "stepId": "safety-card"
        },
        "expected": {
          "de": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "en": "The relevant plugin surface is visibly identified.",
          "es": "La superficie correspondiente del plugin queda identificada.",
          "fr": "La surface de plugin correspondante est clairement visible."
        }
      },
      "workflow": {
        "route": "/plugins/openshock/ui.html",
        "instructions": {
          "de": {
            "title": "Safety Card im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Safety Card von Sicherheitslimit, Queue und Gerätezuordnung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar."
          },
          "en": {
            "title": "Configure Safety Card in the test profile",
            "body": "Work in the visible Safety Card area of safety limit, queue, and device mapping. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The relevant plugin surface is visibly identified."
          },
          "es": {
            "title": "Configura Safety Card en el perfil de prueba",
            "body": "Trabaja en el area visible Safety Card de límite de seguridad, cola y asignación de dispositivo. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La superficie correspondiente del plugin queda identificada."
          },
          "fr": {
            "title": "Configurez Safety Card dans le profil de test",
            "body": "Travaillez dans la zone visible Safety Card de limite de sécurité, file et mappage d’appareil. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La surface de plugin correspondante est clairement visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/openshock/ui.html"
          },
          {
            "type": "prepare",
            "name": "open-openshock-safety-tab"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#safety"
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
              "path": "/plugins/openshock/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#safety"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#safety",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "safe-limit",
      "copy": {
        "de": {
          "title": "globales Sicherheitslimit im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich globales Sicherheitslimit von Sicherheitslimit, Queue und Gerätezuordnung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "globales Sicherheitslimit im Testprofil konfigurieren - Sicherheitslimit, Queue und Gerätezuordnung"
        },
        "en": {
          "title": "Configure global safety limit in the test profile",
          "body": "Work in the visible global safety limit area of safety limit, queue, and device mapping. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure global safety limit in the test profile - safety limit, queue, and device mapping"
        },
        "es": {
          "title": "Configura limite global de seguridad en el perfil de prueba",
          "body": "Trabaja en el area visible limite global de seguridad de límite de seguridad, cola y asignación de dispositivo. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura limite global de seguridad en el perfil de prueba - límite de seguridad, cola y asignación de dispositivo"
        },
        "fr": {
          "title": "Configurez limite global de securite dans le profil de test",
          "body": "Travaillez dans la zone visible limite global de securite de limite de sécurité, file et mappage d’appareil. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez limite global de securite dans le profil de test - limite de sécurité, file et mappage d’appareil"
        }
      },
      "capture": {
        "route": "/plugins/openshock/ui.html",
        "assertVisible": "#globalMaxIntensity",
        "focusText": {
          "de": "globales Sicherheitslimit im Testprofil konfigurieren",
          "en": "Configure global safety limit in the test profile",
          "es": "Configura limite global de seguridad en el perfil de prueba",
          "fr": "Configurez limite global de securite dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "prepare": "open-openshock-safety-tab",
          "stepId": "safe-limit"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/openshock/ui.html",
        "instructions": {
          "de": {
            "title": "globales Sicherheitslimit im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich globales Sicherheitslimit von Sicherheitslimit, Queue und Gerätezuordnung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure global safety limit in the test profile",
            "body": "Work in the visible global safety limit area of safety limit, queue, and device mapping. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura limite global de seguridad en el perfil de prueba",
            "body": "Trabaja en el area visible limite global de seguridad de límite de seguridad, cola y asignación de dispositivo. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez limite global de securite dans le profil de test",
            "body": "Travaillez dans la zone visible limite global de securite de limite de sécurité, file et mappage d’appareil. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/openshock/ui.html"
          },
          {
            "type": "prepare",
            "name": "open-openshock-safety-tab"
          },
          {
            "type": "set-demo-value",
            "selector": "#globalMaxIntensity"
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
              "path": "/plugins/openshock/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#globalMaxIntensity"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#globalMaxIntensity",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "device-placeholder",
      "copy": {
        "de": {
          "title": "Testgeraet ohne Verbindung im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Testgeraet ohne Verbindung von Sicherheitslimit, Queue und Gerätezuordnung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Testgeraet ohne Verbindung im Testprofil konfigurieren - Sicherheitslimit, Queue und Gerätezuordnung"
        },
        "en": {
          "title": "Configure offline test device in the test profile",
          "body": "Work in the visible offline test device area of safety limit, queue, and device mapping. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure offline test device in the test profile - safety limit, queue, and device mapping"
        },
        "es": {
          "title": "Configura dispositivo de prueba sin conexion en el perfil de prueba",
          "body": "Trabaja en el area visible dispositivo de prueba sin conexion de límite de seguridad, cola y asignación de dispositivo. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura dispositivo de prueba sin conexion en el perfil de prueba - límite de seguridad, cola y asignación de dispositivo"
        },
        "fr": {
          "title": "Configurez appareil de test hors connexion dans le profil de test",
          "body": "Travaillez dans la zone visible appareil de test hors connexion de limite de sécurité, file et mappage d’appareil. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez appareil de test hors connexion dans le profil de test - limite de sécurité, file et mappage d’appareil"
        }
      },
      "capture": {
        "route": "/plugins/openshock/ui.html",
        "assertVisible": "#testShockDevice",
        "focusText": {
          "de": "Testgeraet ohne Verbindung im Testprofil konfigurieren",
          "en": "Configure offline test device in the test profile",
          "es": "Configura dispositivo de prueba sin conexion en el perfil de prueba",
          "fr": "Configurez appareil de test hors connexion dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "device-placeholder"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/openshock/ui.html",
        "instructions": {
          "de": {
            "title": "Testgeraet ohne Verbindung im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Testgeraet ohne Verbindung von Sicherheitslimit, Queue und Gerätezuordnung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure offline test device in the test profile",
            "body": "Work in the visible offline test device area of safety limit, queue, and device mapping. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura dispositivo de prueba sin conexion en el perfil de prueba",
            "body": "Trabaja en el area visible dispositivo de prueba sin conexion de límite de seguridad, cola y asignación de dispositivo. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez appareil de test hors connexion dans le profil de test",
            "body": "Travaillez dans la zone visible appareil de test hors connexion de limite de sécurité, file et mappage d’appareil. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/openshock/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#testShockDevice"
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
              "path": "/plugins/openshock/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#testShockDevice"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#testShockDevice",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "shock-simulation",
      "copy": {
        "de": {
          "title": "lokale Impuls-Simulation lokal testen",
          "body": "Fuehre lokale Impuls-Simulation nur mit die eingebaute Simulation ohne Token und Gerät im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
          "expected": "der Ablauf wird als Simulation angezeigt und löst keine Haptik aus",
          "alt": "lokale Impuls-Simulation lokal testen - Sicherheitslimit, Queue und Gerätezuordnung"
        },
        "en": {
          "title": "Test local impulse simulation locally",
          "body": "Run local impulse simulation only with the built-in simulation without a token or device in the isolated test profile; no LIVE source, hardware, or external connection is used.",
          "expected": "the flow is shown as a simulation and triggers no haptics",
          "alt": "Test local impulse simulation locally - safety limit, queue, and device mapping"
        },
        "es": {
          "title": "Prueba simulacion de impulso local localmente",
          "body": "Ejecuta simulacion de impulso local solo con la simulación integrada sin token ni dispositivo en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
          "expected": "el flujo se muestra como simulación y no activa háptica",
          "alt": "Prueba simulacion de impulso local localmente - límite de seguridad, cola y asignación de dispositivo"
        },
        "fr": {
          "title": "Testez simulation locale d impulsion localement",
          "body": "Executez simulation locale d impulsion uniquement avec la simulation intégrée sans jeton ni appareil dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
          "expected": "le flux est affiché comme simulation et ne déclenche aucune haptique",
          "alt": "Testez simulation locale d impulsion localement - limite de sécurité, file et mappage d’appareil"
        }
      },
      "capture": {
        "route": "/plugins/openshock/ui.html",
        "assertVisible": "#testShockButton",
        "focusText": {
          "de": "lokale Impuls-Simulation lokal testen",
          "en": "Test local impulse simulation locally",
          "es": "Prueba simulacion de impulso local localmente",
          "fr": "Testez simulation locale d impulsion localement"
        },
        "action": {
          "type": "run-local-preview",
          "stepId": "shock-simulation"
        },
        "expected": {
          "de": "der Ablauf wird als Simulation angezeigt und löst keine Haptik aus",
          "en": "the flow is shown as a simulation and triggers no haptics",
          "es": "el flujo se muestra como simulación y no activa háptica",
          "fr": "le flux est affiché comme simulation et ne déclenche aucune haptique"
        }
      },
      "workflow": {
        "route": "/plugins/openshock/ui.html",
        "instructions": {
          "de": {
            "title": "lokale Impuls-Simulation lokal testen",
            "body": "Fuehre lokale Impuls-Simulation nur mit die eingebaute Simulation ohne Token und Gerät im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
            "expected": "der Ablauf wird als Simulation angezeigt und löst keine Haptik aus"
          },
          "en": {
            "title": "Test local impulse simulation locally",
            "body": "Run local impulse simulation only with the built-in simulation without a token or device in the isolated test profile; no LIVE source, hardware, or external connection is used.",
            "expected": "the flow is shown as a simulation and triggers no haptics"
          },
          "es": {
            "title": "Prueba simulacion de impulso local localmente",
            "body": "Ejecuta simulacion de impulso local solo con la simulación integrada sin token ni dispositivo en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
            "expected": "el flujo se muestra como simulación y no activa háptica"
          },
          "fr": {
            "title": "Testez simulation locale d impulsion localement",
            "body": "Executez simulation locale d impulsion uniquement avec la simulation intégrée sans jeton ni appareil dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
            "expected": "le flux est affiché comme simulation et ne déclenche aucune haptique"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/openshock/ui.html"
          },
          {
            "type": "run-local-preview",
            "selector": "#testShockButton"
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
              "path": "/plugins/openshock/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#testShockButton"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#testShockButton",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "shock-overlay",
      "copy": {
        "de": {
          "title": "Shock Overlay als Overlay-Vorschau oeffnen",
          "body": "Oeffne die echte Shock Overlay-Oberflaeche nur in einer nicht sendenden OBS-Testszene. Ohne lokales Testereignis kann sie leer oder transparent bleiben; es werden keine Demo-Inhalte eingefuegt.",
          "expected": "der Ablauf wird als Simulation angezeigt und löst keine Haptik aus",
          "alt": "Shock Overlay als Overlay-Vorschau oeffnen - Sicherheitslimit, Queue und Gerätezuordnung"
        },
        "en": {
          "title": "Open Shock Overlay as an overlay preview",
          "body": "Open the real Shock Overlay surface only in an OBS test scene that is not live. Without a local test event, it can remain empty or transparent; no demo content is inserted.",
          "expected": "the flow is shown as a simulation and triggers no haptics",
          "alt": "Open Shock Overlay as an overlay preview - safety limit, queue, and device mapping"
        },
        "es": {
          "title": "Abre Shock Overlay como vista previa de overlay",
          "body": "Abre la superficie real Shock Overlay solo en una escena de prueba de OBS que no esta al aire. Sin un evento local de prueba, puede quedar vacia o transparente; no se inserta contenido demo.",
          "expected": "el flujo se muestra como simulación y no activa háptica",
          "alt": "Abre Shock Overlay como vista previa de overlay - límite de seguridad, cola y asignación de dispositivo"
        },
        "fr": {
          "title": "Ouvrez Shock Overlay comme apercu overlay",
          "body": "Ouvrez la vraie surface Shock Overlay uniquement dans une scene de test OBS non diffusee. Sans evenement de test local, elle peut rester vide ou transparente ; aucun contenu de demonstration nest insere.",
          "expected": "le flux est affiché comme simulation et ne déclenche aucune haptique",
          "alt": "Ouvrez Shock Overlay comme apercu overlay - limite de sécurité, file et mappage d’appareil"
        }
      },
      "capture": {
        "route": "/plugins/openshock/overlay/openshock_overlay.html",
        "assertVisible": "#overlay-container",
        "focusText": {
          "de": "Shock Overlay als Overlay-Vorschau oeffnen",
          "en": "Open Shock Overlay as an overlay preview",
          "es": "Abre Shock Overlay como vista previa de overlay",
          "fr": "Ouvrez Shock Overlay comme apercu overlay"
        },
        "action": {
          "type": "open-overlay-preview",
          "stepId": "shock-overlay"
        },
        "expected": {
          "de": "der Ablauf wird als Simulation angezeigt und löst keine Haptik aus",
          "en": "the flow is shown as a simulation and triggers no haptics",
          "es": "el flujo se muestra como simulación y no activa háptica",
          "fr": "le flux est affiché comme simulation et ne déclenche aucune haptique"
        }
      },
      "workflow": {
        "route": "/plugins/openshock/overlay/openshock_overlay.html",
        "instructions": {
          "de": {
            "title": "Shock Overlay als Overlay-Vorschau oeffnen",
            "body": "Oeffne die echte Shock Overlay-Oberflaeche nur in einer nicht sendenden OBS-Testszene. Ohne lokales Testereignis kann sie leer oder transparent bleiben; es werden keine Demo-Inhalte eingefuegt.",
            "expected": "der Ablauf wird als Simulation angezeigt und löst keine Haptik aus"
          },
          "en": {
            "title": "Open Shock Overlay as an overlay preview",
            "body": "Open the real Shock Overlay surface only in an OBS test scene that is not live. Without a local test event, it can remain empty or transparent; no demo content is inserted.",
            "expected": "the flow is shown as a simulation and triggers no haptics"
          },
          "es": {
            "title": "Abre Shock Overlay como vista previa de overlay",
            "body": "Abre la superficie real Shock Overlay solo en una escena de prueba de OBS que no esta al aire. Sin un evento local de prueba, puede quedar vacia o transparente; no se inserta contenido demo.",
            "expected": "el flujo se muestra como simulación y no activa háptica"
          },
          "fr": {
            "title": "Ouvrez Shock Overlay comme apercu overlay",
            "body": "Ouvrez la vraie surface Shock Overlay uniquement dans une scene de test OBS non diffusee. Sans evenement de test local, elle peut rester vide ou transparente ; aucun contenu de demonstration nest insere.",
            "expected": "le flux est affiché comme simulation et ne déclenche aucune haptique"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/openshock/overlay/openshock_overlay.html"
          },
          {
            "type": "open-overlay-preview",
            "selector": "#overlay-container"
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
              "path": "/plugins/openshock/overlay/openshock_overlay.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#overlay-container"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#overlay-container",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "safety-reset",
      "copy": {
        "de": {
          "title": "Safety Reset sicher zuruecksetzen",
          "body": "Entferne nur die Demo-Werte fuer Safety Reset, bevor du Sicherheitslimit, Queue und Gerätezuordnung produktiv vorbereitest.",
          "expected": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "alt": "Safety Reset sicher zuruecksetzen - Sicherheitslimit, Queue und Gerätezuordnung"
        },
        "en": {
          "title": "Reset Safety Reset safely",
          "body": "Remove only the demo values for Safety Reset before preparing safety limit, queue, and device mapping for production.",
          "expected": "The test profile remains free of production impact.",
          "alt": "Reset Safety Reset safely - safety limit, queue, and device mapping"
        },
        "es": {
          "title": "Restablece Safety Reset con seguridad",
          "body": "Elimina solo los valores demo de Safety Reset antes de preparar límite de seguridad, cola y asignación de dispositivo para produccion.",
          "expected": "El perfil de prueba permanece sin impacto de producción.",
          "alt": "Restablece Safety Reset con seguridad - límite de seguridad, cola y asignación de dispositivo"
        },
        "fr": {
          "title": "Reinitialisez Safety Reset en securite",
          "body": "Supprimez uniquement les valeurs demo de Safety Reset avant de preparer limite de sécurité, file et mappage d’appareil pour la production.",
          "expected": "Le profil de test reste sans impact de production.",
          "alt": "Reinitialisez Safety Reset en securite - limite de sécurité, file et mappage d’appareil"
        }
      },
      "capture": {
        "route": "/plugins/openshock/ui.html",
        "assertVisible": "#headerEmergencyStop",
        "focusText": {
          "de": "Safety Reset sicher zuruecksetzen",
          "en": "Reset Safety Reset safely",
          "es": "Restablece Safety Reset con seguridad",
          "fr": "Reinitialisez Safety Reset en securite"
        },
        "action": {
          "type": "reset-demo-state",
          "stepId": "safety-reset"
        },
        "expected": {
          "de": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "en": "The test profile remains free of production impact.",
          "es": "El perfil de prueba permanece sin impacto de producción.",
          "fr": "Le profil de test reste sans impact de production."
        }
      },
      "workflow": {
        "route": "/plugins/openshock/ui.html",
        "instructions": {
          "de": {
            "title": "Safety Reset sicher zuruecksetzen",
            "body": "Entferne nur die Demo-Werte fuer Safety Reset, bevor du Sicherheitslimit, Queue und Gerätezuordnung produktiv vorbereitest.",
            "expected": "Das Testprofil bleibt ohne produktive Auswirkung."
          },
          "en": {
            "title": "Reset Safety Reset safely",
            "body": "Remove only the demo values for Safety Reset before preparing safety limit, queue, and device mapping for production.",
            "expected": "The test profile remains free of production impact."
          },
          "es": {
            "title": "Restablece Safety Reset con seguridad",
            "body": "Elimina solo los valores demo de Safety Reset antes de preparar límite de seguridad, cola y asignación de dispositivo para produccion.",
            "expected": "El perfil de prueba permanece sin impacto de producción."
          },
          "fr": {
            "title": "Reinitialisez Safety Reset en securite",
            "body": "Supprimez uniquement les valeurs demo de Safety Reset avant de preparer limite de sécurité, file et mappage d’appareil pour la production.",
            "expected": "Le profil de test reste sans impact de production."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/openshock/ui.html"
          },
          {
            "type": "reset-demo-state",
            "selector": "#headerEmergencyStop"
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
              "path": "/plugins/openshock/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#headerEmergencyStop"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#headerEmergencyStop",
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
