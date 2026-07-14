'use strict';

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
module.exports = Object.freeze({
  "id": "soundboard",
  "route": "/plugins/soundboard/ui/index.html",
  "topic": {
    "de": "Sound-Slot, Lautstärke und Ereigniszuordnung",
    "en": "sound slot, volume, and event mapping",
    "es": "ranura de sonido, volumen y asignación de evento",
    "fr": "slot sonore, volume et mappage d’événement"
  },
  "test": {
    "de": "einen stummen lokalen Soundtest",
    "en": "a muted local sound test",
    "es": "una prueba local de sonido silenciada",
    "fr": "un test sonore local muet"
  },
  "expected": {
    "de": "die Zuordnung wird sichtbar, ohne Audio auszugeben",
    "en": "the mapping becomes visible without audio output",
    "es": "la asignación se hace visible sin emitir audio",
    "fr": "le mappage devient visible sans sortie audio"
  },
  "requirement": "audio",
  "safety": "local",
  "mode": "ui",
  "overlay": null,
  "related": [
    "music-bot",
    "tts"
  ],
  "copy": {
    "de": {
      "title": "Soundboard",
      "summary": "Soundboard richtet Sound-Slot, Lautstärke und Ereigniszuordnung ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "die Zuordnung wird sichtbar, ohne Audio auszugeben",
      "requirements": "LTTH Dashboard und ein lokales Audio-Ausgabegerät. Dieser konkrete Soundboard-Ablauf behandelt Sound-Slot, Lautstärke und Ereigniszuordnung.",
      "safety": "Verwende ausschließlich Demo-Ereignisse und ein temporäres Testprofil. Dieser konkrete Soundboard-Ablauf behandelt Sound-Slot, Lautstärke und Ereigniszuordnung.",
      "troubleshooting": "Wenn Sound-Slot, Lautstärke und Ereigniszuordnung nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "music-bot",
        "tts"
      ]
    },
    "en": {
      "title": "Soundboard",
      "summary": "Soundboard configures sound slot, volume, and event mapping with a safe local check instead of a LIVE trigger.",
      "firstResult": "the mapping becomes visible without audio output",
      "requirements": "LTTH Dashboard and a local audio output device. This Soundboard workflow specifically covers sound slot, volume, and event mapping.",
      "safety": "Use demo events and a temporary test profile only. This Soundboard workflow specifically covers sound slot, volume, and event mapping.",
      "troubleshooting": "If sound slot, volume, and event mapping is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "music-bot",
        "tts"
      ]
    },
    "es": {
      "title": "Soundboard",
      "summary": "Soundboard configura ranura de sonido, volumen y asignación de evento mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "la asignación se hace visible sin emitir audio",
      "requirements": "El panel de LTTH y un dispositivo de salida de audio local. Este flujo concreto de Soundboard trata ranura de sonido, volumen y asignación de evento.",
      "safety": "Usa solo eventos de demostración y un perfil de prueba temporal. Este flujo concreto de Soundboard trata ranura de sonido, volumen y asignación de evento.",
      "troubleshooting": "Si ranura de sonido, volumen y asignación de evento no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "music-bot",
        "tts"
      ]
    },
    "fr": {
      "title": "Soundboard",
      "summary": "Soundboard configure slot sonore, volume et mappage d’événement avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "le mappage devient visible sans sortie audio",
      "requirements": "Le tableau de bord LTTH et un périphérique audio local. Ce flux spécifique de Soundboard couvre slot sonore, volume et mappage d’événement.",
      "safety": "Utilisez uniquement des événements de démonstration et un profil de test temporaire. Ce flux spécifique de Soundboard couvre slot sonore, volume et mappage d’événement.",
      "troubleshooting": "Si slot sonore, volume et mappage d’événement n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "music-bot",
        "tts"
      ]
    }
  },
  "steps": [
    {
      "id": "soundboard-card",
      "copy": {
        "de": {
          "title": "Soundboard Card im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Soundboard Card von Sound-Slot, Lautstärke und Ereigniszuordnung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "alt": "Soundboard Card im Testprofil konfigurieren - Sound-Slot, Lautstärke und Ereigniszuordnung"
        },
        "en": {
          "title": "Configure Soundboard Card in the test profile",
          "body": "Work in the visible Soundboard Card area of sound slot, volume, and event mapping. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The relevant plugin surface is visibly identified.",
          "alt": "Configure Soundboard Card in the test profile - sound slot, volume, and event mapping"
        },
        "es": {
          "title": "Configura Soundboard Card en el perfil de prueba",
          "body": "Trabaja en el area visible Soundboard Card de ranura de sonido, volumen y asignación de evento. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La superficie correspondiente del plugin queda identificada.",
          "alt": "Configura Soundboard Card en el perfil de prueba - ranura de sonido, volumen y asignación de evento"
        },
        "fr": {
          "title": "Configurez Soundboard Card dans le profil de test",
          "body": "Travaillez dans la zone visible Soundboard Card de slot sonore, volume et mappage d’événement. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La surface de plugin correspondante est clairement visible.",
          "alt": "Configurez Soundboard Card dans le profil de test - slot sonore, volume et mappage d’événement"
        }
      },
      "capture": {
        "route": "/plugins/soundboard/ui/index.html",
        "assertVisible": "#overview-enabled-state",
        "focusText": {
          "de": "Soundboard Card im Testprofil konfigurieren",
          "en": "Configure Soundboard Card in the test profile",
          "es": "Configura Soundboard Card en el perfil de prueba",
          "fr": "Configurez Soundboard Card dans le profil de test"
        },
        "action": {
          "type": "open-plugin-surface",
          "stepId": "soundboard-card"
        },
        "expected": {
          "de": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "en": "The relevant plugin surface is visibly identified.",
          "es": "La superficie correspondiente del plugin queda identificada.",
          "fr": "La surface de plugin correspondante est clairement visible."
        }
      },
      "workflow": {
        "route": "/plugins/soundboard/ui/index.html",
        "instructions": {
          "de": {
            "title": "Soundboard Card im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Soundboard Card von Sound-Slot, Lautstärke und Ereigniszuordnung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar."
          },
          "en": {
            "title": "Configure Soundboard Card in the test profile",
            "body": "Work in the visible Soundboard Card area of sound slot, volume, and event mapping. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The relevant plugin surface is visibly identified."
          },
          "es": {
            "title": "Configura Soundboard Card en el perfil de prueba",
            "body": "Trabaja en el area visible Soundboard Card de ranura de sonido, volumen y asignación de evento. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La superficie correspondiente del plugin queda identificada."
          },
          "fr": {
            "title": "Configurez Soundboard Card dans le profil de test",
            "body": "Travaillez dans la zone visible Soundboard Card de slot sonore, volume et mappage d’événement. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La surface de plugin correspondante est clairement visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/soundboard/ui/index.html"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#overview-enabled-state"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/soundboard/ui/index.html"
          },
          {
            "type": "visible",
            "selector": "#overview-enabled-state"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#overview-enabled-state",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "sound-slot",
      "copy": {
        "de": {
          "title": "Sound Slot im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Sound Slot von Sound-Slot, Lautstärke und Ereigniszuordnung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Sound Slot im Testprofil konfigurieren - Sound-Slot, Lautstärke und Ereigniszuordnung"
        },
        "en": {
          "title": "Configure Sound Slot in the test profile",
          "body": "Work in the visible Sound Slot area of sound slot, volume, and event mapping. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Sound Slot in the test profile - sound slot, volume, and event mapping"
        },
        "es": {
          "title": "Configura Sound Slot en el perfil de prueba",
          "body": "Trabaja en el area visible Sound Slot de ranura de sonido, volumen y asignación de evento. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Sound Slot en el perfil de prueba - ranura de sonido, volumen y asignación de evento"
        },
        "fr": {
          "title": "Configurez Sound Slot dans le profil de test",
          "body": "Travaillez dans la zone visible Sound Slot de slot sonore, volume et mappage d’événement. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Sound Slot dans le profil de test - slot sonore, volume et mappage d’événement"
        }
      },
      "capture": {
        "route": "/plugins/soundboard/ui/index.html",
        "assertVisible": "#soundboard-gift-url",
        "focusText": {
          "de": "Sound Slot im Testprofil konfigurieren",
          "en": "Configure Sound Slot in the test profile",
          "es": "Configura Sound Slot en el perfil de prueba",
          "fr": "Configurez Sound Slot dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "prepare": "open-soundboard-event-sounds",
          "stepId": "sound-slot"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/soundboard/ui/index.html",
        "instructions": {
          "de": {
            "title": "Sound Slot im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Sound Slot von Sound-Slot, Lautstärke und Ereigniszuordnung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Sound Slot in the test profile",
            "body": "Work in the visible Sound Slot area of sound slot, volume, and event mapping. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Sound Slot en el perfil de prueba",
            "body": "Trabaja en el area visible Sound Slot de ranura de sonido, volumen y asignación de evento. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Sound Slot dans le profil de test",
            "body": "Travaillez dans la zone visible Sound Slot de slot sonore, volume et mappage d’événement. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/soundboard/ui/index.html"
          },
          {
            "type": "prepare",
            "name": "open-soundboard-event-sounds"
          },
          {
            "type": "set-demo-value",
            "selector": "#soundboard-gift-url"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/soundboard/ui/index.html"
          },
          {
            "type": "visible",
            "selector": "#soundboard-gift-url"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#soundboard-gift-url",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "volume-rule",
      "copy": {
        "de": {
          "title": "Volume Rule im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Volume Rule von Sound-Slot, Lautstärke und Ereigniszuordnung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Volume Rule im Testprofil konfigurieren - Sound-Slot, Lautstärke und Ereigniszuordnung"
        },
        "en": {
          "title": "Configure Volume Rule in the test profile",
          "body": "Work in the visible Volume Rule area of sound slot, volume, and event mapping. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Volume Rule in the test profile - sound slot, volume, and event mapping"
        },
        "es": {
          "title": "Configura Volume Rule en el perfil de prueba",
          "body": "Trabaja en el area visible Volume Rule de ranura de sonido, volumen y asignación de evento. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Volume Rule en el perfil de prueba - ranura de sonido, volumen y asignación de evento"
        },
        "fr": {
          "title": "Configurez Volume Rule dans le profil de test",
          "body": "Travaillez dans la zone visible Volume Rule de slot sonore, volume et mappage d’événement. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Volume Rule dans le profil de test - slot sonore, volume et mappage d’événement"
        }
      },
      "capture": {
        "route": "/plugins/soundboard/ui/index.html",
        "assertVisible": "#soundboard-gift-volume-slider",
        "focusText": {
          "de": "Volume Rule im Testprofil konfigurieren",
          "en": "Configure Volume Rule in the test profile",
          "es": "Configura Volume Rule en el perfil de prueba",
          "fr": "Configurez Volume Rule dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "prepare": "open-soundboard-event-sounds",
          "stepId": "volume-rule"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/soundboard/ui/index.html",
        "instructions": {
          "de": {
            "title": "Volume Rule im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Volume Rule von Sound-Slot, Lautstärke und Ereigniszuordnung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Volume Rule in the test profile",
            "body": "Work in the visible Volume Rule area of sound slot, volume, and event mapping. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Volume Rule en el perfil de prueba",
            "body": "Trabaja en el area visible Volume Rule de ranura de sonido, volumen y asignación de evento. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Volume Rule dans le profil de test",
            "body": "Travaillez dans la zone visible Volume Rule de slot sonore, volume et mappage d’événement. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/soundboard/ui/index.html"
          },
          {
            "type": "prepare",
            "name": "open-soundboard-event-sounds"
          },
          {
            "type": "set-demo-value",
            "selector": "#soundboard-gift-volume-slider"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/soundboard/ui/index.html"
          },
          {
            "type": "visible",
            "selector": "#soundboard-gift-volume-slider"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#soundboard-gift-volume-slider",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "muted-sound-test",
      "copy": {
        "de": {
          "title": "Muted Sound Test lokal testen",
          "body": "Fuehre Muted Sound Test nur mit einen stummen lokalen Soundtest im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
          "expected": "die Zuordnung wird sichtbar, ohne Audio auszugeben",
          "alt": "Muted Sound Test lokal testen - Sound-Slot, Lautstärke und Ereigniszuordnung"
        },
        "en": {
          "title": "Test Muted Sound Test locally",
          "body": "Run Muted Sound Test only with a muted local sound test in the isolated test profile; no LIVE source, hardware, or external connection is used.",
          "expected": "the mapping becomes visible without audio output",
          "alt": "Test Muted Sound Test locally - sound slot, volume, and event mapping"
        },
        "es": {
          "title": "Prueba Muted Sound Test localmente",
          "body": "Ejecuta Muted Sound Test solo con una prueba local de sonido silenciada en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
          "expected": "la asignación se hace visible sin emitir audio",
          "alt": "Prueba Muted Sound Test localmente - ranura de sonido, volumen y asignación de evento"
        },
        "fr": {
          "title": "Testez Muted Sound Test localement",
          "body": "Executez Muted Sound Test uniquement avec un test sonore local muet dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
          "expected": "le mappage devient visible sans sortie audio",
          "alt": "Testez Muted Sound Test localement - slot sonore, volume et mappage d’événement"
        }
      },
      "capture": {
        "route": "/plugins/soundboard/ui/index.html",
        "assertVisible": "#test-focused-animation-btn",
        "focusText": {
          "de": "Muted Sound Test lokal testen",
          "en": "Test Muted Sound Test locally",
          "es": "Prueba Muted Sound Test localmente",
          "fr": "Testez Muted Sound Test localement"
        },
        "action": {
          "type": "run-local-preview",
          "prepare": "open-soundboard-obs-overlay",
          "stepId": "muted-sound-test"
        },
        "expected": {
          "de": "die Zuordnung wird sichtbar, ohne Audio auszugeben",
          "en": "the mapping becomes visible without audio output",
          "es": "la asignación se hace visible sin emitir audio",
          "fr": "le mappage devient visible sans sortie audio"
        }
      },
      "workflow": {
        "route": "/plugins/soundboard/ui/index.html",
        "instructions": {
          "de": {
            "title": "Muted Sound Test lokal testen",
            "body": "Fuehre Muted Sound Test nur mit einen stummen lokalen Soundtest im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
            "expected": "die Zuordnung wird sichtbar, ohne Audio auszugeben"
          },
          "en": {
            "title": "Test Muted Sound Test locally",
            "body": "Run Muted Sound Test only with a muted local sound test in the isolated test profile; no LIVE source, hardware, or external connection is used.",
            "expected": "the mapping becomes visible without audio output"
          },
          "es": {
            "title": "Prueba Muted Sound Test localmente",
            "body": "Ejecuta Muted Sound Test solo con una prueba local de sonido silenciada en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
            "expected": "la asignación se hace visible sin emitir audio"
          },
          "fr": {
            "title": "Testez Muted Sound Test localement",
            "body": "Executez Muted Sound Test uniquement avec un test sonore local muet dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
            "expected": "le mappage devient visible sans sortie audio"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/soundboard/ui/index.html"
          },
          {
            "type": "prepare",
            "name": "open-soundboard-obs-overlay"
          },
          {
            "type": "run-local-preview",
            "selector": "#test-focused-animation-btn"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/soundboard/ui/index.html"
          },
          {
            "type": "visible",
            "selector": "#test-focused-animation-btn"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#test-focused-animation-btn",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "soundboard-review",
      "copy": {
        "de": {
          "title": "Soundboard Review im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Soundboard Review von Sound-Slot, Lautstärke und Ereigniszuordnung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die Testkonfiguration ist nachvollziehbar und sicher gespeichert.",
          "alt": "Soundboard Review im Testprofil konfigurieren - Sound-Slot, Lautstärke und Ereigniszuordnung"
        },
        "en": {
          "title": "Configure Soundboard Review in the test profile",
          "body": "Work in the visible Soundboard Review area of sound slot, volume, and event mapping. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The test configuration is saved safely and can be reviewed.",
          "alt": "Configure Soundboard Review in the test profile - sound slot, volume, and event mapping"
        },
        "es": {
          "title": "Configura Soundboard Review en el perfil de prueba",
          "body": "Trabaja en el area visible Soundboard Review de ranura de sonido, volumen y asignación de evento. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La configuración de prueba se guarda de forma segura y puede revisarse.",
          "alt": "Configura Soundboard Review en el perfil de prueba - ranura de sonido, volumen y asignación de evento"
        },
        "fr": {
          "title": "Configurez Soundboard Review dans le profil de test",
          "body": "Travaillez dans la zone visible Soundboard Review de slot sonore, volume et mappage d’événement. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La configuration de test est enregistrée de manière sûre et vérifiable.",
          "alt": "Configurez Soundboard Review dans le profil de test - slot sonore, volume et mappage d’événement"
        }
      },
      "capture": {
        "route": "/plugins/soundboard/ui/index.html",
        "assertVisible": "#soundboard-save-state",
        "focusText": {
          "de": "Soundboard Review im Testprofil konfigurieren",
          "en": "Configure Soundboard Review in the test profile",
          "es": "Configura Soundboard Review en el perfil de prueba",
          "fr": "Configurez Soundboard Review dans le profil de test"
        },
        "action": {
          "type": "save-demo-config",
          "stepId": "soundboard-review"
        },
        "expected": {
          "de": "Die Testkonfiguration ist nachvollziehbar und sicher gespeichert.",
          "en": "The test configuration is saved safely and can be reviewed.",
          "es": "La configuración de prueba se guarda de forma segura y puede revisarse.",
          "fr": "La configuration de test est enregistrée de manière sûre et vérifiable."
        }
      },
      "workflow": {
        "route": "/plugins/soundboard/ui/index.html",
        "instructions": {
          "de": {
            "title": "Soundboard Review im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Soundboard Review von Sound-Slot, Lautstärke und Ereigniszuordnung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die Testkonfiguration ist nachvollziehbar und sicher gespeichert."
          },
          "en": {
            "title": "Configure Soundboard Review in the test profile",
            "body": "Work in the visible Soundboard Review area of sound slot, volume, and event mapping. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The test configuration is saved safely and can be reviewed."
          },
          "es": {
            "title": "Configura Soundboard Review en el perfil de prueba",
            "body": "Trabaja en el area visible Soundboard Review de ranura de sonido, volumen y asignación de evento. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La configuración de prueba se guarda de forma segura y puede revisarse."
          },
          "fr": {
            "title": "Configurez Soundboard Review dans le profil de test",
            "body": "Travaillez dans la zone visible Soundboard Review de slot sonore, volume et mappage d’événement. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La configuration de test est enregistrée de manière sûre et vérifiable."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/soundboard/ui/index.html"
          },
          {
            "type": "save-demo-config",
            "selector": "#soundboard-save-state"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/soundboard/ui/index.html"
          },
          {
            "type": "visible",
            "selector": "#soundboard-save-state"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#soundboard-save-state",
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
