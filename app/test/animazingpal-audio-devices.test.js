const childProcess = require('child_process');

jest.mock('child_process', () => ({
  execFile: jest.fn()
}));

const { listAudioOutputDevices } = require('../plugins/animazingpal/brain/audio-devices');

describe('AnimazingPal audio device discovery', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('lists active Windows playback endpoints for UI fallback', async () => {
    childProcess.execFile.mockImplementation((command, args, options, callback) => {
      callback(null, JSON.stringify([
        {
          Status: 'OK',
          FriendlyName: 'CABLE In 16 Ch (VB-Audio Virtual Cable)',
          InstanceId: 'SWD\\MMDEVAPI\\{0.0.0.00000000}.{1F80755B-DE47-4329-AFF3-B28D200D9B60}'
        },
        {
          Status: 'OK',
          FriendlyName: 'CABLE Output (VB-Audio Virtual Cable)',
          InstanceId: 'SWD\\MMDEVAPI\\{0.0.1.00000000}.{BFFD1E90-C01F-4D9E-B0E7-06409BD81BCE}'
        }
      ]));
    });

    await expect(listAudioOutputDevices()).resolves.toEqual([
      {
        deviceId: 'CABLE In 16 Ch (VB-Audio Virtual Cable)',
        label: 'CABLE In 16 Ch (VB-Audio Virtual Cable)',
        source: 'system'
      }
    ]);
  });
});
