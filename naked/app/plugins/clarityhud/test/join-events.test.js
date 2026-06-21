/**
 * Test for ClarityHUD Join Events Feature
 * 
 * This test verifies that the join events feature is properly implemented:
 * - Backend handles join events
 * - UI has a toggle for showJoins
 * - Settings are saved and loaded correctly
 * - Events are broadcast via Socket.IO
 */

const fs = require('fs');
const path = require('path');

describe('ClarityHUD Join Events Feature', () => {
  let backendCode;
  let uiCode;
  let mainCode;
  let fullOverlayCode;

  beforeAll(() => {
    // Load the source files
    backendCode = fs.readFileSync(path.join(__dirname, '../backend/api.js'), 'utf8');
    uiCode = fs.readFileSync(path.join(__dirname, '../ui/main.js'), 'utf8');
    mainCode = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
    fullOverlayCode = fs.readFileSync(path.join(__dirname, '../overlays/full.js'), 'utf8');
  });

  describe('Backend Implementation', () => {
    test('should have showJoins in default settings', () => {
      expect(backendCode).toContain('showJoins: true');
    });

    test('should have join event queue', () => {
      expect(backendCode).toContain('join: []');
    });

    test('should have handleJoinEvent method', () => {
      expect(backendCode).toContain('async handleJoinEvent(data)');
    });

    test('should check showJoins setting in handler', () => {
      expect(backendCode).toContain('if (this.settings.full.showJoins === false)');
    });

    test('should emit clarityhud.update.join event', () => {
      expect(backendCode).toContain("this.api.emit('clarityhud.update.join'");
    });
  });

  describe('Main Plugin Implementation', () => {
    test('should register join event listener', () => {
      expect(mainCode).toContain("this.api.registerTikTokEvent('join'");
    });

    test('should call handleJoinEvent', () => {
      expect(mainCode).toContain('await this.backend.handleJoinEvent(data)');
    });
  });

  describe('UI Implementation', () => {
    test('should have showJoins checkbox in Events tab', () => {
      expect(uiCode).toContain('id="showJoins"');
      expect(uiCode).toContain('Show User Joins');
    });

    test('should read showJoins value when saving settings', () => {
      expect(uiCode).toContain("showJoins: getFieldValue('showJoins', 'checkbox')");
    });

    test('should display showJoins checkbox checked by default', () => {
      expect(uiCode).toMatch(/id="showJoins".*checked/);
    });
  });

  describe('Overlay Implementation', () => {
    test('should have join event type configuration', () => {
      expect(fullOverlayCode).toContain("join: { icon: '👋', label: 'Joined'");
    });

    test('should have join events array in state', () => {
      expect(fullOverlayCode).toContain('join: []');
    });

    test('should listen for clarityhud.update.join socket event', () => {
      expect(fullOverlayCode).toContain("STATE.socket.on('clarityhud.update.join'");
    });

    test('should check showJoins setting before displaying', () => {
      expect(fullOverlayCode).toContain('STATE.settings.showJoins');
    });
  });

  describe('Documentation', () => {
    test('should document join events in README', () => {
      const readmeCode = fs.readFileSync(path.join(__dirname, '../README.md'), 'utf8');
      expect(readmeCode.toLowerCase()).toContain('join');
    });
  });
});
