'use strict';

const {
  ELEMENT_IDS,
  normalizeLayout,
  migrateLegacyPixels,
  applyLayout,
  resetLayout,
  isValidLayout
} = require('../utils/overlay-layout');

const viewport = { width: 1920, height: 1080 };

describe('Interactive Story overlay layout v2', () => {
  test('migrates legacy pixels and clamps normalized known coordinates', () => {
    expect(migrateLegacyPixels({ positions: { title: { left: 960, top: 270 } } }, viewport)).toEqual({ version: 2, positions: { title: { x: 0.5, y: 0.25 } } });
    expect(normalizeLayout({ version: 2, positions: { title: { x: -0.25, y: 1.25 }, unknown: { x: 0.5, y: 0.5 } } }, viewport)).toEqual({ version: 2, positions: { title: { x: 0, y: 1 } } });
  });

  test('applies known normalized positions and resets to a stable v2 layout', () => {
    const title = { style: {} };
    const ignored = { style: {} };
    applyLayout({ title, unknown: ignored }, { version: 2, positions: { title: { x: 0.5, y: 0.25 }, unknown: { x: 0.1, y: 0.1 } } }, viewport);
    expect(title.style).toEqual({ position: 'fixed', left: '50%', top: '25%', transform: 'none' });
    expect(ignored.style).toEqual({});
    expect(resetLayout()).toEqual({ version: 2, positions: {} });
  });

  test('allows only finite in-range v2 coordinates for known element identifiers', () => {
    expect(isValidLayout({ version: 2, positions: { voting: { x: 0, y: 1 } } })).toBe(true);
    expect(isValidLayout({ positions: { voting: { left: 10, top: 20 } } })).toBe(false);
    expect(isValidLayout({ version: 2, positions: { voting: { x: 1.01, y: 0 } } })).toBe(false);
    expect(isValidLayout({ version: 2, positions: { unknown: { x: 0.5, y: 0.5 } } })).toBe(false);
    expect(ELEMENT_IDS).toEqual(['title', 'content', 'voting', 'generating', 'results', 'participants']);
  });
});
