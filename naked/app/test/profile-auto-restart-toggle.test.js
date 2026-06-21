/**
 * Profile restart behavior
 *
 * Profile switches must always restart the backend because the database,
 * plugins, and profile-scoped services are loaded at server startup.
 */

const fs = require('fs');
const path = require('path');

describe('Profile restart behavior', () => {
    test('profile auto-restart toggle is displayed as always enabled', () => {
        const dashboardHtml = fs.readFileSync(
            path.join(__dirname, '..', 'public', 'dashboard.html'),
            'utf8'
        );

        expect(dashboardHtml).toContain('id="profile-auto-restart-toggle" checked disabled');
        expect(dashboardHtml).toContain('Profilwechsel starten die Anwendung automatisch neu');
    });

    test('dashboard initializes the toggle as checked and disabled', () => {
        const dashboardSource = fs.readFileSync(
            path.join(__dirname, '..', 'public', 'js', 'dashboard.js'),
            'utf8'
        );

        expect(dashboardSource).toContain('toggle.checked = true;');
        expect(dashboardSource).toContain('toggle.disabled = true;');
        expect(dashboardSource).not.toContain("localStorage.getItem('profile_autoRestart') === 'true'");
    });

    test('profile-manager starts restart flow without checking localStorage toggle', () => {
        const profileManagerSource = fs.readFileSync(
            path.join(__dirname, '..', 'public', 'js', 'profile-manager.js'),
            'utf8'
        );

        expect(profileManagerSource).toContain('function showRestartConfirmation(data)');
        expect(profileManagerSource).toContain('beginProfileRestart(data)');
        expect(profileManagerSource).not.toContain("localStorage.getItem('profile_autoRestart') === 'true'");
    });
});
