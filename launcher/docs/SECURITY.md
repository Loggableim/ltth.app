# LTTH Launcher - Sicherheitskonzept

## Übersicht

Dieses Dokument beschreibt die Sicherheitsmaßnahmen des LTTH Launchers.

## Bedrohungsmodell

| Bedrohung | Risiko | Maßnahme |
|-----------|--------|----------|
| Man-in-the-Middle | Hoch | HTTPS-Only |
| Manipulierte Downloads | Hoch | Checksum-Validierung (vorbereitet) |
| ZIP-Slip-Angriff | Mittel | Pfadvalidierung bei Extraktion |
| Code-Injection | Mittel | Eingebettetes UI, keine externe Scripts |
| Privilege Escalation | Niedrig | Keine Admin-Rechte nötig |

## Implementierte Maßnahmen

### 1. Transport-Sicherheit

**HTTPS-Only Verbindungen:**

```go
const VersionURL = "https://raw.githubusercontent.com/..."
const AppZIPBaseURL = "https://ltth.app/app/"
```

Alle externen Verbindungen verwenden TLS/HTTPS. HTTP-Fallback ist nicht implementiert.

### 2. Download-Integrität

**Vorbereitung für SHA256-Checksummen:**

```go
func calculateSHA256(filepath string) (string, error) {
    f, err := os.Open(filepath)
    if err != nil {
        return "", err
    }
    defer f.Close()

    h := sha256.New()
    if _, err := io.Copy(h, f); err != nil {
        return "", err
    }

    return hex.EncodeToString(h.Sum(nil)), nil
}
```

Wenn `version.json` Checksummen enthält, können diese validiert werden.

### 3. ZIP-Slip-Schutz

**Pfadvalidierung bei Extraktion:**

```go
for _, f := range r.File {
    fpath := filepath.Join(dest, f.Name)

    // Security check for zip slip vulnerability
    if !strings.HasPrefix(fpath, filepath.Clean(dest)+string(os.PathSeparator)) {
        return fmt.Errorf("invalid file path: %s", fpath)
    }
    // ...
}
```

Verhindert, dass Dateien außerhalb des Zielverzeichnisses extrahiert werden.

### 4. UI-Sicherheit

**Eingebettetes HTML:**
- Kein Laden von externen HTML/CSS/JS-Dateien
- Keine `eval()` oder dynamische Script-Ausführung
- Content Security Policy durch WebView2

**Keine Node.js-Exposition:**
- Go-Backend ist vollständig isoliert
- JavaScript hat nur Zugriff auf definierte IPC-Funktionen

### 5. Dateisystem-Sicherheit

**Sichere Pfadverarbeitung:**

```go
// Immer filepath.Join für Pfade
versionDir := filepath.Join(config.InstallPath, version)

// Verzeichnis-Erstellung mit korrekten Berechtigungen
os.MkdirAll(dest, 0755)
```

**Keine Ausführung unbekannter Binaries:**
- Launcher führt nur bekannte Dateien aus (`index.html`, `launch.js`)
- Keine automatische Ausführung von heruntergeladenen EXE-Dateien

### 6. Berechtigungen

**Minimale Berechtigungen:**
- Keine Admin-Rechte erforderlich
- Schreibzugriff nur auf Benutzerverzeichnisse
- Keine Registry-Modifikationen

**Benutzerverzeichnisse:**
```
%LOCALAPPDATA%\LTTH\     (Anwendungsdaten)
%APPDATA%\ltth-launcher\ (Launcher-Config)
```

### 7. Logging

**Sichere Logs:**
- Keine sensiblen Daten in Logs
- Logs nur lokal gespeichert
- Keine Telemetrie ohne Zustimmung

```go
log.Printf("Installing version %s...", version)
// Keine Pfade mit Benutzernamen oder sensiblen Daten
```

## Bekannte Einschränkungen

1. **Kein Code-Signing:** Die EXE ist nicht signiert (erfordert Zertifikat)
2. **Keine Update-Signaturprüfung:** Downloads werden nicht kryptographisch signiert
3. **WebView2-Abhängigkeit:** Vertraut auf Edge/WebView2 Sicherheit

## Empfehlungen für Produktiv-Einsatz

1. **Code-Signing:**
   - Signiere die EXE mit einem Code-Signing-Zertifikat
   - Verhindert "Unbekannter Herausgeber"-Warnungen

2. **Update-Signaturen:**
   - Signiere ZIP-Dateien mit GPG oder ähnlichem
   - Prüfe Signaturen im Launcher

3. **Checksum-Datei:**
   - Füge SHA256-Checksummen zu `version.json` hinzu:
   ```json
   {
     "version": "1.1.0",
     "checksum": "sha256:abc123..."
   }
   ```

## Sicherheits-Checkliste

- [x] HTTPS für alle Verbindungen
- [x] ZIP-Slip-Schutz
- [x] Eingebettetes UI (keine externen Ressourcen)
- [x] Minimale Berechtigungen
- [x] Sichere Pfadverarbeitung
- [x] Keine sensiblen Daten in Logs
- [ ] Code-Signing (optional, erfordert Zertifikat)
- [ ] Update-Signaturen (optional)
- [x] SHA256-Unterstützung vorbereitet

## Melden von Sicherheitslücken

Sicherheitsprobleme bitte vertraulich melden:
- GitHub Security Advisory
- Oder direkt an den Maintainer

**Keine Sicherheitslücken in öffentlichen Issues posten!**
