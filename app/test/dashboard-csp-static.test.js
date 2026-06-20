const fs = require('fs');
const path = require('path');

describe('dashboard CSP hygiene', () => {
  test('serves public assets from the app directory instead of process cwd', () => {
    const serverJs = fs.readFileSync(
      path.join(__dirname, '../server.js'),
      'utf8'
    );

    expect(serverJs).toContain("express.static(path.join(__dirname, 'public'))");
    expect(serverJs).not.toContain("express.static('public')");
  });

  test('does not generate inline image onerror handlers', () => {
    const dashboardJs = fs.readFileSync(
      path.join(__dirname, '../public/js/dashboard.js'),
      'utf8'
    );

    expect(dashboardJs).not.toMatch(/\sonerror\s*=/i);
  });
});
