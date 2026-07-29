const assert = require('node:assert/strict');
const { once } = require('node:events');
const path = require('node:path');
const test = require('node:test');

const { createServer } = require('../server.cjs');

test('serves the interactive page with all three selector groups', async () => {
  const server = createServer(path.join(__dirname, '..'));
  await once(server.listen(0, '127.0.0.1'), 'listening');
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/`);
    const markup = await response.text();

    assert.equal(response.status, 200);
    for (const part of ['heads', 'eyes', 'mouths']) {
      assert.match(markup, new RegExp(`data-part="${part}"`));
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
