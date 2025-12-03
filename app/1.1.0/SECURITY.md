# Security Policy

## Reporting Security Vulnerabilities

**Bitte keine Sicherheitslücken öffentlich melden!** / **Please do not report security vulnerabilities publicly!**

### Meldeprozess / Reporting Process

Wenn du eine Sicherheitslücke in PupCid's Little TikTok Helper gefunden hast, melde sie bitte **vertraulich**:

If you have discovered a security vulnerability in PupCid's Little TikTok Helper, please report it **confidentially**:

1. **E-Mail:** [loggableim@gmail.com](mailto:loggableim@gmail.com)
2. **Betreff / Subject:** `[SECURITY] Kurze Beschreibung / Brief description`

### Was du melden solltest / What to Include

- Beschreibung der Schwachstelle / Description of the vulnerability
- Schritte zur Reproduktion / Steps to reproduce
- Betroffene Version(en) / Affected version(s)
- Mögliche Auswirkungen / Potential impact
- Vorgeschlagene Lösung (falls vorhanden) / Suggested fix (if available)

### Antwortzeit / Response Time

- **Bestätigung:** Innerhalb von 48 Stunden / Within 48 hours
- **Erste Bewertung:** Innerhalb von 7 Tagen / Within 7 days
- **Behebung:** Je nach Schweregrad / Depending on severity

---

## Supported Versions

| Version | Unterstützt / Supported |
|---------|-------------------------|
| 1.0.x   | ✅ Ja / Yes             |
| < 1.0   | ❌ Nein / No            |

---

## Umgang mit API Keys / API Key Handling

### Eulerstream API Key

Der Eulerstream API Key ist **erforderlich** für die TikTok LIVE Verbindung:

The Eulerstream API Key is **required** for TikTok LIVE connection:

- **Speicherung:** Nur lokal in `.env`-Datei oder Dashboard-Settings
- **Übertragung:** Nur an Eulerstream API Server (verschlüsselt)
- **Niemals:** In Logs, Git-Commits oder öffentlichen Dateien speichern

**Empfehlungen / Recommendations:**

1. `.env`-Datei ist standardmäßig in `.gitignore`
2. API Key niemals in Code oder Dokumentation einfügen
3. Bei Kompromittierung: Key sofort bei Eulerstream rotieren

### Drittanbieter-API Keys (Optional)

Falls du optionale Dienste nutzt:

If you use optional services:

| Dienst / Service | Umgang / Handling |
|------------------|-------------------|
| Google Cloud TTS | Nur lokal in `.env` oder Settings |
| ElevenLabs TTS   | Nur lokal in `.env` oder Settings |
| Speechify TTS    | Nur lokal in `.env` oder Settings |
| OpenShock        | Nur lokal in Plugin-Config |

---

## Bekannte Sicherheitsaspekte / Known Security Aspects

### Lokale Anwendung

Diese Anwendung läuft **ausschließlich lokal** auf deinem Computer:

This application runs **exclusively locally** on your computer:

- Kein Cloud-Server / No cloud server
- Keine Datensammlung / No data collection
- Externe Verbindungen nur zu:
  - Eulerstream API (TikTok LIVE Verbindung)
  - TTS-APIs (TikTok TTS, Google Cloud TTS, ElevenLabs, Speechify - falls konfiguriert)
  - MyInstants (Soundboard-Sounds)
  - OBS WebSocket (lokal)
  - VRChat OSC (lokal)

### OBS Browser Source

Die OBS-Overlays sind für lokale Nutzung konzipiert:

OBS overlays are designed for local use:

- Standard-Port: 3000 (localhost)
- Keine Authentifizierung für lokale Overlay-Zugriffe
- Empfehlung: Firewall-Regeln für Port 3000 beachten

### CORS & CSP

Ab Version 1.0.3:

- **CORS:** Whitelist-basiert (localhost/127.0.0.1, OBS Browser Sources)
- **CSP:** Content Security Policy mit Nonces implementiert
- **Webhook-Validierung:** DNS-basierte Prüfung gegen SSRF

---

## Sicherheits-Best-Practices / Security Best Practices

1. **Updates:** Immer die neueste Version verwenden
2. **API Keys:** Niemals öffentlich teilen
3. **Firewall:** Lokale Ports nur bei Bedarf freigeben
4. **Backups:** Regelmäßige Backups von `user_configs/` erstellen
5. **Git:** Sensible Dateien in `.gitignore` belassen

---

## Keine öffentlichen Exploits / No Public Exploits

**Bitte veröffentliche keine:**

- Proof-of-Concept-Code für Exploits
- Details zu aktiven Schwachstellen
- Tools zum Ausnutzen von Lücken

**Erst nach Behebung und Release** kann eine koordinierte Veröffentlichung erfolgen.

---

## Kontakt / Contact

- **Sicherheitsmeldungen / Security Reports:** [loggableim@gmail.com](mailto:loggableim@gmail.com)
- **Allgemeiner Support / General Support:** GitHub Issues

---

*Vielen Dank für deinen Beitrag zur Sicherheit dieses Projekts!*

*Thank you for contributing to the security of this project!*
