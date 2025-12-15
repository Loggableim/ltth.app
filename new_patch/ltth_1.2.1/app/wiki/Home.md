# 🏠 Home / Startseite / Inicio / Accueil

[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc/4.0/)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![Version](https://img.shields.io/badge/version-1.2.1-blue)](https://github.com/Loggableim/pupcidslittletiktoolhelper_desktop)
[![Status](https://img.shields.io/badge/status-active-success)](https://github.com/Loggableim/pupcidslittletiktoolhelper_desktop)

---

## Language Selection / Sprachauswahl / Selección de idioma / Sélection de la langue

- [🇬🇧 English](#english)
- [🇩🇪 Deutsch](#deutsch)
- [🇪🇸 Español](#español)
- [🇫🇷 Français](#français)

---

## 🇬🇧 English

Welcome to **PupCid's Little TikTool Helper**!

This is a free, open-source alternative to Tikfinity and Tiktory for professional TikTok LIVE streaming with comprehensive features for content creators.

### Quick Links
- [Getting Started](Getting-Started.md#english)
- [Installation](Installation-&-Setup.md#english)
- [Plugin List](Plugin-Liste.md#english)
- [FAQ](FAQ-&-Troubleshooting.md#english)

### 🎯 About the Project

**PupCid's Little TikTool Helper** is a professional open-source tool for TikTok-compatible LIVE streaming with extensive features for content creators. The tool provides complete integration of TikTok LIVE events into OBS Studio with overlays, alerts, text-to-speech, soundboard, and event automation.

### ✨ Key Features

- **🔒 100% Local** - No cloud services, no login required
- **🎨 Professional Overlays** - Full-HD browser sources for OBS Studio
- **🔌 Modular Plugin System** - Easily extensible through plugins
- **🌍 Multi-Language** - German and English user interface
- **⚡ Real-time Updates** - WebSocket-based live communication
- **🎭 Event Automation** - If-then rules without code

### 🎤 Who is this tool for?

- **TikTok LIVE Streamers** - Professional overlays and alerts
- **Content Creators** - Event automation and interactivity
- **VRChat Streamers** - OSC integration for avatar control
- **Multi-Guest Streamers** - VDO.Ninja integration for interviews
- **Developers** - Modular plugin system for extension

### 🚀 Main Features

#### 1. TikTok LIVE Integration

Real-time connection to TikTok LIVE streams with all events:

- ✅ **Gifts** - Gifts with coins, combo tracking, gift catalog
- ✅ **Chat** - Messages with profile pictures and badges
- ✅ **Follows** - New followers with follow-role tracking
- ✅ **Shares** - Stream shares with user information
- ✅ **Likes** - Like events with like counts
- ✅ **Subscriptions** - Subscribers with tier levels

#### 2. Text-to-Speech (TTS)

Professional TTS system with 100+ voices:

- 🎙️ **75+ TikTok Voices** - Free, no API keys required
- 🎙️ **30+ Google Cloud Voices** - Optional with API key
- 👤 **User Voice Mappings** - Users get their own voices assigned
- 📝 **Auto-TTS for Chat** - Automatic reading of chat messages
- 🚫 **Blacklist Filter** - Exclude words/users
- 🎚️ **Volume & Speed** - Adjust volume and speed

#### 3. Alert System

Customizable alerts for all TikTok events:

- 🔊 **Sound + Text + Animation** - Fully configurable alerts
- 🖼️ **Images & GIFs** - Custom alert graphics
- ⏱️ **Duration Control** - Set alert display duration
- 🎨 **Custom Templates** - Placeholders like `{username}`, `{giftName}`, `{coins}`
- 🧪 **Test Mode** - Test alerts before the stream

#### 4. Soundboard

100,000+ sounds with gift mapping:

- 🔍 **MyInstants Integration** - Access to huge sound library
- 🎁 **Gift-to-Sound Mapping** - Rose → Sound A, Lion → Sound B
- 🎵 **Event Sounds** - Sounds for Follow, Subscribe, Share
- ⚡ **Like Threshold System** - Trigger sounds at X likes
- 📦 **Custom Upload** - Upload your own MP3s
- ⭐ **Favorites & Trending** - Organize sounds

#### 5. Goals & Progress Bars

4 separate goals with browser source overlays:

- 📊 **Likes Goal** - Like goal with progress bar
- 👥 **Followers Goal** - Follower goal with tracking
- 💎 **Subscriptions Goal** - Subscriber goal
- 🪙 **Coins Goal** - Coin goal (donations)
- 🎨 **Custom Styles** - Customize colors, gradients, labels
- ➕ **Add/Set/Increment** - Flexible mode selection

#### 6. Event Automation (Flows)

"If-then" automations without code:

- 🔗 **Triggers** - Gift, Chat, Follow, Subscribe, Share, Like
- ⚙️ **Conditions** - Conditions with operators (==, !=, >=, <=, contains)
- ⚡ **Actions** - TTS, Alert, OBS Scene, OSC, HTTP Request, Delay
- 🧩 **Multi-Step** - Multiple actions in sequence
- ✅ **Test Mode** - Test flows before the stream

**Example Flow:**
```
Trigger: Gift == "Rose"
Actions:
  1. TTS: "Thanks {username} for the Rose!"
  2. OBS Scene: Switch to "Cam2"
  3. OSC: Wave gesture in VRChat
```

### 💻 Technology Stack

| Category | Technology | Version |
|----------|------------|---------|
| **Backend** | Node.js | >=18.0.0 <24.0.0 |
| **Web Framework** | Express | ^4.18.2 |
| **Real-time** | Socket.io | ^4.6.1 |
| **Database** | SQLite (better-sqlite3) | ^11.9.0 |
| **TikTok API** | tiktok-live-connector | ^2.1.0 |
| **OBS Integration** | obs-websocket-js | ^5.0.6 |
| **OSC Protocol** | osc | ^2.4.5 |
| **Logging** | winston | ^3.18.3 |
| **Frontend** | Bootstrap 5 | 5.3 |
| **Icons** | Font Awesome | 6.x |

### ⚡ Quick Start

1. Install Node.js 18-23
2. Clone repository: `git clone https://github.com/Loggableim/pupcidslittletiktoolhelper_desktop.git`
3. Install dependencies: `npm install`
4. Start server: `npm start` or `npm run start:electron`
5. Open dashboard: `http://localhost:3000`
6. Connect to TikTok LIVE with your username

**Done!** 🎉 All events are now displayed live.

### 📄 License

This project is licensed under the **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)** license.

---

*Last updated: 2025-12-11*  
*Version: 1.2.1*

---

## 🇩🇪 Deutsch

Willkommen bei **PupCid's Little TikTool Helper**!

Dies ist eine kostenlose Open-Source-Alternative zu Tikfinity und Tiktory für professionelles TikTok LIVE-Streaming mit umfangreichen Features für Content-Creator.

### Schnellzugriff
- [Erste Schritte](Getting-Started.md#deutsch)
- [Installation](Installation-&-Setup.md#deutsch)
- [Plugin-Liste](Plugin-Liste.md#deutsch)
- [FAQ](FAQ-&-Troubleshooting.md#deutsch)

### 🎯 Über das Projekt

**PupCid's Little TikTool Helper** ist ein professionelles Open-Source-Tool für TikTok-kompatibles LIVE-Streaming mit umfangreichen Features für Content-Creator. Das Tool bietet eine vollständige Integration von TikTok LIVE-Events in OBS Studio mit Overlays, Alerts, Text-to-Speech, Soundboard und Event-Automatisierung.

### ✨ Besonderheiten

- **🔒 100% Lokal** - Keine Cloud-Services, keine Login-Daten erforderlich
- **🎨 Professionelle Overlays** - Full-HD Browser Sources für OBS Studio
- **🔌 Modulares Plugin-System** - Einfach erweiterbar durch Plugins
- **🌍 Multi-Sprachen** - Deutsche und englische Benutzeroberfläche
- **⚡ Echtzeit-Updates** - WebSocket-basierte Live-Kommunikation
- **🎭 Event-Automation** - Wenn-Dann-Regeln ohne Code

### 🎤 Für wen ist das Tool geeignet?

- **TikTok LIVE Streamer** - Professionelle Overlays und Alerts
- **Content Creator** - Event-Automatisierung und Interaktivität
- **VRChat Streamer** - OSC-Integration für Avatar-Steuerung
- **Multi-Guest Streamer** - VDO.Ninja Integration für Interviews
- **Entwickler** - Modulares Plugin-System zum Erweitern

### 🚀 Hauptfunktionen

#### 1. TikTok LIVE Integration

Echtzeit-Verbindung zu TikTok LIVE-Streams mit allen Events:

- ✅ **Gifts** - Geschenke mit Coins, Combo-Tracking, Gift-Katalog
- ✅ **Chat** - Nachrichten mit Profilbildern und Badges
- ✅ **Follows** - Neue Follower mit Follow-Role-Tracking
- ✅ **Shares** - Stream-Shares mit Nutzerinformationen
- ✅ **Likes** - Like-Events mit Like-Counts
- ✅ **Subscriptions** - Subscriber mit Tier-Levels

#### 2. Text-to-Speech (TTS)

Professionelles TTS-System mit 100+ Stimmen:

- 🎙️ **75+ TikTok-Stimmen** - Kostenlos, keine API-Keys erforderlich
- 🎙️ **30+ Google Cloud-Stimmen** - Optional mit API-Key
- 👤 **User-Voice-Mappings** - Nutzer bekommen eigene Stimmen zugewiesen
- 📝 **Auto-TTS für Chat** - Automatisches Vorlesen von Chat-Nachrichten
- 🚫 **Blacklist-Filter** - Wörter/Nutzer ausschließen
- 🎚️ **Volume & Speed** - Lautstärke und Geschwindigkeit anpassen

#### 3. Alert-System

Anpassbare Alerts für alle TikTok-Events:

- 🔊 **Sound + Text + Animation** - Vollständig konfigurierbare Alerts
- 🖼️ **Bilder & GIFs** - Custom Alert-Graphics
- ⏱️ **Dauer-Kontrolle** - Alert-Display-Dauer einstellen
- 🎨 **Custom Templates** - Platzhalter wie `{username}`, `{giftName}`, `{coins}`
- 🧪 **Test-Modus** - Alerts vor dem Stream testen

#### 4. Soundboard

100.000+ Sounds mit Gift-Mapping:

- 🔍 **MyInstants-Integration** - Zugriff auf riesige Sound-Library
- 🎁 **Gift-zu-Sound-Mapping** - Rose → Sound A, Lion → Sound B
- 🎵 **Event-Sounds** - Sounds für Follow, Subscribe, Share
- ⚡ **Like-Threshold-System** - Sounds ab X Likes triggern
- 📦 **Custom Upload** - Eigene MP3s hochladen
- ⭐ **Favorites & Trending** - Sounds organisieren

#### 5. Goals & Progress Bars

4 separate Goals mit Browser-Source-Overlays:

- 📊 **Likes Goal** - Like-Ziel mit Progress-Bar
- 👥 **Followers Goal** - Follower-Ziel mit Tracking
- 💎 **Subscriptions Goal** - Subscriber-Ziel
- 🪙 **Coins Goal** - Coin-Ziel (Donations)
- 🎨 **Custom Styles** - Farben, Gradient, Labels anpassen
- ➕ **Add/Set/Increment** - Flexible Modus-Auswahl

#### 6. Event-Automation (Flows)

"Wenn-Dann"-Automatisierungen ohne Code:

- 🔗 **Trigger** - Gift, Chat, Follow, Subscribe, Share, Like
- ⚙️ **Conditions** - Bedingungen mit Operatoren (==, !=, >=, <=, contains)
- ⚡ **Actions** - TTS, Alert, OBS-Szene, OSC, HTTP-Request, Delay
- 🧩 **Multi-Step** - Mehrere Actions hintereinander
- ✅ **Test-Modus** - Flows vor dem Stream testen

**Beispiel-Flow:**
```
Trigger: Gift == "Rose"
Actions:
  1. TTS: "Danke {username} für die Rose!"
  2. OBS-Szene wechseln zu "Cam2"
  3. OSC: Wave-Geste in VRChat
```

### 💻 Technologie-Stack

| Kategorie | Technologie | Version |
|-----------|-------------|---------|
| **Backend** | Node.js | >=18.0.0 <24.0.0 |
| **Web-Framework** | Express | ^4.18.2 |
| **Real-time** | Socket.io | ^4.6.1 |
| **Datenbank** | SQLite (better-sqlite3) | ^11.9.0 |
| **TikTok-API** | tiktok-live-connector | ^2.1.0 |
| **OBS-Integration** | obs-websocket-js | ^5.0.6 |
| **OSC-Protocol** | osc | ^2.4.5 |
| **Logging** | winston | ^3.18.3 |
| **Frontend** | Bootstrap 5 | 5.3 |
| **Icons** | Font Awesome | 6.x |

### ⚡ Quick Start

1. Node.js 18-23 installieren
2. Repository klonen: `git clone https://github.com/Loggableim/pupcidslittletiktoolhelper_desktop.git`
3. Dependencies installieren: `npm install`
4. Server starten: `npm start` oder `npm run start:electron`
5. Dashboard öffnen: `http://localhost:3000`
6. Mit TikTok LIVE verbinden (Username eingeben)

**Fertig!** 🎉 Alle Events werden jetzt live angezeigt.

### 📄 Lizenz

Dieses Projekt ist unter der **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)** Lizenz lizenziert.

---

*Letzte Aktualisierung: 2025-12-11*  
*Version: 1.2.1*

---

## 🇪🇸 Español

¡Bienvenido a **PupCid's Little TikTool Helper**!

Esta es una alternativa gratuita y de código abierto a Tikfinity y Tiktory para transmisiones profesionales en TikTok LIVE con características completas para creadores de contenido.

### Enlaces Rápidos
- [Primeros Pasos](Getting-Started.md#español)
- [Instalación](Installation-&-Setup.md#español)
- [Lista de Plugins](Plugin-Liste.md#español)
- [FAQ](FAQ-&-Troubleshooting.md#español)

### 🎯 Sobre el Proyecto

**PupCid's Little TikTool Helper** es una herramienta profesional de código abierto para transmisiones LIVE compatibles con TikTok con características extensas para creadores de contenido. La herramienta proporciona integración completa de eventos LIVE de TikTok en OBS Studio con overlays, alertas, text-to-speech, soundboard y automatización de eventos.

### ✨ Características Clave

- **🔒 100% Local** - Sin servicios en la nube, sin inicio de sesión requerido
- **🎨 Overlays Profesionales** - Fuentes de navegador Full-HD para OBS Studio
- **🔌 Sistema de Plugins Modular** - Fácilmente extensible a través de plugins
- **🌍 Multi-idioma** - Interfaz de usuario en alemán e inglés
- **⚡ Actualizaciones en Tiempo Real** - Comunicación en vivo basada en WebSocket
- **🎭 Automatización de Eventos** - Reglas "si-entonces" sin código

### 🎤 ¿Para quién es esta herramienta?

- **Streamers de TikTok LIVE** - Overlays y alertas profesionales
- **Creadores de Contenido** - Automatización de eventos e interactividad
- **Streamers de VRChat** - Integración OSC para control de avatar
- **Streamers Multi-invitados** - Integración VDO.Ninja para entrevistas
- **Desarrolladores** - Sistema de plugins modular para extensión

### 🚀 Funciones Principales

#### 1. Integración TikTok LIVE

Conexión en tiempo real a transmisiones LIVE de TikTok con todos los eventos:

- ✅ **Regalos** - Regalos con monedas, seguimiento de combos, catálogo de regalos
- ✅ **Chat** - Mensajes con fotos de perfil e insignias
- ✅ **Seguidores** - Nuevos seguidores con seguimiento de roles
- ✅ **Compartidos** - Compartidos de transmisión con información del usuario
- ✅ **Me gusta** - Eventos de me gusta con conteo
- ✅ **Suscripciones** - Suscriptores con niveles

#### 2. Text-to-Speech (TTS)

Sistema TTS profesional con más de 100 voces:

- 🎙️ **75+ Voces de TikTok** - Gratis, no se requieren claves API
- 🎙️ **30+ Voces de Google Cloud** - Opcional con clave API
- 👤 **Mapeo de Voces de Usuario** - Los usuarios obtienen sus propias voces asignadas
- 📝 **Auto-TTS para Chat** - Lectura automática de mensajes de chat
- 🚫 **Filtro de Lista Negra** - Excluir palabras/usuarios
- 🎚️ **Volumen y Velocidad** - Ajustar volumen y velocidad

#### 3. Sistema de Alertas

Alertas personalizables para todos los eventos de TikTok:

- 🔊 **Sonido + Texto + Animación** - Alertas completamente configurables
- 🖼️ **Imágenes y GIFs** - Gráficos de alerta personalizados
- ⏱️ **Control de Duración** - Establecer duración de visualización de alerta
- 🎨 **Plantillas Personalizadas** - Marcadores como `{username}`, `{giftName}`, `{coins}`
- 🧪 **Modo de Prueba** - Probar alertas antes de la transmisión

#### 4. Soundboard

Más de 100,000 sonidos con mapeo de regalos:

- 🔍 **Integración MyInstants** - Acceso a una enorme biblioteca de sonidos
- 🎁 **Mapeo de Regalo-a-Sonido** - Rosa → Sonido A, León → Sonido B
- 🎵 **Sonidos de Eventos** - Sonidos para Follow, Subscribe, Share
- ⚡ **Sistema de Umbral de Me gusta** - Activar sonidos en X me gusta
- 📦 **Carga Personalizada** - Subir tus propios MP3s
- ⭐ **Favoritos y Tendencias** - Organizar sonidos

#### 5. Objetivos y Barras de Progreso

4 objetivos separados con overlays de fuente de navegador:

- 📊 **Objetivo de Me gusta** - Objetivo de me gusta con barra de progreso
- 👥 **Objetivo de Seguidores** - Objetivo de seguidores con seguimiento
- 💎 **Objetivo de Suscripciones** - Objetivo de suscriptores
- 🪙 **Objetivo de Monedas** - Objetivo de monedas (donaciones)
- 🎨 **Estilos Personalizados** - Personalizar colores, gradientes, etiquetas
- ➕ **Agregar/Establecer/Incrementar** - Selección de modo flexible

#### 6. Automatización de Eventos (Flows)

Automatizaciones "si-entonces" sin código:

- 🔗 **Activadores** - Regalo, Chat, Seguir, Suscribir, Compartir, Me gusta
- ⚙️ **Condiciones** - Condiciones con operadores (==, !=, >=, <=, contains)
- ⚡ **Acciones** - TTS, Alerta, Escena OBS, OSC, Solicitud HTTP, Retraso
- 🧩 **Multi-Paso** - Múltiples acciones en secuencia
- ✅ **Modo de Prueba** - Probar flows antes de la transmisión

**Ejemplo de Flow:**
```
Activador: Regalo == "Rose"
Acciones:
  1. TTS: "¡Gracias {username} por la Rosa!"
  2. Escena OBS: Cambiar a "Cam2"
  3. OSC: Gesto de saludo en VRChat
```

### 💻 Stack Tecnológico

| Categoría | Tecnología | Versión |
|-----------|------------|---------|
| **Backend** | Node.js | >=18.0.0 <24.0.0 |
| **Framework Web** | Express | ^4.18.2 |
| **Tiempo Real** | Socket.io | ^4.6.1 |
| **Base de Datos** | SQLite (better-sqlite3) | ^11.9.0 |
| **API TikTok** | tiktok-live-connector | ^2.1.0 |
| **Integración OBS** | obs-websocket-js | ^5.0.6 |
| **Protocolo OSC** | osc | ^2.4.5 |
| **Logging** | winston | ^3.18.3 |
| **Frontend** | Bootstrap 5 | 5.3 |
| **Iconos** | Font Awesome | 6.x |

### ⚡ Inicio Rápido

1. Instalar Node.js 18-23
2. Clonar repositorio: `git clone https://github.com/Loggableim/pupcidslittletiktoolhelper_desktop.git`
3. Instalar dependencias: `npm install`
4. Iniciar servidor: `npm start` o `npm run start:electron`
5. Abrir dashboard: `http://localhost:3000`
6. Conectar a TikTok LIVE con tu nombre de usuario

**¡Listo!** 🎉 Todos los eventos se muestran ahora en vivo.

### 📄 Licencia

Este proyecto está licenciado bajo la licencia **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)**.

---

*Última actualización: 2025-12-11*  
*Versión: 1.2.1*

---

## 🇫🇷 Français

Bienvenue sur **PupCid's Little TikTool Helper** !

Il s'agit d'une alternative gratuite et open source à Tikfinity et Tiktory pour le streaming professionnel TikTok LIVE avec des fonctionnalités complètes pour les créateurs de contenu.

### Liens Rapides
- [Démarrage](Getting-Started.md#français)
- [Installation](Installation-&-Setup.md#français)
- [Liste des Plugins](Plugin-Liste.md#français)
- [FAQ](FAQ-&-Troubleshooting.md#français)

### 🎯 À Propos du Projet

**PupCid's Little TikTool Helper** est un outil professionnel open source pour le streaming LIVE compatible TikTok avec des fonctionnalités étendues pour les créateurs de contenu. L'outil fournit une intégration complète des événements LIVE TikTok dans OBS Studio avec overlays, alertes, synthèse vocale, soundboard et automatisation d'événements.

### ✨ Caractéristiques Clés

- **🔒 100% Local** - Pas de services cloud, pas de connexion requise
- **🎨 Overlays Professionnels** - Sources de navigateur Full-HD pour OBS Studio
- **🔌 Système de Plugins Modulaire** - Facilement extensible via des plugins
- **🌍 Multi-langue** - Interface utilisateur en allemand et anglais
- **⚡ Mises à Jour en Temps Réel** - Communication en direct basée sur WebSocket
- **🎭 Automatisation d'Événements** - Règles "si-alors" sans code

### 🎤 Pour qui est cet outil ?

- **Streamers TikTok LIVE** - Overlays et alertes professionnels
- **Créateurs de Contenu** - Automatisation d'événements et interactivité
- **Streamers VRChat** - Intégration OSC pour le contrôle d'avatar
- **Streamers Multi-invités** - Intégration VDO.Ninja pour les interviews
- **Développeurs** - Système de plugins modulaire pour extension

### 🚀 Fonctions Principales

#### 1. Intégration TikTok LIVE

Connexion en temps réel aux streams LIVE TikTok avec tous les événements :

- ✅ **Cadeaux** - Cadeaux avec pièces, suivi des combos, catalogue de cadeaux
- ✅ **Chat** - Messages avec photos de profil et badges
- ✅ **Abonnements** - Nouveaux abonnés avec suivi des rôles
- ✅ **Partages** - Partages de stream avec informations utilisateur
- ✅ **J'aime** - Événements de j'aime avec comptage
- ✅ **Souscriptions** - Souscripteurs avec niveaux

#### 2. Synthèse Vocale (TTS)

Système TTS professionnel avec plus de 100 voix :

- 🎙️ **75+ Voix TikTok** - Gratuit, pas de clés API requises
- 🎙️ **30+ Voix Google Cloud** - Optionnel avec clé API
- 👤 **Mappages de Voix Utilisateur** - Les utilisateurs obtiennent leurs propres voix assignées
- 📝 **Auto-TTS pour Chat** - Lecture automatique des messages de chat
- 🚫 **Filtre de Liste Noire** - Exclure mots/utilisateurs
- 🎚️ **Volume et Vitesse** - Ajuster le volume et la vitesse

#### 3. Système d'Alertes

Alertes personnalisables pour tous les événements TikTok :

- 🔊 **Son + Texte + Animation** - Alertes entièrement configurables
- 🖼️ **Images et GIFs** - Graphiques d'alerte personnalisés
- ⏱️ **Contrôle de Durée** - Définir la durée d'affichage des alertes
- 🎨 **Modèles Personnalisés** - Balises comme `{username}`, `{giftName}`, `{coins}`
- 🧪 **Mode Test** - Tester les alertes avant le stream

#### 4. Soundboard

Plus de 100 000 sons avec mappage de cadeaux :

- 🔍 **Intégration MyInstants** - Accès à une énorme bibliothèque de sons
- 🎁 **Mappage Cadeau-vers-Son** - Rose → Son A, Lion → Son B
- 🎵 **Sons d'Événements** - Sons pour Follow, Subscribe, Share
- ⚡ **Système de Seuil de J'aime** - Déclencher des sons à X j'aime
- 📦 **Téléchargement Personnalisé** - Télécharger vos propres MP3
- ⭐ **Favoris et Tendances** - Organiser les sons

#### 5. Objectifs et Barres de Progression

4 objectifs séparés avec overlays de source de navigateur :

- 📊 **Objectif de J'aime** - Objectif de j'aime avec barre de progression
- 👥 **Objectif d'Abonnés** - Objectif d'abonnés avec suivi
- 💎 **Objectif de Souscriptions** - Objectif de souscripteurs
- 🪙 **Objectif de Pièces** - Objectif de pièces (dons)
- 🎨 **Styles Personnalisés** - Personnaliser couleurs, dégradés, étiquettes
- ➕ **Ajouter/Définir/Incrémenter** - Sélection de mode flexible

#### 6. Automatisation d'Événements (Flows)

Automatisations "si-alors" sans code :

- 🔗 **Déclencheurs** - Cadeau, Chat, Follow, Subscribe, Share, Like
- ⚙️ **Conditions** - Conditions avec opérateurs (==, !=, >=, <=, contains)
- ⚡ **Actions** - TTS, Alerte, Scène OBS, OSC, Requête HTTP, Délai
- 🧩 **Multi-Étapes** - Plusieurs actions en séquence
- ✅ **Mode Test** - Tester les flows avant le stream

**Exemple de Flow :**
```
Déclencheur : Cadeau == "Rose"
Actions :
  1. TTS : "Merci {username} pour la Rose !"
  2. Scène OBS : Passer à "Cam2"
  3. OSC : Geste de salut dans VRChat
```

### 💻 Stack Technologique

| Catégorie | Technologie | Version |
|-----------|-------------|---------|
| **Backend** | Node.js | >=18.0.0 <24.0.0 |
| **Framework Web** | Express | ^4.18.2 |
| **Temps Réel** | Socket.io | ^4.6.1 |
| **Base de Données** | SQLite (better-sqlite3) | ^11.9.0 |
| **API TikTok** | tiktok-live-connector | ^2.1.0 |
| **Intégration OBS** | obs-websocket-js | ^5.0.6 |
| **Protocole OSC** | osc | ^2.4.5 |
| **Logging** | winston | ^3.18.3 |
| **Frontend** | Bootstrap 5 | 5.3 |
| **Icônes** | Font Awesome | 6.x |

### ⚡ Démarrage Rapide

1. Installer Node.js 18-23
2. Cloner le dépôt : `git clone https://github.com/Loggableim/pupcidslittletiktoolhelper_desktop.git`
3. Installer les dépendances : `npm install`
4. Démarrer le serveur : `npm start` ou `npm run start:electron`
5. Ouvrir le dashboard : `http://localhost:3000`
6. Se connecter à TikTok LIVE avec votre nom d'utilisateur

**Terminé !** 🎉 Tous les événements sont maintenant affichés en direct.

### 📄 Licence

Ce projet est sous licence **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)**.

---

*Dernière mise à jour : 2025-12-11*  
*Version : 1.2.1*
