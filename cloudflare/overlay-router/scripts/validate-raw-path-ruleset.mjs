import { readFile } from 'node:fs/promises';

const DEFAULT_TEMPLATE_URL = new URL(
  '../rulesets/raw-path-guard.ruleset.template.json',
  import.meta.url
);
const MARKER_HEADER = 'x-ltth-raw-path-guard';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
const PRODUCTION_HOST_SCOPE =
  'http.host eq "overlay.ltth.app" or ' +
  '(starts_with(http.host, "r-") and ' +
  'ends_with(http.host, ".ltth.app") and len(http.host) eq 43)';
const STAGING_HOST_SCOPE =
  'http.host eq "overlay-staging.ltth.app" or ' +
  '(starts_with(http.host, "r-") and ' +
  'ends_with(http.host, ".overlay-staging.ltth.app") and ' +
  'len(http.host) eq 59)';
const RAW_PATH = 'raw.http.request.uri.path';
const DECODED_PATH = `url_decode(${RAW_PATH}, "r")`;
const SAFETY_CLAUSES = [
  `not (${RAW_PATH} contains "\\\\")`,
  `not (${RAW_PATH} contains "//")`,
  `not (${RAW_PATH} eq "/.")`,
  `not (${RAW_PATH} eq "/..")`,
  `not (${RAW_PATH} contains "/./")`,
  `not (${RAW_PATH} contains "/../")`,
  `not ends_with(${RAW_PATH}, "/.")`,
  `not ends_with(${RAW_PATH}, "/..")`,
  `not (lower(${RAW_PATH}) contains "%2f")`,
  `not (lower(${RAW_PATH}) contains "%5c")`,
  `not (${DECODED_PATH} contains "\\\\")`,
  `not (${DECODED_PATH} contains "//")`,
  `not (${DECODED_PATH} eq "/.")`,
  `not (${DECODED_PATH} eq "/..")`,
  `not (${DECODED_PATH} contains "/./")`,
  `not (${DECODED_PATH} contains "/../")`,
  `not ends_with(${DECODED_PATH}, "/.")`,
  `not ends_with(${DECODED_PATH}, "/..")`,
  `not (lower(${DECODED_PATH}) contains "%2f")`,
  `not (lower(${DECODED_PATH}) contains "%5c")`
];
const ENVIRONMENTS = Object.freeze([
  Object.freeze({
    label: 'production',
    removeRef: 'ltth_production_raw_path_guard_remove_caller_marker',
    restoreRef: 'ltth_production_raw_path_guard_restore_safe_marker',
    hostScope: PRODUCTION_HOST_SCOPE,
    placeholder:
      '<REPLACE_WITH_PRODUCTION_64_CHAR_URL_SAFE_TOKEN>'
  }),
  Object.freeze({
    label: 'staging',
    removeRef: 'ltth_staging_raw_path_guard_remove_caller_marker',
    restoreRef: 'ltth_staging_raw_path_guard_restore_safe_marker',
    hostScope: STAGING_HOST_SCOPE,
    placeholder:
      '<REPLACE_WITH_STAGING_64_CHAR_URL_SAFE_TOKEN>'
  })
]);

function requireCondition(condition, message, failures) {
  if (!condition) {
    failures.push(message);
  }
}

const failures = [];
let ruleset;
const templateSource = process.argv[2] || DEFAULT_TEMPLATE_URL;
try {
  ruleset = JSON.parse(await readFile(templateSource, 'utf8'));
} catch (error) {
  console.error(`Ruleset template could not be parsed: ${error.message}`);
  process.exitCode = 1;
}

if (ruleset) {
  requireCondition(
    ruleset.kind === 'zone',
    'Ruleset kind must be zone',
    failures
  );
  requireCondition(
    ruleset.phase === 'http_request_late_transform',
    'Ruleset phase must be http_request_late_transform',
    failures
  );
  requireCondition(
    Array.isArray(ruleset.rules) && ruleset.rules.length === 4,
    'Ruleset must contain two ordered rules per isolated environment',
    failures
  );

  for (const [environmentIndex, environment] of
    ENVIRONMENTS.entries()) {
    const removeRule = ruleset.rules?.[environmentIndex * 2];
    const restoreRule = ruleset.rules?.[(environmentIndex * 2) + 1];
    const removeHeaders = removeRule?.action_parameters?.headers;
    const restoreHeaders = restoreRule?.action_parameters?.headers;
    const removeHeader = removeHeaders?.[MARKER_HEADER];
    const restoreHeader = restoreHeaders?.[MARKER_HEADER];
    const safeRestoreExpression =
      `(${environment.hostScope}) and ${SAFETY_CLAUSES.join(' and ')}`;

    requireCondition(
      removeRule?.ref === environment.removeRef &&
        removeRule?.action === 'rewrite' &&
        removeRule?.enabled === true &&
        removeHeader?.operation === 'remove' &&
        removeHeaders &&
        Object.keys(removeHeaders).length === 1,
      `${environment.label} first rule must remove every caller marker`,
      failures
    );
    requireCondition(
      restoreRule?.ref === environment.restoreRef &&
        restoreRule?.action === 'rewrite' &&
        restoreRule?.enabled === true &&
        restoreHeader?.operation === 'set' &&
        restoreHeaders &&
        Object.keys(restoreHeaders).length === 1,
      `${environment.label} second rule must restore only safe markers`,
      failures
    );
    requireCondition(
      restoreHeader?.value === environment.placeholder &&
        !TOKEN_PATTERN.test(restoreHeader?.value || ''),
      `${environment.label} must use its fail-closed token placeholder`,
      failures
    );
    requireCondition(
      removeRule?.expression === environment.hostScope,
      `${environment.label} removal must use its exact routing-host scope`,
      failures
    );
    requireCondition(
      restoreRule?.expression === safeRestoreExpression,
      `${environment.label} restore must enforce exact path safety`,
      failures
    );
    requireCondition(
      !/\bmatches\b|~/.test(restoreRule?.expression || ''),
      `${environment.label} must avoid paid-plan regex operators`,
      failures
    );
  }
  requireCondition(
    ENVIRONMENTS[0].placeholder !== ENVIRONMENTS[1].placeholder,
    'Production and staging must use distinct token placeholders',
    failures
  );
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else if (ruleset) {
  console.log(
    'Raw-path guard ruleset template is structurally valid and secret-free.'
  );
}
