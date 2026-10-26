'use strict';

const { and, desc, eq, inArray, isNull, or, sql } = require('drizzle-orm');
const { excludedColumn } = require('../sqlite/connection');
const { sessions, workspaces } = require('../drizzle/schema');
const { canonicalizeStoredPath } = require('./types');

function escapeSqliteLikePattern(value) { return value.replace(/[\\%_]/g, (character) => `\\${character}`); }

class SessionRepository {
  constructor(getDb) { this.getDb = getDb; }

  upsert(session) {
    const db = this.getDb();
    const canonicalCwd = canonicalizeStoredPath(session.cwd);
    const model = typeof session.model === 'string' && session.model.trim().length === 0 ? undefined : session.model;
    db.insert(sessions).values({ id: session.id, cwd: canonicalCwd, userId: session.userId, title: session.title ?? null, customTitle: session.customTitle ?? null, status: session.status, createdAt: session.createdAt, updatedAt: session.updatedAt, lastActivityAt: session.lastActivityAt ?? null, deletedAt: session.deletedAt ?? null, isPlayground: session.isPlayground ? 1 : 0, sourceMode: session.sourceMode ?? null, isBackgroundAutomation: session.isBackgroundAutomation ? 1 : null, mode: session.mode ?? null, model: model ?? null, expertId: session.expertId ?? null, expertLocale: session.expertLocale ?? null, expertRuntimeIdentity: session.expertRuntimeIdentity ?? null, expertMarketplace: session.expertMarketplace ?? null, permissionMode: session.permissionMode ?? null, useSandboxCli: session.useSandboxCLI === true ? 1 : session.useSandboxCLI === false ? 0 : null, projectId: session.projectId ?? null }).onConflictDoUpdate({
      target: sessions.id,
      set: { cwd: excludedColumn('cwd'), userId: sql`CASE WHEN ${sessions.userId} IS NOT NULL AND ${sessions.userId} != '' THEN ${sessions.userId} ELSE ${excludedColumn('user_id')} END`, title: sql`COALESCE(${excludedColumn('title')}, ${sessions.title})`, customTitle: sql`COALESCE(${excludedColumn('custom_title')}, ${sessions.customTitle})`, status: sql`CASE WHEN LOWER(${sessions.status}) = 'archived' THEN ${sessions.status} ELSE ${excludedColumn('status')} END`, createdAt: excludedColumn('created_at'), updatedAt: excludedColumn('updated_at'), lastActivityAt: sql`COALESCE(${excludedColumn('last_activity_at')}, ${sessions.lastActivityAt})`, deletedAt: excludedColumn('deleted_at'), isPlayground: sql`CASE WHEN ${sessions.isPlayground} = 0 THEN 0 ELSE ${excludedColumn('is_playground')} END`, sourceMode: sql`COALESCE(${excludedColumn('source_mode')}, ${sessions.sourceMode})`, isBackgroundAutomation: sql`COALESCE(${excludedColumn('is_background_automation')}, ${sessions.isBackgroundAutomation})`, mode: sql`COALESCE(${excludedColumn('mode')}, ${sessions.mode})`, model: sql`COALESCE(${excludedColumn('model')}, ${sessions.model})`, expertId: sql`COALESCE(${excludedColumn('expert_id')}, ${sessions.expertId})`, expertLocale: sql`COALESCE(${excludedColumn('expert_locale')}, ${sessions.expertLocale})`, expertRuntimeIdentity: sql`COALESCE(${excludedColumn('expert_runtime_identity')}, ${sessions.expertRuntimeIdentity})`, expertMarketplace: sql`COALESCE(${excludedColumn('expert_marketplace')}, ${sessions.expertMarketplace})`, permissionMode: sql`COALESCE(${excludedColumn('permission_mode')}, ${sessions.permissionMode})`, useSandboxCli: sql`COALESCE(${excludedColumn('use_sandbox_cli')}, ${sessions.useSandboxCli})`, projectId: sql`COALESCE(${excludedColumn('project_id')}, ${sessions.projectId})` },
    }).run();
    if (!session.isPlayground) this.upsertWorkspace(canonicalCwd, session.updatedAt);
  }

  updateStatus(id, status, updatedAt) { return Number(this.getDb().update(sessions).set({ status, updatedAt }).where(eq(sessions.id, id)).run()?.changes ?? 0); }
  updatePermissionMode(id, permissionMode) { return Number(this.getDb().update(sessions).set({ permissionMode, updatedAt: Date.now() }).where(eq(sessions.id, id)).run()?.changes ?? 0); }
  get(id) { const row = this.getDb().select().from(sessions).where(eq(sessions.id, id)).limit(1).get(); return row ? this.mapRow(row) : undefined; }
  list(filter) {
    if (!filter?.userId) return [];
    const userFilter = or(eq(sessions.userId, filter.userId), isNull(sessions.userId), eq(sessions.userId, ''));
    const rows = this.getDb().select().from(sessions).where(filter.includeDeleted ? userFilter : and(userFilter, isNull(sessions.deletedAt))).orderBy(desc(sessions.updatedAt)).all();
    return rows.map((row) => this.mapRow(row));
  }
  getLatestByCwdSuffix(cwdSuffix, userId) {
    const cwdPattern = `%${escapeSqliteLikePattern(cwdSuffix)}`;
    const row = this.getDb().select().from(sessions).where(and(sql`${sessions.cwd} LIKE ${cwdPattern} ESCAPE ${'\\'}`, or(eq(sessions.userId, userId), isNull(sessions.userId), eq(sessions.userId, '')), isNull(sessions.deletedAt))).orderBy(desc(sessions.updatedAt)).limit(1).get();
    return row ? this.mapRow(row) : undefined;
  }
  fixNonTerminal(terminatedAt = Date.now()) { return Number(this.getDb().update(sessions).set({ status: 'Terminated', updatedAt: terminatedAt }).where(sql`LOWER(${sessions.status}) NOT IN ('completed', 'failed', 'terminated', 'archived')`).run()?.changes ?? 0); }
  delete(id, deletedAt = Date.now()) { this.getDb().update(sessions).set({ deletedAt, updatedAt: deletedAt }).where(eq(sessions.id, id)).run(); }
  upsertWorkspace(workspacePath, lastOpenedAt = Date.now()) { if (!workspacePath) return; const path = canonicalizeStoredPath(workspacePath); this.getDb().insert(workspaces).values({ path, lastOpenedAt }).onConflictDoUpdate({ target: workspaces.path, set: { lastOpenedAt: excludedColumn('last_opened_at') } }).run(); }
  getWorkspaces() { return this.getDb().select({ path: workspaces.path }).from(workspaces).where(sql`EXISTS (SELECT 1 FROM ${sessions} WHERE ${sessions.cwd} = ${workspaces.path} AND ${sessions.deletedAt} IS NULL AND COALESCE(${sessions.isPlayground}, 0) = 0)`).orderBy(desc(workspaces.lastOpenedAt)).all().map((row) => row.path); }
  getUserIdsByIds(sessionIds) { const ids = [...new Set((sessionIds ?? []).filter(Boolean))]; const result = []; for (let offset = 0; offset < ids.length; offset += 500) { const rows = this.getDb().select({ id: sessions.id, userId: sessions.userId }).from(sessions).where(inArray(sessions.id, ids.slice(offset, offset + 500))).all(); result.push(...rows.map((row) => ({ id: row.id, userId: row.userId ?? '' }))); } return result; }
  mapRow(row) { return { id: row.id, cwd: row.cwd, userId: row.userId, title: row.title || undefined, customTitle: row.customTitle || undefined, status: row.status, createdAt: Number(row.createdAt), updatedAt: Number(row.updatedAt), lastActivityAt: row.lastActivityAt == null ? undefined : Number(row.lastActivityAt), deletedAt: row.deletedAt == null ? undefined : Number(row.deletedAt), isPlayground: Boolean(row.isPlayground), sourceMode: row.sourceMode || undefined, isBackgroundAutomation: row.isBackgroundAutomation == null ? undefined : Boolean(row.isBackgroundAutomation), mode: row.mode || undefined, model: row.model || undefined, expertId: row.expertId || undefined, expertLocale: row.expertLocale || undefined, expertRuntimeIdentity: row.expertRuntimeIdentity || undefined, expertMarketplace: row.expertMarketplace || undefined, permissionMode: row.permissionMode || undefined, useSandboxCLI: row.useSandboxCli == null ? undefined : Boolean(row.useSandboxCli), projectId: row.projectId || undefined }; }
}

module.exports = Object.freeze({ SessionRepository, escapeSqliteLikePattern });
