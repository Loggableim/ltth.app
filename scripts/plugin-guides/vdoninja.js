'use strict';

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
module.exports = Object.freeze({
  "id": "vdoninja",
  "route": "/plugins/vdoninja/ui.html",
  "topic": {
    "de": "Raumname, Gastlayout und Browserquelle",
    "en": "room name, guest layout, and browser source",
    "es": "nombre de sala, diseño de invitados y fuente de navegador",
    "fr": "nom de salle, disposition des invités et source navigateur"
  },
  "test": {
    "de": "eine lokale URL-Vorschau mit Platzhalterraum",
    "en": "a local URL preview with a placeholder room",
    "es": "una vista previa de URL local con sala de marcador",
    "fr": "un aperçu d’URL local avec salle fictive"
  },
  "expected": {
    "de": "die Browser-Quelle ist vorbereitet, ohne einen Gast zu verbinden",
    "en": "the browser source is prepared without connecting a guest",
    "es": "la fuente de navegador está preparada sin conectar un invitado",
    "fr": "la source navigateur est préparée sans connecter d’invité"
  },
  "requirement": "obs",
  "safety": "credentials",
  "mode": "ui",
  "overlay": null,
  "related": [
    "multicam",
    "clarityhud"
  ],
  "copy": {
    "de": {
      "title": "VDO.Ninja Multi-Guest Manager",
      "summary": "VDO.Ninja Multi-Guest Manager richtet Raumname, Gastlayout und Browserquelle ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "die Browser-Quelle ist vorbereitet, ohne einen Gast zu verbinden",
      "requirements": "LTTH Dashboard; für die Ausgabe zusätzlich eine OBS-Testszene. Dieser konkrete VDO.Ninja Multi-Guest Manager-Ablauf behandelt Raumname, Gastlayout und Browserquelle.",
      "safety": "Keine echten API-Schlüssel oder Konten eingeben; Platzhalter bleiben Platzhalter. Dieser konkrete VDO.Ninja Multi-Guest Manager-Ablauf behandelt Raumname, Gastlayout und Browserquelle.",
      "troubleshooting": "Wenn Raumname, Gastlayout und Browserquelle nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "multicam",
        "clarityhud"
      ]
    },
    "en": {
      "title": "VDO.Ninja Multi-Guest Manager",
      "summary": "VDO.Ninja Multi-Guest Manager configures room name, guest layout, and browser source with a safe local check instead of a LIVE trigger.",
      "firstResult": "the browser source is prepared without connecting a guest",
      "requirements": "LTTH Dashboard; use an OBS test scene for output. This VDO.Ninja Multi-Guest Manager workflow specifically covers room name, guest layout, and browser source.",
      "safety": "Do not enter real API keys or accounts; placeholders stay placeholders. This VDO.Ninja Multi-Guest Manager workflow specifically covers room name, guest layout, and browser source.",
      "troubleshooting": "If room name, guest layout, and browser source is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "multicam",
        "clarityhud"
      ]
    },
    "es": {
      "title": "VDO.Ninja Multi-Guest Manager",
      "summary": "VDO.Ninja Multi-Guest Manager configura nombre de sala, diseño de invitados y fuente de navegador mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "la fuente de navegador está preparada sin conectar un invitado",
      "requirements": "El panel de LTTH y una escena de prueba de OBS para la salida. Este flujo concreto de VDO.Ninja Multi-Guest Manager trata nombre de sala, diseño de invitados y fuente de navegador.",
      "safety": "No introduzcas claves API ni cuentas reales; los marcadores siguen siendo marcadores. Este flujo concreto de VDO.Ninja Multi-Guest Manager trata nombre de sala, diseño de invitados y fuente de navegador.",
      "troubleshooting": "Si nombre de sala, diseño de invitados y fuente de navegador no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "multicam",
        "clarityhud"
      ]
    },
    "fr": {
      "title": "VDO.Ninja Multi-Guest Manager",
      "summary": "VDO.Ninja Multi-Guest Manager configure nom de salle, disposition des invités et source navigateur avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "la source navigateur est préparée sans connecter d’invité",
      "requirements": "Le tableau de bord LTTH et une scène de test OBS pour la sortie. Ce flux spécifique de VDO.Ninja Multi-Guest Manager couvre nom de salle, disposition des invités et source navigateur.",
      "safety": "Ne saisissez aucune clé API ni compte réel ; les espaces réservés restent des espaces réservés. Ce flux spécifique de VDO.Ninja Multi-Guest Manager couvre nom de salle, disposition des invités et source navigateur.",
      "troubleshooting": "Si nom de salle, disposition des invités et source navigateur n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "multicam",
        "clarityhud"
      ]
    }
  },
  "steps": [
    {
      "id": "ninja-card",
      "copy": {
        "de": {
          "title": "VDO.Ninja im Zustand ohne aktiven Raum pruefen",
          "body": "Oeffne VDO.Ninja und pruefe zuerst den Statuspunkt. Ohne angelegten Raum sind keine Gast- oder OBS-Steuerungen aktiv.",
          "expected": "Der echte Startzustand ist sichtbar; es wird kein Raum und keine externe Verbindung erzeugt.",
          "alt": "VDO.Ninja im Zustand ohne aktiven Raum pruefen - Raumname, Gastlayout und Browserquelle"
        },
        "en": {
          "title": "Check VDO.Ninja with no active room",
          "body": "Open VDO.Ninja and check the status indicator first. Until a room exists, guest and OBS controls are not active.",
          "expected": "The real starting state is visible; no room or external connection is created.",
          "alt": "Check VDO.Ninja with no active room - room name, guest layout, and browser source"
        },
        "es": {
          "title": "Comprueba VDO.Ninja sin sala activa",
          "body": "Abre VDO.Ninja y revisa primero el indicador de estado. Hasta crear una sala, los controles de invitados y OBS no estan activos.",
          "expected": "Se ve el estado inicial real; no se crea ninguna sala ni conexion externa.",
          "alt": "Comprueba VDO.Ninja sin sala activa - nombre de sala, diseño de invitados y fuente de navegador"
        },
        "fr": {
          "title": "Verifiez VDO.Ninja sans salle active",
          "body": "Ouvrez VDO.Ninja et verifiez d abord lindicateur detat. Tant qu aucune salle nexiste, les controles des invites et d OBS ne sont pas actifs.",
          "expected": "Le vrai etat initial est visible ; aucune salle ni connexion externe nest creee.",
          "alt": "Verifiez VDO.Ninja sans salle active - nom de salle, disposition des invités et source navigateur"
        }
      },
      "capture": {
        "route": "/plugins/vdoninja/ui.html",
        "assertVisible": "#statusIndicator",
        "focusText": {
          "de": "VDO.Ninja im Zustand ohne aktiven Raum pruefen",
          "en": "Check VDO.Ninja with no active room",
          "es": "Comprueba VDO.Ninja sin sala activa",
          "fr": "Verifiez VDO.Ninja sans salle active"
        },
        "action": {
          "type": "open-plugin-surface",
          "stepId": "ninja-card"
        },
        "expected": {
          "de": "Der echte Startzustand ist sichtbar; es wird kein Raum und keine externe Verbindung erzeugt.",
          "en": "The real starting state is visible; no room or external connection is created.",
          "es": "Se ve el estado inicial real; no se crea ninguna sala ni conexion externa.",
          "fr": "Le vrai etat initial est visible ; aucune salle ni connexion externe nest creee."
        }
      },
      "workflow": {
        "route": "/plugins/vdoninja/ui.html",
        "instructions": {
          "de": {
            "title": "VDO.Ninja im Zustand ohne aktiven Raum pruefen",
            "body": "Oeffne VDO.Ninja und pruefe zuerst den Statuspunkt. Ohne angelegten Raum sind keine Gast- oder OBS-Steuerungen aktiv.",
            "expected": "Der echte Startzustand ist sichtbar; es wird kein Raum und keine externe Verbindung erzeugt."
          },
          "en": {
            "title": "Check VDO.Ninja with no active room",
            "body": "Open VDO.Ninja and check the status indicator first. Until a room exists, guest and OBS controls are not active.",
            "expected": "The real starting state is visible; no room or external connection is created."
          },
          "es": {
            "title": "Comprueba VDO.Ninja sin sala activa",
            "body": "Abre VDO.Ninja y revisa primero el indicador de estado. Hasta crear una sala, los controles de invitados y OBS no estan activos.",
            "expected": "Se ve el estado inicial real; no se crea ninguna sala ni conexion externa."
          },
          "fr": {
            "title": "Verifiez VDO.Ninja sans salle active",
            "body": "Ouvrez VDO.Ninja et verifiez d abord lindicateur detat. Tant qu aucune salle nexiste, les controles des invites et d OBS ne sont pas actifs.",
            "expected": "Le vrai etat initial est visible ; aucune salle ni connexion externe nest creee."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/vdoninja/ui.html"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#statusIndicator"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/vdoninja/ui.html"
          },
          {
            "type": "visible",
            "selector": "#statusIndicator"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#statusIndicator",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "placeholder-room",
      "copy": {
        "de": {
          "title": "Namen fuer einen lokalen Testraum festlegen",
          "body": "Trage im Feld Room Name einen nicht persoenlichen Testnamen ein. Dieser Schritt bereitet nur die lokale Raumerstellung vor und teilt noch keine Gast-URL.",
          "expected": "Der echte Nameingabebereich ist sichtbar und kann vor dem Erstellen geprueft werden.",
          "alt": "Namen fuer einen lokalen Testraum festlegen - Raumname, Gastlayout und Browserquelle"
        },
        "en": {
          "title": "Set a name for a local test room",
          "body": "Enter a non-personal test name in Room Name. This only prepares the local room creation and does not share a guest URL yet.",
          "expected": "The real name field is visible and can be reviewed before creating a room.",
          "alt": "Set a name for a local test room - room name, guest layout, and browser source"
        },
        "es": {
          "title": "Define un nombre para una sala local de prueba",
          "body": "Introduce un nombre de prueba no personal en Room Name. Solo prepara la creacion local y aun no comparte una URL de invitacion.",
          "expected": "El campo de nombre real esta visible y puede revisarse antes de crear la sala.",
          "alt": "Define un nombre para una sala local de prueba - nombre de sala, diseño de invitados y fuente de navegador"
        },
        "fr": {
          "title": "Definissez un nom pour une salle de test locale",
          "body": "Saisissez un nom de test non personnel dans Room Name. Cela prepare seulement la creation locale et ne partage encore aucune URL dinvitation.",
          "expected": "Le vrai champ de nom est visible et peut etre verifie avant de creer la salle.",
          "alt": "Definissez un nom pour une salle de test locale - nom de salle, disposition des invités et source navigateur"
        }
      },
      "capture": {
        "route": "/plugins/vdoninja/ui.html",
        "assertVisible": "#roomNameInput",
        "focusText": {
          "de": "Namen fuer einen lokalen Testraum festlegen",
          "en": "Set a name for a local test room",
          "es": "Define un nombre para una sala local de prueba",
          "fr": "Definissez un nom pour une salle de test locale"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "placeholder-room"
        },
        "expected": {
          "de": "Der echte Nameingabebereich ist sichtbar und kann vor dem Erstellen geprueft werden.",
          "en": "The real name field is visible and can be reviewed before creating a room.",
          "es": "El campo de nombre real esta visible y puede revisarse antes de crear la sala.",
          "fr": "Le vrai champ de nom est visible et peut etre verifie avant de creer la salle."
        }
      },
      "workflow": {
        "route": "/plugins/vdoninja/ui.html",
        "instructions": {
          "de": {
            "title": "Namen fuer einen lokalen Testraum festlegen",
            "body": "Trage im Feld Room Name einen nicht persoenlichen Testnamen ein. Dieser Schritt bereitet nur die lokale Raumerstellung vor und teilt noch keine Gast-URL.",
            "expected": "Der echte Nameingabebereich ist sichtbar und kann vor dem Erstellen geprueft werden."
          },
          "en": {
            "title": "Set a name for a local test room",
            "body": "Enter a non-personal test name in Room Name. This only prepares the local room creation and does not share a guest URL yet.",
            "expected": "The real name field is visible and can be reviewed before creating a room."
          },
          "es": {
            "title": "Define un nombre para una sala local de prueba",
            "body": "Introduce un nombre de prueba no personal en Room Name. Solo prepara la creacion local y aun no comparte una URL de invitacion.",
            "expected": "El campo de nombre real esta visible y puede revisarse antes de crear la sala."
          },
          "fr": {
            "title": "Definissez un nom pour une salle de test locale",
            "body": "Saisissez un nom de test non personnel dans Room Name. Cela prepare seulement la creation locale et ne partage encore aucune URL dinvitation.",
            "expected": "Le vrai champ de nom est visible et peut etre verifie avant de creer la salle."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/vdoninja/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#roomNameInput"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/vdoninja/ui.html"
          },
          {
            "type": "visible",
            "selector": "#roomNameInput"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#roomNameInput",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "guest-layout",
      "copy": {
        "de": {
          "title": "Vor dem Raumstart ein vorhandenes Gastlayout waehlen",
          "body": "Pruefe die vorhandenen Layout-Vorgaben wie Grid oder Solo. Waehle ein Layout erst fuer einen aktiven Raum; die Ansicht verbindet dabei keinen Gast.",
          "expected": "Die echten Layout-Vorgaben sind sichtbar, ohne einen Gast zu verbinden.",
          "alt": "Vor dem Raumstart ein vorhandenes Gastlayout waehlen - Raumname, Gastlayout und Browserquelle"
        },
        "en": {
          "title": "Choose an available guest layout before starting a room",
          "body": "Review the available layout presets such as Grid or Solo. Select one only for an active room; viewing these presets does not connect a guest.",
          "expected": "The real layout presets are visible without connecting a guest.",
          "alt": "Choose an available guest layout before starting a room - room name, guest layout, and browser source"
        },
        "es": {
          "title": "Elige un diseno de invitados disponible antes de iniciar una sala",
          "body": "Revisa los preajustes disponibles como Grid o Solo. Elige uno solo para una sala activa; revisar los preajustes no conecta invitados.",
          "expected": "Los preajustes reales estan visibles sin conectar invitados.",
          "alt": "Elige un diseno de invitados disponible antes de iniciar una sala - nombre de sala, diseño de invitados y fuente de navegador"
        },
        "fr": {
          "title": "Choisissez une disposition dinvites disponible avant de demarrer une salle",
          "body": "Verifiez les predefinis disponibles, comme Grid ou Solo. Choisissez-en un seulement pour une salle active ; les consulter ne connecte aucun invite.",
          "expected": "Les vrais predefinis de disposition sont visibles sans connecter dinvite.",
          "alt": "Choisissez une disposition dinvites disponible avant de demarrer une salle - nom de salle, disposition des invités et source navigateur"
        }
      },
      "capture": {
        "route": "/plugins/vdoninja/ui.html",
        "assertVisible": ".layout-grid",
        "focusText": {
          "de": "Vor dem Raumstart ein vorhandenes Gastlayout waehlen",
          "en": "Choose an available guest layout before starting a room",
          "es": "Elige un diseno de invitados disponible antes de iniciar una sala",
          "fr": "Choisissez une disposition dinvites disponible avant de demarrer une salle"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "guest-layout"
        },
        "expected": {
          "de": "Die echten Layout-Vorgaben sind sichtbar, ohne einen Gast zu verbinden.",
          "en": "The real layout presets are visible without connecting a guest.",
          "es": "Los preajustes reales estan visibles sin conectar invitados.",
          "fr": "Les vrais predefinis de disposition sont visibles sans connecter dinvite."
        }
      },
      "workflow": {
        "route": "/plugins/vdoninja/ui.html",
        "instructions": {
          "de": {
            "title": "Vor dem Raumstart ein vorhandenes Gastlayout waehlen",
            "body": "Pruefe die vorhandenen Layout-Vorgaben wie Grid oder Solo. Waehle ein Layout erst fuer einen aktiven Raum; die Ansicht verbindet dabei keinen Gast.",
            "expected": "Die echten Layout-Vorgaben sind sichtbar, ohne einen Gast zu verbinden."
          },
          "en": {
            "title": "Choose an available guest layout before starting a room",
            "body": "Review the available layout presets such as Grid or Solo. Select one only for an active room; viewing these presets does not connect a guest.",
            "expected": "The real layout presets are visible without connecting a guest."
          },
          "es": {
            "title": "Elige un diseno de invitados disponible antes de iniciar una sala",
            "body": "Revisa los preajustes disponibles como Grid o Solo. Elige uno solo para una sala activa; revisar los preajustes no conecta invitados.",
            "expected": "Los preajustes reales estan visibles sin conectar invitados."
          },
          "fr": {
            "title": "Choisissez une disposition dinvites disponible avant de demarrer une salle",
            "body": "Verifiez les predefinis disponibles, comme Grid ou Solo. Choisissez-en un seulement pour une salle active ; les consulter ne connecte aucun invite.",
            "expected": "Les vrais predefinis de disposition sont visibles sans connecter dinvite."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/vdoninja/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": ".layout-grid"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/vdoninja/ui.html"
          },
          {
            "type": "visible",
            "selector": ".layout-grid"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": ".layout-grid",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "browser-preview",
      "copy": {
        "de": {
          "title": "Lokalen Raum erst nach Namen und Gastlimit erstellen",
          "body": "Pruefe Room Name und Max Guests und klicke dann auf den echten Button Create Room. Dadurch wird nur ein lokaler Raumeintrag mit den spaeteren URLs vorbereitet; es wird kein Gast eingeladen.",
          "expected": "Der echte Create-Room-Button markiert den Beginn des Raum-Workflows.",
          "alt": "Lokalen Raum erst nach Namen und Gastlimit erstellen - Raumname, Gastlayout und Browserquelle"
        },
        "en": {
          "title": "Create the local room only after checking its name and guest limit",
          "body": "Review Room Name and Max Guests, then click the real Create Room button. This prepares only a local room record with the later URLs; no guest is invited.",
          "expected": "The real Create Room button marks the start of the room workflow.",
          "alt": "Create the local room only after checking its name and guest limit - room name, guest layout, and browser source"
        },
        "es": {
          "title": "Crea la sala local solo despues de revisar el nombre y limite de invitados",
          "body": "Revisa Room Name y Max Guests y luego haz clic en el boton real Create Room. Solo prepara un registro local con las URL posteriores; no invita a ningun invitado.",
          "expected": "El boton real Create Room marca el inicio del flujo de sala.",
          "alt": "Crea la sala local solo despues de revisar el nombre y limite de invitados - nombre de sala, diseño de invitados y fuente de navegador"
        },
        "fr": {
          "title": "Creez la salle locale seulement apres avoir verifie son nom et sa limite dinvites",
          "body": "Verifiez Room Name et Max Guests, puis cliquez sur le vrai bouton Create Room. Cela prepare uniquement un enregistrement local avec les futures URL ; aucun invite nest convie.",
          "expected": "Le vrai bouton Create Room marque le debut du workflow de salle.",
          "alt": "Creez la salle locale seulement apres avoir verifie son nom et sa limite dinvites - nom de salle, disposition des invités et source navigateur"
        }
      },
      "capture": {
        "route": "/plugins/vdoninja/ui.html",
        "assertVisible": "#createRoomBtn",
        "focusText": {
          "de": "Lokalen Raum erst nach Namen und Gastlimit erstellen",
          "en": "Create the local room only after checking its name and guest limit",
          "es": "Crea la sala local solo despues de revisar el nombre y limite de invitados",
          "fr": "Creez la salle locale seulement apres avoir verifie son nom et sa limite dinvites"
        },
        "action": {
          "type": "run-local-preview",
          "stepId": "browser-preview"
        },
        "expected": {
          "de": "Der echte Create-Room-Button markiert den Beginn des Raum-Workflows.",
          "en": "The real Create Room button marks the start of the room workflow.",
          "es": "El boton real Create Room marca el inicio del flujo de sala.",
          "fr": "Le vrai bouton Create Room marque le debut du workflow de salle."
        }
      },
      "workflow": {
        "route": "/plugins/vdoninja/ui.html",
        "instructions": {
          "de": {
            "title": "Lokalen Raum erst nach Namen und Gastlimit erstellen",
            "body": "Pruefe Room Name und Max Guests und klicke dann auf den echten Button Create Room. Dadurch wird nur ein lokaler Raumeintrag mit den spaeteren URLs vorbereitet; es wird kein Gast eingeladen.",
            "expected": "Der echte Create-Room-Button markiert den Beginn des Raum-Workflows."
          },
          "en": {
            "title": "Create the local room only after checking its name and guest limit",
            "body": "Review Room Name and Max Guests, then click the real Create Room button. This prepares only a local room record with the later URLs; no guest is invited.",
            "expected": "The real Create Room button marks the start of the room workflow."
          },
          "es": {
            "title": "Crea la sala local solo despues de revisar el nombre y limite de invitados",
            "body": "Revisa Room Name y Max Guests y luego haz clic en el boton real Create Room. Solo prepara un registro local con las URL posteriores; no invita a ningun invitado.",
            "expected": "El boton real Create Room marca el inicio del flujo de sala."
          },
          "fr": {
            "title": "Creez la salle locale seulement apres avoir verifie son nom et sa limite dinvites",
            "body": "Verifiez Room Name et Max Guests, puis cliquez sur le vrai bouton Create Room. Cela prepare uniquement un enregistrement local avec les futures URL ; aucun invite nest convie.",
            "expected": "Le vrai bouton Create Room marque le debut du workflow de salle."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/vdoninja/ui.html"
          },
          {
            "type": "run-local-preview",
            "selector": "#createRoomBtn"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/vdoninja/ui.html"
          },
          {
            "type": "visible",
            "selector": "#createRoomBtn"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#createRoomBtn",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "obs-guest-source",
      "copy": {
        "de": {
          "title": "Die echte OBS-Browserquellen-Reihenfolge beachten",
          "body": "Nach dem Erstellen eines Raums zeigt die App die Director URL. Kopiere genau diese URL in eine OBS-Browserquelle mit 1920x1080; die Startansicht zeigt absichtlich noch keine erfundene URL.",
          "expected": "Die eingebaute Quick Guide beschreibt die reale Reihenfolge: Raum, Director-URL, Gast-Einladung und Steuerung.",
          "alt": "Die echte OBS-Browserquellen-Reihenfolge beachten - Raumname, Gastlayout und Browserquelle"
        },
        "en": {
          "title": "Follow the real OBS browser-source order",
          "body": "After creating a room, the app shows the Director URL. Copy that exact URL into an OBS Browser Source at 1920x1080; the starting view deliberately shows no invented URL.",
          "expected": "The built-in Quick Guide gives the real order: room, Director URL, guest invite, and control.",
          "alt": "Follow the real OBS browser-source order - room name, guest layout, and browser source"
        },
        "es": {
          "title": "Sigue el orden real para la fuente de navegador de OBS",
          "body": "Tras crear una sala, la app muestra la Director URL. Copia esa URL exacta en una fuente de navegador OBS de 1920x1080; la vista inicial no muestra una URL inventada.",
          "expected": "La Quick Guide integrada indica el orden real: sala, Director URL, invitacion de invitados y control.",
          "alt": "Sigue el orden real para la fuente de navegador de OBS - nombre de sala, diseño de invitados y fuente de navegador"
        },
        "fr": {
          "title": "Suivez le vrai ordre pour la source navigateur OBS",
          "body": "Apres creation dune salle, lapp affiche la Director URL. Copiez cette URL exacte dans une source navigateur OBS en 1920x1080 ; la vue initiale naffiche volontairement aucune URL inventee.",
          "expected": "Le Quick Guide integre donne lordre reel : salle, Director URL, invitation dinvites et controle.",
          "alt": "Suivez le vrai ordre pour la source navigateur OBS - nom de salle, disposition des invités et source navigateur"
        }
      },
      "capture": {
        "route": "/plugins/vdoninja/ui.html",
        "assertVisible": ".alert-info",
        "focusText": {
          "de": "Die echte OBS-Browserquellen-Reihenfolge beachten",
          "en": "Follow the real OBS browser-source order",
          "es": "Sigue el orden real para la fuente de navegador de OBS",
          "fr": "Suivez le vrai ordre pour la source navigateur OBS"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "obs-guest-source"
        },
        "expected": {
          "de": "Die eingebaute Quick Guide beschreibt die reale Reihenfolge: Raum, Director-URL, Gast-Einladung und Steuerung.",
          "en": "The built-in Quick Guide gives the real order: room, Director URL, guest invite, and control.",
          "es": "La Quick Guide integrada indica el orden real: sala, Director URL, invitacion de invitados y control.",
          "fr": "Le Quick Guide integre donne lordre reel : salle, Director URL, invitation dinvites et controle."
        }
      },
      "workflow": {
        "route": "/plugins/vdoninja/ui.html",
        "instructions": {
          "de": {
            "title": "Die echte OBS-Browserquellen-Reihenfolge beachten",
            "body": "Nach dem Erstellen eines Raums zeigt die App die Director URL. Kopiere genau diese URL in eine OBS-Browserquelle mit 1920x1080; die Startansicht zeigt absichtlich noch keine erfundene URL.",
            "expected": "Die eingebaute Quick Guide beschreibt die reale Reihenfolge: Raum, Director-URL, Gast-Einladung und Steuerung."
          },
          "en": {
            "title": "Follow the real OBS browser-source order",
            "body": "After creating a room, the app shows the Director URL. Copy that exact URL into an OBS Browser Source at 1920x1080; the starting view deliberately shows no invented URL.",
            "expected": "The built-in Quick Guide gives the real order: room, Director URL, guest invite, and control."
          },
          "es": {
            "title": "Sigue el orden real para la fuente de navegador de OBS",
            "body": "Tras crear una sala, la app muestra la Director URL. Copia esa URL exacta en una fuente de navegador OBS de 1920x1080; la vista inicial no muestra una URL inventada.",
            "expected": "La Quick Guide integrada indica el orden real: sala, Director URL, invitacion de invitados y control."
          },
          "fr": {
            "title": "Suivez le vrai ordre pour la source navigateur OBS",
            "body": "Apres creation dune salle, lapp affiche la Director URL. Copiez cette URL exacte dans une source navigateur OBS en 1920x1080 ; la vue initiale naffiche volontairement aucune URL inventee.",
            "expected": "Le Quick Guide integre donne lordre reel : salle, Director URL, invitation dinvites et controle."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/vdoninja/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": ".alert-info"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/vdoninja/ui.html"
          },
          {
            "type": "visible",
            "selector": ".alert-info"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": ".alert-info",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "ninja-reset",
      "copy": {
        "de": {
          "title": "Keinen erfundenen Reset im leeren Raumzustand suchen",
          "body": "VDO.Ninja zeigt ohne aktiven Raum keine Reset-Schaltflaeche und keine verbundenen Gaeste. Wenn du einen lokalen Testraum erstellt hast, beendet Close Room diesen ueber den echten Raumdialog.",
          "expected": "Die leere Gastansicht bestaetigt den Ausgangszustand ohne Raum und ohne verbundene Gaeste.",
          "alt": "Keinen erfundenen Reset im leeren Raumzustand suchen - Raumname, Gastlayout und Browserquelle"
        },
        "en": {
          "title": "Do not look for an invented reset in the empty-room state",
          "body": "With no active room, VDO.Ninja shows neither a reset control nor connected guests. If you created a local test room, Close Room ends it through the real room dialog.",
          "expected": "The empty guest view confirms the starting state: no room and no connected guests.",
          "alt": "Do not look for an invented reset in the empty-room state - room name, guest layout, and browser source"
        },
        "es": {
          "title": "No busques un reinicio inventado en el estado sin sala",
          "body": "Sin sala activa, VDO.Ninja no muestra control de reinicio ni invitados conectados. Si creaste una sala local de prueba, Close Room la termina mediante el dialogo real.",
          "expected": "La vista vacia de invitados confirma el estado inicial: sin sala ni invitados conectados.",
          "alt": "No busques un reinicio inventado en el estado sin sala - nombre de sala, diseño de invitados y fuente de navegador"
        },
        "fr": {
          "title": "Ne cherchez pas de reinitialisation inventee dans letat sans salle",
          "body": "Sans salle active, VDO.Ninja naffiche ni controle de reinitialisation ni invite connecte. Si vous avez cree une salle de test locale, Close Room y met fin via le vrai dialogue de salle.",
          "expected": "La vue vide des invites confirme letat initial : aucune salle et aucun invite connecte.",
          "alt": "Ne cherchez pas de reinitialisation inventee dans letat sans salle - nom de salle, disposition des invités et source navigateur"
        }
      },
      "capture": {
        "route": "/plugins/vdoninja/ui.html",
        "assertVisible": "#guestsContainer",
        "focusText": {
          "de": "Keinen erfundenen Reset im leeren Raumzustand suchen",
          "en": "Do not look for an invented reset in the empty-room state",
          "es": "No busques un reinicio inventado en el estado sin sala",
          "fr": "Ne cherchez pas de reinitialisation inventee dans letat sans salle"
        },
        "action": {
          "type": "reset-demo-state",
          "stepId": "ninja-reset"
        },
        "expected": {
          "de": "Die leere Gastansicht bestaetigt den Ausgangszustand ohne Raum und ohne verbundene Gaeste.",
          "en": "The empty guest view confirms the starting state: no room and no connected guests.",
          "es": "La vista vacia de invitados confirma el estado inicial: sin sala ni invitados conectados.",
          "fr": "La vue vide des invites confirme letat initial : aucune salle et aucun invite connecte."
        }
      },
      "workflow": {
        "route": "/plugins/vdoninja/ui.html",
        "instructions": {
          "de": {
            "title": "Keinen erfundenen Reset im leeren Raumzustand suchen",
            "body": "VDO.Ninja zeigt ohne aktiven Raum keine Reset-Schaltflaeche und keine verbundenen Gaeste. Wenn du einen lokalen Testraum erstellt hast, beendet Close Room diesen ueber den echten Raumdialog.",
            "expected": "Die leere Gastansicht bestaetigt den Ausgangszustand ohne Raum und ohne verbundene Gaeste."
          },
          "en": {
            "title": "Do not look for an invented reset in the empty-room state",
            "body": "With no active room, VDO.Ninja shows neither a reset control nor connected guests. If you created a local test room, Close Room ends it through the real room dialog.",
            "expected": "The empty guest view confirms the starting state: no room and no connected guests."
          },
          "es": {
            "title": "No busques un reinicio inventado en el estado sin sala",
            "body": "Sin sala activa, VDO.Ninja no muestra control de reinicio ni invitados conectados. Si creaste una sala local de prueba, Close Room la termina mediante el dialogo real.",
            "expected": "La vista vacia de invitados confirma el estado inicial: sin sala ni invitados conectados."
          },
          "fr": {
            "title": "Ne cherchez pas de reinitialisation inventee dans letat sans salle",
            "body": "Sans salle active, VDO.Ninja naffiche ni controle de reinitialisation ni invite connecte. Si vous avez cree une salle de test locale, Close Room y met fin via le vrai dialogue de salle.",
            "expected": "La vue vide des invites confirme letat initial : aucune salle et aucun invite connecte."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/vdoninja/ui.html"
          },
          {
            "type": "reset-demo-state",
            "selector": "#guestsContainer"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/vdoninja/ui.html"
          },
          {
            "type": "visible",
            "selector": "#guestsContainer"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#guestsContainer",
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
