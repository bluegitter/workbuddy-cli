'use strict';

function invariant(condition, message) {
  if (!condition) throw new Error(message || 'WorkBuddy invariant failed');
}

function assertRecord(value, name = 'value') {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${name} must be an object`);
  return value;
}

module.exports = { assertRecord, invariant };
