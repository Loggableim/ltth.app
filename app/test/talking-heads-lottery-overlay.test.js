const fs = require('fs');
const path = require('path');

describe('Talking Heads avatar assignment OBS overlay', () => {
  const pluginDir = path.join(__dirname, '..', 'plugins', 'talking-heads');

  test('contains the three-reel avatar slot and only uses the canonical spin contract', () => {
    const html = fs.readFileSync(path.join(pluginDir, 'overlay.html'), 'utf8');
    const script = fs.readFileSync(path.join(pluginDir, 'assets', 'overlay.js'), 'utf8');

    expect(html).toContain('id="avatarSpinOverlay"');
    expect(html.match(/data-slot-reel/g)).toHaveLength(3);
    expect(script).toContain('class AvatarSlotPresenter');
    expect(script).toContain("talkingheads:avatar:spin:start");
    expect(script).toContain("talkingheads:avatar:spin:complete");
    expect(script).not.toContain('talkingheads:avatar:lottery');
    expect(script).not.toContain('keepCommand');
    expect(script).not.toContain('rerollCommand');
  });
});
