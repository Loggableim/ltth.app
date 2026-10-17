const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require(path.resolve(__dirname,'../../../app/node_modules/jsdom'));
const {chromium}=require(path.resolve(__dirname,'../../../app/node_modules/playwright'));
const dir=__dirname,repo=path.resolve(dir,'../../..');
const variants=['01-overview.html','02-live-console.html','03-workspaces.html'];
const locales=['de','en','es','fr'];
const widths=[320,390,720,1280,1440];
const source=new JSDOM(fs.readFileSync(path.join(repo,'app/public/dashboard.html'),'utf8')).window.document;
const releasePolicy=JSON.parse(fs.readFileSync(path.join(repo,'app/config/plugin-release-policy.json'),'utf8'));
const sourceItems=[...source.querySelectorAll('.sidebar-category .sidebar-item[data-view]')];
const expected=sourceItems.map(item=>item.dataset.view);
if(expected.length!==42||new Set(expected).size!==42)throw new Error('Produktquelle enthält nicht genau 42 eindeutige data-view IDs');
const expectedSet=new Set(expected);
const staticResults=[];
for(const file of variants){
  const sourceHtml=fs.readFileSync(path.join(dir,file),'utf8');
  if(/chatango/i.test(sourceHtml))throw new Error(`${file}: Chatango-Verweis im Mockup gefunden`);
  if(/(?:href|src)=["'][^"']*(?:download|\.zip|\.exe)[^"']*["']/i.test(sourceHtml))throw new Error(`${file}: möglicher öffentlicher Download-Link im Mockup gefunden`);
  const d=new JSDOM(sourceHtml).window.document;
  const items=[...d.querySelectorAll('button[data-view]')];
  const ids=items.map(item=>item.dataset.view);
  const actualSet=new Set(ids);
  const missing=expected.filter(id=>!actualSet.has(id));
  const extra=ids.filter(id=>!expectedSet.has(id));
  const duplicates=ids.filter((id,index)=>ids.indexOf(id)!==index);
  if(items.length!==42||missing.length||extra.length||duplicates.length)throw new Error(`${file}: Parität fehlgeschlagen ${JSON.stringify({count:items.length,missing,extra,duplicates})}`);
  if(d.querySelectorAll('#view-directory').length!==1||d.querySelectorAll('#view-filter').length!==1)throw new Error(`${file}: eindeutiger Navcontainer/Suchfilter fehlt`);
  for(const id of releasePolicy.closedBeta){
    const item=items.find(candidate=>candidate.dataset.view===id);
    if(!item||item.dataset.release!=='closed-beta'||!item.classList.contains('is-closed-beta')||item.querySelector('.release-status')?.textContent.trim()!=='Closed Beta · Coming Soon')throw new Error(`${file}: Closed-Beta-Ansicht ${id} nicht eindeutig gekennzeichnet`);
  }
  for(const item of items){
    const sourceItem=sourceItems.find(x=>x.dataset.view===item.dataset.view);
    if(!sourceItem)throw new Error(`${file}: ungültige data-view ${item.dataset.view}`);
  }
  staticResults.push({file,views:items.length,groups:d.querySelectorAll('.view-group').length});
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.MOCKUP_EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 let overflowChecks=0,localeRuns=0,searchChecks=0,screenshotCount=0;
 const outputDir=path.join(dir,'view-directory-check');fs.mkdirSync(outputDir,{recursive:true});
 try{
  for(const file of variants){
   const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(5000);
   const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/i.test(r.url()))external.push(r.url());});
   await page.goto('file:///'+path.join(dir,file).replace(/\\/g,'/'));
   const entries=page.locator('button[data-view]');
   for(const locale of locales){
    await page.locator('#locale').selectOption(locale);await page.waitForTimeout(20);localeRuns++;
    const missing=await page.evaluate(()=>window.LTTH_I18N.untranslated(document.querySelector('#view-directory')));
    if(missing.length)throw new Error(`${file}/${locale}: unübersetzte Verzeichnislabels ${missing.join(' | ')}`);
    for(const width of widths){
     await page.setViewportSize({width,height:width<500?844:width<900?900:width===1280?720:900});
     for(const mode of ['night','day']){
      await page.evaluate(value=>{document.documentElement.dataset.mode=value;},mode);
      const directory=page.locator('#view-directory');
      if(file.startsWith('02')){
       const trigger=page.locator('#view-directory-toggle');await trigger.focus();await page.keyboard.press('Enter');
       if(!(await directory.evaluate(el=>el.open)))throw new Error(`${file}: Dialog per Tastatur nicht geöffnet`);
      } else if(file.startsWith('01')) {
       if(!(await directory.evaluate(el=>el.open))){await directory.locator(':scope > summary').focus();await page.keyboard.press('Enter');}
       if(!(await directory.evaluate(el=>el.open)))throw new Error(`${file}: Verzeichnis per Tastatur nicht geöffnet`);
      }
      const dimensions=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth),width:innerWidth}));overflowChecks++;
      if(dimensions.scroll>dimensions.client+1||dimensions.client!==width)throw new Error(`${file}/${locale}/${width}/${mode}: Überlauf ${JSON.stringify(dimensions)}`);
      const controls=await directory.locator('button[data-view]').evaluateAll(nodes=>nodes.filter(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&!el.closest('details:not([open])')&&r.width&&r.height&&r.bottom>0&&r.top<innerHeight;}).map(el=>{const r=el.getBoundingClientRect(),x=Math.max(0,Math.min(innerWidth-1,r.left+r.width/2)),y=Math.max(0,Math.min(innerHeight-1,r.top+r.height/2)),hit=document.elementFromPoint(x,y);return {left:r.left,right:r.right,hit:!!hit&&(el===hit||el.contains(hit))};}));
      if(controls.some(c=>c.left < -1||c.right>width+1||!c.hit))throw new Error(`${file}/${width}/${mode}: Nav-Control abgeschnitten oder verdeckt ${JSON.stringify(controls.filter(c=>c.left < -1||c.right>width+1||!c.hit).slice(0,3))}`);
      const search=page.locator('#view-filter');await search.fill('webgpu-weather-control');
      const visible=await entries.evaluateAll(nodes=>nodes.filter(el=>!el.hidden).map(el=>el.dataset.view));
      if(visible.length!==1||visible[0]!=='webgpu-weather-control')throw new Error(`${file}/${locale}: ID-Suche nicht eindeutig ${JSON.stringify(visible)}`);searchChecks++;
      if(!(await page.locator('.view-group:not([hidden])[open]').count()))throw new Error(`${file}: Treffergruppe wird nicht aufgeklappt`);
      const target=page.locator('button[data-view="webgpu-weather-control"]');await target.focus();await page.keyboard.press('Enter');
      if(await target.getAttribute('aria-pressed')!=='true'||await directory.getAttribute('data-selected-view')!=='webgpu-weather-control')throw new Error(`${file}: Auswahlstatus für data-view nicht aktualisiert`);
      if(width<=720){await page.screenshot({path:path.join(outputDir,`${file.replace('.html','')}-${width}-${mode}-${locale}.png`),fullPage:false});screenshotCount++;}
      await search.fill('');
      if(await entries.count()!==42||await entries.evaluateAll(nodes=>nodes.filter(el=>el.hidden).length)!==0)throw new Error(`${file}: Filter leert den Bestand nicht korrekt`);
      if(file.startsWith('02')){await page.keyboard.press('Escape');if(await directory.evaluate(el=>el.open))throw new Error(`${file}: Escape schließt Navigationsdialog nicht`);}
      else if(file.startsWith('01')){await directory.locator(':scope > summary').focus();await page.keyboard.press('Enter');if(await directory.evaluate(el=>el.open))throw new Error(`${file}: Verzeichnis lässt sich nicht zuklappen`);}
     }
    }
   }
   if(errors.length)throw new Error(`${file}: JS-Fehler ${errors.join('; ')}`);if(external.length)throw new Error(`${file}: externe Requests ${external.join(', ')}`);await page.close();
  }
  console.log(JSON.stringify({status:'PASS',staticResults,localeRuns,viewports:widths,themeModes:2,overflowChecks,searchChecks,screenshots:screenshotCount,externalRequests:0,jsErrors:0},null,2));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
