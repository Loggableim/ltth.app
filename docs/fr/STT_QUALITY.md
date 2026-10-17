# Améliorations de la qualité STT

Le seuil de capture transmet désormais immédiatement les énoncés courts et
conserve 300 ms d’audio calme avant le début de la parole. Les paramètres
`minChunkMs` existants ne bloquent plus les réponses courtes en direct. La mesure
RMS reste une heuristique de bruit, et non un détecteur de parole entraîné.

Les envois à Fish et ElevenLabs privilégient une pause de 900 ms après au moins
600 ms d’audio, avec un maximum de 12 secondes lorsque la parole est continue. Le
VAD par trames lors de l’envoi préserve les brefs passages parlés entourés de
silence. Les envois restent séquentiels ; des retards prolongés du fournisseur
peuvent augmenter la mise en tampon et la latence. L’audio restant est envoyé à
l’arrêt. L’audio n’est pas dupliqué entre les requêtes.

STT demande explicitement Fish `transcribe-1-pro` via l’adaptateur ASR partagé.
Les autres utilisateurs de l’adaptateur conservent `transcribe-1`, sauf demande de
Pro. Pro peut être facturé différemment ; il est possible de le remplacer par
`asr.fishaudioModel='transcribe-1'`.

Le mode automatique de Deepgram Nova-3 utilise toujours `language=multi` pour
l’alternance allemand/anglais. La page des paramètres propose des noms et du
vocabulaire séparés par des virgules ; ils sont transmis comme `keyterm` dans les
requêtes en direct et lors des envois. Aucun fournisseur n’est changé
automatiquement et aucun identifiant enregistré n’est modifié.

ElevenLabs reste sur Scribe v2 en traitement par lots. Le libellé du modèle est
corrigé, les indications de langue fixes sont respectées, les balises d’événement
audio sont désactivées pour les sous-titres et les codes de langue renvoyés
`eng`/`deu` sont normalisés correctement. ElevenLabs en temps réel et un VAD
entraîné sont des intégrations ultérieures, hors du périmètre de ce changement.

Utilisez Node 22, le runtime du projet, pour les tests (l’extension SQLite utilise
l’ABI 127). Un véritable enregistrement bilingue au microphone reste nécessaire
pour mesurer les erreurs de mots, la précision du changement de langue, le délai
des sous-titres et les coûts du fournisseur. Les tests unitaires vérifient le
transport, les options et la conservation audio, pas la qualité de reconnaissance
d’une voix.

## Vérification du 3 octobre 2026

Les 23 suites STT/Fish ont réussi avec le runtime Node 22 fourni (127 tests). Un
test de régression supplémentaire pour les termes clés en direct et une
vérification d’entrée audio ont ensuite été exécutés sur les deux suites
concernées (18 tests réussis).

Un WAV synthétique de 15,31 secondes combinait allemand, anglais et la phrase
mixte « Ich brauche einen new follower alert und danach geht es weiter ». Les
requêtes Deepgram Nova-3 multilingues réelles, en traitement par lots et en direct,
avec termes clés, ont transcrit tous les mots prononcés. La casse et la ponctuation
variaient. La clé API a été fournie uniquement en mémoire du processus et n’a pas
été enregistrée dans le dépôt ni dans la configuration. Il s’agissait d’un test
d’intégration synthétique à l’API, et non d’une évaluation au microphone ou d’un
benchmark des accents.
