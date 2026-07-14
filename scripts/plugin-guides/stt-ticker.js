'use strict';

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
module.exports = Object.freeze({
  "id": "stt-ticker",
  "route": "/plugins/stt-ticker/ui.html",
  "topic": {
    "de": "Sprache, Untertitelmodus und Textstil",
    "en": "language, subtitle mode, and text style",
    "es": "idioma, modo de subtítulos y estilo de texto",
    "fr": "langue, mode de sous-titres et style de texte"
  },
  "test": {
    "de": "einen lokalen Beispielsatz",
    "en": "a local sample sentence",
    "es": "una frase de ejemplo local",
    "fr": "une phrase locale d’exemple"
  },
  "expected": {
    "de": "der Satz erscheint im Ticker ohne Mikrofonaufnahme",
    "en": "the sentence appears in the ticker without microphone capture",
    "es": "la frase aparece en el ticker sin captura de micrófono",
    "fr": "la phrase apparaît dans le ticker sans capture micro"
  },
  "requirement": "obs",
  "safety": "local",
  "mode": "ui",
  "overlay": "/plugins/stt-ticker/overlay/ticker.html",
  "related": [
    "osc-bridge",
    "talking-heads"
  ],
  "copy": {
    "de": {
      "title": "STT Ticker",
      "summary": "STT Ticker richtet Sprache, Untertitelmodus und Textstil ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "der Satz erscheint im Ticker ohne Mikrofonaufnahme",
      "requirements": "LTTH Dashboard; für die Ausgabe zusätzlich eine OBS-Testszene. Dieser konkrete STT Ticker-Ablauf behandelt Sprache, Untertitelmodus und Textstil.",
      "safety": "Verwende ausschließlich Demo-Ereignisse und ein temporäres Testprofil. Dieser konkrete STT Ticker-Ablauf behandelt Sprache, Untertitelmodus und Textstil.",
      "troubleshooting": "Wenn Sprache, Untertitelmodus und Textstil nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "osc-bridge",
        "talking-heads"
      ]
    },
    "en": {
      "title": "STT Ticker",
      "summary": "STT Ticker configures language, subtitle mode, and text style with a safe local check instead of a LIVE trigger.",
      "firstResult": "the sentence appears in the ticker without microphone capture",
      "requirements": "LTTH Dashboard; use an OBS test scene for output. This STT Ticker workflow specifically covers language, subtitle mode, and text style.",
      "safety": "Use demo events and a temporary test profile only. This STT Ticker workflow specifically covers language, subtitle mode, and text style.",
      "troubleshooting": "If language, subtitle mode, and text style is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "osc-bridge",
        "talking-heads"
      ]
    },
    "es": {
      "title": "STT Ticker",
      "summary": "STT Ticker configura idioma, modo de subtítulos y estilo de texto mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "la frase aparece en el ticker sin captura de micrófono",
      "requirements": "El panel de LTTH y una escena de prueba de OBS para la salida. Este flujo concreto de STT Ticker trata idioma, modo de subtítulos y estilo de texto.",
      "safety": "Usa solo eventos de demostración y un perfil de prueba temporal. Este flujo concreto de STT Ticker trata idioma, modo de subtítulos y estilo de texto.",
      "troubleshooting": "Si idioma, modo de subtítulos y estilo de texto no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "osc-bridge",
        "talking-heads"
      ]
    },
    "fr": {
      "title": "STT Ticker",
      "summary": "STT Ticker configure langue, mode de sous-titres et style de texte avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "la phrase apparaît dans le ticker sans capture micro",
      "requirements": "Le tableau de bord LTTH et une scène de test OBS pour la sortie. Ce flux spécifique de STT Ticker couvre langue, mode de sous-titres et style de texte.",
      "safety": "Utilisez uniquement des événements de démonstration et un profil de test temporaire. Ce flux spécifique de STT Ticker couvre langue, mode de sous-titres et style de texte.",
      "troubleshooting": "Si langue, mode de sous-titres et style de texte n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "osc-bridge",
        "talking-heads"
      ]
    }
  },
  "steps": [
    {
      "id": "ticker-card",
      "copy": {
        "de": {
          "title": "Ticker Card im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Ticker Card von Sprache, Untertitelmodus und Textstil. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "alt": "Ticker Card im Testprofil konfigurieren - Sprache, Untertitelmodus und Textstil"
        },
        "en": {
          "title": "Configure Ticker Card in the test profile",
          "body": "Work in the visible Ticker Card area of language, subtitle mode, and text style. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The relevant plugin surface is visibly identified.",
          "alt": "Configure Ticker Card in the test profile - language, subtitle mode, and text style"
        },
        "es": {
          "title": "Configura Ticker Card en el perfil de prueba",
          "body": "Trabaja en el area visible Ticker Card de idioma, modo de subtítulos y estilo de texto. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La superficie correspondiente del plugin queda identificada.",
          "alt": "Configura Ticker Card en el perfil de prueba - idioma, modo de subtítulos y estilo de texto"
        },
        "fr": {
          "title": "Configurez Ticker Card dans le profil de test",
          "body": "Travaillez dans la zone visible Ticker Card de langue, mode de sous-titres et style de texte. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La surface de plugin correspondante est clairement visible.",
          "alt": "Configurez Ticker Card dans le profil de test - langue, mode de sous-titres et style de texte"
        }
      },
      "capture": {
        "route": "/plugins/stt-ticker/ui.html",
        "assertVisible": "#tabs",
        "focusText": {
          "de": "Ticker Card im Testprofil konfigurieren",
          "en": "Configure Ticker Card in the test profile",
          "es": "Configura Ticker Card en el perfil de prueba",
          "fr": "Configurez Ticker Card dans le profil de test"
        },
        "action": {
          "type": "open-plugin-surface",
          "stepId": "ticker-card"
        },
        "expected": {
          "de": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "en": "The relevant plugin surface is visibly identified.",
          "es": "La superficie correspondiente del plugin queda identificada.",
          "fr": "La surface de plugin correspondante est clairement visible."
        }
      },
      "workflow": {
        "route": "/plugins/stt-ticker/ui.html",
        "instructions": {
          "de": {
            "title": "Ticker Card im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Ticker Card von Sprache, Untertitelmodus und Textstil. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar."
          },
          "en": {
            "title": "Configure Ticker Card in the test profile",
            "body": "Work in the visible Ticker Card area of language, subtitle mode, and text style. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The relevant plugin surface is visibly identified."
          },
          "es": {
            "title": "Configura Ticker Card en el perfil de prueba",
            "body": "Trabaja en el area visible Ticker Card de idioma, modo de subtítulos y estilo de texto. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La superficie correspondiente del plugin queda identificada."
          },
          "fr": {
            "title": "Configurez Ticker Card dans le profil de test",
            "body": "Travaillez dans la zone visible Ticker Card de langue, mode de sous-titres et style de texte. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La surface de plugin correspondante est clairement visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/stt-ticker/ui.html"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#tabs"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/stt-ticker/ui.html"
          },
          {
            "type": "visible",
            "selector": "#tabs"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#tabs",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "subtitle-language",
      "copy": {
        "de": {
          "title": "Subtitle Language im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Subtitle Language von Sprache, Untertitelmodus und Textstil. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Subtitle Language im Testprofil konfigurieren - Sprache, Untertitelmodus und Textstil"
        },
        "en": {
          "title": "Configure Subtitle Language in the test profile",
          "body": "Work in the visible Subtitle Language area of language, subtitle mode, and text style. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Subtitle Language in the test profile - language, subtitle mode, and text style"
        },
        "es": {
          "title": "Configura Subtitle Language en el perfil de prueba",
          "body": "Trabaja en el area visible Subtitle Language de idioma, modo de subtítulos y estilo de texto. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Subtitle Language en el perfil de prueba - idioma, modo de subtítulos y estilo de texto"
        },
        "fr": {
          "title": "Configurez Subtitle Language dans le profil de test",
          "body": "Travaillez dans la zone visible Subtitle Language de langue, mode de sous-titres et style de texte. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Subtitle Language dans le profil de test - langue, mode de sous-titres et style de texte"
        }
      },
      "capture": {
        "route": "/plugins/stt-ticker/ui.html",
        "assertVisible": "#asr-languageDefault",
        "focusText": {
          "de": "Subtitle Language im Testprofil konfigurieren",
          "en": "Configure Subtitle Language in the test profile",
          "es": "Configura Subtitle Language en el perfil de prueba",
          "fr": "Configurez Subtitle Language dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "subtitle-language"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/stt-ticker/ui.html",
        "instructions": {
          "de": {
            "title": "Subtitle Language im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Subtitle Language von Sprache, Untertitelmodus und Textstil. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Subtitle Language in the test profile",
            "body": "Work in the visible Subtitle Language area of language, subtitle mode, and text style. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Subtitle Language en el perfil de prueba",
            "body": "Trabaja en el area visible Subtitle Language de idioma, modo de subtítulos y estilo de texto. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Subtitle Language dans le profil de test",
            "body": "Travaillez dans la zone visible Subtitle Language de langue, mode de sous-titres et style de texte. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/stt-ticker/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#asr-languageDefault"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/stt-ticker/ui.html"
          },
          {
            "type": "visible",
            "selector": "#asr-languageDefault"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#asr-languageDefault",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "ticker-style",
      "copy": {
        "de": {
          "title": "Ticker Style im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Ticker Style von Sprache, Untertitelmodus und Textstil. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Ticker Style im Testprofil konfigurieren - Sprache, Untertitelmodus und Textstil"
        },
        "en": {
          "title": "Configure Ticker Style in the test profile",
          "body": "Work in the visible Ticker Style area of language, subtitle mode, and text style. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Ticker Style in the test profile - language, subtitle mode, and text style"
        },
        "es": {
          "title": "Configura Ticker Style en el perfil de prueba",
          "body": "Trabaja en el area visible Ticker Style de idioma, modo de subtítulos y estilo de texto. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Ticker Style en el perfil de prueba - idioma, modo de subtítulos y estilo de texto"
        },
        "fr": {
          "title": "Configurez Ticker Style dans le profil de test",
          "body": "Travaillez dans la zone visible Ticker Style de langue, mode de sous-titres et style de texte. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Ticker Style dans le profil de test - langue, mode de sous-titres et style de texte"
        }
      },
      "capture": {
        "route": "/plugins/stt-ticker/ui.html",
        "assertVisible": "#design-select",
        "focusText": {
          "de": "Ticker Style im Testprofil konfigurieren",
          "en": "Configure Ticker Style in the test profile",
          "es": "Configura Ticker Style en el perfil de prueba",
          "fr": "Configurez Ticker Style dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "ticker-style"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/stt-ticker/ui.html",
        "instructions": {
          "de": {
            "title": "Ticker Style im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Ticker Style von Sprache, Untertitelmodus und Textstil. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Ticker Style in the test profile",
            "body": "Work in the visible Ticker Style area of language, subtitle mode, and text style. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Ticker Style en el perfil de prueba",
            "body": "Trabaja en el area visible Ticker Style de idioma, modo de subtítulos y estilo de texto. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Ticker Style dans le profil de test",
            "body": "Travaillez dans la zone visible Ticker Style de langue, mode de sous-titres et style de texte. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/stt-ticker/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#design-select"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/stt-ticker/ui.html"
          },
          {
            "type": "visible",
            "selector": "#design-select"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#design-select",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "sample-sentence",
      "copy": {
        "de": {
          "title": "Sample Sentence lokal testen",
          "body": "Fuehre Sample Sentence nur mit einen lokalen Beispielsatz im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
          "expected": "der Satz erscheint im Ticker ohne Mikrofonaufnahme",
          "alt": "Sample Sentence lokal testen - Sprache, Untertitelmodus und Textstil"
        },
        "en": {
          "title": "Test Sample Sentence locally",
          "body": "Run Sample Sentence only with a local sample sentence in the isolated test profile; no LIVE source, hardware, or external connection is used.",
          "expected": "the sentence appears in the ticker without microphone capture",
          "alt": "Test Sample Sentence locally - language, subtitle mode, and text style"
        },
        "es": {
          "title": "Prueba Sample Sentence localmente",
          "body": "Ejecuta Sample Sentence solo con una frase de ejemplo local en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
          "expected": "la frase aparece en el ticker sin captura de micrófono",
          "alt": "Prueba Sample Sentence localmente - idioma, modo de subtítulos y estilo de texto"
        },
        "fr": {
          "title": "Testez Sample Sentence localement",
          "body": "Executez Sample Sentence uniquement avec une phrase locale d’exemple dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
          "expected": "la phrase apparaît dans le ticker sans capture micro",
          "alt": "Testez Sample Sentence localement - langue, mode de sous-titres et style de texte"
        }
      },
      "capture": {
        "route": "/plugins/stt-ticker/ui.html",
        "assertVisible": "#btn-test-deepgram",
        "focusText": {
          "de": "Sample Sentence lokal testen",
          "en": "Test Sample Sentence locally",
          "es": "Prueba Sample Sentence localmente",
          "fr": "Testez Sample Sentence localement"
        },
        "action": {
          "type": "run-local-preview",
          "stepId": "sample-sentence"
        },
        "expected": {
          "de": "der Satz erscheint im Ticker ohne Mikrofonaufnahme",
          "en": "the sentence appears in the ticker without microphone capture",
          "es": "la frase aparece en el ticker sin captura de micrófono",
          "fr": "la phrase apparaît dans le ticker sans capture micro"
        }
      },
      "workflow": {
        "route": "/plugins/stt-ticker/ui.html",
        "instructions": {
          "de": {
            "title": "Sample Sentence lokal testen",
            "body": "Fuehre Sample Sentence nur mit einen lokalen Beispielsatz im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
            "expected": "der Satz erscheint im Ticker ohne Mikrofonaufnahme"
          },
          "en": {
            "title": "Test Sample Sentence locally",
            "body": "Run Sample Sentence only with a local sample sentence in the isolated test profile; no LIVE source, hardware, or external connection is used.",
            "expected": "the sentence appears in the ticker without microphone capture"
          },
          "es": {
            "title": "Prueba Sample Sentence localmente",
            "body": "Ejecuta Sample Sentence solo con una frase de ejemplo local en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
            "expected": "la frase aparece en el ticker sin captura de micrófono"
          },
          "fr": {
            "title": "Testez Sample Sentence localement",
            "body": "Executez Sample Sentence uniquement avec une phrase locale d’exemple dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
            "expected": "la phrase apparaît dans le ticker sans capture micro"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/stt-ticker/ui.html"
          },
          {
            "type": "run-local-preview",
            "selector": "#btn-test-deepgram"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/stt-ticker/ui.html"
          },
          {
            "type": "visible",
            "selector": "#btn-test-deepgram"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#btn-test-deepgram",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "ticker-overlay",
      "copy": {
        "de": {
          "title": "Ticker Overlay als Overlay-Vorschau oeffnen",
          "body": "Oeffne die echte Ticker Overlay-Oberflaeche nur in einer nicht sendenden OBS-Testszene. Ohne lokales Testereignis kann sie leer oder transparent bleiben; es werden keine Demo-Inhalte eingefuegt.",
          "expected": "der Satz erscheint im Ticker ohne Mikrofonaufnahme",
          "alt": "Ticker Overlay als Overlay-Vorschau oeffnen - Sprache, Untertitelmodus und Textstil"
        },
        "en": {
          "title": "Open Ticker Overlay as an overlay preview",
          "body": "Open the real Ticker Overlay surface only in an OBS test scene that is not live. Without a local test event, it can remain empty or transparent; no demo content is inserted.",
          "expected": "the sentence appears in the ticker without microphone capture",
          "alt": "Open Ticker Overlay as an overlay preview - language, subtitle mode, and text style"
        },
        "es": {
          "title": "Abre Ticker Overlay como vista previa de overlay",
          "body": "Abre la superficie real Ticker Overlay solo en una escena de prueba de OBS que no esta al aire. Sin un evento local de prueba, puede quedar vacia o transparente; no se inserta contenido demo.",
          "expected": "la frase aparece en el ticker sin captura de micrófono",
          "alt": "Abre Ticker Overlay como vista previa de overlay - idioma, modo de subtítulos y estilo de texto"
        },
        "fr": {
          "title": "Ouvrez Ticker Overlay comme apercu overlay",
          "body": "Ouvrez la vraie surface Ticker Overlay uniquement dans une scene de test OBS non diffusee. Sans evenement de test local, elle peut rester vide ou transparente ; aucun contenu de demonstration nest insere.",
          "expected": "la phrase apparaît dans le ticker sans capture micro",
          "alt": "Ouvrez Ticker Overlay comme apercu overlay - langue, mode de sous-titres et style de texte"
        }
      },
      "capture": {
        "route": "/plugins/stt-ticker/overlay/ticker.html",
        "assertVisible": "#lines",
        "focusText": {
          "de": "Ticker Overlay als Overlay-Vorschau oeffnen",
          "en": "Open Ticker Overlay as an overlay preview",
          "es": "Abre Ticker Overlay como vista previa de overlay",
          "fr": "Ouvrez Ticker Overlay comme apercu overlay"
        },
        "action": {
          "type": "open-overlay-preview",
          "stepId": "ticker-overlay"
        },
        "expected": {
          "de": "der Satz erscheint im Ticker ohne Mikrofonaufnahme",
          "en": "the sentence appears in the ticker without microphone capture",
          "es": "la frase aparece en el ticker sin captura de micrófono",
          "fr": "la phrase apparaît dans le ticker sans capture micro"
        }
      },
      "workflow": {
        "route": "/plugins/stt-ticker/overlay/ticker.html",
        "instructions": {
          "de": {
            "title": "Ticker Overlay als Overlay-Vorschau oeffnen",
            "body": "Oeffne die echte Ticker Overlay-Oberflaeche nur in einer nicht sendenden OBS-Testszene. Ohne lokales Testereignis kann sie leer oder transparent bleiben; es werden keine Demo-Inhalte eingefuegt.",
            "expected": "der Satz erscheint im Ticker ohne Mikrofonaufnahme"
          },
          "en": {
            "title": "Open Ticker Overlay as an overlay preview",
            "body": "Open the real Ticker Overlay surface only in an OBS test scene that is not live. Without a local test event, it can remain empty or transparent; no demo content is inserted.",
            "expected": "the sentence appears in the ticker without microphone capture"
          },
          "es": {
            "title": "Abre Ticker Overlay como vista previa de overlay",
            "body": "Abre la superficie real Ticker Overlay solo en una escena de prueba de OBS que no esta al aire. Sin un evento local de prueba, puede quedar vacia o transparente; no se inserta contenido demo.",
            "expected": "la frase aparece en el ticker sin captura de micrófono"
          },
          "fr": {
            "title": "Ouvrez Ticker Overlay comme apercu overlay",
            "body": "Ouvrez la vraie surface Ticker Overlay uniquement dans une scene de test OBS non diffusee. Sans evenement de test local, elle peut rester vide ou transparente ; aucun contenu de demonstration nest insere.",
            "expected": "la phrase apparaît dans le ticker sans capture micro"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/stt-ticker/overlay/ticker.html"
          },
          {
            "type": "open-overlay-preview",
            "selector": "#lines"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/stt-ticker/overlay/ticker.html"
          },
          {
            "type": "visible",
            "selector": "#lines"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#lines",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "ticker-reset",
      "copy": {
        "de": {
          "title": "Ticker Reset sicher zuruecksetzen",
          "body": "Entferne nur die Demo-Werte fuer Ticker Reset, bevor du Sprache, Untertitelmodus und Textstil produktiv vorbereitest.",
          "expected": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "alt": "Ticker Reset sicher zuruecksetzen - Sprache, Untertitelmodus und Textstil"
        },
        "en": {
          "title": "Reset Ticker Reset safely",
          "body": "Remove only the demo values for Ticker Reset before preparing language, subtitle mode, and text style for production.",
          "expected": "The test profile remains free of production impact.",
          "alt": "Reset Ticker Reset safely - language, subtitle mode, and text style"
        },
        "es": {
          "title": "Restablece Ticker Reset con seguridad",
          "body": "Elimina solo los valores demo de Ticker Reset antes de preparar idioma, modo de subtítulos y estilo de texto para produccion.",
          "expected": "El perfil de prueba permanece sin impacto de producción.",
          "alt": "Restablece Ticker Reset con seguridad - idioma, modo de subtítulos y estilo de texto"
        },
        "fr": {
          "title": "Reinitialisez Ticker Reset en securite",
          "body": "Supprimez uniquement les valeurs demo de Ticker Reset avant de preparer langue, mode de sous-titres et style de texte pour la production.",
          "expected": "Le profil de test reste sans impact de production.",
          "alt": "Reinitialisez Ticker Reset en securite - langue, mode de sous-titres et style de texte"
        }
      },
      "capture": {
        "route": "/plugins/stt-ticker/ui.html",
        "assertVisible": "#btn-clear-buffer",
        "focusText": {
          "de": "Ticker Reset sicher zuruecksetzen",
          "en": "Reset Ticker Reset safely",
          "es": "Restablece Ticker Reset con seguridad",
          "fr": "Reinitialisez Ticker Reset en securite"
        },
        "action": {
          "type": "reset-demo-state",
          "stepId": "ticker-reset"
        },
        "expected": {
          "de": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "en": "The test profile remains free of production impact.",
          "es": "El perfil de prueba permanece sin impacto de producción.",
          "fr": "Le profil de test reste sans impact de production."
        }
      },
      "workflow": {
        "route": "/plugins/stt-ticker/ui.html",
        "instructions": {
          "de": {
            "title": "Ticker Reset sicher zuruecksetzen",
            "body": "Entferne nur die Demo-Werte fuer Ticker Reset, bevor du Sprache, Untertitelmodus und Textstil produktiv vorbereitest.",
            "expected": "Das Testprofil bleibt ohne produktive Auswirkung."
          },
          "en": {
            "title": "Reset Ticker Reset safely",
            "body": "Remove only the demo values for Ticker Reset before preparing language, subtitle mode, and text style for production.",
            "expected": "The test profile remains free of production impact."
          },
          "es": {
            "title": "Restablece Ticker Reset con seguridad",
            "body": "Elimina solo los valores demo de Ticker Reset antes de preparar idioma, modo de subtítulos y estilo de texto para produccion.",
            "expected": "El perfil de prueba permanece sin impacto de producción."
          },
          "fr": {
            "title": "Reinitialisez Ticker Reset en securite",
            "body": "Supprimez uniquement les valeurs demo de Ticker Reset avant de preparer langue, mode de sous-titres et style de texte pour la production.",
            "expected": "Le profil de test reste sans impact de production."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/stt-ticker/ui.html"
          },
          {
            "type": "reset-demo-state",
            "selector": "#btn-clear-buffer"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/stt-ticker/ui.html"
          },
          {
            "type": "visible",
            "selector": "#btn-clear-buffer"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#btn-clear-buffer",
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
