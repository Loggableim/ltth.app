'use strict';

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
module.exports = Object.freeze({
  "id": "osc-bridge",
  "route": "/plugins/osc-bridge/ui.html",
  "topic": {
    "de": "Loopback-Adresse, UDP-Port und Nachrichtentyp",
    "en": "loopback address, UDP port, and message type",
    "es": "dirección loopback, puerto UDP y tipo de mensaje",
    "fr": "adresse loopback, port UDP et type de message"
  },
  "test": {
    "de": "eine lokale Loopback-Prüfung",
    "en": "a local loopback check",
    "es": "una comprobación loopback local",
    "fr": "un contrôle loopback local"
  },
  "expected": {
    "de": "die Eingaben bleiben auf 127.0.0.1 und es wird kein VRChat-Client gesteuert",
    "en": "inputs remain on 127.0.0.1 and no VRChat client is controlled",
    "es": "las entradas permanecen en 127.0.0.1 y no se controla ningún cliente VRChat",
    "fr": "les entrées restent sur 127.0.0.1 et aucun client VRChat n’est contrôlé"
  },
  "requirement": "network",
  "safety": "local",
  "mode": "ui",
  "overlay": null,
  "related": [
    "stt-ticker",
    "minecraft-connect"
  ],
  "copy": {
    "de": {
      "title": "OSC-Bridge (VRChat)",
      "summary": "OSC-Bridge (VRChat) richtet Loopback-Adresse, UDP-Port und Nachrichtentyp ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "die Eingaben bleiben auf 127.0.0.1 und es wird kein VRChat-Client gesteuert",
      "requirements": "LTTH Dashboard; externe Endpunkte bleiben in dieser Anleitung getrennt. Dieser konkrete OSC-Bridge (VRChat)-Ablauf behandelt Loopback-Adresse, UDP-Port und Nachrichtentyp.",
      "safety": "Verwende ausschließlich Demo-Ereignisse und ein temporäres Testprofil. Dieser konkrete OSC-Bridge (VRChat)-Ablauf behandelt Loopback-Adresse, UDP-Port und Nachrichtentyp.",
      "troubleshooting": "Wenn Loopback-Adresse, UDP-Port und Nachrichtentyp nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "stt-ticker",
        "minecraft-connect"
      ]
    },
    "en": {
      "title": "OSC-Bridge (VRChat)",
      "summary": "OSC-Bridge (VRChat) configures loopback address, UDP port, and message type with a safe local check instead of a LIVE trigger.",
      "firstResult": "inputs remain on 127.0.0.1 and no VRChat client is controlled",
      "requirements": "LTTH Dashboard; external endpoints remain disconnected in this guide. This OSC-Bridge (VRChat) workflow specifically covers loopback address, UDP port, and message type.",
      "safety": "Use demo events and a temporary test profile only. This OSC-Bridge (VRChat) workflow specifically covers loopback address, UDP port, and message type.",
      "troubleshooting": "If loopback address, UDP port, and message type is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "stt-ticker",
        "minecraft-connect"
      ]
    },
    "es": {
      "title": "OSC-Bridge (VRChat)",
      "summary": "OSC-Bridge (VRChat) configura dirección loopback, puerto UDP y tipo de mensaje mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "las entradas permanecen en 127.0.0.1 y no se controla ningún cliente VRChat",
      "requirements": "El panel de LTTH; los extremos externos permanecen desconectados en esta guía. Este flujo concreto de OSC-Bridge (VRChat) trata dirección loopback, puerto UDP y tipo de mensaje.",
      "safety": "Usa solo eventos de demostración y un perfil de prueba temporal. Este flujo concreto de OSC-Bridge (VRChat) trata dirección loopback, puerto UDP y tipo de mensaje.",
      "troubleshooting": "Si dirección loopback, puerto UDP y tipo de mensaje no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "stt-ticker",
        "minecraft-connect"
      ]
    },
    "fr": {
      "title": "OSC-Bridge (VRChat)",
      "summary": "OSC-Bridge (VRChat) configure adresse loopback, port UDP et type de message avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "les entrées restent sur 127.0.0.1 et aucun client VRChat n’est contrôlé",
      "requirements": "Le tableau de bord LTTH ; les points externes restent déconnectés dans ce guide. Ce flux spécifique de OSC-Bridge (VRChat) couvre adresse loopback, port UDP et type de message.",
      "safety": "Utilisez uniquement des événements de démonstration et un profil de test temporaire. Ce flux spécifique de OSC-Bridge (VRChat) couvre adresse loopback, port UDP et type de message.",
      "troubleshooting": "Si adresse loopback, port UDP et type de message n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "stt-ticker",
        "minecraft-connect"
      ]
    }
  },
  "steps": [
    {
      "id": "osc-card",
      "copy": {
        "de": {
          "title": "OSC Card im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich OSC Card von Loopback-Adresse, UDP-Port und Nachrichtentyp. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "alt": "OSC Card im Testprofil konfigurieren - Loopback-Adresse, UDP-Port und Nachrichtentyp"
        },
        "en": {
          "title": "Configure OSC Card in the test profile",
          "body": "Work in the visible OSC Card area of loopback address, UDP port, and message type. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The relevant plugin surface is visibly identified.",
          "alt": "Configure OSC Card in the test profile - loopback address, UDP port, and message type"
        },
        "es": {
          "title": "Configura OSC Card en el perfil de prueba",
          "body": "Trabaja en el area visible OSC Card de dirección loopback, puerto UDP y tipo de mensaje. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La superficie correspondiente del plugin queda identificada.",
          "alt": "Configura OSC Card en el perfil de prueba - dirección loopback, puerto UDP y tipo de mensaje"
        },
        "fr": {
          "title": "Configurez OSC Card dans le profil de test",
          "body": "Travaillez dans la zone visible OSC Card de adresse loopback, port UDP et type de message. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La surface de plugin correspondante est clairement visible.",
          "alt": "Configurez OSC Card dans le profil de test - adresse loopback, port UDP et type de message"
        }
      },
      "capture": {
        "route": "/plugins/osc-bridge/ui.html",
        "assertVisible": "#config-form",
        "focusText": {
          "de": "OSC Card im Testprofil konfigurieren",
          "en": "Configure OSC Card in the test profile",
          "es": "Configura OSC Card en el perfil de prueba",
          "fr": "Configurez OSC Card dans le profil de test"
        },
        "action": {
          "type": "open-plugin-surface",
          "stepId": "osc-card"
        },
        "expected": {
          "de": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "en": "The relevant plugin surface is visibly identified.",
          "es": "La superficie correspondiente del plugin queda identificada.",
          "fr": "La surface de plugin correspondante est clairement visible."
        }
      },
      "workflow": {
        "route": "/plugins/osc-bridge/ui.html",
        "instructions": {
          "de": {
            "title": "OSC Card im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich OSC Card von Loopback-Adresse, UDP-Port und Nachrichtentyp. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar."
          },
          "en": {
            "title": "Configure OSC Card in the test profile",
            "body": "Work in the visible OSC Card area of loopback address, UDP port, and message type. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The relevant plugin surface is visibly identified."
          },
          "es": {
            "title": "Configura OSC Card en el perfil de prueba",
            "body": "Trabaja en el area visible OSC Card de dirección loopback, puerto UDP y tipo de mensaje. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La superficie correspondiente del plugin queda identificada."
          },
          "fr": {
            "title": "Configurez OSC Card dans le profil de test",
            "body": "Travaillez dans la zone visible OSC Card de adresse loopback, port UDP et type de message. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La surface de plugin correspondante est clairement visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/osc-bridge/ui.html"
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
              "path": "/plugins/osc-bridge/ui.html",
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
      "id": "loopback-host",
      "copy": {
        "de": {
          "title": "Loopback Host im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Loopback Host von Loopback-Adresse, UDP-Port und Nachrichtentyp. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Loopback Host im Testprofil konfigurieren - Loopback-Adresse, UDP-Port und Nachrichtentyp"
        },
        "en": {
          "title": "Configure Loopback Host in the test profile",
          "body": "Work in the visible Loopback Host area of loopback address, UDP port, and message type. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Loopback Host in the test profile - loopback address, UDP port, and message type"
        },
        "es": {
          "title": "Configura Loopback Host en el perfil de prueba",
          "body": "Trabaja en el area visible Loopback Host de dirección loopback, puerto UDP y tipo de mensaje. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Loopback Host en el perfil de prueba - dirección loopback, puerto UDP y tipo de mensaje"
        },
        "fr": {
          "title": "Configurez Loopback Host dans le profil de test",
          "body": "Travaillez dans la zone visible Loopback Host de adresse loopback, port UDP et type de message. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Loopback Host dans le profil de test - adresse loopback, port UDP et type de message"
        }
      },
      "capture": {
        "route": "/plugins/osc-bridge/ui.html",
        "assertVisible": "#sendHost",
        "focusText": {
          "de": "Loopback Host im Testprofil konfigurieren",
          "en": "Configure Loopback Host in the test profile",
          "es": "Configura Loopback Host en el perfil de prueba",
          "fr": "Configurez Loopback Host dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "loopback-host"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/osc-bridge/ui.html",
        "instructions": {
          "de": {
            "title": "Loopback Host im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Loopback Host von Loopback-Adresse, UDP-Port und Nachrichtentyp. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Loopback Host in the test profile",
            "body": "Work in the visible Loopback Host area of loopback address, UDP port, and message type. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Loopback Host en el perfil de prueba",
            "body": "Trabaja en el area visible Loopback Host de dirección loopback, puerto UDP y tipo de mensaje. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Loopback Host dans le profil de test",
            "body": "Travaillez dans la zone visible Loopback Host de adresse loopback, port UDP et type de message. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/osc-bridge/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#sendHost"
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
              "path": "/plugins/osc-bridge/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#sendHost"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#sendHost",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "udp-port",
      "copy": {
        "de": {
          "title": "UDP Port im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich UDP Port von Loopback-Adresse, UDP-Port und Nachrichtentyp. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "UDP Port im Testprofil konfigurieren - Loopback-Adresse, UDP-Port und Nachrichtentyp"
        },
        "en": {
          "title": "Configure UDP Port in the test profile",
          "body": "Work in the visible UDP Port area of loopback address, UDP port, and message type. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure UDP Port in the test profile - loopback address, UDP port, and message type"
        },
        "es": {
          "title": "Configura UDP Port en el perfil de prueba",
          "body": "Trabaja en el area visible UDP Port de dirección loopback, puerto UDP y tipo de mensaje. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura UDP Port en el perfil de prueba - dirección loopback, puerto UDP y tipo de mensaje"
        },
        "fr": {
          "title": "Configurez UDP Port dans le profil de test",
          "body": "Travaillez dans la zone visible UDP Port de adresse loopback, port UDP et type de message. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez UDP Port dans le profil de test - adresse loopback, port UDP et type de message"
        }
      },
      "capture": {
        "route": "/plugins/osc-bridge/ui.html",
        "assertVisible": "#sendPort",
        "focusText": {
          "de": "UDP Port im Testprofil konfigurieren",
          "en": "Configure UDP Port in the test profile",
          "es": "Configura UDP Port en el perfil de prueba",
          "fr": "Configurez UDP Port dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "udp-port"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/osc-bridge/ui.html",
        "instructions": {
          "de": {
            "title": "UDP Port im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich UDP Port von Loopback-Adresse, UDP-Port und Nachrichtentyp. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure UDP Port in the test profile",
            "body": "Work in the visible UDP Port area of loopback address, UDP port, and message type. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura UDP Port en el perfil de prueba",
            "body": "Trabaja en el area visible UDP Port de dirección loopback, puerto UDP y tipo de mensaje. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez UDP Port dans le profil de test",
            "body": "Travaillez dans la zone visible UDP Port de adresse loopback, port UDP et type de message. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/osc-bridge/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#sendPort"
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
              "path": "/plugins/osc-bridge/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#sendPort"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#sendPort",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "loopback-check",
      "copy": {
        "de": {
          "title": "Loopback Check lokal testen",
          "body": "Fuehre Loopback Check nur mit eine lokale Loopback-Prüfung im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
          "expected": "die Eingaben bleiben auf 127.0.0.1 und es wird kein VRChat-Client gesteuert",
          "alt": "Loopback Check lokal testen - Loopback-Adresse, UDP-Port und Nachrichtentyp"
        },
        "en": {
          "title": "Test Loopback Check locally",
          "body": "Run Loopback Check only with a local loopback check in the isolated test profile; no LIVE source, hardware, or external connection is used.",
          "expected": "inputs remain on 127.0.0.1 and no VRChat client is controlled",
          "alt": "Test Loopback Check locally - loopback address, UDP port, and message type"
        },
        "es": {
          "title": "Prueba Loopback Check localmente",
          "body": "Ejecuta Loopback Check solo con una comprobación loopback local en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
          "expected": "las entradas permanecen en 127.0.0.1 y no se controla ningún cliente VRChat",
          "alt": "Prueba Loopback Check localmente - dirección loopback, puerto UDP y tipo de mensaje"
        },
        "fr": {
          "title": "Testez Loopback Check localement",
          "body": "Executez Loopback Check uniquement avec un contrôle loopback local dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
          "expected": "les entrées restent sur 127.0.0.1 et aucun client VRChat n’est contrôlé",
          "alt": "Testez Loopback Check localement - adresse loopback, port UDP et type de message"
        }
      },
      "capture": {
        "route": "/plugins/osc-bridge/ui.html",
        "assertVisible": "#btn-test",
        "focusText": {
          "de": "Loopback Check lokal testen",
          "en": "Test Loopback Check locally",
          "es": "Prueba Loopback Check localmente",
          "fr": "Testez Loopback Check localement"
        },
        "action": {
          "type": "run-local-preview",
          "stepId": "loopback-check"
        },
        "expected": {
          "de": "die Eingaben bleiben auf 127.0.0.1 und es wird kein VRChat-Client gesteuert",
          "en": "inputs remain on 127.0.0.1 and no VRChat client is controlled",
          "es": "las entradas permanecen en 127.0.0.1 y no se controla ningún cliente VRChat",
          "fr": "les entrées restent sur 127.0.0.1 et aucun client VRChat n’est contrôlé"
        }
      },
      "workflow": {
        "route": "/plugins/osc-bridge/ui.html",
        "instructions": {
          "de": {
            "title": "Loopback Check lokal testen",
            "body": "Fuehre Loopback Check nur mit eine lokale Loopback-Prüfung im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
            "expected": "die Eingaben bleiben auf 127.0.0.1 und es wird kein VRChat-Client gesteuert"
          },
          "en": {
            "title": "Test Loopback Check locally",
            "body": "Run Loopback Check only with a local loopback check in the isolated test profile; no LIVE source, hardware, or external connection is used.",
            "expected": "inputs remain on 127.0.0.1 and no VRChat client is controlled"
          },
          "es": {
            "title": "Prueba Loopback Check localmente",
            "body": "Ejecuta Loopback Check solo con una comprobación loopback local en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
            "expected": "las entradas permanecen en 127.0.0.1 y no se controla ningún cliente VRChat"
          },
          "fr": {
            "title": "Testez Loopback Check localement",
            "body": "Executez Loopback Check uniquement avec un contrôle loopback local dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
            "expected": "les entrées restent sur 127.0.0.1 et aucun client VRChat n’est contrôlé"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/osc-bridge/ui.html"
          },
          {
            "type": "run-local-preview",
            "selector": "#btn-test"
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
              "path": "/plugins/osc-bridge/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#btn-test"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#btn-test",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "osc-review",
      "copy": {
        "de": {
          "title": "OSC Review im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich OSC Review von Loopback-Adresse, UDP-Port und Nachrichtentyp. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die Testkonfiguration ist nachvollziehbar und sicher gespeichert.",
          "alt": "OSC Review im Testprofil konfigurieren - Loopback-Adresse, UDP-Port und Nachrichtentyp"
        },
        "en": {
          "title": "Configure OSC Review in the test profile",
          "body": "Work in the visible OSC Review area of loopback address, UDP port, and message type. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The test configuration is saved safely and can be reviewed.",
          "alt": "Configure OSC Review in the test profile - loopback address, UDP port, and message type"
        },
        "es": {
          "title": "Configura OSC Review en el perfil de prueba",
          "body": "Trabaja en el area visible OSC Review de dirección loopback, puerto UDP y tipo de mensaje. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La configuración de prueba se guarda de forma segura y puede revisarse.",
          "alt": "Configura OSC Review en el perfil de prueba - dirección loopback, puerto UDP y tipo de mensaje"
        },
        "fr": {
          "title": "Configurez OSC Review dans le profil de test",
          "body": "Travaillez dans la zone visible OSC Review de adresse loopback, port UDP et type de message. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La configuration de test est enregistrée de manière sûre et vérifiable.",
          "alt": "Configurez OSC Review dans le profil de test - adresse loopback, port UDP et type de message"
        }
      },
      "capture": {
        "route": "/plugins/osc-bridge/ui.html",
        "assertVisible": "#status-indicator",
        "focusText": {
          "de": "OSC Review im Testprofil konfigurieren",
          "en": "Configure OSC Review in the test profile",
          "es": "Configura OSC Review en el perfil de prueba",
          "fr": "Configurez OSC Review dans le profil de test"
        },
        "action": {
          "type": "save-demo-config",
          "stepId": "osc-review"
        },
        "expected": {
          "de": "Die Testkonfiguration ist nachvollziehbar und sicher gespeichert.",
          "en": "The test configuration is saved safely and can be reviewed.",
          "es": "La configuración de prueba se guarda de forma segura y puede revisarse.",
          "fr": "La configuration de test est enregistrée de manière sûre et vérifiable."
        }
      },
      "workflow": {
        "route": "/plugins/osc-bridge/ui.html",
        "instructions": {
          "de": {
            "title": "OSC Review im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich OSC Review von Loopback-Adresse, UDP-Port und Nachrichtentyp. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die Testkonfiguration ist nachvollziehbar und sicher gespeichert."
          },
          "en": {
            "title": "Configure OSC Review in the test profile",
            "body": "Work in the visible OSC Review area of loopback address, UDP port, and message type. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The test configuration is saved safely and can be reviewed."
          },
          "es": {
            "title": "Configura OSC Review en el perfil de prueba",
            "body": "Trabaja en el area visible OSC Review de dirección loopback, puerto UDP y tipo de mensaje. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La configuración de prueba se guarda de forma segura y puede revisarse."
          },
          "fr": {
            "title": "Configurez OSC Review dans le profil de test",
            "body": "Travaillez dans la zone visible OSC Review de adresse loopback, port UDP et type de message. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La configuration de test est enregistrée de manière sûre et vérifiable."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/osc-bridge/ui.html"
          },
          {
            "type": "save-demo-config",
            "selector": "#status-indicator"
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
              "path": "/plugins/osc-bridge/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#status-indicator"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#status-indicator",
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
