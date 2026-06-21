/**
 * Regression tests for gift repeat playback.
 *
 * TikTok repeatCount describes the size of a gift streak. It must not be
 * expanded into multiple backend soundboard:play events, because queue and
 * overlap behaviour is handled in the dashboard/OBS frontend.
 */

const fs = require('fs');
const path = require('path');

function extractMethod(source, name) {
    const match = source.match(new RegExp(`\\n\\s*async ${name}\\([^)]*\\)\\s*\\{`));
    expect(match).toBeTruthy();

    let index = match.index + match[0].lastIndexOf('{');
    let depth = 0;
    for (; index < source.length; index++) {
        const char = source[index];
        if (char === '{') depth++;
        if (char === '}') depth--;
        if (depth === 0) {
            return source.slice(match.index, index + 1);
        }
    }

    throw new Error(`Could not extract ${name}`);
}

describe('Soundboard gift repeat playback', () => {
    let soundboardMainJs;
    let playGiftSoundCode;

    beforeAll(() => {
        const filePath = path.join(__dirname, '../plugins/soundboard/main.js');
        soundboardMainJs = fs.readFileSync(filePath, 'utf8');
        playGiftSoundCode = extractMethod(soundboardMainJs, 'playGiftSound');
    });

    test('does not schedule repeated backend audio playback from repeatCount', () => {
        expect(playGiftSoundCode).not.toContain('setTimeout');
        expect(playGiftSoundCode).not.toContain('STAGGER_INTERVAL_MS');
        expect(playGiftSoundCode).not.toContain('MAX_REPEAT_TRIGGERS');
        expect(playGiftSoundCode).not.toContain('_repeatTimers');
    });

    test('passes repeatCount as metadata instead of replaying the sound', () => {
        expect(playGiftSoundCode).toContain('repeatCount');
        expect(playGiftSoundCode).toContain('eventType: \'gift\'');
        expect(playGiftSoundCode).toMatch(/repeatCount\s*\n\s*}\);/);
    });

    test('emitted sound payload preserves repeatCount for display or logging', () => {
        expect(soundboardMainJs).toContain('repeatCount: soundData.repeatCount');
        expect(soundboardMainJs).toContain('repeatCount: Math.max(parseInt(metadata.repeatCount || 1, 10) || 1, 1)');
    });
});
