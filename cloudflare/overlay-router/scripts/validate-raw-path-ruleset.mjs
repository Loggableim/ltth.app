import { readFile } from 'node:fs/promises';

const DEFAULT_TEMPLATE_URL = new URL(
  '../rulesets/raw-path-guard.ruleset.template.json',
  import.meta.url
);
const MARKER_HEADER = 'x-ltth-raw-path-guard';
const TOKEN_PLACEHOLDER =
  '<REPLACE_WITH_64_CHAR_URL_SAFE_TOKEN>';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
const HOST_SCOPE =
  'http.host eq "overlay.ltth.app" or ' +
  '(starts_with(http.host, "r-") and ' +
  'ends_with(http.host, ".ltth.app") and len(http.host) eq 43)';
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
const SAFE_RESTORE_EXPRESSION =
  `(${HOST_SCOPE}) and ${SAFETY_CLAUSES.join(' and ')}`;

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
    Array.isArray(ruleset.rules) && ruleset.rules.length === 2,
    'Ruleset must contain exactly two ordered rules',
    failures
  );

  const [removeRule, restoreRule] = ruleset.rules || [];
  const removeHeader =
    removeRule?.action_parameters?.headers?.[MARKER_HEADER];
  const restoreHeader =
    restoreRule?.action_parameters?.headers?.[MARKER_HEADER];
  const removeHeaders = removeRule?.action_parameters?.headers;
  const restoreHeaders = restoreRule?.action_parameters?.headers;
  requireCondition(
    removeRule?.ref === 'ltth_raw_path_guard_remove_caller_marker' &&
      removeRule?.action === 'rewrite' &&
      removeRule?.enabled === true &&
      removeHeader?.operation === 'remove' &&
      removeHeaders &&
      Object.keys(removeHeaders).length === 1,
    'First rule must remove every caller marker in routing scope',
    failures
  );
  requireCondition(
    restoreRule?.ref === 'ltth_raw_path_guard_restore_safe_marker' &&
      restoreRule?.action === 'rewrite' &&
      restoreRule?.enabled === true &&
      restoreHeader?.operation === 'set' &&
      restoreHeaders &&
      Object.keys(restoreHeaders).length === 1,
    'Second rule must restore the marker only for safe raw paths',
    failures
  );
  requireCondition(
    restoreHeader?.value === TOKEN_PLACEHOLDER &&
      !TOKEN_PATTERN.test(restoreHeader?.value || ''),
    'Template must contain only the fail-closed token placeholder',
    failures
  );
  requireCondition(
    removeRule?.expression === HOST_SCOPE,
    'Removal rule must use the exact Free-compatible routing-host scope',
    failures
  );
  requireCondition(
    restoreRule?.expression === SAFE_RESTORE_EXPRESSION,
    'Restore rule must exactly enforce raw and recursively decoded path safety',
    failures
  );
  requireCondition(
    !/\bmatches\b|~/.test(restoreRule?.expression || ''),
    'Ruleset must not use paid-plan regular-expression operators',
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
