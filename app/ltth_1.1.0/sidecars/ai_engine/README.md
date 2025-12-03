# LTTH Rust AI Engine Sidecar

## Overview

This document specifies the CLI contract and integration strategy for the optional Rust-based AI/TTS sidecar binary that can be used with LTTH Electron.

The sidecar provides high-performance AI inference, text-to-speech, and audio processing capabilities that run outside the Node.js/Electron process for better performance and crash isolation.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ELECTRON MAIN PROCESS                     │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                   SidecarManager                        ││
│  │  - spawn()      → Start sidecar binary                 ││
│  │  - send()       → Send JSON via stdin                  ││
│  │  - receive()    → Read JSON from stdout                ││
│  │  - health()     → Check sidecar health                 ││
│  │  - terminate()  → Graceful shutdown                    ││
│  └────────────────────────┬────────────────────────────────┘│
│                           │ stdin/stdout (JSON)             │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │              RUST SIDECAR BINARY                        ││
│  │              ltth-ai-engine[.exe]                       ││
│  │                                                         ││
│  │  Commands:                                              ││
│  │  - tts       Text-to-Speech synthesis                  ││
│  │  - stt       Speech-to-Text transcription              ││
│  │  - llm       Local LLM inference                       ││
│  │  - audio     Audio processing                          ││
│  │  - health    Health check                              ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

---

## Binary Naming Convention

The sidecar binary follows platform-specific naming:

| Platform | Architecture | Binary Name |
|----------|--------------|-------------|
| Windows | x64 | `ltth-ai-engine-win32-x64.exe` |
| Windows | arm64 | `ltth-ai-engine-win32-arm64.exe` |
| macOS | x64 | `ltth-ai-engine-darwin-x64` |
| macOS | arm64 | `ltth-ai-engine-darwin-arm64` |
| Linux | x64 | `ltth-ai-engine-linux-x64` |
| Linux | arm64 | `ltth-ai-engine-linux-arm64` |

---

## CLI Contract

### General Usage

```bash
ltth-ai-engine <COMMAND> [OPTIONS]
```

### Commands

#### 1. Health Check

```bash
ltth-ai-engine health
```

**Output (stdout):**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "capabilities": ["tts", "stt", "audio"],
  "gpu_available": true,
  "gpu_name": "NVIDIA GeForce RTX 3080",
  "memory_mb": 16384,
  "models_loaded": ["tts-base", "whisper-small"]
}
```

**Exit Codes:**
- `0` - Healthy
- `1` - Unhealthy/Error

---

#### 2. Text-to-Speech (TTS)

```bash
ltth-ai-engine tts [OPTIONS]
```

**Input (stdin):**
```json
{
  "text": "Hello, welcome to the stream!",
  "voice": "default",
  "language": "en",
  "speed": 1.0,
  "pitch": 1.0,
  "format": "wav",
  "output": "base64"
}
```

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `text` | string | required | Text to synthesize |
| `voice` | string | "default" | Voice ID or name |
| `language` | string | "en" | Language code (ISO 639-1) |
| `speed` | float | 1.0 | Speech speed (0.5-2.0) |
| `pitch` | float | 1.0 | Voice pitch (0.5-2.0) |
| `format` | string | "wav" | Output format: "wav", "mp3", "ogg" |
| `output` | string | "base64" | Output mode: "base64", "file", "stream" |
| `output_path` | string | null | File path (if output="file") |

**Output (stdout):**
```json
{
  "success": true,
  "audio": "<base64 encoded audio data>",
  "format": "wav",
  "duration_ms": 2340,
  "sample_rate": 22050,
  "channels": 1,
  "metadata": {
    "voice_used": "default",
    "language": "en",
    "characters": 32
  }
}
```

**Error Output:**
```json
{
  "success": false,
  "error": "Voice not found: unknown-voice",
  "error_code": "VOICE_NOT_FOUND"
}
```

---

#### 3. Speech-to-Text (STT)

```bash
ltth-ai-engine stt [OPTIONS]
```

**Input (stdin):**
```json
{
  "audio": "<base64 encoded audio>",
  "format": "wav",
  "language": "auto",
  "model": "whisper-small",
  "timestamps": true
}
```

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `audio` | string | required | Base64 encoded audio |
| `audio_path` | string | null | Path to audio file (alternative to audio) |
| `format` | string | "wav" | Audio format |
| `language` | string | "auto" | Language hint or "auto" |
| `model` | string | "whisper-small" | Model to use |
| `timestamps` | boolean | false | Include word timestamps |

**Output (stdout):**
```json
{
  "success": true,
  "text": "Hello, welcome to the stream!",
  "language": "en",
  "confidence": 0.95,
  "duration_ms": 2340,
  "timestamps": [
    { "word": "Hello", "start": 0.0, "end": 0.5 },
    { "word": "welcome", "start": 0.6, "end": 1.0 },
    { "word": "to", "start": 1.0, "end": 1.1 },
    { "word": "the", "start": 1.1, "end": 1.2 },
    { "word": "stream", "start": 1.2, "end": 1.8 }
  ]
}
```

---

#### 4. Audio Processing

```bash
ltth-ai-engine audio <SUBCOMMAND>
```

**Subcommands:**

##### 4.1 Normalize

```json
{
  "command": "normalize",
  "audio": "<base64>",
  "target_db": -3.0
}
```

##### 4.2 Convert

```json
{
  "command": "convert",
  "audio": "<base64>",
  "input_format": "mp3",
  "output_format": "wav",
  "sample_rate": 44100
}
```

##### 4.3 Trim Silence

```json
{
  "command": "trim_silence",
  "audio": "<base64>",
  "threshold_db": -40,
  "min_silence_ms": 100
}
```

---

#### 5. Local LLM Inference (Optional)

```bash
ltth-ai-engine llm [OPTIONS]
```

**Input (stdin):**
```json
{
  "prompt": "Generate a funny response to a viewer named @pupcid",
  "model": "phi-3-mini",
  "max_tokens": 100,
  "temperature": 0.7,
  "system": "You are a helpful TikTok stream assistant."
}
```

**Output (stdout):**
```json
{
  "success": true,
  "text": "Hey @pupcid! Thanks for joining the stream! 🐾",
  "tokens_used": 15,
  "model": "phi-3-mini",
  "finish_reason": "stop"
}
```

---

## Integration from Electron

### SidecarManager Class

```javascript
// electron/sidecar-manager.js

const { spawn } = require('child_process');
const path = require('path');
const log = require('electron-log');

class SidecarManager {
  constructor() {
    this.process = null;
    this.binaryPath = this.getSidecarPath();
    this.isHealthy = false;
  }

  getSidecarPath() {
    const platform = process.platform;
    const arch = process.arch;
    const ext = platform === 'win32' ? '.exe' : '';
    
    // In packaged app, look in resources
    const resourcePath = process.resourcesPath || path.join(__dirname, '..');
    return path.join(
      resourcePath, 
      'sidecars', 
      `ltth-ai-engine-${platform}-${arch}${ext}`
    );
  }

  async spawn(command, input) {
    return new Promise((resolve, reject) => {
      const child = spawn(this.binaryPath, [command], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
        log.warn('[Sidecar stderr]', data.toString());
      });

      child.on('error', (error) => {
        reject(new Error(`Sidecar spawn error: ${error.message}`));
      });

      child.on('close', (code) => {
        if (code === 0) {
          try {
            resolve(JSON.parse(stdout));
          } catch (e) {
            resolve({ success: true, raw: stdout });
          }
        } else {
          reject(new Error(`Sidecar exited with code ${code}: ${stderr}`));
        }
      });

      // Send input
      if (input) {
        child.stdin.write(JSON.stringify(input));
        child.stdin.end();
      } else {
        child.stdin.end();
      }
    });
  }

  async health() {
    try {
      const result = await this.spawn('health');
      this.isHealthy = result.status === 'ok';
      return result;
    } catch (error) {
      this.isHealthy = false;
      throw error;
    }
  }

  async tts(text, options = {}) {
    return this.spawn('tts', {
      text,
      voice: options.voice || 'default',
      language: options.language || 'en',
      speed: options.speed || 1.0,
      pitch: options.pitch || 1.0,
      format: options.format || 'wav',
      output: 'base64',
    });
  }

  async stt(audioBase64, options = {}) {
    return this.spawn('stt', {
      audio: audioBase64,
      format: options.format || 'wav',
      language: options.language || 'auto',
      model: options.model || 'whisper-small',
      timestamps: options.timestamps || false,
    });
  }

  async processAudio(command, audioBase64, options = {}) {
    return this.spawn('audio', {
      command,
      audio: audioBase64,
      ...options,
    });
  }

  async llm(prompt, options = {}) {
    return this.spawn('llm', {
      prompt,
      model: options.model || 'phi-3-mini',
      max_tokens: options.maxTokens || 100,
      temperature: options.temperature || 0.7,
      system: options.system,
    });
  }
}

module.exports = SidecarManager;
```

---

## Building the Sidecar (Rust)

### Cargo.toml

```toml
[package]
name = "ltth-ai-engine"
version = "1.0.0"
edition = "2021"
authors = ["PupCid"]
description = "AI/TTS Sidecar for LTTH"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
base64 = "0.21"
hound = "3.5"  # WAV processing
rubato = "0.14"  # Resampling
clap = { version = "4.4", features = ["derive"] }

# TTS (choose one)
# coqui-tts = "0.1"  # Local TTS
# piper-rs = "0.1"   # Piper TTS

# STT
# whisper-rs = "0.10"  # Whisper bindings

# LLM (optional)
# llama-cpp-rs = "0.3"  # llama.cpp bindings

[profile.release]
lto = true
codegen-units = 1
panic = "abort"
strip = true
```

### Building

```bash
# Development
cargo build

# Release (optimized)
cargo build --release

# Cross-compile for different platforms
cargo build --release --target x86_64-pc-windows-msvc
cargo build --release --target x86_64-apple-darwin
cargo build --release --target aarch64-apple-darwin
cargo build --release --target x86_64-unknown-linux-gnu
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `OK` | Success |
| `INVALID_INPUT` | Invalid JSON input |
| `MISSING_FIELD` | Required field missing |
| `VOICE_NOT_FOUND` | TTS voice not found |
| `MODEL_NOT_FOUND` | ML model not found |
| `MODEL_LOAD_FAILED` | Failed to load model |
| `AUDIO_DECODE_ERROR` | Failed to decode audio |
| `AUDIO_ENCODE_ERROR` | Failed to encode audio |
| `GPU_ERROR` | GPU initialization failed |
| `OUT_OF_MEMORY` | Insufficient memory |
| `INTERNAL_ERROR` | Internal error |

---

## Performance Targets

| Operation | Target Latency | Notes |
|-----------|----------------|-------|
| Health check | < 10ms | No model loading |
| TTS (short text) | < 500ms | ~10 words |
| TTS (long text) | < 2s | ~100 words |
| STT (5 seconds) | < 1s | Whisper small |
| Audio normalize | < 100ms | Per file |
| LLM (100 tokens) | < 5s | CPU fallback |

---

## Security Considerations

1. **No network access** - Sidecar operates offline only
2. **Sandboxed execution** - Runs with minimal permissions
3. **Input validation** - All JSON input is validated
4. **Memory limits** - Configurable memory caps
5. **Timeout handling** - Operations have max timeouts

---

## Future Extensions

1. **Voice cloning** - Custom TTS voices
2. **Real-time STT** - Streaming transcription
3. **Sentiment analysis** - Chat message analysis
4. **Moderation** - Content filtering
5. **Translation** - Real-time translation

---

*Specification Version: 1.0.0*
*Last Updated: 2025-11-27*
