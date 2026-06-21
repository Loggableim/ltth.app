function shouldAutoReconnectOnStartup({ autoReconnectSetting, savedUsername, env = process.env }) {
  if (!savedUsername) {
    return { enabled: false, reason: 'missing_username' };
  }

  if (env.LTTH_DISABLE_TIKTOK_AUTO_RECONNECT === 'true') {
    return { enabled: false, reason: 'env_disabled' };
  }

  if (env.LTTH_SAFE_MODE === 'true' || env.DISABLE_PLUGINS === 'true') {
    return { enabled: false, reason: 'safe_mode' };
  }

  if (autoReconnectSetting === 'false') {
    return { enabled: false, reason: 'setting_disabled' };
  }

  return { enabled: true, reason: 'enabled' };
}

module.exports = {
  shouldAutoReconnectOnStartup
};
