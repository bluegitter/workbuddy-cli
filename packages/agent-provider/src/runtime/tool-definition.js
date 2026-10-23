'use strict';

const TOOL_DEFAULTS = Object.freeze({
  backfillObservableInput: () => {},
  parseInput: (input) => input,
  validateInput: async () => ({ result: true }),
  checkPermissions: async (input) => ({ behavior: 'allow', updatedInput: input }),
  isConcurrencySafe: () => false,
  mutatesState: false,
  delegationSafe: false,
  autoApprove: false,
});

/**
 * Fill the stable Tool contract at the package boundary. Keeping defaults here
 * mirrors Claude Code's buildTool helper and lets the executor stay focused
 * on lifecycle orchestration rather than shape checks.
 */
function buildTool(definition) {
  if (!definition || typeof definition.name !== 'string' || typeof definition.execute !== 'function') {
    throw new TypeError('tool must define a name and execute function');
  }
  return Object.freeze({ ...TOOL_DEFAULTS, ...definition });
}

module.exports = Object.freeze({ TOOL_DEFAULTS, buildTool });
