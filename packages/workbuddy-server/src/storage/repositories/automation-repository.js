'use strict';

const { and, asc, desc, eq, isNull, ne, sql } = require('drizzle-orm');
const { excludedColumn } = require('../sqlite/connection');
const { automations, automationRuns, automationRuntimeState } = require('../drizzle/schema');
const { canonicalizeStoredPath } = require('./types');

class AutomationRepository {
  constructor(getDb) {
    this.getDb = getDb;
  }

  upsert(automation) {
    this.getDb().insert(automations).values({
      id: automation.id,
      name: automation.name,
      prompt: automation.prompt,
      status: automation.status,
      scheduleType: automation.scheduleType,
      nextRunAt: automation.nextRunAt ?? null,
      lastRunAt: automation.lastRunAt ?? null,
      cwds: JSON.stringify((automation.cwds ?? []).map(canonicalizeStoredPath)),
      rrule: automation.rrule,
      scheduledAt: automation.scheduledAt ?? null,
      validFrom: automation.validFrom ?? null,
      validUntil: automation.validUntil ?? null,
      modelId: automation.modelId ?? null,
      modelIsThinking: automation.modelIsThinking ? 1 : 0,
      skillsJson: JSON.stringify(automation.skills ?? []),
      pushToWeChat: automation.pushToWeChat ? 1 : 0,
      pushToWecomBot: automation.pushToWecomBot ? 1 : 0,
      ownerUserId: automation.ownerUserId ?? null,
      ownerStatus: automation.ownerStatus ?? 'legacy_unassigned',
      ownerSource: automation.ownerSource ?? null,
      expertId: automation.expertId ?? null,
      expertMarketplace: automation.expertMarketplace ?? null,
      connectorIdsJson: JSON.stringify(automation.connectorIds ?? []),
      permissionMode: automation.permissionMode ?? null,
      createdAt: automation.createdAt,
      updatedAt: automation.updatedAt,
      deletedAt: automation.deletedAt ?? null,
    }).onConflictDoUpdate({
      target: automations.id,
      set: {
        name: excludedColumn('name'),
        prompt: excludedColumn('prompt'),
        status: excludedColumn('status'),
        scheduleType: excludedColumn('schedule_type'),
        nextRunAt: excludedColumn('next_run_at'),
        lastRunAt: excludedColumn('last_run_at'),
        cwds: excludedColumn('cwds'),
        rrule: excludedColumn('rrule'),
        scheduledAt: excludedColumn('scheduled_at'),
        validFrom: excludedColumn('valid_from'),
        validUntil: excludedColumn('valid_until'),
        modelId: excludedColumn('model_id'),
        modelIsThinking: excludedColumn('model_is_thinking'),
        skillsJson: excludedColumn('skills_json'),
        pushToWeChat: excludedColumn('push_to_wechat'),
        pushToWecomBot: excludedColumn('push_to_wecom_bot'),
        ownerUserId: excludedColumn('owner_user_id'),
        ownerStatus: excludedColumn('owner_status'),
        ownerSource: excludedColumn('owner_source'),
        expertId: excludedColumn('expert_id'),
        expertMarketplace: excludedColumn('expert_marketplace'),
        connectorIdsJson: excludedColumn('connector_ids_json'),
        permissionMode: excludedColumn('permission_mode'),
        createdAt: excludedColumn('created_at'),
        updatedAt: excludedColumn('updated_at'),
        deletedAt: sql`COALESCE(${excludedColumn('deleted_at')}, ${automations.deletedAt})`,
      },
    }).run();
  }

  updateNextRunAt(id, nextRunAt) {
    this.getDb().update(automations).set({
      nextRunAt: nextRunAt ?? null,
      updatedAt: Date.now(),
    }).where(eq(automations.id, id)).run();
  }

  get(id, options) {
    const condition = options?.includeDeleted
      ? eq(automations.id, id)
      : and(eq(automations.id, id), isNull(automations.deletedAt));
    const row = this.getDb().select().from(automations).where(condition).limit(1).get();
    return row ? this.mapAutomation(row) : undefined;
  }

  list(filter) {
    let query = this.getDb().select().from(automations).$dynamic();
    if (!filter?.includeDeleted) query = query.where(isNull(automations.deletedAt));
    return query.orderBy(desc(automations.createdAt)).all().map((row) => this.mapAutomation(row));
  }

  softDelete(id, deletedAt = Date.now()) {
    this.getDb().update(automations).set({
      deletedAt,
      updatedAt: deletedAt,
    }).where(and(eq(automations.id, id), isNull(automations.deletedAt))).run();
  }

  upsertRun(run) {
    this.getDb().insert(automationRuns).values({
      threadId: run.threadId,
      automationId: run.automationId,
      status: run.status,
      readAt: run.readAt ?? null,
      threadTitle: run.threadTitle ?? null,
      sourceCwd: run.sourceCwd ? canonicalizeStoredPath(run.sourceCwd) : null,
      runsJson: run.runsJson ?? null,
      resultSuccess: run.resultSuccess === undefined ? null : run.resultSuccess ? 1 : 0,
      metadataJson: run.metadataJson ?? null,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    }).onConflictDoUpdate({
      target: automationRuns.threadId,
      set: {
        automationId: excludedColumn('automation_id'),
        status: excludedColumn('status'),
        readAt: excludedColumn('read_at'),
        threadTitle: excludedColumn('thread_title'),
        sourceCwd: excludedColumn('source_cwd'),
        runsJson: excludedColumn('runs_json'),
        resultSuccess: excludedColumn('result_success'),
        metadataJson: excludedColumn('metadata_json'),
        createdAt: excludedColumn('created_at'),
        updatedAt: excludedColumn('updated_at'),
      },
    }).run();
  }

  getRun(threadId) {
    const row = this.getDb().select().from(automationRuns)
      .where(eq(automationRuns.threadId, threadId)).limit(1).get();
    return row ? this.mapRun(row) : undefined;
  }

  getRunSizes() {
    return this.getDb().select({
      threadId: automationRuns.threadId,
      automationId: automationRuns.automationId,
      status: automationRuns.status,
      runsJsonChars: sql`COALESCE(LENGTH(${automationRuns.runsJson}), 0)`,
      updatedAt: automationRuns.updatedAt,
    }).from(automationRuns).all().map((row) => ({
      threadId: row.threadId,
      automationId: row.automationId,
      status: row.status,
      runsJsonChars: Number(row.runsJsonChars ?? 0),
      updatedAt: row.updatedAt,
    }));
  }

  getRuns(automationId) {
    let query = this.getDb().select().from(automationRuns).$dynamic();
    if (automationId) query = query.where(eq(automationRuns.automationId, automationId));
    return query.orderBy(desc(automationRuns.updatedAt)).all().map((row) => this.mapRun(row));
  }

  getRunOwnerEvidenceRows(automationId, runsJsonCharLimit) {
    const runsJsonChars = sql`COALESCE(LENGTH(${automationRuns.runsJson}), 0)`;
    return this.getDb().select({
      runsJson: sql`CASE WHEN ${runsJsonChars} <= ${runsJsonCharLimit} THEN ${automationRuns.runsJson} ELSE NULL END`,
      runsJsonChars,
    }).from(automationRuns).where(and(
      eq(automationRuns.automationId, automationId),
      ne(automationRuns.status, 'IN_PROGRESS'),
    )).orderBy(asc(automationRuns.createdAt), asc(automationRuns.updatedAt)).all().map((row) => {
      const chars = Number(row.runsJsonChars ?? 0);
      return {
        runsJson: row.runsJson ? String(row.runsJson) : undefined,
        oversized: chars > runsJsonCharLimit,
      };
    });
  }

  upsertRuntimeState(state) {
    this.getDb().insert(automationRuntimeState).values(toRuntimeStateRow(state))
      .onConflictDoUpdate({
        target: automationRuntimeState.automationId,
        set: runtimeStateConflictUpdate(),
      }).run();
  }

  replaceRuntimeStates(states) {
    this.getDb().transaction((transaction) => {
      transaction.delete(automationRuntimeState).run();
      for (const state of states) {
        transaction.insert(automationRuntimeState).values(toRuntimeStateRow(state))
          .onConflictDoUpdate({
            target: automationRuntimeState.automationId,
            set: runtimeStateConflictUpdate(),
          }).run();
      }
    });
  }

  getRuntimeStates() {
    return this.getDb().select().from(automationRuntimeState).all()
      .map((row) => this.mapRuntimeState(row));
  }

  deleteRun(threadId) {
    this.getDb().delete(automationRuns).where(eq(automationRuns.threadId, threadId)).run();
  }

  compactReplaceRunsJson(params) {
    const result = this.getDb().update(automationRuns).set({
      runsJson: params.nextRunsJson,
    }).where(and(
      eq(automationRuns.threadId, params.threadId),
      eq(automationRuns.automationId, params.expectedAutomationId),
      ne(automationRuns.status, 'IN_PROGRESS'),
      eq(automationRuns.updatedAt, params.expectedUpdatedAt),
      sql`COALESCE(LENGTH(${automationRuns.runsJson}), 0) = ${params.expectedRunsJsonChars}`,
    )).run();
    return Number(result.changes ?? 0) === 1;
  }

  mapAutomation(row) {
    return {
      id: row.id,
      name: row.name,
      prompt: row.prompt,
      status: row.status,
      scheduleType: row.scheduleType,
      nextRunAt: row.nextRunAt == null ? undefined : Number(row.nextRunAt),
      lastRunAt: row.lastRunAt == null ? undefined : Number(row.lastRunAt),
      cwds: parseJsonArray(row.cwds),
      rrule: row.rrule ?? '',
      scheduledAt: row.scheduledAt || undefined,
      validFrom: row.validFrom || undefined,
      validUntil: row.validUntil || undefined,
      modelId: row.modelId || undefined,
      modelIsThinking: Boolean(row.modelIsThinking),
      skills: parseJsonArray(row.skillsJson),
      pushToWeChat: Boolean(row.pushToWeChat),
      pushToWecomBot: Boolean(row.pushToWecomBot),
      ownerUserId: row.ownerUserId || undefined,
      ownerStatus: row.ownerStatus || 'legacy_unassigned',
      ownerSource: row.ownerSource || undefined,
      expertId: row.expertId || undefined,
      expertMarketplace: row.expertMarketplace || undefined,
      connectorIds: parseJsonArray(row.connectorIdsJson),
      permissionMode: parsePermissionMode(row.permissionMode),
      createdAt: Number(row.createdAt),
      updatedAt: Number(row.updatedAt),
      deletedAt: row.deletedAt == null ? undefined : Number(row.deletedAt),
    };
  }

  mapRun(row) {
    return {
      threadId: row.threadId,
      automationId: row.automationId,
      status: row.status,
      readAt: row.readAt == null ? undefined : Number(row.readAt),
      threadTitle: row.threadTitle || undefined,
      sourceCwd: row.sourceCwd || undefined,
      runsJson: row.runsJson || undefined,
      resultSuccess: row.resultSuccess == null ? undefined : Boolean(row.resultSuccess),
      metadataJson: row.metadataJson || undefined,
      createdAt: Number(row.createdAt),
      updatedAt: Number(row.updatedAt),
    };
  }

  mapRuntimeState(row) {
    return {
      automationId: row.automationId,
      lastRunAt: row.lastRunAt == null ? undefined : Number(row.lastRunAt),
      lastError: row.lastError || undefined,
      running: Boolean(row.running),
      runningStartedAt: row.runningStartedAt == null ? undefined : Number(row.runningStartedAt),
      runningConversationId: row.runningConversationId || undefined,
      metadataJson: row.metadataJson || undefined,
    };
  }
}

function toRuntimeStateRow(state) {
  return {
    automationId: state.automationId,
    lastRunAt: state.lastRunAt ?? null,
    lastError: state.lastError ?? null,
    running: state.running ? 1 : 0,
    runningStartedAt: state.runningStartedAt ?? null,
    runningConversationId: state.runningConversationId ?? null,
    metadataJson: state.metadataJson ?? null,
  };
}

function runtimeStateConflictUpdate() {
  return {
    lastRunAt: excludedColumn('last_run_at'),
    lastError: excludedColumn('last_error'),
    running: excludedColumn('running'),
    runningStartedAt: excludedColumn('running_started_at'),
    runningConversationId: excludedColumn('running_conversation_id'),
    metadataJson: excludedColumn('metadata_json'),
  };
}

function parseJsonArray(value) {
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function parsePermissionMode(value) {
  return value === 'fullAccess' || value === 'default' ? value : undefined;
}

module.exports = Object.freeze({
  AutomationRepository,
  parseJsonArray,
  parsePermissionMode,
  runtimeStateConflictUpdate,
  toRuntimeStateRow,
});
