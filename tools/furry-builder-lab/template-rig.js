'use strict';

const FRAME_COLUMNS = Object.freeze({
  rest: 0,
  small: 1,
  wide: 2,
  round: 3,
  teeth: 4
});

function normalizedDestination(rect, canvas) {
  const [x, y, width, height] = rect;

  return {
    x: x * canvas.width,
    y: y * canvas.height,
    width: width * canvas.width,
    height: height * canvas.height
  };
}

function mouthDestination(template, canvas) {
  return normalizedDestination(template.mouthRect, canvas);
}

function findTemplate(manifest, templateId) {
  const template = manifest.templates.find((candidate) => candidate.id === templateId);

  if (!template) {
    throw new Error(`Unknown face template: ${templateId}`);
  }

  return template;
}

function resolveTemplatePlan(manifest, templateId, mouthFrame) {
  if (!Object.hasOwn(FRAME_COLUMNS, mouthFrame)) {
    throw new Error(`Unknown mouth frame: ${mouthFrame}`);
  }

  const template = findTemplate(manifest, templateId);
  const { canvas, atlasIds } = manifest;
  const mouthColumns = manifest.atlases[atlasIds.mouth].columns;

  return {
    template,
    operations: [
      {
        layer: 'head',
        atlasId: atlasIds.head,
        cell: template.headCell,
        destination: { x: 0, y: 0, width: canvas.width, height: canvas.height }
      },
      {
        layer: 'eyes',
        atlasId: atlasIds.eyes,
        cell: template.eyesCell,
        destination: normalizedDestination(template.eyesRect, canvas)
      },
      {
        layer: 'mouth',
        atlasId: atlasIds.mouth,
        cell: (template.mouthRow * mouthColumns) + FRAME_COLUMNS[mouthFrame],
        destination: mouthDestination(template, canvas)
      }
    ]
  };
}

module.exports = {
  FRAME_COLUMNS,
  mouthDestination,
  resolveTemplatePlan
};
