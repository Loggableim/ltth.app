# Verbesserungen der STT-Qualität

Das Aufnahme-Gate gibt kurze Äußerungen jetzt sofort weiter und behält 300 ms
ruhiges Audio vor dem Spracheinsatz bei. Vorhandene `minChunkMs`-Einstellungen
unterdrücken kurze Liveantworten nicht mehr. Die RMS-Prüfung bleibt eine
Rauschheuristik und ist kein trainierter Spracherkenner.

Uploads an Fish und ElevenLabs warten bevorzugt 900 ms Stille, sobald mindestens
600 ms Audio vorliegen; bei anhaltender Sprache gilt eine Obergrenze von 12
Sekunden. Upload-VAD auf Frame-Ebene erhält kurze Sprache, die von Stille umgeben
ist. Uploads laufen weiterhin nacheinander; lange Verzögerungen beim Anbieter
können Pufferung und Latenz erhöhen. Beim Stop wird das verbleibende Audio
gesendet. Audio wird nicht doppelt an Anfragen angehängt.

STT fordert Fish `transcribe-1-pro` jetzt ausdrücklich über den gemeinsamen
ASR-Adapter an. Andere Nutzer des Adapters bleiben bei `transcribe-1`, sofern sie
Pro nicht anfordern. Pro kann anders abgerechnet werden; mit
`asr.fishaudioModel='transcribe-1'` lässt sich das Modell überschreiben.

Der automatische Deepgram-Nova-3-Modus verwendet für den Wechsel zwischen Deutsch
und Englisch weiterhin `language=multi`. Die Einstellungsseite bietet Namen und
Vokabular als kommagetrennte Listen an; diese werden bei Live- und Upload-Anfragen
als `keyterm` übertragen. Der Anbieter wird nicht automatisch gewechselt und
gespeicherte Zugangsdaten werden nicht geändert.

ElevenLabs bleibt bei Scribe v2 im Batchbetrieb. Die Modellbezeichnung ist
korrigiert, feste Sprachhinweise werden berücksichtigt, Audioereignis-Tags sind
für Untertitel deaktiviert und zurückgegebene Sprachcodes `eng`/`deu` werden
korrekt normalisiert. Echtzeit-ElevenLabs und ein trainiertes VAD sind mögliche
spätere Integrationen und gehören nicht zu dieser Änderung.

Verwende für Tests die Projektlaufzeit Node 22 (das SQLite-Addon nutzt ABI 127).
Für die Messung von Wortfehlern, Genauigkeit beim Sprachwechsel, Untertitelverzug
und Anbieterkosten ist weiterhin eine echte zweisprachige Mikrofonaufnahme nötig.
Unit-Tests prüfen Transportoptionen und den Erhalt des Audios, nicht die
Erkennungsqualität für eine bestimmte Stimme.

## Prüfung am 03.10.2026

Alle 23 STT-/Fish-Test-Suites bestanden mit der gebündelten Laufzeit Node 22
(127 Tests). Ein zusätzlicher Regressionstest für Live-Keyterms und eine
Eingabeprüfung für Audiodaten wurden anschließend mit den beiden betroffenen
Suites geprüft (18 Tests bestanden).

Eine synthetische WAV-Datei von 15,31 Sekunden enthielt Deutsch, Englisch und den
gemischten Satz „Ich brauche einen new follower alert und danach geht es weiter“.
Echte mehrsprachige Deepgram-Nova-3-Anfragen im Batch- und Livebetrieb erkannten
mit Keyterms alle gesprochenen Wörter. Großschreibung und Zeichensetzung
unterschieden sich. Der API-Schlüssel lag nur im Prozessspeicher und wurde weder
im Repository noch in der Konfiguration gespeichert. Dies war eine synthetische
API-Integrationsprüfung, kein Mikrofon- oder Akzentbenchmark.
