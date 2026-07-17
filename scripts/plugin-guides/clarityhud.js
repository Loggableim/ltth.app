'use strict';

const { exactLocalUrlExpectation } = require('../lib/guide-overlay-entry-points');

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
const guide = {
  "id": "clarityhud",
  "route": "/clarityhud/ui",
  "topic": {
    "de": "HUD-Module, Chatbereich und Stream-Overlay",
    "en": "HUD modules, chat area, and stream overlay",
    "es": "módulos HUD, área de chat y overlay de stream",
    "fr": "modules HUD, zone de chat et overlay de stream"
  },
  "test": {
    "de": "die Full-HUD-Vorschau mit Demo-Daten",
    "en": "the full HUD preview with demo data",
    "es": "la vista previa Full HUD con datos demo",
    "fr": "l’aperçu Full HUD avec des données démo"
  },
  "expected": {
    "de": "die gewählten HUD-Bereiche sind in der Vorschau sichtbar",
    "en": "the selected HUD sections are visible in preview",
    "es": "las áreas HUD seleccionadas son visibles en la vista previa",
    "fr": "les zones HUD sélectionnées sont visibles dans l’aperçu"
  },
  "requirement": "obs",
  "safety": "obs",
  "mode": "ui",
  "overlay": "/overlay/clarity/full",
  "related": [
    "spotlight",
    "toptier"
  ],
  "copy": {
    "de": {
      "title": "ClarityHUD",
      "summary": "ClarityHUD richtet HUD-Module, Chatbereich und Stream-Overlay ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "die gewählten HUD-Bereiche sind in der Vorschau sichtbar",
      "requirements": "LTTH Dashboard; für die Ausgabe zusätzlich eine OBS-Testszene. Dieser konkrete ClarityHUD-Ablauf behandelt HUD-Module, Chatbereich und Stream-Overlay.",
      "safety": "Nutze eine nicht gesendete OBS-Testszene; LIVE-Ausgaben bleiben deaktiviert. Dieser konkrete ClarityHUD-Ablauf behandelt HUD-Module, Chatbereich und Stream-Overlay.",
      "troubleshooting": "Wenn HUD-Module, Chatbereich und Stream-Overlay nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "spotlight",
        "toptier"
      ]
    },
    "en": {
      "title": "ClarityHUD",
      "summary": "ClarityHUD configures HUD modules, chat area, and stream overlay with a safe local check instead of a LIVE trigger.",
      "firstResult": "the selected HUD sections are visible in preview",
      "requirements": "LTTH Dashboard; use an OBS test scene for output. This ClarityHUD workflow specifically covers HUD modules, chat area, and stream overlay.",
      "safety": "Use an OBS test scene that is not live; LIVE output remains disabled. This ClarityHUD workflow specifically covers HUD modules, chat area, and stream overlay.",
      "troubleshooting": "If HUD modules, chat area, and stream overlay is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "spotlight",
        "toptier"
      ]
    },
    "es": {
      "title": "ClarityHUD",
      "summary": "ClarityHUD configura módulos HUD, área de chat y overlay de stream mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "las áreas HUD seleccionadas son visibles en la vista previa",
      "requirements": "El panel de LTTH y una escena de prueba de OBS para la salida. Este flujo concreto de ClarityHUD trata módulos HUD, área de chat y overlay de stream.",
      "safety": "Usa una escena de prueba de OBS que no esté al aire; la salida LIVE permanece desactivada. Este flujo concreto de ClarityHUD trata módulos HUD, área de chat y overlay de stream.",
      "troubleshooting": "Si módulos HUD, área de chat y overlay de stream no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "spotlight",
        "toptier"
      ]
    },
    "fr": {
      "title": "ClarityHUD",
      "summary": "ClarityHUD configure modules HUD, zone de chat et overlay de stream avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "les zones HUD sélectionnées sont visibles dans l’aperçu",
      "requirements": "Le tableau de bord LTTH et une scène de test OBS pour la sortie. Ce flux spécifique de ClarityHUD couvre modules HUD, zone de chat et overlay de stream.",
      "safety": "Utilisez une scène de test OBS non diffusée ; la sortie LIVE reste désactivée. Ce flux spécifique de ClarityHUD couvre modules HUD, zone de chat et overlay de stream.",
      "troubleshooting": "Si modules HUD, zone de chat et overlay de stream n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "spotlight",
        "toptier"
      ]
    }
  },
  "steps": [
    {
      "id": "hud-card",
      "copy": {
        "de": {
          "title": "HUD Card im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich HUD Card von HUD-Module, Chatbereich und Stream-Overlay. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "alt": "HUD Card im Testprofil konfigurieren - HUD-Module, Chatbereich und Stream-Overlay"
        },
        "en": {
          "title": "Configure HUD Card in the test profile",
          "body": "Work in the visible HUD Card area of HUD modules, chat area, and stream overlay. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The relevant plugin surface is visibly identified.",
          "alt": "Configure HUD Card in the test profile - HUD modules, chat area, and stream overlay"
        },
        "es": {
          "title": "Configura HUD Card en el perfil de prueba",
          "body": "Trabaja en el area visible HUD Card de módulos HUD, área de chat y overlay de stream. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La superficie correspondiente del plugin queda identificada.",
          "alt": "Configura HUD Card en el perfil de prueba - módulos HUD, área de chat y overlay de stream"
        },
        "fr": {
          "title": "Configurez HUD Card dans le profil de test",
          "body": "Travaillez dans la zone visible HUD Card de modules HUD, zone de chat et overlay de stream. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La surface de plugin correspondante est clairement visible.",
          "alt": "Configurez HUD Card dans le profil de test - modules HUD, zone de chat et overlay de stream"
        }
      },
      "capture": {
        "route": "/clarityhud/ui",
        "assertVisible": "#plugin-version",
        "focusText": {
          "de": "HUD Card im Testprofil konfigurieren",
          "en": "Configure HUD Card in the test profile",
          "es": "Configura HUD Card en el perfil de prueba",
          "fr": "Configurez HUD Card dans le profil de test"
        },
        "action": {
          "type": "open-plugin-surface",
          "stepId": "hud-card"
        },
        "expected": {
          "de": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "en": "The relevant plugin surface is visibly identified.",
          "es": "La superficie correspondiente del plugin queda identificada.",
          "fr": "La surface de plugin correspondante est clairement visible."
        }
      },
      "workflow": {
        "route": "/clarityhud/ui",
        "instructions": {
          "de": {
            "title": "HUD Card im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich HUD Card von HUD-Module, Chatbereich und Stream-Overlay. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar."
          },
          "en": {
            "title": "Configure HUD Card in the test profile",
            "body": "Work in the visible HUD Card area of HUD modules, chat area, and stream overlay. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The relevant plugin surface is visibly identified."
          },
          "es": {
            "title": "Configura HUD Card en el perfil de prueba",
            "body": "Trabaja en el area visible HUD Card de módulos HUD, área de chat y overlay de stream. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La superficie correspondiente del plugin queda identificada."
          },
          "fr": {
            "title": "Configurez HUD Card dans le profil de test",
            "body": "Travaillez dans la zone visible HUD Card de modules HUD, zone de chat et overlay de stream. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La surface de plugin correspondante est clairement visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/clarityhud/ui"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#plugin-version"
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
              "path": "/clarityhud/ui",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#plugin-version"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#plugin-version",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "hud-modules",
      "copy": {
        "de": {
          "title": "HUD Modules im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich HUD Modules von HUD-Module, Chatbereich und Stream-Overlay. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "HUD Modules im Testprofil konfigurieren - HUD-Module, Chatbereich und Stream-Overlay"
        },
        "en": {
          "title": "Configure HUD Modules in the test profile",
          "body": "Work in the visible HUD Modules area of HUD modules, chat area, and stream overlay. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure HUD Modules in the test profile - HUD modules, chat area, and stream overlay"
        },
        "es": {
          "title": "Configura HUD Modules en el perfil de prueba",
          "body": "Trabaja en el area visible HUD Modules de módulos HUD, área de chat y overlay de stream. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura HUD Modules en el perfil de prueba - módulos HUD, área de chat y overlay de stream"
        },
        "fr": {
          "title": "Configurez HUD Modules dans le profil de test",
          "body": "Travaillez dans la zone visible HUD Modules de modules HUD, zone de chat et overlay de stream. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez HUD Modules dans le profil de test - modules HUD, zone de chat et overlay de stream"
        }
      },
      "capture": {
        "route": "/clarityhud/ui",
        "assertVisible": "#chat-url",
        "focusText": {
          "de": "HUD Modules im Testprofil konfigurieren",
          "en": "Configure HUD Modules in the test profile",
          "es": "Configura HUD Modules en el perfil de prueba",
          "fr": "Configurez HUD Modules dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "hud-modules"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/clarityhud/ui",
        "instructions": {
          "de": {
            "title": "HUD Modules im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich HUD Modules von HUD-Module, Chatbereich und Stream-Overlay. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure HUD Modules in the test profile",
            "body": "Work in the visible HUD Modules area of HUD modules, chat area, and stream overlay. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura HUD Modules en el perfil de prueba",
            "body": "Trabaja en el area visible HUD Modules de módulos HUD, área de chat y overlay de stream. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez HUD Modules dans le profil de test",
            "body": "Travaillez dans la zone visible HUD Modules de modules HUD, zone de chat et overlay de stream. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/clarityhud/ui"
          },
          {
            "type": "set-demo-value",
            "selector": "#chat-url"
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
              "path": "/clarityhud/ui",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#chat-url"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#chat-url",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "chat-region",
      "copy": {
        "de": {
          "title": "Chat Region im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Chat Region von HUD-Module, Chatbereich und Stream-Overlay. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Chat Region im Testprofil konfigurieren - HUD-Module, Chatbereich und Stream-Overlay"
        },
        "en": {
          "title": "Configure Chat Region in the test profile",
          "body": "Work in the visible Chat Region area of HUD modules, chat area, and stream overlay. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Chat Region in the test profile - HUD modules, chat area, and stream overlay"
        },
        "es": {
          "title": "Configura Chat Region en el perfil de prueba",
          "body": "Trabaja en el area visible Chat Region de módulos HUD, área de chat y overlay de stream. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Chat Region en el perfil de prueba - módulos HUD, área de chat y overlay de stream"
        },
        "fr": {
          "title": "Configurez Chat Region dans le profil de test",
          "body": "Travaillez dans la zone visible Chat Region de modules HUD, zone de chat et overlay de stream. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Chat Region dans le profil de test - modules HUD, zone de chat et overlay de stream"
        }
      },
      "capture": {
        "route": "/clarityhud/ui",
        "assertVisible": "#chat-preview",
        "focusText": {
          "de": "Chat Region im Testprofil konfigurieren",
          "en": "Configure Chat Region in the test profile",
          "es": "Configura Chat Region en el perfil de prueba",
          "fr": "Configurez Chat Region dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "chat-region"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/clarityhud/ui",
        "instructions": {
          "de": {
            "title": "Chat Region im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Chat Region von HUD-Module, Chatbereich und Stream-Overlay. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Chat Region in the test profile",
            "body": "Work in the visible Chat Region area of HUD modules, chat area, and stream overlay. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Chat Region en el perfil de prueba",
            "body": "Trabaja en el area visible Chat Region de módulos HUD, área de chat y overlay de stream. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Chat Region dans le profil de test",
            "body": "Travaillez dans la zone visible Chat Region de modules HUD, zone de chat et overlay de stream. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/clarityhud/ui"
          },
          {
            "type": "set-demo-value",
            "selector": "#chat-preview"
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
              "path": "/clarityhud/ui",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#chat-preview"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#chat-preview",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "full-hud-preview",
      "copy": {
        "de": {
          "title": "Full HUD Preview lokal testen",
          "body": "Fuehre Full HUD Preview nur mit die Full-HUD-Vorschau mit Demo-Daten im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
          "expected": "die gewählten HUD-Bereiche sind in der Vorschau sichtbar",
          "alt": "Full HUD Preview lokal testen - HUD-Module, Chatbereich und Stream-Overlay"
        },
        "en": {
          "title": "Test Full HUD Preview locally",
          "body": "Run Full HUD Preview only with the full HUD preview with demo data in the isolated test profile; no LIVE source, hardware, or external connection is used.",
          "expected": "the selected HUD sections are visible in preview",
          "alt": "Test Full HUD Preview locally - HUD modules, chat area, and stream overlay"
        },
        "es": {
          "title": "Prueba Full HUD Preview localmente",
          "body": "Ejecuta Full HUD Preview solo con la vista previa Full HUD con datos demo en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
          "expected": "las áreas HUD seleccionadas son visibles en la vista previa",
          "alt": "Prueba Full HUD Preview localmente - módulos HUD, área de chat y overlay de stream"
        },
        "fr": {
          "title": "Testez Full HUD Preview localement",
          "body": "Executez Full HUD Preview uniquement avec l’aperçu Full HUD avec des données démo dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
          "expected": "les zones HUD sélectionnées sont visibles dans l’aperçu",
          "alt": "Testez Full HUD Preview localement - modules HUD, zone de chat et overlay de stream"
        }
      },
      "capture": {
        "route": "/clarityhud/ui",
        "assertVisible": "#full-preview",
        "focusText": {
          "de": "Full HUD Preview lokal testen",
          "en": "Test Full HUD Preview locally",
          "es": "Prueba Full HUD Preview localmente",
          "fr": "Testez Full HUD Preview localement"
        },
        "action": {
          "type": "run-local-preview",
          "stepId": "full-hud-preview"
        },
        "expected": {
          "de": "die gewählten HUD-Bereiche sind in der Vorschau sichtbar",
          "en": "the selected HUD sections are visible in preview",
          "es": "las áreas HUD seleccionadas son visibles en la vista previa",
          "fr": "les zones HUD sélectionnées sont visibles dans l’aperçu"
        }
      },
      "workflow": {
        "route": "/clarityhud/ui",
        "instructions": {
          "de": {
            "title": "Full HUD Preview lokal testen",
            "body": "Fuehre Full HUD Preview nur mit die Full-HUD-Vorschau mit Demo-Daten im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
            "expected": "die gewählten HUD-Bereiche sind in der Vorschau sichtbar"
          },
          "en": {
            "title": "Test Full HUD Preview locally",
            "body": "Run Full HUD Preview only with the full HUD preview with demo data in the isolated test profile; no LIVE source, hardware, or external connection is used.",
            "expected": "the selected HUD sections are visible in preview"
          },
          "es": {
            "title": "Prueba Full HUD Preview localmente",
            "body": "Ejecuta Full HUD Preview solo con la vista previa Full HUD con datos demo en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
            "expected": "las áreas HUD seleccionadas son visibles en la vista previa"
          },
          "fr": {
            "title": "Testez Full HUD Preview localement",
            "body": "Executez Full HUD Preview uniquement avec l’aperçu Full HUD avec des données démo dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
            "expected": "les zones HUD sélectionnées sont visibles dans l’aperçu"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/clarityhud/ui"
          },
          {
            "type": "run-local-preview",
            "selector": "#full-preview"
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
              "path": "/clarityhud/ui",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#full-preview"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#full-preview",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "obs-hud-source",
      "copy": {
        "de": {
          "title": "Die echte Full-HUD-URL als OBS-Browserquelle verwenden",
          "body": "Kopiere die sichtbare Full-HUD-URL und fuege sie in eine OBS-Browserquelle ein. Ein leeres Overlay zeigt ohne Ereignisdaten absichtlich nichts; die URL in der Konfiguration ist der echte Einstieg.",
          "expected": "Die konkrete Full-HUD-URL ist sichtbar und kann ohne erfundene Overlay-Inhalte kopiert werden.",
          "alt": "Die echte Full-HUD-URL als OBS-Browserquelle verwenden - HUD-Module, Chatbereich und Stream-Overlay"
        },
        "en": {
          "title": "Use the real Full HUD URL as an OBS Browser Source",
          "body": "Copy the visible Full HUD URL into an OBS Browser Source. An overlay intentionally shows nothing without event data; the configuration URL is the real entry point.",
          "expected": "The concrete Full HUD URL is visible and can be copied without invented overlay content.",
          "alt": "Use the real Full HUD URL as an OBS Browser Source - HUD modules, chat area, and stream overlay"
        },
        "es": {
          "title": "Usa la URL real de Full HUD como fuente de navegador OBS",
          "body": "Copia la URL visible de Full HUD en una fuente de navegador OBS. Un overlay no muestra nada intencionalmente sin datos de eventos; la URL de configuracion es la entrada real.",
          "expected": "La URL concreta de Full HUD queda visible y puede copiarse sin contenido de overlay inventado.",
          "alt": "Usa la URL real de Full HUD como fuente de navegador OBS - módulos HUD, área de chat y overlay de stream"
        },
        "fr": {
          "title": "Utilisez la vraie URL Full HUD comme source navigateur OBS",
          "body": "Copiez lURL Full HUD visible dans une source navigateur OBS. Un overlay naffiche volontairement rien sans donnees devenement ; lURL de configuration est le vrai point dentree.",
          "expected": "LURL Full HUD concrete est visible et peut etre copiee sans contenu overlay invente.",
          "alt": "Utilisez la vraie URL Full HUD comme source navigateur OBS - modules HUD, zone de chat et overlay de stream"
        }
      },
      "capture": {
        "route": "/clarityhud/ui",
        "assertVisible": "#full-url",
        "focusText": {
          "de": "Die echte Full-HUD-URL als OBS-Browserquelle verwenden",
          "en": "Use the real Full HUD URL as an OBS Browser Source",
          "es": "Usa la URL real de Full HUD como fuente de navegador OBS",
          "fr": "Utilisez la vraie URL Full HUD comme source navigateur OBS"
        },
        "action": {
          "type": "open-overlay-preview",
          "stepId": "obs-hud-source"
        },
        "expected": {
          "de": "Die konkrete Full-HUD-URL ist sichtbar und kann ohne erfundene Overlay-Inhalte kopiert werden.",
          "en": "The concrete Full HUD URL is visible and can be copied without invented overlay content.",
          "es": "La URL concreta de Full HUD queda visible y puede copiarse sin contenido de overlay inventado.",
          "fr": "LURL Full HUD concrete est visible et peut etre copiee sans contenu overlay invente."
        }
      },
      "workflow": {
        "route": "/clarityhud/ui",
        "instructions": {
          "de": {
            "title": "Die echte Full-HUD-URL als OBS-Browserquelle verwenden",
            "body": "Kopiere die sichtbare Full-HUD-URL und fuege sie in eine OBS-Browserquelle ein. Ein leeres Overlay zeigt ohne Ereignisdaten absichtlich nichts; die URL in der Konfiguration ist der echte Einstieg.",
            "expected": "Die konkrete Full-HUD-URL ist sichtbar und kann ohne erfundene Overlay-Inhalte kopiert werden."
          },
          "en": {
            "title": "Use the real Full HUD URL as an OBS Browser Source",
            "body": "Copy the visible Full HUD URL into an OBS Browser Source. An overlay intentionally shows nothing without event data; the configuration URL is the real entry point.",
            "expected": "The concrete Full HUD URL is visible and can be copied without invented overlay content."
          },
          "es": {
            "title": "Usa la URL real de Full HUD como fuente de navegador OBS",
            "body": "Copia la URL visible de Full HUD en una fuente de navegador OBS. Un overlay no muestra nada intencionalmente sin datos de eventos; la URL de configuracion es la entrada real.",
            "expected": "La URL concreta de Full HUD queda visible y puede copiarse sin contenido de overlay inventado."
          },
          "fr": {
            "title": "Utilisez la vraie URL Full HUD comme source navigateur OBS",
            "body": "Copiez lURL Full HUD visible dans une source navigateur OBS. Un overlay naffiche volontairement rien sans donnees devenement ; lURL de configuration est le vrai point dentree.",
            "expected": "LURL Full HUD concrete est visible et peut etre copiee sans contenu overlay invente."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/clarityhud/ui"
          },
          {
            "type": "open-overlay-preview",
            "selector": "#full-url"
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
              "path": "/clarityhud/ui",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#full-url"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#full-url",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "hud-reset",
      "copy": {
        "de": {
          "title": "HUD Reset: Einstellungen oeffnen",
          "body": "Klicke auf den echten Button „Settings“ der Chat-HUD-Karte. Es wird nur der lokale Einstellungsdialog geoeffnet; die Reset-Schaltflaeche wird nicht ausgefuehrt.",
          "expected": "Im Einstellungsdialog ist „Reset to Defaults“ sichtbar, ohne dass Einstellungen geaendert wurden.",
          "alt": "HUD Reset: Einstellungen oeffnen - HUD-Module, Chatbereich und Stream-Overlay"
        },
        "en": {
          "title": "Open settings for HUD Reset",
          "body": "Click the real “Settings” button on the Chat HUD card. This opens only the local settings dialog; do not run the reset control.",
          "expected": "“Reset to Defaults” is visible in the settings dialog without changing any settings.",
          "alt": "Open settings for HUD Reset - HUD modules, chat area, and stream overlay"
        },
        "es": {
          "title": "Abre los ajustes de HUD Reset",
          "body": "Haz clic en el boton real «Settings» de la tarjeta Chat HUD. Solo abre el dialogo de ajustes local; no ejecutes el control de restablecimiento.",
          "expected": "«Reset to Defaults» queda visible en el dialogo sin cambiar ningun ajuste.",
          "alt": "Abre los ajustes de HUD Reset - módulos HUD, área de chat y overlay de stream"
        },
        "fr": {
          "title": "Ouvrez les reglages de HUD Reset",
          "body": "Cliquez sur le vrai bouton « Settings » de la carte Chat HUD. Il ouvre uniquement la boite de dialogue locale ; n executez pas la commande de reinitialisation.",
          "expected": "« Reset to Defaults » est visible dans la boite de dialogue sans modifier aucun reglage.",
          "alt": "Ouvrez les reglages de HUD Reset - modules HUD, zone de chat et overlay de stream"
        }
      },
      "capture": {
        "route": "/clarityhud/ui",
        "assertVisible": "#reset-defaults-btn",
        "focusText": {
          "de": "HUD Reset: Einstellungen oeffnen",
          "en": "Open settings for HUD Reset",
          "es": "Abre los ajustes de HUD Reset",
          "fr": "Ouvrez les reglages de HUD Reset"
        },
        "action": {
          "type": "open-local-settings",
          "allowClick": true,
          "clickSelector": "#chat-settings-btn",
          "settleMs": 1000,
          "stepId": "hud-reset"
        },
        "expected": {
          "de": "Im Einstellungsdialog ist „Reset to Defaults“ sichtbar, ohne dass Einstellungen geaendert wurden.",
          "en": "“Reset to Defaults” is visible in the settings dialog without changing any settings.",
          "es": "«Reset to Defaults» queda visible en el dialogo sin cambiar ningun ajuste.",
          "fr": "« Reset to Defaults » est visible dans la boite de dialogue sans modifier aucun reglage."
        }
      },
      "workflow": {
        "route": "/clarityhud/ui",
        "instructions": {
          "de": {
            "title": "HUD Reset: Einstellungen oeffnen",
            "body": "Klicke auf den echten Button „Settings“ der Chat-HUD-Karte. Es wird nur der lokale Einstellungsdialog geoeffnet; die Reset-Schaltflaeche wird nicht ausgefuehrt.",
            "expected": "Im Einstellungsdialog ist „Reset to Defaults“ sichtbar, ohne dass Einstellungen geaendert wurden."
          },
          "en": {
            "title": "Open settings for HUD Reset",
            "body": "Click the real “Settings” button on the Chat HUD card. This opens only the local settings dialog; do not run the reset control.",
            "expected": "“Reset to Defaults” is visible in the settings dialog without changing any settings."
          },
          "es": {
            "title": "Abre los ajustes de HUD Reset",
            "body": "Haz clic en el boton real «Settings» de la tarjeta Chat HUD. Solo abre el dialogo de ajustes local; no ejecutes el control de restablecimiento.",
            "expected": "«Reset to Defaults» queda visible en el dialogo sin cambiar ningun ajuste."
          },
          "fr": {
            "title": "Ouvrez les reglages de HUD Reset",
            "body": "Cliquez sur le vrai bouton « Settings » de la carte Chat HUD. Il ouvre uniquement la boite de dialogue locale ; n executez pas la commande de reinitialisation.",
            "expected": "« Reset to Defaults » est visible dans la boite de dialogue sans modifier aucun reglage."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/clarityhud/ui"
          },
          {
            "type": "open-local-settings",
            "selector": "#chat-settings-btn"
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
              "path": "/clarityhud/ui",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#reset-defaults-btn"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#reset-defaults-btn",
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
    if (!step) throw new Error(`Missing ClarityHUD guide step: ${id}`);
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
  'hud-modules': {
    selector: '#chat-url',
    action: { type: 'open-plugin-surface' },
    stateChange: false,
    postconditions: [{ type: 'text', selector: '#chat-url', expected: '/overlay/clarity/chat' }],
    copy: {
      de: { title: 'Lokale Chat-HUD-URL pruefen', body: 'Pruefe die angezeigte lokale Chat-HUD-URL. Kopiere sie erst spaeter in eine nicht sendende OBS-Testszenenquelle; in diesem Schritt wird nichts verbunden.', expected: 'Die lokale Route /overlay/clarity/chat wird sichtbar angezeigt.', alt: 'Lokale Chat-HUD-URL von ClarityHUD' },
      en: { title: 'Inspect the local Chat HUD URL', body: 'Inspect the displayed local Chat HUD URL. Copy it to a non-live OBS test-scene source only later; this step connects nothing.', expected: 'The local /overlay/clarity/chat route is visibly displayed.', alt: 'ClarityHUD local Chat HUD URL' },
      es: { title: 'Revisa la URL local de Chat HUD', body: 'Revisa la URL local mostrada de Chat HUD. Copiala a una fuente de escena de prueba de OBS no emitida solo mas tarde; este paso no conecta nada.', expected: 'La ruta local /overlay/clarity/chat aparece visible.', alt: 'URL local de Chat HUD de ClarityHUD' },
      fr: { title: 'Verifiez l URL locale Chat HUD', body: 'Verifiez l URL locale affichee de Chat HUD. Copiez-la plus tard seulement dans une source de scene de test OBS non diffusee; cette etape ne connecte rien.', expected: 'La route locale /overlay/clarity/chat est affichee.', alt: 'URL locale Chat HUD de ClarityHUD' }
    }
  },
  'chat-region': {
    selector: '#chat-preview',
    action: { type: 'open-plugin-surface' },
    stateChange: false,
    copy: {
      de: { title: 'Eingebettete Chat-Vorschau pruefen', body: 'Betrachte die eingebaute Chat-Vorschau im lokalen Dashboard. Keine Testnachricht und kein LIVE-Ereignis werden erzeugt.', expected: 'Der echte lokale Vorschau-Frame ist sichtbar, auch wenn er ohne Ereignisse leer bleibt.', alt: 'Eingebettete lokale ClarityHUD Chat-Vorschau' },
      en: { title: 'Inspect the embedded Chat preview', body: 'View the built-in Chat preview in the local dashboard. No test message or LIVE event is created.', expected: 'The real local preview frame is visible, even when it remains empty without events.', alt: 'Embedded local ClarityHUD Chat preview' },
      es: { title: 'Revisa la vista previa de Chat integrada', body: 'Mira la vista previa de Chat integrada en el panel local. No se crea ningun mensaje de prueba ni evento LIVE.', expected: 'El frame de vista previa local real es visible, incluso si queda vacio sin eventos.', alt: 'Vista previa local integrada de Chat de ClarityHUD' },
      fr: { title: 'Verifiez l apercu Chat integre', body: 'Regardez l apercu Chat integre dans le tableau de bord local. Aucun message de test ni evenement LIVE nest cree.', expected: 'Le vrai cadre d apercu local est visible, meme sil reste vide sans evenement.', alt: 'Apercu Chat local integre de ClarityHUD' }
    }
  },
  'full-hud-preview': {
    selector: '#full-preview',
    action: {
      type: 'run-local-preview',
      allowClick: true,
      clickSelector: 'button[data-action="refresh-preview"][data-type="full"]',
      evidenceSelector: '#toast',
      settleMs: 750
    },
    operationSelector: 'button[data-action="refresh-preview"][data-type="full"]',
    stateChange: true,
    copy: {
      de: { title: 'Full-HUD-Vorschau lokal aktualisieren', body: 'Klicke auf die echte Aktualisieren-Schaltflaeche der Full-HUD-Vorschau. Dadurch wird nur der lokale Vorschau-Frame im isolierten Profil neu geladen; keine LIVE-Quelle wird verbunden.', expected: 'Der echte Full-HUD-Frame wurde lokal aktualisiert und bleibt sichtbar.', alt: 'Aktualisierte lokale ClarityHUD-Full-HUD-Vorschau' },
      en: { title: 'Refresh the Full HUD preview locally', body: 'Click the real refresh control for the Full HUD preview. It reloads only the local preview frame in the isolated profile; no LIVE source is connected.', expected: 'The real Full HUD frame was refreshed locally and remains visible.', alt: 'Refreshed local ClarityHUD Full HUD preview' },
      es: { title: 'Actualiza la vista previa Full HUD localmente', body: 'Haz clic en el control real de actualizar de la vista previa Full HUD. Solo recarga el frame de vista previa local en el perfil aislado; no conecta ninguna fuente LIVE.', expected: 'El frame Full HUD real se actualizo localmente y sigue visible.', alt: 'Vista previa Full HUD local de ClarityHUD actualizada' },
      fr: { title: 'Actualisez l apercu Full HUD localement', body: 'Cliquez sur le vrai controle d actualisation de l apercu Full HUD. Il recharge uniquement le cadre d apercu local du profil isole ; aucune source LIVE nest connectee.', expected: 'Le vrai cadre Full HUD a ete actualise localement et reste visible.', alt: 'Apercu Full HUD local ClarityHUD actualise' }
    }
  }
});

module.exports = Object.freeze(guide);
