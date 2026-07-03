const fs = require('fs');
const path = require('path');

const rootEsPath = path.join('locales', 'es.json');
const rootEnPath = path.join('locales', 'en.json');
const appEsPath = path.join('app', 'locales', 'es.json');
const appEnPath = path.join('app', 'locales', 'en.json');

function loadJson(p){return JSON.parse(fs.readFileSync(p, 'utf8'));}
function saveJson(p, obj){fs.writeFileSync(p, JSON.stringify(obj, null, 2));}

const translationMap = {
  'Error': 'Error',
  'No': 'No',
  'OK': 'OK',
  'Flows': 'Flujos',
  'OSC-Bridge': 'Puente OSC',
  'Emoji Rain': 'Lluvia de Emojis',
  'Host': 'Host',
  'Benchmark': 'Benchmark',
  'Presets': 'Preajustes',
  'Settings': 'Ajustes',
  'Auto': 'Auto',
  'Cartoon': 'Dibujos Animados',
  'Furry': 'Furry',
  'Medieval': 'Medieval',
  'Noble': 'Noble',
  'Tech': 'Tecnológico',
  'Fireworks': 'Fuegos Artificiales',
  'Fireworks Dev': 'Fuegos Artificiales Dev',
  'Top Tier': 'Nivel Superior',
  'Quiz Show': 'Programa de Concurso',
  'Minecraft Connect': 'Conexión Minecraft',
  'STT Capture': 'Captura STT',
  'STT Ticker': 'Ticker STT',
  'Talking Heads': 'Cabezas Parlantes',
  'Error: {{error}}': 'Error: {{error}}'
};

function translateValue(val){
  // skip if contains placeholder
  if(typeof val !== 'string') return val;
  if(val.includes('{') && val.includes('}')) return val;
  let newVal = val;
  for(const [k,v] of Object.entries(translationMap)){
    const re = new RegExp(`\\b${k}\\b`, 'g');
    newVal = newVal.replace(re, v);
  }
  return newVal;
}

function process(esPath, enPath){
  const es = loadJson(esPath);
  const en = loadJson(enPath);
  function recurse(esNode, enNode){
    if(typeof esNode === 'object' && esNode !== null){
      for(const key in esNode){
        if(enNode && key in enNode){
          if(typeof esNode[key] === 'object' && esNode[key] !== null){
            recurse(esNode[key], enNode[key]);
          } else if(esNode[key] === enNode[key]){
            esNode[key] = translateValue(esNode[key]);
          }
        }
      }
    }
  }
  recurse(es, en);
  saveJson(esPath, es);
  console.log(`Updated ${esPath}`);
}

process(rootEsPath, rootEnPath);
process(appEsPath, appEnPath);

// copy updated root es.json to build-src and public
const buildSrc = path.join('build-src', 'locales', 'es.json');
const publicLoc = path.join('public', 'locales', 'es.json');
fs.copyFileSync(rootEsPath, buildSrc);
fs.copyFileSync(rootEsPath, publicLoc);
console.log('Copied to build-src and public');
