# Music Bot validation guide

Use this guide when checking playback behavior or reporting Music Bot evidence. Keep automated engine checks separate from human listening results.

## Focused technical checks

Install the app dependencies first if `app/node_modules` is absent. From the repository root, run:

```powershell
cd app
npm test -- --runInBand --forceExit test/music-bot-playback-mpv-integration.test.js test/music-bot-playback-controller.test.js test/music-bot-process-registry.test.js
```

The real-MPV integration cases use local generated WAV fixtures and a null audio output. They check MPV startup and IPC, heartbeat, seek, pause/resume, volume readback, track order, crossfade, stop, process cleanup, and IPC endpoint cleanup. A passing run is technical evidence; null audio and generated fixtures do not establish that a person heard music.

When MPV is not installed or its executable cannot be started, the integration cases report a readable skip. Record that as an unavailable real-MPV run, not as playback acceptance.

For each technical run, record:

- The exact command, exit code, suite and test counts.
- MPV version and operating system when the real-MPV cases ran.
- The test-owned process IDs and whether each exited.
- Any skipped cases and why they skipped.

## Human listening check

Human listening is a separate acceptance step. Use only a music file the user owns and has made available through an approved local playback path. A synthetic test tone verifies only the test-tone path; it does not verify music-track playback or a provider.

If the UI offers no permitted local source, stop the track-dependent check and report `nicht verifiziert: keine zulässige lokale Quelle verfügbar`. Do not replace it with a YouTube search, a song request, a third-party stream, or any other network/provider action. Ask the user to provide an approved local source and report what they actually heard for playback, pause/resume, seek, volume, queue/skip, and stop.

Do not use TikTok/LIVE, OBS, public tunnels, production profiles, or user credentials for these checks. Report human observations as user-reported, and do not infer them from logs, IPC state, test output, or UI status alone.
