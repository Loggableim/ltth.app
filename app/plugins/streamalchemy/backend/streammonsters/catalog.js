const ELEMENTS = Object.freeze(['Ember', 'Tide', 'Grove', 'Gale', 'Volt', 'Lunar']);
const FURRY_ASSET_VERSION = 'furry-1.5.0';

const SKILL_PRESENTATION = Object.freeze({
  Ember: Object.freeze({
    attack: Object.freeze({
      suffix: 'Flamefang',
      icon: '🔥',
      shortText: 'A fierce strike that leaves a brief burn.'
    }),
    defense: Object.freeze({
      suffix: 'Cinder Ward',
      icon: '🛡️',
      shortText: 'Raises a fiery shield that retaliates once.'
    }),
    special: Object.freeze({
      suffix: 'Inferno Heart',
      icon: '☄️',
      shortText: 'Unleashes a heavy blaze and restores resolve.'
    })
  }),
  Tide: Object.freeze({
    attack: Object.freeze({
      suffix: 'Current Cut',
      icon: '🌊',
      shortText: 'A flowing hit that weakens the next attack.'
    }),
    defense: Object.freeze({
      suffix: 'Mist Ward',
      icon: '🌫️',
      shortText: 'Wraps the fighter in mist, shield and healing.'
    }),
    special: Object.freeze({
      suffix: 'Tidal Renewal',
      icon: '💧',
      shortText: 'A restorative wave that damages and heals.'
    })
  }),
  Grove: Object.freeze({
    attack: Object.freeze({
      suffix: 'Briar Bash',
      icon: '🌿',
      shortText: 'A thorny strike that punishes one counter-hit.'
    }),
    defense: Object.freeze({
      suffix: 'Bark Bastion',
      icon: '🪵',
      shortText: 'Builds the strongest pure shield in the arena.'
    }),
    special: Object.freeze({
      suffix: 'Verdant Oath',
      icon: '🌳',
      shortText: 'Combines damage, protection and steady healing.'
    })
  }),
  Gale: Object.freeze({
    attack: Object.freeze({
      suffix: 'Twin Gust',
      icon: '💨',
      shortText: 'Dashes through the target with two visible hits.'
    }),
    defense: Object.freeze({
      suffix: 'Sky Veil',
      icon: '🪽',
      shortText: 'Creates a light shield and a chance to evade.'
    }),
    special: Object.freeze({
      suffix: 'Tempest Dive',
      icon: '🌪️',
      shortText: 'Crosses the arena in a cinematic three-hit rush.'
    })
  }),
  Volt: Object.freeze({
    attack: Object.freeze({
      suffix: 'Arc Slash',
      icon: '⚡',
      shortText: 'Cuts through part of the target shield.'
    }),
    defense: Object.freeze({
      suffix: 'Static Screen',
      icon: '🔋',
      shortText: 'Stores charge in a shield that reflects once.'
    }),
    special: Object.freeze({
      suffix: 'Thunderbreak',
      icon: '🌩️',
      shortText: 'Detonates a powerful shield-piercing discharge.'
    })
  }),
  Lunar: Object.freeze({
    attack: Object.freeze({
      suffix: 'Moon Claw',
      icon: '🌙',
      shortText: 'A measured strike that restores a little health.'
    }),
    defense: Object.freeze({
      suffix: 'Eclipse Veil',
      icon: '🌘',
      shortText: 'Raises a veil and dims the next enemy attack.'
    }),
    special: Object.freeze({
      suffix: 'Soul Eclipse',
      icon: '✨',
      shortText: 'Drains life from the target in a lunar burst.'
    })
  })
});

function template(templateId, element, name, species, skillPrefix) {
  const presentation = SKILL_PRESENTATION[element];
  const skill = (type, vfxType) => Object.freeze({
    name: `${name}: ${presentation[type].suffix}`,
    icon: presentation[type].icon,
    shortText: presentation[type].shortText,
    shortTextKey: `skillCopy${element}${type[0].toUpperCase()}${type.slice(1)}`,
    vfxKey: `${skillPrefix}:${vfxType}`
  });
  return Object.freeze({
    templateId,
    element,
    name,
    species,
    assetPath: `/plugins/streamalchemy/assets/streammonsters/furry/${templateId}.png`,
    skills: Object.freeze({
      attack: skill('attack', 'attack'),
      defense: skill('defense', 'defense'),
      special: skill('special', 'special')
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

function getEvolutionAssetPath(templateOrId, stage = 1) {
  const entry = typeof templateOrId === 'string' ? getTemplate(templateOrId) : templateOrId;
  if (!entry) return null;
  const normalizedStage = Math.max(1, Math.min(3, Number(stage) || 1));
  if (normalizedStage === 1) return entry.assetPath;
  return `/plugins/streamalchemy/assets/streammonsters/furry/evolution/${entry.element.toLowerCase()}/${entry.templateId}-stage${normalizedStage}.png`;
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
    B: Object.freeze([{ type: 'shield', power: 4 }, { type: 'thorns', power: 1 }]),
    C: Object.freeze([{ type: 'damage', power: 9 }, { type: 'heal', power: 2 }])
  }),
  Tide: Object.freeze({
    A: Object.freeze([{ type: 'damage', power: 5 }, { type: 'weaken', power: 1 }]),
    B: Object.freeze([{ type: 'shield', power: 3 }, { type: 'heal', power: 3 }]),
    C: Object.freeze([{ type: 'damage', power: 7 }, { type: 'heal', power: 5 }])
  }),
  Grove: Object.freeze({
    A: Object.freeze([{ type: 'damage', power: 5 }, { type: 'thorns', power: 2 }]),
    B: Object.freeze([{ type: 'shield', power: 7 }]),
    C: Object.freeze([
      { type: 'damage', power: 5 },
      { type: 'shield', power: 5 },
      { type: 'heal', power: 3 }
    ])
  }),
  Gale: Object.freeze({
    A: Object.freeze([{ type: 'damage', power: 7, hits: 2 }]),
    B: Object.freeze([{ type: 'shield', power: 3 }, { type: 'evade', chance: 25 }]),
    C: Object.freeze([{ type: 'damage', power: 10, hits: 3 }])
  }),
  Volt: Object.freeze({
    A: Object.freeze([{ type: 'damage', power: 6 }, { type: 'pierce', power: 2 }]),
    B: Object.freeze([{ type: 'shield', power: 4 }, { type: 'reflect', power: 2 }]),
    C: Object.freeze([{ type: 'damage', power: 10 }, { type: 'pierce', power: 4 }])
  }),
  Lunar: Object.freeze({
    A: Object.freeze([{ type: 'damage', power: 5 }, { type: 'heal', power: 3 }]),
    B: Object.freeze([{ type: 'shield', power: 5 }, { type: 'weaken', power: 1 }]),
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
        icon: entry.skills.attack.icon,
        shortText: entry.skills.attack.shortText,
        shortTextKey: entry.skills.attack.shortTextKey,
        type: 'attack',
        element: entry.element,
        vfxKey: entry.skills.attack.vfxKey,
        effects: V5_ELEMENT_EFFECTS[entry.element].A
      }),
      B: Object.freeze({
        id: `${entry.templateId}:B`,
        name: entry.skills.defense.name,
        icon: entry.skills.defense.icon,
        shortText: entry.skills.defense.shortText,
        shortTextKey: entry.skills.defense.shortTextKey,
        type: 'defense',
        element: entry.element,
        vfxKey: entry.skills.defense.vfxKey,
        effects: V5_ELEMENT_EFFECTS[entry.element].B
      }),
      C: Object.freeze({
        id: `${entry.templateId}:C`,
        name: entry.skills.special.name,
        icon: entry.skills.special.icon,
        shortText: entry.skills.special.shortText,
        shortTextKey: entry.skills.special.shortTextKey,
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
  FURRY_ASSET_VERSION,
  TEMPLATE_CATALOG,
  getTemplate,
  getTemplatesForElement,
  getEvolutionAssetPath,
  deterministicTemplateId,
  hashNumber,
  V5_ELEMENT_EFFECTS,
  buildV5SkillCatalog
};
