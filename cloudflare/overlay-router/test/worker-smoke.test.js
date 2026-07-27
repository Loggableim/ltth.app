import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('overlay router worker scaffold', () => {
  it('runs with the local D1 binding and fails closed without ingress attestation', async () => {
    expect(env.OVERLAY_ROUTING_DB).toBeDefined();

    const result = await env.OVERLAY_ROUTING_DB.prepare('SELECT 1 AS value').first();
    expect(result).toEqual({ value: 1 });

    const response = await SELF.fetch('https://overlay.ltth.app/any-path');
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('Service Unavailable');
  });
});
