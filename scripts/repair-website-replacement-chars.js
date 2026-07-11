const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'plugins.html');
let source = fs.readFileSync(file, 'utf8');
const replacements = [
  [/sp\uFFFDter/g, 'später'],
  [/standardm\uFFFD\uFFFDig/g, 'standardmäßig'],
  [/standardm\uFFFDig/g, 'standardmäßig'],
  [/unterst\uFFFDtzt/g, 'unterstützt'],
  [/\uFFFDber/g, 'über'],
  [/Cat\uFFFDlogo/g, 'Catálogo'],
  [/cat\uFFFDlogo/g, 'catálogo'],
  [/est\uFFFD/g, 'está'],
  [/Int\uFFFDntalo/g, 'Inténtalo'],
  [/m\uFFFDs/g, 'más'],
  [/Categor\uFFFDa/g, 'Categoría'],
  [/Versi\uFFFDn/g, 'Versión'],
  [/Documentaci\uFFFDn/g, 'Documentación'],
  [/charg\uFFFDs/g, 'chargés'],
  [/R\uFFFDessayez/g, 'Réessayez'],
  [/Cat\uFFFDgorie/g, 'Catégorie'],
  [/T\uFFFDl\uFFFDcharger/g, 'Télécharger'],
  [/T\uFFFDl\uFFFDchargez/g, 'Téléchargez'],
  [/Integraci\uFFFDn/g, 'Integración'],
  [/M\uFFFDdulo/g, 'Módulo'],
  [/N\uFFFDcleo/g, 'Núcleo'],
  [/Int\uFFFDgration/g, 'Intégration']
  ,[/publi\uFFFD/g, 'publié']
];
for (const [pattern, value] of replacements) source = source.replace(pattern, value);
source = source.replace(/plugin\.version \|\| '\uFFFD'/g, "plugin.version || '–'");
fs.writeFileSync(file, source, 'utf8');
