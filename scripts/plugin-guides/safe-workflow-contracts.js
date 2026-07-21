'use strict';

// A guide may document a hardware-, account-, or LIVE-affecting control without
// exercising it in the isolated capture profile. Those steps must remain a
// visible review, never masquerade as a local preview, save, or reset action.
const REVIEW_ONLY_STEPS = Object.freeze({
  'advanced-timer': ['timer-reset'],
  'data-source': ['field-map'],
  coinbattle: ['match-reset'],
  gcce: ['command-review'],
  openshock: ['shock-simulation', 'safety-reset'],
  'interactive-story': ['story-reset'],
  'minecraft-connect': ['offline-message', 'minecraft-review'],
  multicam: ['scene-dry-run'],
  'music-bot': ['queue-reset'],
  'osc-bridge': ['loopback-check', 'osc-review'],
  streamalchemy: ['rule-reset'],
  'stt-ticker': ['sample-sentence', 'ticker-reset'],
  'talking-heads': ['text-preview', 'heads-reset'],
  'thermal-printer': ['queue-test', 'printer-review'],
  toptier: ['rank-preview', 'tier-reset'],
  tts: ['muted-voice-preview', 'tts-review'],
  vdoninja: ['browser-preview', 'ninja-reset'],
  'milestone-leaderboard': ['xp-reset'],
  'flame-overlay': ['frame-reset'],
  'visual-fx-frame-webgpu': ['frame-reset'],
  'webgpu-emoji-rain': ['gpu-preset', 'gpu-rain-reset'],
  'webgpu-fireworks': ['gpu-fireworks-reset']
});

// These controls are shipped local-only UI actions. Each evidence selector is
// distinct from the trigger so the receipt proves the resulting real state.
const LOCAL_ACTION_STEPS = Object.freeze({
  chatango: {
    'widget-preview': { clickSelector: '#btn-preview', evidenceSelector: '#preview-card' }
  },
  coinbattle: {
    'demo-match': { clickSelector: '#btn-start-match', evidenceSelector: '#match-status-text' }
  },
  'gift-catalog': {
    'gift-preview': { clickSelector: '#demo-shuffle-list', evidenceSelector: '#demo-list' },
    'catalog-review': { clickSelector: '#save-config', evidenceSelector: '#connection-state' }
  },
  'interactive-story': {
    'local-decision': { clickSelector: '#toggleOverlayPreviewBtn', evidenceSelector: '#overlayPreviewContainer' }
  },
  gcce: {
    'command-dry-run': { clickSelector: '#btn-validate-commands', evidenceSelector: '#message-container' }
  },
  multicam: {
    'multicam-review': { clickSelector: '#saveMappingsBtn', evidenceSelector: '#saveStatus' }
  },
  soundboard: {
    'soundboard-review': {
      clickSelector: '[data-save-proxy]',
      evidenceSelector: '#soundboard-save-state',
      confirmDialog: true
    }
  },
  'milestone-leaderboard': {
    'xp-pulse': { clickSelector: '#testButton', evidenceSelector: '#notification' }
  },
  'flame-overlay': {
    'frame-preview': { clickSelector: '#previewToggle', evidenceSelector: '#previewContainer' }
  },
  'visual-fx-frame-webgpu': {
    'gpu-frame-preview': { clickSelector: '#previewToggle', evidenceSelector: '#previewContainer' }
  },
  'emoji-rain': {
    'save-emoji-rain': { clickSelector: '#save-config-btn', evidenceSelector: '#notification' }
  },
  fireworks: {
    'fireworks-test': { clickSelector: '#test-btn', evidenceSelector: '#toast' },
    'fireworks-reset': { clickSelector: '#save-btn', evidenceSelector: '#toast' }
  },
  spotlight: {
    'chatter-preview': { clickSelector: '#preview-test-btn', evidenceSelector: '#toast' }
  },
  schnorrbecher: {
    'test-gift': { clickSelector: '#test-gift', evidenceSelector: '#total-value' }
  },
  toptier: {
    'tier-threshold': { clickSelector: '#test-overlay', evidenceSelector: '#toast' }
  },
  'webgpu-emoji-rain': {
    'gpu-rain-test': { clickSelector: '#test-emoji-rain-btn', evidenceSelector: '#notification' }
  }
});

function isReviewOnly(guideId, stepId) {
  return REVIEW_ONLY_STEPS[guideId]?.includes(stepId) || false;
}

function applyReviewOnlyContract(step) {
  const route = step.capture.route || step.workflow.route;
  const selector = step.capture.assertVisible;
  const existingAction = step.capture.action || {};
  const postconditions = step.workflow.postconditions.filter((entry) => (
    entry.type !== 'interaction' && entry.type !== 'visible'
  ));

  return {
    ...step,
    capture: {
      ...step.capture,
      action: {
        type: 'open-plugin-surface',
        stepId: step.id,
        ...(existingAction.prepare ? { prepare: existingAction.prepare } : {}),
        ...(existingAction.preparationEvidenceSelector
          ? { preparationEvidenceSelector: existingAction.preparationEvidenceSelector }
          : {})
      }
    },
    workflow: {
      ...step.workflow,
      route,
      operations: [
        { type: 'goto', route },
        { type: 'open-plugin-surface', selector }
      ],
      postconditions: [...postconditions, { type: 'visible', selector }],
      captureRule: {
        ...step.workflow.captureRule,
        selector,
        stateChange: false
      }
    }
  };
}

function applyLocalActionContract(step, actionConfig) {
  const action = {
    ...step.capture.action,
    ...actionConfig,
    allowClick: true,
    settleMs: actionConfig.settleMs || 750
  };
  let replacedOperation = false;
  const operations = step.workflow.operations.map((operation) => {
    if (!replacedOperation && operation.type === action.type) {
      replacedOperation = true;
      return { ...operation, selector: action.clickSelector };
    }
    return operation;
  });
  const postconditions = step.workflow.postconditions.map((postcondition) => {
    if (postcondition.type !== 'interaction') return postcondition;
    return {
      type: 'interaction',
      selector: action.clickSelector,
      expected: { type: action.type, changed: true }
    };
  });
  if (!postconditions.some((postcondition) => (
    postcondition.type === 'visible' && postcondition.selector === action.evidenceSelector
  ))) {
    postconditions.push({ type: 'visible', selector: action.evidenceSelector });
  }

  return {
    ...step,
    capture: { ...step.capture, action },
    workflow: {
      ...step.workflow,
      operations,
      postconditions,
      captureRule: {
        ...step.workflow.captureRule,
        selector: action.evidenceSelector,
        stateChange: true
      }
    }
  };
}

function applySafeWorkflowContracts(guides) {
  return guides.map((guide) => ({
    ...guide,
    steps: guide.steps.map((step) => {
      if (isReviewOnly(guide.id, step.id)) return applyReviewOnlyContract(step);
      const actionConfig = LOCAL_ACTION_STEPS[guide.id]?.[step.id];
      if (actionConfig) return applyLocalActionContract(step, actionConfig);
      return step;
    })
  }));
}

module.exports = { applySafeWorkflowContracts };
