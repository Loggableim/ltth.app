'use strict';

const { exactLocalUrlExpectation } = require('../lib/guide-overlay-entry-points');

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
const guide = {
  "id": "animazingpal",
  "route": "/plugins/animazingpal/ui.html",
  "topic": {
    "de": "Avatar- und Ereigniszuordnung",
    "en": "avatar and event mapping",
    "es": "asignación de avatar y eventos",
    "fr": "mappage d’avatar et d’événements"
  },
  "test": {
    "de": "ein lokales Beispielereignis ohne Kontoanmeldung",
    "en": "a local sample event without account sign-in",
    "es": "un evento de ejemplo local sin iniciar sesión",
    "fr": "un événement local sans connexion au compte"
  },
  "expected": {
    "de": "die Zuordnung wird gespeichert, ohne einen externen Dienst zu kontaktieren",
    "en": "the mapping is saved without contacting an external service",
    "es": "la asignación se guarda sin contactar un servicio externo",
    "fr": "le mappage est enregistré sans contacter de service externe"
  },
  "requirement": "network",
  "safety": "credentials",
  "mode": "ui",
  "overlay": null,
  "related": [
    "talking-heads",
    "osc-bridge"
  ],
  "copy": {
    "de": {
      "title": "AnimazingPal",
      "summary": "AnimazingPal richtet Avatar- und Ereigniszuordnung ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "die Zuordnung wird gespeichert, ohne einen externen Dienst zu kontaktieren",
      "requirements": "LTTH Dashboard; externe Endpunkte bleiben in dieser Anleitung getrennt. Dieser konkrete AnimazingPal-Ablauf behandelt Avatar- und Ereigniszuordnung.",
      "safety": "Keine echten API-Schlüssel oder Konten eingeben; Platzhalter bleiben Platzhalter. Dieser konkrete AnimazingPal-Ablauf behandelt Avatar- und Ereigniszuordnung.",
      "troubleshooting": "Wenn Avatar- und Ereigniszuordnung nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "talking-heads",
        "osc-bridge"
      ]
    },
    "en": {
      "title": "AnimazingPal",
      "summary": "AnimazingPal configures avatar and event mapping with a safe local check instead of a LIVE trigger.",
      "firstResult": "the mapping is saved without contacting an external service",
      "requirements": "LTTH Dashboard; external endpoints remain disconnected in this guide. This AnimazingPal workflow specifically covers avatar and event mapping.",
      "safety": "Do not enter real API keys or accounts; placeholders stay placeholders. This AnimazingPal workflow specifically covers avatar and event mapping.",
      "troubleshooting": "If avatar and event mapping is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "talking-heads",
        "osc-bridge"
      ]
    },
    "es": {
      "title": "AnimazingPal",
      "summary": "AnimazingPal configura asignación de avatar y eventos mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "la asignación se guarda sin contactar un servicio externo",
      "requirements": "El panel de LTTH; los extremos externos permanecen desconectados en esta guía. Este flujo concreto de AnimazingPal trata asignación de avatar y eventos.",
      "safety": "No introduzcas claves API ni cuentas reales; los marcadores siguen siendo marcadores. Este flujo concreto de AnimazingPal trata asignación de avatar y eventos.",
      "troubleshooting": "Si asignación de avatar y eventos no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "talking-heads",
        "osc-bridge"
      ]
    },
    "fr": {
      "title": "AnimazingPal",
      "summary": "AnimazingPal configure mappage d’avatar et d’événements avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "le mappage est enregistré sans contacter de service externe",
      "requirements": "Le tableau de bord LTTH ; les points externes restent déconnectés dans ce guide. Ce flux spécifique de AnimazingPal couvre mappage d’avatar et d’événements.",
      "safety": "Ne saisissez aucune clé API ni compte réel ; les espaces réservés restent des espaces réservés. Ce flux spécifique de AnimazingPal couvre mappage d’avatar et d’événements.",
      "troubleshooting": "Si mappage d’avatar et d’événements n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "talking-heads",
        "osc-bridge"
      ]
    }
  },
  "steps": [
    {
      "id": "avatar-card",
      "copy": {
        "de": {
          "title": "Avatar Card im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Avatar Card von Avatar- und Ereigniszuordnung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "alt": "Avatar Card im Testprofil konfigurieren - Avatar- und Ereigniszuordnung"
        },
        "en": {
          "title": "Configure Avatar Card in the test profile",
          "body": "Work in the visible Avatar Card area of avatar and event mapping. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The relevant plugin surface is visibly identified.",
          "alt": "Configure Avatar Card in the test profile - avatar and event mapping"
        },
        "es": {
          "title": "Configura Avatar Card en el perfil de prueba",
          "body": "Trabaja en el area visible Avatar Card de asignación de avatar y eventos. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La superficie correspondiente del plugin queda identificada.",
          "alt": "Configura Avatar Card en el perfil de prueba - asignación de avatar y eventos"
        },
        "fr": {
          "title": "Configurez Avatar Card dans le profil de test",
          "body": "Travaillez dans la zone visible Avatar Card de mappage d’avatar et d’événements. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La surface de plugin correspondante est clairement visible.",
          "alt": "Configurez Avatar Card dans le profil de test - mappage d’avatar et d’événements"
        }
      },
      "capture": {
        "route": "/plugins/animazingpal/ui.html",
        "assertVisible": "#connectionStatus",
        "focusText": {
          "de": "Avatar Card im Testprofil konfigurieren",
          "en": "Configure Avatar Card in the test profile",
          "es": "Configura Avatar Card en el perfil de prueba",
          "fr": "Configurez Avatar Card dans le profil de test"
        },
        "action": {
          "type": "open-plugin-surface",
          "stepId": "avatar-card"
        },
        "expected": {
          "de": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "en": "The relevant plugin surface is visibly identified.",
          "es": "La superficie correspondiente del plugin queda identificada.",
          "fr": "La surface de plugin correspondante est clairement visible."
        }
      },
      "workflow": {
        "route": "/plugins/animazingpal/ui.html",
        "instructions": {
          "de": {
            "title": "Avatar Card im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Avatar Card von Avatar- und Ereigniszuordnung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar."
          },
          "en": {
            "title": "Configure Avatar Card in the test profile",
            "body": "Work in the visible Avatar Card area of avatar and event mapping. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The relevant plugin surface is visibly identified."
          },
          "es": {
            "title": "Configura Avatar Card en el perfil de prueba",
            "body": "Trabaja en el area visible Avatar Card de asignación de avatar y eventos. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La superficie correspondiente del plugin queda identificada."
          },
          "fr": {
            "title": "Configurez Avatar Card dans le profil de test",
            "body": "Travaillez dans la zone visible Avatar Card de mappage d’avatar et d’événements. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La surface de plugin correspondante est clairement visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/animazingpal/ui.html"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#connectionStatus"
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
              "path": "/plugins/animazingpal/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#connectionStatus"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#connectionStatus",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "avatar-event-map",
      "copy": {
        "de": {
          "title": "Avatar Event MAP im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Avatar Event MAP von Avatar- und Ereigniszuordnung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Avatar Event MAP im Testprofil konfigurieren - Avatar- und Ereigniszuordnung"
        },
        "en": {
          "title": "Configure Avatar Event MAP in the test profile",
          "body": "Work in the visible Avatar Event MAP area of avatar and event mapping. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Avatar Event MAP in the test profile - avatar and event mapping"
        },
        "es": {
          "title": "Configura Avatar Event MAP en el perfil de prueba",
          "body": "Trabaja en el area visible Avatar Event MAP de asignación de avatar y eventos. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Avatar Event MAP en el perfil de prueba - asignación de avatar y eventos"
        },
        "fr": {
          "title": "Configurez Avatar Event MAP dans le profil de test",
          "body": "Travaillez dans la zone visible Avatar Event MAP de mappage d’avatar et d’événements. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Avatar Event MAP dans le profil de test - mappage d’avatar et d’événements"
        }
      },
      "capture": {
        "route": "/plugins/animazingpal/ui.html",
        "assertVisible": "#giftMappingGift",
        "focusText": {
          "de": "Avatar Event MAP im Testprofil konfigurieren",
          "en": "Configure Avatar Event MAP in the test profile",
          "es": "Configura Avatar Event MAP en el perfil de prueba",
          "fr": "Configurez Avatar Event MAP dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "avatar-event-map"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/animazingpal/ui.html",
        "instructions": {
          "de": {
            "title": "Avatar Event MAP im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Avatar Event MAP von Avatar- und Ereigniszuordnung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Avatar Event MAP in the test profile",
            "body": "Work in the visible Avatar Event MAP area of avatar and event mapping. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Avatar Event MAP en el perfil de prueba",
            "body": "Trabaja en el area visible Avatar Event MAP de asignación de avatar y eventos. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Avatar Event MAP dans le profil de test",
            "body": "Travaillez dans la zone visible Avatar Event MAP de mappage d’avatar et d’événements. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/animazingpal/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#giftMappingGift"
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
              "path": "/plugins/animazingpal/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#giftMappingGift"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#giftMappingGift",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "placeholder-provider",
      "copy": {
        "de": {
          "title": "Placeholder Provider im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Placeholder Provider von Avatar- und Ereigniszuordnung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Placeholder Provider im Testprofil konfigurieren - Avatar- und Ereigniszuordnung"
        },
        "en": {
          "title": "Configure Placeholder Provider in the test profile",
          "body": "Work in the visible Placeholder Provider area of avatar and event mapping. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Placeholder Provider in the test profile - avatar and event mapping"
        },
        "es": {
          "title": "Configura Placeholder Provider en el perfil de prueba",
          "body": "Trabaja en el area visible Placeholder Provider de asignación de avatar y eventos. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Placeholder Provider en el perfil de prueba - asignación de avatar y eventos"
        },
        "fr": {
          "title": "Configurez Placeholder Provider dans le profil de test",
          "body": "Travaillez dans la zone visible Placeholder Provider de mappage d’avatar et d’événements. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Placeholder Provider dans le profil de test - mappage d’avatar et d’événements"
        }
      },
      "capture": {
        "route": "/plugins/animazingpal/ui.html",
        "assertVisible": "#followEnabled",
        "focusText": {
          "de": "Placeholder Provider im Testprofil konfigurieren",
          "en": "Configure Placeholder Provider in the test profile",
          "es": "Configura Placeholder Provider en el perfil de prueba",
          "fr": "Configurez Placeholder Provider dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "placeholder-provider"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/animazingpal/ui.html",
        "instructions": {
          "de": {
            "title": "Placeholder Provider im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Placeholder Provider von Avatar- und Ereigniszuordnung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Placeholder Provider in the test profile",
            "body": "Work in the visible Placeholder Provider area of avatar and event mapping. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Placeholder Provider en el perfil de prueba",
            "body": "Trabaja en el area visible Placeholder Provider de asignación de avatar y eventos. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Placeholder Provider dans le profil de test",
            "body": "Travaillez dans la zone visible Placeholder Provider de mappage d’avatar et d’événements. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/animazingpal/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#followEnabled"
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
              "path": "/plugins/animazingpal/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#followEnabled"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#followEnabled",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "sample-event",
      "copy": {
        "de": {
          "title": "Sample Event im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Sample Event von Avatar- und Ereigniszuordnung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Sample Event im Testprofil konfigurieren - Avatar- und Ereigniszuordnung"
        },
        "en": {
          "title": "Configure Sample Event in the test profile",
          "body": "Work in the visible Sample Event area of avatar and event mapping. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Sample Event in the test profile - avatar and event mapping"
        },
        "es": {
          "title": "Configura Sample Event en el perfil de prueba",
          "body": "Trabaja en el area visible Sample Event de asignación de avatar y eventos. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Sample Event en el perfil de prueba - asignación de avatar y eventos"
        },
        "fr": {
          "title": "Configurez Sample Event dans le profil de test",
          "body": "Travaillez dans la zone visible Sample Event de mappage d’avatar et d’événements. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Sample Event dans le profil de test - mappage d’avatar et d’événements"
        }
      },
      "capture": {
        "route": "/plugins/animazingpal/ui.html",
        "assertVisible": "#connectBtn",
        "focusText": {
          "de": "Sample Event im Testprofil konfigurieren",
          "en": "Configure Sample Event in the test profile",
          "es": "Configura Sample Event en el perfil de prueba",
          "fr": "Configurez Sample Event dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "sample-event"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/animazingpal/ui.html",
        "instructions": {
          "de": {
            "title": "Sample Event im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Sample Event von Avatar- und Ereigniszuordnung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Sample Event in the test profile",
            "body": "Work in the visible Sample Event area of avatar and event mapping. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Sample Event en el perfil de prueba",
            "body": "Trabaja en el area visible Sample Event de asignación de avatar y eventos. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Sample Event dans le profil de test",
            "body": "Travaillez dans la zone visible Sample Event de mappage d’avatar et d’événements. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/animazingpal/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#connectBtn"
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
              "path": "/plugins/animazingpal/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#connectBtn"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#connectBtn",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "mapping-review",
      "copy": {
        "de": {
          "title": "Mapping Review im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Mapping Review von Avatar- und Ereigniszuordnung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die Testkonfiguration ist nachvollziehbar und sicher gespeichert.",
          "alt": "Mapping Review im Testprofil konfigurieren - Avatar- und Ereigniszuordnung"
        },
        "en": {
          "title": "Configure Mapping Review in the test profile",
          "body": "Work in the visible Mapping Review area of avatar and event mapping. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The test configuration is saved safely and can be reviewed.",
          "alt": "Configure Mapping Review in the test profile - avatar and event mapping"
        },
        "es": {
          "title": "Configura Mapping Review en el perfil de prueba",
          "body": "Trabaja en el area visible Mapping Review de asignación de avatar y eventos. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La configuración de prueba se guarda de forma segura y puede revisarse.",
          "alt": "Configura Mapping Review en el perfil de prueba - asignación de avatar y eventos"
        },
        "fr": {
          "title": "Configurez Mapping Review dans le profil de test",
          "body": "Travaillez dans la zone visible Mapping Review de mappage d’avatar et d’événements. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La configuration de test est enregistrée de manière sûre et vérifiable.",
          "alt": "Configurez Mapping Review dans le profil de test - mappage d’avatar et d’événements"
        }
      },
      "capture": {
        "route": "/plugins/animazingpal/ui.html",
        "assertVisible": "#tab-settings",
        "focusText": {
          "de": "Mapping Review im Testprofil konfigurieren",
          "en": "Configure Mapping Review in the test profile",
          "es": "Configura Mapping Review en el perfil de prueba",
          "fr": "Configurez Mapping Review dans le profil de test"
        },
        "action": {
          "type": "save-demo-config",
          "stepId": "mapping-review"
        },
        "expected": {
          "de": "Die Testkonfiguration ist nachvollziehbar und sicher gespeichert.",
          "en": "The test configuration is saved safely and can be reviewed.",
          "es": "La configuración de prueba se guarda de forma segura y puede revisarse.",
          "fr": "La configuration de test est enregistrée de manière sûre et vérifiable."
        }
      },
      "workflow": {
        "route": "/plugins/animazingpal/ui.html",
        "instructions": {
          "de": {
            "title": "Mapping Review im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Mapping Review von Avatar- und Ereigniszuordnung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die Testkonfiguration ist nachvollziehbar und sicher gespeichert."
          },
          "en": {
            "title": "Configure Mapping Review in the test profile",
            "body": "Work in the visible Mapping Review area of avatar and event mapping. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The test configuration is saved safely and can be reviewed."
          },
          "es": {
            "title": "Configura Mapping Review en el perfil de prueba",
            "body": "Trabaja en el area visible Mapping Review de asignación de avatar y eventos. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La configuración de prueba se guarda de forma segura y puede revisarse."
          },
          "fr": {
            "title": "Configurez Mapping Review dans le profil de test",
            "body": "Travaillez dans la zone visible Mapping Review de mappage d’avatar et d’événements. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La configuration de test est enregistrée de manière sûre et vérifiable."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/animazingpal/ui.html"
          },
          {
            "type": "save-demo-config",
            "selector": "#tab-settings"
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
              "path": "/plugins/animazingpal/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#tab-settings"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#tab-settings",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    }
  ]
};

function applyWorkflowCorrections(corrections) {
  for (const [id, correction] of Object.entries(corrections)) {
    const step = guide.steps.find((candidate) => candidate.id === id);
    if (!step) throw new Error(`Missing AnimazingPal guide step: ${id}`);
    const focusText = Object.fromEntries(Object.entries(correction.copy).map(([locale, copy]) => [locale, copy.title]));
    const expected = Object.fromEntries(Object.entries(correction.copy).map(([locale, copy]) => [locale, copy.expected]));
    step.copy = correction.copy;
    step.capture = { ...step.capture, assertVisible: correction.selector, focusText, action: { ...correction.action, stepId: id }, expected };
    step.workflow = {
      ...step.workflow,
      instructions: Object.fromEntries(Object.entries(correction.copy).map(([locale, copy]) => [locale, { title: copy.title, body: copy.body, expected: copy.expected }])),
      operations: [{ type: 'goto', route: step.capture.route }, { type: correction.action.type, selector: correction.operationSelector || correction.action.inputSelector || correction.action.clickSelector || correction.selector }],
      postconditions: [
        { type: 'http-status', expected: 200 },
        { type: 'url', expected: exactLocalUrlExpectation(step.capture.route) },
        { type: 'visible', selector: correction.selector },
        ...(correction.postconditions || []),
        { type: 'console', expected: 'no-errors' }
      ],
      captureRule: { ...step.workflow.captureRule, selector: correction.selector, stateChange: correction.stateChange === true }
    };
  }
}

applyWorkflowCorrections({
  'avatar-event-map': {
    selector: '#giftMappingGift',
    action: { type: 'open-plugin-surface' },
    stateChange: false,
    copy: {
      de: { title: 'Geschenkzuordnung pruefen', body: 'Oeffne die Geschenkzuordnung und pruefe den leeren Katalogauswahl-Startzustand. Diese Anleitung verbindet weder Animaze noch einen LIVE-Dienst.', expected: 'Die lokale Geschenkauswahl ist sichtbar; ohne Katalogeintrag wird keine Zuordnung erfunden.', alt: 'Lokale Geschenkauswahl von AnimazingPal' },
      en: { title: 'Inspect gift mapping', body: 'Open gift mapping and inspect its empty catalog-selection starting state. This guide does not connect Animaze or a LIVE service.', expected: 'The local gift selector is visible; no mapping is invented when no catalog entry exists.', alt: 'AnimazingPal local gift selector' },
      es: { title: 'Revisa la asignacion de regalos', body: 'Abre la asignacion de regalos y revisa el estado inicial de seleccion de catalogo vacio. Esta guia no conecta Animaze ni un servicio LIVE.', expected: 'El selector local de regalos es visible; no se inventa una asignacion sin una entrada de catalogo.', alt: 'Selector local de regalos de AnimazingPal' },
      fr: { title: 'Verifiez le mappage des cadeaux', body: 'Ouvrez le mappage des cadeaux et verifiez son etat initial de catalogue vide. Ce guide ne connecte ni Animaze ni un service LIVE.', expected: 'Le selecteur local de cadeaux est visible; aucun mappage nest invente sans entree de catalogue.', alt: 'Selecteur local de cadeaux AnimazingPal' }
    }
  },
  'sample-event': {
    selector: '#testEventData',
    action: { type: 'set-demo-value' },
    stateChange: true,
    postconditions: [
      { type: 'input-value', selector: '#testEventData', expected: 'LTTH docs demo' },
      { type: 'interaction', selector: '#testEventData', expected: { type: 'set-demo-value', changed: true } }
    ],
    copy: {
      de: { title: 'Lokales Beispielereignis vorbereiten', body: 'Trage nur einen lokalen Beispielwert in das JSON-Feld der Logic Matrix ein. Druecke weder Verbinden noch Testen; es wird kein Avatar oder Dienst angesprochen.', expected: 'Der lokale Beispielwert steht im JSON-Feld und kann vor jeder echten Ausfuehrung geprueft werden.', alt: 'Lokales JSON-Beispiel fuer die AnimazingPal Logic Matrix' },
      en: { title: 'Prepare a local sample event', body: 'Enter only a local sample value in the Logic Matrix JSON field. Do not press Connect or Test; no avatar or service is contacted.', expected: 'The local sample value is present in the JSON field and can be reviewed before any real execution.', alt: 'Local JSON sample for the AnimazingPal Logic Matrix' },
      es: { title: 'Prepara un evento de ejemplo local', body: 'Introduce solo un valor de ejemplo local en el campo JSON de Logic Matrix. No pulses Conectar ni Probar; no se contacta ningun avatar ni servicio.', expected: 'El valor de ejemplo local aparece en el campo JSON y puede revisarse antes de una ejecucion real.', alt: 'Ejemplo JSON local para AnimazingPal Logic Matrix' },
      fr: { title: 'Preparez un evenement exemple local', body: 'Saisissez seulement une valeur exemple locale dans le champ JSON de Logic Matrix. Nappuyez ni sur Connecter ni sur Tester; aucun avatar ni service nest contacte.', expected: 'La valeur exemple locale est presente dans le champ JSON et peut etre verifiee avant toute execution reelle.', alt: 'Exemple JSON local pour AnimazingPal Logic Matrix' }
    }
  },
  'mapping-review': {
    selector: '#tab-settings',
    action: { type: 'open-plugin-surface' },
    stateChange: false,
    copy: {
      de: { title: 'Zuordnungs-Einstellungen pruefen', body: 'Pruefe die sichtbare Registerkarte Einstellungen der lokalen Zuordnung. Dieser Schritt speichert nichts, verbindet keinen Avatar und sendet kein LIVE-Ereignis.', expected: 'Die echte Einstellungsregisterkarte ist sichtbar und kann vor einer bewussten Speicherung geprueft werden.', alt: 'Sichtbare AnimazingPal-Einstellungen fuer die Zuordnungspruefung' },
      en: { title: 'Inspect mapping settings', body: 'Inspect the visible local mapping Settings tab. This step saves nothing, connects no avatar, and sends no LIVE event.', expected: 'The real Settings tab is visible and can be reviewed before any deliberate save.', alt: 'Visible AnimazingPal settings for mapping review' },
      es: { title: 'Revisa los ajustes de asignacion', body: 'Revisa la pestana visible de ajustes de asignacion local. Este paso no guarda nada, no conecta avatares ni envia eventos LIVE.', expected: 'La pestana real de ajustes queda visible y puede revisarse antes de guardar deliberadamente.', alt: 'Ajustes visibles de AnimazingPal para revisar la asignacion' },
      fr: { title: 'Verifiez les reglages de mappage', body: 'Verifiez l onglet Reglages visible du mappage local. Cette etape n enregistre rien, ne connecte aucun avatar et n envoie aucun evenement LIVE.', expected: 'Le vrai onglet Reglages est visible et peut etre verifie avant tout enregistrement volontaire.', alt: 'Reglages AnimazingPal visibles pour verifier le mappage' }
    }
  }
});

module.exports = Object.freeze(guide);
