'use strict';

const consoleWorkbuddyLogger = Object.freeze({
  debug: (...args) => console.debug(...args),
  info: (...args) => console.info(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
  log: (...args) => console.log(...args),
});

let currentLogger = consoleWorkbuddyLogger;

function configureWorkbuddyLogger(logger) {
  currentLogger = logger ?? consoleWorkbuddyLogger;
}

function getWorkbuddyLogger() { return currentLogger; }

function createWorkbuddyScopedLogger(scope) {
  const scoped = getWorkbuddyLogger().scope?.(scope);
  return scoped ? normalizeLogger(scoped) : normalizeLogger(getWorkbuddyLogger(), scope);
}

function normalizeLogger(logger, scope) {
  const prefix = scope ? `[${scope}]` : undefined;
  return {
    debug: (message, ...args) => logWithFallback(logger, 'debug', prefix, message, args),
    info: (message, ...args) => logWithFallback(logger, 'info', prefix, message, args),
    warn: (message, ...args) => logWithFallback(logger, 'warn', prefix, message, args),
    error: (message, ...args) => logWithFallback(logger, 'error', prefix, message, args),
    log: (message, ...args) => logWithFallback(logger, 'log', prefix, message, args),
  };
}

function logWithFallback(logger, level, prefix, message, args) {
  const method = logger[level] ?? logger.info ?? consoleWorkbuddyLogger[level] ?? consoleWorkbuddyLogger.info;
  method?.(prefix ? `${prefix} ${message}` : message, ...args);
}

module.exports = { configureWorkbuddyLogger, createWorkbuddyScopedLogger, getWorkbuddyLogger };
