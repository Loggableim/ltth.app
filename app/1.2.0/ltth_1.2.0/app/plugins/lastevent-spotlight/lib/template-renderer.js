/**
 * Template Renderer for LastEvent Spotlight
 *
 * Handles rendering and updating overlay templates with user data.
 * Supports multiple design variants for customizable HUD overlays.
 */

class TemplateRenderer {
  constructor(container, settings) {
    this.container = container;
    this.settings = settings || {};
    this.currentUser = null;
    this.imageCache = new Map();
    
    // Design variant configurations
    this.designVariants = {
      // Default: Clean, modern design
      default: {
        containerStyle: 'padding: 20px;',
        profileBorderRadius: '50%',
        giftBorderRadius: '10px',
        cardBackground: 'transparent',
        labelOpacity: '0.8',
        useShadow: false
      },
      // Minimal: Very clean, no borders, subtle
      minimal: {
        containerStyle: 'padding: 15px;',
        profileBorderRadius: '50%',
        giftBorderRadius: '8px',
        cardBackground: 'transparent',
        labelOpacity: '0.6',
        useShadow: false,
        hideBorder: true,
        smallerText: true
      },
      // Compact: Small, tight layout
      compact: {
        containerStyle: 'padding: 8px;',
        profileBorderRadius: '50%',
        giftBorderRadius: '6px',
        cardBackground: 'rgba(0, 0, 0, 0.5)',
        labelOpacity: '0.7',
        useShadow: false,
        compactLayout: true,
        smallerImages: true
      },
      // Neon: Glowing, cyberpunk style
      neon: {
        containerStyle: 'padding: 20px;',
        profileBorderRadius: '50%',
        giftBorderRadius: '10px',
        cardBackground: 'rgba(0, 0, 0, 0.8)',
        labelOpacity: '1',
        useShadow: true,
        neonGlow: true,
        neonColor: '#00ffff'
      },
      // Glassmorphism: Frosted glass effect
      glassmorphism: {
        containerStyle: 'padding: 25px;',
        profileBorderRadius: '20px',
        giftBorderRadius: '15px',
        cardBackground: 'rgba(255, 255, 255, 0.1)',
        labelOpacity: '0.9',
        useShadow: true,
        glassEffect: true,
        borderGlow: true
      },
      // Retro: 8-bit/pixel art inspired
      retro: {
        containerStyle: 'padding: 20px;',
        profileBorderRadius: '0',
        giftBorderRadius: '0',
        cardBackground: 'rgba(0, 0, 0, 0.9)',
        labelOpacity: '1',
        useShadow: true,
        pixelBorder: true,
        retroFont: true
      }
    };
  }

  /**
   * Escape HTML to prevent XSS attacks
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Get current design variant configuration
   */
  getVariantConfig() {
    const variant = this.settings.designVariant || 'default';
    return this.designVariants[variant] || this.designVariants.default;
  }

  /**
   * Update settings and re-render
   */
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    this.applyStyles();

    // Re-render current user with new settings
    if (this.currentUser) {
      this.render(this.currentUser, false); // Don't animate, just update styles
    }
  }

  /**
   * Apply global styles to container
   */
  applyStyles() {
    if (!this.container) return;

    // Apply alignment
    if (this.settings.alignCenter) {
      this.container.style.display = 'flex';
      this.container.style.justifyContent = 'center';
      this.container.style.alignItems = 'center';
      this.container.style.textAlign = 'center';
    } else {
      this.container.style.textAlign = 'left';
    }

    // Apply background
    if (this.settings.enableBackground) {
      this.container.style.backgroundColor = this.settings.backgroundColor || 'rgba(0, 0, 0, 0.7)';
    } else {
      this.container.style.backgroundColor = 'transparent';
    }
  }

  /**
   * Preload profile picture
   */
  async preloadImage(url) {
    if (!url) return null;

    // Check cache
    if (this.imageCache.has(url)) {
      return this.imageCache.get(url);
    }

    // Load image
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.imageCache.set(url, url);
        resolve(url);
      };
      img.onerror = () => {
        console.warn('Failed to load profile picture:', url);
        resolve(null);
      };
      img.src = url;

      // Timeout after 5 seconds
      setTimeout(() => resolve(null), 5000);
    });
  }

  /**
   * Render user data
   */
  async render(userData, animate = true) {
    if (!this.container) return;

    this.currentUser = userData;

    // Handle null user
    if (!userData && this.settings.hideOnNullUser) {
      this.container.style.display = 'none';
      return;
    } else if (!userData) {
      this.container.innerHTML = '<div class="no-data">Waiting for event...</div>';
      return;
    }

    // Show container
    this.container.style.display = '';

    // Preload images if enabled
    let profilePicUrl = userData.profilePictureUrl;
    if (this.settings.preloadImages && profilePicUrl) {
      profilePicUrl = await this.preloadImage(profilePicUrl);
    }
    
    // Also preload gift image if available
    let giftPicUrl = userData.metadata?.giftPictureUrl;
    if (this.settings.preloadImages && giftPicUrl) {
      giftPicUrl = await this.preloadImage(giftPicUrl);
    }

    // Build HTML based on design variant
    const html = this.buildHTML(userData, profilePicUrl, giftPicUrl);

    // Update DOM
    this.container.innerHTML = html;

    // Apply styles
    this.applyStyles();
    this.applyElementStyles();
  }

  /**
   * Build HTML for user data with design variant support
   */
  buildHTML(userData, profilePicUrl, giftPicUrl) {
    const variant = this.getVariantConfig();
    const isGiftEvent = userData.eventType === 'gifter' || userData.eventType === 'topgift' || userData.eventType === 'giftstreak';
    const hasGiftData = userData.metadata && (userData.metadata.giftName || userData.metadata.giftPictureUrl);
    
    // Calculate sizes based on variant
    let imageSize = this.settings.profilePictureSize || '80px';
    if (variant.smallerImages) {
      imageSize = this.calculateReducedSize(imageSize, 0.7);
    }
    
    let fontSize = this.settings.fontSize || '32px';
    if (variant.smallerText) {
      fontSize = this.calculateReducedSize(fontSize, 0.85);
    }

    // Build variant-specific styles
    const containerStyles = this.buildContainerStyles(variant);
    const cardStyles = this.buildCardStyles(variant);

    const parts = [];

    // Profile picture
    if (this.settings.showProfilePicture && profilePicUrl) {
      parts.push(this.buildProfilePicture(userData, profilePicUrl, imageSize, variant));
    }

    // Gift icon (for gift-related events)
    if (isGiftEvent && hasGiftData) {
      parts.push(this.buildGiftIcon(userData, giftPicUrl, imageSize, variant));
    }

    // Text content
    const textContent = this.buildTextContent(userData, fontSize, variant, isGiftEvent, hasGiftData);
    if (textContent) {
      parts.push(textContent);
    }

    // Layout direction based on variant and settings
    const flexDirection = variant.compactLayout ? 'row' : (this.settings.alignCenter ? 'column' : 'row');

    return `
      <div class="user-display" style="
        display: flex;
        flex-direction: ${flexDirection};
        align-items: center;
        justify-content: center;
        ${containerStyles}
        ${cardStyles}
      ">
        ${parts.join('')}
      </div>
    `;
  }

  /**
   * Calculate reduced size (e.g., 80px * 0.7 = 56px)
   */
  calculateReducedSize(size, factor) {
    const value = parseFloat(size);
    const unitMatch = size.match(/[a-zA-Z%]+$/);
    const unit = unitMatch ? unitMatch[0] : 'px';
    return Math.round(value * factor) + unit;
  }

  /**
   * Convert hex color to rgba with opacity
   */
  hexToRgba(hex, opacity) {
    // Handle both short (#fff) and long (#ffffff) hex codes
    let cleanHex = hex.replace('#', '');
    if (cleanHex.length === 3) {
      cleanHex = cleanHex.split('').map(c => c + c).join('');
    }
    const r = parseInt(cleanHex.slice(0, 2), 16);
    const g = parseInt(cleanHex.slice(2, 4), 16);
    const b = parseInt(cleanHex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  /**
   * Generate a fallback SVG data URI for when images fail to load
   * This ensures OBS BrowserSource always has something to display
   * @param {string} content - Text or emoji to display in the center
   * @param {Object} options - Optional styling options
   * @returns {string} Data URI for the fallback SVG
   */
  generateFallbackSvg(content, options = {}) {
    const {
      backgroundColor = '#4a5568',
      textColor = 'white',
      fontSize = '40',
      borderRadius = '0'
    } = options;
    
    const encodedContent = encodeURIComponent(content);
    const rx = borderRadius ? `rx="${borderRadius}"` : '';
    
    return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect fill='%23${backgroundColor.replace('#', '')}' ${rx} width='100' height='100'/%3E%3Ctext x='50' y='55' text-anchor='middle' dominant-baseline='middle' fill='${textColor}' font-size='${fontSize}' font-family='sans-serif'%3E${encodedContent}%3C/text%3E%3C/svg%3E`;
  }

  /**
   * Build container styles based on variant
   */
  buildContainerStyles(variant) {
    let styles = variant.containerStyle || 'padding: 20px;';
    
    if (variant.neonGlow) {
      const neonColor = this.settings.usernameGlowColor || variant.neonColor || '#00ffff';
      styles += `
        filter: drop-shadow(0 0 10px ${neonColor});
      `;
    }
    
    return styles;
  }

  /**
   * Build card styles based on variant
   */
  buildCardStyles(variant) {
    let styles = '';
    
    if (variant.cardBackground && variant.cardBackground !== 'transparent') {
      styles += `background: ${variant.cardBackground};`;
    }
    
    if (variant.glassEffect) {
      styles += `
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 20px;
      `;
    }
    
    if (variant.pixelBorder) {
      styles += `
        border: 4px solid ${this.settings.borderColor || '#FFFFFF'};
        box-shadow: 
          4px 4px 0 ${this.settings.borderColor || '#FFFFFF'},
          -4px -4px 0 ${this.settings.borderColor || '#FFFFFF'},
          4px -4px 0 ${this.settings.borderColor || '#FFFFFF'},
          -4px 4px 0 ${this.settings.borderColor || '#FFFFFF'};
      `;
    }
    
    if (variant.useShadow && !variant.pixelBorder) {
      styles += 'box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);';
    }
    
    if (variant.borderGlow) {
      const glowColor = this.settings.usernameGlowColor || '#00ffff';
      const outerGlow = this.hexToRgba(glowColor, 0.25);
      const innerGlow = this.hexToRgba(glowColor, 0.125);
      styles += `box-shadow: 0 0 20px ${outerGlow}, inset 0 0 20px ${innerGlow};`;
    }
    
    return styles;
  }

  /**
   * Build profile picture HTML
   * Includes onerror fallback for OBS BrowserSource compatibility
   */
  buildProfilePicture(userData, profilePicUrl, size, variant) {
    const escapedNickname = this.escapeHtml(userData.nickname);
    const escapedProfilePicUrl = this.escapeHtml(profilePicUrl);
    const borderRadius = variant.profileBorderRadius || '50%';
    const showBorder = !variant.hideBorder && this.settings.enableBorder;
    const borderWidth = this.settings.borderWidth || '3px';
    const borderColor = this.settings.borderColor || '#FFFFFF';
    
    let borderStyle = '';
    if (showBorder) {
      if (variant.neonGlow) {
        const neonColor = this.settings.usernameGlowColor || variant.neonColor || '#00ffff';
        borderStyle = `border: ${borderWidth} solid ${neonColor}; box-shadow: 0 0 10px ${neonColor}, inset 0 0 5px ${neonColor};`;
      } else if (variant.glassEffect) {
        borderStyle = `border: 2px solid rgba(255, 255, 255, 0.3);`;
      } else {
        borderStyle = `border: ${borderWidth} solid ${borderColor};`;
      }
    }
    
    // Generate user initials for fallback avatar
    const initials = (userData.nickname || 'U').charAt(0).toUpperCase();
    
    // Fallback SVG data URI for when profile picture fails to load
    const fallbackSvg = this.generateFallbackSvg(initials);
    
    return `
      <div class="profile-picture" style="
        width: ${size};
        height: ${size};
        border-radius: ${borderRadius};
        overflow: hidden;
        ${borderStyle}
        margin: ${variant.compactLayout ? '5px' : '10px'};
        flex-shrink: 0;
      ">
        <img src="${escapedProfilePicUrl}" alt="${escapedNickname}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.onerror=null; this.src='${fallbackSvg}';" crossorigin="anonymous">
      </div>
    `;
  }

  /**
   * Build gift icon HTML
   * Includes onerror fallback for OBS BrowserSource compatibility
   */
  buildGiftIcon(userData, preloadedGiftPicUrl, size, variant) {
    const giftName = userData.metadata?.giftName || 'Gift';
    const borderRadius = variant.giftBorderRadius || '10px';
    const showBorder = !variant.hideBorder && this.settings.enableBorder;
    const borderWidth = this.settings.borderWidth || '3px';
    const borderColor = this.settings.borderColor || '#FFFFFF';
    
    let borderStyle = '';
    if (showBorder) {
      if (variant.neonGlow) {
        const neonColor = this.settings.usernameGlowColor || variant.neonColor || '#00ffff';
        borderStyle = `border: ${borderWidth} solid ${neonColor}; box-shadow: 0 0 10px ${neonColor}, inset 0 0 5px ${neonColor};`;
      } else if (variant.glassEffect) {
        borderStyle = `border: 2px solid rgba(255, 255, 255, 0.3);`;
      } else {
        borderStyle = `border: ${borderWidth} solid ${borderColor};`;
      }
    }

    // Use preloaded URL if available, otherwise fall back to original URL
    const giftPictureUrl = preloadedGiftPicUrl || userData.metadata?.giftPictureUrl;
    
    // Determine fallback emoji based on event type
    const giftEmoji = userData.eventType === 'topgift' ? '💎' : (userData.eventType === 'giftstreak' ? '🔥' : '🎁');
    
    // Fallback SVG data URI for when gift picture fails to load
    const fallbackSvg = this.generateFallbackSvg(giftEmoji, { borderRadius: '10', fontSize: '50' });
    
    if (giftPictureUrl && giftPictureUrl.trim() !== '') {
      const escapedGiftPictureUrl = this.escapeHtml(giftPictureUrl);
      const escapedGiftName = this.escapeHtml(giftName);
      return `
        <div class="gift-icon" style="
          width: ${size};
          height: ${size};
          border-radius: ${borderRadius};
          overflow: hidden;
          ${borderStyle}
          margin: ${variant.compactLayout ? '5px' : '10px'};
          background: ${variant.glassEffect ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.3)'};
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        ">
          <img src="${escapedGiftPictureUrl}" alt="${escapedGiftName}" style="width: 90%; height: 90%; object-fit: contain;" onerror="this.onerror=null; this.src='${fallbackSvg}';" crossorigin="anonymous">
        </div>
      `;
    } else {
      // Fallback to emoji if no gift image
      return `
        <div class="gift-icon" style="
          width: ${size};
          height: ${size};
          border-radius: ${borderRadius};
          ${borderStyle}
          margin: ${variant.compactLayout ? '5px' : '10px'};
          background: ${variant.glassEffect ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.3)'};
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: calc(${size} * 0.6);
          flex-shrink: 0;
        ">
          ${giftEmoji}
        </div>
      `;
    }
  }

  /**
   * Build text content HTML
   */
  buildTextContent(userData, fontSize, variant, isGiftEvent, hasGiftData) {
    const textParts = [];
    const fontColor = this.settings.fontColor || '#FFFFFF';
    const fontFamily = variant.retroFont ? '"Press Start 2P", "Courier New", monospace' : (this.settings.fontFamily || 'Exo 2');
    const actualFontSize = variant.retroFont ? this.calculateReducedSize(fontSize, 0.6) : fontSize;

    // Event label
    const escapedLabel = this.escapeHtml(userData.label || 'Event');
    let labelStyle = `
      font-size: calc(${actualFontSize} * 0.6);
      color: ${fontColor};
      opacity: ${variant.labelOpacity || '0.8'};
      margin-bottom: 5px;
      font-family: ${fontFamily};
    `;
    
    if (variant.neonGlow) {
      const neonColor = this.settings.usernameGlowColor || variant.neonColor || '#00ffff';
      labelStyle += `text-shadow: 0 0 5px ${neonColor}, 0 0 10px ${neonColor};`;
    }
    
    textParts.push(`
      <div class="event-label" style="${labelStyle}">
        ${escapedLabel}
      </div>
    `);

    // Username
    if (this.settings.showUsername) {
      const escapedNickname = this.escapeHtml(userData.nickname || 'Anonymous');
      let usernameStyle = `
        font-family: ${fontFamily};
        font-size: ${actualFontSize};
        line-height: ${this.settings.fontLineSpacing || '1.2'};
        letter-spacing: ${variant.retroFont ? '2px' : (this.settings.fontLetterSpacing || 'normal')};
        color: ${fontColor};
        font-weight: bold;
      `;
      
      if (variant.neonGlow) {
        const neonColor = this.settings.usernameGlowColor || variant.neonColor || '#00ffff';
        usernameStyle += `text-shadow: 0 0 10px ${neonColor}, 0 0 20px ${neonColor}, 0 0 30px ${neonColor};`;
      }
      
      textParts.push(`
        <div class="username" style="${usernameStyle}">
          ${escapedNickname}
        </div>
      `);
    }

    // Gift metadata (for gift-related events)
    if (isGiftEvent && hasGiftData) {
      const giftInfo = [];
      
      if (userData.metadata.giftName) {
        const escapedGiftName = this.escapeHtml(userData.metadata.giftName);
        const giftNameColor = variant.neonGlow ? '#ffff00' : '#ffc107';
        giftInfo.push(`<span style="color: ${giftNameColor};">${escapedGiftName}</span>`);
      }
      
      if (userData.metadata.giftCount && userData.metadata.giftCount > 1) {
        const giftCount = parseInt(userData.metadata.giftCount) || 0;
        const countColor = variant.neonGlow ? '#00ff00' : '#00ff00';
        giftInfo.push(`<span style="color: ${countColor};">×${giftCount}</span>`);
      }
      
      if (userData.metadata.coins && userData.metadata.coins > 0) {
        const coins = parseInt(userData.metadata.coins) || 0;
        const coinColor = variant.neonGlow ? '#ffd700' : '#ffd700';
        giftInfo.push(`<span style="color: ${coinColor};">💰 ${coins} coins</span>`);
      }
      
      if (giftInfo.length > 0) {
        let metadataStyle = `
          font-size: calc(${actualFontSize} * 0.7);
          color: ${fontColor};
          margin-top: 5px;
          display: flex;
          gap: ${variant.compactLayout ? '5px' : '10px'};
          flex-wrap: wrap;
          justify-content: ${this.settings.alignCenter ? 'center' : 'flex-start'};
          font-family: ${fontFamily};
        `;
        
        if (variant.neonGlow) {
          const neonColor = this.settings.usernameGlowColor || variant.neonColor || '#00ffff';
          metadataStyle += `text-shadow: 0 0 5px ${neonColor};`;
        }
        
        textParts.push(`
          <div class="gift-metadata" style="${metadataStyle}">
            ${giftInfo.join(' ')}
          </div>
        `);
      }
    }

    if (textParts.length > 0) {
      return `
        <div class="text-content" style="padding: ${variant.compactLayout ? '5px' : '10px'};">
          ${textParts.join('')}
        </div>
      `;
    }
    
    return '';
  }

  /**
   * Apply element-specific styles (effects, etc.)
   */
  applyElementStyles() {
    const usernameElement = this.container.querySelector('.username');

    if (usernameElement && window.TextEffects) {
      const textEffects = new window.TextEffects();
      textEffects.applyComprehensiveEffects(usernameElement, this.settings);
    }
  }

  /**
   * Clear current display
   */
  clear() {
    if (this.container) {
      this.container.innerHTML = '';
    }
    this.currentUser = null;
  }
}

// Export for browser usage
if (typeof window !== 'undefined') {
  window.TemplateRenderer = TemplateRenderer;
}

// Export for Node.js usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TemplateRenderer;
}
