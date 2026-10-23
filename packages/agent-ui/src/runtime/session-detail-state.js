'use strict';

function buildSessionDetailRestorePlan(input) {
  const panelOpen = input.carryOverPreview || (input.cachedPanelOpen ?? false);
  const cachedNarrowMode = panelOpen && (input.cachedNarrowMode ?? false);
  if (!panelOpen) return { panelOpen: false, narrowMode: false, previewRestore: { kind: 'none' } };
  if (input.browserUrl) return { panelOpen: true, narrowMode: false, previewRestore: { kind: 'browser-preview' } };
  if (input.selectedFilePath) return { panelOpen: true, narrowMode: false, previewRestore: { kind: 'file-changes', filePath: input.selectedFilePath } };
  const selectedId = input.artifactsSnapshot?.selectedArtifactId;
  if (selectedId) return { panelOpen: true, narrowMode: false, previewRestore: { kind: 'artifact', artifactId: selectedId } };
  return { panelOpen: true, narrowMode: cachedNarrowMode, previewRestore: { kind: 'none' } };
}

function hasSessionDetailPreviewContent(snapshot) {
  return !!(snapshot.selectedArtifactId || snapshot.selectedFilePath || snapshot.browserUrl);
}

function shouldOpenDetailPanelInNarrowOverviewMode(input) {
  if (input.selectedFilePath || input.browserUrl) return false;
  if (input.sidebarView === 'preview') return true;
  if (input.sidebarView === 'fileTree' || input.sidebarView === 'changes' || input.sidebarView === 'mcpApps') return false;
  return true;
}

function resolvePersistedSidebarView(sidebarView, hasPreviewContent) {
  if (!hasPreviewContent && sidebarView === 'artifacts') return 'overview';
  return sidebarView;
}

function resolveSessionSwitchTargetPanelOpen(target, currentSessionId) {
  if (!target || !currentSessionId || target.sessionId !== currentSessionId) return;
  return target.open;
}

function resolveDetailPanelOpenForSessionSave(sessionId, sessionSwitchTarget, showDetailPanel) {
  if (sessionSwitchTarget?.sessionId === sessionId) return sessionSwitchTarget.open;
  return showDetailPanel;
}

module.exports = {
  buildSessionDetailRestorePlan,
  hasSessionDetailPreviewContent,
  shouldOpenDetailPanelInNarrowOverviewMode,
  resolvePersistedSidebarView,
  resolveSessionSwitchTargetPanelOpen,
  resolveDetailPanelOpenForSessionSave,
};
