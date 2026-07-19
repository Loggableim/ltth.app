'use strict';

const languages = ['en', 'de', 'es', 'fr'];

const rows = {
  page_title: ['WebGPU Fireworks Show Designer', 'WebGPU-Feuerwerk-Show-Designer', 'Diseñador de shows de fuegos artificiales WebGPU', 'Concepteur de shows pyrotechniques WebGPU'],
  product_name: ['WebGPU Fireworks', 'WebGPU-Feuerwerk', 'Fuegos artificiales WebGPU', 'Feux d’artifice WebGPU'],
  back_to_settings: ['Back to settings', 'Zurück zu den Einstellungen', 'Volver a los ajustes', 'Retour aux réglages'],
  status_idle: ['Idle', 'Inaktiv', 'Inactivo', 'Inactif'],
  status_saving: ['Saving…', 'Wird gespeichert…', 'Guardando…', 'Enregistrement…'],
  status_saved: ['Saved · r{revision}', 'Gespeichert · r{revision}', 'Guardado · r{revision}', 'Enregistré · r{revision}'],
  status_error: ['Save failed', 'Speichern fehlgeschlagen', 'Error al guardar', 'Échec de l’enregistrement'],
  status_revision: ['{status} · r{revision}', '{status} · r{revision}', '{status} · r{revision}', '{status} · r{revision}'],
  library_empty: ['No shows in this view.', 'Keine Shows in dieser Ansicht.', 'No hay shows en esta vista.', 'Aucun show dans cette vue.'],
  select_show: ['Select a show', 'Show auswählen', 'Seleccionar un show', 'Sélectionner un show'],
  readonly_notice: ['Built-in shows are read-only. Duplicate this show to edit it.', 'Integrierte Shows sind schreibgeschützt. Dupliziere diese Show, um sie zu bearbeiten.', 'Los shows integrados son de solo lectura. Duplica este show para editarlo.', 'Les shows intégrés sont en lecture seule. Dupliquez ce show pour le modifier.'],
  launch_line: ['Launch line', 'Abschusslinie', 'Línea de lanzamiento', 'Ligne de tir'],
  stage_empty: ['Select a cue to edit shell targets.', 'Wähle einen Cue aus, um die Ziele der Feuerwerkskörper zu bearbeiten.', 'Selecciona una entrada para editar los destinos de las bombas.', 'Sélectionnez un repère pour modifier les cibles des bombes.'],
  snap_hint: ['Grid 0.025 · Alt bypasses snapping', 'Raster 0,025 · Alt umgeht das Einrasten', 'Cuadrícula 0,025 · Alt desactiva el ajuste', 'Grille 0,025 · Alt désactive l’aimantation'],
  time_seconds: ['{seconds} s', '{seconds} s', '{seconds} s', '{seconds} s'],
  cue_summary: ['{formation} · {count} shells', '{formation} · {count} Feuerwerkskörper', '{formation} · {count} bombas', '{formation} · {count} bombes'],
  variant_missing: ['This length has not been derived yet.', 'Diese Länge wurde noch nicht abgeleitet.', 'Esta duración aún no se ha derivado.', 'Cette durée n’a pas encore été déclinée.'],
  beforeunload: ['This show has unsaved changes.', 'Diese Show enthält ungespeicherte Änderungen.', 'Este show tiene cambios sin guardar.', 'Ce show contient des modifications non enregistrées.'],
  aria: {
    show_actions: ['Show actions', 'Show-Aktionen', 'Acciones del show', 'Actions du show'],
    validation_publishing: ['Validation and publishing', 'Validierung und Veröffentlichung', 'Validación y publicación', 'Validation et publication'],
    show_library: ['Show library', 'Show-Bibliothek', 'Biblioteca de shows', 'Bibliothèque de shows'],
    refresh_library: ['Refresh show library', 'Show-Bibliothek aktualisieren', 'Actualizar la biblioteca de shows', 'Actualiser la bibliothèque de shows'],
    library_filters: ['Show library filters', 'Filter der Show-Bibliothek', 'Filtros de la biblioteca de shows', 'Filtres de la bibliothèque de shows'],
    available_shows: ['Available shows', 'Verfügbare Shows', 'Shows disponibles', 'Shows disponibles'],
    shell_target_stage: ['Shell target stage', 'Zielbühne der Feuerwerkskörper', 'Escenario de destinos de bombas', 'Scène des cibles de bombes'],
    show_length: ['Show length', 'Show-Länge', 'Duración del show', 'Durée du show'],
    fireworks_stage: ['Fireworks shell target editor', 'Ziel-Editor für Feuerwerkskörper', 'Editor de destinos de bombas', 'Éditeur de cibles de bombes'],
    shell_launch_paths: ['Shell launch paths', 'Flugbahnen der Feuerwerkskörper', 'Trayectorias de lanzamiento', 'Trajectoires de lancement'],
    layer_inspector: ['Layer inspector', 'Ebenen-Inspektor', 'Inspector de capas', 'Inspecteur de calques'],
    cue_timeline: ['Cue timeline', 'Cue-Zeitleiste', 'Línea de tiempo de entradas', 'Chronologie des repères'],
    show_cues: ['Show cues', 'Show-Cues', 'Entradas del show', 'Repères du show'],
    shell_handle: ['Shell {count}', 'Feuerwerkskörper {count}', 'Bomba {count}', 'Bombe {count}']
  },
  actions: {
    undo: ['Undo', 'Rückgängig', 'Deshacer', 'Annuler'],
    redo: ['Redo', 'Wiederholen', 'Rehacer', 'Rétablir'],
    add_cue: ['Add cue', 'Cue hinzufügen', 'Añadir entrada', 'Ajouter un repère'],
    remove_cue: ['Remove cue', 'Cue entfernen', 'Eliminar entrada', 'Supprimer le repère'],
    add_shell: ['Add shell', 'Feuerwerkskörper hinzufügen', 'Añadir bomba', 'Ajouter une bombe'],
    remove_shell: ['Remove shell', 'Feuerwerkskörper entfernen', 'Eliminar bomba', 'Supprimer la bombe'],
    add_layer: ['Add layer', 'Ebene hinzufügen', 'Añadir capa', 'Ajouter un calque'],
    remove_layer: ['Remove layer', 'Ebene entfernen', 'Eliminar capa', 'Supprimer le calque'],
    preview_cue: ['Test cue', 'Cue testen', 'Probar entrada', 'Tester le repère'],
    preview_phase: ['Test phase', 'Phase testen', 'Probar fase', 'Tester la phase'],
    preview_show: ['Test show', 'Show testen', 'Probar show', 'Tester le show']
  },
  tooltips: {
    undo: ['Undo the last edit', 'Letzte Bearbeitung rückgängig machen', 'Deshacer la última edición', 'Annuler la dernière modification'],
    redo: ['Redo the last edit', 'Letzte Bearbeitung wiederholen', 'Rehacer la última edición', 'Rétablir la dernière modification']
  },
  conflict: {
    title: ['A newer revision is available', 'Eine neuere Revision ist verfügbar', 'Hay una revisión más reciente', 'Une révision plus récente est disponible'],
    description: ['Reload the server revision or save your local edits as a new show.', 'Lade die Server-Revision neu oder speichere deine lokalen Änderungen als neue Show.', 'Carga la revisión del servidor o guarda tus cambios locales como un show nuevo.', 'Rechargez la révision du serveur ou enregistrez vos modifications locales comme nouveau show.'],
    load_server: ['Load server revision', 'Server-Revision laden', 'Cargar revisión del servidor', 'Charger la révision du serveur'],
    save_local_copy: ['Save local copy', 'Lokale Kopie speichern', 'Guardar copia local', 'Enregistrer une copie locale']
  },
  panels: {
    library: ['Library', 'Bibliothek', 'Biblioteca', 'Bibliothèque'],
    shows: ['Shows', 'Shows', 'Shows', 'Shows'],
    stage: ['Stage', 'Bühne', 'Escenario', 'Scène'],
    inspector: ['Inspector', 'Inspektor', 'Inspector', 'Inspecteur'],
    properties: ['Properties', 'Eigenschaften', 'Propiedades', 'Propriétés'],
    timeline: ['Timeline', 'Zeitleiste', 'Línea de tiempo', 'Chronologie'],
    cues: ['Cues', 'Cues', 'Entradas', 'Repères']
  },
  filters: {
    all: ['All', 'Alle', 'Todos', 'Tous'],
    built_in: ['Built-in', 'Integriert', 'Integrados', 'Intégrés'],
    custom: ['Custom', 'Eigene', 'Personalizados', 'Personnalisés'],
    archived: ['Archived', 'Archiviert', 'Archivados', 'Archivés']
  },
  variants: {
    long: ['Long', 'Lang', 'Larga', 'Longue'],
    medium: ['Medium', 'Mittel', 'Media', 'Moyenne'],
    short: ['Short', 'Kurz', 'Corta', 'Courte']
  },
  sections: {
    show: ['Show', 'Show', 'Show', 'Show'],
    cue: ['Cue', 'Cue', 'Entrada', 'Repère'],
    shell: ['Shell', 'Feuerwerkskörper', 'Bomba', 'Bombe'],
    layers: ['Layers', 'Ebenen', 'Capas', 'Calques']
  },
  fields: {
    name: ['Name', 'Name', 'Nombre', 'Nom'],
    description: ['Description', 'Beschreibung', 'Descripción', 'Description'],
    material: ['Material profile', 'Materialprofil', 'Perfil de material', 'Profil de matériau'],
    auto_eligible: ['Automatic rotation eligible', 'Für automatische Rotation verfügbar', 'Disponible para rotación automática', 'Disponible pour la rotation automatique'],
    time_ms: ['Time (ms)', 'Zeit (ms)', 'Tiempo (ms)', 'Temps (ms)'],
    phase: ['Phase', 'Phase', 'Fase', 'Phase'],
    formation: ['Formation', 'Formation', 'Formación', 'Formation'],
    importance: ['Importance', 'Priorität des Cues', 'Importancia', 'Importance'],
    origin_x: ['Origin X', 'Ursprung X', 'Origen X', 'Origine X'],
    origin_y: ['Origin Y', 'Ursprung Y', 'Origen Y', 'Origine Y'],
    target_x: ['Target X', 'Ziel X', 'Destino X', 'Cible X'],
    target_y: ['Target Y', 'Ziel Y', 'Destino Y', 'Cible Y'],
    launch: ['Launch mode', 'Abschussart', 'Modo de lanzamiento', 'Mode de lancement'],
    tier: ['Shell tier', 'Größenklasse', 'Categoría de bomba', 'Catégorie de bombe'],
    palette: ['Palette', 'Palette', 'Paleta', 'Palette'],
    primitive: ['Primitive', 'Grundform', 'Primitiva', 'Primitive'],
    glyph: ['Glyph', 'Symbol', 'Glifo', 'Glyphe'],
    delay_ms: ['Delay (ms)', 'Verzögerung (ms)', 'Retardo (ms)', 'Délai (ms)'],
    density: ['Density', 'Dichte', 'Densidad', 'Densité'],
    size: ['Size', 'Größe', 'Tamaño', 'Taille'],
    lifetime_ms: ['Lifetime (ms)', 'Lebensdauer (ms)', 'Duración (ms)', 'Durée de vie (ms)'],
    gravity: ['Gravity', 'Schwerkraft', 'Gravedad', 'Gravité'],
    drag: ['Drag', 'Luftwiderstand', 'Resistencia', 'Traînée'],
    priority: ['Priority', 'Priorität', 'Prioridad', 'Priorité'],
    colors: ['Colors', 'Farben', 'Colores', 'Couleurs']
  },
  options: {
    phase: {
      opening: ['Opening', 'Eröffnung', 'Apertura', 'Ouverture'],
      build: ['Build', 'Aufbau', 'Desarrollo', 'Montée'],
      highlight: ['Highlight', 'Höhepunkt', 'Momento destacado', 'Temps fort'],
      calm: ['Calm', 'Ruhe', 'Calma', 'Calme'],
      bridge: ['Bridge', 'Übergang', 'Transición', 'Transition'],
      breath: ['Breath', 'Atempause', 'Pausa', 'Respiration'],
      finale: ['Finale', 'Finale', 'Final', 'Finale']
    },
    formation: {
      single: ['Single', 'Einzeln', 'Individual', 'Unique'],
      pair: ['Pair', 'Paar', 'Pareja', 'Paire'],
      fan: ['Fan', 'Fächer', 'Abanico', 'Éventail'],
      wall: ['Wall', 'Wand', 'Muro', 'Mur'],
      ring: ['Ring', 'Ring', 'Anillo', 'Anneau'],
      arc: ['Arc', 'Bogen', 'Arco', 'Arc'],
      grid: ['Grid', 'Raster', 'Cuadrícula', 'Grille'],
      cascade: ['Cascade', 'Kaskade', 'Cascada', 'Cascade'],
      alternating_pair: ['Alternating pair', 'Wechselpaar', 'Pareja alterna', 'Paire alternée'],
      ring_accent: ['Ring accent', 'Ringakzent', 'Acento de anillo', 'Accent annulaire'],
      star_accent: ['Star accent', 'Sternakzent', 'Acento de estrella', 'Accent étoilé'],
      gold_crown: ['Gold crown', 'Goldkrone', 'Corona dorada', 'Couronne dorée'],
      call: ['Call', 'Ruf', 'Llamada', 'Appel'],
      response: ['Response', 'Antwort', 'Respuesta', 'Réponse'],
      mirrored_pair: ['Mirrored pair', 'Spiegelpaar', 'Pareja reflejada', 'Paire en miroir'],
      centered_ring: ['Centered ring', 'Zentrierter Ring', 'Anillo centrado', 'Anneau centré'],
      triple_salute: ['Triple salute', 'Dreifachsalut', 'Salva triple', 'Triple salut'],
      symmetric_final_wall: ['Symmetric final wall', 'Symmetrische Schlusswand', 'Muro final simétrico', 'Mur final symétrique'],
      diagonal_pair: ['Diagonal pair', 'Diagonalpaar', 'Pareja diagonal', 'Paire diagonale'],
      cross_pair: ['Cross pair', 'Kreuzpaar', 'Pareja cruzada', 'Paire croisée'],
      spiral_accent: ['Spiral accent', 'Spiralakzent', 'Acento espiral', 'Accent spiralé'],
      floral_finale: ['Floral finale', 'Blütenfinale', 'Final floral', 'Final floral'],
      heavy_single: ['Heavy single', 'Schwerer Einzelschuss', 'Disparo individual pesado', 'Tir unique puissant'],
      staggered_volley: ['Staggered volley', 'Gestaffelte Salve', 'Salva escalonada', 'Salve décalée'],
      finale_wave_1: ['Finale wave 1', 'Finalwelle 1', 'Onda final 1', 'Vague finale 1'],
      finale_wave_2: ['Finale wave 2', 'Finalwelle 2', 'Onda final 2', 'Vague finale 2'],
      finale_wave_3: ['Finale wave 3', 'Finalwelle 3', 'Onda final 3', 'Vague finale 3'],
      peony: ['Peony', 'Pfingstrose', 'Peonía', 'Pivoine'],
      chrysanthemum: ['Chrysanthemum', 'Chrysantheme', 'Crisantemo', 'Chrysanthème'],
      willow: ['Willow', 'Trauerweide', 'Sauce', 'Saule'],
      cathedral: ['Cathedral', 'Kathedrale', 'Catedral', 'Cathédrale'],
      baroque_wall: ['Baroque wall', 'Barockwand', 'Muro barroco', 'Mur baroque'],
      wing_fan: ['Wing fan', 'Flügelfächer', 'Abanico de alas', 'Éventail d’ailes'],
      paw_fan: ['Paw fan', 'Pfotenfächer', 'Abanico de huellas', 'Éventail de pattes'],
      glyph_crown: ['Glyph crown', 'Glyphenkrone', 'Corona de glifos', 'Couronne de glyphes']
    },
    importance: {
      decorative: ['Decorative', 'Dekorativ', 'Decorativa', 'Décoratif'],
      standard: ['Standard', 'Standard', 'Estándar', 'Standard'],
      essential: ['Essential', 'Wesentlich', 'Esencial', 'Essentiel'],
      final_wave: ['Final wave', 'Finalwelle', 'Onda final', 'Vague finale']
    },
    launch_mode: {
      rocket: ['Rocket', 'Rakete', 'Cohete', 'Fusée'],
      airburst: ['Air burst', 'Luftdetonation', 'Explosión aérea', 'Explosion aérienne'],
      ground: ['Ground', 'Boden', 'Suelo', 'Sol']
    },
    tier: {
      small: ['Small', 'Klein', 'Pequeña', 'Petite'],
      medium: ['Medium', 'Mittel', 'Mediana', 'Moyenne'],
      big: ['Big', 'Groß', 'Grande', 'Grande'],
      massive: ['Massive', 'Massiv', 'Masiva', 'Massive']
    },
    primitive: {
      radial: ['Radial burst', 'Radialbuket', 'Explosión radial', 'Bouquet radial'],
      ring: ['Ring', 'Ring', 'Anillo', 'Anneau'],
      spiral: ['Spiral', 'Spirale', 'Espiral', 'Spirale'],
      palm: ['Palm', 'Palme', 'Palmera', 'Palme'],
      crossette: ['Crossette', 'Crossette', 'Crossette', 'Crossette'],
      comet: ['Comet', 'Komet', 'Cometa', 'Comète'],
      mine: ['Mine', 'Mine', 'Mina', 'Mine'],
      glyph: ['Glyph', 'Symbol', 'Glifo', 'Glyphe']
    },
    glyph: {
      paw: ['Paw', 'Pfote', 'Huella', 'Patte'],
      heart: ['Heart', 'Herz', 'Corazón', 'Cœur'],
      star: ['Star', 'Stern', 'Estrella', 'Étoile'],
      fox_head: ['Fox head', 'Fuchskopf', 'Cabeza de zorro', 'Tête de renard'],
      wolf_head: ['Wolf head', 'Wolfskopf', 'Cabeza de lobo', 'Tête de loup'],
      dragon: ['Dragon', 'Drache', 'Dragón', 'Dragon'],
      dragon_wing: ['Dragon wing', 'Drachenflügel', 'Ala de dragón', 'Aile de dragon'],
      tail: ['Tail', 'Schweif', 'Cola', 'Queue']
    },
    priority: {
      core: ['Core', 'Kern', 'Núcleo', 'Cœur'],
      accent: ['Accent', 'Akzent', 'Acento', 'Accent'],
      decorative: ['Decorative', 'Dekorativ', 'Decorativa', 'Décoratif']
    },
    material: {
      classic: ['Classic', 'Klassisch', 'Clásico', 'Classique'],
      premium_realistic: ['Premium realistic', 'Premium-realistisch', 'Realista prémium', 'Réaliste premium']
    },
    boolean: {
      trail: ['Trail', 'Schweif', 'Estela', 'Traînée'],
      split: ['Split', 'Teilung', 'División', 'Division'],
      strobe: ['Strobe', 'Stroboskop', 'Estrobo', 'Stroboscope'],
      core: ['Core', 'Kern', 'Núcleo', 'Cœur']
    }
  },
  validation_empty: ['No validation issues.', 'Keine Validierungsprobleme.', 'No hay problemas de validación.', 'Aucun problème de validation.'],
  validation_issue: ['{message} · {path}', '{message} · {path}', '{message} · {path}', '{message} · {path}'],
  validation_issue_fallback: ['Validation issue', 'Validierungsproblem', 'Problema de validación', 'Problème de validation'],
  validation_show_path: ['show', 'Show', 'show', 'show'],
  validation_codes: {
    colors_required: ['Choose at least one color.', 'Wähle mindestens eine Farbe aus.', 'Elige al menos un color.', 'Choisissez au moins une couleur.'],
    core_particle_budget_exceeded: ['The core-particle budget is exceeded.', 'Das Kernpartikel-Budget wurde überschritten.', 'Se superó el presupuesto de partículas principales.', 'Le budget de particules principales est dépassé.'],
    cues_required: ['Add at least one cue.', 'Füge mindestens einen Cue hinzu.', 'Añade al menos una entrada.', 'Ajoutez au moins un repère.'],
    glyph_required: ['Choose a glyph for this glyph layer.', 'Wähle ein Symbol für diese Symbolebene.', 'Elige un glifo para esta capa.', 'Choisissez un glyphe pour ce calque.'],
    inconsistent_core_priority: ['Core layers must use core priority.', 'Kernebenen müssen die Kernpriorität verwenden.', 'Las capas principales deben usar prioridad de núcleo.', 'Les calques principaux doivent utiliser la priorité cœur.'],
    invalid_array: ['This value must be a list.', 'Dieser Wert muss eine Liste sein.', 'Este valor debe ser una lista.', 'Cette valeur doit être une liste.'],
    invalid_author: ['Enter a valid author.', 'Gib einen gültigen Autor ein.', 'Introduce un autor válido.', 'Saisissez un auteur valide.'],
    invalid_boolean: ['This value must be true or false.', 'Dieser Wert muss wahr oder falsch sein.', 'Este valor debe ser verdadero o falso.', 'Cette valeur doit être vraie ou fausse.'],
    invalid_color: ['Enter a valid color.', 'Gib eine gültige Farbe ein.', 'Introduce un color válido.', 'Saisissez une couleur valide.'],
    invalid_coordinate: ['Enter a valid coordinate.', 'Gib eine gültige Koordinate ein.', 'Introduce una coordenada válida.', 'Saisissez une coordonnée valide.'],
    invalid_definition: ['The show definition is invalid.', 'Die Show-Definition ist ungültig.', 'La definición del show no es válida.', 'La définition du show est invalide.'],
    invalid_definition_id: ['Enter a valid definition ID.', 'Gib eine gültige Definitions-ID ein.', 'Introduce un ID de definición válido.', 'Saisissez un identifiant de définition valide.'],
    invalid_description: ['Enter a valid description.', 'Gib eine gültige Beschreibung ein.', 'Introduce una descripción válida.', 'Saisissez une description valide.'],
    invalid_object: ['This value must be an object.', 'Dieser Wert muss ein Objekt sein.', 'Este valor debe ser un objeto.', 'Cette valeur doit être un objet.'],
    invalid_range: ['This value is outside the allowed range.', 'Dieser Wert liegt außerhalb des zulässigen Bereichs.', 'Este valor está fuera del intervalo permitido.', 'Cette valeur est hors de la plage autorisée.'],
    invalid_tags: ['Enter valid tags.', 'Gib gültige Tags ein.', 'Introduce etiquetas válidas.', 'Saisissez des étiquettes valides.'],
    invalid_variant_duration: ['The variant duration is invalid.', 'Die Dauer der Variante ist ungültig.', 'La duración de la variante no es válida.', 'La durée de la variante est invalide.'],
    layers_required: ['Add at least one layer.', 'Füge mindestens eine Ebene hinzu.', 'Añade al menos una capa.', 'Ajoutez au moins un calque.'],
    long_variant_required: ['A Long variant is required.', 'Eine lange Variante ist erforderlich.', 'Se requiere una variante larga.', 'Une variante longue est requise.'],
    missing_required_phase: ['Add every required phase.', 'Füge jede erforderliche Phase hinzu.', 'Añade todas las fases requeridas.', 'Ajoutez toutes les phases requises.'],
    name_required: ['Enter a show name.', 'Gib einen Show-Namen ein.', 'Introduce un nombre para el show.', 'Saisissez un nom de show.'],
    phase_concurrency_exceeded: ['This phase launches too many shells at once.', 'Diese Phase startet zu viele Feuerwerkskörper gleichzeitig.', 'Esta fase lanza demasiadas bombas a la vez.', 'Cette phase lance trop de bombes à la fois.'],
    required_property_missing: ['A required property is missing.', 'Eine erforderliche Eigenschaft fehlt.', 'Falta una propiedad obligatoria.', 'Une propriété obligatoire est manquante.'],
    shells_required: ['Add at least one shell.', 'Füge mindestens einen Feuerwerkskörper hinzu.', 'Añade al menos una bomba.', 'Ajoutez au moins une bombe.'],
    show_tail_exceeds_duration: ['The final effect exceeds the show duration.', 'Der letzte Effekt überschreitet die Show-Dauer.', 'El efecto final supera la duración del show.', 'Le dernier effet dépasse la durée du show.'],
    spawn_command_budget_exceeded: ['The launch-command budget is exceeded.', 'Das Budget für Abschussbefehle wurde überschritten.', 'Se superó el presupuesto de comandos de lanzamiento.', 'Le budget de commandes de lancement est dépassé.'],
    too_many_layers: ['This shell has too many layers.', 'Dieser Feuerwerkskörper hat zu viele Ebenen.', 'Esta bomba tiene demasiadas capas.', 'Cette bombe comporte trop de calques.'],
    unknown_property: ['Remove the unsupported property.', 'Entferne die nicht unterstützte Eigenschaft.', 'Elimina la propiedad no compatible.', 'Supprimez la propriété non prise en charge.'],
    unordered_cue_time: ['Cue times must be in ascending order.', 'Cue-Zeiten müssen aufsteigend sortiert sein.', 'Los tiempos de entrada deben estar en orden ascendente.', 'Les temps des repères doivent être croissants.'],
    unsupported_formation: ['Choose a supported formation.', 'Wähle eine unterstützte Formation.', 'Elige una formación compatible.', 'Choisissez une formation prise en charge.'],
    unsupported_glyph: ['Choose a supported glyph.', 'Wähle ein unterstütztes Symbol.', 'Elige un glifo compatible.', 'Choisissez un glyphe pris en charge.'],
    unsupported_importance: ['Choose a supported importance level.', 'Wähle eine unterstützte Cue-Priorität.', 'Elige un nivel de importancia compatible.', 'Choisissez un niveau d’importance pris en charge.'],
    unsupported_launch_mode: ['Choose a supported launch mode.', 'Wähle eine unterstützte Abschussart.', 'Elige un modo de lanzamiento compatible.', 'Choisissez un mode de lancement pris en charge.'],
    unsupported_layer_priority: ['Choose a supported layer priority.', 'Wähle eine unterstützte Ebenenpriorität.', 'Elige una prioridad de capa compatible.', 'Choisissez une priorité de calque prise en charge.'],
    unsupported_material_profile: ['Choose a supported material profile.', 'Wähle ein unterstütztes Materialprofil.', 'Elige un perfil de material compatible.', 'Choisissez un profil de matériau pris en charge.'],
    unsupported_phase: ['Choose a supported phase.', 'Wähle eine unterstützte Phase.', 'Elige una fase compatible.', 'Choisissez une phase prise en charge.'],
    unsupported_primitive: ['Choose a supported primitive.', 'Wähle eine unterstützte Grundform.', 'Elige una primitiva compatible.', 'Choisissez une primitive prise en charge.'],
    unsupported_schema_version: ['This schema version is not supported.', 'Diese Schemaversion wird nicht unterstützt.', 'Esta versión del esquema no es compatible.', 'Cette version du schéma n’est pas prise en charge.'],
    unsupported_tier: ['Choose a supported shell tier.', 'Wähle eine unterstützte Größenklasse.', 'Elige una categoría de bomba compatible.', 'Choisissez une catégorie de bombe prise en charge.']
  },
  errors: {
    action_failed: ['The show action failed.', 'Die Show-Aktion ist fehlgeschlagen.', 'La acción del show ha fallado.', 'L’action du show a échoué.'],
    load_library: ['Could not load the show library.', 'Die Show-Bibliothek konnte nicht geladen werden.', 'No se pudo cargar la biblioteca de shows.', 'Impossible de charger la bibliothèque de shows.'],
    load_show: ['Could not load this show.', 'Diese Show konnte nicht geladen werden.', 'No se pudo cargar este show.', 'Impossible de charger ce show.'],
    import_failed: ['Could not import this show.', 'Diese Show konnte nicht importiert werden.', 'No se pudo importar este show.', 'Impossible d’importer ce show.'],
    preview_failed: ['Preview failed.', 'Vorschau fehlgeschlagen.', 'Error en la vista previa.', 'Échec de l’aperçu.'],
    invalid_json: ['The selected file is not valid JSON.', 'Die ausgewählte Datei enthält kein gültiges JSON.', 'El archivo seleccionado no contiene JSON válido.', 'Le fichier sélectionné ne contient pas de JSON valide.'],
    network_error: ['The show service is offline.', 'Der Show-Dienst ist offline.', 'El servicio de shows está desconectado.', 'Le service de shows est hors ligne.'],
    invalid_response: ['The show service returned an invalid response.', 'Der Show-Dienst hat eine ungültige Antwort gesendet.', 'El servicio de shows devolvió una respuesta no válida.', 'Le service de shows a renvoyé une réponse invalide.'],
    request_failed: ['The show request failed.', 'Die Show-Anfrage ist fehlgeschlagen.', 'La solicitud del show ha fallado.', 'La requête du show a échoué.'],
    finale_busy: ['The fireworks renderer is busy.', 'Der Feuerwerk-Renderer ist beschäftigt.', 'El renderizador de fuegos artificiales está ocupado.', 'Le moteur de feux d’artifice est occupé.'],
    renderer_not_ready: ['The fireworks renderer is not ready.', 'Der Feuerwerk-Renderer ist nicht bereit.', 'El renderizador de fuegos artificiales no está listo.', 'Le moteur de feux d’artifice n’est pas prêt.'],
    preview_draft_invalid: ['Validate the draft before previewing it.', 'Validiere den Entwurf vor der Vorschau.', 'Valida el borrador antes de previsualizarlo.', 'Validez le brouillon avant de le prévisualiser.'],
    revision_conflict: ['Revision conflict', 'Revisionskonflikt', 'Conflicto de revisión', 'Conflit de révision']
  },
  notices: {
    created: ['New 28-second master show created.', 'Neue 28-Sekunden-Master-Show erstellt.', 'Se ha creado un show maestro de 28 segundos.', 'Un nouveau show maître de 28 secondes a été créé.'],
    duplicated: ['Editable copy created with the original show geometry.', 'Bearbeitbare Kopie mit der Geometrie der Original-Show erstellt.', 'Se ha creado una copia editable con la geometría del show original.', 'Une copie modifiable reprenant la géométrie du show original a été créée.'],
    validation_auto_derived: ['Validation passed. {variants} were derived from the long master.', 'Validierung erfolgreich. {variants} wurden aus der langen Master-Version abgeleitet.', 'Validación superada. Se derivaron {variants} del maestro largo.', 'Validation réussie. {variants} ont été déclinées depuis la version longue principale.'],
    validation_passed: ['Validation passed.', 'Validierung erfolgreich.', 'Validación superada.', 'Validation réussie.'],
    validation_issues: ['Validation found issues. Select an issue to navigate to it.', 'Die Validierung hat Probleme gefunden. Wähle ein Problem aus, um dorthin zu springen.', 'La validación encontró problemas. Selecciona uno para ir hasta él.', 'La validation a détecté des problèmes. Sélectionnez-en un pour y accéder.'],
    derived: ['Medium and Short were regenerated from the Long master.', 'Mittel und Kurz wurden aus der langen Master-Version neu erzeugt.', 'Las versiones media y corta se regeneraron a partir del maestro largo.', 'Les versions moyenne et courte ont été régénérées depuis la version longue principale.'],
    published: ['Show published.', 'Show veröffentlicht.', 'Show publicado.', 'Show publié.'],
    archived: ['Show archived.', 'Show archiviert.', 'Show archivado.', 'Show archivé.'],
    restored: ['Show restored.', 'Show wiederhergestellt.', 'Show restaurado.', 'Show restauré.'],
    preview_accepted: ['Preview accepted by the connected WebGPU overlay.', 'Vorschau vom verbundenen WebGPU-Overlay angenommen.', 'La superposición WebGPU conectada aceptó la vista previa.', 'L’overlay WebGPU connecté a accepté l’aperçu.'],
    conflict_copy: ['Local edits were saved as a new show.', 'Lokale Änderungen wurden als neue Show gespeichert.', 'Los cambios locales se guardaron como un show nuevo.', 'Les modifications locales ont été enregistrées comme nouveau show.'],
    imported: ['Validated show imported.', 'Validierte Show importiert.', 'Show validado importado.', 'Show validé importé.']
  },
  prompts: {
    archive: ['Archive this show? It can be restored later.', 'Diese Show archivieren? Sie kann später wiederhergestellt werden.', '¿Archivar este show? Podrás restaurarlo más tarde.', 'Archiver ce show ? Vous pourrez le restaurer plus tard.'],
    derive_overwrite: ['Regenerate Medium and Short from Long? Existing variants will be overwritten.', 'Mittel und Kurz aus Lang neu erzeugen? Vorhandene Varianten werden überschrieben.', '¿Regenerar las versiones media y corta desde la larga? Se sobrescribirán las variantes existentes.', 'Régénérer les versions moyenne et courte depuis la longue ? Les variantes existantes seront remplacées.']
  }
};

function localize(value, languageIndex) {
  if (Array.isArray(value)) return value[languageIndex];
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    localize(child, languageIndex)
  ]));
}

module.exports = Object.fromEntries(languages.map((language, index) => [
  language,
  localize(rows, index)
]));
