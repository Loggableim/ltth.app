(function () {
  'use strict';

  const indexUrl = '/docs/plugins/index.json';
  const categoryLabels = {
    de: { core: 'Kern', plugin: 'Plugins', overlay: 'Overlays', integration: 'Integrationen', utility: 'Werkzeuge', entertainment: 'Unterhaltung', module: 'Module', tool: 'Tools', system: 'System' },
    en: { core: 'Core', plugin: 'Plugins', overlay: 'Overlays', integration: 'Integrations', utility: 'Utilities', entertainment: 'Entertainment', module: 'Modules', tool: 'Tools', system: 'System' },
    es: { core: 'Núcleo', plugin: 'Plugins', overlay: 'Overlays', integration: 'Integraciones', utility: 'Utilidades', entertainment: 'Entretenimiento', module: 'Módulos', tool: 'Herramientas', system: 'Sistema' },
    fr: { core: 'Cœur', plugin: 'Plugins', overlay: 'Overlays', integration: 'Intégrations', utility: 'Utilitaires', entertainment: 'Divertissement', module: 'Modules', tool: 'Outils', system: 'Système' }
  };

  function locale() {
    return (window.__ltthLang || document.documentElement.lang || 'de').toLowerCase().split('-')[0];
  }

  function text(key, fallback) {
    return window.I18n && typeof window.I18n.t === 'function' ? window.I18n.t(key) : fallback;
  }

  function render(catalog, activeCategory, query) {
    const lang = locale();
    const grid = document.getElementById('docs-plugin-grid');
    const empty = document.getElementById('docs-plugin-empty');
    if (!grid) return;
    const normalized = query.trim().toLocaleLowerCase(lang);
    const visible = catalog.filter((plugin) => {
      const copy = plugin.translations[lang] || plugin.translations.de;
      return (!activeCategory || plugin.category === activeCategory) && `${plugin.name} ${copy.title} ${copy.summary} ${plugin.category} ${plugin.access}`.toLocaleLowerCase(lang).includes(normalized);
    });
    grid.replaceChildren(...visible.map((plugin) => {
      const copy = plugin.translations[lang] || plugin.translations.de;
      const card = document.createElement('article');
      card.className = 'docs-plugin-card';
      const image = document.createElement('img');
      image.src = plugin.image[lang] || plugin.image.de;
      image.alt = copy.title;
      image.loading = 'lazy';
      image.width = 1280;
      image.height = 800;
      image.className = 'docs-plugin-card__image';
      image.addEventListener('error', () => { image.closest('figure')?.remove(); }, { once: true });
      const figure = document.createElement('figure'); figure.append(image);
      const heading = document.createElement('h2'); heading.textContent = copy.title;
      const summary = document.createElement('p'); summary.textContent = copy.summary;
      const meta = document.createElement('p'); meta.className = 'docs-plugin-card__meta'; meta.textContent = `${(categoryLabels[lang] || categoryLabels.en)[plugin.category] || plugin.category} · ${plugin.access}`;
      const link = document.createElement('a'); link.className = 'btn btn-primary'; link.href = `/docs/plugins/${plugin.id}.html?lang=${lang}`; link.textContent = text('docs.hub.open', 'Open tutorial');
      card.append(figure, heading, summary, meta, link);
      return card;
    }));
    empty.hidden = visible.length > 0;
  }

  async function init() {
    if (window.LTTHLayout) await window.LTTHLayout.init();
    if (window.I18n) await window.I18n.init(locale());
    const response = await fetch(indexUrl, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Could not load documentation index (${response.status})`);
    const catalog = await response.json();
    const filterContainer = document.getElementById('docs-category-filters');
    const search = document.getElementById('docs-plugin-search');
    let activeCategory = '';
    const draw = () => render(catalog, activeCategory, search?.value || '');
    const categories = [...new Set(catalog.map((plugin) => plugin.category))].sort();
    const createFilter = (id, label) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'docs-category-filter'; button.dataset.category = id; button.textContent = label;
      button.addEventListener('click', () => { activeCategory = id; filterContainer.querySelectorAll('button').forEach((item) => item.classList.toggle('is-active', item === button)); draw(); });
      return button;
    };
    const lang = locale();
    filterContainer.append(createFilter('', text('docs.hub.all', 'All categories')));
    for (const category of categories) filterContainer.append(createFilter(category, (categoryLabels[lang] || categoryLabels.en)[category] || category));
    filterContainer.firstElementChild.classList.add('is-active');
    search?.addEventListener('input', draw);
    draw();
  }

  document.addEventListener('DOMContentLoaded', () => init().catch((error) => console.error('Documentation hub failed to load', error)));
}());
