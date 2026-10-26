'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { JsonFileDataRetentionConfigStore } = require('./config-store');
const { walkDirectorySize, compressCwdToSlug, isSafeSessionArtifactId, safeJoinWithin } = require('./file-utils');
const { retentionPolicyToDays } = require('./types');

const DEFAULT_POLICY = Object.freeze({ policy: 'forever' });
const MAX_KEPT_ERRORS = 5;
const ROOT_BYTES_CACHE_TTL_MS = 30 * 1000;
const STARTUP_DELAY_MS = 5 * 1000;
const FALLBACK_INTERVAL_MS = 1440 * 60 * 1000;

class DataRetentionService {
  constructor(deps) { this.deps = deps; this.configStore = deps.configStore ?? new JsonFileDataRetentionConfigStore(deps.configDir); this.logger = deps.logger ?? console; this.lastCleanup = null; this.cleanupRunning = false; this.rootBytesCache = null; this.startupTimer = null; this.intervalTimer = null; }
  startSchedule() { if (this.startupTimer || this.intervalTimer) return; this.startupTimer = setTimeout(() => { this.startupTimer = null; this.runCleanup().catch((error) => this.logger.warn('[DataRetention] startup cleanup failed:', error)); }, STARTUP_DELAY_MS); this.intervalTimer = setInterval(() => { this.runCleanup().catch((error) => this.logger.warn('[DataRetention] interval cleanup failed:', error)); }, FALLBACK_INTERVAL_MS); }
  dispose() { if (this.startupTimer) clearTimeout(this.startupTimer); if (this.intervalTimer) clearInterval(this.intervalTimer); this.startupTimer = null; this.intervalTimer = null; }
  async getStorageUsage() { const databaseBytes = await this.measureDatabaseBytes(); const rootBytes = await this.measureWorkbuddyRootBytes(); const visible = (await this.listCurrentUserSessions()).filter((session) => !session.archivedAt && !session.deletedAt); return { totalBytes: rootBytes > 0 ? rootBytes : databaseBytes, conversationBytes: databaseBytes, conversationCount: visible.length, workbuddyRootDir: this.deps.configDir }; }
  async getDiskInfo() { const stat = await fs.promises.statfs(this.deps.configDir); const total = Number(stat.blocks) * Number(stat.bsize); const free = Number(stat.bavail) * Number(stat.bsize); return { totalBytes: Math.max(0, total), usedBytes: Math.max(0, total - free), freeBytes: Math.max(0, free) }; }
  async getPolicy() { const raw = await this.configStore.read(); if (!raw || !this.isRetentionPolicy(raw.policy)) return DEFAULT_POLICY; return raw.policy === 'forever' ? { policy: 'forever' } : { policy: raw.policy, takeEffectFrom: raw.takeEffectFrom }; }
  async setPolicy(policy, takeEffectFrom) { if (!this.isRetentionPolicy(policy)) throw new Error(`Invalid retention policy: ${policy}`); await this.configStore.write({ policy, takeEffectFrom: policy === 'forever' ? undefined : takeEffectFrom }); }
  async getLastCleanupResult() { return this.lastCleanup; }
  async runCleanup() { if (this.cleanupRunning) return this.lastCleanup ?? this.createSkippedSummary(); this.cleanupRunning = true; try { return await this.runCleanupInner(); } finally { this.cleanupRunning = false; } }
  async runCleanupInner() {
    const startedAt = Date.now(); const state = await this.getPolicy(); const policyDays = retentionPolicyToDays(state.policy);
    if (policyDays == null) { const summary = this.createSkippedSummary(startedAt); this.lastCleanup = summary; return summary; }
    const cutoff = startedAt - policyDays * 24 * 60 * 60 * 1000; const takeEffectFrom = state.takeEffectFrom ?? startedAt; const sessions = await this.listCurrentUserSessions();
    const summary = { executed: true, startedAt, finishedAt: 0, candidatesScanned: 0, deleted: 0, archivedSkipped: 0 }; const touchedCwds = new Set();
    for (const session of sessions) {
      if (this.isArchived(session)) { summary.archivedSkipped += 1; continue; }
      if (session.deletedAt != null || session.createdAt < takeEffectFrom || this.resolveLastTouchedAt(session) >= cutoff) continue;
      summary.candidatesScanned += 1;
      try { await (await this.deps.storage).deleteSession(session.id); summary.deleted += 1; if (session.cwd) touchedCwds.add(session.cwd); await this.removeSandboxSessionDir(session.id, summary); await this.deleteSessionUsageSafe(session.id); if (session.cwd) await this.removeProjectSessionArtifacts(session.cwd, session.id, summary); } catch (error) { this.appendError(summary, `delete failed: ${session.id} - ${String(error?.message ?? error)}`); }
    }
    await this.maybePruneEmptyProjectDirs(touchedCwds, summary); summary.finishedAt = Date.now(); this.lastCleanup = summary; if (summary.deleted > 0) this.rootBytesCache = null; return summary;
  }
  createSkippedSummary(startedAt = Date.now()) { return { executed: false, startedAt, finishedAt: Date.now(), candidatesScanned: 0, deleted: 0, archivedSkipped: 0 }; }
  async listCurrentUserSessions(options) { const userId = await this.deps.getCurrentUserId?.(); if (!userId) return []; return (await this.deps.storage).getSessions({ userId, includeDeleted: options?.includeDeleted }); }
  async getDatabasePath() { return (await this.deps.database)?.getDatabasePath?.(); }
  async measureDatabaseBytes() { const databasePath = await this.getDatabasePath(); if (!databasePath) return 0; let total = 0; for (const filePath of [databasePath, `${databasePath}-shm`, `${databasePath}-wal`]) try { total += (await fs.promises.stat(filePath)).size; } catch {} return total; }
  async measureWorkbuddyRootBytes() { const root = this.deps.configDir; const now = Date.now(); if (this.rootBytesCache?.path === root && now - this.rootBytesCache.at < ROOT_BYTES_CACHE_TTL_MS) return this.rootBytesCache.bytes; try { const bytes = await walkDirectorySize(root); this.rootBytesCache = { path: root, bytes, at: now }; return bytes; } catch { return 0; } }
  async removeSandboxSessionDir(sessionId, summary) { if (!isSafeSessionArtifactId(sessionId)) { this.appendError(summary, `skip sandbox cleanup: unsafe session id ${sessionId}`); return; } const target = safeJoinWithin(path.join(this.deps.configDir, 'workspace', 'sessions'), sessionId); if (!target) { this.appendError(summary, `skip sandbox cleanup: target escapes root for ${sessionId}`); return; } await fs.promises.rm(target, { recursive: true, force: true }).catch(() => {}); }
  async deleteSessionUsageSafe(sessionId) { try { await (await this.deps.database)?.deleteSessionUsage?.(sessionId); } catch {} }
  async removeProjectSessionArtifacts(cwd, sessionId, summary) { if (!isSafeSessionArtifactId(sessionId)) { this.appendError(summary, `skip project artifacts cleanup: unsafe session id ${sessionId}`); return; } const projectsRoot = path.join(this.deps.configDir, 'projects'); const slugDir = safeJoinWithin(projectsRoot, compressCwdToSlug(cwd)); if (!slugDir) return; const jsonlPath = safeJoinWithin(slugDir, `${sessionId}.jsonl`); if (!jsonlPath) return; try { await fs.promises.stat(jsonlPath); } catch { return; } for (const target of [jsonlPath, safeJoinWithin(slugDir, sessionId), safeJoinWithin(slugDir, `${sessionId}.meta.json`)].filter(Boolean)) try { await fs.promises.rm(target, { recursive: true, force: true }); } catch (error) { this.appendError(summary, `rm ${path.relative(projectsRoot, target)} failed: ${String(error?.message ?? error)}`); } }
  async maybePruneEmptyProjectDirs(touchedCwds, summary) { if (touchedCwds.size === 0) return; const projectsRoot = path.join(this.deps.configDir, 'projects'); for (const cwd of touchedCwds) { const slugDir = safeJoinWithin(projectsRoot, compressCwdToSlug(cwd)); if (!slugDir) continue; try { if ((await fs.promises.readdir(slugDir)).filter((name) => name !== '.DS_Store').length === 0) await fs.promises.rm(slugDir, { recursive: true, force: true }); } catch (error) { if (error?.code !== 'ENOENT') this.appendError(summary, `prune projects: ${String(error?.message ?? error)}`); } } }
  isArchived(session) { return session.archivedAt != null || typeof session.status === 'string' && session.status.toLowerCase() === 'archived'; }
  resolveLastTouchedAt(session) { return session.lastActivityAt ?? session.updatedAt ?? session.createdAt ?? 0; }
  isRetentionPolicy(policy) { return ['forever', 'days_30', 'days_60', 'days_90'].includes(policy); }
  appendError(summary, message) { summary.errors ??= []; if (summary.errors.length < MAX_KEPT_ERRORS) summary.errors.push(message); }
}
function createDataRetentionService(deps) { const service = new DataRetentionService(deps); if (deps.autoSchedule) service.startSchedule(); return service; }

module.exports = Object.freeze({ DEFAULT_POLICY, MAX_KEPT_ERRORS, ROOT_BYTES_CACHE_TTL_MS, STARTUP_DELAY_MS, FALLBACK_INTERVAL_MS, DataRetentionService, createDataRetentionService });
