(async () => {
  const loadCommonJs = async (source, dependencies = {}) => {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Modul nicht verfügbar: ${source}`);
    const module = { exports: {} };
    const requireDependency = dependency => {
      if (dependencies[dependency]) return dependencies[dependency];
      throw new Error(`Abhängigkeit nicht verfügbar: ${dependency}`);
    };
    new Function('module', 'exports', 'require', await response.text())(
      module,
      module.exports,
      requireDependency
    );
    return module.exports;
  };

  const builderState = await loadCommonJs('/builder-state.js');
  const [
    { drawComposite },
    { createLabController },
    atlasManifest,
    rigManifest
  ] = await Promise.all([
    loadCommonJs('/furry-builder-lab.js'),
    loadCommonJs('/lab-controller.js', { './builder-state': builderState }),
    fetch('/assets/atlas-manifest.json').then(response => response.json()),
    fetch('/assets/rig-manifest.json').then(response => response.json())
  ]);
  const { PARTS, createSelection } = builderState;
  atlasManifest.atlases = Object.fromEntries(
    Object.entries(atlasManifest.atlases)
      .map(([part, source]) => [part, `/assets/${source}`])
  );

  const canvas = document.querySelector('#preview');
  const readout = document.querySelector('#selection-readout');
  let selection = createSelection();
  let renderVersion = 0;

  const render = async () => {
    const version = ++renderVersion;
    await drawComposite(canvas, atlasManifest, rigManifest, selection);
    if (version === renderVersion) {
      document.querySelectorAll('.choice').forEach(button => button.classList.toggle('is-selected', Number(button.dataset.id) === selection[button.closest('[data-part]').dataset.part]));
      readout.textContent = `Kopf ${selection.heads + 1} · Augen ${selection.eyes + 1} · Mund ${selection.mouths + 1}`;
    }
  };
  const controller = createLabController({
    selection,
    onChange(next) {
      selection = next;
      render();
    }
  });

  PARTS.forEach(part => {
    const card = document.querySelector(`[data-part="${part}"]`);
    const grid = card.querySelector('.choice-grid');
    for (let id = 0; id < 12; id += 1) {
      const choice = document.createElement('button');
      choice.type = 'button'; choice.className = 'choice'; choice.dataset.id = id; choice.dataset.number = id + 1;
      choice.setAttribute('aria-label', `${part === 'heads' ? 'Kopf' : part === 'eyes' ? 'Augen' : 'Mund'} ${id + 1} auswählen`);
      choice.style.backgroundImage = `url("/assets/${atlasManifest.atlases[part].split('/').pop()}")`;
      choice.style.backgroundPosition = `${(id % 3) * 50}% ${Math.floor(id / 3) * (100 / 3)}%`;
      choice.addEventListener('click', () => controller.select(part, id));
      grid.append(choice);
    }
    card.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => {
      controller.cycle(part, button.dataset.action === 'next' ? 1 : -1);
    }));
  });
  document.querySelector('#randomize').addEventListener('click', () => controller.randomize());
  render();
})().catch(error => { document.querySelector('#selection-readout').textContent = `Vorschau konnte nicht geladen werden: ${error.message}`; });
