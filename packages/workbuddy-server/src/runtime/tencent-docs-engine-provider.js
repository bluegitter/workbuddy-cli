'use strict';

function createTencentDocsEngineProvider({ documentService, logger, buildLocalMcpEnv = (port) => ({ editor_sdk_port: String(port) }) }) {
  return {
    async resolveAgentEnv() {
      const canStart = await documentService.canEnsureEngineStart?.().catch?.(() => false);
      if (canStart && !documentService.isEngineStarted()) {
        documentService.ensureEngineStarted?.('agent-spawn').catch?.((error) => logger?.warn?.('[TencentDocsEngine] background engine warmup failed during session init', { error: error instanceof Error ? error.message : String(error) }));
      }
      const engineStarted = documentService.isEngineStarted();
      const enginePort = documentService.getEnginePort();
      const env = engineStarted ? { ...buildLocalMcpEnv(enginePort) } : {};
      if (engineStarted && enginePort) env.editor_sdk_port = String(enginePort);
      logger?.info?.('[TencentDocsEngine] resolveAgentEnv result', { engineStarted, enginePort, envKeys: Object.keys(env) });
      return env;
    },
  };
}

module.exports = { createTencentDocsEngineProvider };
