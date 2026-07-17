'use strict';

// Browser-source overlays are often transparent until an event occurs. Tutorial
// screenshots therefore document their real settings entry points, not a blank
// rendered surface. Each guide keeps its localized instructional copy locally
// and supplies only the product route and visible control to this normalizer.
function exactLocalUrlExpectation(route) {
  const url = new URL(route, 'http://ltth.local');
  const query = Object.fromEntries(url.searchParams.entries());
  query.lang = '$locale';
  return { path: url.pathname, query, exactQuery: true };
}

function applyOverlayEntryPoints(guide, entries) {
  return {
    ...guide,
    steps: guide.steps.map((step) => {
      const entry = entries[step.id];
      if (!entry) return step;

      const documentedOverlayRoute = guide.overlay || entry.route;
      const routeHint = {
        de: `Lokaler Overlay-Pfad: \`${documentedOverlayRoute}\`.`,
        en: `Local overlay path: \`${documentedOverlayRoute}\`.`,
        es: `Ruta local del overlay: \`${documentedOverlayRoute}\`.`,
        fr: `Chemin local de l’overlay : \`${documentedOverlayRoute}\`.`
      };
      const copy = Object.fromEntries(Object.entries(entry.copy).map(([locale, value]) => {
        const body = value.body.includes(documentedOverlayRoute)
          ? value.body
          : `${value.body} ${routeHint[locale]}`;
        return [locale, {
          ...value,
          body,
          alt: value.alt || value.title
        }];
      }));
      const localized = (field) => Object.fromEntries(Object.entries(copy).map(([locale, value]) => [locale, value[field]]));
      const captureRule = {
        selector: entry.selector,
        viewport: { width: 1440, height: 900 },
        stateChange: false
      };
      if (entry.imageCrop) captureRule.imageCrop = entry.imageCrop;

      return {
        ...step,
        copy,
        capture: {
          route: entry.route,
          assertVisible: entry.selector,
          focusText: localized('title'),
          action: { type: 'open-plugin-surface', stepId: step.id },
          expected: localized('expected')
        },
        workflow: {
          route: entry.route,
          instructions: Object.fromEntries(Object.entries(copy).map(([locale, value]) => [locale, {
            title: value.title,
            body: value.body,
            expected: value.expected
          }])),
          operations: [
            { type: 'goto', route: entry.route },
            { type: 'open-plugin-surface', selector: entry.selector }
          ],
          postconditions: [
            { type: 'http-status', expected: [200, 304] },
            { type: 'url', expected: exactLocalUrlExpectation(entry.route) },
            { type: 'visible', selector: entry.selector },
            { type: 'console', expected: 'no-errors' }
          ],
          captureRule
        }
      };
    })
  };
}

module.exports = { applyOverlayEntryPoints, exactLocalUrlExpectation };
