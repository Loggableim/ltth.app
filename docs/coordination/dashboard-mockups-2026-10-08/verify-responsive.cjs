const path = require('node:path');
const { chromium } = require(path.resolve(__dirname, '../../../app/node_modules/playwright'));
const browserPath = process.env.MOCKUP_EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const variants = ['01-overview.html', '02-live-console.html', '03-workspaces.html'];
const viewports = [{name:'desktop-1440x900',width:1440,height:900},{name:'compact-1280x720',width:1280,height:720},{name:'tablet-720x900',width:720,height:900},{name:'mobile-390x844',width:390,height:844},{name:'narrow-320x844',width:320,height:844}];
const out = path.join(__dirname, 'responsive-check');
const fs = require('node:fs'); fs.mkdirSync(out, {recursive:true});
const fileUrl = file => 'file:///' + path.join(__dirname,file).replace(/\\/g,'/');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:browserPath});
  const results=[];
  try {
    for (const variant of variants) {
      const page=await browser.newPage({viewport:{width:390,height:844}});
      page.setDefaultTimeout(5000);
      const errors=[],external=[];
      page.on('pageerror', e=>errors.push(e.message));
      page.on('request',r=>{if(/^https?:/i.test(r.url()))external.push(r.url());});
      await page.goto(fileUrl(variant));
      if (!(await page.locator('#mode').count())) throw new Error(`${variant}: Tag/Nacht-Control fehlt`);
      for (const viewport of viewports) {
        await page.setViewportSize({width:viewport.width,height:viewport.height});
        // Start in Nacht for each viewport, then flip to day and back using keyboard.
        await page.evaluate(()=>{document.documentElement.dataset.mode='night';});
        const night = await inspect(page, viewport, 'night');
        await page.screenshot({path:path.join(out, `${variant.replace('.html','')}-${viewport.name}-night.png`),fullPage:false});
        await page.locator('#mode').focus();
        const focus=await page.locator('#mode').evaluate(el=>({active:el===document.activeElement,outline:getComputedStyle(el).outlineStyle,outlineWidth:getComputedStyle(el).outlineWidth}));
        if(!focus.active || focus.outline==='none' || parseFloat(focus.outlineWidth)<2) throw new Error(`${variant}/${viewport.name}: Tastaturfokus auf Tag/Nacht fehlt (${JSON.stringify(focus)})`);
        await page.keyboard.press('Enter');
        if(await page.locator('html').getAttribute('data-mode')!=='day') throw new Error(`${variant}/${viewport.name}: Tastatur kann Tagmodus nicht aktivieren`);
        const day=await inspect(page,viewport,'day');
        await page.screenshot({path:path.join(out, `${variant.replace('.html','')}-${viewport.name}-day.png`),fullPage:false});
        await page.keyboard.press('Enter');
        if(await page.locator('html').getAttribute('data-mode')!=='night') throw new Error(`${variant}/${viewport.name}: Tastatur kann Nachtmodus nicht wiederherstellen`);
        results.push({variant,viewport:viewport.name,night,day,focus});
      }
      if(errors.length) throw new Error(`${variant}: JS-Fehler ${errors.join('; ')}`);
      if(external.length) throw new Error(`${variant}: externe Requests ${external.join(', ')}`);
      await page.close();
    }
    console.log(JSON.stringify({status:'PASS', combinations:results.length, screenshots:results.length*2, results},null,2));
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1)});
async function inspect(page, viewport, mode){
  const data=await page.evaluate(()=>{
    const doc=document.documentElement, body=document.body;
    const controls=[...document.querySelectorAll('button,a[href],input,select')].filter(el=>{
      const s=getComputedStyle(el), r=el.getBoundingClientRect();
      return s.display!=='none'&&s.visibility!=='hidden'&&!el.closest('details:not([open])')&&r.width>0&&r.height>0;
    }).map(el=>{const r=el.getBoundingClientRect();const inViewport=r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth;const x=Math.max(0,Math.min(innerWidth-1,r.left+r.width/2));const y=Math.max(0,Math.min(innerHeight-1,r.top+r.height/2));const hit=inViewport?document.elementFromPoint(x,y):null;return {inViewport,name:(el.getAttribute('aria-label')||el.innerText||el.getAttribute('title')||el.tagName).trim().slice(0,60),left:r.left,right:r.right,top:r.top,bottom:r.bottom,hit:!!hit&&(el===hit||el.contains(hit))};});
    return {client:doc.clientWidth,scroll:Math.max(doc.scrollWidth,body.scrollWidth),controls,mainVisible:!!document.querySelector('main')&&document.querySelector('main').getBoundingClientRect().width>0,mode:doc.dataset.mode};
  });
  if(data.scroll>data.client+1) throw new Error(`${viewport.name}/${mode}: horizontaler Overflow ${JSON.stringify({client:data.client,scroll:data.scroll})}`);
  const off=data.controls.filter(c=>c.left < -1 || c.right > viewport.width+1);
  if(off.length) throw new Error(`${viewport.name}/${mode}: sichtbare Controls außerhalb des Viewports ${JSON.stringify(off)}`);
  const covered=data.controls.filter(c=>c.inViewport&&!c.hit);
  if(covered.length) throw new Error(`${viewport.name}/${mode}: Control-Zentrum überdeckt ${JSON.stringify(covered)}`);
  if(!data.mainVisible) throw new Error(`${viewport.name}/${mode}: Hauptinhalt fehlt`);
  return {client:data.client,scroll:data.scroll,controls:data.controls.length};
}



