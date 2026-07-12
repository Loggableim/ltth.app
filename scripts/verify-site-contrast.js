'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'css', 'site-v2.css'), 'utf8');
const errors = [];

if (!/body\.site-v2 \.beta-notice a\s*\{[^}]*color:\s*#fff\s*!important/i.test(css)) {
  errors.push('Beta notice links must use white text on the dark announcement background.');
}
if (!/body\.site-v2 \.beta-notice a:hover[^}]*color:\s*#fff\s*!important/i.test(css)) {
  errors.push('Beta notice link hover state must retain the high-contrast white text.');
}
if (!/body\.site-v2 \.beta-close[^}]*color:\s*#fff/i.test(css)) {
  errors.push('Beta notice close button must remain visible on the dark announcement background.');
}
if (!/@media \(max-width: 768px\)[\s\S]*?body\.site-v2 \.nav-menu \.nav-link[^}]*color:\s*#fff\s*!important/i.test(css)) {
  errors.push('Mobile site-v2 navigation links must use white text on the dark drawer.');
}
if (!/@media \(max-width: 768px\)[\s\S]*?body\.site-v2 \.nav-menu \.lang-dropdown-toggle[^}]*color:\s*#fff\s*!important/i.test(css)) {
  errors.push('Mobile site-v2 language control must use white text on the dark drawer.');
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('OK: announcement-banner controls have an explicit high-contrast treatment.');
}
