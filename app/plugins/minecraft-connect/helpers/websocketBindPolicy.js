const LOOPBACK_BIND_HOSTS = new Map([
  ['localhost', '127.0.0.1'],
  ['127.0.0.1', '127.0.0.1'],
  ['::1', '::1']
]);

const LOOPBACK_ONLY_WARNING = 'Minecraft Connect only accepts localhost, 127.0.0.1, or ::1 as its WebSocket host. The configured host was kept, but a non-loopback listener will not be started.';

function getWebSocketBindPolicy(configuredHost) {
  const host = configuredHost === undefined || configuredHost === null || configuredHost === ''
    ? 'localhost'
    : typeof configuredHost === 'string'
      ? configuredHost.trim()
      : '';
  const bindHost = LOOPBACK_BIND_HOSTS.get(host.toLowerCase());

  if (!bindHost) {
    return {
      allowed: false,
      configuredHost,
      bindHost: null,
      warning: LOOPBACK_ONLY_WARNING
    };
  }

  return {
    allowed: true,
    configuredHost,
    bindHost,
    warning: null
  };
}

module.exports = {
  LOOPBACK_ONLY_WARNING,
  getWebSocketBindPolicy
};
