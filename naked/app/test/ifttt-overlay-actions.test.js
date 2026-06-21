/**
 * IFTTT Overlay Actions Test
 * Tests the IFTTT overlay actions (image, video, text, clear)
 */

const ActionRegistry = require('../modules/ifttt/action-registry');

describe('IFTTT Overlay Actions', () => {
    let registry;
    let mockLogger;
    let mockIo;
    let mockServices;

    beforeEach(() => {
        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn()
        };

        mockIo = {
            emit: jest.fn()
        };

        mockServices = {
            io: mockIo,
            logger: mockLogger,
            templateEngine: {
                render: (template, data) => {
                    // Simple template rendering
                    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => data[key] || match);
                }
            }
        };

        registry = new ActionRegistry(mockLogger);
    });

    describe('overlay:image', () => {
        it('should be registered', () => {
            const action = registry.get('overlay:image');
            expect(action).toBeDefined();
            expect(action.name).toBe('Show Image Overlay');
            expect(action.category).toBe('overlay');
        });

        it('should have correct fields', () => {
            const action = registry.get('overlay:image');
            const fieldNames = action.fields.map(f => f.name);
            expect(fieldNames).toContain('url');
            expect(fieldNames).toContain('duration');
            expect(fieldNames).toContain('position');
            expect(fieldNames).toContain('animation');
        });

        it('should emit overlay:image event', async () => {
            const actionDef = {
                type: 'overlay:image',
                url: 'https://example.com/image.png',
                duration: 5,
                position: 'center',
                animation: 'fade'
            };

            await registry.execute(actionDef, { data: {} }, mockServices);

            expect(mockIo.emit).toHaveBeenCalledWith('overlay:image', expect.objectContaining({
                type: 'image',
                url: 'https://example.com/image.png',
                duration: 5,
                position: 'center',
                animation: 'fade'
            }));
        });

        it('should throw error if URL is missing', async () => {
            const actionDef = {
                type: 'overlay:image',
                url: ''
            };

            const result = await registry.execute(actionDef, { data: {} }, mockServices);
            expect(result.success).toBe(false);
            expect(result.error).toContain('Image URL is required');
        });
    });

    describe('overlay:video', () => {
        it('should be registered', () => {
            const action = registry.get('overlay:video');
            expect(action).toBeDefined();
            expect(action.name).toBe('Show Video/MP4 Overlay');
            expect(action.category).toBe('overlay');
        });

        it('should have correct fields', () => {
            const action = registry.get('overlay:video');
            const fieldNames = action.fields.map(f => f.name);
            expect(fieldNames).toContain('url');
            expect(fieldNames).toContain('duration');
            expect(fieldNames).toContain('position');
            expect(fieldNames).toContain('animation');
            expect(fieldNames).toContain('volume');
            expect(fieldNames).toContain('loop');
        });

        it('should emit overlay:video event', async () => {
            const actionDef = {
                type: 'overlay:video',
                url: 'https://example.com/video.mp4',
                duration: 10,
                position: 'center',
                animation: 'zoom',
                volume: 80,
                loop: false
            };

            await registry.execute(actionDef, { data: {} }, mockServices);

            expect(mockIo.emit).toHaveBeenCalledWith('overlay:video', expect.objectContaining({
                type: 'video',
                url: 'https://example.com/video.mp4',
                duration: 10,
                volume: 80,
                loop: false
            }));
        });

        it('should throw error if URL is missing', async () => {
            const actionDef = {
                type: 'overlay:video',
                url: ''
            };

            const result = await registry.execute(actionDef, { data: {} }, mockServices);
            expect(result.success).toBe(false);
            expect(result.error).toContain('Video URL is required');
        });
    });

    describe('overlay:text', () => {
        it('should be registered', () => {
            const action = registry.get('overlay:text');
            expect(action).toBeDefined();
            expect(action.name).toBe('Show Text Overlay');
            expect(action.category).toBe('overlay');
        });

        it('should have correct fields', () => {
            const action = registry.get('overlay:text');
            const fieldNames = action.fields.map(f => f.name);
            expect(fieldNames).toContain('text');
            expect(fieldNames).toContain('duration');
            expect(fieldNames).toContain('position');
            expect(fieldNames).toContain('animation');
            expect(fieldNames).toContain('fontSize');
            expect(fieldNames).toContain('color');
            expect(fieldNames).toContain('backgroundColor');
        });

        it('should emit overlay:text event with template rendering', async () => {
            const actionDef = {
                type: 'overlay:text',
                text: 'Hello {{username}}!',
                duration: 5,
                position: 'top',
                animation: 'slide-down'
            };

            await registry.execute(actionDef, { data: { username: 'TestUser' } }, mockServices);

            expect(mockIo.emit).toHaveBeenCalledWith('overlay:text', expect.objectContaining({
                type: 'text',
                text: 'Hello TestUser!',
                duration: 5,
                position: 'top',
                animation: 'slide-down'
            }));
        });

        it('should throw error if text is empty', async () => {
            const actionDef = {
                type: 'overlay:text',
                text: ''
            };

            const result = await registry.execute(actionDef, { data: {} }, mockServices);
            expect(result.success).toBe(false);
            expect(result.error).toContain('Text is required for overlay');
        });
    });

    describe('overlay:clear', () => {
        it('should be registered', () => {
            const action = registry.get('overlay:clear');
            expect(action).toBeDefined();
            expect(action.name).toBe('Clear All Overlays');
            expect(action.category).toBe('overlay');
        });

        it('should emit overlay:clear event', async () => {
            const actionDef = {
                type: 'overlay:clear'
            };

            await registry.execute(actionDef, { data: {} }, mockServices);

            expect(mockIo.emit).toHaveBeenCalledWith('overlay:clear');
        });
    });

    describe('All overlay actions', () => {
        it('should fail gracefully if Socket.io is not available', async () => {
            const servicesWithoutIo = {
                ...mockServices,
                io: null
            };

            const actions = ['overlay:image', 'overlay:video', 'overlay:text', 'overlay:clear'];
            
            for (const actionType of actions) {
                const actionDef = {
                    type: actionType,
                    url: 'https://example.com/test.png',
                    text: 'Test'
                };

                const result = await registry.execute(actionDef, { data: {} }, servicesWithoutIo);
                expect(result.success).toBe(false);
                expect(result.error).toContain('Socket.io not available');
            }
        });
    });
});
