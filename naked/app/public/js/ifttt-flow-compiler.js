/**
 * IFTTT visual flow compiler
 * Converts the editor graph into the backend flow payload.
 */

(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.IFTTTFlowCompiler = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  function compileFlow(flow) {
    if (!flow || typeof flow !== 'object') {
      throw new Error('Flow data is required');
    }

    const name = String(flow.name || '').trim();
    if (!name) {
      throw new Error('Please enter a flow name');
    }

    const nodes = Array.isArray(flow.nodes) ? flow.nodes : [];
    const connections = Array.isArray(flow.connections) ? flow.connections : [];
    const trigger = nodes.find(node => node.type === 'trigger');

    if (!trigger) {
      throw new Error('Flow must have a trigger');
    }

    const conditionAnalysis = analyzeConditions(nodes, connections, trigger);
    const actions = connections.length > 0
      ? collectConnectedActions(nodes, connections, trigger, conditionAnalysis.allowedPorts)
      : nodes.filter(node => node.type === 'action').map(compileActionNode);

    if (actions.length === 0) {
      throw new Error('Flow must have at least one action');
    }

    return {
      name,
      trigger_type: trigger.componentId,
      trigger_condition: conditionAnalysis.condition,
      actions,
      enabled: flow.enabled ? 1 : 0
    };
  }

  function analyzeConditions(nodes, connections, trigger) {
    const nodesById = new Map(nodes.map(node => [node.id, node]));
    const outgoing = groupConnections(connections, 'fromNode');
    const allowedPorts = new Map();

    if (connections.length === 0) {
      return { condition: null, allowedPorts };
    }

    const conditionNodes = (outgoing.get(trigger.id) || [])
      .map(connection => nodesById.get(connection.toNode))
      .filter(node => node && node.type === 'condition');

    const conditions = [];

    for (const conditionNode of conditionNodes) {
      const condition = compileConditionNode(conditionNode);
      const conditionOutgoing = outgoing.get(conditionNode.id) || [];
      const hasTrueBranch = conditionOutgoing.some(connection => normalizePort(connection.fromPort) === 'true');
      const hasFalseBranch = conditionOutgoing.some(connection => normalizePort(connection.fromPort) === 'false');

      if (hasTrueBranch && hasFalseBranch) {
        throw new Error('A saved backend flow cannot split TRUE and FALSE branches from the same condition yet');
      }

      if (hasFalseBranch) {
        conditions.push({ logic: 'NOT', condition });
        allowedPorts.set(conditionNode.id, new Set(['false']));
      } else {
        conditions.push(condition);
        allowedPorts.set(conditionNode.id, new Set(['true', 'default']));
      }
    }

    return {
      condition: combineConditions(conditions),
      allowedPorts
    };
  }

  function collectConnectedActions(nodes, connections, trigger, allowedPorts) {
    const nodesById = new Map(nodes.map(node => [node.id, node]));
    const outgoing = groupConnections(connections, 'fromNode');
    const actions = [];
    const visited = new Set();

    function visit(nodeId) {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      const node = nodesById.get(nodeId);
      if (!node) return;

      if (node.type === 'action') {
        actions.push(compileActionNode(node));
      }

      const nextConnections = outgoing.get(nodeId) || [];
      for (const connection of nextConnections) {
        if (node.type === 'condition') {
          const port = normalizePort(connection.fromPort);
          const allowed = allowedPorts.get(node.id) || new Set(['true', 'default']);
          if (!allowed.has(port)) continue;
        }
        visit(connection.toNode);
      }
    }

    visit(trigger.id);
    return actions;
  }

  function compileActionNode(node) {
    return {
      type: node.componentId,
      ...(node.config || {})
    };
  }

  function compileConditionNode(node) {
    const config = node.config || {};

    if (node.componentId === 'field_value') {
      if (!config.field || !config.operator) {
        throw new Error(`Condition "${node.name || node.componentId}" needs a field and operator`);
      }

      return {
        field: config.field,
        operator: config.operator,
        value: config.value
      };
    }

    return {
      type: node.componentId,
      ...config
    };
  }

  function combineConditions(conditions) {
    if (conditions.length === 0) return null;
    if (conditions.length === 1) return conditions[0];
    return {
      logic: 'AND',
      conditions
    };
  }

  function groupConnections(connections, key) {
    return connections.reduce((groups, connection) => {
      const groupKey = connection[key];
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey).push(connection);
      return groups;
    }, new Map());
  }

  function normalizePort(port) {
    return port || 'default';
  }

  return {
    compileFlow,
    compileConditionNode
  };
});
