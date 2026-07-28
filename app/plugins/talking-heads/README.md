# Talking Heads

Talking Heads ist eine lokale Sprecherbuehne fuer TikTok und OBS. Das Overlay zeigt Avatare aus Boba Animals, Kenney Monster Builder und Vector Character Builder, macht den ersten Avatar mit einem Slot-Reveal sichtbar und bewegt den Mund anhand des echten TTS-Audios im Dashboard. Es werden ausschliesslich gebuendelte Asset-Pakete verwendet; Bildgenerierung und externe Avatar-APIs sind nicht beteiligt.

## Ablauf fuer Zuschauer

Wenn ein Zuschauer bereits eine TTS-Stimme hat, aber noch keinen Avatar besitzt, wird beim ersten TTS-Satz einmalig ein dreiteiliger Avatar-Slot gestartet. Zuerst wird eines der drei Pakete gleichverteilt gezogen, danach eine technisch gueltige Kombination innerhalb dieses Pakets. Der mittlere Reel-Gewinn wird sofort lokal gespeichert. Erst nach dem Reveal beginnt die Audioausgabe; ein nicht verbundenes Overlay kann die TTS-Queue dabei nicht dauerhaft blockieren.

Ein konfiguriertes Geschenk loest ausschliesslich fuer Zuschauer mit einem vorhandenen Avatar einen kosmetischen Reroll aus. Der neue Gewinn ist garantiert anders als die bisherige gueltige Auswahl. Es gibt keine Chat-Befehle, keine Raritaeten und keine spielrelevanten Vorteile.

Alte Avatar-Zuweisungen bleiben gueltig. Die historisch benannte lokale Tabelle `talking_heads_avatar_lottery` wird aus Kompatibilitaetsgruenden weiterverwendet; es werden keine Avatar-Bilder an externe Dienste gesendet.

## Einrichtung

1. Oeffne `/plugins/talking-heads/ui.html` und aktiviere Talking Heads.
2. Pruefe im **Character Lab** Boba-, Kenney- oder Vector-Figuren und starte bei Bedarf einen rein kosmetischen Test-Spin.
3. Konfiguriere optional das Geschenk fuer Avatar-Rerolls. Eine stabile Geschenk-ID hat Vorrang vor dem Namen.
4. Nutze fuer lokale OBS-Browserquellen `/overlay/talking-heads`; `/plugins/talking-heads/obs-hud.html` bleibt als kompatible HUD-Adresse verfuegbar.
5. Kopiere fuer TikTok Studio oder Cloudflare die oeffentliche Overlay-Adresse aus **Overlay & Viewer Bar Setup**. Diese oeffentliche Oberflaeche enthaelt nur das Talking-Heads-Overlay, freigegebene Sprite-Assets und die dafuer noetigen Socket-Ereignisse.

## Synchronisation und Betrieb

- Das Dashboard meldet TTS-Start erst beim nativen Audio-Ereignis `playing`, den Abschluss bei `ended` und waehrenddessen Audio-Pegel.
- Talking Heads ordnet alle Renderereignisse ueber eine `playbackId` zu. Verspaetete Ereignisse eines frueheren Satzes koennen dadurch keinen aktuellen Sprecher beenden.
- Der Mund reagiert mit Hysterese auf den Audio-Pegel. Falls kein Analyser verfuegbar ist, bleibt zwischen echtem Start und Ende ein zeitbasierter Fallback aktiv.
- Erweiterte Bereiche der Stream-Director-Oberflaeche enthalten weiterhin manuelle Sprite-Sets, Cache-Verwaltung und Viewer-Bar-Konfiguration.

## Asset-Bibliotheken

- **Boba Animals**, **Kenney Monster Builder** und **Vector Character Builder** sind gleichgewichtete automatische Zuweisungspools.
- Innerhalb des gezogenen Pakets wird jede technisch gueltige Figuren- und Ausdruckskombination gleichverteilt behandelt.
- Jede Auswahl wird lokal als fuenf Sprites materialisiert: Leerlauf, Blinzeln sowie drei Mundformen fuer TTS.
