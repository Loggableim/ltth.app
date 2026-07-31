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
  const requestedPath = decodeURIComponent(String(url || '/').split('?')[0]);
  const pathname = requestedPath.startsWith('/plugins/streamalchemy/')
    ? `/app${requestedPath}`
    : requestedPath;
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

async function alphaMetrics(page, png, likebar = null) {
  return page.evaluate(async input => {
    const { base64, likebar } = input;
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
    let likebarAlphaPixels = 0;
    for (let index = 3, pixel = 0; index < pixels.length; index += 4, pixel += 1) {
      if (pixels[index] <= 8) continue;
      alphaPixels += 1;
      const x = pixel % canvas.width;
      const y = Math.floor(pixel / canvas.width);
      if (
        likebar &&
        x >= likebar.left &&
        x < likebar.right &&
        y >= likebar.top &&
        y < likebar.bottom
      ) {
        likebarAlphaPixels += 1;
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    return {
      width: canvas.width,
      height: canvas.height,
      alphaPixels,
      bounds: alphaPixels ? { minX, minY, maxX, maxY } : null,
      likebarAlphaPixels
    };
  }, {
    base64: png.toString('base64'),
    likebar
  });
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
    const viewportPng = await page.screenshot({
      omitBackground: true
    });
    const viewportAlpha = await alphaMetrics(
      page,
      viewportPng,
      layout.likebar
    );
    const viewportBounds = viewportAlpha.bounds ? {
      left: viewportAlpha.bounds.minX,
      top: viewportAlpha.bounds.minY,
      right: viewportAlpha.bounds.maxX + 1,
      bottom: viewportAlpha.bounds.maxY + 1
    } : null;
    return {
      viewport: {
        width: viewportAlpha.width,
        height: viewportAlpha.height
      },
      alphaPixels: viewportAlpha.alphaPixels,
      bounds: viewportBounds,
      likebarAlphaPixels: viewportAlpha.likebarAlphaPixels
    };
  } finally {
    await page.evaluate(() => window.setArenaEffectCapture(false));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  }
}

function canonicalNumber(value) {
  return Number.isFinite(Number(value))
    ? Math.round(Number(value) * 64) / 64
    : null;
}

function canonicalRect(rect) {
  if (!rect) return null;
  return Object.fromEntries(
    ['left', 'top', 'right', 'bottom', 'width', 'height']
      .map(key => [key, canonicalNumber(rect[key])])
  );
}

function relativeRect(rect, origin) {
  if (!rect || !origin) return null;
  return {
    left: canonicalNumber(rect.left - origin.left),
    top: canonicalNumber(rect.top - origin.top),
    right: canonicalNumber(rect.right - origin.left),
    bottom: canonicalNumber(rect.bottom - origin.top),
    width: canonicalNumber(rect.width),
    height: canonicalNumber(rect.height)
  };
}

function textInkProbeKey(record) {
  return JSON.stringify({
    selector: record.selector,
    ancestry: record.ancestry,
    text: record.text,
    textStyle: record.textStyle,
    client: [
      record.clientWidth,
      record.clientHeight
    ],
    rangeRect: relativeRect(record.rangeRect, record.elementRect),
    elementRect: {
      width: canonicalNumber(record.elementRect?.width),
      height: canonicalNumber(record.elementRect?.height)
    },
    clipping: (record.partialExtensionAncestors || []).map(ancestor => ({
      selector: ancestor.selector,
      rect: relativeRect(ancestor.rect, record.elementRect),
      clipX: ancestor.clipX,
      clipY: ancestor.clipY,
      overflowX: ancestor.overflowX,
      overflowY: ancestor.overflowY
    }))
  });
}

function maximumRectShift(left, right) {
  if (!left || !right) return Number.POSITIVE_INFINITY;
  return Math.max(...['left', 'top', 'right', 'bottom'].map(edge => (
    Math.abs(Number(left[edge]) - Number(right[edge]))
  )));
}

async function compareAlphaMasks(
  page,
  clippedPng,
  unclippedPng,
  capture,
  clipRecords
) {
  return page.evaluate(async input => {
    const decode = async base64 => {
      const binary = atob(base64);
      const bytes = Uint8Array.from(
        binary,
        character => character.charCodeAt(0)
      );
      const bitmap = await createImageBitmap(
        new Blob([bytes], { type: 'image/png' })
      );
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0);
      return {
        width: canvas.width,
        height: canvas.height,
        pixels: context.getImageData(0, 0, canvas.width, canvas.height).data
      };
    };
    const boundsRecord = (bounds, count) => count ? bounds : null;
    const extendBounds = (bounds, x, y) => ({
      minX: Math.min(bounds.minX, x),
      minY: Math.min(bounds.minY, y),
      maxX: Math.max(bounds.maxX, x),
      maxY: Math.max(bounds.maxY, y)
    });
    const clipped = await decode(input.clippedBase64);
    const unclipped = await decode(input.unclippedBase64);
    if (
      clipped.width !== unclipped.width ||
      clipped.height !== unclipped.height
    ) {
      throw new Error(
        `Rendered-ink mask dimensions differ: ` +
        `${clipped.width}x${clipped.height} vs ` +
        `${unclipped.width}x${unclipped.height}`
      );
    }
    const alphaThreshold = 8;
    const edgeTolerance = 1;
    let clippedAlphaPixels = 0;
    let unclippedAlphaPixels = 0;
    let missingAlphaPixels = 0;
    let missingOutsideGuardPixels = 0;
    let missingOutsideXGuardPixels = 0;
    let missingOutsideYGuardPixels = 0;
    let unclippedOutsideGuardPixels = 0;
    let clippedBounds = {
      minX: clipped.width,
      minY: clipped.height,
      maxX: -1,
      maxY: -1
    };
    let unclippedBounds = { ...clippedBounds };
    let missingOutsideBounds = { ...clippedBounds };
    for (
      let index = 3, pixel = 0;
      index < clipped.pixels.length;
      index += 4, pixel += 1
    ) {
      const x = pixel % clipped.width;
      const y = Math.floor(pixel / clipped.width);
      const globalX = input.capture.x + x + 0.5;
      const globalY = input.capture.y + y + 0.5;
      const clippedPainted = clipped.pixels[index] > alphaThreshold;
      const unclippedPainted = unclipped.pixels[index] > alphaThreshold;
      const outsideXGuard = input.clipRecords.some(clip => (
        clip.clipX && (
          globalX < clip.rect.left - edgeTolerance ||
          globalX > clip.rect.right + edgeTolerance
        )
      ));
      const outsideYGuard = input.clipRecords.some(clip => (
        clip.clipY && (
          globalY < clip.rect.top - edgeTolerance ||
          globalY > clip.rect.bottom + edgeTolerance
        )
      ));
      const outsideGuard = outsideXGuard || outsideYGuard;
      if (clippedPainted) {
        clippedAlphaPixels += 1;
        clippedBounds = extendBounds(clippedBounds, x, y);
      }
      if (unclippedPainted) {
        unclippedAlphaPixels += 1;
        unclippedBounds = extendBounds(unclippedBounds, x, y);
        if (outsideGuard) unclippedOutsideGuardPixels += 1;
      }
      if (unclippedPainted && !clippedPainted) {
        missingAlphaPixels += 1;
        if (outsideGuard) {
          missingOutsideGuardPixels += 1;
          if (outsideXGuard) missingOutsideXGuardPixels += 1;
          if (outsideYGuard) missingOutsideYGuardPixels += 1;
          missingOutsideBounds = extendBounds(missingOutsideBounds, x, y);
        }
      }
    }
    const missingAlphaRatio = unclippedAlphaPixels > 0
      ? missingAlphaPixels / unclippedAlphaPixels
      : 1;
    return {
      alphaThreshold,
      edgeTolerance,
      maskDifferenceToleranceRatio: 0.05,
      clippedAlphaPixels,
      unclippedAlphaPixels,
      missingAlphaPixels,
      missingAlphaRatio,
      missingOutsideGuardPixels,
      missingOutsideXGuardPixels,
      missingOutsideYGuardPixels,
      unclippedOutsideGuardPixels,
      clippedBounds: boundsRecord(clippedBounds, clippedAlphaPixels),
      unclippedBounds: boundsRecord(unclippedBounds, unclippedAlphaPixels),
      missingOutsideBounds: boundsRecord(
        missingOutsideBounds,
        missingOutsideGuardPixels
      )
    };
  }, {
    clippedBase64: clippedPng.toString('base64'),
    unclippedBase64: unclippedPng.toString('base64'),
    capture,
    clipRecords
  });
}

async function captureTextInkProbe(page, record) {
  let prepared = null;
  let result = null;
  let restoreError = null;
  try {
    prepared = await page.evaluate(probeId => (
      window.prepareTextInkProbe(probeId)
    ), record.inkProbeId);
    const clippedPng = await page.screenshot({
      clip: prepared.capture,
      omitBackground: true
    });
    const unclipped = await page.evaluate(() => window.unclipTextInkProbe());
    const unclippedPng = await page.screenshot({
      clip: prepared.capture,
      omitBackground: true
    });
    const comparison = await compareAlphaMasks(
      page,
      clippedPng,
      unclippedPng,
      prepared.capture,
      prepared.clipRecords
    );
    const viewportBounds = bounds => bounds ? {
      left: prepared.capture.x + bounds.minX,
      top: prepared.capture.y + bounds.minY,
      right: prepared.capture.x + bounds.maxX + 1,
      bottom: prepared.capture.y + bounds.maxY + 1
    } : null;
    const geometryShift = maximumRectShift(
      prepared.rangeRect,
      unclipped.unclippedRangeRect
    );
    const valid = (
      comparison.clippedAlphaPixels > 0 &&
      comparison.unclippedAlphaPixels > 0 &&
      geometryShift <= 0.25
    );
    const clipped = (
      comparison.missingOutsideGuardPixels > 0 ||
      comparison.missingAlphaRatio >
        comparison.maskDifferenceToleranceRatio
    );
    result = {
      status: !valid
        ? 'invalid'
        : (clipped ? 'clipped' : 'passed'),
      pass: valid && !clipped,
      alphaThreshold: comparison.alphaThreshold,
      edgeTolerance: comparison.edgeTolerance,
      maskDifferenceToleranceRatio:
        comparison.maskDifferenceToleranceRatio,
      rangeShiftTolerance: 0.25,
      clippedAlphaPixels: comparison.clippedAlphaPixels,
      unclippedAlphaPixels: comparison.unclippedAlphaPixels,
      missingAlphaPixels: comparison.missingAlphaPixels,
      missingAlphaRatio: comparison.missingAlphaRatio,
      missingOutsideGuardPixels: comparison.missingOutsideGuardPixels,
      missingOutsideXGuardPixels:
        comparison.missingOutsideXGuardPixels,
      missingOutsideYGuardPixels:
        comparison.missingOutsideYGuardPixels,
      unclippedOutsideGuardPixels:
        comparison.unclippedOutsideGuardPixels,
      clippedBounds: viewportBounds(comparison.clippedBounds),
      unclippedBounds: viewportBounds(comparison.unclippedBounds),
      missingOutsideBounds: viewportBounds(comparison.missingOutsideBounds),
      capture: prepared.capture,
      rangeRect: prepared.rangeRect,
      unclippedRangeRect: unclipped.unclippedRangeRect,
      geometryShift,
      clipRecords: prepared.clipRecords,
      unclippedClipRecords: unclipped.unclippedClipRecords
    };
  } catch (error) {
    result = {
      status: 'invalid',
      pass: false,
      error: String(error.stack || error)
    };
  } finally {
    if (prepared) {
      try {
        const restored = await page.evaluate(() => window.restoreTextInkProbe());
        if (!restored?.restored) {
          throw new Error('Rendered-ink probe did not restore');
        }
        if (!restored.stateMatches) {
          throw new Error(
            'Rendered-ink probe changed computed display/visibility state: ' +
            JSON.stringify(restored.stateDifferences)
          );
        }
        result = {
          ...result,
          restoreStateMatches: restored.stateMatches,
          restoreStateDifferences: restored.stateDifferences
        };
      } catch (error) {
        restoreError = error;
      }
    }
  }
  if (restoreError) {
    result = {
      ...result,
      status: 'invalid',
      pass: false,
      restoreError: String(restoreError.stack || restoreError)
    };
  }
  return result;
}

async function attachTextInkProbes(page, row, inkProbeCache, evidence) {
  for (const record of row.textGeometry) {
    if (!record.partialExtensionAncestor) continue;
    evidence.textInkProbeSummary.candidateRecords += 1;
    const key = textInkProbeKey(record);
    let probe = inkProbeCache.get(key);
    if (!probe) {
      probe = await captureTextInkProbe(page, record);
      probe = {
        key,
        representative: {
          viewport: row.viewport,
          variant: row.variant,
          phase: row.phase,
          renderer: row.renderer,
          motion: row.motion,
          selector: record.selector,
          ancestry: record.ancestry,
          text: record.text
        },
        ...probe
      };
      inkProbeCache.set(key, probe);
      evidence.inkProbes.push(probe);
      evidence.textInkProbeSummary.executed += 1;
    } else {
      evidence.textInkProbeSummary.reused += 1;
    }
    record.inkProbeKey = key;
    record.inkProbe = probe;
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
    if (record.horizontalClipped || record.verticalClipped) {
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
    if (record.partialExtensionAncestor && !record.inkProbe?.pass) {
      failures.push(
        `${label} rendered ink clipping ${record.selector} "${record.text}": ` +
        `${JSON.stringify(record.inkProbe || {
          status: 'missing',
          clip: record.partialExtensionAncestor
        })}`
      );
    }
  }
  if (!row.toplineContract.pass) {
    failures.push(
      `${label} topline text ranges overlap: ` +
      `${JSON.stringify(row.toplineContract.overlaps)}`
    );
  }
  if (!row.countdownContract.pass) {
    failures.push(
      `${label} countdown paint does not match its production text: ` +
      `${JSON.stringify(row.countdownContract)}`
    );
  }
  check(() => assert.equal(
    row.leadContract.painted,
    false,
    `${label} redundant portrait lead is painted: ` +
    `${JSON.stringify(row.leadContract)}`
  ));
  if (!row.impactContract.pass) {
    failures.push(
      `${label} stale transient impact outside action: ` +
      `${JSON.stringify(row.impactContract)}`
    );
  }
  if (FIGHTER_HUD_PHASES.includes(row.phase)) {
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
    const expectedActionParts = ['key', 'skill', 'compactMetric'];
    check(() => assert.equal(row.action.visible, true, `${label} action is hidden`));
    check(() => assert.deepEqual(
      row.action.paintedParts,
      expectedActionParts,
      `${label} action painted parts are not exact`
    ));
    check(() => assert.deepEqual(
      row.action.separators,
      ['\u00b7', '\u00b7'],
      `${label} action separators are not painted by production CSS`
    ));
    check(() => assert.equal(
      row.action.renderedText,
      'C · NOVA · −7 HP',
      `${label} action text is not the exact compact production copy`
    ));
    check(() => assert.deepEqual(
      row.action.hiddenCompetitors,
      {
        actor: true,
        copy: true,
        legacyMetrics: true,
        feed: true,
        extraMetrics: true
      },
      `${label} competing action copy or metrics are painted`
    ));
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
    check(() => assert.equal(
      row.action.targetHp.changed,
      true,
      `${label} production action did not change target HP`
    ));
    check(() => assert.deepEqual(
      row.action.targetHp,
      {
        before: 27,
        expected: 20,
        rendered: 20,
        text: '20 / 36',
        changed: true
      },
      `${label} production action target HP is not the expected 27 to 20`
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

function serializeCleanupError(error, resource, scope) {
  return {
    resource,
    scope,
    name: String(error?.name || 'Error'),
    message: String(error?.message || error),
    stack: String(error?.stack || error)
  };
}

function updateCloseFlags(evidence) {
  for (const resource of ['page', 'context']) {
    const stats = evidence.cleanup[resource];
    evidence.cleanup[`${resource}Closed`] = (
      stats.created > 0 &&
      stats.created === stats.closeResolved &&
      stats.failed === 0
    );
  }
}

async function closeTrackedResource(resource, resourceName, scope, evidence) {
  if (!resource) return null;
  const stats = evidence.cleanup[resourceName];
  stats.attempted += 1;
  try {
    await resource.close();
    stats.closeResolved += 1;
    updateCloseFlags(evidence);
    return null;
  } catch (error) {
    stats.failed += 1;
    evidence.cleanup.errors.push(
      serializeCleanupError(error, resourceName, scope)
    );
    updateCloseFlags(evidence);
    return error;
  }
}

async function closeTrackedPageContext(page, context, scope, evidence) {
  const errors = [];
  const pageError = await closeTrackedResource(page, 'page', scope, evidence);
  if (pageError) errors.push(pageError);
  const contextError = await closeTrackedResource(
    context,
    'context',
    scope,
    evidence
  );
  if (contextError) errors.push(contextError);
  return errors;
}

async function preparePage(browser, port, viewport, motion, evidence, scope) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    reducedMotion: motion === 'reduced' ? 'reduce' : 'no-preference',
    colorScheme: 'dark'
  });
  evidence.cleanup.context.created += 1;
  let page = null;
  try {
    page = await context.newPage();
    evidence.cleanup.page.created += 1;
    await page.goto(`http://127.0.0.1:${port}${fixtureUrl}`, {
      waitUntil: 'networkidle'
    });
    await page.waitForFunction(() => window.harnessReady || window.harnessError);
    const harnessError = await page.evaluate(() => window.harnessError || null);
    if (harnessError) throw new Error(harnessError);
    return { context, page };
  } catch (error) {
    const cleanupErrors = await closeTrackedPageContext(
      page,
      context,
      `${scope}/prepare`,
      evidence
    );
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [error, ...cleanupErrors],
        `Page preparation and cleanup failed for ${scope}`
      );
    }
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
          'normal',
          evidence,
          `fresh-reference/${variant}/${phase}`
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
        const cleanupErrors = await closeTrackedPageContext(
          page,
          context,
          `fresh-reference/${variant}/${phase}`,
          evidence
        );
        if (cleanupErrors.length > 0) {
          throw new AggregateError(
            cleanupErrors,
            `Fresh-reference cleanup failed for ${variant}/${phase}`
          );
        }
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
    inkProbes: [],
    textInkProbeSummary: {
      candidateRecords: 0,
      executed: 0,
      reused: 0,
      passed: 0,
      clipped: 0,
      invalid: 0
    },
    summary: null,
    cleanup: {
      pageClosed: false,
      contextClosed: false,
      browserClosed: false,
      serverClosed: false,
      portClosed: false,
      randomLoopbackPort: false,
      livePort3000Untouched: true,
      page: {
        created: 0,
        attempted: 0,
        closeResolved: 0,
        failed: 0
      },
      context: {
        created: 0,
        attempted: 0,
        closeResolved: 0,
        failed: 0
      },
      errors: []
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

    const inkProbeCache = new Map();
    let webgpuRecorded = false;
    for (const [width, height] of VIEWPORTS) {
      const viewport = { width, height };
      const targets = targetZones(width, height);
      for (const motion of MOTION) {
        let context = null;
        let page = null;
        try {
          ({ context, page } = await preparePage(
            browser,
            port,
            viewport,
            motion,
            evidence,
            `matrix/${width}x${height}/${motion}`
          ));
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
                let effectFailure = null;
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
                    effectFailure = String(error.message || error);
                  }
                }
                await attachTextInkProbes(
                  page,
                  row,
                  inkProbeCache,
                  evidence
                );
                const validation = validateLayout(row, targets, evidence.webgpu);
                row.status = validation.status;
                row.failures.push(...validation.failures);
                if (effectFailure) {
                  row.status = 'failed';
                  row.failures.push(effectFailure);
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
          const cleanupErrors = await closeTrackedPageContext(
            page,
            context,
            `matrix/${width}x${height}/${motion}`,
            evidence
          );
          if (cleanupErrors.length > 0) {
            throw new AggregateError(
              cleanupErrors,
              `Matrix cleanup failed for ${width}x${height}/${motion}`
            );
          }
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
    evidence.textInkProbeSummary.passed = evidence.inkProbes.filter(
      probe => probe.status === 'passed'
    ).length;
    evidence.textInkProbeSummary.clipped = evidence.inkProbes.filter(
      probe => probe.status === 'clipped'
    ).length;
    evidence.textInkProbeSummary.invalid = evidence.inkProbes.filter(
      probe => probe.status === 'invalid'
    ).length;
    assert.equal(
      evidence.textInkProbeSummary.executed,
      evidence.inkProbes.length,
      'Rendered-ink evidence contains duplicate or missing executions'
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
      try {
        await browser.close();
        evidence.cleanup.browserClosed = true;
      } catch (error) {
        evidence.cleanup.errors.push(
          serializeCleanupError(error, 'browser', 'final')
        );
        failure ||= error;
      }
    }
    if (server.listening) {
      try {
        await closeServer(server);
      } catch (error) {
        evidence.cleanup.errors.push(
          serializeCleanupError(error, 'server', 'final')
        );
        failure ||= error;
      }
    }
    evidence.cleanup.serverClosed = !server.listening;
    if (port != null) {
      evidence.cleanup.portClosed = await portIsClosed(port);
      if (!evidence.cleanup.portClosed) {
        failure ||= new Error('Random loopback acceptance port remained open');
      }
    }
    updateCloseFlags(evidence);
    if (
      evidence.cleanup.page.created > 0 &&
      !evidence.cleanup.pageClosed
    ) {
      failure ||= new Error('One or more acceptance pages did not close cleanly');
    }
    if (
      evidence.cleanup.context.created > 0 &&
      !evidence.cleanup.contextClosed
    ) {
      failure ||= new Error('One or more acceptance contexts did not close cleanly');
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
