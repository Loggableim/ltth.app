import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('overlay router worker scaffold', () => {
  it('returns 404 for an unrelated authority without ingress attestation', async () => {
    const response = await SELF.fetch(
      'https://www.ltth.app/plugins/%252e%252e/overlay.html'
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Not Found');
  });

  it('runs with the local D1 binding and fails closed without ingress attestation', async () => {
    expect(env.OVERLAY_ROUTING_DB).toBeDefined();

    const result = await env.OVERLAY_ROUTING_DB.prepare('SELECT 1 AS value').first();
    expect(result).toEqual({ value: 1 });

    const entry = await SELF.fetch('https://overlay.ltth.app/any-path');
    const management = await SELF.fetch(
      'https://overlay.ltth.app/_ltth/v1/account'
    );
    const proxy = await SELF.fetch(
      'https://r-0123456789abcdef0123456789abcdef.ltth.app/overlay.html'
    );

    for (const response of [entry, management, proxy]) {
      expect(response.status).toBe(503);
      expect(await response.text()).toBe('Service Unavailable');
    }
  });
});
