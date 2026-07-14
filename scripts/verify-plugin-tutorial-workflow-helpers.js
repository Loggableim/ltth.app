'use strict';

const assert = require('assert');
const { step } = require('./plugin-tutorial-workflow-helpers');

const copy = {
  de: { title: 'Öffnen', body: 'Öffne die Ansicht.', expected: 'Die Ansicht ist sichtbar.', alt: 'Die geöffnete Ansicht.' },
  en: { title: 'Open', body: 'Open the view.', expected: 'The view is visible.', alt: 'The open view.' },
  es: { title: 'Abrir', body: 'Abre la vista.', expected: 'La vista es visible.', alt: 'La vista abierta.' },
  fr: { title: 'Ouvrir', body: 'Ouvrez la vue.', expected: 'La vue est visible.', alt: 'La vue ouverte.' }
};

const workflowStep = step('open-view', '/example/ui', '#app', copy);
assert.equal(workflowStep.copy.en.title, 'Open');
assert.equal(workflowStep.capture.expected.fr, 'La vue est visible.');
assert.deepEqual(workflowStep.capture.operations, [{ type: 'inspect', selector: '#app' }]);

console.log('plugin tutorial workflow helper checks passed');
