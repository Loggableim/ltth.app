# Guide Editorial Quality Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate source-anchored plugin-guide prose and reject generic, ungrounded workflow, setting, and troubleshooting copy.

**Architecture:** `scripts/plugin-guides/definition.js` will derive prose anchors from the shipped control and integration inventories. `scripts/lib/guide-definition-validation.js` will reject generated guide text that omits those anchors or repeats generic visibility formulas. Jest tests cover the validator directly and all 38 generated guide definitions.

**Tech Stack:** Node.js CommonJS, Jest, static HTML/source inventories.

## Global Constraints

- Use only shipped inventory evidence: selector, route, label, default, allowed values, and declared integrations.
- Do not describe runtime effects that the static inventory does not establish.
- Do not use GUI, OBS, browser automation, or create a commit.

---

### Task 1: Define and prove the quality contract

**Files:**
- Modify: `app/test/guide-definition-validation.test.js`
- Modify: `scripts/lib/guide-definition-validation.js`

**Interfaces:**
- Produces `generic-guide-text` and `guide-text-source-anchor-missing` audit errors when a documented setting or troubleshooting entry uses generic prose instead of source identifiers.

- [x] **Step 1: Write failing validator tests**

Add a guide with `#sample` sourced on `/plugins/sample` and generic localized text such as `Visible control on /plugins/sample.`. Assert the audit reports the two quality error codes. Add a REST-only guide with `GET /api/sample/info` referenced in troubleshooting and assert it is accepted.

- [x] **Step 2: Run the focused test to verify it fails**

Run: `cd app; npm test -- --runInBand test/guide-definition-validation.test.js`

Expected: FAIL because the quality audit is absent.

- [x] **Step 3: Implement minimal quality audit**

Add a centralized audit that rejects generic visibility phrases and requires an inventory selector/route anchor for settings and a control selector or declared integration value for troubleshooting.

- [x] **Step 4: Run the focused test to verify it passes**

Run: `cd app; npm test -- --runInBand test/guide-definition-validation.test.js`

Expected: PASS.

### Task 2: Generate source-anchored prose

**Files:**
- Modify: `app/test/plugin-guide-definition.test.js`
- Modify: `scripts/plugin-guides/definition.js`

**Interfaces:**
- Consumes: shipped UI and integration inventories.
- Produces: all generated setting, workflow, and troubleshooting copy with route/selector/integration anchors in all four locales.

- [x] **Step 1: Write failing generation tests**

For all built guides, assert every inventory-generated setting names its selector and route, no setting contains generic `visible control`/`visible on` text, each workflow summary contains the activation route, and each troubleshooting entry contains a control selector or source integration value. Assert API Bridge resolves its troubleshooting source through one of its REST endpoints.

- [x] **Step 2: Run the focused test to verify it fails**

Run: `cd app; npm test -- --runInBand test/plugin-guide-definition.test.js`

Expected: FAIL because current generator prose is generic.

- [x] **Step 3: Implement minimal source-anchored generators**

Build deterministic anchors from control selectors, route, label/default/values, and prioritized declared integrations. Remove central workflow, setting, and troubleshooting claims that static source inventory cannot establish.

- [x] **Step 4: Run focused tests to verify they pass**

Run: `cd app; npm test -- --runInBand test/guide-definition-validation.test.js test/plugin-guide-definition.test.js`

Expected: PASS.

### Task 3: Audit the complete tutorial source

**Files:**
- Verify only: `scripts/build-plugin-docs.js`, `scripts/verify-plugin-tutorial-source.js`, `scripts/verify-docs-screenshot-spec.js`

- [x] **Step 1: Run the 38-guide contract audit**

Run: `node scripts/build-plugin-docs.js --audit-contracts`

Expected: `GuideDefinition contract audit: 38 guide(s), 0 error(s).`

- [x] **Step 2: Run source and screenshot-spec verification**

Run: `node scripts/verify-plugin-tutorial-source.js; node scripts/verify-docs-screenshot-spec.js`

Expected: both checks pass without browsing or capturing screenshots.
