'use strict';

const ALWAYS_ALLOW_DECISIONS = new Set(['allow_always', 'allowAll']);
const REJECT_DECISIONS = new Set([
  'reject', 'rejected', 'deny', 'denied', 'rejectAndExitPlan', 'reject_and_exit_plan',
  'cancel', 'cancelled', 'canceled',
]);

function normalizePermissionDecision(decision) {
  if (decision === 'allow') return 'allow';
  if (typeof decision === 'string' && ALWAYS_ALLOW_DECISIONS.has(decision)) return 'allow_always';
  if (typeof decision === 'string' && REJECT_DECISIONS.has(decision)) return 'reject';
  return 'reject';
}

module.exports = Object.freeze({
  ALWAYS_ALLOW_DECISIONS,
  REJECT_DECISIONS,
  normalizePermissionDecision,
});
