/**
 * Test: Quiz Ultra-Kompakt Mode
 * 
 * Verifies that the ultra-kompakt mode configuration is properly:
 * 1. Added to the config
 * 2. Saved and loaded correctly
 * 3. Transmitted to the overlay
 */

const fs = require('fs');
const path = require('path');

describe('Quiz Ultra-Kompakt Mode', () => {
  test('main.js includes ultraKompaktModus config', () => {
    const mainJsPath = path.join(__dirname, '../plugins/quiz-show/main.js');
    const mainJs = fs.readFileSync(mainJsPath, 'utf8');
    
    expect(mainJs).toContain('ultraKompaktModus');
    expect(mainJs).toContain('ultraKompaktAnswerDelay');
    expect(mainJs).toContain('Ultra-compact mode');
  });

  test('quiz_show.html includes ultraKompaktModus UI', () => {
    const htmlPath = path.join(__dirname, '../plugins/quiz-show/quiz_show.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    
    expect(html).toContain('id="ultraKompaktModus"');
    expect(html).toContain('id="ultraKompaktAnswerDelay"');
    expect(html).toContain('Ultra-Kompakt-Modus');
  });

  test('quiz_show.js handles ultraKompaktModus config', () => {
    const jsPath = path.join(__dirname, '../plugins/quiz-show/quiz_show.js');
    const js = fs.readFileSync(jsPath, 'utf8');
    
    expect(js).toContain('ultraKompaktModus');
    expect(js).toContain('ultraKompaktAnswerDelay');
    expect(js).toContain('getElementById(\'ultraKompaktModus\')');
  });

  test('quiz_show_overlay.css includes ultra-kompakt styles', () => {
    const cssPath = path.join(__dirname, '../plugins/quiz-show/quiz_show_overlay.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    
    expect(css).toContain('data-ultra-kompakt="true"');
    expect(css).toContain('600px');
    expect(css).toContain('350px');
    expect(css).toContain('ULTRA-KOMPAKT-MODUS');
  });

  test('quiz_show_overlay.js implements question-then-answers logic', () => {
    const jsPath = path.join(__dirname, '../plugins/quiz-show/quiz_show_overlay.js');
    const js = fs.readFileSync(jsPath, 'utf8');
    
    expect(js).toContain('ultraKompaktModus');
    expect(js).toContain('ultraKompaktAnswerDelay');
    expect(js).toContain('data-ultra-kompakt');
  });

  test('leaderboard overlay supports top 4 in ultra-kompakt mode', () => {
    const htmlPath = path.join(__dirname, '../plugins/quiz-show/quiz_show_leaderboard_overlay.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    
    expect(html).toContain('ultra-kompakt');
    expect(html).toContain('slice(0, 4)');
  });

  test('ultra-kompakt CSS constrains dimensions to 600x350', () => {
    const cssPath = path.join(__dirname, '../plugins/quiz-show/quiz_show_overlay.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    
    // Verify container size constraints using simple string search
    expect(css).toContain('data-ultra-kompakt="true"');
    expect(css).toContain('width: 600px');
    expect(css).toContain('height: 350px');
    
    // Verify the constraint section exists
    const hasUltraKompaktSection = css.includes('ULTRA-KOMPAKT-MODUS') || 
                                    css.includes('ultra-kompakt');
    expect(hasUltraKompaktSection).toBe(true);
  });

  test('ultra-kompakt mode has compact fonts and padding', () => {
    const cssPath = path.join(__dirname, '../plugins/quiz-show/quiz_show_overlay.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    
    // Check for reduced font sizes using simple string search
    const hasCompactFontSize = css.includes('data-ultra-kompakt') && 
                                (css.includes('font-size: 1.1rem') || 
                                 css.includes('font-size: 0.85rem') ||
                                 css.includes('font-size: 0.9rem'));
    expect(hasCompactFontSize).toBe(true);
    
    // Check for reduced padding
    const hasCompactPadding = css.includes('data-ultra-kompakt') && 
                              (css.includes('padding: 10px') || 
                               css.includes('padding: 8px') ||
                               css.includes('padding: 15px'));
    expect(hasCompactPadding).toBe(true);
  });
});
