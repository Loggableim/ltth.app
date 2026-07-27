'use strict';

(function initStableOverlayRouting(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.LTTHStableOverlayRouting = api;
  }
})(
  typeof window !== 'undefined' ? window : null,
  function createStableOverlayRoutingApi(root) {
    const LOCAL_PREFIX = '/api/stable-overlay-routing';
    let configuredGetFreshToken = null;

    function defaultTranslate(key, fallback) {
      const translated = root?.i18n?.t?.(key);
      return translated && translated !== key ? translated : fallback;
    }

    function defaultFetch(...args) {
      if (typeof root?.fetch !== 'function') {
        throw new Error('Stable overlay routing request is unavailable.');
      }
      return root.fetch(...args);
    }

    function getConfiguredFreshToken(options) {
      const getter = configuredGetFreshToken ||
        root?.StoreAuth?.getFreshToken ||
        root?.ClerkStoreAuth?.getFreshToken;
      if (typeof getter !== 'function') {
        throw new Error('Fresh Clerk account access is unavailable.');
      }
      return getter.call(root?.StoreAuth || root?.ClerkStoreAuth, options);
    }

    async function getAccount({ token, fetchImpl = defaultFetch } = {}) {
      if (typeof token !== 'string' || !token || /\s/.test(token)) {
        throw new Error('Fresh Clerk account access is unavailable.');
      }
      const response = await fetchImpl(`${LOCAL_PREFIX}/account`, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success !== true) {
        const error = new Error(
          payload.error || 'Stable overlay routing request failed.'
        );
        error.code = payload.code || 'STABLE_ROUTING_REQUEST_FAILED';
        throw error;
      }
      return payload;
    }

    async function getConnectedUsername({
      fetchImpl = defaultFetch
    } = {}) {
      const response = await fetchImpl('/api/status', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store'
      });
      if (!response.ok) return null;
      const payload = await response.json().catch(() => ({}));
      return payload.isConnected === true &&
        typeof payload.username === 'string' &&
        payload.username.trim()
        ? payload.username.trim()
        : null;
    }

    const accountAccess = Object.freeze({
      getFreshToken: options => getConfiguredFreshToken(options),
      getAccount,
      getConnectedUsername
    });

    function configureAccountAccess({ getFreshToken } = {}) {
      configuredGetFreshToken = typeof getFreshToken === 'function'
        ? getFreshToken
        : null;
      return accountAccess;
    }

    function createStableOverlayRoutingUI(options = {}) {
      const mount = options.root;
      if (!mount || typeof mount.querySelector !== 'function') {
        throw new TypeError('A stable overlay routing UI root is required.');
      }
      const documentRef = mount.ownerDocument;
      const fetchImpl = options.fetchImpl || defaultFetch;
      const translate = options.translate || defaultTranslate;
      const notify = typeof options.notify === 'function'
        ? options.notify
        : () => {};
      const signIn = typeof options.signIn === 'function'
        ? options.signIn
        : () => root?.StoreAuth?.beginBridgeAuth?.('sign-in');
      const getFreshToken = options.getFreshToken ||
        (details => accountAccess.getFreshToken(details));
      const copyApi = options.copyApi || root?.LTTHTikTokStudioUrl || {};
      const state = {
        initialized: false,
        busy: false,
        status: {
          state: 'loading',
          revision: null,
          lastSuccessfulHeartbeat: null
        },
        connectedUsername: null,
        accountPayload: null,
        accountLoaded: false,
        releaseTarget: null,
        message: '',
        messageType: 'info'
      };

      function t(key, fallback) {
        return translate(`network.stable_overlay_routing.${key}`, fallback);
      }

      function q(selector) {
        return mount.querySelector(selector);
      }

      function setText(selector, value) {
        const node = q(selector);
        if (node) node.textContent = value;
      }

      function formatDate(value) {
        if (!value || !Number.isFinite(Date.parse(value))) {
          return t('never', 'Never');
        }
        try {
          return new Date(value).toLocaleString();
        } catch (_) {
          return value;
        }
      }

      function renderShell() {
        mount.innerHTML = `
          <div class="flex flex-wrap items-start justify-between gap-3 mb-3">
            <div>
              <h4 class="text-sm font-semibold text-gray-200">
                <span data-stable-routing-title data-i18n="network.stable_overlay_routing.title"></span>
              </h4>
              <p class="text-xs text-gray-400 mt-1" data-stable-routing-description data-i18n="network.stable_overlay_routing.description"></p>
            </div>
            <div class="flex gap-2">
              <button type="button" class="btn btn-ghost btn-sm" data-stable-routing-sign-in data-i18n="network.stable_overlay_routing.sign_in"></button>
              <button type="button" class="btn btn-primary btn-sm" data-stable-routing-refresh data-i18n="network.stable_overlay_routing.refresh_account"></button>
            </div>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs mb-3">
            <div><span class="text-gray-400" data-label-feature data-i18n="network.stable_overlay_routing.feature_status"></span>: <strong data-stable-routing-feature-status></strong></div>
            <div><span class="text-gray-400" data-label-auth data-i18n="network.stable_overlay_routing.auth_status"></span>: <strong data-stable-routing-auth-status></strong></div>
            <div><span class="text-gray-400" data-label-route data-i18n="network.stable_overlay_routing.route_status"></span>: <strong data-stable-routing-route-status></strong></div>
            <div><span class="text-gray-400" data-label-enrollment data-i18n="network.stable_overlay_routing.enrollment_status"></span>: <strong data-stable-routing-enrollment-status></strong></div>
            <div><span class="text-gray-400" data-label-active-device data-i18n="network.stable_overlay_routing.active_device"></span>: <strong data-stable-routing-active-device></strong></div>
            <div><span class="text-gray-400" data-label-connected data-i18n="network.stable_overlay_routing.connected_username"></span>: <strong data-stable-routing-connected></strong></div>
            <div><span class="text-gray-400" data-label-default data-i18n="network.stable_overlay_routing.default_username"></span>: <strong data-stable-routing-default></strong></div>
            <div><span class="text-gray-400" data-label-heartbeat data-i18n="network.stable_overlay_routing.heartbeat"></span>: <strong data-stable-routing-heartbeat></strong></div>
          </div>
          <p class="rounded p-2 mb-3 text-xs bg-gray-800 text-gray-300" role="status" aria-live="polite" data-stable-routing-message></p>
          <div class="bg-gray-800 rounded p-3 mb-3">
            <label class="block text-xs text-gray-400 mb-1" for="stable-routing-device-label" data-label-device-label data-i18n="network.stable_overlay_routing.device_label"></label>
            <input id="stable-routing-device-label" class="form-input w-full mb-2" maxlength="64" data-stable-routing-device-label>
            <button type="button" class="btn btn-ghost btn-sm" data-stable-routing-reenroll data-i18n="network.stable_overlay_routing.reenroll"></button>
          </div>
          <div class="bg-gray-800 rounded p-3 mb-3">
            <label class="block text-xs text-gray-400 mb-1" for="stable-routing-claim-username" data-label-claim data-i18n="network.stable_overlay_routing.claim_username"></label>
            <input id="stable-routing-claim-username" class="form-input w-full mb-2" readonly data-stable-routing-claim-username>
            <p class="text-xs text-yellow-300 mb-2" data-stable-routing-first-claim-warning data-i18n="network.stable_overlay_routing.first_claim_warning"></p>
            <label class="flex items-start gap-2 text-xs text-gray-300 mb-2">
              <input type="checkbox" data-stable-routing-first-claim>
              <span data-label-first-claim data-i18n="network.stable_overlay_routing.first_claim_acknowledgement"></span>
            </label>
            <button type="button" class="btn btn-primary btn-sm" data-stable-routing-claim data-i18n="network.stable_overlay_routing.claim_username"></button>
          </div>
          <div class="mb-3" data-stable-routing-claims></div>
          <div class="mb-3" data-stable-routing-devices></div>
          <div class="bg-gray-800 rounded p-3">
            <label class="block text-xs text-gray-400 mb-1" for="stable-routing-overlay-url" data-label-overlay-url data-i18n="network.stable_overlay_routing.overlay_url"></label>
            <input id="stable-routing-overlay-url" type="url" class="form-input w-full mb-2" data-stable-routing-overlay-url>
            <div class="flex flex-wrap gap-2">
              <button type="button" class="btn btn-primary btn-sm" data-stable-routing-copy-stable data-i18n="network.stable_overlay_routing.copy_stable"></button>
              <button type="button" class="btn btn-ghost btn-sm" data-stable-routing-copy-temporary data-i18n="network.stable_overlay_routing.copy_temporary"></button>
            </div>
            <p class="text-xs text-yellow-300 mt-2" data-stable-routing-no-fallback data-i18n="network.stable_overlay_routing.no_silent_fallback"></p>
          </div>
        `;

        setText('[data-stable-routing-title]', t(
          'title',
          'Stable TikTok Studio URLs'
        ));
        setText('[data-stable-routing-description]', t(
          'description',
          'Keep overlay links stable while this LTTH installation is online.'
        ));
        setText('[data-label-feature]', t('feature_status', 'Feature'));
        setText('[data-label-auth]', t('auth_status', 'Account'));
        setText('[data-label-route]', t('route_status', 'Route'));
        setText(
          '[data-label-enrollment]',
          t('enrollment_status', 'Enrollment')
        );
        setText(
          '[data-label-active-device]',
          t('active_device', 'Active device')
        );
        setText(
          '[data-label-connected]',
          t('connected_username', 'Connected username')
        );
        setText(
          '[data-label-default]',
          t('default_username', 'Default username')
        );
        setText(
          '[data-label-heartbeat]',
          t('heartbeat', 'Last heartbeat')
        );
        setText('[data-label-device-label]', t(
          'device_label',
          'Installation label'
        ));
        setText('[data-label-claim]', t(
          'claim_username',
          'Claim TikTok username'
        ));
        setText('[data-label-first-claim]', t(
          'first_claim_acknowledgement',
          'I understand that the first authenticated account to claim this available username owns it.'
        ));
        setText('[data-stable-routing-first-claim-warning]', t(
          'first_claim_warning',
          'Clerk confirms your LTTH account, not ownership of the TikTok username. Only the currently connected username is offered.'
        ));
        setText('[data-label-overlay-url]', t(
          'overlay_url',
          'Local registered overlay URL'
        ));
        setText('[data-stable-routing-no-fallback]', t(
          'no_silent_fallback',
          'Stable copy never silently falls back. Use the temporary action explicitly when needed.'
        ));
        setText('[data-stable-routing-sign-in]', t('sign_in', 'Sign in'));
        setText(
          '[data-stable-routing-refresh]',
          t('refresh_account', 'Refresh account')
        );
        setText('[data-stable-routing-reenroll]', t(
          'reenroll',
          'Re-enroll this installation'
        ));
        setText(
          '[data-stable-routing-claim]',
          t('claim_username', 'Claim TikTok username')
        );
        setText(
          '[data-stable-routing-copy-stable]',
          t('copy_stable', 'Copy stable URL')
        );
        setText(
          '[data-stable-routing-copy-temporary]',
          t('copy_temporary', 'Copy temporary Quick Tunnel URL')
        );
        q('[data-stable-routing-device-label]').value = t(
          'device_label_default',
          'This LTTH installation'
        );
      }

      function routeStatusLabel(value) {
        const labels = {
          active: t('active', 'Active'),
          offline: t('offline', 'Offline'),
          error: t('error', 'Error'),
          needs_auth: t('error', 'Error'),
          unenrolled: t('offline', 'Offline'),
          disabled: t('unavailable', 'Unavailable'),
          loading: t('loading', 'Loading...')
        };
        return labels[value] || t('offline', 'Offline');
      }

      function renderClaims() {
        const container = q('[data-stable-routing-claims]');
        if (!container) return;
        container.replaceChildren();
        const claims = state.accountPayload?.account?.claims || [];
        for (const claim of claims) {
          const row = documentRef.createElement('div');
          row.className = 'bg-gray-800 rounded p-3 mb-2 text-xs';
          row.setAttribute('data-claim-username', claim.username);

          const heading = documentRef.createElement('div');
          heading.className =
            'flex flex-wrap items-center justify-between gap-2';
          const label = documentRef.createElement('strong');
          label.textContent = `@${claim.displayUsername || claim.username}`;
          heading.appendChild(label);
          const stateLabel = documentRef.createElement('span');
          stateLabel.textContent = claim.state === 'active'
            ? t('active', 'Active')
            : t('cooldown_until', 'Cooldown until {date}')
              .replace('{date}', formatDate(claim.reusableAfter));
          heading.appendChild(stateLabel);
          row.appendChild(heading);

          if (state.accountPayload.defaultUsername === claim.username) {
            const badge = documentRef.createElement('span');
            badge.className = 'text-blue-300 block mt-1';
            badge.textContent = t('default_badge', 'Default');
            row.appendChild(badge);
          }

          const actions = documentRef.createElement('div');
          actions.className = 'flex flex-wrap gap-2 mt-2';
          if (claim.state === 'active') {
            if (state.accountPayload.defaultUsername !== claim.username) {
              actions.appendChild(actionButton(
                t('set_default', 'Set as default'),
                'data-stable-routing-default-action',
                claim.username
              ));
            }
            actions.appendChild(actionButton(
              t('release', 'Release username'),
              'data-stable-routing-release',
              claim.username,
              'btn-danger'
            ));
          } else {
            actions.appendChild(actionButton(
              t('restore', 'Restore username'),
              'data-stable-routing-restore',
              claim.username
            ));
          }
          row.appendChild(actions);

          if (state.releaseTarget === claim.username) {
            const release = documentRef.createElement('div');
            release.className = 'mt-3';
            const releaseLabel = documentRef.createElement('label');
            releaseLabel.className = 'block text-gray-400 mb-1';
            releaseLabel.htmlFor = 'stable-routing-release-input';
            releaseLabel.textContent = t(
              'release_retype',
              'Retype the canonical username to release it'
            );
            const input = documentRef.createElement('input');
            input.id = 'stable-routing-release-input';
            input.className = 'form-input w-full mb-2';
            input.setAttribute('data-stable-routing-release-input', '');
            input.autocomplete = 'off';
            const confirm = documentRef.createElement('button');
            confirm.type = 'button';
            confirm.className = 'btn btn-danger btn-sm';
            confirm.setAttribute(
              'data-stable-routing-release-confirm',
              ''
            );
            confirm.textContent = t('release_confirm', 'Confirm release');
            confirm.disabled = true;
            release.append(releaseLabel, input, confirm);
            row.appendChild(release);
          }
          container.appendChild(row);
        }
      }

      function actionButton(text, attribute, value, extraClass = '') {
        const button = documentRef.createElement('button');
        button.type = 'button';
        button.className = `btn btn-ghost btn-sm ${extraClass}`.trim();
        button.setAttribute(attribute, value);
        button.textContent = text;
        button.disabled = state.busy;
        return button;
      }

      function renderDevices() {
        const container = q('[data-stable-routing-devices]');
        if (!container) return;
        container.replaceChildren();
        const devices = state.accountPayload?.account?.devices || [];
        for (const device of devices) {
          const row = documentRef.createElement('div');
          row.className =
            'bg-gray-800 rounded p-3 mb-2 text-xs flex items-center gap-2';
          const label = documentRef.createElement('span');
          label.className = 'flex-1';
          label.textContent = `${device.label} · ${formatDate(device.lastSeenAt)}`;
          const revoke = actionButton(
            t('revoke_device', 'Revoke device'),
            'data-stable-routing-revoke',
            device.deviceId,
            'btn-danger'
          );
          row.append(label, revoke);
          container.appendChild(row);
        }
      }

      function render() {
        const featureUnavailable = state.status.state === 'disabled';
        const account = state.accountPayload?.account || null;
        const activeDevice = account?.lease?.active
          ? account.devices.find(
            device => device.deviceId === account.lease.deviceId
          )
          : null;
        const connectedClaim = account?.claims?.find(claim =>
          claim.username === String(state.connectedUsername || '')
            .toLowerCase() &&
          claim.state === 'active'
        );

        setText(
          '[data-stable-routing-feature-status]',
          featureUnavailable
            ? t('unavailable', 'Unavailable')
            : t('enabled', 'Enabled')
        );
        setText(
          '[data-stable-routing-auth-status]',
          state.accountLoaded
            ? t('signed_in', 'Signed in')
            : t('sign_in_required', 'Sign-in required')
        );
        setText(
          '[data-stable-routing-route-status]',
          routeStatusLabel(state.status.state)
        );
        setText(
          '[data-stable-routing-enrollment-status]',
          featureUnavailable
            ? t('unavailable', 'Unavailable')
            : state.status.state === 'unenrolled'
              ? t('unenrolled', 'Unenrolled')
              : t('enrolled', 'Enrolled')
        );
        setText(
          '[data-stable-routing-active-device]',
          activeDevice?.label || t('no_active_device', 'No active device')
        );
        setText(
          '[data-stable-routing-connected]',
          state.connectedUsername
            ? `@${state.connectedUsername}`
            : t('offline', 'Offline')
        );
        setText(
          '[data-stable-routing-default]',
          state.accountPayload?.defaultUsername
            ? `@${state.accountPayload.defaultUsername}`
            : '—'
        );
        setText(
          '[data-stable-routing-heartbeat]',
          formatDate(state.status.lastSuccessfulHeartbeat)
        );
        setText('[data-stable-routing-message]', state.message);

        const usernameInput = q('[data-stable-routing-claim-username]');
        if (usernameInput) usernameInput.value = state.connectedUsername || '';
        const acknowledgement = q('[data-stable-routing-first-claim]');
        const claimButton = q('[data-stable-routing-claim]');
        const alreadyOwned = Boolean(connectedClaim);
        if (claimButton) {
          claimButton.disabled =
            state.busy ||
            featureUnavailable ||
            !state.accountLoaded ||
            !state.connectedUsername ||
            alreadyOwned ||
            acknowledgement?.checked !== true;
        }
        const refreshButton = q('[data-stable-routing-refresh]');
        if (refreshButton) {
          refreshButton.disabled = state.busy || featureUnavailable;
        }
        const reenrollButton = q('[data-stable-routing-reenroll]');
        if (reenrollButton) {
          reenrollButton.disabled =
            state.busy || featureUnavailable || !state.accountLoaded;
        }
        const stableCopy = q('[data-stable-routing-copy-stable]');
        if (stableCopy) stableCopy.disabled = state.busy || featureUnavailable;
        const temporaryCopy = q('[data-stable-routing-copy-temporary]');
        if (temporaryCopy) temporaryCopy.disabled = state.busy;
        renderClaims();
        renderDevices();
      }

      async function parseResponse(response) {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.success !== true) {
          const error = new Error(
            payload.error || t('request_error', 'The request failed.')
          );
          error.code = payload.code || 'STABLE_ROUTING_REQUEST_FAILED';
          throw error;
        }
        return payload;
      }

      async function loadStatus() {
        const response = await fetchImpl(`${LOCAL_PREFIX}/status`, {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store'
        });
        const payload = await parseResponse(response);
        state.status = payload.status;
        return payload;
      }

      async function loadConnectedUsername() {
        state.connectedUsername = await getConnectedUsername({ fetchImpl });
        return state.connectedUsername;
      }

      async function loadAccountWithToken(token) {
        const payload = await getAccount({ token, fetchImpl });
        state.accountPayload = payload;
        state.accountLoaded = true;
        return payload;
      }

      async function init() {
        if (state.initialized) return state;
        state.initialized = true;
        renderShell();
        state.message = t('loading', 'Loading...');
        render();
        try {
          await Promise.all([loadStatus(), loadConnectedUsername()]);
          state.message = '';
        } catch (_) {
          state.status = {
            state: 'error',
            revision: null,
            lastSuccessfulHeartbeat: null
          };
          state.message = t(
            'request_error',
            'Stable overlay routing is temporarily unavailable.'
          );
        }
        render();
        return state;
      }

      async function refreshAccount() {
        state.busy = true;
        render();
        try {
          const token = await getFreshToken({ action: 'account' });
          await Promise.all([
            loadAccountWithToken(token),
            loadStatus(),
            loadConnectedUsername()
          ]);
          state.message = t('account_refreshed', 'Account refreshed.');
          state.messageType = 'success';
        } catch (error) {
          state.accountPayload = null;
          state.accountLoaded = false;
          state.message = error?.code &&
            error.code !== 'AUTH_REQUIRED'
            ? t(
              'request_error',
              'The stable overlay routing request could not be completed.'
            )
            : t(
              'auth_error',
              'Sign in again to manage stable URLs.'
            );
          state.messageType = 'error';
        } finally {
          state.busy = false;
          render();
        }
        return state;
      }

      async function authenticatedAction(action, operation) {
        state.busy = true;
        render();
        try {
          const token = await getFreshToken({ action });
          await operation(token);
          await Promise.all([
            loadAccountWithToken(token),
            loadStatus(),
            loadConnectedUsername()
          ]);
          state.message = t('action_complete', 'Action completed.');
          state.messageType = 'success';
          notify(state.message, 'success');
        } catch (error) {
          if (error?.code === 'AUTH_REQUIRED') {
            state.message = t(
              'auth_error',
              'Sign in again to manage stable URLs.'
            );
          } else if ([
            'claim_conflict',
            'claim_unavailable'
          ].includes(error?.code)) {
            state.message = t(
              'conflict_error',
              'This TikTok username is unavailable. No account identity was disclosed.'
            );
          } else {
            state.message = t(
              'request_error',
              'The stable overlay routing request could not be completed.'
            );
          }
          state.messageType = 'error';
          notify(state.message, 'error');
        } finally {
          state.busy = false;
          state.releaseTarget = null;
          render();
        }
      }

      async function mutation(token, path, method, body) {
        const response = await fetchImpl(`${LOCAL_PREFIX}${path}`, {
          method,
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });
        return parseResponse(response);
      }

      function installationLabel() {
        return q('[data-stable-routing-device-label]')?.value.trim() ||
          t('device_label_default', 'This LTTH installation');
      }

      async function claim() {
        const username = state.connectedUsername;
        if (
          !state.accountLoaded ||
          !username ||
          q('[data-stable-routing-first-claim]')?.checked !== true
        ) {
          return;
        }
        await authenticatedAction('claim', async token => {
          if (state.status.state === 'unenrolled') {
            await mutation(token, '/devices/enroll', 'POST', {
              label: installationLabel()
            });
          }
          await mutation(token, '/claims', 'POST', { username });
        });
      }

      async function restore(username) {
        await authenticatedAction('restore', token => mutation(
          token,
          `/claims/${encodeURIComponent(username)}/restore`,
          'POST',
          {}
        ));
      }

      async function release(username) {
        await authenticatedAction('release', token => mutation(
          token,
          `/claims/${encodeURIComponent(username)}`,
          'DELETE',
          { username }
        ));
      }

      async function setDefault(username) {
        await authenticatedAction('set_default', token => mutation(
          token,
          '/default-username',
          'PUT',
          { username }
        ));
      }

      async function reenroll() {
        await authenticatedAction('enroll', token => mutation(
          token,
          '/devices/enroll',
          'POST',
          { label: installationLabel() }
        ));
      }

      async function revoke(deviceId) {
        await authenticatedAction('revoke_device', token => mutation(
          token,
          `/devices/${encodeURIComponent(deviceId)}`,
          'DELETE',
          {}
        ));
      }

      const copyAccountAccess = {
        getFreshToken,
        getAccount: ({ token }) => getAccount({ token, fetchImpl }),
        getConnectedUsername: () => getConnectedUsername({ fetchImpl })
      };

      async function copyStable() {
        const value = q('[data-stable-routing-overlay-url]')?.value.trim() || '';
        state.busy = true;
        render();
        try {
          if (typeof copyApi.copy !== 'function') {
            throw new Error('Stable copy is unavailable.');
          }
          await copyApi.copy(value, {
            accountAccess: copyAccountAccess
          });
          state.message = t('stable_copied', 'Stable URL copied.');
          notify(state.message, 'success');
        } catch (_) {
          state.message = t(
            'stable_copy_failed',
            'Stable URL could not be copied. No temporary URL was copied.'
          );
          notify(state.message, 'error');
        } finally {
          state.busy = false;
          render();
        }
      }

      async function copyTemporary() {
        const value = q('[data-stable-routing-overlay-url]')?.value.trim() || '';
        state.busy = true;
        render();
        try {
          if (typeof copyApi.copyTemporary !== 'function') {
            throw new Error('Temporary copy is unavailable.');
          }
          await copyApi.copyTemporary(value);
          state.message = t('temporary_copied', 'Temporary URL copied.');
          notify(state.message, 'success');
        } catch (_) {
          state.message = t(
            'request_error',
            'The stable overlay routing request could not be completed.'
          );
          notify(state.message, 'error');
        } finally {
          state.busy = false;
          render();
        }
      }

      function attention(detail = {}) {
        state.message = detail.code === 'STABLE_OVERLAY_CLAIM_REQUIRED'
          ? t(
            'attention_claim_required',
            'Claim the connected TikTok username before copying a stable URL.'
          )
          : t(
            'request_error',
            'The stable overlay routing request could not be completed.'
          );
        render();
        mount.scrollIntoView?.({ block: 'center' });
        q('[data-stable-routing-refresh]')?.focus?.();
      }

      mount.addEventListener('change', event => {
        if (event.target.matches('[data-stable-routing-first-claim]')) {
          render();
        }
      });
      mount.addEventListener('input', event => {
        if (event.target.matches('[data-stable-routing-release-input]')) {
          const confirm = q('[data-stable-routing-release-confirm]');
          if (confirm) {
            confirm.disabled = event.target.value !== state.releaseTarget;
          }
        }
      });
      mount.addEventListener('click', event => {
        const target = event.target.closest('button');
        if (!target || target.disabled) return;
        if (target.matches('[data-stable-routing-sign-in]')) {
          signIn();
        } else if (target.matches('[data-stable-routing-refresh]')) {
          void refreshAccount();
        } else if (target.matches('[data-stable-routing-claim]')) {
          void claim();
        } else if (target.matches('[data-stable-routing-reenroll]')) {
          void reenroll();
        } else if (target.matches('[data-stable-routing-copy-stable]')) {
          void copyStable();
        } else if (target.matches('[data-stable-routing-copy-temporary]')) {
          void copyTemporary();
        } else if (target.hasAttribute('data-stable-routing-restore')) {
          void restore(target.getAttribute('data-stable-routing-restore'));
        } else if (target.hasAttribute('data-stable-routing-release')) {
          state.releaseTarget = target.getAttribute(
            'data-stable-routing-release'
          );
          render();
        } else if (
          target.matches('[data-stable-routing-release-confirm]')
        ) {
          const username = state.releaseTarget;
          if (
            username &&
            q('[data-stable-routing-release-input]')?.value === username
          ) {
            void release(username);
          }
        } else if (
          target.hasAttribute('data-stable-routing-default-action')
        ) {
          void setDefault(target.getAttribute(
            'data-stable-routing-default-action'
          ));
        } else if (target.hasAttribute('data-stable-routing-revoke')) {
          void revoke(target.getAttribute('data-stable-routing-revoke'));
        }
      });

      return {
        accountAccess: copyAccountAccess,
        attention,
        init,
        refresh: refreshAccount,
        render,
        get state() {
          return state;
        }
      };
    }

    return {
      accountAccess,
      configureAccountAccess,
      createStableOverlayRoutingUI,
      createUI: createStableOverlayRoutingUI
    };
  }
);
