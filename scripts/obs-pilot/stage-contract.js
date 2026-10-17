'use strict';

const STAGE_ORDER = Object.freeze([
  'status-unavailable',
  'status-recovered',
  'muted',
  'disconnected',
  'reconnected'
]);

const STATUS_KEYS = Object.freeze([
  'connected',
  'muted',
  'chatsPerMinute',
  'totalGifts',
  'totalFollows',
  'activeViewers'
]);

const FIXTURE_COUNTERS = Object.freeze([
  'statusRequests', 'statusFailures', 'statusSuccesses',
  'eventRequests', 'eventSuccesses', 'socketRequests',
  'socketConnections', 'socketDisconnects', 'deniedRequests'
]);

const COMMON_EVENTS = Object.freeze([
  Object.freeze({ nickname: 'Pilot Viewer', icon: '🎁', content: 'Synthetic Rose' }),
  Object.freeze({ nickname: 'Pilot Viewer', icon: '💬', content: 'Synthetic OBS pilot chat' })
]);

const STAGES = Object.freeze([
  Object.freeze({
    name: 'status-unavailable',
    statusOutcome: 'failure',
    socketStatusEvents: Object.freeze([]),
    expectedHUD: Object.freeze({
      dotClass: 'status-dot disconnected',
      dotColor: '#f44336',
      error: Object.freeze({ visible: true, text: 'Sidekick status unavailable' }),
      stats: Object.freeze({ chatsPerMinute: 0, totalGifts: 0, totalFollows: 0, activeViewers: 0 }),
      events: COMMON_EVENTS
    })
  }),
  Object.freeze({
    name: 'status-recovered',
    statusOutcome: 'success',
    socketStatusEvents: Object.freeze([Object.freeze({ connected: true, muted: false, chatsPerMinute: 12, totalGifts: 3, totalFollows: 2, activeViewers: 5 })]),
    expectedHUD: Object.freeze({
      dotClass: 'status-dot',
      dotColor: '#4CAF50',
      error: Object.freeze({ visible: false, text: '' }),
      stats: Object.freeze({ chatsPerMinute: 12, totalGifts: 3, totalFollows: 2, activeViewers: 5 }),
      events: COMMON_EVENTS
    })
  }),
  Object.freeze({
    name: 'muted',
    statusOutcome: 'success',
    socketStatusEvents: Object.freeze([Object.freeze({ connected: true, muted: true, chatsPerMinute: 12, totalGifts: 3, totalFollows: 2, activeViewers: 5 })]),
    expectedHUD: Object.freeze({
      dotClass: 'status-dot muted',
      dotColor: '#ff9800',
      error: Object.freeze({ visible: false, text: '' }),
      stats: Object.freeze({ chatsPerMinute: 12, totalGifts: 3, totalFollows: 2, activeViewers: 5 }),
      events: COMMON_EVENTS
    })
  }),
  Object.freeze({
    name: 'disconnected',
    statusOutcome: 'success',
    socketStatusEvents: Object.freeze([Object.freeze({ connected: false, muted: false, chatsPerMinute: 0, totalGifts: 3, totalFollows: 2, activeViewers: 0 })]),
    expectedHUD: Object.freeze({
      dotClass: 'status-dot disconnected',
      dotColor: '#f44336',
      error: Object.freeze({ visible: false, text: '' }),
      stats: Object.freeze({ chatsPerMinute: 0, totalGifts: 3, totalFollows: 2, activeViewers: 0 }),
      events: COMMON_EVENTS
    })
  }),
  Object.freeze({
    name: 'reconnected',
    statusOutcome: 'success',
    socketStatusEvents: Object.freeze([Object.freeze({ connected: true, muted: false, chatsPerMinute: 8, totalGifts: 4, totalFollows: 3, activeViewers: 6 })]),
    expectedHUD: Object.freeze({
      dotClass: 'status-dot',
      dotColor: '#4CAF50',
      error: Object.freeze({ visible: false, text: '' }),
      stats: Object.freeze({ chatsPerMinute: 8, totalGifts: 4, totalFollows: 3, activeViewers: 6 }),
      events: COMMON_EVENTS
    })
  })
]);

class StageContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'StageContractError';
    this.code = code;
  }
}

function reject(code, message) {
  throw new StageContractError(code, message);
}

function snapshotCounters(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    reject('INVALID_COUNTER_SNAPSHOT', `${label} must be a counter object`);
  }
  const result = {};
  for (const key of FIXTURE_COUNTERS) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) {
      reject('INVALID_COUNTER_SNAPSHOT', `${label}.${key} must be a non-negative safe integer`);
    }
    result[key] = value[key];
  }
  return result;
}

function counterDelta(before, after, label) {
  const delta = {};
  for (const key of FIXTURE_COUNTERS) {
    if (after[key] < before[key]) reject('COUNTER_RESET', `${label}.${key} decreased within a stage`);
    delta[key] = after[key] - before[key];
  }
  return delta;
}

function validateStatusEvents(stage, socketStatusEvents) {
  if (!Array.isArray(socketStatusEvents)) reject('INVALID_SOCKET_STATUS_EVENTS', 'socketStatusEvents must be an array');
  if (socketStatusEvents.length !== stage.socketStatusEvents.length) {
    reject('DUPLICATE_OR_MISSING_SOCKET_STATUS', `${stage.name} received an unexpected number of public status events`);
  }
  for (let index = 0; index < socketStatusEvents.length; index += 1) {
    const event = socketStatusEvents[index];
    const actual = {};
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      reject('INVALID_SOCKET_STATUS_EVENTS', `${stage.name} socket status event ${index} is invalid`);
    }
    for (const key of STATUS_KEYS) actual[key] = event[key];
    if (JSON.stringify(actual) !== JSON.stringify(stage.socketStatusEvents[index])) {
      reject('STALE_OR_UNEXPECTED_SOCKET_STATUS', `${stage.name} received a status payload from another phase or an unexpected state`);
    }
  }
}

function assertActivity(stage, delta) {
  if (delta.statusRequests !== delta.statusFailures + delta.statusSuccesses) {
    reject('UNACCOUNTED_STATUS_REQUEST', `${stage.name} has status requests without matching success/failure outcomes`);
  }
  if (stage.statusOutcome === 'failure') {
    if (delta.statusFailures !== 1 || delta.statusSuccesses !== 0) {
      reject('UNAVAILABLE_STAGE_RECOVERED_OR_DUPLICATED', 'status-unavailable must contain exactly one 503 and no recovery response before review');
    }
  } else if (delta.statusFailures !== 0 || delta.statusSuccesses < 1) {
    reject('STATUS_STAGE_OUTCOME_MISMATCH', `${stage.name} requires successful status and no 503 response`);
  }
  if (delta.eventRequests !== delta.eventSuccesses || delta.eventSuccesses < 1) {
    reject('EVENT_STAGE_OUTCOME_MISMATCH', `${stage.name} requires successful event requests for every event poll`);
  }
}

function assertTotalTransport(stage, delta) {
  if (delta.statusRequests !== delta.statusFailures + delta.statusSuccesses) {
    reject('UNACCOUNTED_STATUS_REQUEST', `${stage.name} has status requests without matching success/failure outcomes`);
  }
  if (stage.statusOutcome === 'failure' && delta.statusFailures !== 1) {
    reject('UNAVAILABLE_STAGE_RECOVERED_OR_DUPLICATED', 'status-unavailable must contain exactly one 503 across its source lifetime');
  }
  if (stage.statusOutcome === 'success' && delta.statusFailures !== 0) {
    reject('STATUS_STAGE_OUTCOME_MISMATCH', `${stage.name} must not contain a 503 response`);
  }
  if (delta.eventRequests !== delta.eventSuccesses) {
    reject('EVENT_STAGE_OUTCOME_MISMATCH', `${stage.name} has event requests without matching successful responses`);
  }
  if (delta.socketConnections !== 1 || delta.socketRequests !== 1) {
    reject('DUPLICATE_OR_MISSING_SOCKET_REQUEST', `${stage.name} requires exactly one new Browser Source connection and public status request`);
  }
  if (delta.socketDisconnects !== 1) {
    reject('SOCKET_CLEANUP_MISMATCH', `${stage.name} must close exactly its own Socket.IO connection before the next stage`);
  }
  if (delta.deniedRequests !== 0) reject('DENIED_REQUEST_SEEN', `${stage.name} made a denied fixture request`);
}

function getStage(stageName) {
  const stage = STAGES.find(candidate => candidate.name === stageName);
  if (!stage) reject('UNKNOWN_STAGE', `Unknown Sidekick pilot stage: ${stageName}`);
  return stage;
}

function createStageContractSequence() {
  let nextStageIndex = 0;
  let previousCleanup = null;

  return Object.freeze({
    verifyStage({ stageName, baseline, activity, cleanup, socketStatusEvents }) {
      const stage = STAGES[nextStageIndex];
      if (!stage || stage.name !== stageName) {
        reject('STAGE_ORDER_MISMATCH', `Expected ${stage?.name || 'no further stage'}, received ${stageName}`);
      }

      const start = snapshotCounters(baseline, 'baseline');
      const active = snapshotCounters(activity, 'activity');
      const end = snapshotCounters(cleanup, 'cleanup');
      if (previousCleanup) {
        if (JSON.stringify(start) !== JSON.stringify(previousCleanup)) {
          reject('STALE_INTERSTAGE_DELTA', `${stageName} baseline contains activity outside the previous stage cleanup`);
        }
      } else if (FIXTURE_COUNTERS.some(key => start[key] !== 0)) {
        reject('STALE_INITIAL_BASELINE', 'The first stage must begin with zero fixture activity');
      }

      if (start.socketConnections !== start.socketDisconnects) {
        reject('STALE_SOCKET_CLIENT', `${stageName} started while an earlier Socket.IO client was still connected`);
      }
      const activityDelta = counterDelta(start, active, `${stageName} activity`);
      const cleanupDelta = counterDelta(active, end, `${stageName} cleanup`);
      const totalDelta = counterDelta(start, end, `${stageName} total`);
      if (activityDelta.socketConnections !== 1 || activityDelta.socketRequests !== 1 || activityDelta.socketDisconnects !== 0) {
        reject('SOCKET_ACTIVITY_MISMATCH', `${stageName} activity must show one live source connection/request and no early disconnect`);
      }
      if (totalDelta.socketConnections !== 1 || totalDelta.socketRequests !== 1 || totalDelta.socketDisconnects !== 1) {
        reject('SOCKET_CLEANUP_MISMATCH', `${stageName} must finish with one request and one paired connect/disconnect`);
      }
      if (end.socketConnections !== end.socketDisconnects) {
        reject('SOCKET_CLEANUP_MISMATCH', `${stageName} cleanup left a Socket.IO client connected`);
      }
      assertActivity(stage, activityDelta);
      assertTotalTransport(stage, totalDelta);
      validateStatusEvents(stage, socketStatusEvents);

      const receipt = Object.freeze({
        stage: stage.name,
        expectedHUD: stage.expectedHUD,
        transport: Object.freeze({
          baseline: start,
          activityDelta,
          cleanupDelta,
          totalDelta,
          statusPolls: Math.max(0, totalDelta.statusSuccesses - (stage.statusOutcome === 'success' ? 1 : 0)),
          eventPolls: Math.max(0, totalDelta.eventSuccesses - 1),
          postActivityStatusResponses: cleanupDelta.statusFailures + cleanupDelta.statusSuccesses,
          postActivityEventResponses: cleanupDelta.eventSuccesses,
          socketStatusEvents: stage.socketStatusEvents.length
        }),
        sourceImageReview: 'pending-independent-source-png-review'
      });
      previousCleanup = end;
      nextStageIndex += 1;
      return receipt;
    },
    finish() {
      if (nextStageIndex !== STAGES.length) {
        reject('INCOMPLETE_STAGE_SEQUENCE', `Only ${nextStageIndex} of ${STAGES.length} pilot stages were verified`);
      }
      return Object.freeze({
        stagesVerified: nextStageIndex,
        sourceImageReview: 'pending-independent-source-png-review'
      });
    }
  });
}

module.exports = {
  FIXTURE_COUNTERS,
  STAGES,
  STAGE_ORDER,
  StageContractError,
  createStageContractSequence,
  getStage
};
