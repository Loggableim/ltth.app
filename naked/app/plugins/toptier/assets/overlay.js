/**
 * TopTier Overlay – overlay.js
 * All 7 overlay variant render functions, Socket.IO integration,
 * and security helpers (escHtml / escAttr).
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

  // ==============================
  // URL params
  // ==============================
  var params = new URLSearchParams(window.location.search);
  var paramBoard = params.get('board') || 'likes';
  var paramVariant = params.get('variant') || 'animated-race';
  var paramTheme = params.get('theme') || 'dark';
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
  var spotlightIdx = 0;
  var spotlightTimer = null;

  // ==============================
  // Init
  // ==============================
  function init() {
    var container = document.getElementById('tt-root');
    if (!container) return;

    // Apply theme, size, variant classes
    container.className = 'tt-container tt-size-' + escHtml(paramSize) +
      ' tt-theme-' + escHtml(paramTheme) +
      ' tt-variant-' + escHtml(paramVariant);
    container.style.setProperty('--tt-accent', paramAccent);
    container.style.setProperty('--tt-bg-opacity', String(paramOpacity));

    // Connect Socket.IO
    var socket = io();

    socket.on('connect', function () {
      if (paramBoard === 'both' || paramBoard === 'likes') {
        socket.emit('toptier:get-board', { board: 'likes' });
      }
      if (paramBoard === 'both' || paramBoard === 'gifts') {
        socket.emit('toptier:get-board', { board: 'gifts' });
      }
    });

    socket.on('toptier:update', function (data) {
      if (!data) return;
      if (data.board === 'likes') {
        likesData = (data.entries || []).slice(0, paramCount);
      } else if (data.board === 'gifts') {
        giftsData = (data.entries || []).slice(0, paramCount);
      }
      render();
    });

    socket.on('toptier:rank-change', function (data) {
      if (!data) return;
      markRankChange(data.username, data.oldRank, data.newRank);
    });

    socket.on('toptier:new-leader', function (data) {
      if (!data) return;
      markNewLeader(data.username);
    });

    socket.on('toptier:decay', function (data) {
      if (!data || !data.affectedUsers) return;
      for (var i = 0; i < data.affectedUsers.length; i++) {
        markDecay(data.affectedUsers[i]);
      }
    });

    // Start spotlight rotation if needed
    if (paramVariant === 'spotlight') {
      startSpotlightRotation();
    }
  }

  // ==============================
  // Render dispatcher
  // ==============================
  function render() {
    var container = document.getElementById('tt-root');
    if (!container) return;

    var boards = getActiveBoards();
    var html = '';

    for (var b = 0; b < boards.length; b++) {
      var boardInfo = boards[b];
      html += renderBoard(boardInfo.type, boardInfo.data, boardInfo.label);
    }

    container.innerHTML = html;
    attachAvatarFallbacks();
  }

  function getActiveBoards() {
    var boards = [];
    if (paramBoard === 'likes' || paramBoard === 'both') {
      boards.push({ type: 'likes', data: likesData, label: '\u2764\uFE0F Likes' });
    }
    if (paramBoard === 'gifts' || paramBoard === 'both') {
      boards.push({ type: 'gifts', data: giftsData, label: '\uD83C\uDF81 Gifts' });
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
  // 1. Classic List
  // ==============================
  function renderClassicList(boardType, entries, label) {
    if (!entries.length) return '<div class="tt-board"><div class="tt-board-title">' + escHtml(label) + '</div><div class="tt-no-entries">Keine Eintr\u00E4ge</div></div>';
    var maxScore = entries[0].score || 1;
    var html = '<div class="tt-board"><div class="tt-board-title">' + escHtml(label) + '</div>';
    for (var i = 0; i < entries.length; i++) {
      html += renderEntry(entries[i], maxScore, 'tt-fade-in');
    }
    html += '</div>';
    return html;
  }

  // ==============================
  // 2. Animated Race (FLIP-technique via CSS transitions)
  // ==============================
  function renderAnimatedRace(boardType, entries, label) {
    if (!entries.length) return '<div class="tt-board"><div class="tt-board-title">' + escHtml(label) + '</div><div class="tt-no-entries">Keine Eintr\u00E4ge</div></div>';
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
    if (!entries.length) return '<div class="tt-board"><div class="tt-board-title">' + escHtml(label) + '</div><div class="tt-no-entries">Keine Eintr\u00E4ge</div></div>';
    var idx = spotlightIdx % entries.length;
    var entry = entries[idx];
    var avatarSrc = entry.profile_picture_url || AVATAR_PLACEHOLDER;
    var rankIcon = RANK_ICONS[entry.rank] || '#' + entry.rank;

    var html = '<div class="tt-board"><div class="tt-board-title">' + escHtml(label) + '</div>';
    html += '<div class="tt-spotlight-card tt-slide-in">';
    if (paramShowAvatars) {
      html += '<img class="tt-spotlight-avatar" src="' + escAttr(avatarSrc) + '" alt="" loading="lazy" data-fallback>';
    }
    html += '<div class="tt-spotlight-rank">' + escHtml(String(rankIcon)) + '</div>';
    html += '<div class="tt-spotlight-name">' + escHtml(entry.nickname || entry.username) + '</div>';
    html += '<div class="tt-spotlight-score">' + escHtml(String(entry.score)) + '</div>';
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
    if (!entries.length) return '<div class="tt-board"><div class="tt-board-title">' + escHtml(label) + '</div><div class="tt-no-entries">Keine Eintr\u00E4ge</div></div>';
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
      html += '<div class="tt-podium-score">' + escHtml(String(e.score)) + '</div>';
      html += '</div>';
    }
    html += '</div>';

    if (rest.length) {
      html += '<div class="tt-podium-rest">';
      for (var j = 0; j < rest.length; j++) {
        html += renderEntry(rest[j], maxScore, '');
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
    if (!entries.length) return '<div class="tt-board"><div class="tt-board-title">' + escHtml(label) + '</div><div class="tt-no-entries">Keine Eintr\u00E4ge</div></div>';

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
      html += '<span class="tt-ticker-score">' + escHtml(String(e.score)) + '</span>';
      html += '</div>';
    }
    html += '</div></div></div>';
    return html;
  }

  // ==============================
  // 6. Holographic Cards
  // ==============================
  function renderHolographic(boardType, entries, label) {
    if (!entries.length) return '<div class="tt-board"><div class="tt-board-title">' + escHtml(label) + '</div><div class="tt-no-entries">Keine Eintr\u00E4ge</div></div>';

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
      html += '<div class="tt-holo-score">' + escHtml(String(e.score)) + '</div>';
      html += '</div>';
    }
    html += '</div></div>';
    return html;
  }

  // ==============================
  // 7. Scoreboard
  // ==============================
  function renderScoreboard(boardType, entries, label) {
    if (!entries.length) return '<div class="tt-board"><div class="tt-board-title">' + escHtml(label) + '</div><div class="tt-no-entries">Keine Eintr\u00E4ge</div></div>';

    var html = '<div class="tt-board"><div class="tt-board-title">' + escHtml(label) + '</div>';
    html += '<table class="tt-scoreboard-table"><thead><tr>';
    html += '<th>Rank</th><th></th><th>Name</th><th>Score</th><th>\u0394</th><th>Decay</th>';
    html += '</tr></thead><tbody>';

    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var avatarSrc = e.profile_picture_url || AVATAR_PLACEHOLDER;
      var rankIcon = RANK_ICONS[e.rank] || '#' + e.rank;
      var key = boardType + ':' + (e.username || '');
      var prevScore = previousScores[key];
      var delta = (prevScore !== undefined) ? e.score - prevScore : 0;
      previousScores[key] = e.score;
      var deltaStr = delta > 0 ? '+' + delta : (delta < 0 ? String(delta) : '-');
      var deltaColor = delta > 0 ? 'color:#22c55e' : (delta < 0 ? 'color:#ef4444' : '');

      html += '<tr class="tt-scoreboard-row">';
      html += '<td class="tt-sb-rank">' + escHtml(String(rankIcon)) + '</td>';
      if (paramShowAvatars) {
        html += '<td><img class="tt-sb-avatar" src="' + escAttr(avatarSrc) + '" alt="" loading="lazy" data-fallback></td>';
      } else {
        html += '<td></td>';
      }
      html += '<td class="tt-sb-name">' + escHtml(e.nickname || e.username) + '</td>';
      html += '<td class="tt-sb-score">' + escHtml(String(e.score)) + '</td>';
      html += '<td class="tt-sb-delta" style="' + escAttr(deltaColor) + '">' + escHtml(deltaStr) + '</td>';
      html += '<td><div class="tt-decay-bar-wrap"><div class="tt-decay-bar"></div></div></td>';
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

    var html = '<div class="tt-entry ' + (extraClass || '') + '" data-username="' + escAttr(entry.username) + '">';
    html += '<div class="tt-rank-badge">' + escHtml(String(rankIcon)) + '</div>';
    html += '<img class="' + avatarClass + '" src="' + escAttr(avatarSrc) + '" alt="" loading="lazy" data-fallback>';
    html += '<div class="tt-info">';
    html += '<div class="tt-name">' + escHtml(entry.nickname || entry.username) + '</div>';
    if (paramShowBars) {
      html += '<div class="' + barClass + '"><div class="tt-score-bar" style="width:' + barWidth + '%"></div></div>';
    }
    html += '</div>';
    html += '<div class="tt-score">' + escHtml(String(entry.score)) + '</div>';
    html += '</div>';
    return html;
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
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
