'use strict';

let currentLogger = {
  debug: (...args) => console.debug(...args),
  info: (...args) => console.info(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
  log: (...args) => console.log(...args),
};

function configureWorkbuddyLogger(logger) {
  currentLogger = logger || currentLogger;
}

function getWorkbuddyLogger() {
  return currentLogger;
}

function createWorkbuddyScopedLogger(scope) {
  const scoped = currentLogger.scope?.(scope);
  if (scoped) return scoped;
  const prefix = scope ? `[${scope}]` : '';
  return Object.fromEntries(['debug', 'info', 'warn', 'error', 'log'].map((level) => [
    level,
    (message, ...args) => (currentLogger[level] || console[level] || console.log)(prefix ? `${prefix} ${message}` : message, ...args),
  ]));
}

module.exports = { configureWorkbuddyLogger, getWorkbuddyLogger, createWorkbuddyScopedLogger };
