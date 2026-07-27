const { hashNumber } = require('./catalog');

function selectBattleWinner(candidates, state, seed) {
  if (!Array.isArray(candidates) || candidates.length < 1) return null;
  return [...candidates].sort((left, right) => {
    const hp = (state[right.monsterId]?.hp || 0) - (state[left.monsterId]?.hp || 0);
    if (hp) return hp;
    const agility = (Number(right.agility) || 0) - (Number(left.agility) || 0);
    if (agility) return agility;
    const seeded = hashNumber(`${seed}:winner:${left.monsterId}`) -
      hashNumber(`${seed}:winner:${right.monsterId}`);
    if (seeded) return seeded;
    return String(left.monsterId).localeCompare(String(right.monsterId));
  })[0].monsterId;
}

module.exports = {
  selectBattleWinner
};
