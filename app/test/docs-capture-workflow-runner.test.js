'use strict';

const fs = require('fs');
const path = require('path');
const {
  assertWorkflowOperationsExecuted,
  createBlockedNetworkEvidence
} = require('../../scripts/lib/docs-capture-workflow-runner');

const runnerPath = path.join(__dirname, '..', '..', 'scripts', 'capture-product-screenshots.js');

describe('documentation screenshot workflow runner', () => {
  test('accepts only declared operations with matching observed local evidence', () => {
    const operations = assertWorkflowOperationsExecuted({
      workflow: {
        operations: [
          { type: 'goto', route: '/plugins/example/ui.html' },
          { type: 'open-plugin-surface', selector: '#panel' },
          { type: 'set-demo-value', selector: '#title' },
          { type: 'prepare', name: 'open-example-panel' }
        ]
      },
      state: {
        route: '/plugins/example/ui.html?lang=en',
        controls: { '#panel': { visible: true } }
      },
      interactions: [{
        type: 'set-demo-value',
        selector: '#title',
        status: 'performed',
        observed: true,
        changed: true
      }],
      preparation: [{ type: 'open-example-panel', observed: true }]
    });

    expect(operations).toHaveLength(4);
    expect(operations.every((operation) => operation.observed)).toBe(true);
  });

  test('rejects unsupported operations and unobserved interaction claims', () => {
    expect(() => assertWorkflowOperationsExecuted({
      workflow: { operations: [{ type: 'remote-device-test', selector: '#device' }] },
      state: { route: '/', controls: {} }
    })).toThrow('Unsupported documentation workflow operation');

    expect(() => assertWorkflowOperationsExecuted({
      workflow: { operations: [{ type: 'run-local-preview', selector: '#preview' }] },
      state: { route: '/', controls: {} },
      interactions: [{ type: 'run-local-preview', selector: '#preview', status: 'performed', changed: true }]
    })).toThrow('has no observed local interaction evidence');
  });

  test('records every blocked external request as capture evidence', () => {
    expect(createBlockedNetworkEvidence({
      url: 'https://example.com/tracker.js',
      method: 'GET',
      resourceType: 'script'
    })).toEqual({
      url: 'https://example.com/tracker.js',
      method: 'GET',
      resourceType: 'script',
      attempted: true,
      disposition: 'blocked'
    });
  });

  test('does not inject Store Admin or OpenShock demo UI state', () => {
    const source = fs.readFileSync(runnerPath, 'utf8');

    expect(source).not.toContain('STORE_ADMIN_OPTIONAL_API_RESPONSES');
    expect(source).not.toContain('handleCommandSent({');
    expect(source).not.toContain('changed: true');
    expect(source).toContain('assertWorkflowOperationsExecuted');
    expect(source).toContain('executedOperations');
    expect(source).toContain('blockedNetwork');
  });
});
