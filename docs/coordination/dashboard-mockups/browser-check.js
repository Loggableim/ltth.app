async page => {
 const base='file:///C:/Users/logga/Documents/ltth_codex/ltth_desktop2-main/docs/coordination/dashboard-mockups/';
 const report={checks:[],contrasts:[],keyboard:[],errors:[]};page.on('pageerror',e=>report.errors.push(e.message));
 const luma=hex=>{if(hex.length===4)hex='#'+hex.slice(1).split('').map(c=>c+c).join('');const rgb=hex.match(/[a-f0-9]{2}/gi).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];};
 for(const name of ['01-cockpit','02-studio','03-creator']) {
  await page.goto(base+name+'.html');
  for(const lang of ['de','en','es','fr']) {
   await page.locator('#language').selectOption(lang);if(await page.locator('[aria-pressed]').count()){await page.locator('[aria-pressed]').evaluate(el=>el.setAttribute('aria-pressed','false'));await page.locator('#state').selectOption('live');}
   for(const theme of ['day','night']) {
    await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
    for(const width of [320,390,1440]) {
     await page.setViewportSize({width,height:844});
     const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
     if(overflow)throw Error(name+' '+lang+' '+theme+' '+width+' overflow');
     for(const state of ['offline','loading','error','live']) {
      await page.locator('#state').selectOption(state);
      const value=await page.locator('[data-value]').first().textContent();if((state==='live')===(value==='—'))throw Error('Incorrect value '+state);
      report.checks.push({name,lang,theme,width,state,overflow});
     }
     if(width===390||width===1440)await page.screenshot({path:name+'-'+lang+'-'+theme+'-'+width+'.png',fullPage:true});
    }
    const colors=await page.evaluate(()=>{const s=getComputedStyle(document.documentElement);return Object.fromEntries(['ink','muted','card','bg','green','purple','soft','control'].map(k=>[k,s.getPropertyValue('--'+k).trim()]));});
    for(const [fg,bg,min] of [['ink','card',4.5],['muted','card',4.5],['muted','bg',4.5],['green','card',4.5],['purple','soft',4.5],['purple','card',3],['control','card',3]]){const a=luma(colors[fg]),b=luma(colors[bg]),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);report.contrasts.push({name,theme,fg,bg,ratio:Number(ratio.toFixed(2)),min});if(!Number.isFinite(ratio)||ratio<min)throw Error('Contrast '+fg+' '+bg+' '+ratio);}
   }
   for(const profile of ['Just Chatting','Gaming']){await page.locator('#profile').selectOption(profile);const selected=await page.locator('#profile option:checked').textContent();if(await page.locator('#profileName').textContent()!==selected)throw Error('Profile translation mismatch');}
   await page.locator('[data-action]').first().click();if(!(await page.locator('#toast').textContent()))throw Error('Missing feedback');
  }
  await page.goto(base+name+'.html');await page.setViewportSize({width:390,height:844});await page.keyboard.press('Tab');
  const first=await page.evaluate(()=>({className:document.activeElement.className,outline:getComputedStyle(document.activeElement).outlineWidth}));if(first.className!=='skip'||first.outline==='0px')throw Error('Skip focus');await page.keyboard.press('Enter');if(await page.evaluate(()=>document.activeElement.id)!=='main')throw Error('Skip destination');
  await page.locator('#theme').focus();const before=await page.locator('html').getAttribute('data-theme');await page.keyboard.press('Enter');if(await page.locator('html').getAttribute('data-theme')===before)throw Error('Keyboard theme');
  await page.locator('[aria-pressed]').focus();await page.keyboard.press('Space');if(await page.locator('[aria-pressed]').getAttribute('aria-pressed')!=='true')throw Error('Keyboard action');
  await page.locator('#language').focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Tab');if(await page.locator('html').getAttribute('lang')!=='en')throw Error('Keyboard language');await page.locator('#profile').focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Tab');if(await page.locator('#profileName').textContent()!=='Just Chatting')throw Error('Keyboard profile');await page.locator('#state').focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('Tab');if(await page.locator('[data-value]').first().textContent()!=='—')throw Error('Keyboard state');if(name==='01-cockpit'){await page.locator('summary').focus();await page.keyboard.press('Space');if(!await page.locator('details').getAttribute('open')&&await page.locator('details').getAttribute('open')===null)throw Error('Keyboard details');}report.keyboard.push({name,skip:true,themeEnter:true,actionSpace:true,languageArrow:true,profileArrow:true,stateArrow:true});
  for(const state of ['offline','loading','error']){await page.locator('#language').selectOption('fr');await page.locator('#state').selectOption(state);await page.screenshot({path:name+'-fr-'+state+'-390.png',fullPage:true});}
  await page.locator('#state').selectOption('live');await page.locator('#language').selectOption('de');await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:name+'-1440.png',fullPage:true});await page.setViewportSize({width:390,height:1000});await page.screenshot({path:name+'-390.png',fullPage:true});await page.locator('#theme').click();await page.screenshot({path:name+'-inverted-mobile.png',fullPage:true});
 }
 await page.goto(base+'index.html');for(const lang of ['de','en','es','fr']){await page.locator('#language').selectOption(lang);if(await page.locator('[aria-pressed]').count()){await page.locator('[aria-pressed]').evaluate(el=>el.setAttribute('aria-pressed','false'));await page.locator('#state').selectOption('live');}if(await page.locator('html').getAttribute('lang')!==lang)throw Error('Index language');}
 const primary=(luma('#ffffff')+.05)/(luma('#166534')+.05);if(primary<4.5)throw Error('Primary contrast');return {count:report.checks.length,errors:report.errors,keyboard:report.keyboard,primaryContrast:Number(primary.toFixed(2)),contrasts:report.contrasts.filter(x=>x.name==='01-cockpit').slice(0,14)};
}
