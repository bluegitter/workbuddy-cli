'use strict';

const CURRENT_REQUIRED_TABLE_COLUMNS = Object.freeze({
  sessions: Object.freeze([
    'id', 'cwd', 'user_id', 'title', 'custom_title', 'status', 'created_at', 'updated_at',
    'last_activity_at', 'deleted_at', 'is_playground', 'source_mode',
    'is_background_automation', 'mode', 'model', 'expert_id', 'expert_locale',
    'expert_runtime_identity', 'expert_marketplace', 'permission_mode', 'use_sandbox_cli',
    'project_id',
  ]),
  workspaces: Object.freeze(['path', 'last_opened_at']),
  automations: Object.freeze([
    'id', 'name', 'prompt', 'status', 'schedule_type', 'next_run_at', 'last_run_at',
    'cwds', 'rrule', 'scheduled_at', 'valid_from', 'valid_until', 'model_id',
    'model_is_thinking', 'skills_json', 'push_to_wechat', 'push_to_wecom_bot',
    'owner_user_id', 'owner_status', 'owner_source', 'expert_id', 'expert_marketplace',
    'connector_ids_json', 'permission_mode', 'created_at', 'updated_at', 'deleted_at',
  ]),
  automation_runs: Object.freeze([
    'thread_id', 'automation_id', 'status', 'read_at', 'thread_title', 'source_cwd',
    'runs_json', 'result_success', 'metadata_json', 'created_at', 'updated_at',
  ]),
  automation_runtime_state: Object.freeze([
    'automation_id', 'last_run_at', 'last_error', 'running', 'running_started_at',
    'running_conversation_id', 'metadata_json',
  ]),
  automation_delivery_outbox: Object.freeze([
    'id', 'dedupe_key', 'channel', 'automation_id', 'run_id', 'automation_name',
    'owner_user_id', 'host_id', 'payload_json', 'status', 'attempt_count', 'max_attempts',
    'next_run_at', 'lease_owner', 'lease_expire_at', 'last_error_code',
    'last_error_message', 'delivery_id', 'created_at', 'updated_at', 'finished_at',
  ]),
  migration_meta: Object.freeze(['key', 'value']),
  session_usage: Object.freeze(['session_id', 'used', 'size', 'updated_at', 'credit_json']),
});

module.exports = { CURRENT_REQUIRED_TABLE_COLUMNS };
