'use strict';

const LOCAL_PATH_REPLACEMENT = '[local path redacted]';

/** Replace absolute local paths while keeping surrounding error context. */
function redactLocalPaths(value) {
    const text = String(value);
    return text
        .replace(/(^|[^A-Za-z0-9_])([A-Za-z]:[\\/])(?:[^\\/\r\n"'<>|?*]+[\\/])*[^\\/\r\n"'<>|?*]*/g, (_, prefix) => `${prefix}${LOCAL_PATH_REPLACEMENT}`)
        .replace(/(^|[^\\])\\\\[^\\/\r\n"'<>|]+(?:\\[^\\/\r\n"'<>|]+)+/g, (_, prefix) => `${prefix}${LOCAL_PATH_REPLACEMENT}`)
        .replace(/(^|[\s("'=])\/(?:Users|home|tmp|var|private|mnt|media|opt|srv|root|workspace|Volumes)\/[^\s"'<>|,;]*/g, (_, prefix) => `${prefix}${LOCAL_PATH_REPLACEMENT}`)
        .replace(/(^|[\s("'=])\/(?:Users|home|tmp|var|private|mnt|media|opt|srv|root|workspace|Volumes)\/[A-Za-z0-9._-]+/g, (_, prefix) => `${prefix}${LOCAL_PATH_REPLACEMENT}`);
}

module.exports = { redactLocalPaths, LOCAL_PATH_REPLACEMENT };
