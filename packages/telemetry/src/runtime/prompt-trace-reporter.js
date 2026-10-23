'use strict';

let desktopMonitorServiceResolver = async () => {
  try {
    return (await import('./desktop-monitor-service.js')).DesktopMonitorService;
  } catch {
    return undefined;
  }
};

function setDesktopMonitorServiceResolver(resolver) {
  desktopMonitorServiceResolver = typeof resolver === 'function' ? resolver : desktopMonitorServiceResolver;
}

async function getDesktopMonitorService() {
  try { return await desktopMonitorServiceResolver(); } catch { return undefined; }
}

function reportPromptForwardingEvent(payload) {
  getDesktopMonitorService().then((DesktopMonitorService) => {
    if (!DesktopMonitorService) return;
    DesktopMonitorService.getSharedInstance?.()?.reportAegisEvent('wb_main_prompt_forwarding', {
      ext1: payload.promptRequestId,
      ext2: payload.conversationId,
      ...(payload.traceId ? { ext3: payload.traceId, trace: payload.traceId } : {}),
      prompt_request_id: payload.promptRequestId,
      conversation_id: payload.conversationId,
      uid: payload.userId,
    });
  }).catch(() => {});
}

function reportPromptDoneEvent(payload) {
  getDesktopMonitorService().then((DesktopMonitorService) => {
    if (!DesktopMonitorService) return;
    const durationMs = Date.now() - payload.mainReceiveTime;
    const eventName = payload.ok ? 'wb_main_prompt_done' : 'wb_main_prompt_failed';
    const traceId = payload.cliTraceId ?? payload.traceId;
    DesktopMonitorService.getSharedInstance?.()?.reportAegisEvent(eventName, {
      ext1: payload.promptRequestId,
      ext2: payload.conversationId,
      ...(traceId ? { ext3: traceId, trace: traceId } : {}),
      prompt_request_id: payload.promptRequestId,
      conversation_id: payload.conversationId,
      uid: payload.userId,
      duration_ms: durationMs,
      ok: payload.ok ? 1 : 0,
      ...(payload.outcome ? { outcome: payload.outcome } : {}),
      ...(payload.errorMessage ? { error_message: payload.errorMessage } : {}),
    });
  }).catch(() => {});
}

async function reportPromptTrace() {}

module.exports = { getDesktopMonitorService, reportPromptDoneEvent, reportPromptForwardingEvent, reportPromptTrace, setDesktopMonitorServiceResolver };
