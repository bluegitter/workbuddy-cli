'use strict';

const { normalizePermissionMode, resolveModeTools } = require('../../../authentication/src/runtime/session-config');
const { SESSION_RUNTIME_RECLAIM_POLICY } = require('./session-manager-meta');

function cloneSessionPayload(payload) { return structuredClone(payload); }
function isRecord(value) { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function normalizeBackendPermissionMode(mode) { return normalizePermissionMode(mode) ?? 'bypassPermissions'; }
function getRuntimeRestartIdentity(config) { return config?.restartFingerprint ?? config?.systemPrompt; }
function isSameSessionRuntimeConfig(left, right) {
  return (left?.model ?? undefined) === (right?.model ?? undefined)
    && getRuntimeRestartIdentity(left) === getRuntimeRestartIdentity(right)
    && (left?.tools ?? undefined) === (right?.tools ?? undefined)
    && (left?.permissionMode ?? undefined) === (right?.permissionMode ?? undefined)
    && (left?.permissionModeBeforePlan ?? undefined) === (right?.permissionModeBeforePlan ?? undefined)
    && (left?.runtimeIdentity ?? undefined) === (right?.runtimeIdentity ?? undefined)
    && (left?.welcomeMode ?? undefined) === (right?.welcomeMode ?? undefined);
}
function resolveRuntimeReclaimIdleTimeoutMs(configured) {
  const value = Number.isFinite(configured) ? configured : undefined;
  if (typeof value === 'number' && value <= 0) return Number.POSITIVE_INFINITY;
  return typeof value === 'number' ? value : SESSION_RUNTIME_RECLAIM_POLICY.idleTimeoutMs;
}
function resolveRuntimeReclaimMaxActiveSessions(configured) {
  const value = Number.isFinite(configured) ? configured : undefined;
  if (typeof value === 'number' && value <= 0) return Number.POSITIVE_INFINITY;
  return typeof value === 'number' ? value : SESSION_RUNTIME_RECLAIM_POLICY.maxActiveSessions;
}
function resolveRuntimeReclaimSweepIntervalMs(configured) {
  const value = Number.isFinite(configured) ? configured : undefined;
  if (typeof value === 'number' && value <= 0) return Number.POSITIVE_INFINITY;
  return typeof value === 'number' ? value : SESSION_RUNTIME_RECLAIM_POLICY.sweepIntervalMs;
}
function isHardTerminalExportStatus(status) { return ['failed', 'error', 'terminated', 'archived'].includes(status); }
function isModelOnlyPatch(patch) { return !!patch && Object.keys(patch).length === 1 && Object.hasOwn(patch, 'model'); }
function isUseSandboxOnlyPatch(patch) {
  return !!patch && Object.hasOwn(patch, 'useSandboxCLI')
    && Object.keys(patch).every((key) => key === 'useSandboxCLI' || key === 'sandboxDisabledReason');
}
function deriveToolsFromDisabled(mode, disabledTools) {
  if (!disabledTools || disabledTools.length === 0) return;
  const disabled = new Set(disabledTools);
  return resolveModeTools(mode).split(',').map((tool) => tool.trim()).filter(Boolean)
    .filter((tool) => !disabled.has(tool)).join(',');
}

module.exports = Object.freeze({ cloneSessionPayload, isRecord, normalizeBackendPermissionMode,
  getRuntimeRestartIdentity, isSameSessionRuntimeConfig, resolveRuntimeReclaimIdleTimeoutMs,
  resolveRuntimeReclaimMaxActiveSessions, resolveRuntimeReclaimSweepIntervalMs,
  isHardTerminalExportStatus, isModelOnlyPatch, isUseSandboxOnlyPatch, deriveToolsFromDisabled });
