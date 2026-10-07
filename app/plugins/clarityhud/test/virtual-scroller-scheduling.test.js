'use strict';

const { JSDOM } = require('jsdom');
const VirtualScroller = require('../lib/virtual-scroller');

describe('Original VirtualScroller scheduling and item identity', () => {
  let dom;
  let originals;
  let frames;
  let now;
  let nextId;
  let scroller;

  beforeEach(() => {
    originals = Object.fromEntries(['document', 'requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver'].map(key => [key, global[key]]));
    dom = new JSDOM('<div id="feed"></div>');
    global.document = dom.window.document;
    frames = new Map(); now = 100; nextId = 0;
    global.requestAnimationFrame = callback => { const id = ++nextId; frames.set(id, callback); return id; };
    global.cancelAnimationFrame = id => frames.delete(id);
    global.ResizeObserver = undefined;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    scroller = new VirtualScroller(document.getElementById('feed'), {
      itemHeight: 20,
      renderCallback: item => { const element = document.createElement('div'); element.textContent = item.text; return element; }
    });
    scroller.viewportHeight = 100;
  });

  afterEach(() => {
    scroller.destroy();
    jest.restoreAllMocks();
    dom.window.close();
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete global[key]; else global[key] = value;
    }
  });

  function runFrame(at) {
    now = at;
    const [id, callback] = frames.entries().next().value;
    frames.delete(id);
    callback();
  }

  test('early throttled frame retains pending work until a later eligible frame', () => {
    scroller.setItems([]);
    runFrame(100);
    scroller.setItems([{ text: 'New event' }]);
    runFrame(110);
    expect(scroller.content.textContent).toBe('');
    expect(frames.size).toBe(1);
    runFrame(120);
    expect(scroller.content.textContent).toBe('New event');
    expect(frames.size).toBe(0);
  });

  test('replacing data at the same index and count renders the replacement', () => {
    scroller.setItems([{ text: 'A' }]); runFrame(100);
    scroller.setItems([{ text: 'B' }]); runFrame(120);
    expect(scroller.content.textContent).toBe('B');
  });

  test('destroy cancels a deferred frame and retained callback cannot schedule or render', () => {
    scroller.setItems([]); runFrame(100);
    scroller.setItems([{ text: 'Pending' }]);
    const retained = frames.values().next().value;
    scroller.destroy();
    expect(frames.size).toBe(0);
    now = 110; retained();
    scroller.requestUpdate();
    expect(frames.size).toBe(0);
    expect(scroller.content.textContent).toBe('');
    expect(scroller.viewport.parentNode).toBeNull();
  });
});
