'use strict';

// AP2 gate. Red until app/sidekick-host/show-schedule.js exists and
// createShowSchedule({ config, now, ports, replyEngine }) passes the same cases.
// This file does not change HostCore.
const { defineShowScheduleContract, createScheduleHarness } = require('../sidekick-host/testing/show-schedule-contract');

let createShowSchedule = null;
try {
  ({ createShowSchedule } = require('../sidekick-host/show-schedule'));
} catch (error) {
  createShowSchedule = null;
}

function createHarness(options) {
  if (typeof createShowSchedule !== 'function') {
    throw new Error('AP2: app/sidekick-host/show-schedule.js is missing');
  }
  return createScheduleHarness(createShowSchedule, options);
}

describe('AP2 production show schedule', () => {
  defineShowScheduleContract(createHarness);
});
