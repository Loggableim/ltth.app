const { createHash, randomUUID } = require('crypto');

const PROVIDER_EVENT_ID_KEYS = Object.freeze([
  'eventId',
  'event_id',
  'msgId',
  'msg_id',
  'logId',
  'log_id'
]);
const RAW_TIMESTAMP_KEYS = Object.freeze([
  'timestamp',
  'createTime',
  'create_time'
]);

function firstPresent(source, keys) {
  if (!source || typeof source !== 'object') return null;
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function normalizeIngressEventId({
  namespace = 'ingress',
  context = {},
  rawData = context.rawData || {},
  fingerprint = {},
  nowMs = Date.now(),
  nonce = randomUUID
} = {}) {
  const normalizedNamespace = String(namespace || 'ingress').trim() || 'ingress';
  const provider = String(
    rawData.provider ||
    rawData.source ||
    context.provider ||
    context.source ||
    context.transport ||
    'tiktok'
  );
  const providerEventId = firstPresent(rawData, PROVIDER_EVENT_ID_KEYS);
  if (providerEventId !== null) {
    return `${normalizedNamespace}:${provider}:${String(providerEventId)}`;
  }

  const rawTimestamp = firstPresent(rawData, RAW_TIMESTAMP_KEYS);
  const contextTimestamp = rawTimestamp === null
    ? firstPresent(context, ['timestamp'])
    : null;
  const timestamp = rawTimestamp ?? contextTimestamp;
  if (timestamp !== null) {
    const digest = createHash('sha256')
      .update(JSON.stringify({
        version: 1,
        namespace: normalizedNamespace,
        provider,
        timestamp,
        fingerprint
      }))
      .digest('hex');
    return `${normalizedNamespace}:${provider}:time:${digest}`;
  }

  const currentTime = Number.isFinite(Number(nowMs))
    ? Math.trunc(Number(nowMs))
    : Date.now();
  const ingressNonce = typeof nonce === 'function' ? nonce() : nonce;
  return `${normalizedNamespace}:ingress:${currentTime}:${String(ingressNonce || randomUUID())}`;
}

module.exports = {
  normalizeIngressEventId
};
