/**
 * TopTier Overlay – overlay.js  v3.0
 * State-of-the-art overlay with number formatting, score tick animations,
 * spotlight float, pulse ring for #1, and staggered entry animations.
 */
(function () {
  'use strict';

  // ==============================
  // Security helpers
  // ==============================
  function escHtml(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escAttr(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function isValidEntry(entry) {
    return !!entry && typeof entry === 'object' && !Array.isArray(entry) &&
      typeof entry.username === 'string' &&
      (entry.nickname == null || typeof entry.nickname === 'string') &&
      (entry.profile_picture_url == null || typeof entry.profile_picture_url === 'string') &&
      Number.isFinite(entry.score) && entry.score >= 0 &&
      Number.isInteger(entry.rank) && entry.rank >= 1;
  }

  function normalizeTheme(theme) {
    var value = String(theme || '').toLowerCase();
    if (value === 'day' || value === 'light') return 'day';
    if (value === 'night' || value === 'dark' || value === 'minimal') return 'night';
    if (value === 'contrast' || value === 'neon') return 'contrast';
    if (value === 'vision-impaired') return 'vision-impaired';
    return 'night';
  }

  // ==============================
  // Number formatting — 1.2K, 3.4M, etc.
  // ==============================
  function formatScore(num) {
    if (num == null) return '0';
    var n = Number(num);
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
  }

  function translate(key, fallback) {
    if (!window.i18n || typeof window.i18n.t !== 'function') return fallback;
    var value = window.i18n.t(key);
    return typeof value === 'string' && value !== key ? value : fallback;
  }

  function boardLabel(board) {
    var key = board === 'gifts' ? 'gifts' : 'likes';
    var icon = board === 'gifts' ? '🎁' : '❤️';
    var fallback = board === 'gifts' ? 'Gifts' : 'Likes';
    return icon + ' ' + translate('plugins.toptier.toptier.ui.navigation.' + key, fallback);
  }

  function noEntriesLabel() {
    return translate('plugins.toptier.toptier.ui.messages.no_entries', 'Keine Einträge');
  }

  // ==============================
  // URL params
  // ==============================
  var params = new URLSearchParams(window.location.search);
  var paramBoard = params.get('board') || 'likes';
  var paramVariant = params.get('variant') || 'animated-race';
  var paramTheme = normalizeTheme(params.get('theme') || 'night');
  var paramOrientation = params.get('orientation') || 'landscape';
  var paramSize = params.get('size') || 'M';
  var paramCount = parseInt(params.get('count'), 10) || 5;
  var paramAccent = params.get('accent') || '#f59e0b';
  var paramOpacity = parseFloat(params.get('opacity')) || 0.85;
  var paramShowAvatars = params.get('avatars') !== 'false';
  var paramShowBars = params.get('bars') !== 'false';
  var paramRotation = parseInt(params.get('rotation'), 10) || 8000;

  // Rank icons
  var RANK_ICONS = { 1: '\u{1F451}', 2: '\u{1F948}', 3: '\u{1F949}' };

  // Avatar placeholder path
  var AVATAR_PLACEHOLDER = '/plugins/toptier/assets/avatar-placeholder.svg';

  // State
  var likesData = [];
  var giftsData = [];
  var previousScores = {};
  var previousRenderedScores = {};
  var spotlightIdx = 0;
  var spotlightTimer = null;
  var overlaySocket = null;
  var overlayDestroyed = false;
  var animationTimeouts = new Set();

  function registerSocketHandler(eventName, handler) {
    if (!overlaySocket) return;
    overlaySocket.on(eventName, function () {
      if (overlayDestroyed) return;
      handler.apply(null, arguments);
    });
  }

  function cleanupOverlay(event) {
    if (event && event.persisted === true) return;
    if (overlayDestroyed) return;
    overlayDestroyed = true;
    if (window.socket === overlaySocket) window.socket = null;
    if (spotlightTimer !== null) {
      clearInterval(spotlightTimer);
      spotlightTimer = null;
    }
    animationTimeouts.forEach(function (timeoutId) { clearTimeout(timeoutId); });
    animationTimeouts.clear();
    if (overlaySocket && typeof overlaySocket.disconnect === 'function') {
      overlaySocket.disconnect();
    }
  }

  // ==============================
  // Init
  // ==============================
  function init() {
    if (overlayDestroyed) return;
    var container = document.getElementById('tt-root');
    if (!container) return;

    // Apply theme, size, variant, orientation classes
    container.className = 'tt-container tt-size-' + escHtml(paramSize) +
      ' tt-theme-' + escHtml(paramTheme) +
      ' tt-variant-' + escHtml(paramVariant) +
      ' tt-orientation-' + escHtml(paramOrientation);
    container.style.setProperty('--tt-accent', paramAccent);
    container.style.setProperty('--tt-bg-opacity', String(paramOpacity));

    // Connect Socket.IO
    overlaySocket = io();
    // Standalone overlays do not load dashboard.js, which normally exposes
    // the app-owned socket to the shared i18n client.
    if (!window.socket) window.socket = overlaySocket;

    registerSocketHandler('connect', function () {
      if (paramBoard === 'both' || paramBoard === 'likes' || paramBoard === 'combined') {
        overlaySocket.emit('toptier:get-board', { board: 'likes' });
      }
      if (paramBoard === 'both' || paramBoard === 'gifts' || paramBoard === 'combined') {
        overlaySocket.emit('toptier:get-board', { board: 'gifts' });
      }
    });

    registerSocketHandler('toptier:update', function (data) {
      if (!data || typeof data !== 'object' || Array.isArray(data) ||
          !['likes', 'gifts'].includes(data.board) || !Array.isArray(data.entries)) return;
      var validEntries = data.entries.filter(isValidEntry);
      if (data.entries.length > 0 && validEntries.length === 0) return;
      var entries = validEntries.slice(0, paramCount);
      if (data.board === 'likes') {
        likesData = entries;
      } else if (data.board === 'gifts') {
        giftsData = entries;
      }
      render();
    });

    registerSocketHandler('toptier:rank-change', function (data) {
      if (!data) return;
      markRankChange(data.username, data.oldRank, data.newRank);
    });

    registerSocketHandler('toptier:new-leader', function (data) {
      if (!data) return;
      markNewLeader(data.username);
    });

    registerSocketHandler('toptier:decay', function (data) {
      if (!data || !data.affectedUsers) return;
      for (var i = 0; i < data.affectedUsers.length; i++) {
        markDecay(data.affectedUsers[i]);
      }
    });

    if (window.i18n && typeof window.i18n.onLanguageChange === 'function') {
      window.i18n.onLanguageChange(function () { render(); });
      if (window.i18n.ready && typeof window.i18n.ready.then === 'function') {
        window.i18n.ready.then(function () { render(); });
      }
    }

    // Start spotlight rotation if needed
    if (paramVariant === 'spotlight') {
      startSpotlightRotation();
    }
  }

  // ==============================
  // Render dispatcher
  // ==============================
  function render() {
    if (overlayDestroyed) return;
    var container = document.getElementById('tt-root');
    if (!container) return;

    var html = '';

    if (paramVariant === 'combined') {
      html += renderCombined();
    } else {
      var boards = getActiveBoards();
      for (var b = 0; b < boards.length; b++) {
        var boardInfo = boards[b];
        html += renderBoard(boardInfo.type, boardInfo.data, boardInfo.label);
      }
    }

    container.innerHTML = html;
    attachAvatarFallbacks();
    triggerScoreTicks();
  }

  function getActiveBoards() {
    var boards = [];
    if (paramBoard === 'likes' || paramBoard === 'both' || paramBoard === 'combined') {
      boards.push({ type: 'likes', data: likesData, label: boardLabel('likes') });
    }
    if (paramBoard === 'gifts' || paramBoard === 'both' || paramBoard === 'combined') {
      boards.push({ type: 'gifts', data: giftsData, label: boardLabel('gifts') });
    }
    return boards;
  }

  function renderBoard(boardType, entries, label) {
    switch (paramVariant) {
      case 'classic-list': return renderClassicList(boardType, entries, label);
      case 'animated-race': return renderAnimatedRace(boardType, entries, label);
      case 'spotlight': return renderSpotlight(boardType, entries, label);
      case 'podium': return renderPodium(boardType, entries, label);
      case 'ticker': return renderTicker(boardType, entries, label);
      case 'holographic': return renderHolographic(boardType, entries, label);
      case 'scoreboard': return renderScoreboard(boardType, entries, label);
      default: return renderClassicList(boardType, entries, label);
    }
  }

  // ==============================
  // Stagger class helper
  // ==============================
  function staggerClass(index) {
    var n = Math.min(index + 1, 5);
    return 'tt-stagger-' + n;
  }

  // ==============================
  // Combined View (Likes + Gifts side by side or stacked)
  // ==============================
  function renderCombined() {
    var html = '<div class="tt-combined-wrap">';

    // Likes section
    html += '<div class="tt-combined-section tt-combined-likes">';
    html += '<div class="tt-board-title">' + escHtml(boardLabel('likes')) + '</div>';
    if (likesData.length) {
      var maxLikes = likesData[0].score || 1;
      for (var i = 0; i < likesData.length; i++) {
        html += renderEntry(likesData[i], maxLikes, 'tt-fade-in ' + staggerClass(i));
      }
    } else {
      html += '<div class="tt-no-entries">' + escHtml(noEntriesLabel()) + '</div>';
    }
    html += '</div>';

    // Gifts section
    html += '<div class="tt-combined-section tt-combined-gifts">';
    html += '<div class="tt-board-title">' + escHtml(boardLabel('gifts')) + '</div>';
    if (giftsData.length) {
      var maxGifts = giftsData[0].score || 1;
      for (var j = 0; j < giftsData.length; j++) {
        html += renderEntry(giftsData[j], maxGifts, 'tt-fade-in ' + staggerClass(j));
      }
    } else {
      html += '<div class="tt-no-entries">' + escHtml(noEntriesLabel()) + '</div>';
    }
    html += '</div>';

    html += '</div>';
    return html;
  }

  // ==============================
  // 1. Classic List
  // ==============================
  function renderClassicList(boardType, entries, label) {
    if (!entries.length) return '<div class="tt-board"><div class="tt-board-title">' + escHtml(label) + '</div><div class="tt-no-entries">' + escHtml(noEntriesLabel()) + '</div></div>';
    var maxScore = entries[0].score || 1;
    var html = '<div class="tt-board"><div class="tt-board-title">' + escHtml(label) + '</div>';
    for (var i = 0; i < entries.length; i++) {
      html += renderEntry(entries[i], maxScore, 'tt-fade-in ' + staggerClass(i));
    }
    html += '</div>';
    return html;
  }

  // ==============================
  // 2. Animated Race (FLIP-technique via CSS transitions)
  // ==============================
  function renderAnimatedRace(boardType, entries, label) {
    if (!entries.length) return '<div class="tt-board"><div class="tt-board-title">' + escHtml(label) + '</div><div class="tt-no-entries">' + escHtml(noEntriesLabel()) + '</div></div>';
    var maxScore = entries[0].score || 1;
    var html = '<div class="tt-board"><div class="tt-board-title">' + escHtml(label) + '</div>';
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var rankClass = entry.rank <= 3 ? ' tt-rank-' + entry.rank : '';
      html += renderEntry(entry, maxScore, rankClass);
    }
    html += '</div>';
    return html;
  }

  // ==============================
  // 3. Spotlight / Rotation
  // ==============================
  function renderSpotlight(boardType, entries, label) {
    if (!entries.length) return '<div class="tt-board"><div class="tt-board-title">' + escHtml(label) + '</div><div class="tt-no-entries">' + escHtml(noEntriesLabel()) + '</div></div>';
    var idx = spotlightIdx % entries.length;
    var entry = entries[idx];
    var avatarSrc = entry.profile_picture_url || AVATAR_PLACEHOLDER;
    var rankIcon = RANK_ICONS[entry.rank] || '#' + entry.rank;
    var isRank1 = entry.rank === 1;

    var html = '<div class="tt-board"><div class="tt-board-title">' + escHtml(label) + '</div>';
    html += '<div class="tt-spotlight-card tt-slide-in">';
    if (paramShowAvatars) {
      var avatarStyle = isRank1 ? ' style="animation: tt-float 3s ease-in-out infinite, tt-pulse-ring 2s ease-out infinite"' : ' style="animation: tt-float 3s ease-in-out infinite"';
      html += '<img class="tt-spotlight-avatar" src="' + escAttr(avatarSrc) + '" alt="" loading="lazy" data-fallback' + avatarStyle + '>';
    }
    html += '<div class="tt-spotlight-rank">' + escHtml(String(rankIcon)) + '</div>';
    html += '<div class="tt-spotlight-name">' + escHtml(entry.nickname || entry.username) + '</div>';
    html += '<div class="tt-spotlight-score" data-score="' + escAttr(String(entry.score)) + '">' + escHtml(formatScore(entry.score)) + '</div>';
    html += '</div></div>';
    return html;
  }

  function startSpotlightRotation() {
    if (spotlightTimer) clearInterval(spotlightTimer);
    spotlightTimer = setInterval(function () {
      spotlightIdx++;
      render();
    }, paramRotation);
  }

  // ==============================
  // 4. Podium View
  // ==============================
  function renderPodium(boardType, entries, label) {
    if (!entries.length) return '<div class="tt-board"><div class="tt-board-title">' + escHtml(label) + '</div><div class="tt-no-entries">' + escHtml(noEntriesLabel()) + '</div></div>';
    var top3 = entries.slice(0, 3);
    var rest = entries.slice(3);
    var maxScore = entries[0].score || 1;

    var html = '<div class="tt-board"><div class="tt-board-title">' + escHtml(label) + '</div>';
    html += '<div class="tt-podium-wrap">';
    for (var i = 0; i < top3.length; i++) {
      var e = top3[i];
      var podiumClass = 'tt-podium-' + (i + 1);
      var avatarSrc = e.profile_picture_url || AVATAR_PLACEHOLDER;
      var rankIcon = RANK_ICONS[i + 1] || '#' + (i + 1);

      html += '<div class="tt-podium-block ' + podiumClass + '">';
      html += '<div class="tt-rank-badge">' + escHtml(String(rankIcon)) + '</div>';
      if (paramShowAvatars) {
        html += '<img class="tt-podium-avatar" src="' + escAttr(avatarSrc) + '" alt="" loading="lazy" data-fallback>';
      }
      html += '<div class="tt-podium-name">' + escHtml(e.nickname || e.username) + '</div>';
      html += '<div class="tt-podium-score" data-score="' + escAttr(String(e.score)) + '">' + escHtml(formatScore(e.score)) + '</div>';
      html += '</div>';
    }
    html += '</div>';

    if (rest.length) {
      html += '<div class="tt-podium-rest">';
      for (var j = 0; j < rest.length; j++) {
        html += renderEntry(rest[j], maxScore, 'tt-fade-in ' + staggerClass(j));
      }
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  // ==============================
  // 5. Ticker
  // ==============================
  function renderTicker(boardType, entries, label) {
    if (!entries.length) return '<div class="tt-board"><div class="tt-board-title">' + escHtml(label) + '</div><div class="tt-no-entries">' + escHtml(noEntriesLabel()) + '</div></div>';

    var html = '<div class="tt-board"><div class="tt-board-title">' + escHtml(label) + '</div>';
    html += '<div class="tt-ticker-wrap"><div class="tt-ticker-track">';
    // Duplicate entries for seamless scroll
    var all = entries.concat(entries);
    for (var i = 0; i < all.length; i++) {
      var e = all[i];
      var avatarSrc = e.profile_picture_url || AVATAR_PLACEHOLDER;
      var rankIcon = RANK_ICONS[e.rank] || '#' + e.rank;
      html += '<div class="tt-ticker-item">';
      html += '<span class="tt-rank-badge">' + escHtml(String(rankIcon)) + '</span>';
      if (paramShowAvatars) {
        html += '<img class="tt-ticker-avatar" src="' + escAttr(avatarSrc) + '" alt="" loading="lazy" data-fallback>';
      }
      html += '<span class="tt-name">' + escHtml(e.nickname || e.username) + '</span>';
      html += '<span class="tt-ticker-score" data-score="' + escAttr(String(e.score)) + '">' + escHtml(formatScore(e.score)) + '</span>';
      html += '</div>';
    }
    html += '</div></div></div>';
    return html;
  }

  // ==============================
  // 6. Holographic Cards
  // ==============================
  function renderHolographic(boardType, entries, label) {
    if (!entries.length) return '<div class="tt-board"><div class="tt-board-title">' + escHtml(label) + '</div><div class="tt-no-entries">' + escHtml(noEntriesLabel()) + '</div></div>';

    var html = '<div class="tt-board"><div class="tt-board-title">' + escHtml(label) + '</div>';
    html += '<div class="tt-holo-grid">';
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var avatarSrc = e.profile_picture_url || AVATAR_PLACEHOLDER;
      var rankIcon = RANK_ICONS[e.rank] || '#' + e.rank;
      var rank1Class = e.rank === 1 ? ' tt-holo-rank1' : '';

      html += '<div class="tt-holo-card' + rank1Class + '">';
      html += '<div class="tt-holo-rank-badge">' + escHtml(String(rankIcon)) + '</div>';
      if (paramShowAvatars) {
        html += '<img class="tt-holo-avatar" src="' + escAttr(avatarSrc) + '" alt="" loading="lazy" data-fallback>';
      }
      html += '<div class="tt-holo-name">' + escHtml(e.nickname || e.username) + '</div>';
      html += '<div class="tt-holo-score" data-score="' + escAttr(String(e.score)) + '">' + escHtml(formatScore(e.score)) + '</div>';
      html += '</div>';
    }
    html += '</div></div>';
    return html;
  }

  // ==============================
  // 7. Scoreboard
  // ==============================
  function renderScoreboard(boardType, entries, label) {
    if (!entries.length) return '<div class="tt-board"><div class="tt-board-title">' + escHtml(label) + '</div><div class="tt-no-entries">' + escHtml(noEntriesLabel()) + '</div></div>';

    var html = '<div class="tt-board"><div class="tt-board-title">' + escHtml(label) + '</div>';
    html += '<table class="tt-scoreboard-table"><thead><tr>';
    html += '<th>Rank</th><th></th><th>Name</th><th>Score</th><th>\u0394</th>';
    html += '</tr></thead><tbody>';

    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var avatarSrc = e.profile_picture_url || AVATAR_PLACEHOLDER;
      var rankIcon = RANK_ICONS[e.rank] || '#' + e.rank;
      var key = boardType + ':' + (e.username || '');
      var prevScore = previousScores[key];
      var delta = (prevScore !== undefined) ? e.score - prevScore : 0;
      previousScores[key] = e.score;
      var deltaStr = delta > 0 ? '+' + formatScore(delta) : (delta < 0 ? formatScore(delta) : '\u2013');
      var deltaColor = delta > 0 ? 'color:#22c55e' : (delta < 0 ? 'color:#ef4444' : '');

      html += '<tr class="tt-scoreboard-row">';
      html += '<td class="tt-sb-rank">' + escHtml(String(rankIcon)) + '</td>';
      if (paramShowAvatars) {
        html += '<td><img class="tt-sb-avatar" src="' + escAttr(avatarSrc) + '" alt="" loading="lazy" data-fallback></td>';
      } else {
        html += '<td></td>';
      }
      html += '<td class="tt-sb-name">' + escHtml(e.nickname || e.username) + '</td>';
      html += '<td class="tt-sb-score" data-score="' + escAttr(String(e.score)) + '">' + escHtml(formatScore(e.score)) + '</td>';
      html += '<td class="tt-sb-delta" style="' + escAttr(deltaColor) + '">' + escHtml(deltaStr) + '</td>';
      html += '</tr>';
    }

    html += '</tbody></table></div>';
    return html;
  }

  // ==============================
  // Shared entry renderer
  // ==============================
  function renderEntry(entry, maxScore, extraClass) {
    var avatarSrc = entry.profile_picture_url || AVATAR_PLACEHOLDER;
    var rankIcon = RANK_ICONS[entry.rank] || '#' + entry.rank;
    var barWidth = maxScore > 0 ? Math.round((entry.score / maxScore) * 100) : 0;
    var avatarClass = paramShowAvatars ? 'tt-avatar' : 'tt-avatar tt-avatar-hidden';
    var barClass = paramShowBars ? 'tt-score-bar-wrap' : 'tt-score-bar-wrap tt-score-bar-hidden';
    var rankClass = entry.rank <= 3 ? ' tt-rank-' + entry.rank : '';

    var html = '<div class="tt-entry ' + (extraClass || '') + rankClass + '" data-username="' + escAttr(entry.username) + '">';
    html += '<div class="tt-rank-badge">' + escHtml(String(rankIcon)) + '</div>';
    html += '<img class="' + avatarClass + '" src="' + escAttr(avatarSrc) + '" alt="" loading="lazy" data-fallback>';
    html += '<div class="tt-info">';
    html += '<div class="tt-name">' + escHtml(entry.nickname || entry.username) + '</div>';
    if (paramShowBars) {
      html += '<div class="' + barClass + '"><div class="tt-score-bar" style="width:' + barWidth + '%"></div></div>';
    }
    html += '</div>';
    html += '<div class="tt-score" data-score="' + escAttr(String(entry.score)) + '">' + escHtml(formatScore(entry.score)) + '</div>';
    html += '</div>';
    return html;
  }

  // ==============================
  // Score tick animation — triggers on score change
  // ==============================
  function triggerScoreTicks() {
    var scoreEls = document.querySelectorAll('.tt-score[data-score], .tt-sb-score[data-score], .tt-spotlight-score[data-score], .tt-holo-score[data-score], .tt-ticker-score[data-score], .tt-podium-score[data-score]');
    for (var i = 0; i < scoreEls.length; i++) {
      (function (el) {
        var score = el.getAttribute('data-score');
        var parent = el.closest('[data-username]');
        var username = parent ? parent.getAttribute('data-username') : null;
        var key = el.className + ':' + (username || i);
        var prev = previousRenderedScores[key];
        if (prev !== undefined && prev !== score) {
          el.classList.remove('tt-score-tick-anim');
          void el.offsetWidth;
          el.style.animation = 'tt-score-tick 0.5s ease-out';
          var timeoutId = setTimeout(function () {
            animationTimeouts.delete(timeoutId);
            if (!overlayDestroyed && el.isConnected) el.style.animation = '';
          }, 500);
          animationTimeouts.add(timeoutId);
        }
        previousRenderedScores[key] = score;
      })(scoreEls[i]);
    }
  }

  // ==============================
  // Animation triggers
  // ==============================
  function markRankChange(username, oldRank, newRank) {
    var els = document.querySelectorAll('[data-username="' + CSS.escape(username) + '"]');
    var cls = newRank < oldRank ? 'tt-flash-up' : 'tt-flash-down';
    for (var i = 0; i < els.length; i++) {
      els[i].classList.remove('tt-flash-up', 'tt-flash-down');
      void els[i].offsetWidth; // force reflow
      els[i].classList.add(cls);
    }
  }

  function markNewLeader(username) {
    var els = document.querySelectorAll('[data-username="' + CSS.escape(username) + '"] .tt-rank-badge');
    for (var i = 0; i < els.length; i++) {
      els[i].classList.remove('tt-badge-pulse');
      void els[i].offsetWidth;
      els[i].classList.add('tt-badge-pulse');
    }
  }

  function markDecay(username) {
    var els = document.querySelectorAll('[data-username="' + CSS.escape(username) + '"] .tt-score');
    for (var i = 0; i < els.length; i++) {
      els[i].classList.remove('tt-decay-pulse');
      void els[i].offsetWidth;
      els[i].classList.add('tt-decay-pulse');
    }
  }

  // ==============================
  // Avatar fallback
  // ==============================
  function attachAvatarFallbacks() {
    var imgs = document.querySelectorAll('[data-fallback]');
    for (var i = 0; i < imgs.length; i++) {
      imgs[i].addEventListener('error', function () {
        if (this.src !== AVATAR_PLACEHOLDER) {
          this.src = AVATAR_PLACEHOLDER;
        }
      });
    }
  }

  // ==============================
  // Boot
  // ==============================
  window.addEventListener('pagehide', cleanupOverlay);
  window.addEventListener('beforeunload', cleanupOverlay);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
