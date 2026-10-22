'use strict';
const LOCAL_FILE_MUTATION_TOOLS = new Set(['write_to_file', 'replace_in_file', 'delete_file']);
const SIDE_EFFECT_ONLY_AUTOMATION_TOOLS = new Set(['execute_command', 'mcp_call_tool', 'invoke_integration']);
const DELIVERY_AUTOMATION_TOOLS = new Set(['present_files', 'workbuddy_present_files', 'deliver_attachments']);
const READ_ONLY_AUTOMATION_TOOLS = new Set(['list_dir', 'read_file', 'read_lints', 'search_content', 'search_file', 'web_fetch', 'web_search', 'rag_search']);
function normalizeAutomationToolName(name) { return String(name || '').trim().toLowerCase(); }
function isAutomationBookkeepingToolName(name) { const value = normalizeAutomationToolName(name); return value.includes('/.workbuddy/automations/') || value.includes('/.workbuddy/memory/') || (value.includes('mkdir -p') && value.includes('/.workbuddy/')); }
function isReadOnlyAutomationToolName(name) { const value = normalizeAutomationToolName(name); if (!value || isAutomationBookkeepingToolName(value)) return false; return READ_ONLY_AUTOMATION_TOOLS.has(value) || ['read', 'grep', 'glob', 'ls'].includes(value) || /^(read|grep|glob|ls) /.test(value); }
function isLocalFileMutationToolName(name) { const value = normalizeAutomationToolName(name); if (!value || isAutomationBookkeepingToolName(value)) return false; return LOCAL_FILE_MUTATION_TOOLS.has(value) || ['write', 'edit', 'multiedit', 'notebookedit'].includes(value) || /^(write|edit|delete) /.test(value); }
function isExternalActionToolName(name) { const value = normalizeAutomationToolName(name); if (!value || isAutomationBookkeepingToolName(value)) return false; return SIDE_EFFECT_ONLY_AUTOMATION_TOOLS.has(value) || ['bash', 'powershell'].includes(value) || value.startsWith('`'); }
function isDeliveryToolName(name) { return DELIVERY_AUTOMATION_TOOLS.has(normalizeAutomationToolName(name)); }
function isRetryBlockingToolName(name) { const value = normalizeAutomationToolName(name); return !value || (!isAutomationBookkeepingToolName(value) && !isReadOnlyAutomationToolName(value)); }
module.exports = { LOCAL_FILE_MUTATION_TOOLS, SIDE_EFFECT_ONLY_AUTOMATION_TOOLS, DELIVERY_AUTOMATION_TOOLS, READ_ONLY_AUTOMATION_TOOLS, normalizeAutomationToolName, isAutomationBookkeepingToolName, isReadOnlyAutomationToolName, isLocalFileMutationToolName, isExternalActionToolName, isDeliveryToolName, isRetryBlockingToolName };
