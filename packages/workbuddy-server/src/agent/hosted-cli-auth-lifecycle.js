'use strict';

function getHostedCliSessionOwnerKey(session) { if (!session?.account?.uid && !session?.auth?.domain && !session?.account?.enterpriseId) return undefined; return [session.account?.uid || '', session.auth?.domain || '', session.account?.enterpriseId || ''].join('|'); }
function bindHostedCliAuthLifecycle(params) {
  let lastKey = getHostedCliSessionOwnerKey(params.authenticationManager.currentSessionSubject.getValue());
  let resetQueue = Promise.resolve();
  const subscription = params.authenticationManager.currentSessionSubject.subscribe((session) => {
    const nextKey = getHostedCliSessionOwnerKey(session); if (nextKey === lastKey) return;
    const previousKey = lastKey; lastKey = nextKey; const reason = `auth-owner-change (${previousKey || 'none'} -> ${nextKey || 'none'})`;
    resetQueue = resetQueue.catch(() => {}).then(async () => { if (!nextKey && params.sessionManager) params.sessionManager.invalidateAllSessionHistory(); await params.runtimeManager.resetHostRuntime(); if (params.prewarmPool) await params.prewarmPool.flush().catch(() => {}); if (params.agentBackend) await params.agentBackend.resetActiveSessions(reason).catch(() => {}); });
  });
  return { async stop() { subscription.unsubscribe(); await resetQueue.catch(() => {}); } };
}
module.exports = Object.freeze({ getHostedCliSessionOwnerKey, bindHostedCliAuthLifecycle });
