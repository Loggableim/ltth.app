/**
 * Test for UI collapsible sections toggle functionality
 * This test verifies that the toggleConfigSection function is properly defined
 * and accessible in the UI HTML file
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

describe('Interactive Story UI - Collapsible Sections', () => {
  let uiHtml;

  // Constants for test configuration
  const EXPECTED_SECTION_COUNT = 6; // Total number of collapsible sections in the UI

  beforeAll(() => {
    // Load the UI HTML file
    const uiPath = path.join(__dirname, '../ui.html');
    uiHtml = fs.readFileSync(uiPath, 'utf8');
  });

  test('UI HTML file should exist', () => {
    expect(uiHtml).toBeTruthy();
    expect(uiHtml.length).toBeGreaterThan(0);
  });

  test('toggleConfigSection function should be defined with window attachment', () => {
    // Check that the function is attached to window object
    expect(uiHtml).toContain('window.toggleConfigSection');
  });

  test('toggleConfigSection should have null checks', () => {
    // Check for defensive null checks
    expect(uiHtml).toContain('if (!headerElement)');
    expect(uiHtml).toContain('if (!section)');
  });

  test('toggleConfigSection should toggle collapsed class', () => {
    // Check that the function toggles the collapsed class
    expect(uiHtml).toContain("section.classList.toggle('collapsed')");
  });

  test('all config section headers should have onclick handlers', () => {
    // Count onclick="toggleConfigSection(this)" occurrences
    const matches = uiHtml.match(/onclick="toggleConfigSection\(this\)"/g);
    expect(matches).toBeTruthy();
    expect(matches.length).toBeGreaterThanOrEqual(EXPECTED_SECTION_COUNT);
  });

  test('timing configuration section should have onclick handler', () => {
    // Check for Timing Configuration section with onclick handler
    const hasTimingSection = uiHtml.includes('Timing Configuration');
    const timingIndex = uiHtml.indexOf('Timing Configuration');
    const timingSectionStart = uiHtml.lastIndexOf('<div class="config-section collapsed">', timingIndex);
    const nearbyOnclick = uiHtml.substring(timingSectionStart, timingIndex).includes('onclick="toggleConfigSection(this)"');
    
    expect(hasTimingSection).toBe(true);
    expect(nearbyOnclick).toBe(true);
  });

  test('advanced settings section should have onclick handler', () => {
    // Check for Advanced Settings section with onclick handler
    const hasAdvancedSection = uiHtml.includes('Advanced Settings');
    const advancedIndex = uiHtml.indexOf('Advanced Settings');
    const advancedSectionStart = uiHtml.lastIndexOf('<div class="config-section collapsed">', advancedIndex);
    const nearbyOnclick = uiHtml.substring(advancedSectionStart, advancedIndex).includes('onclick="toggleConfigSection(this)"');
    
    expect(hasAdvancedSection).toBe(true);
    expect(nearbyOnclick).toBe(true);
  });

  test('collapsed sections should have proper CSS classes', () => {
    // Check for CSS class definitions
    expect(uiHtml).toContain('.config-section.collapsed');
    expect(uiHtml).toContain('.config-section-header');
    expect(uiHtml).toContain('.config-section-content');
  });

  test('timing configuration should start collapsed', () => {
    // Find the Timing Configuration section
    const timingSectionRegex = /<div class="config-section collapsed">[\s\S]*?Timing Configuration/;
    expect(uiHtml).toMatch(timingSectionRegex);
  });

  test('advanced settings should start collapsed', () => {
    // Find the Advanced Settings section  
    const advancedSectionRegex = /<div class="config-section collapsed">[\s\S]*?Advanced Settings/;
    expect(uiHtml).toMatch(advancedSectionRegex);
  });

  test('CSS should hide collapsed section content', () => {
    // Check for CSS rule that hides collapsed content
    expect(uiHtml).toContain('.config-section.collapsed .config-section-content');
    expect(uiHtml).toContain('max-height: 0');
    expect(uiHtml).toContain('opacity: 0');
  });

  test('function should log toggle events for debugging', () => {
    // Check for console.log statements
    expect(uiHtml).toContain('console.log');
    expect(uiHtml).toMatch(/Section toggled.*collapsed.*expanded/);
  });
});
test('requires the Story Studio wiring contract', () => { const source = fs.readFileSync(path.join(__dirname, '../ui.html'), 'utf8'); expect(source).toContain('storyMode: document.getElementById(\'storyMode\').value'); expect(source).toContain('dndJoinKeyword: document.getElementById(\'dndJoinKeyword\').value.trim()'); expect(source).toContain('fishaudioModel: document.getElementById(\'fishaudioModel\').value'); expect(source).toContain('function renderDndParticipantRoster'); expect(source).toContain("socket.on('story:dnd-participants-updated'"); expect(source).toContain('function sendPreviewLayoutAction'); expect(source).not.toContain('openRouterApiKey: document.getElementById(\'openRouterApiKey\').value.trim()'); });

test('moving the Start Story control into the configuration form does not turn it into a save submitter', () => {
  const source = fs.readFileSync(path.join(__dirname, '../ui.html'), 'utf8');
  const document = new JSDOM(source).window.document;
  const configForm = document.getElementById('configForm');
  const studioStartSlot = document.getElementById('storyStudioStartSlot');
  const startSection = document.getElementById('startStorySection');

  studioStartSlot.appendChild(startSection);

  const startButton = document.getElementById('startStoryBtn');
  expect(startButton.form).toBe(configForm);
  expect(startButton.type).toBe('button');
});
