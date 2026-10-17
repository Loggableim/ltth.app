'use strict';

function projectAnonymousOverlayStatus() {
  // No aggregate status fields have been approved for public display. Keep the
  // legacy envelope empty while the public chat/gift feed uses its own DTO.
  return {};
}

function projectPublicOverlayEvent(event = {}) {
  if (!['chat', 'gift'].includes(event.type)) return null;
  const projected = {
    type: event.type,
    ts: Number.isFinite(Number(event.ts)) ? Number(event.ts) : 0,
    nickname: String(event.nickname || 'Viewer').slice(0, 80)
  };
  const payload = event.payload || {};
  if (event.type === 'chat') {
    const comment = String(payload.comment || '');
    projected.payload = {
      comment: comment.slice(0, 30),
      commentTruncated: comment.length > 30
    };
  } else {
    projected.payload = { giftName: String(payload.giftName || 'Gift').slice(0, 80) };
  }
  return projected;
}

module.exports = { projectAnonymousOverlayStatus, projectPublicOverlayEvent };
