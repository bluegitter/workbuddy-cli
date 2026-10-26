'use strict';

const path = require('node:path');

function registerCloudStudioDeployHandlers(registry, deps = {}) {
  const service = deps.cloudStudioDeployService;
  if (!service) throw new Error('cloudStudioDeployService is required');
  registry.handle('cloudstudio:deploy', (args = {}) => service.deploy({ localDir: args.directory, port: args.port, workspaceRoot: args.cwd, entryHtml: args.entryHtml, taskSessionId: args.taskSessionId, triggerType: args.triggerType }));
  registry.handle('cloudstudio:deployTo', (args = {}) => service.deployTo(args.spaceKey, { localDir: args.directory, port: args.port, workspaceRoot: args.cwd }));
  registry.handle('cloudstudio:destroy', async (args = {}) => { if (args.conversationId) await service.cancelArtifactRelease(args.conversationId); else if (args.spaceKey) await service.destroy(args.spaceKey); else throw new Error('conversationId or spaceKey is required'); return { success: true }; });
  registry.handle('cloudstudio:createWorkspace', () => service.createWorkspace());
  registry.handle('cloudstudio:getDeployHistory', (args = {}) => service.getDeployHistory(args.workspaceRoot, args.taskSessionIds));
  registry.handle('cloudstudio:queryShareLink', (args = {}) => { const rawPath = path.resolve(args.filePath); if (!deps.exists(rawPath)) return { shareLink: null }; const isFile = deps.isFile(rawPath); const dirPath = isFile ? path.dirname(rawPath) : rawPath; const entryHtml = isFile ? path.basename(rawPath) : deps.detectEntryHtml(dirPath); return { shareLink: deps.findLatestDeployRecord(dirPath, entryHtml)?.shareLink || null }; });
  return registry;
}

module.exports = { registerCloudStudioDeployHandlers };
