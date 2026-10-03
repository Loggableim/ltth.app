const axios = require('axios');
jest.mock('axios');
const ElevenLabsAsrClient = require('../plugins/stt-ticker/backend/asr/elevenlabs-client');
const FishAsrClient = require('../plugins/tts/engines/fish-asr-client');
const DeepgramAsrClient = require('../plugins/stt-ticker/backend/asr/deepgram-client');

test('Nova-3 multilingual requests carry sanitized stream vocabulary', async () => {
  const transcribeFile = jest.fn().mockResolvedValue({ results: { channels: [{ alternatives: [{ transcript: 'Hallo TikTok' }] }] } });
  const client = new DeepgramAsrClient('test-key', null, { clientFactory: () => ({ listen: { v1: { media: { transcribeFile } } } }) });
  await client.transcribe(Buffer.from('audio'), { language: 'auto', keyterms: [' LTTH ', 'TikTok', '', 'LTTH', null] });
  expect(transcribeFile.mock.calls[0][1]).toMatchObject({ language: 'multi', model: 'nova-3', keyterm: ['LTTH', 'TikTok'] });
});

test('ElevenLabs reads ISO-3 language codes and sends fixed language only when supplied', async () => {
  axios.post.mockResolvedValue({ data: { text: 'Hello world', language_code: 'eng', language_probability: 0.99 } });
  const client = new ElevenLabsAsrClient('test-key');
  expect(await client.transcribe(Buffer.from('audio'), { language: 'en' })).toMatchObject({ language: 'en' });
  const form = axios.post.mock.calls.at(-1)[1].getBuffer().toString();
  expect(form).toContain('name="language_code"');
  expect(form).toContain('name="tag_audio_events"');
  expect(client._parseResponse({ text: 'Hallo', language_code: 'deu' }, 'scribe_v2').language).toBe('de');
});

test('Fish Pro is selected by HTTP header on both transports', async () => {
  axios.post.mockResolvedValue({ data: { text: 'Hallo hello', duration: 1, segments: [] } });
  const client = new FishAsrClient('test-key');
  await client.transcribe(Buffer.from('audio'), { model: 'transcribe-1-pro' });
  expect(axios.post.mock.calls.at(-1)[2].headers.model).toBe('transcribe-1-pro');
  await client._postMultipart(Buffer.from('audio'), { model: 'transcribe-1-pro', ignoreTimestamps: true }, 1000);
  expect(axios.post.mock.calls.at(-1)[2].headers.model).toBe('transcribe-1-pro');
});
