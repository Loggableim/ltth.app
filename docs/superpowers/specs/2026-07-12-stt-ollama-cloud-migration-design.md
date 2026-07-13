# STT Ollama Cloud Migration Design

## Goal

Make STT Ticker translations work with the current Ollama Cloud API while preserving existing saved translation settings where they are still valid.

## Evidence

- The live plugin configuration enabled multi-language translation (German to English and French) with `nemotron-3-nano`.
- Requests to the legacy `https://api.ollama.cloud/v1/chat/completions` timed out after both 30 and 60 seconds.
- The current official native API at `https://ollama.com/api/chat` replied immediately, but correctly rejected `nemotron-3-nano` because it no longer exists.
- The configured account accepts `deepseek-v4-flash`; a German-to-English translation completed successfully in 934 ms.

## Design

`backend/translator.js` will use Ollama's native Cloud API: `GET /api/tags` for models and `POST /api/chat` for translations. Chat requests use `stream: false`, `think: false`, and read `message.content` from the native response.

New configurations default to `deepseek-v4-flash`. When loading a saved configuration, the exact known legacy model IDs are migrated to that default so existing users with broken STT translation recover automatically. Any other user-selected model is retained.

The existing single- and multi-language public methods and fallback behavior remain unchanged. On provider failure they still return the original/no translation, but their warning identifies the failed cloud request.

## Test Strategy

Add translator unit coverage that asserts native endpoint URLs and payloads, native response extraction, tag-model parsing, and migration of the known legacy default. Run the focused suite before and after the implementation, then run the closest plugin tests.
