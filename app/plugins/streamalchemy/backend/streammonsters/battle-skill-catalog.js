const { TEMPLATE_CATALOG } = require('./catalog');

function skill(templateId, choice, name, description, icon, vfxKey, effects, budget) {
  return Object.freeze({
    id: `${templateId}:${choice.toLowerCase()}`,
    choice,
    name,
    description,
    icon,
    vfxKey,
    effects: Object.freeze(effects),
    budget: Object.freeze(budget),
    requiresFullCharge: choice === 'C'
  });
}

function set(templateId, attack, defense, special) {
  return Object.freeze({
    A: skill(templateId, 'A', ...attack),
    B: skill(templateId, 'B', ...defense),
    C: skill(templateId, 'C', ...special)
  });
}

// Every furry template owns an explicit, cosmetic-forward three-skill kit.
// Effects are resolved by BattleService; their budgets preserve fair combat.
const SKILL_CATALOG = Object.freeze({
  ashfang: set('ashfang',
    ['Ash Pounce', 'Leap through embers for a heavy strike and brand the target.', 'claw', 'ember-pounce', [{ type: 'damage', bonus: 2 }, { type: 'burn', amount: 2, duration: 1 }], { baseDamageBonus: 2 }],
    ['Cinderhide', 'Raise a hot coat that shields you and pricks attackers.', 'shield', 'ember-cinderhide', [{ type: 'shield', amount: 4 }, { type: 'thorns', amount: 2, duration: 1 }], { defensePoints: 6 }],
    ['Solar Howl', 'Unleash a blazing howl, then mend with its warmth.', 'star', 'ember-solar-howl', [{ type: 'damage', bonus: 5 }, { type: 'heal', amount: 2 }], { baseDamageBonus: 5 }]),
  cinder: set('cinder',
    ['Foxfire Feint', 'Scatter foxfire that stings and weakens the next hit.', 'flame', 'ember-foxfire', [{ type: 'damage', bonus: 1 }, { type: 'weaken', amount: 2, duration: 1 }], { baseDamageBonus: 1 }],
    ['Tailguard', 'Wrap a sparkling tail around yourself for a nimble guard.', 'shield', 'ember-tailguard', [{ type: 'shield', amount: 5 }, { type: 'evade', chance: 20, duration: 1 }], { defensePoints: 7 }],
    ['Comet Trick', 'Dash with a comet trail, pierce shields and singe the foe.', 'star', 'ember-comet-trick', [{ type: 'damage', bonus: 4 }, { type: 'pierce', amount: 3 }, { type: 'burn', amount: 1, duration: 1 }], { baseDamageBonus: 4 }]),
  embergrin: set('embergrin',
    ['Laughing Lunge', 'A cackling lunge rattles the enemy into a weaker guard.', 'claw', 'ember-laughing-lunge', [{ type: 'damage', bonus: 2 }, { type: 'weaken', amount: 1, duration: 1 }], { baseDamageBonus: 2 }],
    ['Coal Mane', 'Fluff up a coal-hot mane with sharp reflected sparks.', 'shield', 'ember-coal-mane', [{ type: 'shield', amount: 3 }, { type: 'reflect', amount: 3, duration: 1 }], { defensePoints: 6 }],
    ['Wildfire Cackle', 'Burst into wildfire laughter and burn brighter on impact.', 'star', 'ember-wildfire-cackle', [{ type: 'damage', bonus: 5 }, { type: 'burn', amount: 2, duration: 1 }], { baseDamageBonus: 5 }]),
  pyrra: set('pyrra',
    ['Panda Spark', 'Roll forward in a sparkly strike that leaves thorns.', 'claw', 'ember-panda-spark', [{ type: 'damage', bonus: 1 }, { type: 'thorns', amount: 2, duration: 1 }], { baseDamageBonus: 1 }],
    ['Bamboo Barrier', 'Plant a glowing bamboo barrier and recover your footing.', 'shield', 'ember-bamboo-barrier', [{ type: 'shield', amount: 5 }, { type: 'heal', amount: 2 }], { defensePoints: 7 }],
    ['Red Rocket Roll', 'Rocket-roll in a red arc for a devastating multi-hit.', 'star', 'ember-red-rocket', [{ type: 'damage', bonus: 4, hits: 2 }, { type: 'initiative', amount: 2, duration: 1 }], { baseDamageBonus: 4 }]),

  ripple: set('ripple',
    ['River Swipe', 'A flowing swipe softens the next attack against you.', 'wave', 'tide-river-swipe', [{ type: 'damage', bonus: 1 }, { type: 'weaken', amount: 2, duration: 1 }], { baseDamageBonus: 1 }],
    ['Otter Float', 'Float behind a rippling shield and heal a little.', 'shield', 'tide-otter-float', [{ type: 'shield', amount: 3 }, { type: 'heal', amount: 3 }], { defensePoints: 6 }],
    ['Moonstream Rush', 'Ride a moonlit stream through shields and back to health.', 'star', 'tide-moonstream', [{ type: 'damage', bonus: 4 }, { type: 'pierce', amount: 2 }, { type: 'heal', amount: 2 }], { baseDamageBonus: 4 }]),
  brine: set('brine',
    ['Seal Splash', 'A bright splash strikes twice in quick succession.', 'wave', 'tide-seal-splash', [{ type: 'damage', bonus: 1, hits: 2 }], { baseDamageBonus: 1 }],
    ['Foam Cocoon', 'Settle into healing sea foam that blunts a hit.', 'shield', 'tide-foam-cocoon', [{ type: 'shield', amount: 4 }, { type: 'heal', amount: 3 }], { defensePoints: 7 }],
    ['Tidal Applause', 'Clap up a tide that smacks hard and restores you.', 'star', 'tide-tidal-applause', [{ type: 'damage', bonus: 5 }, { type: 'heal', amount: 3 }], { baseDamageBonus: 5 }]),
  reefbite: set('reefbite',
    ['Reef Rake', 'Rake past two points of shield before the bite lands.', 'wave', 'tide-reef-rake', [{ type: 'damage', bonus: 2 }, { type: 'pierce', amount: 2 }], { baseDamageBonus: 2 }],
    ['Current Guard', 'A spinning current grants a shield and a brief dodge.', 'shield', 'tide-current-guard', [{ type: 'shield', amount: 4 }, { type: 'evade', chance: 25, duration: 1 }], { defensePoints: 7 }],
    ['Abyss Chomp', 'Erupt from below for a crushing strike that drains vigor.', 'star', 'tide-abyss-chomp', [{ type: 'damage', bonus: 5 }, { type: 'heal', amount: 2 }], { baseDamageBonus: 5 }]),
  axi: set('axi',
    ['Gill Glimmer', 'A glimmering jab burns the foe with cool static.', 'wave', 'tide-gill-glimmer', [{ type: 'damage', bonus: 1 }, { type: 'burn', amount: 2, duration: 1 }], { baseDamageBonus: 1 }],
    ['Frill Bloom', 'Bloom your frills into a soft shield and tiny heal.', 'shield', 'tide-frill-bloom', [{ type: 'shield', amount: 3 }, { type: 'heal', amount: 4 }], { defensePoints: 7 }],
    ['Regrowth Ray', 'A radiant ray strikes and restores a strong burst of health.', 'star', 'tide-regrowth-ray', [{ type: 'damage', bonus: 3 }, { type: 'heal', amount: 5 }], { baseDamageBonus: 3 }]),

  mosswhisker: set('mosswhisker',
    ['Bramble Bite', 'A tiny bite grows prickly brambles around the foe.', 'leaf', 'grove-bramble-bite', [{ type: 'damage', bonus: 1 }, { type: 'thorns', amount: 2, duration: 1 }], { baseDamageBonus: 1 }],
    ['Moss Nest', 'Curl into a moss nest for a generous shield.', 'shield', 'grove-moss-nest', [{ type: 'shield', amount: 7 }], { defensePoints: 7 }],
    ['Root Rocket', 'Launch on roots with a punchy hit and initiative boost.', 'star', 'grove-root-rocket', [{ type: 'damage', bonus: 4 }, { type: 'initiative', amount: 3, duration: 1 }], { baseDamageBonus: 4 }]),
  cloverhop: set('cloverhop',
    ['Lucky Kick', 'A lucky kick deals damage and grants a brief dodge.', 'leaf', 'grove-lucky-kick', [{ type: 'damage', bonus: 2 }, { type: 'evade', chance: 20, duration: 1 }], { baseDamageBonus: 2 }],
    ['Clover Cover', 'Hide behind clover leaves and mend your scrapes.', 'shield', 'grove-clover-cover', [{ type: 'shield', amount: 4 }, { type: 'heal', amount: 3 }], { defensePoints: 7 }],
    ['Verdant Volley', 'Kick up three verdant hits in one sparkling volley.', 'star', 'grove-verdant-volley', [{ type: 'damage', bonus: 4, hits: 3 }], { baseDamageBonus: 4 }]),
  oakheart: set('oakheart',
    ['Antler Arc', 'Sweep antlers through the guard and weaken the foe.', 'leaf', 'grove-antler-arc', [{ type: 'damage', bonus: 2 }, { type: 'weaken', amount: 2, duration: 1 }], { baseDamageBonus: 2 }],
    ['Bark Bastion', 'Raise an oak wall that reflects a little incoming force.', 'shield', 'grove-bark-bastion', [{ type: 'shield', amount: 6 }, { type: 'reflect', amount: 2, duration: 1 }], { defensePoints: 8 }],
    ['Ancient Stampede', 'Call ancient roots for a brutal impact and self-repair.', 'star', 'grove-ancient-stampede', [{ type: 'damage', bonus: 5 }, { type: 'heal', amount: 2 }], { baseDamageBonus: 5 }]),
  fernmask: set('fernmask',
    ['Mask Mischief', 'A tricking swipe deals damage while slipping past shields.', 'leaf', 'grove-mask-mischief', [{ type: 'damage', bonus: 1 }, { type: 'pierce', amount: 3 }], { baseDamageBonus: 1 }],
    ['Leafy Lookout', 'Hide in a leafy lookout with thorns ready to answer.', 'shield', 'grove-leafy-lookout', [{ type: 'shield', amount: 4 }, { type: 'thorns', amount: 3, duration: 1 }], { defensePoints: 7 }],
    ['Canopy Crash', 'Drop from the canopy in a rapid two-hit crash.', 'star', 'grove-canopy-crash', [{ type: 'damage', bonus: 5, hits: 2 }], { baseDamageBonus: 5 }]),

  zephyr: set('zephyr',
    ['Echo Wing', 'Two echoing wing taps add up to a clean hit.', 'wind', 'gale-echo-wing', [{ type: 'damage', bonus: 1, hits: 2 }], { baseDamageBonus: 1 }],
    ['Bat Blur', 'Blur through a gust with a shield and sharp evade.', 'shield', 'gale-bat-blur', [{ type: 'shield', amount: 3 }, { type: 'evade', chance: 35, duration: 1 }], { defensePoints: 7 }],
    ['Sonic Spiral', 'Spiral sonic rings into a powerful triple strike.', 'star', 'gale-sonic-spiral', [{ type: 'damage', bonus: 4, hits: 3 }], { baseDamageBonus: 4 }]),
  skyrend: set('skyrend',
    ['Talon Draft', 'Dive on a draft for a heavy hit and initiative.', 'wind', 'gale-talon-draft', [{ type: 'damage', bonus: 2 }, { type: 'initiative', amount: 2, duration: 1 }], { baseDamageBonus: 2 }],
    ['Feather Aegis', 'Fold glowing feathers into a reflective defense.', 'shield', 'gale-feather-aegis', [{ type: 'shield', amount: 5 }, { type: 'reflect', amount: 2, duration: 1 }], { defensePoints: 7 }],
    ['Skybreaker', 'Split the sky in a shield-piercing special dive.', 'star', 'gale-skybreaker', [{ type: 'damage', bonus: 5 }, { type: 'pierce', amount: 4 }], { baseDamageBonus: 5 }]),
  cirrus: set('cirrus',
    ['Cloud Peck', 'A cloudy peck softens the next enemy attack.', 'wind', 'gale-cloud-peck', [{ type: 'damage', bonus: 1 }, { type: 'weaken', amount: 3, duration: 1 }], { baseDamageBonus: 1 }],
    ['Hushwing', 'A silent wing raises a shield and restores calm.', 'shield', 'gale-hushwing', [{ type: 'shield', amount: 4 }, { type: 'heal', amount: 3 }], { defensePoints: 7 }],
    ['Nimbus Nova', 'Burst a nimbus cloud into a fast, crackling hit.', 'star', 'gale-nimbus-nova', [{ type: 'damage', bonus: 4 }, { type: 'initiative', amount: 3, duration: 1 }], { baseDamageBonus: 4 }]),
  gusttail: set('gusttail',
    ['Glide Glint', 'Glide by with a flickering two-hit tail strike.', 'wind', 'gale-glide-glint', [{ type: 'damage', bonus: 2, hits: 2 }], { baseDamageBonus: 2 }],
    ['Acorn Airbag', 'Inflate an acorn airbag that absorbs a big blow.', 'shield', 'gale-acorn-airbag', [{ type: 'shield', amount: 8 }], { defensePoints: 8 }],
    ['Storm Stash', 'Open a storm stash for a charged multi-hit surprise.', 'star', 'gale-storm-stash', [{ type: 'damage', bonus: 5, hits: 2 }, { type: 'burn', amount: 1, duration: 1 }], { baseDamageBonus: 5 }]),

  pulse: set('pulse',
    ['Circuit Claw', 'Arc a circuit claw through a little enemy shielding.', 'bolt', 'volt-circuit-claw', [{ type: 'damage', bonus: 2 }, { type: 'pierce', amount: 2 }], { baseDamageBonus: 2 }],
    ['Charge Shell', 'Build an electric shell that shocks attackers back.', 'shield', 'volt-charge-shell', [{ type: 'shield', amount: 4 }, { type: 'reflect', amount: 2, duration: 1 }], { defensePoints: 6 }],
    ['Overclock Beam', 'Overclock a bright beam for a fast, piercing blast.', 'star', 'volt-overclock-beam', [{ type: 'damage', bonus: 5 }, { type: 'pierce', amount: 4 }], { baseDamageBonus: 5 }]),
  neonclaw: set('neonclaw',
    ['Neon Rake', 'Rake neon claws across the target and overload them.', 'bolt', 'volt-neon-rake', [{ type: 'damage', bonus: 1 }, { type: 'burn', amount: 2, duration: 1 }], { baseDamageBonus: 1 }],
    ['Holo Prowl', 'Project a holo double for a shield and elusive dodge.', 'shield', 'volt-holo-prowl', [{ type: 'shield', amount: 3 }, { type: 'evade', chance: 35, duration: 1 }], { defensePoints: 7 }],
    ['Prism Pounce', 'Pounce in a prism flash with a rapid double impact.', 'star', 'volt-prism-pounce', [{ type: 'damage', bonus: 4, hits: 2 }, { type: 'initiative', amount: 2, duration: 1 }], { baseDamageBonus: 4 }]),
  ampjack: set('ampjack',
    ['Amp Howl', 'A synth howl rocks the guard and leaves it weaker.', 'bolt', 'volt-amp-howl', [{ type: 'damage', bonus: 2 }, { type: 'weaken', amount: 2, duration: 1 }], { baseDamageBonus: 2 }],
    ['Signal Ward', 'Set a signal ward with thorny feedback protection.', 'shield', 'volt-signal-ward', [{ type: 'shield', amount: 5 }, { type: 'thorns', amount: 2, duration: 1 }], { defensePoints: 7 }],
    ['Thunder Chorus', 'Call a thunder chorus that hits hard and steals a shield.', 'star', 'volt-thunder-chorus', [{ type: 'damage', bonus: 5 }, { type: 'pierce', amount: 4 }], { baseDamageBonus: 5 }]),
  flashstep: set('flashstep',
    ['Cheetah Zip', 'Zip in twice with electric sparks before they can blink.', 'bolt', 'volt-cheetah-zip', [{ type: 'damage', bonus: 2, hits: 2 }], { baseDamageBonus: 2 }],
    ['Static Stance', 'Ground yourself behind a shield of reactive static.', 'shield', 'volt-static-stance', [{ type: 'shield', amount: 4 }, { type: 'thorns', amount: 3, duration: 1 }], { defensePoints: 7 }],
    ['Flashline Finale', 'Draw a flashline straight through defenses in one burst.', 'star', 'volt-flashline-finale', [{ type: 'damage', bonus: 5 }, { type: 'pierce', amount: 5 }], { baseDamageBonus: 5 }]),

  selene: set('selene',
    ['Frost Crescent', 'Slice a frosty crescent that restores a little moonlight.', 'moon', 'lunar-frost-crescent', [{ type: 'damage', bonus: 1 }, { type: 'heal', amount: 3 }], { baseDamageBonus: 1 }],
    ['Moonveil', 'Draw a moonveil with a shield and quiet dodge.', 'shield', 'lunar-moonveil', [{ type: 'shield', amount: 4 }, { type: 'evade', chance: 25, duration: 1 }], { defensePoints: 7 }],
    ['Aurora Prowl', 'Prowl beneath aurora light for a powerful draining hit.', 'star', 'lunar-aurora-prowl', [{ type: 'damage', bonus: 5 }, { type: 'healFromDamage', ratio: 0.5 }], { baseDamageBonus: 5 }]),
  umbra: set('umbra',
    ['Shadow Paw', 'Slip a shadow paw around the guard and make it weaker.', 'moon', 'lunar-shadow-paw', [{ type: 'damage', bonus: 2 }, { type: 'weaken', amount: 2, duration: 1 }], { baseDamageBonus: 2 }],
    ['Eclipse Coat', 'Wrap in eclipse fur for a thick shield and thorns.', 'shield', 'lunar-eclipse-coat', [{ type: 'shield', amount: 5 }, { type: 'thorns', amount: 2, duration: 1 }], { defensePoints: 7 }],
    ['Nightfall Nine', 'Unleash a nightfall flurry that lands in three dark cuts.', 'star', 'lunar-nightfall-nine', [{ type: 'damage', bonus: 4, hits: 3 }], { baseDamageBonus: 4 }]),
  lumen: set('lumen',
    ['Mothlight Dust', 'Scatter luminous dust that burns softly after the hit.', 'moon', 'lunar-mothlight-dust', [{ type: 'damage', bonus: 1 }, { type: 'burn', amount: 2, duration: 1 }], { baseDamageBonus: 1 }],
    ['Cocoon Glow', 'Glow inside a cocoon shield and heal steadily.', 'shield', 'lunar-cocoon-glow', [{ type: 'shield', amount: 3 }, { type: 'heal', amount: 4 }], { defensePoints: 7 }],
    ['Lunar Lantern', 'Flash a lunar lantern with a piercing starburst hit.', 'star', 'lunar-lantern', [{ type: 'damage', bonus: 4 }, { type: 'pierce', amount: 3 }, { type: 'heal', amount: 2 }], { baseDamageBonus: 4 }]),
  tsuki: set('tsuki',
    ['Kitsune Kiss', 'A playful kiss charms the foe into a weaker next attack.', 'moon', 'lunar-kitsune-kiss', [{ type: 'damage', bonus: 1 }, { type: 'weaken', amount: 3, duration: 1 }], { baseDamageBonus: 1 }],
    ['Spirit Mirror', 'Raise a spirit mirror that shields and reflects damage.', 'shield', 'lunar-spirit-mirror', [{ type: 'shield', amount: 4 }, { type: 'reflect', amount: 3, duration: 1 }], { defensePoints: 7 }],
    ['Nine-Tail Nova', 'Release a nine-tail nova for a bright, healing special.', 'star', 'lunar-nine-tail-nova', [{ type: 'damage', bonus: 5 }, { type: 'heal', amount: 3 }], { baseDamageBonus: 5 }])
});

const DEFAULT_TEMPLATE_BY_ELEMENT = Object.freeze(TEMPLATE_CATALOG.reduce((result, template) => {
  if (!result[template.element]) result[template.element] = template.templateId;
  return result;
}, {}));

function getSkillSet(templateId, element) {
  const fallback = DEFAULT_TEMPLATE_BY_ELEMENT[element] || 'ashfang';
  return SKILL_CATALOG[templateId] || SKILL_CATALOG[fallback];
}

module.exports = { SKILL_CATALOG, getSkillSet };
