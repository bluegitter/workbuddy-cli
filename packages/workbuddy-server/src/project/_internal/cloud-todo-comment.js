'use strict';

const { executeGraphQL, unwrapUserErrors, normalizeOptionalString } = require('./cloud-todo-utils');

const COMMENT_FIELDS = `id content source author { id name } parentId editCount createdAt updatedAt isDeleted replies { id content source author { id name } parentId editCount createdAt updatedAt isDeleted }`;
const QUERY_TODO_HISTORY = 'query($todoId: ID!, $first: Int, $offset: Int) { todoHistory(todoId: $todoId, first: $first, offset: $offset) { nodes { id field oldValue newValue actor { id name } source createdAt } totalCount } }';
const QUERY_COMMENTS = `query($todoId: ID!, $first: Int, $offset: Int) { todoComments(todoId: $todoId, first: $first, offset: $offset) { nodes { ${COMMENT_FIELDS} } totalCount } }`;
const TODO_COMMENT_PAGE_SIZE = 100;
const TODO_HISTORY_PAGE_SIZE = 100;
const MUTATION_ADD_COMMENT = `mutation($input: AddTodoCommentInput!) { addTodoComment(input: $input) { comment { ${COMMENT_FIELDS} } errors { message } } }`;
const MUTATION_UPDATE_COMMENT = `mutation($input: UpdateTodoCommentInput!) { updateTodoComment(input: $input) { comment { ${COMMENT_FIELDS} } errors { message } } }`;
const MUTATION_DELETE_COMMENT = 'mutation($input: DeleteTodoCommentInput!) { deleteTodoComment(input: $input) { errors { message } } }';

function normalizeAuthor(raw, source) {
  return { id: normalizeOptionalString(raw?.id) || '', name: normalizeOptionalString(raw?.name) || '', isAssistant: normalizeOptionalString(source) === 'assistant' ? true : undefined };
}
function normalizeAttachment(raw) {
  return { id: normalizeOptionalString(raw?.id) || '', name: normalizeOptionalString(raw?.name) || '', fileType: normalizeOptionalString(raw?.fileType), fileSize: typeof raw?.fileSize === 'number' ? raw.fileSize : undefined, url: normalizeOptionalString(raw?.externalUrl ?? raw?.url) };
}
function normalizeReply(raw, commentId) {
  return { id: normalizeOptionalString(raw?.id) || '', commentId, author: normalizeAuthor(raw?.author, raw?.source), content: normalizeOptionalString(raw?.content) || '', attachments: Array.isArray(raw?.attachments) ? raw.attachments.map(normalizeAttachment) : undefined, createdAt: normalizeOptionalString(raw?.createdAt) || '', updatedAt: raw?.editCount > 0 ? normalizeOptionalString(raw?.updatedAt) : undefined };
}
function normalizeComment(raw, projectId, todoId) {
  const id = normalizeOptionalString(raw?.id) || '';
  return { id, todoId, projectId, author: normalizeAuthor(raw?.author, raw?.source), content: normalizeOptionalString(raw?.content) || '', attachments: Array.isArray(raw?.attachments) ? raw.attachments.map(normalizeAttachment) : undefined, replies: Array.isArray(raw?.replies) ? raw.replies.map((reply) => normalizeReply(reply, id)) : undefined, createdAt: normalizeOptionalString(raw?.createdAt) || '', updatedAt: raw?.editCount > 0 ? normalizeOptionalString(raw?.updatedAt) : undefined };
}
function mapHistoryFieldToType(field) {
  return { status: 'status_changed', title: 'title_changed', created: 'created', due_date: 'due_date_changed', description: 'description_changed', priority: 'priority_changed', priority_text: 'priority_changed', start_date: 'start_date_changed', tags: 'tags_changed' }[field] || null;
}
function parseAssigneeIds(raw) {
  if (!raw) return [];
  try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean); } catch {}
  return String(raw).split(',').map((item) => item.trim()).filter(Boolean);
}
function resolveAssigneeActivity(raw, base) {
  const oldIds = parseAssigneeIds(normalizeOptionalString(raw?.oldValue));
  const newIds = parseAssigneeIds(normalizeOptionalString(raw?.newValue));
  const added = newIds.filter((id) => !oldIds.includes(id));
  const removed = oldIds.filter((id) => !newIds.includes(id));
  const split = added.length && removed.length;
  const items = [];
  if (added.length) items.push({ ...base, id: split ? `${base.id}:added` : base.id, type: added.length === 1 && added[0] === base.actor.id ? 'assignee_self_added' : 'assignee_added', detail: JSON.stringify(added) });
  if (removed.length) items.push({ ...base, id: split ? `${base.id}:removed` : base.id, type: removed.length === 1 && removed[0] === base.actor.id ? 'assignee_self_removed' : 'assignee_removed', detail: JSON.stringify(removed) });
  return items;
}
function normalizeHistoryToActivity(raw) {
  const field = normalizeOptionalString(raw?.field) || '';
  const base = { id: normalizeOptionalString(raw?.id) || '', actor: { id: normalizeOptionalString(raw?.actor?.id) || '', name: normalizeOptionalString(raw?.actor?.name) || '', isAssistant: normalizeOptionalString(raw?.source) === 'assistant' ? true : undefined }, createdAt: normalizeOptionalString(raw?.createdAt) || '' };
  if (field === 'assignee') return resolveAssigneeActivity(raw, base);
  const type = mapHistoryFieldToType(field);
  return type ? [{ ...base, type, detail: normalizeOptionalString(raw?.newValue), oldValue: normalizeOptionalString(raw?.oldValue), statusLabel: type === 'status_changed' ? normalizeOptionalString(raw?.newValue) : undefined }] : [];
}
function normalizeCommentToActivity(raw) {
  const id = normalizeOptionalString(raw?.id) || '';
  return { id, type: 'comment', actor: normalizeAuthor(raw?.author, raw?.source), content: normalizeOptionalString(raw?.content), attachments: Array.isArray(raw?.attachments) ? raw.attachments.map(normalizeAttachment) : undefined, replies: Array.isArray(raw?.replies) ? raw.replies.filter((reply) => !reply?.isDeleted).map((reply) => normalizeReply(reply, id)) : undefined, createdAt: normalizeOptionalString(raw?.createdAt) || '' };
}
async function listAllTodoComments(http, projectId, todoId) {
  const nodes = []; let offset = 0;
  while (true) {
    const data = await executeGraphQL(http, projectId, QUERY_COMMENTS, { todoId, first: TODO_COMMENT_PAGE_SIZE, offset }, 'todoComments');
    const page = data.todoComments?.nodes || []; nodes.push(...page);
    if (page.length < TODO_COMMENT_PAGE_SIZE || typeof data.todoComments?.totalCount === 'number' && nodes.length >= data.todoComments.totalCount) return nodes;
    offset += TODO_COMMENT_PAGE_SIZE;
  }
}
async function listAllTodoHistory(http, projectId, todoId) {
  const nodes = []; let offset = 0;
  while (true) {
    const data = await executeGraphQL(http, projectId, QUERY_TODO_HISTORY, { todoId, first: TODO_HISTORY_PAGE_SIZE, offset }, 'todoDetailHistory');
    const page = data.todoHistory?.nodes || []; nodes.push(...page);
    if (page.length < TODO_HISTORY_PAGE_SIZE || typeof data.todoHistory?.totalCount === 'number' && nodes.length >= data.todoHistory.totalCount) return nodes;
    offset += TODO_HISTORY_PAGE_SIZE;
  }
}
function activityTimestamp(createdAt) { const timestamp = new Date(createdAt).getTime(); return Number.isNaN(timestamp) ? 0 : timestamp; }
function compareActivityByCreatedAtAsc(a, b) { const difference = activityTimestamp(a.createdAt) - activityTimestamp(b.createdAt); return difference || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); }
async function listTodoActivities(http, projectId, todoId) {
  const [history, comments] = await Promise.all([listAllTodoHistory(http, projectId, todoId).catch(() => []), listAllTodoComments(http, projectId, todoId).catch(() => [])]);
  const merged = [...history.flatMap(normalizeHistoryToActivity), ...comments.filter((item) => !item?.isDeleted).map(normalizeCommentToActivity)];
  return merged.sort(compareActivityByCreatedAtAsc);
}
async function createTodoComment(http, projectId, todoId, params) { const result = await executeGraphQL(http, projectId, MUTATION_ADD_COMMENT, { input: { todoId, content: params.content, parentId: null, mentionIds: params.mentionIds } }, 'addTodoComment'); unwrapUserErrors(result.addTodoComment, 'addTodoComment'); return normalizeComment(result.addTodoComment.comment, projectId, todoId); }
async function updateTodoComment(http, projectId, todoId, commentId, params) { const result = await executeGraphQL(http, projectId, MUTATION_UPDATE_COMMENT, { input: { commentId, content: params.content, addedMentionIds: params.addedMentionIds } }, 'updateTodoComment'); unwrapUserErrors(result.updateTodoComment, 'updateTodoComment'); return normalizeComment(result.updateTodoComment.comment, projectId, todoId); }
async function deleteTodoComment(http, projectId, _todoId, commentId) { const result = await executeGraphQL(http, projectId, MUTATION_DELETE_COMMENT, { input: { commentId } }, 'deleteTodoComment'); unwrapUserErrors(result.deleteTodoComment, 'deleteTodoComment'); }
async function createTodoReply(http, projectId, todoId, commentId, params) { const result = await executeGraphQL(http, projectId, MUTATION_ADD_COMMENT, { input: { todoId, content: params.content, parentId: commentId, mentionIds: params.mentionIds } }, 'addTodoComment'); unwrapUserErrors(result.addTodoComment, 'addTodoComment'); return normalizeReply(result.addTodoComment.comment, commentId); }
async function updateTodoReply(http, projectId, _todoId, commentId, replyId, params) { const result = await executeGraphQL(http, projectId, MUTATION_UPDATE_COMMENT, { input: { commentId: replyId, content: params.content, addedMentionIds: params.addedMentionIds } }, 'updateTodoComment'); unwrapUserErrors(result.updateTodoComment, 'updateTodoComment'); return normalizeReply(result.updateTodoComment.comment, commentId); }
async function deleteTodoReply(http, projectId, _todoId, _commentId, replyId) { const result = await executeGraphQL(http, projectId, MUTATION_DELETE_COMMENT, { input: { commentId: replyId } }, 'deleteTodoComment'); unwrapUserErrors(result.deleteTodoComment, 'deleteTodoComment'); }

module.exports = Object.freeze({ COMMENT_FIELDS, normalizeAuthor, normalizeAttachment, normalizeReply, normalizeComment, mapHistoryFieldToType, parseAssigneeIds, resolveAssigneeActivity, normalizeHistoryToActivity, normalizeCommentToActivity, listAllTodoComments, listAllTodoHistory, activityTimestamp, compareActivityByCreatedAtAsc, listTodoActivities, createTodoComment, updateTodoComment, deleteTodoComment, createTodoReply, updateTodoReply, deleteTodoReply });
