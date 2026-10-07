'use strict';

function uniqueIds(ids) {
  return Array.isArray(ids) && ids.every(id => typeof id === 'string' && id.length > 0) && new Set(ids).size === ids.length;
}

function sameIds(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((id, index) => id === right[index]);
}

function validateClarityHudLongfeedWindow(input) {
  const errors = [];
  const {
    dock,
    postedCount,
    expectedPostedCount = 220,
    queueLimit = 225,
    previousQueueIds,
    expectedBackendQueueIds,
    backendQueueIds,
    rendererStateIds,
    domCount,
    visibleDomIds,
    mode
  } = input;

  if (dock !== 'chat' && dock !== 'multi') errors.push('invalid-dock');
  if (postedCount !== expectedPostedCount) errors.push('posted-count-mismatch');
  if (!uniqueIds(previousQueueIds)) errors.push('invalid-previous-queue-ids');
  if (!uniqueIds(backendQueueIds)) errors.push('invalid-backend-queue-ids');
  if (!uniqueIds(rendererStateIds)) errors.push('invalid-renderer-state-ids');
  if (Array.isArray(backendQueueIds) && backendQueueIds.length > queueLimit) errors.push('queue-exceeds-limit');

  if (expectedBackendQueueIds !== undefined &&
      (!uniqueIds(expectedBackendQueueIds) || !uniqueIds(backendQueueIds) || !sameIds(expectedBackendQueueIds, backendQueueIds))) {
    errors.push('backend-queue-order-mismatch');
  }

  if (uniqueIds(backendQueueIds) && uniqueIds(rendererStateIds) && !sameIds(backendQueueIds, rendererStateIds)) {
    errors.push('renderer-state-order-does-not-match-queue');
  }

  if (uniqueIds(previousQueueIds) && uniqueIds(backendQueueIds)) {
    const previousSet = new Set(previousQueueIds);
    const newIds = backendQueueIds.filter(id => !previousSet.has(id));
    if (newIds.length !== 1) errors.push('expected-one-new-reconnect-event');
    else if (backendQueueIds[0] !== newIds[0]) errors.push('new-reconnect-event-not-newest');
  }

  if (!Number.isInteger(domCount) || domCount < 0) {
    errors.push('invalid-dom-count');
  } else if (dock === 'multi') {
    const expectedVisibleCount = Math.min(Array.isArray(backendQueueIds) ? backendQueueIds.length : 0, 100);
    if (domCount !== expectedVisibleCount) errors.push('multi-visible-window-count-mismatch');
  } else if (dock === 'chat' && mode === 'virtual') {
    if (domCount < 1 || domCount > 100 || domCount >= (rendererStateIds?.length || 0)) {
      errors.push('chat-virtual-window-count-invalid');
    }
    if (!uniqueIds(visibleDomIds) ||
        (Array.isArray(visibleDomIds) && !visibleDomIds.every(id => rendererStateIds.includes(id)))) {
      errors.push('chat-virtual-window-ids-invalid');
    }
  } else if (dock === 'chat' && mode === 'nonvirtual') {
    if (domCount !== backendQueueIds?.length) errors.push('chat-nonvirtual-window-count-mismatch');
    if (!uniqueIds(visibleDomIds) || !sameIds(visibleDomIds, backendQueueIds)) errors.push('chat-nonvirtual-window-ids-mismatch');
  } else if (dock === 'chat') {
    errors.push('invalid-chat-render-mode');
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateClarityHudLongfeedWindow };
