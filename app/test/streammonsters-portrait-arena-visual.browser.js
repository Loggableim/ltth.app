'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const { chromium } = require('playwright');

const VIEWPORTS = Object.freeze([[324, 581], [477, 829], [1080, 1920]]);
const VARIANTS = Object.freeze(['split-arena', 'classic']);
const PHASES = Object.freeze(['choice', 'sealed', 'revealed', 'action', 'completed', 'egg-exception']);
const RENDERERS = Object.freeze(['Canvas2D', 'CSS fallback', 'WebGPU']);
const MOTION = Object.freeze(['normal', 'reduced']);
const FIGHTER_HUD_PHASES = Object.freeze(['choice', 'sealed', 'revealed', 'action', 'egg-exception']);
const repoRoot = path.resolve(__dirname, '..', '..');
const outputDir = path.join(repoRoot, 'app', 'output', 'playwright', 'streammonsters-bounded-arena');
const fixtureUrl = '/app/test/browser-fixtures/streammonsters-portrait-arena-acceptance.html';
const mimeTypes = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
});

function safePath(url) {
  const pathname = decodeURIComponent(String(url || '/').split('?')[0]);
  const resolved = path.resolve(repoRoot, `.${pathname}`);
  const relative = path.relative(repoRoot, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return resolved;
}

function createServer(requests) {
  return http.createServer((request, response) => {
    requests.push({
      method: request.method,
      path: String(request.url || '').split('?')[0]
    });
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8'
      });
      response.end('Method not allowed');
      return;
    }
    const filePath = safePath(request.url);
    if (
      !filePath ||
      !fs.existsSync(filePath) ||
      fs.statSync(filePath).isDirectory()
    ) {
      response.writeHead(404, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8'
      });
      response.end('Not found');
      return;
    }
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] ||
        'application/octet-stream'
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    fs.createReadStream(filePath).pipe(response);
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    const onError = error => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve(server.address().port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(0, '127.0.0.1');
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.closeAllConnections?.();
    server.close(error => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function portIsClosed(port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const finish = closed => {
      socket.destroy();
      resolve(closed);
    };
    socket.once('connect', () => finish(false));
    socket.once('error', () => finish(true));
    socket.setTimeout(1000, () => finish(true));
  });
}

function prepareOutput() {
  fs.mkdirSync(outputDir, { recursive: true });
  for (const entry of fs.readdirSync(outputDir)) {
    if (entry === 'evidence.json' || entry.endsWith('.png')) {
      fs.unlinkSync(path.join(outputDir, entry));
    }
  }
}

function targetZones(width, height) {
  const project = ({ left, top, right, bottom }) => ({
    left: left * width,
    top: top * height,
    right: right * width,
    bottom: bottom * height,
    width: (right - left) * width,
    height: (bottom - top) * height
  });
  return {
    arena: project({ left: 0.02, top: 0.118, right: 0.98, bottom: 0.578 }),
    likebar: project({ left: 0.02, top: 0.578, right: 0.98, bottom: 0.74 }),
    exception: project({ left: 0.03, top: 0.74, right: 0.97, bottom: 0.98 })
  };
}

function intersects(left, right) {
  return Boolean(left && right) && !(
    left.right <= right.left ||
    right.right <= left.left ||
    left.bottom <= right.top ||
    right.bottom <= left.top
  );
}

function intersectsBeyondTolerance(left, right, tolerance = 1) {
  return Boolean(left && right) && !(
    left.right <= right.left + tolerance ||
    right.right <= left.left + tolerance ||
    left.bottom <= right.top + tolerance ||
    right.bottom <= left.top + tolerance
  );
}

function assertRectNear(actual, expected, tolerance, label) {
  for (const edge of ['left', 'top', 'right', 'bottom']) {
    assert.ok(
      Math.abs(actual[edge] - expected[edge]) <= tolerance,
      `${label} ${edge} expected ${expected[edge]}, received ${actual[edge]}`
    );
  }
}

function assertInside(inner, outer, tolerance, label) {
  assert.ok(
    inner.left >= outer.left - tolerance &&
    inner.top >= outer.top - tolerance &&
    inner.right <= outer.right + tolerance &&
    inner.bottom <= outer.bottom + tolerance,
    `${label} escaped bounds: ${JSON.stringify({ inner, outer })}`
  );
}

function percentValue(value) {
  const parsed = Number.parseFloat(String(value || '').replace('%', ''));
  return Number.isFinite(parsed) ? parsed / 100 : null;
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
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;
    for (let index = 3, pixel = 0; index < pixels.length; index += 4, pixel += 1) {
      if (pixels[index] <= 8) continue;
      alphaPixels += 1;
      const x = pixel % canvas.width;
      const y = Math.floor(pixel / canvas.width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    return {
      width: canvas.width,
      height: canvas.height,
      alphaPixels,
      bounds: alphaPixels ? { minX, minY, maxX, maxY } : null
    };
  }, png.toString('base64'));
}

async function paintedPixelMetrics(page, png) {
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
    const colors = new Map();
    for (let index = 0; index < pixels.length; index += 4) {
      const key = [
        pixels[index],
        pixels[index + 1],
        pixels[index + 2],
        pixels[index + 3]
      ].join(',');
      colors.set(key, (colors.get(key) || 0) + 1);
    }
    const totalPixels = canvas.width * canvas.height;
    const dominantPixels = Math.max(0, ...colors.values());
    return {
      width: canvas.width,
      height: canvas.height,
      totalPixels,
      uniqueColors: colors.size,
      dominantPixels,
      paintedPixels: totalPixels - dominantPixels
    };
  }, png.toString('base64'));
}

async function captureShelfRegionPaint(page, layout) {
  const png = await page.screenshot({
    clip: {
      x: layout.shelf.left,
      y: layout.shelf.top,
      width: layout.shelf.width,
      height: layout.shelf.height
    },
    omitBackground: false
  });
  return paintedPixelMetrics(page, png);
}

async function captureEffectMetrics(page, layout) {
  await page.evaluate(() => window.setArenaEffectCapture(true));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  try {
    const arenaPng = await page.screenshot({
      clip: {
        x: layout.arena.left,
        y: layout.arena.top,
        width: layout.arena.width,
        height: layout.arena.height
      },
      omitBackground: true
    });
    const likebarPng = await page.screenshot({
      clip: {
        x: layout.likebar.left,
        y: layout.likebar.top,
        width: layout.likebar.width,
        height: layout.likebar.height
      },
      omitBackground: true
    });
    const arenaAlpha = await alphaMetrics(page, arenaPng);
    const likebarAlpha = await alphaMetrics(page, likebarPng);
    const viewportBounds = arenaAlpha.bounds ? {
      left: layout.arena.left + arenaAlpha.bounds.minX,
      top: layout.arena.top + arenaAlpha.bounds.minY,
      right: layout.arena.left + arenaAlpha.bounds.maxX + 1,
      bottom: layout.arena.top + arenaAlpha.bounds.maxY + 1
    } : null;
    return {
      alphaPixels: arenaAlpha.alphaPixels,
      bounds: viewportBounds,
      likebarAlphaPixels: likebarAlpha.alphaPixels
    };
  } finally {
    await page.evaluate(() => window.setArenaEffectCapture(false));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  }
}

function validateLayout(row, targets, webgpu) {
  const label = [
    row.variant,
    row.phase,
    row.renderer,
    row.motion,
    `${row.viewport.width}x${row.viewport.height}`
  ].join('/');
  const failures = [];
  const check = assertion => {
    try {
      assertion();
    } catch (error) {
      failures.push(String(error.message || error));
    }
  };
  check(() => assertRectNear(row.arena, targets.arena, 1, `${label} arena`));
  check(() => assertRectNear(
    row.likebar,
    targets.likebar,
    0.001,
    `${label} likebar target`
  ));
  check(() => assertRectNear(
    row.exception,
    targets.exception,
    1,
    `${label} exception`
  ));
  for (const record of row.stageRects) {
    check(() => assertInside(
      record.rect,
      row.arena,
      1,
      `${label} ${record.selector}`
    ));
  }
  for (const record of row.likebarViolations) {
    failures.push(
      `${label} ${record.selector} entered Likebar: ` +
      `${JSON.stringify(record.rect)}`
    );
  }
  for (const record of row.visibleArenaDescendants) {
    if (!intersectsBeyondTolerance(record.rect, row.likebar)) continue;
    failures.push(
      `${label} visible arena descendant ${record.selector} entered Likebar: ` +
      `${JSON.stringify({ rect: record.rect, ancestry: record.ancestry })}`
    );
  }
  for (const intruder of row.exceptionIntruders) {
    failures.push(`${label} exception intruder: ${intruder}`);
  }
  if (row.shelfNoticeOverlap) {
    failures.push(
      `${label} shelf overlaps notice: ` +
      `${JSON.stringify({ shelf: row.shelf, notice: row.notice })}`
    );
  }
  for (const overlap of row.overlaps) {
    failures.push(`${label} information overlap: ${overlap.join(' / ')}`);
  }
  for (const record of row.textGeometry) {
    if (!record.horizontalClipped && !record.verticalClipped) continue;
    const axis = record.horizontalClipped ? 'horizontal' : 'vertical';
    failures.push(
      `${label} ${axis} text clipping ${record.selector} "${record.text}" ` +
      `client=${record.clientWidth}x${record.clientHeight} ` +
      `scroll=${record.scrollWidth}x${record.scrollHeight} ` +
      `range=${JSON.stringify(record.rangeRect)} ` +
      `element=${JSON.stringify(record.elementRect)} ` +
      `clip=${JSON.stringify(record.firstClippingAncestor)} ` +
      `overflow=${record.overflowX}/${record.overflowY} ` +
      `ancestry=${record.ancestry.join(' > ')}`
    );
  }
  if (
    row.viewport.width === 324 &&
    row.viewport.height === 581 &&
    FIGHTER_HUD_PHASES.includes(row.phase)
  ) {
    for (const hud of row.hudContract) {
      if (hud.pass) continue;
      failures.push(
        `${label} HUD ${hud.slot} does not expose name, level, HP row, and ` +
        `nonzero HP bar inside the HUD clip: ${JSON.stringify(hud)}`
      );
    }
  }
  if (row.phase === 'completed') {
    check(() => assert.equal(
      row.completedOwnership.pass,
      true,
      `${label} completed phase retained fighter/HUD ownership or lost its ` +
      `compact result: ${JSON.stringify(row.completedOwnership)}`
    ));
  }

  if (row.phase === 'action') {
    check(() => assert.equal(row.action.visible, true, `${label} action is hidden`));
    check(() => assert.equal(
      row.action.metricCount,
      1,
      `${label} action metric count`
    ));
    check(() => assert.equal(row.action.noWrap, true, `${label} action wraps`));
    check(() => assert.equal(
      row.action.overflow,
      false,
      `${label} action overflows`
    ));
    check(() => assert.equal(
      row.action.gridTemplateRows.trim().split(/\s+/).length,
      1,
      `${label} action is not one grid line`
    ));
  }
  if (row.phase === 'sealed') {
    check(() => assert.equal(
      row.disclosure.earlyDisclosure,
      false,
      `${label} disclosed a sealed key or skill name`
    ));
  }
  if (row.phase === 'revealed') {
    check(() => assert.equal(
      row.disclosure.revealedTogether,
      true,
      `${label} did not reveal both choices together`
    ));
  }
  if (row.motion === 'reduced') {
    check(() => assert.deepEqual(
      row.reducedMotion.runningRepeatedAnimations,
      [],
      `${label} has a running repeated animation`
    ));
    check(() => assert.equal(
      row.reducedMotion.hasTransformDisplacement,
      false,
      `${label} has reduced-motion transform displacement`
    ));
  }

  let rendererStatus = 'passed';
  if (row.renderer === 'WebGPU' && !webgpu.available) {
    check(() => assert.deepEqual(
      row.effect,
      { available: false, status: 'skipped-no-adapter' },
      `${label} reported unavailable WebGPU as a pass`
    ));
    rendererStatus = 'skipped';
  } else {
    check(() => assert.equal(
      row.effect.available,
      true,
      `${label} renderer unavailable`
    ));
    check(() => assert.notEqual(
      row.effect.status,
      'failed-renderer-fallback',
      `${label} WebGPU adapter was available but rendering fell back`
    ));
    if (row.renderer === 'Canvas2D') {
      check(() => assert.equal(
        row.effect.backend,
        'canvas2d',
        `${label} did not run Canvas2D`
      ));
    } else if (row.renderer === 'CSS fallback') {
      check(() => assert.equal(
        row.effect.backend,
        'css',
        `${label} did not run CSS fallback`
      ));
    } else if (row.motion === 'normal') {
      check(() => assert.equal(
        row.effect.backend,
        'webgpu',
        `${label} did not run WebGPU`
      ));
    } else {
      check(() => assert.equal(
        row.effect.status,
        'reduced-motion-fallback',
        `${label} did not record the WebGPU reduced-motion fallback`
      ));
    }
  }

  const origins = row.effect.measuredOrigins;
  const variables = row.effect.cssVariables;
  if (origins?.origin && origins?.targetOrigin && variables) {
    const comparisons = [
      [percentValue(variables.originX), origins.origin.x, 'origin x'],
      [percentValue(variables.originY), origins.origin.y, 'origin y'],
      [percentValue(variables.targetX), origins.targetOrigin.x, 'target x'],
      [percentValue(variables.targetY), origins.targetOrigin.y, 'target y']
    ];
    for (const [actual, expected, name] of comparisons) {
      check(() => assert.ok(
        actual != null && Math.abs(actual - expected) <= 0.03,
        `${label} ${name} mismatch: ${actual} vs ${expected}`
      ));
    }
  }
  return {
    status: failures.length > 0 ? 'failed' : rendererStatus,
    failures
  };
}

function shouldCaptureReference(row) {
  return (
    row.renderer === 'Canvas2D' &&
    row.motion === 'normal'
  );
}

function referenceFilename(row) {
  return [
    row.variant,
    row.phase,
    `${row.viewport.width}x${row.viewport.height}.png`
  ].join('-');
}

function rendererFilename(row) {
  const renderer = {
    Canvas2D: 'canvas',
    'CSS fallback': 'css',
    WebGPU: 'webgpu'
  }[row.renderer];
  return [
    row.variant,
    renderer,
    'effect',
    `${row.viewport.width}x${row.viewport.height}.png`
  ].join('-');
}

async function preparePage(browser, port, viewport, motion) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    reducedMotion: motion === 'reduced' ? 'reduce' : 'no-preference',
    colorScheme: 'dark'
  });
  let page = null;
  try {
    page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}${fixtureUrl}`, {
      waitUntil: 'networkidle'
    });
    await page.waitForFunction(() => window.harnessReady || window.harnessError);
    const harnessError = await page.evaluate(() => window.harnessError || null);
    if (harnessError) throw new Error(harnessError);
    return { context, page };
  } catch (error) {
    await page?.close().catch(() => {});
    await context.close().catch(() => {});
    throw error;
  }
}

async function refreshSmallReferences(browser, port, evidence) {
  const viewport = { width: 324, height: 581 };
  for (const variant of VARIANTS) {
    for (const phase of ['choice', 'action', 'completed']) {
      let context = null;
      let page = null;
      try {
        ({ context, page } = await preparePage(
          browser,
          port,
          viewport,
          'normal'
        ));
        const layout = await page.evaluate(options => window.showArenaCase(options), {
          variant,
          phase,
          renderer: 'Canvas2D',
          sealed: false,
          reducedMotion: false,
          eggNotice: false
        });
        await page.evaluate(() => new Promise(resolve => (
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        )));
        const filename = `${variant}-${phase}-324x581.png`;
        const shelfRegionPaint = await captureShelfRegionPaint(page, layout);
        assert.ok(
          shelfRegionPaint.paintedPixels > 64,
          `${filename} shelf region is not visibly painted`
        );
        await page.screenshot({
          path: path.join(outputDir, filename),
          omitBackground: false
        });
        const capture = evidence.captures.find(item => item.filename === filename);
        if (capture) {
          capture.freshPageReference = true;
          capture.shelfRegionPaint = shelfRegionPaint;
        }
      } finally {
        await page?.close().catch(() => {});
        await context?.close().catch(() => {});
      }
    }
  }
}

async function main() {
  prepareOutput();
  const requests = [];
  const server = createServer(requests);
  const evidence = {
    schemaVersion: 1,
    matrix: {
      viewports: VIEWPORTS.map(([width, height]) => ({ width, height })),
      variants: [...VARIANTS],
      phases: [...PHASES],
      renderers: [...RENDERERS],
      motion: [...MOTION],
      expectedRows: (
        VIEWPORTS.length *
        VARIANTS.length *
        PHASES.length *
        RENDERERS.length *
        MOTION.length
      )
    },
    webgpu: null,
    rows: [],
    captures: [],
    summary: null,
    cleanup: {
      pageClosed: false,
      contextClosed: false,
      browserClosed: false,
      serverClosed: false,
      portClosed: false,
      randomLoopbackPort: false,
      livePort3000Untouched: true
    }
  };
  let port = null;
  let browser = null;
  let failure = null;
  try {
    port = await listen(server);
    assert.notEqual(port, 3000, 'Acceptance server must not reuse live port 3000');
    evidence.cleanup.randomLoopbackPort = true;
    browser = await chromium.launch({
      headless: true,
      args: ['--enable-unsafe-webgpu']
    });

    let webgpuRecorded = false;
    for (const [width, height] of VIEWPORTS) {
      const viewport = { width, height };
      const targets = targetZones(width, height);
      for (const motion of MOTION) {
        let context = null;
        let page = null;
        try {
          ({ context, page } = await preparePage(browser, port, viewport, motion));
          if (!webgpuRecorded) {
            evidence.webgpu = await page.evaluate(() => window.probeArenaWebGpu());
            webgpuRecorded = true;
          }
          for (const variant of VARIANTS) {
            for (const phase of PHASES) {
              for (const renderer of RENDERERS) {
                const layout = await page.evaluate(options => (
                  window.showArenaCase(options)
                ), {
                  variant,
                  phase,
                  renderer,
                  sealed: phase === 'sealed',
                  reducedMotion: motion === 'reduced',
                  eggNotice: phase === 'egg-exception'
                });
                const row = {
                  viewport,
                  variant,
                  phase,
                  renderer,
                  motion,
                  ...layout,
                  effectAlphaBounds: null,
                  shelfRegionPaint: null,
                  screenshot: null,
                  status: null,
                  failures: []
                };
                const validation = validateLayout(row, targets, evidence.webgpu);
                row.status = validation.status;
                row.failures.push(...validation.failures);

                if (phase === 'action' && row.effect.available === true) {
                  try {
                    const alpha = await captureEffectMetrics(page, row);
                    assert.ok(
                      alpha.alphaPixels > 16,
                      `${variant}/${renderer}/${motion}/${width}x${height} effect is blank`
                    );
                    assert.equal(
                      alpha.likebarAlphaPixels,
                      0,
                      `${variant}/${renderer}/${motion}/${width}x${height} effect entered Likebar`
                    );
                    assertInside(
                      alpha.bounds,
                      row.arena,
                      1,
                      `${variant}/${renderer}/${motion}/${width}x${height} effect alpha`
                    );
                    row.effectAlphaBounds = alpha;
                    if (motion === 'normal') {
                      const filename = rendererFilename(row);
                      if (!evidence.captures.some(capture => capture.filename === filename)) {
                        await page.evaluate(() => window.setArenaEffectCapture(true));
                        await page.evaluate(() => new Promise(resolve => (
                          requestAnimationFrame(resolve)
                        )));
                        try {
                          await page.screenshot({
                            path: path.join(outputDir, filename),
                            omitBackground: true
                          });
                        } finally {
                          await page.evaluate(() => window.setArenaEffectCapture(false));
                          await page.evaluate(() => new Promise(resolve => (
                            requestAnimationFrame(resolve)
                          )));
                        }
                        evidence.captures.push({
                          filename,
                          kind: 'renderer-proof',
                          viewport,
                          variant,
                          phase,
                          renderer,
                          motion
                        });
                      }
                    }
                  } catch (error) {
                    row.status = 'failed';
                    row.failures.push(String(error.message || error));
                  }
                }

                if (shouldCaptureReference(row)) {
                  const filename = referenceFilename(row);
                  const shelfRegionPaint = await captureShelfRegionPaint(page, row);
                  assert.ok(
                    shelfRegionPaint.paintedPixels > 64,
                    `${filename} shelf region is not visibly painted`
                  );
                  await page.screenshot({
                    path: path.join(outputDir, filename),
                    omitBackground: false
                  });
                  row.shelfRegionPaint = shelfRegionPaint;
                  row.screenshot = filename;
                  evidence.captures.push({
                    filename,
                    kind: 'reference',
                    viewport,
                    variant,
                    phase,
                    renderer,
                    motion,
                    shelfRegionPaint
                  });
                }
                evidence.rows.push(row);
              }
            }
          }
        } finally {
          await page?.close().catch(() => {});
          evidence.cleanup.pageClosed = true;
          await context?.close().catch(() => {});
          evidence.cleanup.contextClosed = true;
        }
      }
    }

    assert.equal(
      evidence.rows.length,
      evidence.matrix.expectedRows,
      'Browser evidence matrix is incomplete'
    );
    const uniqueDimensions = new Set(evidence.rows.map(row => [
      row.viewport.width,
      row.viewport.height,
      row.variant,
      row.phase,
      row.renderer,
      row.motion
    ].join('|')));
    assert.equal(
      uniqueDimensions.size,
      evidence.matrix.expectedRows,
      'Browser evidence contains duplicate or missing dimensions'
    );
    await refreshSmallReferences(browser, port, evidence);
    assert.ok(
      requests.every(request => (
        ['GET', 'HEAD'].includes(request.method) &&
        !request.path.startsWith('/api/') &&
        !request.path.startsWith('/socket.io/')
      )),
      `Harness made an unauthorized request: ${JSON.stringify(requests)}`
    );
    const failedRows = evidence.rows.filter(row => row.status === 'failed');
    if (failedRows.length > 0) {
      failure = new Error(
        `${failedRows.length} browser acceptance rows failed; see evidence.json`
      );
    }
  } catch (error) {
    failure ||= error;
  } finally {
    if (browser) {
      await browser.close().catch(error => {
        failure ||= error;
      });
      evidence.cleanup.browserClosed = true;
    }
    if (server.listening) {
      await closeServer(server).catch(error => {
        failure ||= error;
      });
    }
    evidence.cleanup.serverClosed = !server.listening;
    if (port != null) {
      evidence.cleanup.portClosed = await portIsClosed(port);
      if (!evidence.cleanup.portClosed) {
        failure ||= new Error('Random loopback acceptance port remained open');
      }
    }
  }

  const passed = evidence.rows.filter(row => row.status === 'passed').length;
  const skipped = evidence.rows.filter(row => row.status === 'skipped').length;
  const rendererSkipped = evidence.rows.filter(row => (
    row.effect?.available === false &&
    row.effect?.status === 'skipped-no-adapter'
  )).length;
  evidence.summary = {
    status: failure ? 'failed' : 'passed',
    rows: evidence.rows.length,
    passed,
    skipped,
    failed: evidence.rows.length - passed - skipped,
    captures: evidence.captures.length,
    rendererRows: {
      canvas2d: evidence.rows.filter(row => (
        row.renderer === 'Canvas2D' &&
        row.effect?.backend === 'canvas2d'
      )).length,
      cssFallback: evidence.rows.filter(row => (
        row.renderer === 'CSS fallback' &&
        row.effect?.backend === 'css'
      )).length,
      webgpu: evidence.rows.filter(row => (
        row.renderer === 'WebGPU' &&
        row.effect?.backend === 'webgpu'
      )).length,
      skippedNoAdapter: rendererSkipped
    }
  };
  if (failure) {
    evidence.failure = String(failure.stack || failure);
  }
  fs.writeFileSync(
    path.join(outputDir, 'evidence.json'),
    `${JSON.stringify(evidence, null, 2)}\n`
  );
  if (failure) throw failure;
  process.stdout.write(
    `Stream Monsters bounded arena browser acceptance: ` +
    `${passed} passed, ${skipped} skipped, ${evidence.rows.length} total; ` +
    `${evidence.captures.length} PNGs; cleanup portClosed=` +
    `${evidence.cleanup.portClosed}\n`
  );
}

main().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
