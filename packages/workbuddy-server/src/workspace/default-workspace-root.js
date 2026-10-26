'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_WORKSPACE_PATH_CONFIG_KEY = 'defaultWorkspacePath';
let configServiceRef;
let loggerRef;
let appNameProvider;

function setDefaultWorkspaceRootConfigService(service, logger = null) { configServiceRef = service; loggerRef = logger; }
function setDefaultWorkspaceRootAppNameProvider(provider) { appNameProvider = provider; }
function getSystemDefaultWorkspaceRoot() { return path.join(os.homedir(), appNameProvider?.() || process.env.WORKBUDDY_APP_NAME?.trim() || 'WorkBuddy'); }
function formatFsReason(error) { return error?.code ? `${error.code}: ${error.message}` : String(error); }
function warnDefaultWorkspaceRoot(message, details) { loggerRef?.warn?.(`[DefaultWorkspaceRoot] ${message}`, details); }
function clearConfiguredDefaultWorkspacePath(stored, reason) { if (stored === null || stored === undefined || stored === '') return; warnDefaultWorkspaceRoot('Invalid defaultWorkspacePath detected, clearing config before fallback', { stored, reason }); try { configServiceRef?.set?.(DEFAULT_WORKSPACE_PATH_CONFIG_KEY, ''); } catch (error) { warnDefaultWorkspaceRoot('Failed to clear invalid defaultWorkspacePath config, continuing fallback', { stored, reason, error: formatFsReason(error) }); } }
function getDirReadyFailureReason(dir) { try { if (fs.statSync(dir).isDirectory()) return; return 'path exists but is not a directory'; } catch (error) { if (error?.code && error.code !== 'ENOENT') return `cannot access directory (${formatFsReason(error)})`; } try { fs.mkdirSync(dir, { recursive: true }); } catch (error) { return `cannot create directory (${formatFsReason(error)})`; } }
function isDisallowedFilesystemRoot(dir) { const normalized = path.normalize(dir); return normalized === path.sep && path.parse(normalized).root === normalized; }
function getWorkspaceRootProbeFailureReason(root) { let probeDir; try { probeDir = fs.mkdtempSync(path.join(root, `.workbuddy-probe-${process.pid}-`)); } catch (error) { return `cannot create probe directory (${formatFsReason(error)})`; } try { fs.rmSync(probeDir, { recursive: true, force: true }); } catch (error) { return `created probe directory but failed to remove it (${formatFsReason(error)})`; } }
function validateDefaultWorkspaceRoot(candidate) { if (typeof candidate !== 'string') return { ok: false, reason: 'path is not a string' }; const trimmed = candidate.trim(); if (!trimmed) return { ok: false, reason: 'path is empty' }; if (!path.isAbsolute(trimmed)) return { ok: false, reason: 'path is not absolute' }; if (isDisallowedFilesystemRoot(trimmed)) return { ok: false, reason: 'filesystem root cannot be used as workspace root' }; const dirFailure = getDirReadyFailureReason(trimmed); if (dirFailure) return { ok: false, reason: dirFailure }; const probeFailure = getWorkspaceRootProbeFailureReason(trimmed); if (probeFailure) return { ok: false, reason: probeFailure }; return { ok: true, root: trimmed }; }
function resolveDefaultWorkspaceRoot() { if (configServiceRef) try { const stored = configServiceRef.get(DEFAULT_WORKSPACE_PATH_CONFIG_KEY); const validation = validateDefaultWorkspaceRoot(stored); if (validation.ok) return validation.root; clearConfiguredDefaultWorkspacePath(stored, validation.reason); } catch {} const fallback = getSystemDefaultWorkspaceRoot(); return validateDefaultWorkspaceRoot(fallback).ok ? fallback : fallback; }
function ensureClawCwd(root) { const clawCwd = path.join(root, 'Claw'); try { fs.mkdirSync(clawCwd, { recursive: true }); } catch (error) { throw new Error(`Failed to create Claw workspace directory "${clawCwd}" (${formatFsReason(error)}). Please verify the default workspace path in Settings exists and is writable.`); } let stat; try { stat = fs.statSync(clawCwd); } catch (error) { throw new Error(`Claw workspace directory "${clawCwd}" is not accessible (${error?.code ?? 'UNKNOWN'}: ${error?.message ?? error}).`); } if (!stat.isDirectory()) throw new Error(`Claw workspace path "${clawCwd}" exists but is not a directory. Remove or rename the file at that path and try again.`); return clawCwd; }
function resolveClawCwd() { const root = resolveDefaultWorkspaceRoot(); try { return ensureClawCwd(root); } catch (error) { const fallback = getSystemDefaultWorkspaceRoot(); if (path.resolve(root) !== path.resolve(fallback)) { clearConfiguredDefaultWorkspacePath(root, error instanceof Error ? error.message : String(error)); try { return ensureClawCwd(fallback); } catch (fallbackError) { throw new Error(`${String(error)} Fallback Claw workspace directory also failed (${formatFsReason(fallbackError)}).`); } } throw error; } }

module.exports = Object.freeze({ DEFAULT_WORKSPACE_PATH_CONFIG_KEY, setDefaultWorkspaceRootConfigService, setDefaultWorkspaceRootAppNameProvider, getSystemDefaultWorkspaceRoot, formatFsReason, clearConfiguredDefaultWorkspacePath, getDirReadyFailureReason, isDisallowedFilesystemRoot, getWorkspaceRootProbeFailureReason, validateDefaultWorkspaceRoot, resolveDefaultWorkspaceRoot, ensureClawCwd, resolveClawCwd });
