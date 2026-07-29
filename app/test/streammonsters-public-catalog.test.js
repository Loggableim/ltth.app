const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const GENERATOR_PATH = path.join(
  REPO_ROOT,
  'scripts',
  'build_streammonsters_public_catalog.js'
);
const GENERATED_PATH = path.join(
  REPO_ROOT,
  'js',
  'streammonsters-catalog.generated.js'
);
const CATALOG_PATH = path.join(
  REPO_ROOT,
  'app',
  'plugins',
  'streamalchemy',
  'backend',
  'streammonsters',
  'catalog.js'
);
const BATTLE_RULES_PATH = path.join(
  REPO_ROOT,
  'app',
  'plugins',
  'streamalchemy',
  'backend',
  'streammonsters',
  'battle-rules-v8.js'
);
const LOCALES = ['de', 'en', 'es', 'fr'];
const CHOICES = ['A', 'B', 'C'];

function requireGenerator() {
  expect(fs.existsSync(GENERATOR_PATH)).toBe(true);
  return require(GENERATOR_PATH);
}

function readMonsterLocales() {
  return Object.fromEntries(LOCALES.map(locale => {
    const localePath = path.join(
      REPO_ROOT,
      'app',
      'plugins',
      'streamalchemy',
      'locales',
      `${locale}.json`
    );
    const document = JSON.parse(fs.readFileSync(localePath, 'utf8'));
    return [locale, document.plugins.streamalchemy.ui.monsters];
  }));
}

function recursivelyFind(directory, extension) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return recursivelyFind(target, extension);
    return entry.isFile() && entry.name.endsWith(extension) ? [target] : [];
  });
}

function expectWebp(filePath) {
  const bytes = fs.readFileSync(filePath);
  expect(bytes.length).toBeGreaterThan(12);
  expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
  expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
}

function renderPublicGuide(locale = 'de') {
  const html = fs.readFileSync(
    path.join(REPO_ROOT, 'streammonsters', 'index.html'),
    'utf8'
  );
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: `https://ltth.app/streammonsters/?lang=${locale}`
  });
  const executableScripts = [...dom.window.document.querySelectorAll('script[src]')]
    .map(script => script.getAttribute('src'))
    .filter(source => (
      source.startsWith('/js/streammonsters-catalog.generated.js') ||
      source.startsWith('/js/streammonsters-guide.js')
    ));

  executableScripts.forEach(source => {
    const cleanSource = source.split('?')[0].replace(/^\//, '');
    dom.window.eval(fs.readFileSync(path.join(REPO_ROOT, cleanSource), 'utf8'));
  });
  return dom;
}

describe('Stream Monsters public catalog generator', () => {
  test('derives all 24 templates, 72 forms and 216 stage skills from Rules v8', () => {
    const { buildPublicCatalog } = requireGenerator();
    const runtimeCatalog = require(CATALOG_PATH);
    const runtimeBattleRules = require(BATTLE_RULES_PATH);
    const localeDocuments = readMonsterLocales();
    const publicCatalog = buildPublicCatalog({ repoRoot: REPO_ROOT });

    expect(publicCatalog).toMatchObject({
      schemaVersion: 1,
      rulesVersion: runtimeBattleRules.RULES_VERSION,
      locales: LOCALES,
      templateCount: 24,
      formCount: 72,
      skillCount: 216
    });
    expect(publicCatalog.templates).toHaveLength(24);

    publicCatalog.templates.forEach(template => {
      const runtimeTemplate = runtimeCatalog.getTemplate(template.templateId);
      expect(runtimeTemplate).not.toBeNull();
      expect(template).toMatchObject({
        templateId: runtimeTemplate.templateId,
        element: runtimeTemplate.element,
        role: runtimeTemplate.role,
        name: runtimeTemplate.name,
        species: runtimeTemplate.species
      });
      expect(template.stages).toHaveLength(3);

      template.stages.forEach(stage => {
        const expectedAssetPath = stage.stage === 1
          ? `/assets/streammonsters/furry/${template.templateId}.webp`
          : `/assets/streammonsters/furry/evolution/${template.element.toLowerCase()}` +
            `/${template.templateId}-stage${stage.stage}.webp`;
        expect(stage.assetPath).toBe(expectedAssetPath);
        expect(stage.skills.map(skill => skill.choice)).toEqual(CHOICES);

        stage.skills.forEach(skill => {
          const runtimeSkill = runtimeCatalog.resolveStageSkill(
            template.templateId,
            skill.choice,
            stage.stage,
            8
          );
          expect(skill).toMatchObject({
            choice: skill.choice,
            id: runtimeSkill.id,
            type: runtimeSkill.type,
            icon: runtimeSkill.icon,
            nameKey: runtimeSkill.nameKey,
            effectKey: runtimeSkill.effectKey,
            effects: runtimeSkill.effects
          });
          if (runtimeSkill.chargeRequired) {
            expect(skill.chargeRequired).toBe(runtimeSkill.chargeRequired);
          }

          expect(Object.keys(skill.translations)).toEqual(LOCALES);
          LOCALES.forEach(locale => {
            expect(skill.translations[locale]).toEqual({
              name: localeDocuments[locale][runtimeSkill.nameKey],
              effect: localeDocuments[locale][runtimeSkill.effectKey]
            });
            expect(skill.translations[locale].name).toEqual(expect.any(String));
            expect(skill.translations[locale].effect).toEqual(expect.any(String));
            expect(skill.translations[locale].name.length).toBeGreaterThan(0);
            expect(skill.translations[locale].effect.length).toBeGreaterThan(0);
          });
        });
      });
    });
  });

  test('keeps the checked-in browser artifact deterministic and executable', () => {
    const {
      buildPublicCatalog,
      normalizeLineEndings,
      renderBrowserCatalog
    } = requireGenerator();
    const publicCatalog = buildPublicCatalog({ repoRoot: REPO_ROOT });

    expect(fs.existsSync(GENERATED_PATH)).toBe(true);
    const generatedSource = fs.readFileSync(GENERATED_PATH, 'utf8');
    const renderedSource = renderBrowserCatalog(publicCatalog);
    expect(normalizeLineEndings(generatedSource)).toBe(renderedSource);
    expect(normalizeLineEndings(renderedSource.replace(/\n/g, '\r\n')))
      .toBe(renderedSource);

    const browserGlobal = {};
    vm.runInNewContext(generatedSource, browserGlobal, {
      filename: GENERATED_PATH
    });
    expect(JSON.parse(JSON.stringify(
      browserGlobal.STREAM_MONSTERS_PUBLIC_CATALOG
    ))).toEqual(publicCatalog);
    expect(fs.readFileSync(GENERATOR_PATH, 'utf8'))
      .not.toContain('const RULES_VERSION = 8;');
  });

  test('ships one compact WebP for every public evolution form', () => {
    const { buildPublicCatalog } = requireGenerator();
    const publicCatalog = buildPublicCatalog({ repoRoot: REPO_ROOT });
    const publicBaseDirectory = path.join(
      REPO_ROOT,
      'assets',
      'streammonsters',
      'furry'
    );
    const publicEvolutionDirectory = path.join(
      publicBaseDirectory,
      'evolution'
    );
    const runtimeEvolutionDirectory = path.join(
      REPO_ROOT,
      'app',
      'plugins',
      'streamalchemy',
      'assets',
      'streammonsters',
      'furry',
      'evolution'
    );
    const baseWebps = fs.readdirSync(publicBaseDirectory)
      .filter(fileName => fileName.endsWith('.webp'));
    const evolutionWebps = recursivelyFind(publicEvolutionDirectory, '.webp');
    const runtimeWebps = recursivelyFind(runtimeEvolutionDirectory, '.webp');

    expect(baseWebps).toHaveLength(24);
    expect(evolutionWebps).toHaveLength(48);
    expect(runtimeWebps).toHaveLength(48);

    let publicBytes = 0;
    let sourceBytes = 0;
    publicCatalog.templates.forEach(template => {
      template.stages.forEach(stage => {
        const publicPath = path.join(
          REPO_ROOT,
          stage.assetPath.replace(/^\//, '').replace(/\//g, path.sep)
        );
        expect(fs.existsSync(publicPath)).toBe(true);
        expectWebp(publicPath);
        if (stage.stage === 1) return;

        const sourcePath = path.join(
          runtimeEvolutionDirectory,
          template.element.toLowerCase(),
          `${template.templateId}-stage${stage.stage}.webp`
        );
        const publicSize = fs.statSync(publicPath).size;
        const sourceSize = fs.statSync(sourcePath).size;
        expect(publicSize).toBeLessThan(sourceSize);
        publicBytes += publicSize;
        sourceBytes += sourceSize;
      });
    });
    expect(publicBytes).toBeLessThan(sourceBytes);
  });
});

describe('Stream Monsters public Monsterdex', () => {
  test('renders every form and its localized A/B/C skills from the generated data', () => {
    const dom = renderPublicGuide('de');
    const { document } = dom.window;
    const cards = [...document.querySelectorAll('.sm-monster')];

    expect(cards).toHaveLength(24);
    expect(document.querySelectorAll('.sm-evolution-stage')).toHaveLength(72);
    expect(document.querySelectorAll('.sm-stage-skill')).toHaveLength(216);
    expect(document.querySelectorAll('.sm-evolution-stage[open]')).toHaveLength(0);
    cards.forEach(card => {
      const stages = [...card.querySelectorAll('.sm-evolution-stage')];
      expect(stages.map(stage => stage.dataset.evolutionStage)).toEqual([
        '1',
        '2',
        '3'
      ]);
      stages.forEach(stage => {
        expect([...stage.querySelectorAll('.sm-stage-skill')]
          .map(skill => skill.dataset.choice)).toEqual(CHOICES);
      });
    });

    const ashfangStageTwoAttack = document.querySelector(
      '[data-template-id="ashfang"] ' +
      '[data-evolution-stage="2"] [data-choice="A"]'
    );
    expect(ashfangStageTwoAttack.querySelector('.sm-skill-name').textContent)
      .toBe('Ashfang: Flammenzahn II');
    expect(ashfangStageTwoAttack.querySelector('.sm-skill-effect').textContent)
      .toBe(
        'Stufe II verstärkt diesen Skill: Verursacht Schaden und ' +
        'hinterlässt Brand für die nächste Runde.'
      );

    document.querySelector('[data-lang="es"]').click();
    const spanishAshfangStageTwoAttack = document.querySelector(
      '[data-template-id="ashfang"] ' +
      '[data-evolution-stage="2"] [data-choice="A"]'
    );
    expect(spanishAshfangStageTwoAttack.querySelector('.sm-skill-name').textContent)
      .toBe('Ashfang: Colmillo Ígneo II');
    expect(spanishAshfangStageTwoAttack.querySelector('.sm-skill-effect').textContent)
      .toBe(
        'La etapa II refuerza esta habilidad: Inflige daño y deja ' +
        'Quemadura para la ronda siguiente.'
      );
  });
});
