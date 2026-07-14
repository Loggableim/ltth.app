const fs = require('fs');
const path = require('path');

describe('Spotlight local test event', () => {
  test('does not require an external placeholder-avatar request', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'spotlight', 'main.js'), 'utf8');

    expect(source).not.toContain('https://via.placeholder.com/150/0000FF/FFFFFF?text=Test');
    expect(source).toContain("profilePictureUrl: ''");
  });
});
