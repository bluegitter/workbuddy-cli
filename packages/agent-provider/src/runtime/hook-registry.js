'use strict';

const { normalizeHookResult } = require('./hook-result');

const HookEvent = Object.freeze({
  SESSION_START: 'SessionStart',
  SESSION_END: 'SessionEnd',
  PRE_TOOL_USE: 'PreToolUse',
  POST_TOOL_USE: 'PostToolUse',
  POST_TOOL_USE_FAILURE: 'PostToolUseFailure',
  SUBAGENT_START: 'SubagentStart',
  SUBAGENT_STOP: 'SubagentStop',
});

class HookRegistry {
  constructor() {
    this.handlers = new Map();
  }

  register(event, handler, { priority = 0 } = {}) {
    if (typeof handler !== 'function') throw new TypeError('hook handler must be a function');
    const handlers = this.handlers.get(event) || [];
    handlers.push({ handler, priority });
    handlers.sort((left, right) => right.priority - left.priority);
    this.handlers.set(event, handlers);
    return () => this.unregister(event, handler);
  }

  unregister(event, handler) {
    this.handlers.set(event, (this.handlers.get(event) || []).filter((item) => item.handler !== handler));
  }

  async run(event, payload, context = {}) {
    let current = payload;
    for (const { handler } of this.handlers.get(event) || []) {
      if (context.signal?.aborted) return { stopped: true, reason: 'cancelled', payload: current };
      const result = normalizeHookResult(await handler(current, context), current);
      if (!result) continue;
      current = result.payload;
      if (result.stopped) return { stopped: true, reason: result.reason, payload: current };
    }
    return { stopped: false, payload: current };
  }
}

module.exports = { HookEvent, HookRegistry };
