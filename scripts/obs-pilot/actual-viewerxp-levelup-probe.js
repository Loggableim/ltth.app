'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const crypto = require('crypto');
const assert = require('assert/strict');
const { spawn } = require('child_process');
const { chromium } = require('../../app/node_modules/playwright');
const { io } = require('../../app/node_modules/socket.io-client');
const { prepareDocsPluginFixture } = require('../lib/docs-capture-plugin-fixture');
const { createDocsCaptureChildEnvironment } = require('../lib/docs-capture-child-env');
const ROOT = path.resolve(__dirname, '../..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function main() {
  assert.equal(process.versions.node, '22.14.0');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-actual-milestone-leaderboard-'));
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const pluginDir = prepareDocsPluginFixture(ROOT, profile, ['milestone-leaderboard']);
  const pluginRoot='app/plugins/milestone-leaderboard';
  const pluginFiles=[];
  function walk(directory){for(const item of fs.readdirSync(path.join(ROOT,directory),{withFileTypes:true})){const file=directory+'/'+item.name;if(item.isDirectory()){if(!['test','tests','node_modules','uploads'].includes(item.name))walk(file);}else if(item.name.endsWith('.js'))pluginFiles.push(file);}}
  walk(pluginRoot);
  const files=['app/server.js','app/modules/plugin-loader.js','app/modules/plugin-identities.js','app/modules/database.js','app/modules/i18n.js','app/routes/locale.js','app/modules/docs-capture-policy.js','scripts/lib/docs-capture-child-env.js','scripts/lib/docs-capture-plugin-fixture.js','scripts/obs-pilot/actual-viewerxp-levelup-probe.js','app/package-lock.json','app/node_modules/socket.io/client-dist/socket.io.js','app/public/js/i18n-client.js',...pluginFiles,pluginRoot+'/plugin.json',...['xp-bar','leaderboard','level-up'].map(view=>pluginRoot+'/vendor/viewer-leaderboard/overlays/'+view+'.html'),...['de','en','es','fr'].map(locale=>pluginRoot+'/locales/'+locale+'.json')];
  const evidence = { schemaVersion: 1, scope: 'actual maintained backend; isolated ViewerXP only; not OBS', startedAt: new Date().toISOString(), profile, port, sourceHashes: {}, fixtureHashes: {}, steps: [], runtime: { node: process.versions.node, socketIo: require('../../app/node_modules/socket.io/package.json').version } };
  for (const file of files) {
    evidence.sourceHashes[file] = hash(path.join(ROOT, file));
    if (file.startsWith('app/plugins/milestone-leaderboard/') && !file.endsWith('plugin.json')) {
      evidence.fixtureHashes[file] = hash(path.join(pluginDir, 'milestone-leaderboard', file.slice('app/plugins/milestone-leaderboard/'.length)));
      assert.equal(evidence.fixtureHashes[file], evidence.sourceHashes[file]);
    }
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'app/plugins/milestone-leaderboard/plugin.json')));
  const staged = JSON.parse(fs.readFileSync(path.join(pluginDir, 'milestone-leaderboard/plugin.json')));
  evidence.stagedManifestHash = hash(path.join(pluginDir, 'milestone-leaderboard/plugin.json'));
  staged.enabled = manifest.enabled;
  assert.deepEqual(staged, manifest);
  let child; let browser; let socket; let output = ''; let phase='startup';
  try {
    child = spawn(process.execPath, [path.join(ROOT, 'app/server.js')], { cwd: path.join(ROOT, 'app'), env: createDocsCaptureChildEnvironment({ profileDir: profile, port, pluginDir, allowedPluginIds: ['milestone-leaderboard'] }), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    evidence.pid = child.pid;
    let spawnError;
    child.on('error', error => { spawnError = error; });
    child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw Error('Backend exited before readiness');
      try { ready = (await fetch(origin + '/api/viewer-xp/stats', { signal: AbortSignal.timeout(500) })).status === 200; } catch (_) {}
      if (ready) break;
      await pause(250);
    }
    assert(ready);
    const api = async (route, method = 'GET', body) => {
      const response = await fetch(origin + route, { method, headers: { Origin: origin, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000) });
      const result = await response.json(); evidence.steps.push({ route, method, status: response.status, result });
      assert.equal(response.status, 200); if (route === '/api/viewer-xp/leaderboard') assert(Array.isArray(result)); else assert.equal(result.success, true); return result;
    };


    evidence.initialLeaderboard=await api('/api/viewer-xp/leaderboard');
    await api('/api/viewer-xp/award','POST',{username:'Owned_ViewerXP_Probe',amount:25,reason:'isolated integration probe'});
    phase='await actual XP batch persistence';
    const profileReadyStarted=Date.now();evidence.profileReadiness={startedAt:new Date().toISOString(),samples:[]};
    let persistedProfile;
    for(let attempt=0;attempt<50;attempt++){const response=await fetch(origin+'/api/viewer-xp/profile/Owned_ViewerXP_Probe',{signal:AbortSignal.timeout(1000)});evidence.profileReadiness.samples.push({at:new Date().toISOString(),status:response.status});if(response.status===200){persistedProfile=await response.json();break;}assert.equal(response.status,404);await pause(100);}
    evidence.profileReadiness.finishedAt=new Date().toISOString();evidence.profileReadiness.elapsedMs=Date.now()-profileReadyStarted;
    assert.equal(persistedProfile?.username,'Owned_ViewerXP_Probe');evidence.persistedProfile={username:persistedProfile.username,xp:persistedProfile.xp,source:'actual bounded GET after asynchronous award batch'};
    browser=await chromium.launch({headless:true});

    evidence.browserErrors=[];evidence.blockedExternalRequests=[];evidence.levelUpEvents=[];
    const levelPage=await browser.newPage({viewport:{width:1280,height:720}});
    const boardPage=await browser.newPage({viewport:{width:1280,height:720}});
    for(const page of [levelPage,boardPage]){page.on('pageerror',error=>evidence.browserErrors.push(error.message));await page.route('**/*',request=>{if(new URL(request.request().url()).origin===origin)return request.continue();evidence.blockedExternalRequests.push(request.request().url());return request.abort();});}
    for(const [page,view] of [[levelPage,'level-up'],[boardPage,'leaderboard']]){
      const route='/plugins/viewer-leaderboard/overlays/'+view+'.html';const response=await fetch(origin+route);const bytes=Buffer.from(await response.arrayBuffer());assert.equal(response.status,200);const served=crypto.createHash('sha256').update(bytes).digest('hex');assert.equal(served,evidence.sourceHashes[pluginRoot+'/vendor/viewer-leaderboard/overlays/'+view+'.html']);
      evidence[view+'HtmlHash']=served;await page.goto(origin+route+'?sound=false&duration=5000&lang=de');await page.waitForFunction(()=>window.socket?.connected&&window.i18n?.initialized&&window.socket.listeners('locale-changed').length>0);
    }
    await boardPage.waitForFunction(()=>document.getElementById('leaderboardList').textContent.includes('Owned_ViewerXP_Probe'));
    evidence.positiveLeaderboardBefore=await boardPage.locator('#leaderboardList').innerText();assert(evidence.positiveLeaderboardBefore.includes('25'));
    socket=io(origin,{transports:['websocket'],reconnection:false});await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});socket.on('viewer-xp:public-level-up',data=>evidence.levelUpEvents.push(data));
    phase='actual award reaches level 2';await api('/api/viewer-xp/award','POST',{username:'Owned_ViewerXP_Probe',amount:75,reason:'owned level2 probe'});
    await levelPage.waitForFunction(()=>document.getElementById('levelUpContainer').classList.contains('show')&&document.getElementById('newLevel').textContent==='2');
    assert(evidence.levelUpEvents.some(event=>event.username==='Owned_ViewerXP_Probe'&&event.newLevel===2));
    await api('/api/i18n/current','POST',{locale:'fr'});await levelPage.waitForFunction(()=>window.i18n.currentLocale==='fr');
    const catalog=JSON.parse(fs.readFileSync(path.join(ROOT,pluginRoot+'/locales/fr.json')));const label=catalog.plugins['milestone-leaderboard'].labels.level_up;
    await levelPage.waitForFunction(label=>document.querySelector('.level-up-title').textContent===label,label);
    const rewardLabels=catalog.plugins['milestone-leaderboard'].viewer_xp.runtime;
    await levelPage.waitForFunction(expected=>document.querySelector('.reward-title')?.textContent===expected.header&&document.querySelector('[data-viewer-xp-label="new_color"]')?.textContent===expected.color,{header:rewardLabels.rewards,color:rewardLabels.new_color});
    evidence.activeRewardLabels={header:await levelPage.locator('.reward-title').textContent(),color:await levelPage.locator('[data-viewer-xp-label="new_color"]').textContent(),expectedHeader:rewardLabels.rewards,expectedColor:rewardLabels.new_color};
    assert.equal(await levelPage.locator('#newLevel').textContent(),'2');evidence.activeAnimation={locale:'fr',label,username:await levelPage.locator('#username').textContent(),oldLevel:await levelPage.locator('#oldLevel').textContent(),newLevel:'2'};
    await levelPage.waitForFunction(()=>{const style=getComputedStyle(document.getElementById('levelUpContainer'));return style.opacity==='1'&&style.transform==='matrix(1, 0, 0, 1, 0, 0)';});
    const png=path.join(ROOT,'output/playwright/actual-viewerxp','level2-fr-'+crypto.randomUUID()+'.png');fs.mkdirSync(path.dirname(png),{recursive:true});await levelPage.screenshot({path:png});evidence.screenshot={path:png,bytes:fs.statSync(png).size,sha256:hash(png)};
    const profileResponse=await fetch(origin+'/api/viewer-xp/profile/Owned_ViewerXP_Probe');const levelProfile=await profileResponse.json();assert.equal(levelProfile.level,2);
    phase='second actual levelup replaces active animation';await api('/api/viewer-xp/award','POST',{username:'Owned_ViewerXP_Probe',amount:levelProfile.xp_for_next_level-levelProfile.xp_progress,reason:'owned level3 probe'});
    await levelPage.waitForFunction(()=>document.getElementById('levelUpContainer').classList.contains('show')&&document.getElementById('newLevel').textContent==='3');evidence.secondAnimation={newLevel:'3',behavior:'replaces the current animation; renderer does not implement a queue'};
    await levelPage.waitForFunction(()=>!document.getElementById('levelUpContainer').classList.contains('show')&&!document.getElementById('levelUpContainer').classList.contains('hide'),null,{timeout:8000});evidence.autoHidden=true;
    assert.deepEqual(evidence.browserErrors,[]);assert.deepEqual(evidence.blockedExternalRequests,[]);
    evidence.limitations=['Existing manual award and actual batch level-up callback only; no TikTok/LIVE/provider/TTS','No OBS or public tunnel; animation replacement observed, no queue implementation'];evidence.result='PASS';
  } catch (error) { evidence.result = 'FAIL'; evidence.error = error.message; evidence.failurePhase=phase; evidence.failureStack=error.stack; if(browser){const pages=browser.contexts().flatMap(context=>context.pages());evidence.failurePages=await Promise.all(pages.map(page=>page.evaluate(()=>({url:location.href,locale:window.i18n?.currentLocale,text:document.body.innerText,connected:window.socket?.connected}))));}process.exitCode = 1; }
  finally {
    if (browser) { await browser.close(); evidence.browserClosed = !browser.isConnected(); }
    socket?.disconnect();
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      try { const response = await fetch(origin + '/api/shutdown', { method: 'POST', headers: { Origin: origin }, signal: AbortSignal.timeout(3000) }); evidence.shutdown = { status: response.status, body: await response.json() }; } catch (error) { evidence.shutdownError = error.message; }
      for (let i = 0; i < 32 && child.exitCode === null && child.signalCode === null; i++) await pause(250);
      if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); evidence.forced = true; await pause(500); }
    }
    const portClosed = await new Promise(resolve => { const connection = net.connect({ host: '127.0.0.1', port }); connection.once('connect', () => { connection.destroy(); resolve(false); }); connection.once('error', error => resolve(error.code === 'ECONNREFUSED')); connection.setTimeout(1000, () => { connection.destroy(); resolve(false); }); });
    evidence.postSourceHashes = Object.fromEntries(files.map(file => [file, hash(path.join(ROOT, file))]));
    evidence.sourceStable = files.every(file => evidence.postSourceHashes[file] === evidence.sourceHashes[file]);
    evidence.cleanup = { exitCode: child?.exitCode, signal: child?.signalCode, portClosed, graceful: child?.exitCode === 0 && output.includes('Unloaded plugin: milestone-leaderboard') && output.includes('Server closed') && !output.includes('Graceful shutdown timed out') };
    if (!evidence.sourceStable || !portClosed || !evidence.cleanup.graceful) { evidence.result = 'FAIL'; evidence.error ||= 'Source stability or cleanup not confirmed'; process.exitCode = 1; }
    fs.writeFileSync(path.join(profile, 'backend-output.txt'), output);
    evidence.finishedAt = new Date().toISOString();
    const receipt = path.join(ROOT, 'docs/coordination/evidence', `actual-milestone-leaderboard-${crypto.randomUUID()}.json`);
    fs.writeFileSync(receipt, JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify({ receipt, result: evidence.result, error: evidence.error, cleanup: evidence.cleanup }));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
