const { parseControls } = require('../../scripts/lib/plugin-guide-ui-inventory');

describe('plugin guide UI inventory', () => {
  test('does not turn runtime template expressions into documented controls', () => {
    const controls = parseControls(`
      <button id="real-control" type="button">Open settings</button>
      <script>const row = \`<button id="${'${item.id}'}">${'${escapeHtml(item.name)}'}</button>\`;</script>
    `, '/example/ui');

    expect(controls).toEqual([
      expect.objectContaining({ selector: '#real-control', label: 'Open settings' })
    ]);
  });
});
