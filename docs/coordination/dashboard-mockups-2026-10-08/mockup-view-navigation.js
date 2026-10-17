(() => {
  const init = () => {
    const directory = document.getElementById('view-directory');
    if (!directory) return;
    const filter = directory.querySelector('#view-filter');
    const groups = [...directory.querySelectorAll('.view-group')];
    const entries = [...directory.querySelectorAll('button[data-view]')];
    const count = directory.querySelector('#view-count');
    const selected = directory.querySelector('#view-selected');
    const toggle = document.getElementById('view-directory-toggle');
    const close = directory.querySelector('[data-view-close]');
    const refresh = () => {
      const query = (filter.value || '').trim().toLocaleLowerCase(document.documentElement.lang || 'de');
      let visible = 0;
      for (const entry of entries) {
        const match = `${entry.textContent} ${entry.dataset.view}`.toLocaleLowerCase(document.documentElement.lang || 'de').includes(query);
        entry.hidden = !match;
        if (match) visible += 1;
      }
      for (const group of groups) {
        const hasVisible = group.querySelector('button[data-view]:not([hidden])') !== null;
        group.hidden = !hasVisible;
        group.open = query ? hasVisible : group.dataset.defaultOpen === 'true';
      }
      if (count) count.textContent = `${visible} / ${entries.length}`;
    };
    filter?.addEventListener('input', refresh);
    entries.forEach(entry => entry.addEventListener('click', () => {
      entries.forEach(candidate => candidate.setAttribute('aria-pressed', String(candidate === entry)));
      directory.dataset.selectedView = entry.dataset.view;
      if (selected) selected.dataset.viewSelected = entry.dataset.view;
    }));
    toggle?.addEventListener('click', () => {
      if (directory instanceof HTMLDialogElement) {
        if (!directory.open) directory.showModal();
      } else if (directory instanceof HTMLDetailsElement) {
        directory.open = !directory.open;
      }
      toggle.setAttribute('aria-expanded', String(directory.open));
      if (directory.open) filter?.focus();
    });
    close?.addEventListener('click', () => directory.close());
    directory.addEventListener('close', () => {
      toggle?.setAttribute('aria-expanded', 'false');
      toggle?.focus();
    });
    directory.addEventListener('toggle', () => toggle?.setAttribute('aria-expanded', String(directory.open)));
    filter?.addEventListener('keydown', event => {
      if (event.key === 'Escape' && filter.value) { filter.value = ''; refresh(); event.stopPropagation(); }
    });
    refresh();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
