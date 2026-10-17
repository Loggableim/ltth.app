# Highest Residual: Public Overlay Payloads

Stand: 2026-10-07. Arena State/Config-Projektion ist ergänzt und durch CPU-Fixtures geprüft.

## Geschlossener Befund: Arena State und Config

- Der vorhandene `arena:state`-Event und `/api/game-engine/arena/state`-GET laufen für Public Quick-Tunnel-Requests durch dieselbe reine Renderer-DTO-Allowlist. Arena-Payloads auf `game-engine:config-updated` verwenden dieselbe Config-Allowlist. Local/Admin-GET und lokale Socketpakete behalten das Original.
- Die DTO erhält die aktuelle Overlaydarstellung und Korrelationssemantik: sichtbare Spielerhandles, Namen, Positionen, Größen, Farbe, Waffen-/Ability-Anzeige, Statusbadge, Food-/Pickup-/Mine-/Bombengeometrie, Fever-Status und die tatsächlich dargestellte Rangliste. `targetUsername` wird auf Bool reduziert; `ai` enthält nur `state`.
- Interne Personality-/Ablauf-/Owner-/Ziel-/Wert-/Mechanik-/Adminfelder entfallen. Gift-Mappings sind öffentlich eine leere, consumerkompatible Map. Avatar-URLs entfallen und der originale Orb-Fallback bleibt erhalten.
- CEO-Review ergänzte die drei öffentlich angezeigten Hinweiswerte `likeLifeValue`, `likeGrowthMaxMass` und `giftLifePerCoin`; ihre Bounds entsprechen dem originalen Overlay-Clamp. Eine Regression führt die Originalfunktionen `clampNumber()` und `localizedInfoDefinitions()` mit dem projizierten DTO aus und prüft die tatsächlich erzeugten Like-/Gift-Texte.
- Prüfung: 8 Public-/Access-/Consumer-/Weather-Suites, **274/274 Tests bestanden**. Original-Overlay-Helpers und `drawPlayer` laufen in einem CPU-Canvas-Stub; ein tatsächlicher `ArenaGame.getState()`-Snapshot/`emitState()` wird projiziert. Weather-Projektions- und HTTP-Kontext-Suites blieben grün. Keine Arena-Ticks, keine Server-/Tunnel-/Browser-/OBS-/WebGPU-/Audio-/Liveaktion.
- Projektorhash direkt nach dem Arena-Abschluss und vor der anschließenden Chess-/Connect4-Projektion: `52122C203100CEEF47E21015C863F4F6F5B517FCB160FCA815691F44A0E0D58A`.

## Folgeprüfung abgeschlossen: Game Engine Chess-/Connect4-Config

- Die bestehenden Public-GETs `/api/game-engine/config/chess|connect4` und das ausgehende `game-engine:config-updated` gaben zuvor vollständige normalisierte Configobjekte mit Backendwerten und unbekannten persistierten Feldern weiter. Die beiden Originaloverlay-Consumer lesen nur einen begrenzten Satz an Darstellungs-, Anzeige- und Soundfeldern.
- Zentrale Projektoren beschränken GET und Configupdate jetzt auf dieselbe typisierte Chess-/Connect4-Allowlist. Unverbrauchte `autoplay`, `streamerRole`, `timeControls`, `chatCommand`, Lockout-/Timerwerte und unbekannte Felder bleiben lokal. Nicht konsumierte andere GameTypes dieses Events werden Public unterdrückt.
- Originalproducer/renderer, Registry und lokale Antworten blieben unverändert. Acht fokussierte Suites in zwei Läufen bestanden (einschließlich separater Weather-Kompatibilitätsprüfung); Details und exakte Pfade stehen in `docs/coordination/permissions-events.md`.
- Zentraler Projektorhash nach Arena plus Chess-/Connect4-Aufträgen: `BF61475A476AB106CE4F8D18A94595E3CB27B34A5545875EF28279C7B3B5F446`.
- Keine weitere konkrete Lücke in diesem eng abgegrenzten Game-Engine-Config-Vertrag wurde aus den aktuell geprüften Producer-/Consumerpfaden abgeleitet. Die weiteren Outgoing-Coveragefälle bleiben Inventur, bis eine konkrete Feld-/Consumerabweichung belegt ist.

## Abgeschlossene Vorstufe

- Music Bot: neun bestehende Overlayevents zentral typisiert; der echte `musicbot:request-status`-Handler sendet auf einem Public-Socket nur die erlaubten Projektionen. Seine unallowlisteten Runtime-/Resolver-/Healthantworten werden durch den bestehenden Socketguard verworfen.
- Soundboard: der echte `SoundboardManager.emitSound()`-Emit wird zentral auf `url`, `volume`, `label`, `eventType`, `audioTarget` und bei Gifts maximal 50 Wiederholungen beschränkt. Nicht mehr benötigte Gift-/Zeit-/Producerfelder entfallen. Der ausgelieferte `animation-overlay.html`-Audio-Consumer wurde mit DOM-Audio-Doubles geprüft.
- Matrixzählung aus dem gebündelten Node 22.14: 48 Entrypoints, 36 erlaubte Incoming-Events, 315 erlaubte Outgoing-Events, davon 97 explizit projiziert und 218 ohne zentralen Projektorfall. Der Pass-through-Rest ist nicht pauschal als Leck zu interpretieren.
- Gezielt: 5 Suites / 253 Tests bestanden. Keine Fullsuite, kein Server, Tunnel, Browser, OBS, TikTok oder echter Audio-/Livebetrieb.
