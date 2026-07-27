import {
  MANAGEMENT_HOST,
  createManagementHandlerFromEnvironment
} from './management.js';
import { hasTrustedRawPathAttestation } from './public-path.js';
import { createProxyHandler } from './proxy.js';
import { createPublicRouter } from './public-router.js';
import { createOverlayRepository } from './repository.js';
import {
  createNeutralErrorResponse,
  parseInternalRouteHost
} from './validation.js';

export function createOverlayRouterWorker(options = {}) {
  const repositoryFactory = options.repositoryFactory ||
    ((env) => createOverlayRepository(env?.OVERLAY_ROUTING_DB));
  const managementHandlerFactory =
    options.managementHandlerFactory ||
    ((env, repository) =>
      createManagementHandlerFromEnvironment(env, repository));
  const publicRouterFactory = options.publicRouterFactory ||
    ((repository) => createPublicRouter({ repository }));
  const proxyHandlerFactory = options.proxyHandlerFactory ||
    ((repository) => createProxyHandler({ repository }));
  const rawPathAttestationVerifier =
    options.rawPathAttestationVerifier ||
    hasTrustedRawPathAttestation;

  return Object.freeze({
    async fetch(request, env, context) {
      let repository;
      let managementHandler;
      try {
        if (!rawPathAttestationVerifier(request, env)) {
          return createNeutralErrorResponse(503);
        }
        repository = repositoryFactory(env);
        managementHandler = managementHandlerFactory(
          env,
          repository
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
        return createNeutralErrorResponse(503);
      }

      let url;
      try {
        url = new URL(request.url);
      } catch {
        return createNeutralErrorResponse(404);
      }
      if (url.protocol !== 'https:' || url.port !== '') {
        return createNeutralErrorResponse(404);
      }

      try {
        if (url.hostname === MANAGEMENT_HOST) {
          return await publicRouterFactory(repository)(request);
        }
        if (parseInternalRouteHost(url.hostname)) {
          return await proxyHandlerFactory(repository)(request);
        }
      } catch {
        return createNeutralErrorResponse(503);
      }
      return createNeutralErrorResponse(404);
    }
  });
}

export default createOverlayRouterWorker();
