'use strict';

const ContextVariableNames = Object.freeze({
  UserInputPrompt: 'userInputPrompt', ModelPersonality: 'modelPersonality', UserInfo: 'userInfo', SystemInfo: 'systemInfo',
  VCS: 'vcs', VCSLogs: 'vcsLogs', VCSDiffs: 'vcsDiffs', HistoryMessages: 'historyMessages', KnowledgeBase: 'knowledgeBase',
  ActiveEditor: 'activeEditor', Terminal: 'terminal', Problems: 'problems', Rules: 'rules', Files: 'files', GlobalPrompts: 'globalPrompts',
  PackageFiles: 'packageFiles', Codebase: 'codebase', RelatedFiles: 'relatedFiles', Diagnostics: 'diagnostics', WorkspaceFileDiffs: 'workspaceFileDiffs',
  CodeSnippets: 'codeSnippets', ModelOutput: 'modelOutput', TestSettings: 'testSettings', AllowActionList: 'allowActionList',
  ConnectedMcpServers: 'connectedServers', InstallMcpServer: 'installMcpServer', McpPathInfo: 'mcpPathInfo',
});

module.exports = { ContextVariableNames };
