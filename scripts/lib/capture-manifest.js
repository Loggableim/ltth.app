'use strict';

const fs = require('fs');

function writeCaptureManifest(manifestPath, manifest, successfulOutputs, writeFileSync = fs.writeFileSync) {
  if (!Array.isArray(successfulOutputs) || successfulOutputs.length === 0) return false;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return true;
}

function outputKey(output) {
  return typeof output?.locale === 'string' && typeof output?.id === 'string'
    ? `${output.locale}:${output.id}`
    : null;
}

function mergePartialCaptureOutputs(existingOutputs, newOutputs) {
  const outputKeys = newOutputs.map(outputKey);
  if (outputKeys.some((key) => key === null)) throw new Error('Partial capture output is missing locale or ID');
  const replacements = new Set(outputKeys);
  if (replacements.size !== outputKeys.length) throw new Error('Partial capture produced duplicate locale/ID outputs');
  return [
    ...(existingOutputs || []).filter((output) => !replacements.has(outputKey(output))),
    ...newOutputs
  ];
}

module.exports = { mergePartialCaptureOutputs, writeCaptureManifest };
