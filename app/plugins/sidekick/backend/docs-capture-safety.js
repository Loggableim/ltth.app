'use strict';

function createDocsCaptureSafeConfig(config = {}) {
  const source = config && typeof config === 'object' && !Array.isArray(config) ? config : {};
  return {
    ...source,
    avatar: {
      ...(source.avatar && typeof source.avatar === 'object' ? source.avatar : {}),
      driver: 'vnyan',
      vnyan: {
        ...(source.avatar?.vnyan && typeof source.avatar.vnyan === 'object' ? source.avatar.vnyan : {}),
        host: '127.0.0.1',
        port: 8000,
        path: '/vnyan',
        autoConnect: false,
        reconnectOnDisconnect: false
      }
    },
    animaze: {
      ...(source.animaze && typeof source.animaze === 'object' ? source.animaze : {}),
      enabled: false,
      host: '127.0.0.1',
      port: 9000,
      autoConnect: false,
      reconnectOnDisconnect: false
    },
    muted: true,
    comment: {
      ...(source.comment && typeof source.comment === 'object' ? source.comment : {}),
      enabled: false
    },
    joinRules: {
      ...(source.joinRules && typeof source.joinRules === 'object' ? source.joinRules : {}),
      enabled: false
    }
  };
}

function createDocsCaptureVisibleConfig() {
  return {
    muted: true,
    avatar: {
      driver: 'vnyan',
      vnyan: {
        host: '127.0.0.1', port: 8000, path: '/vnyan',
        autoConnect: false, reconnectOnDisconnect: false
      }
    },
    animaze: {
      enabled: false, host: '127.0.0.1', port: 9000,
      autoConnect: false, reconnectOnDisconnect: false
    },
    comment: { enabled: false },
    joinRules: { enabled: false }
  };
}

module.exports = { createDocsCaptureSafeConfig, createDocsCaptureVisibleConfig };
