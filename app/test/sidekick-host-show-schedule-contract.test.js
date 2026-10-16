'use strict';

const fs = require('fs');
const path = require('path');
const { createContractShowSchedule } = require('../sidekick-host/testing/contract-show-schedule');
const { defineShowScheduleContract, createScheduleHarness } = require('../sidekick-host/testing/show-schedule-contract');
const { ShowPlanner } = require('../sidekick-host/show-planner');
const { createDemoPorts } = require('../sidekick-host/demo-plugins');

describe('show schedule contract against the fake clock', () => {
  defineShowScheduleContract(options => createScheduleHarness(createContractShowSchedule, options));
});

describe('host core stays unchanged beside the schedule', () => {
  test('HostCore and the current ShowPlanner do not gain a timed schedule', () => {
    const host = fs.readFileSync(path.join(__dirname, '../sidekick-host/host-core.js'), 'utf8');
    const planner = fs.readFileSync(path.join(__dirname, '../sidekick-host/show-planner.js'), 'utf8');
    expect(host).not.toMatch(/show-schedule/);
    expect(planner).not.toMatch(/show-schedule/);
    const show = new ShowPlanner(createDemoPorts());
    expect(typeof show.tick).toBe('undefined');
    expect(show.active().id).toBe('quiz-show');
    expect(show.advance()).toBe('music-sound');
  });
});
