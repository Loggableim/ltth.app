const fs = require('fs');
const path = require('path');

describe('Game Engine manual-mode UI', () => {
  test('uses the available message helper after a local manual-game response', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'game-engine', 'ui.html'), 'utf8');
    const manualStart = source.indexOf('async function startManualGame()');
    const manualMode = source.slice(manualStart, manualStart + 5000);

    expect(manualMode).toContain('showMessage(data.message)');
    expect(manualMode).not.toContain('showSuccess(');
    expect(manualMode).not.toContain('showError(');
  });
});
