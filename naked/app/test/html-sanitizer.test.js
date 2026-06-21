const { sanitizeHtml } = require('../modules/html-sanitizer');

describe('HTML sanitizer', () => {
  test('removes script tags, inline event handlers and dangerous URLs', () => {
    const html = sanitizeHtml(`
      <h2 onclick="alert(1)">Title</h2>
      <script>alert(1)</script>
      <img src="x" onerror="alert(1)">
      <a href="javascript:alert(1)">bad</a>
      <a href="https://example.com/path">good</a>
    `);

    expect(html).not.toContain('<script');
    expect(html).not.toContain('onclick=');
    expect(html).not.toContain('onerror=');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="https://example.com/path"');
  });
});
