'use strict';

const { index, integer, sqliteTable, text, uniqueIndex } = require('drizzle-orm/sqlite-core');

const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(), cwd: text('cwd').notNull(), userId: text('user_id').notNull(),
  title: text('title'), customTitle: text('custom_title'), status: text('status').notNull().default('Pending'),
  createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull(),
  lastActivityAt: integer('last_activity_at'), deletedAt: integer('deleted_at'),
  isPlayground: integer('is_playground').notNull().default(0), sourceMode: text('source_mode'),
  isBackgroundAutomation: integer('is_background_automation'), mode: text('mode'), model: text('model'),
  expertId: text('expert_id'), expertLocale: text('expert_locale'), expertRuntimeIdentity: text('expert_runtime_identity'),
  expertMarketplace: text('expert_marketplace'), permissionMode: text('permission_mode'),
  useSandboxCli: integer('use_sandbox_cli'), projectId: text('project_id')
});

const workspaces = sqliteTable('workspaces', {
  path: text('path').primaryKey(), lastOpenedAt: integer('last_opened_at').notNull()
});

const automations = sqliteTable('automations', {
  id: text('id').primaryKey(), name: text('name').notNull(), prompt: text('prompt').notNull(), status: text('status').notNull(),
  scheduleType: text('schedule_type').notNull().default('recurring'), nextRunAt: integer('next_run_at'), lastRunAt: integer('last_run_at'),
  cwds: text('cwds').notNull().default('[]'), rrule: text('rrule').notNull().default(''), scheduledAt: text('scheduled_at'),
  validFrom: text('valid_from'), validUntil: text('valid_until'), modelId: text('model_id'), modelIsThinking: integer('model_is_thinking').notNull().default(0),
  skillsJson: text('skills_json').notNull().default('[]'), pushToWeChat: integer('push_to_wechat').notNull().default(0),
  pushToWecomBot: integer('push_to_wecom_bot').notNull().default(0), ownerUserId: text('owner_user_id'),
  ownerStatus: text('owner_status').notNull().default('legacy_unassigned'), ownerSource: text('owner_source'), expertId: text('expert_id'),
  expertMarketplace: text('expert_marketplace'), connectorIdsJson: text('connector_ids_json').notNull().default('[]'),
  permissionMode: text('permission_mode'), createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull(), deletedAt: integer('deleted_at')
}, (table) => ({ owner: index('idx_automations_owner').on(table.ownerUserId, table.ownerStatus, table.deletedAt) }));

const automationRuns = sqliteTable('automation_runs', {
  threadId: text('thread_id').primaryKey(), automationId: text('automation_id').notNull(), status: text('status').notNull(),
  readAt: integer('read_at'), threadTitle: text('thread_title'), sourceCwd: text('source_cwd'), runsJson: text('runs_json'),
  resultSuccess: integer('result_success'), metadataJson: text('metadata_json'), createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull()
});

const automationRuntimeState = sqliteTable('automation_runtime_state', {
  automationId: text('automation_id').primaryKey(), lastRunAt: integer('last_run_at'), lastError: text('last_error'),
  running: integer('running').notNull().default(0), runningStartedAt: integer('running_started_at'), runningConversationId: text('running_conversation_id'), metadataJson: text('metadata_json')
});

const automationDeliveryOutbox = sqliteTable('automation_delivery_outbox', {
  id: text('id').primaryKey(), dedupeKey: text('dedupe_key').notNull(), channel: text('channel').notNull().default('wechatmp'),
  automationId: text('automation_id').notNull(), runId: text('run_id').notNull(), automationName: text('automation_name').notNull(),
  ownerUserId: text('owner_user_id'), hostId: text('host_id'), payloadJson: text('payload_json').notNull(), status: text('status').notNull(),
  attemptCount: integer('attempt_count').notNull().default(0), maxAttempts: integer('max_attempts').notNull().default(5), nextRunAt: integer('next_run_at').notNull(),
  leaseOwner: text('lease_owner'), leaseExpireAt: integer('lease_expire_at'), lastErrorCode: text('last_error_code'), lastErrorMessage: text('last_error_message'),
  deliveryId: text('delivery_id'), createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull(), finishedAt: integer('finished_at')
}, (table) => ({
  dedupe: uniqueIndex('automation_delivery_outbox_dedupe_key_unique').on(table.dedupeKey),
  statusNextRun: index('idx_automation_delivery_outbox_status_next_run').on(table.status, table.nextRunAt),
  channelStatusNextRun: index('idx_automation_delivery_outbox_channel_status_next_run').on(table.channel, table.status, table.nextRunAt),
  run: index('idx_automation_delivery_outbox_run').on(table.automationId, table.runId),
  ownerStatus: index('idx_automation_delivery_outbox_owner_status').on(table.ownerUserId, table.status),
  supersedeLookup: index('idx_automation_delivery_outbox_supersede_lookup').on(table.automationId, table.channel, table.ownerUserId, table.hostId, table.createdAt)
}));

const migrationMeta = sqliteTable('migration_meta', { key: text('key').primaryKey(), value: text('value').notNull() });
const sessionUsage = sqliteTable('session_usage', {
  sessionId: text('session_id').primaryKey(), used: integer('used').notNull(), size: integer('size').notNull(), updatedAt: integer('updated_at').notNull(), creditJson: text('credit_json')
});

const schema = { sessions, workspaces, automations, automationRuns, automationRuntimeState, automationDeliveryOutbox, migrationMeta, sessionUsage };

module.exports = Object.freeze({ schema, sessions, workspaces, automations, automationRuns, automationRuntimeState, automationDeliveryOutbox, migrationMeta, sessionUsage });
