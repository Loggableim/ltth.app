const fs = require('fs');
const path = require('path');
const InteractiveStoryPlugin = require('../main');

function createPlugin(savedConfig = {}) {
  const emit = jest.fn();
  const registerSocket = jest.fn();
  const api = {
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    getSocketIO: () => ({ emit }),
    getDatabase: () => ({ getSetting: jest.fn() }),
    getPluginDataDir: () => '/tmp',
    getConfig: jest.fn(() => savedConfig),
    setConfig: jest.fn(),
    registerRoute: jest.fn(),
    registerSocket,
    registerTikTokEvent: jest.fn(),
    log: jest.fn()
  };
  return { plugin: new InteractiveStoryPlugin(api), emit, registerSocket };
}

function getRegenerateImageHandler(plugin, registerSocket) {
  plugin._registerSocketHandlers();
  return registerSocket.mock.calls.find(([eventName]) => eventName === 'story:regenerate-image')[1];
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

  test('all generated chapter and regeneration paths delegate to the one guarded helper', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
    const helperCalls = source.match(/await this\._maybeGenerateChapterImage\(/g) || [];

    expect(helperCalls).toHaveLength(7);
    expect(source).toContain('/api/interactive-story/start');
    expect(source).toContain('/api/interactive-story/final-chapter');
    expect(source).toContain('/api/interactive-story/admin-choice');
    expect(source).toContain('/api/interactive-story/manual-advance');
  });
  test('regeneration leaves the current chapter untouched when image generation is disabled', async () => {
    const { plugin, emit, registerSocket } = createPlugin({ autoGenerateImages: false, textOnlyMode: false });
    plugin.currentSession = { theme: 'fantasy' };
    plugin.currentChapter = { ...chapter, imagePath: 'C:/story-images/original.png' };
    plugin.imageService = { generateImage: jest.fn() };

    await getRegenerateImageHandler(plugin, registerSocket)({}, {});

    expect(plugin.currentChapter.imagePath).toBe('C:/story-images/original.png');
    expect(plugin.imageService.generateImage).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalledWith('story:image-updated', expect.anything());
  });

  test('regeneration reports a provider failure without replacing the existing image', async () => {
    const { plugin, emit, registerSocket } = createPlugin({
      autoGenerateImages: true,
      imageProvider: 'openai',
      openaiImageModel: 'gpt-image-1'
    });
    plugin.currentSession = { theme: 'fantasy' };
    plugin.currentChapter = { ...chapter, imagePath: 'C:/story-images/original.png' };
    plugin.imageService = {
      getStyleForTheme: jest.fn(() => 'cinematic'),
      generateImage: jest.fn().mockRejectedValue(new Error('provider unavailable'))
    };

    await getRegenerateImageHandler(plugin, registerSocket)({}, {});

    expect(plugin.currentChapter.imagePath).toBe('C:/story-images/original.png');
    expect(emit).toHaveBeenCalledWith('story:image-generation-failed', expect.objectContaining({
      message: 'Image generation failed, but story continues',
      error: 'provider unavailable'
    }));
    expect(emit).not.toHaveBeenCalledWith('story:image-updated', expect.anything());
  });

  test('regeneration sends the configured OpenAI image model to the provider', async () => {
    const { plugin, emit, registerSocket } = createPlugin({
      autoGenerateImages: true,
      imageProvider: 'openai',
      openaiImageModel: 'gpt-image-1',
      defaultImageModel: 'sdxl'
    });
    plugin.currentSession = { theme: 'fantasy' };
    plugin.currentChapter = { ...chapter };
    plugin.imageService = {
      getStyleForTheme: jest.fn(() => 'cinematic'),
      generateImage: jest.fn().mockResolvedValue('C:/story-images/regenerated.png')
    };

    await getRegenerateImageHandler(plugin, registerSocket)({}, {});

    expect(plugin.imageService.generateImage).toHaveBeenCalledWith(
      expect.stringContaining('The hidden gate'),
      'gpt-image-1',
      'cinematic'
    );
    expect(emit).toHaveBeenCalledWith('story:image-updated', expect.objectContaining({
      imagePath: 'regenerated.png'
    }));
  });
});
