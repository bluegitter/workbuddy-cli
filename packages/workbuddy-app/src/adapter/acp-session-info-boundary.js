'use strict';

function getNestedCodeBuddyMeta(meta) {
  const value = meta?.['codebuddy.ai'];
  return value && typeof value === 'object' ? value : undefined;
}

function getSessionInfoHistoryReplaySignal(updateMeta, notificationMeta) {
  const candidates = [updateMeta?.['codebuddy.ai/historyReplay'], notificationMeta?.['codebuddy.ai/historyReplay'], getNestedCodeBuddyMeta(updateMeta)?.historyReplay, getNestedCodeBuddyMeta(notificationMeta)?.historyReplay];
  return candidates.find((value) => value === 'start' || value === 'end');
}

function classifySessionInfoBoundary(notification) {
  const updateMeta = notification.update?._meta;
  const notificationMeta = notification._meta;
  const notificationCodeBuddy = getNestedCodeBuddyMeta(notificationMeta);
  const updateCodeBuddy = getNestedCodeBuddyMeta(updateMeta);
  const historyReplay = getSessionInfoHistoryReplaySignal(updateMeta, notificationMeta);
  if (historyReplay) return { kind: 'history_replay', shouldFlush: true, historyReplay };
  if (notificationCodeBuddy?.isSessionSeparator === true || updateCodeBuddy?.isSessionSeparator === true) return { kind: 'session_separator', shouldFlush: true };
  if (notificationMeta?.['codebuddy.ai/sessionReset'] === true || updateMeta?.['codebuddy.ai/sessionReset'] === true || notificationCodeBuddy?.sessionReset === true || updateCodeBuddy?.sessionReset === true) return { kind: 'session_reset', shouldFlush: true };
  return { kind: 'none', shouldFlush: false };
}

module.exports = Object.freeze({ getNestedCodeBuddyMeta, getSessionInfoHistoryReplaySignal, classifySessionInfoBoundary });
