const fs = require('fs');
const path = require('path');

describe('Talking Heads avatar lottery OBS overlay', () => {
  const pluginDir = path.join(__dirname, '..', 'plugins', 'talking-heads');

  test('contains a slot presenter and listens for lottery draws and choices', () => {
    const html = fs.readFileSync(path.join(pluginDir, 'overlay.html'), 'utf8');
    const script = fs.readFileSync(path.join(pluginDir, 'assets', 'overlay.js'), 'utf8');

    expect(html).toContain('id="lotteryOverlay"');
    expect(script).toContain('class AvatarLotteryPresenter');
    expect(script).toContain("talkingheads:avatar:lottery:start");
    expect(script).toContain("talkingheads:avatar:lottery:choice");
    expect(script).toContain("keepCommand");
    expect(script).toContain("rerollCommand");
  });
});
