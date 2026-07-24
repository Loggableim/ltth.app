function normalizeGiftName(name) {
  return String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function isHeartMeGift(name) {
  return normalizeGiftName(name) === 'heartme';
}

module.exports = {
  normalizeGiftName,
  isHeartMeGift
};
