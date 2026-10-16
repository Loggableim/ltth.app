'use strict';

const fs = require('fs');
const path = require('path');
const { createContractCommandModeration } = require('../sidekick-host/testing/contract-command-moderation');
const { defineCommandModerationContract, createModerationHarness } = require('../sidekick-host/testing/command-moderation-contract');
const { parseChatCommand } = require('../sidekick-host/command-allowlist');

describe('command moderation contract against the fake clock', () => {
  defineCommandModerationContract(options => createModerationHarness(createContractCommandModeration, options));
});

describe('host core stays unchanged beside command moderation', () => {
  test('HostCore still logs the user field and does not load the moderation module', () => {
    const host = fs.readFileSync(path.join(__dirname, '../sidekick-host/host-core.js'), 'utf8');
    expect(host).not.toMatch(/command-moderation/);
    expect(host).toMatch(/kind: 'command'/);
    expect(host).toMatch(/\buser\b/);
    expect(parseChatCommand('!song ../../etc <b>x</b> ok_1').args).toEqual(['ok_1']);
    expect(parseChatCommand('!shutdown jetzt')).toBeNull();
  });
});
