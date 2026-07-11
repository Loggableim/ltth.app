#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const page = path.join(root, 'app', 'plugins', 'game-engine', 'ui.html');
const localeDir = path.join(root, 'app', 'plugins', 'game-engine', 'locales');
const languages = ['en', 'de', 'es', 'fr'];
const translations = {
  admin_panel: { en: 'Admin Panel', de: 'Admin-Panel', es: 'Panel de administración', fr: 'Panneau d’administration' },
  subtitle: { en: 'Interactive games for TikTok LIVE streams', de: 'Interaktive Spiele für TikTok-LIVE-Streams', es: 'Juegos interactivos para directos de TikTok LIVE', fr: 'Jeux interactifs pour les lives TikTok LIVE' },
  dashboard_controls: { en: 'Dashboard & Controls', de: 'Dashboard & Steuerung', es: 'Panel y controles', fr: 'Tableau de bord et contrôles' },
  active_game: { en: 'Active Game', de: 'Aktives Spiel', es: 'Juego activo', fr: 'Jeu actif' },
  manual_mode: { en: 'Manual Mode', de: 'Manueller Modus', es: 'Modo manual', fr: 'Mode manuel' },
  games: { en: 'Games', de: 'Spiele', es: 'Juegos', fr: 'Jeux' },
  tools: { en: 'Tools', de: 'Werkzeuge', es: 'Herramientas', fr: 'Outils' },
  no_active_game: { en: 'No active game', de: 'Kein aktives Spiel', es: 'No hay ningún juego activo', fr: 'Aucun jeu actif' },
  no_active_game_desc: { en: 'Wait for a viewer to send a gift or enter a command to start a game.', de: 'Warte darauf, dass ein Zuschauer ein Geschenk sendet oder einen Befehl eingibt, um ein Spiel zu starten.', es: 'Espera a que un espectador envíe un regalo o introduzca un comando para iniciar un juego.', fr: 'Attendez qu’un spectateur envoie un cadeau ou saisisse une commande pour démarrer un jeu.' },
  connect4_running: { en: 'Connect4 game running', de: 'Connect4-Spiel läuft', es: 'Partida de Connect4 en curso', fr: 'Partie de Puissance 4 en cours' },
  waiting_move: { en: 'Waiting for move…', de: 'Warte auf Zug …', es: 'Esperando el movimiento…', fr: 'En attente du coup…' },
  your_turn: { en: 'Your turn - choose a column:', de: 'Dein Zug – wähle eine Spalte:', es: 'Tu turno: elige una columna:', fr: 'À vous de jouer – choisissez une colonne :' },
  game_board: { en: 'Game board', de: 'Spielfeld', es: 'Tablero', fr: 'Plateau de jeu' },
  cancel_game: { en: 'Cancel game', de: 'Spiel abbrechen', es: 'Cancelar partida', fr: 'Annuler la partie' },
  test_game_desc: { en: 'Start a test game without a TikTok connection for testing and development.', de: 'Starte ein Testspiel ohne TikTok-Verbindung zum Testen und Entwickeln.', es: 'Inicia un juego de prueba sin conexión a TikTok para probar y desarrollar.', fr: 'Lancez une partie de test sans connexion TikTok pour tester et développer.' },
  new_test_game: { en: 'Start a new test game', de: 'Neues Testspiel starten', es: 'Iniciar un nuevo juego de prueba', fr: 'Démarrer une nouvelle partie de test' },
  game_type: { en: 'Game type:', de: 'Spieltyp:', es: 'Tipo de juego:', fr: 'Type de jeu :' },
  opponent_type: { en: 'Opponent type:', de: 'Gegner-Typ:', es: 'Tipo de oponente:', fr: 'Type d’adversaire :' },
  manual: { en: 'Manual (you control both players)', de: 'Manuell (du steuerst beide Spieler)', es: 'Manual (controlas a ambos jugadores)', fr: 'Manuel (vous contrôlez les deux joueurs)' },
  bot_random: { en: 'Bot (random)', de: 'Bot (Zufall)', es: 'Bot (aléatoire)', fr: 'Bot (aléatoire)' },
  player_one: { en: 'Player 1 name:', de: 'Name von Spieler 1:', es: 'Nombre del jugador 1:', fr: 'Nom du joueur 1 :' },
  player_two: { en: 'Player 2 name:', de: 'Name von Spieler 2:', es: 'Nombre del jugador 2:', fr: 'Nom du joueur 2 :' },
  save_settings: { en: 'Save settings', de: 'Einstellungen speichern', es: 'Guardar ajustes', fr: 'Enregistrer les réglages' }
};

let html = fs.readFileSync(page, 'utf8');
const replacements = [
  ['<h1>Admin Panel</h1>', '<h1 data-i18n="game_engine.admin_panel">Admin Panel</h1>'],
  ['<p>Interaktive Spiele für TikTok LIVE Streams</p>', '<p data-i18n="game_engine.subtitle">Interactive games for TikTok LIVE streams</p>'],
  ['<div class="sidebar-brand-subtitle">Dashboard &amp; Controls</div>', '<div class="sidebar-brand-subtitle" data-i18n="game_engine.dashboard_controls">Dashboard &amp; Controls</div>'],
  ['<button class="tab active" data-tab="active-game">Aktives Spiel</button>', '<button class="tab active" data-tab="active-game" data-i18n="game_engine.active_game">Active Game</button>'],
  ['<button class="tab" data-tab="manual-mode">Manual Mode</button>', '<button class="tab" data-tab="manual-mode" data-i18n="game_engine.manual_mode">Manual Mode</button>'],
  ['<div class="sidebar-group-label">Spiele</div>', '<div class="sidebar-group-label" data-i18n="game_engine.games">Games</div>'],
  ['<div class="sidebar-group-label">Tools</div>', '<div class="sidebar-group-label" data-i18n="game_engine.tools">Tools</div>'],
  ['<h3>Kein aktives Spiel</h3>', '<h3 data-i18n="game_engine.no_active_game">No active game</h3>'],
  ['<p>Warte darauf, dass ein Zuschauer ein Geschenk sendet oder einen Befehl eingibt, um ein Spiel zu starten.</p>', '<p data-i18n="game_engine.no_active_game_desc">Wait for a viewer to send a gift or enter a command to start a game.</p>'],
  ['<h3>Connect4 Spiel läuft</h3>', '<h3 data-i18n="game_engine.connect4_running">Connect4 game running</h3>'],
  ['<p id="game-status">Warte auf Zug...</p>', '<p id="game-status" data-i18n="game_engine.waiting_move">Waiting for move…</p>'],
  ['<h3>Dein Zug - Wähle eine Spalte:</h3>', '<h3 data-i18n="game_engine.your_turn">Your turn - choose a column:</h3>'],
  ['<h3>Spielfeld</h3>', '<h3 data-i18n="game_engine.game_board">Game board</h3>'],
  ['<button class="danger" id="cancelGameBtn">Spiel abbrechen</button>', '<button class="danger" id="cancelGameBtn" data-i18n="game_engine.cancel_game">Cancel game</button>'],
  ['<p>Starte ein Test-Spiel ohne TikTok-Verbindung zum Testen und Entwickeln.</p>', '<p data-i18n="game_engine.test_game_desc">Start a test game without a TikTok connection for testing and development.</p>'],
  ['<h3>Neues Test-Spiel starten</h3>', '<h3 data-i18n="game_engine.new_test_game">Start a new test game</h3>'],
  ['<label>Spieltyp:</label>', '<label data-i18n="game_engine.game_type">Game type:</label>'],
  ['<label>Gegner-Typ:</label>', '<label data-i18n="game_engine.opponent_type">Opponent type:</label>'],
  ['<option value="manual">Manuell (Du steuerst beide Spieler)</option>', '<option value="manual" data-i18n="game_engine.manual">Manual (you control both players)</option>'],
  ['<option value="bot">Bot (Zufall)</option>', '<option value="bot" data-i18n="game_engine.bot_random">Bot (random)</option>'],
  ['<label>Spieler 1 Name:</label>', '<label data-i18n="game_engine.player_one">Player 1 name:</label>'],
  ['<label>Spieler 2 Name:</label>', '<label data-i18n="game_engine.player_two">Player 2 name:</label>'],
  ['<button id="saveSettingsBtn">Einstellungen speichern</button>', '<button id="saveSettingsBtn" data-i18n="game_engine.save_settings">Save settings</button>']
];
for (const pair of replacements) html = html.split(pair[0]).join(pair[1]);
fs.writeFileSync(page, html, 'utf8');
for (const language of languages) {
  const file = path.join(localeDir, language + '.json');
  const locale = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!locale.game_engine) locale.game_engine = {};
  for (const key of Object.keys(translations)) locale.game_engine[key] = translations[key][language];
  fs.writeFileSync(file, JSON.stringify(locale, null, 2) + '\n', 'utf8');
}
console.log('Game Engine shell locale markers repaired (' + replacements.length + ' templates).');
