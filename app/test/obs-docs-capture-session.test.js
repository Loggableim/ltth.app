const { ObsDocsCaptureSession } = require('../../scripts/lib/obs-docs-capture-session');

function createFakeObs({ streamActive = false, recordActive = false, removeSceneItemFails = false, sourceNames = ['LTTH Tutorial - Emoji Rain'] } = {}) {
  const calls = [];
  const sources = sourceNames.map((sourceName, index) => ({
    sourceName,
    sceneItemId: index + 1,
    sceneItemEnabled: true,
    sceneItemLocked: false,
    sceneItemTransform: { positionX: index * 10, positionY: index * 20, scaleX: 1, scaleY: 1 }
  }));
  let createdInputSettings = null;
  let temporaryInputExists = false;
  return {
    calls,
    async call(requestType, requestData = {}) {
      calls.push({ requestType, requestData });
      if (requestType === 'GetStreamStatus') return { outputActive: streamActive };
      if (requestType === 'GetRecordStatus') return { outputActive: recordActive };
      if (requestType === 'GetSceneItemList') return {
        sceneItems: sources.map((source) => structuredClone(source))
      };
      if (requestType === 'CreateInput') {
        sources.push({ sourceName: requestData.inputName, sceneItemId: sources.length + 1, sceneItemEnabled: true });
        createdInputSettings = requestData.inputSettings;
        temporaryInputExists = true;
        return { sceneItemId: sources.at(-1).sceneItemId };
      }
      if (requestType === 'GetInputSettings') {
        if (!temporaryInputExists) throw new Error('Input not found');
        return { inputSettings: createdInputSettings };
      }
      if (requestType === 'GetSourceScreenshot') return { imageData: 'data:image/png;base64,AAAA' };
      if (requestType === 'RemoveSceneItem') {
        if (removeSceneItemFails) throw new Error('Scene item removal failed');
        const index = sources.findIndex((source) => source.sceneItemId === requestData.sceneItemId);
        if (index >= 0) sources.splice(index, 1);
        return {};
      }
      if (requestType === 'RemoveInput') {
        temporaryInputExists = false;
        return {};
      }
      throw new Error(`Unexpected OBS request: ${requestType}`);
    }
  };
}

describe('OBS Docs Capture session', () => {
  test('creates exactly one temporary source, verifies it, and restores the scene', async () => {
    const obs = createFakeObs();
    const session = new ObsDocsCaptureSession(obs);

    const receipt = await session.capture({
      sceneName: 'tutorial',
      overlayUrl: 'http://127.0.0.1:3000/plugins/emoji-rain/overlay.html',
      width: 1280,
      height: 720
    });

    expect(receipt.sceneName).toBe('tutorial');
    expect(receipt.sourceName).toBe('LTTH Docs Capture');
    expect(receipt.imageData).toMatch(/^data:image\/png;base64,/);
    expect(receipt).toMatchObject({
      visible: true,
      restored: true,
      temporarySceneItemRemoved: true,
      temporaryInputRemoved: true,
      streamActive: false,
      recordActive: false,
      initialSourceNames: ['LTTH Tutorial - Emoji Rain'],
      restoredSourceNames: ['LTTH Tutorial - Emoji Rain']
    });
    expect(obs.calls.map((call) => call.requestType)).toEqual([
      'GetStreamStatus',
      'GetRecordStatus',
      'GetSceneItemList',
      'CreateInput',
      'GetInputSettings',
      'GetSceneItemList',
      'GetSourceScreenshot',
      'GetSourceScreenshot',
      'RemoveSceneItem',
      'GetSceneItemList',
      'RemoveInput',
      'GetInputSettings',
      'GetSceneItemList'
    ]);
    expect(obs.calls.find((call) => call.requestType === 'CreateInput').requestData).toMatchObject({
      sceneName: 'tutorial',
      inputName: 'LTTH Docs Capture',
      inputKind: 'browser_source',
      inputSettings: expect.objectContaining({
        url: 'http://127.0.0.1:3000/plugins/emoji-rain/overlay.html',
        width: 1280,
        height: 720,
        shutdown: false
      })
    });
    expect(obs.calls.some((call) => /^(?:SetCurrentProgramScene|StartStream|StartRecord)$/.test(call.requestType))).toBe(false);
    expect(obs.calls.find((call) => call.requestType === 'RemoveSceneItem').requestData).toEqual({
      sceneName: 'tutorial',
      sceneItemId: 2
    });
    expect(obs.calls.filter((call) => call.requestType === 'GetSourceScreenshot').map((call) => call.requestData.sourceName)).toEqual([
      'LTTH Docs Capture',
      'tutorial'
    ]);
    expect(obs.calls.find((call) => call.requestType === 'RemoveInput').requestData).toEqual({
      inputName: 'LTTH Docs Capture'
    });
    expect(receipt.initialSceneItems).toEqual(receipt.restoredSceneItems);
    expect(receipt.initialSceneItems).toEqual([{
      sourceName: 'LTTH Tutorial - Emoji Rain',
      sceneItemId: 1,
      sceneItemEnabled: true,
      sceneItemLocked: false,
      sceneItemTransform: { positionX: 0, positionY: 0, scaleX: 1, scaleY: 1 }
    }]);
    expect(obs.calls.filter((call) => call.requestType === 'GetSourceScreenshot').at(-1).requestData).toMatchObject({
      sourceName: 'tutorial',
      imageFormat: 'png',
      imageWidth: 1280,
      imageHeight: 720
    });
  });

  test('refuses to mutate OBS while stream or recording output is active', async () => {
    const obs = createFakeObs({ streamActive: true });
    const session = new ObsDocsCaptureSession(obs);

    await expect(session.capture({
      sceneName: 'tutorial',
      overlayUrl: 'http://127.0.0.1:3000/plugins/emoji-rain/overlay.html',
      width: 1280,
      height: 720
    })).rejects.toThrow('OBS stream or recording output is active');
    expect(obs.calls.map((call) => call.requestType)).toEqual(['GetStreamStatus', 'GetRecordStatus']);
  });

  test('allows documentation capture only in the dedicated tutorial scene', async () => {
    const obs = createFakeObs();
    const session = new ObsDocsCaptureSession(obs);

    await expect(session.capture({
      sceneName: 'Main',
      overlayUrl: 'http://127.0.0.1:3000/plugins/emoji-rain/overlay.html',
      width: 1280,
      height: 720
    })).rejects.toThrow('OBS documentation capture is restricted to the tutorial scene');
    expect(obs.calls).toEqual([]);
  });

  test('runs a supplied local preparation only after the temporary source is visible', async () => {
    const obs = createFakeObs();
    const session = new ObsDocsCaptureSession(obs);
    let prepared = false;

    await session.capture({
      sceneName: 'tutorial',
      overlayUrl: 'http://127.0.0.1:3000/emoji-rain/obs-hud',
      width: 1280,
      height: 720,
      beforeScreenshot: async () => {
        expect(obs.calls.at(-1).requestType).toBe('GetSceneItemList');
        prepared = true;
      }
    });

    expect(prepared).toBe(true);
  });

  test('still removes the temporary input if scene-item cleanup fails', async () => {
    const obs = createFakeObs({ removeSceneItemFails: true });
    const session = new ObsDocsCaptureSession(obs);

    await expect(session.capture({
      sceneName: 'tutorial',
      overlayUrl: 'http://127.0.0.1:3000/emoji-rain/obs-hud',
      width: 1280,
      height: 720
    })).rejects.toThrow('Scene item removal failed');

    expect(obs.calls.some((call) => call.requestType === 'RemoveInput')).toBe(true);
  });
});
