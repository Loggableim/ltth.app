'use strict';

const fs = require('fs');
const path = require('path');

const navigationCss = fs.readFileSync(path.join(__dirname, '../public/css/navigation.css'), 'utf8');
const themeCss = fs.readFileSync(path.join(__dirname, '../public/css/themes.css'), 'utf8');

describe('dashboard responsive accessibility styles', () => {
  test('closed mobile sidebar is removed from focus navigation until its slide-out completes', () => {
    expect(navigationCss).toMatch(/@media\s*\(max-width:\s*1024px\)\s*\{[\s\S]*?\.sidebar\s*\{[^}]*visibility:\s*hidden;[^}]*transition:\s*transform\s+var\(--transition-speed\)\s+ease,\s*visibility\s+0s\s+linear\s+var\(--transition-speed\);[\s\S]*?\.sidebar\.mobile-open\s*\{[^}]*visibility:\s*visible;[^}]*transition-delay:\s*0s;/);
  });

  test('mobile theme dropdown is bounded by the viewport instead of its narrow toolbar trigger', () => {
    expect(themeCss).toMatch(/@media\s*\(max-width:\s*480px\)\s*\{\s*\.theme-dropdown\s*\{\s*box-sizing:\s*border-box;\s*width:\s*min\(230px,\s*calc\(100vw\s*-\s*1rem\)\);\s*min-width:\s*0;/);
  });
});
