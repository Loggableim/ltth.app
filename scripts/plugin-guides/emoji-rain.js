'use strict';

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
module.exports = Object.freeze({
  "id": "emoji-rain",
  "route": "/plugins/emoji-rain/ui.html",
  "topic": {
    "de": "Emoji-Preset, Spawn-Regeln und Geschenkzuordnung",
    "en": "emoji preset, spawn rules, and gift mapping",
    "es": "preajuste de emoji, reglas de aparición y asignación de regalos",
    "fr": "préréglage emoji, règles d’apparition et mappage des cadeaux"
  },
  "test": {
    "de": "ein lokales Regen-Testereignis",
    "en": "a local rain test event",
    "es": "un evento de prueba de lluvia local",
    "fr": "un événement local de test de pluie"
  },
  "expected": {
    "de": "Emojis erscheinen in der Vorschau, ohne TikTok LIVE zu verbinden",
    "en": "emojis appear in preview without connecting TikTok LIVE",
    "es": "los emojis aparecen en la vista previa sin conectar TikTok LIVE",
    "fr": "les emojis apparaissent dans l’aperçu sans connecter TikTok LIVE"
  },
  "requirement": "obs",
  "safety": "obs",
  "mode": "ui",
  "overlay": "/emoji-rain/obs-hud",
  "related": [
    "webgpu-emoji-rain",
    "fireworks"
  ],
  "copy": {
    "de": {
      "title": "Emoji Rain",
      "summary": "Konfiguriere Emojis, die optionale OBS-HUD-Auflösung und einen lokalen Testrain. Die Anleitung verwendet keine TikTok-Verbindung und keine produktive OBS-Szene.",
      "firstResult": "Der Test lässt die gewählten Emojis im lokalen HUD fallen.",
      "requirements": "LTTH Dashboard, ein lokales Testprofil und optional die nicht sendende OBS-Szene „tutorial“.",
      "safety": "Für diesen Ablauf keine TikTok-Verbindung herstellen. Nutze ausschließlich die lokale Testtaste und entferne die Test-Browserquelle danach wieder.",
      "troubleshooting": "Wenn der Test leer bleibt, aktiviere Emoji Rain, speichere die Konfiguration und prüfe die Browserquelle auf die exakte lokale HUD-URL.",
      "related": [
        "webgpu-emoji-rain",
        "fireworks"
      ]
    },
    "en": {
      "title": "Emoji Rain",
      "summary": "Configure the emoji list, optional OBS HUD resolution, and a local test rain. This guide uses no TikTok connection and no production OBS scene.",
      "firstResult": "The test drops the selected emojis in the local HUD.",
      "requirements": "LTTH Dashboard, a local test profile, and optionally the non-live OBS scene named “tutorial”.",
      "safety": "Do not connect TikTok for this workflow. Use only the local test button and remove the temporary browser source afterwards.",
      "troubleshooting": "If the test stays empty, enable Emoji Rain, save the configuration, and check that the browser source uses the exact local HUD URL.",
      "related": [
        "webgpu-emoji-rain",
        "fireworks"
      ]
    },
    "es": {
      "title": "Emoji Rain",
      "summary": "Configura la lista de emojis, la resolución opcional del HUD de OBS y una lluvia de prueba local. Esta guía no usa TikTok ni una escena productiva de OBS.",
      "firstResult": "La prueba deja caer los emojis seleccionados en el HUD local.",
      "requirements": "Panel de LTTH, un perfil de prueba local y, de forma opcional, la escena de OBS no emitida llamada «tutorial».",
      "safety": "No conectes TikTok durante este flujo. Usa solo el botón de prueba local y elimina después la fuente de navegador temporal.",
      "troubleshooting": "Si la prueba queda vacía, activa Emoji Rain, guarda la configuración y comprueba que la fuente use la URL local exacta del HUD.",
      "related": [
        "webgpu-emoji-rain",
        "fireworks"
      ]
    },
    "fr": {
      "title": "Emoji Rain",
      "summary": "Configurez la liste d’emoji, la résolution facultative du HUD OBS et une pluie de test locale. Ce guide n’utilise ni TikTok ni une scène OBS de production.",
      "firstResult": "Le test fait tomber les emoji sélectionnés dans le HUD local.",
      "requirements": "Tableau de bord LTTH, profil de test local et, en option, la scène OBS non diffusée nommée « tutorial ».",
      "safety": "Ne connectez pas TikTok pendant ce flux. Utilisez uniquement le bouton de test local et supprimez ensuite la source navigateur temporaire.",
      "troubleshooting": "Si le test reste vide, activez Emoji Rain, enregistrez la configuration et vérifiez que la source utilise l’URL HUD locale exacte.",
      "related": [
        "webgpu-emoji-rain",
        "fireworks"
      ]
    }
  },
  "steps": [
    {
      "id": "enable-emoji-rain",
      "copy": {
        "de": {
          "title": "Emoji Rain aktivieren",
          "body": "Aktiviere den Schalter „Emoji Rain“. Erst danach verarbeitet das Plugin lokale Testereignisse.",
          "expected": "Der Status neben dem Schalter zeigt „Aktiviert“.",
          "alt": "Emoji Rain aktivieren - Emoji Rain"
        },
        "en": {
          "title": "Enable Emoji Rain",
          "body": "Turn on the “Emoji Rain” switch. The plugin processes local test events only after it is enabled.",
          "expected": "The status beside the switch reads “Enabled”.",
          "alt": "Enable Emoji Rain - Emoji Rain"
        },
        "es": {
          "title": "Activa Emoji Rain",
          "body": "Activa el interruptor «Emoji Rain». El plugin procesa eventos de prueba locales solo después de activarlo.",
          "expected": "El estado junto al interruptor indica «Activado».",
          "alt": "Activa Emoji Rain - Emoji Rain"
        },
        "fr": {
          "title": "Activez Emoji Rain",
          "body": "Activez l’interrupteur « Emoji Rain ». Le plugin ne traite les événements de test locaux qu’après son activation.",
          "expected": "L’état près de l’interrupteur indique « Activé ».",
          "alt": "Activez Emoji Rain - Emoji Rain"
        }
      },
      "capture": {
        "route": "/emoji-rain/ui",
        "assertVisible": ".toggle-switch",
        "focusText": {
          "de": "Emoji Rain aktivieren",
          "en": "Enable Emoji Rain",
          "es": "Activa Emoji Rain",
          "fr": "Activez Emoji Rain"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "enable-emoji-rain",
          "inputSelector": "#enabled-toggle"
        },
        "expected": {
          "de": "Der Status neben dem Schalter zeigt „Aktiviert“.",
          "en": "The status beside the switch reads “Enabled”.",
          "es": "El estado junto al interruptor indica «Activado».",
          "fr": "L’état près de l’interrupteur indique « Activé »."
        }
      },
      "workflow": {
        "route": "/emoji-rain/ui",
        "instructions": {
          "de": {
            "title": "Emoji Rain aktivieren",
            "body": "Aktiviere den Schalter „Emoji Rain“. Erst danach verarbeitet das Plugin lokale Testereignisse.",
            "expected": "Der Status neben dem Schalter zeigt „Aktiviert“."
          },
          "en": {
            "title": "Enable Emoji Rain",
            "body": "Turn on the “Emoji Rain” switch. The plugin processes local test events only after it is enabled.",
            "expected": "The status beside the switch reads “Enabled”."
          },
          "es": {
            "title": "Activa Emoji Rain",
            "body": "Activa el interruptor «Emoji Rain». El plugin procesa eventos de prueba locales solo después de activarlo.",
            "expected": "El estado junto al interruptor indica «Activado»."
          },
          "fr": {
            "title": "Activez Emoji Rain",
            "body": "Activez l’interrupteur « Emoji Rain ». Le plugin ne traite les événements de test locaux qu’après son activation.",
            "expected": "L’état près de l’interrupteur indique « Activé »."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/emoji-rain/ui"
          },
          {
            "type": "set-demo-value",
            "selector": "#enabled-toggle"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/emoji-rain/ui"
          },
          {
            "type": "visible",
            "selector": ".toggle-switch"
          },
          {
            "type": "checked",
            "selector": "#enabled-toggle",
            "expected": true
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": ".toggle-switch",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "choose-emojis",
      "copy": {
        "de": {
          "title": "Emoji-Liste festlegen",
          "body": "Trage zum Beispiel „💧, ✨, 🎉“ in „Emojis (durch Komma getrennt)“ ein. Jeder lokale Test wählt nur aus dieser Liste.",
          "expected": "Das Textfeld enthält die drei durch Komma getrennten Demo-Emojis.",
          "alt": "Emoji-Liste festlegen - Emoji Rain"
        },
        "en": {
          "title": "Choose the emoji list",
          "body": "Enter, for example, “💧, ✨, 🎉” in “Emojis (comma-separated)”. Each local test chooses only from this list.",
          "expected": "The text area contains the three comma-separated demo emojis.",
          "alt": "Choose the emoji list - Emoji Rain"
        },
        "es": {
          "title": "Elige la lista de emojis",
          "body": "Introduce, por ejemplo, «💧, ✨, 🎉» en «Emojis (separados por comas)». Cada prueba local elige solo de esta lista.",
          "expected": "El área de texto contiene los tres emojis de demostración separados por comas.",
          "alt": "Elige la lista de emojis - Emoji Rain"
        },
        "fr": {
          "title": "Choisissez la liste d’emoji",
          "body": "Saisissez par exemple « 💧, ✨, 🎉 » dans « Emoji (séparés par des virgules) ». Chaque test local ne choisit que dans cette liste.",
          "expected": "La zone de texte contient les trois emoji de démonstration séparés par des virgules.",
          "alt": "Choisissez la liste d’emoji - Emoji Rain"
        }
      },
      "capture": {
        "route": "/emoji-rain/ui",
        "assertVisible": "#emoji_set",
        "focusText": {
          "de": "Emoji-Liste festlegen",
          "en": "Choose the emoji list",
          "es": "Elige la lista de emojis",
          "fr": "Choisissez la liste d’emoji"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "choose-emojis"
        },
        "expected": {
          "de": "Das Textfeld enthält die drei durch Komma getrennten Demo-Emojis.",
          "en": "The text area contains the three comma-separated demo emojis.",
          "es": "El área de texto contiene los tres emojis de demostración separados por comas.",
          "fr": "La zone de texte contient les trois emoji de démonstration séparés par des virgules."
        }
      },
      "workflow": {
        "route": "/emoji-rain/ui",
        "instructions": {
          "de": {
            "title": "Emoji-Liste festlegen",
            "body": "Trage zum Beispiel „💧, ✨, 🎉“ in „Emojis (durch Komma getrennt)“ ein. Jeder lokale Test wählt nur aus dieser Liste.",
            "expected": "Das Textfeld enthält die drei durch Komma getrennten Demo-Emojis."
          },
          "en": {
            "title": "Choose the emoji list",
            "body": "Enter, for example, “💧, ✨, 🎉” in “Emojis (comma-separated)”. Each local test chooses only from this list.",
            "expected": "The text area contains the three comma-separated demo emojis."
          },
          "es": {
            "title": "Elige la lista de emojis",
            "body": "Introduce, por ejemplo, «💧, ✨, 🎉» en «Emojis (separados por comas)». Cada prueba local elige solo de esta lista.",
            "expected": "El área de texto contiene los tres emojis de demostración separados por comas."
          },
          "fr": {
            "title": "Choisissez la liste d’emoji",
            "body": "Saisissez par exemple « 💧, ✨, 🎉 » dans « Emoji (séparés par des virgules) ». Chaque test local ne choisit que dans cette liste.",
            "expected": "La zone de texte contient les trois emoji de démonstration séparés par des virgules."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/emoji-rain/ui"
          },
          {
            "type": "set-demo-value",
            "selector": "#emoji_set"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/emoji-rain/ui"
          },
          {
            "type": "visible",
            "selector": "#emoji_set"
          },
          {
            "type": "input-value",
            "selector": "#emoji_set",
            "expected": "💧, ✨, 🎉"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#emoji_set",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "enable-obs-hud",
      "copy": {
        "de": {
          "title": "OBS-HUD für die Testquelle einschalten",
          "body": "Aktiviere „OBS HUD aktivieren“. Das schaltet lediglich die separate lokale HUD-Seite frei; es startet weder OBS noch einen Stream.",
          "expected": "Die Checkbox für das OBS HUD ist aktiviert.",
          "alt": "OBS-HUD für die Testquelle einschalten - Emoji Rain"
        },
        "en": {
          "title": "Enable the OBS HUD for the test source",
          "body": "Enable “OBS HUD”. This only makes the separate local HUD page available; it does not start OBS or a stream.",
          "expected": "The OBS HUD checkbox is selected.",
          "alt": "Enable the OBS HUD for the test source - Emoji Rain"
        },
        "es": {
          "title": "Activa el HUD de OBS para la fuente de prueba",
          "body": "Activa «OBS HUD». Esto solo habilita la página HUD local independiente; no inicia OBS ni una transmisión.",
          "expected": "La casilla del HUD de OBS está marcada.",
          "alt": "Activa el HUD de OBS para la fuente de prueba - Emoji Rain"
        },
        "fr": {
          "title": "Activez le HUD OBS pour la source de test",
          "body": "Activez « HUD OBS ». Cela rend uniquement la page HUD locale disponible ; OBS et le stream ne démarrent pas.",
          "expected": "La case du HUD OBS est cochée.",
          "alt": "Activez le HUD OBS pour la source de test - Emoji Rain"
        }
      },
      "capture": {
        "route": "/emoji-rain/ui",
        "assertVisible": "#obs_hud_enabled",
        "focusText": {
          "de": "OBS-HUD für die Testquelle einschalten",
          "en": "Enable the OBS HUD for the test source",
          "es": "Activa el HUD de OBS para la fuente de prueba",
          "fr": "Activez le HUD OBS pour la source de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "enable-obs-hud"
        },
        "expected": {
          "de": "Die Checkbox für das OBS HUD ist aktiviert.",
          "en": "The OBS HUD checkbox is selected.",
          "es": "La casilla del HUD de OBS está marcada.",
          "fr": "La case du HUD OBS est cochée."
        }
      },
      "workflow": {
        "route": "/emoji-rain/ui",
        "instructions": {
          "de": {
            "title": "OBS-HUD für die Testquelle einschalten",
            "body": "Aktiviere „OBS HUD aktivieren“. Das schaltet lediglich die separate lokale HUD-Seite frei; es startet weder OBS noch einen Stream.",
            "expected": "Die Checkbox für das OBS HUD ist aktiviert."
          },
          "en": {
            "title": "Enable the OBS HUD for the test source",
            "body": "Enable “OBS HUD”. This only makes the separate local HUD page available; it does not start OBS or a stream.",
            "expected": "The OBS HUD checkbox is selected."
          },
          "es": {
            "title": "Activa el HUD de OBS para la fuente de prueba",
            "body": "Activa «OBS HUD». Esto solo habilita la página HUD local independiente; no inicia OBS ni una transmisión.",
            "expected": "La casilla del HUD de OBS está marcada."
          },
          "fr": {
            "title": "Activez le HUD OBS pour la source de test",
            "body": "Activez « HUD OBS ». Cela rend uniquement la page HUD locale disponible ; OBS et le stream ne démarrent pas.",
            "expected": "La case du HUD OBS est cochée."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/emoji-rain/ui"
          },
          {
            "type": "set-demo-value",
            "selector": "#obs_hud_enabled"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/emoji-rain/ui"
          },
          {
            "type": "visible",
            "selector": "#obs_hud_enabled"
          },
          {
            "type": "checked",
            "selector": "#obs_hud_enabled",
            "expected": true
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#obs_hud_enabled",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "select-hud-resolution",
      "copy": {
        "de": {
          "title": "HUD-Auflösung auswählen",
          "body": "Wähle für die Tutorial-Szene „1080p (1920×1080)“ oder die Auflösung deiner späteren Browserquelle. Breite und Höhe müssen in OBS identisch sein.",
          "expected": "Im Auflösungsmenü ist das gewünschte Preset sichtbar.",
          "alt": "HUD-Auflösung auswählen - Emoji Rain"
        },
        "en": {
          "title": "Select the HUD resolution",
          "body": "Choose “1080p (1920×1080)” for the tutorial scene, or the resolution planned for your browser source. Width and height must match in OBS.",
          "expected": "The chosen preset is visible in the resolution menu.",
          "alt": "Select the HUD resolution - Emoji Rain"
        },
        "es": {
          "title": "Selecciona la resolución del HUD",
          "body": "Elige «1080p (1920×1080)» para la escena tutorial o la resolución prevista para la fuente de navegador. El ancho y el alto deben coincidir en OBS.",
          "expected": "El preajuste elegido aparece en el menú de resolución.",
          "alt": "Selecciona la resolución del HUD - Emoji Rain"
        },
        "fr": {
          "title": "Sélectionnez la résolution du HUD",
          "body": "Choisissez « 1080p (1920×1080) » pour la scène tutorial, ou la résolution prévue pour votre source navigateur. La largeur et la hauteur doivent correspondre dans OBS.",
          "expected": "Le préréglage choisi est visible dans le menu de résolution.",
          "alt": "Sélectionnez la résolution du HUD - Emoji Rain"
        }
      },
      "capture": {
        "route": "/emoji-rain/ui",
        "assertVisible": "#obs_hud_preset",
        "focusText": {
          "de": "HUD-Auflösung auswählen",
          "en": "Select the HUD resolution",
          "es": "Selecciona la resolución del HUD",
          "fr": "Sélectionnez la résolution du HUD"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "select-hud-resolution"
        },
        "expected": {
          "de": "Im Auflösungsmenü ist das gewünschte Preset sichtbar.",
          "en": "The chosen preset is visible in the resolution menu.",
          "es": "El preajuste elegido aparece en el menú de resolución.",
          "fr": "Le préréglage choisi est visible dans le menu de résolution."
        }
      },
      "workflow": {
        "route": "/emoji-rain/ui",
        "instructions": {
          "de": {
            "title": "HUD-Auflösung auswählen",
            "body": "Wähle für die Tutorial-Szene „1080p (1920×1080)“ oder die Auflösung deiner späteren Browserquelle. Breite und Höhe müssen in OBS identisch sein.",
            "expected": "Im Auflösungsmenü ist das gewünschte Preset sichtbar."
          },
          "en": {
            "title": "Select the HUD resolution",
            "body": "Choose “1080p (1920×1080)” for the tutorial scene, or the resolution planned for your browser source. Width and height must match in OBS.",
            "expected": "The chosen preset is visible in the resolution menu."
          },
          "es": {
            "title": "Selecciona la resolución del HUD",
            "body": "Elige «1080p (1920×1080)» para la escena tutorial o la resolución prevista para la fuente de navegador. El ancho y el alto deben coincidir en OBS.",
            "expected": "El preajuste elegido aparece en el menú de resolución."
          },
          "fr": {
            "title": "Sélectionnez la résolution du HUD",
            "body": "Choisissez « 1080p (1920×1080) » pour la scène tutorial, ou la résolution prévue pour votre source navigateur. La largeur et la hauteur doivent correspondre dans OBS.",
            "expected": "Le préréglage choisi est visible dans le menu de résolution."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/emoji-rain/ui"
          },
          {
            "type": "set-demo-value",
            "selector": "#obs_hud_preset"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/emoji-rain/ui"
          },
          {
            "type": "visible",
            "selector": "#obs_hud_preset"
          },
          {
            "type": "input-value",
            "selector": "#obs_hud_preset",
            "expected": "non-empty"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#obs_hud_preset",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "save-emoji-rain",
      "copy": {
        "de": {
          "title": "Konfiguration im Testprofil speichern",
          "body": "Klicke auf „Konfiguration speichern“. Die Werte werden nur im isolierten Testprofil abgelegt.",
          "expected": "Nach dem Speichern bleibt der gewählte Emoji- und HUD-Zustand sichtbar.",
          "alt": "Konfiguration im Testprofil speichern - Emoji Rain"
        },
        "en": {
          "title": "Save the configuration in the test profile",
          "body": "Click “Save configuration”. The values are stored only in the isolated test profile.",
          "expected": "After saving, the selected emoji and HUD state remain visible.",
          "alt": "Save the configuration in the test profile - Emoji Rain"
        },
        "es": {
          "title": "Guarda la configuración en el perfil de prueba",
          "body": "Haz clic en «Guardar configuración». Los valores se guardan solo en el perfil de prueba aislado.",
          "expected": "Después de guardar, siguen visibles los emojis y el estado del HUD elegidos.",
          "alt": "Guarda la configuración en el perfil de prueba - Emoji Rain"
        },
        "fr": {
          "title": "Enregistrez la configuration dans le profil de test",
          "body": "Cliquez sur « Enregistrer la configuration ». Les valeurs ne sont stockées que dans le profil de test isolé.",
          "expected": "Après l’enregistrement, les emoji et l’état HUD choisis restent visibles.",
          "alt": "Enregistrez la configuration dans le profil de test - Emoji Rain"
        }
      },
      "capture": {
        "route": "/emoji-rain/ui",
        "assertVisible": "#save-config-btn",
        "focusText": {
          "de": "Konfiguration im Testprofil speichern",
          "en": "Save the configuration in the test profile",
          "es": "Guarda la configuración en el perfil de prueba",
          "fr": "Enregistrez la configuration dans le profil de test"
        },
        "action": {
          "type": "save-demo-config",
          "stepId": "save-emoji-rain",
          "allowClick": true
        },
        "expected": {
          "de": "Nach dem Speichern bleibt der gewählte Emoji- und HUD-Zustand sichtbar.",
          "en": "After saving, the selected emoji and HUD state remain visible.",
          "es": "Después de guardar, siguen visibles los emojis y el estado del HUD elegidos.",
          "fr": "Après l’enregistrement, les emoji et l’état HUD choisis restent visibles."
        }
      },
      "workflow": {
        "route": "/emoji-rain/ui",
        "instructions": {
          "de": {
            "title": "Konfiguration im Testprofil speichern",
            "body": "Klicke auf „Konfiguration speichern“. Die Werte werden nur im isolierten Testprofil abgelegt.",
            "expected": "Nach dem Speichern bleibt der gewählte Emoji- und HUD-Zustand sichtbar."
          },
          "en": {
            "title": "Save the configuration in the test profile",
            "body": "Click “Save configuration”. The values are stored only in the isolated test profile.",
            "expected": "After saving, the selected emoji and HUD state remain visible."
          },
          "es": {
            "title": "Guarda la configuración en el perfil de prueba",
            "body": "Haz clic en «Guardar configuración». Los valores se guardan solo en el perfil de prueba aislado.",
            "expected": "Después de guardar, siguen visibles los emojis y el estado del HUD elegidos."
          },
          "fr": {
            "title": "Enregistrez la configuration dans le profil de test",
            "body": "Cliquez sur « Enregistrer la configuration ». Les valeurs ne sont stockées que dans le profil de test isolé.",
            "expected": "Après l’enregistrement, les emoji et l’état HUD choisis restent visibles."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/emoji-rain/ui"
          },
          {
            "type": "save-demo-config",
            "selector": "#save-config-btn"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/emoji-rain/ui"
          },
          {
            "type": "visible",
            "selector": "#save-config-btn"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#save-config-btn",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "run-local-rain-test",
      "copy": {
        "de": {
          "title": "Lokalen Emoji-Regen testen",
          "body": "Klicke auf „Test Emoji Rain“. Dieser Button erzeugt ein lokales Demo-Ereignis; er sendet nichts an TikTok und löst keine externe Hardware aus.",
          "expected": "Die echte Erfolgsmeldung bestätigt, dass das Ereignis an die lokale HUD-Quelle gesendet wurde.",
          "alt": "Lokalen Emoji-Regen testen - Emoji Rain"
        },
        "en": {
          "title": "Run the local Emoji Rain test",
          "body": "Click “Test Emoji Rain”. This button creates a local demo event; it sends nothing to TikTok and triggers no external hardware.",
          "expected": "The real success notification confirms that the event was sent to the local HUD source.",
          "alt": "Run the local Emoji Rain test - Emoji Rain"
        },
        "es": {
          "title": "Ejecuta la prueba local de Emoji Rain",
          "body": "Haz clic en «Probar Emoji Rain». Este botón crea un evento de demostración local; no envía nada a TikTok ni activa hardware externo.",
          "expected": "La notificación de éxito real confirma que el evento se envió a la fuente HUD local.",
          "alt": "Ejecuta la prueba local de Emoji Rain - Emoji Rain"
        },
        "fr": {
          "title": "Lancez le test local Emoji Rain",
          "body": "Cliquez sur « Tester Emoji Rain ». Ce bouton crée un événement de démonstration local ; il n’envoie rien à TikTok et ne déclenche aucun matériel externe.",
          "expected": "La vraie notification de succès confirme que l’événement a été envoyé à la source HUD locale.",
          "alt": "Lancez le test local Emoji Rain - Emoji Rain"
        }
      },
      "capture": {
        "route": "/emoji-rain/ui",
        "assertVisible": "#notification",
        "focusText": {
          "de": "Lokalen Emoji-Regen testen",
          "en": "Run the local Emoji Rain test",
          "es": "Ejecuta la prueba local de Emoji Rain",
          "fr": "Lancez le test local Emoji Rain"
        },
        "action": {
          "type": "run-local-preview",
          "stepId": "run-local-rain-test",
          "allowClick": true,
          "clickSelector": "#test-emoji-rain-btn",
          "settleMs": 250
        },
        "expected": {
          "de": "Die echte Erfolgsmeldung bestätigt, dass das Ereignis an die lokale HUD-Quelle gesendet wurde.",
          "en": "The real success notification confirms that the event was sent to the local HUD source.",
          "es": "La notificación de éxito real confirma que el evento se envió a la fuente HUD local.",
          "fr": "La vraie notification de succès confirme que l’événement a été envoyé à la source HUD locale."
        }
      },
      "workflow": {
        "route": "/emoji-rain/ui",
        "instructions": {
          "de": {
            "title": "Lokalen Emoji-Regen testen",
            "body": "Klicke auf „Test Emoji Rain“. Dieser Button erzeugt ein lokales Demo-Ereignis; er sendet nichts an TikTok und löst keine externe Hardware aus.",
            "expected": "Die echte Erfolgsmeldung bestätigt, dass das Ereignis an die lokale HUD-Quelle gesendet wurde."
          },
          "en": {
            "title": "Run the local Emoji Rain test",
            "body": "Click “Test Emoji Rain”. This button creates a local demo event; it sends nothing to TikTok and triggers no external hardware.",
            "expected": "The real success notification confirms that the event was sent to the local HUD source."
          },
          "es": {
            "title": "Ejecuta la prueba local de Emoji Rain",
            "body": "Haz clic en «Probar Emoji Rain». Este botón crea un evento de demostración local; no envía nada a TikTok ni activa hardware externo.",
            "expected": "La notificación de éxito real confirma que el evento se envió a la fuente HUD local."
          },
          "fr": {
            "title": "Lancez le test local Emoji Rain",
            "body": "Cliquez sur « Tester Emoji Rain ». Ce bouton crée un événement de démonstration local ; il n’envoie rien à TikTok et ne déclenche aucun matériel externe.",
            "expected": "La vraie notification de succès confirme que l’événement a été envoyé à la source HUD locale."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/emoji-rain/ui"
          },
          {
            "type": "run-local-preview",
            "selector": "#test-emoji-rain-btn"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/emoji-rain/ui"
          },
          {
            "type": "visible",
            "selector": "#notification"
          },
          {
            "type": "text",
            "selector": "#notification",
            "expected": {
              "de": "Test-Emojis wurden erzeugt.",
              "en": "Test emojis spawned.",
              "es": "Se generaron emojis de prueba.",
              "fr": "Les emoji de test ont été générés."
            }
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#notification",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "verify-obs-hud",
      "copy": {
        "de": {
          "title": "HUD in der OBS-Testszene prüfen",
          "body": "Füge in der leeren OBS-Szene „tutorial“ eine temporäre Browser-Quelle mit `<current LTTH URL>/emoji-rain/obs-hud` und der zuvor gewählten Auflösung hinzu. Starte keine Aufnahme und kein Streaming.",
          "expected": "Die Quelle zeigt die echte Emoji-Rain-HUD-Fläche ohne eingeblendete Doku-Labels.",
          "alt": "HUD in der OBS-Testszene prüfen - Emoji Rain"
        },
        "en": {
          "title": "Verify the HUD in the OBS test scene",
          "body": "In the empty OBS scene named “tutorial”, add a temporary browser source using `<current LTTH URL>/emoji-rain/obs-hud` and the resolution chosen above. Do not record or stream.",
          "expected": "The source shows the real Emoji Rain HUD with no documentation labels over it.",
          "alt": "Verify the HUD in the OBS test scene - Emoji Rain"
        },
        "es": {
          "title": "Comprueba el HUD en la escena de prueba de OBS",
          "body": "En la escena vacía de OBS llamada «tutorial», añade una fuente de navegador temporal con `<current LTTH URL>/emoji-rain/obs-hud` y la resolución elegida. No grabes ni transmitas.",
          "expected": "La fuente muestra el HUD real de Emoji Rain sin etiquetas de documentación superpuestas.",
          "alt": "Comprueba el HUD en la escena de prueba de OBS - Emoji Rain"
        },
        "fr": {
          "title": "Vérifiez le HUD dans la scène de test OBS",
          "body": "Dans la scène OBS vide nommée « tutorial », ajoutez une source navigateur temporaire avec `<current LTTH URL>/emoji-rain/obs-hud` et la résolution choisie. N’enregistrez pas et ne diffusez pas.",
          "expected": "La source affiche le vrai HUD Emoji Rain sans étiquette de documentation superposée.",
          "alt": "Vérifiez le HUD dans la scène de test OBS - Emoji Rain"
        }
      },
      "capture": {
        "route": "/emoji-rain/obs-hud",
        "assertVisible": "#canvas-container",
        "focusText": {
          "de": "HUD in der OBS-Testszene prüfen",
          "en": "Verify the HUD in the OBS test scene",
          "es": "Comprueba el HUD en la escena de prueba de OBS",
          "fr": "Vérifiez le HUD dans la scène de test OBS"
        },
        "action": {
          "type": "open-overlay-preview",
          "stepId": "verify-obs-hud"
        },
        "expected": {
          "de": "Die Quelle zeigt die echte Emoji-Rain-HUD-Fläche ohne eingeblendete Doku-Labels.",
          "en": "The source shows the real Emoji Rain HUD with no documentation labels over it.",
          "es": "La fuente muestra el HUD real de Emoji Rain sin etiquetas de documentación superpuestas.",
          "fr": "La source affiche le vrai HUD Emoji Rain sans étiquette de documentation superposée."
        }
      },
      "workflow": {
        "route": "/emoji-rain/obs-hud",
        "instructions": {
          "de": {
            "title": "HUD in der OBS-Testszene prüfen",
            "body": "Füge in der leeren OBS-Szene „tutorial“ eine temporäre Browser-Quelle mit `<current LTTH URL>/emoji-rain/obs-hud` und der zuvor gewählten Auflösung hinzu. Starte keine Aufnahme und kein Streaming.",
            "expected": "Die Quelle zeigt die echte Emoji-Rain-HUD-Fläche ohne eingeblendete Doku-Labels."
          },
          "en": {
            "title": "Verify the HUD in the OBS test scene",
            "body": "In the empty OBS scene named “tutorial”, add a temporary browser source using `<current LTTH URL>/emoji-rain/obs-hud` and the resolution chosen above. Do not record or stream.",
            "expected": "The source shows the real Emoji Rain HUD with no documentation labels over it."
          },
          "es": {
            "title": "Comprueba el HUD en la escena de prueba de OBS",
            "body": "En la escena vacía de OBS llamada «tutorial», añade una fuente de navegador temporal con `<current LTTH URL>/emoji-rain/obs-hud` y la resolución elegida. No grabes ni transmitas.",
            "expected": "La fuente muestra el HUD real de Emoji Rain sin etiquetas de documentación superpuestas."
          },
          "fr": {
            "title": "Vérifiez le HUD dans la scène de test OBS",
            "body": "Dans la scène OBS vide nommée « tutorial », ajoutez une source navigateur temporaire avec `<current LTTH URL>/emoji-rain/obs-hud` et la résolution choisie. N’enregistrez pas et ne diffusez pas.",
            "expected": "La source affiche le vrai HUD Emoji Rain sans étiquette de documentation superposée."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/emoji-rain/obs-hud"
          },
          {
            "type": "open-overlay-preview",
            "selector": "#canvas-container"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/emoji-rain/obs-hud"
          },
          {
            "type": "visible",
            "selector": "#canvas-container"
          },
          {
            "type": "overlay-output",
            "selector": "#canvas-container",
            "expected": true
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#canvas-container",
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
