# Thermal Printer Plugin

Ein vollständig funktionsfähiges Plugin für "Pup Cids Little TikTool Helper", das TikTok Live Events (Chat, Gifts, Follows) physisch auf einem Thermodrucker (ESC/POS) ausdruckt.

## 🎯 Features

- **Event-Unterstützung**: Druckt Chat-Nachrichten, Geschenke, Follows und Shares
- **Flexible Verbindung**: Unterstützt USB- und Netzwerk-Drucker
- **Intelligente Filterung**: 
  - Minimum Coins-Filter für Geschenke (Papier sparen)
  - Ignoriert Bot-Befehle (Nachrichten die mit '!' beginnen)
  - Separate Aktivierung für jeden Event-Typ
- **Robuste Queue**: Verhindert Blocking des Event Loops durch asynchrone Verarbeitung
- **Auto-Reconnect**: Automatische Wiederverbindung bei Verbindungsverlust
- **ESC/POS Formatierung**:
  - Fettgedruckte Benutzernamen
  - ASCII-Icons für Events
  - Trennlinien zwischen Events
  - Automatischer Papierschnitt (konfigurierbar)
- **Web-UI**: Vollständiges Admin-Panel zur Konfiguration
- **Echtzeit-Status**: Live-Updates über Socket.io

## 📋 Voraussetzungen

### Hardware

- ESC/POS-kompatibler Thermodrucker (z.B. Epson TM-T20, Star TSP100)
- USB-Verbindung ODER Netzwerk-Verbindung (Ethernet/WLAN)

### Software

Die folgenden NPM-Pakete werden automatisch installiert:

- `escpos` (^3.0.0-alpha.6)
- `escpos-usb` (^3.0.0-alpha.4)
- `escpos-network` (^3.0.0-alpha.1)
- `usb` (^2.14.0)

## 🚀 Installation

1. **Automatische Installation**:
   - Das Plugin wird automatisch erkannt, wenn es im `plugins/thermal-printer/` Verzeichnis liegt
   - Die Dependencies werden beim ersten Start installiert

2. **Manuelle Installation** (falls erforderlich):
   ```bash
   cd app
   npm install escpos@3.0.0-alpha.6 escpos-usb@3.0.0-alpha.4 escpos-network@3.0.0-alpha.1 usb@2.14.0
   ```

## ⚙️ Konfiguration

### Über Web-UI

1. Öffne das Admin-Panel: `http://localhost:3000/thermal-printer/ui`
2. Konfiguriere die Drucker-Verbindung:
   - **USB**: Gib Vendor ID und Product ID an (oder leer lassen für Auto-Detect)
   - **Netzwerk**: Gib IP-Adresse und Port an (Standard: 9100)
3. Aktiviere gewünschte Events (Chat, Gifts, Follows, Shares)
4. Passe Filter an (Minimum Coins, Bot-Commands ignorieren)
5. Konfiguriere Formatierung (Auto-Cut, Papierbreite, Encoding)
6. Klicke auf "Save Configuration"

### USB Vendor/Product IDs finden

**Linux/Mac**:
```bash
lsusb
```

**Windows**:
```bash
# PowerShell
Get-PnpDevice -Class USB
```

Beispiel-IDs für gängige Drucker:
- Epson TM-T20: `0x04b8:0x0e15`
- Star TSP100: `0x0519:0x0001`
- Citizen CT-S310: `0x1D90:0x2068`

### Konfiguration per API

```bash
# Config abrufen
curl http://localhost:3000/api/thermal-printer/config

# Config speichern
curl -X POST http://localhost:3000/api/thermal-printer/config \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "printerType": "usb",
    "usbVendorId": "0x04b8",
    "usbProductId": "0x0e15",
    "printChats": true,
    "printGifts": true,
    "printFollows": true,
    "minCoinsToPrint": 1,
    "ignoreBotCommands": true,
    "autoCutPaper": true
  }'
```

## 🧪 Testing

### Test Print über UI

1. Öffne das Admin-Panel
2. Klicke auf "Test Print"
3. Ein Test-Auftrag wird zur Queue hinzugefügt und gedruckt

### Test Print über API

```bash
curl -X POST http://localhost:3000/api/thermal-printer/test
```

## 📊 Status & Monitoring

### Über Web-UI

Das Admin-Panel zeigt Live-Status an:
- Verbindungsstatus (Connected/Disconnected/Reconnecting)
- Warteschlangengröße
- Anzahl gedruckter Jobs
- Anzahl fehlgeschlagener Jobs
- Uptime

### Über API

```bash
curl http://localhost:3000/api/thermal-printer/status
```

Response:
```json
{
  "success": true,
  "enabled": true,
  "status": {
    "isConnected": true,
    "isReconnecting": false,
    "queueSize": 3,
    "reconnectAttempts": 0,
    "stats": {
      "printedJobs": 42,
      "failedJobs": 0,
      "queuedJobs": 45,
      "lastPrintTime": 1700000000000,
      "uptime": 3600000
    }
  }
}
```

## 🏗️ Architektur

### Komponenten

1. **main.js**: Plugin-Einstiegspunkt
   - Registriert TikTok Event Handlers
   - Verwaltet Plugin-Lifecycle
   - Filtert Events basierend auf Konfiguration

2. **printerService.js**: Kern-Logik
   - Drucker-Verbindung (USB/Netzwerk)
   - Print Queue Management
   - Auto-Reconnect Logic
   - ESC/POS Formatierung

3. **config.js**: Konfigurationsmodul
   - Default-Konfiguration
   - Validierung
   - Merge mit User-Config

4. **ui.html**: Admin-Panel
   - Konfigurationsformular
   - Live-Status-Anzeige
   - Test-Print-Funktion

### Event Flow

```
TikTok Event → main.js (Filter) → PrinterService.addToQueue() → Queue → PrinterService.printJob() → Drucker
```

### Queue-System

- **Asynchron**: Verhindert Blocking des Event Loops
- **FIFO**: First In, First Out
- **Größenlimit**: Konfigurierbar (Standard: 100)
- **Delay**: Konfigurierbare Verzögerung zwischen Jobs (Standard: 500ms)

## 🔧 Troubleshooting

### Drucker wird nicht erkannt (USB)

1. Prüfe ob der Drucker angeschlossen und eingeschaltet ist
2. Prüfe USB-Verbindung mit `lsusb` (Linux/Mac) oder Device Manager (Windows)
3. Stelle sicher dass keine anderen Programme auf den Drucker zugreifen
4. Versuche Auto-Detect (lasse Vendor/Product ID leer)

### Netzwerk-Verbindung schlägt fehl

1. Prüfe ob der Drucker im Netzwerk erreichbar ist: `ping <IP>`
2. Prüfe ob Port 9100 offen ist: `telnet <IP> 9100`
3. Überprüfe Firewall-Einstellungen
4. Stelle sicher dass der Drucker im gleichen Netzwerk ist

### Queue läuft über

- Erhöhe `queueMaxSize` in der Konfiguration
- Erhöhe `printDelay` um den Drucker zu entlasten
- Deaktiviere unwichtige Events (z.B. Shares)
- Erhöhe `minCoinsToPrint` für Geschenke

### Reconnect schlägt fehl

1. Prüfe Drucker-Verbindung manuell
2. Erhöhe `reconnectAttempts` in der Konfiguration
3. Erhöhe `reconnectDelay` für mehr Zeit zwischen Versuchen
4. Prüfe Logs für detaillierte Fehlermeldungen

### Encoding-Probleme

- Ändere `encoding` auf `UTF-8` oder `ASCII` wenn Sonderzeichen nicht korrekt dargestellt werden
- Stelle sicher dass der Drucker das gewählte Encoding unterstützt

## 📝 API-Referenz

### GET /api/thermal-printer/config

Ruft aktuelle Konfiguration ab.

**Response**:
```json
{
  "success": true,
  "config": { /* Konfiguration */ }
}
```

### POST /api/thermal-printer/config

Speichert neue Konfiguration.

**Request Body**: Komplette Konfiguration (siehe plugin.json)

**Response**:
```json
{
  "success": true,
  "config": { /* Gespeicherte Konfiguration */ }
}
```

### GET /api/thermal-printer/status

Ruft aktuellen Status ab.

**Response**: Siehe Status & Monitoring

### POST /api/thermal-printer/test

Sendet Test-Print.

**Response**:
```json
{
  "success": true,
  "message": "Test print job queued"
}
```

### GET /thermal-printer/ui

Öffnet Admin-Panel (HTML).

## 🔒 Sicherheit

- **Keine Vulnerabilities**: Alle Dependencies wurden geprüft (GitHub Advisory Database)
- **Input Validation**: Alle User-Inputs werden validiert
- **Error Handling**: Robuste Fehlerbehandlung verhindert Crashes
- **Queue Protection**: Größenlimit verhindert Memory-Überlauf

## 📄 Lizenz

CC BY-NC 4.0

## 👤 Autor

Pup Cid

## 🙏 Acknowledgments

- TikTok Live Connector für Event-Integration
- ESC/POS Bibliothek für Drucker-Support
- Bootstrap für UI-Framework
