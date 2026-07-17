'use strict';

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
module.exports = Object.freeze({
  "id": "tts",
  "route": "/plugins/tts/ui/admin-panel.html",
  "topic": {
    "de": "Stimme, Warteschlange und Moderationsfilter",
    "en": "voice, queue, and moderation filter",
    "es": "voz, cola y filtro de moderación",
    "fr": "voix, file et filtre de modération"
  },
  "test": {
    "de": "eine stumme lokale Sprachvorschau",
    "en": "a muted local speech preview",
    "es": "una vista previa de voz local silenciada",
    "fr": "un aperçu vocal local muet"
  },
  "expected": {
    "de": "die Vorschau validiert Text und Stimme, ohne Audio auszugeben",
    "en": "the preview validates text and voice without audio output",
    "es": "la vista previa valida texto y voz sin emitir audio",
    "fr": "l’aperçu valide le texte et la voix sans sortie audio"
  },
  "requirement": "audio",
  "safety": "credentials",
  "mode": "ui",
  "overlay": null,
  "related": [
    "talking-heads",
    "soundboard"
  ],
  "copy": {
    "de": {
      "title": "Text-to-Speech System",
      "summary": "Text-to-Speech System richtet Stimme, Warteschlange und Moderationsfilter ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "die Vorschau validiert Text und Stimme, ohne Audio auszugeben",
      "requirements": "LTTH Dashboard und ein lokales Audio-Ausgabegerät. Dieser konkrete Text-to-Speech System-Ablauf behandelt Stimme, Warteschlange und Moderationsfilter.",
      "safety": "Keine echten API-Schlüssel oder Konten eingeben; Platzhalter bleiben Platzhalter. Dieser konkrete Text-to-Speech System-Ablauf behandelt Stimme, Warteschlange und Moderationsfilter.",
      "troubleshooting": "Wenn Stimme, Warteschlange und Moderationsfilter nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "talking-heads",
        "soundboard"
      ]
    },
    "en": {
      "title": "Text-to-Speech System",
      "summary": "Text-to-Speech System configures voice, queue, and moderation filter with a safe local check instead of a LIVE trigger.",
      "firstResult": "the preview validates text and voice without audio output",
      "requirements": "LTTH Dashboard and a local audio output device. This Text-to-Speech System workflow specifically covers voice, queue, and moderation filter.",
      "safety": "Do not enter real API keys or accounts; placeholders stay placeholders. This Text-to-Speech System workflow specifically covers voice, queue, and moderation filter.",
      "troubleshooting": "If voice, queue, and moderation filter is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "talking-heads",
        "soundboard"
      ]
    },
    "es": {
      "title": "Text-to-Speech System",
      "summary": "Text-to-Speech System configura voz, cola y filtro de moderación mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "la vista previa valida texto y voz sin emitir audio",
      "requirements": "El panel de LTTH y un dispositivo de salida de audio local. Este flujo concreto de Text-to-Speech System trata voz, cola y filtro de moderación.",
      "safety": "No introduzcas claves API ni cuentas reales; los marcadores siguen siendo marcadores. Este flujo concreto de Text-to-Speech System trata voz, cola y filtro de moderación.",
      "troubleshooting": "Si voz, cola y filtro de moderación no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "talking-heads",
        "soundboard"
      ]
    },
    "fr": {
      "title": "Text-to-Speech System",
      "summary": "Text-to-Speech System configure voix, file et filtre de modération avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "l’aperçu valide le texte et la voix sans sortie audio",
      "requirements": "Le tableau de bord LTTH et un périphérique audio local. Ce flux spécifique de Text-to-Speech System couvre voix, file et filtre de modération.",
      "safety": "Ne saisissez aucune clé API ni compte réel ; les espaces réservés restent des espaces réservés. Ce flux spécifique de Text-to-Speech System couvre voix, file et filtre de modération.",
      "troubleshooting": "Si voix, file et filtre de modération n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "talking-heads",
        "soundboard"
      ]
    }
  },
  "steps": [
    {
      "id": "tts-card",
      "copy": {
        "de": {
          "title": "TTS Card im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich TTS Card von Stimme, Warteschlange und Moderationsfilter. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "alt": "TTS Card im Testprofil konfigurieren - Stimme, Warteschlange und Moderationsfilter"
        },
        "en": {
          "title": "Configure TTS Card in the test profile",
          "body": "Work in the visible TTS Card area of voice, queue, and moderation filter. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The relevant plugin surface is visibly identified.",
          "alt": "Configure TTS Card in the test profile - voice, queue, and moderation filter"
        },
        "es": {
          "title": "Configura TTS Card en el perfil de prueba",
          "body": "Trabaja en el area visible TTS Card de voz, cola y filtro de moderación. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La superficie correspondiente del plugin queda identificada.",
          "alt": "Configura TTS Card en el perfil de prueba - voz, cola y filtro de moderación"
        },
        "fr": {
          "title": "Configurez TTS Card dans le profil de test",
          "body": "Travaillez dans la zone visible TTS Card de voix, file et filtre de modération. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La surface de plugin correspondante est clairement visible.",
          "alt": "Configurez TTS Card dans le profil de test - voix, file et filtre de modération"
        }
      },
      "capture": {
        "route": "/plugins/tts/ui/admin-panel.html",
        "assertVisible": "#content-config",
        "focusText": {
          "de": "TTS Card im Testprofil konfigurieren",
          "en": "Configure TTS Card in the test profile",
          "es": "Configura TTS Card en el perfil de prueba",
          "fr": "Configurez TTS Card dans le profil de test"
        },
        "action": {
          "type": "open-plugin-surface",
          "stepId": "tts-card"
        },
        "expected": {
          "de": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "en": "The relevant plugin surface is visibly identified.",
          "es": "La superficie correspondiente del plugin queda identificada.",
          "fr": "La surface de plugin correspondante est clairement visible."
        }
      },
      "workflow": {
        "route": "/plugins/tts/ui/admin-panel.html",
        "instructions": {
          "de": {
            "title": "TTS Card im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich TTS Card von Stimme, Warteschlange und Moderationsfilter. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar."
          },
          "en": {
            "title": "Configure TTS Card in the test profile",
            "body": "Work in the visible TTS Card area of voice, queue, and moderation filter. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The relevant plugin surface is visibly identified."
          },
          "es": {
            "title": "Configura TTS Card en el perfil de prueba",
            "body": "Trabaja en el area visible TTS Card de voz, cola y filtro de moderación. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La superficie correspondiente del plugin queda identificada."
          },
          "fr": {
            "title": "Configurez TTS Card dans le profil de test",
            "body": "Travaillez dans la zone visible TTS Card de voix, file et filtre de modération. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La surface de plugin correspondante est clairement visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/tts/ui/admin-panel.html"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#content-config"
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
              "path": "/plugins/tts/ui/admin-panel.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#content-config"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#content-config",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "voice-select",
      "copy": {
        "de": {
          "title": "Voice Select im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Voice Select von Stimme, Warteschlange und Moderationsfilter. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Voice Select im Testprofil konfigurieren - Stimme, Warteschlange und Moderationsfilter"
        },
        "en": {
          "title": "Configure Voice Select in the test profile",
          "body": "Work in the visible Voice Select area of voice, queue, and moderation filter. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Voice Select in the test profile - voice, queue, and moderation filter"
        },
        "es": {
          "title": "Configura Voice Select en el perfil de prueba",
          "body": "Trabaja en el area visible Voice Select de voz, cola y filtro de moderación. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Voice Select en el perfil de prueba - voz, cola y filtro de moderación"
        },
        "fr": {
          "title": "Configurez Voice Select dans le profil de test",
          "body": "Travaillez dans la zone visible Voice Select de voix, file et filtre de modération. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Voice Select dans le profil de test - voix, file et filtre de modération"
        }
      },
      "capture": {
        "route": "/plugins/tts/ui/admin-panel.html",
        "assertVisible": "#defaultVoice",
        "focusText": {
          "de": "Voice Select im Testprofil konfigurieren",
          "en": "Configure Voice Select in the test profile",
          "es": "Configura Voice Select en el perfil de prueba",
          "fr": "Configurez Voice Select dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "voice-select"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/tts/ui/admin-panel.html",
        "instructions": {
          "de": {
            "title": "Voice Select im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Voice Select von Stimme, Warteschlange und Moderationsfilter. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Voice Select in the test profile",
            "body": "Work in the visible Voice Select area of voice, queue, and moderation filter. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Voice Select en el perfil de prueba",
            "body": "Trabaja en el area visible Voice Select de voz, cola y filtro de moderación. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Voice Select dans le profil de test",
            "body": "Travaillez dans la zone visible Voice Select de voix, file et filtre de modération. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/tts/ui/admin-panel.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#defaultVoice"
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
              "path": "/plugins/tts/ui/admin-panel.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#defaultVoice"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#defaultVoice",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "moderation-filter",
      "copy": {
        "de": {
          "title": "Moderation Filter im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Moderation Filter von Stimme, Warteschlange und Moderationsfilter. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Moderation Filter im Testprofil konfigurieren - Stimme, Warteschlange und Moderationsfilter"
        },
        "en": {
          "title": "Configure Moderation Filter in the test profile",
          "body": "Work in the visible Moderation Filter area of voice, queue, and moderation filter. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Moderation Filter in the test profile - voice, queue, and moderation filter"
        },
        "es": {
          "title": "Configura Moderation Filter en el perfil de prueba",
          "body": "Trabaja en el area visible Moderation Filter de voz, cola y filtro de moderación. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Moderation Filter en el perfil de prueba - voz, cola y filtro de moderación"
        },
        "fr": {
          "title": "Configurez Moderation Filter dans le profil de test",
          "body": "Travaillez dans la zone visible Moderation Filter de voix, file et filtre de modération. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Moderation Filter dans le profil de test - voix, file et filtre de modération"
        }
      },
      "capture": {
        "route": "/plugins/tts/ui/admin-panel.html",
        "assertVisible": "#profanityFilter",
        "focusText": {
          "de": "Moderation Filter im Testprofil konfigurieren",
          "en": "Configure Moderation Filter in the test profile",
          "es": "Configura Moderation Filter en el perfil de prueba",
          "fr": "Configurez Moderation Filter dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "moderation-filter"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/tts/ui/admin-panel.html",
        "instructions": {
          "de": {
            "title": "Moderation Filter im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Moderation Filter von Stimme, Warteschlange und Moderationsfilter. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Moderation Filter in the test profile",
            "body": "Work in the visible Moderation Filter area of voice, queue, and moderation filter. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Moderation Filter en el perfil de prueba",
            "body": "Trabaja en el area visible Moderation Filter de voz, cola y filtro de moderación. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Moderation Filter dans le profil de test",
            "body": "Travaillez dans la zone visible Moderation Filter de voix, file et filtre de modération. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/tts/ui/admin-panel.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#profanityFilter"
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
              "path": "/plugins/tts/ui/admin-panel.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#profanityFilter"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#profanityFilter",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "muted-voice-preview",
      "copy": {
        "de": {
          "title": "Muted Voice Preview lokal testen",
          "body": "Fuehre Muted Voice Preview nur mit eine stumme lokale Sprachvorschau im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
          "expected": "die Vorschau validiert Text und Stimme, ohne Audio auszugeben",
          "alt": "Muted Voice Preview lokal testen - Stimme, Warteschlange und Moderationsfilter"
        },
        "en": {
          "title": "Test Muted Voice Preview locally",
          "body": "Run Muted Voice Preview only with a muted local speech preview in the isolated test profile; no LIVE source, hardware, or external connection is used.",
          "expected": "the preview validates text and voice without audio output",
          "alt": "Test Muted Voice Preview locally - voice, queue, and moderation filter"
        },
        "es": {
          "title": "Prueba Muted Voice Preview localmente",
          "body": "Ejecuta Muted Voice Preview solo con una vista previa de voz local silenciada en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
          "expected": "la vista previa valida texto y voz sin emitir audio",
          "alt": "Prueba Muted Voice Preview localmente - voz, cola y filtro de moderación"
        },
        "fr": {
          "title": "Testez Muted Voice Preview localement",
          "body": "Executez Muted Voice Preview uniquement avec un aperçu vocal local muet dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
          "expected": "l’aperçu valide le texte et la voix sans sortie audio",
          "alt": "Testez Muted Voice Preview localement - voix, file et filtre de modération"
        }
      },
      "capture": {
        "route": "/plugins/tts/ui/admin-panel.html",
        "assertVisible": "#saveConfigBtnSidebar",
        "focusText": {
          "de": "Muted Voice Preview lokal testen",
          "en": "Test Muted Voice Preview locally",
          "es": "Prueba Muted Voice Preview localmente",
          "fr": "Testez Muted Voice Preview localement"
        },
        "action": {
          "type": "run-local-preview",
          "stepId": "muted-voice-preview"
        },
        "expected": {
          "de": "die Vorschau validiert Text und Stimme, ohne Audio auszugeben",
          "en": "the preview validates text and voice without audio output",
          "es": "la vista previa valida texto y voz sin emitir audio",
          "fr": "l’aperçu valide le texte et la voix sans sortie audio"
        }
      },
      "workflow": {
        "route": "/plugins/tts/ui/admin-panel.html",
        "instructions": {
          "de": {
            "title": "Muted Voice Preview lokal testen",
            "body": "Fuehre Muted Voice Preview nur mit eine stumme lokale Sprachvorschau im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
            "expected": "die Vorschau validiert Text und Stimme, ohne Audio auszugeben"
          },
          "en": {
            "title": "Test Muted Voice Preview locally",
            "body": "Run Muted Voice Preview only with a muted local speech preview in the isolated test profile; no LIVE source, hardware, or external connection is used.",
            "expected": "the preview validates text and voice without audio output"
          },
          "es": {
            "title": "Prueba Muted Voice Preview localmente",
            "body": "Ejecuta Muted Voice Preview solo con una vista previa de voz local silenciada en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
            "expected": "la vista previa valida texto y voz sin emitir audio"
          },
          "fr": {
            "title": "Testez Muted Voice Preview localement",
            "body": "Executez Muted Voice Preview uniquement avec un aperçu vocal local muet dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
            "expected": "l’aperçu valide le texte et la voix sans sortie audio"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/tts/ui/admin-panel.html"
          },
          {
            "type": "run-local-preview",
            "selector": "#saveConfigBtnSidebar"
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
              "path": "/plugins/tts/ui/admin-panel.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#saveConfigBtnSidebar"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#saveConfigBtnSidebar",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "tts-review",
      "copy": {
        "de": {
          "title": "TTS Review im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich TTS Review von Stimme, Warteschlange und Moderationsfilter. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die Testkonfiguration ist nachvollziehbar und sicher gespeichert.",
          "alt": "TTS Review im Testprofil konfigurieren - Stimme, Warteschlange und Moderationsfilter"
        },
        "en": {
          "title": "Configure TTS Review in the test profile",
          "body": "Work in the visible TTS Review area of voice, queue, and moderation filter. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The test configuration is saved safely and can be reviewed.",
          "alt": "Configure TTS Review in the test profile - voice, queue, and moderation filter"
        },
        "es": {
          "title": "Configura TTS Review en el perfil de prueba",
          "body": "Trabaja en el area visible TTS Review de voz, cola y filtro de moderación. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La configuración de prueba se guarda de forma segura y puede revisarse.",
          "alt": "Configura TTS Review en el perfil de prueba - voz, cola y filtro de moderación"
        },
        "fr": {
          "title": "Configurez TTS Review dans le profil de test",
          "body": "Travaillez dans la zone visible TTS Review de voix, file et filtre de modération. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La configuration de test est enregistrée de manière sûre et vérifiable.",
          "alt": "Configurez TTS Review dans le profil de test - voix, file et filtre de modération"
        }
      },
      "capture": {
        "route": "/plugins/tts/ui/admin-panel.html",
        "assertVisible": "#overviewQueueLength",
        "focusText": {
          "de": "TTS Review im Testprofil konfigurieren",
          "en": "Configure TTS Review in the test profile",
          "es": "Configura TTS Review en el perfil de prueba",
          "fr": "Configurez TTS Review dans le profil de test"
        },
        "action": {
          "type": "save-demo-config",
          "stepId": "tts-review"
        },
        "expected": {
          "de": "Die Testkonfiguration ist nachvollziehbar und sicher gespeichert.",
          "en": "The test configuration is saved safely and can be reviewed.",
          "es": "La configuración de prueba se guarda de forma segura y puede revisarse.",
          "fr": "La configuration de test est enregistrée de manière sûre et vérifiable."
        }
      },
      "workflow": {
        "route": "/plugins/tts/ui/admin-panel.html",
        "instructions": {
          "de": {
            "title": "TTS Review im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich TTS Review von Stimme, Warteschlange und Moderationsfilter. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die Testkonfiguration ist nachvollziehbar und sicher gespeichert."
          },
          "en": {
            "title": "Configure TTS Review in the test profile",
            "body": "Work in the visible TTS Review area of voice, queue, and moderation filter. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The test configuration is saved safely and can be reviewed."
          },
          "es": {
            "title": "Configura TTS Review en el perfil de prueba",
            "body": "Trabaja en el area visible TTS Review de voz, cola y filtro de moderación. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La configuración de prueba se guarda de forma segura y puede revisarse."
          },
          "fr": {
            "title": "Configurez TTS Review dans le profil de test",
            "body": "Travaillez dans la zone visible TTS Review de voix, file et filtre de modération. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La configuration de test est enregistrée de manière sûre et vérifiable."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/tts/ui/admin-panel.html"
          },
          {
            "type": "save-demo-config",
            "selector": "#overviewQueueLength"
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
              "path": "/plugins/tts/ui/admin-panel.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#overviewQueueLength"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#overviewQueueLength",
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
