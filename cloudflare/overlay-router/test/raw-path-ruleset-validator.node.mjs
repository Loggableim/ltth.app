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
const HOST_SCOPE =
  'http.host eq "overlay.ltth.app" or ' +
  '(starts_with(http.host, "r-") and ' +
  'ends_with(http.host, ".ltth.app") and len(http.host) eq 43)';
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

function expressionFor(clauses = SAFETY_CLAUSES) {
  return `(${HOST_SCOPE}) and ${clauses.join(' and ')}`;
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
    validRuleset.rules[0].expression = HOST_SCOPE;
    validRuleset.rules[1].expression = expressionFor();

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
        name: 'caller marker removal is not first',
        mutate(ruleset) {
          ruleset.rules.reverse();
        }
      },
      {
        name: 'caller marker removal scope is broader than routing hosts',
        mutate(ruleset) {
          ruleset.rules[0].expression = 'true';
        }
      },
      {
        name: 'restoration scope is broader than routing hosts',
        mutate(ruleset) {
          ruleset.rules[1].expression = SAFETY_CLAUSES.join(' and ');
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
          ruleset.rules[1].expression =
            ruleset.rules[1].expression.replaceAll('"r"', '"u"');
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
      mutations.push({
        name: `required safety clause ${index + 1} is missing`,
        mutate(ruleset) {
          ruleset.rules[1].expression = expressionFor(
            SAFETY_CLAUSES.filter((candidate) => candidate !== clause)
          );
        }
      });
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
