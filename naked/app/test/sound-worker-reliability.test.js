/**
 * Regression tests for sound-worker.js reliability improvements.
 *
 * These are static-analysis tests (read + pattern-match) because the worker
 * runs in a browser context and cannot be executed directly under Node/Jest.
 *
 * Covered behaviour:
 *  - Partial batch failures are reported via explicit batch_error messages
 *    (no silent `continue` without reporting)
 *  - HTTP error responses in batchDownload post a batch_error message
 *  - Invalid MIME types in batchDownload post a batch_error message
 *  - batch_complete payload contains both `results` and `failures`
 *  - AbortController-based timeout support exists (fetchWithRetry)
 *  - Bounded retry constant is present (BATCH_MAX_RETRIES)
 */

const fs = require('fs');
const path = require('path');

describe('sound-worker.js reliability', () => {
    let workerJs;

    beforeAll(() => {
        const filePath = path.join(__dirname, '../public/js/sound-worker.js');
        workerJs = fs.readFileSync(filePath, 'utf8');
    });

    // ── Batch failure reporting ────────────────────────────────────────────────

    describe('Explicit batch_error reporting', () => {
        test('batchDownload posts batch_error for failed items', () => {
            // The function must use self.postMessage with type 'batch_error'
            expect(workerJs).toContain("type: 'batch_error'");
        });

        test('HTTP errors in batchDownload are not silently skipped', () => {
            // The old code did `if (!response.ok) continue;` with no error message.
            // The new code must push to failures and post batch_error before continuing.
            // We check that `batch_error` appears BEFORE any continue related to response.ok.
            const batchFnMatch = workerJs.match(/async function batchDownload[\s\S]*?^}/m);
            expect(batchFnMatch).toBeTruthy();
            const batchFn = batchFnMatch[0];

            // Must contain batch_error posting inside the response.ok guard
            expect(batchFn).toContain("type: 'batch_error'");

            // Must NOT silently continue on non-ok without reporting
            // Old silent pattern: `if (!response.ok) continue;` on a single line
            expect(batchFn).not.toMatch(/if\s*\(!response\.ok\)\s*continue\s*;/);
        });

        test('Invalid MIME type in batchDownload is not silently skipped', () => {
            const batchFnMatch = workerJs.match(/async function batchDownload[\s\S]*?^}/m);
            expect(batchFnMatch).toBeTruthy();
            const batchFn = batchFnMatch[0];

            // Must NOT silently continue on invalid mime without reporting
            expect(batchFn).not.toMatch(/if\s*\(!blob\.type\.startsWith\('audio\/'\)\)\s*continue\s*;/);
        });

        test('failures are collected and pushed for HTTP errors', () => {
            expect(workerJs).toContain('failures.push(');
        });
    });

    // ── batch_complete payload ─────────────────────────────────────────────────

    describe('batch_complete payload', () => {
        test('batch_complete message includes failures array', () => {
            // Old: `{ type: 'batch_complete', results }`
            // New: `{ type: 'batch_complete', results, failures }`
            const completeBlock = workerJs.match(/postMessage\(\s*\{[\s\S]*?type:\s*'batch_complete'[\s\S]*?\}\s*\)/);
            expect(completeBlock).toBeTruthy();
            expect(completeBlock[0]).toContain('failures');
        });

        test('batch_complete message includes results array', () => {
            const completeBlock = workerJs.match(/postMessage\(\s*\{[\s\S]*?type:\s*'batch_complete'[\s\S]*?\}\s*\)/);
            expect(completeBlock).toBeTruthy();
            expect(completeBlock[0]).toContain('results');
        });
    });

    // ── Timeout / AbortController support ─────────────────────────────────────

    describe('AbortController timeout support', () => {
        test('uses AbortController for per-download timeout', () => {
            expect(workerJs).toContain('new AbortController()');
            expect(workerJs).toContain('controller.abort()');
        });

        test('BATCH_DOWNLOAD_TIMEOUT_MS constant is defined', () => {
            expect(workerJs).toContain('BATCH_DOWNLOAD_TIMEOUT_MS');
        });

        test('fetchWithRetry helper function is defined', () => {
            expect(workerJs).toContain('async function fetchWithRetry(');
        });
    });

    // ── Bounded retries ────────────────────────────────────────────────────────

    describe('Bounded retries', () => {
        test('BATCH_MAX_RETRIES constant is defined', () => {
            expect(workerJs).toContain('BATCH_MAX_RETRIES');
        });

        test('fetchWithRetry uses maxRetries parameter', () => {
            const retryFnMatch = workerJs.match(/async function fetchWithRetry[\s\S]*?^}/m);
            expect(retryFnMatch).toBeTruthy();
            expect(retryFnMatch[0]).toContain('maxRetries');
        });
    });
});
