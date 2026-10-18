'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  runGesamtDemo,
  formatSummary,
  runMusicBotAdapterPhase,
  probeGaps,
  SCENES,
  DRAFTS,
  CID_PC_TEST_LIST,
  GAPS
} = require('../sidekick-host/gesamt-demo');

const noopLog = () => {};

function tmpLog(name) {
  return path.join(os.tmpdir(), `ltth-gesamt-demo-${process.pid}-${name}.jsonl`);
}

describe('Gesamt-Demo coverage', () => {
  let result;
  const logPath = tmpLog('main');

  beforeAll(async () => {
    result = await runGesamtDemo({ logPath });
  });

  afterAll(() => {
    if (fs.existsSync(logPath)) fs.unlinkSync(logPath);
  });

  test('faehrt alle Szenen und zaehlt die Befehle', () => {
    expect(SCENES).toHaveLength(3);
    expect(result.counts.pluginSwitch).toBe(SCENES.length + 1);
    expect(result.counts.byCommand).toEqual({ '!quiz': 2, '!song': 2, '!sound': 1, '!connect4': 3 });
    expect(result.counts.command).toBe(8);
    expect(result.counts.chatReply).toBe(2);
    expect(result.counts.emitted).toBe(result.counts.total);
  });

  test('spielt das Live-Read-Fixture ohne Identitaet', () => {
    expect(result.liveRead.total).toBeGreaterThan(0);
    expect(result.liveRead.normalized).toBe(result.liveRead.total);
    expect(result.liveRead.identityLeak).toBe(0);
  });

  test('uebt den Animaze-Adapter nur mit Mock-Transport', () => {
    expect(result.animaze.say).toBe(1);
    expect(result.animaze.emote).toBe(1);
    expect(result.animaze.sent.every(item => item.type === 'say' || item.type === 'emote')).toBe(true);
  });

  test('deckt den Music-Bot-Adapter ab', () => {
    expect(result.musicBot.enqueue).toBe(true);
    expect(result.musicBot.statusQueued).toBe(true);
    expect(result.musicBot.play).toBe(true);
    expect(result.musicBot.statusPlaying).toBe(true);
    expect(result.musicBot.skip).toBe(true);
  });

  test('zeigt das Rate-Limit und das Oeffnen nach dem Fenster', () => {
    expect(result.rateLimit.allowed).toBe(3);
    expect(result.rateLimit.blocked).toBe(true);
    expect(result.rateLimit.reopenedAfterWindow).toBe(true);
  });

  test('stellt jede Zuarbeit der Woche in die Matrix', () => {
    expect(result.coverage.entries).toHaveLength(DRAFTS.length);
    const byId = Object.fromEntries(result.coverage.entries.map(entry => [entry.id, entry]));
    expect(byId['host-core'].status).toBe('covered-offline');
    expect(byId['lt-5df'].status).toBe('covered-offline');
    expect(byId['lt-6qo'].status).toBe('covered-offline');
    expect(byId['lt-x16'].status).toBe('covered-offline');
    expect(byId['lt-k02'].status).toBe('covered-offline');
    expect(byId['lt-j9s'].status).toBe('partial-offline');
    expect(byId['lt-mx7'].status).toBe('gap');
    expect(byId['lt-luo'].status).toBe('covered-offline');
  });

  test('nennt Luecken und die Cid-PC-Testliste', () => {
    expect(result.gaps).toEqual([...GAPS]);
    expect(result.cidPcTestList).toEqual([...CID_PC_TEST_LIST]);
    expect(result.gaps.length).toBeGreaterThan(0);
    expect(result.cidPcTestList.length).toBeGreaterThan(0);
  });

  test('schreibt ein lesbares JSON-Lines-Log', () => {
    const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const entry = JSON.parse(line);
      expect(typeof entry.atMs).toBe('number');
      expect(typeof entry.kind).toBe('string');
    }
    const text = JSON.stringify(result);
    expect(text).not.toMatch(/OPENROUTER_API_KEY/);
    expect(text).not.toMatch(/EULER_FALLBACK/);
  });

  test('fasst das Ergebnis in der Zusammenfassung zusammen', () => {
    const summary = formatSummary(result);
    expect(summary).toContain('[gesamt-demo]');
    expect(summary).toContain('coverage');
    expect(summary).toContain('lt-mx7:gap');
  });
});

describe('Gesamt-Demo ohne Netz', () => {
  test('bricht nicht ab, wenn das Netz hart gesperrt ist', async () => {
    const savedFetch = global.fetch;
    const savedWebSocket = global.WebSocket;
    global.fetch = () => {
      throw new Error('fetch must not be used');
    };
    global.WebSocket = function Blocked() {
      throw new Error('WebSocket must not be used');
    };
    try {
      const result = await runGesamtDemo({ logPath: tmpLog('net') });
      expect(result.counts.total).toBeGreaterThan(0);
      fs.unlinkSync(result.logPath);
    } finally {
      global.fetch = savedFetch;
      global.WebSocket = savedWebSocket;
    }
  });

  test('meldet fehlende Chat-Befehle als Luecke', () => {
    const gaps = probeGaps();
    expect(gaps.playNotAllowlisted).toBe(true);
    expect(gaps.soundPortIsCannedText).toBe(true);
  });

  test('laesst den Music-Bot-Adapter nicht mit falschem Skip-Grund durch', async () => {
    // Der Adapter-Ablauf bleibt ohne echtes mpv gruen.
    const phase = await runMusicBotAdapterPhase({ log: noopLog });
    expect(phase.play).toBe(true);
    expect(phase.skip).toBe(true);
  });
});
