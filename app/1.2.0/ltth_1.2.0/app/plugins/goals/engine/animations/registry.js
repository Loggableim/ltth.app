/**
 * Animation Registry
 * Manages all available goal animations
 *
 * Note: This is the backend registry. Client-side animations are in overlay/animations.js
 */

class AnimationRegistry {
    constructor() {
        this.animations = new Map();
        this.loadDefaultAnimations();
    }

    /**
     * Load all default animations
     */
    loadDefaultAnimations() {
        // On-update animations
        this.register({
            id: 'smooth-progress',
            name: 'Smooth Progress',
            type: 'update',
            description: 'Smooth transition of progress bar',
            duration: 500
        });

        this.register({
            id: 'bounce',
            name: 'Bounce',
            type: 'update',
            description: 'Progress bar bounces on update',
            duration: 600
        });

        this.register({
            id: 'glow',
            name: 'Glow Pulse',
            type: 'update',
            description: 'Progress bar glows on update',
            duration: 800
        });

        // On-reach animations
        this.register({
            id: 'celebration',
            name: 'Celebration',
            type: 'reach',
            description: 'Celebration effect with confetti',
            duration: 2000
        });

        this.register({
            id: 'confetti',
            name: 'Confetti Burst',
            type: 'reach',
            description: 'Colorful confetti explosion',
            duration: 3000
        });

        this.register({
            id: 'pulse',
            name: 'Pulse Wave',
            type: 'reach',
            description: 'Pulsing wave effect',
            duration: 1500
        });

        this.register({
            id: 'flash',
            name: 'Flash',
            type: 'reach',
            description: 'Quick flash effect',
            duration: 500
        });

        this.register({
            id: 'rainbow',
            name: 'Rainbow',
            type: 'reach',
            description: 'Rainbow color shift',
            duration: 2000
        });
    }

    /**
     * Register an animation
     */
    register(animation) {
        if (!animation.id || !animation.name || !animation.type) {
            throw new Error('Invalid animation: must have id, name, and type');
        }

        this.animations.set(animation.id, animation);
    }

    /**
     * Get animation by ID
     */
    get(id) {
        return this.animations.get(id);
    }

    /**
     * Check if animation exists
     */
    has(id) {
        return this.animations.has(id);
    }

    /**
     * Get all animations
     */
    getAll() {
        return Array.from(this.animations.values());
    }

    /**
     * Get animations by type
     */
    getByType(type) {
        return this.getAll().filter(a => a.type === type);
    }

    /**
     * Get update animations
     */
    getUpdateAnimations() {
        return this.getByType('update');
    }

    /**
     * Get reach animations
     */
    getReachAnimations() {
        return this.getByType('reach');
    }

    /**
     * Get animation metadata (for UI)
     */
    getAllMetadata() {
        return this.getAll().map(a => ({
            id: a.id,
            name: a.name,
            type: a.type,
            description: a.description,
            duration: a.duration
        }));
    }
}

// Export singleton instance
module.exports = new AnimationRegistry();
