# Snapshot Status

Diese Seite fasst den aktuellen Stand dieses LTTH-Snapshots zusammen. Sie ist die nutzernahe Kurzfassung der technischen Hinweise aus `docs/SNAPSHOT_STATUS.md` und `infos/llm_start_here.md`.

## Aktueller Stand

- **Laufzeit:** Die gepflegte Anwendung liegt in `app/`.
- **Startpunkt:** `app/server.js`, aufgerufen über `npm start` in `app/`.
- **Dashboard:** `http://localhost:3000/dashboard.html`
- **Wiki:** `http://localhost:3000/wiki.html`
- **Plugins:** 36 Plugin-Manifeste unter `app/plugins/`.
- **Launcher:** Go-Launcher-Quellen liegen in `build-src/`.

## Wichtige Einschränkungen

- Dieser Workspace ist ein lokaler Snapshot und aktuell kein Git-Checkout.
- Die alte Electron-Main-Process-Struktur ist in diesem Snapshot nicht vorhanden.
- Root-`package.json` ist nur ein Komfort-Wrapper für `app/`-Befehle und Launcher-Builds.
- `docs_archive/` ist historische Referenz und keine aktuelle Anleitung.
- Einige ältere Wiki-Texte können noch historische Formulierungen enthalten; der Code und `docs/SNAPSHOT_STATUS.md` sind bei Widersprüchen maßgeblich.

## Installation und Start

```bash
cd app
npm install
npm start
```

Danach im Browser öffnen:

```text
http://localhost:3000/dashboard.html
```

## Empfohlene Checks

Wenn Abhängigkeiten installiert sind:

```bash
cd app
npm test
npm run build:css
npm run lint
```

Der Snapshot hat bekannte Jest-Restfehler. Für gezielte Änderungen sollten mindestens die passenden fokussierten Tests laufen.

## Dokumentationsquellen

| Bereich | Aktueller Ort |
|---------|---------------|
| Nutzer-Wiki | `app/wiki/` |
| Entwickler-Onboarding | `infos/llm_start_here.md` |
| Architektur und Entwicklung | `infos/` |
| Snapshot-Fakten | `docs/SNAPSHOT_STATUS.md` |
| Archivierte Historie | `docs_archive/` |

## Wann diese Seite aktualisieren?

Aktualisiere diese Seite, wenn sich einer dieser Punkte ändert:

- Start- oder Installationsbefehle
- Runtime-Ordner oder Einstiegspunkte
- Plugin-Anzahl oder Plugin-Struktur
- Status der Electron-/Launcher-Struktur
- bekannte Test- oder Snapshot-Einschränkungen

---

*Letzte Aktualisierung: 2026-04-28*  
*Version: 1.3.3*
