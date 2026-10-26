'use strict';

function createRendererLogger(scope, logger = globalThis.electronLog) {
  const scoped = logger?.scope ? logger.scope(scope) : logger || console;
  return scoped;
}
function createAgentClientLogger(scope, logger) {
  const scoped = createRendererLogger(scope, logger);
  return { log: (...args) => scoped.info?.(...args), info: (...args) => scoped.info?.(...args), warn: (...args) => scoped.warn?.(...args), error: (...args) => scoped.error?.(...args), debug: (...args) => scoped.debug?.(...args) };
}

module.exports = Object.freeze({ createRendererLogger, createAgentClientLogger });
