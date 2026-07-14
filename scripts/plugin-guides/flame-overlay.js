'use strict';

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
module.exports = Object.freeze({
  "id": "flame-overlay",
  "route": "/plugins/flame-overlay/ui/settings.html",
  "topic": {
    "de": "Rahmenstil, Intensität und Farbvorgabe",
    "en": "frame style, intensity, and color preset",
    "es": "estilo de marco, intensidad y preajuste de color",
    "fr": "style de cadre, intensité et préréglage de couleur"
  },
  "test": {
    "de": "die lokale Rahmenvorschau",
    "en": "the local frame preview",
    "es": "la vista previa local del marco",
    "fr": "l’aperçu local du cadre"
  },
  "expected": {
    "de": "der Rahmen ist sichtbar, ohne eine LIVE-Szene zu verändern",
    "en": "the frame is visible without changing a LIVE scene",
    "es": "el marco es visible sin cambiar una escena LIVE",
    "fr": "le cadre est visible sans modifier une scène LIVE"
  },
  "requirement": "obs",
  "safety": "obs",
  "mode": "ui",
  "overlay": "/flame-overlay/overlay",
  "related": [
    "visual-fx-frame-webgpu",
    "fireworks"
  ],
  "copy": {
    "de": {
      "title": "Visual FX Frame",
      "summary": "Visual FX Frame richtet Rahmenstil, Intensität und Farbvorgabe ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "der Rahmen ist sichtbar, ohne eine LIVE-Szene zu verändern",
      "requirements": "LTTH Dashboard; für die Ausgabe zusätzlich eine OBS-Testszene. Dieser konkrete Visual FX Frame-Ablauf behandelt Rahmenstil, Intensität und Farbvorgabe.",
      "safety": "Nutze eine nicht gesendete OBS-Testszene; LIVE-Ausgaben bleiben deaktiviert. Dieser konkrete Visual FX Frame-Ablauf behandelt Rahmenstil, Intensität und Farbvorgabe.",
      "troubleshooting": "Wenn Rahmenstil, Intensität und Farbvorgabe nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "visual-fx-frame-webgpu",
        "fireworks"
      ]
    },
    "en": {
      "title": "Visual FX Frame",
      "summary": "Visual FX Frame configures frame style, intensity, and color preset with a safe local check instead of a LIVE trigger.",
      "firstResult": "the frame is visible without changing a LIVE scene",
      "requirements": "LTTH Dashboard; use an OBS test scene for output. This Visual FX Frame workflow specifically covers frame style, intensity, and color preset.",
      "safety": "Use an OBS test scene that is not live; LIVE output remains disabled. This Visual FX Frame workflow specifically covers frame style, intensity, and color preset.",
      "troubleshooting": "If frame style, intensity, and color preset is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "visual-fx-frame-webgpu",
        "fireworks"
      ]
    },
    "es": {
      "title": "Visual FX Frame",
      "summary": "Visual FX Frame configura estilo de marco, intensidad y preajuste de color mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "el marco es visible sin cambiar una escena LIVE",
      "requirements": "El panel de LTTH y una escena de prueba de OBS para la salida. Este flujo concreto de Visual FX Frame trata estilo de marco, intensidad y preajuste de color.",
      "safety": "Usa una escena de prueba de OBS que no esté al aire; la salida LIVE permanece desactivada. Este flujo concreto de Visual FX Frame trata estilo de marco, intensidad y preajuste de color.",
      "troubleshooting": "Si estilo de marco, intensidad y preajuste de color no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "visual-fx-frame-webgpu",
        "fireworks"
      ]
    },
    "fr": {
      "title": "Visual FX Frame",
      "summary": "Visual FX Frame configure style de cadre, intensité et préréglage de couleur avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "le cadre est visible sans modifier une scène LIVE",
      "requirements": "Le tableau de bord LTTH et une scène de test OBS pour la sortie. Ce flux spécifique de Visual FX Frame couvre style de cadre, intensité et préréglage de couleur.",
      "safety": "Utilisez une scène de test OBS non diffusée ; la sortie LIVE reste désactivée. Ce flux spécifique de Visual FX Frame couvre style de cadre, intensité et préréglage de couleur.",
      "troubleshooting": "Si style de cadre, intensité et préréglage de couleur n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "visual-fx-frame-webgpu",
        "fireworks"
      ]
    }
  },
  "steps": [
    {
      "id": "frame-card",
      "copy": {
        "de": {
          "title": "Frame Card im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Frame Card von Rahmenstil, Intensität und Farbvorgabe. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "alt": "Frame Card im Testprofil konfigurieren - Rahmenstil, Intensität und Farbvorgabe"
        },
        "en": {
          "title": "Configure Frame Card in the test profile",
          "body": "Work in the visible Frame Card area of frame style, intensity, and color preset. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The relevant plugin surface is visibly identified.",
          "alt": "Configure Frame Card in the test profile - frame style, intensity, and color preset"
        },
        "es": {
          "title": "Configura Frame Card en el perfil de prueba",
          "body": "Trabaja en el area visible Frame Card de estilo de marco, intensidad y preajuste de color. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La superficie correspondiente del plugin queda identificada.",
          "alt": "Configura Frame Card en el perfil de prueba - estilo de marco, intensidad y preajuste de color"
        },
        "fr": {
          "title": "Configurez Frame Card dans le profil de test",
          "body": "Travaillez dans la zone visible Frame Card de style de cadre, intensité et préréglage de couleur. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La surface de plugin correspondante est clairement visible.",
          "alt": "Configurez Frame Card dans le profil de test - style de cadre, intensité et préréglage de couleur"
        }
      },
      "capture": {
        "route": "/plugins/flame-overlay/ui/settings.html",
        "assertVisible": "#status",
        "focusText": {
          "de": "Frame Card im Testprofil konfigurieren",
          "en": "Configure Frame Card in the test profile",
          "es": "Configura Frame Card en el perfil de prueba",
          "fr": "Configurez Frame Card dans le profil de test"
        },
        "action": {
          "type": "open-plugin-surface",
          "stepId": "frame-card"
        },
        "expected": {
          "de": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "en": "The relevant plugin surface is visibly identified.",
          "es": "La superficie correspondiente del plugin queda identificada.",
          "fr": "La surface de plugin correspondante est clairement visible."
        }
      },
      "workflow": {
        "route": "/plugins/flame-overlay/ui/settings.html",
        "instructions": {
          "de": {
            "title": "Frame Card im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Frame Card von Rahmenstil, Intensität und Farbvorgabe. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar."
          },
          "en": {
            "title": "Configure Frame Card in the test profile",
            "body": "Work in the visible Frame Card area of frame style, intensity, and color preset. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The relevant plugin surface is visibly identified."
          },
          "es": {
            "title": "Configura Frame Card en el perfil de prueba",
            "body": "Trabaja en el area visible Frame Card de estilo de marco, intensidad y preajuste de color. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La superficie correspondiente del plugin queda identificada."
          },
          "fr": {
            "title": "Configurez Frame Card dans le profil de test",
            "body": "Travaillez dans la zone visible Frame Card de style de cadre, intensité et préréglage de couleur. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La surface de plugin correspondante est clairement visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/flame-overlay/ui/settings.html"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#status"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/flame-overlay/ui/settings.html"
          },
          {
            "type": "visible",
            "selector": "#status"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#status",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "frame-style",
      "copy": {
        "de": {
          "title": "Frame Style im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Frame Style von Rahmenstil, Intensität und Farbvorgabe. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Frame Style im Testprofil konfigurieren - Rahmenstil, Intensität und Farbvorgabe"
        },
        "en": {
          "title": "Configure Frame Style in the test profile",
          "body": "Work in the visible Frame Style area of frame style, intensity, and color preset. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Frame Style in the test profile - frame style, intensity, and color preset"
        },
        "es": {
          "title": "Configura Frame Style en el perfil de prueba",
          "body": "Trabaja en el area visible Frame Style de estilo de marco, intensidad y preajuste de color. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Frame Style en el perfil de prueba - estilo de marco, intensidad y preajuste de color"
        },
        "fr": {
          "title": "Configurez Frame Style dans le profil de test",
          "body": "Travaillez dans la zone visible Frame Style de style de cadre, intensité et préréglage de couleur. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Frame Style dans le profil de test - style de cadre, intensité et préréglage de couleur"
        }
      },
      "capture": {
        "route": "/plugins/flame-overlay/ui/settings.html",
        "assertVisible": "#frameMode",
        "focusText": {
          "de": "Frame Style im Testprofil konfigurieren",
          "en": "Configure Frame Style in the test profile",
          "es": "Configura Frame Style en el perfil de prueba",
          "fr": "Configurez Frame Style dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "prepare": "open-flame-frame-tab",
          "stepId": "frame-style"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/flame-overlay/ui/settings.html",
        "instructions": {
          "de": {
            "title": "Frame Style im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Frame Style von Rahmenstil, Intensität und Farbvorgabe. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Frame Style in the test profile",
            "body": "Work in the visible Frame Style area of frame style, intensity, and color preset. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Frame Style en el perfil de prueba",
            "body": "Trabaja en el area visible Frame Style de estilo de marco, intensidad y preajuste de color. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Frame Style dans le profil de test",
            "body": "Travaillez dans la zone visible Frame Style de style de cadre, intensité et préréglage de couleur. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/flame-overlay/ui/settings.html"
          },
          {
            "type": "prepare",
            "name": "open-flame-frame-tab"
          },
          {
            "type": "set-demo-value",
            "selector": "#frameMode"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/flame-overlay/ui/settings.html"
          },
          {
            "type": "visible",
            "selector": "#frameMode"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#frameMode",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "frame-intensity",
      "copy": {
        "de": {
          "title": "Frame Intensity im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Frame Intensity von Rahmenstil, Intensität und Farbvorgabe. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Frame Intensity im Testprofil konfigurieren - Rahmenstil, Intensität und Farbvorgabe"
        },
        "en": {
          "title": "Configure Frame Intensity in the test profile",
          "body": "Work in the visible Frame Intensity area of frame style, intensity, and color preset. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Frame Intensity in the test profile - frame style, intensity, and color preset"
        },
        "es": {
          "title": "Configura Frame Intensity en el perfil de prueba",
          "body": "Trabaja en el area visible Frame Intensity de estilo de marco, intensidad y preajuste de color. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Frame Intensity en el perfil de prueba - estilo de marco, intensidad y preajuste de color"
        },
        "fr": {
          "title": "Configurez Frame Intensity dans le profil de test",
          "body": "Travaillez dans la zone visible Frame Intensity de style de cadre, intensité et préréglage de couleur. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Frame Intensity dans le profil de test - style de cadre, intensité et préréglage de couleur"
        }
      },
      "capture": {
        "route": "/plugins/flame-overlay/ui/settings.html",
        "assertVisible": "#flameSpeed",
        "focusText": {
          "de": "Frame Intensity im Testprofil konfigurieren",
          "en": "Configure Frame Intensity in the test profile",
          "es": "Configura Frame Intensity en el perfil de prueba",
          "fr": "Configurez Frame Intensity dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "prepare": "open-flame-motion-tab",
          "stepId": "frame-intensity"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/flame-overlay/ui/settings.html",
        "instructions": {
          "de": {
            "title": "Frame Intensity im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Frame Intensity von Rahmenstil, Intensität und Farbvorgabe. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Frame Intensity in the test profile",
            "body": "Work in the visible Frame Intensity area of frame style, intensity, and color preset. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Frame Intensity en el perfil de prueba",
            "body": "Trabaja en el area visible Frame Intensity de estilo de marco, intensidad y preajuste de color. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Frame Intensity dans le profil de test",
            "body": "Travaillez dans la zone visible Frame Intensity de style de cadre, intensité et préréglage de couleur. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/flame-overlay/ui/settings.html"
          },
          {
            "type": "prepare",
            "name": "open-flame-motion-tab"
          },
          {
            "type": "set-demo-value",
            "selector": "#flameSpeed"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/flame-overlay/ui/settings.html"
          },
          {
            "type": "visible",
            "selector": "#flameSpeed"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#flameSpeed",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "frame-preview",
      "copy": {
        "de": {
          "title": "Frame Preview lokal testen",
          "body": "Fuehre Frame Preview nur mit die lokale Rahmenvorschau im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
          "expected": "der Rahmen ist sichtbar, ohne eine LIVE-Szene zu verändern",
          "alt": "Frame Preview lokal testen - Rahmenstil, Intensität und Farbvorgabe"
        },
        "en": {
          "title": "Test Frame Preview locally",
          "body": "Run Frame Preview only with the local frame preview in the isolated test profile; no LIVE source, hardware, or external connection is used.",
          "expected": "the frame is visible without changing a LIVE scene",
          "alt": "Test Frame Preview locally - frame style, intensity, and color preset"
        },
        "es": {
          "title": "Prueba Frame Preview localmente",
          "body": "Ejecuta Frame Preview solo con la vista previa local del marco en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
          "expected": "el marco es visible sin cambiar una escena LIVE",
          "alt": "Prueba Frame Preview localmente - estilo de marco, intensidad y preajuste de color"
        },
        "fr": {
          "title": "Testez Frame Preview localement",
          "body": "Executez Frame Preview uniquement avec l’aperçu local du cadre dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
          "expected": "le cadre est visible sans modifier une scène LIVE",
          "alt": "Testez Frame Preview localement - style de cadre, intensité et préréglage de couleur"
        }
      },
      "capture": {
        "route": "/plugins/flame-overlay/ui/settings.html",
        "assertVisible": "#previewToggle",
        "focusText": {
          "de": "Frame Preview lokal testen",
          "en": "Test Frame Preview locally",
          "es": "Prueba Frame Preview localmente",
          "fr": "Testez Frame Preview localement"
        },
        "action": {
          "type": "run-local-preview",
          "stepId": "frame-preview"
        },
        "expected": {
          "de": "der Rahmen ist sichtbar, ohne eine LIVE-Szene zu verändern",
          "en": "the frame is visible without changing a LIVE scene",
          "es": "el marco es visible sin cambiar una escena LIVE",
          "fr": "le cadre est visible sans modifier une scène LIVE"
        }
      },
      "workflow": {
        "route": "/plugins/flame-overlay/ui/settings.html",
        "instructions": {
          "de": {
            "title": "Frame Preview lokal testen",
            "body": "Fuehre Frame Preview nur mit die lokale Rahmenvorschau im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
            "expected": "der Rahmen ist sichtbar, ohne eine LIVE-Szene zu verändern"
          },
          "en": {
            "title": "Test Frame Preview locally",
            "body": "Run Frame Preview only with the local frame preview in the isolated test profile; no LIVE source, hardware, or external connection is used.",
            "expected": "the frame is visible without changing a LIVE scene"
          },
          "es": {
            "title": "Prueba Frame Preview localmente",
            "body": "Ejecuta Frame Preview solo con la vista previa local del marco en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
            "expected": "el marco es visible sin cambiar una escena LIVE"
          },
          "fr": {
            "title": "Testez Frame Preview localement",
            "body": "Executez Frame Preview uniquement avec l’aperçu local du cadre dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
            "expected": "le cadre est visible sans modifier une scène LIVE"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/flame-overlay/ui/settings.html"
          },
          {
            "type": "run-local-preview",
            "selector": "#previewToggle"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/flame-overlay/ui/settings.html"
          },
          {
            "type": "visible",
            "selector": "#previewToggle"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#previewToggle",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "frame-obs-source",
      "copy": {
        "de": {
          "title": "Frame OBS Source als Overlay-Vorschau oeffnen",
          "body": "Oeffne die echte Frame OBS Source-Oberflaeche nur in einer nicht sendenden OBS-Testszene. Ohne lokales Testereignis kann sie leer oder transparent bleiben; es werden keine Demo-Inhalte eingefuegt. Für Visual FX Frame prüft dieser Schritt ausdrücklich „Frame OBS Source als Overlay-Vorschau oeffnen“.",
          "expected": "der Rahmen ist sichtbar, ohne eine LIVE-Szene zu verändern",
          "alt": "Frame OBS Source als Overlay-Vorschau oeffnen - Rahmenstil, Intensität und Farbvorgabe"
        },
        "en": {
          "title": "Open Frame OBS Source as an overlay preview",
          "body": "Open the real Frame OBS Source surface only in an OBS test scene that is not live. Without a local test event, it can remain empty or transparent; no demo content is inserted. For Visual FX Frame, this step explicitly verifies “Open Frame OBS Source as an overlay preview”.",
          "expected": "the frame is visible without changing a LIVE scene",
          "alt": "Open Frame OBS Source as an overlay preview - frame style, intensity, and color preset"
        },
        "es": {
          "title": "Abre Frame OBS Source como vista previa de overlay",
          "body": "Abre la superficie real Frame OBS Source solo en una escena de prueba de OBS que no esta al aire. Sin un evento local de prueba, puede quedar vacia o transparente; no se inserta contenido demo. Para Visual FX Frame, este paso comprueba expresamente «Abre Frame OBS Source como vista previa de overlay».",
          "expected": "el marco es visible sin cambiar una escena LIVE",
          "alt": "Abre Frame OBS Source como vista previa de overlay - estilo de marco, intensidad y preajuste de color"
        },
        "fr": {
          "title": "Ouvrez Frame OBS Source comme apercu overlay",
          "body": "Ouvrez la vraie surface Frame OBS Source uniquement dans une scene de test OBS non diffusee. Sans evenement de test local, elle peut rester vide ou transparente ; aucun contenu de demonstration nest insere. Pour Visual FX Frame, cette étape vérifie explicitement « Ouvrez Frame OBS Source comme apercu overlay ».",
          "expected": "le cadre est visible sans modifier une scène LIVE",
          "alt": "Ouvrez Frame OBS Source comme apercu overlay - style de cadre, intensité et préréglage de couleur"
        }
      },
      "capture": {
        "route": "/flame-overlay/overlay",
        "assertVisible": "#flameCanvas",
        "focusText": {
          "de": "Frame OBS Source als Overlay-Vorschau oeffnen",
          "en": "Open Frame OBS Source as an overlay preview",
          "es": "Abre Frame OBS Source como vista previa de overlay",
          "fr": "Ouvrez Frame OBS Source comme apercu overlay"
        },
        "action": {
          "type": "open-overlay-preview",
          "stepId": "frame-obs-source"
        },
        "expected": {
          "de": "der Rahmen ist sichtbar, ohne eine LIVE-Szene zu verändern",
          "en": "the frame is visible without changing a LIVE scene",
          "es": "el marco es visible sin cambiar una escena LIVE",
          "fr": "le cadre est visible sans modifier une scène LIVE"
        }
      },
      "workflow": {
        "route": "/flame-overlay/overlay",
        "instructions": {
          "de": {
            "title": "Frame OBS Source als Overlay-Vorschau oeffnen",
            "body": "Oeffne die echte Frame OBS Source-Oberflaeche nur in einer nicht sendenden OBS-Testszene. Ohne lokales Testereignis kann sie leer oder transparent bleiben; es werden keine Demo-Inhalte eingefuegt. Für Visual FX Frame prüft dieser Schritt ausdrücklich „Frame OBS Source als Overlay-Vorschau oeffnen“.",
            "expected": "der Rahmen ist sichtbar, ohne eine LIVE-Szene zu verändern"
          },
          "en": {
            "title": "Open Frame OBS Source as an overlay preview",
            "body": "Open the real Frame OBS Source surface only in an OBS test scene that is not live. Without a local test event, it can remain empty or transparent; no demo content is inserted. For Visual FX Frame, this step explicitly verifies “Open Frame OBS Source as an overlay preview”.",
            "expected": "the frame is visible without changing a LIVE scene"
          },
          "es": {
            "title": "Abre Frame OBS Source como vista previa de overlay",
            "body": "Abre la superficie real Frame OBS Source solo en una escena de prueba de OBS que no esta al aire. Sin un evento local de prueba, puede quedar vacia o transparente; no se inserta contenido demo. Para Visual FX Frame, este paso comprueba expresamente «Abre Frame OBS Source como vista previa de overlay».",
            "expected": "el marco es visible sin cambiar una escena LIVE"
          },
          "fr": {
            "title": "Ouvrez Frame OBS Source comme apercu overlay",
            "body": "Ouvrez la vraie surface Frame OBS Source uniquement dans une scene de test OBS non diffusee. Sans evenement de test local, elle peut rester vide ou transparente ; aucun contenu de demonstration nest insere. Pour Visual FX Frame, cette étape vérifie explicitement « Ouvrez Frame OBS Source comme apercu overlay ».",
            "expected": "le cadre est visible sans modifier une scène LIVE"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/flame-overlay/overlay"
          },
          {
            "type": "open-overlay-preview",
            "selector": "#flameCanvas"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/flame-overlay/overlay"
          },
          {
            "type": "visible",
            "selector": "#flameCanvas"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#flameCanvas",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "frame-reset",
      "copy": {
        "de": {
          "title": "Frame Reset sicher zuruecksetzen",
          "body": "Entferne nur die Demo-Werte fuer Frame Reset, bevor du Rahmenstil, Intensität und Farbvorgabe produktiv vorbereitest.",
          "expected": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "alt": "Frame Reset sicher zuruecksetzen - Rahmenstil, Intensität und Farbvorgabe"
        },
        "en": {
          "title": "Reset Frame Reset safely",
          "body": "Remove only the demo values for Frame Reset before preparing frame style, intensity, and color preset for production.",
          "expected": "The test profile remains free of production impact.",
          "alt": "Reset Frame Reset safely - frame style, intensity, and color preset"
        },
        "es": {
          "title": "Restablece Frame Reset con seguridad",
          "body": "Elimina solo los valores demo de Frame Reset antes de preparar estilo de marco, intensidad y preajuste de color para produccion.",
          "expected": "El perfil de prueba permanece sin impacto de producción.",
          "alt": "Restablece Frame Reset con seguridad - estilo de marco, intensidad y preajuste de color"
        },
        "fr": {
          "title": "Reinitialisez Frame Reset en securite",
          "body": "Supprimez uniquement les valeurs demo de Frame Reset avant de preparer style de cadre, intensité et préréglage de couleur pour la production.",
          "expected": "Le profil de test reste sans impact de production.",
          "alt": "Reinitialisez Frame Reset en securite - style de cadre, intensité et préréglage de couleur"
        }
      },
      "capture": {
        "route": "/plugins/flame-overlay/ui/settings.html",
        "assertVisible": "#savePresetBtn",
        "focusText": {
          "de": "Frame Reset sicher zuruecksetzen",
          "en": "Reset Frame Reset safely",
          "es": "Restablece Frame Reset con seguridad",
          "fr": "Reinitialisez Frame Reset en securite"
        },
        "action": {
          "type": "reset-demo-state",
          "stepId": "frame-reset"
        },
        "expected": {
          "de": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "en": "The test profile remains free of production impact.",
          "es": "El perfil de prueba permanece sin impacto de producción.",
          "fr": "Le profil de test reste sans impact de production."
        }
      },
      "workflow": {
        "route": "/plugins/flame-overlay/ui/settings.html",
        "instructions": {
          "de": {
            "title": "Frame Reset sicher zuruecksetzen",
            "body": "Entferne nur die Demo-Werte fuer Frame Reset, bevor du Rahmenstil, Intensität und Farbvorgabe produktiv vorbereitest.",
            "expected": "Das Testprofil bleibt ohne produktive Auswirkung."
          },
          "en": {
            "title": "Reset Frame Reset safely",
            "body": "Remove only the demo values for Frame Reset before preparing frame style, intensity, and color preset for production.",
            "expected": "The test profile remains free of production impact."
          },
          "es": {
            "title": "Restablece Frame Reset con seguridad",
            "body": "Elimina solo los valores demo de Frame Reset antes de preparar estilo de marco, intensidad y preajuste de color para produccion.",
            "expected": "El perfil de prueba permanece sin impacto de producción."
          },
          "fr": {
            "title": "Reinitialisez Frame Reset en securite",
            "body": "Supprimez uniquement les valeurs demo de Frame Reset avant de preparer style de cadre, intensité et préréglage de couleur pour la production.",
            "expected": "Le profil de test reste sans impact de production."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/flame-overlay/ui/settings.html"
          },
          {
            "type": "reset-demo-state",
            "selector": "#savePresetBtn"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/flame-overlay/ui/settings.html"
          },
          {
            "type": "visible",
            "selector": "#savePresetBtn"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#savePresetBtn",
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
