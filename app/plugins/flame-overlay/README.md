# Visual FX Frame Plugin

WebGL-basiertes Overlay fuer TikTok Livestreams und OBS Browser Sources. Das Plugin rendert transparente GPU-Effekte als Rahmen oder Kante und kann direkt auf TikTok LIVE Events reagieren.
Der aktive Renderer wird ueber `renderer/index.html`, `renderer/effects-engine.js` und `renderer/post-processor.js` geladen; die alte standalone Datei `renderer/flame.js` ist kein Teil des aktiven Plugins mehr.

## Aktueller Stand

- 4 Effektmodi: Flames, Particles, Energy, Lightning
- GPU-Rendering ueber WebGL mit High-Performance Context-Optionen
- Kawase Bloom, Additive Blending, Smoke Layer, Multi-Layer Flames und Film Grain
- Live-Preview im Settings UI
- Trigger-Regeln fuer Gifts, Coin-Bereiche, Follows, Likes, Shares, Subscribes und Chat Commands
- Geschenkekatalog im Plugin UI mit Suchfeld und Regel-Erzeugung
- Stop/Clear Endpoint fuer haengende aktive Effekte
- OBS-optimierter transparenter Hintergrund

## Overlay-URLs

Settings:

```text
http://localhost:3000/flame-overlay/ui
```

OBS Browser Source:

```text
http://localhost:3000/flame-overlay/overlay
```

## Trigger-System

Die Regeln liegen unter `Triggers` im Settings UI. Bedingungen unterstuetzen:

```text
any
diamondCount >= 100
coins >= 99 && coins <= 499
giftId == "5655"
giftName == "Rose"
```

Gift Events werden vor der Auswertung normalisiert. Das Plugin stellt stabile Felder bereit:

- `giftId`
- `giftName`
- `diamondCount`
- `repeatCount`
- `coins`
- `giftCoins`
- `giftValue`

Wenn keine Gift-Regel passt, faellt das Plugin auf die internen Gift-Tiers zurueck.

## Geschenkekatalog

Der Geschenkekatalog wird aus der zentralen Datenbank gelesen. Im UI kann er aktualisiert werden; der Button ruft zuerst die globale Gift-Catalog-Update-Route auf und laedt danach den lokalen Katalog neu.

Klick auf ein Geschenk erzeugt eine Gift-Regel. Ein Suchwert wie `99-499` erzeugt mit `Coin-Regel` eine Bereichsregel:

```text
coins >= 99 && coins <= 499
```

## Stuck-Effect-Schutz

Jeder Trigger bekommt eine normalisierte Laufzeit. Ungueltige oder fehlende Werte fallen auf 5000 ms zurueck und werden auf 30000 ms begrenzt.

Absicherung existiert doppelt:

- Backend: aktiver Trigger-Zaehler wird per Timer freigegeben und beim Destroy bereinigt.
- Renderer: eigene Timer, Ablaufpruefung im Render-Loop und `flame-overlay:clear-triggers`.

Der Button `Stop Effects` ruft auf:

```http
POST /api/flame-overlay/clear-triggers
```

## API

```http
GET  /flame-overlay/ui
GET  /flame-overlay/overlay
GET  /api/flame-overlay/config
POST /api/flame-overlay/config
GET  /api/flame-overlay/status
GET  /api/flame-overlay/gift-catalog
POST /api/flame-overlay/trigger
POST /api/flame-overlay/clear-triggers
GET  /api/flame-overlay/triggers
POST /api/flame-overlay/triggers
GET  /api/flame-overlay/trigger-presets
POST /api/flame-overlay/trigger-preset/:name
```

## OBS Setup

1. In OBS eine Browser Source anlegen.
2. URL setzen: `http://localhost:3000/flame-overlay/overlay`
3. Groesse passend zum Stream setzen, z. B. `720x1280` oder `1080x1920`.
4. `Shutdown source when not visible` deaktivieren.
5. FPS auf 60 setzen.

## Dateien

```text
flame-overlay/
  plugin.json
  main.js
  README.md
  ui/settings.html
  renderer/index.html
  renderer/effects-engine.js
  renderer/post-processor.js
  textures/nzw.png
  textures/firetex.png
```
