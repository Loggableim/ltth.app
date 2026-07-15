'use strict';

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
module.exports = Object.freeze({
  "id": "thermal-printer",
  "route": "/plugins/thermal-printer/ui.html",
  "topic": {
    "de": "Druckerprofil, Zeichensatz und Warteschlange",
    "en": "printer profile, character set, and queue",
    "es": "perfil de impresora, juego de caracteres y cola",
    "fr": "profil d’imprimante, jeu de caractères et file"
  },
  "test": {
    "de": "den Offline-Queue-Test",
    "en": "the offline queue test",
    "es": "la prueba de cola sin conexión",
    "fr": "le test de file hors ligne"
  },
  "expected": {
    "de": "ein Testeintrag bleibt in der Queue; es wird nichts gedruckt",
    "en": "a test item remains in the queue; nothing is printed",
    "es": "una entrada de prueba permanece en la cola; no se imprime nada",
    "fr": "une entrée de test reste dans la file ; rien n’est imprimé"
  },
  "requirement": "hardware",
  "safety": "hardware",
  "mode": "ui",
  "overlay": null,
  "related": [
    "openshock",
    "config-import"
  ],
  "copy": {
    "de": {
      "title": "Thermal Printer",
      "summary": "Thermal Printer richtet Druckerprofil, Zeichensatz und Warteschlange ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "ein Testeintrag bleibt in der Queue; es wird nichts gedruckt",
      "requirements": "LTTH Dashboard; Hardware bleibt ausgeschaltet oder wird simuliert. Dieser konkrete Thermal Printer-Ablauf behandelt Druckerprofil, Zeichensatz und Warteschlange.",
      "safety": "Keine Hardware auslösen: Verbindung, Druck und Haptik bleiben im Demo- oder Offline-Zustand. Dieser konkrete Thermal Printer-Ablauf behandelt Druckerprofil, Zeichensatz und Warteschlange.",
      "troubleshooting": "Wenn Druckerprofil, Zeichensatz und Warteschlange nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "openshock",
        "config-import"
      ]
    },
    "en": {
      "title": "Thermal Printer",
      "summary": "Thermal Printer configures printer profile, character set, and queue with a safe local check instead of a LIVE trigger.",
      "firstResult": "a test item remains in the queue; nothing is printed",
      "requirements": "LTTH Dashboard; hardware remains powered off or simulated. This Thermal Printer workflow specifically covers printer profile, character set, and queue.",
      "safety": "Do not trigger hardware: connection, printing, and haptics stay in demo or offline state. This Thermal Printer workflow specifically covers printer profile, character set, and queue.",
      "troubleshooting": "If printer profile, character set, and queue is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "openshock",
        "config-import"
      ]
    },
    "es": {
      "title": "Thermal Printer",
      "summary": "Thermal Printer configura perfil de impresora, juego de caracteres y cola mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "una entrada de prueba permanece en la cola; no se imprime nada",
      "requirements": "El panel de LTTH; el hardware permanece apagado o simulado. Este flujo concreto de Thermal Printer trata perfil de impresora, juego de caracteres y cola.",
      "safety": "No actives hardware: conexión, impresión y háptica permanecen en modo demo o sin conexión. Este flujo concreto de Thermal Printer trata perfil de impresora, juego de caracteres y cola.",
      "troubleshooting": "Si perfil de impresora, juego de caracteres y cola no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "openshock",
        "config-import"
      ]
    },
    "fr": {
      "title": "Thermal Printer",
      "summary": "Thermal Printer configure profil d’imprimante, jeu de caractères et file avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "une entrée de test reste dans la file ; rien n’est imprimé",
      "requirements": "Le tableau de bord LTTH ; le matériel reste éteint ou simulé. Ce flux spécifique de Thermal Printer couvre profil d’imprimante, jeu de caractères et file.",
      "safety": "Ne déclenchez aucun matériel : connexion, impression et haptique restent en démo ou hors ligne. Ce flux spécifique de Thermal Printer couvre profil d’imprimante, jeu de caractères et file.",
      "troubleshooting": "Si profil d’imprimante, jeu de caractères et file n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "openshock",
        "config-import"
      ]
    }
  },
  "steps": [
    {
      "id": "printer-card",
      "copy": {
        "de": {
          "title": "Printer Card im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Printer Card von Druckerprofil, Zeichensatz und Warteschlange. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "alt": "Printer Card im Testprofil konfigurieren - Druckerprofil, Zeichensatz und Warteschlange"
        },
        "en": {
          "title": "Configure Printer Card in the test profile",
          "body": "Work in the visible Printer Card area of printer profile, character set, and queue. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The relevant plugin surface is visibly identified.",
          "alt": "Configure Printer Card in the test profile - printer profile, character set, and queue"
        },
        "es": {
          "title": "Configura Printer Card en el perfil de prueba",
          "body": "Trabaja en el area visible Printer Card de perfil de impresora, juego de caracteres y cola. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La superficie correspondiente del plugin queda identificada.",
          "alt": "Configura Printer Card en el perfil de prueba - perfil de impresora, juego de caracteres y cola"
        },
        "fr": {
          "title": "Configurez Printer Card dans le profil de test",
          "body": "Travaillez dans la zone visible Printer Card de profil d’imprimante, jeu de caractères et file. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La surface de plugin correspondante est clairement visible.",
          "alt": "Configurez Printer Card dans le profil de test - profil d’imprimante, jeu de caractères et file"
        }
      },
      "capture": {
        "route": "/plugins/thermal-printer/ui.html",
        "assertVisible": "#config-form",
        "focusText": {
          "de": "Printer Card im Testprofil konfigurieren",
          "en": "Configure Printer Card in the test profile",
          "es": "Configura Printer Card en el perfil de prueba",
          "fr": "Configurez Printer Card dans le profil de test"
        },
        "action": {
          "type": "open-plugin-surface",
          "stepId": "printer-card"
        },
        "expected": {
          "de": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "en": "The relevant plugin surface is visibly identified.",
          "es": "La superficie correspondiente del plugin queda identificada.",
          "fr": "La surface de plugin correspondante est clairement visible."
        }
      },
      "workflow": {
        "route": "/plugins/thermal-printer/ui.html",
        "instructions": {
          "de": {
            "title": "Printer Card im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Printer Card von Druckerprofil, Zeichensatz und Warteschlange. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar."
          },
          "en": {
            "title": "Configure Printer Card in the test profile",
            "body": "Work in the visible Printer Card area of printer profile, character set, and queue. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The relevant plugin surface is visibly identified."
          },
          "es": {
            "title": "Configura Printer Card en el perfil de prueba",
            "body": "Trabaja en el area visible Printer Card de perfil de impresora, juego de caracteres y cola. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La superficie correspondiente del plugin queda identificada."
          },
          "fr": {
            "title": "Configurez Printer Card dans le profil de test",
            "body": "Travaillez dans la zone visible Printer Card de profil d’imprimante, jeu de caractères et file. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La surface de plugin correspondante est clairement visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/thermal-printer/ui.html"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#config-form"
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
              "path": "/plugins/thermal-printer/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#config-form"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#config-form",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "offline-profile",
      "copy": {
        "de": {
          "title": "Offline Profile im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Offline Profile von Druckerprofil, Zeichensatz und Warteschlange. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Offline Profile im Testprofil konfigurieren - Druckerprofil, Zeichensatz und Warteschlange"
        },
        "en": {
          "title": "Configure Offline Profile in the test profile",
          "body": "Work in the visible Offline Profile area of printer profile, character set, and queue. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Offline Profile in the test profile - printer profile, character set, and queue"
        },
        "es": {
          "title": "Configura Offline Profile en el perfil de prueba",
          "body": "Trabaja en el area visible Offline Profile de perfil de impresora, juego de caracteres y cola. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Offline Profile en el perfil de prueba - perfil de impresora, juego de caracteres y cola"
        },
        "fr": {
          "title": "Configurez Offline Profile dans le profil de test",
          "body": "Travaillez dans la zone visible Offline Profile de profil d’imprimante, jeu de caractères et file. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Offline Profile dans le profil de test - profil d’imprimante, jeu de caractères et file"
        }
      },
      "capture": {
        "route": "/plugins/thermal-printer/ui.html",
        "assertVisible": "#printerType",
        "focusText": {
          "de": "Offline Profile im Testprofil konfigurieren",
          "en": "Configure Offline Profile in the test profile",
          "es": "Configura Offline Profile en el perfil de prueba",
          "fr": "Configurez Offline Profile dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "offline-profile"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/thermal-printer/ui.html",
        "instructions": {
          "de": {
            "title": "Offline Profile im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Offline Profile von Druckerprofil, Zeichensatz und Warteschlange. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Offline Profile in the test profile",
            "body": "Work in the visible Offline Profile area of printer profile, character set, and queue. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Offline Profile en el perfil de prueba",
            "body": "Trabaja en el area visible Offline Profile de perfil de impresora, juego de caracteres y cola. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Offline Profile dans le profil de test",
            "body": "Travaillez dans la zone visible Offline Profile de profil d’imprimante, jeu de caractères et file. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/thermal-printer/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#printerType"
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
              "path": "/plugins/thermal-printer/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#printerType"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#printerType",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "encoding-rule",
      "copy": {
        "de": {
          "title": "Encoding Rule im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Encoding Rule von Druckerprofil, Zeichensatz und Warteschlange. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Encoding Rule im Testprofil konfigurieren - Druckerprofil, Zeichensatz und Warteschlange"
        },
        "en": {
          "title": "Configure Encoding Rule in the test profile",
          "body": "Work in the visible Encoding Rule area of printer profile, character set, and queue. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Encoding Rule in the test profile - printer profile, character set, and queue"
        },
        "es": {
          "title": "Configura Encoding Rule en el perfil de prueba",
          "body": "Trabaja en el area visible Encoding Rule de perfil de impresora, juego de caracteres y cola. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Encoding Rule en el perfil de prueba - perfil de impresora, juego de caracteres y cola"
        },
        "fr": {
          "title": "Configurez Encoding Rule dans le profil de test",
          "body": "Travaillez dans la zone visible Encoding Rule de profil d’imprimante, jeu de caractères et file. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Encoding Rule dans le profil de test - profil d’imprimante, jeu de caractères et file"
        }
      },
      "capture": {
        "route": "/plugins/thermal-printer/ui.html",
        "assertVisible": "#encoding",
        "focusText": {
          "de": "Encoding Rule im Testprofil konfigurieren",
          "en": "Configure Encoding Rule in the test profile",
          "es": "Configura Encoding Rule en el perfil de prueba",
          "fr": "Configurez Encoding Rule dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "encoding-rule"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/thermal-printer/ui.html",
        "instructions": {
          "de": {
            "title": "Encoding Rule im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Encoding Rule von Druckerprofil, Zeichensatz und Warteschlange. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Encoding Rule in the test profile",
            "body": "Work in the visible Encoding Rule area of printer profile, character set, and queue. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Encoding Rule en el perfil de prueba",
            "body": "Trabaja en el area visible Encoding Rule de perfil de impresora, juego de caracteres y cola. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Encoding Rule dans le profil de test",
            "body": "Travaillez dans la zone visible Encoding Rule de profil d’imprimante, jeu de caractères et file. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/thermal-printer/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#encoding"
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
              "path": "/plugins/thermal-printer/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#encoding"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#encoding",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "queue-test",
      "copy": {
        "de": {
          "title": "Queue Test lokal testen",
          "body": "Fuehre Queue Test nur mit den Offline-Queue-Test im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
          "expected": "ein Testeintrag bleibt in der Queue; es wird nichts gedruckt",
          "alt": "Queue Test lokal testen - Druckerprofil, Zeichensatz und Warteschlange"
        },
        "en": {
          "title": "Test Queue Test locally",
          "body": "Run Queue Test only with the offline queue test in the isolated test profile; no LIVE source, hardware, or external connection is used.",
          "expected": "a test item remains in the queue; nothing is printed",
          "alt": "Test Queue Test locally - printer profile, character set, and queue"
        },
        "es": {
          "title": "Prueba Queue Test localmente",
          "body": "Ejecuta Queue Test solo con la prueba de cola sin conexión en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
          "expected": "una entrada de prueba permanece en la cola; no se imprime nada",
          "alt": "Prueba Queue Test localmente - perfil de impresora, juego de caracteres y cola"
        },
        "fr": {
          "title": "Testez Queue Test localement",
          "body": "Executez Queue Test uniquement avec le test de file hors ligne dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
          "expected": "une entrée de test reste dans la file ; rien n’est imprimé",
          "alt": "Testez Queue Test localement - profil d’imprimante, jeu de caractères et file"
        }
      },
      "capture": {
        "route": "/plugins/thermal-printer/ui.html",
        "assertVisible": "#test-print-btn",
        "focusText": {
          "de": "Queue Test lokal testen",
          "en": "Test Queue Test locally",
          "es": "Prueba Queue Test localmente",
          "fr": "Testez Queue Test localement"
        },
        "action": {
          "type": "run-local-preview",
          "stepId": "queue-test"
        },
        "expected": {
          "de": "ein Testeintrag bleibt in der Queue; es wird nichts gedruckt",
          "en": "a test item remains in the queue; nothing is printed",
          "es": "una entrada de prueba permanece en la cola; no se imprime nada",
          "fr": "une entrée de test reste dans la file ; rien n’est imprimé"
        }
      },
      "workflow": {
        "route": "/plugins/thermal-printer/ui.html",
        "instructions": {
          "de": {
            "title": "Queue Test lokal testen",
            "body": "Fuehre Queue Test nur mit den Offline-Queue-Test im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
            "expected": "ein Testeintrag bleibt in der Queue; es wird nichts gedruckt"
          },
          "en": {
            "title": "Test Queue Test locally",
            "body": "Run Queue Test only with the offline queue test in the isolated test profile; no LIVE source, hardware, or external connection is used.",
            "expected": "a test item remains in the queue; nothing is printed"
          },
          "es": {
            "title": "Prueba Queue Test localmente",
            "body": "Ejecuta Queue Test solo con la prueba de cola sin conexión en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
            "expected": "una entrada de prueba permanece en la cola; no se imprime nada"
          },
          "fr": {
            "title": "Testez Queue Test localement",
            "body": "Executez Queue Test uniquement avec le test de file hors ligne dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
            "expected": "une entrée de test reste dans la file ; rien n’est imprimé"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/thermal-printer/ui.html"
          },
          {
            "type": "run-local-preview",
            "selector": "#test-print-btn"
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
              "path": "/plugins/thermal-printer/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#test-print-btn"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#test-print-btn",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "printer-review",
      "copy": {
        "de": {
          "title": "Printer Review im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Printer Review von Druckerprofil, Zeichensatz und Warteschlange. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die Testkonfiguration ist nachvollziehbar und sicher gespeichert.",
          "alt": "Printer Review im Testprofil konfigurieren - Druckerprofil, Zeichensatz und Warteschlange"
        },
        "en": {
          "title": "Configure Printer Review in the test profile",
          "body": "Work in the visible Printer Review area of printer profile, character set, and queue. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The test configuration is saved safely and can be reviewed.",
          "alt": "Configure Printer Review in the test profile - printer profile, character set, and queue"
        },
        "es": {
          "title": "Configura Printer Review en el perfil de prueba",
          "body": "Trabaja en el area visible Printer Review de perfil de impresora, juego de caracteres y cola. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La configuración de prueba se guarda de forma segura y puede revisarse.",
          "alt": "Configura Printer Review en el perfil de prueba - perfil de impresora, juego de caracteres y cola"
        },
        "fr": {
          "title": "Configurez Printer Review dans le profil de test",
          "body": "Travaillez dans la zone visible Printer Review de profil d’imprimante, jeu de caractères et file. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La configuration de test est enregistrée de manière sûre et vérifiable.",
          "alt": "Configurez Printer Review dans le profil de test - profil d’imprimante, jeu de caractères et file"
        }
      },
      "capture": {
        "route": "/plugins/thermal-printer/ui.html",
        "assertVisible": "#queue-size",
        "focusText": {
          "de": "Printer Review im Testprofil konfigurieren",
          "en": "Configure Printer Review in the test profile",
          "es": "Configura Printer Review en el perfil de prueba",
          "fr": "Configurez Printer Review dans le profil de test"
        },
        "action": {
          "type": "save-demo-config",
          "stepId": "printer-review"
        },
        "expected": {
          "de": "Die Testkonfiguration ist nachvollziehbar und sicher gespeichert.",
          "en": "The test configuration is saved safely and can be reviewed.",
          "es": "La configuración de prueba se guarda de forma segura y puede revisarse.",
          "fr": "La configuration de test est enregistrée de manière sûre et vérifiable."
        }
      },
      "workflow": {
        "route": "/plugins/thermal-printer/ui.html",
        "instructions": {
          "de": {
            "title": "Printer Review im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Printer Review von Druckerprofil, Zeichensatz und Warteschlange. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die Testkonfiguration ist nachvollziehbar und sicher gespeichert."
          },
          "en": {
            "title": "Configure Printer Review in the test profile",
            "body": "Work in the visible Printer Review area of printer profile, character set, and queue. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The test configuration is saved safely and can be reviewed."
          },
          "es": {
            "title": "Configura Printer Review en el perfil de prueba",
            "body": "Trabaja en el area visible Printer Review de perfil de impresora, juego de caracteres y cola. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La configuración de prueba se guarda de forma segura y puede revisarse."
          },
          "fr": {
            "title": "Configurez Printer Review dans le profil de test",
            "body": "Travaillez dans la zone visible Printer Review de profil d’imprimante, jeu de caractères et file. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La configuration de test est enregistrée de manière sûre et vérifiable."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/thermal-printer/ui.html"
          },
          {
            "type": "save-demo-config",
            "selector": "#queue-size"
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
              "path": "/plugins/thermal-printer/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#queue-size"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#queue-size",
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
