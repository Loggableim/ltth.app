(() => {
  'use strict';
  // BEGIN STREAM MONSTERS PRODUCT PROJECTION
  const PRODUCT_PROJECTION = Object.freeze({
  "contractVersion": 1,
  "id": "streamalchemy",
  "name": "Stream Monsters",
  "version": "1.11.1",
  "nextVersion": "1.12.0",
  "packageFilename": "streamalchemy-1.11.1.zip",
  "rulesVersion": 8,
  "arenaLabel": "Arcade Clash",
  "access": {
    "type": "subscriber",
    "badge": "subscriber-only",
    "description": {
      "de": "In einem aktiven LTTH-Abonnement enthalten. Kein separater Plugin-Kauf.",
      "en": "Included with an active LTTH subscription. No separate plugin purchase.",
      "es": "Incluido con una suscripción LTTH activa. No requiere comprar el plugin por separado.",
      "fr": "Inclus avec un abonnement LTTH actif. Aucun achat séparé du plugin."
    }
  },
  "defaults": {
    "hatchDurationMs": 90000,
    "portraitBattleMode": "takeover-74",
    "portraitProfile": "tiktok-live-studio-1080x1920"
  },
  "locales": [
    "de",
    "en",
    "es",
    "fr"
  ]
});
  // END STREAM MONSTERS PRODUCT PROJECTION
  const PUBLIC_CATALOG = window.STREAM_MONSTERS_PUBLIC_CATALOG || {
    templates: []
  };
  const ELEMENTS = {
    Ember: { color: '#ff765e' },
    Tide: { color: '#57c9ff' },
    Grove: { color: '#89de70' },
    Gale: { color: '#d2e9ff' },
    Volt: { color: '#ffd34d' },
    Lunar: { color: '#caaeff' }
  };
  const COPY = {
    de:{heroKicker:'DAS LIVE-SAMMELSPIEL FÜR TIKTOK',heroTitle:'Sammle. Brüte. Kämpfe.',heroLead:'Stream Monsters macht aus ausgewählten TikTok-Geschenken direkte Eier im Inventar – und aus deiner Community eine sichtbare Monsterliga.',download:'LTTH herunterladen',creator:'Creator-Setup',toc:[['start','So startest du'],['keywords','Keywords'],['rules','Ei-Regeln'],['elements','Elemente'],['monster-dex','Monsterdex'],['arena','Arena'],['progress','Fortschritt']],startKicker:'SO FUNKTIONIERT ES',startTitle:'Dein erstes Monster in drei Schritten',startLead:'Geschenk-Eier gehören sofort dem Geschenkgeber. Nur optionale Gratis-Eier müssen adoptiert werden.',startCards:[['🎁','1. Ei erhalten','Der Creator ordnet Gifts zu. Ein Spawn-Gift erzeugt sofort dein Ei; Random verteilt die sechs Elemente fair.'],['🥚','2. Ausbrüten','Nutze die Eierliste und danach !hatch. Fertige Eier verrotten erst 24 Stunden nach der Brutzeit.'],['⚔️','3. Arena betreten','Mit !battle suchst du ein faires Duell. Wähle dein Monster und spiele A, B oder C.']],commandsTitle:'Keywords: die Community steuert direkt im Chat',commandsLead:'Der Creator kann Präfixe und Aliase ändern. Diese Liste zeigt die Standard-Aliase; im Overlay steht immer der aktuell aktive Befehl.',commandsNote:'GCCE ist bei Aktivierung der einzige Command-Eingang. Die nackten Antworten A/B/C und 1/2/3/4 werden nur im passenden Kampf- oder Level-up-Fenster akzeptiert.',rulesTitle:'Eier, Gifts & Fairness',rulesLead:'Gifts kaufen Showtempo, niemals bessere Werte, XP-Multiplikatoren oder bessere Gewinnchancen.',rulesCards:[['🥚','Brut & Warteschlange','Drei Eier brüten gleichzeitig. Weitere bleiben sichtbar in FIFO-Reihenfolge. Standard: 2 Minuten; Creator können 30 Sek., 1, 2, 5, 10 oder 30 Minuten wählen.'],['✨','Charged & Boosts','Charged-Eier sind 25 % schneller. Boost-Gifts verkürzen nur die aktive Brutzeit um 15/30/60/120 Sekunden – abhängig vom Diamond-Wert.'],['🆓','Optionale Gratis-Eier','Wenn aktiviert: ein Gratis-Ei pro Viewer nach konfigurierbarer Wartezeit (Standard 86400 Sekunden). 60 Sekunden reserviert, danach öffentlich mit !adopt oder !adoptieren.']],elementsTitle:'Sechs Elemente. Klare Stärken.',elementsLead:'Jedes Element ist gegen zwei Elemente im Vorteil, gegen zwei im Nachteil und gegen eines neutral. Die Skills bleiben bewusst unterschiedlich, aber simulatorisch ausbalanciert.',advantage:'Vorteile: Ember → Grove, Gale · Tide → Ember, Lunar · Grove → Tide, Volt · Gale → Grove, Lunar · Volt → Gale, Tide · Lunar → Volt, Ember.',dexTitle:'Monsterdex: 24 Furry-Templates · 72 Formen',dexLead:'Vier Monster pro Element. Jedes besitzt seine drei eigenen benannten Skills und kann sich in zwei kosmetisch-kämpferische Entwicklungsstufen weiterentwickeln.',role:{striker:'Angriff',guardian:'Schutz',trickster:'Trick',sustain:'Ausdauer'},arenaTitle:'Arcade Clash: zwei Spieler, echte Entscheidungen',arenaLead:'Die Arena ist portrait-first für TikTok aufgebaut. Beide Monster bleiben groß sichtbar; nur die zwei Kämpfer dürfen Entscheidungen treffen.',arenaSteps:[['1 · Match','!battle paart nach Arena-Wertung und Monsterlevel. Nach 30 Sekunden erweitert sich die Suche.'],['2 · Monster wählen','Beide haben 15 Sekunden für !choose <slot>. Ohne Wahl wird das aktive Monster verwendet.'],['3 · Skills versiegeln','Je Runde: A Angriff, B Verteidigung, C Special. Acht Sekunden; die erste Wahl bleibt geheim, bis beide gewählt haben oder die Zeit endet.'],['4 · Special & K.-o.','Special lädt aktiv mit 5 % pro Sekunde sowie durch Aktionen/Treffer. C ist erst bei 100 % verfügbar. Agilität bestimmt die Reihenfolge, K.-o. beendet den Kampf früh.']],progressTitle:'Permanente Sammlung, saisonaler Wettbewerb',progressLead:'Deine Monster bleiben. Saisons, Ränge und kosmetische Belohnungen geben jedem Stream ein neues Ziel.',progressCards:[['📈','XP & Level','Jeder legitime Kampf: 10 XP für beide Monster, +5 XP für den Sieger. Level 2–20 geben je einen frei verteilbaren Statpunkt für Vitalität, Stärke, Verteidigung oder Agilität.'],['🌟','Evolution','Hatch +5, Battle +2, Sieg +1 und Stream-Mission +3 Meisterschaft. Stufe II bei 25 Meisterschaft + 3 Essenzen; Stufe III bei 50 + insgesamt 8 Essenzen.'],['🏆','Ränge & Saison','Arena-Rating startet bei 900, Elo K=32. Bronze <1000, Silber 1000, Gold 1150, Kristall 1300, Monster Master 1500. Saison: 7/14/28/60/90 Tage.']],ctaTitle:'Bereit für deine Monsterliga?',ctaLead:'Installiere LTTH, aktiviere Stream Monsters und richte Gifts, Commands und das OBS-Overlay im Creator-Setup ein.',docs:'Technische Dokumentation'},
    en:{heroKicker:'THE TIKTOK LIVE COLLECTOR GAME',heroTitle:'Collect. Hatch. Clash.',heroLead:'Stream Monsters turns selected TikTok Gifts into eggs owned immediately by their sender – and your community into a visible monster league.',download:'Download LTTH',creator:'Creator setup',toc:[['start','Getting started'],['keywords','Keywords'],['rules','Egg rules'],['elements','Elements'],['monster-dex','Monsterdex'],['arena','Arena'],['progress','Progression']],startKicker:'HOW IT WORKS',startTitle:'Your first monster in three steps',startLead:'Gift eggs belong to the sender immediately. Only optional free eggs need adoption.',startCards:[['🎁','1. Receive an egg','The creator maps Gifts. A spawn Gift immediately creates your egg; Random spreads all six elements fairly.'],['🥚','2. Hatch it','Use the egg list, then !hatch. Ready eggs expire only 24 hours after their incubation completes.'],['⚔️','3. Enter the arena','!battle finds a fair duel. Choose a monster, then play A, B or C.']],commandsTitle:'Keywords: the community controls the game in chat',commandsLead:'Creators can change prefixes and aliases. This is the default list; the overlay always shows the live command.',commandsNote:'With GCCE enabled, it is the only command ingress. Bare A/B/C and 1/2/3/4 are accepted only during the relevant battle or level-up window.',rulesTitle:'Eggs, Gifts & fairness',rulesLead:'Gifts buy show tempo, never better stats, XP multipliers or better odds.',rulesCards:[['🥚','Incubation & queue','Three eggs incubate at once. More stay visible in FIFO order. Default: 2 minutes; creators can choose 30 sec., 1, 2, 5, 10 or 30 minutes.'],['✨','Charged & boosts','Charged eggs incubate 25% faster. Boost Gifts shorten only active incubation by 15/30/60/120 seconds based on Diamond value.'],['🆓','Optional free eggs','When enabled: one free egg per viewer after a configurable wait (default 86400 seconds). Reserved for 60 seconds, then public through !adopt.']],elementsTitle:'Six elements. Clear strengths.',elementsLead:'Every element has advantages against two elements, disadvantages against two and one neutral matchup. Skills are distinct but simulator-balanced.',advantage:'Advantages: Ember → Grove, Gale · Tide → Ember, Lunar · Grove → Tide, Volt · Gale → Grove, Lunar · Volt → Gale, Tide · Lunar → Volt, Ember.',dexTitle:'Monsterdex: 24 furry templates',dexLead:'Four monsters per element. Each has three named skills and two evolution stages.',role:{striker:'Striker',guardian:'Guardian',trickster:'Trickster',sustain:'Sustain'},arenaTitle:'Arcade Clash: two players, real choices',arenaLead:'The arena is portrait-first for TikTok. Both monsters remain visible; only the two fighters make decisions.',arenaSteps:[['1 · Match','!battle matches by Arena Rating and monster level. The search widens after 30 seconds.'],['2 · Choose monster','Both players have 15 seconds for !choose <slot>. Without a choice, the active monster is used.'],['3 · Seal skills','Each round: A attack, B defense, C special. Eight seconds; the first choice stays hidden until both choose or time ends.'],['4 · Special & K.O.','Special charges at 5% per active second plus action/hit contributions. C unlocks at 100%. Agility resolves order; K.O. ends the match early.']],progressTitle:'Permanent collection, seasonal competition',progressLead:'Monsters stay with you. Seasons, ranks and cosmetic rewards create fresh stream goals.',progressCards:[['📈','XP & levels','Every legitimate battle: 10 XP for both monsters, +5 for the winner. Levels 2–20 give one selectable stat point.'],['🌟','Evolution','Hatch +5, Battle +2, Win +1 and stream mission +3 mastery. Stage II at 25 mastery + 3 essences; Stage III at 50 + 8 total essences.'],['🏆','Ranks & season','Arena Rating starts at 900, Elo K=32. Bronze <1000, Silver 1000, Gold 1150, Crystal 1300, Monster Master 1500. Seasons: 7/14/28/60/90 days.']],ctaTitle:'Ready for your monster league?',ctaLead:'Install LTTH, enable Stream Monsters and configure Gifts, commands and the OBS overlay.',docs:'Technical documentation'},
    es:{heroKicker:'EL JUEGO DE COLECCIÓN PARA TIKTOK LIVE',heroTitle:'Colecciona. Incuba. Combate.',heroLead:'Stream Monsters convierte los Gifts seleccionados en huevos que pertenecen al remitente al instante.',download:'Descargar LTTH',creator:'Configuración del creador',toc:[['start','Cómo empezar'],['keywords','Palabras clave'],['rules','Reglas de huevos'],['elements','Elementos'],['monster-dex','Monsterdex'],['arena','Arena'],['progress','Progreso']],startKicker:'CÓMO FUNCIONA',startTitle:'Tu primer monstruo en tres pasos',startLead:'Los huevos de Gifts pertenecen inmediatamente al remitente. Solo los huevos gratis opcionales requieren adopción.',startCards:[['🎁','1. Recibe un huevo','El creador asigna Gifts. Un Gift de spawn crea tu huevo; Random reparte los seis elementos.'],['🥚','2. Incúbalo','Usa la lista de huevos y después !hatch. Los huevos listos caducan 24 horas después.'],['⚔️','3. Entra en la arena','!battle busca un duelo justo. Elige monstruo y usa A, B o C.']],commandsTitle:'Palabras clave: la comunidad controla el juego',commandsLead:'El creador puede cambiar prefijos y alias. Esta es la lista predeterminada.',commandsNote:'Con GCCE activo es la única entrada de comandos. A/B/C y 1/2/3/4 solo se aceptan en la ventana correcta.',rulesTitle:'Huevos, Gifts y equidad',rulesLead:'Los Gifts compran espectáculo, nunca mejores estadísticas, XP o probabilidades.',rulesCards:[['🥚','Incubación y cola','Tres huevos incuban a la vez; el resto espera en FIFO. Predeterminado: 2 minutos; 30 s, 1, 2, 5, 10 o 30 min configurables.'],['✨','Charged y boosts','Los huevos Charged incuban 25 % más rápido. Los boosts solo reducen el tiempo activo 15/30/60/120 segundos.'],['🆓','Huevos gratis opcionales','Si están activos: uno por espectador tras una espera configurable (86400 segundos por defecto). Reserva 60 segundos y después !adopt.']],elementsTitle:'Seis elementos. Fortalezas claras.',elementsLead:'Cada elemento tiene ventaja contra dos, desventaja contra dos y un enfrentamiento neutral.',advantage:'Ventajas: Ember → Grove, Gale · Tide → Ember, Lunar · Grove → Tide, Volt · Gale → Grove, Lunar · Volt → Gale, Tide · Lunar → Volt, Ember.',dexTitle:'Monsterdex: 24 plantillas furry',dexLead:'Cuatro monstruos por elemento, tres habilidades y dos evoluciones.',role:{striker:'Ataque',guardian:'Defensa',trickster:'Truco',sustain:'Resistencia'},arenaTitle:'Arcade Clash: dos jugadores, decisiones reales',arenaLead:'Arena vertical para TikTok. Solo los dos combatientes deciden.',arenaSteps:[['1 · Match','!battle empareja por rating y nivel. La búsqueda se amplía a los 30 segundos.'],['2 · Elige monstruo','15 segundos para !choose <slot>. Sin elección se usa el activo.'],['3 · Sella habilidades','A ataque, B defensa, C especial. Ocho segundos; la primera elección permanece oculta.'],['4 · Especial y K.O.','El especial carga 5 % por segundo activo y por acciones/golpes. C se desbloquea al 100 %.']],progressTitle:'Colección permanente, competencia estacional',progressLead:'Los monstruos permanecen contigo; temporadas y rangos crean objetivos nuevos.',progressCards:[['📈','XP y niveles','Cada combate legítimo: 10 XP para ambos, +5 al ganador. Niveles 2–20 dan un punto elegible.'],['🌟','Evolución','Hatch +5, Battle +2, victoria +1 y misión +3 maestría. II: 25 + 3 esencias; III: 50 + 8.'],['🏆','Rangos y temporada','Rating inicial 900, Elo K=32. Bronze <1000, Silver 1000, Gold 1150, Crystal 1300, Monster Master 1500.']],ctaTitle:'¿Listo para tu liga?',ctaLead:'Instala LTTH y configura Gifts, comandos y OBS.',docs:'Documentación técnica'},
    fr:{heroKicker:'LE JEU DE COLLECTION POUR TIKTOK LIVE',heroTitle:'Collectionne. Fais éclore. Combats.',heroLead:'Stream Monsters transforme les Gifts choisis en œufs possédés immédiatement par leur expéditeur.',download:'Télécharger LTTH',creator:'Configuration créateur',toc:[['start','Démarrer'],['keywords','Mots-clés'],['rules','Règles des œufs'],['elements','Éléments'],['monster-dex','Monsterdex'],['arena','Arène'],['progress','Progression']],startKicker:'COMMENT ÇA MARCHE',startTitle:'Ton premier monstre en trois étapes',startLead:'Les œufs issus de Gifts appartiennent immédiatement à l’expéditeur. Seuls les œufs gratuits optionnels doivent être adoptés.',startCards:[['🎁','1. Reçois un œuf','Le créateur associe les Gifts. Un Gift de spawn crée ton œuf ; Random répartit les six éléments.'],['🥚','2. Fais-le éclore','Utilise la liste puis !hatch. Les œufs prêts expirent 24 heures plus tard.'],['⚔️','3. Entre dans l’arène','!battle cherche un duel équitable. Choisis ton monstre puis A, B ou C.']],commandsTitle:'Mots-clés : la communauté joue dans le chat',commandsLead:'Le créateur peut modifier préfixes et alias. Cette liste montre les valeurs par défaut.',commandsNote:'Avec GCCE actif, c’est l’unique entrée de commandes. A/B/C et 1/2/3/4 ne sont acceptés que dans leur fenêtre.',rulesTitle:'Œufs, Gifts et équité',rulesLead:'Les Gifts achètent du spectacle, jamais des statistiques, XP ou chances supplémentaires.',rulesCards:[['🥚','Incubation et file','Trois œufs incubent à la fois ; les suivants attendent en FIFO. Défaut : 2 minutes ; 30 s, 1, 2, 5, 10 ou 30 min configurables.'],['✨','Charged et boosts','Les œufs Charged incubent 25 % plus vite. Les boosts réduisent seulement le temps actif de 15/30/60/120 secondes.'],['🆓','Œufs gratuits optionnels','S’ils sont activés : un œuf par viewer après une attente réglable (86400 s par défaut). Réservé 60 secondes puis !adopt.']],elementsTitle:'Six éléments. Des forces nettes.',elementsLead:'Chaque élément est avantagé contre deux, désavantagé contre deux et neutre contre un.',advantage:'Avantages : Ember → Grove, Gale · Tide → Ember, Lunar · Grove → Tide, Volt · Gale → Grove, Lunar · Volt → Gale, Tide · Lunar → Volt, Ember.',dexTitle:'Monsterdex : 24 modèles furry',dexLead:'Quatre monstres par élément, trois compétences et deux évolutions.',role:{striker:'Attaque',guardian:'Gardien',trickster:'Ruse',sustain:'Endurance'},arenaTitle:'Arcade Clash : deux joueurs, de vrais choix',arenaLead:'Arène verticale pour TikTok. Seuls les deux combattants décident.',arenaSteps:[['1 · Match','!battle associe par rating et niveau. La recherche s’élargit après 30 secondes.'],['2 · Choisis un monstre','15 secondes pour !choose <slot>. Sans choix, le monstre actif est utilisé.'],['3 · Scelle les compétences','A attaque, B défense, C spécial. Huit secondes ; le premier choix reste caché.'],['4 · Spécial et K.-O.','Le spécial charge 5 % par seconde active et via actions/coups. C se débloque à 100 %.']],progressTitle:'Collection permanente, compétition saisonnière',progressLead:'Les monstres restent à toi ; saisons et rangs renouvellent les objectifs.',progressCards:[['📈','XP et niveaux','Chaque combat légitime : 10 XP pour les deux, +5 au vainqueur. Niveaux 2–20 : un point choisi.'],['🌟','Évolution','Hatch +5, Battle +2, victoire +1, mission +3 maîtrise. II : 25 + 3 essences ; III : 50 + 8.'],['🏆','Rangs et saison','Rating initial 900, Elo K=32. Bronze <1000, Silver 1000, Gold 1150, Crystal 1300, Monster Master 1500.']],ctaTitle:'Prêt pour ta ligue ?',ctaLead:'Installe LTTH et configure Gifts, commandes et OBS.',docs:'Documentation technique'}
  };
  const COMMANDS = [
    { aliases: ['eier', 'eierliste', 'meineeier'], disabled: ['eggs'] },
    { aliases: ['hatch'], suffix: ' [slot]' },
    { aliases: ['inventory', 'monsters'] },
    { aliases: ['monster'], suffix: ' <slot>' },
    { aliases: ['choose'], suffix: ' <slot>' },
    { aliases: ['evolve'], suffix: ' <slot>' },
    { aliases: ['battle'] },
    { aliases: ['leavebattle'] },
    { aliases: ['rank', 'monsterrank'] },
    { aliases: ['quests'] },
    { aliases: ['adopt', 'adoptieren'] },
    { aliases: ['monstershelp'] }
  ];
  const commandText = {de:['Eier und Brutstatus anzeigen','Bereites Ei ausbrüten','Sammlung zeigen','Monsterkarte und Werte einblenden','Monster für den gefundenen Kampf sperren','Entwicklung starten, sobald die Voraussetzungen erfüllt sind','Faire Arena-Warteschlange betreten','Warteschlange vor Kampfbeginn verlassen','Saisonrang anzeigen','Tägliche und wöchentliche Ziele','Nur ein verfügbares Gratis-Ei beanspruchen','Alle aktuell aktiven Stream-Monsters-Befehle'],en:['Show eggs and incubation state','Hatch a ready egg','Show collection','Show monster card and stats','Lock a monster for the found match','Start evolution when requirements are met','Join the fair arena queue','Leave queue before the match begins','Show season rank','Daily and weekly goals','Claim only an available free egg','Show all current Stream Monsters commands'],es:['Muestra huevos y estado','Incuba un huevo listo','Muestra colección','Muestra carta y estadísticas','Bloquea un monstruo para el combate','Inicia evolución al cumplir requisitos','Entra a la cola justa','Sale antes del combate','Muestra rango','Objetivos diarios y semanales','Reclama solo un huevo gratis disponible','Muestra comandos actuales'],fr:['Affiche les œufs et leur état','Fais éclore un œuf prêt','Affiche la collection','Affiche carte et statistiques','Verrouille un monstre pour le match','Lance l’évolution si possible','Entre dans la file équitable','Quitte avant le match','Affiche le rang','Objectifs quotidiens et hebdomadaires','Réclame seulement un œuf gratuit disponible','Affiche les commandes actives']};
  const RULES_V8_COPY = {
    de: {
      arenaTitle: `${PRODUCT_PROJECTION.arenaLabel}: zwei Spieler, echte Entscheidungen`,
      arenaLead: 'Portrait-Overlay: Status, klare A / B / C-Wahl, kompaktes Ergebnis.',
      subscription: PRODUCT_PROJECTION.access.description.de,
      rulesCards: [
        ['🥚', 'Brut & Auto-Hatch', 'Standard: 90 Sekunden. Presets: 30 Sek., 1 Min., 90 Sek., 2 Min., 5 Min., 10 Min. oder 30 Min. Auto-Hatch ist standardmäßig aktiv und brütet bereite Eier für Zuschauer mit Aktivität in den letzten 300 Sekunden automatisch aus.'],
        ['✨', 'Charged & Boosts', 'Charged-Eier sind 25 % schneller. Boost-Gifts verkürzen nur die aktive Brutzeit um 15/30/60/120 Sekunden – abhängig vom Diamond-Wert.'],
        ['🆓', 'Optionale Gratis-Eier', 'Wenn aktiviert: ein Gratis-Ei pro Viewer nach 86400 Sekunden Cooldown. Es bleibt 60 Sekunden reserviert und wird danach mit !adopt oder !adoptieren öffentlich.']
      ],
      arenaSteps: [
        ['1 · Match', '!battle paart nach Arena-Wertung und Monsterlevel. Nach 30 Sekunden erweitert sich die Suche.'],
        ['2 · Monster wählen', 'Beide haben 8 Sekunden für !choose &lt;slot&gt;. Ohne Wahl wird das aktive Monster verwendet.'],
        ['3 · Skills versiegeln', 'Je Runde: A Angriff, B Verteidigung, C Special. Die Skillwahl dauert 6 Sekunden bei einer Sprache und 10 Sekunden bei zwei Sprachen. Die erste Wahl bleibt bis zur gemeinsamen Aufdeckung geheim.'],
        ['4 · Werte & Special', 'Eine neue Statwahl dauert 10 Sekunden. Special lädt passiv mit 5 Prozentpunkten pro Sekunde, höchstens 30 % pro Runde. C ist bei 100 % verfügbar.'],
        ['5 · Arena Collapse', 'Ab Runde 5 verursacht Arena Collapse am Rundenende neutralen Schaden in Höhe Runde minus 4. Er ignoriert Schilde und kann nie K.-o. verursachen. Neue Schilde zählen zunächst halb, später nur zu 25 % und ab Runde 11 gar nicht.'],
        ['6 · Kampfende', 'Ein Kampf endet nur durch K.-o. oder Aufgabe – nie durch ein Rundenlimit.']
      ],
      dexTitle: 'Monsterdex: 24 Furry-Templates · 72 Formen',
      dexLead: 'Vier Monster pro Element. Jede der 72 Formen zeigt ihre echten Rules-v8-Skills A, B und C mit lokalisierten Namen und Effekten.',
      stageLabels: ['Stufe I', 'Stufe II', 'Stufe III'],
      allElements: 'Alle',
      disabledAliasLabel: 'optional deaktiviert'
    },
    en: {
      arenaTitle: `${PRODUCT_PROJECTION.arenaLabel}: two players, real choices`,
      arenaLead: 'Portrait overlay: status, clear A / B / C choice, compact result.',
      subscription: PRODUCT_PROJECTION.access.description.en,
      rulesCards: [
        ['🥚', 'Incubation & Auto-Hatch', 'Default: 90 seconds. Presets: 30 sec., 1 min., 90 sec., 2 min., 5 min., 10 min. or 30 min. Auto-Hatch is on by default and hatches ready eggs for viewers active within the last 300 seconds.'],
        ['✨', 'Charged & boosts', 'Charged eggs incubate 25% faster. Boost Gifts shorten only active incubation by 15/30/60/120 seconds based on Diamond value.'],
        ['🆓', 'Optional free eggs', 'When enabled: one free egg per viewer after an 86400 seconds cooldown. It stays reserved for 60 seconds, then becomes public through !adopt.']
      ],
      arenaSteps: [
        ['1 · Match', '!battle matches by Arena Rating and monster level. The search widens after 30 seconds.'],
        ['2 · Choose monster', 'Both players have 8 seconds for !choose &lt;slot&gt;. Without a choice, the active monster is used.'],
        ['3 · Seal skills', 'Each round uses A attack, B defense or C special. Skill choice lasts 6 seconds with one language and 10 seconds with two languages. The first choice stays hidden until both reveal together.'],
        ['4 · Stats & Special', 'A new stat choice lasts 10 seconds. Special charges passively by 5 percentage points per second, capped at 30% per round. C unlocks at 100%.'],
        ['5 · Arena Collapse', 'From round 5, Arena Collapse deals neutral end-of-round damage equal to round minus 4. It ignores shields and can never cause K.O. New shields are halved first, later fall to 25%, and reach zero from round 11.'],
        ['6 · Battle end', 'A battle ends only by K.O. or Forfeit, never by a round limit.']
      ],
      dexTitle: 'Monsterdex: 24 furry templates · 72 forms',
      dexLead: 'Four monsters per element. Every one of the 72 forms shows its real Rules v8 A, B and C skills with localized names and effects.',
      stageLabels: ['Stage I', 'Stage II', 'Stage III'],
      allElements: 'All',
      disabledAliasLabel: 'optional disabled'
    },
    es: {
      arenaTitle: `${PRODUCT_PROJECTION.arenaLabel}: dos jugadores, decisiones reales`,
      arenaLead: 'Overlay vertical: estado, elección clara A / B / C y resultado compacto.',
      subscription: PRODUCT_PROJECTION.access.description.es,
      rulesCards: [
        ['🥚', 'Incubación y eclosión automática', 'Predeterminado: 90 segundos. Ajustes: 30 s, 1 min., 90 s, 2 min., 5 min., 10 min. o 30 min. La eclosión automática está activa por defecto para huevos listos de viewers con actividad durante los últimos 300 segundos.'],
        ['✨', 'Charged y boosts', 'Los huevos Charged incuban un 25 % más rápido. Los Gifts de boost solo reducen la incubación activa en 15/30/60/120 segundos según su valor en diamantes.'],
        ['🆓', 'Huevos gratis opcionales', 'Si se activa: un huevo gratis por viewer tras un cooldown de 86400 segundos. Queda reservado 60 segundos y después pasa a ser público mediante !adopt o !adoptieren.']
      ],
      arenaSteps: [
        ['1 · Match', '!battle empareja por rating de arena y nivel. La búsqueda se amplía tras 30 segundos.'],
        ['2 · Elige monstruo', 'Ambos jugadores tienen 8 segundos para !choose &lt;slot&gt;. Sin elección se usa el monstruo activo.'],
        ['3 · Sella habilidades', 'Cada ronda usa A ataque, B defensa o C especial. La elección dura 6 segundos con un idioma y 10 segundos con dos. La primera elección permanece oculta hasta revelar ambas juntas.'],
        ['4 · Estadísticas y especial', 'Una nueva elección de estadística dura 10 segundos. El especial carga pasivamente 5 puntos porcentuales por segundo, con un máximo de 30 % por ronda. C se activa al 100 %.'],
        ['5 · Arena Collapse', 'Desde la ronda 5, Arena Collapse inflige al final daño neutral igual a ronda menos 4. Ignora escudos y nunca causa K.O. Los escudos nuevos cuentan primero a la mitad, después al 25 % y desde la ronda 11 a cero.'],
        ['6 · Fin del combate', 'El combate solo termina por K.O. o abandono, nunca por límite de rondas.']
      ],
      dexTitle: 'Monsterdex: 24 plantillas furry · 72 formas',
      dexLead: 'Cuatro monstruos por elemento. Cada una de las 72 formas muestra sus habilidades reales A, B y C de Rules v8 con nombres y efectos localizados.',
      stageLabels: ['Etapa I', 'Etapa II', 'Etapa III'],
      allElements: 'Todos',
      disabledAliasLabel: 'opcional desactivado'
    },
    fr: {
      arenaTitle: `${PRODUCT_PROJECTION.arenaLabel} : deux joueurs, de vrais choix`,
      arenaLead: 'Overlay vertical : statut, choix A / B / C clair et résultat compact.',
      subscription: PRODUCT_PROJECTION.access.description.fr,
      rulesCards: [
        ['🥚', 'Incubation et éclosion automatique', 'Par défaut : 90 secondes. Réglages : 30 s, 1 min, 90 s, 2 min, 5 min, 10 min ou 30 min. L’éclosion automatique est active par défaut pour les œufs prêts des viewers actifs durant les 300 dernières secondes.'],
        ['✨', 'Charged et boosts', 'Les œufs Charged incubent 25 % plus vite. Les Gifts de boost réduisent uniquement l’incubation active de 15/30/60/120 secondes selon leur valeur en diamants.'],
        ['🆓', 'Œufs gratuits optionnels', 'Si activé : un œuf gratuit par viewer après un cooldown de 86400 secondes. Il reste réservé 60 secondes, puis devient public via !adopt ou !adoptieren.']
      ],
      arenaSteps: [
        ['1 · Match', '!battle associe selon le rating d’arène et le niveau. La recherche s’élargit après 30 secondes.'],
        ['2 · Choisis un monstre', 'Les deux joueurs ont 8 secondes pour !choose &lt;slot&gt;. Sans choix, le monstre actif est utilisé.'],
        ['3 · Scelle les compétences', 'Chaque manche utilise A attaque, B défense ou C spécial. Le choix dure 6 secondes avec une langue et 10 secondes avec deux. Le premier choix reste caché jusqu’à la révélation commune.'],
        ['4 · Statistiques et spécial', 'Un nouveau choix de statistique dure 10 secondes. Le spécial charge passivement de 5 points de pourcentage par seconde, avec un maximum de 30 % par manche. C se débloque à 100 %.'],
        ['5 · Arena Collapse', 'À partir de la manche 5, Arena Collapse inflige en fin de manche des dégâts neutres égaux à manche moins 4. Ils ignorent les boucliers et ne causent jamais de K.-O. Les nouveaux boucliers sont d’abord divisés par deux, puis passent à 25 %, et à zéro dès la manche 11.'],
        ['6 · Fin du combat', 'Le combat se termine uniquement par K.-O. ou abandon, jamais par une limite de manches.']
      ],
      dexTitle: 'Monsterdex : 24 modèles furry · 72 formes',
      dexLead: 'Quatre monstres par élément. Chacune des 72 formes affiche ses vraies compétences A, B et C de Rules v8 avec des noms et effets localisés.',
      stageLabels: ['Stade I', 'Stade II', 'Stade III'],
      allElements: 'Tous',
      disabledAliasLabel: 'optionnel désactivé'
    }
  };
  Object.entries(RULES_V8_COPY).forEach(([locale, values]) => {
    Object.assign(COPY[locale], values);
  });

  const escapeHtml = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  function translatedSkill(skill, lang) {
    return skill?.translations?.[lang] || skill?.translations?.de || {
      name: '',
      effect: ''
    };
  }

  function renderCommand(command, index, lang, copy) {
    const suffix = escapeHtml(command.suffix || '');
    const enabled = command.aliases.map(alias => (
      `<span data-command-alias="${escapeHtml(alias)}" ` +
      'data-command-enabled="true">' +
      `<code>!${escapeHtml(alias)}${suffix}</code></span>`
    )).join('<span aria-hidden="true"> · </span>');
    const disabled = (command.disabled || []).map(alias => (
      `<span data-command-alias="${escapeHtml(alias)}" ` +
      'data-command-enabled="false">' +
      `<code>!${escapeHtml(alias)}</code> ` +
      `<small>(${escapeHtml(copy.disabledAliasLabel)})</small></span>`
    )).join('<span aria-hidden="true"> · </span>');
    return (
      '<article class="sm-command">' +
      `<div>${enabled}${disabled ? `<br>${disabled}` : ''}</div>` +
      `<p>${escapeHtml(commandText[lang][index])}</p></article>`
    );
  }

  function renderElementCards(lang) {
    return Object.entries(ELEMENTS).map(([element, info]) => {
      const template = PUBLIC_CATALOG.templates.find(
        entry => entry.element === element
      );
      const skills = template?.stages?.[0]?.skills || [];
      const icon = skills[0]?.icon || '';
      const skillRows = skills.map(skill => {
        const translation = translatedSkill(skill, lang);
        return (
          '<div class="sm-skill">' +
          `<b>${escapeHtml(skill.choice)} · ${escapeHtml(translation.name)}</b>` +
          `<span>${escapeHtml(translation.effect)}</span></div>`
        );
      }).join('');
      return (
        `<article class="sm-element" style="--element:${info.color}">` +
        `<h3>${escapeHtml(icon)} ${escapeHtml(element)}</h3>` +
        `<div class="skills">${skillRows}</div></article>`
      );
    }).join('');
  }

  function renderMonsterDex(lang, copy) {
    return PUBLIC_CATALOG.templates.map(template => {
      const stages = template.stages.map(stage => {
        const stageLabel = copy.stageLabels[stage.stage - 1];
        const skills = stage.skills.map(skill => {
          const translation = translatedSkill(skill, lang);
          return (
            `<div class="sm-stage-skill" data-choice="${skill.choice}">` +
            `<p class="sm-skill-name">${escapeHtml(translation.name)}</p>` +
            `<p class="sm-skill-effect">${escapeHtml(translation.effect)}</p>` +
            '</div>'
          );
        }).join('');
        return (
          `<details class="sm-evolution-stage" ` +
          `data-evolution-stage="${stage.stage}"` +
          '>' +
          '<summary>' +
          `<img class="sm-evolution-image" src="${stage.assetPath}" ` +
          `alt="${escapeHtml(`${template.name} · ${stageLabel}`)}" ` +
          'loading="lazy" width="1024" height="1024">' +
          `<span class="sm-evolution-label">${escapeHtml(stageLabel)}</span>` +
          '</summary>' +
          `<div class="sm-stage-skills">${skills}</div>` +
          '</details>'
        );
      }).join('');
      return (
        `<article class="sm-monster" data-element="${template.element}" ` +
        `data-template-id="${template.templateId}">` +
        '<div class="sm-monster-head">' +
        `<span class="sm-role">${escapeHtml(template.element)} · ` +
        `${escapeHtml(copy.role[template.role])}</span>` +
        `<h3>${escapeHtml(template.name)}</h3>` +
        `<p>${escapeHtml(template.species)}</p></div>` +
        `<div class="sm-evolution-stages">${stages}</div></article>`
      );
    }).join('');
  }

  const slug = id => document.getElementById(id);
  function render(lang) {
    const c = COPY[lang] || COPY.de; document.documentElement.lang = lang;
    document.title = `Stream Monsters – LTTH`;
    const set = (id, value) => { const el=slug(id); if(el) el.textContent=value; };
    set('hero-kicker',c.heroKicker); set('hero-title',c.heroTitle); set('hero-lead',c.heroLead); set('download-link',c.download); set('creator-link',c.creator); set('cta-download',c.download); set('cta-docs',c.docs);
    slug('toc').innerHTML=c.toc.map(([id,label])=>`<a href="#${id}">${label}</a>`).join('');
    set('start-kicker',c.startKicker);set('start-title',c.startTitle);set('start-lead',c.startLead);slug('start-cards').innerHTML=c.startCards.map(([icon,title,body])=>`<article class="sm-card"><div class="sm-icon">${icon}</div><h3>${title}</h3><p>${body}</p></article>`).join('');
    set('commands-title',c.commandsTitle);set('commands-lead',c.commandsLead);set('commands-note',c.commandsNote);slug('command-reference').innerHTML=COMMANDS.map((command,index)=>renderCommand(command,index,lang,c)).join('');
    set('rules-title',c.rulesTitle);set('rules-lead',c.rulesLead);slug('rules-cards').innerHTML=c.rulesCards.map(([icon,title,body])=>`<article class="sm-card"><div class="sm-icon">${icon}</div><h3>${title}</h3><p>${body}</p></article>`).join('');
    set('elements-title',c.elementsTitle);set('elements-lead',c.elementsLead);slug('element-cards').innerHTML=renderElementCards(lang);slug('advantage-chart').innerHTML=`<b>${c.advantage.split(':')[0]}:</b>${c.advantage.includes(':')?c.advantage.slice(c.advantage.indexOf(':')+1):''}`;
    set('dex-title',c.dexTitle);set('dex-lead',c.dexLead);slug('dex-filter').innerHTML=['All','Ember','Tide','Grove','Gale','Volt','Lunar'].map((name,i)=>`<button class="${i===0?'active':''}" data-filter="${name}">${name==='All'?c.allElements:name}</button>`).join('');slug('dex-cards').innerHTML=renderMonsterDex(lang,c);
    set('arena-title',c.arenaTitle);set('arena-lead',c.arenaLead);slug('arena-steps').innerHTML=c.arenaSteps.map(([title,body])=>`<div class="sm-arena-step"><b>${title}</b><span>${body}</span></div>`).join('');set('progress-title',c.progressTitle);set('progress-lead',c.progressLead);slug('progress-cards').innerHTML=c.progressCards.map(([icon,title,body])=>`<article class="sm-card"><div class="sm-icon">${icon}</div><h3>${title}</h3><p>${body}</p></article>`).join('');set('cta-title',c.ctaTitle);set('cta-lead',c.ctaLead);set('subscription-copy',c.subscription);
    document.querySelectorAll('.sm-language button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.lang===lang)));document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-filter]').forEach(item=>item.classList.toggle('active',item===button));document.querySelectorAll('.sm-monster').forEach(card=>card.hidden=button.dataset.filter!=='All'&&card.dataset.element!==button.dataset.filter);}));
  }
  const params=new URLSearchParams(location.search);const lang=['de','en','es','fr'].includes(params.get('lang'))?params.get('lang'):(['de','en','es','fr'].includes(localStorage.getItem('ltthLanguage'))?localStorage.getItem('ltthLanguage'):(navigator.language||'de').slice(0,2));
  document.querySelectorAll('.sm-language button').forEach(button=>button.addEventListener('click',()=>{const next=button.dataset.lang;localStorage.setItem('ltthLanguage',next);const url=new URL(location.href);url.searchParams.set('lang',next);history.replaceState({},'',url);render(next);}));render(lang);
  const initializeLayout=async()=>{if(window.LTTHLayout)await window.LTTHLayout.init();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initializeLayout,{once:true});
  else initializeLayout();
})();
