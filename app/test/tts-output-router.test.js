const { createTTSOutputRouter } = require('../public/js/tts-output-router');

describe('TTS output device router', () => {
  test('routes audio to the configured output device', async () => {
    const audio = { setSinkId: jest.fn().mockResolvedValue(), muted: false, volume: 1 };
    const router = createTTSOutputRouter({
      loadConfig: async () => ({ audio: { outputDeviceId: 'cable-input', monitoringEnabled: false, missingDeviceBehavior: 'mute' } })
    });

    const result = await router.routeAudioElement(audio);

    expect(audio.setSinkId).toHaveBeenCalledWith('cable-input');
    expect(audio.muted).toBe(false);
    expect(result).toEqual(expect.objectContaining({ routed: true, deviceId: 'cable-input' }));
  });

  test('mutes instead of leaking to the default device when setSinkId is unsupported', async () => {
    const audio = { muted: false, volume: 1 };
    const router = createTTSOutputRouter({
      loadConfig: async () => ({ audio: { outputDeviceId: 'cable-input', missingDeviceBehavior: 'mute' } })
    });

    const result = await router.routeAudioElement(audio);

    expect(audio.muted).toBe(true);
    expect(result.reason).toBe('setSinkId_unsupported');
  });

  test('uses default output only when explicitly configured', async () => {
    const audio = {
      muted: true,
      setSinkId: jest.fn().mockRejectedValueOnce(new Error('missing')).mockResolvedValueOnce()
    };
    const router = createTTSOutputRouter({
      loadConfig: async () => ({ audio: { outputDeviceId: 'missing', missingDeviceBehavior: 'default' } })
    });

    const result = await router.routeAudioElement(audio);

    expect(audio.setSinkId).toHaveBeenLastCalledWith('');
    expect(audio.muted).toBe(false);
    expect(result.fallback).toBe('default');
  });

  test('treats system fallback device labels as default-output hints instead of invalid sink ids', async () => {
    const audio = { setSinkId: jest.fn().mockResolvedValue(), muted: false, volume: 1 };
    const router = createTTSOutputRouter({
      loadConfig: async () => ({ audio: { outputDeviceId: 'system:CABLE In 16 Ch (VB-Audio Virtual Cable)', missingDeviceBehavior: 'mute' } })
    });

    const result = await router.routeAudioElement(audio);

    expect(audio.setSinkId).not.toHaveBeenCalled();
    expect(audio.muted).toBe(false);
    expect(result.reason).toBe('system_output_requires_default_device');
  });

  test('creates an optional default-device monitoring copy', async () => {
    const monitor = { volume: 0, setSinkId: jest.fn().mockResolvedValue(), play: jest.fn().mockResolvedValue() };
    const audio = { volume: 0.8, cloneNode: jest.fn(() => monitor) };
    const router = createTTSOutputRouter({ loadConfig: async () => ({
      audio: { outputDeviceId: 'cable-input', monitoringEnabled: true, monitoringVolume: 25 }
    }) });

    const result = await router.playMonitor(audio);

    expect(monitor.setSinkId).toHaveBeenCalledWith('');
    expect(monitor.volume).toBeCloseTo(0.2);
    expect(monitor.play).toHaveBeenCalled();
    expect(result.playing).toBe(true);
  });
});
