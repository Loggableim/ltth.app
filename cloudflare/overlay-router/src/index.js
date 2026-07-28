import {
  createManagementHandlerFromEnvironment
} from './management.js';
import {
  classifyRoutingAuthority,
  resolveRoutingAuthorities
} from './authority.js';
import { hasTrustedRawPathAttestation } from './public-path.js';
import {
  createProxyHandler,
  createProxyNeutralResponse
} from './proxy.js';
import { createPublicRouter } from './public-router.js';
import { createOverlayRepository } from './repository.js';
import { createNeutralErrorResponse } from './validation.js';

export function createOverlayRouterWorker(options = {}) {
  const repositoryFactory = options.repositoryFactory ||
    ((env) => createOverlayRepository(env?.OVERLAY_ROUTING_DB));
  const managementHandlerFactory =
    options.managementHandlerFactory ||
    ((env, repository, authorities) =>
      createManagementHandlerFromEnvironment(
        env,
        repository,
        { authorities }
      ));
  const publicRouterFactory = options.publicRouterFactory ||
    ((repository, authorities) =>
      createPublicRouter({ repository, authorities }));
  const proxyHandlerFactory = options.proxyHandlerFactory ||
    ((repository, authorities) =>
      createProxyHandler({ repository, authorities }));
  const authorityResolver = options.authorityResolver ||
    resolveRoutingAuthorities;
  const rawPathAttestationVerifier =
    options.rawPathAttestationVerifier ||
    hasTrustedRawPathAttestation;

  return Object.freeze({
    async fetch(request, env, context) {
      let url;
      try {
        url = new URL(request.url);
      } catch {
        return createNeutralErrorResponse(404);
      }
      if (url.protocol !== 'https:' || url.port !== '') {
        return createNeutralErrorResponse(404);
      }
      let authorities;
      let route;
      try {
        authorities = authorityResolver(env);
        route = classifyRoutingAuthority(url.hostname, authorities);
      } catch {
        return createNeutralErrorResponse(503);
      }
      if (!route) {
        return createNeutralErrorResponse(404);
      }
      const neutral = (status) => route.kind === 'proxy'
        ? createProxyNeutralResponse(status)
        : createNeutralErrorResponse(status);

      let repository;
      let managementHandler;
      try {
        if (!rawPathAttestationVerifier(request, env)) {
          return neutral(503);
        }
        repository = repositoryFactory(env);
        managementHandler = managementHandlerFactory(
          env,
          repository,
          authorities
        );
        const managementResponse = await managementHandler(
          request,
          context
        );
        if (managementResponse !== null &&
            managementResponse !== undefined) {
          return managementResponse;
        }
      } catch {
        return neutral(503);
      }

      try {
        if (route.kind === 'entry') {
          return await publicRouterFactory(
            repository,
            authorities
          )(request);
        }
        if (route.kind === 'proxy') {
          return await proxyHandlerFactory(
            repository,
            authorities
          )(request);
        }
      } catch {
        return neutral(503);
      }
      return neutral(404);
    }
  });
}

export default createOverlayRouterWorker();
