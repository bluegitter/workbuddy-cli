'use strict';

const fs = require('node:fs');
const { inArray, sql } = require('drizzle-orm');
const { automations, automationRuns, sessions } = require('../drizzle/schema');
const { configureWorkbuddySqliteConnection } = require('./runtime');
const { createWorkbuddyDrizzleDatabase, openWorkbuddyRawSqliteDatabase } = require('./connection');

function cleanupGhostDataAfterWalCheckpoint(dbPath) {
  const rawDb = openWorkbuddyRawSqliteDatabase(dbPath);
  try {
    configureWorkbuddySqliteConnection(rawDb);
    const db = createWorkbuddyDrizzleDatabase(rawDb);
    const now = Date.now();
    const emptyResult = db.update(sessions).set({ deletedAt: now, updatedAt: now }).where(sql`${sessions.deletedAt} IS NULL AND (${sessions.cwd} IS NULL OR TRIM(${sessions.cwd}) = '')`).run();
    const emptyCwdSessions = Number(emptyResult.changes ?? 0);
    const sessionIdsToClean = db.select({ id: sessions.id, cwd: sessions.cwd }).from(sessions).where(sql`${sessions.deletedAt} IS NULL AND ${sessions.cwd} IS NOT NULL AND TRIM(${sessions.cwd}) != ''`).all().filter((session) => !fs.existsSync(session.cwd)).map((session) => session.id);
    const missingCwdSessions = sessionIdsToClean.length ? Number(db.update(sessions).set({ deletedAt: now, updatedAt: now }).where(inArray(sessions.id, sessionIdsToClean)).run().changes ?? 0) : 0;
    const automationsWithCwds = db.select({ id: automations.id, cwds: automations.cwds }).from(automations).where(sql`${automations.deletedAt} IS NULL AND ${automations.cwds} IS NOT NULL AND TRIM(${automations.cwds}) != '' AND TRIM(${automations.cwds}) != '[]'`).all();
    const automationIdsToClean = [];
    for (const automation of automationsWithCwds) try { const cwdList = JSON.parse(automation.cwds); if (!Array.isArray(cwdList) || cwdList.length === 0 || cwdList.every((cwd) => typeof cwd === 'string' && !fs.existsSync(cwd))) automationIdsToClean.push(automation.id); } catch { automationIdsToClean.push(automation.id); }
    const missingCwdAutomations = automationIdsToClean.length ? Number(db.update(automations).set({ deletedAt: now, updatedAt: now }).where(inArray(automations.id, automationIdsToClean)).run().changes ?? 0) : 0;
    const runIdsToClean = db.select({ threadId: automationRuns.threadId, sourceCwd: automationRuns.sourceCwd }).from(automationRuns).where(sql`${automationRuns.sourceCwd} IS NOT NULL AND TRIM(${automationRuns.sourceCwd}) != ''`).all().filter((run) => !fs.existsSync(run.sourceCwd)).map((run) => run.threadId);
    const missingSourceCwdRuns = runIdsToClean.length ? Number(db.delete(automationRuns).where(inArray(automationRuns.threadId, runIdsToClean)).run().changes ?? 0) : 0;
    return { emptyCwdSessions, missingCwdSessions, missingCwdAutomations, missingSourceCwdRuns };
  } finally { rawDb.close(); }
}
module.exports = Object.freeze({ cleanupGhostDataAfterWalCheckpoint });
