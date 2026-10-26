'use strict';

const { ROUTE_PREFIX } = require('../../runtime/http-contract');

const DUE_DATE_CLEAR_SENTINEL = '1970-01-01T00:00:00Z';
const PRIORITY_TEXT_TO_CODE = Object.freeze({ urgent: 1, high: 2, medium: 3, low: 4 });

function todoGraphqlEndpoint(projectId) {
  return `${ROUTE_PREFIX}/${encodeURIComponent(projectId)}/plan/todos/graphql`;
}

function normalizeOptionalString(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function toGraphQLDueDate(value) {
  if (value === undefined) return undefined;
  if (value === null || !String(value).trim()) return DUE_DATE_CLEAR_SENTINEL;
  const trimmed = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T00:00:00Z` : trimmed;
}

function toGraphQLPriority(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  const code = PRIORITY_TEXT_TO_CODE[normalizeOptionalString(value?.text)?.toLowerCase()];
  return typeof code === 'number' ? code : undefined;
}

function normalizeDueDate(value) {
  const normalized = normalizeOptionalString(value);
  return normalized && !normalized.startsWith('1970-01-01') ? normalized : undefined;
}

function toGraphQLNullableString(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === 'string' && value.trim() ? value : '';
}

function normalizeOptionalNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }
  return undefined;
}

function normalizeStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean) : [];
}

function uniqueMessages(messages) {
  return [...new Set((Array.isArray(messages) ? messages : []).map(normalizeOptionalString).filter(Boolean))];
}

function throwProjectTodoError(operation, messages) {
  const details = uniqueMessages(messages);
  const error = new Error(details[0] || `${operation} failed`);
  error.details = details;
  throw error;
}

async function executeGraphQL(http, projectId, query, variables, operation) {
  const response = await http.post(todoGraphqlEndpoint(projectId), { query, variables });
  if (Array.isArray(response?.errors) && response.errors.length) {
    throwProjectTodoError(operation, response.errors.map((item) => item?.message));
  }
  if (!response?.data) throwProjectTodoError(operation, [`${operation} returned empty data`]);
  return response.data;
}

function unwrapUserErrors(payload, operation) {
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  if (errors.length) throwProjectTodoError(operation, errors.map((item) => item?.message));
}

function requireValue(value, operation, label) {
  if (value == null) throwProjectTodoError(operation, [`${operation} returned empty ${label}`]);
  return value;
}

function normalizeStatusType(value) {
  const raw = normalizeOptionalString(value);
  if (!raw) return 'custom';
  const mapped = { CLAIM: 'pending', RUNNING: 'in_progress', PAUSED: 'paused', DONE: 'completed', CUSTOM: 'custom' }[raw.toUpperCase()];
  return mapped || raw.toLowerCase().replace(/\s+/g, '_');
}

function toGraphQLStatusType(value) {
  const normalized = normalizeOptionalString(value)?.toLowerCase();
  return ({ pending: 'CLAIM', in_progress: 'RUNNING', paused: 'PAUSED', completed: 'DONE', custom: 'CUSTOM' }[normalized] || normalized?.toUpperCase());
}

function toGraphQLTodoScope(value) {
  const normalized = normalizeOptionalString(value);
  return normalized?.toUpperCase();
}

function normalizeLowerEnum(value, fallback) {
  return normalizeOptionalString(value)?.toLowerCase() || fallback;
}

function normalizeSourceExternalUrl(url, source) {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return normalizeOptionalString(source)?.toUpperCase() === 'CNB' && url.startsWith('/') ? `https://cnb.woa.com${url}` : url;
}

function toGraphQLUpperEnum(value) {
  return normalizeOptionalString(value)?.toUpperCase();
}

function normalizeTodoUser(raw) {
  const id = normalizeOptionalString(raw?.id);
  return id ? { id, name: normalizeOptionalString(raw?.name), avatarUrl: normalizeOptionalString(raw?.avatarUrl ?? raw?.avatarURL ?? raw?.avatar) } : undefined;
}

function normalizeTodoStatus(raw) {
  return { id: normalizeOptionalString(raw?.id) || '', name: normalizeOptionalString(raw?.name) || '', type: normalizeStatusType(raw?.type), position: normalizeOptionalNumber(raw?.position), isDefault: typeof raw?.isDefault === 'boolean' ? raw.isDefault : undefined };
}

function normalizeTodoTransition(raw) {
  return { id: normalizeOptionalString(raw?.id) || '', name: normalizeOptionalString(raw?.name) || '', type: normalizeStatusType(raw?.type) };
}

function normalizeTodoAttachment(raw) {
  return { id: normalizeOptionalString(raw?.id) || '', provider: normalizeLowerEnum(raw?.provider, 'url'), externalId: normalizeOptionalString(raw?.externalId), name: normalizeOptionalString(raw?.name), fileType: normalizeOptionalString(raw?.fileType), fileSize: normalizeOptionalNumber(raw?.fileSize), externalUrl: normalizeOptionalString(raw?.externalUrl), uploadedBy: normalizeTodoUser(raw?.uploadedBy), createdAt: normalizeOptionalString(raw?.createdAt), isHandoffArtifact: raw?.isHandoffArtifact === true ? true : undefined };
}

function buildTodoAttachmentObjectKey(filename) {
  const name = normalizeOptionalString(filename) || 'attachment';
  return `uploads/todos/${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${encodeURIComponent(name)}`;
}

function normalizeTodoAttachmentUploadTarget(raw) {
  const objectKey = normalizeOptionalString(raw?.object_key ?? raw?.objectKey);
  const uploadUrl = normalizeOptionalString(raw?.upload_url ?? raw?.uploadUrl);
  const downloadUrl = normalizeOptionalString(raw?.download_url ?? raw?.downloadUrl);
  return objectKey && uploadUrl && downloadUrl ? { objectKey, uploadUrl, downloadUrl } : undefined;
}

function normalizeTodoHistoryItem(raw) {
  return { id: normalizeOptionalString(raw?.id), actorId: normalizeOptionalString(raw?.actorId), field: normalizeOptionalString(raw?.field) || '', oldValue: normalizeOptionalString(raw?.oldValue), newValue: normalizeOptionalString(raw?.newValue), createdAt: normalizeOptionalString(raw?.createdAt) };
}

function normalizeTodoHistory(raw) {
  const items = Array.isArray(raw?.nodes) ? raw.nodes.map(normalizeTodoHistoryItem) : [];
  return { items, total: normalizeOptionalNumber(raw?.totalCount) ?? items.length };
}

function normalizeTodo(raw) {
  return {
    id: normalizeOptionalString(raw?.id) || '', projectId: normalizeOptionalString(raw?.projectId) || '', title: normalizeOptionalString(raw?.title) || '', description: normalizeOptionalString(raw?.description), status: normalizeTodoStatus(raw?.status), creator: normalizeTodoUser(raw?.creator),
    assignee: normalizeTodoUser(raw?.assignee ?? (Array.isArray(raw?.assignees) ? raw.assignees[0] : undefined)),
    assignees: Array.isArray(raw?.assignees) ? raw.assignees.map(normalizeTodoUser).filter(Boolean) : undefined,
    subscribers: Array.isArray(raw?.subscribers) ? raw.subscribers.map(normalizeTodoUser).filter(Boolean) : undefined,
    allowedTransitions: Array.isArray(raw?.allowedTransitions) ? raw.allowedTransitions.map(normalizeTodoTransition) : undefined,
    attachments: Array.isArray(raw?.attachments) ? raw.attachments.map(normalizeTodoAttachment) : undefined, history: raw?.history ? normalizeTodoHistory(raw.history) : undefined,
    priority: normalizeOptionalNumber(raw?.priority) ?? null, source: normalizeLowerEnum(raw?.source, 'manual'), sourceExternalId: normalizeOptionalString(raw?.sourceExternalId), sourceExternalUrl: normalizeSourceExternalUrl(normalizeOptionalString(raw?.sourceExternalUrl), raw?.source), tags: normalizeStringArray(raw?.tags), sortOrder: normalizeOptionalNumber(raw?.sortOrder), summary: normalizeOptionalString(raw?.summary), sessionId: normalizeOptionalString(raw?.sessionId ?? (Array.isArray(raw?.sessions) ? raw.sessions[0]?.sessionId : undefined)), handoffFrom: raw?.handoffFrom?.id ? { id: normalizeOptionalString(raw.handoffFrom.id) } : undefined, handoffNote: normalizeOptionalString(raw?.handoffNote), handoffSessionId: normalizeOptionalString(raw?.handoffSessionId), snapshotSessionId: normalizeOptionalString(raw?.snapshotSessionId), dueDate: normalizeDueDate(raw?.dueDate), startedAt: normalizeOptionalString(raw?.startedAt), completedAt: normalizeOptionalString(raw?.completedAt), pauseReason: normalizeOptionalString(raw?.pauseReason), createdAt: normalizeOptionalString(raw?.createdAt) || '', updatedAt: normalizeOptionalString(raw?.updatedAt) || ''
  };
}

function buildDateRangeInput(range) {
  if (!range) return undefined;
  const gte = normalizeOptionalString(range.from); const lte = normalizeOptionalString(range.to);
  return gte || lte ? { gte, lte } : undefined;
}

function buildTodoOrderInput(orderBy) {
  if (!Array.isArray(orderBy) || !orderBy.length) return undefined;
  const fields = { createdAt: 'CREATED_AT', updatedAt: 'UPDATED_AT', priority: 'PRIORITY', dueDate: 'DUE_DATE', sortOrder: 'SORT_ORDER' };
  return orderBy.map((item) => ({ field: fields[item.field] || 'UPDATED_AT', direction: item.direction === 'asc' ? 'ASC' : 'DESC' }));
}

function buildTodoFilter(projectId, params = {}) {
  const sources = params.sources?.map((source) => toGraphQLUpperEnum(String(source))).filter(Boolean);
  return { projectIds: [projectId], scope: toGraphQLTodoScope(params.scope), statusIds: params.statusIds, statusTypes: params.statusTypes?.map(toGraphQLStatusType), assigneeIds: params.assigneeIds, creatorIds: params.creatorIds, sources: sources?.length ? sources : undefined, priorities: params.priorities, blockingReason: params.blockingReason, sourceConversationId: params.sourceConversationId, text: params.keyword, createdAt: buildDateRangeInput(params.createdAt), updatedAt: buildDateRangeInput(params.updatedAt) };
}

function buildCreateTodoInput(params) {
  return { title: params.title, description: params.description, assigneeIds: params.assigneeIds?.length ? params.assigneeIds : params.assigneeId ? [params.assigneeId] : undefined, priority: toGraphQLPriority(params.priority), dueDate: toGraphQLDueDate(params.dueDate), statusId: params.statusId, tags: params.tags, source: params.source ? toGraphQLUpperEnum(String(params.source)) : undefined, sourceExternalId: params.sourceExternalId, sourceExternalUrl: params.sourceExternalUrl, summary: params.summary };
}

function buildUpdateTodoInput(todoId, patch) {
  const input = { id: todoId };
  if (Object.prototype.hasOwnProperty.call(patch, 'title')) input.title = patch.title;
  if (Object.prototype.hasOwnProperty.call(patch, 'description')) input.description = toGraphQLNullableString(patch.description);
  if (Object.prototype.hasOwnProperty.call(patch, 'priority')) input.priority = toGraphQLPriority(patch.priority);
  if (Object.prototype.hasOwnProperty.call(patch, 'dueDate')) input.dueDate = toGraphQLDueDate(patch.dueDate);
  for (const key of ['tags', 'summary', 'handoffNote']) if (Object.prototype.hasOwnProperty.call(patch, key)) input[key] = patch[key];
  if (Object.prototype.hasOwnProperty.call(patch, 'startedAt') && patch.startedAt !== undefined) console.warn(`[project:updateTodo] startedAt is not supported by the GraphQL backend and will be ignored (todoId=${todoId}).`);
  return input;
}

function buildAttachmentInput(todoId, params) {
  return { todoId, provider: toGraphQLUpperEnum(String(params.provider)), externalId: params.externalId, name: params.name, fileType: params.fileType, fileSize: params.fileSize, externalUrl: params.externalUrl, metadata: params.isHandoffArtifact ? JSON.stringify({ isHandoffArtifact: true }) : undefined };
}

module.exports = Object.freeze({ DUE_DATE_CLEAR_SENTINEL, PRIORITY_TEXT_TO_CODE, todoGraphqlEndpoint, normalizeOptionalString, toGraphQLDueDate, toGraphQLPriority, normalizeDueDate, toGraphQLNullableString, normalizeOptionalNumber, normalizeStringArray, uniqueMessages, throwProjectTodoError, executeGraphQL, unwrapUserErrors, requireValue, normalizeStatusType, toGraphQLStatusType, toGraphQLTodoScope, normalizeLowerEnum, normalizeSourceExternalUrl, toGraphQLUpperEnum, normalizeTodoUser, normalizeTodoStatus, normalizeTodoTransition, normalizeTodoAttachment, buildTodoAttachmentObjectKey, normalizeTodoAttachmentUploadTarget, normalizeTodoHistoryItem, normalizeTodoHistory, normalizeTodo, buildDateRangeInput, buildTodoOrderInput, buildTodoFilter, buildCreateTodoInput, buildUpdateTodoInput, buildAttachmentInput });
