import { readFile } from 'node:fs/promises';

const TEMPLATE_URL = new URL(
  '../rulesets/raw-path-guard.ruleset.template.json',
  import.meta.url
);
const MARKER_HEADER = 'x-ltth-raw-path-guard';
const TOKEN_PLACEHOLDER =
  '<REPLACE_WITH_64_CHAR_URL_SAFE_TOKEN>';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;

function requireCondition(condition, message, failures) {
  if (!condition) {
    failures.push(message);
  }
}

const failures = [];
let ruleset;
try {
  ruleset = JSON.parse(await readFile(TEMPLATE_URL, 'utf8'));
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
  requireCondition(
    removeRule?.ref === 'ltth_raw_path_guard_remove_caller_marker' &&
      removeRule?.action === 'rewrite' &&
      removeRule?.enabled === true &&
      removeHeader?.operation === 'remove',
    'First rule must remove every caller marker in routing scope',
    failures
  );
  requireCondition(
    restoreRule?.ref === 'ltth_raw_path_guard_restore_safe_marker' &&
      restoreRule?.action === 'rewrite' &&
      restoreRule?.enabled === true &&
      restoreHeader?.operation === 'set',
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
    restoreRule?.expression?.includes(
      'url_decode(raw.http.request.uri.path, "r")'
    ),
    'Safe rule must use documented recursive url_decode syntax',
    failures
  );
  requireCondition(
    !restoreRule?.expression?.includes('url_decode(url_decode'),
    'Safe rule must not use undocumented nested url_decode calls',
    failures
  );
  requireCondition(
    removeRule?.expression &&
      restoreRule?.expression?.startsWith(
        `(${removeRule.expression}) and `
      ),
    'Restore rule must retain the exact removal-rule host scope',
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
