'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

test('the OpenShock overlay stays hidden until a command is displayed', () => {
  const overlayHtml = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'openshock', 'overlay', 'openshock_overlay.html'), 'utf8');
  const overlayScript = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'openshock', 'overlay', 'openshock_overlay.js'), 'utf8');

  assert.match(overlayHtml, /id="overlay-container"[^>]*\bhidden\b/, 'the overlay starts hidden until a command is displayed');
  assert.match(overlayScript, /overlayContainer\.classList\.remove\('hidden'\)/, 'showEvent must reveal the hidden overlay container before showing a command');
});

console.log('OK: OpenShock overlay reveal contract is present.');
