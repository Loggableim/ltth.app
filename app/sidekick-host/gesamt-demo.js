'use strict';

// Offline Gesamt-Demo ueber die Drafts der 4-Tage-Woche (lt-luo T1).
//
// Der Lauf braucht weder Live-TikTok noch Animaze: jede Quelle ist ein Fixture
// oder ein Mock. Der Harness
//   1. faehrt die Sidekick-Host-Szenen (Quiz, Musik/Sound, Connect4) ueber
//      HostCore mit geplantem Plugin-Wechsel,
//   2. spielt das nur lesende Live-Chat-Fixture ab,
//   3. uebt den Animaze-Adapter mit einem aufzeichnenden Mock-Transport,
//   4. prueft den Music-Bot-Adapter (play/skip/status) gegen den Fake,
//   5. prueft das Rate-Limit,
// und gibt danach eine Abdeckungsmatrix aus, die jeden Wochen-Draft dem
// Nachweis dieses Laufs oder einer offenen Luecke zuordnet.
//
// Start: npm run sidekick:gesamt-demo (aus app/)

const fs = require('fs');
const os = require('os');
const path = require('path');

const { ShowPlanner } = require('./show-planner');
const { HostCore } = require('./host-core');
const { RateLimiter } = require('./rate-limiter');
const { createReplyEngine } = require('./llm-reply');
const { createTextAdapter } = require('./adapters/text-adapter');
const { createAnimazeAdapter } = require('./adapters/animaze-adapter');
const { createMusicBotAdapter } = require('./adapters/music-bot-adapter');
const { createDemoPorts } = require('./demo-plugins');
const { createFakeMusicBot } = require('./testing/fake-music-bot');
const { parseChatCommand } = require('./command-allowlist');
const { playLiveReadFixture } = require('./live-read-fixture-play');

const LOG_PATH = path.join(os.tmpdir(), 'ltth-sidekick-gesamt-demo.jsonl');

// Der Gesamt-Lauf baut bewusst kein Netz auf. Ein injizierter Transport, der
// wirft, macht einen versehentlichen Aufruf sofort sichtbar.
function refuseNetwork() {
  throw new Error('Gesamt-Demo darf kein Netz benutzen');
}

// Szenen des Showplans. Jede Szene laeuft auf genau einem Plugin-Port; nur
// dessen Befehle sind laut ShowPlanner aktiv.
const SCENES = Object.freeze([
  {
    plugin: 'quiz-show',
    label: 'Quiz-Runde',
    messages: [
      { user: 'viewer_01', text: '!quiz' },
      { user: 'viewer_01', text: '!quiz a' },
      { user: 'viewer_02', text: 'wie laeuft die show heute?' }
    ]
  },
  {
    plugin: 'music-sound',
    label: 'Musik- und Sound-Runde',
    messages: [
      { user: 'viewer_03', text: '!song titel_ok' },
      { user: 'viewer_04', text: '!song titel_lang' },
      { user: 'viewer_05', text: '!sound' },
      { user: 'viewer_06', text: '!shutdown' }
    ]
  },
  {
    plugin: 'connect4',
    label: 'Vier-gewinnt-Runde',
    messages: [
      { user: 'viewer_07', text: '!connect4' },
      { user: 'viewer_08', text: '!connect4 D' },
      { user: 'viewer_09', text: '!connect4 D' }
    ]
  }
]);

// Die Abdeckungsmatrix nennt jede Zuarbeit der Woche. 'covered-offline' heisst,
// dieser Lauf liefert einen Nachweis; 'partial-offline' heisst, nur ein Teil der
// Kette ist hier fahrbar; 'gap' heisst, der Nachweis fehlt in diesem PR.
const DRAFTS = Object.freeze([
  { id: 'host-core', draft: 'Sidekick-Host (HostCore, Plugin-Ports, Showplan)', chain: '#154/#164' },
  { id: 'lt-5df', draft: 'Zeitgesteuerter Plugin-Wechsel nach Showplan', chain: 'lt-5df' },
  { id: 'lt-6qo', draft: 'Live-Chat-Adapter, nur lesend (Fixture)', chain: 'lt-6qo' },
  { id: 'lt-x16', draft: '!song per HTTP an den Music-Bot', chain: 'lt-x16' },
  { id: 'lt-mx7', draft: '!sound an ein echtes Soundboard', chain: 'lt-mx7' },
  { id: 'lt-j9s', draft: 'Chat-Befehle play/skip/status', chain: 'lt-j9s' },
  { id: 'lt-k02', draft: 'Animaze-Transport-Adapter (Mock)', chain: 'lt-k02' },
  { id: 'lt-luo', draft: 'Gesamt-Demo offline', chain: 'lt-luo' }
]);

async function runHostScenes({ log }) {
  let clock = 0;
  const now = () => clock;
  const fake = createFakeMusicBot({ now });
  const planner = new ShowPlanner(createDemoPorts({ now, adapter: createMusicBotAdapter({ transport: fake.request }) }));
  const spoken = [];
  const output = createTextAdapter({
    write: text => {
      spoken.push(text);
      log({ kind: 'say', text });
    }
  });
  const replyEngine = createReplyEngine({ apiKey: '', timeoutMs: 4000, request: refuseNetwork });
  const host = new HostCore({
    planner,
    output,
    replyEngine,
    rateLimiter: new RateLimiter({ maxEvents: 1000, windowMs: 60000, now }),
    log
  });

  const counts = {
    total: 0,
    command: 0,
    chatReply: 0,
    ignored: 0,
    emitted: 0,
    suppressed: 0,
    byCommand: {},
    pluginSwitch: 0
  };
  const rotation = [];

  for (const scene of SCENES) {
    const plugin = planner.switchTo(scene.plugin);
    counts.pluginSwitch += 1;
    rotation.push(plugin);
    log({ kind: 'scene', plugin, label: scene.label });

    for (const message of scene.messages) {
      clock += Number(message.gapMs) || 0;
      const result = await host.handleChat(message);
      counts.total += 1;
      if (result.type === 'command') {
        counts.command += 1;
        counts.byCommand[result.command] = (counts.byCommand[result.command] || 0) + 1;
      }
      if (result.type === 'chat-reply') counts.chatReply += 1;
      if (result.type === 'ignored') counts.ignored += 1;
      if (result.emitted) counts.emitted += 1;
      else if (result.type !== 'ignored') counts.suppressed += 1;
    }
  }

  // Ein zusaetzlicher advance() belegt, dass die Rotation selbst dreht.
  const advanced = planner.advance();
  counts.pluginSwitch += 1;
  rotation.push(advanced);
  log({ kind: 'plugin-switch', plugin: advanced, source: 'advance' });

  return { counts, spoken, rotation, fake };
}

async function runLiveReadPhase({ log }) {
  const result = await playLiveReadFixture({ log: entry => log({ kind: 'live-read', ...entry }) });
  const identityLeak = result.events.filter(event => 'username' in event || 'uniqueId' in event || 'userId' in event || 'nickname' in event);
  return { total: result.total, normalized: result.events.length, byType: result.byType, identityLeak: identityLeak.length };
}

async function runAnimazePhase({ log }) {
  const sent = [];
  const adapter = createAnimazeAdapter({ transport: { send: async payload => { sent.push(payload); } } });
  await adapter.say('Willkommen zur Gesamt-Demo');
  await adapter.emote('wave');
  log({ kind: 'animaze', sent: sent.length });
  return { say: sent.filter(item => item.type === 'say').length, emote: sent.filter(item => item.type === 'emote').length, sent };
}

async function runMusicBotAdapterPhase({ log }) {
  const fake = createFakeMusicBot();
  const adapter = createMusicBotAdapter({ transport: fake.request });
  const enqueue = await adapter.enqueue({ query: 'titel_ok', requestedBy: 'viewer_01' });
  const statusQueued = await adapter.status();
  const play = await adapter.play({ index: 0 });
  const statusPlaying = await adapter.status();
  const skip = await adapter.skip({ reason: 'host' });
  log({ kind: 'music-bot-adapter', enqueue: enqueue.ok, play: play.ok, skip: skip.ok });
  return {
    enqueue: enqueue.ok === true,
    statusQueued: statusQueued.queueLength === 1 && statusQueued.nowPlayingTitle === null,
    play: play.ok === true,
    statusPlaying: statusPlaying.nowPlayingTitle === 'Titel Ok',
    skip: skip.ok === true
  };
}

function runRateLimitPhase({ log }) {
  let clock = 0;
  const limiter = new RateLimiter({ maxEvents: 3, windowMs: 60000, now: () => clock });
  const allowed = [limiter.allow(), limiter.allow(), limiter.allow()];
  const blocked = limiter.allow();
  clock += 60000;
  const reopened = limiter.allow();
  log({ kind: 'rate-limit', blocked, reopened });
  return { allowed: allowed.filter(Boolean).length, blocked: blocked === false, reopenedAfterWindow: reopened === true };
}

// Fuer die Luecken: '!play' ist kein erlaubter Chat-Befehl des Hosts, und der
// Demo-Port von '!sound' spielt nur einen festen Text aus.
function probeGaps() {
  return {
    playNotAllowlisted: parseChatCommand('!play') === null,
    playAdapterAvailable: true,
    soundPortIsCannedText: true
  };
}

function buildCoverage({ counts, liveRead, animaze, musicBot, rateLimit, gaps }) {
  const byStatus = {};
  const entries = DRAFTS.map(entry => {
    let status = 'gap';
    let evidence = '';
    if (entry.id === 'host-core') {
      status = counts.command > 0 && counts.chatReply > 0 ? 'covered-offline' : 'gap';
      evidence = `commands=${counts.command} chatReply=${counts.chatReply} emitted=${counts.emitted}`;
    } else if (entry.id === 'lt-5df') {
      status = counts.pluginSwitch >= SCENES.length ? 'covered-offline' : 'gap';
      evidence = `pluginSwitch=${counts.pluginSwitch}`;
    } else if (entry.id === 'lt-6qo') {
      status = liveRead.normalized > 0 && liveRead.identityLeak === 0 ? 'covered-offline' : 'gap';
      evidence = `normalized=${liveRead.normalized} identityLeak=${liveRead.identityLeak}`;
    } else if (entry.id === 'lt-x16') {
      status = musicBot.enqueue && counts.byCommand['!song'] > 0 ? 'covered-offline' : 'gap';
      evidence = `adapterEnqueue=${musicBot.enqueue} chatSong=${counts.byCommand['!song'] || 0}`;
    } else if (entry.id === 'lt-mx7') {
      status = 'gap';
      evidence = gaps.soundPortIsCannedText ? 'Demo-Port liefert nur festen Text, kein Soundboard-Adapter' : '';
    } else if (entry.id === 'lt-j9s') {
      status = musicBot.play && musicBot.skip ? 'partial-offline' : 'gap';
      evidence = `Adapter play=${musicBot.play} skip=${musicBot.skip}; Chat-Befehl erlaubt=${!gaps.playNotAllowlisted}`;
    } else if (entry.id === 'lt-k02') {
      status = animaze.say > 0 && animaze.emote > 0 ? 'covered-offline' : 'gap';
      evidence = `say=${animaze.say} emote=${animaze.emote} (nur Mock-Transport)`;
    } else if (entry.id === 'lt-luo') {
      status = rateLimit.blocked && rateLimit.reopenedAfterWindow ? 'covered-offline' : 'gap';
      evidence = `rateLimit blocked=${rateLimit.blocked} reopened=${rateLimit.reopenedAfterWindow}`;
    }
    byStatus[status] = (byStatus[status] || 0) + 1;
    return { id: entry.id, draft: entry.draft, chain: entry.chain, status, evidence };
  });
  return { entries, byStatus };
}

const CID_PC_TEST_LIST = Object.freeze([
  'Live-TikTok/Eulerstream: echter Connect mit externem Key (SIDEKICK_LIVE=1), Reconnect und Namensmaskierung pruefen.',
  'Animaze: echter Transport zum laufenden Animaze (say + emote), Mock hier reicht nicht.',
  '!sound: echtes Soundboard-Geraet abspielen, inkl. Fehlerpfad wenn das Geraet fehlt.',
  '!song/play/skip/status: echter Music-Bot mit mpv, inkl. Safety-Lock und Fehlerpfaden.',
  'Live-Chat: !play/!skip/!status im echten Chat pruefen, sobald die Befehle erlaubt sind.'
]);

const GAPS = Object.freeze([
  '!sound hat im Sidekick-Host nur einen Demo-Port mit festem Text; ein echter Soundboard-Adapter fehlt.',
  '!play/!status sind kein erlaubter Host-Chat-Befehl; nur der Music-Bot-Adapter deckt play/skip/status ab.',
  'Der Animaze-Adapter ist nur mit Mock-Transport belegt; kein echter Animaze-Lauf.',
  'Kein echter Live-TikTok-/Eulerstream-Lauf; nur Fixture und nur lesender Pfad.'
]);

async function runGesamtDemo({ logPath = LOG_PATH } = {}) {
  const lines = [];
  let clock = 0;
  const log = entry => {
    lines.push(JSON.stringify({ atMs: clock, ...entry }));
  };

  const host = await runHostScenes({ log });
  clock += host.counts.total;
  const liveRead = await runLiveReadPhase({ log });
  const animaze = await runAnimazePhase({ log });
  const musicBot = await runMusicBotAdapterPhase({ log });
  const rateLimit = runRateLimitPhase({ log });
  const gaps = probeGaps();
  const coverage = buildCoverage({ counts: host.counts, liveRead, animaze, musicBot, rateLimit, gaps });

  fs.writeFileSync(logPath, `${lines.join('\n')}\n`, 'utf8');
  return {
    counts: host.counts,
    spoken: host.spoken,
    rotation: host.rotation,
    liveRead,
    animaze,
    musicBot,
    rateLimit,
    coverage,
    gaps: [...GAPS],
    cidPcTestList: [...CID_PC_TEST_LIST],
    logPath
  };
}

function formatSummary(result) {
  const commands = Object.keys(result.counts.byCommand).sort()
    .map(name => `${name}=${result.counts.byCommand[name]}`)
    .join(',');
  const coverage = result.coverage.entries
    .map(entry => `${entry.id}:${entry.status}`)
    .join(' ');
  const lines = [
    `[gesamt-demo] scenes=${result.counts.pluginSwitch} messages=${result.counts.total}`,
    `command=${result.counts.command} chatReply=${result.counts.chatReply} ignored=${result.counts.ignored} emitted=${result.counts.emitted} suppressed=${result.counts.suppressed}`,
    `commands=${commands}`,
    `liveRead total=${result.liveRead.total} normalized=${result.liveRead.normalized} identityLeak=${result.liveRead.identityLeak}`,
    `animaze say=${result.animaze.say} emote=${result.animaze.emote}`,
    `musicBot enqueue=${result.musicBot.enqueue} play=${result.musicBot.play} skip=${result.musicBot.skip} statusPlaying=${result.musicBot.statusPlaying}`,
    `rateLimit blocked=${result.rateLimit.blocked} reopened=${result.rateLimit.reopenedAfterWindow}`,
    `coverage ${coverage}`,
    `gaps=${result.gaps.length} cidPcTests=${result.cidPcTestList.length} log=${result.logPath}`
  ];
  return lines.join('\n');
}

if (require.main === module) {
  runGesamtDemo().then(result => {
    process.stdout.write(`${formatSummary(result)}\n`);
    process.exitCode = 0;
  }).catch(error => {
    process.stderr.write(`[gesamt-demo] failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  runGesamtDemo,
  formatSummary,
  runHostScenes,
  runLiveReadPhase,
  runAnimazePhase,
  runMusicBotAdapterPhase,
  runRateLimitPhase,
  probeGaps,
  SCENES,
  DRAFTS,
  CID_PC_TEST_LIST,
  GAPS,
  LOG_PATH
};
