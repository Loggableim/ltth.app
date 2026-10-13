# L-005 Music Bot Evidence Review

Scope: compare the available technical and audible evidence for Zielbild 1, Punkt 1. This report does not claim human-confirmed music playback where only test telemetry exists.

Reviewed sources:

- [Draft PR #128](https://github.com/Loggableim/ltth.app/pull/128), head `4eb307081a38e9cf5169663fd9e428c0ba7fae06`.
- `app/test/music-bot-playback-mpv-integration.test.js` in PR #128.
- L-003 user checklist and safety correction in [the L-003 task thread](https://lastbrowser.slack.com/archives/C0C8F9NCS7L/p1791771777739189?thread_ts=1791771777.739189&cid=C0C8F9NCS7L).
- Riff's independent L-004 review: [review message](https://lastbrowser.slack.com/archives/C0C99RT0UHW/p1791886863878789).

| Function | Concrete evidence / basis | Technical or audible | Result | Remaining gap |
|---|---|---|---|---|
| MPV start and IPC | PR #128 focused real-MPV integration, v0.41.0 on Windows 10.0.26200; local WAV fixtures and `--ao=null`; heartbeat and IPC assertions. | Technical | Passed in the reported focused run. | No audible output was proven by null-audio tests. |
| Queue order | Integration test starts two locally generated WAVs; asserts one `track-start` for each in A-then-B order and one active process after the second starts. | Technical | Passed in the reported focused run. | No user-heard track transition evidence. |
| Pause / resume | Integration test pauses the local fixture and resumes it; checks playback state and lifecycle. | Technical | Passed in the reported focused run. | Audible pause/resume on user-owned music remains unverified. |
| Seek | Integration test performs forward seek and seek while paused; checks the acknowledged position/state. | Technical | Passed in the reported focused run. | Audible seek on user-owned music remains unverified. |
| Volume | Real MPV IPC reads back zero and a non-zero value (37) after setting volume. | Technical | Passed in the reported focused run. | Human-confirmed audible level change remains unverified. |
| Heartbeat | Real MPV heartbeat succeeds during the integration scenario. | Technical | Passed in the reported focused run. | Does not prove provider availability or live-stream stability. |
| Stop / destroy | Test checks empty slots, null engine PID, owned process exit, and IPC endpoint removal; the documented no-op-shutdown counterprobe went red and cleanup then confirmed the process exited. | Technical | Passed; negative counterprobe behaved as expected. | No human audio-stop observation. |
| L-003 checklist | The checklist is in the L-003 thread. It records a user-confirmed synthetic 440 Hz test tone at software volume 60, explicitly separated from provider music. It says the UI has no local-file opener and forbids replacing the local-source check with YouTube search/request. | Audible, but synthetic test-tone only | The test-tone path has historical user confirmation; provider music is not verified. | No current human-confirmed audible music-track run. |

## Acceptance status

Technical MPV, IPC, queue, pause/resume, seek, volume, heartbeat, stop, and destroy evidence is present in PR #128. These are source/test results and must not be presented as an audible music acceptance.

**BLOCKED — open user test:** there is no current human-confirmed audible run of a permitted music track. The existing L-003 checklist reports no local-file opener and prohibits substituting network/provider playback. The single action needed is for Cid to make an approved user-owned local track available through a permitted local playback path and report the audible playback, pause/resume, seek, volume, skip/queue, and stop results. Until then, all track-dependent audible criteria remain `nicht verifiziert`.

No audio was played for this review. No OBS, TikTok, LIVE, network, or production profile was used.

## Verification provenance

Riff's review of PR #128 recorded the focused command as `npm test -- --runInBand --forceExit test/music-bot-playback-mpv-integration.test.js test/music-bot-playback-controller.test.js test/music-bot-process-registry.test.js`, exit 0, 3 suites, 89/89 tests. Riff also recorded MPV v0.41.0 on Windows 10.0.26200 and all seven owned PIDs exited. This is inherited evidence from that exact PR head; no tests were rerun for this evidence-only report.
