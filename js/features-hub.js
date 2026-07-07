'use strict';

(function() {
  function init() {
    const root = document.querySelector('[data-catalog-root]');
    if (!root) return;

    const searchInput = root.querySelector('[data-catalog-search-input]');
    const clearButton = root.querySelector('[data-catalog-clear]');
    const totalCountEl = root.querySelector('[data-catalog-total]');
    const resultCountEl = root.querySelector('[data-catalog-results]');
    const resultLabelEl = root.querySelector('[data-catalog-results-label]');
    const emptyState = root.querySelector('[data-catalog-empty]');
    const sections = Array.from(root.querySelectorAll('[data-catalog-section]'));
    const cards = Array.from(root.querySelectorAll('[data-catalog-entry]'));
    const readyLabel = root.getAttribute('data-catalog-ready-label') || 'Catalog ready';
    const resultsLabel = root.getAttribute('data-catalog-results-label') || 'results';

    function sync() {
      const query = (searchInput?.value || '').trim().toLowerCase();
      let visibleCards = 0;

      sections.forEach(section => {
        const sectionCards = Array.from(section.querySelectorAll('[data-catalog-entry]'));
        let visibleInSection = 0;

        sectionCards.forEach(card => {
          const haystack = card.getAttribute('data-search-index') || '';
          const matches = !query || haystack.includes(query);
          card.hidden = !matches;
          if (matches) {
            visibleCards += 1;
            visibleInSection += 1;
          }
        });

        section.hidden = visibleInSection === 0;

        const visibleCountEl = section.querySelector('[data-catalog-section-count]');
        if (visibleCountEl) visibleCountEl.textContent = String(visibleInSection);
      });

      if (resultCountEl) resultCountEl.textContent = String(visibleCards);
      if (resultCountEl) resultCountEl.hidden = query.length === 0;
      if (resultLabelEl) {
        resultLabelEl.textContent = query.length === 0 ? readyLabel : resultsLabel;
      }
      if (totalCountEl) totalCountEl.textContent = String(cards.length);
      if (emptyState) emptyState.hidden = visibleCards !== 0;
      if (clearButton) clearButton.hidden = query.length === 0;
    }

    if (searchInput) {
      searchInput.addEventListener('input', sync);
      searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          searchInput.value = '';
          sync();
        }
      });
    }

    if (clearButton && searchInput) {
      clearButton.addEventListener('click', (event) => {
        event.preventDefault();
        searchInput.value = '';
        sync();
        searchInput.focus();
      });
    }

    sync();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
