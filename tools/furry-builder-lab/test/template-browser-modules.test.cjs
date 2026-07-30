'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const manifest = require('../assets/face-templates.json');
const LAB_ROOT = path.join(__dirname, '..');

function runBrowserScript(fileName, window) {
  const context = vm.createContext({
    window,
    Error,
    Map,
    Math,
    Object,
    Promise
  });

  try {
    vm.runInContext(readFileSync(path.join(LAB_ROOT, fileName), 'utf8'), context, { filename: fileName });
    return null;
  } catch (error) {
    return error;
  }
}

test('publishes the template contract and renderer to browser globals for the standalone demo', () => {
  const window = {};

  assert.equal(runBrowserScript('template-rig.js', window), null);
  assert.equal(runBrowserScript('template-demo-state.js', window), null);
  assert.equal(runBrowserScript('template-canvas-renderer.js', window), null);

  assert.equal(typeof window.TemplateRig.resolveTemplatePlan, 'function');
  assert.equal(typeof window.TemplateDemoState.rotateTemplate, 'function');
  assert.equal(typeof window.TemplateCanvasRenderer.createTemplateCanvasRenderer, 'function');

  const plan = window.TemplateRig.resolveTemplatePlan(manifest, 'otter-cocoa', 'round');
  assert.deepEqual(Array.from(plan.operations, (operation) => operation.layer), ['head', 'eyes', 'mouth']);
  assert.equal(plan.operations[2].cell, 18);
});
