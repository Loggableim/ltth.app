import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const PACKAGE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const TEMPLATE_PATH = path.join(
  PACKAGE_DIR,
  'rulesets',
  'raw-path-guard.ruleset.template.json'
);
const VALIDATOR_PATH = path.join(
  PACKAGE_DIR,
  'scripts',
  'validate-raw-path-ruleset.mjs'
);
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
const RAW_PATH_SAFETY_CLAUSES = [
  `not (${RAW_PATH} contains "\\\\")`,
  `not (${RAW_PATH} contains "//")`,
  `not (${RAW_PATH} eq "/.")`,
  `not (${RAW_PATH} eq "/..")`,
  `not (${RAW_PATH} contains "/./")`,
  `not (${RAW_PATH} contains "/../")`,
  `not ends_with(${RAW_PATH}, "/.")`,
  `not ends_with(${RAW_PATH}, "/..")`,
  `not (lower(${RAW_PATH}) contains "%2f")`,
  `not (lower(${RAW_PATH}) contains "%5c")`
];
const DECODED_PATH_SAFETY_CLAUSES = [
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
const SAFETY_CLAUSES = [
  ...RAW_PATH_SAFETY_CLAUSES,
  ...DECODED_PATH_SAFETY_CLAUSES
];

function expressionFor(scope, clauses = SAFETY_CLAUSES) {
  return `(${scope}) and ${clauses.join(' and ')}`;
}

function runValidator(candidatePath) {
  return spawnSync(process.execPath, [VALIDATOR_PATH, candidatePath], {
    cwd: PACKAGE_DIR,
    encoding: 'utf8'
  });
}

async function writeCandidate(tempDirectory, name, ruleset) {
  const candidatePath = path.join(tempDirectory, `${name}.json`);
  await writeFile(candidatePath, JSON.stringify(ruleset, null, 2));
  return candidatePath;
}

test('raw-path ruleset validator rejects every structural policy weakening', async (t) => {
  const tempDirectory = await mkdtemp(
    path.join(tmpdir(), 'ltth-raw-path-ruleset-')
  );

  try {
    const template = JSON.parse(await readFile(TEMPLATE_PATH, 'utf8'));
    const validRuleset = structuredClone(template);
    assert.deepEqual(
      validRuleset.rules.map((rule) => rule.ref),
      [
        'ltth_production_raw_path_guard_remove_caller_marker',
        'ltth_production_raw_path_guard_restore_safe_marker',
        'ltth_staging_raw_path_guard_remove_caller_marker',
        'ltth_staging_raw_path_guard_restore_safe_marker'
      ]
    );
    validRuleset.rules[0].expression = PRODUCTION_HOST_SCOPE;
    validRuleset.rules[1].expression = expressionFor(
      PRODUCTION_HOST_SCOPE
    );
    validRuleset.rules[2].expression = STAGING_HOST_SCOPE;
    validRuleset.rules[3].expression = expressionFor(
      STAGING_HOST_SCOPE
    );

    await t.test('accepts the complete Free-compatible safety policy', async () => {
      const candidatePath = await writeCandidate(
        tempDirectory,
        'valid',
        validRuleset
      );
      const result = runValidator(candidatePath);

      assert.equal(result.status, 0, result.stderr);
    });

    const mutations = [
      {
        name: 'production caller marker removal is not first',
        mutate(ruleset) {
          [ruleset.rules[0], ruleset.rules[1]] = [
            ruleset.rules[1],
            ruleset.rules[0]
          ];
        }
      },
      {
        name: 'production marker removal scope is broader than its hosts',
        mutate(ruleset) {
          ruleset.rules[0].expression = 'true';
        }
      },
      {
        name: 'production restoration scope is broader than its hosts',
        mutate(ruleset) {
          ruleset.rules[1].expression = SAFETY_CLAUSES.join(' and ');
        }
      },
      {
        name: 'staging marker removal scope is broader than its hosts',
        mutate(ruleset) {
          ruleset.rules[2].expression = 'true';
        }
      },
      {
        name: 'staging restoration reuses the production token',
        mutate(ruleset) {
          ruleset.rules[3].action_parameters.headers[
            'x-ltth-raw-path-guard'
          ].value = validRuleset.rules[1].action_parameters.headers[
            'x-ltth-raw-path-guard'
          ].value;
        }
      },
      {
        name: 'restoration uses paid-plan regular expressions',
        mutate(ruleset) {
          ruleset.rules[1].expression +=
            ' and not (lower(raw.http.request.uri.path) matches r"bad")';
        }
      },
      {
        name: 'recursive decode uses an invalid option',
        mutate(ruleset) {
          ruleset.rules[3].expression =
            ruleset.rules[3].expression.replaceAll('"r"', '"u"');
        }
      },
      {
        name: 'a safety conjunction is weakened to disjunction',
        mutate(ruleset) {
          ruleset.rules[1].expression =
            ruleset.rules[1].expression.replace(
              ` and ${SAFETY_CLAUSES[1]}`,
              ` or ${SAFETY_CLAUSES[1]}`
            );
        }
      }
    ];

    for (const [index, clause] of SAFETY_CLAUSES.entries()) {
      for (const [label, ruleIndex, scope] of [
        ['production', 1, PRODUCTION_HOST_SCOPE],
        ['staging', 3, STAGING_HOST_SCOPE]
      ]) {
        mutations.push({
          name: `${label} safety clause ${index + 1} is missing`,
          mutate(ruleset) {
            ruleset.rules[ruleIndex].expression = expressionFor(
              scope,
              SAFETY_CLAUSES.filter((candidate) => candidate !== clause)
            );
          }
        });
      }
    }

    for (const [index, mutation] of mutations.entries()) {
      await t.test(`rejects when ${mutation.name}`, async () => {
        const candidate = structuredClone(validRuleset);
        mutation.mutate(candidate);
        const candidatePath = await writeCandidate(
          tempDirectory,
          `mutation-${index}`,
          candidate
        );
        const result = runValidator(candidatePath);

        assert.notEqual(
          result.status,
          0,
          `validator accepted mutation: ${mutation.name}\n${result.stdout}`
        );
      });
    }
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});
