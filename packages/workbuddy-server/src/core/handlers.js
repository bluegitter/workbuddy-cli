'use strict';

// The core registrar is deliberately an orchestration boundary. Domain handlers
// stay in their original folders; this module only preserves registration order.
const domains = [
  ['../asr/handlers', 'registerAsrHandlers'],
  ['../automation/handlers', 'registerAutomationsHandlers'],
  ['../backend/handlers', 'registerBackendsHandlers'],
  ['../binary/handlers', 'registerBinariesHandlers'],
  ['../config/handlers', 'registerConfigHandlers'],
  ['../credit-prediction/handlers', 'registerCreditPredictionHandlers'],
  ['../feedback/handlers', 'registerFeedbackHandlers'],
  ['../growth/handlers', 'registerGrowthHandlers'],
  ['../inspiration/handlers', 'registerInspirationHandlers'],
  ['../mcp/handlers', 'registerMcpHandlers'],
  ['../perf/handlers', 'registerPerfHandlers'],
  ['../share/handlers', 'registerShareHandlers'],
  ['../tencent-lexiang/handlers', 'registerTencentLexiangHandlers']
];

function registerWorkbuddyCoreRpcHandlers(registry, deps, options = {}) {
  for (const [modulePath, exportName] of domains) {
    if (options.skip?.[exportName]) continue;
    const register = require(modulePath)[exportName];
    if (typeof register === 'function') register(registry, deps, options);
  }
  return registry;
}

module.exports = { registerWorkbuddyCoreRpcHandlers };
