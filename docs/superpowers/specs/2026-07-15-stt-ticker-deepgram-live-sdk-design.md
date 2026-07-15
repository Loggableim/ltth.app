# STT Ticker Deepgram Live SDK Design

**Date:** 2026-07-15
**Status:** Approved design, pending implementation
**Scope:** `app/plugins/stt-ticker`, `app/package.json`, and focused tests under `app/test`

## Goal

Replace the STT Ticker's hand-written Deepgram HTTP integration with the official `@deepgram/sdk` and make the Deepgram capture path use a real, persistent WebSocket transcription stream.

Fish.audio and ElevenLabs keep their existing HTTP upload and chunk behavior. The existing client-side silence filter remains active for every provider and becomes frame-aware for the Deepgram live path.

## Current Problems

The existing Deepgram implementation is not usable:

- The configured provider is currently Fish.audio, so ordinary capture never reaches Deepgram.
- The connection test calls the nonexistent top-level `/v1/usage` endpoint and returns HTTP 404 for a valid key.
- The pre-recorded client sends unsupported query parameters, including `encoding=auto` and `threshold`.
- It wraps audio in multipart form data although Deepgram expects binary audio for file transcription.
- Plugin status and config responses expose stored API keys to browser clients.
- The capture page only submits complete WAV chunks and has no live transcription transport.

The supplied Deepgram key was independently verified against Deepgram authentication and pre-recorded transcription. The key is valid; the LTTH integration is the failing component.

## Selected Architecture

### Provider split

The effective provider controls the capture transport:

- `deepgram`: persistent live stream through the official Deepgram SDK.
- `fish.audio`: unchanged WAV chunk upload to `/api/stt-ticker/transcribe`.
- `elevenlabs`: unchanged WAV chunk upload to `/api/stt-ticker/transcribe`.
- `auto`: resolve with the existing provider rules; if the result is Deepgram, use the live stream.

Provider selection is read when capture starts. A provider change while capture is running requires the capture session to restart, avoiding two active transports and duplicate captions.

### Server-owned Deepgram sessions

The API key remains server-side. The browser never connects directly to Deepgram.

A new backend component owns Deepgram streaming sessions. It wraps `@deepgram/sdk` and maintains one session per Socket.IO capture socket. Sessions are keyed by `socket.id`, so audio from simultaneous capture windows cannot be mixed.

The component has a small testable interface:

- `start(socket, options)`: validate configuration and open the SDK WebSocket.
- `sendAudio(socketId, pcmBuffer)`: forward validated PCM frames to the correct stream.
- `stop(socketId, reason)`: finalize and close one stream.
- `destroy()`: close every stream and timer during plugin reload or shutdown.

SDK construction and timers are injectable in unit tests. Production uses `DeepgramClient` from `@deepgram/sdk`.

### Socket.IO protocol

The capture page and plugin use these events:

- `stt-ticker:deepgram-start`: client requests a stream and supplies the actual sample rate and channel count.
- `stt-ticker:deepgram-audio`: client sends a binary Linear16 frame.
- `stt-ticker:deepgram-stop`: client requests finalization and shutdown.
- `stt-ticker:deepgram-status`: server reports connecting, open, reconnecting, stopped, or error state to the owning capture socket.
- `stt-ticker:interim`: server broadcasts an ephemeral transcript for capture preview and overlays.

Start and stop use Socket.IO acknowledgements so the UI can distinguish a configured stream from a failed one. Audio events do not use per-frame acknowledgements because they would add latency and backpressure noise.

All incoming audio payloads are type-checked and size-limited before forwarding. Audio from a socket without an open session is rejected and counted, not buffered without bounds.

### Deepgram streaming options

The live connection uses the existing STT settings where possible:

- model: configured `deepgramModel` (initially `nova-2`)
- encoding: `linear16`
- sample rate: actual capture `AudioContext.sampleRate`
- channels: `1`
- `interim_results`: enabled
- punctuation and smart formatting: enabled
- language: configured fixed language, otherwise the existing multilingual mode
- endpointing: derived from `silenceTimeoutMs`
- utterance end: at least 1000 ms and aligned with `vad.sustainedSilenceMs`
- VAD events: enabled where supported by the selected model

Only SDK-supported options are passed. No `encoding=auto`, custom `threshold`, or multipart body is constructed manually.

## Silence Filtering

### Fish.audio and ElevenLabs

Their behavior remains unchanged. The capture page evaluates each accumulated chunk and skips chunks that fail the configured RMS and speech-ratio thresholds.

### Deepgram

Deepgram uses the same configured RMS and speech-ratio values, evaluated on short capture frames rather than waiting for a full WAV chunk.

The browser maintains three states:

1. **Silent:** retain a short rolling pre-roll but do not transmit old silence.
2. **Speaking:** when VAD triggers, transmit the pre-roll and current frame, then continue transmitting speech frames.
3. **Hangover:** after speech stops, transmit trailing frames until `sustainedSilenceMs` is reached so Deepgram can finalize the utterance. Suppress longer silence afterward.

The pre-roll prevents initial consonants from being clipped. The hangover supplies enough silence for Deepgram endpointing. While long silence is suppressed, the backend uses the SDK's keepalive mechanism so the Deepgram WebSocket remains open without charging for an endless silent audio stream.

PCM conversion is explicit: normalized float samples become signed little-endian 16-bit mono samples. WAV headers are not sent on the live path.

## Transcript Processing

### Interim results

Interim Deepgram results are ephemeral:

- The current finalized prefix and latest interim suffix are combined for display.
- They are emitted through `stt-ticker:interim`.
- The overlay and capture preview replace the previous interim text instead of appending it.
- Interim text is never translated, placed in the persistent text buffer, or sent to VRChat.
- When a final utterance is committed, the corresponding interim display is cleared.

The overlay honors its existing `showInterim` setting.

### Final results

Deepgram can emit several `is_final` fragments before `speech_final`. The session component accumulates final fragments by timing and flushes them exactly once when:

- a result has `speech_final=true`, or
- an `UtteranceEnd` message arrives with unflushed final text, or
- the stream is deliberately finalized during capture stop.

Duplicate or empty fragments are ignored.

The plugin extracts the existing post-ASR logic from `_processAudio` into a provider-neutral transcript-processing method. Both uploaded chunk transcripts and Deepgram final live transcripts then use the same:

- minimum-length check
- language classification and whitelist filtering
- hallucination filtering
- translation
- multilingual segment routing
- text buffer insertion
- overlay emission
- VRChat queueing
- diagnostics

This prevents the live path from becoming a second, behaviorally different caption pipeline.

## SDK Batch Compatibility and Key Test

The hand-written `deepgram-client.js` is replaced by an SDK-backed adapter rather than retained as an HTTP implementation.

Its pre-recorded method uses the SDK's file transcription API for compatibility with tests and any non-capture caller that still submits a complete recording. The primary capture path does not use this method.

The Deepgram connection-test route uses an SDK authentication operation. It must distinguish:

- valid key
- rejected credentials
- missing permission where relevant
- timeout or network failure

No test response contains tokens, project details, or the API key.

## Secrets

Stored secrets are never returned verbatim from STT Ticker status or config routes.

The following fields are replaced with the existing `__KEEP__` sentinel in browser-facing configuration:

- `asr.deepgramApiKey`
- `asr.elevenlabsApiKey`
- `asr.fishaudioApiKey`
- `translation.apiKey`

Save routes continue to interpret `__KEEP__` as "do not overwrite the stored value." Model-discovery requests use the server-side stored key and no longer place translation keys in query strings.

The UI derives configured/not-configured state from explicit boolean status fields, not from secret values.

## Failure and Lifecycle Handling

- A Deepgram failure is surfaced clearly in the capture window and diagnostics.
- The system does not silently switch an active Deepgram session to Fish.audio because doing so could duplicate or reorder captions.
- While capture remains active, unexpected Deepgram disconnects retry with bounded backoff. A generation identifier prevents callbacks from an old connection affecting a replacement session.
- Audio received while reconnecting is bounded to the short client pre-roll; the server does not maintain an unbounded audio queue.
- Browser stop, browser disconnect, microphone change, provider change, plugin reload, and server shutdown all finalize or close the associated stream and clear timers.
- Repeated start events from the same socket replace the previous session safely.
- Keepalive messages are sent only through the SDK's control mechanism, never as audio data.

## Dependency Strategy

Add the official `@deepgram/sdk` v5 package to `app/package.json` and `app/package-lock.json`. The maintained LTTH runtime uses Node 22, which satisfies the SDK's Node 18+ requirement.

The package is used from the existing CommonJS codebase through its documented CommonJS-compatible export. No application-wide module-system migration is included.

## Testing Strategy

Implementation follows red-green-refactor.

### SDK adapter tests

- passes a binary audio buffer and only supported options to SDK file transcription
- parses a successful SDK response into the existing transcript shape
- normalizes SDK authentication, API, timeout, and network errors without exposing credentials
- connection test uses the SDK rather than `/v1/usage`

### Live session tests

- creates one SDK stream per capture socket
- configures Linear16, sample rate, language, model, interim results, and endpointing correctly
- forwards binary audio only to the owning stream
- sends SDK keepalive while silence is suppressed
- combines interim display text without committing it
- accumulates multiple final fragments and flushes one final utterance
- handles `UtteranceEnd` without double submission
- reconnects with bounded backoff and ignores stale connection callbacks
- closes sessions and timers on stop, disconnect, replacement, and plugin destroy

### Capture/VAD tests

Pure audio helpers are extracted so they can be tested without a microphone:

- Float32 to Linear16 conversion
- frame-level RMS and speech-ratio evaluation
- pre-roll inclusion at speech start
- hangover behavior after speech ends
- long-silence suppression
- provider routing leaves Fish.audio and ElevenLabs on the existing upload path

### Plugin integration tests

- Socket.IO start/audio/stop handlers delegate to the live-session component
- interim events do not mutate the text buffer or trigger translation/VRChat
- final live transcripts use the same post-processing path as uploaded transcripts
- browser-facing status and config data mask every secret
- `__KEEP__` preserves stored values on save

### Verification

Run the focused STT Ticker tests first, then the relevant plugin suite, lint, and the full test suite if focused checks are green.

Live verification uses the configured valid Deepgram key and the maintained runtime:

1. Reload only the STT Ticker plugin where possible.
2. Select Deepgram and start capture.
3. Confirm a persistent SDK WebSocket opens.
4. Speak test phrases and observe low-latency interim replacement.
5. Confirm one final buffered caption per utterance.
6. Remain silent longer than the configured threshold and confirm audio suppression plus a live connection.
7. Resume speaking and confirm the same session continues.
8. Switch to Fish.audio and confirm the original WAV chunk path still works.

## Success Criteria

- The Deepgram capture path uses an official SDK WebSocket, not repeated prerecorded HTTP requests.
- Deepgram interim text appears live and is replaced rather than duplicated.
- Only final utterances reach translation, persistent captions, and VRChat.
- The existing silence settings suppress long silent audio on the Deepgram path without clipping speech starts or closing the stream.
- Fish.audio and ElevenLabs retain their current chunk behavior.
- A valid key passes the SDK-based connection test.
- No STT Ticker status or config response exposes stored API keys.
- Stopping capture, disconnecting the browser, and reloading the plugin leave no Deepgram connections or timers behind.
- Focused automated tests and live runtime verification pass.

## Non-Goals

- Sending the Deepgram API key to the browser.
- Replacing Socket.IO with a new browser-to-server transport.
- Changing Fish.audio or ElevenLabs transcription semantics.
- Reworking the translation provider or overlay design system.
- Introducing a general-purpose streaming framework outside STT Ticker.
- Automatically rotating the exposed Deepgram key; the user must rotate it separately after the integration is verified.
