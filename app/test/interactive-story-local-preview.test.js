const fs = require('fs');
const path = require('path');

describe('Interactive Story local vote preview', () => {
  test('wires the shipped test control to the local voting-preview workflow', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'interactive-story', 'ui.html'), 'utf8');

    expect(source).toContain("document.getElementById('testChoicesPreviewBtn')?.addEventListener('click', testChoicesPreview)");
    expect(source).toContain("socket.emit('story:voting-started'");
    expect(source).toContain("socket.emit('story:vote-update'");
  });
});
