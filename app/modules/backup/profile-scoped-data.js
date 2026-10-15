'use strict';

const PROFILE_SCOPED_PLUGIN_DATA = Object.freeze(['advanced-timer', 'schnorrbecher']);
const PROFILE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function normalizeScopedPluginIds(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map(id => String(id)).filter(id => PROFILE_SCOPED_PLUGIN_DATA.includes(id)))];
}

function validateProfileId(profileId) {
    return typeof profileId === 'string' && PROFILE_ID_PATTERN.test(profileId);
}

function canonicalProfileId(profileName) {
    return typeof profileName === 'string'
        ? profileName.replace(/[^a-zA-Z0-9_-]/g, '_')
        : '';
}

module.exports = { PROFILE_SCOPED_PLUGIN_DATA, normalizeScopedPluginIds, validateProfileId, canonicalProfileId };
