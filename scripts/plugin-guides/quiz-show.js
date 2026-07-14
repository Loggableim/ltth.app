'use strict';

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
module.exports = Object.freeze({
  "id": "quiz-show",
  "route": "/plugins/quiz-show/quiz_show.html",
  "topic": {
    "de": "Fragenpool, Antwortzeit und Punktelogik",
    "en": "question pool, answer time, and scoring logic",
    "es": "banco de preguntas, tiempo de respuesta y lógica de puntuación",
    "fr": "banque de questions, temps de réponse et logique de score"
  },
  "test": {
    "de": "eine lokale Quizfrage",
    "en": "a local quiz question",
    "es": "una pregunta de cuestionario local",
    "fr": "une question de quiz locale"
  },
  "expected": {
    "de": "die Spielansicht zeigt die Frage ohne LIVE-Chatinteraktion",
    "en": "the game view shows the question without LIVE chat interaction",
    "es": "la vista de juego muestra la pregunta sin interacción de chat LIVE",
    "fr": "la vue de jeu affiche la question sans interaction de chat LIVE"
  },
  "requirement": "obs",
  "safety": "obs",
  "mode": "ui",
  "overlay": "/plugins/quiz-show/quiz_show_overlay.html",
  "related": [
    "game-engine",
    "interactive-story"
  ],
  "copy": {
    "de": {
      "title": "Pup Cid's Little Quiz Show Plugin",
      "summary": "Pup Cid's Little Quiz Show Plugin richtet Fragenpool, Antwortzeit und Punktelogik ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "die Spielansicht zeigt die Frage ohne LIVE-Chatinteraktion",
      "requirements": "LTTH Dashboard; für die Ausgabe zusätzlich eine OBS-Testszene. Dieser konkrete Pup Cid's Little Quiz Show Plugin-Ablauf behandelt Fragenpool, Antwortzeit und Punktelogik.",
      "safety": "Nutze eine nicht gesendete OBS-Testszene; LIVE-Ausgaben bleiben deaktiviert. Dieser konkrete Pup Cid's Little Quiz Show Plugin-Ablauf behandelt Fragenpool, Antwortzeit und Punktelogik.",
      "troubleshooting": "Wenn Fragenpool, Antwortzeit und Punktelogik nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "game-engine",
        "interactive-story"
      ]
    },
    "en": {
      "title": "Pup Cid's Little Quiz Show Plugin",
      "summary": "Pup Cid's Little Quiz Show Plugin configures question pool, answer time, and scoring logic with a safe local check instead of a LIVE trigger.",
      "firstResult": "the game view shows the question without LIVE chat interaction",
      "requirements": "LTTH Dashboard; use an OBS test scene for output. This Pup Cid's Little Quiz Show Plugin workflow specifically covers question pool, answer time, and scoring logic.",
      "safety": "Use an OBS test scene that is not live; LIVE output remains disabled. This Pup Cid's Little Quiz Show Plugin workflow specifically covers question pool, answer time, and scoring logic.",
      "troubleshooting": "If question pool, answer time, and scoring logic is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "game-engine",
        "interactive-story"
      ]
    },
    "es": {
      "title": "Pup Cid's Little Quiz Show Plugin",
      "summary": "Pup Cid's Little Quiz Show Plugin configura banco de preguntas, tiempo de respuesta y lógica de puntuación mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "la vista de juego muestra la pregunta sin interacción de chat LIVE",
      "requirements": "El panel de LTTH y una escena de prueba de OBS para la salida. Este flujo concreto de Pup Cid's Little Quiz Show Plugin trata banco de preguntas, tiempo de respuesta y lógica de puntuación.",
      "safety": "Usa una escena de prueba de OBS que no esté al aire; la salida LIVE permanece desactivada. Este flujo concreto de Pup Cid's Little Quiz Show Plugin trata banco de preguntas, tiempo de respuesta y lógica de puntuación.",
      "troubleshooting": "Si banco de preguntas, tiempo de respuesta y lógica de puntuación no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "game-engine",
        "interactive-story"
      ]
    },
    "fr": {
      "title": "Pup Cid's Little Quiz Show Plugin",
      "summary": "Pup Cid's Little Quiz Show Plugin configure banque de questions, temps de réponse et logique de score avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "la vue de jeu affiche la question sans interaction de chat LIVE",
      "requirements": "Le tableau de bord LTTH et une scène de test OBS pour la sortie. Ce flux spécifique de Pup Cid's Little Quiz Show Plugin couvre banque de questions, temps de réponse et logique de score.",
      "safety": "Utilisez une scène de test OBS non diffusée ; la sortie LIVE reste désactivée. Ce flux spécifique de Pup Cid's Little Quiz Show Plugin couvre banque de questions, temps de réponse et logique de score.",
      "troubleshooting": "Si banque de questions, temps de réponse et logique de score n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "game-engine",
        "interactive-story"
      ]
    }
  },
  "steps": [
    {
      "id": "quiz-card",
      "copy": {
        "de": {
          "title": "Quiz Card im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Quiz Card von Fragenpool, Antwortzeit und Punktelogik. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "alt": "Quiz Card im Testprofil konfigurieren - Fragenpool, Antwortzeit und Punktelogik"
        },
        "en": {
          "title": "Configure Quiz Card in the test profile",
          "body": "Work in the visible Quiz Card area of question pool, answer time, and scoring logic. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The relevant plugin surface is visibly identified.",
          "alt": "Configure Quiz Card in the test profile - question pool, answer time, and scoring logic"
        },
        "es": {
          "title": "Configura Quiz Card en el perfil de prueba",
          "body": "Trabaja en el area visible Quiz Card de banco de preguntas, tiempo de respuesta y lógica de puntuación. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La superficie correspondiente del plugin queda identificada.",
          "alt": "Configura Quiz Card en el perfil de prueba - banco de preguntas, tiempo de respuesta y lógica de puntuación"
        },
        "fr": {
          "title": "Configurez Quiz Card dans le profil de test",
          "body": "Travaillez dans la zone visible Quiz Card de banque de questions, temps de réponse et logique de score. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La surface de plugin correspondante est clairement visible.",
          "alt": "Configurez Quiz Card dans le profil de test - banque de questions, temps de réponse et logique de score"
        }
      },
      "capture": {
        "route": "/plugins/quiz-show/quiz_show.html",
        "assertVisible": "#dashboard",
        "focusText": {
          "de": "Quiz Card im Testprofil konfigurieren",
          "en": "Configure Quiz Card in the test profile",
          "es": "Configura Quiz Card en el perfil de prueba",
          "fr": "Configurez Quiz Card dans le profil de test"
        },
        "action": {
          "type": "open-plugin-surface",
          "stepId": "quiz-card"
        },
        "expected": {
          "de": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "en": "The relevant plugin surface is visibly identified.",
          "es": "La superficie correspondiente del plugin queda identificada.",
          "fr": "La surface de plugin correspondante est clairement visible."
        }
      },
      "workflow": {
        "route": "/plugins/quiz-show/quiz_show.html",
        "instructions": {
          "de": {
            "title": "Quiz Card im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Quiz Card von Fragenpool, Antwortzeit und Punktelogik. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar."
          },
          "en": {
            "title": "Configure Quiz Card in the test profile",
            "body": "Work in the visible Quiz Card area of question pool, answer time, and scoring logic. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The relevant plugin surface is visibly identified."
          },
          "es": {
            "title": "Configura Quiz Card en el perfil de prueba",
            "body": "Trabaja en el area visible Quiz Card de banco de preguntas, tiempo de respuesta y lógica de puntuación. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La superficie correspondiente del plugin queda identificada."
          },
          "fr": {
            "title": "Configurez Quiz Card dans le profil de test",
            "body": "Travaillez dans la zone visible Quiz Card de banque de questions, temps de réponse et logique de score. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La surface de plugin correspondante est clairement visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/quiz-show/quiz_show.html"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#dashboard"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/quiz-show/quiz_show.html"
          },
          {
            "type": "visible",
            "selector": "#dashboard"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#dashboard",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "question-pool",
      "copy": {
        "de": {
          "title": "Question Pool im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Question Pool von Fragenpool, Antwortzeit und Punktelogik. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Question Pool im Testprofil konfigurieren - Fragenpool, Antwortzeit und Punktelogik"
        },
        "en": {
          "title": "Configure Question Pool in the test profile",
          "body": "Work in the visible Question Pool area of question pool, answer time, and scoring logic. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Question Pool in the test profile - question pool, answer time, and scoring logic"
        },
        "es": {
          "title": "Configura Question Pool en el perfil de prueba",
          "body": "Trabaja en el area visible Question Pool de banco de preguntas, tiempo de respuesta y lógica de puntuación. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Question Pool en el perfil de prueba - banco de preguntas, tiempo de respuesta y lógica de puntuación"
        },
        "fr": {
          "title": "Configurez Question Pool dans le profil de test",
          "body": "Travaillez dans la zone visible Question Pool de banque de questions, temps de réponse et logique de score. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Question Pool dans le profil de test - banque de questions, temps de réponse et logique de score"
        }
      },
      "capture": {
        "route": "/plugins/quiz-show/quiz_show.html",
        "assertVisible": "#questionInput",
        "focusText": {
          "de": "Question Pool im Testprofil konfigurieren",
          "en": "Configure Question Pool in the test profile",
          "es": "Configura Question Pool en el perfil de prueba",
          "fr": "Configurez Question Pool dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "prepare": "open-quiz-questions-tab",
          "stepId": "question-pool"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/quiz-show/quiz_show.html",
        "instructions": {
          "de": {
            "title": "Question Pool im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Question Pool von Fragenpool, Antwortzeit und Punktelogik. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Question Pool in the test profile",
            "body": "Work in the visible Question Pool area of question pool, answer time, and scoring logic. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Question Pool en el perfil de prueba",
            "body": "Trabaja en el area visible Question Pool de banco de preguntas, tiempo de respuesta y lógica de puntuación. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Question Pool dans le profil de test",
            "body": "Travaillez dans la zone visible Question Pool de banque de questions, temps de réponse et logique de score. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/quiz-show/quiz_show.html"
          },
          {
            "type": "prepare",
            "name": "open-quiz-questions-tab"
          },
          {
            "type": "set-demo-value",
            "selector": "#questionInput"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/quiz-show/quiz_show.html"
          },
          {
            "type": "visible",
            "selector": "#questionInput"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#questionInput",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "answer-window",
      "copy": {
        "de": {
          "title": "Answer Window lokal testen",
          "body": "Fuehre Answer Window nur mit eine lokale Quizfrage im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
          "expected": "die Spielansicht zeigt die Frage ohne LIVE-Chatinteraktion",
          "alt": "Answer Window lokal testen - Fragenpool, Antwortzeit und Punktelogik"
        },
        "en": {
          "title": "Test Answer Window locally",
          "body": "Run Answer Window only with a local quiz question in the isolated test profile; no LIVE source, hardware, or external connection is used.",
          "expected": "the game view shows the question without LIVE chat interaction",
          "alt": "Test Answer Window locally - question pool, answer time, and scoring logic"
        },
        "es": {
          "title": "Prueba Answer Window localmente",
          "body": "Ejecuta Answer Window solo con una pregunta de cuestionario local en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
          "expected": "la vista de juego muestra la pregunta sin interacción de chat LIVE",
          "alt": "Prueba Answer Window localmente - banco de preguntas, tiempo de respuesta y lógica de puntuación"
        },
        "fr": {
          "title": "Testez Answer Window localement",
          "body": "Executez Answer Window uniquement avec une question de quiz locale dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
          "expected": "la vue de jeu affiche la question sans interaction de chat LIVE",
          "alt": "Testez Answer Window localement - banque de questions, temps de réponse et logique de score"
        }
      },
      "capture": {
        "route": "/plugins/quiz-show/quiz_show.html",
        "assertVisible": "#timeRemaining",
        "focusText": {
          "de": "Answer Window lokal testen",
          "en": "Test Answer Window locally",
          "es": "Prueba Answer Window localmente",
          "fr": "Testez Answer Window localement"
        },
        "action": {
          "type": "run-local-preview",
          "prepare": "start-local-quiz",
          "cleanupSelector": "#stopQuizBtn",
          "stepId": "answer-window"
        },
        "expected": {
          "de": "die Spielansicht zeigt die Frage ohne LIVE-Chatinteraktion",
          "en": "the game view shows the question without LIVE chat interaction",
          "es": "la vista de juego muestra la pregunta sin interacción de chat LIVE",
          "fr": "la vue de jeu affiche la question sans interaction de chat LIVE"
        }
      },
      "workflow": {
        "route": "/plugins/quiz-show/quiz_show.html",
        "instructions": {
          "de": {
            "title": "Answer Window lokal testen",
            "body": "Fuehre Answer Window nur mit eine lokale Quizfrage im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
            "expected": "die Spielansicht zeigt die Frage ohne LIVE-Chatinteraktion"
          },
          "en": {
            "title": "Test Answer Window locally",
            "body": "Run Answer Window only with a local quiz question in the isolated test profile; no LIVE source, hardware, or external connection is used.",
            "expected": "the game view shows the question without LIVE chat interaction"
          },
          "es": {
            "title": "Prueba Answer Window localmente",
            "body": "Ejecuta Answer Window solo con una pregunta de cuestionario local en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
            "expected": "la vista de juego muestra la pregunta sin interacción de chat LIVE"
          },
          "fr": {
            "title": "Testez Answer Window localement",
            "body": "Executez Answer Window uniquement avec une question de quiz locale dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
            "expected": "la vue de jeu affiche la question sans interaction de chat LIVE"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/quiz-show/quiz_show.html"
          },
          {
            "type": "prepare",
            "name": "start-local-quiz"
          },
          {
            "type": "run-local-preview",
            "selector": "#timeRemaining"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/quiz-show/quiz_show.html"
          },
          {
            "type": "visible",
            "selector": "#timeRemaining"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#timeRemaining",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "sample-question",
      "copy": {
        "de": {
          "title": "Sample Question lokal testen",
          "body": "Fuehre Sample Question nur mit eine lokale Quizfrage im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
          "expected": "die Spielansicht zeigt die Frage ohne LIVE-Chatinteraktion",
          "alt": "Sample Question lokal testen - Fragenpool, Antwortzeit und Punktelogik"
        },
        "en": {
          "title": "Test Sample Question locally",
          "body": "Run Sample Question only with a local quiz question in the isolated test profile; no LIVE source, hardware, or external connection is used.",
          "expected": "the game view shows the question without LIVE chat interaction",
          "alt": "Test Sample Question locally - question pool, answer time, and scoring logic"
        },
        "es": {
          "title": "Prueba Sample Question localmente",
          "body": "Ejecuta Sample Question solo con una pregunta de cuestionario local en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
          "expected": "la vista de juego muestra la pregunta sin interacción de chat LIVE",
          "alt": "Prueba Sample Question localmente - banco de preguntas, tiempo de respuesta y lógica de puntuación"
        },
        "fr": {
          "title": "Testez Sample Question localement",
          "body": "Executez Sample Question uniquement avec une question de quiz locale dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
          "expected": "la vue de jeu affiche la question sans interaction de chat LIVE",
          "alt": "Testez Sample Question localement - banque de questions, temps de réponse et logique de score"
        }
      },
      "capture": {
        "route": "/plugins/quiz-show/quiz_show.html",
        "assertVisible": "#startQuizBtn",
        "focusText": {
          "de": "Sample Question lokal testen",
          "en": "Test Sample Question locally",
          "es": "Prueba Sample Question localmente",
          "fr": "Testez Sample Question localement"
        },
        "action": {
          "type": "run-local-preview",
          "prepare": "start-local-quiz",
          "cleanupSelector": "#stopQuizBtn",
          "stepId": "sample-question"
        },
        "expected": {
          "de": "die Spielansicht zeigt die Frage ohne LIVE-Chatinteraktion",
          "en": "the game view shows the question without LIVE chat interaction",
          "es": "la vista de juego muestra la pregunta sin interacción de chat LIVE",
          "fr": "la vue de jeu affiche la question sans interaction de chat LIVE"
        }
      },
      "workflow": {
        "route": "/plugins/quiz-show/quiz_show.html",
        "instructions": {
          "de": {
            "title": "Sample Question lokal testen",
            "body": "Fuehre Sample Question nur mit eine lokale Quizfrage im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
            "expected": "die Spielansicht zeigt die Frage ohne LIVE-Chatinteraktion"
          },
          "en": {
            "title": "Test Sample Question locally",
            "body": "Run Sample Question only with a local quiz question in the isolated test profile; no LIVE source, hardware, or external connection is used.",
            "expected": "the game view shows the question without LIVE chat interaction"
          },
          "es": {
            "title": "Prueba Sample Question localmente",
            "body": "Ejecuta Sample Question solo con una pregunta de cuestionario local en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
            "expected": "la vista de juego muestra la pregunta sin interacción de chat LIVE"
          },
          "fr": {
            "title": "Testez Sample Question localement",
            "body": "Executez Sample Question uniquement avec une question de quiz locale dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
            "expected": "la vue de jeu affiche la question sans interaction de chat LIVE"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/quiz-show/quiz_show.html"
          },
          {
            "type": "prepare",
            "name": "start-local-quiz"
          },
          {
            "type": "run-local-preview",
            "selector": "#startQuizBtn"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/quiz-show/quiz_show.html"
          },
          {
            "type": "visible",
            "selector": "#startQuizBtn"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#startQuizBtn",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "quiz-overlay",
      "copy": {
        "de": {
          "title": "Quiz Overlay im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Quiz Overlay von Fragenpool, Antwortzeit und Punktelogik. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "alt": "Quiz Overlay im Testprofil konfigurieren - Fragenpool, Antwortzeit und Punktelogik"
        },
        "en": {
          "title": "Configure Quiz Overlay in the test profile",
          "body": "Work in the visible Quiz Overlay area of question pool, answer time, and scoring logic. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The relevant plugin surface is visibly identified.",
          "alt": "Configure Quiz Overlay in the test profile - question pool, answer time, and scoring logic"
        },
        "es": {
          "title": "Configura Quiz Overlay en el perfil de prueba",
          "body": "Trabaja en el area visible Quiz Overlay de banco de preguntas, tiempo de respuesta y lógica de puntuación. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La superficie correspondiente del plugin queda identificada.",
          "alt": "Configura Quiz Overlay en el perfil de prueba - banco de preguntas, tiempo de respuesta y lógica de puntuación"
        },
        "fr": {
          "title": "Configurez Quiz Overlay dans le profil de test",
          "body": "Travaillez dans la zone visible Quiz Overlay de banque de questions, temps de réponse et logique de score. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La surface de plugin correspondante est clairement visible.",
          "alt": "Configurez Quiz Overlay dans le profil de test - banque de questions, temps de réponse et logique de score"
        }
      },
      "capture": {
        "route": "/plugins/quiz-show/quiz_show.html",
        "assertVisible": "#openOverlayBtn",
        "focusText": {
          "de": "Quiz Overlay im Testprofil konfigurieren",
          "en": "Configure Quiz Overlay in the test profile",
          "es": "Configura Quiz Overlay en el perfil de prueba",
          "fr": "Configurez Quiz Overlay dans le profil de test"
        },
        "action": {
          "type": "open-plugin-surface",
          "prepare": "open-quiz-overlay-config-tab",
          "stepId": "quiz-overlay"
        },
        "expected": {
          "de": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "en": "The relevant plugin surface is visibly identified.",
          "es": "La superficie correspondiente del plugin queda identificada.",
          "fr": "La surface de plugin correspondante est clairement visible."
        }
      },
      "workflow": {
        "route": "/plugins/quiz-show/quiz_show.html",
        "instructions": {
          "de": {
            "title": "Quiz Overlay im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Quiz Overlay von Fragenpool, Antwortzeit und Punktelogik. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar."
          },
          "en": {
            "title": "Configure Quiz Overlay in the test profile",
            "body": "Work in the visible Quiz Overlay area of question pool, answer time, and scoring logic. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The relevant plugin surface is visibly identified."
          },
          "es": {
            "title": "Configura Quiz Overlay en el perfil de prueba",
            "body": "Trabaja en el area visible Quiz Overlay de banco de preguntas, tiempo de respuesta y lógica de puntuación. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La superficie correspondiente del plugin queda identificada."
          },
          "fr": {
            "title": "Configurez Quiz Overlay dans le profil de test",
            "body": "Travaillez dans la zone visible Quiz Overlay de banque de questions, temps de réponse et logique de score. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La surface de plugin correspondante est clairement visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/quiz-show/quiz_show.html"
          },
          {
            "type": "prepare",
            "name": "open-quiz-overlay-config-tab"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#openOverlayBtn"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/quiz-show/quiz_show.html"
          },
          {
            "type": "visible",
            "selector": "#openOverlayBtn"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#openOverlayBtn",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "quiz-reset",
      "copy": {
        "de": {
          "title": "Quiz Reset sicher zuruecksetzen",
          "body": "Entferne nur die Demo-Werte fuer Quiz Reset, bevor du Fragenpool, Antwortzeit und Punktelogik produktiv vorbereitest.",
          "expected": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "alt": "Quiz Reset sicher zuruecksetzen - Fragenpool, Antwortzeit und Punktelogik"
        },
        "en": {
          "title": "Reset Quiz Reset safely",
          "body": "Remove only the demo values for Quiz Reset before preparing question pool, answer time, and scoring logic for production.",
          "expected": "The test profile remains free of production impact.",
          "alt": "Reset Quiz Reset safely - question pool, answer time, and scoring logic"
        },
        "es": {
          "title": "Restablece Quiz Reset con seguridad",
          "body": "Elimina solo los valores demo de Quiz Reset antes de preparar banco de preguntas, tiempo de respuesta y lógica de puntuación para produccion.",
          "expected": "El perfil de prueba permanece sin impacto de producción.",
          "alt": "Restablece Quiz Reset con seguridad - banco de preguntas, tiempo de respuesta y lógica de puntuación"
        },
        "fr": {
          "title": "Reinitialisez Quiz Reset en securite",
          "body": "Supprimez uniquement les valeurs demo de Quiz Reset avant de preparer banque de questions, temps de réponse et logique de score pour la production.",
          "expected": "Le profil de test reste sans impact de production.",
          "alt": "Reinitialisez Quiz Reset en securite - banque de questions, temps de réponse et logique de score"
        }
      },
      "capture": {
        "route": "/plugins/quiz-show/quiz_show.html",
        "assertVisible": "#stopQuizBtn",
        "focusText": {
          "de": "Quiz Reset sicher zuruecksetzen",
          "en": "Reset Quiz Reset safely",
          "es": "Restablece Quiz Reset con seguridad",
          "fr": "Reinitialisez Quiz Reset en securite"
        },
        "action": {
          "type": "reset-demo-state",
          "prepare": "start-local-quiz",
          "cleanupSelector": "#stopQuizBtn",
          "stepId": "quiz-reset"
        },
        "expected": {
          "de": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "en": "The test profile remains free of production impact.",
          "es": "El perfil de prueba permanece sin impacto de producción.",
          "fr": "Le profil de test reste sans impact de production."
        }
      },
      "workflow": {
        "route": "/plugins/quiz-show/quiz_show.html",
        "instructions": {
          "de": {
            "title": "Quiz Reset sicher zuruecksetzen",
            "body": "Entferne nur die Demo-Werte fuer Quiz Reset, bevor du Fragenpool, Antwortzeit und Punktelogik produktiv vorbereitest.",
            "expected": "Das Testprofil bleibt ohne produktive Auswirkung."
          },
          "en": {
            "title": "Reset Quiz Reset safely",
            "body": "Remove only the demo values for Quiz Reset before preparing question pool, answer time, and scoring logic for production.",
            "expected": "The test profile remains free of production impact."
          },
          "es": {
            "title": "Restablece Quiz Reset con seguridad",
            "body": "Elimina solo los valores demo de Quiz Reset antes de preparar banco de preguntas, tiempo de respuesta y lógica de puntuación para produccion.",
            "expected": "El perfil de prueba permanece sin impacto de producción."
          },
          "fr": {
            "title": "Reinitialisez Quiz Reset en securite",
            "body": "Supprimez uniquement les valeurs demo de Quiz Reset avant de preparer banque de questions, temps de réponse et logique de score pour la production.",
            "expected": "Le profil de test reste sans impact de production."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/quiz-show/quiz_show.html"
          },
          {
            "type": "prepare",
            "name": "start-local-quiz"
          },
          {
            "type": "reset-demo-state",
            "selector": "#stopQuizBtn"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/quiz-show/quiz_show.html"
          },
          {
            "type": "visible",
            "selector": "#stopQuizBtn"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#stopQuizBtn",
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
