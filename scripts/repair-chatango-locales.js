const fs = require('fs');
const path = require('path');

const translations = {
  en: {
    page_description: 'Chatango settings stay aligned with the active LTTH theme so the panel blends with the rest of the app across day, night, contrast, vision-impaired, and Cid modes.',
    integration_title: 'Chatango Integration',
    status_active: 'Active',
    status_disabled: 'Disabled',
    about_title: 'About Chatango Integration',
    about_text: 'This plugin provides Chatango chat room integration for your stream. Configure your chat room settings, theme appearance, and widget options. The chat will automatically sync with your application\'s theme (day/night/high contrast mode).',
    configuration: 'Configuration',
    room_handle_placeholder: 'your-room-name',
    room_handle_example: 'The name of your Chatango room (e.g., "pupcidsltth")',
    embed_code: 'Embed Code',
    embed_help: 'Copy these embed codes to use Chatango on external pages or OBS browser sources. The dashboard and widget embeds are automatically managed by this plugin.',
    live_preview: 'Live Preview',
    close_preview: 'Close Preview',
    preview_placeholder: 'Preview will appear here',
    copy_code: 'Copy Code',
    loading: 'Loading...',
    preview_warning: '⚠️ Live preview requires the Chatango embed script to load.',
    preview_instructions: 'Save your configuration and refresh the dashboard to see changes.',
    preview_room: 'Room:',
    preview_theme: 'Theme:',
    notification_copy_failed: 'Failed to copy embed code',
    notification_save_failed: 'Failed to save configuration',
    notification_save_failed_detail: 'Failed to save configuration: {error}'
  },
  de: {
    page_description: 'Chatango-Einstellungen folgen dem aktiven LTTH-Theme und fügen sich in Tag-, Nacht-, Kontrast-, Sehbehinderten- und Cid-Modus ein.',
    integration_title: 'Chatango-Integration',
    status_active: 'Aktiv',
    status_disabled: 'Deaktiviert',
    about_title: 'Über die Chatango-Integration',
    about_text: 'Dieses Plugin bindet Chatango-Chaträume in deinen Stream ein. Konfiguriere Chatraum, Erscheinungsbild und Widget-Optionen. Der Chat übernimmt automatisch das Theme der Anwendung (Tag/Nacht/hoher Kontrast).',
    configuration: 'Konfiguration',
    room_handle_placeholder: 'dein-raum-name',
    room_handle_example: 'Der Name deines Chatango-Raums (z. B. "pupcidsltth")',
    embed_code: 'Einbettungscode',
    embed_help: 'Kopiere diese Codes, um Chatango auf externen Seiten oder in OBS-Browserquellen zu verwenden. Dashboard- und Widget-Einbettungen werden automatisch von diesem Plugin verwaltet.',
    live_preview: 'Live-Vorschau',
    close_preview: 'Vorschau schließen',
    preview_placeholder: 'Die Vorschau erscheint hier',
    copy_code: 'Code kopieren',
    loading: 'Wird geladen ...',
    preview_warning: '⚠️ Für die Live-Vorschau muss das Chatango-Einbettungsskript geladen werden.',
    preview_instructions: 'Speichere die Konfiguration und aktualisiere das Dashboard, um die Änderungen zu sehen.',
    preview_room: 'Raum:',
    preview_theme: 'Theme:',
    notification_copy_failed: 'Einbettungscode konnte nicht kopiert werden',
    notification_save_failed: 'Konfiguration konnte nicht gespeichert werden',
    notification_save_failed_detail: 'Konfiguration konnte nicht gespeichert werden: {error}'
  },
  es: {
    page_description: 'La configuración de Chatango sigue el tema activo de LTTH y se integra con los modos claro, oscuro, contraste, accesibilidad visual y Cid.',
    integration_title: 'Integración de Chatango',
    status_active: 'Activo',
    status_disabled: 'Desactivado',
    about_title: 'Acerca de la integración de Chatango',
    about_text: 'Este plugin integra salas de Chatango en tu directo. Configura la sala, el aspecto del tema y las opciones del widget. El chat sincroniza automáticamente el tema de la aplicación (claro/oscuro/alto contraste).',
    configuration: 'Configuración',
    room_handle_placeholder: 'nombre-de-sala',
    room_handle_example: 'El nombre de tu sala de Chatango (p. ej., "pupcidsltth")',
    embed_code: 'Código de inserción',
    embed_help: 'Copia estos códigos para usar Chatango en páginas externas o fuentes de navegador de OBS. Este plugin gestiona automáticamente las inserciones del dashboard y del widget.',
    live_preview: 'Vista previa en directo',
    close_preview: 'Cerrar vista previa',
    preview_placeholder: 'La vista previa aparecerá aquí',
    copy_code: 'Copiar código',
    loading: 'Cargando...',
    preview_warning: '⚠️ La vista previa necesita cargar el script de inserción de Chatango.',
    preview_instructions: 'Guarda la configuración y actualiza el dashboard para ver los cambios.',
    preview_room: 'Sala:',
    preview_theme: 'Tema:',
    notification_copy_failed: 'No se pudo copiar el código de inserción',
    notification_save_failed: 'No se pudo guardar la configuración',
    notification_save_failed_detail: 'No se pudo guardar la configuración: {error}'
  },
  fr: {
    page_description: 'Les réglages Chatango suivent le thème LTTH actif et s’intègrent aux modes clair, sombre, contraste, accessibilité visuelle et Cid.',
    integration_title: 'Intégration Chatango',
    status_active: 'Actif',
    status_disabled: 'Désactivé',
    about_title: 'À propos de l’intégration Chatango',
    about_text: 'Ce plugin intègre les salons Chatango à votre live. Configurez le salon, le thème et les options du widget. Le chat suit automatiquement le thème de l’application (clair/sombre/contraste élevé).',
    configuration: 'Configuration',
    room_handle_placeholder: 'nom-de-votre-salon',
    room_handle_example: 'Nom de votre salon Chatango (par ex. « pupcidsltth »)',
    embed_code: 'Code d’intégration',
    embed_help: 'Copiez ces codes pour utiliser Chatango sur des pages externes ou des sources navigateur OBS. Les intégrations du dashboard et du widget sont gérées automatiquement par ce plugin.',
    live_preview: 'Aperçu en direct',
    close_preview: 'Fermer l’aperçu',
    preview_placeholder: 'L’aperçu apparaîtra ici',
    copy_code: 'Copier le code',
    loading: 'Chargement…',
    preview_warning: '⚠️ L’aperçu nécessite le chargement du script d’intégration Chatango.',
    preview_instructions: 'Enregistrez la configuration puis actualisez le dashboard pour voir les changements.',
    preview_room: 'Salon :',
    preview_theme: 'Thème :',
    notification_copy_failed: 'Impossible de copier le code d’intégration',
    notification_save_failed: 'Impossible d’enregistrer la configuration',
    notification_save_failed_detail: 'Impossible d’enregistrer la configuration : {error}'
  }
};

const coreTranslations = {
  en: {
    title: 'Chatango Settings', description: 'Configure Chatango chat integration', enable: 'Enable Chatango Integration', room_handle: 'Chatango Room Handle', room_handle_help: 'The name of your Chatango room', appearance: 'Appearance', theme: 'Theme', theme_night: 'Night (Dark)', theme_day: 'Day (Light)', theme_contrast: 'High Contrast', font_size: 'Font Size', font_small: 'Small (8px)', font_normal: 'Normal (10px)', font_large: 'Large (12px)', font_xl: 'Extra Large (14px)', allow_pm: 'Allow Private Messages', show_ticker: 'Show Message Ticker', dashboard_embed: 'Dashboard Embed', dashboard_enabled: 'Enable Dashboard Chat Panel', dashboard_help: 'Show Chatango in the dashboard shoutbox area', floating_widget: 'Floating Widget', widget_enabled: 'Enable Floating Widget', widget_help: 'Show a collapsible Chatango widget on pages', widget_position: 'Widget Position', position_br: 'Bottom Right', position_bl: 'Bottom Left', position_tr: 'Top Right', position_tl: 'Top Left', widget_width: 'Widget Width (px)', widget_height: 'Widget Height (px)', collapsed_width: 'Collapsed Width (px)', collapsed_height: 'Collapsed Height (px)', save_config: 'Save Configuration', preview: 'Preview Embed', embed_code: 'Embed Code', embed_help: 'Copy these embed codes to use Chatango on external pages or OBS browser sources', copy_code: 'Copy Code', status_active: 'Active', status_disabled: 'Disabled', config_saved: 'Configuration saved successfully!', config_error: 'Failed to save configuration', copied: 'Embed code copied to clipboard!'
  },
  de: {
    title: 'Chatango-Einstellungen', description: 'Chatango-Chat-Integration konfigurieren', enable: 'Chatango-Integration aktivieren', room_handle: 'Chatango-Raumname', room_handle_help: 'Der Name deines Chatango-Raums', appearance: 'Erscheinungsbild', theme: 'Theme', theme_night: 'Nacht (dunkel)', theme_day: 'Tag (hell)', theme_contrast: 'Hoher Kontrast', font_size: 'Schriftgröße', font_small: 'Klein (8 px)', font_normal: 'Normal (10 px)', font_large: 'Groß (12 px)', font_xl: 'Sehr groß (14 px)', allow_pm: 'Private Nachrichten erlauben', show_ticker: 'Nachrichten-Ticker anzeigen', dashboard_embed: 'Dashboard-Einbettung', dashboard_enabled: 'Chat-Panel im Dashboard aktivieren', dashboard_help: 'Chatango im Shoutbox-Bereich des Dashboards anzeigen', floating_widget: 'Schwebendes Widget', widget_enabled: 'Schwebendes Widget aktivieren', widget_help: 'Einklappbares Chatango-Widget auf Seiten anzeigen', widget_position: 'Widget-Position', position_br: 'Unten rechts', position_bl: 'Unten links', position_tr: 'Oben rechts', position_tl: 'Oben links', widget_width: 'Widget-Breite (px)', widget_height: 'Widget-Höhe (px)', collapsed_width: 'Eingeklappte Breite (px)', collapsed_height: 'Eingeklappte Höhe (px)', save_config: 'Konfiguration speichern', preview: 'Einbettung ansehen', embed_code: 'Einbettungscode', embed_help: 'Kopiere diese Codes für Chatango auf externen Seiten oder in OBS-Browserquellen', copy_code: 'Code kopieren', status_active: 'Aktiv', status_disabled: 'Deaktiviert', config_saved: 'Konfiguration gespeichert!', config_error: 'Konfiguration konnte nicht gespeichert werden', copied: 'Einbettungscode kopiert!'
  },
  es: {
    title: 'Ajustes de Chatango', description: 'Configura la integración del chat de Chatango', enable: 'Activar la integración de Chatango', room_handle: 'Nombre de la sala de Chatango', room_handle_help: 'Nombre de tu sala de Chatango', appearance: 'Apariencia', theme: 'Tema', theme_night: 'Noche (oscuro)', theme_day: 'Día (claro)', theme_contrast: 'Alto contraste', font_size: 'Tamaño de fuente', font_small: 'Pequeña (8 px)', font_normal: 'Normal (10 px)', font_large: 'Grande (12 px)', font_xl: 'Muy grande (14 px)', allow_pm: 'Permitir mensajes privados', show_ticker: 'Mostrar ticker de mensajes', dashboard_embed: 'Inserción en el dashboard', dashboard_enabled: 'Activar panel de chat del dashboard', dashboard_help: 'Mostrar Chatango en la zona de chat del dashboard', floating_widget: 'Widget flotante', widget_enabled: 'Activar widget flotante', widget_help: 'Mostrar un widget de Chatango plegable en las páginas', widget_position: 'Posición del widget', position_br: 'Abajo a la derecha', position_bl: 'Abajo a la izquierda', position_tr: 'Arriba a la derecha', position_tl: 'Arriba a la izquierda', widget_width: 'Ancho del widget (px)', widget_height: 'Alto del widget (px)', collapsed_width: 'Ancho plegado (px)', collapsed_height: 'Alto plegado (px)', save_config: 'Guardar configuración', preview: 'Vista previa de inserción', embed_code: 'Código de inserción', embed_help: 'Copia estos códigos para usar Chatango en páginas externas o fuentes de navegador de OBS', copy_code: 'Copiar código', status_active: 'Activo', status_disabled: 'Desactivado', config_saved: '¡Configuración guardada!', config_error: 'No se pudo guardar la configuración', copied: '¡Código de inserción copiado!'
  },
  fr: {
    title: 'Paramètres Chatango', description: 'Configurer l’intégration du chat Chatango', enable: 'Activer l’intégration Chatango', room_handle: 'Nom du salon Chatango', room_handle_help: 'Nom de votre salon Chatango', appearance: 'Apparence', theme: 'Thème', theme_night: 'Nuit (sombre)', theme_day: 'Jour (clair)', theme_contrast: 'Contraste élevé', font_size: 'Taille de police', font_small: 'Petite (8 px)', font_normal: 'Normale (10 px)', font_large: 'Grande (12 px)', font_xl: 'Très grande (14 px)', allow_pm: 'Autoriser les messages privés', show_ticker: 'Afficher le ticker des messages', dashboard_embed: 'Intégration au dashboard', dashboard_enabled: 'Activer le panneau Chat du dashboard', dashboard_help: 'Afficher Chatango dans la zone de chat du dashboard', floating_widget: 'Widget flottant', widget_enabled: 'Activer le widget flottant', widget_help: 'Afficher un widget Chatango rétractable sur les pages', widget_position: 'Position du widget', position_br: 'En bas à droite', position_bl: 'En bas à gauche', position_tr: 'En haut à droite', position_tl: 'En haut à gauche', widget_width: 'Largeur du widget (px)', widget_height: 'Hauteur du widget (px)', collapsed_width: 'Largeur repliée (px)', collapsed_height: 'Hauteur repliée (px)', save_config: 'Enregistrer la configuration', preview: 'Aperçu de l’intégration', embed_code: 'Code d’intégration', embed_help: 'Copiez ces codes pour utiliser Chatango sur des pages externes ou des sources navigateur OBS', copy_code: 'Copier le code', status_active: 'Actif', status_disabled: 'Désactivé', config_saved: 'Configuration enregistrée !', config_error: 'Impossible d’enregistrer la configuration', copied: 'Code d’intégration copié !'
  }
};

for (const [locale, additions] of Object.entries(translations)) {
  const file = path.join(__dirname, '..', 'app', 'plugins', 'chatango', 'locales', `${locale}.json`);
  const current = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  current.chatango = { ...current.chatango, ...coreTranslations[locale], ...additions };
  fs.writeFileSync(file, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
}
