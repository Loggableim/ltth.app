/**
 * PhysBones Controller
 * Controls VRChat PhysBones via OSC with animations and auto-discovery
 * Supports IsGrabbed, IsPosed, Angle, Stretch with 60 FPS animations
 */

class PhysBonesController {
    constructor(api, oscBridge, avatarStateStore) {
        this.api = api;
        this.oscBridge = oscBridge;
        this.avatarStateStore = avatarStateStore;
        this.logger = api.logger;
        
        // Discovered PhysBones
        this.discoveredBones = new Map(); // Map<boneName, {parameters, metadata}>
        
        // Active animations
        this.activeAnimations = new Map(); // Map<animationId, {interval, bone, type}>
        this.animationIdCounter = 0;
        
        // Animation frame rate
        this.FPS = 60;
        this.frameTime = 1000 / this.FPS; // ~16.67ms
        
        // Current avatar tracking
        this.currentAvatar = null;
    }

    /**
     * Auto-discover PhysBone parameters from OSCQuery
     */
    async autoDiscover(oscQueryClient) {
        if (!oscQueryClient) {
            this.logger.warn('OSCQuery client not available for PhysBones discovery');
            return { success: false, bones: [] };
        }

        try {
            const result = await oscQueryClient.discover();
            const bones = new Map();

            // Filter PhysBones parameters
            for (const param of result.parameters) {
                if (param.path.includes('/avatar/physbones/')) {
                    const match = param.path.match(/\/avatar\/physbones\/([^\/]+)\/(.+)/);
                    if (match) {
                        const [, boneName, parameter] = match;
                        
                        if (!bones.has(boneName)) {
                            bones.set(boneName, {
                                name: boneName,
                                parameters: {},
                                discovered: Date.now()
                            });
                        }
                        
                        const bone = bones.get(boneName);
                        bone.parameters[parameter] = {
                            type: param.type,
                            access: param.access,
                            range: param.range,
                            value: param.value
                        };
                    }
                }
            }

            this.discoveredBones = bones;
            this.logger.info(`🦴 Discovered ${bones.size} PhysBones with ${result.parameters.length} parameters`);

            this.api.emit('osc:physbones-discovered', {
                bones: Array.from(bones.values()),
                timestamp: Date.now()
            });

            return {
                success: true,
                bones: Array.from(bones.values())
            };

        } catch (error) {
            this.logger.error('PhysBones auto-discovery failed:', error);
            return { success: false, error: error.message, bones: [] };
        }
    }

    /**
     * Trigger PhysBone animation
     * @param {string} boneName - Name of the PhysBone (e.g., 'Tail', 'Ears')
     * @param {string} animation - Animation type: 'wiggle', 'sinus', 'stretch', 'grab', 'wave'
     * @param {object} params - Animation parameters
     */
    triggerAnimation(boneName, animation = 'wiggle', params = {}) {
        const duration = params.duration || 1000;
        const amplitude = params.amplitude || 0.5;
        const frequency = params.frequency || 2; // Hz
        const basePath = `/avatar/physbones/${boneName}`;

        this.logger.info(`🦴 PhysBone animation: ${boneName} - ${animation} (${duration}ms)`);

        switch (animation) {
            case 'wiggle':
                return this._animateWiggle(boneName, basePath, duration, amplitude, frequency);
            
            case 'sinus':
                return this._animateSinus(boneName, basePath, duration, amplitude, frequency);
            
            case 'wave':
                return this._animateWave(boneName, basePath, duration, amplitude);
            
            case 'stretch':
                return this._animateStretch(boneName, basePath, duration, amplitude);
            
            case 'grab':
                return this._animateGrab(boneName, basePath, duration);
            
            case 'twitch':
                return this._animateTwitch(boneName, basePath, amplitude);
            
            default:
                this.logger.warn(`Unknown animation type: ${animation}`);
                return null;
        }
    }

    /**
     * Stop animation for a specific bone
     */
    stopAnimation(boneName) {
        let stopped = 0;
        
        for (const [animationId, animation] of this.activeAnimations.entries()) {
            if (animation.bone === boneName) {
                clearInterval(animation.interval);
                this.activeAnimations.delete(animationId);
                stopped++;
            }
        }

        if (stopped > 0) {
            // Reset bone to neutral
            this._resetBone(boneName);
            this.logger.info(`⏹️ Stopped ${stopped} animation(s) for ${boneName}`);
        }

        return stopped;
    }

    /**
     * Stop all animations
     */
    stopAllAnimations() {
        let count = 0;
        
        for (const [animationId, animation] of this.activeAnimations.entries()) {
            clearInterval(animation.interval);
            this._resetBone(animation.bone);
            count++;
        }

        this.activeAnimations.clear();
        this.logger.info(`⏹️ Stopped ${count} PhysBone animation(s)`);
        
        return count;
    }

    /**
     * Set PhysBone parameter directly
     */
    setParameter(boneName, parameter, value) {
        const address = `/avatar/physbones/${boneName}/${parameter}`;
        return this.oscBridge.send(address, value);
    }

    /**
     * Get discovered PhysBones
     */
    getDiscoveredBones() {
        return Array.from(this.discoveredBones.values());
    }

    /**
     * Get active animations
     */
    getActiveAnimations() {
        return Array.from(this.activeAnimations.entries()).map(([id, anim]) => ({
            id,
            bone: anim.bone,
            type: anim.type,
            startTime: anim.startTime
        }));
    }

    /**
     * Handle avatar change - abort all animations
     */
    onAvatarChanged(avatarId, avatarName) {
        this.logger.info(`👤 Avatar changed, aborting PhysBone animations`);
        this.stopAllAnimations();
        this.discoveredBones.clear();
        this.currentAvatar = { id: avatarId, name: avatarName };
    }

    // Private animation methods

    _animateWiggle(boneName, basePath, duration, amplitude, frequency) {
        const animationId = this._getAnimationId();
        const startTime = Date.now();
        
        const interval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            
            if (elapsed >= duration) {
                clearInterval(interval);
                this.activeAnimations.delete(animationId);
                this.setParameter(boneName, 'Angle', 0);
                return;
            }
            
            // Wiggle pattern: sine wave for natural motion
            const t = elapsed / 1000; // seconds
            const value = Math.sin(t * frequency * Math.PI * 2) * amplitude;
            this.setParameter(boneName, 'Angle', value);
            
        }, this.frameTime);

        this.activeAnimations.set(animationId, {
            interval,
            bone: boneName,
            type: 'wiggle',
            startTime
        });

        return animationId;
    }

    _animateSinus(boneName, basePath, duration, amplitude, frequency) {
        const animationId = this._getAnimationId();
        const startTime = Date.now();
        
        const interval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            
            if (elapsed >= duration) {
                clearInterval(interval);
                this.activeAnimations.delete(animationId);
                this.setParameter(boneName, 'Angle', 0);
                return;
            }
            
            const t = elapsed / 1000;
            const value = Math.sin(t * frequency * Math.PI * 2) * amplitude;
            this.setParameter(boneName, 'Angle', value);
            
        }, this.frameTime);

        this.activeAnimations.set(animationId, {
            interval,
            bone: boneName,
            type: 'sinus',
            startTime
        });

        return animationId;
    }

    _animateWave(boneName, basePath, duration, amplitude) {
        const animationId = this._getAnimationId();
        const startTime = Date.now();
        
        const interval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            
            if (elapsed >= duration) {
                clearInterval(interval);
                this.activeAnimations.delete(animationId);
                this.setParameter(boneName, 'Angle', 0);
                return;
            }
            
            // Wave pattern: ramping sine
            const progress = elapsed / duration;
            const t = elapsed / 100;
            const envelope = 1 - progress; // Fade out
            const value = Math.sin(t * Math.PI) * amplitude * envelope;
            this.setParameter(boneName, 'Angle', value);
            
        }, this.frameTime);

        this.activeAnimations.set(animationId, {
            interval,
            bone: boneName,
            type: 'wave',
            startTime
        });

        return animationId;
    }

    _animateStretch(boneName, basePath, duration, amplitude) {
        // Stretch: ramp up, hold, ramp down
        const rampTime = duration * 0.2; // 20% ramp time
        const holdTime = duration * 0.6; // 60% hold time
        
        const animationId = this._getAnimationId();
        const startTime = Date.now();
        
        const interval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            
            if (elapsed >= duration) {
                clearInterval(interval);
                this.activeAnimations.delete(animationId);
                this.setParameter(boneName, 'Stretch', 0);
                return;
            }
            
            let value = 0;
            
            if (elapsed < rampTime) {
                // Ramp up
                value = (elapsed / rampTime) * amplitude;
            } else if (elapsed < rampTime + holdTime) {
                // Hold
                value = amplitude;
            } else {
                // Ramp down
                const rampDown = elapsed - rampTime - holdTime;
                value = amplitude * (1 - (rampDown / rampTime));
            }
            
            this.setParameter(boneName, 'Stretch', value);
            
        }, this.frameTime);

        this.activeAnimations.set(animationId, {
            interval,
            bone: boneName,
            type: 'stretch',
            startTime
        });

        return animationId;
    }

    _animateGrab(boneName, basePath, duration) {
        // Grab: instant on, delayed off
        this.setParameter(boneName, 'IsGrabbed', 1);
        
        setTimeout(() => {
            this.setParameter(boneName, 'IsGrabbed', 0);
        }, duration);

        return null; // No continuous animation
    }

    _animateTwitch(boneName, basePath, amplitude) {
        // Quick twitch: fast pulse
        const duration = 200; // 200ms
        const animationId = this._getAnimationId();
        const startTime = Date.now();
        
        const interval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            
            if (elapsed >= duration) {
                clearInterval(interval);
                this.activeAnimations.delete(animationId);
                this.setParameter(boneName, 'Angle', 0);
                return;
            }
            
            const progress = elapsed / duration;
            const value = amplitude * Math.sin(progress * Math.PI); // Bell curve
            this.setParameter(boneName, 'Angle', value);
            
        }, this.frameTime);

        this.activeAnimations.set(animationId, {
            interval,
            bone: boneName,
            type: 'twitch',
            startTime
        });

        return animationId;
    }

    _resetBone(boneName) {
        this.setParameter(boneName, 'Angle', 0);
        this.setParameter(boneName, 'Stretch', 0);
        this.setParameter(boneName, 'IsGrabbed', 0);
        this.setParameter(boneName, 'IsPosed', 0);
    }

    _getAnimationId() {
        return this.animationIdCounter++;
    }

    destroy() {
        this.stopAllAnimations();
        this.discoveredBones.clear();
    }
}

module.exports = PhysBonesController;
