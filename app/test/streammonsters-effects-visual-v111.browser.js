'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appRoot, '..');
const outputDir = path.join(repoRoot, 'output', 'playwright', 'sm111-element-vfx-round1');
const fixtureUrl = '/app/test/browser-fixtures/streammonsters-vfx-acceptance.html';
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.webp': 'image/webp'
};

function safePath(url) {
  const pathname = decodeURIComponent(String(url || '/').split('?')[0]);
  const resolved = path.resolve(repoRoot, `.${pathname}`);
  return resolved.startsWith(repoRoot) ? resolved : null;
}

function createServer() {
  return http.createServer((request, response) => {
    const filePath = safePath(request.url);
    if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(filePath).pipe(response);
  });
}

async function alphaMetrics(page, png) {
  return page.evaluate(async base64 => {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let alphaPixels = 0;
    let minX = canvas.width;
    let maxX = -1;
    let minY = canvas.height;
    let maxY = -1;
    for (let index = 3, pixel = 0; index < pixels.length; index += 4, pixel += 1) {
      if (pixels[index] <= 8) continue;
      alphaPixels += 1;
      const x = pixel % canvas.width;
      const y = Math.floor(pixel / canvas.width);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    return {
      width: canvas.width,
      height: canvas.height,
      alphaPixels,
      coverage: alphaPixels / (canvas.width * canvas.height),
      bounds: alphaPixels ? { minX, maxX, minY, maxY } : null
    };
  }, png.toString('base64'));
}

async function preparePage(browser, port, viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${port}${fixtureUrl}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.harnessReady || window.harnessError);
  const harnessError = await page.evaluate(() => window.harnessError || null);
  if (harnessError) throw new Error(harnessError);
  return page;
}

async function captureCase(browser, port, viewport, testCase) {
  const page = await preparePage(browser, port, viewport);
  try {
    const layout = await page.evaluate(testCase.evaluate);
    await page.evaluate(canvasLayout => {
      document.documentElement.style.background = 'transparent';
      document.body.style.background = 'transparent';
      const overlay = document.querySelector('#streammonsters-overlay');
      const battle = document.querySelector('#battle');
      const canvas = document.querySelector('#battle-effects-canvas');
      const canvasStyle = getComputedStyle(canvas);
      const renderedBackground = {
        image: canvasStyle.backgroundImage,
        position: canvasStyle.backgroundPosition,
        size: canvasStyle.backgroundSize,
        repeat: canvasStyle.backgroundRepeat,
        opacity: canvasStyle.opacity
      };
      overlay.style.background = 'transparent';
      battle.style.background = 'transparent';
      battle.style.border = '0';
      battle.style.boxShadow = 'none';
      document.body.appendChild(canvas);
      overlay.style.display = 'none';
      canvas.style.position = 'fixed';
      canvas.style.inset = 'auto';
      canvas.style.left = '0';
      canvas.style.top = '0';
      canvas.style.width = `${canvasLayout.canvasRect.width}px`;
      canvas.style.height = `${canvasLayout.canvasRect.height}px`;
      canvas.style.backgroundImage = renderedBackground.image;
      canvas.style.backgroundPosition = renderedBackground.position;
      canvas.style.backgroundSize = renderedBackground.size;
      canvas.style.backgroundRepeat = renderedBackground.repeat;
      canvas.style.opacity = renderedBackground.opacity;
      canvas.style.visibility = 'visible';
    }, layout);
    const png = await page.screenshot({
      clip: {
        x: layout.canvasRect.left,
        y: layout.canvasRect.top,
        width: layout.canvasRect.width,
        height: layout.canvasRect.height
      },
      omitBackground: true
    });
    const alpha = await alphaMetrics(page, png);
    const filename = `${testCase.name}-${viewport.width}x${viewport.height}.png`;
    fs.writeFileSync(path.join(outputDir, filename), png);

    assert.ok(
      alpha.coverage >= (testCase.minimumCoverage || 0.005),
      `${filename} is blank or too thin: ${alpha.coverage} ${JSON.stringify(layout)}`
    );
    assert.ok(alpha.coverage <= 0.35, `${filename} exceeds 35% coverage: ${alpha.coverage}`);
    assert.ok(
      layout.canvasRect.bottom <= layout.gameplayBoundary + 1,
      `${filename} crosses the 74% gameplay boundary`
    );
    assert.equal(layout.actionHudOverlap, false, `${filename} overlaps action and fighter HUDs`);
    assert.ok(layout.actionHudGap >= 4, `${filename} leaves no readable action/HUD gap`);
    assert.equal(
      layout.actionText.copyUnclipped,
      true,
      `${filename} clips the skill description: ${JSON.stringify(layout.actionText)}`
    );
    assert.equal(
      layout.actionText.metricsUnclipped,
      true,
      `${filename} clips the action metrics: ${JSON.stringify(layout.actionText)}`
    );
    assert.match(layout.actionText.copy, /durchdringt 4 Schild/);
    assert.match(layout.actionText.metrics, /Heilung 6/);
    assert.ok(layout.z.canvas < layout.z.action, `${filename} can obscure the action card`);
    assert.ok(
      layout.z.fighters.every(value => !Number.isFinite(value) || layout.z.canvas < value),
      `${filename} can obscure a fighter panel`
    );
    return { filename, layout, alpha };
  } finally {
    await page.close();
  }
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-unsafe-webgpu']
  });
  const evidence = {
    generatedAt: new Date().toISOString(),
    webgpu: {},
    captures: []
  };
  try {
    const probe = await preparePage(browser, port, { width: 477, height: 829 });
    evidence.webgpu = await probe.evaluate(async () => {
      const navigatorGpu = Boolean(navigator.gpu);
      if (!navigatorGpu) return { navigatorGpu, adapter: false };
      try {
        return {
          navigatorGpu,
          adapter: Boolean(await navigator.gpu.requestAdapter())
        };
      } catch (_) {
        return { navigatorGpu, adapter: false };
      }
    });
    await probe.close();

    const cases = [
      {
        name: 'canvas-ember-attack-ltr',
        minimumCoverage: 0.02,
        evaluate: () => window.showCanvasScene('attack', {
          element: 'Ember',
          actorSlot: 1,
          targetSlot: 2,
          statusEffects: [{ type: 'burn' }]
        }, 0.52)
      },
      {
        name: 'canvas-ember-attack-rtl',
        minimumCoverage: 0.02,
        evaluate: () => window.showCanvasScene('attack', {
          element: 'Ember',
          actorSlot: 2,
          targetSlot: 1,
          statusEffects: [{ type: 'burn' }]
        }, 0.52)
      },
      {
        name: 'canvas-tide-defense',
        evaluate: () => window.showCanvasScene('defense', {
          element: 'Tide',
          actorSlot: 2,
          targetSlot: 2,
          shieldGain: 8
        }, 0.46)
      },
      {
        name: 'canvas-lunar-special',
        evaluate: () => window.showCanvasScene('special', {
          element: 'Lunar',
          actorSlot: 1,
          targetSlot: 2,
          healing: 5
        }, 0.5)
      },
      {
        name: 'css-ember-attack',
        evaluate: () => window.showCssScene('attack', {
          element: 'Ember',
          origin: { x: 0.28, y: 0.52 },
          targetOrigin: { x: 0.72, y: 0.52 }
        })
      },
      {
        name: 'css-tide-defense',
        evaluate: () => window.showCssScene('defense', {
          element: 'Tide',
          origin: { x: 0.72, y: 0.52 },
          targetOrigin: { x: 0.72, y: 0.52 }
        })
      },
      {
        name: 'css-lunar-special',
        evaluate: () => window.showCssScene('special', {
          element: 'Lunar',
          origin: { x: 0.28, y: 0.52 },
          targetOrigin: { x: 0.72, y: 0.52 }
        })
      }
    ];
    for (const viewport of [
      { width: 477, height: 829 },
      { width: 1080, height: 1920 }
    ]) {
      for (const testCase of cases) {
        evidence.captures.push(await captureCase(browser, port, viewport, testCase));
      }
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  fs.writeFileSync(
    path.join(outputDir, 'metrics.json'),
    `${JSON.stringify(evidence, null, 2)}\n`
  );
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
