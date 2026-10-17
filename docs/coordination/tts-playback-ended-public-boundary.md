# `tts:playback:ended`: Public-Socketgrenze

Stand: 2026-10-07. Ausschließlich der exakte Eventname, keine Änderung an TTS-/Talking-Heads-Produktlogik.

## Herkunft und Consumer

- TTS bildet Legacy-Lifecycle-Payloads mit `playbackId` und Wiedergabe-Metadaten und ruft `this.api.emit('tts:playback:ended', ...)` auf (`app/plugins/tts/main.js:831-835`). `PluginAPI.emit()` veröffentlicht in den internen PluginLoader-Eventbus und außerdem über Socket.IO (`app/modules/plugin-loader.js:437-448`). Der Ausgangseventname stand zuvor in der Public-Outgoing-Allowlist.
- Interne Consumers wie Music Bot, Talking Heads und AnimazingPal lauschen auf dem PluginLoader-Eventbus; sie benötigen weiterhin die volle interne Payload. Diese interne Kommunikation wird durch den Public-Socketprojektor nicht verändert.
- Interactive Story verwendet nach der parallelen Lifecycle-Änderung den internen `this.api.on('tts:playback:ended', ...)`-Handler (`app/plugins/interactive-story/main.js:2324-2330`) und hat keinen `api.registerSocket('tts:playback:ended', ...)`-Consumer mehr. Der aktuelle Story-Korrelationstest unterscheidet internen Bus-Listener vom fehlenden Sockethandler.
- Der Story-Renderer enthält noch einen Alt-Relayblock, der das ausgehende Event empfangen und via `socket.emit('tts:playback:ended', data)` zurücksenden kann (`overlay.html:1834-1841`). Eine repo-weite Suche fand keinen registrierten Socket.IO-Handler für dieses eingehende Event in Story oder TTS. Somit war der eingehende Allowlist-Eintrag nach Entfernung des alten Consumers funktionslos; Public-Eingaben werden jetzt vor einem etwaigen Listener verweigert. Story-Renderer/Pluginquellen wurden nicht geändert.

## Änderung

- `projectPublicOverlayPayload('tts:playback:ended', ...)` liefert `null`. Direkte Public-Socket-Emits und Public-Room-Broadcasts werden damit verworfen; lokale Socket.IO-Empfänger bekommen weiterhin das unveränderte Originalevent. Die Projektion lässt keine `playbackId`, `userId`, Anzeigenamen oder zusätzliche Wiedergabe-Metadaten öffentlich durch.
- `tts:playback:ended` wurde nur aus der Public-Incoming-Allowlist entfernt. Kein anderer TTS- oder Talking-Heads-Eventname, Plugin-Handler, Renderer, Audio-/Playbackcode oder Rollenvertrag wurde geändert.

## Prüfung und Grenze

- `tts-playback-ended-public-boundary.test.js`: exakt `null`-Projektion, unveränderte lokale Broadcastpayload, kein Public-Room-Broadcast, direkte Public-Emit-Sperre ohne Identifier in Logs und Public-Incoming-Deny.
- Zusammen mit Registry, gemeinsamer Projektion, Socketadapter, Access, TTS-Renderer-Lifecycle und Interactive-Story-TTS-Korrelation: **7 Suites / 233 Tests PASS**, Node `v22.14.0` gebündelt. Keine TTS-/Talking-Heads-Produktdatei geändert.
- Keine echte App/Socket.IO-Verbindung, kein Server, Tunnel, OBS oder LIVE-Test; kein Public-Funktionsnachweis.
