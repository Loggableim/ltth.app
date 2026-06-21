/**
 * Fireworks Queue System Test
 * Tests the rate limiting queue functionality for lag prevention
 */

describe('Fireworks Queue System', () => {
    let mainCode;

    beforeAll(() => {
        const fs = require('fs');
        mainCode = fs.readFileSync('./plugins/fireworks/main.js', 'utf-8');
    });

    describe('Queue Configuration', () => {
        test('should have queueEnabled configuration option', () => {
            expect(mainCode).toContain('queueEnabled: false');
        });

        test('should have maxRocketsPerSecond configuration option', () => {
            expect(mainCode).toContain('maxRocketsPerSecond: 5');
        });

        test('should include queue configuration in default config', () => {
            expect(mainCode).toMatch(/Queue system.*lag prevention/i);
        });
    });

    describe('Queue State Tracking', () => {
        test('should initialize queueTimestamps array', () => {
            expect(mainCode).toContain('this.queueTimestamps = []');
        });

        test('should track timestamps in constructor', () => {
            expect(mainCode).toMatch(/queueTimestamps.*Track timestamps of recent triggers/);
        });

        test('should clear queue on plugin destroy', () => {
            expect(mainCode).toMatch(/destroy[\s\S]*?this\.queueTimestamps = \[\]/);
        });
    });

    describe('Queue Rate Limiting Logic', () => {
        test('should have shouldAllowFirework method', () => {
            expect(mainCode).toContain('shouldAllowFirework()');
        });

        test('shouldAllowFirework should check queueEnabled flag', () => {
            expect(mainCode).toMatch(/shouldAllowFirework[\s\S]*?queueEnabled/);
        });

        test('should allow all fireworks when queue is disabled', () => {
            expect(mainCode).toMatch(/!this\.config\.queueEnabled[\s\S]*?return true/);
        });

        test('should filter old timestamps outside time window', () => {
            expect(mainCode).toMatch(/queueTimestamps.*filter.*now - timestamp < timeWindow/);
        });

        test('should check rate limit before triggering', () => {
            expect(mainCode).toMatch(/queueTimestamps\.length >= maxPerSecond/);
        });

        test('should add timestamp when allowing firework', () => {
            expect(mainCode).toMatch(/queueTimestamps\.push\(now\)/);
        });

        test('should enforce maxRocketsPerSecond limit', () => {
            expect(mainCode).toMatch(/Math\.max.*Math\.min.*maxRocketsPerSecond/);
        });

        test('should use 1 second time window', () => {
            expect(mainCode).toMatch(/timeWindow = 1000/);
        });
    });

    describe('Queue Integration with triggerFirework', () => {
        test('triggerFirework should check queue before triggering', () => {
            expect(mainCode).toMatch(/triggerFirework[\s\S]*?shouldAllowFirework/);
        });

        test('should support bypass for manual triggers', () => {
            expect(mainCode).toMatch(/bypassEnabled.*shouldAllowFirework/);
        });

        test('should log when firework is rate limited', () => {
            expect(mainCode).toMatch(/skipped due to rate limit/i);
        });

        test('should return early when rate limited', () => {
            expect(mainCode).toMatch(/shouldAllowFirework\(\)[\s\S]{0,100}return/);
        });
    });

    describe('Queue UI Configuration', () => {
        let settingsHtml;
        let settingsJs;

        beforeAll(() => {
            const fs = require('fs');
            settingsHtml = fs.readFileSync('./plugins/fireworks/ui/settings.html', 'utf-8');
            settingsJs = fs.readFileSync('./plugins/fireworks/ui/settings.js', 'utf-8');
        });

        test('should have queue enabled toggle in UI', () => {
            expect(settingsHtml).toContain('queue-enabled-toggle');
            expect(settingsHtml).toContain('queueEnabled');
        });

        test('should have max rockets per second slider in UI', () => {
            expect(settingsHtml).toContain('max-rockets-per-second');
            expect(settingsHtml).toContain('maxRocketsPerSecond');
        });

        test('should have queue system section label', () => {
            expect(settingsHtml).toMatch(/Queue System.*Lag Prevention/i);
        });

        test('should display rate limiting description', () => {
            expect(settingsHtml).toMatch(/Limit the number of fireworks per second/i);
        });

        test('should have slider range from 1 to 20', () => {
            expect(settingsHtml).toMatch(/max-rockets-per-second.*min="1".*max="20"/s);
        });

        test('should initialize queue toggle in JS', () => {
            expect(settingsJs).toContain('queue-enabled-toggle');
            expect(settingsJs).toContain('queueEnabled');
        });

        test('should initialize max rockets slider in JS', () => {
            expect(settingsJs).toContain('max-rockets-per-second');
            expect(settingsJs).toContain('maxRocketsPerSecond');
        });

        test('should update slider value display', () => {
            expect(settingsJs).toContain('max-rockets-value');
        });
    });

    describe('Queue Performance Benefits', () => {
        test('should log rate limit messages at debug level', () => {
            expect(mainCode).toMatch(/Rate limit reached[\s\S]*?'debug'/);
        });

        test('should include current limit info in log message', () => {
            expect(mainCode).toMatch(/Rate limit reached.*queueTimestamps\.length.*maxPerSecond/);
        });

        test('should clean up old timestamps efficiently', () => {
            // Filter is more efficient than loop + splice
            expect(mainCode).toMatch(/queueTimestamps.*filter/);
        });
    });
});
