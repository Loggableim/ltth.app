'use strict';

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
module.exports = Object.freeze({
  "id": "talking-heads",
  "route": "/plugins/talking-heads/ui.html",
  "topic": {
    "de": "Charakter, Sprachereignis und Lippenbewegung",
    "en": "character, speech event, and lip movement",
    "es": "personaje, evento de voz y movimiento de labios",
    "fr": "personnage, événement vocal et mouvement des lèvres"
  },
  "test": {
    "de": "eine lokale Textvorschau",
    "en": "a local text preview",
    "es": "una vista previa de texto local",
    "fr": "un aperçu de texte local"
  },
  "expected": {
    "de": "der Charakter reagiert in der Vorschau ohne TTS-Provider",
    "en": "the character reacts in preview without a TTS provider",
    "es": "el personaje reacciona en la vista previa sin proveedor TTS",
    "fr": "le personnage réagit dans l’aperçu sans fournisseur TTS"
  },
  "requirement": "audio",
  "safety": "credentials",
  "mode": "ui",
  "overlay": "/plugins/talking-heads/overlay.html",
  "related": [
    "tts",
    "animazingpal"
  ],
  "copy": {
    "de": {
      "title": "Talking Heads",
      "summary": "Talking Heads richtet Charakter, Sprachereignis und Lippenbewegung ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "der Charakter reagiert in der Vorschau ohne TTS-Provider",
      "requirements": "LTTH Dashboard und ein lokales Audio-Ausgabegerät. Dieser konkrete Talking Heads-Ablauf behandelt Charakter, Sprachereignis und Lippenbewegung.",
      "safety": "Keine echten API-Schlüssel oder Konten eingeben; Platzhalter bleiben Platzhalter. Dieser konkrete Talking Heads-Ablauf behandelt Charakter, Sprachereignis und Lippenbewegung.",
      "troubleshooting": "Wenn Charakter, Sprachereignis und Lippenbewegung nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "tts",
        "animazingpal"
      ]
    },
    "en": {
      "title": "Talking Heads",
      "summary": "Talking Heads configures character, speech event, and lip movement with a safe local check instead of a LIVE trigger.",
      "firstResult": "the character reacts in preview without a TTS provider",
      "requirements": "LTTH Dashboard and a local audio output device. This Talking Heads workflow specifically covers character, speech event, and lip movement.",
      "safety": "Do not enter real API keys or accounts; placeholders stay placeholders. This Talking Heads workflow specifically covers character, speech event, and lip movement.",
      "troubleshooting": "If character, speech event, and lip movement is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "tts",
        "animazingpal"
      ]
    },
    "es": {
      "title": "Talking Heads",
      "summary": "Talking Heads configura personaje, evento de voz y movimiento de labios mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "el personaje reacciona en la vista previa sin proveedor TTS",
      "requirements": "El panel de LTTH y un dispositivo de salida de audio local. Este flujo concreto de Talking Heads trata personaje, evento de voz y movimiento de labios.",
      "safety": "No introduzcas claves API ni cuentas reales; los marcadores siguen siendo marcadores. Este flujo concreto de Talking Heads trata personaje, evento de voz y movimiento de labios.",
      "troubleshooting": "Si personaje, evento de voz y movimiento de labios no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "tts",
        "animazingpal"
      ]
    },
    "fr": {
      "title": "Talking Heads",
      "summary": "Talking Heads configure personnage, événement vocal et mouvement des lèvres avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "le personnage réagit dans l’aperçu sans fournisseur TTS",
      "requirements": "Le tableau de bord LTTH et un périphérique audio local. Ce flux spécifique de Talking Heads couvre personnage, événement vocal et mouvement des lèvres.",
      "safety": "Ne saisissez aucune clé API ni compte réel ; les espaces réservés restent des espaces réservés. Ce flux spécifique de Talking Heads couvre personnage, événement vocal et mouvement des lèvres.",
      "troubleshooting": "Si personnage, événement vocal et mouvement des lèvres n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "tts",
        "animazingpal"
      ]
    }
  },
  "steps": [
    {
      "id": "heads-card",
      "copy": {
        "de": {
          "title": "Heads Card im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Heads Card von Charakter, Sprachereignis und Lippenbewegung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "alt": "Heads Card im Testprofil konfigurieren - Charakter, Sprachereignis und Lippenbewegung"
        },
        "en": {
          "title": "Configure Heads Card in the test profile",
          "body": "Work in the visible Heads Card area of character, speech event, and lip movement. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The relevant plugin surface is visibly identified.",
          "alt": "Configure Heads Card in the test profile - character, speech event, and lip movement"
        },
        "es": {
          "title": "Configura Heads Card en el perfil de prueba",
          "body": "Trabaja en el area visible Heads Card de personaje, evento de voz y movimiento de labios. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La superficie correspondiente del plugin queda identificada.",
          "alt": "Configura Heads Card en el perfil de prueba - personaje, evento de voz y movimiento de labios"
        },
        "fr": {
          "title": "Configurez Heads Card dans le profil de test",
          "body": "Travaillez dans la zone visible Heads Card de personnage, événement vocal et mouvement des lèvres. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La surface de plugin correspondante est clairement visible.",
          "alt": "Configurez Heads Card dans le profil de test - personnage, événement vocal et mouvement des lèvres"
        }
      },
      "capture": {
        "route": "/plugins/talking-heads/ui.html",
        "assertVisible": "#apiStatus",
        "focusText": {
          "de": "Heads Card im Testprofil konfigurieren",
          "en": "Configure Heads Card in the test profile",
          "es": "Configura Heads Card en el perfil de prueba",
          "fr": "Configurez Heads Card dans le profil de test"
        },
        "action": {
          "type": "open-plugin-surface",
          "stepId": "heads-card"
        },
        "expected": {
          "de": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "en": "The relevant plugin surface is visibly identified.",
          "es": "La superficie correspondiente del plugin queda identificada.",
          "fr": "La surface de plugin correspondante est clairement visible."
        }
      },
      "workflow": {
        "route": "/plugins/talking-heads/ui.html",
        "instructions": {
          "de": {
            "title": "Heads Card im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Heads Card von Charakter, Sprachereignis und Lippenbewegung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar."
          },
          "en": {
            "title": "Configure Heads Card in the test profile",
            "body": "Work in the visible Heads Card area of character, speech event, and lip movement. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The relevant plugin surface is visibly identified."
          },
          "es": {
            "title": "Configura Heads Card en el perfil de prueba",
            "body": "Trabaja en el area visible Heads Card de personaje, evento de voz y movimiento de labios. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La superficie correspondiente del plugin queda identificada."
          },
          "fr": {
            "title": "Configurez Heads Card dans le profil de test",
            "body": "Travaillez dans la zone visible Heads Card de personnage, événement vocal et mouvement des lèvres. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La surface de plugin correspondante est clairement visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/talking-heads/ui.html"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#apiStatus"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/talking-heads/ui.html"
          },
          {
            "type": "visible",
            "selector": "#apiStatus"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#apiStatus",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "character-select",
      "copy": {
        "de": {
          "title": "Character Select im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Character Select von Charakter, Sprachereignis und Lippenbewegung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Character Select im Testprofil konfigurieren - Charakter, Sprachereignis und Lippenbewegung"
        },
        "en": {
          "title": "Configure Character Select in the test profile",
          "body": "Work in the visible Character Select area of character, speech event, and lip movement. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Character Select in the test profile - character, speech event, and lip movement"
        },
        "es": {
          "title": "Configura Character Select en el perfil de prueba",
          "body": "Trabaja en el area visible Character Select de personaje, evento de voz y movimiento de labios. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Character Select en el perfil de prueba - personaje, evento de voz y movimiento de labios"
        },
        "fr": {
          "title": "Configurez Character Select dans le profil de test",
          "body": "Travaillez dans la zone visible Character Select de personnage, événement vocal et mouvement des lèvres. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Character Select dans le profil de test - personnage, événement vocal et mouvement des lèvres"
        }
      },
      "capture": {
        "route": "/plugins/talking-heads/ui.html",
        "assertVisible": "#sourceAvatarSelect",
        "focusText": {
          "de": "Character Select im Testprofil konfigurieren",
          "en": "Configure Character Select in the test profile",
          "es": "Configura Character Select en el perfil de prueba",
          "fr": "Configurez Character Select dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "character-select"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/talking-heads/ui.html",
        "instructions": {
          "de": {
            "title": "Character Select im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Character Select von Charakter, Sprachereignis und Lippenbewegung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Character Select in the test profile",
            "body": "Work in the visible Character Select area of character, speech event, and lip movement. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Character Select en el perfil de prueba",
            "body": "Trabaja en el area visible Character Select de personaje, evento de voz y movimiento de labios. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Character Select dans le profil de test",
            "body": "Travaillez dans la zone visible Character Select de personnage, événement vocal et mouvement des lèvres. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/talking-heads/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#sourceAvatarSelect"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/talking-heads/ui.html"
          },
          {
            "type": "visible",
            "selector": "#sourceAvatarSelect"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#sourceAvatarSelect",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "speech-map",
      "copy": {
        "de": {
          "title": "Speech MAP im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Speech MAP von Charakter, Sprachereignis und Lippenbewegung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Speech MAP im Testprofil konfigurieren - Charakter, Sprachereignis und Lippenbewegung"
        },
        "en": {
          "title": "Configure Speech MAP in the test profile",
          "body": "Work in the visible Speech MAP area of character, speech event, and lip movement. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Speech MAP in the test profile - character, speech event, and lip movement"
        },
        "es": {
          "title": "Configura Speech MAP en el perfil de prueba",
          "body": "Trabaja en el area visible Speech MAP de personaje, evento de voz y movimiento de labios. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Speech MAP en el perfil de prueba - personaje, evento de voz y movimiento de labios"
        },
        "fr": {
          "title": "Configurez Speech MAP dans le profil de test",
          "body": "Travaillez dans la zone visible Speech MAP de personnage, événement vocal et mouvement des lèvres. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Speech MAP dans le profil de test - personnage, événement vocal et mouvement des lèvres"
        }
      },
      "capture": {
        "route": "/plugins/talking-heads/ui.html",
        "assertVisible": "#previewTtsText",
        "focusText": {
          "de": "Speech MAP im Testprofil konfigurieren",
          "en": "Configure Speech MAP in the test profile",
          "es": "Configura Speech MAP en el perfil de prueba",
          "fr": "Configurez Speech MAP dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "speech-map"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/talking-heads/ui.html",
        "instructions": {
          "de": {
            "title": "Speech MAP im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Speech MAP von Charakter, Sprachereignis und Lippenbewegung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Speech MAP in the test profile",
            "body": "Work in the visible Speech MAP area of character, speech event, and lip movement. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Speech MAP en el perfil de prueba",
            "body": "Trabaja en el area visible Speech MAP de personaje, evento de voz y movimiento de labios. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Speech MAP dans le profil de test",
            "body": "Travaillez dans la zone visible Speech MAP de personnage, événement vocal et mouvement des lèvres. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/talking-heads/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#previewTtsText"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/talking-heads/ui.html"
          },
          {
            "type": "visible",
            "selector": "#previewTtsText"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#previewTtsText",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "text-preview",
      "copy": {
        "de": {
          "title": "Text Preview lokal testen",
          "body": "Fuehre Text Preview nur mit eine lokale Textvorschau im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
          "expected": "der Charakter reagiert in der Vorschau ohne TTS-Provider",
          "alt": "Text Preview lokal testen - Charakter, Sprachereignis und Lippenbewegung"
        },
        "en": {
          "title": "Test Text Preview locally",
          "body": "Run Text Preview only with a local text preview in the isolated test profile; no LIVE source, hardware, or external connection is used.",
          "expected": "the character reacts in preview without a TTS provider",
          "alt": "Test Text Preview locally - character, speech event, and lip movement"
        },
        "es": {
          "title": "Prueba Text Preview localmente",
          "body": "Ejecuta Text Preview solo con una vista previa de texto local en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
          "expected": "el personaje reacciona en la vista previa sin proveedor TTS",
          "alt": "Prueba Text Preview localmente - personaje, evento de voz y movimiento de labios"
        },
        "fr": {
          "title": "Testez Text Preview localement",
          "body": "Executez Text Preview uniquement avec un aperçu de texte local dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
          "expected": "le personnage réagit dans l’aperçu sans fournisseur TTS",
          "alt": "Testez Text Preview localement - personnage, événement vocal et mouvement des lèvres"
        }
      },
      "capture": {
        "route": "/plugins/talking-heads/ui.html",
        "assertVisible": "#previewTtsBtn",
        "focusText": {
          "de": "Text Preview lokal testen",
          "en": "Test Text Preview locally",
          "es": "Prueba Text Preview localmente",
          "fr": "Testez Text Preview localement"
        },
        "action": {
          "type": "run-local-preview",
          "stepId": "text-preview"
        },
        "expected": {
          "de": "der Charakter reagiert in der Vorschau ohne TTS-Provider",
          "en": "the character reacts in preview without a TTS provider",
          "es": "el personaje reacciona en la vista previa sin proveedor TTS",
          "fr": "le personnage réagit dans l’aperçu sans fournisseur TTS"
        }
      },
      "workflow": {
        "route": "/plugins/talking-heads/ui.html",
        "instructions": {
          "de": {
            "title": "Text Preview lokal testen",
            "body": "Fuehre Text Preview nur mit eine lokale Textvorschau im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
            "expected": "der Charakter reagiert in der Vorschau ohne TTS-Provider"
          },
          "en": {
            "title": "Test Text Preview locally",
            "body": "Run Text Preview only with a local text preview in the isolated test profile; no LIVE source, hardware, or external connection is used.",
            "expected": "the character reacts in preview without a TTS provider"
          },
          "es": {
            "title": "Prueba Text Preview localmente",
            "body": "Ejecuta Text Preview solo con una vista previa de texto local en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
            "expected": "el personaje reacciona en la vista previa sin proveedor TTS"
          },
          "fr": {
            "title": "Testez Text Preview localement",
            "body": "Executez Text Preview uniquement avec un aperçu de texte local dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
            "expected": "le personnage réagit dans l’aperçu sans fournisseur TTS"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/talking-heads/ui.html"
          },
          {
            "type": "run-local-preview",
            "selector": "#previewTtsBtn"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/talking-heads/ui.html"
          },
          {
            "type": "visible",
            "selector": "#previewTtsBtn"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#previewTtsBtn",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "heads-overlay",
      "copy": {
        "de": {
          "title": "Heads Overlay als Overlay-Vorschau oeffnen",
          "body": "Oeffne die echte Heads Overlay-Oberflaeche nur in einer nicht sendenden OBS-Testszene. Ohne lokales Testereignis kann sie leer oder transparent bleiben; es werden keine Demo-Inhalte eingefuegt.",
          "expected": "der Charakter reagiert in der Vorschau ohne TTS-Provider",
          "alt": "Heads Overlay als Overlay-Vorschau oeffnen - Charakter, Sprachereignis und Lippenbewegung"
        },
        "en": {
          "title": "Open Heads Overlay as an overlay preview",
          "body": "Open the real Heads Overlay surface only in an OBS test scene that is not live. Without a local test event, it can remain empty or transparent; no demo content is inserted.",
          "expected": "the character reacts in preview without a TTS provider",
          "alt": "Open Heads Overlay as an overlay preview - character, speech event, and lip movement"
        },
        "es": {
          "title": "Abre Heads Overlay como vista previa de overlay",
          "body": "Abre la superficie real Heads Overlay solo en una escena de prueba de OBS que no esta al aire. Sin un evento local de prueba, puede quedar vacia o transparente; no se inserta contenido demo.",
          "expected": "el personaje reacciona en la vista previa sin proveedor TTS",
          "alt": "Abre Heads Overlay como vista previa de overlay - personaje, evento de voz y movimiento de labios"
        },
        "fr": {
          "title": "Ouvrez Heads Overlay comme apercu overlay",
          "body": "Ouvrez la vraie surface Heads Overlay uniquement dans une scene de test OBS non diffusee. Sans evenement de test local, elle peut rester vide ou transparente ; aucun contenu de demonstration nest insere.",
          "expected": "le personnage réagit dans l’aperçu sans fournisseur TTS",
          "alt": "Ouvrez Heads Overlay comme apercu overlay - personnage, événement vocal et mouvement des lèvres"
        }
      },
      "capture": {
        "route": "/plugins/talking-heads/overlay.html",
        "assertVisible": "#avatarContainer",
        "focusText": {
          "de": "Heads Overlay als Overlay-Vorschau oeffnen",
          "en": "Open Heads Overlay as an overlay preview",
          "es": "Abre Heads Overlay como vista previa de overlay",
          "fr": "Ouvrez Heads Overlay comme apercu overlay"
        },
        "action": {
          "type": "open-overlay-preview",
          "stepId": "heads-overlay"
        },
        "expected": {
          "de": "der Charakter reagiert in der Vorschau ohne TTS-Provider",
          "en": "the character reacts in preview without a TTS provider",
          "es": "el personaje reacciona en la vista previa sin proveedor TTS",
          "fr": "le personnage réagit dans l’aperçu sans fournisseur TTS"
        }
      },
      "workflow": {
        "route": "/plugins/talking-heads/overlay.html",
        "instructions": {
          "de": {
            "title": "Heads Overlay als Overlay-Vorschau oeffnen",
            "body": "Oeffne die echte Heads Overlay-Oberflaeche nur in einer nicht sendenden OBS-Testszene. Ohne lokales Testereignis kann sie leer oder transparent bleiben; es werden keine Demo-Inhalte eingefuegt.",
            "expected": "der Charakter reagiert in der Vorschau ohne TTS-Provider"
          },
          "en": {
            "title": "Open Heads Overlay as an overlay preview",
            "body": "Open the real Heads Overlay surface only in an OBS test scene that is not live. Without a local test event, it can remain empty or transparent; no demo content is inserted.",
            "expected": "the character reacts in preview without a TTS provider"
          },
          "es": {
            "title": "Abre Heads Overlay como vista previa de overlay",
            "body": "Abre la superficie real Heads Overlay solo en una escena de prueba de OBS que no esta al aire. Sin un evento local de prueba, puede quedar vacia o transparente; no se inserta contenido demo.",
            "expected": "el personaje reacciona en la vista previa sin proveedor TTS"
          },
          "fr": {
            "title": "Ouvrez Heads Overlay comme apercu overlay",
            "body": "Ouvrez la vraie surface Heads Overlay uniquement dans une scene de test OBS non diffusee. Sans evenement de test local, elle peut rester vide ou transparente ; aucun contenu de demonstration nest insere.",
            "expected": "le personnage réagit dans l’aperçu sans fournisseur TTS"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/talking-heads/overlay.html"
          },
          {
            "type": "open-overlay-preview",
            "selector": "#avatarContainer"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/talking-heads/overlay.html"
          },
          {
            "type": "visible",
            "selector": "#avatarContainer"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#avatarContainer",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "heads-reset",
      "copy": {
        "de": {
          "title": "Heads Reset sicher zuruecksetzen",
          "body": "Entferne nur die Demo-Werte fuer Heads Reset, bevor du Charakter, Sprachereignis und Lippenbewegung produktiv vorbereitest.",
          "expected": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "alt": "Heads Reset sicher zuruecksetzen - Charakter, Sprachereignis und Lippenbewegung"
        },
        "en": {
          "title": "Reset Heads Reset safely",
          "body": "Remove only the demo values for Heads Reset before preparing character, speech event, and lip movement for production.",
          "expected": "The test profile remains free of production impact.",
          "alt": "Reset Heads Reset safely - character, speech event, and lip movement"
        },
        "es": {
          "title": "Restablece Heads Reset con seguridad",
          "body": "Elimina solo los valores demo de Heads Reset antes de preparar personaje, evento de voz y movimiento de labios para produccion.",
          "expected": "El perfil de prueba permanece sin impacto de producción.",
          "alt": "Restablece Heads Reset con seguridad - personaje, evento de voz y movimiento de labios"
        },
        "fr": {
          "title": "Reinitialisez Heads Reset en securite",
          "body": "Supprimez uniquement les valeurs demo de Heads Reset avant de preparer personnage, événement vocal et mouvement des lèvres pour la production.",
          "expected": "Le profil de test reste sans impact de production.",
          "alt": "Reinitialisez Heads Reset en securite - personnage, événement vocal et mouvement des lèvres"
        }
      },
      "capture": {
        "route": "/plugins/talking-heads/ui.html",
        "assertVisible": "#clearCacheBtn",
        "focusText": {
          "de": "Heads Reset sicher zuruecksetzen",
          "en": "Reset Heads Reset safely",
          "es": "Restablece Heads Reset con seguridad",
          "fr": "Reinitialisez Heads Reset en securite"
        },
        "action": {
          "type": "reset-demo-state",
          "stepId": "heads-reset"
        },
        "expected": {
          "de": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "en": "The test profile remains free of production impact.",
          "es": "El perfil de prueba permanece sin impacto de producción.",
          "fr": "Le profil de test reste sans impact de production."
        }
      },
      "workflow": {
        "route": "/plugins/talking-heads/ui.html",
        "instructions": {
          "de": {
            "title": "Heads Reset sicher zuruecksetzen",
            "body": "Entferne nur die Demo-Werte fuer Heads Reset, bevor du Charakter, Sprachereignis und Lippenbewegung produktiv vorbereitest.",
            "expected": "Das Testprofil bleibt ohne produktive Auswirkung."
          },
          "en": {
            "title": "Reset Heads Reset safely",
            "body": "Remove only the demo values for Heads Reset before preparing character, speech event, and lip movement for production.",
            "expected": "The test profile remains free of production impact."
          },
          "es": {
            "title": "Restablece Heads Reset con seguridad",
            "body": "Elimina solo los valores demo de Heads Reset antes de preparar personaje, evento de voz y movimiento de labios para produccion.",
            "expected": "El perfil de prueba permanece sin impacto de producción."
          },
          "fr": {
            "title": "Reinitialisez Heads Reset en securite",
            "body": "Supprimez uniquement les valeurs demo de Heads Reset avant de preparer personnage, événement vocal et mouvement des lèvres pour la production.",
            "expected": "Le profil de test reste sans impact de production."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/talking-heads/ui.html"
          },
          {
            "type": "reset-demo-state",
            "selector": "#clearCacheBtn"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/talking-heads/ui.html"
          },
          {
            "type": "visible",
            "selector": "#clearCacheBtn"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#clearCacheBtn",
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
