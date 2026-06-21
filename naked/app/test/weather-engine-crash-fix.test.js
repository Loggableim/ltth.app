/**
 * Test for Weather Engine Crash Fixes
 * Validates critical safety checks in stopEffect() and stopAllEffects()
 * 
 * Bug 1: Crash when stopping effects without particle arrays (sunbeam, thunder, glitchclouds)
 * Bug 2: Effect-specific resources not properly cleaned up
 */

const fs = require('fs');
const path = require('path');

describe('Weather Engine Crash Fixes', () => {
  const weatherEnginePath = path.join(__dirname, '../plugins/weather-control/weather-engine.js');
  let weatherEngineContent;

  beforeAll(() => {
    weatherEngineContent = fs.readFileSync(weatherEnginePath, 'utf8');
  });

  describe('stopEffect() Safety Checks', () => {
    test('stopEffect() checks if particles array exists before iterating', () => {
      // Should check specificEffect.particles exists
      const stopEffectMatch = weatherEngineContent.match(/stopEffect\(type,\s*specificEffect\s*=\s*null\)\s*\{[\s\S]{0,1500}\}/);
      expect(stopEffectMatch).toBeTruthy();
      
      if (stopEffectMatch) {
        const methodBody = stopEffectMatch[0];
        // Should have safety check: if (specificEffect.particles && specificEffect.particles.length > 0)
        expect(methodBody).toMatch(/if\s*\(\s*specificEffect\.particles\s*&&\s*specificEffect\.particles\.length\s*>\s*0\s*\)/);
      }
    });

    test('stopEffect() checks if particles array has length before iterating', () => {
      const stopEffectMatch = weatherEngineContent.match(/stopEffect\(type,\s*specificEffect\s*=\s*null\)\s*\{[\s\S]{0,1500}\}/);
      expect(stopEffectMatch).toBeTruthy();
      
      if (stopEffectMatch) {
        const methodBody = stopEffectMatch[0];
        // Should check length > 0 to avoid iterating empty arrays
        expect(methodBody).toMatch(/specificEffect\.particles\.length\s*>\s*0/);
      }
    });

    test('stopEffect() checks if particle exists before accessing properties', () => {
      const stopEffectMatch = weatherEngineContent.match(/stopEffect\(type,\s*specificEffect\s*=\s*null\)\s*\{[\s\S]{0,1500}\}/);
      expect(stopEffectMatch).toBeTruthy();
      
      if (stopEffectMatch) {
        const methodBody = stopEffectMatch[0];
        // Should check if (p && p.type && this.pools[p.type])
        expect(methodBody).toMatch(/if\s*\(\s*p\s*&&\s*p\.type\s*&&\s*this\.pools\[p\.type\]\s*\)/);
      }
    });

    test('stopEffect() checks if destroy method exists before calling it', () => {
      const stopEffectMatch = weatherEngineContent.match(/stopEffect\(type,\s*specificEffect\s*=\s*null\)\s*\{[\s\S]{0,1500}\}/);
      expect(stopEffectMatch).toBeTruthy();
      
      if (stopEffectMatch) {
        const methodBody = stopEffectMatch[0];
        // Should check: else if (p && typeof p.destroy === 'function')
        expect(methodBody).toMatch(/else\s+if\s*\(\s*p\s*&&\s*typeof\s+p\.destroy\s*===\s*['"]function['"]\s*\)/);
      }
    });

    test('stopEffect() nullifies beams for effect cleanup', () => {
      const stopEffectMatch = weatherEngineContent.match(/stopEffect\(type,\s*specificEffect\s*=\s*null\)\s*\{[\s\S]{0,1500}\}/);
      expect(stopEffectMatch).toBeTruthy();
      
      if (stopEffectMatch) {
        const methodBody = stopEffectMatch[0];
        // Should set specificEffect.beams = null
        expect(methodBody).toMatch(/specificEffect\.beams\s*=\s*null/);
      }
    });

    test('stopEffect() nullifies glitchLines for effect cleanup', () => {
      const stopEffectMatch = weatherEngineContent.match(/stopEffect\(type,\s*specificEffect\s*=\s*null\)\s*\{[\s\S]{0,1500}\}/);
      expect(stopEffectMatch).toBeTruthy();
      
      if (stopEffectMatch) {
        const methodBody = stopEffectMatch[0];
        // Should set specificEffect.glitchLines = null
        expect(methodBody).toMatch(/specificEffect\.glitchLines\s*=\s*null/);
      }
    });

    test('stopEffect() filters particles safely when stopping all effects of a type', () => {
      const stopEffectMatch = weatherEngineContent.match(/stopEffect\(type,\s*specificEffect\s*=\s*null\)\s*\{[\s\S]{0,2500}\}/);
      expect(stopEffectMatch).toBeTruthy();
      
      if (stopEffectMatch) {
        const methodBody = stopEffectMatch[0];
        // Should have safety check for else branch: if (e.particles && e.particles.length > 0)
        expect(methodBody).toMatch(/if\s*\(\s*e\.particles\s*&&\s*e\.particles\.length\s*>\s*0\s*\)/);
        // Should nullify beams and glitchLines in else branch too
        expect(methodBody).toMatch(/e\.beams\s*=\s*null/);
        expect(methodBody).toMatch(/e\.glitchLines\s*=\s*null/);
      }
    });

    test('stopEffect() filters null particles from state.particles', () => {
      const stopEffectMatch = weatherEngineContent.match(/stopEffect\(type,\s*specificEffect\s*=\s*null\)\s*\{[\s\S]{0,1500}\}/);
      expect(stopEffectMatch).toBeTruthy();
      
      if (stopEffectMatch) {
        const methodBody = stopEffectMatch[0];
        // Should filter: this.state.particles = this.state.particles.filter(p => p && p.active)
        expect(methodBody).toMatch(/this\.state\.particles\s*=\s*this\.state\.particles\.filter\(\s*p\s*=>\s*p\s*&&\s*p\.active\s*\)/);
      }
    });
  });

  describe('stopAllEffects() Safety Checks', () => {
    test('stopAllEffects() checks if particles array exists before iterating', () => {
      const stopAllMatch = weatherEngineContent.match(/stopAllEffects\(\)\s*\{[\s\S]{0,1000}\}/);
      expect(stopAllMatch).toBeTruthy();
      
      if (stopAllMatch) {
        const methodBody = stopAllMatch[0];
        // Should have safety check: if (e.particles && e.particles.length > 0)
        expect(methodBody).toMatch(/if\s*\(\s*e\.particles\s*&&\s*e\.particles\.length\s*>\s*0\s*\)/);
      }
    });

    test('stopAllEffects() checks if particle exists before accessing properties', () => {
      const stopAllMatch = weatherEngineContent.match(/stopAllEffects\(\)\s*\{[\s\S]{0,1000}\}/);
      expect(stopAllMatch).toBeTruthy();
      
      if (stopAllMatch) {
        const methodBody = stopAllMatch[0];
        // Should check if (p && p.type && this.pools[p.type])
        expect(methodBody).toMatch(/if\s*\(\s*p\s*&&\s*p\.type\s*&&\s*this\.pools\[p\.type\]\s*\)/);
      }
    });

    test('stopAllEffects() checks if destroy method exists before calling it', () => {
      const stopAllMatch = weatherEngineContent.match(/stopAllEffects\(\)\s*\{[\s\S]{0,1000}\}/);
      expect(stopAllMatch).toBeTruthy();
      
      if (stopAllMatch) {
        const methodBody = stopAllMatch[0];
        // Should check: else if (p && typeof p.destroy === 'function')
        expect(methodBody).toMatch(/else\s+if\s*\(\s*p\s*&&\s*typeof\s+p\.destroy\s*===\s*['"]function['"]\s*\)/);
      }
    });

    test('stopAllEffects() nullifies beams for effect cleanup', () => {
      const stopAllMatch = weatherEngineContent.match(/stopAllEffects\(\)\s*\{[\s\S]{0,1000}\}/);
      expect(stopAllMatch).toBeTruthy();
      
      if (stopAllMatch) {
        const methodBody = stopAllMatch[0];
        // Should set e.beams = null
        expect(methodBody).toMatch(/e\.beams\s*=\s*null/);
      }
    });

    test('stopAllEffects() nullifies glitchLines for effect cleanup', () => {
      const stopAllMatch = weatherEngineContent.match(/stopAllEffects\(\)\s*\{[\s\S]{0,1000}\}/);
      expect(stopAllMatch).toBeTruthy();
      
      if (stopAllMatch) {
        const methodBody = stopAllMatch[0];
        // Should set e.glitchLines = null
        expect(methodBody).toMatch(/e\.glitchLines\s*=\s*null/);
      }
    });

    test('stopAllEffects() clears lightning state', () => {
      const stopAllMatch = weatherEngineContent.match(/stopAllEffects\(\)\s*\{[\s\S]{0,1000}\}/);
      expect(stopAllMatch).toBeTruthy();
      
      if (stopAllMatch) {
        const methodBody = stopAllMatch[0];
        // Should set this.lightningSegments = []
        expect(methodBody).toMatch(/this\.lightningSegments\s*=\s*\[\]/);
        // Should set this.lightningFadeTime = 0
        expect(methodBody).toMatch(/this\.lightningFadeTime\s*=\s*0/);
      }
    });
  });

  describe('render() Sunbeam Safety Check', () => {
    test('render() checks if beams is an array before rendering', () => {
      // Find the render method and check for sunbeam rendering
      const renderMatch = weatherEngineContent.match(/render\(timestamp\)\s*\{[\s\S]{0,5000}/);
      expect(renderMatch).toBeTruthy();
      
      if (renderMatch) {
        const methodBody = renderMatch[0];
        // Should check: if (effect.type === 'sunbeam' && effect.beams && Array.isArray(effect.beams))
        expect(methodBody).toMatch(/if\s*\(\s*effect\.type\s*===\s*['"]sunbeam['"]\s*&&\s*effect\.beams\s*&&\s*Array\.isArray\(\s*effect\.beams\s*\)\s*\)/);
      }
    });
  });

  describe('Code Structure', () => {
    test('weather-engine.js maintains WeatherEngine class structure', () => {
      expect(weatherEngineContent).toContain('class WeatherEngine');
      expect(weatherEngineContent).toContain('stopEffect(type, specificEffect = null)');
      expect(weatherEngineContent).toContain('stopAllEffects()');
    });

    test('no console.log in weather-engine.js', () => {
      const consoleMatches = weatherEngineContent.match(/console\.log/g);
      expect(consoleMatches).toBeFalsy();
    });
  });
});
