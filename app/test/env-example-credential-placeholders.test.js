const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repositoryRoot = path.resolve(__dirname, '..', '..');
const credentialName = /(?:API_KEY|_TOKEN|_SECRET|_PASSWORD)$/i;
const placeholderValue = /^(?:|<[^>]+>|\$\{[^}]+\}|\{[^}]+\}|__[^_]+__|(?:your|replace|change|insert|enter|example|placeholder|dummy|sample|todo|changeme|not[_-]?a[_-]?real)[\w.-]*|(?:x{3,}|\*{3,}|\.{3,})|(?:your[_-].+[_-]here))$/i;

function parseEnv(source) {
  const values = new Map();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    values.set(match[1], value);
  }
  return values;
}

function findTrackedConcreteCredentialExamples() {
  const tracked = execFileSync('git', ['ls-files', '-z', '--', '**/.env.example'], {
    cwd: repositoryRoot,
    encoding: 'buffer'
  }).toString('utf8').split('\0').filter(Boolean);
  const findings = [];

  for (const relativePath of tracked) {
    const values = parseEnv(fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8'));
    for (const [name, value] of values) {
      if (credentialName.test(name) && !placeholderValue.test(value)) {
        findings.push({ file: relativePath, variable: name });
      }
    }
  }

  return findings;
}

describe('tracked .env.example credential placeholders', () => {
  test('synthetic fixture placeholders cover Euler keys and generic credential names while preserving safe settings', () => {
    const fixture = [
      'EULER_BACKUP_API_KEY=replace-me',
      'EULER_FALLBACK_API_KEY=your_euler_api_key_here',
      'SERVICE_API_KEY=<your-api-key>',
      'SERVICE_TOKEN=${YOUR_SERVICE_TOKEN}',
      'WEBHOOK_SECRET=__PLACEHOLDER__',
      'DB_PASSWORD=change-this-password',
      'PORT=3000',
      'LOG_LEVEL=info'
    ].join('\n');
    const values = parseEnv(fixture);
    const credentials = [...values].filter(([name]) => credentialName.test(name));

    expect(credentials).toHaveLength(6);
    expect(credentials.every(([, value]) => placeholderValue.test(value))).toBe(true);
    expect(values.get('PORT')).toBe('3000');
    expect(values.get('LOG_LEVEL')).toBe('info');
  });

  test('synthetic concrete credentials are not mistaken for placeholders', () => {
    const values = parseEnv('SERVICE_API_KEY=synthetic-concrete-key-value');
    expect(placeholderValue.test(values.get('SERVICE_API_KEY'))).toBe(false);
  });

  test('all tracked .env.example credential fields use placeholders', () => {
    expect(findTrackedConcreteCredentialExamples()).toEqual([]);
  });
});
