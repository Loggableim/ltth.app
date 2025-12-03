# OpenShock Admin Webhooks API - Vollständige Dokumentation

**Recherchiert am:** 2025-12-02  
**API Version:** 1.0  
**Dokumentation erstellt von:** GitHub Copilot AI Agent

---

## 📋 Inhaltsverzeichnis

1. [Übersicht](#-übersicht)
2. [Authentifizierung](#-authentifizierung)
3. [API-Endpunkte](#-api-endpunkte)
   - [DELETE /1/admin/webhooks/{id}](#delete-1adminwebhooksid)
   - [GET /1/admin/webhooks](#get-1adminwebhooks)
   - [POST /1/admin/webhooks](#post-1adminwebhooks)
4. [Datenmodelle](#-datenmodelle)
5. [Fehlerbehandlung](#-fehlerbehandlung)
6. [Webhook-Implementierung](#-webhook-implementierung)
7. [Beispiel-Code](#-beispiel-code)
8. [Quellcode-Referenzen](#-quellcode-referenzen)

---

## 📖 Übersicht

Die OpenShock Admin Webhooks API ermöglicht die Verwaltung von Discord-Webhooks für administrative Benachrichtigungen. Die API ist Teil des OpenShock-Backends und unterstützt derzeit **ausschließlich Discord-Webhooks**.

### Basis-URL
```
https://api.openshock.app/1/admin
```

### Unterstützte Webhook-Typen
- ✅ Discord Webhooks (`https://discord.com/api/webhooks/{id}/{token}`)
- ❌ Andere Webhook-Typen werden nicht unterstützt

---

## 🔐 Authentifizierung

### Erforderliche Berechtigungen
- **Authentifizierungsschema:** `UserSessionCookie`
- **Rolle:** `Admin`

### Header-Anforderungen
```http
Cookie: openShockSession=<session-token>
User-Agent: <meaningful-user-agent>
```

> ⚠️ **Wichtig:** Die OpenShock API lehnt Anfragen mit leerem `User-Agent`-Header ab.

### Session-Generierung
Sessions werden über das OpenShock-Webportal erstellt. Administratoren müssen sich anmelden und eine Session erstellen, die dann als Cookie bei API-Anfragen verwendet wird.

---

## 📡 API-Endpunkte

### DELETE /1/admin/webhooks/{id}

Entfernt einen bestehenden Webhook aus der Datenbank.

#### Endpunkt-Details

| Eigenschaft | Wert |
|------------|------|
| **Methode** | `DELETE` |
| **Pfad** | `/1/admin/webhooks/{id}` |
| **Authentifizierung** | Session Cookie + Admin-Rolle |
| **Content-Type** | nicht erforderlich |

#### Pfad-Parameter

| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| `id` | `Guid` (UUID) | Die eindeutige Kennung des zu löschenden Webhooks |

#### Beispiel-Anfrage

```http
DELETE /1/admin/webhooks/550e8400-e29b-41d4-a716-446655440000 HTTP/1.1
Host: api.openshock.app
Cookie: openShockSession=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
User-Agent: LTTH-Integration/1.0
```

#### Antwort-Codes

| Status | Beschreibung |
|--------|-------------|
| `200 OK` | Webhook erfolgreich gelöscht |
| `401 Unauthorized` | Nicht authentifiziert oder keine Admin-Berechtigung |
| `404 Not Found` | Webhook mit angegebener ID nicht gefunden |

#### Erfolgreiche Antwort (200 OK)
```json
// Kein Body - nur HTTP 200 Status
```

#### Fehlerantwort (404 Not Found)
```json
{
  "type": "Webhook.NotFound",
  "title": "Webhook not found",
  "status": 404,
  "requestId": "0HN5K2OKJG1C4:00000001"
}
```

#### Backend-Implementierung (C#)

```csharp
[HttpDelete("webhooks/{id}")]
[ProducesResponseType(StatusCodes.Status200OK)]
[ProducesResponseType(StatusCodes.Status404NotFound)]
public async Task<IActionResult> RemoveWebhook(
    [FromRoute] Guid id, 
    [FromServices] IWebhookService webhookService)
{
    bool removed = await webhookService.RemoveWebhookAsync(id);
    return removed ? Ok() : Problem(AdminError.WebhookNotFound);
}
```

---

### GET /1/admin/webhooks

Listet alle konfigurierten Webhooks auf.

#### Endpunkt-Details

| Eigenschaft | Wert |
|------------|------|
| **Methode** | `GET` |
| **Pfad** | `/1/admin/webhooks` |
| **Authentifizierung** | Session Cookie + Admin-Rolle |

#### Beispiel-Anfrage

```http
GET /1/admin/webhooks HTTP/1.1
Host: api.openshock.app
Cookie: openShockSession=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
User-Agent: LTTH-Integration/1.0
```

#### Erfolgreiche Antwort (200 OK)

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Admin Notifications",
    "url": "https://discord.com/api/webhooks/1234567890/abcdefg123456...",
    "createdAt": "2025-12-01T10:30:00Z"
  },
  {
    "id": "660f9511-f39c-52e5-b827-557766551111",
    "name": "Security Alerts",
    "url": "https://discord.com/api/webhooks/0987654321/zyxwvu987654...",
    "createdAt": "2025-11-15T08:00:00Z"
  }
]
```

#### Backend-Implementierung (C#)

```csharp
[HttpGet("webhooks")]
public async Task<WebhookDto[]> ListWebhooks(
    [FromServices] IWebhookService webhookService)
{
    return await webhookService.GetWebhooksAsync();
}
```

---

### POST /1/admin/webhooks

Erstellt einen neuen Webhook.

#### Endpunkt-Details

| Eigenschaft | Wert |
|------------|------|
| **Methode** | `POST` |
| **Pfad** | `/1/admin/webhooks` |
| **Authentifizierung** | Session Cookie + Admin-Rolle |
| **Content-Type** | `application/json` |

#### Request-Body (JSON)

```json
{
  "name": "My Webhook",
  "url": "https://discord.com/api/webhooks/1234567890/abcdefg123456..."
}
```

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `name` | `string` | Anzeigename des Webhooks |
| `url` | `Uri` | Discord-Webhook-URL |

#### Beispiel-Anfrage

```http
POST /1/admin/webhooks HTTP/1.1
Host: api.openshock.app
Cookie: openShockSession=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
User-Agent: LTTH-Integration/1.0
Content-Type: application/json

{
  "name": "TikTok Live Alerts",
  "url": "https://discord.com/api/webhooks/1234567890/abcdefg123456hijklmnop"
}
```

#### Antwort-Codes

| Status | Beschreibung |
|--------|-------------|
| `200 OK` | Webhook erfolgreich erstellt |
| `400 Bad Request` | Ungültige Webhook-URL (nur Discord-Webhooks werden unterstützt) |
| `401 Unauthorized` | Nicht authentifiziert oder keine Admin-Berechtigung |

#### Erfolgreiche Antwort (200 OK)

```json
{
  "id": "770g0622-g40d-63f6-c938-668877662222",
  "name": "TikTok Live Alerts",
  "url": "https://discord.com/api/webhooks/1234567890/abcdefg123456hijklmnop",
  "createdAt": "2025-12-02T14:00:00Z"
}
```

#### Fehlerantwort (400 Bad Request)

```json
{
  "type": "Webhook.Unsupported",
  "title": "Only discord webhooks work as of now! Make sure to use discord.com as the host, and not canary or ptb.",
  "status": 400,
  "requestId": "0HN5K2OKJG1C4:00000002"
}
```

#### Backend-Implementierung (C#)

```csharp
[HttpPost("webhooks")]
[Consumes(MediaTypeNames.Application.Json)]
[ProducesResponseType(StatusCodes.Status200OK)]
[ProducesResponseType(StatusCodes.Status400BadRequest)]
public async Task<IActionResult> AddWebhook(
    [FromBody] AddWebhookDto body, 
    [FromServices] IWebhookService webhookService)
{
    var result = await webhookService.AddWebhookAsync(body.Name, body.Url);
    return result.Match<IActionResult>(
        success => Ok(success.Value),
        unsupported => Problem(AdminError.WebhookOnlyDiscord)
    );
}
```

---

## 📦 Datenmodelle

### WebhookDto

Das Response-Modell für Webhook-Daten.

```typescript
interface WebhookDto {
  /** UUID v7 des Webhooks */
  id: string;
  
  /** Anzeigename des Webhooks */
  name: string;
  
  /** Vollständige Discord-Webhook-URL */
  url: string;
  
  /** Erstellungszeitpunkt (ISO 8601) */
  createdAt: string;
}
```

### AddWebhookDto

Das Request-Modell für das Erstellen eines Webhooks.

```typescript
interface AddWebhookDto {
  /** Anzeigename des Webhooks */
  name: string;
  
  /** Discord-Webhook-URL */
  url: string;
}
```

### DiscordWebhook (Datenbank-Entity)

Das interne Datenbankmodell.

```csharp
public sealed class DiscordWebhook
{
    public required Guid Id { get; set; }
    public required string Name { get; set; }
    public required long WebhookId { get; set; }
    public required string WebhookToken { get; set; }
    public DateTime CreatedAt { get; set; }
}
```

---

## ❌ Fehlerbehandlung

### OpenShockProblem-Format

Alle Fehler folgen dem RFC 7807 (Problem Details) Standard.

```typescript
interface OpenShockProblem {
  /** Fehler-Typ-Identifier */
  type: string;
  
  /** Kurze Fehlerbeschreibung */
  title: string;
  
  /** HTTP-Statuscode */
  status: number;
  
  /** Optionale detaillierte Beschreibung */
  detail?: string;
  
  /** Request-Tracking-ID */
  requestId?: string;
}
```

### Admin-spezifische Fehler

| Fehler-Typ | HTTP-Status | Beschreibung |
|------------|-------------|--------------|
| `Webhook.NotFound` | 404 | Webhook mit angegebener ID nicht gefunden |
| `Webhook.Unsupported` | 400 | Nur Discord-Webhooks werden unterstützt |
| `User.NotFound` | 404 | Benutzer nicht gefunden |
| `User.Privileged.DeleteDenied` | 403 | Privilegierte Benutzer können nicht gelöscht werden |

---

## ⚙️ Webhook-Implementierung

### URL-Validierung

Die API validiert Webhook-URLs nach folgendem Schema:

```csharp
if (webhookUrl is not
    {
        Scheme: "https",
        DnsSafeHost: "discord.com",
        Segments: ["/", "api/", "webhooks/", {} webhookIdStr, {} webhookToken]
    } ||
    !long.TryParse(webhookIdStr[..^1], out var webhookId)
   )
{
    return new UnsupportedWebhookUrl();
}
```

**Unterstützte URL-Formate:**
- ✅ `https://discord.com/api/webhooks/{webhookId}/{webhookToken}`

**Nicht unterstützte URL-Formate:**
- ❌ `https://canary.discord.com/...` (Discord Canary)
- ❌ `https://ptb.discord.com/...` (Discord PTB)
- ❌ `http://...` (nicht HTTPS)
- ❌ Andere Webhook-Dienste

### Webhook-Ausführung (sendWebhook)

Die API kann auch Webhooks an Discord senden (intern verwendet):

```csharp
public async Task<OneOf<Success, NotFound, Error, WebhookTimeout>> 
    SendWebhookAsync(string webhookName, string title, string content, Color color)
```

**Discord-Embed-Format:**
```json
{
  "embeds": [
    {
      "title": "Webhook Title",
      "description": "Content here",
      "color": 16711680
    }
  ]
}
```

---

## 💻 Beispiel-Code

### JavaScript/TypeScript Client

```typescript
class OpenShockAdminClient {
  private baseUrl = 'https://api.openshock.app/1/admin';
  private sessionCookie: string;

  constructor(sessionCookie: string) {
    this.sessionCookie = sessionCookie;
  }

  // GET alle Webhooks
  async listWebhooks(): Promise<WebhookDto[]> {
    const response = await fetch(`${this.baseUrl}/webhooks`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'User-Agent': 'LTTH-Integration/1.0',
        'Cookie': `openShockSession=${this.sessionCookie}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to list webhooks: ${response.status}`);
    }
    
    return response.json();
  }

  // POST neuer Webhook
  async createWebhook(name: string, url: string): Promise<WebhookDto> {
    const response = await fetch(`${this.baseUrl}/webhooks`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'User-Agent': 'LTTH-Integration/1.0',
        'Cookie': `openShockSession=${this.sessionCookie}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, url })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create webhook: ${error.title}`);
    }
    
    return response.json();
  }

  // DELETE Webhook
  async deleteWebhook(id: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/webhooks/${id}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'User-Agent': 'LTTH-Integration/1.0',
        'Cookie': `openShockSession=${this.sessionCookie}`
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to delete webhook: ${error.title}`);
    }
  }
}

// Verwendungsbeispiel
// ⚠️ SICHERHEITSHINWEIS: Session-Tokens sicher speichern!
// - Niemals hardcoden oder in Quellcode committen
// - Umgebungsvariablen oder sichere Key-Stores verwenden
// - Sessions haben ein Ablaufdatum und sollten regelmäßig erneuert werden
async function example() {
  // Session-Token aus sicherer Quelle laden (z.B. Environment Variable)
  const sessionToken = process.env.OPENSHOCK_SESSION_TOKEN;
  if (!sessionToken) {
    throw new Error('OPENSHOCK_SESSION_TOKEN environment variable not set');
  }
  
  const client = new OpenShockAdminClient(sessionToken);
  
  // Alle Webhooks auflisten
  const webhooks = await client.listWebhooks();
  console.log('Webhooks:', webhooks);
  
  // Neuen Webhook erstellen
  const newWebhook = await client.createWebhook(
    'My Discord Alerts',
    'https://discord.com/api/webhooks/123456789/abcdefg'
  );
  console.log('Created:', newWebhook);
  
  // Webhook löschen
  await client.deleteWebhook(newWebhook.id);
  console.log('Deleted webhook');
}
```

### cURL-Beispiele

```bash
# Alle Webhooks auflisten
curl -X GET "https://api.openshock.app/1/admin/webhooks" \
  -H "Cookie: openShockSession=your-session-token" \
  -H "User-Agent: LTTH-CLI/1.0"

# Neuen Webhook erstellen
curl -X POST "https://api.openshock.app/1/admin/webhooks" \
  -H "Cookie: openShockSession=your-session-token" \
  -H "User-Agent: LTTH-CLI/1.0" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Webhook","url":"https://discord.com/api/webhooks/123/abc"}'

# Webhook löschen
curl -X DELETE "https://api.openshock.app/1/admin/webhooks/550e8400-e29b-41d4-a716-446655440000" \
  -H "Cookie: openShockSession=your-session-token" \
  -H "User-Agent: LTTH-CLI/1.0"
```

---

## 📚 Quellcode-Referenzen

Die Implementierung basiert auf dem offiziellen OpenShock API Repository:

| Datei | Beschreibung |
|-------|-------------|
| `API/Controller/Admin/WebhookRemove.cs` | DELETE-Endpoint-Implementierung |
| `API/Controller/Admin/WebhookList.cs` | GET-Endpoint-Implementierung |
| `API/Controller/Admin/WebhookAdd.cs` | POST-Endpoint-Implementierung |
| `API/Controller/Admin/_ApiController.cs` | AdminController-Basisklasse mit Auth |
| `Common/Services/Webhook/IWebhookService.cs` | Webhook-Service-Interface |
| `Common/Services/Webhook/WebhookService.cs` | Webhook-Service-Implementierung |
| `Common/Models/WebhookDto.cs` | Response-DTO |
| `API/Controller/Admin/DTOs/AddWebhookDto.cs` | Request-DTO |
| `Common/OpenShockDb/DiscordWebhook.cs` | Datenbank-Entity |
| `Common/Errors/AdminError.cs` | Admin-Fehlerdefinitionen |
| `Common/Problems/OpenShockProblem.cs` | Problem-Details-Basis |

**GitHub Repository:** https://github.com/OpenShock/API

---

## 🔗 Weiterführende Dokumentation

- **OpenShock API Docs:** https://api.openshock.app/scalar/viewer
- **OpenShock Wiki:** https://wiki.openshock.org/dev/
- **OpenShock GitHub:** https://github.com/OpenShock
- **RFC 7807 (Problem Details):** https://datatracker.ietf.org/doc/html/rfc7807

---

## 📝 Zusammenfassung

### DELETE /1/admin/webhooks/{id} - Komplettreferenz

```
┌─────────────────────────────────────────────────────────────────┐
│  DELETE /1/admin/webhooks/{id}                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  BESCHREIBUNG:                                                  │
│  Löscht einen Discord-Webhook anhand seiner UUID                │
│                                                                 │
│  AUTHENTIFIZIERUNG:                                             │
│  - Session Cookie (openShockSession)                            │
│  - Admin-Rolle erforderlich                                     │
│                                                                 │
│  PARAMETER:                                                     │
│  - id (Pfad): UUID/Guid des zu löschenden Webhooks              │
│                                                                 │
│  ANTWORTEN:                                                     │
│  - 200 OK: Webhook erfolgreich gelöscht (kein Body)             │
│  - 401 Unauthorized: Nicht authentifiziert                      │
│  - 404 Not Found: Webhook nicht gefunden                        │
│                                                                 │
│  BEISPIEL:                                                      │
│  DELETE /1/admin/webhooks/550e8400-e29b-41d4-a716-446655440000  │
│                                                                 │
│  FEHLERFORMAT (OpenShockProblem):                               │
│  {                                                              │
│    "type": "Webhook.NotFound",                                  │
│    "title": "Webhook not found",                                │
│    "status": 404                                                │
│  }                                                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

**Erstellt:** 2025-12-02  
**Letzte Aktualisierung:** 2025-12-02  
**Status:** Vollständig recherchiert und dokumentiert
