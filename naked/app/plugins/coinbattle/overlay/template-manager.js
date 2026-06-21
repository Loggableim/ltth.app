/**
 * Overlay Template System
 * Multiple themes for the CoinBattle overlay
 */

class OverlayTemplateManager {
  constructor(logger = console) {
    this.logger = logger;
    this.currentTemplate = 'modern';
    
    // Available templates
    this.templates = {
      modern: {
        id: 'modern',
        name: 'Modern Gradient',
        description: 'Sleek modern design with gradients',
        primaryColor: '#667eea',
        secondaryColor: '#764ba2',
        fontFamily: "'Inter', sans-serif",
        borderRadius: '15px',
        shadowStyle: '0 10px 40px rgba(0,0,0,0.3)',
        leaderboardStyle: 'cards'
      },
      
      neon: {
        id: 'neon',
        name: 'Neon Cyberpunk',
        description: 'Futuristic neon style',
        primaryColor: '#00ffff',
        secondaryColor: '#ff00ff',
        fontFamily: "'Orbitron', monospace",
        borderRadius: '5px',
        shadowStyle: '0 0 30px currentColor',
        leaderboardStyle: 'grid',
        glowEffect: true
      },
      
      minimal: {
        id: 'minimal',
        name: 'Clean Minimal',
        description: 'Simple and clean design',
        primaryColor: '#ffffff',
        secondaryColor: '#000000',
        fontFamily: "'Roboto', sans-serif",
        borderRadius: '8px',
        shadowStyle: '0 2px 10px rgba(0,0,0,0.1)',
        leaderboardStyle: 'list'
      },
      
      gaming: {
        id: 'gaming',
        name: 'Gaming Esports',
        description: 'Esports tournament style',
        primaryColor: '#ff4655',
        secondaryColor: '#1a1a2e',
        fontFamily: "'Rajdhani', sans-serif",
        borderRadius: '0',
        shadowStyle: '0 0 20px #ff4655',
        leaderboardStyle: 'hexagon',
        animationSpeed: 'fast'
      },
      
      retro: {
        id: 'retro',
        name: 'Retro Arcade',
        description: '8-bit retro gaming style',
        primaryColor: '#ff6b6b',
        secondaryColor: '#4ecdc4',
        fontFamily: "'Press Start 2P', monospace",
        borderRadius: '0',
        shadowStyle: '4px 4px 0 #000',
        leaderboardStyle: 'pixelated',
        pixelated: true
      },
      
      glassmorphism: {
        id: 'glassmorphism',
        name: 'Glass Morphism',
        description: 'Frosted glass effect',
        primaryColor: 'rgba(255,255,255,0.1)',
        secondaryColor: 'rgba(255,255,255,0.05)',
        fontFamily: "'Poppins', sans-serif",
        borderRadius: '20px',
        shadowStyle: '0 8px 32px rgba(0,0,0,0.1)',
        leaderboardStyle: 'glass',
        backdropBlur: '10px'
      }
    };
    
    this.logger.info('🎨 Overlay Template Manager initialized');
  }

  /**
   * Get template configuration
   */
  getTemplate(templateId) {
    return this.templates[templateId] || this.templates.modern;
  }

  /**
   * Apply template to overlay
   */
  applyTemplate(templateId) {
    const template = this.getTemplate(templateId);
    if (!template) {
      this.logger.warn(`Template not found: ${templateId}`);
      return false;
    }
    
    this.currentTemplate = templateId;
    
    // Generate CSS variables
    const cssVars = this.generateCSSVariables(template);
    
    // Apply to document
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      for (const [key, value] of Object.entries(cssVars)) {
        root.style.setProperty(key, value);
      }
    }
    
    this.logger.info(`🎨 Template applied: ${template.name}`);
    return true;
  }

  /**
   * Generate CSS variables from template
   */
  generateCSSVariables(template) {
    return {
      '--template-primary-color': template.primaryColor,
      '--template-secondary-color': template.secondaryColor,
      '--template-font-family': template.fontFamily,
      '--template-border-radius': template.borderRadius,
      '--template-shadow': template.shadowStyle,
      '--template-backdrop-blur': template.backdropBlur || '0',
      '--template-glow': template.glowEffect ? '1' : '0',
      '--template-animation-speed': template.animationSpeed === 'fast' ? '0.2s' : '0.3s'
    };
  }

  /**
   * Get template-specific CSS classes
   */
  getTemplateClasses(templateId) {
    const template = this.getTemplate(templateId);
    const classes = [`template-${templateId}`];
    
    if (template.glowEffect) classes.push('template-glow');
    if (template.pixelated) classes.push('template-pixelated');
    if (template.backdropBlur) classes.push('template-glass');
    
    return classes.join(' ');
  }

  /**
   * Generate template CSS
   */
  generateTemplateCSS(templateId) {
    const template = this.getTemplate(templateId);
    
    let css = `
/* Template: ${template.name} */
.template-${templateId} {
  --primary: ${template.primaryColor};
  --secondary: ${template.secondaryColor};
  font-family: ${template.fontFamily};
}

.template-${templateId} .leaderboard-container {
  border-radius: ${template.borderRadius};
  box-shadow: ${template.shadowStyle};
}

.template-${templateId} .player-item {
  background: linear-gradient(135deg, var(--primary), var(--secondary));
  border-radius: ${template.borderRadius};
  ${template.backdropBlur ? `backdrop-filter: blur(${template.backdropBlur});` : ''}
}
`;
    
    // Add template-specific styles
    if (template.glowEffect) {
      css += `
.template-${templateId} .player-item:hover {
  box-shadow: 0 0 30px ${template.primaryColor};
}
`;
    }
    
    if (template.pixelated) {
      css += `
.template-${templateId} {
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
  image-rendering: crisp-edges;
}

.template-${templateId} .player-avatar {
  image-rendering: pixelated;
}
`;
    }
    
    return css;
  }

  /**
   * Get all templates
   */
  getAllTemplates() {
    return Object.values(this.templates);
  }

  /**
   * Create custom template
   */
  createCustomTemplate(customConfig) {
    const templateId = `custom_${Date.now()}`;
    
    this.templates[templateId] = {
      id: templateId,
      name: customConfig.name || 'Custom Template',
      description: customConfig.description || 'User-created template',
      ...customConfig
    };
    
    this.logger.info(`🎨 Custom template created: ${templateId}`);
    return templateId;
  }

  /**
   * Export template configuration
   */
  exportTemplate(templateId) {
    const template = this.getTemplate(templateId);
    return JSON.stringify(template, null, 2);
  }

  /**
   * Import template configuration
   */
  importTemplate(jsonString) {
    try {
      const config = JSON.parse(jsonString);
      return this.createCustomTemplate(config);
    } catch (error) {
      this.logger.error(`Failed to import template: ${error.message}`);
      return null;
    }
  }
}

module.exports = OverlayTemplateManager;
