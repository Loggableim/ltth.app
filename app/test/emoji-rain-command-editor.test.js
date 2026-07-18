const { JSDOM } = require('jsdom');
const { EmojiRainCommandEditor } = require('../public/js/emoji-rain-command-editor');

function createEditor(options = {}) {
  const dom = new JSDOM('<!doctype html><div id="editor"></div>');
  const fetch = options.fetch || jest.fn();
  const editor = new EmojiRainCommandEditor({
    root: dom.window.document.getElementById('editor'),
    document: dom.window.document,
    fetch,
    FormData: dom.window.FormData,
    imagesEndpoint: '/api/emoji-rain/images',
    uploadEndpoint: '/api/emoji-rain/upload',
    translate: (_key, fallback) => fallback
  });
  return { dom, editor, fetch };
}

function config(commands = []) {
  return {
    animal_commands: commands,
    animal_commands_allow_team_members: true,
    animal_command_user_cooldown_ms: 60000,
    animal_command_superfan_cooldown_ms: 15000,
    animal_command_global_cooldown_ms: 15000
  };
}

function command(name, type = 'emoji', value = '🐾', enabled = true) {
  return { command: name, enabled, asset_type: type, asset_value: value };
}

describe('shared EmojiRain command editor', () => {
  test('loads and serializes commands, Teamlevel access, and cooldown seconds', () => {
    const { editor } = createEditor();
    editor.load(config([
      command('beans'),
      command('cat-image', 'image', 'https://cdn.example.test/cat.png', false)
    ]));

    expect(editor.root.querySelectorAll('[data-command-row]')).toHaveLength(2);
    expect(editor.serialize()).toEqual(config([
      command('beans'),
      command('cat-image', 'image', 'https://cdn.example.test/cat.png', false)
    ]));

    editor.root.querySelector('[data-setting="team-cooldown"]').value = '42';
    editor.root.querySelector('[data-setting="superfan-cooldown"]').value = '9';
    editor.root.querySelector('[data-setting="global-cooldown"]').value = '7';
    expect(editor.serialize()).toMatchObject({
      animal_command_user_cooldown_ms: 42000,
      animal_command_superfan_cooldown_ms: 9000,
      animal_command_global_cooldown_ms: 7000
    });
  });

  test('adds and removes rows without using HTML interpolation', () => {
    const { editor } = createEditor();
    editor.load(config([]));

    editor.root.querySelector('[data-action="add-command"]').click();
    expect(editor.root.querySelectorAll('[data-command-row]')).toHaveLength(1);
    editor.root.querySelector('[data-role="command-name"]').value = 'fox';
    editor.root.querySelector('[data-role="asset-value"]').value = '🦊';

    expect(editor.serialize().animal_commands).toEqual([command('fox', 'emoji', '🦊')]);
    editor.root.querySelector('[data-action="remove-command"]').click();
    expect(editor.serialize().animal_commands).toEqual([]);
  });

  test('switches asset type, selects a gallery image, and updates the preview', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        images: [{ filename: 'cat.png', url: '/emoji-rain/uploads/cat.png' }]
      })
    });
    const { editor } = createEditor({ fetch });
    editor.load(config([command('cat')]));
    await editor.refreshGallery();

    const type = editor.root.querySelector('[data-role="asset-type"]');
    type.value = 'image';
    type.dispatchEvent(new editor.document.defaultView.Event('change', { bubbles: true }));
    const gallery = editor.root.querySelector('[data-role="gallery"]');
    gallery.value = '/emoji-rain/uploads/cat.png';
    gallery.dispatchEvent(new editor.document.defaultView.Event('change', { bubbles: true }));

    expect(editor.serialize().animal_commands).toEqual([
      command('cat', 'image', '/emoji-rain/uploads/cat.png')
    ]);
    expect(editor.root.querySelector('[data-role="image-preview"]').getAttribute('src'))
      .toBe('/emoji-rain/uploads/cat.png');
  });

  test('uploads a row image through the configured safe endpoint', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, filename: 'fox.png', url: '/emoji-rain/uploads/fox.png' })
    });
    const { editor, dom } = createEditor({ fetch });
    editor.load(config([command('fox', 'image', '')]));
    const row = editor.root.querySelector('[data-command-row]');
    const file = new dom.window.File(['image'], 'fox.png', { type: 'image/png' });

    await editor.uploadAsset(row, file);

    expect(fetch).toHaveBeenCalledWith('/api/emoji-rain/upload', expect.objectContaining({
      method: 'POST',
      body: expect.any(dom.window.FormData)
    }));
    expect(editor.serialize().animal_commands[0].asset_value).toBe('/emoji-rain/uploads/fox.png');
  });

  test('renders hostile command and asset strings as inert values', () => {
    const { editor } = createEditor();
    const hostileCommand = '<img src=x onerror=alert(1)>';
    const hostileAsset = 'javascript:alert(1)';
    editor.load(config([command(hostileCommand, 'image', hostileAsset)]));

    expect(editor.root.querySelectorAll('script')).toHaveLength(0);
    expect(editor.root.querySelectorAll('[onerror]')).toHaveLength(0);
    expect(editor.root.querySelector('[data-role="command-name"]').value).toBe(hostileCommand);
    expect(editor.root.querySelector('[data-role="asset-value"]').value).toBe(hostileAsset);
    expect(editor.root.querySelector('[data-role="image-preview"]').hasAttribute('src')).toBe(false);
  });
});
