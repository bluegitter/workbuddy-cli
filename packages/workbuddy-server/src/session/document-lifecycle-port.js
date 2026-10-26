'use strict';

const { isTerminalTaskStatus } = require('./task-status');

function createIsSessionStillProcessing(sessionManager) {
  return (sessionId) => {
    const view = sessionManager.getSession(sessionId);
    if (!view) return false;
    const status = view.status;
    if (status && isTerminalTaskStatus(status)) return false;
    return view.isProcessing === true || status === 'working' || status === 'planning';
  };
}

module.exports = Object.freeze({ createIsSessionStillProcessing });
