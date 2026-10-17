const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(path.resolve(__dirname, '../../../../app/node_modules/playwright'));
const browserPath = process.env.MOCKUP_EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const variants = ['01-overview.html', '02-live-console.html', '03-workspaces.html'];
const locales = ['de', 'en', 'es', 'fr'];
const widths = [320, 390, 720];
const targets = ['h1,h2,h3,p,span,strong,b,small,button,select,a,label,output'];
const expected = {
  de: { locale: 'Sprache wählen', theme: 'Darstellung umschalten', profile: 'Demo-Profil wählen' },
  en: { locale: 'Choose language', theme: 'Switch appearance', profile: 'Choose demo profile' },
  es: { locale: 'Elegir idioma', theme: 'Cambiar apariencia', profile: 'Elegir perfil de demostración' },
  fr: { locale: 'Choisir la langue', theme: 'Changer l’apparence', profile: 'Choisir un profil de démo' }
};
let assertions = 0, contrastPairs = 0, focusStops = 0, viewportChecks = 0, minimumContrast = Infinity, minimumContext = '';
function check(value, message) { assertions++; if (!value) throw new Error(message); }
async function focusWalk(page, file, locale, width) {
  await page.goto(page.url(), { waitUntil: 'load' });
  await page.locator('#retry').waitFor({ state: 'visible', timeout: 2500 });
  const candidates = await page.evaluate(() => {
    const all = [...document.querySelectorAll('a[href],button,select,input:not([type=hidden])')]
      .filter(el => !el.disabled && !el.closest('[hidden]') && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    const checkedRadioNames = new Set([...document.querySelectorAll('input[type=radio]:checked')].map(el => el.name));
    return all.filter(el => el.type !== 'radio' || (el.checked && checkedRadioNames.has(el.name)))
      .map(el => ({ id: el.id || el.getAttribute('href') || el.tagName.toLowerCase(), name: el.getAttribute('aria-label') || el.labels?.[0]?.innerText?.trim() || el.innerText?.trim() || el.value || '' }));
  });
  const seen = [];
  for (const candidate of candidates) {
    await page.keyboard.press('Tab');
    const actual = await page.evaluate(() => {
      const el = document.activeElement;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { id: el.id || el.getAttribute('href') || el.tagName.toLowerCase(), name: el.getAttribute('aria-label') || el.labels?.[0]?.innerText?.trim() || el.innerText?.trim() || el.value || '', x: r.x, right: r.right, outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, visibleFocus: el.matches(':focus-visible') };
    });
    check(actual.id === candidate.id, `${file}/${locale}/${width}: focus order expected ${candidate.id}, got ${actual.id}`);
    check(actual.name.trim().length > 0, `${file}/${locale}/${width}: unnamed focus stop ${actual.id}`);
    check(actual.visibleFocus && actual.outlineStyle !== 'none' && parseFloat(actual.outlineWidth) >= 2, `${file}/${locale}/${width}: focus not visibly outlined on ${actual.id} (${actual.outlineStyle}/${actual.outlineWidth})`);
    check(actual.x >= -1 && actual.right <= width + 1, `${file}/${locale}/${width}: focused control outside viewport ${actual.id} (${actual.x}-${actual.right})`);
    focusStops++; seen.push(actual.id);
  }
  return seen;
}
async function measureContrast(page, variant, theme, state) {
  const rows = await page.evaluate(selectors => {
    const parse = value => {
      const m = value.match(/rgba?\(([^)]+)\)/); if (!m) return null;
      const a = m[1].split(',').map(part => Number.parseFloat(part.trim()));
      return { r: a[0], g: a[1], b: a[2], a: a.length > 3 ? a[3] : 1 };
    };
    const luminance = ({r,g,b}) => {
      const values=[r,g,b].map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});
      return .2126*values[0]+.7152*values[1]+.0722*values[2];
    };
    const colorText = c => `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;
    const resolveBackground = el => {
      for(let node=el;node;node=node.parentElement){
        const c=parse(getComputedStyle(node).backgroundColor);
        if(c&&c.a>.99)return c;
      }
      return parse(getComputedStyle(document.body).backgroundColor);
    };
    return selectors.flatMap(selector=>[...document.querySelectorAll(selector)].filter(el=>el.getClientRects().length&&el.innerText?.trim()&&!el.closest('.sr-only,[aria-hidden="true"]')&&!el.classList.contains('brand-mark')).map(el=>{
      const fg=parse(getComputedStyle(el).color), bg=resolveBackground(el);
      if(!fg||!bg)return {selector,text:el.innerText.trim(),ratio:null};
      const l1=luminance(fg),l2=luminance(bg),ratio=(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);
      return {selector,text:el.innerText.trim().slice(0,50),fg:colorText(fg),bg:colorText(bg),ratio};
    }));
  }, targets);
  for (const row of rows) {
    if (row.ratio === null) continue;
    contrastPairs++;
    if (row.ratio < minimumContrast) { minimumContrast = row.ratio; minimumContext = `${variant}/${theme}/${state} ${row.selector}: ${row.text}`; }
    check(row.ratio >= 4.5, `${variant}/${theme}/${state}: ${row.selector} contrast ${row.ratio.toFixed(2)}:1 (${row.fg} on ${row.bg}) text=${row.text}`);
  }
  const mark = await page.evaluate(() => {
    const style=getComputedStyle(document.querySelector('.brand-mark'));
    const root=getComputedStyle(document.documentElement);
    return {fg:style.color,green:root.getPropertyValue('--green').trim(),purple:root.getPropertyValue('--purple').trim()};
  });
  const gradientStops = theme === 'day' ? ['#d9f1e1', '#e8ddff'] : theme === 'night' ? [mark.green, mark.purple] : [];
  for (const stop of gradientStops) {
    const ratio = await page.evaluate(({fg,bg}) => {
      const p=s=>{let rgb;const h=s.match(/#([0-9a-f]{6})/i);if(h){const n=parseInt(h[1],16);rgb=[(n>>16)&255,(n>>8)&255,n&255];}else{const m=s.match(/rgba?\(([^)]+)\)/);if(!m)return null;rgb=m[1].split(',').slice(0,3).map(v=>Number.parseFloat(v.trim()));}return rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});};
      const [a,b]=[p(fg),p(bg)];if(!a||!b)return 0;const L=x=>x[0]*.2126+x[1]*.7152+x[2]*.0722;const x=L(a),y=L(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
    }, {fg:mark.fg,bg:stop});
    contrastPairs++;
    if (ratio < minimumContrast) { minimumContrast = ratio; minimumContext = `${variant}/${theme}/${state} brand mark on ${stop}`; }
    check(ratio >= 4.5, `${variant}/${theme}/${state}: brand-mark text contrast ${ratio.toFixed(2)}:1 against gradient stop ${stop}`);
  }
  return rows;
}
(async () => {
  const browser=await chromium.launch({headless:true,executablePath:browserPath});
  const violations=[];
  try {
    for(const file of variants){
      const page=await browser.newPage({viewport:{width:390,height:844}});
      page.on('request',request=>{if(/^https?:/i.test(request.url()))violations.push('unexpected external request '+request.url());});
      page.on('pageerror',error=>violations.push('JS error '+file+': '+error.message));
      await page.goto(pathToFileURL(path.join(__dirname,file)).href,{waitUntil:'load'});
      await page.locator('#retry').waitFor({state:'visible',timeout:2500});
      const semantic=await page.evaluate(()=>{
        const ids=[...document.querySelectorAll('[id]')].map(el=>el.id);
        const duplicateIds=ids.filter((id,index)=>ids.indexOf(id)!==index);
        const brokenLabelRefs=[...document.querySelectorAll('[aria-labelledby],[aria-describedby],[aria-controls]')].flatMap(el=>['aria-labelledby','aria-describedby','aria-controls'].flatMap(attr=>(el.getAttribute(attr)||'').split(/\s+/).filter(Boolean).filter(id=>!document.getElementById(id))));
        const controls=[...document.querySelectorAll('button,select,input:not([type=hidden]),a[href]')].filter(el=>el.getClientRects().length&&!el.closest('[hidden]'));
        const unnamed=controls.filter(el=>!(el.getAttribute('aria-label')||el.labels?.[0]?.innerText?.trim()||el.innerText?.trim()||el.value||'').trim()).map(el=>el.outerHTML.slice(0,100));
        const radioGroups=[...document.querySelectorAll('input[name=connection]')].every(input=>input.closest('fieldset')?.querySelector('legend')?.textContent.trim());
        return {h1:document.querySelectorAll('h1').length, lang:document.documentElement.lang, duplicateIds, brokenLabelRefs, unnamed, landmarks:[...document.querySelectorAll('nav')].map(el=>el.getAttribute('aria-label')||''), liveRegions:[...document.querySelectorAll('[role=status][aria-live]')].length, radioGroups};
      });
      check(semantic.h1===1,`${file}: expected one H1, found ${semantic.h1}`);
      check(semantic.duplicateIds.length===0,`${file}: duplicate IDs ${semantic.duplicateIds.join(',')}`);
      check(semantic.brokenLabelRefs.length===0,`${file}: broken ARIA refs ${semantic.brokenLabelRefs.join(',')}`);
      check(semantic.unnamed.length===0,`${file}: unnamed controls ${semantic.unnamed.join(';')}`);
      check(semantic.landmarks.every(Boolean),`${file}: unnamed nav landmark`);
      check(semantic.liveRegions>=3,`${file}: expected status announcements for event/profile/connection`);
      check(semantic.radioGroups,`${file}: connection radio controls need a named fieldset/legend`);
      for(const locale of locales){
        await page.locator('#locale').selectOption(locale);
        check(await page.locator('html').getAttribute('lang')===locale,`${file}/${locale}: document language`);
        check(await page.locator('#locale').getAttribute('aria-label')===expected[locale].locale,`${file}/${locale}: locale accessible name`);
        check(await page.locator('#mode').getAttribute('aria-label')===expected[locale].theme,`${file}/${locale}: theme accessible name`);
        check(await page.locator('#profile-select').getAttribute('aria-label')===expected[locale].profile,`${file}/${locale}: profile accessible name`);
        for(const theme of ['night','day']){
          const actualTheme=await page.locator('html').getAttribute('data-theme');
          if(actualTheme!==theme){await page.locator('#mode').focus();await page.keyboard.press('Enter');}
          check(await page.locator('html').getAttribute('data-theme')===theme,`${file}/${locale}: could not set ${theme} theme`);
          for(const width of widths){
            await page.setViewportSize({width,height:844});
            const dim=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
            viewportChecks++;
            check(dim.scroll<=dim.client,`${file}/${locale}/${theme}: overflow at ${width}px ${JSON.stringify(dim)}`);
          }
          await page.setViewportSize({width:390,height:844});
          await page.locator('#event-reload').click();
          await page.locator('#retry').waitFor({state:'visible',timeout:2500});
          await measureContrast(page,file,theme,'error');
          await page.locator('#retry').focus();await page.keyboard.press('Enter');
          await page.locator('#show-filled').waitFor({state:'visible',timeout:2500});
          await page.locator('#profile-select').selectOption('demo-b');
          await page.locator('#show-filled').click();
          await measureContrast(page,file,theme,'filled');
          await page.locator('#profile-select').selectOption('demo-a');
          await measureContrast(page,file,theme,'empty');
          await page.locator('#profile-select').selectOption('demo-b');
        }
        await page.setViewportSize({width:320,height:844});
        const actualOrder=await focusWalk(page,file,locale,320);
        check(actualOrder.length>5,`${file}/${locale}: unexpectedly short focus sequence`);
      }
      const zoomContext=await browser.newContext({viewport:{width:720,height:900},deviceScaleFactor:2});
      const zoomPage=await zoomContext.newPage();
      zoomPage.on('request',request=>{if(/^https?:/i.test(request.url()))violations.push('unexpected zoom external request '+request.url());});
      zoomPage.on('pageerror',error=>violations.push('zoom JS error '+file+': '+error.message));
      await zoomPage.goto(pathToFileURL(path.join(__dirname,file)).href,{waitUntil:'load'});
      await zoomPage.locator('#retry').waitFor({state:'visible',timeout:2500});
      const zoomMetrics=await zoomPage.evaluate(()=>({dpr:devicePixelRatio,cssWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,heading:document.querySelector('h1').getBoundingClientRect().width}));
      check(zoomMetrics.dpr===2&&zoomMetrics.cssWidth===720,`${file}: 200% zoom proxy not active ${JSON.stringify(zoomMetrics)}`);
      check(zoomMetrics.scrollWidth<=zoomMetrics.cssWidth,`${file}: overflow at 200% zoom proxy ${JSON.stringify(zoomMetrics)}`);
      check(zoomMetrics.heading>0&&zoomMetrics.heading<=720,`${file}: heading lost/reflow failed at 200% zoom proxy`);
      viewportChecks++;
      await zoomPage.locator('#mode').focus();
      const zoomFocus=await zoomPage.locator('#mode').evaluate(el=>({outline:getComputedStyle(el).outlineStyle,width:getComputedStyle(el).outlineWidth}));
      check(zoomFocus.outline!=='none'&&parseFloat(zoomFocus.width)>=2,`${file}: focus indicator missing at 200% zoom proxy`);
      await focusWalk(zoomPage,file,'de',720);
      await zoomContext.close();

      const forcedContext=await browser.newContext({viewport:{width:390,height:844}});
      const forcedPage=await forcedContext.newPage();
      forcedPage.on('request',request=>{if(/^https?:/i.test(request.url()))violations.push('unexpected forced-colors external request '+request.url());});
      forcedPage.on('pageerror',error=>violations.push('forced-colors JS error '+file+': '+error.message));
      await forcedPage.emulateMedia({forcedColors:'active'});
      await forcedPage.goto(pathToFileURL(path.join(__dirname,file)).href,{waitUntil:'load'});
      await forcedPage.locator('#retry').waitFor({state:'visible',timeout:2500});
      check(await forcedPage.evaluate(()=>matchMedia('(forced-colors: active)').matches),`${file}: forced-colors emulation unavailable`);
      await measureContrast(forcedPage,file,'forced','error');
      const forcedFocus=await forcedPage.locator('#mode').evaluate(el=>{el.focus();const cs=getComputedStyle(el);return {style:cs.outlineStyle,width:cs.outlineWidth};});
      check(forcedFocus.style!=='none'&&parseFloat(forcedFocus.width)>=2,`${file}: missing keyboard focus in forced-colors mode`);
      await forcedPage.screenshot({path:path.join(__dirname,`forced-colors-${file.replace('.html','.png')}`),fullPage:true});
      await forcedPage.locator('#retry').focus();await forcedPage.keyboard.press('Enter');
      await forcedPage.locator('#show-filled').waitFor({state:'visible',timeout:2500});
      await measureContrast(forcedPage,file,'forced','empty');
      await forcedPage.locator('#profile-select').selectOption('demo-b');
      await forcedPage.locator('#show-filled').click();
      await measureContrast(forcedPage,file,'forced','filled');
      for(const width of widths){
        await forcedPage.setViewportSize({width,height:844});
        const dim=await forcedPage.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
        viewportChecks++;
        check(dim.scroll<=dim.client,`${file}: forced-colors overflow at ${width}px ${JSON.stringify(dim)}`);
      }
      await forcedPage.setViewportSize({width:320,height:844});
      await focusWalk(forcedPage,file,'de',320);
      await forcedContext.close();
      await page.close();
    }
  } catch(error){violations.push(error.stack||String(error));}
  await browser.close();
  if(violations.length){console.error(violations.join('\n'));process.exitCode=1;return;}
  console.log(JSON.stringify({status:'PASS',variants:variants.length,locales:locales.length,contrastPairs,minimumContrast:minimumContrast.toFixed(2),minimumContext,viewportChecks,focusStops,assertions,externalRequests:0,jsErrors:0},null,2));
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
