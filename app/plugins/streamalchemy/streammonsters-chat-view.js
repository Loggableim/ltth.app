(function attachStreamMonstersChatView(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StreamMonstersChatView = api;
}(typeof globalThis === 'object' ? globalThis : this, () => {
  'use strict';

  const ELEMENTS = new Set(['ember', 'tide', 'grove', 'gale', 'volt', 'lunar']);
  const SAFE_ASSET_URL = /^\/plugins\/streamalchemy\/assets\/[a-z0-9/_\-.]+$/i;
  const SAFE_KENNEY_URL = /^\/api\/streammonsters\/art\/kenney-[a-f0-9]{16}\.svg$/i;
  const SAFE_AVATAR_URL = /^\/api\/streammonsters\/avatar\/[a-z0-9_-]{16,1024}$/i;

  function boundedText(input, fallback = '', maximum = 96) {
    const value = String(input ?? '')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim()
      .slice(0, maximum);
    return value || String(fallback ?? '').slice(0, maximum);
  }

  function displayName(payload = {}, fallback = 'Viewer') {
    return boundedText(
      payload.displayName ?? payload.username ?? payload.nickname,
      fallback,
      64
    );
  }

  function safeNumber(input, fallback = 0) {
    const value = Number(input);
    return Number.isFinite(value) ? value : fallback;
  }

  function safeImageUrl(input) {
    const url = boundedText(input, '', 512);
    return SAFE_ASSET_URL.test(url) ||
      SAFE_KENNEY_URL.test(url) ||
      SAFE_AVATAR_URL.test(url)
      ? url
      : '';
  }

  function normalizeOwner(input = {}) {
    const rawName = boundedText(input.displayName, 'Viewer', 64);
    const displayName = rawName === 'Viewer'
      ? rawName
      : `@${rawName.replace(/^@+/, '')}`;
    const fallbackInitials = displayName
      .replace(/^@/, '')
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0])
      .join('')
      .toUpperCase() || '?';
    return {
      displayName,
      avatarUrl: safeImageUrl(input.avatarUrl),
      initials: boundedText(input.initials, fallbackInitials, 2).toUpperCase()
    };
  }

  function templateAsset(monster = {}) {
    const templateId = boundedText(monster.templateId, '', 48).toLowerCase();
    const element = boundedText(monster.element, '', 24).toLowerCase();
    const stage = Math.max(1, Math.min(3, Math.trunc(safeNumber(monster.evolutionStage, 1))));
    if (!/^[a-z0-9-]+$/.test(templateId) || !ELEMENTS.has(element)) return '';
    if (stage === 1) {
      return `/plugins/streamalchemy/assets/streammonsters/furry/${templateId}.png`;
    }
    return `/plugins/streamalchemy/assets/streammonsters/furry/evolution/${element}/${templateId}-stage${stage}.png`;
  }

  function normalizeMonster(input = {}) {
    const stats = input.stats && typeof input.stats === 'object' ? input.stats : {};
    const monster = {
      name: boundedText(input.name, 'Monster', 64),
      element: boundedText(input.element, '', 24),
      personality: boundedText(input.personality, '', 48),
      level: Math.max(1, Math.trunc(safeNumber(input.level, 1))),
      xp: Math.max(0, Math.trunc(safeNumber(input.xp, 0))),
      templateId: boundedText(input.templateId ?? input.template_id, '', 48),
      evolutionStage: Math.max(
        1,
        Math.min(
          3,
          Math.trunc(safeNumber(input.evolutionStage ?? input.evolution_stage, 1))
        )
      ),
      stats: {
        vitality: Math.max(0, Math.trunc(safeNumber(stats.vitality, 0))),
        might: Math.max(0, Math.trunc(safeNumber(stats.might, 0))),
        guard: Math.max(0, Math.trunc(safeNumber(stats.guard, 0))),
        agility: Math.max(0, Math.trunc(safeNumber(stats.agility, 0)))
      }
    };
    monster.imageUrl = safeImageUrl(input.imageUrl ?? input.image_url) || templateAsset(monster);
    return monster;
  }

  function formatRemaining(milliseconds) {
    const totalSeconds = Math.max(0, Math.ceil(safeNumber(milliseconds, 0) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return hours > 0
      ? [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':')
      : [minutes, seconds].map(value => String(value).padStart(2, '0')).join(':');
  }

  function createChatView({
    document,
    detailElement,
    compactElement,
    translate = key => key,
    elementLabel = value => value,
    personalityLabel = value => value,
    getNotificationDurationMs = () => 12_000,
    wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
  } = {}) {
    if (!document || !detailElement || !compactElement) {
      throw new Error('STREAM_MONSTERS_CHAT_VIEW_TARGET_REQUIRED');
    }

    const create = (tagName, className = '', content = '') => {
      const element = document.createElement(tagName);
      if (className) element.className = className;
      if (content !== '') element.textContent = boundedText(content, '', 180);
      return element;
    };
    const duration = () => Math.max(
      8_000,
      Math.min(30_000, safeNumber(getNotificationDurationMs(), 12_000))
    );
    const clear = element => element.replaceChildren();
    const hideCompact = () => {
      compactElement.classList.remove('visible');
      compactElement.removeAttribute('data-kind');
      compactElement.textContent = '';
    };
    const hideDetail = () => {
      detailElement.classList.remove('visible');
      detailElement.removeAttribute('data-kind');
      detailElement.removeAttribute('data-page');
      detailElement.removeAttribute('data-size');
      detailElement.dataset.placement = 'upper';
      clear(detailElement);
    };
    const openDetail = (kind, { size = null, placement = 'upper' } = {}) => {
      hideCompact();
      clear(detailElement);
      detailElement.dataset.kind = kind;
      detailElement.dataset.placement = placement;
      if (size) detailElement.dataset.size = size;
      else detailElement.removeAttribute('data-size');
      detailElement.classList.add('visible');
    };
    const appendImage = (parent, monster, className) => {
      const frame = create('div', `${className}-art`);
      const image = create('img', `${className}-image`);
      image.alt = `${monster.name} · ${elementLabel(monster.element)}`;
      if (monster.imageUrl) image.src = monster.imageUrl;
      image.addEventListener('error', () => {
        image.removeAttribute('src');
        frame.classList.add('image-fallback');
        frame.dataset.element = boundedText(elementLabel(monster.element), 'Monster', 24);
      }, { once: true });
      frame.append(image);
      parent.append(frame);
    };
    const appendHeader = ({ kicker, title, meta = '' }) => {
      const header = create('header', 'sm-chat-detail-header');
      header.append(create('div', 'sm-chat-detail-kicker', kicker));
      header.append(create('h2', 'sm-chat-detail-title', title));
      if (meta) header.append(create('div', 'sm-chat-detail-meta', meta));
      detailElement.append(header);
      return header;
    };
    const collectionCard = (monster, index) => {
      const card = create('article', 'sm-collection-card');
      appendImage(card, monster, 'sm-collection');
      const copy = create('div', 'sm-collection-copy');
      copy.append(create('strong', 'sm-collection-name', monster.name));
      copy.append(create(
        'span',
        'sm-collection-meta',
        `${elementLabel(monster.element)} · ${translate('level', { level: monster.level })}`
      ));
      copy.append(create(
        'span',
        'sm-collection-slot',
        `#${index + 1} · ${translate('evolution', { stage: monster.evolutionStage })}`
      ));
      card.append(copy);
      return card;
    };
    const renderCollectionPage = ({ viewer, monsters, page, totalPages }) => {
      clear(detailElement);
      detailElement.dataset.page = String(page + 1);
      appendHeader({
        kicker: translate('collectionCount', { count: monsters.length }),
        title: translate('collectionTitle', { viewer }),
        meta: translate('collectionPage', { page: page + 1, pages: totalPages })
      });
      const grid = create('div', 'sm-collection-grid');
      const start = page * 6;
      const pageMonsters = monsters.slice(start, start + 6);
      grid.dataset.count = String(pageMonsters.length);
      if (!pageMonsters.length) {
        grid.append(create('div', 'sm-collection-empty', translate('collectionEmpty')));
      } else {
        pageMonsters.forEach((monster, index) => {
          grid.append(collectionCard(monster, start + index));
        });
      }
      detailElement.append(grid);
    };
    const showCollection = async (payload, result) => {
      const viewer = displayName(payload, translate('viewer'));
      const monsters = Array.isArray(result.monsters)
        ? result.monsters.map(normalizeMonster)
        : [];
      const totalPages = Math.max(1, Math.ceil(monsters.length / 6));
      openDetail('collection');
      for (let page = 0; page < totalPages; page += 1) {
        renderCollectionPage({ viewer, monsters, page, totalPages });
        await wait(duration());
      }
      hideDetail();
      return { handled: true, kind: 'collection', pages: totalPages };
    };
    const showMonster = async (payload, result) => {
      const card = result.card && typeof result.card === 'object' ? result.card : {};
      const monster = normalizeMonster(card.monster || result.monster || {});
      const mastery = Math.max(0, Math.trunc(safeNumber(card.mastery?.points, 0)));
      openDetail('monster');
      appendHeader({
        kicker: translate('monsterCard'),
        title: monster.name,
        meta: `${displayName(payload, translate('viewer'))} · ${elementLabel(monster.element)} · ${personalityLabel(monster.personality)}`
      });
      const body = create('div', 'sm-monster-detail');
      appendImage(body, monster, 'sm-monster');
      const copy = create('div', 'sm-monster-copy');
      const progression = create('div', 'sm-monster-progression');
      progression.append(create('strong', '', translate('level', { level: monster.level })));
      progression.append(create('span', '', translate('xp', { xp: monster.xp })));
      progression.append(create('span', '', translate('evolution', { stage: monster.evolutionStage })));
      progression.append(create('span', '', translate('mastery', { points: mastery })));
      copy.append(progression);
      const stats = create('div', 'sm-monster-stats');
      for (const key of ['vitality', 'might', 'guard', 'agility']) {
        const stat = create('div', 'sm-monster-stat');
        stat.append(create('span', '', translate(key)));
        stat.append(create('strong', '', String(monster.stats[key])));
        stats.append(stat);
      }
      copy.append(stats);
      body.append(copy);
      detailElement.append(body);
      await wait(duration());
      hideDetail();
      return { handled: true, kind: 'monster' };
    };
    const showEggWait = async (payload, result) => {
      const waitState = result.wait || result.card || {};
      const queued = String(waitState.state || '').toLowerCase() === 'queued';
      const queuePosition = Math.max(
        0,
        Math.trunc(safeNumber(waitState.queuePosition ?? waitState.queue_position, 0))
      );
      openDetail('egg-wait', {
        size: 'compact',
        placement: 'upper-third'
      });
      appendHeader({
        kicker: displayName(payload, translate('viewer')),
        title: queued ? translate('eggQueued') : translate('eggWait'),
        meta: queued && queuePosition > 0
          ? translate('eggQueuePosition', { position: queuePosition })
          : ''
      });
      const body = create('div', 'sm-egg-wait');
      if (queued) {
        body.append(create('div', 'sm-egg-queue-position', `#${queuePosition || '—'}`));
        body.append(create('p', 'sm-egg-wait-copy', translate('eggQueuePending')));
      } else {
        const remaining = formatRemaining(
          waitState.remainingMs ?? waitState.remaining_ms
        );
        body.append(create('div', 'sm-egg-countdown', remaining));
        body.append(create(
          'p',
          'sm-egg-wait-copy',
          translate('eggWaitRemaining', { remaining })
        ));
      }
      detailElement.append(body);
      await wait(duration());
      hideDetail();
      return { handled: true, kind: 'egg-wait' };
    };
    const showRank = async (payload, result) => {
      const arena = result.arena && typeof result.arena === 'object'
        ? result.arena
        : {};
      const collector = result.collector && typeof result.collector === 'object'
        ? result.collector
        : (result.score && typeof result.score === 'object' ? result.score : {});
      openDetail('rank');
      appendHeader({
        kicker: translate('rankCard'),
        title: displayName(payload, translate('viewer'))
      });
      const grid = create('div', 'sm-rank-grid');
      const appendRank = ({ label, tier, value }) => {
        const panel = create('article', 'sm-rank-panel');
        panel.append(create('span', 'sm-rank-label', label));
        panel.append(create('strong', 'sm-rank-tier', boundedText(tier, 'Bronze', 32)));
        panel.append(create('div', 'sm-rank-value', String(Math.max(
          0,
          Math.trunc(safeNumber(value, 0))
        ))));
        grid.append(panel);
      };
      appendRank({
        label: translate('arenaRating'),
        tier: arena.tier,
        value: arena.rating
      });
      appendRank({
        label: translate('collectorScore'),
        tier: collector.rank,
        value: collector.points
      });
      detailElement.append(grid);
      await wait(duration());
      hideDetail();
      return { handled: true, kind: 'rank' };
    };
    const showCompact = async (payload, result) => {
      hideDetail();
      const viewer = displayName(payload, translate('viewer'));
      const message = boundedText(translate(result.messageKey || 'commandUnavailable'), translate('commandUnavailable'), 220);
      const hint = boundedText(result.hint, '', 120);
      compactElement.dataset.kind = 'compact';
      compactElement.textContent = `${viewer} · ${message}${hint ? ` · ${hint}` : ''}`;
      compactElement.classList.add('visible');
      await wait(duration());
      compactElement.classList.remove('visible');
      compactElement.removeAttribute('data-kind');
      return { handled: true, kind: 'compact' };
    };
    const show = payload => {
      const result = payload?.result && typeof payload.result === 'object'
        ? payload.result
        : {};
      if (result.status === 'inventory') return showCollection(payload, result);
      if (result.status === 'monster') return showMonster(payload, result);
      if (result.status === 'egg_not_ready' && (result.wait || result.card)) {
        return showEggWait(payload, result);
      }
      if (result.status === 'rank' && (result.arena || result.collector || result.score)) {
        return showRank(payload, result);
      }
      return showCompact(payload || {}, result);
    };

    return {
      show,
      hide() {
        hideCompact();
        hideDetail();
      }
    };
  }

  return {
    createChatView,
    displayName,
    formatRemaining,
    normalizeMonster,
    normalizeOwner,
    safeImageUrl
  };
}));
