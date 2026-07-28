const fs = require('fs');
const path = require('path');

describe('Talking Heads avatar assignment OBS overlay', () => {
  const pluginDir = path.join(__dirname, '..', 'plugins', 'talking-heads');

  test('contains the three-reel avatar slot and only uses the canonical spin contract', () => {
    const html = fs.readFileSync(path.join(pluginDir, 'overlay.html'), 'utf8');
    const obsHud = fs.readFileSync(path.join(pluginDir, 'obs-hud.html'), 'utf8');
    const script = fs.readFileSync(path.join(pluginDir, 'assets', 'overlay.js'), 'utf8');

    expect(html).toContain('id="avatarSpinOverlay"');
    expect(html.match(/data-slot-reel/g)).toHaveLength(3);
    for (const markup of [html, obsHud]) {
      expect(markup).toContain('>CHARACTER LAB</p>');
      expect(markup).toContain('YOUR AVATAR');
      expect(markup).toContain('>Avatar</strong>');
      expect(markup).not.toContain('BOBA CHARACTER LAB');
      expect(markup).not.toContain('Boba avatar');
    }
    expect(script).toContain('class AvatarSlotPresenter');
    expect(script).toContain("talkingheads:avatar:spin:start");
    expect(script).toContain("talkingheads:avatar:spin:complete");
    expect(script).not.toContain('talkingheads:avatar:lottery');
    expect(script).not.toContain('keepCommand');
    expect(script).not.toContain('rerollCommand');
  });
});
