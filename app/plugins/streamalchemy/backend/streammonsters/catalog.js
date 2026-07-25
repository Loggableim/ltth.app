const ELEMENTS = Object.freeze(['Ember', 'Tide', 'Grove', 'Gale', 'Volt', 'Lunar']);

function template(templateId, element, name, species) {
  return Object.freeze({
    templateId,
    element,
    name,
    species,
    assetPath: `/plugins/streamalchemy/assets/streammonsters/furry/${templateId}.png`
  });
}

const TEMPLATE_CATALOG = Object.freeze([
  template('ashfang', 'Ember', 'Ashfang', 'Wolf'),
  template('cinder', 'Ember', 'Cinder', 'Fox'),
  template('embergrin', 'Ember', 'Embergrin', 'Hyena'),
  template('pyrra', 'Ember', 'Pyrra', 'Red Panda'),
  template('ripple', 'Tide', 'Ripple', 'Otter'),
  template('brine', 'Tide', 'Brine', 'Seal'),
  template('reefbite', 'Tide', 'Reefbite', 'Shark Furry'),
  template('axi', 'Tide', 'Axi', 'Axolotl'),
  template('mosswhisker', 'Grove', 'Mosswhisker', 'Mouse'),
  template('cloverhop', 'Grove', 'Cloverhop', 'Rabbit'),
  template('oakheart', 'Grove', 'Oakheart', 'Deer'),
  template('fernmask', 'Grove', 'Fernmask', 'Raccoon'),
  template('zephyr', 'Gale', 'Zephyr', 'Bat'),
  template('skyrend', 'Gale', 'Skyrend', 'Griffin'),
  template('cirrus', 'Gale', 'Cirrus', 'Owl Furry'),
  template('gusttail', 'Gale', 'Gusttail', 'Flying Squirrel'),
  template('pulse', 'Volt', 'Pulse', 'Protogen'),
  template('neonclaw', 'Volt', 'Neonclaw', 'Cyber Lynx'),
  template('ampjack', 'Volt', 'Ampjack', 'Synth Jackal'),
  template('flashstep', 'Volt', 'Flashstep', 'Cheetah'),
  template('selene', 'Lunar', 'Selene', 'Snow Leopard'),
  template('umbra', 'Lunar', 'Umbra', 'Black Cat'),
  template('lumen', 'Lunar', 'Lumen', 'Moth Furry'),
  template('tsuki', 'Lunar', 'Tsuki', 'Kitsune')
]);

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

function deterministicTemplate(element, seed) {
  const templates = getTemplatesForElement(element);
  return templates[hashNumber(`${element}:${seed}`) % templates.length] || null;
}

module.exports = { ELEMENTS, TEMPLATE_CATALOG, getTemplatesForElement, deterministicTemplate, hashNumber };
