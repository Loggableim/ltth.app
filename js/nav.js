(() => {
  const FALLBACK_INIT_DELAY_MS = 1200;
  const initNav = () => {
    const nav = document.getElementById('navbar');
    if (!nav) return false;

    const toggle = document.getElementById('navToggle');
    const menu = document.getElementById('navMenu');
    const dropdowns = nav.querySelectorAll('.nav-dropdown');
    const langSelect = document.getElementById('langSelect');

    if (!toggle || !menu) return false;

    const setMenuState = (open) => {
      menu.dataset.state = open ? 'open' : 'closed';
      toggle.setAttribute('aria-expanded', String(open));
      document.body.style.overflow = open ? 'hidden' : '';
      if (!open) {
        dropdowns.forEach((d) => {
          d.setAttribute('aria-expanded', 'false');
          const button = d.querySelector('button');
          if (button) button.setAttribute('aria-expanded', 'false');
        });
      }
    };

    toggle.addEventListener('click', () => setMenuState(menu.dataset.state !== 'open'));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setMenuState(false);
    });

    dropdowns.forEach((dd) => {
      const btn = dd.querySelector('button');
      if (!btn) return;
      btn.addEventListener('click', () => {
        const expanded = btn.getAttribute('aria-expanded') === 'true';
        dropdowns.forEach((d) => {
          d.setAttribute('aria-expanded', 'false');
          const b = d.querySelector('button');
          if (b) b.setAttribute('aria-expanded', 'false');
        });
        dd.setAttribute('aria-expanded', String(!expanded));
        btn.setAttribute('aria-expanded', String(!expanded));
      });
    });

    const current = document.body.dataset.page;
    if (current) {
      nav.querySelectorAll(`[data-section="${current}"]`).forEach((el) => el.classList.add('active'));
    }

    const htmlLang = document.documentElement.getAttribute('lang');
    const searchLang = new URLSearchParams(window.location.search).get('lang');
    const selectedLang = searchLang || htmlLang || 'de';
    if (langSelect) langSelect.value = selectedLang;

    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 8);
    }, { passive: true });

    if (langSelect) {
      langSelect.addEventListener('change', (e) => {
        const lang = e.target.value;
        const map = { de: '/', en: '/index-en.html', fr: '/index-fr.html', es: '/index-es.html' };
        window.location.href = map[lang] || '/';
      });
    }
    return true;
  };

  if (!initNav()) {
    document.addEventListener('layoutReady', () => { initNav(); }, { once: true });
    document.addEventListener('DOMContentLoaded', () => { initNav(); }, { once: true });
    setTimeout(() => { initNav(); }, FALLBACK_INIT_DELAY_MS);
  }
})();
