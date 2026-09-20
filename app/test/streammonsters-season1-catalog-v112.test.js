const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const catalog = require(
  '../plugins/stream-monsters/backend/streammonsters/catalog'
);
const StreamMonstersPublicEventProjector = require(
  '../plugins/stream-monsters/backend/streammonsters/public-event-projector'
);
const {
  buildPublicCatalog
} = require('../../scripts/build_streammonsters_public_catalog');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LOCALES = ['de', 'en', 'es', 'fr'];
const CHOICES = ['A', 'B', 'C'];

const EXPECTED_IDENTITIES = Object.freeze([
  ['ashfang', 'Wolf', 'Blaze Hunter'],
  ['cinder', 'Fox', 'Smoke Dancer'],
  ['embergrin', 'Hyena', 'Cinder Guard'],
  ['pyrra', 'Red Panda', 'Phoenix Mender'],
  ['ripple', 'Otter', 'Current Dancer'],
  ['brine', 'Seal', 'Harbor Guard'],
  ['reefbite', 'Shark', 'Reef Hunter'],
  ['axi', 'Axolotl', 'Tide Mender'],
  ['mosswhisker', 'Mouse', 'Briar Dancer'],
  ['cloverhop', 'Rabbit', 'Bloom Mender'],
  ['oakheart', 'Deer', 'Grove Guard'],
  ['fernmask', 'Raccoon', 'Thorn Hunter'],
  ['zephyr', 'Bat', 'Wind Dancer'],
  ['skyrend', 'Griffin', 'Sky Hunter'],
  ['cirrus', 'Owl', 'Cloud Guard'],
  ['gusttail', 'Flying Squirrel', 'Breeze Mender'],
  ['pulse', 'Protogen', 'Circuit Guard'],
  ['neonclaw', 'Cyber Lynx', 'Volt Hunter'],
  ['ampjack', 'Synth Jackal', 'Spark Mender'],
  ['flashstep', 'Cheetah', 'Arc Dancer'],
  ['selene', 'Snow Leopard', 'Moon Guard'],
  ['umbra', 'Black Cat', 'Night Hunter'],
  ['lumen', 'Moth', 'Star Mender'],
  ['tsuki', 'Kitsune', 'Eclipse Dancer']
]);

const EXPECTED_SKILL_NAMES = Object.freeze({
  ashfang: { A: ['Flamefang', 'Inferno Fang', 'Solar Maul'], B: ['Ash Guard', 'Ember Aegis', 'Blaze Rampart'], C: ['Wildfire Rush', 'Furnace Roar', 'Sunfire Break'] },
  cinder: { A: ['Ember Pounce', 'Soot Sprint', 'Wildspark Lunge'], B: ['Smoke Feint', 'Cinder Mirage', 'Ashen Vanish'], C: ['Foxfire Ruse', 'Ember Masque', 'Foxfire Inferno'] },
  embergrin: { A: ['Coal Crunch', 'Furnace Bite', 'Magma Maw'], B: ['Scorchhide', 'Cinder Carapace', 'Inferno Bulwark'], C: ['Laughing Furnace', 'Blazeguard Roar', 'Pyre Fortress'] },
  pyrra: { A: ['Ember Petal', 'Kindled Wing', 'Solar Plume'], B: ['Warm Nest', 'Cinder Cocoon', 'Dawn Sanctuary'], C: ['Phoenix Bloom', 'Radiant Rebirth', 'Eternal Sunrise'] },
  ripple: { A: ['Current Flick', 'Riptide Jab', 'Torrent Snap'], B: ['Mist Slip', 'Foam Mirage', 'Vapor Veil'], C: ['Undertow Twist', 'Whirlpool Ruse', 'Maelstrom Masque'] },
  brine: { A: ['Salt Slam', 'Brine Breaker', 'Tidal Hammer'], B: ['Harbor Shell', 'Reef Rampart', 'Ocean Bastion'], C: ['Breakwater Roar', 'Citadel Surge', 'Leviathan Wall'] },
  reefbite: { A: ['Razor Tide', 'Reef Ripper', 'Abyss Fang'], B: ['Foam Guard', 'Coral Screen', 'Deepsea Ward'], C: ['Sharkwave Charge', 'Riptide Ravage', 'Kraken Break'] },
  axi: { A: ['Lumen Ripple', 'Glow Current', 'Aurora Stream'], B: ['Aqua Mend', 'Lagoon Halo', 'Crystal Spring'], C: ['Prism Tide', 'Luma Wave', 'Ocean Renewal'] },
  mosswhisker: { A: ['Briar Sneak', 'Thorn Scurry', 'Bramble Blitz'], B: ['Moss Mantle', 'Leaf Decoy', 'Grove Mirage'], C: ['Burrow Bloom', 'Root Ruse', 'Emerald Masque'] },
  cloverhop: { A: ['Clover Kick', 'Petal Bound', 'Verdant Vault'], B: ['Meadow Mend', 'Bloom Shelter', 'Spring Haven'], C: ['Lucky Sprout', 'Garden Grace', 'Evergrove Blessing'] },
  oakheart: { A: ['Antler Briar', 'Root Ram', 'Elderwood Charge'], B: ['Bark Bastion', 'Oak Fortress', 'Ancient Rampart'], C: ['Forest Oath', 'Grove Citadel', 'Worldtree Stand'] },
  fernmask: { A: ['Thorn Swipe', 'Vine Ripper', 'Canopy Rend'], B: ['Fern Guard', 'Leaf Armor', 'Jungle Aegis'], C: ['Masked Ambush', 'Briar Onslaught', 'Wildwood Hunt'] },
  zephyr: { A: ['Twin Gust', 'Slipstream Cut', 'Mirage Cyclone'], B: ['Sky Veil', 'Cloud Decoy', 'Vapor Vanish'], C: ['Tempest Trick', 'Spiral Ruse', 'Phantom Hurricane'] },
  skyrend: { A: ['Talon Gale', 'Razor Draft', 'Stormclaw Rush'], B: ['Updraft Guard', 'Cloud Armor', 'Jetstream Aegis'], C: ['Tempest Dive', 'Cyclone Rend', 'Skybreaker Storm'] },
  cirrus: { A: ['Cloud Ram', 'Squall Strike', 'Thunderhead Crush'], B: ['Nimbus Wall', 'Storm Shelter', 'Sky Bastion'], C: ['Monsoon Guard', 'Tempest Rampart', 'Heaven Citadel'] },
  gusttail: { A: ['Breeze Bite', 'Tailwind Tap', 'Zephyr Spiral'], B: ['Soft Landing', 'Cloud Comfort', 'Airspring Haven'], C: ['Healing Gale', 'Renewal Vortex', 'Endless Tailwind'] },
  pulse: { A: ['Byte Bolt', 'Circuit Slash', 'Plasma Break'], B: ['Static Screen', 'Firewall Shield', 'Reactor Aegis'], C: ['Thunder Kernel', 'Overclock Surge', 'Quantum Storm'] },
  neonclaw: { A: ['Arc Slash', 'Neon Ripper', 'Plasma Claw'], B: ['Static Guard', 'Circuit Mirror', 'Neon Aegis'], C: ['Thunderbreak', 'Voltage Rush', 'Megawatt Rend'] },
  ampjack: { A: ['Amp Bite', 'Spark Pulse', 'Dynamo Charge'], B: ['Battery Ward', 'Current Cradle', 'Power Cell Haven'], C: ['Recharge Roar', 'Dynamo Bloom', 'Infinite Circuit'] },
  flashstep: { A: ['Volt Feint', 'Arc Skip', 'Photon Dash'], B: ['Flash Screen', 'Static Mirage', 'Laser Vanish'], C: ['Blink Break', 'Overvolt Ruse', 'Lightspeed Gambit'] },
  selene: { A: ['Moon Paw', 'Silver Arc', 'Halo Claw'], B: ['Eclipse Veil', 'Moonlight Ward', 'Celestial Bastion'], C: ['Lunar Shelter', 'Starshield Grace', 'Full Moon Citadel'] },
  umbra: { A: ['Shadow Claw', 'Night Rend', 'Void Talon'], B: ['Dark Veil', 'Eclipse Guard', 'Abyss Ward'], C: ['Soul Eclipse', 'Moonless Fang', 'Midnight Devour'] },
  lumen: { A: ['Star Touch', 'Moonbeam Mend', 'Radiant Pulse'], B: ['Glow Veil', 'Starlight Cocoon', 'Aurora Haven'], C: ['Soul Lantern', 'Nova Renewal', 'Astral Rebirth'] },
  tsuki: { A: ['Moon Feint', 'Crescent Ruse', 'Foxstar Flicker'], B: ['Eclipse Masque', 'Shadow Decoy', 'Nightfall Vanish'], C: ['Kitsune Eclipse', 'Spirit Moon', 'Phantom Supernova'] }
});

function monsterLocales() {
  return Object.fromEntries(LOCALES.map(locale => {
    const document = JSON.parse(fs.readFileSync(path.join(
      REPO_ROOT,
      'app',
      'plugins',
      'stream-monsters',
      'locales',
      `${locale}.json`
    ), 'utf8'));
    return [locale, document.plugins.streamalchemy.ui.monsters];
  }));
}

function renderPublicGuide(locale) {
  const html = fs.readFileSync(path.join(
    REPO_ROOT,
    'streammonsters',
    'index.html'
  ), 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: `https://ltth.app/streammonsters/?lang=${locale}`
  });
  for (const relativePath of [
    'js/streammonsters-catalog.generated.js',
    'app/plugins/stream-monsters/streammonsters-rules-v8-pacing.js',
    'js/streammonsters-guide.js'
  ]) {
    dom.window.eval(fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'));
  }
  return dom.window.document;
}

describe('Stream Monsters 1.12 Season 1 catalog contract', () => {
  test('keeps all stable identity and asset IDs while adding exact Season 1 identity', () => {
    expect(catalog.TEMPLATE_CATALOG.map(template => [
      template.templateId,
      template.species,
      template.epithet
    ])).toEqual(EXPECTED_IDENTITIES);
    expect(catalog.TEMPLATE_CATALOG.every(template => (
      template.season === 'season-1'
    ))).toBe(true);

    catalog.TEMPLATE_CATALOG.forEach(template => {
      expect(template.assetPath).toBe(
        `/plugins/stream-monsters/assets/streammonsters/furry/` +
        `${template.templateId}.webp`
      );
      expect(catalog.getEvolutionAssetPath(template, 2)).toBe(
        `/plugins/stream-monsters/assets/streammonsters/furry/evolution/` +
        `${template.element.toLowerCase()}/${template.templateId}-stage2.webp`
      );
      expect(catalog.getEvolutionAssetPath(template, 3)).toBe(
        `/plugins/stream-monsters/assets/streammonsters/furry/evolution/` +
        `${template.element.toLowerCase()}/${template.templateId}-stage3.webp`
      );
    });
  });

  test('resolves the exact 216 unique proper-noun skill names in stage order', () => {
    const resolvedNames = [];
    for (const [templateId] of EXPECTED_IDENTITIES) {
      for (const choice of CHOICES) {
        for (const stage of [1, 2, 3]) {
          const skill = catalog.resolveStageSkill(templateId, choice, stage, 8);
          const expectedName = EXPECTED_SKILL_NAMES[templateId][choice][stage - 1];
          expect(skill.name).toBe(expectedName);
          resolvedNames.push(skill.name);
        }
      }
    }

    expect(resolvedNames).toHaveLength(216);
    expect(new Set(resolvedNames).size).toBe(216);
    expect(resolvedNames.some(name => /\s(?:II|III)\b/.test(name))).toBe(false);
  });

  test('keeps the exact Rules v8 effect tokens and replay-facing skill IDs', () => {
    const effectContract = [];
    for (const [templateId] of EXPECTED_IDENTITIES) {
      for (const stage of [1, 2, 3]) {
        for (const choice of CHOICES) {
          const skill = catalog.resolveStageSkill(templateId, choice, stage, 8);
          effectContract.push({
            templateId,
            stage,
            choice,
            id: skill.id,
            type: skill.type,
            vfxKey: skill.vfxKey,
            effectKey: skill.effectKey,
            shortTextKey: skill.shortTextKey,
            chargeRequired: skill.chargeRequired ?? null,
            effects: skill.effects
          });
        }
      }
    }

    expect(crypto.createHash('sha256')
      .update(JSON.stringify(effectContract))
      .digest('hex'))
      .toBe('528a4e14708f8731efb4a6c40679b2dc2ac46776a8d19c521aef2e4a01a268b4');
  });

  test('uses the same skill proper nouns in all four locales', () => {
    const locales = monsterLocales();
    for (const [templateId] of EXPECTED_IDENTITIES) {
      for (const choice of CHOICES) {
        for (const stage of [1, 2, 3]) {
          const skill = catalog.resolveStageSkill(templateId, choice, stage, 8);
          const expectedName = EXPECTED_SKILL_NAMES[templateId][choice][stage - 1];
          for (const locale of LOCALES) {
            expect(locales[locale][skill.nameKey]).toBe(expectedName);
          }
        }
      }
    }
  });

  test('projects only canonical defaults and never mutates custom persisted names', () => {
    expect(catalog.projectDefaultMonsterName('cinder', 'Cinder')).toBe('Cinderfox');
    expect(catalog.projectDefaultMonsterName('axi', 'Axi')).toBe('Axolume');
    expect(catalog.projectDefaultMonsterName('pulse', 'Pulse')).toBe('Pulsebyte');
    expect(catalog.projectDefaultMonsterName('cinder', 'Captain Cinder'))
      .toBe('Captain Cinder');

    const projector = new StreamMonstersPublicEventProjector();
    const persistedMonster = {
      template_id: 'cinder',
      name: 'Captain Cinder',
      element: 'Ember'
    };
    const before = JSON.parse(JSON.stringify(persistedMonster));
    expect(projector.project('streammonsters:egg_hatched', {
      monster: { template_id: 'cinder', name: 'Cinder', element: 'Ember' }
    }).monster.name).toBe('Cinderfox');
    expect(projector.project('streammonsters:egg_hatched', {
      monster: persistedMonster
    }).monster.name).toBe('Captain Cinder');
    expect(persistedMonster).toEqual(before);
  });

  test('publishes projected names, season and epithets without changing stable IDs', () => {
    const publicCatalog = buildPublicCatalog({ repoRoot: REPO_ROOT });
    expect(publicCatalog.templates.map(template => template.templateId))
      .toEqual(EXPECTED_IDENTITIES.map(([templateId]) => templateId));
    expect(publicCatalog.templates.map(template => template.name))
      .toEqual(expect.arrayContaining(['Cinderfox', 'Axolume', 'Pulsebyte']));
    expect(publicCatalog.templates.every(template => template.season === 'season-1'))
      .toBe(true);
    expect(publicCatalog.templates.map(template => template.epithet))
      .toEqual(EXPECTED_IDENTITIES.map(([, , epithet]) => epithet));
  });

  test('removes the one-option visual selector and retains the demo monster selector', () => {
    const creatorHtml = fs.readFileSync(path.join(
      REPO_ROOT,
      'app',
      'plugins',
      'stream-monsters',
      'streammonsters-ui.html'
    ), 'utf8');
    const document = new JSDOM(creatorHtml).window.document;

    expect(document.getElementById('visualPack')).toBeNull();
    expect(document.getElementById('demoTemplate')).not.toBeNull();
    document.querySelectorAll('script, style').forEach(node => node.remove());
    expect(document.body.textContent).not.toMatch(/\b(?:Template|Templates|StreamAlchemy|Streamlings?)\b/i);
  });

  test('uses Hatchling only for fresh discovery and Stream Monster generically', () => {
    const locales = monsterLocales();
    for (const locale of LOCALES) {
      expect(locales[locale].hatchedTitle).toContain('Hatchling');
      const hatchlingKeys = Object.entries(locales[locale])
        .filter(([, value]) => typeof value === 'string' && /\bHatchling\b/.test(value))
        .map(([key]) => key);
      expect(hatchlingKeys).toEqual(['hatchedTitle']);
      expect(locales[locale].assetTemplates).toContain('Stream Monsters');
      expect(locales[locale].demoTemplate).toContain('Stream Monster');
      expect(locales[locale].dexEmpty).toContain('Stream Monster');
    }
  });

  test.each([
    ['de', 'Monsterdex: 24 Stream Monsters · 72 Entwicklungsstufen'],
    ['en', 'Monsterdex: 24 Stream Monsters · 72 evolution stages'],
    ['es', 'Monsterdex: 24 Stream Monsters · 72 etapas de evolución'],
    ['fr', 'Monsterdex : 24 Stream Monsters · 72 stades d’évolution']
  ])('renders current %s guide terminology without legacy product nouns', (
    locale,
    expectedTitle
  ) => {
    const document = renderPublicGuide(locale);
    expect(document.querySelector('#dex-title').textContent).toBe(expectedTitle);
    expect(document.querySelector('#monster-dex').textContent)
      .not.toMatch(/\b(?:Template|Templates|StreamAlchemy|Streamlings?)\b/i);
  });
});
