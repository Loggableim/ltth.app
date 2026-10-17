const path = require('node:path');
const { chromium } = require(path.resolve(__dirname, '../../../app/node_modules/playwright'));
const browserPath = process.env.MOCKUP_EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const files = ['01-overview.html', '02-live-console.html', '03-workspaces.html'];
const samples = [
  ['page heading', 'h1'], ['body copy', 'main p:not(.sr-only)'], ['eyebrow / group label', '.eyebrow'],
  ['secondary text', '.metric label, .metric .label, .metric small'], ['purple progress text', '.goal .right'], ['status text', '.status, .tag'],
  ['primary connection action', '.connect, .primary'], ['selected demo state', '.demo-flow button[aria-pressed="true"]'], ['critical stop demo action', '.demo-detail button[data-demo-open="stop-confirm"]'],
  ['purple link', '.link'], ['demo heading kicker', '.demo-kicker'], ['demo detail copy', '.demo-copy'],
  ['demo primary action', '.demo-detail button.demo-primary'], ['demo confirmation feedback', '.demo-feedback'],
  ['directory explanatory copy', '.view-directory-body>p:first-child'], ['directory search label', '.view-directory label'],
  ['directory group label', '.view-group>summary'], ['directory item', '.view-entry'],
  ['selected directory item', '.view-entry[aria-pressed="true"]'], ['directory result status', '.view-selection'],
  ['offline warning', '.risk'], ['theme control', '#mode'], ['locale control', '#locale']
];
const palettes = {
  '01-overview.html': { night: { bg: '#07130f', surface: '#0e211a', surface2: '#142c22', text: '#effaf3', muted: '#9db6a8', green: '#33dc9b', purple: '#b9a1ff' }, day: { bg: '#f4f8f5', surface: '#ffffff', surface2: '#edf5f0', text: '#17251d', muted: '#596f61', green: '#10b981', purple: '#6948bf' } },
  '02-live-console.html': { night: { bg: '#080d11', surface: '#111a20', surface2: '#18242c', text: '#f1f7f5', muted: '#9babb0', green: '#31e49d', purple: '#ad91ff' }, day: { bg: '#f1f5f4', surface: '#ffffff', surface2: '#edf2f1', text: '#14231f', muted: '#586d65', green: '#10b981', purple: '#6748bd' } },
  '03-workspaces.html': { night: { bg: '#101018', surface: '#191923', surface2: '#22222e', text: '#f4f2fa', muted: '#aaa5b9', green: '#52e5a6', purple: '#b6a0ff' }, day: { bg: '#f5f3f8', surface: '#ffffff', surface2: '#f0edf5', text: '#241d32', muted: '#675f73', green: '#10b981', purple: '#6948bd' } }
};
function hexRgb(hex) { const n=parseInt(hex.slice(1),16); return [(n>>16)&255,(n>>8)&255,n&255]; }
function luminance(rgb) { const c=rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]; }
function ratio(fg,bg) { const a=luminance(hexRgb(fg)),b=luminance(hexRgb(bg));return (Math.max(a,b)+.05)/(Math.min(a,b)+.05); }
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:browserPath});
  try {
    const report=[];
    for(const file of files){
      const page=await browser.newPage({viewport:{width:1280,height:900}});
      await page.goto('file:///'+path.join(__dirname,file).replace(/\\/g,'/'));
      if(file.startsWith('01')) await page.locator('#view-directory > summary').click();
      if(file.startsWith('02')) await page.locator('#view-directory-toggle').click();
      const firstGroup=page.locator('.view-group').first();
      if(await firstGroup.count() && !(await firstGroup.evaluate(el=>el.open))) await firstGroup.locator(':scope > summary').click();
      const firstView=page.locator('.view-entry').first(); if(await firstView.count()) await firstView.click();
      if(file.startsWith('02')) await page.locator('#view-directory').evaluate(el=>el.close());
      const catalog=page.locator('[data-demo-open="catalog"]').first();
      if(await catalog.count()){
        await catalog.click();
        let diag=page.locator('#demo-detail [data-demo-open="diagnostics"]');
        if(!(await diag.count())){
          await page.locator('#demo-detail [data-demo-back]').click();
          if(file.startsWith('02')) await page.locator('.demo-diagnostic-entry').click();
          else {await page.locator('aside .nav [data-demo-open="stream-area"]').click();diag=page.locator('#demo-detail [data-demo-open="diagnostics"]');await diag.click();}
        } else await diag.click();
        const stop=page.locator('#demo-detail [data-demo-open="stop-confirm"]');
        if(await stop.count()){await stop.click();const confirm=page.locator('[data-demo-confirm-stop]');if(await confirm.count())await confirm.click();await page.locator('#demo-detail [data-demo-back]').click();}
      }
      for(const mode of ['night','day']){
        await page.locator('#mode').evaluate((el,m)=>{document.documentElement.dataset.mode=m;el.setAttribute('aria-pressed',String(m==='day'));},mode);
        for(const [label,selector] of samples){
          const element=page.locator(selector).first();if(!(await element.count()))continue;
          const css=await element.evaluate(el=>{const s=getComputedStyle(el);let n=el,bg='transparent';while(n){const c=getComputedStyle(n).backgroundColor;if(c!=='transparent'&&!c.includes('rgba(0, 0, 0, 0)')){bg=c;break;}n=n.parentElement;}return {fg:s.color,bg,fontSize:parseFloat(s.fontSize),fontWeight:s.fontWeight};});
          const toHex=v=>{const m=v.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);return m?'#'+m.slice(1,4).map(x=>(+x).toString(16).padStart(2,'0')).join(''):null;};
          const fg=toHex(css.fg),bg=toHex(css.bg);
          const measured=fg&&bg?ratio(fg,bg):null;
          report.push({file,mode,label,fg,bg,ratio:measured,fontSize:css.fontSize,fontWeight:css.fontWeight});
        }
      }
      await page.close();
    }
    for(const row of report) console.log([row.file,row.mode,row.label,row.fg,row.bg,row.ratio?.toFixed(2)??'n/a'].join(' | '));
    const failures=report.filter(r=>r.ratio!==null && r.ratio<4.5);
    if(failures.length){console.error('FAIL: unter 4.5:1: '+JSON.stringify(failures));process.exitCode=1;}
    else console.log('PASS: alle erfassten normalen Text-/Bedienelement-Paare >= 4.5:1 ('+report.length+' Messungen).');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1);});
