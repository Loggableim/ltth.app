const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'plugins', 'weather-control', 'ui.html'),
  'utf8'
);

test('keeps weather configuration loading safe when optional command markup is absent', () => {
  expect(source).toContain("const displayWeather = document.getElementById('displayCmdWeather');");
  expect(source).toContain("if (displayWeather) displayWeather.textContent");
  expect(source).toContain("if (displayList) displayList.textContent");
  expect(source).toContain("if (displayStop) displayStop.textContent");
});

test('finds the effect grid even when the translated heading is not available', () => {
  expect(source).toContain("?.querySelector('.grid') || document.querySelector('.card-body > .grid')");
});
