const fs = require('fs');
const path = require('path');
const InteractiveStoryPlugin = require('../main');

function createPlugin(savedConfig = {}) {
  const emit = jest.fn();
  const api = {
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    getSocketIO: () => ({ emit }),
    getDatabase: () => ({ getSetting: jest.fn() }),
    getPluginDataDir: () => '/tmp',
    getConfig: jest.fn(() => savedConfig),
    setConfig: jest.fn(),
    registerRoute: jest.fn(),
    registerSocket: jest.fn(),
    registerTikTokEvent: jest.fn(),
    log: jest.fn()
  };
  return { plugin: new InteractiveStoryPlugin(api), emit };
}

describe('Interactive Story optional chapter images', () => {
  const chapter = {
    chapterNumber: 1,
    title: 'The hidden gate',
    content: 'A bright path leads into the forest.',
    choices: []
  };

  test('disabled images leave a chapter image-free without calling the provider', async () => {
    const { plugin } = createPlugin();
    plugin.imageService = { generateImage: jest.fn() };

    const result = await plugin._maybeGenerateChapterImage(chapter, {
      autoGenerateImages: false,
      textOnlyMode: false
    });

    expect(result).toEqual({ ...chapter, imagePath: null });
    expect(plugin.imageService.generateImage).not.toHaveBeenCalled();
  });

  test('text-only mode suppresses image generation even when images are enabled', async () => {
    const { plugin } = createPlugin();
    plugin.imageService = { generateImage: jest.fn() };

    const result = await plugin._maybeGenerateChapterImage(chapter, {
      autoGenerateImages: true,
      textOnlyMode: true
    });

    expect(result.imagePath).toBeNull();
    expect(plugin.imageService.generateImage).not.toHaveBeenCalled();
  });

  test('a provider failure emits the diagnostic and returns the chapter for continued playback', async () => {
    const { plugin, emit } = createPlugin({ debugLogging: true });
    plugin.currentSession = { theme: 'fantasy' };
    plugin.imageService = {
      getStyleForTheme: jest.fn(() => 'cinematic'),
      generateImage: jest.fn().mockRejectedValue(new Error('provider unavailable'))
    };

    const result = await plugin._maybeGenerateChapterImage(chapter, {
      autoGenerateImages: true,
      imageProvider: 'openai',
      openaiImageModel: 'gpt-image-1'
    });

    expect(result).toEqual({ ...chapter, imagePath: null });
    expect(emit).toHaveBeenCalledWith('story:image-generation-failed', expect.objectContaining({
      message: 'Image generation failed, but story continues',
      error: 'provider unavailable'
    }));
  });

  test('an enabled provider stores the generated path on the returned chapter', async () => {
    const { plugin } = createPlugin();
    plugin.currentSession = { theme: 'fantasy' };
    plugin.imageService = {
      getStyleForTheme: jest.fn(() => 'cinematic'),
      generateImage: jest.fn().mockResolvedValue('C:/story-images/gate.png')
    };

    const result = await plugin._maybeGenerateChapterImage(chapter, {
      autoGenerateImages: true,
      imageProvider: 'openai',
      openaiImageModel: 'gpt-image-1'
    });

    expect(result.imagePath).toBe('C:/story-images/gate.png');
    expect(plugin.imageService.generateImage).toHaveBeenCalledWith(
      expect.stringContaining('The hidden gate'),
      'gpt-image-1',
      'cinematic'
    );
  });

  test('all generated chapter paths delegate to the one guarded helper', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
    const helperCalls = source.match(/await this\._maybeGenerateChapterImage\(/g) || [];

    expect(helperCalls).toHaveLength(6);
    expect(source).toContain('/api/interactive-story/start');
    expect(source).toContain('/api/interactive-story/final-chapter');
    expect(source).toContain('/api/interactive-story/admin-choice');
    expect(source).toContain('/api/interactive-story/manual-advance');
  });
});
