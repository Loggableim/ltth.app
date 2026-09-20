'use strict';

const fs = require('fs');
const path = require('path');
const { isHttpAllowed } = require('../modules/public-overlay-registry');
const {
  collectStreamMonstersManifestDependencies
} = require('./helpers/public-overlay-dependency-crawler');

const appRoot = path.resolve(__dirname, '..');
const surfaceSources = [
  'public/animation-overlay.html',
  'plugins/advanced-timer/overlay/index.html',
  'plugins/advanced-timer/overlay/overlay.js',
  'plugins/animazingpal/overlay/stream-assistant-hud.html',
  'plugins/clarityhud/overlays/chat.html',
  'plugins/clarityhud/overlays/chat.js',
  'plugins/clarityhud/overlays/full.html',
  'plugins/clarityhud/overlays/full.js',
  'plugins/clarityhud/overlays/multi.html',
  'plugins/clarityhud/overlays/multi.js',
  'plugins/clarityhud/overlays/stream.html',
  'plugins/clarityhud/overlays/stream.js',
  'plugins/coinbattle/overlay/overlay.html',
  'plugins/coinbattle/overlay/overlay.js',
  'plugins/emoji-rain/obs-hud.html',
  'public/js/emoji-rain-obs-hud.js',
  'plugins/fireworks/overlay.html',
  'plugins/flame-overlay/renderer/index.html',
  'plugins/game-engine/overlay/arena.html',
  'plugins/game-engine/overlay/chess.html',
  'plugins/game-engine/overlay/connect4.html',
  'plugins/game-engine/overlay/game-hud.html',
  'plugins/game-engine/overlay/plinko.html',
  'plugins/game-engine/overlay/slot.html',
  'plugins/game-engine/overlay/unified.html',
  'plugins/game-engine/overlay/wheel.html',
  'plugins/gcce/overlay-hud.html',
  'plugins/goals/overlay/index.html',
  'plugins/goals/overlay/overlay.js',
  'plugins/goals/overlay/multigoal.html',
  'plugins/goals/overlay/multigoal.js',
  'plugins/interactive-story/overlay.html',
  'plugins/music-bot/overlay.html',
  'plugins/openshock/overlay/zappiehell-overlay.html',
  'plugins/quiz-show/quiz_show_overlay.html',
  'plugins/quiz-show/quiz_show_overlay.js',
  'plugins/quiz-show/quiz_show_leaderboard_overlay.html',
  'plugins/schnorrbecher/overlay/coincup.html',
  'plugins/schnorrbecher/overlay/coincup.js',
  'plugins/spotlight/overlays/gifter.html',
  'plugins/spotlight/overlays/single-overlay.js',
  'plugins/spotlight/overlays/multihud.html',
  'plugins/spotlight/overlays/multihud.js',
  'plugins/stream-monsters/streammonsters-overlay.html',
  'plugins/stream-monsters/streammonsters-effects-renderer.js',
  'plugins/stream-monsters/streammonsters-overlay-runtime.js',
  'plugins/stream-monsters/streammonsters-arena-director.js',
  'plugins/stream-monsters/streammonsters-audio-engine.js',
  'plugins/stream-monsters/streammonsters-arena-view.js',
  'plugins/stream-monsters/streammonsters-chat-view.js',
  'plugins/stt-ticker/overlay/ticker.html',
  'plugins/talking-heads/overlay.html',
  'plugins/talking-heads/assets/overlay.js',
  'plugins/toptier/overlay.html',
  'plugins/toptier/assets/overlay.js',
  'plugins/visual-fx-frame-webgpu/renderer/index.html',
  'plugins/visual-fx-frame-webgpu/renderer/overlay-controller.js',
  'plugins/weather-control/overlay.html',
  'plugins/webgpu-emoji-rain/obs-hud.html',
  'plugins/webgpu-fireworks/overlay.html',
  'plugins/webgpu-weather-control/overlay.html'
];

function collectAbsoluteDependencies(source) {
  const dependencies = new Map();
  const expressions = [
    /(?:src|href)\s*=\s*["'](\/[^"'#]+)["']/g,
    /\bimport\s*(?:\(|[^'"]*?\bfrom\s*)\s*["'](\/[^"']+)["']/g
  ];
  for (const expression of expressions) {
    for (const match of source.matchAll(expression)) {
      dependencies.set(`GET ${match[1]}`, {
        method: 'GET',
        pathname: match[1]
      });
    }
  }

  const fetchExpression =
    /\bfetch\s*\(\s*["'](\/[^"'#?]+)(?:\?[^"']*)?["']\s*(?:,\s*\{([\s\S]{0,400}?)\})?\s*\)/g;
  for (const match of source.matchAll(fetchExpression)) {
    const methodMatch = (match[2] || '').match(/\bmethod\s*:\s*["']([A-Za-z]+)["']/);
    const method = methodMatch ? methodMatch[1].toUpperCase() : 'GET';
    dependencies.set(`${method} ${match[1]}`, {
      method,
      pathname: match[1]
    });
  }
  return dependencies.values();
}

function collectTemplateFetchDependencies(source) {
  const dependencies = [];
  const expression =
    /\bfetch\s*\(\s*`(\/[^`#]+)`\s*(?:,\s*\{([\s\S]{0,400}?)\})?\s*\)/g;
  for (const match of source.matchAll(expression)) {
    const methodMatch = (match[2] || '').match(/\bmethod\s*:\s*["']([A-Za-z]+)["']/);
    const pathname = match[1]
      .replace(/\$\{([^}]+)\}/g, (_placeholder, expressionText) => {
        if (/locale/i.test(expressionText)) return 'en';
        if (/query/i.test(expressionText)) return '';
        if (/gameType/i.test(expressionText)) return 'connect4';
        if (/(^|\W)type(\W|$)/i.test(expressionText)) return 'daily';
        if (/filename|imagePath/i.test(expressionText)) return 'fixture.png';
        return 'fixture';
      })
      .split('?')[0];
    dependencies.push({
      method: methodMatch ? methodMatch[1].toUpperCase() : 'GET',
      pathname
    });
  }
  return dependencies;
}

function collectDependencies(source) {
  return [
    ...collectAbsoluteDependencies(source),
    ...collectTemplateFetchDependencies(source)
  ];
}

function describeDependency(source, dependency) {
  return {
    source,
    method: dependency.method,
    pathname: dependency.pathname
  };
}

describe('registered overlay dependency crawl', () => {
  test('allows render dependencies and keeps game test-control writes local-only', () => {
    const blocked = [];
    const allowedNonReads = [];
    for (const relativePath of surfaceSources) {
      const absolutePath = path.join(appRoot, relativePath);
      if (!fs.existsSync(absolutePath)) {
        throw new Error(`Missing registered overlay source: ${relativePath}`);
      }
      const source = fs.readFileSync(absolutePath, 'utf8');
      for (const dependency of collectDependencies(source)) {
        if (isHttpAllowed(dependency)) {
          if (!['GET', 'HEAD'].includes(dependency.method)) {
            allowedNonReads.push(describeDependency(relativePath, dependency));
          }
        } else {
          blocked.push(describeDependency(relativePath, dependency));
        }
      }
    }
    expect(blocked).toEqual([
      {
        source: 'plugins/game-engine/overlay/connect4.html',
        method: 'POST',
        pathname: '/api/game-engine/manual/start'
      },
      {
        source: 'plugins/game-engine/overlay/connect4.html',
        method: 'POST',
        pathname: '/api/game-engine/manual/move'
      },
      {
        source: 'plugins/game-engine/overlay/connect4.html',
        method: 'POST',
        pathname: '/api/game-engine/manual/end'
      },
      {
        source: 'plugins/game-engine/overlay/wheel.html',
        method: 'POST',
        pathname: '/api/game-engine/wheel/spin'
      }
    ]);
    expect(allowedNonReads).toEqual([
      {
        source: 'plugins/stream-monsters/streammonsters-overlay.html',
        method: 'POST',
        pathname: '/api/streammonsters/overlay/heartbeat'
      }
    ]);
  });

  test('allows every integrity-checked Stream Monsters manifest asset', () => {
    const dependencies = collectStreamMonstersManifestDependencies({ appRoot });
    const audio = dependencies.filter(dependency => dependency.kind === 'audio');
    const furry = dependencies.filter(dependency => dependency.kind === 'furry');

    expect(audio).toHaveLength(28);
    expect(furry).toHaveLength(72);
    expect(dependencies).toHaveLength(100);
    expect(dependencies.every(isHttpAllowed)).toBe(true);
    expect(new Set(dependencies.map(dependency => dependency.pathname)).size).toBe(100);
  });
});
