'use strict';

const { applyOverlayEntryPoints } = require('../lib/guide-overlay-entry-points');

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
module.exports = Object.freeze(applyOverlayEntryPoints({
  "id": "spotlight",
  "route": "/plugins/spotlight/ui/main.html",
  "topic": {
    "de": "Ereignistyp, Anzeigedauer und Spotlight-Stil",
    "en": "event type, display duration, and spotlight style",
    "es": "tipo de evento, duración de visualización y estilo Spotlight",
    "fr": "type d’événement, durée d’affichage et style Spotlight"
  },
  "test": {
    "de": "eine lokale Chatter-Vorschau",
    "en": "a local chatter preview",
    "es": "una vista previa local de chatter",
    "fr": "un aperçu local de chatter"
  },
  "expected": {
    "de": "die Spotlight-Karte wird in der Vorschau gerendert",
    "en": "the spotlight card is rendered in preview",
    "es": "la tarjeta Spotlight se renderiza en la vista previa",
    "fr": "la carte Spotlight est rendue dans l’aperçu"
  },
  "requirement": "obs",
  "safety": "obs",
  "mode": "ui",
  "overlay": "/plugins/spotlight/overlays/chatter.html",
  "related": [
    "clarityhud",
    "toptier"
  ],
  "copy": {
    "de": {
      "title": "Spotlight",
      "summary": "Spotlight richtet Ereignistyp, Anzeigedauer und Spotlight-Stil ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "die Spotlight-Karte wird in der Vorschau gerendert",
      "requirements": "LTTH Dashboard; für die Ausgabe zusätzlich eine OBS-Testszene. Dieser konkrete Spotlight-Ablauf behandelt Ereignistyp, Anzeigedauer und Spotlight-Stil.",
      "safety": "Nutze eine nicht gesendete OBS-Testszene; LIVE-Ausgaben bleiben deaktiviert. Dieser konkrete Spotlight-Ablauf behandelt Ereignistyp, Anzeigedauer und Spotlight-Stil.",
      "troubleshooting": "Wenn Ereignistyp, Anzeigedauer und Spotlight-Stil nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "clarityhud",
        "toptier"
      ]
    },
    "en": {
      "title": "Spotlight",
      "summary": "Spotlight configures event type, display duration, and spotlight style with a safe local check instead of a LIVE trigger.",
      "firstResult": "the spotlight card is rendered in preview",
      "requirements": "LTTH Dashboard; use an OBS test scene for output. This Spotlight workflow specifically covers event type, display duration, and spotlight style.",
      "safety": "Use an OBS test scene that is not live; LIVE output remains disabled. This Spotlight workflow specifically covers event type, display duration, and spotlight style.",
      "troubleshooting": "If event type, display duration, and spotlight style is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "clarityhud",
        "toptier"
      ]
    },
    "es": {
      "title": "Spotlight",
      "summary": "Spotlight configura tipo de evento, duración de visualización y estilo Spotlight mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "la tarjeta Spotlight se renderiza en la vista previa",
      "requirements": "El panel de LTTH y una escena de prueba de OBS para la salida. Este flujo concreto de Spotlight trata tipo de evento, duración de visualización y estilo Spotlight.",
      "safety": "Usa una escena de prueba de OBS que no esté al aire; la salida LIVE permanece desactivada. Este flujo concreto de Spotlight trata tipo de evento, duración de visualización y estilo Spotlight.",
      "troubleshooting": "Si tipo de evento, duración de visualización y estilo Spotlight no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "clarityhud",
        "toptier"
      ]
    },
    "fr": {
      "title": "Spotlight",
      "summary": "Spotlight configure type d’événement, durée d’affichage et style Spotlight avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "la carte Spotlight est rendue dans l’aperçu",
      "requirements": "Le tableau de bord LTTH et une scène de test OBS pour la sortie. Ce flux spécifique de Spotlight couvre type d’événement, durée d’affichage et style Spotlight.",
      "safety": "Utilisez une scène de test OBS non diffusée ; la sortie LIVE reste désactivée. Ce flux spécifique de Spotlight couvre type d’événement, durée d’affichage et style Spotlight.",
      "troubleshooting": "Si type d’événement, durée d’affichage et style Spotlight n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "clarityhud",
        "toptier"
      ]
    }
  },
  "steps": [
    {
      "id": "spotlight-card",
      "copy": {
        "de": {
          "title": "Spotlight Card im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Spotlight Card von Ereignistyp, Anzeigedauer und Spotlight-Stil. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "alt": "Spotlight Card im Testprofil konfigurieren - Ereignistyp, Anzeigedauer und Spotlight-Stil"
        },
        "en": {
          "title": "Configure Spotlight Card in the test profile",
          "body": "Work in the visible Spotlight Card area of event type, display duration, and spotlight style. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The relevant plugin surface is visibly identified.",
          "alt": "Configure Spotlight Card in the test profile - event type, display duration, and spotlight style"
        },
        "es": {
          "title": "Configura Spotlight Card en el perfil de prueba",
          "body": "Trabaja en el area visible Spotlight Card de tipo de evento, duración de visualización y estilo Spotlight. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La superficie correspondiente del plugin queda identificada.",
          "alt": "Configura Spotlight Card en el perfil de prueba - tipo de evento, duración de visualización y estilo Spotlight"
        },
        "fr": {
          "title": "Configurez Spotlight Card dans le profil de test",
          "body": "Travaillez dans la zone visible Spotlight Card de type d’événement, durée d’affichage et style Spotlight. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La surface de plugin correspondante est clairement visible.",
          "alt": "Configurez Spotlight Card dans le profil de test - type d’événement, durée d’affichage et style Spotlight"
        }
      },
      "capture": {
        "route": "/plugins/spotlight/ui/main.html",
        "assertVisible": "#overlay-grid",
        "focusText": {
          "de": "Spotlight Card im Testprofil konfigurieren",
          "en": "Configure Spotlight Card in the test profile",
          "es": "Configura Spotlight Card en el perfil de prueba",
          "fr": "Configurez Spotlight Card dans le profil de test"
        },
        "action": {
          "type": "open-plugin-surface",
          "stepId": "spotlight-card"
        },
        "expected": {
          "de": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "en": "The relevant plugin surface is visibly identified.",
          "es": "La superficie correspondiente del plugin queda identificada.",
          "fr": "La surface de plugin correspondante est clairement visible."
        }
      },
      "workflow": {
        "route": "/plugins/spotlight/ui/main.html",
        "instructions": {
          "de": {
            "title": "Spotlight Card im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Spotlight Card von Ereignistyp, Anzeigedauer und Spotlight-Stil. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar."
          },
          "en": {
            "title": "Configure Spotlight Card in the test profile",
            "body": "Work in the visible Spotlight Card area of event type, display duration, and spotlight style. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The relevant plugin surface is visibly identified."
          },
          "es": {
            "title": "Configura Spotlight Card en el perfil de prueba",
            "body": "Trabaja en el area visible Spotlight Card de tipo de evento, duración de visualización y estilo Spotlight. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La superficie correspondiente del plugin queda identificada."
          },
          "fr": {
            "title": "Configurez Spotlight Card dans le profil de test",
            "body": "Travaillez dans la zone visible Spotlight Card de type d’événement, durée d’affichage et style Spotlight. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La surface de plugin correspondante est clairement visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/spotlight/ui/main.html"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#overlay-grid"
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
              "path": "/plugins/spotlight/ui/main.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#overlay-grid"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#overlay-grid",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "event-style",
      "copy": {
        "de": {
          "title": "Chatter-Design im echten Settings-Dialog auswählen",
          "body": "Öffne auf der Chatter-Karte „Settings“ und prüfe das echte Feld „Choose a Design Style“. Die Dokumentation wählt darin nur eine vorhandene Variante im frischen Testprofil und speichert nichts.",
          "expected": "Das echte Auswahlfeld „Choose a Design Style“ zeigt eine verfügbare Chatter-Variante.",
          "alt": "Chatter-Design im echten Settings-Dialog auswählen - Ereignistyp, Anzeigedauer und Spotlight-Stil"
        },
        "en": {
          "title": "Select the Chatter design in the real Settings dialog",
          "body": "On the Chatter card, open “Settings” and inspect the real “Choose a Design Style” field. The documentation selects only an available variant in a fresh test profile and does not save it.",
          "expected": "The real “Choose a Design Style” selector shows an available Chatter variant.",
          "alt": "Select the Chatter design in the real Settings dialog - event type, display duration, and spotlight style"
        },
        "es": {
          "title": "Selecciona el diseño Chatter en el diálogo real de ajustes",
          "body": "En la tarjeta Chatter, abre «Settings» y revisa el campo real «Choose a Design Style». La documentación solo elige una variante disponible en un perfil de prueba nuevo y no la guarda.",
          "expected": "El selector real «Choose a Design Style» muestra una variante Chatter disponible.",
          "alt": "Selecciona el diseño Chatter en el diálogo real de ajustes - tipo de evento, duración de visualización y estilo Spotlight"
        },
        "fr": {
          "title": "Choisissez le design Chatter dans la vraie boîte de réglages",
          "body": "Sur la carte Chatter, ouvrez « Settings » et vérifiez le vrai champ « Choose a Design Style ». La documentation ne sélectionne qu'une variante disponible dans un profil de test neuf et ne l'enregistre pas.",
          "expected": "Le vrai sélecteur « Choose a Design Style » affiche une variante Chatter disponible.",
          "alt": "Choisissez le design Chatter dans la vraie boîte de réglages - type d’événement, durée d’affichage et style Spotlight"
        }
      },
      "capture": {
        "route": "/plugins/spotlight/ui/main.html",
        "assertVisible": "#designVariant",
        "focusText": {
          "de": "Chatter-Design im echten Settings-Dialog auswählen",
          "en": "Select the Chatter design in the real Settings dialog",
          "es": "Selecciona el diseño Chatter en el diálogo real de ajustes",
          "fr": "Choisissez le design Chatter dans la vraie boîte de réglages"
        },
        "action": {
          "type": "set-demo-value",
          "prepare": "open-spotlight-settings",
          "inputSelector": "#designVariant",
          "controlType": "select",
          "stepId": "event-style"
        },
        "expected": {
          "de": "Das echte Auswahlfeld „Choose a Design Style“ zeigt eine verfügbare Chatter-Variante.",
          "en": "The real “Choose a Design Style” selector shows an available Chatter variant.",
          "es": "El selector real «Choose a Design Style» muestra una variante Chatter disponible.",
          "fr": "Le vrai sélecteur « Choose a Design Style » affiche une variante Chatter disponible."
        }
      },
      "workflow": {
        "route": "/plugins/spotlight/ui/main.html",
        "instructions": {
          "de": {
            "title": "Chatter-Design im echten Settings-Dialog auswählen",
            "body": "Öffne auf der Chatter-Karte „Settings“ und prüfe das echte Feld „Choose a Design Style“. Die Dokumentation wählt darin nur eine vorhandene Variante im frischen Testprofil und speichert nichts.",
            "expected": "Das echte Auswahlfeld „Choose a Design Style“ zeigt eine verfügbare Chatter-Variante."
          },
          "en": {
            "title": "Select the Chatter design in the real Settings dialog",
            "body": "On the Chatter card, open “Settings” and inspect the real “Choose a Design Style” field. The documentation selects only an available variant in a fresh test profile and does not save it.",
            "expected": "The real “Choose a Design Style” selector shows an available Chatter variant."
          },
          "es": {
            "title": "Selecciona el diseño Chatter en el diálogo real de ajustes",
            "body": "En la tarjeta Chatter, abre «Settings» y revisa el campo real «Choose a Design Style». La documentación solo elige una variante disponible en un perfil de prueba nuevo y no la guarda.",
            "expected": "El selector real «Choose a Design Style» muestra una variante Chatter disponible."
          },
          "fr": {
            "title": "Choisissez le design Chatter dans la vraie boîte de réglages",
            "body": "Sur la carte Chatter, ouvrez « Settings » et vérifiez le vrai champ « Choose a Design Style ». La documentation ne sélectionne qu'une variante disponible dans un profil de test neuf et ne l'enregistre pas.",
            "expected": "Le vrai sélecteur « Choose a Design Style » affiche une variante Chatter disponible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/spotlight/ui/main.html"
          },
          {
            "type": "prepare",
            "name": "open-spotlight-settings"
          },
          {
            "type": "set-demo-value",
            "selector": "#designVariant"
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
              "path": "/plugins/spotlight/ui/main.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#designVariant"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#designVariant",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "display-duration",
      "copy": {
        "de": {
          "title": "Die echte Fade-Dauer prüfen",
          "body": "Im Settings-Dialog steuert das echte Feld „Fade Duration“ die Dauer der Ein- und Ausblendung. Prüfe es vor dem Speichern; dieser Dokumentationsschritt ändert keinen Wert.",
          "expected": "Das echte Eingabefeld „Fade Duration“ ist im Chatter-Settings-Dialog sichtbar.",
          "alt": "Die echte Fade-Dauer prüfen - Ereignistyp, Anzeigedauer und Spotlight-Stil"
        },
        "en": {
          "title": "Review the real fade duration",
          "body": "In the Settings dialog, the real “Fade Duration” field controls the fade-in and fade-out duration. Review it before saving; this documentation step does not change a value.",
          "expected": "The real “Fade Duration” input is visible in the Chatter Settings dialog.",
          "alt": "Review the real fade duration - event type, display duration, and spotlight style"
        },
        "es": {
          "title": "Revisa la duración real de fundido",
          "body": "En el diálogo de ajustes, el campo real «Fade Duration» controla la duración de entrada y salida. Revísalo antes de guardar; este paso de documentación no cambia ningún valor.",
          "expected": "La entrada real «Fade Duration» es visible en los ajustes de Chatter.",
          "alt": "Revisa la duración real de fundido - tipo de evento, duración de visualización y estilo Spotlight"
        },
        "fr": {
          "title": "Vérifiez la vraie durée de fondu",
          "body": "Dans la boîte de réglages, le vrai champ « Fade Duration » règle la durée des fondus d'entrée et de sortie. Vérifiez-le avant d'enregistrer ; cette étape de documentation ne modifie aucune valeur.",
          "expected": "La vraie saisie « Fade Duration » est visible dans les réglages Chatter.",
          "alt": "Vérifiez la vraie durée de fondu - type d’événement, durée d’affichage et style Spotlight"
        }
      },
      "capture": {
        "route": "/plugins/spotlight/ui/main.html",
        "assertVisible": "#fadeDuration",
        "focusText": {
          "de": "Die echte Fade-Dauer prüfen",
          "en": "Review the real fade duration",
          "es": "Revisa la duración real de fundido",
          "fr": "Vérifiez la vraie durée de fondu"
        },
        "action": {
          "type": "open-plugin-surface",
          "prepare": "open-spotlight-settings",
          "stepId": "display-duration"
        },
        "expected": {
          "de": "Das echte Eingabefeld „Fade Duration“ ist im Chatter-Settings-Dialog sichtbar.",
          "en": "The real “Fade Duration” input is visible in the Chatter Settings dialog.",
          "es": "La entrada real «Fade Duration» es visible en los ajustes de Chatter.",
          "fr": "La vraie saisie « Fade Duration » est visible dans les réglages Chatter."
        }
      },
      "workflow": {
        "route": "/plugins/spotlight/ui/main.html",
        "instructions": {
          "de": {
            "title": "Die echte Fade-Dauer prüfen",
            "body": "Im Settings-Dialog steuert das echte Feld „Fade Duration“ die Dauer der Ein- und Ausblendung. Prüfe es vor dem Speichern; dieser Dokumentationsschritt ändert keinen Wert.",
            "expected": "Das echte Eingabefeld „Fade Duration“ ist im Chatter-Settings-Dialog sichtbar."
          },
          "en": {
            "title": "Review the real fade duration",
            "body": "In the Settings dialog, the real “Fade Duration” field controls the fade-in and fade-out duration. Review it before saving; this documentation step does not change a value.",
            "expected": "The real “Fade Duration” input is visible in the Chatter Settings dialog."
          },
          "es": {
            "title": "Revisa la duración real de fundido",
            "body": "En el diálogo de ajustes, el campo real «Fade Duration» controla la duración de entrada y salida. Revísalo antes de guardar; este paso de documentación no cambia ningún valor.",
            "expected": "La entrada real «Fade Duration» es visible en los ajustes de Chatter."
          },
          "fr": {
            "title": "Vérifiez la vraie durée de fondu",
            "body": "Dans la boîte de réglages, le vrai champ « Fade Duration » règle la durée des fondus d'entrée et de sortie. Vérifiez-le avant d'enregistrer ; cette étape de documentation ne modifie aucune valeur.",
            "expected": "La vraie saisie « Fade Duration » est visible dans les réglages Chatter."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/spotlight/ui/main.html"
          },
          {
            "type": "prepare",
            "name": "open-spotlight-settings"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#fadeDuration"
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
              "path": "/plugins/spotlight/ui/main.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#fadeDuration"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#fadeDuration",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "chatter-preview",
      "copy": {
        "de": {
          "title": "Chatter-Vorschau mit dem echten Test ausloesen",
          "body": "Klicke auf der Chatter-Karte auf „Preview“ und dann im Dialog auf „Test“. Das Ereignis wird nur im isolierten lokalen Profil gesendet; keine OBS- oder LIVE-Quelle wird geaendert.",
          "expected": "Der Test-Button ist in der echten Vorschau sichtbar.",
          "alt": "Chatter-Vorschau mit dem echten Test ausloesen - Ereignistyp, Anzeigedauer und Spotlight-Stil"
        },
        "en": {
          "title": "Trigger the Chatter preview with the real test",
          "body": "On the Chatter card, click “Preview” and then “Test” in the dialog. The event is sent only in the isolated local profile; no OBS or LIVE source is changed.",
          "expected": "The Test button is visible in the real preview.",
          "alt": "Trigger the Chatter preview with the real test - event type, display duration, and spotlight style"
        },
        "es": {
          "title": "Activa la vista previa Chatter con la prueba real",
          "body": "En la tarjeta Chatter, haz clic en «Preview» y luego en «Test» dentro del dialogo. El evento se envia solo en el perfil local aislado; no cambia ninguna fuente OBS ni LIVE.",
          "expected": "El boton Test queda visible en la vista previa real.",
          "alt": "Activa la vista previa Chatter con la prueba real - tipo de evento, duración de visualización y estilo Spotlight"
        },
        "fr": {
          "title": "Declenchez l apercu Chatter avec le vrai test",
          "body": "Sur la carte Chatter, cliquez sur « Preview », puis sur « Test » dans la boite. L evenement est envoye uniquement dans le profil local isole ; aucune source OBS ou LIVE n est modifiee.",
          "expected": "Le bouton Test est visible dans le vrai apercu.",
          "alt": "Declenchez l apercu Chatter avec le vrai test - type d’événement, durée d’affichage et style Spotlight"
        }
      },
      "capture": {
        "route": "/plugins/spotlight/ui/main.html",
        "assertVisible": "#preview-test-btn",
        "focusText": {
          "de": "Chatter-Vorschau mit dem echten Test ausloesen",
          "en": "Trigger the Chatter preview with the real test",
          "es": "Activa la vista previa Chatter con la prueba real",
          "fr": "Declenchez l apercu Chatter avec le vrai test"
        },
        "action": {
          "type": "run-local-preview",
          "prepare": "open-spotlight-preview",
          "allowClick": true,
          "clickSelector": "#preview-test-btn",
          "settleMs": 750,
          "stepId": "chatter-preview"
        },
        "expected": {
          "de": "Der Test-Button ist in der echten Vorschau sichtbar.",
          "en": "The Test button is visible in the real preview.",
          "es": "El boton Test queda visible en la vista previa real.",
          "fr": "Le bouton Test est visible dans le vrai apercu."
        }
      },
      "workflow": {
        "route": "/plugins/spotlight/ui/main.html",
        "instructions": {
          "de": {
            "title": "Chatter-Vorschau mit dem echten Test ausloesen",
            "body": "Klicke auf der Chatter-Karte auf „Preview“ und dann im Dialog auf „Test“. Das Ereignis wird nur im isolierten lokalen Profil gesendet; keine OBS- oder LIVE-Quelle wird geaendert.",
            "expected": "Der Test-Button ist in der echten Vorschau sichtbar."
          },
          "en": {
            "title": "Trigger the Chatter preview with the real test",
            "body": "On the Chatter card, click “Preview” and then “Test” in the dialog. The event is sent only in the isolated local profile; no OBS or LIVE source is changed.",
            "expected": "The Test button is visible in the real preview."
          },
          "es": {
            "title": "Activa la vista previa Chatter con la prueba real",
            "body": "En la tarjeta Chatter, haz clic en «Preview» y luego en «Test» dentro del dialogo. El evento se envia solo en el perfil local aislado; no cambia ninguna fuente OBS ni LIVE.",
            "expected": "El boton Test queda visible en la vista previa real."
          },
          "fr": {
            "title": "Declenchez l apercu Chatter avec le vrai test",
            "body": "Sur la carte Chatter, cliquez sur « Preview », puis sur « Test » dans la boite. L evenement est envoye uniquement dans le profil local isole ; aucune source OBS ou LIVE n est modifiee.",
            "expected": "Le bouton Test est visible dans le vrai apercu."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/spotlight/ui/main.html"
          },
          {
            "type": "prepare",
            "name": "open-spotlight-preview"
          },
          {
            "type": "run-local-preview",
            "selector": "#preview-test-btn"
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
              "path": "/plugins/spotlight/ui/main.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#preview-test-btn"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#preview-test-btn",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "spotlight-overlay",
      "copy": {
        "de": {
          "title": "Echtes Spotlight-Overlay im Preview-Rahmen pruefen",
          "body": "Die Vorschau wird ueber den echten „Preview“-Einstieg der Chatter-Karte geoeffnet. Der lokale Test liefert das Ereignis an diesen Rahmen; es werden keine Inhalte in ein leeres Overlay eingesetzt.",
          "expected": "Der echte Preview-Rahmen bleibt sichtbar und ist fuer eine OBS-Testquelle nachvollziehbar.",
          "alt": "Echtes Spotlight-Overlay im Preview-Rahmen pruefen - Ereignistyp, Anzeigedauer und Spotlight-Stil"
        },
        "en": {
          "title": "Review the real Spotlight overlay in the preview frame",
          "body": "Open the preview through the real “Preview” entry point on the Chatter card. The local test sends its event to that frame; no content is inserted into an empty overlay.",
          "expected": "The real preview frame remains visible and can be reviewed for an OBS test source.",
          "alt": "Review the real Spotlight overlay in the preview frame - event type, display duration, and spotlight style"
        },
        "es": {
          "title": "Revisa el overlay Spotlight real en el marco de vista previa",
          "body": "Abre la vista previa mediante la entrada real «Preview» de la tarjeta Chatter. La prueba local envia su evento a ese marco; no se inserta contenido en un overlay vacio.",
          "expected": "El marco de vista previa real permanece visible y puede revisarse para una fuente de prueba OBS.",
          "alt": "Revisa el overlay Spotlight real en el marco de vista previa - tipo de evento, duración de visualización y estilo Spotlight"
        },
        "fr": {
          "title": "Verifiez le vrai overlay Spotlight dans le cadre d apercu",
          "body": "Ouvrez l apercu depuis le vrai point d entree « Preview » de la carte Chatter. Le test local envoie son evenement vers ce cadre ; aucun contenu n est insere dans un overlay vide.",
          "expected": "Le vrai cadre d apercu reste visible et peut etre verifie pour une source OBS de test.",
          "alt": "Verifiez le vrai overlay Spotlight dans le cadre d apercu - type d’événement, durée d’affichage et style Spotlight"
        }
      },
      "capture": {
        "route": "/plugins/spotlight/ui/main.html",
        "assertVisible": "#preview-frame",
        "focusText": {
          "de": "Echtes Spotlight-Overlay im Preview-Rahmen pruefen",
          "en": "Review the real Spotlight overlay in the preview frame",
          "es": "Revisa el overlay Spotlight real en el marco de vista previa",
          "fr": "Verifiez le vrai overlay Spotlight dans le cadre d apercu"
        },
        "action": {
          "type": "run-local-preview",
          "prepare": "open-spotlight-preview",
          "allowClick": true,
          "clickSelector": "#preview-test-btn",
          "settleMs": 750,
          "allowEmptySurface": true,
          "stepId": "spotlight-overlay"
        },
        "expected": {
          "de": "Der echte Preview-Rahmen bleibt sichtbar und ist fuer eine OBS-Testquelle nachvollziehbar.",
          "en": "The real preview frame remains visible and can be reviewed for an OBS test source.",
          "es": "El marco de vista previa real permanece visible y puede revisarse para una fuente de prueba OBS.",
          "fr": "Le vrai cadre d apercu reste visible et peut etre verifie pour une source OBS de test."
        }
      },
      "workflow": {
        "route": "/plugins/spotlight/ui/main.html",
        "instructions": {
          "de": {
            "title": "Echtes Spotlight-Overlay im Preview-Rahmen pruefen",
            "body": "Die Vorschau wird ueber den echten „Preview“-Einstieg der Chatter-Karte geoeffnet. Der lokale Test liefert das Ereignis an diesen Rahmen; es werden keine Inhalte in ein leeres Overlay eingesetzt.",
            "expected": "Der echte Preview-Rahmen bleibt sichtbar und ist fuer eine OBS-Testquelle nachvollziehbar."
          },
          "en": {
            "title": "Review the real Spotlight overlay in the preview frame",
            "body": "Open the preview through the real “Preview” entry point on the Chatter card. The local test sends its event to that frame; no content is inserted into an empty overlay.",
            "expected": "The real preview frame remains visible and can be reviewed for an OBS test source."
          },
          "es": {
            "title": "Revisa el overlay Spotlight real en el marco de vista previa",
            "body": "Abre la vista previa mediante la entrada real «Preview» de la tarjeta Chatter. La prueba local envia su evento a ese marco; no se inserta contenido en un overlay vacio.",
            "expected": "El marco de vista previa real permanece visible y puede revisarse para una fuente de prueba OBS."
          },
          "fr": {
            "title": "Verifiez le vrai overlay Spotlight dans le cadre d apercu",
            "body": "Ouvrez l apercu depuis le vrai point d entree « Preview » de la carte Chatter. Le test local envoie son evenement vers ce cadre ; aucun contenu n est insere dans un overlay vide.",
            "expected": "Le vrai cadre d apercu reste visible et peut etre verifie pour une source OBS de test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/spotlight/ui/main.html"
          },
          {
            "type": "prepare",
            "name": "open-spotlight-preview"
          },
          {
            "type": "run-local-preview",
            "selector": "#preview-test-btn"
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
              "path": "/plugins/spotlight/ui/main.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#preview-frame"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#preview-frame",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "spotlight-reset",
      "copy": {
        "de": {
          "title": "Spotlight-Vorschau sauber schliessen",
          "body": "Nutze im echten Vorschau-Dialog „Close“. Das beendet nur die lokale Vorschau; es loescht keine Einstellungen und aendert keine produktive Browser-Quelle.",
          "expected": "Der echte Close-Button ist vor dem Verlassen der Vorschau sichtbar.",
          "alt": "Spotlight-Vorschau sauber schliessen - Ereignistyp, Anzeigedauer und Spotlight-Stil"
        },
        "en": {
          "title": "Close the Spotlight preview cleanly",
          "body": "Use “Close” in the real preview dialog. It ends only the local preview; it neither deletes settings nor changes a production browser source.",
          "expected": "The real Close button is visible before leaving the preview.",
          "alt": "Close the Spotlight preview cleanly - event type, display duration, and spotlight style"
        },
        "es": {
          "title": "Cierra la vista previa Spotlight correctamente",
          "body": "Usa «Close» en el dialogo real de vista previa. Solo termina la vista previa local; no borra ajustes ni cambia una fuente de navegador de produccion.",
          "expected": "El boton Close real queda visible antes de salir de la vista previa.",
          "alt": "Cierra la vista previa Spotlight correctamente - tipo de evento, duración de visualización y estilo Spotlight"
        },
        "fr": {
          "title": "Fermez proprement l apercu Spotlight",
          "body": "Utilisez « Close » dans la vraie boite d apercu. Cela termine seulement l apercu local ; aucun reglages ni source navigateur de production ne sont modifies.",
          "expected": "Le vrai bouton Close est visible avant de quitter l apercu.",
          "alt": "Fermez proprement l apercu Spotlight - type d’événement, durée d’affichage et style Spotlight"
        }
      },
      "capture": {
        "route": "/plugins/spotlight/ui/main.html",
        "assertVisible": "#close-preview-btn",
        "focusText": {
          "de": "Spotlight-Vorschau sauber schliessen",
          "en": "Close the Spotlight preview cleanly",
          "es": "Cierra la vista previa Spotlight correctamente",
          "fr": "Fermez proprement l apercu Spotlight"
        },
        "action": {
          "type": "reset-demo-state",
          "prepare": "open-spotlight-preview",
          "stepId": "spotlight-reset"
        },
        "expected": {
          "de": "Der echte Close-Button ist vor dem Verlassen der Vorschau sichtbar.",
          "en": "The real Close button is visible before leaving the preview.",
          "es": "El boton Close real queda visible antes de salir de la vista previa.",
          "fr": "Le vrai bouton Close est visible avant de quitter l apercu."
        }
      },
      "workflow": {
        "route": "/plugins/spotlight/ui/main.html",
        "instructions": {
          "de": {
            "title": "Spotlight-Vorschau sauber schliessen",
            "body": "Nutze im echten Vorschau-Dialog „Close“. Das beendet nur die lokale Vorschau; es loescht keine Einstellungen und aendert keine produktive Browser-Quelle.",
            "expected": "Der echte Close-Button ist vor dem Verlassen der Vorschau sichtbar."
          },
          "en": {
            "title": "Close the Spotlight preview cleanly",
            "body": "Use “Close” in the real preview dialog. It ends only the local preview; it neither deletes settings nor changes a production browser source.",
            "expected": "The real Close button is visible before leaving the preview."
          },
          "es": {
            "title": "Cierra la vista previa Spotlight correctamente",
            "body": "Usa «Close» en el dialogo real de vista previa. Solo termina la vista previa local; no borra ajustes ni cambia una fuente de navegador de produccion.",
            "expected": "El boton Close real queda visible antes de salir de la vista previa."
          },
          "fr": {
            "title": "Fermez proprement l apercu Spotlight",
            "body": "Utilisez « Close » dans la vraie boite d apercu. Cela termine seulement l apercu local ; aucun reglages ni source navigateur de production ne sont modifies.",
            "expected": "Le vrai bouton Close est visible avant de quitter l apercu."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/spotlight/ui/main.html"
          },
          {
            "type": "prepare",
            "name": "open-spotlight-preview"
          },
          {
            "type": "reset-demo-state",
            "selector": "#close-preview-btn"
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
              "path": "/plugins/spotlight/ui/main.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#close-preview-btn"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#close-preview-btn",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    }
  ]
}, {
  'spotlight-overlay': {
    route: '/plugins/spotlight/ui/main.html',
    selector: 'button[data-action="preview"][data-type="chatter"]',
    copy: {
      de: { title: 'Chatter-Vorschau über die Karte öffnen', body: 'Nutze in der nicht sendenden OBS-Testszene den sichtbaren Preview-Button der Chatter-Karte. Der Screenshot dokumentiert diesen echten Einstieg statt eines leeren Overlay-Iframes.', expected: 'Der Chatter-Preview-Einstieg ist sichtbar und kann anschließend bewusst in der Testszene verwendet werden.' },
      en: { title: 'Open the Chatter preview from its card', body: 'In the non-live OBS test scene, use the visible Preview button on the Chatter card. The screenshot documents this real entry point rather than an empty overlay iframe.', expected: 'The Chatter preview entry point is visible and can then be used deliberately in the test scene.' },
      es: { title: 'Abre la vista previa de Chatter desde su tarjeta', body: 'En la escena de prueba de OBS que no está en directo, usa el botón Preview visible de la tarjeta Chatter. La captura documenta este acceso real en lugar de un iframe de overlay vacío.', expected: 'La entrada de vista previa de Chatter está visible y puede usarse después de forma consciente en la escena de prueba.' },
      fr: { title: 'Ouvrez l’aperçu Chatter depuis sa carte', body: 'Dans la scène de test OBS hors diffusion, utilisez le bouton Preview visible de la carte Chatter. La capture documente ce véritable point d’entrée plutôt qu’un iframe overlay vide.', expected: 'Le point d’entrée de l’aperçu Chatter est visible et peut ensuite être utilisé délibérément dans la scène de test.' }
    }
  }
}));
