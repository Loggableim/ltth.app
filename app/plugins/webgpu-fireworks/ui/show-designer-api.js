(function exposeShowDesignerApi(root, factory) {
  const api = factory(root);
  if (root) root.WebGpuFireworksShowDesignerApi = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function createShowDesignerApi(root) {
  'use strict';

  const BASE_URL = '/api/webgpu-fireworks/shows';

  class ShowDesignerApiError extends Error {
    constructor(message, options = {}) {
      super(message || 'The show request could not be completed.');
      this.name = 'ShowDesignerApiError';
      this.status = Number.isInteger(options.status) ? options.status : 0;
      this.code = typeof options.code === 'string' ? options.code : 'REQUEST_FAILED';
      this.details = options.details && typeof options.details === 'object'
        ? options.details
        : {};
    }
  }

  function showUrl(id, action) {
    const suffix = action ? `/${action}` : '';
    return `${BASE_URL}/${encodeURIComponent(String(id))}${suffix}`;
  }

  class ShowDesignerApi {
    constructor(options = {}) {
      this.fetchImpl = options.fetchImpl
        || (typeof root?.fetch === 'function' ? root.fetch.bind(root) : null);
      if (typeof this.fetchImpl !== 'function') {
        throw new TypeError('A fetch implementation is required.');
      }
    }

    async request(url, options = {}) {
      const request = {
        method: options.method || 'GET',
        headers: { Accept: 'application/json', ...(options.headers || {}) },
        cache: 'no-store'
      };
      if (Object.prototype.hasOwnProperty.call(options, 'body')) {
        request.headers['Content-Type'] = 'application/json';
        request.body = JSON.stringify(options.body);
      }

      let response;
      try {
        response = await this.fetchImpl(url, request);
      } catch (error) {
        throw new ShowDesignerApiError('The show service is not reachable.', {
          code: 'NETWORK_ERROR',
          details: { cause: error?.message || String(error) }
        });
      }

      let payload;
      try {
        payload = await response.json();
      } catch (error) {
        throw new ShowDesignerApiError('The show service returned an invalid response.', {
          status: response.status,
          code: 'INVALID_RESPONSE'
        });
      }
      if (!response.ok || payload?.success !== true) {
        throw new ShowDesignerApiError(payload?.error, {
          status: response.status,
          code: payload?.code,
          details: payload?.details
        });
      }
      return payload;
    }

    listShows() {
      return this.request(BASE_URL);
    }

    getShow(id) {
      return this.request(showUrl(id));
    }

    createShow(definition) {
      return this.request(BASE_URL, { method: 'POST', body: { definition } });
    }

    saveDraft(id, definition, expectedRevision) {
      return this.request(showUrl(id, 'draft'), {
        method: 'PUT',
        body: { definition, expectedRevision }
      });
    }

    validate(id, expectedRevision) {
      return this.request(showUrl(id, 'validate'), {
        method: 'POST',
        body: { expectedRevision }
      });
    }

    publish(id, expectedRevision) {
      return this.request(showUrl(id, 'publish'), {
        method: 'POST',
        body: { expectedRevision }
      });
    }

    archive(id, expectedRevision) {
      return this.request(showUrl(id, 'archive'), {
        method: 'POST',
        body: { expectedRevision }
      });
    }

    restore(id, expectedRevision) {
      return this.request(showUrl(id, 'restore'), {
        method: 'POST',
        body: { expectedRevision }
      });
    }

    duplicate(id, expectedRevision, name) {
      const body = { expectedRevision };
      if (typeof name === 'string' && name.trim()) body.name = name.trim();
      return this.request(showUrl(id, 'duplicate'), { method: 'POST', body });
    }

    derive(id, expectedRevision, options = {}) {
      return this.request(showUrl(id, 'derive'), {
        method: 'POST',
        body: { expectedRevision, ...options }
      });
    }

    preview(id, expectedRevision, options = {}) {
      return this.request(showUrl(id, 'preview'), {
        method: 'POST',
        body: { expectedRevision, ...options }
      });
    }

    importDefinition(definition) {
      return this.request(`${BASE_URL}/import`, {
        method: 'POST',
        body: { definition }
      });
    }

    exportDefinition(id) {
      return this.request(showUrl(id, 'export'));
    }
  }

  return { BASE_URL, ShowDesignerApi, ShowDesignerApiError };
});
