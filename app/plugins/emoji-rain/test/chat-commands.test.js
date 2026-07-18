const {
  registerEmojiRainCommandContract
} = require('../../../test/helpers/emoji-rain-command-plugin-contract');
const EmojiRainPlugin = require('../main');

registerEmojiRainCommandContract({
  label: 'Classic EmojiRain',
  Plugin: EmojiRainPlugin,
  pluginId: 'emoji-rain',
  eventName: 'emoji-rain:spawn',
  configRoute: '/api/emoji-rain/config',
  imagePath: '/emoji-rain/uploads/cat.png',
  imageRendererMode: 'profile-picture'
});
