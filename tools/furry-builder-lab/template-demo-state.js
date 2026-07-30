'use strict';

function createDemoState(templateId, mouthFrame) {
  return {
    templateId,
    mouthFrame,
    audioLevel: 0,
    rotating: false
  };
}

function rotateTemplate(state, templateIds, direction) {
  if (direction !== 1 && direction !== -1) {
    throw new Error('Rotation direction must be 1 or -1');
  }

  const activeIndex = templateIds.indexOf(state.templateId);
  if (activeIndex === -1) {
    throw new Error(`Active template is not in the template catalog: ${state.templateId}`);
  }

  const nextIndex = (activeIndex + direction + templateIds.length) % templateIds.length;

  return {
    ...state,
    templateId: templateIds[nextIndex]
  };
}

module.exports = {
  createDemoState,
  rotateTemplate
};
