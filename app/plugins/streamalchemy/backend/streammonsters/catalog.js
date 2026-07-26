const ELEMENTS = Object.freeze(['Ember', 'Tide', 'Grove', 'Gale', 'Volt', 'Lunar']);

function template(templateId, element, name, species, skillPrefix) {
  return Object.freeze({
    templateId,
    element,
    name,
    species,
    assetPath: `/plugins/streamalchemy/assets/streammonsters/furry/${templateId}.png`,
    skills: Object.freeze({
      attack: Object.freeze({ name: `${name} Strike`, vfxKey: `${skillPrefix}:attack` }),
      defense: Object.freeze({ name: `${name} Guard`, vfxKey: `${skillPrefix}:defense` }),
      special: Object.freeze({ name: `${name} Surge`, vfxKey: `${skillPrefix}:special` })
    })
  });
}

const TEMPLATE_CATALOG = Object.freeze([
  template('ashfang', 'Ember', 'Ashfang', 'Wolf', 'ashfang'),
  template('cinder', 'Ember', 'Cinder', 'Fox', 'cinder'),
  template('embergrin', 'Ember', 'Embergrin', 'Hyena', 'embergrin'),
  template('pyrra', 'Ember', 'Pyrra', 'Red Panda', 'pyrra'),
  template('ripple', 'Tide', 'Ripple', 'Otter', 'ripple'),
  template('brine', 'Tide', 'Brine', 'Seal', 'brine'),
  template('reefbite', 'Tide', 'Reefbite', 'Shark Furry', 'reefbite'),
  template('axi', 'Tide', 'Axi', 'Axolotl', 'axi'),
  template('mosswhisker', 'Grove', 'Mosswhisker', 'Mouse', 'mosswhisker'),
  template('cloverhop', 'Grove', 'Cloverhop', 'Rabbit', 'cloverhop'),
  template('oakheart', 'Grove', 'Oakheart', 'Deer', 'oakheart'),
  template('fernmask', 'Grove', 'Fernmask', 'Raccoon', 'fernmask'),
  template('zephyr', 'Gale', 'Zephyr', 'Bat', 'zephyr'),
  template('skyrend', 'Gale', 'Skyrend', 'Griffin', 'skyrend'),
  template('cirrus', 'Gale', 'Cirrus', 'Owl Furry', 'cirrus'),
  template('gusttail', 'Gale', 'Gusttail', 'Flying Squirrel', 'gusttail'),
  template('pulse', 'Volt', 'Pulse', 'Protogen', 'pulse'),
  template('neonclaw', 'Volt', 'Neonclaw', 'Cyber Lynx', 'neonclaw'),
  template('ampjack', 'Volt', 'Ampjack', 'Synth Jackal', 'ampjack'),
  template('flashstep', 'Volt', 'Flashstep', 'Cheetah', 'flashstep'),
  template('selene', 'Lunar', 'Selene', 'Snow Leopard', 'selene'),
  template('umbra', 'Lunar', 'Umbra', 'Black Cat', 'umbra'),
  template('lumen', 'Lunar', 'Lumen', 'Moth Furry', 'lumen'),
  template('tsuki', 'Lunar', 'Tsuki', 'Kitsune', 'tsuki')
]);

function getTemplate(templateId) {
  return TEMPLATE_CATALOG.find(entry => entry.templateId === templateId) || null;
}

function getTemplatesForElement(element) {
  return TEMPLATE_CATALOG.filter(entry => entry.element === element);
}

function hashNumber(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicTemplateId(element, seed) {
  const templates = getTemplatesForElement(element);
  return templates[hashNumber(`${element}:${seed}`) % templates.length]?.templateId || null;
}

const V5_ELEMENT_EFFECTS = Object.freeze({
  Ember: Object.freeze({
    A: Object.freeze([{ type: 'damage', power: 5 }, { type: 'burn', power: 1 }]),
    B: Object.freeze([{ type: 'shield', power: 5 }, { type: 'thorns', power: 1 }]),
    C: Object.freeze([{ type: 'damage', power: 9 }, { type: 'heal', power: 2 }])
  }),
  Tide: Object.freeze({
    A: Object.freeze([{ type: 'damage', power: 4 }, { type: 'weaken', power: 1 }]),
    B: Object.freeze([{ type: 'shield', power: 4 }, { type: 'heal', power: 2 }]),
    C: Object.freeze([{ type: 'damage', power: 7 }, { type: 'heal', power: 5 }])
  }),
  Grove: Object.freeze({
    A: Object.freeze([{ type: 'damage', power: 4 }, { type: 'thorns', power: 1 }]),
    B: Object.freeze([{ type: 'shield', power: 7 }]),
    C: Object.freeze([{ type: 'shield', power: 5 }, { type: 'heal', power: 4 }])
  }),
  Gale: Object.freeze({
    A: Object.freeze([{ type: 'damage', power: 5, hits: 2 }]),
    B: Object.freeze([{ type: 'shield', power: 4 }, { type: 'evade', chance: 25 }]),
    C: Object.freeze([{ type: 'damage', power: 9, hits: 3 }])
  }),
  Volt: Object.freeze({
    A: Object.freeze([{ type: 'damage', power: 5 }, { type: 'pierce', power: 2 }]),
    B: Object.freeze([{ type: 'shield', power: 5 }, { type: 'reflect', power: 1 }]),
    C: Object.freeze([{ type: 'damage', power: 10 }, { type: 'pierce', power: 4 }])
  }),
  Lunar: Object.freeze({
    A: Object.freeze([{ type: 'damage', power: 4 }, { type: 'heal', power: 1 }]),
    B: Object.freeze([{ type: 'shield', power: 6 }, { type: 'weaken', power: 1 }]),
    C: Object.freeze([{ type: 'damage', power: 8 }, { type: 'lifesteal', ratio: 0.5 }])
  })
});

function buildV5SkillCatalog() {
  return Object.fromEntries(TEMPLATE_CATALOG.map(entry => [
    entry.templateId,
    Object.freeze({
      A: Object.freeze({
        id: `${entry.templateId}:A`,
        name: entry.skills.attack.name,
        type: 'attack',
        element: entry.element,
        vfxKey: entry.skills.attack.vfxKey,
        effects: V5_ELEMENT_EFFECTS[entry.element].A
      }),
      B: Object.freeze({
        id: `${entry.templateId}:B`,
        name: entry.skills.defense.name,
        type: 'defense',
        element: entry.element,
        vfxKey: entry.skills.defense.vfxKey,
        effects: V5_ELEMENT_EFFECTS[entry.element].B
      }),
      C: Object.freeze({
        id: `${entry.templateId}:C`,
        name: entry.skills.special.name,
        type: 'special',
        element: entry.element,
        vfxKey: entry.skills.special.vfxKey,
        chargeRequired: 100,
        effects: V5_ELEMENT_EFFECTS[entry.element].C
      })
    })
  ]));
}

module.exports = {
  ELEMENTS,
  TEMPLATE_CATALOG,
  getTemplate,
  getTemplatesForElement,
  deterministicTemplateId,
  hashNumber,
  V5_ELEMENT_EFFECTS,
  buildV5SkillCatalog
};
