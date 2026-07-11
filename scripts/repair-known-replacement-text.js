#!/usr/bin/env node

const fs = require('fs');

function replaceIn(file, replacements) {
  let source = fs.readFileSync(file, 'utf8');
  const original = source;
  for (const [from, to] of replacements) source = source.split(from).join(to);
  if (source !== original) fs.writeFileSync(file, source, 'utf8');
}

const replacement = '\u00ef\u00bf\u00bd';
replaceIn('app/plugins/stt-ticker/ui.html', [
  [`hinzuf${replacement}gen`, 'hinzuf&uum l;gen'.replace(' ', '')],
  [`Overlay ${replacement}ffnen`, 'Overlay &ouml;ffnen'],
  [`${replacement}berschreibt`, '&Uuml;berschreibt'],
  [`Modell w${replacement}hlen`, 'Modell w&auml;hlen'],
  [`Sprache hinzuf${replacement}gen`, 'Sprache hinzuf&uuml;gen'],
  [`Espa${replacement}ol`, 'Espa\\u00f1ol'],
  [`Fran${replacement}ais`, 'Fran\\u00e7ais'],
  [`Portugu${replacement}s`, 'Portugu\\u00eas'],
  [`T${replacement}rk${replacement}e`, 'T\\u00fcrk\\u00e7e'],
  [`Ce${replacement}tina`, 'Ce\\u010dtina'],
  [`Rom${replacement}na`, 'Rom\\u00e2na'],
  [`Sprache w${replacement}hlen...`, 'Sprache w\\u00e4hlen...'],
  [`bef${replacement}llen`, 'bef\\u00fcllen'],
  [`g${replacement}ltig`, 'g\\u00fcltig'],
  [`Ung${replacement}ltig`, 'Ung\\u00fcltig'],
  [`<span class="remove">${replacement}</span>`, '<span class="remove">&times;</span>']
]);

replaceIn('app/public/js/webgpu-emoji-rain-ui.js', [
  ['Test l\ufffduft', 'Test l\u00e4uft'],
  ['w\ufffdhle', 'w\u00e4hle'],
  ['L\ufffdschen', 'L\u00f6schen'],
  ['l\ufffdschen', 'l\u00f6schen'],
  ['gel\ufffdscht', 'gel\u00f6scht'],
  ['f\ufffdr', 'f\u00fcr'],
  ['deleteBtn.textContent = \'\ufffd\';', 'deleteBtn.textContent = \'\u00d7\';'],
  ["deleteBtn.textContent = '??? L\u00f6schen';", "deleteBtn.textContent = '\u00d7 L\u00f6schen';"]
]);

console.log('Repaired known replacement-character strings.');
