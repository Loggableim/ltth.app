const fs = require('fs');
const path = require('path');
const postcss = require('postcss');

const websiteRoot = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(websiteRoot, relativePath), 'utf8');
}

function rulesForSelector(cssRoot, selector) {
  const rules = [];

  cssRoot.walkRules(rule => {
    if (rule.selectors?.map(value => value.trim()).includes(selector)) {
      rules.push(rule);
    }
  });

  return rules;
}

function lastRuleForSelector(cssRoot, selector) {
  const rules = rulesForSelector(cssRoot, selector);

  if (rules.length === 0) {
    throw new Error(`Missing CSS rule for ${selector}`);
  }

  return rules.at(-1);
}

function lastRuleForSelectorInMedia(cssRoot, selector, mediaQuery) {
  const compactQuery = mediaQuery.replace(/\s+/g, '');
  const rules = rulesForSelector(cssRoot, selector).filter(rule => (
    rule.parent?.type === 'atrule' &&
    rule.parent.name === 'media' &&
    rule.parent.params.replace(/\s+/g, '') === compactQuery
  ));

  if (rules.length === 0) {
    throw new Error(`Missing CSS rule for ${selector} inside @media ${mediaQuery}`);
  }

  return rules.at(-1);
}

function declarations(rule) {
  const result = {};

  rule.walkDecls(declaration => {
    result[declaration.prop] = declaration.value.trim();
  });

  return result;
}

function cascadedDeclarationsForSelector(cssRoot, selector) {
  return rulesForSelector(cssRoot, selector).reduce(
    (result, rule) => ({ ...result, ...declarations(rule) }),
    {}
  );
}

function lastCustomProperty(cssRoot, property) {
  let value;

  cssRoot.walkDecls(property, declaration => {
    value = declaration.value.trim();
  });

  if (!value) {
    throw new Error(`Missing custom property ${property}`);
  }

  return value;
}

function parseHexColor(value) {
  const hex = value.replace('#', '');

  if (!/^[0-9a-f]{6}$/i.test(hex)) {
    throw new Error(`Expected a six-digit hex color, received ${value}`);
  }

  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16)
  ];
}

function relativeLuminance(rgb) {
  const channels = rgb.map(channel => {
    const value = channel / 255;
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });

  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

function contrastRatio(first, second) {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));

  return (lighter + 0.05) / (darker + 0.05);
}

describe('Stream Monsters public guide visual contract', () => {
  let page;
  let cssRoot;

  beforeAll(() => {
    page = read('streammonsters/index.html');
    cssRoot = postcss.parse(read('css/streammonsters-guide.css'));
  });

  test('wins the public light-only cascade with a scoped dark gaming surface', () => {
    const siteStylesheetIndex = page.indexOf('/css/site-v2.css');
    const guideStylesheetIndex = page.indexOf('/css/streammonsters-guide.css');
    const bodyStyles = declarations(
      lastRuleForSelector(cssRoot, 'body.site-v2.streammonsters-guide')
    );
    const mainStyles = declarations(
      lastRuleForSelector(cssRoot, 'body.site-v2.streammonsters-guide main')
    );

    expect(page).toContain('<body class="site-v2 streammonsters-guide">');
    expect(siteStylesheetIndex).toBeGreaterThan(-1);
    expect(guideStylesheetIndex).toBeGreaterThan(siteStylesheetIndex);
    expect(bodyStyles.background).toBe('#071124');
    expect(bodyStyles.color).toBe('var(--sm-ink)');
    expect(mainStyles.background).toContain('#071124');
    expect(mainStyles.background).not.toBe('transparent');
  });

  test('keeps display, lead, and arena copy readable on the dark surfaces', () => {
    const ink = parseHexColor(lastCustomProperty(cssRoot, '--sm-ink'));
    const muted = parseHexColor(lastCustomProperty(cssRoot, '--sm-muted'));
    const pageBackground = parseHexColor('#071124');
    const heroTitleStyles = declarations(lastRuleForSelector(cssRoot, '.sm-hero h1'));
    const sectionTitleStyles = declarations(lastRuleForSelector(cssRoot, '.sm-section h2'));
    const leadStyles = declarations(lastRuleForSelector(cssRoot, '.sm-lead'));
    const arenaCopyStyles = declarations(lastRuleForSelector(cssRoot, '.sm-arena-step span'));

    expect(contrastRatio(ink, pageBackground)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(muted, pageBackground)).toBeGreaterThanOrEqual(7);
    expect(heroTitleStyles.color).toBe('var(--sm-ink)');
    expect(sectionTitleStyles.color).toBe('var(--sm-ink)');
    expect(leadStyles.color).toBe('var(--sm-muted)');
    expect(arenaCopyStyles.color).toBe('var(--sm-muted)');
  });

  test('keeps the sticky guide navigation swipeable without a visible scrollbar', () => {
    const scrollerStyles = declarations(lastRuleForSelector(cssRoot, '.sm-toc .container'));
    const scrollbarStyles = declarations(
      lastRuleForSelector(cssRoot, '.sm-toc .container::-webkit-scrollbar')
    );
    const linkStyles = declarations(lastRuleForSelector(cssRoot, '.sm-toc a'));

    expect(scrollerStyles['overflow-x']).toBe('auto');
    expect(scrollerStyles['overflow-y']).toBe('hidden');
    expect(scrollerStyles['scrollbar-width']).toBe('none');
    expect(scrollerStyles['-ms-overflow-style']).toBe('none');
    expect(scrollerStyles['-webkit-overflow-scrolling']).toBe('touch');
    expect(scrollbarStyles.display).toBe('none');
    expect(linkStyles.display).toBe('inline-flex');
    expect(linkStyles['align-items']).toBe('center');
    expect(Number.parseFloat(linkStyles['min-height'])).toBeGreaterThanOrEqual(44);
  });

  test('uses touch-sized controls and monster cards that become a readable mobile list', () => {
    const languageButtonStyles = declarations(
      lastRuleForSelector(cssRoot, '.sm-language button')
    );
    const filterButtonStyles = declarations(
      lastRuleForSelector(cssRoot, '.sm-filter button')
    );
    const baseDexStyles = declarations(
      rulesForSelector(cssRoot, '.sm-dex').find(rule => rule.parent?.type === 'root')
    );
    const mobileDexStyles = declarations(
      lastRuleForSelectorInMedia(cssRoot, '.sm-dex', '(max-width:530px)')
    );

    for (const buttonStyles of [languageButtonStyles, filterButtonStyles]) {
      expect(buttonStyles.display).toBe('inline-flex');
      expect(buttonStyles['align-items']).toBe('center');
      expect(buttonStyles['justify-content']).toBe('center');
      expect(Number.parseFloat(buttonStyles['min-height'])).toBeGreaterThanOrEqual(44);
    }

    expect(baseDexStyles['grid-template-columns']).toBe(
      'repeat(auto-fit,minmax(min(17rem,100%),1fr))'
    );
    expect(mobileDexStyles['grid-template-columns']).toBe('1fr');
  });

  test('gives every evolution stage a readable touch-sized disclosure row', () => {
    const stageStyles = declarations(lastRuleForSelector(cssRoot, '.sm-evolution-stage'));
    const summaryStyles = declarations(
      lastRuleForSelector(cssRoot, '.sm-evolution-stage>summary')
    );
    const imageStyles = declarations(
      lastRuleForSelector(cssRoot, '.sm-monster .sm-evolution-image')
    );
    const labelStyles = declarations(lastRuleForSelector(cssRoot, '.sm-evolution-label'));

    expect(stageStyles['min-width']).toBe('0');
    expect(stageStyles.overflow).toBe('hidden');
    expect(summaryStyles.display).toBe('grid');
    expect(summaryStyles['grid-template-columns']).toMatch(/minmax\(0,1fr\)/);
    expect(summaryStyles['align-items']).toBe('center');
    expect(summaryStyles.cursor).toBe('pointer');
    expect(Number.parseFloat(summaryStyles['min-height'])).toBeGreaterThanOrEqual(44);
    expect(Number.parseFloat(imageStyles.width)).toBeLessThanOrEqual(64);
    expect(imageStyles['object-fit']).toBe('contain');
    expect(labelStyles['min-width']).toBe('0');
    expect(labelStyles['overflow-wrap']).toBe('break-word');
  });

  test('lays out A/B/C skill rows without clipping localized names or effects', () => {
    const stagesStyles = cascadedDeclarationsForSelector(cssRoot, '.sm-evolution-stages');
    const skillsStyles = cascadedDeclarationsForSelector(cssRoot, '.sm-stage-skills');
    const skillStyles = cascadedDeclarationsForSelector(cssRoot, '.sm-stage-skill');
    const nameStyles = declarations(lastRuleForSelector(cssRoot, '.sm-skill-name'));
    const effectStyles = declarations(lastRuleForSelector(cssRoot, '.sm-skill-effect'));

    expect(stagesStyles['min-width']).toBe('0');
    expect(skillsStyles['min-width']).toBe('0');
    expect(skillStyles.display).toBe('grid');
    expect(skillStyles['grid-template-columns']).toMatch(/minmax\(0,1fr\)/);
    expect(skillStyles['min-width']).toBe('0');
    for (const copyStyles of [nameStyles, effectStyles]) {
      expect(copyStyles['min-width']).toBe('0');
      expect(copyStyles['overflow-wrap']).toBe('break-word');
    }
    expect(nameStyles.color).toBe('var(--sm-ink)');
    expect(effectStyles.color).toBe('var(--sm-muted)');
    expect(Number.parseFloat(effectStyles['line-height'])).toBeGreaterThanOrEqual(1.4);
  });
});
