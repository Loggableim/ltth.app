(async () => {
  const loadCommonJs = async source => {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Modul nicht verfügbar: ${source}`);
    const module = { exports: {} };
    new Function('module', 'exports', await response.text())(module, module.exports);
    return module.exports;
  };

  const [{ PARTS, createSelection, setPart, randomize }, { drawComposite }, manifest] = await Promise.all([
    loadCommonJs('/builder-state.js'),
    loadCommonJs('/furry-builder-lab.js'),
    fetch('/assets/atlas-manifest.json').then(response => response.json())
  ]);
  manifest.atlases = Object.fromEntries(Object.entries(manifest.atlases).map(([part, source]) => [part, `/assets/${source}`]));

  const canvas = document.querySelector('#preview');
  const readout = document.querySelector('#selection-readout');
  let selection = createSelection();
  let renderVersion = 0;

  const render = async () => {
    const version = ++renderVersion;
    await drawComposite(canvas, manifest, selection);
    if (version === renderVersion) {
      document.querySelectorAll('.choice').forEach(button => button.classList.toggle('is-selected', Number(button.dataset.id) === selection[button.closest('[data-part]').dataset.part]));
      readout.textContent = `Kopf ${selection.heads + 1} · Augen ${selection.eyes + 1} · Mund ${selection.mouths + 1}`;
    }
  };

  PARTS.forEach(part => {
    const card = document.querySelector(`[data-part="${part}"]`);
    const grid = card.querySelector('.choice-grid');
    for (let id = 0; id < 12; id += 1) {
      const choice = document.createElement('button');
      choice.type = 'button'; choice.className = 'choice'; choice.dataset.id = id; choice.dataset.number = id + 1;
      choice.setAttribute('aria-label', `${part === 'heads' ? 'Kopf' : part === 'eyes' ? 'Augen' : 'Mund'} ${id + 1} auswählen`);
      choice.style.backgroundImage = `url("/assets/${manifest.atlases[part].split('/').pop()}")`;
      choice.style.backgroundPosition = `${(id % 3) * 50}% ${Math.floor(id / 3) * (100 / 3)}%`;
      choice.addEventListener('click', () => { selection = setPart(selection, part, id); render(); });
      grid.append(choice);
    }
    card.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => {
      const direction = button.dataset.action === 'next' ? 1 : 11;
      selection = setPart(selection, part, (selection[part] + direction) % 12);
      render();
    }));
  });
  document.querySelector('#randomize').addEventListener('click', () => { selection = randomize(selection); render(); });
  render();
})().catch(error => { document.querySelector('#selection-readout').textContent = `Vorschau konnte nicht geladen werden: ${error.message}`; });
