# Getting Started / Erste Schritte / Primeros Pasos / Démarrage

[← Home](Home) | [→ Installation & Setup](Installation-&-Setup)

---

## Language Selection / Sprachauswahl / Selección de idioma / Sélection de la langue

- [🇬🇧 English](#english)
- [🇩🇪 Deutsch](#deutsch)
- [🇪🇸 Español](#español)
- [🇫🇷 Français](#français)

---

## 🇬🇧 English

### 📑 Table of Contents

1. [Overview](#overview-english)
2. [Quick Start (5 Minutes)](#quick-start-5-minutes-english)
3. [First Stream](#first-stream-english)
4. [Enable Plugins](#enable-plugins-english)
5. [OBS Setup](#obs-setup-english)
6. [Common First Steps](#common-first-steps-english)
7. [Next Steps](#next-steps-english)

---

### 🎯 Overview {#overview-english}

This guide will help you get started with **Little TikTool Helper v1.2.1** in **5-10 minutes**.

**What you will achieve:**

✅ Tool installed and running  
✅ Connected to TikTok LIVE  
✅ First overlays set up in OBS  
✅ Basic plugins activated  
✅ Ready for your first stream

---

### ⚡ Quick Start (5 Minutes) {#quick-start-5-minutes-english}

#### Step 1: Installation (2 minutes)

**Prerequisites:**
- Node.js 18.0.0+ installed ([Download](https://nodejs.org/))
- Git installed (optional, [Download](https://git-scm.com/))

**Installation:**

**Option A - Desktop App (Recommended):**
```bash
# Clone repository
git clone https://github.com/Loggableim/pupcidslittletiktoolhelper_desktop.git
cd pupcidslittletiktoolhelper_desktop

# Install dependencies
npm install

# Start desktop app
npm run start:electron
```

**Option B - Standalone Server:**
```bash
# Go to app folder
cd app

# Install dependencies
npm install

# Start server
npm start
```

#### Step 2: Open Dashboard (30 seconds)

**Desktop App:** Opens automatically

**Standalone:** Open browser to `http://localhost:3000`

#### Step 3: Connect to TikTok (1 minute)

1. **Get Eulerstream API Key:**
   - Go to [Eulerstream](https://eulerstream.com/)
   - Register (free)
   - Copy your API key

2. **In Dashboard:**
   - Click **"Connect to TikTok LIVE"**
   - Enter your **TikTok username**
   - Enter your **Eulerstream API key**
   - Click **"Connect"**

3. **Wait for connection:**
   - Status should change to **"Connected" (green)**
   - Live events appear in event log

#### Step 4: Test (30 seconds)

**Send test gift:**
1. Open TikTok on your phone
2. Go to your LIVE stream
3. Send a test gift (e.g. Rose)
4. Dashboard should display the gift

**✅ Done!** You are now connected to TikTok LIVE.

---

### 🎬 First Stream {#first-stream-english}

#### 1. Basic Settings

**Enable TTS:**
1. Dashboard → **TTS** (Sidebar)
2. Enable **"Auto-TTS for Chat"**
3. Select voice (e.g. "en_us_001 - Female")
4. Click **Test**

**Enable Alerts:**
1. Dashboard → **Alerts** (Sidebar)
2. Enable **Gift Alert**
3. Select sound (optional)
4. Click **Test Alert**

**Set up Goals:**
1. Dashboard → **Goals** (Sidebar)
2. Configure **Goal 1** (e.g. "1000 Likes")
3. Type: **Likes**
4. Target: **1000**
5. Click **Save**

#### 2. Add OBS Overlays

**Main Overlay:**
```
Browser Source → URL: http://localhost:3000/overlay
Width: 1920
Height: 1080
```

**Goal Overlay:**
```
Browser Source → URL: http://localhost:3000/goals/goal1
Width: 600
Height: 100
```

**Leaderboard Overlay:**
```
Browser Source → URL: http://localhost:3000/leaderboard/overlay
Width: 400
Height: 600
```

#### 3. Start Streaming

1. **Start OBS** - Overlays should be visible
2. **Start TikTok LIVE** - On your phone
3. **Connect LTTH** - Dashboard → Connect
4. **Start streaming!** 🎉

---

### 🔌 Enable Plugins {#enable-plugins-english}

#### Recommended Plugins for Beginners

**1. TTS v2.0** (Auto-enabled)
- Text-to-Speech for chat messages
- 75+ free voices

**2. Live Goals** (Auto-enabled)
- Progress bars for likes, coins, followers
- OBS overlays available

**3. Leaderboard** (Recommended)
```
Dashboard → Plugins → Leaderboard → Enable
```
- Shows top gifters
- Real-time updates

**4. LastEvent Spotlight** (Recommended)
```
Dashboard → Plugins → LastEvent Spotlight → Enable
```
- Shows last follower, gifter, etc.
- Overlay for each event type

**5. Soundboard** (Optional)
```
Dashboard → Plugins → Soundboard → Enable
```
- Gift-specific sounds
- MyInstants integration

#### Enable a Plugin

1. Dashboard → **Plugins** (Sidebar)
2. Find plugin in list
3. Click **Enable** button
4. Configure plugin (if UI available)

See **[Plugin List](Plugin-Liste.md#english)** for all 31 available plugins.

---

### 🎨 OBS Setup {#obs-setup-english}

#### Install OBS Studio

1. Download: [obsproject.com](https://obsproject.com/)
2. Version **29.0 or higher** recommended
3. Perform standard installation

#### Enable OBS WebSocket (for Multi-Cam plugin)

1. OBS → **Tools** → **WebSocket Server Settings**
2. Enable **"Enable WebSocket server"**
3. Port: **4455** (default)
4. Set password (optional)
5. Click **OK**

**In LTTH:**
```
Dashboard → Plugins → Multi-Cam Switcher → Configure
OBS WebSocket:
  Host: localhost
  Port: 4455
  Password: (your password)
→ Connect
```

---

### 💡 Common First Steps {#common-first-steps-english}

#### Have Chat Messages Read Aloud

**Automatically:**
```
Dashboard → TTS → Enable Auto-TTS for Chat
```

**Blacklist (don't read certain words):**
```
Dashboard → TTS → Blacklist
→ Add words (e.g. "spam", "bad word")
```

#### Connect Gifts with Sounds

```
Dashboard → Plugins → Soundboard → Enable
→ Configure
→ Gift Mappings
→ Rose → Select sound
→ Save
```

#### Switch Camera via Chat

```
Dashboard → Plugins → Multi-Cam Switcher → Enable
→ Configure
→ Connect OBS
→ Enable chat commands

In chat: !cam 1 (or !cam 2, !cam 3, etc.)
```

---

### 🎓 Next Steps {#next-steps-english}

#### Explore Advanced Features

**1. Flow System (Event Automation):**
```
Dashboard → Flows → Create new flow
Example:
  Trigger: Gift = "Rose"
  Actions:
    1. TTS: "Thanks {username} for the Rose!"
    2. OBS: Switch scene to "Cam2"
    3. OSC: Wave gesture in VRChat
```

**2. Enable WebGPU Plugins:**
- **WebGPU Emoji Rain** - GPU-accelerated emoji effect
- **Vulkan Rockets (WebGPU)** - Firework effects

**3. Viewer XP System:**
```
Dashboard → Plugins → Viewer XP System → Enable
→ Configure XP rewards
→ Add leaderboard overlay
```

#### Read Documentation

- **[Plugin List](Plugin-Liste.md#english)** - All 31 plugins in detail
- **[Configuration](Konfiguration.md#english)** - Advanced settings
- **[FAQ & Troubleshooting](FAQ-&-Troubleshooting.md#english)** - Solve common problems

---

### 🎉 Good Luck with Your Stream!

You are now ready for your first professional TikTok LIVE stream with Little TikTool Helper!

**Tips for Getting Started:**
- Test everything **before** your first live stream
- Use **Test Alerts** and **Test TTS**
- Start with few plugins and expand gradually
- Read **[FAQ & Troubleshooting](FAQ-&-Troubleshooting.md#english)** if you have problems

---

[← Home](Home#english) | [→ Installation & Setup](Installation-&-Setup#english)

---

*Last updated: 2025-12-11*  
*Version: 1.2.1*

---

## 🇩🇪 Deutsch

### 📑 Inhaltsverzeichnis

1. [Übersicht](#übersicht-deutsch)
2. [Schnellstart (5 Minuten)](#schnellstart-5-minuten-deutsch)
3. [Erster Stream](#erster-stream-deutsch)
4. [Plugins aktivieren](#plugins-aktivieren-deutsch)
5. [OBS einrichten](#obs-einrichten-deutsch)
6. [Häufige erste Schritte](#häufige-erste-schritte-deutsch)
7. [Nächste Schritte](#nächste-schritte-deutsch)

---

### 🎯 Übersicht {#übersicht-deutsch}

Dieser Guide führt dich in **5-10 Minuten** durch die wichtigsten Schritte, um mit **Little TikTool Helper v1.2.1** zu starten.

**Was du erreichen wirst:**

✅ Tool installiert und gestartet  
✅ Mit TikTok LIVE verbunden  
✅ Erste Overlays in OBS eingerichtet  
✅ Grundlegende Plugins aktiviert  
✅ Bereit für deinen ersten Stream

---

### ⚡ Schnellstart (5 Minuten) {#schnellstart-5-minuten-deutsch}

#### Schritt 1: Installation (2 Minuten)

**Voraussetzungen:**
- Node.js 18.0.0+ installiert ([Download](https://nodejs.org/))
- Git installiert (optional, [Download](https://git-scm.com/))

**Installation:**

**Option A - Desktop App (Empfohlen):**
```bash
# Repository klonen
git clone https://github.com/Loggableim/pupcidslittletiktoolhelper_desktop.git
cd pupcidslittletiktoolhelper_desktop

# Dependencies installieren
npm install

# Desktop-App starten
npm run start:electron
```

**Option B - Standalone Server:**
```bash
# In den app-Ordner wechseln
cd app

# Dependencies installieren
npm install

# Server starten
npm start
```

#### Schritt 2: Dashboard öffnen (30 Sekunden)

**Desktop App:** Öffnet sich automatisch

**Standalone:** Browser öffnen auf `http://localhost:3000`

#### Schritt 3: TikTok verbinden (1 Minute)

1. **Eulerstream API-Key** holen:
   - Gehe zu [Eulerstream](https://eulerstream.com/)
   - Registriere dich (kostenlos)
   - Kopiere deinen API-Key

2. **Im Dashboard:**
   - Klicke auf **"Connect to TikTok LIVE"**
   - Gib deinen **TikTok-Username** ein
   - Gib deinen **Eulerstream API-Key** ein
   - Klicke **"Connect"**

3. **Warte auf Verbindung:**
   - Status sollte auf **"Connected" (grün)** wechseln
   - Live-Events erscheinen im Event-Log

#### Schritt 4: Test (30 Sekunden)

**Test-Gift senden:**
1. Öffne TikTok auf deinem Handy
2. Gehe zu deinem LIVE-Stream
3. Sende ein Test-Gift (z.B. Rose)
4. Dashboard sollte das Gift anzeigen

**✅ Fertig!** Du bist jetzt mit TikTok LIVE verbunden.

---

### 🎬 Erster Stream {#erster-stream-deutsch}

#### 1. Grundlegende Einstellungen

**TTS aktivieren:**
1. Dashboard → **TTS** (Sidebar)
2. **"Auto-TTS für Chat"** aktivieren
3. Stimme auswählen (z.B. "en_us_001 - Female")
4. **Test** klicken

**Alerts aktivieren:**
1. Dashboard → **Alerts** (Sidebar)
2. **Gift-Alert** aktivieren
3. Sound auswählen (optional)
4. **Test Alert** klicken

**Goals einrichten:**
1. Dashboard → **Goals** (Sidebar)
2. **Goal 1** konfigurieren (z.B. "1000 Likes")
3. Typ: **Likes**
4. Ziel: **1000**
5. **Speichern**

#### 2. OBS-Overlays hinzufügen

**Main Overlay:**
```
Browser Source → URL: http://localhost:3000/overlay
Breite: 1920
Höhe: 1080
```

**Goal Overlay:**
```
Browser Source → URL: http://localhost:3000/goals/goal1
Breite: 600
Höhe: 100
```

**Leaderboard Overlay:**
```
Browser Source → URL: http://localhost:3000/leaderboard/overlay
Breite: 400
Höhe: 600
```

#### 3. Stream starten

1. **OBS starten** - Overlays sollten sichtbar sein
2. **TikTok LIVE starten** - Auf deinem Handy
3. **LTTH verbinden** - Dashboard → Connect
4. **Stream starten!** 🎉

---

### 🔌 Plugins aktivieren {#plugins-aktivieren-deutsch}

#### Empfohlene Plugins für Anfänger

**1. TTS v2.0** (Auto-aktiviert)
- Text-to-Speech für Chat-Nachrichten
- 75+ kostenlose Stimmen

**2. Live Goals** (Auto-aktiviert)
- Progress-Bars für Likes, Coins, Follower
- OBS-Overlays verfügbar

**3. Leaderboard** (Empfohlen)
```
Dashboard → Plugins → Leaderboard → Enable
```
- Zeigt Top-Gifter an
- Real-time Updates

**4. LastEvent Spotlight** (Empfohlen)
```
Dashboard → Plugins → LastEvent Spotlight → Enable
```
- Zeigt letzten Follower, Gifter, etc.
- Overlay für jeden Event-Typ

**5. Soundboard** (Optional)
```
Dashboard → Plugins → Soundboard → Enable
```
- Gift-spezifische Sounds
- MyInstants-Integration

#### Plugin aktivieren

1. Dashboard → **Plugins** (Sidebar)
2. Plugin in Liste finden
3. **Enable**-Button klicken
4. Plugin konfigurieren (falls UI vorhanden)

Siehe **[Plugin-Liste](Plugin-Liste.md#deutsch)** für alle 31 verfügbaren Plugins.

---

### 🎨 OBS einrichten {#obs-einrichten-deutsch}

#### OBS Studio installieren

1. Download: [obsproject.com](https://obsproject.com/)
2. Version **29.0 oder höher** empfohlen
3. Standard-Installation durchführen

#### OBS WebSocket aktivieren (für Multi-Cam Plugin)

1. OBS → **Tools** → **WebSocket Server Settings**
2. **"Enable WebSocket server"** aktivieren
3. Port: **4455** (Standard)
4. Passwort setzen (optional)
5. **OK** klicken

**Im LTTH:**
```
Dashboard → Plugins → Multi-Cam Switcher → Configure
OBS WebSocket:
  Host: localhost
  Port: 4455
  Password: (dein Passwort)
→ Connect
```

---

### 💡 Häufige erste Schritte {#häufige-erste-schritte-deutsch}

#### Chat-Nachrichten vorlesen lassen

**Automatisch:**
```
Dashboard → TTS → Auto-TTS für Chat aktivieren
```

**Blacklist (bestimmte Wörter nicht vorlesen):**
```
Dashboard → TTS → Blacklist
→ Wörter hinzufügen (z.B. "spam", "bad word")
```

#### Gifts mit Sounds verbinden

```
Dashboard → Plugins → Soundboard → Enable
→ Configure
→ Gift-Mappings
→ Rose → Sound auswählen
→ Speichern
```

#### Kamera per Chat wechseln

```
Dashboard → Plugins → Multi-Cam Switcher → Enable
→ Configure
→ OBS verbinden
→ Chat-Commands aktivieren

Im Chat: !cam 1 (oder !cam 2, !cam 3, etc.)
```

---

### 🎓 Nächste Schritte {#nächste-schritte-deutsch}

#### Erweiterte Features erkunden

**1. Flow-System (Event-Automation):**
```
Dashboard → Flows → Neuen Flow erstellen
Beispiel:
  Trigger: Gift = "Rose"
  Actions:
    1. TTS: "Danke {username} für die Rose!"
    2. OBS: Szene wechseln zu "Cam2"
    3. OSC: Wave-Geste in VRChat
```

**2. WebGPU-Plugins aktivieren:**
- **WebGPU Emoji Rain** - GPU-beschleunigter Emoji-Effekt
- **Vulkan Rockets (WebGPU)** - Feuerwerk-Effekte

**3. Viewer XP-System:**
```
Dashboard → Plugins → Viewer XP System → Enable
→ XP-Rewards konfigurieren
→ Leaderboard-Overlay hinzufügen
```

#### Dokumentation lesen

- **[Plugin-Liste](Plugin-Liste.md#deutsch)** - Alle 31 Plugins im Detail
- **[Konfiguration](Konfiguration.md#deutsch)** - Erweiterte Einstellungen
- **[FAQ & Troubleshooting](FAQ-&-Troubleshooting.md#deutsch)** - Häufige Probleme lösen

---

### 🎉 Viel Erfolg mit deinem Stream!

Du bist jetzt bereit für deinen ersten professionellen TikTok LIVE-Stream mit Little TikTool Helper!

**Tipps für den Start:**
- Teste alles **vor** dem ersten Live-Stream
- Verwende **Test-Alerts** und **Test-TTS**
- Starte mit wenigen Plugins und erweitere nach und nach
- Lies die **[FAQ & Troubleshooting](FAQ-&-Troubleshooting.md#deutsch)** bei Problemen

---

[← Home](Home#deutsch) | [→ Installation & Setup](Installation-&-Setup#deutsch)

---

*Letzte Aktualisierung: 2025-12-11*  
*Version: 1.2.1*

---

## 🇪🇸 Español

### 📑 Tabla de Contenidos

1. [Descripción General](#descripción-general-español)
2. [Inicio Rápido (5 Minutos)](#inicio-rápido-5-minutos-español)
3. [Primera Transmisión](#primera-transmisión-español)
4. [Activar Plugins](#activar-plugins-español)
5. [Configuración de OBS](#configuración-de-obs-español)
6. [Primeros Pasos Comunes](#primeros-pasos-comunes-español)
7. [Próximos Pasos](#próximos-pasos-español)

---

### 🎯 Descripción General {#descripción-general-español}

Esta guía te ayudará a comenzar con **Little TikTool Helper v1.2.1** en **5-10 minutos**.

**Lo que lograrás:**

✅ Herramienta instalada y funcionando  
✅ Conectado a TikTok LIVE  
✅ Primeros overlays configurados en OBS  
✅ Plugins básicos activados  
✅ Listo para tu primera transmisión

---

### ⚡ Inicio Rápido (5 Minutos) {#inicio-rápido-5-minutos-español}

#### Paso 1: Instalación (2 minutos)

**Requisitos Previos:**
- Node.js 18.0.0+ instalado ([Descargar](https://nodejs.org/))
- Git instalado (opcional, [Descargar](https://git-scm.com/))

**Instalación:**

**Opción A - Aplicación de Escritorio (Recomendado):**
```bash
# Clonar repositorio
git clone https://github.com/Loggableim/pupcidslittletiktoolhelper_desktop.git
cd pupcidslittletiktoolhelper_desktop

# Instalar dependencias
npm install

# Iniciar app de escritorio
npm run start:electron
```

**Opción B - Servidor Independiente:**
```bash
# Ir a la carpeta app
cd app

# Instalar dependencias
npm install

# Iniciar servidor
npm start
```

#### Paso 2: Abrir Dashboard (30 segundos)

**App de Escritorio:** Se abre automáticamente

**Independiente:** Abrir navegador en `http://localhost:3000`

#### Paso 3: Conectar a TikTok (1 minuto)

1. **Obtener clave API de Eulerstream:**
   - Ir a [Eulerstream](https://eulerstream.com/)
   - Registrarse (gratis)
   - Copiar tu clave API

2. **En el Dashboard:**
   - Hacer clic en **"Connect to TikTok LIVE"**
   - Ingresar tu **nombre de usuario de TikTok**
   - Ingresar tu **clave API de Eulerstream**
   - Hacer clic en **"Connect"**

3. **Esperar conexión:**
   - El estado debería cambiar a **"Connected" (verde)**
   - Los eventos en vivo aparecen en el registro de eventos

#### Paso 4: Prueba (30 segundos)

**Enviar regalo de prueba:**
1. Abrir TikTok en tu teléfono
2. Ir a tu transmisión LIVE
3. Enviar un regalo de prueba (p. ej., Rosa)
4. El dashboard debería mostrar el regalo

**✅ ¡Listo!** Ahora estás conectado a TikTok LIVE.

---

### 🎬 Primera Transmisión {#primera-transmisión-español}

#### 1. Configuración Básica

**Activar TTS:**
1. Dashboard → **TTS** (Barra lateral)
2. Activar **"Auto-TTS for Chat"**
3. Seleccionar voz (p. ej., "en_us_001 - Female")
4. Hacer clic en **Test**

**Activar Alertas:**
1. Dashboard → **Alerts** (Barra lateral)
2. Activar **Gift Alert**
3. Seleccionar sonido (opcional)
4. Hacer clic en **Test Alert**

**Configurar Objetivos:**
1. Dashboard → **Goals** (Barra lateral)
2. Configurar **Goal 1** (p. ej., "1000 Me gusta")
3. Tipo: **Likes**
4. Objetivo: **1000**
5. Hacer clic en **Save**

#### 2. Agregar Overlays de OBS

**Overlay Principal:**
```
Browser Source → URL: http://localhost:3000/overlay
Ancho: 1920
Alto: 1080
```

**Overlay de Objetivo:**
```
Browser Source → URL: http://localhost:3000/goals/goal1
Ancho: 600
Alto: 100
```

**Overlay de Leaderboard:**
```
Browser Source → URL: http://localhost:3000/leaderboard/overlay
Ancho: 400
Alto: 600
```

#### 3. Iniciar Transmisión

1. **Iniciar OBS** - Los overlays deberían ser visibles
2. **Iniciar TikTok LIVE** - En tu teléfono
3. **Conectar LTTH** - Dashboard → Connect
4. **¡Iniciar transmisión!** 🎉

---

### 🔌 Activar Plugins {#activar-plugins-español}

#### Plugins Recomendados para Principiantes

**1. TTS v2.0** (Auto-activado)
- Text-to-Speech para mensajes de chat
- Más de 75 voces gratis

**2. Live Goals** (Auto-activado)
- Barras de progreso para me gusta, monedas, seguidores
- Overlays de OBS disponibles

**3. Leaderboard** (Recomendado)
```
Dashboard → Plugins → Leaderboard → Enable
```
- Muestra los mejores donadores
- Actualizaciones en tiempo real

**4. LastEvent Spotlight** (Recomendado)
```
Dashboard → Plugins → LastEvent Spotlight → Enable
```
- Muestra el último seguidor, donador, etc.
- Overlay para cada tipo de evento

**5. Soundboard** (Opcional)
```
Dashboard → Plugins → Soundboard → Enable
```
- Sonidos específicos para regalos
- Integración con MyInstants

#### Activar un Plugin

1. Dashboard → **Plugins** (Barra lateral)
2. Encontrar plugin en la lista
3. Hacer clic en el botón **Enable**
4. Configurar plugin (si hay UI disponible)

Ver **[Lista de Plugins](Plugin-Liste.md#español)** para todos los 31 plugins disponibles.

---

### 🎨 Configuración de OBS {#configuración-de-obs-español}

#### Instalar OBS Studio

1. Descargar: [obsproject.com](https://obsproject.com/)
2. Versión **29.0 o superior** recomendada
3. Realizar instalación estándar

#### Activar OBS WebSocket (para plugin Multi-Cam)

1. OBS → **Tools** → **WebSocket Server Settings**
2. Activar **"Enable WebSocket server"**
3. Puerto: **4455** (predeterminado)
4. Establecer contraseña (opcional)
5. Hacer clic en **OK**

**En LTTH:**
```
Dashboard → Plugins → Multi-Cam Switcher → Configure
OBS WebSocket:
  Host: localhost
  Port: 4455
  Password: (tu contraseña)
→ Connect
```

---

### 💡 Primeros Pasos Comunes {#primeros-pasos-comunes-español}

#### Leer Mensajes de Chat en Voz Alta

**Automáticamente:**
```
Dashboard → TTS → Activar Auto-TTS for Chat
```

**Lista Negra (no leer ciertas palabras):**
```
Dashboard → TTS → Blacklist
→ Agregar palabras (p. ej., "spam", "palabra prohibida")
```

#### Conectar Regalos con Sonidos

```
Dashboard → Plugins → Soundboard → Enable
→ Configure
→ Gift Mappings
→ Rose → Seleccionar sonido
→ Save
```

#### Cambiar Cámara por Chat

```
Dashboard → Plugins → Multi-Cam Switcher → Enable
→ Configure
→ Conectar OBS
→ Activar comandos de chat

En el chat: !cam 1 (o !cam 2, !cam 3, etc.)
```

---

### 🎓 Próximos Pasos {#próximos-pasos-español}

#### Explorar Funciones Avanzadas

**1. Sistema de Flows (Automatización de Eventos):**
```
Dashboard → Flows → Crear nuevo flow
Ejemplo:
  Activador: Regalo = "Rose"
  Acciones:
    1. TTS: "¡Gracias {username} por la Rosa!"
    2. OBS: Cambiar escena a "Cam2"
    3. OSC: Gesto de saludo en VRChat
```

**2. Activar Plugins WebGPU:**
- **WebGPU Emoji Rain** - Efecto de emoji acelerado por GPU
- **Vulkan Rockets (WebGPU)** - Efectos de fuegos artificiales

**3. Sistema de XP de Espectadores:**
```
Dashboard → Plugins → Viewer XP System → Enable
→ Configurar recompensas de XP
→ Agregar overlay de leaderboard
```

#### Leer Documentación

- **[Lista de Plugins](Plugin-Liste.md#español)** - Todos los 31 plugins en detalle
- **[Configuración](Konfiguration.md#español)** - Configuración avanzada
- **[FAQ & Troubleshooting](FAQ-&-Troubleshooting.md#español)** - Resolver problemas comunes

---

### 🎉 ¡Buena Suerte con Tu Transmisión!

¡Ahora estás listo para tu primera transmisión profesional de TikTok LIVE con Little TikTool Helper!

**Consejos para Comenzar:**
- Prueba todo **antes** de tu primera transmisión en vivo
- Usa **Test Alerts** y **Test TTS**
- Comienza con pocos plugins y expande gradualmente
- Lee **[FAQ & Troubleshooting](FAQ-&-Troubleshooting.md#español)** si tienes problemas

---

[← Home](Home#español) | [→ Installation & Setup](Installation-&-Setup#español)

---

*Última actualización: 2025-12-11*  
*Versión: 1.2.1*

---

## 🇫🇷 Français

### 📑 Table des Matières

1. [Aperçu](#aperçu-français)
2. [Démarrage Rapide (5 Minutes)](#démarrage-rapide-5-minutes-français)
3. [Première Diffusion](#première-diffusion-français)
4. [Activer les Plugins](#activer-les-plugins-français)
5. [Configuration OBS](#configuration-obs-français)
6. [Premiers Pas Courants](#premiers-pas-courants-français)
7. [Prochaines Étapes](#prochaines-étapes-français)

---

### 🎯 Aperçu {#aperçu-français}

Ce guide vous aidera à démarrer avec **Little TikTool Helper v1.2.1** en **5-10 minutes**.

**Ce que vous réaliserez :**

✅ Outil installé et fonctionnel  
✅ Connecté à TikTok LIVE  
✅ Premiers overlays configurés dans OBS  
✅ Plugins de base activés  
✅ Prêt pour votre première diffusion

---

### ⚡ Démarrage Rapide (5 Minutes) {#démarrage-rapide-5-minutes-français}

#### Étape 1 : Installation (2 minutes)

**Prérequis :**
- Node.js 18.0.0+ installé ([Télécharger](https://nodejs.org/))
- Git installé (facultatif, [Télécharger](https://git-scm.com/))

**Installation :**

**Option A - Application de Bureau (Recommandé) :**
```bash
# Cloner le dépôt
git clone https://github.com/Loggableim/pupcidslittletiktoolhelper_desktop.git
cd pupcidslittletiktoolhelper_desktop

# Installer les dépendances
npm install

# Démarrer l'app de bureau
npm run start:electron
```

**Option B - Serveur Autonome :**
```bash
# Aller dans le dossier app
cd app

# Installer les dépendances
npm install

# Démarrer le serveur
npm start
```

#### Étape 2 : Ouvrir le Dashboard (30 secondes)

**App de Bureau :** S'ouvre automatiquement

**Autonome :** Ouvrir le navigateur sur `http://localhost:3000`

#### Étape 3 : Se Connecter à TikTok (1 minute)

1. **Obtenir la clé API Eulerstream :**
   - Aller sur [Eulerstream](https://eulerstream.com/)
   - S'inscrire (gratuit)
   - Copier votre clé API

2. **Dans le Dashboard :**
   - Cliquer sur **"Connect to TikTok LIVE"**
   - Entrer votre **nom d'utilisateur TikTok**
   - Entrer votre **clé API Eulerstream**
   - Cliquer sur **"Connect"**

3. **Attendre la connexion :**
   - Le statut devrait passer à **"Connected" (vert)**
   - Les événements en direct apparaissent dans le journal d'événements

#### Étape 4 : Test (30 secondes)

**Envoyer un cadeau de test :**
1. Ouvrir TikTok sur votre téléphone
2. Aller sur votre diffusion LIVE
3. Envoyer un cadeau de test (p. ex., Rose)
4. Le dashboard devrait afficher le cadeau

**✅ Terminé !** Vous êtes maintenant connecté à TikTok LIVE.

---

### 🎬 Première Diffusion {#première-diffusion-français}

#### 1. Configuration de Base

**Activer TTS :**
1. Dashboard → **TTS** (Barre latérale)
2. Activer **"Auto-TTS for Chat"**
3. Sélectionner une voix (p. ex., "en_us_001 - Female")
4. Cliquer sur **Test**

**Activer les Alertes :**
1. Dashboard → **Alerts** (Barre latérale)
2. Activer **Gift Alert**
3. Sélectionner un son (facultatif)
4. Cliquer sur **Test Alert**

**Configurer les Objectifs :**
1. Dashboard → **Goals** (Barre latérale)
2. Configurer **Goal 1** (p. ex., "1000 J'aime")
3. Type : **Likes**
4. Objectif : **1000**
5. Cliquer sur **Save**

#### 2. Ajouter des Overlays OBS

**Overlay Principal :**
```
Browser Source → URL: http://localhost:3000/overlay
Largeur: 1920
Hauteur: 1080
```

**Overlay d'Objectif :**
```
Browser Source → URL: http://localhost:3000/goals/goal1
Largeur: 600
Hauteur: 100
```

**Overlay de Leaderboard :**
```
Browser Source → URL: http://localhost:3000/leaderboard/overlay
Largeur: 400
Hauteur: 600
```

#### 3. Démarrer la Diffusion

1. **Démarrer OBS** - Les overlays devraient être visibles
2. **Démarrer TikTok LIVE** - Sur votre téléphone
3. **Connecter LTTH** - Dashboard → Connect
4. **Démarrer la diffusion !** 🎉

---

### 🔌 Activer les Plugins {#activer-les-plugins-français}

#### Plugins Recommandés pour Débutants

**1. TTS v2.0** (Auto-activé)
- Synthèse vocale pour les messages de chat
- Plus de 75 voix gratuites

**2. Live Goals** (Auto-activé)
- Barres de progression pour j'aime, pièces, abonnés
- Overlays OBS disponibles

**3. Leaderboard** (Recommandé)
```
Dashboard → Plugins → Leaderboard → Enable
```
- Affiche les meilleurs donateurs
- Mises à jour en temps réel

**4. LastEvent Spotlight** (Recommandé)
```
Dashboard → Plugins → LastEvent Spotlight → Enable
```
- Affiche le dernier abonné, donateur, etc.
- Overlay pour chaque type d'événement

**5. Soundboard** (Facultatif)
```
Dashboard → Plugins → Soundboard → Enable
```
- Sons spécifiques aux cadeaux
- Intégration MyInstants

#### Activer un Plugin

1. Dashboard → **Plugins** (Barre latérale)
2. Trouver le plugin dans la liste
3. Cliquer sur le bouton **Enable**
4. Configurer le plugin (si UI disponible)

Voir **[Liste des Plugins](Plugin-Liste.md#français)** pour tous les 31 plugins disponibles.

---

### 🎨 Configuration OBS {#configuration-obs-français}

#### Installer OBS Studio

1. Télécharger : [obsproject.com](https://obsproject.com/)
2. Version **29.0 ou supérieure** recommandée
3. Effectuer l'installation standard

#### Activer OBS WebSocket (pour plugin Multi-Cam)

1. OBS → **Tools** → **WebSocket Server Settings**
2. Activer **"Enable WebSocket server"**
3. Port : **4455** (par défaut)
4. Définir un mot de passe (facultatif)
5. Cliquer sur **OK**

**Dans LTTH :**
```
Dashboard → Plugins → Multi-Cam Switcher → Configure
OBS WebSocket:
  Host: localhost
  Port: 4455
  Password: (votre mot de passe)
→ Connect
```

---

### 💡 Premiers Pas Courants {#premiers-pas-courants-français}

#### Faire Lire les Messages du Chat

**Automatiquement :**
```
Dashboard → TTS → Activer Auto-TTS for Chat
```

**Liste Noire (ne pas lire certains mots) :**
```
Dashboard → TTS → Blacklist
→ Ajouter des mots (p. ex., "spam", "mot interdit")
```

#### Connecter des Cadeaux avec des Sons

```
Dashboard → Plugins → Soundboard → Enable
→ Configure
→ Gift Mappings
→ Rose → Sélectionner un son
→ Save
```

#### Changer de Caméra par Chat

```
Dashboard → Plugins → Multi-Cam Switcher → Enable
→ Configure
→ Connecter OBS
→ Activer les commandes de chat

Dans le chat: !cam 1 (ou !cam 2, !cam 3, etc.)
```

---

### 🎓 Prochaines Étapes {#prochaines-étapes-français}

#### Explorer les Fonctionnalités Avancées

**1. Système de Flows (Automatisation d'Événements) :**
```
Dashboard → Flows → Créer un nouveau flow
Exemple:
  Déclencheur: Cadeau = "Rose"
  Actions:
    1. TTS: "Merci {username} pour la Rose !"
    2. OBS: Changer de scène vers "Cam2"
    3. OSC: Geste de salut dans VRChat
```

**2. Activer les Plugins WebGPU :**
- **WebGPU Emoji Rain** - Effet emoji accéléré par GPU
- **Vulkan Rockets (WebGPU)** - Effets de feux d'artifice

**3. Système XP des Spectateurs :**
```
Dashboard → Plugins → Viewer XP System → Enable
→ Configurer les récompenses XP
→ Ajouter un overlay de leaderboard
```

#### Lire la Documentation

- **[Liste des Plugins](Plugin-Liste.md#français)** - Tous les 31 plugins en détail
- **[Configuration](Konfiguration.md#français)** - Paramètres avancés
- **[FAQ & Troubleshooting](FAQ-&-Troubleshooting.md#français)** - Résoudre les problèmes courants

---

### 🎉 Bonne Chance avec Votre Diffusion !

Vous êtes maintenant prêt pour votre première diffusion professionnelle TikTok LIVE avec Little TikTool Helper !

**Conseils pour Débuter :**
- Testez tout **avant** votre première diffusion en direct
- Utilisez **Test Alerts** et **Test TTS**
- Commencez avec peu de plugins et développez progressivement
- Lisez **[FAQ & Troubleshooting](FAQ-&-Troubleshooting.md#français)** si vous avez des problèmes

---

[← Home](Home#français) | [→ Installation & Setup](Installation-&-Setup#français)

---

*Dernière mise à jour : 2025-12-11*  
*Version : 1.2.1*
