'use strict';

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
module.exports = Object.freeze({
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
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/animazingpal/ui.html"
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
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/animazingpal/ui.html"
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
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/animazingpal/ui.html"
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
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/animazingpal/ui.html"
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
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/animazingpal/ui.html"
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
});
