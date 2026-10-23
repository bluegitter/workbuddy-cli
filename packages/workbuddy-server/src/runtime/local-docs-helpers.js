'use strict';

function appendWbSource(url, source) {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('wb_source', source);
    return parsed.toString();
  } catch {
    return url;
  }
}

function appendChatMarker(url) {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('_wbchat', '1');
    return parsed.toString();
  } catch {
    return url;
  }
}

function mapConflictToCheckOpenResult(conflict, requestSessionId, shouldBlockLocalDocumentOpenAttempt = () => false) {
  if (conflict.kind === 'owned-by-other' && conflict.sessionId) {
    const title = conflict.filePath.split(/[\\/]/).pop() || conflict.filePath;
    return {
      success: true,
      status: 'owned-by-other',
      filePath: conflict.filePath,
      sessionId: conflict.sessionId,
      ...(conflict.sessionTitle ? { sessionTitle: conflict.sessionTitle } : {}),
      message: `Document is already active in another task: ${title}`,
      shouldBlockOpen: shouldBlockLocalDocumentOpenAttempt(conflict, requestSessionId),
    };
  }
  if (conflict.kind === 'owned-by-self') return {
    success: true,
    status: 'owned-by-self',
    filePath: conflict.filePath,
    ...(conflict.sessionId ? { sessionId: conflict.sessionId } : {}),
    shouldBlockOpen: shouldBlockLocalDocumentOpenAttempt(conflict, requestSessionId),
  };
  return { success: true, status: 'none', filePath: conflict.filePath };
}

module.exports = { appendChatMarker, appendWbSource, mapConflictToCheckOpenResult };
