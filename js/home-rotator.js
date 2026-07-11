(function () {
  'use strict';

  function initHomeRotator() {
    const root = document.querySelector('[data-home-rotator]');
    if (!root) return;

    const slides = Array.from(root.querySelectorAll('[data-rotator-slide]'));
    const dots = Array.from(root.querySelectorAll('[data-rotator-dot]'));
    const previous = root.querySelector('[data-rotator-prev]');
    const next = root.querySelector('[data-rotator-next]');
    const toggle = root.querySelector('[data-rotator-toggle]');
    if (slides.length < 2) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let current = 0;
    let paused = reducedMotion;
    let timer = null;

    function translated(key, fallback) {
      return window.I18n && typeof window.I18n.t === 'function' ? window.I18n.t(key) : fallback;
    }

    function render() {
      slides.forEach((slide, index) => {
        const offset = (index - current + slides.length) % slides.length;
        const state = offset === 0 ? 'active' : offset === 1 ? 'next' : offset === 2 ? 'behind' : 'hidden';
        slide.dataset.rotatorState = state;
        slide.setAttribute('aria-hidden', state === 'active' ? 'false' : 'true');
        if ('inert' in slide) slide.inert = state !== 'active';
      });
      dots.forEach((dot, index) => {
        dot.setAttribute('aria-selected', index === current ? 'true' : 'false');
        dot.tabIndex = index === current ? 0 : -1;
      });
    }

    function stopTimer() {
      if (timer) window.clearInterval(timer);
      timer = null;
    }

    function startTimer() {
      stopTimer();
      if (paused || reducedMotion || document.hidden) return;
      timer = window.setInterval(() => {
        current = (current + 1) % slides.length;
        render();
      }, 5200);
    }

    function setPaused(nextPaused) {
      paused = nextPaused;
      if (toggle) {
        toggle.dataset.paused = paused ? 'true' : 'false';
        toggle.querySelector('span').textContent = paused ? '▶' : '⏸';
        toggle.setAttribute(
          'aria-label',
          translated(
            paused ? 'homeV2.rotator.play' : 'homeV2.rotator.pause',
            paused ? 'Rotator starten' : 'Rotator pausieren'
          )
        );
      }
      startTimer();
    }

    function move(step) {
      current = (current + step + slides.length) % slides.length;
      render();
      startTimer();
    }

    previous?.addEventListener('click', () => move(-1));
    next?.addEventListener('click', () => move(1));
    dots.forEach((dot) => {
      dot.addEventListener('click', () => {
        current = Number(dot.dataset.rotatorDot) || 0;
        render();
        startTimer();
      });
    });
    toggle?.addEventListener('click', () => setPaused(!paused));

    root.addEventListener('mouseenter', stopTimer);
    root.addEventListener('mouseleave', startTimer);
    root.addEventListener('focusin', stopTimer);
    root.addEventListener('focusout', (event) => {
      if (!root.contains(event.relatedTarget)) startTimer();
    });
    document.addEventListener('visibilitychange', startTimer);
    document.addEventListener('i18nApplied', () => {
      if (toggle) {
        toggle.setAttribute(
          'aria-label',
          translated(
            paused ? 'homeV2.rotator.play' : 'homeV2.rotator.pause',
            paused ? 'Rotator starten' : 'Rotator pausieren'
          )
        );
      }
    });

    render();
    startTimer();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHomeRotator, { once: true });
  } else {
    initHomeRotator();
  }
})();
