jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  readFileSync: jest.fn()
}));

const fs = require('fs');
const AsrPipeline = require('../plugins/stt-ticker/backend/asr-pipeline');

function createPipeline(asr = {}) {
  return new AsrPipeline({}, { asr }, { info() {}, warn() {}, error() {}, debug() {} });
}

describe('STT Ticker ASR credential resolution', () => {
  const originalEnvironment = {
    DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
    ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
    FISHAUDIO_API_KEY: process.env.FISHAUDIO_API_KEY
  };

  beforeEach(() => {
    fs.existsSync.mockReset().mockReturnValue(false);
    fs.readFileSync.mockReset();
    process.env.DEEPGRAM_API_KEY = 'deepgram-environment-secret';
    process.env.ELEVENLABS_API_KEY = 'elevenlabs-environment-secret';
    process.env.FISHAUDIO_API_KEY = 'fish-environment-secret';
  });

  afterAll(() => {
    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  test('uses config, file, and environment credentials with safe source metadata', () => {
    fs.existsSync.mockImplementation(filePath => String(filePath).endsWith('fishaudio.key'));
    fs.readFileSync.mockReturnValue('fish-file-secret\n');
    const pipeline = createPipeline({ deepgramApiKey: 'deepgram-config-secret' });

    expect(pipeline.getCredentialStatus()).toEqual({
      deepgram: { configured: true, source: 'config' },
      elevenlabs: { configured: true, source: 'environment' },
      fishaudio: { configured: true, source: 'file' }
    });
    expect(pipeline.getDeepgramApiKey()).toBe('deepgram-config-secret');
    expect(pipeline.getElevenLabsApiKey()).toBe('elevenlabs-environment-secret');
    expect(JSON.stringify(pipeline.getStatus())).not.toContain('secret');
  });
});
