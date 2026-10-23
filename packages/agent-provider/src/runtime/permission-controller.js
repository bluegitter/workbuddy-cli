'use strict';

const { evaluatePermissionRules } = require('./permission-rules');

const PermissionMode = Object.freeze({
  DEFAULT: 'default',
  ACCEPT_EDITS: 'acceptEdits',
  AUTO: 'auto',
  DONT_ASK: 'dontAsk',
  PLAN: 'plan',
  BYPASS: 'bypassPermissions',
  DELEGATE: 'delegate',
});

class PermissionController {
  constructor({ mode = PermissionMode.DEFAULT, decide, rules = [] } = {}) {
    this.mode = mode;
    this.decide = decide;
    this.rules = rules;
  }

  async canUse(tool, input, context) {
    const ruleDecision = evaluatePermissionRules(this.rules, tool.name, input);
    if (ruleDecision) return ruleDecision;
    if (this.mode === PermissionMode.BYPASS) return { behavior: 'allow', source: 'mode' };
    if (this.mode === PermissionMode.PLAN && tool.mutatesState) {
      return { behavior: 'deny', source: 'plan', message: 'Plan mode blocks mutating tools' };
    }
    if (this.mode === PermissionMode.DELEGATE && !tool.delegationSafe) {
      return { behavior: 'deny', source: 'delegate', message: 'Delegate mode only permits coordination tools' };
    }
    if ((this.mode === PermissionMode.AUTO || this.mode === PermissionMode.ACCEPT_EDITS) && tool.autoApprove) {
      return { behavior: 'allow', source: 'mode' };
    }
    if (!this.decide) return { behavior: 'allow', source: 'default' };
    return this.decide({ tool, input, context, mode: this.mode });
  }
}

module.exports = { PermissionController, PermissionMode };
