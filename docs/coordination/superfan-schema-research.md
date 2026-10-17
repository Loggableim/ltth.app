# SuperFan: versionsgebundene Recherche, 2026-10-07

Status: Schemafelder offline bestätigt; vollständiger Eulerstream-Rollenvertrag und aktuelle TikTok-Produktsemantik offen. Keine Produktänderung, Schlüssel, Liveverbindung oder Accountaktion.

## Installierter Vertrag

app/package-lock.json pinnt @eulerstream/euler-websocket-sdk 0.0.6. Dieses Paket enthält eigene V1/V2-Decoder, keine V3-Option und keine dedizierten SuperFan-Namen. Seine Abhängigkeiten enthalten kein tiktok-live-proto. Das separat installierte tiktok-live-proto 0.2.3 darf nicht als SDK-Decodergrundlage behandelt werden.

SDK-V2 tiktok-schema-v2.d.ts SHA256: 76A4BC340EFCFF2178A191E4943198EC9C8EE95FF115C34D0D1B2A66E46F9A31.

Belegte Rohfelder:
- WebcastBarrageMessage.content.displayType und commonBarrageContent.displayType (Text ab Zeile 867, Barrage ab 3646).
- User.fansClubInfo.fansLevel/fansScore/isSleeping (1547ff): Fanclub-Daten.
- User.subscribeInfo.isSubscribe/isSubscribedToAnchor, WebcastSubNotifyMessage.subscribeType/oldSubscribeStatus: Abonnenten-Daten, keine belegte pauschale SuperFan-Gleichsetzung.
- Barrage msgType 10/11 bezeichnet Fans-Level-Upgrade/Entrance; 4 Subscribe. Nummer allein ist kein ausreichender SuperFan-Beleg.

## Öffentliche Primärquellen

[Offizieller Euler SDK package.json](https://raw.githubusercontent.com/EulerStream/Euler-WebSocket-SDK/master/package.json): aktueller Branch erklärt Version 1.0.0, exportiert V1/V2/V3 und verwendet tiktok-live-proto-full-types 0.0.1. README-Aussage tiktok-live-proto/V2 ist kein verlässlicher vollständiger Paketvertrag. Keine Upgradeempfehlung daraus ableiten.

[SDK Schemas](https://raw.githubusercontent.com/EulerStream/Euler-WebSocket-SDK/master/src/webcast/schemas.ts) bietet V3; [Client types](https://raw.githubusercontent.com/EulerStream/Euler-WebSocket-SDK/master/src/client/types.ts) setzt schemaVersion weiterhin standardmäßig V2. Versionsnummer ist dort package deklarierte Version, keine hier unabhängig verifizierte npm-Veröffentlichung. Diese Branchlinks sind nicht commitgepinnt.

[TikTokLive originaler Eventclassifier](https://github.com/isaackogan/TikTokLive/blob/master/TikTokLive/client/client.py) und [Eventklassen](https://raw.githubusercontent.com/isaackogan/TikTokLive/master/TikTokLive/events/custom_events.py): WebcastBarrageMessage wird über beide Text-displayType-Felder klassifiziert; zuerst ttlive_superfan_commentnotif_superfanjoined, dann allgemein ttlive_superfan. SuperFanBox ist getrennte Envelope-Klassifikation über ttlive_superfanbox bzw. businessType 19. Dies belegt einen primären Connector-Eventvertrag, keinen Eulerstream-Serververtrag oder dauerhaften Rollenstatus. Nicht jede Box bedeutet, dass der betroffene Benutzer SuperFan ist. Generischer substring-Match muss joined/box auseinanderhalten.

[TikTok Fanclub-Hilfe](https://support.tiktok.com/en/live-gifts-wallet/tiktok-live/live-fan-club) bestätigt Beitritt via Heart Me und missionsbasierte Levels. Sie definiert keinen SuperFan-Rohstatus und keine Gleichheit mit Subscription.

[Offizielle TikTok Creator Academy SuperFan-Seite](https://www.tiktok.com/creator-academy/en/article/live-super-fan) war über Recherche auffindbar, aber Inhalt wegen Cache-/robots-Sperre nicht abrufbar. Drittquellen behaupten Umbenennung von LIVE Subscription; diese Behauptung wird hier ausdrücklich nicht als primär bestätigte Providersemantik übernommen.

## Offene Gaps / kleinster nächster Nachweis

keine echte SDK0.0.6 Eulerstream-Barrage-Fixture; keine belegte Chat/User-Rollenmarkierung oder Ablauf/Revoke-Semantik. Deshalb bestehende Tests nur als lokale Normalize-/Forward-Verträge behandeln; Subscriber true/false beweist weder Gleichheit noch Ungleichheit zu SuperFan.

Zuerst offline SDK0.0.6 encode/decode-Fixtures für beide genannten displayType-Pfade, Join-vs-generic, Fanclub-only, Subscription-only, unrelated Barrage und Box separat. Actor-Zuordnung aus Original-Text.piecesList.userValue.user prüfen, keine beliebige Piece als Rollenempfänger raten. Erst danach, falls nötig und separat freigegeben, kurze begrenzte Providerprobe: nur in-memory Eventtypen/SchemaVersion, erlaubte Displaymarker und bool/numerische Feldpräsenz zählen; keine Raw-Bytes, Namen, IDs, Texte, Bilder, Keys oder vollständigen Payloads speichern/loggen/weiterreichen. Persistierte Fixture ausschließlich synthetisch rekonstruieren. Fallback-Schlüssel bleibt bis Nutzerbestätigung unbenutzt. Ein beobachtetes Join/Upgrade ist keine vollständige dauerhafte Rechtefreigabe ohne Ablaufvertrag.

Nachtrag: TikTokLive Commit fc73b8f6afa0020c722e27925d331d072d7f1396 über git ls-remote und native HTTPS verifiziert. Gepinnter client.py Zeilen 659–677 klassifiziert Barrage, 679–691 Box. Quelle: https://github.com/isaackogan/TikTokLive/blob/fc73b8f6afa0020c722e27925d331d072d7f1396/TikTokLive/client/client.py#L659 . Webcache hatte widersprüchlichen Body; native Abruf bestätigt Original. SDK-V2 User verwendet userId (nicht id). Isolierter Kandidat scripts/obs-pilot/superfan-barrage-schema-probe.js: Node22 SDK encode/decode PASS für beide Markerpfade, Join/generic, negatives normal/fans-level/subscriber/box und fehlende/mehrdeutige Actors. Keine Adapterintegration und keine echte Providerfixture. Actor aus genau einem eindeutigen userId nur Kandidatenregel, mehrdeutige Pieces blockieren konkrete Userzuweisung.

