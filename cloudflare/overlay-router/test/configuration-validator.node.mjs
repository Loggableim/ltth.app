import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packageDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const configPath = path.join(packageDirectory, 'wrangler.jsonc');

function parseJsonc(source) {
  return JSON.parse(source.replace(/^\s*\/\/.*$/gm, ''));
}

test('Wrangler environments disable alternate invocation and raw-log surfaces', async () => {
  const config = parseJsonc(await readFile(configPath, 'utf8'));

  for (const [label, candidate] of [
    ['root', config],
    ['staging', config.env?.staging],
    ['production', config.env?.production]
  ]) {
    assert.equal(
      candidate?.observability?.logs?.invocation_logs,
      false,
      `${label} invocation logs must be disabled`
    );
    assert.equal(candidate?.logpush, false, `${label} Logpush must be disabled`);
    assert.deepEqual(
      candidate?.tail_consumers,
      [],
      `${label} Tail Workers must be absent`
    );
    assert.deepEqual(
      candidate?.streaming_tail_consumers,
      [],
      `${label} streaming tails must be absent`
    );
    assert.equal(candidate?.workers_dev, false, `${label} workers.dev must be disabled`);
    assert.equal(candidate?.preview_urls, false, `${label} preview URLs must be disabled`);
  }
});

test('Wrangler staging uses only the isolated exact custom-domain authority set', async () => {
  const config = parseJsonc(await readFile(configPath, 'utf8'));
  const staging = config.env?.staging;

  assert.equal(staging?.vars?.OVERLAY_ROUTING_ENVIRONMENT, 'staging');
  assert.deepEqual(staging?.routes, [
    {
      pattern: 'overlay-staging.ltth.app',
      custom_domain: true
    },
    {
      pattern: '*.overlay-staging.ltth.app/*',
      zone_name: 'ltth.app'
    }
  ]);
  assert.equal(
    JSON.stringify(staging).includes('workers.dev'),
    false,
    'staging must not present workers.dev as an ingress authority'
  );
});
