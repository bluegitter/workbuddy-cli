'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getWorkbuddyRuntimeConfigDir } = require('../server/runtime-context');
const {
  normalizeTeamMemberStatus,
  isActiveTeamMemberStatus,
  mergeTeamTokenUsage,
  coerceTeamTokenUsage,
} = require('../shared/team-runtime');

const TEAMMATE_MESSAGE_PATTERN = /<teammate-message\s+teammate_id="([^"]+)"(?:\s+summary="([^"]*)")?[^>]*>\n?([\s\S]*?)\n?<\/teammate-message>/;
const MAX_PERSISTED_HISTORY_ITEMS = 1000;
const IMAGE_PLACEHOLDER = '[Image]';
const LEGACY_TEAM_MEMBER_DISCOVERY_PREFIX_BYTES = 8 * 1024;
const MAX_CONCURRENT_TRANSCRIPT_READS = 4;
const TEAM_SYSTEM_PSEUDO_MEMBER_NAME = 'system';
const FRAMEWORK_AUTO_NOTIFICATION_MARKER = '[Framework Auto-Notification]';
let availableTranscriptReadPermits = MAX_CONCURRENT_TRANSCRIPT_READS;
const transcriptReadWaiters = [];

function isRecord(value) { return typeof value === 'object' && value !== null; }
function structuredCloneRecord(value) { return structuredClone(value); }
function safeJsonParse(value) { try { return JSON.parse(value); } catch { return undefined; } }
function isFrameworkAutoNotificationText(value) { const text = value?.trim() || ''; return Boolean(text) && text.includes(FRAMEWORK_AUTO_NOTIFICATION_MARKER); }
function parseTeammateMessage(text) {
  if (!text.includes('<teammate-message')) return null;
  const match = text.trim().match(TEAMMATE_MESSAGE_PATTERN);
  if (!match) return null;
  return { teammateId: match[1] ?? '', summary: match[2] || undefined, content: match[3] ?? '', raw: match[0].trim() };
}
function shouldIgnoreFrameworkSystemTeammateMessage(message) {
  return !!message && message.teammateId === TEAM_SYSTEM_PSEUDO_MEMBER_NAME && isFrameworkAutoNotificationText(message.content);
}
function getShutdownAcceptedStatus(message) {
  if (/^Shutdown accepted\b/i.test(message.summary?.trim() || '')) return 'completed';
  const payload = safeJsonParse(message.content);
  if (!isRecord(payload) || payload.type !== 'shutdown_response') return undefined;
  return payload.approve === false ? undefined : 'completed';
}
function shouldIgnoreFrameworkSystemHistoryItem(memberName, item) {
  if (memberName !== TEAM_SYSTEM_PSEUDO_MEMBER_NAME || item.sessionUpdate !== 'user_message_chunk') return false;
  const text = typeof item.content?.text === 'string' ? item.content.text.trim() : '';
  return !!text && shouldIgnoreFrameworkSystemTeammateMessage(parseTeammateMessage(text));
}
function sanitizePseudoTeamMembers(snapshot) {
  const history = snapshot.memberHistories[TEAM_SYSTEM_PSEUDO_MEMBER_NAME] || [];
  if (history.length === 0) return;
  const filtered = history.filter((item) => !shouldIgnoreFrameworkSystemHistoryItem(TEAM_SYSTEM_PSEUDO_MEMBER_NAME, item));
  if (filtered.length > 0) snapshot.memberHistories[TEAM_SYSTEM_PSEUDO_MEMBER_NAME] = filtered;
  else {
    delete snapshot.memberHistories[TEAM_SYSTEM_PSEUDO_MEMBER_NAME];
    snapshot.members = snapshot.members.filter((member) => member.name !== TEAM_SYSTEM_PSEUDO_MEMBER_NAME);
  }
}
function computeHasActiveMembers(members) { return members.some((member) => isActiveTeamMemberStatus(member.status)); }
function compressWorkspacePath(workspacePath) { return workspacePath.replace(/[/\\:]/g, '-').replace(/^-+/, '').replace(/-+$/, '').replace(/-+/g, '-'); }
async function withTranscriptReadPermit(read) {
  if (availableTranscriptReadPermits > 0) availableTranscriptReadPermits -= 1;
  else await new Promise((resolve) => transcriptReadWaiters.push(resolve));
  try { return await read(); }
  finally {
    const next = transcriptReadWaiters.shift();
    if (next) next(); else availableTranscriptReadPermits += 1;
  }
}
async function forEachWithConcurrency(items, concurrency, visit) {
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex++];
      if (item !== undefined) await visit(item);
    }
  }));
}
function isFsLookupMiss(error) { return ['ENOENT', 'ENOTDIR'].includes(error?.code); }
function parseToRecord(value, wrapKey) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string') { const parsed = safeJsonParse(value); return isRecord(parsed) ? parsed : { [wrapKey]: value }; }
  return isRecord(value) ? structuredCloneRecord(value) : { [wrapKey]: value };
}
function stripSystemTags(text) { return text.replace(/<system-reminder[^>]*>[\s\S]*?<\/system-reminder>\s*/g, '').replace(/<user_query>([\s\S]*?)<\/user_query>/g, '$1').trim(); }
function mergeMeta(notificationMeta, updateMeta) {
  if (!notificationMeta && !updateMeta) return undefined;
  const merged = { ...notificationMeta ?? {}, ...updateMeta ?? {} };
  const notificationCodebuddy = notificationMeta?.['codebuddy.ai'];
  const updateCodebuddy = updateMeta?.['codebuddy.ai'];
  if (isRecord(notificationCodebuddy) || isRecord(updateCodebuddy)) merged['codebuddy.ai'] = { ...(isRecord(notificationCodebuddy) ? notificationCodebuddy : {}), ...(isRecord(updateCodebuddy) ? updateCodebuddy : {}) };
  return merged;
}
function extractTeamUpdate(payload) {
  const rootMeta = isRecord(payload._meta) ? payload._meta : undefined;
  const update = isRecord(payload.update) ? payload.update : undefined;
  const updateMeta = update && isRecord(update._meta) ? update._meta : undefined;
  const direct = rootMeta?.['codebuddy.ai/teamUpdate'] ?? updateMeta?.['codebuddy.ai/teamUpdate'];
  const nestedCodebuddy = rootMeta?.['codebuddy.ai'] ?? updateMeta?.['codebuddy.ai'];
  const nested = isRecord(nestedCodebuddy) ? nestedCodebuddy.teamUpdate : undefined;
  return isRecord(direct ?? nested) ? (direct ?? nested) : null;
}
function extractMemberEventName(payload) {
  const rootMeta = isRecord(payload._meta) ? payload._meta : undefined;
  const update = isRecord(payload.update) ? payload.update : undefined;
  const updateMeta = update && isRecord(update._meta) ? update._meta : undefined;
  const direct = updateMeta?.['codebuddy.ai/memberEvent'] ?? rootMeta?.['codebuddy.ai/memberEvent'];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const nested = updateMeta?.['codebuddy.ai'] ?? rootMeta?.['codebuddy.ai'];
  if (isRecord(nested) && typeof nested.memberEvent === 'string' && nested.memberEvent.trim()) return nested.memberEvent.trim();
}
function extractNotificationUpdate(payload) {
  const update = isRecord(payload.update) ? structuredCloneRecord(payload.update) : null;
  if (!update) return null;
  const mergedMeta = mergeMeta(isRecord(payload._meta) ? payload._meta : undefined, isRecord(update._meta) ? update._meta : undefined);
  if (mergedMeta) update._meta = mergedMeta;
  return update;
}
function extractToolName(update) {
  if (typeof update.toolName === 'string' && update.toolName.trim()) return update.toolName.trim();
  const meta = isRecord(update._meta) ? update._meta : undefined;
  const direct = meta?.['codebuddy.ai/toolName'];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const nested = meta?.['codebuddy.ai'];
  if (isRecord(nested) && typeof nested.toolName === 'string' && nested.toolName.trim()) return nested.toolName.trim();
}
function extractPendingAgentSpawn(update) {
  if (update.sessionUpdate !== 'tool_call' || extractToolName(update) !== 'Agent') return null;
  const rawInput = isRecord(update.rawInput) ? update.rawInput : undefined;
  const memberName = typeof rawInput?.name === 'string' ? rawInput.name.trim() : '';
  if (!memberName) return null;
  return { memberName, description: typeof rawInput.description === 'string' ? rawInput.description : undefined, teamName: typeof rawInput.team_name === 'string' ? rawInput.team_name : undefined };
}
function extractStringField(value, ...keys) {
  if (!isRecord(value)) return undefined;
  for (const key of keys) if (typeof value[key] === 'string' && value[key].trim()) return value[key].trim();
}
function extractTextFromRawOutput(rawOutput) {
  if (typeof rawOutput === 'string' && rawOutput.trim()) return rawOutput.trim();
  if (!isRecord(rawOutput)) return undefined;
  const direct = extractStringField(rawOutput, 'output', 'text', 'content', 'value');
  if (direct) return direct;
  for (const key of ['result', 'rawResponse']) { const nested = extractTextFromRawOutput(rawOutput[key]); if (nested) return nested; }
}
function extractSpawnTaskId(rawOutput) { const direct = extractStringField(rawOutput, 'taskId', 'task_id'); if (direct) return direct; return extractTextFromRawOutput(rawOutput)?.match(/(?:^|\n)\s*task_id:\s*(\S+)/)?.[1]?.trim(); }
function extractSpawnTeamName(rawOutput) { const direct = extractStringField(rawOutput, 'teamName', 'team_name'); if (direct) return direct; return extractTextFromRawOutput(rawOutput)?.match(/(?:^|\n)\s*team_name:\s*(.+)/)?.[1]?.trim(); }
function extractTextContent(value) {
  if (typeof value === 'string') return value;
  if (isRecord(value) && typeof value.text === 'string') return value.text;
  if (!Array.isArray(value)) return '';
  return value.map((item) => isRecord(item) && ['text', 'input_text', 'output_text'].includes(item.type) && typeof item.text === 'string' ? item.text : '').filter(Boolean).join('\n');
}
function shouldDropPersistedHistoryItem(item) {
  const providerData = isRecord(item.providerData) ? item.providerData : undefined;
  if (item.type === 'message' && item.role === 'user' && providerData?.isMeta === true || providerData?.isCompactInternal === true || typeof providerData?.compactType === 'string') return true;
  const text = extractTextContent(item.content).trim();
  return /^<conversation_history_summary\b/.test(text) || /^<system-reminder\b[^>]*data-role=["']compact-summary["']/i.test(text) || /^Please continue (?:based on the summarized context|with the conversation based on the summarized context) above\./i.test(text);
}
function extractInitialTeamAssignmentMemberName(text) { return text.match(/summary=\\?["']Initial task assignment for ([^"'\\]+)\\?["']/i)?.[1]?.trim() || undefined; }
function ensureMember(snapshot, memberName, seed = {}) {
  if (!memberName.trim()) return;
  const index = snapshot.members.findIndex((member) => member.name === memberName);
  const existing = index >= 0 ? snapshot.members[index] : undefined;
  const tokenUsage = mergeTeamTokenUsage(existing?.tokenUsage, seed.tokenUsage);
  const next = { name: memberName, status: seed.status ?? existing?.status ?? 'completed', color: seed.color ?? existing?.color, description: seed.description ?? existing?.description, taskId: seed.taskId ?? existing?.taskId, sessionId: seed.sessionId ?? existing?.sessionId, toolCallCount: seed.toolCallCount ?? existing?.toolCallCount, ...(tokenUsage ? { tokenUsage } : {}) };
  if (index >= 0) snapshot.members[index] = next; else snapshot.members.push(next);
}
function appendHistoryItem(snapshot, memberName, item, seed) { ensureMember(snapshot, memberName, seed); const history = snapshot.memberHistories[memberName] ?? []; history.push(item); snapshot.memberHistories[memberName] = history; }
function mapMember(member) {
  const name = typeof member.name === 'string' ? member.name.trim() : '';
  if (!name) return null;
  const next = { name, status: normalizeTeamMemberStatus(member.status) };
  for (const key of ['color', 'description', 'taskId', 'sessionId']) if (typeof member[key] === 'string') next[key] = member[key];
  if (typeof member.toolCallCount === 'number') next.toolCallCount = member.toolCallCount;
  const tokenUsage = coerceTeamTokenUsage(member.tokenUsage);
  if (tokenUsage) next.tokenUsage = tokenUsage;
  return next;
}
function createEmptySnapshot(sessionId) { return { sessionId, isInTeam: false, members: [], memberHistories: {}, hasActiveMembers: false, updatedAt: Date.now() }; }
function buildFallbackSnapshot(sessionId, replayEvents) {
  const snapshot = createEmptySnapshot(sessionId);
  const pendingAgentSpawns = new Map();
  for (const rawPayload of replayEvents) {
    if (!isRecord(rawPayload)) continue;
    const teamUpdate = extractTeamUpdate(rawPayload);
    if (teamUpdate) switch (teamUpdate.type) {
      case 'team_created':
        if (!snapshot.isInTeam && (snapshot.members.length > 0 || Object.keys(snapshot.memberHistories).length > 0)) { snapshot.members = []; snapshot.memberHistories = {}; }
        snapshot.isInTeam = true;
        if (typeof teamUpdate.teamName === 'string' && teamUpdate.teamName.trim()) snapshot.teamName = teamUpdate.teamName.trim();
        if (typeof teamUpdate.isAutoTeam === 'boolean') snapshot.isAutoTeam = teamUpdate.isAutoTeam;
        break;
      case 'member_status_change':
        snapshot.isInTeam = true;
        if (typeof teamUpdate.teamName === 'string' && teamUpdate.teamName.trim()) snapshot.teamName = teamUpdate.teamName.trim();
        if (typeof teamUpdate.isAutoTeam === 'boolean') snapshot.isAutoTeam = teamUpdate.isAutoTeam;
        if (Array.isArray(teamUpdate.members)) snapshot.members = teamUpdate.members.map((member) => isRecord(member) ? mapMember(member) : null).filter(Boolean);
        break;
      case 'team_deleted': snapshot.isInTeam = false; if (typeof teamUpdate.teamName === 'string' && teamUpdate.teamName.trim()) snapshot.teamName = teamUpdate.teamName.trim(); if (typeof teamUpdate.isAutoTeam === 'boolean') snapshot.isAutoTeam = teamUpdate.isAutoTeam; break;
      default: break;
    }
    const memberName = extractMemberEventName(rawPayload);
    if (memberName) { const update = extractNotificationUpdate(rawPayload); if (update && typeof update.sessionUpdate === 'string') appendHistoryItem(snapshot, memberName, update, { sessionId: typeof rawPayload.sessionId === 'string' ? rawPayload.sessionId : undefined }); continue; }
    const update = extractNotificationUpdate(rawPayload);
    if (!update) continue;
    const pending = extractPendingAgentSpawn(update);
    if (pending) { if (typeof update.toolCallId === 'string' && update.toolCallId.trim()) pendingAgentSpawns.set(update.toolCallId, pending); if (!snapshot.teamName && pending.teamName?.trim()) snapshot.teamName = pending.teamName.trim(); continue; }
    if (update.sessionUpdate === 'tool_call_update') {
      const spawn = typeof update.toolCallId === 'string' ? pendingAgentSpawns.get(update.toolCallId) : undefined;
      const taskId = spawn && extractSpawnTaskId(update.rawOutput);
      if (spawn && taskId) { ensureMember(snapshot, spawn.memberName, { description: spawn.description, taskId, status: 'completed' }); const name = spawn.teamName?.trim() || extractSpawnTeamName(update.rawOutput); if (!snapshot.teamName && name) snapshot.teamName = name; }
    }
    if (update.sessionUpdate !== 'user_message_chunk') continue;
    const message = parseTeammateMessage(extractTextContent(update.content));
    if (!message || shouldIgnoreFrameworkSystemTeammateMessage(message)) continue;
    appendHistoryItem(snapshot, message.teammateId, { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: message.raw }, _meta: { 'codebuddy.ai/syntheticTeammateMessage': true, ...(message.summary ? { 'codebuddy.ai/teammateSummary': message.summary } : {}) } }, { status: getShutdownAcceptedStatus(message) });
  }
  sanitizePseudoTeamMembers(snapshot);
  return snapshot;
}
function resolveTranscriptCandidates(sessionId, cwd, taskId) { const projectsDir = path.join(getWorkbuddyRuntimeConfigDir(), 'projects'); const projectId = compressWorkspacePath(cwd); return [path.join(projectsDir, projectId, sessionId, 'subagents', `${taskId}.jsonl`), path.join(projectsDir, projectId, `${taskId}.jsonl`)]; }
async function findPersistedTranscriptPaths(sessionId, cwd, taskId) {
  const existing = []; const seen = new Set();
  const appendIfExists = async (candidate) => { if (seen.has(candidate)) return; seen.add(candidate); try { await fs.promises.access(candidate); existing.push(candidate); } catch {} };
  for (const candidate of resolveTranscriptCandidates(sessionId, cwd, taskId)) await appendIfExists(candidate);
  if (existing.length > 0) return existing;
  const projectsDir = path.join(getWorkbuddyRuntimeConfigDir(), 'projects');
  try { for (const entry of await fs.promises.readdir(projectsDir, { withFileTypes: true })) if (entry.isDirectory()) { await appendIfExists(path.join(projectsDir, entry.name, sessionId, 'subagents', `${taskId}.jsonl`)); await appendIfExists(path.join(projectsDir, entry.name, `${taskId}.jsonl`)); } } catch {}
  return existing;
}
function toHistoryTimestamp(item) { return typeof item.timestamp === 'number' ? item.timestamp : undefined; }
function toToolStatus(rawStatus) { switch (typeof rawStatus === 'string' ? rawStatus : '') { case 'completed': return 'completed'; case 'in_progress': return 'in_progress'; case 'incomplete': return 'failed'; default: return 'pending'; } }
function extractPersistedRawResponse(item) { const providerData = isRecord(item.providerData) ? item.providerData : undefined; const raw = (isRecord(providerData?.toolResult) ? providerData.toolResult : undefined)?.rawResponse; return isRecord(raw) ? structuredCloneRecord(raw) : undefined; }
function extractProviderMessageId(item) { const id = (isRecord(item.providerData) ? item.providerData : undefined)?.messageId; if (typeof id === 'string' && id.trim()) return id.trim(); return typeof item.id === 'string' && item.id.trim() ? item.id.trim() : undefined; }
function extractPersistedReasoningText(item) { return (Array.isArray(item.rawContent) ? item.rawContent : []).filter((block) => isRecord(block) && block.type === 'reasoning_text' && typeof block.text === 'string').map((block) => String(block.text)).join('').trim(); }
function mergePersistedToolCallInputs(history) {
  const calls = new Map();
  return history.map((entry) => {
    const id = typeof entry.toolCallId === 'string' ? entry.toolCallId : undefined;
    if (!id) return entry;
    if (entry.sessionUpdate === 'tool_call') { calls.set(id, entry); return entry; }
    if (entry.sessionUpdate !== 'tool_call_update') return entry;
    const call = calls.get(id); if (!call) return entry;
    return { ...entry, ...(entry.rawInput === undefined && call.rawInput !== undefined ? { rawInput: call.rawInput } : {}), ...(entry.title === undefined && call.title !== undefined ? { title: call.title } : {}), ...(entry.kind === undefined && call.kind !== undefined ? { kind: call.kind } : {}), ...(entry.locations === undefined && call.locations !== undefined ? { locations: call.locations } : {}), ...(entry.toolName === undefined && call.toolName !== undefined ? { toolName: call.toolName } : {}), ...((call._meta || entry._meta) ? { _meta: { ...(isRecord(call._meta) ? call._meta : {}), ...(isRecord(entry._meta) ? entry._meta : {}) } } : {}) };
  });
}
function convertPersistedHistoryItem(item) {
  if (shouldDropPersistedHistoryItem(item)) return [];
  const timestamp = toHistoryTimestamp(item);
  const withTime = (entry) => ({ ...entry, ...(timestamp !== undefined ? { timestamp } : {}) });
  if (item.type === 'message' && item.role === 'user') {
    if (typeof item.content === 'string') { const text = stripSystemTags(item.content); return text ? [withTime({ sessionUpdate: 'user_message_chunk', content: { type: 'text', text } })] : []; }
    if (Array.isArray(item.content)) return item.content.flatMap((block) => { if (!isRecord(block)) return []; if (block.type === 'input_text' && typeof block.text === 'string') { const text = stripSystemTags(block.text); return text ? [withTime({ sessionUpdate: 'user_message_chunk', content: { type: 'text', text } })] : []; } if (block.type === 'image_blob_ref' || block.type === 'input_image') return [withTime({ sessionUpdate: 'user_message_chunk', content: { type: 'text', text: IMAGE_PLACEHOLDER } })]; return []; });
    return [];
  }
  if (item.type === 'message' && item.role === 'assistant') { const text = typeof item.content === 'string' ? item.content.trim() : Array.isArray(item.content) ? item.content.filter((block) => isRecord(block) && block.type === 'output_text' && typeof block.text === 'string').map((block) => String(block.text)).join('\n').trim() : ''; return text ? [withTime({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } })] : []; }
  if (item.type === 'reasoning') { const text = extractPersistedReasoningText(item); const messageId = extractProviderMessageId(item); return text ? [withTime({ sessionUpdate: 'agent_thought_chunk', ...(messageId ? { messageId, _meta: { 'codebuddy.ai/messageId': messageId } } : {}), content: { type: 'text', text } })] : []; }
  if (item.type === 'function_call') { const toolCallId = typeof item.callId === 'string' ? item.callId : typeof item.id === 'string' ? item.id : undefined; const toolName = typeof item.name === 'string' ? item.name : 'tool'; return [withTime({ sessionUpdate: 'tool_call', ...(toolCallId ? { toolCallId } : {}), status: toToolStatus(item.status), toolName, title: toolName, kind: 'other', rawInput: parseToRecord(item.arguments, 'arguments'), _meta: { 'codebuddy.ai/toolName': toolName } })]; }
  if (item.type === 'function_call_result' || item.type === 'function_call_output') { const toolCallId = typeof item.callId === 'string' ? item.callId : typeof item.id === 'string' ? item.id : undefined; const rawResponse = extractPersistedRawResponse(item); return [withTime({ sessionUpdate: 'tool_call_update', ...(toolCallId ? { toolCallId } : {}), status: toToolStatus(item.status), rawOutput: parseToRecord(item.output, 'output'), ...(rawResponse ? { _meta: { 'codebuddy.ai/rawResponse': rawResponse } } : {}) })]; }
  return [];
}
async function loadPersistedMemberHistory(sessionId, cwd, member) {
  const taskId = member.taskId?.trim(); if (!taskId) return null;
  const transcriptPaths = await findPersistedTranscriptPaths(sessionId, cwd, taskId); if (transcriptPaths.length === 0) return null;
  try {
    const entries = (await Promise.all(transcriptPaths.map(async (transcriptPath) => (await withTranscriptReadPermit(() => fs.promises.readFile(transcriptPath, 'utf8'))).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => ({ transcriptPath, index, line, item: safeJsonParse(line) })).filter((entry) => isRecord(entry.item))))).flat().sort((left, right) => { const a = toHistoryTimestamp(left.item) ?? Infinity; const b = toHistoryTimestamp(right.item) ?? Infinity; return a !== b ? a - b : left.transcriptPath !== right.transcriptPath ? transcriptPaths.indexOf(left.transcriptPath) - transcriptPaths.indexOf(right.transcriptPath) : left.index - right.index; });
    const seenLines = new Map(); const parsed = [];
    for (const entry of entries) { const seenPath = seenLines.get(entry.line); if (seenPath && seenPath !== entry.transcriptPath) continue; if (!seenPath) seenLines.set(entry.line, entry.transcriptPath); parsed.push(entry.item); }
    const history = mergePersistedToolCallInputs(parsed.slice(-MAX_PERSISTED_HISTORY_ITEMS).flatMap(convertPersistedHistoryItem));
    return history.length > 0 ? history : null;
  } catch { return null; }
}
async function discoverMembersFromTranscripts(sessionId, cwd) {
  const projectsDir = path.join(getWorkbuddyRuntimeConfigDir(), 'projects'); const discovered = []; const seenTaskIds = new Set();
  const inferName = async (filePath) => { try { return await withTranscriptReadPermit(async () => { const handle = await fs.promises.open(filePath, 'r'); try { const prefix = Buffer.allocUnsafe(LEGACY_TEAM_MEMBER_DISCOVERY_PREFIX_BYTES); const { bytesRead } = await handle.read(prefix, 0, prefix.length, 0); return extractInitialTeamAssignmentMemberName(prefix.subarray(0, bytesRead).toString('utf8')); } finally { await handle.close(); } }); } catch (error) { if (isFsLookupMiss(error)) return undefined; throw error; } };
  async function scanDir(dir) { try { await forEachWithConcurrency(await fs.promises.readdir(dir, { withFileTypes: true }), MAX_CONCURRENT_TRANSCRIPT_READS, async (entry) => { if (!entry.isFile() || !entry.name.endsWith('.jsonl')) return; const taskId = entry.name.slice(0, -6); if (!taskId || seenTaskIds.has(taskId)) return; const name = await inferName(path.join(dir, entry.name)); if (!name) return; seenTaskIds.add(taskId); discovered.push({ name, taskId, status: 'completed' }); }); return true; } catch (error) { if (!isFsLookupMiss(error)) throw error; return false; } }
  const projectId = compressWorkspacePath(cwd);
  if (!await scanDir(path.join(projectsDir, projectId, sessionId, 'subagents'))) try { for (const entry of await fs.promises.readdir(projectsDir, { withFileTypes: true })) if (entry.isDirectory()) await scanDir(path.join(projectsDir, entry.name, sessionId, 'subagents')); } catch (error) { if (!isFsLookupMiss(error)) throw error; }
  return discovered;
}
async function loadSessionTeamRuntimeSnapshot(params) {
  const snapshot = buildFallbackSnapshot(params.sessionId, params.eventHistory ?? []);
  if (snapshot.members.length === 0 && Object.keys(snapshot.memberHistories).length === 0) { const discovered = await discoverMembersFromTranscripts(params.sessionId, params.cwd); for (const member of discovered) ensureMember(snapshot, member.name, member); if (discovered.length > 0) snapshot.isInTeam = true; }
  if (snapshot.members.length === 0) return null;
  await forEachWithConcurrency(snapshot.members, MAX_CONCURRENT_TRANSCRIPT_READS, async (member) => { const history = await loadPersistedMemberHistory(params.sessionId, params.cwd, member); if (history) snapshot.memberHistories[member.name] = history; });
  for (const memberName of Object.keys(snapshot.memberHistories)) ensureMember(snapshot, memberName);
  sanitizePseudoTeamMembers(snapshot);
  if (snapshot.members.length === 0 && Object.keys(snapshot.memberHistories).length === 0) return null;
  if (!params.isSessionActive) for (const member of snapshot.members) if (isActiveTeamMemberStatus(member.status)) member.status = 'completed';
  snapshot.hasActiveMembers = computeHasActiveMembers(snapshot.members); snapshot.updatedAt = Date.now(); return snapshot;
}

module.exports = Object.freeze({ TEAMMATE_MESSAGE_PATTERN, MAX_PERSISTED_HISTORY_ITEMS, IMAGE_PLACEHOLDER, LEGACY_TEAM_MEMBER_DISCOVERY_PREFIX_BYTES, MAX_CONCURRENT_TRANSCRIPT_READS, TEAM_SYSTEM_PSEUDO_MEMBER_NAME, FRAMEWORK_AUTO_NOTIFICATION_MARKER, isFrameworkAutoNotificationText, shouldIgnoreFrameworkSystemTeammateMessage, getShutdownAcceptedStatus, shouldIgnoreFrameworkSystemHistoryItem, sanitizePseudoTeamMembers, computeHasActiveMembers, compressWorkspacePath, safeJsonParse, withTranscriptReadPermit, forEachWithConcurrency, isFsLookupMiss, parseToRecord, stripSystemTags, parseTeammateMessage, mergeMeta, extractTeamUpdate, extractMemberEventName, extractNotificationUpdate, extractToolName, extractPendingAgentSpawn, extractStringField, extractTextFromRawOutput, extractSpawnTaskId, extractSpawnTeamName, extractTextContent, shouldDropPersistedHistoryItem, extractInitialTeamAssignmentMemberName, ensureMember, appendHistoryItem, mapMember, createEmptySnapshot, buildFallbackSnapshot, resolveTranscriptCandidates, findPersistedTranscriptPaths, toHistoryTimestamp, toToolStatus, extractPersistedRawResponse, extractProviderMessageId, extractPersistedReasoningText, mergePersistedToolCallInputs, convertPersistedHistoryItem, loadPersistedMemberHistory, discoverMembersFromTranscripts, loadSessionTeamRuntimeSnapshot });
