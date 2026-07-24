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

module.exports = { ELEMENTS, TEMPLATE_CATALOG, getTemplate, getTemplatesForElement, deterministicTemplateId, hashNumber };
