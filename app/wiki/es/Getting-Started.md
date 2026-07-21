# 🇪🇸 Español

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
git clone https://github.com/Loggableim/ltth.app.git
cd ltth.app

# Instalar dependencias
npm install

# Iniciar app de escritorio
npm start
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

**4. Spotlight** (Recomendado)
```
Dashboard → Plugins → Spotlight → Enable
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

Ver **[Lista de Plugins](./Plugin-Liste.md#español)** para todos los 35 Plugins disponibles.

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

**3. Sistema de XP de Espectadores:**
```
Dashboard → Plugins → Viewer XP System → Enable
→ Configurar recompensas de XP
→ Agregar overlay de leaderboard
```

#### Leer Documentación

- **[Lista de Plugins](./Plugin-Liste.md#español)** - todos los 35 Plugins en detalle
- **[Configuración](./Konfiguration.md#español)** - Configuración avanzada
- **[FAQ & Troubleshooting](./FAQ-&-Troubleshooting.md#español)** - Resolver problemas comunes

---

### 🎉 ¡Buena Suerte con Tu Transmisión!

¡Ahora estás listo para tu primera transmisión profesional de TikTok LIVE con Little TikTool Helper!

**Consejos para Comenzar:**
- Prueba todo **antes** de tu primera transmisión en vivo
- Usa **Test Alerts** y **Test TTS**
- Comienza con pocos plugins y expande gradualmente
- Lee **[FAQ & Troubleshooting](./FAQ-&-Troubleshooting.md#español)** si tienes problemas

---

[← Home](Home#español) | [→ Installation & Setup](Installation-&-Setup#español)

---

*Última actualización: 2025-12-11*
*Versión: 1.2.1*

---
