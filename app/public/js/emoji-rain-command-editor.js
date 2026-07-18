(function initializeEmojiRainCommandEditor(globalObject, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (globalObject) globalObject.EmojiRainCommandEditor = api.EmojiRainCommandEditor;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createCommandEditorModule() {
    'use strict';

    const MAX_COMMANDS = 50;

    class EmojiRainCommandEditor {
        constructor(options = {}) {
            if (!options.root) throw new Error('EmojiRainCommandEditor requires a root element');
            this.root = options.root;
            this.document = options.document || this.root.ownerDocument;
            this.fetch = options.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
            this.FormData = options.FormData || globalThis.FormData;
            this.imagesEndpoint = options.imagesEndpoint;
            this.uploadEndpoint = options.uploadEndpoint;
            this.translate = typeof options.translate === 'function'
                ? options.translate
                : (_key, fallback) => fallback;
            this.galleryImages = [];
            this.renderShell();
        }

        text(key, fallback) {
            return this.translate(key, fallback) || fallback;
        }

        createElement(tag, options = {}) {
            const element = this.document.createElement(tag);
            if (options.className) element.className = options.className;
            if (options.text !== undefined) element.textContent = String(options.text);
            if (options.type) element.type = options.type;
            if (options.role) element.dataset.role = options.role;
            if (options.action) element.dataset.action = options.action;
            return element;
        }

        createLabel(text, control) {
            const label = this.createElement('label', { className: 'emoji-command-editor__label' });
            const caption = this.createElement('span', { text });
            label.append(caption, control);
            return label;
        }

        createNumberSetting(key, label, defaultSeconds) {
            const input = this.createElement('input', { type: 'number' });
            input.dataset.setting = key;
            input.min = '0';
            input.max = '86400';
            input.step = '1';
            input.value = String(defaultSeconds);
            return this.createLabel(label, input);
        }

        renderShell() {
            this.root.replaceChildren();
            this.root.classList.add('emoji-command-editor');

            const title = this.createElement('h2', {
                text: this.text('title', 'Emoji commands')
            });
            const description = this.createElement('p', {
                className: 'help-text',
                text: this.text('description', 'Configure commands and assign an emoji or image.')
            });

            const accessToggle = this.createElement('input', { type: 'checkbox' });
            accessToggle.dataset.setting = 'allow-team-members';
            const accessLabel = this.createLabel(
                this.text('allow_team_members', 'Also allow Teamlevel members'),
                accessToggle
            );
            accessLabel.classList.add('emoji-command-editor__access');
            const accessHelp = this.createElement('p', {
                className: 'help-text',
                text: this.text('subscriber_help', 'Paid subscribers are always allowed.')
            });

            const cooldowns = this.createElement('div', { className: 'emoji-command-editor__cooldowns' });
            cooldowns.append(
                this.createNumberSetting(
                    'team-cooldown',
                    this.text('team_user_cooldown_seconds', 'Team member cooldown (seconds)'),
                    60
                ),
                this.createNumberSetting(
                    'superfan-cooldown',
                    this.text('superfan_cooldown_seconds', 'Subscriber cooldown (seconds)'),
                    15
                ),
                this.createNumberSetting(
                    'global-cooldown',
                    this.text('global_cooldown_seconds', 'Global cooldown (seconds)'),
                    15
                )
            );

            this.rows = this.createElement('div', { className: 'emoji-command-editor__rows' });
            this.status = this.createElement('p', { className: 'help-text emoji-command-editor__status' });
            this.addButton = this.createElement('button', {
                type: 'button',
                action: 'add-command',
                text: this.text('add', 'Add command')
            });
            this.addButton.className = 'secondary emoji-command-editor__add';
            this.addButton.addEventListener('click', () => this.addCommand());

            this.root.append(
                title,
                description,
                accessLabel,
                accessHelp,
                cooldowns,
                this.rows,
                this.status,
                this.addButton
            );
        }

        load(config = {}) {
            this.root.querySelector('[data-setting="allow-team-members"]').checked =
                config.animal_commands_allow_team_members !== false;
            this.setSeconds('team-cooldown', config.animal_command_user_cooldown_ms, 60000);
            this.setSeconds('superfan-cooldown', config.animal_command_superfan_cooldown_ms, 15000);
            this.setSeconds('global-cooldown', config.animal_command_global_cooldown_ms, 15000);
            this.rows.replaceChildren();

            const commands = Array.isArray(config.animal_commands) ? config.animal_commands : [];
            commands.slice(0, MAX_COMMANDS).forEach(command => this.rows.appendChild(this.renderRow(command)));
            this.updateAddButton();
        }

        setSeconds(setting, milliseconds, fallback) {
            const numeric = Number(milliseconds);
            const safeMilliseconds = Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
            this.root.querySelector(`[data-setting="${setting}"]`).value = String(safeMilliseconds / 1000);
        }

        addCommand() {
            if (this.rows.querySelectorAll('[data-command-row]').length >= MAX_COMMANDS) {
                this.status.textContent = this.text('max_commands', 'A maximum of 50 commands is allowed.');
                return;
            }
            this.status.textContent = '';
            this.rows.appendChild(this.renderRow({
                command: '',
                enabled: true,
                asset_type: 'emoji',
                asset_value: ''
            }));
            this.updateAddButton();
        }

        renderRow(command = {}) {
            const row = this.createElement('div', { className: 'emoji-command-editor__row' });
            row.dataset.commandRow = '';

            const enabled = this.createElement('input', { type: 'checkbox', role: 'enabled' });
            enabled.checked = command.enabled !== false;

            const nameInput = this.createElement('input', { type: 'text', role: 'command-name' });
            nameInput.maxLength = 33;
            nameInput.pattern = '[a-z0-9_-]{1,32}';
            nameInput.autocomplete = 'off';
            nameInput.value = String(command.command || '');
            const nameControl = this.createElement('div', { className: 'emoji-command-editor__command-name' });
            nameControl.append(this.createElement('span', { text: '!' }), nameInput);

            const assetType = this.createElement('select', { role: 'asset-type' });
            const emojiOption = this.createElement('option', { text: this.text('emoji', 'Emoji') });
            emojiOption.value = 'emoji';
            const imageOption = this.createElement('option', { text: this.text('image', 'Image') });
            imageOption.value = 'image';
            assetType.append(emojiOption, imageOption);
            assetType.value = command.asset_type === 'image' ? 'image' : 'emoji';

            const assetValue = this.createElement('input', { type: 'text', role: 'asset-value' });
            assetValue.value = String(command.asset_value || '');
            assetValue.placeholder = assetType.value === 'image'
                ? this.text('https_placeholder', 'HTTPS URL or gallery image')
                : '🐾';

            const emojiPreview = this.createElement('span', {
                className: 'emoji-command-editor__emoji-preview',
                role: 'emoji-preview'
            });
            const imagePreview = this.createElement('img', {
                className: 'emoji-command-editor__image-preview',
                role: 'image-preview'
            });
            imagePreview.alt = '';

            const gallery = this.createElement('select', { role: 'gallery' });
            const fileInput = this.createElement('input', { type: 'file', role: 'upload-file' });
            fileInput.accept = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml';
            const uploadButton = this.createElement('button', {
                type: 'button',
                action: 'upload-asset',
                text: this.text('upload', 'Upload')
            });
            uploadButton.className = 'secondary';
            const uploadStatus = this.createElement('span', {
                className: 'emoji-command-editor__upload-status',
                role: 'upload-status'
            });
            const uploadControls = this.createElement('div', { className: 'emoji-command-editor__upload' });
            uploadControls.append(fileInput, uploadButton, uploadStatus);

            const removeButton = this.createElement('button', {
                type: 'button',
                action: 'remove-command',
                text: this.text('remove', 'Remove')
            });
            removeButton.className = 'secondary emoji-command-editor__remove';

            row.append(
                this.createLabel(this.text('enabled', 'Enabled'), enabled),
                this.createLabel(this.text('command', 'Command'), nameControl),
                this.createLabel(this.text('asset_type', 'Target type'), assetType),
                this.createLabel(this.text('asset_value', 'Target'), assetValue),
                emojiPreview,
                imagePreview,
                this.createLabel(this.text('gallery', 'Gallery'), gallery),
                uploadControls,
                removeButton
            );

            assetType.addEventListener('change', () => {
                assetValue.value = '';
                assetValue.placeholder = assetType.value === 'image'
                    ? this.text('https_placeholder', 'HTTPS URL or gallery image')
                    : '🐾';
                this.updateRowMode(row);
                this.updatePreview(row);
            });
            assetValue.addEventListener('input', () => this.updatePreview(row));
            gallery.addEventListener('change', () => {
                if (!gallery.value) return;
                assetValue.value = gallery.value;
                this.updatePreview(row);
            });
            uploadButton.addEventListener('click', () => {
                const file = fileInput.files && fileInput.files[0];
                if (file) this.uploadAsset(row, file);
            });
            removeButton.addEventListener('click', () => {
                row.remove();
                this.updateAddButton();
            });

            this.populateGallerySelect(gallery);
            this.updateRowMode(row);
            this.updatePreview(row);
            return row;
        }

        updateRowMode(row) {
            const isImage = row.querySelector('[data-role="asset-type"]').value === 'image';
            row.querySelector('[data-role="gallery"]').closest('label').hidden = !isImage;
            row.querySelector('.emoji-command-editor__upload').hidden = !isImage;
            row.querySelector('[data-role="image-preview"]').hidden = !isImage;
            row.querySelector('[data-role="emoji-preview"]').hidden = isImage;
        }

        isSafePreviewUrl(value) {
            if (typeof value !== 'string' || !value) return false;
            if (value.startsWith('/')) {
                return !value.includes('..') && !value.includes('\\') && !/[?#]/.test(value);
            }
            try {
                return new URL(value).protocol === 'https:';
            } catch (_) {
                return false;
            }
        }

        updatePreview(row) {
            const type = row.querySelector('[data-role="asset-type"]').value;
            const value = row.querySelector('[data-role="asset-value"]').value;
            const emojiPreview = row.querySelector('[data-role="emoji-preview"]');
            const imagePreview = row.querySelector('[data-role="image-preview"]');
            emojiPreview.textContent = type === 'emoji' ? value : '';
            imagePreview.removeAttribute('src');
            if (type === 'image' && this.isSafePreviewUrl(value)) imagePreview.src = value;
        }

        populateGallerySelect(select) {
            const current = select.value;
            select.replaceChildren();
            const placeholder = this.createElement('option', {
                text: this.galleryImages.length
                    ? this.text('select_gallery', 'Select gallery image')
                    : this.text('no_images', 'No gallery images')
            });
            placeholder.value = '';
            select.appendChild(placeholder);
            this.galleryImages.forEach(image => {
                const option = this.createElement('option', { text: image.filename || image.url });
                option.value = image.url;
                select.appendChild(option);
            });
            if (Array.from(select.options).some(option => option.value === current)) select.value = current;
        }

        setGalleryImages(images) {
            this.galleryImages = Array.isArray(images)
                ? images.filter(image => image && typeof image.url === 'string')
                : [];
            this.root.querySelectorAll('[data-role="gallery"]').forEach(select => {
                this.populateGallerySelect(select);
            });
        }

        async refreshGallery() {
            if (!this.fetch || !this.imagesEndpoint) return [];
            try {
                const response = await this.fetch(this.imagesEndpoint);
                if (response.ok === false) throw new Error('Gallery request failed');
                const data = await response.json();
                if (!data.success) throw new Error(data.error || 'Gallery request failed');
                this.setGalleryImages(data.images || []);
                return this.galleryImages;
            } catch (_) {
                this.setGalleryImages([]);
                return [];
            }
        }

        async uploadAsset(row, file) {
            if (!this.fetch || !this.uploadEndpoint || !this.FormData || !file) return null;
            const status = row.querySelector('[data-role="upload-status"]');
            const body = new this.FormData();
            body.append('image', file);
            try {
                const response = await this.fetch(this.uploadEndpoint, { method: 'POST', body });
                if (response.ok === false) throw new Error('Upload failed');
                const data = await response.json();
                if (!data.success || typeof data.url !== 'string') {
                    throw new Error(data.error || 'Upload failed');
                }
                row.querySelector('[data-role="asset-type"]').value = 'image';
                row.querySelector('[data-role="asset-value"]').value = data.url;
                this.setGalleryImages([
                    ...this.galleryImages.filter(image => image.url !== data.url),
                    { filename: data.filename || data.url, url: data.url }
                ]);
                this.updateRowMode(row);
                this.updatePreview(row);
                status.textContent = data.filename || '';
                return data;
            } catch (error) {
                status.textContent = this.text('upload_failed', 'Upload failed.');
                return { success: false, error: error.message };
            }
        }

        secondsToMilliseconds(setting, fallback) {
            const value = Number(this.root.querySelector(`[data-setting="${setting}"]`).value);
            if (!Number.isFinite(value) || value < 0) return fallback;
            return Math.min(86400000, Math.floor(value * 1000));
        }

        serialize() {
            const commands = Array.from(this.rows.querySelectorAll('[data-command-row]')).map(row => ({
                command: row.querySelector('[data-role="command-name"]').value
                    .trim()
                    .replace(/^!+/, '')
                    .toLowerCase(),
                enabled: row.querySelector('[data-role="enabled"]').checked,
                asset_type: row.querySelector('[data-role="asset-type"]').value,
                asset_value: row.querySelector('[data-role="asset-value"]').value.trim()
            }));

            return {
                animal_commands: commands,
                animal_commands_allow_team_members:
                    this.root.querySelector('[data-setting="allow-team-members"]').checked,
                animal_command_user_cooldown_ms:
                    this.secondsToMilliseconds('team-cooldown', 60000),
                animal_command_superfan_cooldown_ms:
                    this.secondsToMilliseconds('superfan-cooldown', 15000),
                animal_command_global_cooldown_ms:
                    this.secondsToMilliseconds('global-cooldown', 15000)
            };
        }

        updateAddButton() {
            this.addButton.disabled = this.rows.querySelectorAll('[data-command-row]').length >= MAX_COMMANDS;
        }
    }

    return { EmojiRainCommandEditor, MAX_COMMANDS };
}));
