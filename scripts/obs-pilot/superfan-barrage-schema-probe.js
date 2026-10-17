'use strict';

// Isolated event-classification candidate. No role cache or provider connection.
const assert = require('node:assert/strict');
const schema = require('../../app/node_modules/@eulerstream/euler-websocket-sdk/dist/webcast/schemas/tiktok-schema-v2');

function classifyBarrage(data) {
  const texts = [data.content, data.commonBarrageContent].filter(Boolean);
  const markers = texts.map(text => text.displayType).filter(value => typeof value === 'string').map(value => value.toLowerCase());
  let kind = null;
  if (markers.some(value => value.includes('ttlive_superfan_commentnotif_superfanjoined'))) kind = 'join';
  else if (markers.some(value => value.includes('ttlive_superfan') && !value.includes('ttlive_superfanbox'))) kind = 'became';
  if (!kind) return null;
  const users = texts.flatMap(text => text.piecesList || []).map(piece => piece.userValue && piece.userValue.user).filter(Boolean);
  const byId = new Map(users.filter(user => user.userId && user.userId !== '0').map(user => [user.userId, user]));
  if (byId.size !== 1) return { kind, actor: null, blocker: 'missing-or-ambiguous-user-pieces' };
  return { kind, actor: [...byId.values()][0] };
}

function run() {
  const user = { ...schema.UserDecoder.decode(new Uint8Array()), userId: '123', nickname: 'Synthetic viewer', uniqueId: 'fixture' };
  const make = (marker, field = 'content', users = [user]) => {
    const data = { ...schema.WebcastBarrageMessageDecoder.decode(new Uint8Array()), [field]: { ...schema.TextDecoder.decode(new Uint8Array()), displayType: marker, piecesList: users.map(value => ({ ...schema.Text_TextPieceDecoder.decode(new Uint8Array()), type: 11, userValue: { user: { ...user, ...value }, withColon: false } })) } };
    return schema.WebcastBarrageMessageDecoder.decode(schema.WebcastBarrageMessageDecoder.encode(data).finish());
  };
  for (const field of ['content', 'commonBarrageContent']) {
    assert.equal(classifyBarrage(make('ttlive_superfan_commentnotif_superfanjoined', field)).kind, 'join');
    assert.equal(classifyBarrage(make('ttlive_superfan', field)).actor.userId, '123');
  }
  for (const marker of ['normal', 'fans_level_upgrade', 'subscribe', 'ttlive_superfanbox']) assert.equal(classifyBarrage(make(marker)), null);
  assert.equal(classifyBarrage(make('ttlive_superfan', 'content', [])).actor, null);
  assert.equal(classifyBarrage(make('ttlive_superfan', 'content', [user, { userId: '456' }])).actor, null);
  // Box classification belongs to Envelope, never feed its businessType into Barrage classification.
  assert.equal(classifyBarrage({ envelopeInfo: { businessType: 19 } }), null);
  console.log('PASS: SDK 0.0.6 V2 encode/decode, two marker paths, join/generic and negative/ambiguous actor boundaries. No adapter integration or provider-role proof.');
}

if (require.main === module) run();
module.exports = { classifyBarrage };

