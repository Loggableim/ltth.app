import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_ROUTING_AUTHORITIES,
  STAGING_ROUTING_AUTHORITIES,
  buildOpaqueRouteHost,
  classifyRoutingAuthority,
  resolveRoutingAuthorities
} from './src/authority.js';

const ROUTE_KEY = '0123456789abcdef0123456789abcdef';

describe('environment-specific routing authorities', () => {
  it('keeps production authorities exact for production and local execution', () => {
    for (const environment of [undefined, 'local', 'production']) {
      const authorities = resolveRoutingAuthorities(
        environment
          ? { OVERLAY_ROUTING_ENVIRONMENT: environment }
          : {}
      );

      expect(authorities).toEqual(PRODUCTION_ROUTING_AUTHORITIES);
      expect(classifyRoutingAuthority(
        'overlay.ltth.app',
        authorities
      )).toEqual({ kind: 'entry', routeKey: null });
      expect(classifyRoutingAuthority(
        `r-${ROUTE_KEY}.ltth.app`,
        authorities
      )).toEqual({ kind: 'proxy', routeKey: ROUTE_KEY });
      expect(classifyRoutingAuthority(
        'overlay-staging.ltth.app',
        authorities
      )).toBeNull();
      expect(classifyRoutingAuthority(
        'arbitrary.example',
        authorities
      )).toBeNull();
    }
  });

  it('accepts only the isolated staging entry and opaque wildcard authorities', () => {
    const authorities = resolveRoutingAuthorities({
      OVERLAY_ROUTING_ENVIRONMENT: 'staging'
    });

    expect(authorities).toEqual(STAGING_ROUTING_AUTHORITIES);
    expect(classifyRoutingAuthority(
      'overlay-staging.ltth.app',
      authorities
    )).toEqual({ kind: 'entry', routeKey: null });
    expect(classifyRoutingAuthority(
      `r-${ROUTE_KEY}.overlay-staging.ltth.app`,
      authorities
    )).toEqual({ kind: 'proxy', routeKey: ROUTE_KEY });
    expect(buildOpaqueRouteHost(ROUTE_KEY, authorities)).toBe(
      `r-${ROUTE_KEY}.overlay-staging.ltth.app`
    );
    for (const rejected of [
      'overlay.ltth.app',
      `r-${ROUTE_KEY}.ltth.app`,
      'ltth-overlay-router-staging.example.workers.dev',
      `r-${ROUTE_KEY}.overlay-staging.ltth.app.evil.example`,
      `x-${ROUTE_KEY}.overlay-staging.ltth.app`
    ]) {
      expect(classifyRoutingAuthority(rejected, authorities)).toBeNull();
    }
  });

  it('fails closed for unknown environments and authority override variables', () => {
    expect(() => resolveRoutingAuthorities({
      OVERLAY_ROUTING_ENVIRONMENT: 'preview'
    })).toThrow();
    expect(() => resolveRoutingAuthorities({
      OVERLAY_ROUTING_ENVIRONMENT: 'production',
      OVERLAY_ENTRY_HOST: 'evil.example'
    })).toThrow();
    expect(() => resolveRoutingAuthorities({
      OVERLAY_ROUTING_ENVIRONMENT: 'staging',
      OVERLAY_ROUTE_HOST_SUFFIX: 'ltth.app'
    })).toThrow();
  });
});
