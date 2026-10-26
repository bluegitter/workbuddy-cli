'use strict';

const { createWorkbuddySkillSecurityAppKeyResolver } = require('../skill/security-app-key');

function getServerFetch(input) { return input.serverFetch || globalThis.fetch; }

function createRuntimeServiceDeps(input, logger) {
  return { cellDeps: input.celljs, homeDir: input.configDir, fetch: getServerFetch(input), logger };
}

function createConnectorOauthApiDeps(input) {
  return Promise.resolve(input.celljs).then((celljs) => ({ productManager: celljs.productManager, authenticationManager: celljs.authenticationManager, fetch: getServerFetch(input) }));
}

function createEnhancePromptDeps(input) {
  return {
    getSidecarEndpoint: async () => input.runtimeManager?.getHostEndpoint?.(),
    createClient: input.createEnhancePromptClient || ((endpoint) => { throw new Error(`Enhance prompt client factory is not configured for ${endpoint}`); }),
    logger: input.enhancePromptLogger,
  };
}

function createProxySettingsService(input, logger) {
  if (input.proxySettingsService) return input.proxySettingsService;
  if (typeof input.createProxySettingsService === 'function') return input.createProxySettingsService(input, logger);
  throw new Error('createProxySettingsService is required for daemon RPC dependencies');
}

async function createWorkbuddyDaemonServerRpcHandlerDeps(input = {}) {
  const mainLogger = input.logger?.main || console;
  const handlerLogger = input.logger?.handler || console;
  const runtimeLogger = input.logger?.runtime || console;
  const serverFetch = getServerFetch(input);
  const monitorReporter = input.reporter;
  const callConnectorOauthApi = input.callConnectorOauthApi;
  const myFilesCallApi = async (method, apiPath, body) => {
    if (typeof callConnectorOauthApi !== 'function') throw new Error('callConnectorOauthApi is required for my-files handlers');
    return callConnectorOauthApi(method, apiPath, await createConnectorOauthApiDeps(input), body || {});
  };

  attachProjectNetdriveRootResolver(input, myFilesCallApi, handlerLogger).catch((error) => handlerLogger.info?.('[daemon-rpc-handler-deps] netdrive resolver rejected', error));
  attachProjectInstructionsResolver(input, myFilesCallApi, handlerLogger).catch((error) => handlerLogger.info?.('[daemon-rpc-handler-deps] project instructions resolver rejected', error));
  attachUserPromptAccountChangeInvalidator(input, handlerLogger).catch((error) => handlerLogger.info?.('[daemon-rpc-handler-deps] account invalidator rejected', error));

  const resolveSkillKey = input.getSkillSecurityAppKey || createWorkbuddySkillSecurityAppKeyResolver({ requireBundledAsset: input.requireBundledAsset });
  const celljs = Promise.resolve(input.celljs);
  const services = Promise.resolve(input.services);
  return {
    auth: { authService: celljs.then((value) => value.authService), authenticationManager: celljs.then((value) => value.authenticationManager), reporter: monitorReporter },
    agentIm: { cellDeps: celljs.then((value) => ({ productManager: value.productManager, authenticationManager: value.authenticationManager, clawService: value.clawService })), configDir: input.configDir, fetch: serverFetch, logger: runtimeLogger },
    agentMail: createRuntimeServiceDeps(input, runtimeLogger),
    config: { services: services.then((value) => ({ config: value.config })) },
    builtinSkills: { resolveBundledAsset: input.resolveBundledAsset },
    cloudAgent: { cellDeps: celljs.then((value) => ({ productManager: value.productManager, authenticationManager: value.authenticationManager })), fetch: serverFetch, logger: runtimeLogger },
    cloudAssistant: createRuntimeServiceDeps(input, runtimeLogger),
    designAuth: { checkConnectorStatus: (name) => input.checkConnectorStatus ? input.checkConnectorStatus(name, input) : 'not_connected', logger: mainLogger },
    connector: createRuntimeServiceDeps(input, runtimeLogger),
    connectorOauth: {
      getApiDeps: () => createConnectorOauthApiDeps(input),
      resolveOauthName: async (id) => (await celljs).connectorService.resolveOauthName(id),
      getEnterpriseId: async () => (await celljs).authService.getAccount?.()?.enterpriseId,
      clearDefaultSessionCookiesForDomains: (domains) => input.host?.network?.clearDefaultSessionCookiesForDomains?.(domains),
      logger: runtimeLogger,
    },
    dataRetention: { storage: services.then((value) => value.storage), configDir: input.configDir, database: celljs.then((value) => value.database), getCurrentUserId: async () => (await celljs).authService?.getAccount?.()?.uid, logger: runtimeLogger },
    docs: { docsService: input.docsService, network: { fetch: serverFetch }, logger: handlerLogger, ...(input.localDocsRelease ? { localDocsRelease: input.localDocsRelease } : {}), ...(input.localDocs ? { localDocs: input.localDocs } : {}), ...(input.tencentDocsRuntime ? { tencentDocsRuntime: input.tencentDocsRuntime } : {}) },
    enhancePrompt: createEnhancePromptDeps(input),
    enterprisePolicy: createRuntimeServiceDeps(input, runtimeLogger),
    expert: { ...createRuntimeServiceDeps(input, runtimeLogger), getSkillSecurityAppKey: resolveSkillKey, reporter: monitorReporter },
    idleCapability: { service: services.then((value) => value.idleCapability) },
    ima: { cellDeps: input.celljs, logger: runtimeLogger },
    license: { cellDeps: celljs.then((value) => ({ productManager: value.productManager, authenticationManager: value.authenticationManager, restOperations: value.restOperations })), homeDir: input.configDir, fetch: serverFetch, logger: runtimeLogger },
    clawControl: { cellDeps: celljs.then((value) => ({ productManager: value.productManager, authenticationManager: value.authenticationManager, restOperations: value.restOperations })), getClawService: async () => (await celljs).clawService, homeDir: input.configDir, fetch: serverFetch, logger: runtimeLogger },
    identity: { identityServiceRef: input.identityServiceRef, moderationService: input.moderationService, configDir: input.configDir, logger: mainLogger },
    memory: { memory: services.then((value) => value.memory) },
    models: createRuntimeServiceDeps(input, runtimeLogger),
    msgCenter: createRuntimeServiceDeps(input, runtimeLogger),
    network: { createService: input.createNetworkDiagnosticsService, dialog: input.host?.dialog, shell: input.host?.shell, logger: mainLogger },
    personalSkills: createRuntimeServiceDeps(input, runtimeLogger),
    plugin: { pluginService: services.then((value) => value.plugins), afterPluginsChanged: async () => (await celljs).connectorService.refreshAndSync(), reporter: monitorReporter, logger: runtimeLogger },
    project: { ...createRuntimeServiceDeps(input, runtimeLogger), sessionManager: input.sessionManager, getSidecarEndpoint: async () => input.runtimeManager?.getHostEndpoint?.() },
    proxySettings: { service: createProxySettingsService(input, runtimeLogger), logger: runtimeLogger },
    scheduler: createRuntimeServiceDeps(input, runtimeLogger),
    securityCenter: { configDir: input.configDir, platform: input.host?.app?.getPlatform?.(), appLocale: () => input.core?.platform?.appLocale?.() || 'en', cellDeps: celljs.then((value) => ({ coordinator: value.coordinator, productManager: value.productManager })), services: services.then((value) => ({ config: value.config })), showSaveDialog: (value) => input.host?.dialog?.showSaveDialog(value), openPath: (value) => input.host?.shell?.openPath(value), applyWindowsExperimentalFeatures: input.host?.applyWindowsExperimentalFeatures, auditStore: input.auditStore, broadcastSandboxRulesDelta: input.broadcastSandboxRulesDelta, logger: runtimeLogger },
    sessionRuntime: { sessionManager: input.sessionManager, loadTeamRuntimeSnapshot: input.loadTeamRuntimeSnapshot, logger: runtimeLogger },
    enterpriseSkills: createRuntimeServiceDeps(input, runtimeLogger),
    skill: { builtinSkillsDir: input.requireBundledAsset?.('builtin-skills'), platform: input.host?.app?.getPlatform?.(), dialog: input.host?.dialog, fetch: serverFetch, policyService: celljs.then((value) => value.skillUploadPolicyService).catch(() => undefined), getSkillSecurityAppKey: resolveSkillKey, reporter: monitorReporter, logger: runtimeLogger },
    storage: { storage: services.then((value) => value.storage) },
    support: createRuntimeServiceDeps(input, runtimeLogger),
    telemetry: { reportEvent: input.reportEvent, reportEventSync: input.reportEventSync, logLifecycleEvent: input.logLifecycleEvent },
    tencentDocs: { tencentDocsService: services.then((value) => value.tencentDocs), logger: runtimeLogger },
    monitor: { getMonitorService: input.getMonitorService, logger: mainLogger },
    queue: { getAuthDeps: async () => { const value = await celljs; return { productManager: value.productManager, authenticationManager: value.authenticationManager }; }, http: { post: input.httpPost }, logger: runtimeLogger },
    myFiles: { services: input.services, callApi: myFilesCallApi, network: { fetch: serverFetch }, setNetDriveEnvRoute: input.setNetDriveEnvRoute, logger: handlerLogger },
    slot: input.slot,
    wechatChatHistory: { logger: handlerLogger },
  };
}

async function attachProjectNetdriveRootResolver(input, callApi, logger) {
  const service = (await Promise.resolve(input.celljs))?.userPromptService;
  if (!service?.setProjectNetdriveRootResolver) return;
  service.setProjectNetdriveRootResolver(async (projectId) => {
    try { const raw = await callApi('POST', `/console/as/netdrive/projects/${projectId}/access-token`, {}); const result = raw?.data?.data ?? raw?.data ?? raw; const fileId = Array.isArray(result?.resources) && result.resources[0] && result.resources[0] !== '*' ? String(result.resources[0]) : ''; return fileId ? { fileId, dirName: result.dirName, projectId } : undefined; } catch (error) { logger.info?.('[daemon-rpc-handler-deps] project netdrive root resolver failed', error); return undefined; }
  });
}

async function attachProjectInstructionsResolver(input, callApi, logger) {
  const service = (await Promise.resolve(input.celljs))?.userPromptService;
  if (!service?.setProjectInstructionsResolver) return;
  service.setProjectInstructionsResolver(async (projectId) => {
    try { const raw = await callApi('GET', `/console/as/projects/${projectId}`); const result = raw?.data?.data ?? raw?.data ?? raw; return typeof result?.instructions === 'string' && result.instructions.trim() ? { instructions: result.instructions, version: typeof result.updatedAt === 'string' ? result.updatedAt : '' } : undefined; } catch (error) { logger.info?.('[daemon-rpc-handler-deps] project instructions resolver failed', error); return undefined; }
  });
}

async function attachUserPromptAccountChangeInvalidator(input, logger) {
  const celljs = await Promise.resolve(input.celljs); const service = celljs?.userPromptService; const auth = celljs?.authService;
  if (!service?.clearProjectCaches || !auth?.onStateChanged) return;
  const identity = () => { const account = auth.getAccount?.(); return `${account?.uid || ''}|${account?.enterpriseId || ''}`; };
  let previous = identity();
  auth.onStateChanged(() => { const next = identity(); if (next === previous) return; const old = previous; previous = next; try { service.clearProjectCaches(); logger.info?.(`[daemon-rpc-handler-deps] cleared user-prompt project caches (${old} -> ${next})`); } catch (error) { logger.warn?.('[daemon-rpc-handler-deps] failed to clear user-prompt project caches', error); } });
}

module.exports = Object.freeze({ createWorkbuddyDaemonServerRpcHandlerDeps, createRuntimeServiceDeps, createConnectorOauthApiDeps, createEnhancePromptDeps, attachProjectNetdriveRootResolver, attachProjectInstructionsResolver, attachUserPromptAccountChangeInvalidator, getServerFetch });
