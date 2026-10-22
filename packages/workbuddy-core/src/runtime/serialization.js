'use strict';

function cloneSerializable(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function safeJson(value) {
  try { return JSON.stringify(value); } catch { return undefined; }
}

module.exports = { cloneSerializable, safeJson };
