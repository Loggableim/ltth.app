/**
 * Template Registry
 * Manages all available goal templates
 */

class TemplateRegistry {
    constructor() {
        this.templates = new Map();
        this.loadDefaultTemplates();
    }

    /**
     * Load all default templates
     */
    loadDefaultTemplates() {
        const templates = [
            require('./compact-bar'),
            require('./full-width'),
            require('./minimal-counter'),
            require('./circular-progress'),
            require('./floating-pill'),
            require('./vertical-meter')
        ];

        templates.forEach(template => {
            this.register(template);
        });
    }

    /**
     * Register a template
     */
    register(template) {
        if (!template.id || !template.name || !template.render) {
            throw new Error('Invalid template: must have id, name, and render function');
        }

        this.templates.set(template.id, template);
    }

    /**
     * Get template by ID
     */
    get(id) {
        return this.templates.get(id);
    }

    /**
     * Check if template exists
     */
    has(id) {
        return this.templates.has(id);
    }

    /**
     * Get all templates
     */
    getAll() {
        return Array.from(this.templates.values());
    }

    /**
     * Get template metadata (for UI)
     */
    getAllMetadata() {
        return this.getAll().map(t => ({
            id: t.id,
            name: t.name,
            description: t.description,
            defaultWidth: t.defaultWidth,
            defaultHeight: t.defaultHeight,
            preview: t.preview || null
        }));
    }

    /**
     * Render template with data
     */
    render(templateId, data, theme) {
        const template = this.get(templateId);
        if (!template) {
            throw new Error(`Template ${templateId} not found`);
        }

        return template.render(data, theme);
    }

    /**
     * Get template styles
     */
    getStyles(templateId, theme) {
        const template = this.get(templateId);
        if (!template || !template.getStyles) {
            return '';
        }

        return template.getStyles(theme);
    }
}

// Export singleton instance
module.exports = new TemplateRegistry();
