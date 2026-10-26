'use strict';

function shouldBlockLocalDocumentOpenAttempt(conflict, requestSessionId) {
  if (conflict.kind === 'owned-by-other') return true;
  if (conflict.kind === 'owned-by-self') return Boolean(conflict.sessionId && requestSessionId && conflict.sessionId !== requestSessionId);
  return false;
}

module.exports = Object.freeze({ shouldBlockLocalDocumentOpenAttempt });
