# STT quality improvements

The capture gate now forwards short utterances immediately and retains 300 ms
of quiet onset audio. Existing minChunkMs settings no longer suppress short live
replies. RMS gating remains a noise heuristic, not a trained speech detector.

Fish and ElevenLabs uploads prefer a 900 ms pause after at least 600 ms of audio,
with a 12-second maximum during uninterrupted speech. Frame-level upload VAD
preserves brief speech surrounded by silence. Uploads remain sequential; prolonged
provider delays can increase buffering and latency. The final audio is flushed on
Stop. Audio is not duplicated across requests.

STT explicitly requests Fish transcribe-1-pro through the shared ASR adapter.
Other adapter consumers keep transcribe-1 unless they request Pro. Pro may have
different billing; it can be overridden with asr.fishaudioModel='transcribe-1'.

Deepgram Nova-3 automatic mode continues to use language=multi for German/English
code switching. The settings page exposes comma-separated names and vocabulary;
these are sent as keyterm on both live and upload requests. No provider is switched
automatically, and no saved credentials are changed.

ElevenLabs remains batch Scribe v2. Its model label is corrected, fixed language
hints are honored, audio-event tags are disabled for captions, and returned
language_code values eng/deu are normalized correctly. Real-time ElevenLabs and
a trained VAD are follow-up integrations, not part of this change.

Use the project runtime Node 22 for tests (the SQLite addon uses ABI 127).
A real bilingual microphone recording is still required to measure word errors,
code-switching accuracy, subtitle delay, and provider costs. Unit tests validate
transport/options and audio preservation, not recognition quality for a voice.


## Verification on 2026-10-03

All 23 STT/Fish suites passed with the bundled Node 22 runtime (127 tests).
An additional live keyterm regression test and audio input guard were then checked
with the two affected suites (18 tests passed).

A 15.31-second synthetic WAV combined German, English and the mixed phrase
"Ich brauche einen new follower alert und danach geht es weiter". Real Deepgram
Nova-3 multilingual batch and live requests, including keyterms, both transcribed
all spoken words. Capitalization and punctuation varied. The API key was supplied
only in process memory and was not saved in the repository or configuration.
This is a synthetic API integration check, not a microphone or accent benchmark.
