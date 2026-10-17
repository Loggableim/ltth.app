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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-actual-spotlight-'));
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const pluginDir = prepareDocsPluginFixture(ROOT, profile, ['spotlight']);
  const files = ['app/server.js', 'app/modules/plugin-loader.js', 'app/modules/plugin-identities.js', 'app/modules/database.js', 'app/modules/i18n.js', 'app/routes/locale.js', 'app/modules/docs-capture-policy.js', 'scripts/lib/docs-capture-child-env.js', 'scripts/lib/docs-capture-plugin-fixture.js', 'scripts/obs-pilot/actual-spotlight-backend-probe.js', 'app/package-lock.json', 'app/node_modules/socket.io/client-dist/socket.io.js', 'app/public/js/i18n-client.js', 'app/public/fonts/exo-2.css', ...['main.js','plugin.json','overlays/chatter.html','overlays/single-overlay.js','lib/animations.js','lib/text-effects.js','lib/template-renderer.js', ...['de','en','es','fr'].map(locale => 'locales/'+locale+'.json')].map(file => 'app/plugins/spotlight/'+file)];
  const evidence = { schemaVersion: 1, scope: 'actual maintained backend; isolated Spotlight only; not OBS', startedAt: new Date().toISOString(), profile, port, sourceHashes: {}, fixtureHashes: {}, steps: [], runtime: { node: process.versions.node, socketIo: require('../../app/node_modules/socket.io/package.json').version } };
  for (const file of files) {
    evidence.sourceHashes[file] = hash(path.join(ROOT, file));
    if (file.startsWith('app/plugins/spotlight/') && !file.endsWith('plugin.json')) {
      evidence.fixtureHashes[file] = hash(path.join(pluginDir, 'spotlight', file.slice('app/plugins/spotlight/'.length)));
      assert.equal(evidence.fixtureHashes[file], evidence.sourceHashes[file]);
    }
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'app/plugins/spotlight/plugin.json')));
  const staged = JSON.parse(fs.readFileSync(path.join(pluginDir, 'spotlight/plugin.json')));
  evidence.stagedManifestHash = hash(path.join(pluginDir, 'spotlight/plugin.json'));
  staged.enabled = manifest.enabled;
  assert.deepEqual(staged, manifest);
  let child; let browser; let socket; let output = '';
  try {
    child = spawn(process.execPath, [path.join(ROOT, 'app/server.js')], { cwd: path.join(ROOT, 'app'), env: createDocsCaptureChildEnvironment({ profileDir: profile, port, pluginDir, allowedPluginIds: ['spotlight'] }), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    evidence.pid = child.pid;
    let spawnError;
    child.on('error', error => { spawnError = error; });
    child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw Error('Backend exited before readiness');
      try { ready = (await fetch(origin + '/api/lastevent/settings/chatter', { signal: AbortSignal.timeout(500) })).status === 200; } catch (_) {}
      if (ready) break;
      await pause(250);
    }
    assert(ready);
    const api = async (route, method = 'GET', body) => {
      const response = await fetch(origin + route, { method, headers: { Origin: origin, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000) });
      const result = await response.json(); evidence.steps.push({ route, method, status: response.status, result });
      assert.equal(response.status, 200); assert.equal(result.success, true); return result;
    };

    const settings = (await api('/api/lastevent/settings/chatter')).settings;
    await api('/api/lastevent/settings/chatter','POST',{...settings,showProfilePicture:false,preloadImages:false,fontColor:'#ffffff',enableBackground:true,backgroundColor:'#000000',refreshIntervalSeconds:0,inAnimationType:'none',outAnimationType:'none',usernameEffect:'none'});
    evidence.initialLast = await api('/api/lastevent/last/chatter');
    assert.equal(evidence.initialLast.user,null);
    const response = await fetch(origin+'/overlay/spotlight/chatter?lang=de');
    const bytes = Buffer.from(await response.arrayBuffer()); assert.equal(response.status,200);
    evidence.servedHtmlHash = crypto.createHash('sha256').update(bytes).digest('hex');
    assert.equal(evidence.servedHtmlHash,evidence.sourceHashes['app/plugins/spotlight/overlays/chatter.html']);
    browser = await chromium.launch({headless:true});
    const page = await browser.newPage({viewport:{width:1280,height:720}});
    evidence.browserErrors=[];page.on('pageerror',error=>evidence.browserErrors.push(error.message));
    evidence.blockedExternalRequests=[];
    await page.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();evidence.blockedExternalRequests.push(route.request().url());return route.abort();});
    await page.goto(origin+'/overlay/spotlight/chatter?lang=de');
    await page.waitForFunction(()=>window.socket?.connected && window.__lastEventSingleOverlay);
    evidence.emptyText=await page.locator('#overlay-container').textContent();
    const user=(await api('/api/lastevent/test/chatter','POST',{})).user;
    evidence.actualTestUser=user;
    await page.waitForFunction(name=>document.getElementById('overlay-container').textContent.includes(name),user.nickname);
    evidence.locales=[];
    for(const locale of ['de','en','es','fr']){
      await api('/api/i18n/current','POST',{locale});
      await page.waitForFunction(locale=>window.i18n?.currentLocale===locale,locale);
      await page.waitForFunction(name=>document.getElementById('overlay-container').textContent.includes(name),user.nickname);
      const expectedLabel=JSON.parse(fs.readFileSync(path.join(ROOT,'app/plugins/spotlight/locales/'+locale+'.json'))).plugins.spotlight.runtime.overlay.event_chatter;
      await page.waitForFunction(label=>document.getElementById('overlay-container').textContent.includes(label),expectedLabel);
      evidence.locales.push({locale,title:await page.title(),text:await page.locator('#overlay-container').textContent(),expectedLabel});
    }
    await page.evaluate(()=>window.socket.disconnect());
    await page.waitForFunction(()=>!window.socket.connected);
    const missed=(await api('/api/lastevent/test/chatter','POST',{})).user;
    assert.notEqual(missed.nickname,user.nickname);
    await page.evaluate(()=>window.socket.connect());
    await page.waitForFunction(name=>window.socket.connected && document.getElementById('overlay-container').textContent.includes(name),missed.nickname);
    evidence.reconnect={previousNickname:user.nickname,restoredNickname:missed.nickname,actualMissedTestRoute:true};
    await page.waitForFunction(()=>getComputedStyle(document.getElementById('overlay-container')).backgroundColor==='rgb(0, 0, 0)');
    await page.waitForTimeout(500); // Allow the actual entrance transition to finish before visual capture.
    const screenshot=path.join(ROOT,'output/playwright/actual-spotlight','fr-'+crypto.randomUUID()+'.png');
    fs.mkdirSync(path.dirname(screenshot),{recursive:true});await page.screenshot({path:screenshot});
    evidence.screenshot={path:screenshot,bytes:fs.statSync(screenshot).size,sha256:hash(screenshot)};
    assert.deepEqual(evidence.browserErrors,[]);assert.deepEqual(evidence.blockedExternalRequests,[]);
    evidence.limitations=['Original plugin local chatter test route only; no real TikTok event/provider or public tunnel','Not OBS acceptance'];
    evidence.result='PASS';
  } catch (error) { evidence.result = 'FAIL'; evidence.error = error.message; process.exitCode = 1; }
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
    evidence.cleanup = { exitCode: child?.exitCode, signal: child?.signalCode, portClosed, graceful: child?.exitCode === 0 && output.includes('Unloaded plugin: spotlight') && output.includes('Server closed') && !output.includes('Graceful shutdown timed out') };
    if (!evidence.sourceStable || !portClosed || !evidence.cleanup.graceful) { evidence.result = 'FAIL'; evidence.error ||= 'Source stability or cleanup not confirmed'; process.exitCode = 1; }
    fs.writeFileSync(path.join(profile, 'backend-output.txt'), output);
    evidence.finishedAt = new Date().toISOString();
    const receipt = path.join(ROOT, 'docs/coordination/evidence', `actual-spotlight-${crypto.randomUUID()}.json`);
    fs.writeFileSync(receipt, JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify({ receipt, result: evidence.result, error: evidence.error, cleanup: evidence.cleanup }));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
