/**
 * IFTTT Flow Migration
 * Migrates legacy FlowEngine action/trigger types stored in the DB to IFTTT-compatible types.
 * This migration runs once and is tracked via the DB setting `flows_migration_v2_complete`.
 */

// Legacy action type → IFTTT action type
const ACTION_TYPE_MAP = {
    'alert': 'alert:show',
    'show_alert': 'alert:show',
    'sound': 'sound:play',
    'play_sound': 'sound:play',
    'webhook': 'webhook:send',
    'http_request': 'webhook:send',
    'write_file': 'file:write',
    'log_to_file': 'file:write',
    'delay': 'delay:wait',
    'wait': 'delay:wait',
    'osc_send': 'osc:send',
    'osc_vrchat_wave': 'osc:vrchat:wave',
    'osc_vrchat_celebrate': 'osc:vrchat:celebrate',
    'osc_vrchat_dance': 'osc:vrchat:dance',
    'osc_vrchat_hearts': 'osc:vrchat:hearts',
    'osc_vrchat_confetti': 'osc:vrchat:confetti',
    'osc_vrchat_emote': 'osc:vrchat:emote',
    'osc_vrchat_parameter': 'osc:vrchat:parameter',
    'vdoninja_mute_guest': 'vdoninja:mute',
    'vdoninja_unmute_guest': 'vdoninja:unmute',
    'vdoninja_solo_guest': 'vdoninja:solo',
    'vdoninja_change_layout': 'vdoninja:layout',
    'vdoninja_set_volume': 'vdoninja:volume',
    'vdoninja_kick_guest': 'vdoninja:kick',
    'emoji_rain_trigger': 'emojirain:trigger',
    'trigger_emoji_rain': 'emojirain:trigger'
    // 'command' / 'run_command' and 'custom' are intentionally omitted → actions removed
};

// Legacy trigger type → IFTTT trigger type
const TRIGGER_TYPE_MAP = {
    'gift': 'tiktok:gift',
    'chat': 'tiktok:chat',
    'follow': 'tiktok:follow',
    'share': 'tiktok:share',
    'like': 'tiktok:like',
    'join': 'tiktok:join',
    'subscribe': 'tiktok:subscribe',
    'viewerChange': 'tiktok:viewerChange'
};

/**
 * Migrate a single action object to IFTTT format.
 * Returns null if the action type should be removed entirely.
 * @param {Object} action
 * @returns {Object|null}
 */
function migrateAction(action) {
    if (!action || !action.type) return action;

    const mappedType = ACTION_TYPE_MAP[action.type];

    // Remove unsupported legacy action types
    if (action.type === 'command' || action.type === 'run_command' ||
        action.type === 'custom') {
        return null;
    }

    if (!mappedType) {
        // Already IFTTT format or unknown — leave as-is
        return action;
    }

    const migrated = { ...action, type: mappedType };

    // Normalise osc:vrchat:parameter field names
    if (mappedType === 'osc:vrchat:parameter' && !migrated.parameter_name && migrated.param) {
        migrated.parameter_name = migrated.param;
        delete migrated.param;
    }

    return migrated;
}

/**
 * Run the flow migration.
 * Reads all flows from DB, updates action/trigger types in JSON, writes back.
 * Runs only once; tracked by the `flows_migration_v2_complete` DB setting.
 * @param {Object} db - Database module instance
 * @param {Object} logger - Winston logger
 */
async function migrateFlows(db, logger) {
    try {
        const alreadyDone = db.getSetting('flows_migration_v2_complete');
        if (alreadyDone === 'true') {
            logger?.debug('✅ IFTTT migration v2 already complete, skipping');
            return;
        }

        logger?.info('🔄 Starting IFTTT flow migration v2...');

        const flows = db.getFlows();
        let migratedCount = 0;

        for (const flow of flows) {
            let changed = false;

            // Migrate trigger type
            const newTriggerType = TRIGGER_TYPE_MAP[flow.trigger_type];
            if (newTriggerType) {
                logger?.info(`  ↳ Flow "${flow.name}" [${flow.id}]: trigger ${flow.trigger_type} → ${newTriggerType}`);
                flow.trigger_type = newTriggerType;
                changed = true;
            }

            // Migrate action types - track changes during the map phase
            const originalActions = Array.isArray(flow.actions) ? flow.actions : [];
            const migratedActions = [];

            for (const orig of originalActions) {
                const migr = migrateAction(orig);
                if (migr === null) {
                    // Action removed
                    changed = true;
                    logger?.info(`  ↳ Flow "${flow.name}" [${flow.id}]: removed unsupported action type "${orig.type}"`);
                } else {
                    if (orig && orig.type !== migr.type) {
                        changed = true;
                        logger?.info(`  ↳ Flow "${flow.name}" [${flow.id}]: action ${orig.type} → ${migr.type}`);
                    }
                    migratedActions.push(migr);
                }
            }

            if (changed) {
                flow.actions = migratedActions;
                db.updateFlow(flow.id, flow);
                migratedCount++;
            }
        }

        // Mark migration as complete
        db.setSetting('flows_migration_v2_complete', 'true');
        logger?.info(`✅ IFTTT flow migration v2 complete — ${migratedCount} flow(s) updated`);

    } catch (error) {
        logger?.error('❌ IFTTT flow migration v2 failed:', error);
        // Do not re-throw — a migration failure should not crash the engine
    }
}

module.exports = { migrateFlows, ACTION_TYPE_MAP, TRIGGER_TYPE_MAP };
