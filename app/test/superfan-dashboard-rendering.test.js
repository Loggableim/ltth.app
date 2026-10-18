const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '../../../../..');
const source = fs.readFileSync(path.join(__dirname, '../public/js/dashboard.js'), 'utf8');
const body = source.slice(source.indexOf('function addEventToLog('), source.indexOf('// ========== STATS MENU NAVIGATION =========='));
function setup(locale) {
  const dom = new JSDOM('<table><tbody id="event-log"></tbody></table>');
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../locales/' + locale + '.json'), 'utf8'));
  dom.window.i18n = { t: key => key.split('.').reduce((value, part) => value && value[part], catalog) || key };
  const track = jest.fn();
  const ctx = vm.createContext({ document: dom.window.document, window: dom.window, Date, trackEventForStatsMenu: track });
  vm.runInContext(body, ctx);
  return { dom, add: ctx.addEventToLog, track };
}
test.each(['de', 'en', 'es', 'fr'])('original DOM rendering localizes SuperFan without role claim %s', locale => {
  const fixture = setup(locale);
  fixture.add('superfan', { username: '<img src=x onerror="boom()">', superFanEventType: 'join' });
  const row = fixture.dom.window.document.querySelector('tr');
  expect(row.children[1].textContent).toBe('⭐ SuperFan');
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../locales/' + locale + '.json'), 'utf8'));
  expect(row.children[3].textContent).toBe(catalog.events.superfan_join);
  expect(row.querySelector('img')).toBeNull();
  expect(row.children[2].textContent).toContain('<img src=x');
  fixture.add('superfan', { username: 'Viewer', superFanEventType: 'became' });
  expect(fixture.dom.window.document.querySelector('tr').children[3].textContent).toBe(catalog.events.superfan_event);
  fixture.dom.window.close();
});
test.each(['chat', 'gift', 'unknown<script>'])('username, details and type are text only: %s', type => {
  const fixture = setup('en');
  fixture.add(type, { username: '<svg onload="boom()">', message: '<img src=x>', giftName: '<b>Gift</b>', repeatCount: 1, coins: 1, teamMemberLevel: '\"><img src=x>' });
  const row = fixture.dom.window.document.querySelector('tr');
  expect(row.querySelectorAll('svg,img,b,script')).toHaveLength(0);
  expect(row.children).toHaveLength(4);
  expect(row.children[2].querySelector('span').title).toBe('Team Level 0');
  if (type === 'chat') expect(row.children[3].textContent).toBe('<img src=x>');
  if (type === 'gift') expect(row.children[3].textContent).toBe('<b>Gift</b> x1 (1 coins)');
  fixture.dom.window.close();
});
test('safe badge and 100-row cap preserve stats event type and payload', () => {
  const fixture = setup('en');
  const payload = { username: 'Viewer', message: 'plain', teamMemberLevel: 21 };
  for (let i = 0; i < 101; i++) fixture.add('chat', payload);
  expect(fixture.dom.window.document.querySelectorAll('tr')).toHaveLength(100);
  expect(fixture.dom.window.document.querySelector('span').textContent).toBe('💜21');
  expect(fixture.track).toHaveBeenLastCalledWith('chat', payload);
  fixture.dom.window.close();
});
