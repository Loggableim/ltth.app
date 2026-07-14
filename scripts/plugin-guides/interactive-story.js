'use strict';

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
module.exports = Object.freeze({
  "id": "interactive-story",
  "route": "/plugins/interactive-story/ui.html?demo=1",
  "topic": {
    "de": "Geschichtenmodus, Abstimmung und Modelloption",
    "en": "story mode, voting, and model option",
    "es": "modo de historia, votación y opción de modelo",
    "fr": "mode histoire, vote et option de modèle"
  },
  "test": {
    "de": "eine lokale Testentscheidung ohne API-Schlüssel",
    "en": "a local test decision without an API key",
    "es": "una decisión de prueba local sin clave API",
    "fr": "une décision de test locale sans clé API"
  },
  "expected": {
    "de": "die Abstimmungsoberfläche reagiert, ohne einen externen Modellaufruf auszuführen",
    "en": "the voting UI responds without an external model request",
    "es": "la interfaz de votación responde sin solicitar un modelo externo",
    "fr": "l’interface de vote répond sans appel de modèle externe"
  },
  "requirement": "network",
  "safety": "credentials",
  "mode": "ui",
  "overlay": "/plugins/interactive-story/overlay.html",
  "related": [
    "quiz-show",
    "sidekick"
  ],
  "copy": {
    "de": {
      "title": "Interactive Story Generator",
      "summary": "Interactive Story Generator richtet Geschichtenmodus, Abstimmung und Modelloption ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "die Abstimmungsoberfläche reagiert, ohne einen externen Modellaufruf auszuführen",
      "requirements": "LTTH Dashboard; externe Endpunkte bleiben in dieser Anleitung getrennt. Dieser konkrete Interactive Story Generator-Ablauf behandelt Geschichtenmodus, Abstimmung und Modelloption.",
      "safety": "Keine echten API-Schlüssel oder Konten eingeben; Platzhalter bleiben Platzhalter. Dieser konkrete Interactive Story Generator-Ablauf behandelt Geschichtenmodus, Abstimmung und Modelloption.",
      "troubleshooting": "Wenn Geschichtenmodus, Abstimmung und Modelloption nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "quiz-show",
        "sidekick"
      ]
    },
    "en": {
      "title": "Interactive Story Generator",
      "summary": "Interactive Story Generator configures story mode, voting, and model option with a safe local check instead of a LIVE trigger.",
      "firstResult": "the voting UI responds without an external model request",
      "requirements": "LTTH Dashboard; external endpoints remain disconnected in this guide. This Interactive Story Generator workflow specifically covers story mode, voting, and model option.",
      "safety": "Do not enter real API keys or accounts; placeholders stay placeholders. This Interactive Story Generator workflow specifically covers story mode, voting, and model option.",
      "troubleshooting": "If story mode, voting, and model option is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "quiz-show",
        "sidekick"
      ]
    },
    "es": {
      "title": "Interactive Story Generator",
      "summary": "Interactive Story Generator configura modo de historia, votación y opción de modelo mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "la interfaz de votación responde sin solicitar un modelo externo",
      "requirements": "El panel de LTTH; los extremos externos permanecen desconectados en esta guía. Este flujo concreto de Interactive Story Generator trata modo de historia, votación y opción de modelo.",
      "safety": "No introduzcas claves API ni cuentas reales; los marcadores siguen siendo marcadores. Este flujo concreto de Interactive Story Generator trata modo de historia, votación y opción de modelo.",
      "troubleshooting": "Si modo de historia, votación y opción de modelo no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "quiz-show",
        "sidekick"
      ]
    },
    "fr": {
      "title": "Interactive Story Generator",
      "summary": "Interactive Story Generator configure mode histoire, vote et option de modèle avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "l’interface de vote répond sans appel de modèle externe",
      "requirements": "Le tableau de bord LTTH ; les points externes restent déconnectés dans ce guide. Ce flux spécifique de Interactive Story Generator couvre mode histoire, vote et option de modèle.",
      "safety": "Ne saisissez aucune clé API ni compte réel ; les espaces réservés restent des espaces réservés. Ce flux spécifique de Interactive Story Generator couvre mode histoire, vote et option de modèle.",
      "troubleshooting": "Si mode histoire, vote et option de modèle n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "quiz-show",
        "sidekick"
      ]
    }
  },
  "steps": [
    {
      "id": "story-card",
      "copy": {
        "de": {
          "title": "Story Card im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Story Card von Geschichtenmodus, Abstimmung und Modelloption. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "alt": "Story Card im Testprofil konfigurieren - Geschichtenmodus, Abstimmung und Modelloption"
        },
        "en": {
          "title": "Configure Story Card in the test profile",
          "body": "Work in the visible Story Card area of story mode, voting, and model option. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The relevant plugin surface is visibly identified.",
          "alt": "Configure Story Card in the test profile - story mode, voting, and model option"
        },
        "es": {
          "title": "Configura Story Card en el perfil de prueba",
          "body": "Trabaja en el area visible Story Card de modo de historia, votación y opción de modelo. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La superficie correspondiente del plugin queda identificada.",
          "alt": "Configura Story Card en el perfil de prueba - modo de historia, votación y opción de modelo"
        },
        "fr": {
          "title": "Configurez Story Card dans le profil de test",
          "body": "Travaillez dans la zone visible Story Card de mode histoire, vote et option de modèle. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La surface de plugin correspondante est clairement visible.",
          "alt": "Configurez Story Card dans le profil de test - mode histoire, vote et option de modèle"
        }
      },
      "capture": {
        "route": "/plugins/interactive-story/ui.html?demo=1",
        "assertVisible": "#configurationCard",
        "focusText": {
          "de": "Story Card im Testprofil konfigurieren",
          "en": "Configure Story Card in the test profile",
          "es": "Configura Story Card en el perfil de prueba",
          "fr": "Configurez Story Card dans le profil de test"
        },
        "action": {
          "type": "open-plugin-surface",
          "stepId": "story-card"
        },
        "expected": {
          "de": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "en": "The relevant plugin surface is visibly identified.",
          "es": "La superficie correspondiente del plugin queda identificada.",
          "fr": "La surface de plugin correspondante est clairement visible."
        }
      },
      "workflow": {
        "route": "/plugins/interactive-story/ui.html?demo=1",
        "instructions": {
          "de": {
            "title": "Story Card im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Story Card von Geschichtenmodus, Abstimmung und Modelloption. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar."
          },
          "en": {
            "title": "Configure Story Card in the test profile",
            "body": "Work in the visible Story Card area of story mode, voting, and model option. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The relevant plugin surface is visibly identified."
          },
          "es": {
            "title": "Configura Story Card en el perfil de prueba",
            "body": "Trabaja en el area visible Story Card de modo de historia, votación y opción de modelo. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La superficie correspondiente del plugin queda identificada."
          },
          "fr": {
            "title": "Configurez Story Card dans le profil de test",
            "body": "Travaillez dans la zone visible Story Card de mode histoire, vote et option de modèle. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La surface de plugin correspondante est clairement visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/interactive-story/ui.html?demo=1"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#configurationCard"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/interactive-story/ui.html?demo=1"
          },
          {
            "type": "visible",
            "selector": "#configurationCard"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#configurationCard",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "story-mode",
      "copy": {
        "de": {
          "title": "Story Mode im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Story Mode von Geschichtenmodus, Abstimmung und Modelloption. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Story Mode im Testprofil konfigurieren - Geschichtenmodus, Abstimmung und Modelloption"
        },
        "en": {
          "title": "Configure Story Mode in the test profile",
          "body": "Work in the visible Story Mode area of story mode, voting, and model option. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Story Mode in the test profile - story mode, voting, and model option"
        },
        "es": {
          "title": "Configura Story Mode en el perfil de prueba",
          "body": "Trabaja en el area visible Story Mode de modo de historia, votación y opción de modelo. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Story Mode en el perfil de prueba - modo de historia, votación y opción de modelo"
        },
        "fr": {
          "title": "Configurez Story Mode dans le profil de test",
          "body": "Travaillez dans la zone visible Story Mode de mode histoire, vote et option de modèle. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Story Mode dans le profil de test - mode histoire, vote et option de modèle"
        }
      },
      "capture": {
        "route": "/plugins/interactive-story/ui.html?demo=1",
        "assertVisible": "#languageSelect",
        "focusText": {
          "de": "Story Mode im Testprofil konfigurieren",
          "en": "Configure Story Mode in the test profile",
          "es": "Configura Story Mode en el perfil de prueba",
          "fr": "Configurez Story Mode dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "story-mode"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/interactive-story/ui.html?demo=1",
        "instructions": {
          "de": {
            "title": "Story Mode im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Story Mode von Geschichtenmodus, Abstimmung und Modelloption. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Story Mode in the test profile",
            "body": "Work in the visible Story Mode area of story mode, voting, and model option. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Story Mode en el perfil de prueba",
            "body": "Trabaja en el area visible Story Mode de modo de historia, votación y opción de modelo. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Story Mode dans le profil de test",
            "body": "Travaillez dans la zone visible Story Mode de mode histoire, vote et option de modèle. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/interactive-story/ui.html?demo=1"
          },
          {
            "type": "set-demo-value",
            "selector": "#languageSelect"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/interactive-story/ui.html?demo=1"
          },
          {
            "type": "visible",
            "selector": "#languageSelect"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#languageSelect",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "vote-rule",
      "copy": {
        "de": {
          "title": "Vote Rule im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Vote Rule von Geschichtenmodus, Abstimmung und Modelloption. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Vote Rule im Testprofil konfigurieren - Geschichtenmodus, Abstimmung und Modelloption"
        },
        "en": {
          "title": "Configure Vote Rule in the test profile",
          "body": "Work in the visible Vote Rule area of story mode, voting, and model option. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Vote Rule in the test profile - story mode, voting, and model option"
        },
        "es": {
          "title": "Configura Vote Rule en el perfil de prueba",
          "body": "Trabaja en el area visible Vote Rule de modo de historia, votación y opción de modelo. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Vote Rule en el perfil de prueba - modo de historia, votación y opción de modelo"
        },
        "fr": {
          "title": "Configurez Vote Rule dans le profil de test",
          "body": "Travaillez dans la zone visible Vote Rule de mode histoire, vote et option de modèle. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Vote Rule dans le profil de test - mode histoire, vote et option de modèle"
        }
      },
      "capture": {
        "route": "/plugins/interactive-story/ui.html?demo=1",
        "assertVisible": "#storyStateBadge",
        "focusText": {
          "de": "Vote Rule im Testprofil konfigurieren",
          "en": "Configure Vote Rule in the test profile",
          "es": "Configura Vote Rule en el perfil de prueba",
          "fr": "Configurez Vote Rule dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "vote-rule"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/interactive-story/ui.html?demo=1",
        "instructions": {
          "de": {
            "title": "Vote Rule im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Vote Rule von Geschichtenmodus, Abstimmung und Modelloption. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Vote Rule in the test profile",
            "body": "Work in the visible Vote Rule area of story mode, voting, and model option. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Vote Rule en el perfil de prueba",
            "body": "Trabaja en el area visible Vote Rule de modo de historia, votación y opción de modelo. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Vote Rule dans le profil de test",
            "body": "Travaillez dans la zone visible Vote Rule de mode histoire, vote et option de modèle. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/interactive-story/ui.html?demo=1"
          },
          {
            "type": "set-demo-value",
            "selector": "#storyStateBadge"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/interactive-story/ui.html?demo=1"
          },
          {
            "type": "visible",
            "selector": "#storyStateBadge"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#storyStateBadge",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "local-decision",
      "copy": {
        "de": {
          "title": "Lokale Voting-Vorschau oeffnen und testen",
          "body": "Klicke im Demo-Modus zuerst auf „Show preview“. Danach ist der echte Button „Test Voting Choices“ sichtbar; er sendet nur die eingebauten Beispieloptionen an die lokale Vorschau und ruft weder ein Modell noch einen externen Dienst auf.",
          "expected": "Die lokale Vorschau erhaelt die echten Beispieloptionen.",
          "alt": "Lokale Voting-Vorschau oeffnen und testen - Geschichtenmodus, Abstimmung und Modelloption"
        },
        "en": {
          "title": "Open and test the local voting preview",
          "body": "In demo mode, first click “Show preview”. The real “Test Voting Choices” button then becomes visible; it sends only the built-in sample choices to the local preview and calls neither a model nor an external service.",
          "expected": "The local preview receives the real sample choices.",
          "alt": "Open and test the local voting preview - story mode, voting, and model option"
        },
        "es": {
          "title": "Abre y prueba la vista previa local de voto",
          "body": "En modo demo, primero haz clic en «Show preview». Entonces aparece el boton real «Test Voting Choices»; solo envia las opciones de ejemplo integradas a la vista previa local y no llama a un modelo ni a un servicio externo.",
          "expected": "La vista previa local recibe las opciones de ejemplo reales.",
          "alt": "Abre y prueba la vista previa local de voto - modo de historia, votación y opción de modelo"
        },
        "fr": {
          "title": "Ouvrez et testez l apercu de vote local",
          "body": "En mode demonstration, cliquez d abord sur « Show preview ». Le vrai bouton « Test Voting Choices » devient alors visible ; il envoie uniquement les choix exemples integres vers l apercu local et n appelle ni modele ni service externe.",
          "expected": "L apercu local recoit les vrais choix exemples.",
          "alt": "Ouvrez et testez l apercu de vote local - mode histoire, vote et option de modèle"
        }
      },
      "capture": {
        "route": "/plugins/interactive-story/ui.html?demo=1",
        "assertVisible": "#toggleOverlayPreviewBtn",
        "focusText": {
          "de": "Lokale Voting-Vorschau oeffnen und testen",
          "en": "Open and test the local voting preview",
          "es": "Abre y prueba la vista previa local de voto",
          "fr": "Ouvrez et testez l apercu de vote local"
        },
        "action": {
          "type": "run-local-preview",
          "stepId": "local-decision"
        },
        "expected": {
          "de": "Die lokale Vorschau erhaelt die echten Beispieloptionen.",
          "en": "The local preview receives the real sample choices.",
          "es": "La vista previa local recibe las opciones de ejemplo reales.",
          "fr": "L apercu local recoit les vrais choix exemples."
        }
      },
      "workflow": {
        "route": "/plugins/interactive-story/ui.html?demo=1",
        "instructions": {
          "de": {
            "title": "Lokale Voting-Vorschau oeffnen und testen",
            "body": "Klicke im Demo-Modus zuerst auf „Show preview“. Danach ist der echte Button „Test Voting Choices“ sichtbar; er sendet nur die eingebauten Beispieloptionen an die lokale Vorschau und ruft weder ein Modell noch einen externen Dienst auf.",
            "expected": "Die lokale Vorschau erhaelt die echten Beispieloptionen."
          },
          "en": {
            "title": "Open and test the local voting preview",
            "body": "In demo mode, first click “Show preview”. The real “Test Voting Choices” button then becomes visible; it sends only the built-in sample choices to the local preview and calls neither a model nor an external service.",
            "expected": "The local preview receives the real sample choices."
          },
          "es": {
            "title": "Abre y prueba la vista previa local de voto",
            "body": "En modo demo, primero haz clic en «Show preview». Entonces aparece el boton real «Test Voting Choices»; solo envia las opciones de ejemplo integradas a la vista previa local y no llama a un modelo ni a un servicio externo.",
            "expected": "La vista previa local recibe las opciones de ejemplo reales."
          },
          "fr": {
            "title": "Ouvrez et testez l apercu de vote local",
            "body": "En mode demonstration, cliquez d abord sur « Show preview ». Le vrai bouton « Test Voting Choices » devient alors visible ; il envoie uniquement les choix exemples integres vers l apercu local et n appelle ni modele ni service externe.",
            "expected": "L apercu local recoit les vrais choix exemples."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/interactive-story/ui.html?demo=1"
          },
          {
            "type": "run-local-preview",
            "selector": "#toggleOverlayPreviewBtn"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/interactive-story/ui.html?demo=1"
          },
          {
            "type": "visible",
            "selector": "#toggleOverlayPreviewBtn"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#toggleOverlayPreviewBtn",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "story-overlay",
      "copy": {
        "de": {
          "title": "Echten Story-Overlay-Einstieg pruefen",
          "body": "Nutze in der Konfiguration den echten Button „Open Overlay“, um die Browserquelle zu pruefen. Ohne eine gestartete lokale Story bleibt das Overlay absichtlich leer; es werden keine Demo-Inhalte eingeblendet.",
          "expected": "Der echte Overlay-Einstieg ist sichtbar, ohne ein Story-Ereignis vorzutäuschen.",
          "alt": "Echten Story-Overlay-Einstieg pruefen - Geschichtenmodus, Abstimmung und Modelloption"
        },
        "en": {
          "title": "Review the real Story overlay entry point",
          "body": "Use the real “Open Overlay” button in the configuration to check the browser source. Until a local story has started, the overlay intentionally stays empty; no demo content is injected.",
          "expected": "The real overlay entry point is visible without simulating a story event.",
          "alt": "Review the real Story overlay entry point - story mode, voting, and model option"
        },
        "es": {
          "title": "Revisa la entrada real del overlay de historias",
          "body": "Usa el boton real «Open Overlay» de la configuracion para comprobar la fuente del navegador. Hasta que inicies una historia local, el overlay queda vacio intencionadamente; no se inyecta contenido demo.",
          "expected": "La entrada real del overlay queda visible sin simular un evento de historia.",
          "alt": "Revisa la entrada real del overlay de historias - modo de historia, votación y opción de modelo"
        },
        "fr": {
          "title": "Verifiez le vrai point d entree de l overlay Story",
          "body": "Utilisez le vrai bouton « Open Overlay » dans la configuration pour verifier la source navigateur. Tant qu aucune story locale n a demarre, l overlay reste volontairement vide ; aucun contenu de demonstration n est injecte.",
          "expected": "Le vrai point d entree de l overlay est visible sans simuler un evenement Story.",
          "alt": "Verifiez le vrai point d entree de l overlay Story - mode histoire, vote et option de modèle"
        }
      },
      "capture": {
        "route": "/plugins/interactive-story/ui.html?demo=1",
        "assertVisible": "#heroOpenOverlayBtn",
        "focusText": {
          "de": "Echten Story-Overlay-Einstieg pruefen",
          "en": "Review the real Story overlay entry point",
          "es": "Revisa la entrada real del overlay de historias",
          "fr": "Verifiez le vrai point d entree de l overlay Story"
        },
        "action": {
          "type": "open-plugin-surface",
          "stepId": "story-overlay"
        },
        "expected": {
          "de": "Der echte Overlay-Einstieg ist sichtbar, ohne ein Story-Ereignis vorzutäuschen.",
          "en": "The real overlay entry point is visible without simulating a story event.",
          "es": "La entrada real del overlay queda visible sin simular un evento de historia.",
          "fr": "Le vrai point d entree de l overlay est visible sans simuler un evenement Story."
        }
      },
      "workflow": {
        "route": "/plugins/interactive-story/ui.html?demo=1",
        "instructions": {
          "de": {
            "title": "Echten Story-Overlay-Einstieg pruefen",
            "body": "Nutze in der Konfiguration den echten Button „Open Overlay“, um die Browserquelle zu pruefen. Ohne eine gestartete lokale Story bleibt das Overlay absichtlich leer; es werden keine Demo-Inhalte eingeblendet.",
            "expected": "Der echte Overlay-Einstieg ist sichtbar, ohne ein Story-Ereignis vorzutäuschen."
          },
          "en": {
            "title": "Review the real Story overlay entry point",
            "body": "Use the real “Open Overlay” button in the configuration to check the browser source. Until a local story has started, the overlay intentionally stays empty; no demo content is injected.",
            "expected": "The real overlay entry point is visible without simulating a story event."
          },
          "es": {
            "title": "Revisa la entrada real del overlay de historias",
            "body": "Usa el boton real «Open Overlay» de la configuracion para comprobar la fuente del navegador. Hasta que inicies una historia local, el overlay queda vacio intencionadamente; no se inyecta contenido demo.",
            "expected": "La entrada real del overlay queda visible sin simular un evento de historia."
          },
          "fr": {
            "title": "Verifiez le vrai point d entree de l overlay Story",
            "body": "Utilisez le vrai bouton « Open Overlay » dans la configuration pour verifier la source navigateur. Tant qu aucune story locale n a demarre, l overlay reste volontairement vide ; aucun contenu de demonstration n est injecte.",
            "expected": "Le vrai point d entree de l overlay est visible sans simuler un evenement Story."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/interactive-story/ui.html?demo=1"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#heroOpenOverlayBtn"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/interactive-story/ui.html?demo=1"
          },
          {
            "type": "visible",
            "selector": "#heroOpenOverlayBtn"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#heroOpenOverlayBtn",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "story-reset",
      "copy": {
        "de": {
          "title": "Story Reset sicher zuruecksetzen",
          "body": "Entferne nur die Demo-Werte fuer Story Reset, bevor du Geschichtenmodus, Abstimmung und Modelloption produktiv vorbereitest.",
          "expected": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "alt": "Story Reset sicher zuruecksetzen - Geschichtenmodus, Abstimmung und Modelloption"
        },
        "en": {
          "title": "Reset Story Reset safely",
          "body": "Remove only the demo values for Story Reset before preparing story mode, voting, and model option for production.",
          "expected": "The test profile remains free of production impact.",
          "alt": "Reset Story Reset safely - story mode, voting, and model option"
        },
        "es": {
          "title": "Restablece Story Reset con seguridad",
          "body": "Elimina solo los valores demo de Story Reset antes de preparar modo de historia, votación y opción de modelo para produccion.",
          "expected": "El perfil de prueba permanece sin impacto de producción.",
          "alt": "Restablece Story Reset con seguridad - modo de historia, votación y opción de modelo"
        },
        "fr": {
          "title": "Reinitialisez Story Reset en securite",
          "body": "Supprimez uniquement les valeurs demo de Story Reset avant de preparer mode histoire, vote et option de modèle pour la production.",
          "expected": "Le profil de test reste sans impact de production.",
          "alt": "Reinitialisez Story Reset en securite - mode histoire, vote et option de modèle"
        }
      },
      "capture": {
        "route": "/plugins/interactive-story/ui.html?demo=1",
        "assertVisible": "#statusCard",
        "focusText": {
          "de": "Story Reset sicher zuruecksetzen",
          "en": "Reset Story Reset safely",
          "es": "Restablece Story Reset con seguridad",
          "fr": "Reinitialisez Story Reset en securite"
        },
        "action": {
          "type": "reset-demo-state",
          "stepId": "story-reset"
        },
        "expected": {
          "de": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "en": "The test profile remains free of production impact.",
          "es": "El perfil de prueba permanece sin impacto de producción.",
          "fr": "Le profil de test reste sans impact de production."
        }
      },
      "workflow": {
        "route": "/plugins/interactive-story/ui.html?demo=1",
        "instructions": {
          "de": {
            "title": "Story Reset sicher zuruecksetzen",
            "body": "Entferne nur die Demo-Werte fuer Story Reset, bevor du Geschichtenmodus, Abstimmung und Modelloption produktiv vorbereitest.",
            "expected": "Das Testprofil bleibt ohne produktive Auswirkung."
          },
          "en": {
            "title": "Reset Story Reset safely",
            "body": "Remove only the demo values for Story Reset before preparing story mode, voting, and model option for production.",
            "expected": "The test profile remains free of production impact."
          },
          "es": {
            "title": "Restablece Story Reset con seguridad",
            "body": "Elimina solo los valores demo de Story Reset antes de preparar modo de historia, votación y opción de modelo para produccion.",
            "expected": "El perfil de prueba permanece sin impacto de producción."
          },
          "fr": {
            "title": "Reinitialisez Story Reset en securite",
            "body": "Supprimez uniquement les valeurs demo de Story Reset avant de preparer mode histoire, vote et option de modèle pour la production.",
            "expected": "Le profil de test reste sans impact de production."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/interactive-story/ui.html?demo=1"
          },
          {
            "type": "reset-demo-state",
            "selector": "#statusCard"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/interactive-story/ui.html?demo=1"
          },
          {
            "type": "visible",
            "selector": "#statusCard"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#statusCard",
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
