'use strict';

const { bindHostedCliAuthLifecycle, getHostedCliSessionOwnerKey } = require('../agent/hosted-cli-auth-lifecycle');
const { registerWorkbuddyBackgroundRuntimeHandlers } = require('./runtime-handlers');
const { registerServiceHandlers } = require('./service-handlers');
const { createSkillsService } = require('../skill/service');
const { createLoggingFetch, createBuiltinMarketAuthDeps } = require('./builtin-market-deps');
const { setupIntentRecognition } = require('../intent-recognition/setup');
const { syncAgentMailAttachmentBuiltinTools, syncPickLocationBuiltinTool } = require('../mcp/tools');
const { isPoiMapEnabled } = require('../poi/poi-map-gate');
const { ConnectorLifecycle } = require('../connector/lifecycle');
const { ClawLifecycle } = require('../claw/claw-lifecycle');

function createDisposableSubscription(subscription) {
  return subscription && typeof subscription.unsubscribe === 'function' ? subscription : { unsubscribe() {} };
}

async function startWorkbuddyAppServerBackgroundServices(options = {}) {
  const {
    celljs,
    runtimeManager,
    daemon,
    builtinSkillsDir,
    createBuiltinMcpTools,
    connectorOauthFetch,
    resolveBundledAsset,
    connectorPowerEvents,
    resolveBuiltinMarketEndpointOverride,
    prewarmPool,
    logger = console,
  } = options;
  const factories = options.factories || {};
  const schedule = (run) => {
    const handle = setImmediate(run);
    handle.unref?.();
    return handle;
  };
  const authManager = celljs.authenticationManager;
  const automationService = celljs.automationService;
  const hostedCliAuthLifecycle = (factories.bindHostedCliAuthLifecycle || bindHostedCliAuthLifecycle)({
    authenticationManager: authManager,
    runtimeManager,
    agentBackend: daemon.agentBackend,
    sessionManager: daemon.sessionManager,
    prewarmPool,
    logger: celljs.logger || logger,
  });
  const productSnapshotSubscription = createDisposableSubscription(celljs.coordinator?.onHostedCliProductSnapshotChanged?.(async () => {
    logger.info?.('[DaemonBackgroundServices] Hosted CLI product snapshot changed; requesting host runtime rotation');
    try { await runtimeManager.rotateHostRuntime('hosted-cli-product-snapshot-change'); } catch (error) { logger.warn?.('[DaemonBackgroundServices] runtime rotation failed:', error); }
    try { await prewarmPool?.flush?.(); } catch (error) { logger.warn?.('[DaemonBackgroundServices] prewarm flush failed:', error); }
  }));

  automationService.setSessionManager(daemon.sessionManager);
  automationService.setPowerEvents?.(connectorPowerEvents);
  automationService.setAuthOwner(getHostedCliSessionOwnerKey(authManager.currentSessionSubject.getValue()));
  const authSubscription = createDisposableSubscription(authManager.currentSessionSubject.subscribe((session) => automationService.setAuthOwner(getHostedCliSessionOwnerKey(session))));
  registerWorkbuddyBackgroundRuntimeHandlers(daemon.server, { automation: { automationService }, imaUploadProgress: { imaService: celljs.imaService } });

  try { await automationService.initialize(); } catch (error) { logger.error?.('[DaemonBackgroundServices] Automation service start error:', error); }
  const createCloudStudioDeployService = factories.createCloudStudioDeployService;
  const cloudStudioDeployService = createCloudStudioDeployService?.();
  if (cloudStudioDeployService) {
    cloudStudioDeployService.setSessionManager?.(daemon.sessionManager);
    cloudStudioDeployService.setAuthDeps?.(authManager, celljs.productManager);
    registerWorkbuddyBackgroundRuntimeHandlers(daemon.server, { cloudStudioDeploy: {
      cloudStudioDeployService,
      exists: options.exists || (() => false),
      isFile: options.isFile || (() => false),
      detectEntryHtml: options.detectEntryHtml,
      findLatestDeployRecord: options.findLatestDeployRecord,
    } });
  }

  const marketAuth = createBuiltinMarketAuthDeps(() => celljs, { tag: 'daemonBackgroundServices.builtinMarket', resolveEndpointOverride: resolveBuiltinMarketEndpointOverride, logger });
  const skillsService = (factories.createSkillsService || createSkillsService)({
    builtinSkillsDir,
    getBuiltinMarketEndpoint: marketAuth.getBuiltinMarketEndpoint,
    getBuiltinMarketAuthHeaders: marketAuth.getBuiltinMarketAuthHeaders,
    getEnterpriseId: marketAuth.getEnterpriseId,
    fetchFn: createLoggingFetch({ logger }),
  });
  try {
    (factories.setupIntentRecognition || setupIntentRecognition)({
      container: options.container,
      connectorService: celljs.connectorService,
      connectorMcpProxy: celljs.connectorMcpProxy,
      authenticationManager: celljs.authenticationManager,
      productManager: celljs.productManager,
      skillsService,
      fetchFn: connectorOauthFetch,
      hostServicesPromise: daemon.hostServices,
      resolveBundledAsset,
      configDir: options.configDir,
      logger,
    });
    if (options.intentRecognitionService) registerServiceHandlers(daemon.server, 'intentRecognition', options.intentRecognitionService);
  } catch (error) { logger.warn?.('[DaemonBackgroundServices] setupIntentRecognition failed:', error); }

  if (typeof createBuiltinMcpTools !== 'function') throw new TypeError('createBuiltinMcpTools is required');
  const builtinTools = createBuiltinMcpTools({
    authService: celljs.authService,
    productManager: celljs.productManager,
    automationService,
    eventService: celljs.eventService,
    cloudStudioDeployService,
    skillsService,
    pushSessionCommand: daemon.pushSessionCommand,
    poiQuestionRegistry: daemon.poiQuestionRegistry,
    setSessionPoi: daemon.setSessionPoi,
    isCloudMemoryEnabled: () => celljs.configService.get('generateMemoryEnabled') !== false,
    authenticationManager: authManager,
    connectorOauthFetch,
    resolveBundledAsset,
    logger,
    resolveCurrentSessionModelId: (sessionId) => daemon.sessionManager.getSession(sessionId)?.config?.model,
  });
  for (const tool of builtinTools || []) celljs.connectorMcpProxy.registerBuiltinTool({ ...tool, defer_loading: false });

  let agentMailEnabled;
  const syncAgentMail = () => {
    const featureEnabled = celljs.productManager.getCurrentConfiguration?.()?.productFeatures?.AgentMail === true;
    const enterpriseId = authManager.currentSessionSubject.getValue()?.account?.enterpriseId;
    const enabled = featureEnabled && !enterpriseId;
    if (enabled === agentMailEnabled) return;
    agentMailEnabled = enabled;
    (factories.syncAgentMailAttachmentBuiltinTools || syncAgentMailAttachmentBuiltinTools)({ connectorMcpProxy: celljs.connectorMcpProxy, productManager: celljs.productManager, authenticationManager: authManager, connectorOauthFetch, resolveBundledAsset }, enabled);
  };
  syncAgentMail();
  const agentMailProductDisposable = createDisposableSubscription(celljs.productManager.onDidChange?.(syncAgentMail));
  const agentMailAuthSubscription = createDisposableSubscription(authManager.currentSessionSubject.subscribe(syncAgentMail));

  let poiEnabled;
  const syncPoi = () => {
    const enabled = isPoiMapEnabled(celljs.productManager, logger);
    if (enabled === poiEnabled) return;
    poiEnabled = enabled;
    (factories.syncPickLocationBuiltinTool || syncPickLocationBuiltinTool)({
      connectorMcpProxy: celljs.connectorMcpProxy,
      poiQuestionRegistry: daemon.poiQuestionRegistry,
      setSessionPoi: daemon.setSessionPoi,
      isPoiMapEnabled: () => isPoiMapEnabled(celljs.productManager),
      pushPoiPickQuestion: (sessionId, toolCallId, poiPick) => daemon.pushSessionQuestion(sessionId, toolCallId, poiPick),
      logger,
    }, enabled);
  };
  syncPoi();
  const poiProductDisposable = createDisposableSubscription(celljs.productManager.onDidChange?.(syncPoi));

  celljs.connectorMcpProxy.setCliEndpointResolver(() => runtimeManager.getHostEndpoint());
  const disposeEndpointListener = runtimeManager.onHostEndpointChanged(() => celljs.connectorMcpProxy.resyncStdioForCliEndpointChange().catch((error) => logger.warn?.('[DaemonBackgroundServices] MCP resync failed:', error)));
  const connectorLifecycle = new (factories.ConnectorLifecycle || ConnectorLifecycle)(logger, celljs.connectorService, celljs.connectorMcpProxy, celljs.connectorProxyServer, celljs.productManager, connectorPowerEvents);
  await connectorLifecycle.start();
  const clawLifecycle = new (factories.ClawLifecycle || ClawLifecycle)({ info: logger.info?.bind(logger), warn: logger.warn?.bind(logger), error: logger.error?.bind(logger) }, celljs.clawService, authManager, connectorPowerEvents);
  clawLifecycle.start().catch((error) => logger.error?.('[DaemonBackgroundServices] Claw service start error:', error));

  const heavyWork = schedule(() => {
    Promise.resolve(celljs.binaryService.initialize()).catch((error) => logger.error?.('[DaemonBackgroundServices] Binary service start error:', error));
    Promise.resolve(celljs.coordinator.waitRemoteReady?.()).catch((error) => logger.warn?.('[DaemonBackgroundServices] Product config ready wait failed:', error));
    Promise.resolve(runtimeManager.getHostEndpoint()).then((endpoint) => logger.info?.('[DaemonBackgroundServices] Hosted CLI runtime pre-warmed', { endpoint })).catch((error) => logger.error?.('[DaemonBackgroundServices] Hosted CLI pre-warm failed:', error));
  });

  return { async stop() {
    clearImmediate(heavyWork);
    authSubscription.unsubscribe(); agentMailAuthSubscription.unsubscribe(); agentMailProductDisposable.unsubscribe(); poiProductDisposable.unsubscribe(); productSnapshotSubscription.unsubscribe();
    disposeEndpointListener?.();
    await hostedCliAuthLifecycle.stop();
    clawLifecycle.stop(); connectorLifecycle.stop();
    celljs.connectorService.dispose?.();
    automationService.setSnapshotSink?.(undefined); automationService.setSessionStartedSink?.(undefined); automationService.dispose?.();
    await runtimeManager.shutdown?.();
  } };
}

async function startWorkbuddyAppServerDefaultBackgroundServices(options) {
  return startWorkbuddyAppServerBackgroundServices({ ...options, createBuiltinMcpTools: options.createBuiltinMcpTools || ((deps) => options.createWorkbuddyAppServerMcpTools?.({ ...deps, staticHtmlServer: options.staticHtmlServer })) });
}

module.exports = Object.freeze({ startWorkbuddyAppServerBackgroundServices, startWorkbuddyAppServerDefaultBackgroundServices });
