const fs = require('fs');
const path = require('path');

describe('dashboard CSP hygiene', () => {
  test('does not generate inline image onerror handlers', () => {
    const dashboardJs = fs.readFileSync(
      path.join(__dirname, '../public/js/dashboard.js'),
      'utf8'
    );

    expect(dashboardJs).not.toMatch(/\sonerror\s*=/i);
  });
});
