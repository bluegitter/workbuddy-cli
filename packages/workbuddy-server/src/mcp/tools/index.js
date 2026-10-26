'use strict';

function createConversationSearchBuiltinTool(deps) { return deps.createConversationSearchTool(deps); }
function shouldRegisterConversationSearchTool(deps) { return deps.isCloudMemoryEnabled?.() !== false; }
function syncConversationSearchBuiltinTool(deps, enabled) {
  if (!enabled) return deps.connectorMcpProxy.unregisterBuiltinTool('conversation_search') ? 'unregistered' : 'already_unregistered';
  deps.connectorMcpProxy.registerBuiltinTool({ ...createConversationSearchBuiltinTool(deps), defer_loading: false });
  return 'registered';
}
function syncPickLocationBuiltinTool(deps, enabled) {
  if (!enabled) return deps.connectorMcpProxy.unregisterBuiltinTool('pick_location') ? 'unregistered' : 'already_unregistered';
  deps.connectorMcpProxy.registerBuiltinTool({ ...deps.createPickLocationTool(deps), defer_loading: true });
  return 'registered';
}
function syncAgentMailAttachmentBuiltinTools(deps, enabled) {
  const uploadTool = deps.createUploadAttachmentTool(deps); const downloadTool = deps.createDownloadAttachmentTool(deps);
  if (!enabled) { const removed = deps.connectorMcpProxy.unregisterBuiltinTool(uploadTool.name) || deps.connectorMcpProxy.unregisterBuiltinTool(downloadTool.name); return removed ? 'unregistered' : 'already_unregistered'; }
  deps.connectorMcpProxy.registerBuiltinTool({ ...uploadTool, defer_loading: true }); deps.connectorMcpProxy.registerBuiltinTool({ ...downloadTool, defer_loading: true }); return 'registered';
}
function createWorkbuddyAppServerMcpTools(deps) {
  const tools = [
    deps.createPresentFilesTool({ productManager: deps.productManager, pushSessionCommand: deps.pushSessionCommand, staticHtmlServer: deps.staticHtmlServer }),
    deps.createConnectCloudServiceTool(deps.authService, deps.productManager),
    deps.createAutomationUpdateTool(deps.automationService, deps.eventService, deps.resolveCurrentSessionModelId, deps.resolveExpertId),
    deps.createVisualizerReadMeTool(), deps.createVisualizerShowWidgetTool(),
    deps.createCloudStudioDeployTool({ cloudStudioDeployService: deps.cloudStudioDeployService }),
    deps.createMarketplaceSkillTool({ skillsService: deps.skillsService })
  ];
  if (shouldRegisterConversationSearchTool(deps)) tools.push(createConversationSearchBuiltinTool(deps));
  return tools;
}

module.exports = Object.freeze({ createConversationSearchBuiltinTool, createWorkbuddyAppServerMcpTools, shouldRegisterConversationSearchTool, syncAgentMailAttachmentBuiltinTools, syncConversationSearchBuiltinTool, syncPickLocationBuiltinTool });
