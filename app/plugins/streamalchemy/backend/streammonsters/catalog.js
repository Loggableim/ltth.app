const ELEMENTS = Object.freeze(['Ember', 'Tide', 'Grove', 'Gale', 'Volt', 'Lunar']);
const FURRY_ASSET_VERSION = 'furry-1.5.0';
const V6_ELEMENT_ADVANTAGE_PAIRS = Object.freeze([
  'Ember:Grove',
  'Ember:Gale',
  'Tide:Ember',
  'Tide:Lunar',
  'Grove:Tide',
  'Grove:Volt',
  'Gale:Grove',
  'Gale:Lunar',
  'Volt:Gale',
  'Volt:Tide',
  'Lunar:Volt',
  'Lunar:Ember'
]);
const V6_NEUTRAL_OPPONENTS = Object.freeze({
  Ember: 'Volt',
  Tide: 'Gale',
  Grove: 'Lunar',
  Gale: 'Tide',
  Volt: 'Ember',
  Lunar: 'Grove'
});
const TEMPLATE_ROLES = Object.freeze({
  ashfang: 'striker',
  reefbite: 'striker',
  fernmask: 'striker',
  skyrend: 'striker',
  neonclaw: 'striker',
  umbra: 'striker',
  embergrin: 'guardian',
  brine: 'guardian',
  oakheart: 'guardian',
  cirrus: 'guardian',
  pulse: 'guardian',
  selene: 'guardian',
  cinder: 'trickster',
  ripple: 'trickster',
  mosswhisker: 'trickster',
  zephyr: 'trickster',
  flashstep: 'trickster',
  tsuki: 'trickster',
  pyrra: 'sustain',
  axi: 'sustain',
  cloverhop: 'sustain',
  gusttail: 'sustain',
  ampjack: 'sustain',
  lumen: 'sustain'
});
const ROLE_EFFECT_BUDGET_EQUIVALENTS = Object.freeze({
  burnPowerPerPoint: 0.25,
  evadeChancePerPoint: 25,
  lifestealRatioPerPoint: 0.2,
  piercePowerPerPoint: 0.25
});
const V6_ELEMENT_ADVANTAGE_DAMAGE = Object.freeze({
  'Ember:Grove': 0.8,
  'Ember:Gale': 1,
  'Tide:Ember': 0,
  'Tide:Lunar': 0.6,
  'Grove:Tide': 1.2,
  'Grove:Volt': 1.2,
  'Gale:Grove': 0.8,
  'Gale:Lunar': 1,
  'Volt:Gale': 2,
  'Volt:Tide': 2,
  'Lunar:Volt': 1.3,
  'Lunar:Ember': 0.7
});
const V6_SUSTAIN_TUNING = Object.freeze({
  attackDamagePenalty: 2,
  attackHeal: 1,
  defenseTransfer: 1,
  specialDamagePenalty: 3,
  specialHeal: 1
});
const V6_STRIKER_TUNING = Object.freeze({
  offenseDamage: 0.1,
  defenseBudget: 1,
  specialSecondaryBudget: 1
});
const V6_TRICKSTER_TUNING = Object.freeze({
  transferBudget: 1
});
const V6_GUARDIAN_TUNING = Object.freeze({
  damagePenalty: 1,
  shieldBonus: 1
});
const V6_ELEMENT_DAMAGE_TUNING = Object.freeze({
  Lunar: 1,
  Volt: 1.5
});
const V8_NEUTRAL_ROLE_DAMAGE_TUNING = Object.freeze({
  Ember: Object.freeze({
    striker: 0.5,
    guardian: 0.5,
    trickster: 1,
    sustain: 1.5
  }),
  Tide: Object.freeze({
    striker: 0.8,
    guardian: 1,
    trickster: 0,
    sustain: 1.8
  }),
  Grove: Object.freeze({
    striker: -0.4,
    guardian: 0,
    trickster: 0.4,
    sustain: 1.2
  }),
  Gale: Object.freeze({
    striker: -0.75,
    guardian: -0.5,
    trickster: -1.5,
    sustain: 0.8
  }),
  Volt: Object.freeze({
    striker: 2,
    guardian: 2.5,
    trickster: 1.75,
    sustain: 3
  }),
  Lunar: Object.freeze({
    striker: 1.15,
    guardian: 1.15,
    trickster: 1.15,
    sustain: 2.9
  })
});
const V8_LEVEL_ONE_ELEMENT_DAMAGE_TUNING = Object.freeze({
  Gale: 0.5
});

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
    role: TEMPLATE_ROLES[templateId],
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

function cloneEffects(effects) {
  return effects.map(effect => ({ ...effect }));
}

function numericEffectValue(effect) {
  if (!effect) return 0;
  if (effect.type === 'burn') {
    return effect.power / ROLE_EFFECT_BUDGET_EQUIVALENTS.burnPowerPerPoint;
  }
  if (effect.type === 'evade') {
    return effect.chance / ROLE_EFFECT_BUDGET_EQUIVALENTS.evadeChancePerPoint;
  }
  if (effect.type === 'lifesteal') {
    return effect.ratio / ROLE_EFFECT_BUDGET_EQUIVALENTS.lifestealRatioPerPoint;
  }
  if (effect.type === 'pierce') {
    return effect.power / ROLE_EFFECT_BUDGET_EQUIVALENTS.piercePowerPerPoint;
  }
  return Number(effect.power) || 0;
}

function adjustPower(effects, type, delta, floor = 0) {
  let target = effects.find(effect => effect.type === type);
  if (!target) {
    target = { type, power: 0 };
    effects.push(target);
  }
  target.power = Math.max(floor, (Number(target.power) || 0) + delta);
}

function adjustSecondary(effects, type, delta) {
  let target = effects.find(effect => effect.type === type);
  if (!target) {
    target = type === 'evade'
      ? { type, chance: 0 }
      : (type === 'lifesteal' ? { type, ratio: 0 } : { type, power: 0 });
    effects.push(target);
  }
  if (type === 'evade') {
    target.chance = Math.max(
      0,
      (Number(target.chance) || 0) +
        (delta * ROLE_EFFECT_BUDGET_EQUIVALENTS.evadeChancePerPoint)
    );
  } else if (type === 'lifesteal') {
    target.ratio = Math.max(
      0,
      (Number(target.ratio) || 0) +
        (delta * ROLE_EFFECT_BUDGET_EQUIVALENTS.lifestealRatioPerPoint)
    );
  } else if (type === 'burn') {
    target.power = Math.max(
      0,
      (Number(target.power) || 0) +
        (delta * ROLE_EFFECT_BUDGET_EQUIVALENTS.burnPowerPerPoint)
    );
  } else if (type === 'pierce') {
    target.power = Math.max(
      0,
      (Number(target.power) || 0) +
        (delta * ROLE_EFFECT_BUDGET_EQUIVALENTS.piercePowerPerPoint)
    );
  } else {
    target.power = Math.max(0, (Number(target.power) || 0) + delta);
  }
}

function applyRoleEffects(element, role, choice, sourceEffects) {
  const effects = cloneEffects(sourceEffects);
  if (role === 'striker') {
    if (choice === 'A') {
      adjustPower(effects, 'damage', V6_STRIKER_TUNING.offenseDamage, 1);
    }
    if (choice === 'B') {
      const defensive = effects.find(effect => (
        effect.type === 'shield' || effect.type === 'heal'
      ));
      if (defensive) {
        defensive.power = Math.max(
          0,
          defensive.power - V6_STRIKER_TUNING.defenseBudget
        );
      }
    }
    if (choice === 'C') {
      adjustPower(effects, 'damage', V6_STRIKER_TUNING.offenseDamage, 1);
      const secondary = effects
        .filter(effect => effect.type !== 'damage')
        .sort((left, right) => numericEffectValue(right) - numericEffectValue(left))[0];
      if (secondary) {
        adjustSecondary(
          effects,
          secondary.type,
          -V6_STRIKER_TUNING.specialSecondaryBudget
        );
      }
    }
  } else if (role === 'guardian') {
    if (choice === 'A') {
      adjustPower(effects, 'damage', -V6_GUARDIAN_TUNING.damagePenalty, 1);
    }
    if (choice === 'B') {
      adjustPower(effects, 'shield', V6_GUARDIAN_TUNING.shieldBonus);
    }
    if (choice === 'C') {
      adjustPower(effects, 'damage', -V6_GUARDIAN_TUNING.damagePenalty, 1);
      adjustPower(effects, 'shield', V6_GUARDIAN_TUNING.shieldBonus);
    }
  } else if (role === 'sustain') {
    if (choice === 'A') {
      adjustPower(
        effects,
        'damage',
        -V6_SUSTAIN_TUNING.attackDamagePenalty,
        1
      );
      adjustPower(effects, 'heal', V6_SUSTAIN_TUNING.attackHeal);
    }
    if (choice === 'B') {
      const shield = effects.find(effect => effect.type === 'shield');
      const moved = Math.min(
        V6_SUSTAIN_TUNING.defenseTransfer,
        Number(shield?.power) || 0
      );
      if (shield) shield.power -= moved;
      adjustPower(effects, 'heal', moved);
    }
    if (choice === 'C') {
      adjustPower(
        effects,
        'damage',
        -V6_SUSTAIN_TUNING.specialDamagePenalty,
        1
      );
      adjustPower(effects, 'heal', V6_SUSTAIN_TUNING.specialHeal);
    }
  } else if (role === 'trickster') {
    const primary = effects.find(effect => (
      effect.type === 'damage' || effect.type === 'shield' || effect.type === 'heal'
    ));
    if (primary) {
      primary.power = Math.max(
        primary.type === 'damage' ? 1 : 0,
        primary.power - V6_TRICKSTER_TUNING.transferBudget
      );
    }
    const secondaryType = {
      Ember: 'burn',
      Tide: 'weaken',
      Grove: 'thorns',
      Gale: 'evade',
      Volt: 'pierce',
      Lunar: 'lifesteal'
    }[element];
    adjustSecondary(
      effects,
      secondaryType,
      V6_TRICKSTER_TUNING.transferBudget
    );
  }
  if (
    role !== 'trickster' &&
    V6_ELEMENT_DAMAGE_TUNING[element] &&
    effects.some(effect => effect.type === 'damage')
  ) {
    adjustPower(
      effects,
      'damage',
      -V6_ELEMENT_DAMAGE_TUNING[element],
      1
    );
  }
  return Object.freeze(effects.map(effect => Object.freeze(effect)));
}

function buildV6SkillCatalog() {
  const v5Catalog = buildV5SkillCatalog();
  return Object.fromEntries(TEMPLATE_CATALOG.map(entry => [
    entry.templateId,
    Object.freeze(Object.fromEntries(['A', 'B', 'C'].map(choice => {
      const skill = v5Catalog[entry.templateId][choice];
      return [
        choice,
        Object.freeze({
          ...skill,
          role: entry.role,
          effects: applyRoleEffects(entry.element, entry.role, choice, skill.effects)
        })
      ];
    })))
  ]));
}

const V6_SKILL_CATALOG = Object.freeze(buildV6SkillCatalog());

function stageSkillKey(prefix, templateId, choice, revision) {
  const templateKey = `${templateId[0].toUpperCase()}${templateId.slice(1)}`;
  return `${prefix}${templateKey}${choice}Stage${revision}`;
}

function resolveStageSkill(templateId, choice, stage = 1, rulesVersion = 8) {
  const normalizedChoice = String(choice || '').trim().toUpperCase();
  const base = V6_SKILL_CATALOG[templateId]?.[normalizedChoice];
  if (!base) {
    throw new Error(`STREAM_MONSTERS_SKILL_MISSING:${templateId}:${normalizedChoice}`);
  }
  if (Number(rulesVersion) < 7) return base;

  const templateEntry = getTemplate(templateId);
  const normalizedStage = Math.max(1, Math.min(3, Number(stage) || 1));
  const upgradedChoice = ['striker', 'trickster'].includes(templateEntry.role)
    ? 'A'
    : 'B';
  let revision = 1;
  const effects = cloneEffects(base.effects);
  if (normalizedStage >= 2 && normalizedChoice === upgradedChoice) {
    revision = 2;
    if (templateEntry.role === 'guardian') {
      adjustPower(effects, 'shield', 1);
    } else if (templateEntry.role === 'sustain') {
      adjustPower(effects, 'heal', 1);
    } else {
      adjustPower(effects, 'damage', 1, 1);
    }
  }
  if (normalizedStage >= 3 && normalizedChoice === 'C') {
    revision = 3;
    const primary = effects.find(effect => (
      effect.type === 'damage' || effect.type === 'shield' || effect.type === 'heal'
    ));
    const secondary = effects.find(effect => effect !== primary);
    if (primary) adjustPower(effects, primary.type, secondary ? 1 : 2);
    if (secondary) adjustSecondary(effects, secondary.type, 1);
  }
  const rulesV8DamageDelta = Number(rulesVersion) >= 8
    ? Number(V8_NEUTRAL_ROLE_DAMAGE_TUNING[templateEntry.element]?.[templateEntry.role]) || 0
    : 0;
  if (
    rulesV8DamageDelta &&
    effects.some(effect => effect.type === 'damage')
  ) {
    adjustPower(effects, 'damage', rulesV8DamageDelta, 1);
  }
  const nameKey = stageSkillKey(
    'skillName',
    templateId,
    normalizedChoice,
    revision
  );
  const effectKey = stageSkillKey(
    'skillEffect',
    templateId,
    normalizedChoice,
    revision
  );
  const frozenEffects = Object.freeze(
    effects.map(effect => Object.freeze({ ...effect }))
  );
  return Object.freeze({
    ...base,
    id: revision > 1 ? `${base.id}:stage-${revision}` : base.id,
    name: revision > 1 ? `${base.name} · ${revision === 2 ? 'II' : 'III'}` : base.name,
    shortTextKey: effectKey,
    choice: normalizedChoice,
    nameKey,
    effectKey,
    evolutionStage: normalizedStage,
    effects: frozenEffects
  });
}

module.exports = {
  ELEMENTS,
  FURRY_ASSET_VERSION,
  V6_ELEMENT_ADVANTAGE_PAIRS,
  V6_NEUTRAL_OPPONENTS,
  TEMPLATE_ROLES,
  ROLE_EFFECT_BUDGET_EQUIVALENTS,
  V6_ELEMENT_ADVANTAGE_DAMAGE,
  V6_SUSTAIN_TUNING,
  V6_STRIKER_TUNING,
  V6_TRICKSTER_TUNING,
  V6_GUARDIAN_TUNING,
  V6_ELEMENT_DAMAGE_TUNING,
  V8_NEUTRAL_ROLE_DAMAGE_TUNING,
  V8_LEVEL_ONE_ELEMENT_DAMAGE_TUNING,
  TEMPLATE_CATALOG,
  getTemplate,
  getTemplatesForElement,
  getEvolutionAssetPath,
  deterministicTemplateId,
  hashNumber,
  V5_ELEMENT_EFFECTS,
  buildV5SkillCatalog,
  buildV6SkillCatalog,
  V6_SKILL_CATALOG,
  resolveStageSkill
};
