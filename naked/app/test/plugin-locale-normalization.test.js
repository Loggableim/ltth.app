const PluginLoader = require('../modules/plugin-loader');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDirs = [];

function createLoader() {
    const pluginsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-plugin-locale-'));
    tempDirs.push(pluginsDir);
    const app = { use: jest.fn() };
    const loader = new PluginLoader(pluginsDir, app, null, null, {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    });
    return loader;
}

describe('Plugin locale normalization', () => {
    afterEach(() => {
        while (tempDirs.length > 0) {
            fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
        }
    });

    test('normalizes regional and underscored locale codes for plugin descriptions', () => {
        const loader = createLoader();
        const manifest = {
            description: 'Legacy fallback',
            descriptions: {
                en: 'English description',
                de: 'Deutsche Beschreibung',
                es: 'Descripcion espanola',
                fr: 'Description francaise'
            }
        };

        expect(loader.getLocalizedDescription(manifest, 'de-DE')).toBe('Deutsche Beschreibung');
        expect(loader.getLocalizedDescription(manifest, 'de_AT')).toBe('Deutsche Beschreibung');
        expect(loader.getLocalizedDescription(manifest, 'es-MX')).toBe('Descripcion espanola');
        expect(loader.getLocalizedDescription(manifest, 'fr_CA')).toBe('Description francaise');
    });

    test('falls back to English description before legacy manifest description', () => {
        const loader = createLoader();
        const manifest = {
            description: 'Legacy fallback',
            descriptions: {
                en: 'English description',
                de: 'Deutsche Beschreibung'
            }
        };

        expect(loader.getLocalizedDescription(manifest, 'it-IT')).toBe('English description');
    });
});
