const {
  registerEmojiRainCommandContract
} = require('../../../test/helpers/emoji-rain-command-plugin-contract');
const WebGPUEmojiRainPlugin = require('../main');

registerEmojiRainCommandContract({
  label: 'WebGPU EmojiRain',
  Plugin: WebGPUEmojiRainPlugin,
  pluginId: 'webgpu-emoji-rain',
  eventName: 'webgpu-emoji-rain:spawn',
  configRoute: '/api/webgpu-emoji-rain/config',
  imagePath: '/webgpu-emoji-rain/uploads/cat.png',
  usesPluginConfigStorage: true
});
