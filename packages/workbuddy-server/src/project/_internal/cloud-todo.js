'use strict';

const {
  executeGraphQL, unwrapUserErrors, requireValue, throwProjectTodoError,
  normalizeOptionalString, normalizeOptionalNumber, normalizeTodo, normalizeTodoStatus,
  normalizeTodoAttachment, normalizeTodoAttachmentUploadTarget, buildTodoFilter,
  buildTodoOrderInput, buildCreateTodoInput, buildUpdateTodoInput, buildAttachmentInput,
} = require('./cloud-todo-utils');
const { isTodoNotFoundError, TodoNotFoundError } = require('./todo-errors');
const { uploadTodoAttachmentFiles } = require('../todo-attachment-upload');

const TODO_ATTACHMENT_UPLOAD_ENDPOINT = '/console/as/support/presigned_url';
const TODO_CORE_FIELDS = `
    id projectId title description priority source sourceExternalId sourceExternalUrl tags summary
    sessions { sessionId createdBy { id name } createdAt }
    dueDate startedAt completedAt pauseReason createdAt updatedAt
    status { id name type } creator { id name } assignees { id name }
    handoffFrom { id } handoffNote handoffSessionId
`;
const TODO_DETAIL_FIELDS = `${TODO_CORE_FIELDS}
    snapshotSessionId subscribers { id name } allowedTransitions { id name type }
    attachments { id provider externalId name fileType fileSize externalUrl uploadedBy { id name } createdAt }
    history { nodes { id actorId field oldValue newValue createdAt } totalCount }`;
const LIST_TODOS_QUERY = `query ProjectTodos($filter: TodoFilter!, $first: Int, $after: String, $orderBy: [TodoOrder!]) { todos(filter: $filter, first: $first, after: $after, orderBy: $orderBy) { nodes { ${TODO_CORE_FIELDS} } pageInfo { hasNextPage endCursor } totalCount } }`;
const GET_TODO_QUERY = `query TodoDetail($id: ID!) { todo(id: $id) { ${TODO_DETAIL_FIELDS} } }`;
const LIST_TODO_STATUSES_QUERY = 'query TodoStatuses($projectId: ID) { todoStatuses(projectId: $projectId) { id name type position isDefault } }';
const CREATE_TODO_MUTATION = `mutation CreateTodo($input: CreateTodoInput!) { createTodo(input: $input) { todo { ${TODO_CORE_FIELDS} } errors { message } } }`;
const UPDATE_TODO_MUTATION = `mutation UpdateTodo($input: UpdateTodoInput!) { updateTodo(input: $input) { todo { ${TODO_CORE_FIELDS} } errors { message } } }`;
const ASSIGN_TODO_MUTATION = `mutation AssignTodo($input: AssignTodoInput!) { assignTodo(input: $input) { todo { ${TODO_CORE_FIELDS} } errors { message } } }`;
const TRANSITION_TODO_MUTATION = `mutation TransitionTodo($input: TransitionTodoInput!) { transitionTodo(input: $input) { todo { ${TODO_CORE_FIELDS} } errors { message } } }`;
const ADD_TODO_ATTACHMENT_MUTATION = `mutation AddTodoAttachment($input: AddTodoAttachmentInput!) { addTodoAttachment(input: $input) { attachment { id provider externalId name fileType fileSize externalUrl uploadedBy { id } createdAt } errors { message } } }`;
const REMOVE_TODO_ATTACHMENT_MUTATION = 'mutation RemoveTodoAttachment($input: RemoveTodoAttachmentInput!) { removeTodoAttachment(input: $input) { todo { id } errors { message } } }';
const DELETE_TODO_MUTATION = 'mutation DeleteTodo($input: DeleteTodoInput!) { deleteTodo(input: $input) { todo { id } errors { message } } }';
const BATCH_DELETE_TODOS_MUTATION = 'mutation BatchDeleteTodos($input: BatchDeleteTodosInput!) { batchDeleteTodos(input: $input) { deletedCount errors { message } } }';
const HANDOFF_TODO_MUTATION = `mutation HandoffTodo($input: HandoffTodoInput!) { handoffTodo(input: $input) { todo { ${TODO_CORE_FIELDS} blockingReason } errors { field message } } }`;

function normalizeBatchDeleteTodoIds(ids) {
  const normalized = [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id).trim()).filter(Boolean))];
  if (!normalized.length) throwProjectTodoError('batch delete todos', ['No todo items were selected for deletion.']);
  if (normalized.length > 100) throwProjectTodoError('batch delete todos', ['Cannot delete more than 100 todo items at once.']);
  return normalized;
}

async function listTodoStatuses(http, projectId) {
  const data = await executeGraphQL(http, projectId, LIST_TODO_STATUSES_QUERY, { projectId }, 'list todo statuses');
  return Array.isArray(data.todoStatuses) ? data.todoStatuses.map(normalizeTodoStatus) : [];
}

async function listTodos(http, projectId, params = {}) {
  const connection = (await executeGraphQL(http, projectId, LIST_TODOS_QUERY, { filter: buildTodoFilter(projectId, params), first: params.limit, after: params.cursor, orderBy: buildTodoOrderInput(params.orderBy) }, 'list todos')).todos;
  const items = Array.isArray(connection?.nodes) ? connection.nodes.map(normalizeTodo) : [];
  return { items, total: normalizeOptionalNumber(connection?.totalCount) ?? items.length, hasMore: Boolean(connection?.pageInfo?.hasNextPage), nextCursor: normalizeOptionalString(connection?.pageInfo?.endCursor) };
}

async function getTodo(http, projectId, todoId) {
  try { return normalizeTodo(requireValue((await executeGraphQL(http, projectId, GET_TODO_QUERY, { id: todoId }, 'get todo')).todo, 'get todo', 'todo')); }
  catch (error) { if (isTodoNotFoundError(error)) throw new TodoNotFoundError(); throw error; }
}

async function handoffTodoGraphQL(http, params) {
  const input = { sessionId: params.sessionId, toUserId: params.toUserId, projectId: params.projectId, summary: params.summary };
  if (params.title) input.title = params.title;
  if (params.note) input.note = params.note;
  if (params.dueDate) input.dueDate = params.dueDate;
  const payload = requireValue((await executeGraphQL(http, params.projectId, HANDOFF_TODO_MUTATION, { input }, 'handoff todo')).handoffTodo, 'handoff todo', 'payload');
  unwrapUserErrors(payload, 'handoff todo');
  return normalizeTodo(requireValue(payload.todo, 'handoff todo', 'todo'));
}

async function createTodo(http, params) {
  const payload = requireValue((await executeGraphQL(http, params.projectId, CREATE_TODO_MUTATION, { input: buildCreateTodoInput(params) }, 'create todo')).createTodo, 'create todo', 'payload');
  unwrapUserErrors(payload, 'create todo');
  return normalizeTodo(requireValue(payload.todo, 'create todo', 'todo'));
}

async function updateTodo(http, projectId, todoId, patch) {
  const payload = requireValue((await executeGraphQL(http, projectId, UPDATE_TODO_MUTATION, { input: buildUpdateTodoInput(todoId, patch) }, 'update todo')).updateTodo, 'update todo', 'payload');
  unwrapUserErrors(payload, 'update todo');
  return normalizeTodo(requireValue(payload.todo, 'update todo', 'todo'));
}

async function assignTodo(http, projectId, todoId, assigneeIds) {
  const payload = requireValue((await executeGraphQL(http, projectId, ASSIGN_TODO_MUTATION, { input: { id: todoId, assigneeIds } }, 'assign todo')).assignTodo, 'assign todo', 'payload');
  unwrapUserErrors(payload, 'assign todo');
  return normalizeTodo(requireValue(payload.todo, 'assign todo', 'todo'));
}

async function startTodo(http, projectId, todoId) {
  const status = (await listTodoStatuses(http, projectId)).find((item) => item.type === 'in_progress');
  return transitionTodo(http, projectId, todoId, { statusId: requireValue(status?.id, 'start todo', 'running status') });
}

async function transitionTodo(http, projectId, todoId, params) {
  const input = { id: todoId, statusId: params.statusId };
  if (Object.prototype.hasOwnProperty.call(params, 'pauseReason')) input.pauseReason = params.pauseReason;
  const payload = requireValue((await executeGraphQL(http, projectId, TRANSITION_TODO_MUTATION, { input }, 'transition todo')).transitionTodo, 'transition todo', 'payload');
  unwrapUserErrors(payload, 'transition todo');
  return normalizeTodo(requireValue(payload.todo, 'transition todo', 'todo'));
}

async function prepareTodoAttachmentUploads(http, _projectId, params) {
  if (!params.files.length) return { items: [] };
  const objectKeys = params.files.map((file) => require('./cloud-todo-utils').buildTodoAttachmentObjectKey(file.name));
  const data = requireValue((await http.post(TODO_ATTACHMENT_UPLOAD_ENDPOINT, { object_keys: objectKeys, permanent: params.permanent ?? true }))?.data, 'prepare todo attachment upload', 'data');
  const items = Array.isArray(data.items) ? data.items.map(normalizeTodoAttachmentUploadTarget).filter(Boolean) : [];
  if (items.length !== objectKeys.length) throwProjectTodoError('prepare todo attachment upload', [`expected ${objectKeys.length} upload target(s), got ${items.length}`]);
  return { expire: normalizeOptionalNumber(data.expire), items };
}

async function uploadTodoAttachmentFilesForTodo(http, projectId, params) {
  const prepared = await prepareTodoAttachmentUploads(http, projectId, { files: params.files.map((file) => ({ name: file.name })), permanent: params.permanent });
  return uploadTodoAttachmentFiles(params.files, prepared.items);
}

async function addTodoAttachment(http, projectId, todoId, params) {
  const payload = requireValue((await executeGraphQL(http, projectId, ADD_TODO_ATTACHMENT_MUTATION, { input: buildAttachmentInput(todoId, params) }, 'add todo attachment')).addTodoAttachment, 'add todo attachment', 'payload');
  unwrapUserErrors(payload, 'add todo attachment');
  return normalizeTodoAttachment(requireValue(payload.attachment, 'add todo attachment', 'attachment'));
}

async function removeTodoAttachment(http, projectId, todoId, attachmentId) {
  const payload = requireValue((await executeGraphQL(http, projectId, REMOVE_TODO_ATTACHMENT_MUTATION, { input: { todoId, attachmentId } }, 'remove todo attachment')).removeTodoAttachment, 'remove todo attachment', 'payload');
  unwrapUserErrors(payload, 'remove todo attachment');
}

async function deleteTodo(http, projectId, todoId) {
  const payload = requireValue((await executeGraphQL(http, projectId, DELETE_TODO_MUTATION, { input: { id: todoId } }, 'delete todo')).deleteTodo, 'delete todo', 'payload');
  unwrapUserErrors(payload, 'delete todo');
}

async function batchDeleteTodos(http, projectId, params) {
  const ids = normalizeBatchDeleteTodoIds(params.ids);
  const payload = requireValue((await executeGraphQL(http, projectId, BATCH_DELETE_TODOS_MUTATION, { input: { ids } }, 'batch delete todos')).batchDeleteTodos, 'batch delete todos', 'payload');
  unwrapUserErrors(payload, 'batch delete todos');
  const deletedCount = requireValue(normalizeOptionalNumber(payload.deletedCount), 'batch delete todos', 'deletedCount');
  if (!Number.isInteger(deletedCount) || deletedCount < 0 || deletedCount !== ids.length) throwProjectTodoError('batch delete todos', [`Only ${deletedCount} of ${ids.length} selected todo items were deleted. Please refresh the list and try again.`]);
  return { deletedCount };
}

module.exports = Object.freeze({ TODO_ATTACHMENT_UPLOAD_ENDPOINT, TODO_CORE_FIELDS, TODO_DETAIL_FIELDS, normalizeBatchDeleteTodoIds, listTodoStatuses, listTodos, getTodo, handoffTodoGraphQL, createTodo, updateTodo, assignTodo, startTodo, transitionTodo, prepareTodoAttachmentUploads, uploadTodoAttachmentFiles: uploadTodoAttachmentFilesForTodo, addTodoAttachment, removeTodoAttachment, deleteTodo, batchDeleteTodos });
