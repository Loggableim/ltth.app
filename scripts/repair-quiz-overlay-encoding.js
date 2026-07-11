const fs = require('fs');

const file = 'app/plugins/quiz-show/quiz_show_overlay.js';
let source = fs.readFileSync(file).toString('utf8');
source = source
  .replace('Vollst�ndig', 'Vollständig')
  .replace('sandbox) � use default', 'sandbox) — use default')
  .replace('positions � the layout', 'positions — the layout')
  .replace('>�</div>', '>❓</div>')
  .replace('Bitte f�gen Sie', 'Bitte fügen Sie');
fs.writeFileSync(file, source, 'utf8');
console.log('Repaired quiz overlay encoding.');
