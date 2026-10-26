'use strict';

const MESSAGE_FIELDS = `id content author { id name } parentId editCount source createdAt updatedAt isDeleted attachments { attachmentId provider externalId name fileType fileSize externalUrl }`;
const MUTATION_ADD_MESSAGE = `mutation($input: AddProjectMessageInput!) { addProjectMessage(input: $input) { message { ${MESSAGE_FIELDS} } errors { message } } }`;
const MUTATION_REPLY_MESSAGE = `mutation($input: ReplyProjectMessageInput!) { replyProjectMessage(input: $input) { message { ${MESSAGE_FIELDS} } errors { message } } }`;
const MUTATION_UPDATE_MESSAGE = `mutation($input: UpdateProjectMessageInput!) { updateProjectMessage(input: $input) { message { ${MESSAGE_FIELDS} } errors { message } } }`;
const MUTATION_DELETE_MESSAGE = `mutation($input: DeleteProjectMessageInput!) { deleteProjectMessage(input: $input) { messageId errors { message } } }`;
const QUERY_MESSAGE_REPLIES = `query($projectId: ID!, $messageId: ID!) { projectMessageReplies(projectId: $projectId, messageId: $messageId) { ${MESSAGE_FIELDS} } }`;
const { ROUTE_PREFIX } = require('../../runtime/http-contract');

const optionalString = (value) => typeof value === 'string' && value.trim() ? value.trim() : undefined;
const optionalNumber = (value) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;

function normalizeAuthor(raw) { return { id: optionalString(raw?.id) ?? '', name: optionalString(raw?.name) }; }
function normalizeAttachment(raw) { return { attachmentId: optionalString(raw?.attachmentId) ?? '', provider: optionalString(raw?.provider) ?? '', externalId: optionalString(raw?.externalId) ?? '', name: optionalString(raw?.name) ?? '', fileType: optionalString(raw?.fileType) ?? '', fileSize: optionalNumber(raw?.fileSize), externalUrl: optionalString(raw?.externalUrl) }; }
function normalizeMessage(raw, depth = 0) { return { id: optionalString(raw?.id) ?? '', content: optionalString(raw?.content) ?? '', author: normalizeAuthor(raw?.author), parentId: optionalString(raw?.parentId), replies: depth === 0 && Array.isArray(raw?.replies) ? raw.replies.map((reply) => normalizeMessage(reply, depth + 1)) : undefined, attachments: Array.isArray(raw?.attachments) ? raw.attachments.map(normalizeAttachment) : undefined, editCount: typeof raw?.editCount === 'number' ? raw.editCount : 0, source: optionalString(raw?.source) ?? 'user', createdAt: optionalString(raw?.createdAt) ?? '', updatedAt: optionalString(raw?.updatedAt) ?? optionalString(raw?.createdAt), isDeleted: Boolean(raw?.isDeleted) }; }
function normalizeAttachments(input) { if (!Array.isArray(input) || input.length === 0) return undefined; const valid = input.filter((item) => optionalString(item?.externalId)); return valid.length ? valid : undefined; }

function throwGraphQLErrors(operation, errors) { const messages = (Array.isArray(errors) ? errors : []).map((item) => optionalString(item?.message)).filter(Boolean); if (messages.length) throw new Error(`${operation}: ${messages.join('; ')}`); }
async function executeGraphQL(http, projectId, query, variables, operation) { const response = await http.post(`${ROUTE_PREFIX}/${encodeURIComponent(projectId)}/plan/graphql`, { query, variables }); throwGraphQLErrors(operation, response?.errors); if (!response?.data) throw new Error(`${operation}: empty response`); return response.data; }
function unwrapUserErrors(payload, operation) { throwGraphQLErrors(operation, payload?.errors); }
function normalizeMutationPayload(payload, fallbackId) { const message = payload?.message ? normalizeMessage(payload.message) : undefined; return { messageId: message?.id || fallbackId || '', message }; }

async function addProjectMessage(http, projectId, params) { const data = await executeGraphQL(http, projectId, MUTATION_ADD_MESSAGE, { input: { projectId, content: params.content, mentionIds: params.mentionIds, mentionAll: params.mentionAll, attachments: normalizeAttachments(params.attachments) } }, 'addProjectMessage'); unwrapUserErrors(data.addProjectMessage, 'addProjectMessage'); return normalizeMutationPayload(data.addProjectMessage); }
async function replyProjectMessage(http, projectId, params) { const data = await executeGraphQL(http, projectId, MUTATION_REPLY_MESSAGE, { input: { projectId, parentId: params.parentId, content: params.content, mentionIds: params.mentionIds, mentionAll: params.mentionAll, attachments: normalizeAttachments(params.attachments) } }, 'replyProjectMessage'); unwrapUserErrors(data.replyProjectMessage, 'replyProjectMessage'); return normalizeMutationPayload(data.replyProjectMessage); }
async function updateProjectMessage(http, projectId, messageId, params) { const data = await executeGraphQL(http, projectId, MUTATION_UPDATE_MESSAGE, { input: { projectId, messageId, content: params.content } }, 'updateProjectMessage'); unwrapUserErrors(data.updateProjectMessage, 'updateProjectMessage'); return normalizeMutationPayload(data.updateProjectMessage, messageId); }
async function deleteProjectMessage(http, projectId, messageId) { const data = await executeGraphQL(http, projectId, MUTATION_DELETE_MESSAGE, { input: { projectId, messageId } }, 'deleteProjectMessage'); unwrapUserErrors(data.deleteProjectMessage, 'deleteProjectMessage'); }
async function listProjectMessageReplies(http, projectId, messageId) { const data = await executeGraphQL(http, projectId, QUERY_MESSAGE_REPLIES, { projectId, messageId }, 'projectMessageReplies'); return (Array.isArray(data.projectMessageReplies) ? data.projectMessageReplies : []).filter((item) => !item?.isDeleted).map(normalizeMessage); }

module.exports = { normalizeAuthor, normalizeAttachment, normalizeMessage, normalizeAttachments, normalizeMutationPayload, addProjectMessage, replyProjectMessage, updateProjectMessage, deleteProjectMessage, listProjectMessageReplies };
