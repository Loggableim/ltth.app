'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const overlayPath = path.join(
  __dirname,
  '..',
  'plugins',
  'interactive-story',
  'overlay.html'
);

function createOverlayHarness(storyMode = 'dnd', initialParticipants = [], isLocalOverlay = true) {
  const source = fs.readFileSync(overlayPath, 'utf8');
  const dom = new JSDOM(source, {
    url: 'http://127.0.0.1/interactive-story/overlay?edit=1',
    runScripts: 'outside-only'
  });
  const { window } = dom;
  const handlers = new Map();

  window.io = () => ({
    on: (eventName, handler) => handlers.set(eventName, handler),
    emit: jest.fn()
  });
  window.i18n = { t: (key) => ({
    'plugins.interactive-story.story_studio.players.title': 'Party',
    'plugins.interactive-story.story_studio.players.empty': 'No players',
    'plugins.interactive-story.runtime.participants.role': 'Role',
    'plugins.interactive-story.runtime.participants.status.active': 'Active',
    'plugins.interactive-story.runtime.participants.status.eliminated': 'Eliminated'
  }[key] || key) };
  window.LTTHPublicOverlayRenderMode = {
    isLocalOverlayHostname: () => isLocalOverlay,
    postJsonLocalOnly: jest.fn().mockResolvedValue({
      skipped: false,
      response: { ok: true }
    })
  };
  window.fetch = jest.fn(async (url) => {
    if (url === '/api/interactive-story/config') {
      return {
        ok: true,
        json: async () => ({
          storyMode,
          overlayResolution: '1920x1080',
          overlayOrientation: 'landscape',
          overlayDisplayMode: 'sentence',
          overlayFontFamily: 'Arial, sans-serif',
          overlayFontSize: 1.3,
          overlayTitleFontSize: 2.5,
          overlayTextColor: '#ffffff',
          overlayTitleColor: '#e94560',
          overlayBackgroundGradient: 'transparent'
        })
      };
    }
    if (url === '/api/interactive-story/participants') {
      return {
        ok: true,
        json: async () => ({
          activeParticipants: initialParticipants,
          eliminatedParticipants: []
        })
      };
    }
    return { ok: false, json: async () => ({}) };
  });
  window.HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue(undefined);
  window.HTMLMediaElement.prototype.pause = jest.fn();
  window.HTMLMediaElement.prototype.load = jest.fn();

  const mainScript = Array.from(source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))
    .map((match) => match[1])
    .find((script) => script.includes('const socket = io();'));
  window.eval(mainScript);

  return { dom, handlers, window };
}

async function flushPromises() {
  await new Promise((resolve) => setImmediate(resolve));
  await Promise.resolve();
}

describe('Interactive Story D&D participant overlay', () => {
  test('renders participant roles and status safely in a dedicated draggable roster', async () => {
    const { dom, handlers, window } = createOverlayHarness('dnd');
    await flushPromises();

    handlers.get('story:dnd-participants-updated')([
      {
        username: '<img src=x onerror="window.__unsafe = true">Alice',
        roleName: 'Mage',
        status: 'active'
      },
      {
        username: 'Bob',
        roleName: 'Guardian',
        status: 'eliminated'
      }
    ]);

    const roster = window.document.getElementById('participantRoster');
    expect(roster).not.toBeNull();
    expect(roster.dataset.element).toBe('participants');
    expect(roster.classList).toContain('active');
    expect(window.document.getElementById('choiceContainer').dataset.element).toBeUndefined();
    expect(roster.textContent).toContain('<img src=x onerror="window.__unsafe = true">Alice');
    expect(roster.textContent).toContain('Mage');
    expect(roster.textContent).toContain('Active');
    expect(roster.textContent).toContain('Bob');
    expect(roster.textContent).toContain('Guardian');
    expect(roster.textContent).toContain('Eliminated');
    expect(roster.querySelector('img')).toBeNull();
    expect(window.__unsafe).toBeUndefined();

    dom.window.close();
  });

  test('keeps the participant roster hidden in classic mode', async () => {
    const { dom, handlers, window } = createOverlayHarness('classic');
    await flushPromises();

    handlers.get('story:dnd-participants-updated')([
      { username: 'Alice', roleName: 'Mage', status: 'active' }
    ]);

    expect(window.document.getElementById('participantRoster').classList).not.toContain('active');

    dom.window.close();
  });

  test('loads active participant snapshot after local D&D configuration', async () => {
    const initialParticipants = [
      { username: 'Alice', roleName: 'Mage', status: 'active' }
    ];
    const { dom, window } = createOverlayHarness('dnd', initialParticipants);
    await flushPromises();

    expect(window.fetch).toHaveBeenCalledWith('/api/interactive-story/participants');
    const roster = window.document.getElementById('participantRoster');
    expect(roster.classList).toContain('active');
    expect(roster.textContent).toContain('Alice');
    expect(roster.textContent).toContain('Mage');

    dom.window.close();
  });

  test('keeps the D&D roster hidden and local-only on public hosts', async () => {
    const { dom, window } = createOverlayHarness('dnd', [], false);
    await flushPromises();

    expect(window.document.getElementById('participantRoster').classList).not.toContain('active');
    expect(window.fetch).not.toHaveBeenCalledWith('/api/interactive-story/participants');

    dom.window.close();
  });

  test.each(['de', 'en', 'es', 'fr'])('provides participant role and status labels in %s', (locale) => {
    const translations = JSON.parse(fs.readFileSync(path.join(
      __dirname,
      '..',
      'plugins',
      'interactive-story',
      'locales',
      `${locale}.json`
    ), 'utf8')).plugins['interactive-story'].runtime.participants;

    expect(translations.role).toEqual(expect.any(String));
    expect(translations.status.active).toEqual(expect.any(String));
    expect(translations.status.eliminated).toEqual(expect.any(String));
  });
});
