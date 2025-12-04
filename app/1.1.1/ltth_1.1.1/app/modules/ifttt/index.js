/**
 * IFTTT Module Index
 * Exports all IFTTT components
 */

module.exports = {
    IFTTTEngine: require('./ifttt-engine'),
    TriggerRegistry: require('./trigger-registry'),
    ConditionRegistry: require('./condition-registry'),
    ActionRegistry: require('./action-registry'),
    VariableStore: require('./variable-store')
};
