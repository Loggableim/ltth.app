'use strict';

const express = require('express');

const {
  getIdentityCandidateIds,
  resolveInstalledPluginDirectory
} = require('./plugin-identities');

function mountPluginStaticAliases(app, pluginsDir, pluginId, options = {}) {
  const installed = resolveInstalledPluginDirectory(pluginsDir, pluginId);
  if (!installed) return null;
  const staticMiddleware = express.static(installed.path, options);
  for (const candidateId of getIdentityCandidateIds(pluginId)) {
    app.use(`/plugins/${candidateId}`, staticMiddleware);
  }
  return installed;
}

module.exports = {
  mountPluginStaticAliases
};
