'use strict';

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const chatRuntime = require('../plugins/streamalchemy/streammonsters-chat-view');

function fixture({
  durationMs = 12_000,
  onWait = null
} = {}) {
  const dom = new JSDOM(`
    <!doctype html>
    <body>
      <section id="chat-detail" data-placement="upper"></section>
      <div id="chat-card"></div>
    </body>
  `);
  const waits = [];
  const snapshots = [];
  const detail = dom.window.document.getElementById('chat-detail');
  const compact = dom.window.document.getElementById('chat-card');
  const labels = {
    viewer: 'Viewer',
    collectionTitle: "{viewer}'s monsters",
    collectionCount: '{count} monsters',
    collectionPage: 'Page {page}/{pages}',
    collectionEmpty: 'No monsters yet',
    monsterCard: 'Monster card',
    level: 'Level {level}',
    xp: '{xp} XP',
    mastery: 'Mastery {points}',
    evolution: 'Evolution {stage}',
    vitality: 'Vitality',
    might: 'Might',
    guard: 'Guard',
    agility: 'Agility',
    eggWait: 'Egg is incubating',
    eggWaitRemaining: 'Ready in {remaining}',
    eggQueued: 'Egg is queued',
    eggQueuePosition: 'Queue position {position}',
    eggQueuePending: 'Incubation starts when a slot opens',
    commandUnavailable: 'Command result unavailable',
    stealOwnReadyEgg: 'Hatch your ready egg first with {command} {slot}.'
  };
  const translate = (key, params = {}) => {
    const template = labels[key] || key;
    return template.replace(/\{(\w+)\}/g, (match, name) => (
      Object.prototype.hasOwnProperty.call(params, name) ? params[name] : match
    ));
  };
  const view = chatRuntime.createChatView({
    document: dom.window.document,
    detailElement: detail,
    compactElement: compact,
    translate,
    elementLabel: value => String(value || 'Unknown'),
    personalityLabel: value => String(value || 'Unknown'),
    getNotificationDurationMs: () => durationMs,
    wait: async milliseconds => {
      waits.push(milliseconds);
      snapshots.push({
        kind: detail.dataset.kind || compact.dataset.kind || '',
        page: detail.dataset.page || '',
        detailText: detail.textContent,
        detailHtml: detail.outerHTML,
        compactText: compact.textContent,
        cards: [...detail.querySelectorAll('.sm-collection-card')].map(card => card.textContent)
      });
      if (onWait) await onWait({ milliseconds, detail, compact });
    }
  });
  return { dom, view, waits, snapshots, detail, compact };
}

function monster(index, overrides = {}) {
  return {
    name: `Monster ${index}`,
    element: index % 2 ? 'Ember' : 'Tide',
    personality: 'Brave',
    level: index,
    xp: index * 10,
    templateId: index % 2 ? 'ashfang' : 'ripple',
    evolutionStage: 1,
    imageUrl: `/plugins/streamalchemy/assets/streammonsters/furry/${index % 2 ? 'ashfang' : 'ripple'}.png`,
    stats: {
      vitality: 7 + index,
      might: 8 + index,
      guard: 6 + index,
      agility: 7
    },
    ...overrides
  };
}

describe('Stream Monsters 1.5 OBS chat presentation', () => {
  test('wires the safe upper chat view and recent-event replay into the OBS overlay', () => {
    const html = fs.readFileSync(
      path.join(process.cwd(), 'plugins', 'streamalchemy', 'streammonsters-overlay.html'),
      'utf8'
    );
    const showChatSource = html.match(/const showChat = async data => \{([\s\S]*?)\n  \};/)?.[1] || '';
    const showCardSource = html.slice(
      html.indexOf('const showCard = async'),
      html.indexOf('const showHype = async')
    );

    expect(html).toContain('id="chat-detail"');
    expect(html).toContain('data-placement="upper"');
    expect(html).toContain('streammonsters-chat-view.js');
    expect(html).toContain('createChatView');
    expect(html).toContain('replayableRecentEvents');
    expect(html).toMatch(/\.sm-collection-image,\.sm-monster-image\s*\{[\s\S]*?max-height:100%/);
    expect(html).toContain('#card[data-presentation="hatch"]');
    expect(html).toMatch(/type === 'egg_hatched'[\s\S]*?presentation:'hatch'/);
    expect(html).toMatch(/type === 'monster_evolved'[\s\S]*?presentation:'hatch'/);
    expect(showCardSource).toContain('presentation = null');
    expect(showCardSource).toContain("card.dataset.presentation = 'hatch'");
    expect(showCardSource).toMatch(
      /card\.classList\.remove\('visible'\)[\s\S]*?card\.removeAttribute\('data-presentation'\)/
    );
    expect(html).toContain('/api/streammonsters/overlay/heartbeat');
    expect(html).toContain('overlayHeartbeatPayload');
    expect(html).toMatch(/window\.setInterval\(sendOverlayHeartbeat,\s*5_000\)/);
    expect(html).toContain("window.addEventListener('pagehide', stopOverlayLifecycle");
    expect(html).toContain("window.addEventListener('beforeunload', stopOverlayLifecycle");
    expect(html).toMatch(/if \(overlayLifecycleStopped\) return;/);
    expect(html).not.toContain('value(data?.userId');
    expect(showChatSource).not.toContain('data?.userId');
    expect(showChatSource).not.toContain('const userId');
  });

  test('provides a resettable four-stat evolution panel and upper Elemental Hour card', () => {
    const html = fs.readFileSync(
      path.join(process.cwd(), 'plugins', 'streamalchemy', 'streammonsters-overlay.html'),
      'utf8'
    );
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const statRows = [...document.querySelectorAll(
      '#evolution-stats [data-evolution-stat]'
    )];
    const presentSource = html.slice(
      html.indexOf('const present = async'),
      html.indexOf('const presentWithPreview = async')
    );

    expect(statRows.map(row => row.dataset.evolutionStat)).toEqual([
      'vitality',
      'might',
      'guard',
      'agility'
    ]);
    expect(document.getElementById('evolution-skill')).not.toBeNull();
    expect(document.getElementById('evolution-skill-icon')).not.toBeNull();
    expect(document.getElementById('evolution-skill-title')).not.toBeNull();
    expect(document.getElementById('evolution-skill-effect')).not.toBeNull();
    expect(presentSource).toMatch(
      /buildElementalHourEventPresentation\(type, data\)[\s\S]*?if \(hour\)[\s\S]*?return showCard/
    );
    expect(presentSource).toContain("'elementalHourExplanation'");
    expect(presentSource).toMatch(/if \(type === 'stream_started'\) return showToast/);
    expect(presentSource.indexOf('if (hour)')).toBeLessThan(
      presentSource.indexOf("if (type === 'stream_started') return showToast")
    );
    expect(presentSource.match(/presentation:hour\.presentation/g)).toHaveLength(1);
    expect(presentSource).toMatch(
      /type === 'monster_evolved'[\s\S]*?buildEvolutionPresentation[\s\S]*?evolution/
    );
    expect(html).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?#evolution-panel/
    );
  });

  test.each(['de', 'en', 'es', 'fr'])('localizes the upper chat views in %s', locale => {
    const translations = JSON.parse(fs.readFileSync(
      path.join(process.cwd(), 'plugins', 'streamalchemy', 'locales', `${locale}.json`),
      'utf8'
    )).plugins.streamalchemy.ui.monsters;

    for (const key of [
      'chatViewer',
      'chatCollectionTitle',
      'chatCollectionCount',
      'chatCollectionPage',
      'chatMonsterCard',
      'chatLevel',
      'chatXp',
      'chatMastery',
      'chatEvolution',
      'chatStatVitality',
      'chatStatMight',
      'chatStatGuard',
      'chatStatAgility',
      'chatEggWait',
      'chatEggWaitRemaining',
      'chatEggQueued',
      'chatEggQueuePosition',
      'chatEggQueuePending'
    ]) {
      expect(translations[key]).toEqual(expect.any(String));
      expect(translations[key].trim()).not.toBe('');
    }
    expect(translations.chatCollectionTitle).toContain('{viewer}');
    expect(translations.chatCollectionPage).toContain('{page}');
    expect(translations.chatEggWaitRemaining).toContain('{remaining}');
  });

  test.each([
    [{ displayName: 'Public Name', nickname: 'Nick', username: 'User', userId: 'canonical-secret' }, 'Public Name'],
    [{ nickname: 'Nick', username: 'User', userId: 'canonical-secret' }, 'User'],
    [{ nickname: 'Nick', userId: 'canonical-secret' }, 'Nick'],
    [{ username: 'User', userId: 'canonical-secret' }, 'User'],
    [{ userId: 'canonical-secret' }, 'Viewer']
  ])('uses a public display label and never exposes the canonical user id', async (identity, expected) => {
    const { view, snapshots } = fixture();

    await view.show({
      ...identity,
      command: 'rank',
      result: { status: 'rank', messageKey: 'commandUnavailable' }
    });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].compactText).toContain(expected);
    expect(snapshots[0].compactText).not.toContain('canonical-secret');
    expect(snapshots[0].detailHtml).not.toContain('canonical-secret');
  });

  test.each([1, 6])('shows %i owned monster cards together in the upper collection view', async count => {
    const { view, waits, snapshots } = fixture();
    const monsters = Array.from({ length: count }, (_, index) => monster(index + 1));

    await view.show({
      displayName: 'Collector',
      result: { status: 'inventory', monsters }
    });

    expect(waits).toEqual([12_000]);
    expect(snapshots[0].kind).toBe('collection');
    expect(snapshots[0].cards).toHaveLength(count);
    expect(snapshots[0].detailText).toContain("Collector's monsters");
    expect(snapshots[0].detailHtml).toContain('data-placement="upper"');
    expect(snapshots[0].detailHtml).toContain(`data-count="${count}"`);
  });

  test('renders the hatch-first hint for a viewer who tries to steal with a ready egg', async () => {
    const { view, snapshots } = fixture();

    await view.show({
      displayName: 'Egg Keeper',
      result: {
        status: 'own_ready_egg',
        messageKey: 'stealOwnReadyEgg',
        params: { command: '!hatch', slot: 2 }
      }
    });

    expect(snapshots[0].compactText)
      .toContain('Hatch your ready egg first with !hatch 2.');
  });

  test('rotates collections larger than six as readable six-card pages', async () => {
    const { view, waits, snapshots } = fixture({ durationMs: 8_000 });
    const monsters = Array.from({ length: 7 }, (_, index) => monster(index + 1));

    await view.show({
      displayName: 'Collector',
      result: { status: 'inventory', monsters }
    });

    expect(waits).toEqual([8_000, 8_000]);
    expect(snapshots.map(snapshot => snapshot.cards.length)).toEqual([6, 1]);
    expect(snapshots[0].cards.join(' ')).toContain('Monster 1');
    expect(snapshots[1].cards.join(' ')).toContain('Monster 7');
    expect(snapshots.map(snapshot => snapshot.page)).toEqual(['1', '2']);
  });

  test('renders a large upper furry monster card with public stats only', async () => {
    const { view, snapshots } = fixture();
    const publicMonster = monster(4, {
      name: 'Sparkfin',
      element: 'Volt',
      personality: 'Curious',
      templateId: 'pulse',
      evolutionStage: 2,
      imageUrl: 'https://private-provider.invalid/secret.png',
      seed: 'private-seed',
      visual_key: 'private-visual-key',
      monster_id: 'private-monster-id'
    });

    await view.show({
      displayName: 'Mark',
      userId: 'private-user-id',
      result: {
        status: 'monster',
        monster: publicMonster,
        card: {
          type: 'monster',
          placement: 'upper',
          monster: publicMonster,
          mastery: { points: 27 }
        }
      }
    });

    const snapshot = snapshots[0];
    expect(snapshot.kind).toBe('monster');
    expect(snapshot.detailText).toEqual(expect.stringContaining('Sparkfin'));
    expect(snapshot.detailText).toEqual(expect.stringContaining('Vitality'));
    expect(snapshot.detailText).toEqual(expect.stringContaining('Might'));
    expect(snapshot.detailText).toEqual(expect.stringContaining('Guard'));
    expect(snapshot.detailText).toEqual(expect.stringContaining('Agility'));
    expect(snapshot.detailHtml).toContain(
      '/plugins/streamalchemy/assets/streammonsters/furry/evolution/volt/pulse-stage2.webp'
    );
    for (const secret of [
      'private-user-id',
      'private-seed',
      'private-visual-key',
      'private-monster-id',
      'private-provider.invalid'
    ]) {
      expect(snapshot.detailHtml).not.toContain(secret);
    }
  });

  test('shows an exact incubating wait time in a compact upper-third card', async () => {
    const { view, snapshots } = fixture();

    await view.show({
      displayName: 'Hatcher',
      result: {
        status: 'egg_not_ready',
        wait: {
          slot: 2,
          state: 'incubating',
          remainingMs: 95_000,
          queuePosition: 0
        }
      }
    });

    expect(snapshots[0].kind).toBe('egg-wait');
    expect(snapshots[0].detailText).toContain('01:35');
    expect(snapshots[0].detailHtml).toContain('data-placement="upper-third"');
    expect(snapshots[0].detailHtml).toContain('data-size="compact"');
  });

  test('shows queued position without inventing a hatch countdown', async () => {
    const { view, snapshots } = fixture();

    await view.show({
      displayName: 'Hatcher',
      result: {
        status: 'egg_not_ready',
        wait: {
          slot: 4,
          state: 'queued',
          remainingMs: 0,
          queuePosition: 3
        }
      }
    });

    expect(snapshots[0].kind).toBe('egg-wait');
    expect(snapshots[0].detailText).toContain('Queue position 3');
    expect(snapshots[0].detailText).toContain('Incubation starts when a slot opens');
    expect(snapshots[0].detailText).not.toMatch(/\b00:00\b/);
  });

  test('hides the art frame entirely for generic cards without an image', () => {
    const html = fs.readFileSync(
      path.join(process.cwd(), 'plugins', 'streamalchemy', 'streammonsters-overlay.html'),
      'utf8'
    );
    expect(html).toMatch(/#card\.no-art #art-wrap\s*\{\s*display:none/);
    expect(html).toContain("card.classList.toggle('no-art', !page.imageUrl)");
  });
});
