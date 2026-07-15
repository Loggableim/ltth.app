'use strict';

const TEMPORARY_SOURCE_NAME = 'LTTH Docs Capture';
const TUTORIAL_SCENE_NAME = 'tutorial';

function sourceNames(response) {
  return (response?.sceneItems || [])
    .map((item) => item?.sourceName)
    .filter((name) => typeof name === 'string' && name.length > 0);
}

function sceneItems(response) {
  return (response?.sceneItems || []).filter((item) => item && typeof item.sourceName === 'string');
}

function snapshotSceneItems(response) {
  return sceneItems(response)
    .map((item) => JSON.parse(JSON.stringify(item)))
    .sort((left, right) => Number(left.sceneItemId) - Number(right.sceneItemId));
}

function sameSceneItems(before, after) {
  return JSON.stringify(before) === JSON.stringify(after);
}

function requirePngScreenshot(screenshot, target) {
  if (typeof screenshot?.imageData !== 'string' || !screenshot.imageData.startsWith('data:image/png;base64,') || screenshot.imageData.length <= 'data:image/png;base64,'.length) {
    throw new Error(`OBS did not return a PNG screenshot for ${target}`);
  }
  return screenshot.imageData;
}

function requireCaptureOptions({ sceneName, overlayUrl, width, height }) {
  if (typeof sceneName !== 'string' || !sceneName.trim()) throw new Error('OBS scene name is required');
  if (typeof overlayUrl !== 'string' || !overlayUrl.trim()) throw new Error('OBS overlay URL is required');
  if (!Number.isInteger(width) || width <= 0) throw new Error('OBS capture width must be a positive integer');
  if (!Number.isInteger(height) || height <= 0) throw new Error('OBS capture height must be a positive integer');
}

class ObsDocsCaptureSession {
  constructor(obs, { sourceName = TEMPORARY_SOURCE_NAME } = {}) {
    if (!obs || typeof obs.call !== 'function') throw new TypeError('An OBS WebSocket client with call() is required');
    this.obs = obs;
    this.sourceName = sourceName;
  }

  async capture(options) {
    requireCaptureOptions(options);
    const { sceneName, overlayUrl, width, height } = options;
    if (sceneName !== TUTORIAL_SCENE_NAME) {
      throw new Error('OBS documentation capture is restricted to the tutorial scene');
    }
    const [streamStatus, recordStatus] = await Promise.all([
      this.obs.call('GetStreamStatus'),
      this.obs.call('GetRecordStatus')
    ]);
    if (streamStatus?.outputActive || recordStatus?.outputActive) {
      throw new Error('OBS stream or recording output is active');
    }

    const initialSceneItems = snapshotSceneItems(await this.obs.call('GetSceneItemList', { sceneName }));
    const initialSources = sourceNames({ sceneItems: initialSceneItems });
    if (initialSources.includes(this.sourceName)) {
      throw new Error(`Temporary OBS source already exists: ${this.sourceName}`);
    }

    let sourceCreated = false;
    let primaryError;
    let receipt;
    let temporarySceneItemId;
    try {
      await this.obs.call('CreateInput', {
        sceneName,
        inputName: this.sourceName,
        inputKind: 'browser_source',
        inputSettings: {
          url: overlayUrl,
          width,
          height,
          // The tutorial scene is never made program-visible. Keep the
          // temporary source rendering so GetSourceScreenshot sees the real
          // overlay, then remove the scene item in the same session.
          shutdown: false
        },
        sceneItemEnabled: true
      });
      sourceCreated = true;

      const settings = await this.obs.call('GetInputSettings', { inputName: this.sourceName });
      const inputSettings = settings?.inputSettings || {};
      if (inputSettings.url !== overlayUrl || Number(inputSettings.width) !== width || Number(inputSettings.height) !== height) {
        throw new Error('Temporary OBS browser source settings could not be verified');
      }

      const createdItems = snapshotSceneItems(await this.obs.call('GetSceneItemList', { sceneName }));
      const temporaryItems = createdItems.filter((item) => item.sourceName === this.sourceName);
      if (temporaryItems.length !== 1 || !Number.isInteger(temporaryItems[0].sceneItemId)) {
        throw new Error('Temporary OBS browser source was not added to the tutorial scene');
      }
      temporarySceneItemId = temporaryItems[0].sceneItemId;

      if (options.beforeScreenshot !== undefined && typeof options.beforeScreenshot !== 'function') {
        throw new TypeError('OBS documentation capture preparation must be a function');
      }
      if (options.beforeScreenshot) {
        await options.beforeScreenshot({
          sceneName,
          sourceName: this.sourceName,
          width,
          height
        });
      }

      const sourceScreenshot = await this.obs.call('GetSourceScreenshot', {
        sourceName: this.sourceName,
        imageFormat: 'png',
        imageWidth: width,
        imageHeight: height
      });
      const sourceImageData = requirePngScreenshot(sourceScreenshot, 'the temporary source');

      const screenshot = await this.obs.call('GetSourceScreenshot', {
        // OBS models scenes as sources. Capturing the tutorial scene forces an
        // off-screen render without taking it live or changing the preview.
        sourceName: sceneName,
        imageFormat: 'png',
        imageWidth: width,
        imageHeight: height
      });
      const imageData = requirePngScreenshot(screenshot, 'the tutorial scene');

      receipt = {
        sceneName,
        sourceName: this.sourceName,
        imageData,
        sourceImageData,
        visible: true,
        initialSourceNames: initialSources,
        initialSceneItems,
        restored: false,
        restoredSourceNames: null,
        restoredSceneItems: null,
        temporarySceneItemRemoved: false,
        temporaryInputRemoved: false,
        streamActive: false,
        recordActive: false
      };
      return receipt;
    } catch (error) {
      primaryError = error;
      throw error;
    } finally {
      if (sourceCreated) {
        let cleanupError = null;
        try {
          if (!Number.isInteger(temporarySceneItemId)) {
            throw new Error('Temporary OBS browser source scene item could not be identified for cleanup');
          }
          await this.obs.call('RemoveSceneItem', {
            sceneName,
            sceneItemId: temporarySceneItemId
          });
          const afterSceneItemRemoval = snapshotSceneItems(await this.obs.call('GetSceneItemList', { sceneName }));
          if (afterSceneItemRemoval.some((item) => item.sourceName === this.sourceName)) {
            throw new Error('Temporary OBS browser source scene item was not removed');
          }
        } catch (error) {
          cleanupError = error;
        }
        try {
          await this.obs.call('RemoveInput', { inputName: this.sourceName });
          let temporaryInputRemoved = false;
          try {
            await this.obs.call('GetInputSettings', { inputName: this.sourceName });
          } catch (_) {
            temporaryInputRemoved = true;
          }
          if (!temporaryInputRemoved) {
            throw new Error('Temporary OBS browser source input was not removed');
          }
        } catch (error) {
          if (!cleanupError) cleanupError = error;
        }
        try {
          const restoredSceneItems = snapshotSceneItems(await this.obs.call('GetSceneItemList', { sceneName }));
          if (!sameSceneItems(initialSceneItems, restoredSceneItems)) {
            throw new Error('OBS tutorial scene was not restored after documentation capture');
          }
          if (cleanupError) throw cleanupError;
          // The result object is returned only after this finally block. Update
          // it here so callers can persist proof of the exact baseline restore.
          if (receipt) {
            receipt.restored = true;
            receipt.restoredSourceNames = sourceNames({ sceneItems: restoredSceneItems });
            receipt.restoredSceneItems = restoredSceneItems;
            receipt.temporarySceneItemRemoved = true;
            receipt.temporaryInputRemoved = true;
          }
        } catch (error) {
          const finalCleanupError = cleanupError || error;
          if (primaryError) primaryError.cleanupError = finalCleanupError;
          else throw finalCleanupError;
        }
      }
    }
  }
}

module.exports = { ObsDocsCaptureSession, TEMPORARY_SOURCE_NAME, TUTORIAL_SCENE_NAME };
