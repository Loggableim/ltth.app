'use strict';

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
module.exports = Object.freeze({
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
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/spotlight/ui/main.html"
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
          "title": "Chatter-Design im echten Settings-Dialog pruefen",
          "body": "Oeffne auf der Chatter-Karte „Settings“ und waehle dort eine vorhandene Design-Variante. Speichere erst nach einer eigenen Pruefung; die Aufnahme aendert keine produktive Overlay-Konfiguration.",
          "expected": "Der echte Settings-Dialog zeigt die fuer Chatter verfuegbaren Designfelder.",
          "alt": "Chatter-Design im echten Settings-Dialog pruefen - Ereignistyp, Anzeigedauer und Spotlight-Stil"
        },
        "en": {
          "title": "Review the Chatter design in the real Settings dialog",
          "body": "On the Chatter card, open “Settings” and choose one of the available design variants. Save only after your own review; the capture does not change a production overlay configuration.",
          "expected": "The real Settings dialog shows the design fields available for Chatter.",
          "alt": "Review the Chatter design in the real Settings dialog - event type, display duration, and spotlight style"
        },
        "es": {
          "title": "Revisa el diseno Chatter en el dialogo real de ajustes",
          "body": "En la tarjeta Chatter, abre «Settings» y elige una variante de diseno disponible. Guarda solo tras revisarla; la captura no cambia una configuracion de overlay de produccion.",
          "expected": "El dialogo real muestra los campos de diseno disponibles para Chatter.",
          "alt": "Revisa el diseno Chatter en el dialogo real de ajustes - tipo de evento, duración de visualización y estilo Spotlight"
        },
        "fr": {
          "title": "Verifiez le design Chatter dans la vraie boite de reglages",
          "body": "Sur la carte Chatter, ouvrez « Settings » et choisissez une variante de design disponible. Enregistrez seulement apres verification ; la capture ne modifie aucune configuration overlay de production.",
          "expected": "La vraie boite de reglages affiche les champs de design disponibles pour Chatter.",
          "alt": "Verifiez le design Chatter dans la vraie boite de reglages - type d’événement, durée d’affichage et style Spotlight"
        }
      },
      "capture": {
        "route": "/plugins/spotlight/ui/main.html",
        "assertVisible": "#settings-form-container",
        "focusText": {
          "de": "Chatter-Design im echten Settings-Dialog pruefen",
          "en": "Review the Chatter design in the real Settings dialog",
          "es": "Revisa el diseno Chatter en el dialogo real de ajustes",
          "fr": "Verifiez le design Chatter dans la vraie boite de reglages"
        },
        "action": {
          "type": "set-demo-value",
          "prepare": "open-spotlight-settings",
          "stepId": "event-style"
        },
        "expected": {
          "de": "Der echte Settings-Dialog zeigt die fuer Chatter verfuegbaren Designfelder.",
          "en": "The real Settings dialog shows the design fields available for Chatter.",
          "es": "El dialogo real muestra los campos de diseno disponibles para Chatter.",
          "fr": "La vraie boite de reglages affiche les champs de design disponibles pour Chatter."
        }
      },
      "workflow": {
        "route": "/plugins/spotlight/ui/main.html",
        "instructions": {
          "de": {
            "title": "Chatter-Design im echten Settings-Dialog pruefen",
            "body": "Oeffne auf der Chatter-Karte „Settings“ und waehle dort eine vorhandene Design-Variante. Speichere erst nach einer eigenen Pruefung; die Aufnahme aendert keine produktive Overlay-Konfiguration.",
            "expected": "Der echte Settings-Dialog zeigt die fuer Chatter verfuegbaren Designfelder."
          },
          "en": {
            "title": "Review the Chatter design in the real Settings dialog",
            "body": "On the Chatter card, open “Settings” and choose one of the available design variants. Save only after your own review; the capture does not change a production overlay configuration.",
            "expected": "The real Settings dialog shows the design fields available for Chatter."
          },
          "es": {
            "title": "Revisa el diseno Chatter en el dialogo real de ajustes",
            "body": "En la tarjeta Chatter, abre «Settings» y elige una variante de diseno disponible. Guarda solo tras revisarla; la captura no cambia una configuracion de overlay de produccion.",
            "expected": "El dialogo real muestra los campos de diseno disponibles para Chatter."
          },
          "fr": {
            "title": "Verifiez le design Chatter dans la vraie boite de reglages",
            "body": "Sur la carte Chatter, ouvrez « Settings » et choisissez une variante de design disponible. Enregistrez seulement apres verification ; la capture ne modifie aucune configuration overlay de production.",
            "expected": "La vraie boite de reglages affiche les champs de design disponibles pour Chatter."
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
            "selector": "#settings-form-container"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/spotlight/ui/main.html"
          },
          {
            "type": "visible",
            "selector": "#settings-form-container"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#settings-form-container",
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
          "title": "Keinen erfundenen Display-Timer konfigurieren",
          "body": "Spotlight bietet in diesem Dialog keine separate „Display Duration“. Nutze stattdessen die echten Animations- und Trigger-Einstellungen; die Sichtbarkeit wird vom ausgelosten Overlay-Ereignis bestimmt.",
          "expected": "Der sichtbare Speichern-Button bestaetigt den echten Abschluss des Settings-Workflows.",
          "alt": "Keinen erfundenen Display-Timer konfigurieren - Ereignistyp, Anzeigedauer und Spotlight-Stil"
        },
        "en": {
          "title": "Do not configure an invented display timer",
          "body": "Spotlight has no separate “Display Duration” in this dialog. Use the real animation and trigger settings instead; visibility is determined by the triggered overlay event.",
          "expected": "The visible Save button marks the real end of the Settings workflow.",
          "alt": "Do not configure an invented display timer - event type, display duration, and spotlight style"
        },
        "es": {
          "title": "No configures un temporizador de pantalla inventado",
          "body": "Spotlight no ofrece una «Display Duration» separada en este dialogo. Usa los ajustes reales de animacion y disparador; la visibilidad depende del evento de overlay activado.",
          "expected": "El boton Guardar visible marca el final real del flujo de ajustes.",
          "alt": "No configures un temporizador de pantalla inventado - tipo de evento, duración de visualización y estilo Spotlight"
        },
        "fr": {
          "title": "Ne configurez pas de minuteur d affichage invente",
          "body": "Spotlight ne propose pas de « Display Duration » separee dans cette boite. Utilisez les vrais reglages d animation et de declencheur ; la visibilite depend de l evenement overlay declenche.",
          "expected": "Le bouton Enregistrer visible marque la vraie fin du workflow de reglages.",
          "alt": "Ne configurez pas de minuteur d affichage invente - type d’événement, durée d’affichage et style Spotlight"
        }
      },
      "capture": {
        "route": "/plugins/spotlight/ui/main.html",
        "assertVisible": "#save-settings-btn",
        "focusText": {
          "de": "Keinen erfundenen Display-Timer konfigurieren",
          "en": "Do not configure an invented display timer",
          "es": "No configures un temporizador de pantalla inventado",
          "fr": "Ne configurez pas de minuteur d affichage invente"
        },
        "action": {
          "type": "set-demo-value",
          "prepare": "open-spotlight-settings",
          "stepId": "display-duration"
        },
        "expected": {
          "de": "Der sichtbare Speichern-Button bestaetigt den echten Abschluss des Settings-Workflows.",
          "en": "The visible Save button marks the real end of the Settings workflow.",
          "es": "El boton Guardar visible marca el final real del flujo de ajustes.",
          "fr": "Le bouton Enregistrer visible marque la vraie fin du workflow de reglages."
        }
      },
      "workflow": {
        "route": "/plugins/spotlight/ui/main.html",
        "instructions": {
          "de": {
            "title": "Keinen erfundenen Display-Timer konfigurieren",
            "body": "Spotlight bietet in diesem Dialog keine separate „Display Duration“. Nutze stattdessen die echten Animations- und Trigger-Einstellungen; die Sichtbarkeit wird vom ausgelosten Overlay-Ereignis bestimmt.",
            "expected": "Der sichtbare Speichern-Button bestaetigt den echten Abschluss des Settings-Workflows."
          },
          "en": {
            "title": "Do not configure an invented display timer",
            "body": "Spotlight has no separate “Display Duration” in this dialog. Use the real animation and trigger settings instead; visibility is determined by the triggered overlay event.",
            "expected": "The visible Save button marks the real end of the Settings workflow."
          },
          "es": {
            "title": "No configures un temporizador de pantalla inventado",
            "body": "Spotlight no ofrece una «Display Duration» separada en este dialogo. Usa los ajustes reales de animacion y disparador; la visibilidad depende del evento de overlay activado.",
            "expected": "El boton Guardar visible marca el final real del flujo de ajustes."
          },
          "fr": {
            "title": "Ne configurez pas de minuteur d affichage invente",
            "body": "Spotlight ne propose pas de « Display Duration » separee dans cette boite. Utilisez les vrais reglages d animation et de declencheur ; la visibilite depend de l evenement overlay declenche.",
            "expected": "Le bouton Enregistrer visible marque la vraie fin du workflow de reglages."
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
            "selector": "#save-settings-btn"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/spotlight/ui/main.html"
          },
          {
            "type": "visible",
            "selector": "#save-settings-btn"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#save-settings-btn",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
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
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/spotlight/ui/main.html"
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
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/spotlight/ui/main.html"
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
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/spotlight/ui/main.html"
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
});
