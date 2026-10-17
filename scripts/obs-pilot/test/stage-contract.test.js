'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  FIXTURE_COUNTERS,
  STAGES,
  STAGE_ORDER,
  StageContractError,
  createStageContractSequence
} = require('../stage-contract');

function counters(overrides = {}) {
  return Object.fromEntries(FIXTURE_COUNTERS.map(key => [key, overrides[key] || 0]));
}

function addCounters(base, delta) {
  return Object.fromEntries(FIXTURE_COUNTERS.map(key => [key, base[key] + (delta[key] || 0)]));
}

function stageInput(stage, baseline, overrides = {}) {
  const statusPolls = overrides.statusPolls || 0;
  const eventPolls = overrides.eventPolls || 0;
  const postActivityStatusPolls = overrides.postActivityStatusPolls || 0;
  const postActivityEventPolls = overrides.postActivityEventPolls || 0;
  const failedStatusCount = overrides.failedStatusCount ?? (stage.statusOutcome === 'failure' ? 1 : 0);
  const successfulStatusCount = overrides.successfulStatusCount ?? (stage.statusOutcome === 'success' ? 1 + statusPolls : 0);
  const activityDelta = counters({
    statusRequests: failedStatusCount + successfulStatusCount,
    statusFailures: failedStatusCount,
    statusSuccesses: successfulStatusCount,
    eventRequests: 1 + eventPolls,
    eventSuccesses: 1 + eventPolls,
    socketRequests: 1,
    socketConnections: 1
  });
  const activity = addCounters(baseline, activityDelta);
  const cleanup = addCounters(activity, counters({
    socketDisconnects: 1,
    statusRequests: postActivityStatusPolls,
    statusSuccesses: postActivityStatusPolls,
    eventRequests: postActivityEventPolls,
    eventSuccesses: postActivityEventPolls
  }));
  return {
    stageName: stage.name,
    baseline,
    activity,
    cleanup,
    socketStatusEvents: overrides.socketStatusEvents || stage.socketStatusEvents
  };
}

function contractError(code, operation) {
  assert.throws(operation, error => error instanceof StageContractError && error.code === code);
}

function sequenceAtStage(index) {
  const sequence = createStageContractSequence();
  let baseline = counters();
  for (let current = 0; current < index; current += 1) {
    const receipt = sequence.verifyStage(stageInput(STAGES[current], baseline));
    baseline = addCounters(baseline, receipt.transport.totalDelta);
  }
  return { sequence, baseline };
}

test('declares all five HUD states without claiming a rendered or hashed image', () => {
  assert.deepEqual(STAGES.map(stage => stage.name), STAGE_ORDER);
  assert.deepEqual(STAGES.map(stage => stage.expectedHUD.dotClass), [
    'status-dot disconnected', 'status-dot', 'status-dot muted', 'status-dot disconnected', 'status-dot'
  ]);
  assert.deepEqual(STAGES.map(stage => stage.expectedHUD.stats), [
    { chatsPerMinute: 0, totalGifts: 0, totalFollows: 0, activeViewers: 0 },
    { chatsPerMinute: 12, totalGifts: 3, totalFollows: 2, activeViewers: 5 },
    { chatsPerMinute: 12, totalGifts: 3, totalFollows: 2, activeViewers: 5 },
    { chatsPerMinute: 0, totalGifts: 3, totalFollows: 2, activeViewers: 0 },
    { chatsPerMinute: 8, totalGifts: 4, totalFollows: 3, activeViewers: 6 }
  ]);
  assert.equal(STAGES[0].expectedHUD.error.text, 'Sidekick status unavailable');
  for (const stage of STAGES) assert.equal(stage.expectedHUD.events.length, 2);
});

test('verifies ordered stage baselines, transport deltas, cleanup, and leaves image review pending', () => {
  const sequence = createStageContractSequence();
  let baseline = counters();
  const receipts = [];

  for (const stage of STAGES) {
    const receipt = sequence.verifyStage(stageInput(stage, baseline));
    receipts.push(receipt);
    assert.equal(receipt.stage, stage.name);
    assert.equal(receipt.transport.totalDelta.socketConnections, 1);
    assert.equal(receipt.transport.totalDelta.socketDisconnects, 1);
    assert.equal(receipt.sourceImageReview, 'pending-independent-source-png-review');
    assert.equal(Object.hasOwn(receipt, 'sourcePng'), false);
    baseline = addCounters(baseline, receipt.transport.totalDelta);
  }

  assert.deepEqual(sequence.finish(), {
    stagesVerified: 5,
    sourceImageReview: 'pending-independent-source-png-review'
  });
});

test('counts legitimate status and event polls without treating them as render proof', () => {
  const { sequence, baseline } = sequenceAtStage(1);
  const stage = STAGES[1];
  const receipt = sequence.verifyStage(stageInput(stage, baseline, {
    statusPolls: 2,
    eventPolls: 3
  }));

  assert.equal(receipt.transport.statusPolls, 2);
  assert.equal(receipt.transport.eventPolls, 3);
  assert.equal(receipt.sourceImageReview, 'pending-independent-source-png-review');
});

test('records a recovery poll after the unavailable-stage activity sample without claiming screenshot state', () => {
  const receipt = createStageContractSequence().verifyStage(stageInput(STAGES[0], counters(), {
    postActivityStatusPolls: 1
  }));

  assert.equal(receipt.transport.activityDelta.statusFailures, 1);
  assert.equal(receipt.transport.activityDelta.statusSuccesses, 0);
  assert.equal(receipt.transport.postActivityStatusResponses, 1);
  assert.equal(receipt.transport.statusPolls, 1);
  assert.equal(receipt.sourceImageReview, 'pending-independent-source-png-review');
});

test('rejects a repeated 503 or a recovery response inside the unavailable stage', () => {
  const repeatedFailure = stageInput(STAGES[0], counters(), { failedStatusCount: 2 });
  contractError('UNAVAILABLE_STAGE_RECOVERED_OR_DUPLICATED', () => createStageContractSequence().verifyStage(repeatedFailure));

  const prematureRecovery = stageInput(STAGES[0], counters(), {
    failedStatusCount: 1,
    successfulStatusCount: 1
  });
  contractError('UNAVAILABLE_STAGE_RECOVERED_OR_DUPLICATED', () => createStageContractSequence().verifyStage(prematureRecovery));
});

test('rejects duplicate socket requests, duplicate replies, and stale phase payloads', () => {
  const { sequence: requestSequence, baseline: requestBaseline } = sequenceAtStage(1);
  const duplicateRequest = stageInput(STAGES[1], requestBaseline);
  duplicateRequest.activity.socketRequests += 1;
  duplicateRequest.cleanup.socketRequests += 1;
  contractError('SOCKET_ACTIVITY_MISMATCH', () => requestSequence.verifyStage(duplicateRequest));

  const { sequence: replySequence, baseline: replyBaseline } = sequenceAtStage(1);
  const duplicateReply = stageInput(STAGES[1], replyBaseline, {
    socketStatusEvents: [...STAGES[1].socketStatusEvents, ...STAGES[1].socketStatusEvents]
  });
  contractError('DUPLICATE_OR_MISSING_SOCKET_STATUS', () => replySequence.verifyStage(duplicateReply));

  const { sequence: staleSequence, baseline: staleBaseline } = sequenceAtStage(4);
  const stalePhaseReply = stageInput(STAGES[4], staleBaseline, {
    socketStatusEvents: STAGES[1].socketStatusEvents
  });
  contractError('STALE_OR_UNEXPECTED_SOCKET_STATUS', () => staleSequence.verifyStage(stalePhaseReply));
});

test('rejects activity left between stages, unpaired sockets, and a missing cleanup disconnect', () => {
  const sequence = createStageContractSequence();
  const firstReceipt = sequence.verifyStage(stageInput(STAGES[0], counters()));
  const priorCleanup = addCounters(counters(), firstReceipt.transport.totalDelta);

  const staleBaseline = addCounters(priorCleanup, counters({ socketConnections: 1 }));
  contractError('STALE_INTERSTAGE_DELTA', () => sequence.verifyStage(stageInput(STAGES[1], staleBaseline)));

  const badCleanup = stageInput(STAGES[0], counters());
  badCleanup.cleanup.socketDisconnects = 0;
  contractError('SOCKET_CLEANUP_MISMATCH', () => createStageContractSequence().verifyStage(badCleanup));

  const unpairedBaseline = counters({ socketConnections: 1 });
  contractError('STALE_INITIAL_BASELINE', () => createStageContractSequence().verifyStage(stageInput(STAGES[0], unpairedBaseline)));
});

test('rejects stage order errors, unaccounted HTTP requests, and counter resets', () => {
  const sequence = createStageContractSequence();
  const wrongStage = stageInput(STAGES[1], counters());
  contractError('STAGE_ORDER_MISMATCH', () => sequence.verifyStage(wrongStage));

  const { sequence: unaccountedSequence, baseline: unaccountedBaseline } = sequenceAtStage(1);
  const unaccounted = stageInput(STAGES[1], unaccountedBaseline);
  unaccounted.cleanup.statusRequests += 1;
  contractError('UNACCOUNTED_STATUS_REQUEST', () => unaccountedSequence.verifyStage(unaccounted));

  const { sequence: resetSequence, baseline: resetBaseline } = sequenceAtStage(1);
  const reset = stageInput(STAGES[1], resetBaseline);
  reset.cleanup.eventRequests = 0;
  contractError('COUNTER_RESET', () => resetSequence.verifyStage(reset));
});
