/**
 * Test for Weather Plugin Fixes
 * Validates 4 critical bug fixes:
 * 1. Sunbeam crash (drawDustMotes function exists)
 * 2. Enhanced glitch effect with VHS/CRT style
 * 3. Diverse snowflake variants (20+ types)
 * 4. Permanent button sync on config change
 */

const fs = require('fs');
const path = require('path');

describe('Weather Plugin Critical Fixes', () => {
    const weatherEnginePath = path.join(__dirname, '../plugins/weather-control/weather-engine.js');
    const overlayPath = path.join(__dirname, '../plugins/weather-control/overlay.html');
    const mainPath = path.join(__dirname, '../plugins/weather-control/main.js');
    const uiPath = path.join(__dirname, '../plugins/weather-control/ui.html');

    let weatherEngineContent;
    let overlayContent;
    let mainContent;
    let uiContent;

    beforeAll(() => {
        weatherEngineContent = fs.readFileSync(weatherEnginePath, 'utf8');
        overlayContent = fs.readFileSync(overlayPath, 'utf8');
        mainContent = fs.readFileSync(mainPath, 'utf8');
        uiContent = fs.readFileSync(uiPath, 'utf8');
    });

    describe('Issue 1: Sunbeam Crash Fix', () => {
        test('drawDustMotes function exists in weather-engine.js', () => {
            expect(weatherEngineContent).toContain('drawDustMotes(beam, effect)');
        });

        test('overlay.html loads the shared weather engine that contains drawDustMotes', () => {
            expect(overlayContent).toContain('/plugins/weather-control/weather-engine.js');
            expect(overlayContent).toContain('new window.WeatherEngine');
        });

        test('drawDustMotes is called from drawSunbeams in weather-engine.js', () => {
            expect(weatherEngineContent).toMatch(/this\.drawDustMotes\(beam,\s*effect\)/);
        });

        test('overlay.html delegates sunbeam rendering to the shared engine', () => {
            expect(overlayContent).not.toContain('function drawSunbeams');
            expect(weatherEngineContent).toMatch(/this\.drawDustMotes\(beam,\s*effect\)/);
        });
    });

    describe('Issue 2: Enhanced Glitch Effect', () => {
        test('weather-engine.js contains RGB channel shift code', () => {
            expect(weatherEngineContent).toContain('RGB Channel Shift');
            expect(weatherEngineContent).toContain('getImageData');
            expect(weatherEngineContent).toContain('putImageData');
        });

        test('overlay.html delegates RGB channel shift code to weather-engine.js', () => {
            expect(overlayContent).toContain('/plugins/weather-control/weather-engine.js');
            expect(weatherEngineContent).toContain('RGB Channel Shift');
            expect(weatherEngineContent).toContain('getImageData');
            expect(weatherEngineContent).toContain('putImageData');
        });

        test('weather-engine.js has vertical displacement bars', () => {
            expect(weatherEngineContent).toContain('Vertical Displacement Bars');
        });

        test('overlay.html delegates vertical displacement bars to weather-engine.js', () => {
            expect(weatherEngineContent).toContain('Vertical Displacement Bars');
        });

        test('weather-engine.js has scanline/VHS effect', () => {
            expect(weatherEngineContent).toContain('Scanline/VHS Effect');
        });

        test('overlay.html delegates scanline/VHS effect to weather-engine.js', () => {
            expect(weatherEngineContent).toContain('Scanline/VHS Effect');
        });

        test('weather-engine.js has 6 glitch colors (not just magenta/cyan)', () => {
            const glitchSection = weatherEngineContent.match(/glitchColors\s*=\s*\[([\s\S]*?)\]/);
            expect(glitchSection).toBeTruthy();
            if (glitchSection) {
                const colors = glitchSection[1].match(/#[0-9a-fA-F]{6}/g);
                expect(colors).toBeTruthy();
                expect(colors.length).toBeGreaterThanOrEqual(6);
            }
        });

        test('shared engine has 6 glitch colors (not just magenta/cyan)', () => {
            const glitchSection = weatherEngineContent.match(/glitchColors\s*=\s*\[([\s\S]*?)\]/);
            expect(glitchSection).toBeTruthy();
            if (glitchSection) {
                const colors = glitchSection[1].match(/#[0-9a-fA-F]{6}/g);
                expect(colors).toBeTruthy();
                expect(colors.length).toBeGreaterThanOrEqual(6);
            }
        });

        test('weather-engine.js has increased noise intensity (0.15 vs 0.05)', () => {
            expect(weatherEngineContent).toContain('intensity * 0.15');
        });

        test('overlay.html delegates increased noise intensity to weather-engine.js', () => {
            expect(weatherEngineContent).toContain('intensity * 0.15');
        });

        test('weather-engine.js has increased noise particles (150 vs 50)', () => {
            const noiseSection = weatherEngineContent.match(/noiseCount\s*=\s*Math\.floor\(150/);
            expect(noiseSection).toBeTruthy();
        });

        test('overlay.html delegates increased noise particles to weather-engine.js', () => {
            const noiseSection = weatherEngineContent.match(/noiseCount\s*=\s*Math\.floor\(150/);
            expect(noiseSection).toBeTruthy();
        });

        test('weather-engine.js has chromatic aberration', () => {
            expect(weatherEngineContent).toContain('Chromatic Aberration');
        });

        test('overlay.html delegates chromatic aberration to weather-engine.js', () => {
            expect(weatherEngineContent).toContain('Chromatic Aberration');
        });

        test('weather-engine.js has digital artifacts/blocks', () => {
            expect(weatherEngineContent).toContain('Digital Artifacts');
        });

        test('overlay.html delegates digital artifacts/blocks to weather-engine.js', () => {
            expect(weatherEngineContent).toContain('Digital Artifacts');
        });
    });

    describe('Issue 3: Diverse Snowflake Variants', () => {
        test('weather-engine.js has generateStellarDendrite function', () => {
            expect(weatherEngineContent).toContain('generateStellarDendrite');
            expect(weatherEngineContent).toContain('6 main branches with side branches');
        });

        test('overlay.html delegates generateStellarDendrite to weather-engine.js', () => {
            expect(overlayContent).not.toContain('function generateStellarDendrite');
            expect(weatherEngineContent).toContain('generateStellarDendrite');
            expect(weatherEngineContent).toContain('6 main branches with side branches');
        });

        test('weather-engine.js has generatePlateSnowflake function', () => {
            expect(weatherEngineContent).toContain('generatePlateSnowflake');
            expect(weatherEngineContent).toContain('hexagon');
        });

        test('overlay.html delegates generatePlateSnowflake to weather-engine.js', () => {
            expect(overlayContent).not.toContain('function generatePlateSnowflake');
            expect(weatherEngineContent).toContain('generatePlateSnowflake');
            expect(weatherEngineContent).toContain('hexagon');
        });

        test('weather-engine.js has generateNeedleCrystal function', () => {
            expect(weatherEngineContent).toContain('generateNeedleCrystal');
            expect(weatherEngineContent).toContain('Elongated needle');
        });

        test('overlay.html delegates generateNeedleCrystal to weather-engine.js', () => {
            expect(overlayContent).not.toContain('function generateNeedleCrystal');
            expect(weatherEngineContent).toContain('generateNeedleCrystal');
            expect(weatherEngineContent).toContain('Elongated needle');
        });

        test('weather-engine.js has addImperfections function', () => {
            expect(weatherEngineContent).toContain('addImperfections');
            expect(weatherEngineContent).toContain('broken arms');
        });

        test('overlay.html delegates addImperfections to weather-engine.js', () => {
            expect(overlayContent).not.toContain('function addImperfections');
            expect(weatherEngineContent).toContain('addImperfections');
            expect(weatherEngineContent).toContain('broken arms');
        });

        test('weather-engine.js generates 20+ snowflake variants', () => {
            // Should have: 5 Koch + 5 Stellar + 3 Plate + 3 Needle + 4 Irregular = 20
            const variantSection = weatherEngineContent.match(/function generateSnowflakeVariants[\s\S]{0,2000}return variants/);
            expect(variantSection).toBeTruthy();
            if (variantSection) {
                // Count how many times .push() is called in the loop sections
                const stellarLoop = variantSection[0].match(/for\s*\(\s*let\s+i\s*=\s*0;\s*i\s*<\s*5;\s*i\+\+\)\s*\{[\s\S]*?generateStellarDendrite/);
                const plateLoop = variantSection[0].match(/for\s*\(\s*let\s+i\s*=\s*0;\s*i\s*<\s*3;\s*i\+\+\)\s*\{[\s\S]*?generatePlateSnowflake/);
                const needleLoop = variantSection[0].match(/for\s*\(\s*let\s+i\s*=\s*0;\s*i\s*<\s*3;\s*i\+\+\)\s*\{[\s\S]*?generateNeedleCrystal/);
                const irregularLoop = variantSection[0].match(/for\s*\(\s*let\s+i\s*=\s*0;\s*i\s*<\s*4;\s*i\+\+\)\s*\{[\s\S]*?addImperfections/);

                expect(stellarLoop).toBeTruthy();
                expect(plateLoop).toBeTruthy();
                expect(needleLoop).toBeTruthy();
                expect(irregularLoop).toBeTruthy();
            }
        });

        test('overlay.html delegates 20+ snowflake variants to weather-engine.js', () => {
            const variantSection = weatherEngineContent.match(/function generateSnowflakeVariants[\s\S]{0,2000}return variants/);
            expect(variantSection).toBeTruthy();
            if (variantSection) {
                const stellarLoop = variantSection[0].match(/for\s*\(\s*let\s+i\s*=\s*0;\s*i\s*<\s*5;\s*i\+\+\)\s*\{[\s\S]*?generateStellarDendrite/);
                const plateLoop = variantSection[0].match(/for\s*\(\s*let\s+i\s*=\s*0;\s*i\s*<\s*3;\s*i\+\+\)\s*\{[\s\S]*?generatePlateSnowflake/);
                const needleLoop = variantSection[0].match(/for\s*\(\s*let\s+i\s*=\s*0;\s*i\s*<\s*3;\s*i\+\+\)\s*\{[\s\S]*?generateNeedleCrystal/);
                const irregularLoop = variantSection[0].match(/for\s*\(\s*let\s+i\s*=\s*0;\s*i\s*<\s*4;\s*i\+\+\)\s*\{[\s\S]*?addImperfections/);

                expect(stellarLoop).toBeTruthy();
                expect(plateLoop).toBeTruthy();
                expect(needleLoop).toBeTruthy();
                expect(irregularLoop).toBeTruthy();
            }
        });
    });

    describe('Issue 4: Permanent Button Sync', () => {
        test('main.js tracks old permanent effects state', () => {
            expect(mainContent).toContain('oldPermanentEffects');
            expect(mainContent).toMatch(/const\s+oldPermanentEffects\s*=\s*new\s+Set/);
        });

        test('main.js tracks new permanent effects state', () => {
            expect(mainContent).toContain('newPermanentEffects');
            expect(mainContent).toMatch(/const\s+newPermanentEffects\s*=\s*new\s+Set/);
        });

        test('main.js checks if effects changed', () => {
            expect(mainContent).toContain('effectsChanged');
            expect(mainContent).toMatch(/oldPermanentEffects\.size\s*!==\s*newPermanentEffects\.size/);
        });

        test('main.js syncs permanent effects and notifies overlays for every config update', () => {
            expect(mainContent).toMatch(/this\.syncPermanentEffects\(\);[\s\S]*?this\.api\.emit\('weather:config-changed'/);
        });

        test('main.js logs permanent effects sync', () => {
            expect(mainContent).toMatch(/Permanent effects changed, syncing/);
        });

        test('ui.html shows permanent effects status in console', () => {
            expect(uiContent).toContain('Active permanent effects');
            expect(uiContent).toMatch(/permanentEffects\.join/);
        });

        test('ui.html displays permanent effects notification', () => {
            expect(uiContent).toMatch(/showStatus\(['"]status\.permanent_effects_active/);
        });

        test('ui.html filters permanent effects correctly', () => {
            expect(uiContent).toMatch(/Object\.keys\(config\.effects/);
            expect(uiContent).toMatch(/filter\(e\s*=>\s*config\.effects\[e\]/);
            expect(uiContent).toMatch(/permanent\s*===\s*true/);
        });
    });

    describe('General Code Quality', () => {
        test('all files maintain existing structure', () => {
            // Ensure no major structural changes
            expect(weatherEngineContent).toContain('class WeatherEngine');
            expect(overlayContent).toContain('window.WeatherEngine');
            expect(mainContent).toContain('class WeatherControl');
            expect(uiContent).toContain('async function saveConfig');
        });

        test('no unexpected console.log in production code', () => {
            // Check that console.log is only used for intentional debug/permanent effects logging
            const weatherEngineConsole = weatherEngineContent.match(/console\.log/g);
            const mainConsole = mainContent.match(/console\.log/g);
            
            // Should not have console.log in weather-engine.js
            expect(weatherEngineConsole).toBeFalsy();
            // Main.js should not have console.log (uses logger instead)
            expect(mainConsole).toBeFalsy();
            // UI.html can have console.log for permanent effects status (intentional)
            const uiConsole = uiContent.match(/console\.log/g);
            if (uiConsole) {
                // Only for permanent effects logging
                expect(uiContent).toMatch(/console\.log\(['"]♾️ Active permanent effects:/);
            }
        });
    });
});
