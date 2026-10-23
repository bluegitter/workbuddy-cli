'use strict';

/**
 * Plan the diff between the active connector graph and desired configs.
 * Transport implementations consume this plan; the planner has no SDK or IO
 * dependency and mirrors the MCP pool's sync semantics.
 */
function planConnectorSync(activeConfigs, desiredConfigs, sameConfig = defaultSameConfig) {
  const active = activeConfigs instanceof Map ? activeConfigs : new Map(Object.entries(activeConfigs || {}));
  const desired = desiredConfigs instanceof Map ? desiredConfigs : new Map(Object.entries(desiredConfigs || {}));
  const removed = [];
  const added = [];
  const reconnect = [];
  const unchanged = [];
  for (const id of active.keys()) if (!desired.has(id)) removed.push(id);
  for (const [id, config] of desired) {
    if (!active.has(id)) added.push({ id, config });
    else if (sameConfig(active.get(id), config, id)) unchanged.push({ id, config });
    else reconnect.push({ id, config, previous: active.get(id) });
  }
  return { removed, added, reconnect, unchanged };
}

function defaultSameConfig(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

module.exports = { planConnectorSync, defaultSameConfig };
