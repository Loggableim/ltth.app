# 🇪🇸 Español

¡Bienvenido a **PupCid's Little TikTool Helper**!

Esta es una herramienta gratuita y de código abierto para transmisiones profesionales en TikTok LIVE con características completas para creadores de contenido.

### Enlaces Rápidos
- [Primeros Pasos](./Getting-Started.md#español)
- [Instalación](./Installation-&-Setup.md#español)
- [Lista de Plugins](./Plugin-Liste.md#español)
- [FAQ](./FAQ-&-Troubleshooting.md#español)

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
| **Backend** | Node.js | >=18.0.0 <25.0.0 |
| **Framework Web** | Express | ^4.18.2 |
| **Tiempo Real** | Socket.io | ^4.6.1 |
| **Base de Datos** | SQLite (better-sqlite3) | ^11.9.0 |
| **API TikTok** | EulerStream SDK | adaptadores de app |
| **Integración OBS** | obs-websocket-js | ^5.0.6 |
| **Protocolo OSC** | osc | ^2.4.5 |
| **Logging** | winston | ^3.18.3 |
| **Frontend** | Bootstrap 5 | 5.3 |
| **Iconos** | Font Awesome | 6.x |

### ⚡ Inicio Rápido

1. Instalar Node.js 18-23
2. Clonar repositorio: `git clone https://github.com/Loggableim/ltth.app.git`
3. Entrar en la carpeta runtime: `cd app`
4. Instalar dependencias: `npm install`
5. Iniciar servidor: `npm start`
6. Abrir dashboard: `http://localhost:3000/dashboard.html`
6. Conectar a TikTok LIVE con tu nombre de usuario

**¡Listo!** 🎉 Todos los eventos se muestran ahora en vivo.

### 📄 Licencia

Este proyecto está licenciado bajo la licencia **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)**.

---

*Última actualización: 2026-07-26*
*Versión: 1.4.1*

---
