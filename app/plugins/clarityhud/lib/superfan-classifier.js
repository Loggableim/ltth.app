'use strict';

const SUPER_FAN_JOIN_MARKER = 'ttlive_superfan_commentnotif_superfanjoined';
const SUPER_FAN_MARKER = 'ttlive_superfan';
const SUPER_FAN_BOX_MARKER = 'ttlive_superfanbox';

/**
 * Applies a provisional heuristic to marker-like strings in EulerStream v2
 * WebcastBarrageMessage text fields. This is not a verified provider role
 * contract and must never authorize access or create persistent roles. The
 * result is only a display hint; marker matching can be wrong.
 * Returns only a fixed heuristic label; the input payload is never returned.
 * @param {object} message Decoded WebcastBarrageMessage
 * @returns {'superfan-join'|'superfan'|null}
 */
function classifySuperFanBarrage(message) {
  const displayTypes = [
    message?.content?.displayType,
    message?.commonBarrageContent?.displayType
  ].filter((value) => typeof value === 'string').map((value) => value.toLowerCase());

  if (displayTypes.some((value) => value.includes(SUPER_FAN_JOIN_MARKER))) {
    return 'superfan-join';
  }

  if (displayTypes.some((value) => value.includes(SUPER_FAN_MARKER) && !value.includes(SUPER_FAN_BOX_MARKER))) {
    return 'superfan';
  }

  return null;
}

function getUniqueActor(message) {
  const actors = [];

  for (const text of [message?.content, message?.commonBarrageContent]) {
    if (text === undefined || text === null) continue;
    if (typeof text !== 'object' || Array.isArray(text)) return null;
    if (text.piecesList === undefined) continue;
    if (!Array.isArray(text.piecesList)) return null;

    for (const piece of text.piecesList) {
      if (!piece || typeof piece !== 'object' || Array.isArray(piece)) return null;
      if (piece.userValue === undefined || piece.userValue === null) continue;
      if (typeof piece.userValue !== 'object' || Array.isArray(piece.userValue) ||
          !piece.userValue.user || typeof piece.userValue.user !== 'object' ||
          Array.isArray(piece.userValue.user)) return null;
      actors.push(piece.userValue.user);
      if (actors.length > 1) return null;
    }
  }

  return actors.length === 1 ? actors[0] : null;
}

function parseFanClubLevel(user) {
  const candidates = [];

  if (user.fansClubInfo && typeof user.fansClubInfo === 'object' &&
      Object.prototype.hasOwnProperty.call(user.fansClubInfo, 'fansLevel')) {
    const raw = user.fansClubInfo.fansLevel;
    candidates.push(typeof raw === 'string' && /^(?:0|[1-9]\d{0,2})$/.test(raw) ? Number(raw) : null);
  }

  if (user.fansClub?.data && typeof user.fansClub.data === 'object' &&
      Object.prototype.hasOwnProperty.call(user.fansClub.data, 'level')) {
    const raw = user.fansClub.data.level;
    candidates.push(Number.isInteger(raw) && raw >= 0 && raw <= 999 ? raw : null);
  }

  return candidates.length === 1 ? candidates[0] : null;
}

/**
 * Projects a decoded v2 barrage into the approved display-only shape. The
 * eventType remains heuristic and is not proof of membership or a role.
 * Invalid or ambiguous actors fail closed; invalid optional fields are omitted.
 * @param {object} message Decoded WebcastBarrageMessage
 * @param {(url: string) => string|null} projectAvatarUrl Reviewed avatar allowlist projector
 * @returns {{eventType: string, displayName: string, level?: number, profilePictureUrl?: string}|null}
 */
function projectSuperFanDisplayMessage(message, projectAvatarUrl) {
  const eventType = classifySuperFanBarrage(message);
  if (!eventType) return null;

  const user = getUniqueActor(message);
  if (!user || typeof user.nickname !== 'string' || user.nickname.length > 80 ||
      !user.nickname.trim() || /[\u0000-\u001f\u007f]/.test(user.nickname)) return null;

  const result = { eventType, displayName: user.nickname.trim() };
  const level = parseFanClubLevel(user);
  if (level !== null) result.level = level;

  const avatarUrls = user.profilePicture?.url;
  if (Array.isArray(avatarUrls) && typeof avatarUrls[0] === 'string' &&
      typeof projectAvatarUrl === 'function') {
    const profilePictureUrl = projectAvatarUrl(avatarUrls[0]);
    if (profilePictureUrl) result.profilePictureUrl = profilePictureUrl;
  }

  return result;
}

module.exports = { classifySuperFanBarrage, projectSuperFanDisplayMessage };
