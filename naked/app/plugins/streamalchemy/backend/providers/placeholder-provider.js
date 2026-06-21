const crypto = require('crypto');

class PlaceholderProvider {
  constructor() {
    this.id = 'placeholder';
  }

  async checkStatus() {
    return {
      provider: this.id,
      state: 'ready',
      model: 'deterministic-svg'
    };
  }

  async generate({ prompt, rarity = 'Common' }) {
    const hash = crypto.createHash('sha256').update(`${rarity}:${prompt}`).digest('hex');
    const color = this.colorForRarity(rarity);
    const accent = `#${hash.slice(0, 6)}`;
    const label = String(rarity).replace(/[^\w -]/g, '').slice(0, 16);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768" viewBox="0 0 768 768">
<rect width="768" height="768" fill="transparent"/>
<circle cx="384" cy="384" r="250" fill="${color}" opacity="0.20"/>
<path d="M384 128 L555 299 L494 555 L274 555 L213 299 Z" fill="${accent}" opacity="0.82"/>
<circle cx="384" cy="384" r="112" fill="${color}" opacity="0.92"/>
<text x="384" y="662" font-family="Arial" font-size="42" fill="${color}" text-anchor="middle">${label}</text>
</svg>`;

    return {
      imageUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
      provider: this.id,
      model: 'deterministic-svg'
    };
  }

  colorForRarity(rarity) {
    const colors = {
      Common: '#CD7F32',
      Rare: '#C0C0C0',
      Legendary: '#FFD700',
      Mythic: '#9370DB'
    };
    return colors[rarity] || colors.Common;
  }
}

module.exports = PlaceholderProvider;
