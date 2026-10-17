const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require(path.resolve(__dirname,'../../../app/node_modules/jsdom'));
const dir=__dirname;
const repo=path.resolve(dir,'../../..');
const source=new JSDOM(fs.readFileSync(path.join(repo,'app/public/dashboard.html'),'utf8')).window.document;
const locales=Object.fromEntries(['de','en','es','fr'].map(l=>[l,JSON.parse(fs.readFileSync(path.join(repo,'app/locales',l+'.json'),'utf8'))]));
const releasePolicy=JSON.parse(fs.readFileSync(path.join(repo,'app/config/plugin-release-policy.json'),'utf8'));
const closedBetaIds=new Set(releasePolicy.closedBeta);
const groupKeys={'core':'core_functions','automations-goals':'automations_goals','audio-voice':'audio_voice','visual-fx':'visual_fx','games-engagement':'games_engagement','integrations':'integrations','management':'management'};
const keyForId={'emoji-rain':'emoji_rain','schnorrbecher':'schnorrbecher'};
function get(o,path){return path.split('.').reduce((x,k)=>x?.[k],o);}
const entries=[...source.querySelectorAll('.sidebar-category .sidebar-item[data-view]')].map(a=>{
 const id=a.dataset.view, span=a.querySelector('.sidebar-item-text'), key=span?.dataset.i18n||'';
 const group=a.closest('.sidebar-category').dataset.category;
 const display=span?.textContent.trim()||id;
 const keyPath=key|| (keyForId[id]?`navigation.${keyForId[id]}`:'');
 const labels={};
 for(const locale of ['de','en','es','fr']) labels[locale]=(keyPath&&get(locales[locale],keyPath))||display;
 if(id==='sidekick')for(const locale of ['de','en','es','fr'])labels[locale]='Sidekick';
 if(id==='schnorrbecher')for(const locale of ['de','en','es','fr'])labels[locale]='Schnorrbecher';
 return {id,group,label:labels.de,labels,plugin:a.dataset.plugin||null,alias:a.dataset.pluginAlias||null,closedBeta:closedBetaIds.has(id)};
});
if(entries.length!==42||new Set(entries.map(x=>x.id)).size!==42)throw new Error('Expected exactly 42 unique source data-view IDs');
const missingClosedBeta=releasePolicy.closedBeta.filter(id=>!entries.some(entry=>entry.id===id));
if(missingClosedBeta.length)throw new Error('Closed-beta policy IDs missing from the navigation source: '+missingClosedBeta.join(', '));
const groupLocales={};
for(const group of Object.keys(groupKeys))for(const locale of ['de','en','es','fr'])groupLocales[`${group}:${locale}`]=get(locales[locale],`navigation.${groupKeys[group]}`);
const taskGroups=[
 {id:'stream-start',label:{de:'Stream & Ziele',en:'Stream & goals',es:'Directo y objetivos',fr:'Stream et objectifs'},views:['dashboard','events','goals','milestone-leaderboard','gift-milestone','toptier','gift-catalog']},
 {id:'automation-interaction',label:{de:'Automationen & Interaktion',en:'Automation & interaction',es:'Automatización e interacción',fr:'Automatisation et interaction'},views:['flows','advanced-timer','quiz-show','interactive-story','coinbattle','game-engine','gcce','stream-monsters']},
 {id:'audio-voice',label:{de:'Audio & Sprache',en:'Audio & voice',es:'Audio y voz',fr:'Audio et voix'},views:['tts','music-bot','soundboard','talking-heads','stt-ticker']},
 {id:'visual-stage',label:{de:'Visuals & Bühne',en:'Visuals & stage',es:'Visuales y escenario',fr:'Visuels et scène'},views:['emoji-rain','schnorrbecher','webgpu-emoji-rain','fireworks','webgpu-fireworks','flame-overlay','visual-fx-frame-webgpu','clarityhud','spotlight','animazingpal']},
 {id:'control-integrations',label:{de:'Steuerung & Integrationen',en:'Control & integrations',es:'Control e integraciones',fr:'Contrôle et intégrations'},views:['multi-guest','multicam','osc-bridge','openshock','weather-control','webgpu-weather-control','thermal-printer','sidekick']},
 {id:'library-admin',label:{de:'Bibliothek & Verwaltung',en:'Library & management',es:'Biblioteca y administración',fr:'Bibliothèque et gestion'},views:['plugins','wiki','settings','config-import']}
];
const seen=taskGroups.flatMap(g=>g.views);
if(seen.length!==42||new Set(seen).size!==42||seen.some(id=>!entries.some(e=>e.id===id)))throw new Error('Task grouping is not a one-to-one map of the 42 real views');
const generated={entries,groups:groupLocales,taskGroups};
fs.writeFileSync(path.join(dir,'source-view-catalog.json'),JSON.stringify(generated,null,2)+'\n');
const textRows={};
function addRow(source,byLocale){const values=['en','es','fr'].map(l=>byLocale[l]);const existing=textRows[source];if(existing)return;textRows[source]=values;}
for(const e of entries)addRow(e.labels.de,e.labels);
for(const [group,key] of Object.entries(groupKeys)){const vals={};for(const l of ['de','en','es','fr'])vals[l]=groupLocales[`${group}:${l}`];addRow(vals.de,vals);}
for(const g of taskGroups)addRow(g.label.de,g.label);
const strings={
 'Closed Beta · Coming Soon': ['Closed Beta · Coming Soon','Closed Beta · Coming Soon','Closed Beta · Coming Soon'],
 'Alle 42 Dashboard-Ansichten': ['All 42 dashboard views','Las 42 vistas del panel','Les 42 vues du tableau de bord'],
 '42 vorhandene Produktansichten. Wähle einen Eintrag, um das Mockup-Ziel zu markieren.': ['42 existing product views. Select an item to mark the mockup destination.','42 vistas existentes del producto. Elige una para marcar el destino de la maqueta.','42 vues existantes du produit. Sélectionnez-en une pour marquer la destination de la maquette.'],
 'Ansichten durchsuchen': ['Search views','Buscar vistas','Rechercher des vues'],
 'Suchen in allen 42 Ansichten': ['Search all 42 views','Buscar en las 42 vistas','Rechercher parmi les 42 vues'],
 'Gefundene Ansichten': ['Matching views','Vistas encontradas','Vues correspondantes'],
 'Ansicht ausgewählt. Dies markiert nur ein Navigationsziel im Mockup; die Produktansicht wird nicht gestartet.': ['View selected. This marks a mockup navigation destination only; the product view is not launched.','Vista seleccionada. Esto solo marca un destino de navegación de la maqueta; no se abre la vista del producto.','Vue sélectionnée. Cela marque uniquement une destination de navigation de la maquette ; la vue du produit ne démarre pas.'],
 'Schließen': ['Close','Cerrar','Fermer'],
 'Alle Produktansichten anzeigen': ['Show all product views','Mostrar todas las vistas del producto','Afficher toutes les vues du produit'],
 'Produktansichten': ['Product views','Vistas del producto','Vues du produit'],
 'Suche löscht alle Filter': ['Search clears all filters','La búsqueda elimina todos los filtros','La recherche efface tous les filtres'],
 'Ansicht im Mockup ausgewählt': ['Mockup view selected','Vista de maqueta seleccionada','Vue de maquette sélectionnée']
};
for(const [de,[en,es,fr]] of Object.entries(strings))addRow(de,{de,en,es,fr});
fs.writeFileSync(path.join(dir,'dashboard-view-translations.js'),`window.LTTH_VIEW_TRANSLATIONS = ${JSON.stringify(textRows,null,2)};\n`);
function escape(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function link(e){return `<button type="button" class="view-entry${e.closedBeta?' is-closed-beta':''}" data-view="${escape(e.id)}"${e.closedBeta?' data-release="closed-beta"':''} aria-pressed="false">${escape(e.label)}${e.closedBeta?' <span class="release-status">Closed Beta · Coming Soon</span>':''}</button>`;}
function groupsHtml(groups,openFirst=false){return groups.map((g,i)=>`<details class="view-group" data-view-group="${escape(g.id)}" data-default-open="${openFirst&&i===0?'true':'false'}"${openFirst&&i===0?' open':''}><summary>${escape(g.label.de)}</summary><nav aria-label="${escape(g.label.de)}"><div class="view-entry-list">${g.views.map(id=>link(entries.find(e=>e.id===id))).join('')}</div></nav></details>`).join('');}
function directoryBody(inner){return `<div class="view-directory-body"><p>42 vorhandene Produktansichten. Wähle einen Eintrag, um das Mockup-Ziel zu markieren.</p><label for="view-filter">Ansichten durchsuchen</label><input id="view-filter" type="search" placeholder="Suchen in allen 42 Ansichten" aria-label="Suchen in allen 42 Ansichten" autocomplete="off"><output class="view-count" id="view-count" aria-label="Gefundene Ansichten">42 / 42</output><div class="view-group-list">${inner}</div><p class="view-selection" id="view-selection" role="status" aria-live="polite">Ansicht ausgewählt. Dies markiert nur ein Navigationsziel im Mockup; die Produktansicht wird nicht gestartet.<output id="view-selected" aria-hidden="true"></output></p></div>`;}
function shell(inner,kind){return `<${kind} id="view-directory" class="view-directory${kind==='dialog'?' view-drawer':''}"${kind==='dialog'?' aria-labelledby="view-directory-title"':''}>${kind==='dialog'?`<header class="view-directory-head"><h2 id="view-directory-title">Alle 42 Dashboard-Ansichten</h2><button type="button" data-view-close>Schließen</button></header>`:`<summary>Alle 42 Dashboard-Ansichten</summary>`}${directoryBody(inner)}</${kind}>`;}
const originalGroups=Object.keys(groupKeys).map(group=>({id:group,label:{de:groupLocales[`${group}:de`],en:groupLocales[`${group}:en`],es:groupLocales[`${group}:es`],fr:groupLocales[`${group}:fr`]},views:entries.filter(e=>e.group===group).map(e=>e.id)}));
const fragments={
 '01-overview.html':shell(groupsHtml(originalGroups),'details'),
 '02-live-console.html':shell(groupsHtml(originalGroups),'dialog'),
 '03-workspaces.html':`<section id="view-directory" class="view-directory view-directory-workspace" aria-labelledby="view-directory-title"><h2 id="view-directory-title">Alle 42 Dashboard-Ansichten</h2>${directoryBody(groupsHtml(taskGroups,true))}</section>`
};
for(const [file,fragment]of Object.entries(fragments)){
 let html=fs.readFileSync(path.join(dir,file),'utf8');
 const css=fs.readFileSync(path.join(dir,'view-navigation-styles.css'),'utf8');
 html=html.replace(/<dialog id="view-directory"[\s\S]*?<\/dialog>/,'');
 html=html.replace(/<details id="view-directory"[\s\S]*?<\/details>/,'');
 if(file.startsWith('03'))html=html.replace(/<section id="view-directory"[\s\S]*<\/section>(?=<nav class="demo-mobile-nav")/,'');
 if(!html.includes('.view-directory{'))html=html.replace('</style>',css+'\n</style>');
 if(file.startsWith('01')){
   html=html.replace(/<\/header>[\s\S]*?<main>/,`</header>${fragment}<main>`);
 } else if(file.startsWith('02')){
   if(!html.includes('id="view-directory-toggle"'))html=html.replace('<button class="push" aria-label="Einstellungen">⚙</button>','<button id="view-directory-toggle" aria-label="Alle 42 Dashboard-Ansichten anzeigen" aria-haspopup="dialog" aria-expanded="false">☷</button><button class="push" aria-label="Einstellungen">⚙</button>');
   html=html.replace(/<\/nav><main class="main">/,`</nav>${fragment}<main class="main">`);
 } else {
   html=html.replace(/<\/header><nav class="demo-mobile-nav"/,`</header>${fragment}<nav class="demo-mobile-nav"`);
 }
 if(!html.includes('src="mockup-view-navigation.js"'))html=html.replace('<script src="mockup-locales.js"></script><script>','<script src="mockup-locales.js"></script><script src="dashboard-view-translations.js"></script><script src="mockup-view-navigation.js"></script><script>');
 fs.writeFileSync(path.join(dir,file),html);
}
console.log('Generated 42 exact views for each variant; task mapping is one-to-one.');
