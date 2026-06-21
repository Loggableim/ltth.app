/**
 * Advanced Timer Route Order Test
 * Verifies that routes are registered in the correct order to prevent 404 errors
 */

const path = require('path');
const fs = require('fs');

describe('Advanced Timer API Route Order', () => {
    const apiFilePath = path.join(__dirname, '..', 'plugins', 'advanced-timer', 'backend', 'api.js');
    
    test('api.js file exists', () => {
        expect(fs.existsSync(apiFilePath)).toBe(true);
    });

    test('specific routes are registered before general :id route', () => {
        const apiContent = fs.readFileSync(apiFilePath, 'utf8');
        
        // Find line numbers of route registrations
        const lines = apiContent.split('\n');
        const routeLines = {};
        
        lines.forEach((line, index) => {
            // Find GET /api/advanced-timer/timers/:id (the general route)
            // Match exactly the general route - it should end with :id' followed by a comma or closing parenthesis
            if (line.includes("registerRoute('get', '/api/advanced-timer/timers/:id'") && 
                line.match(/\/timers\/:id'[,\s)]/)) {
                routeLines.generalTimerId = index;
            }
            
            // Find specific sub-path routes
            if (line.includes("registerRoute('get', '/api/advanced-timer/timers/:id/logs'")) {
                routeLines.logs = index;
            }
            if (line.includes("registerRoute('get', '/api/advanced-timer/timers/:id/export-logs'")) {
                routeLines.exportLogs = index;
            }
            if (line.includes("registerRoute('get', '/api/advanced-timer/timers/:id/events'")) {
                routeLines.events = index;
            }
            if (line.includes("registerRoute('get', '/api/advanced-timer/timers/:id/rules'")) {
                routeLines.rules = index;
            }
            if (line.includes("registerRoute('get', '/api/advanced-timer/timers/:id/chains'")) {
                routeLines.chains = index;
            }
            if (line.includes("registerRoute('post', '/api/advanced-timer/timers/:id/start'")) {
                routeLines.start = index;
            }
            if (line.includes("registerRoute('post', '/api/advanced-timer/timers/:id/add-time'")) {
                routeLines.addTime = index;
            }
        });
        
        // Verify general route exists
        expect(routeLines.generalTimerId).toBeDefined();
        expect(routeLines.generalTimerId).toBeGreaterThan(0);
        
        // Verify all specific routes are registered BEFORE the general :id route
        expect(routeLines.logs).toBeLessThan(routeLines.generalTimerId);
        expect(routeLines.exportLogs).toBeLessThan(routeLines.generalTimerId);
        expect(routeLines.events).toBeLessThan(routeLines.generalTimerId);
        expect(routeLines.rules).toBeLessThan(routeLines.generalTimerId);
        expect(routeLines.chains).toBeLessThan(routeLines.generalTimerId);
        expect(routeLines.start).toBeLessThan(routeLines.generalTimerId);
        expect(routeLines.addTime).toBeLessThan(routeLines.generalTimerId);
    });

    test('route registration includes helpful comments about order', () => {
        const apiContent = fs.readFileSync(apiFilePath, 'utf8');
        
        // Check for comments explaining the importance of route order
        expect(apiContent).toContain('IMPORTANT');
        expect(apiContent).toContain('specific');
        expect(apiContent).toContain('before');
    });

    test('no duplicate route registrations for timer control endpoints', () => {
        const apiContent = fs.readFileSync(apiFilePath, 'utf8');
        const lines = apiContent.split('\n');
        
        // Count occurrences of each control endpoint registration
        const startCount = lines.filter(line => 
            line.includes("registerRoute('post', '/api/advanced-timer/timers/:id/start'")
        ).length;
        
        const pauseCount = lines.filter(line => 
            line.includes("registerRoute('post', '/api/advanced-timer/timers/:id/pause'")
        ).length;
        
        const stopCount = lines.filter(line => 
            line.includes("registerRoute('post', '/api/advanced-timer/timers/:id/stop'")
        ).length;
        
        const resetCount = lines.filter(line => 
            line.includes("registerRoute('post', '/api/advanced-timer/timers/:id/reset'")
        ).length;
        
        // Each route should only be registered once
        expect(startCount).toBe(1);
        expect(pauseCount).toBe(1);
        expect(stopCount).toBe(1);
        expect(resetCount).toBe(1);
    });
});
