'use strict';

const fs = require('node:fs');
const path = require('node:path');
const project = require('./_internal/cloud-project');
const task = require('./_internal/cloud-task');
const invitation = require('./_internal/cloud-invitation');
const join = require('./_internal/cloud-join-request');
const member = require('./_internal/cloud-member');
const activity = require('./_internal/cloud-activity');
const manifest = require('./_internal/cloud-manifest');
const todo = require('./_internal/cloud-todo');
const todoSync = require('./_internal/cloud-todo-sync-source');
const todoWebhook = require('./_internal/cloud-todo-webhook');
const todoComment = require('./_internal/cloud-todo-comment');
const collaboration = require('./_internal/cloud-task-collaboration');
const skill = require('./_internal/cloud-skill');
const netdrive = require('./_internal/cloud-netdrive-history');
const message = require('./_internal/cloud-project-message');
const messageResolver = require('./_internal/cloud-message');
const smartsheet = require('./_internal/smartsheet/smartsheet-http-adapter');

function bindMethods(target, source, names, httpName = 'http') {
  for (const name of names) target[name] = (...args) => source[name](target[httpName], ...args);
}
function bindAliases(target, source, aliases, httpName = 'http') {
  for (const [publicName, sourceName] of Object.entries(aliases)) target[publicName] = (...args) => source[sourceName](target[httpName], ...args);
}

class ProjectService {
  constructor(deps = {}) {
    this.http = deps.http || deps.context?.http;
    if (!this.http) throw new TypeError('ProjectService requires an http client');
    this.handoffHttp = deps.handoffHttp || this.http;
    this.logWriter = deps.logWriter;
    this.refreshProjectResources = deps.refreshProjectResources;
    this.deps = deps;
    this.getSessionManager = typeof deps.sessionManager === 'function' ? deps.sessionManager : () => deps.sessionManager;
    this.getCurrentUserId = deps.getCurrentUserId;
    this.getSidecarEndpoint = deps.getSidecarEndpoint;
    bindAliases(this, project, { list: 'listProjects', checkProjectQuota: 'checkProjectQuota', get: 'getProject', create: 'createProject', update: 'updateProject', archive: 'archiveProject', unarchive: 'unarchiveProject', delete: 'deleteProject', leave: 'leaveProject' });
    bindMethods(this, task, ['createTask', 'connectTask', 'listTasks', 'handoffTask', 'switchExpert', 'forkConversation', 'getConversationDetail', 'setConversationStatus', 'syncAgent', 'fetchTimeline', 'updateTaskTitle', 'archiveTask', 'deleteTask', 'leaveConversation']);
    bindMethods(this, join, ['getProjectJoinEntry', 'getTaskJoinEntry', 'submitJoinRequest', 'cancelJoinRequest', 'getMyJoinRequest', 'submitTaskJoinRequest', 'getMyTaskJoinRequest', 'approveProjectJoinRequest', 'rejectProjectJoinRequest', 'approveTaskJoinRequest', 'rejectTaskJoinRequest']);
    bindAliases(this, member, { listMembers: 'listProjectMembers', updateMemberRole: 'updateProjectMemberRole', removeMember: 'removeProjectMember' });
    bindAliases(this, activity, { listActivities: 'listProjectActivities', getActivityUnread: 'getProjectActivityUnread', markActivityRead: 'markProjectActivityRead' });
    bindAliases(this, manifest, { getManifest: 'getProjectManifest', updateManifest: 'updateProjectManifest' });
    bindMethods(this, todo, ['listTodoStatuses', 'listTodos', 'getTodo', 'createTodo', 'updateTodo', 'assignTodo', 'startTodo', 'transitionTodo', 'prepareTodoAttachmentUploads', 'uploadTodoAttachmentFiles', 'addTodoAttachment', 'removeTodoAttachment', 'deleteTodo', 'batchDeleteTodos']);
    bindMethods(this, todoSync, ['listTodoSyncSources', 'listTodoSyncSourceTargets', 'createTodoSyncSource', 'generateTodoSyncSourceFilterConfig', 'testTodoSyncSourceFilterConfig', 'updateTodoSyncSourceStatus', 'updateTodoSyncSource', 'deleteTodoSyncSource']);
    bindMethods(this, todoWebhook, ['createTodoWebhookConfig', 'listTodoWebhookConfigs', 'getTodoWebhookConfig', 'getTodoWebhookConfigByProvider', 'updateTodoWebhookConfig', 'deleteTodoWebhookConfig']);
    bindMethods(this, todoComment, ['listTodoActivities', 'createTodoComment', 'updateTodoComment', 'deleteTodoComment', 'createTodoReply', 'updateTodoReply', 'deleteTodoReply']);
    bindMethods(this, collaboration, ['listConversationMembers', 'directInviteTaskCollaborator', 'createTaskInviteLink', 'removeTaskCollaborator']);
    bindAliases(this, skill, { listSkills: 'listProjectSkills', listCustomSkills: 'listProjectCustomSkills', addSkill: 'addProjectSkill', removeSkill: 'removeProjectSkill', removeCustomSkill: 'removeProjectCustomSkill', updateSkills: 'updateProjectSkills', getProjectCustomSkill: 'getProjectCustomSkill' });
    bindAliases(this, netdrive, { loadNetdriveHistory: 'loadNetdriveHistory', mergeNetdriveHistory: 'mergeNetdriveHistory' });
    bindMethods(this, message, ['addProjectMessage', 'replyProjectMessage', 'updateProjectMessage', 'deleteProjectMessage', 'listProjectMessageReplies']);
    bindAliases(this, smartsheet, { smartsheetListTables: 'listTables', smartsheetFetchSheetHead: 'fetchSheetHead', smartsheetFetchSheetChunk: 'fetchSheetChunk', smartsheetCommitChanges: 'commitChanges', smartsheetGetChanges: 'getChanges' });
  }

  writeLog(projectId, tag, data) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    this.deps.logger?.debug?.(`[ProjectService] [${tag}]`, payload);
    if (!this.logWriter || !projectId) return;
    const date = new Date().toISOString().slice(0, 10);
    try { this.logWriter.append(`${date}/teams-${projectId}/api.log`, `[${new Date().toISOString()}] [${tag}] ${payload}\n`); } catch {}
  }

  resolveMessage(params) { return messageResolver.resolveMessage(this.http, params, (tag, data) => this.writeLog(params?.conversationId, tag, data)); }

  async createInvitation(projectId, request, currentUid) { return invitation.createProjectInvitation(projectId, request, this.http, currentUid ?? await this.getCurrentUserId?.()); }
  getInvitationDetail(token) { return invitation.getProjectInvitationDetail(token, this.http); }
  async acceptInvitation(token, currentUid) { return invitation.acceptProjectInvitation(token, this.http, currentUid ?? await this.getCurrentUserId?.()); }
  rejectInvitation(token) { return invitation.rejectProjectInvitation(token, this.http); }
  async approveInvitation(projectId, inviteId, currentUid) { return invitation.approveProjectInvitation(projectId, inviteId, this.http, currentUid ?? await this.getCurrentUserId?.()); }
  adminRejectInvitation(projectId, inviteId) { return invitation.adminRejectProjectInvitation(projectId, inviteId, this.http); }

  handoffTodoGraphQL(params) { return todo.handoffTodoGraphQL(this.handoffHttp, params); }
  handoffTask(conversationId, params) { return task.handoffTask(this.handoffHttp, conversationId, params); }
  listTodoSyncSources(projectId, params) { return todoSync.listTodoSyncSources(this.http, projectId, params); }
  listSkills(projectId) { return skill.listProjectSkills(this.http, projectId, this.logWriter); }
  listCustomSkills(projectId) { return skill.listProjectCustomSkills(this.http, projectId, this.logWriter); }
  uploadSkill(projectId, params) { return skill.uploadProjectSkill(this.http, projectId, params.file, params.options || params, this.logWriter, (file) => this.resolveUploadFile(file), this.getMultipartHttpConfig()); }
  addSkill(projectId, params) { return skill.addProjectSkill(this.http, projectId, params, this.logWriter); }
  removeSkill(projectId, skillId) { return skill.removeProjectSkill(this.http, projectId, skillId, this.logWriter); }
  removeCustomSkill(projectId, skillId) { return skill.removeCustomSkill(this.http, projectId, skillId, this.logWriter); }
  updateSkills(projectId, params) { return skill.updateProjectSkills(this.http, projectId, params, this.logWriter); }

  getMultipartHttpConfig() { return undefined; }
  async resolveUploadFile(file) {
    if (!file || typeof file !== 'object' || !('filePath' in file)) return file;
    const bytes = await fs.promises.readFile(file.filePath);
    return new Blob([bytes], file.type ? { type: file.type } : {});
  }
  getOnlineStatus() { return this.deps.getOnlineStatus?.() ?? true; }
  refreshLocalTaskResources(...args) { return this.refreshProjectResources?.(...args); }
  delegateTodoToAssistant(...args) { return this.deps.delegateTodoToAssistant?.(...args); }
  stopTodoDelegation(...args) { return this.deps.stopTodoDelegation?.(...args); }
  getTodoDelegationStatus(...args) { return this.deps.getTodoDelegationStatus?.(...args); }
  listTaskQueue(...args) { return this.deps.taskQueue?.list?.(...args); }
  removeTaskQueueItem(...args) { return this.deps.taskQueue?.remove?.(...args); }
  editTaskQueueItem(...args) { return this.deps.taskQueue?.edit?.(...args); }
  reorderTaskQueue(...args) { return this.deps.taskQueue?.reorder?.(...args); }
  sendTaskQueueItemNow(...args) { return this.deps.taskQueue?.sendNow?.(...args); }
  pauseTaskQueue(...args) { return this.deps.taskQueue?.pause?.(...args); }
  resumeTaskQueue(...args) { return this.deps.taskQueue?.resume?.(...args); }
}

module.exports = Object.freeze({ ProjectService });
