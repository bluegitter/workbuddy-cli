'use strict';

const { SessionRuntimeEventService } = require('../storage/session-runtime-event-service');
const { AppConfigService } = require('../config/app-config-service');
const { createWorkbuddyAutomationService } = require('../automation/service-factory');
const { resolveClawCwd, resolveDefaultWorkspaceRoot } = require('../workspace/default-workspace-root');

function createUnavailableWorkbuddyAppServerDatabase() {
  const fail = (method) => { throw new Error(`App-server CellJS deps attempted to use database method "${method}" before a database was injected.`); };
  return new Proxy({ dispose: () => {} }, { get(target, property) { return property in target ? target[property] : () => fail(String(property)); } });
}

function resolveToken(container, options, name) {
  if (typeof options.resolveToken === 'function') return options.resolveToken(container, name);
  const token = options.tokens?.[name] ?? name;
  return container.get(token);
}

function resolveOptionalToken(container, options, name) {
  try { return resolveToken(container, options, name); } catch { return undefined; }
}

function createAutomationService(options) {
  if (options.createAutomationService) return options.createAutomationService(options);
  return createWorkbuddyAutomationService({
    logger: options.logger,
    database: options.database,
    clawService: options.clawService,
    coordinator: options.coordinator,
    options: {
      clawCwd: options.resolveClawCwd(),
      defaultFolderName: options.getAppName(),
      resolveDefaultWorkspaceRoot,
      translateAutomationTestMessage: options.translateAutomationTestMessage,
      waitUntilExecutionReady: async () => options.waitUntilExecutionReady(options.coordinator),
      onRunFinalized: options.onRunFinalized,
      automationDeliverySenders: options.automationDeliverySenders,
    },
  });
}

function resolveWorkbuddyAppServerCellJSDeps(container, options = {}) {
  const logger = options.logger || resolveToken(container, options, 'logger');
  const database = options.database || createUnavailableWorkbuddyAppServerDatabase();
  options.setAuthClientVersionProvider?.(options.runtime.getAppVersion);
  const authService = options.authService || resolveToken(container, options, 'authService');
  const sessionRuntimeEventService = options.createSessionRuntimeEventService
    ? options.createSessionRuntimeEventService(database, logger, authService)
    : new SessionRuntimeEventService(database, logger, {
      getCurrentUserId: () => { try { return authService.getAccount?.()?.uid; } catch { return undefined; } },
      sinks: {
        onSessionUpsert: (session) => options.sessionEvents?.onSessionUpsert?.(session),
        onSessionDeleted: (payload) => options.sessionEvents?.onSessionDeleted?.(payload),
      },
    });
  const productManager = options.productManager || resolveToken(container, options, 'productManager');
  const authenticationManager = options.authenticationManager || resolveToken(container, options, 'authenticationManager');
  const clawTelemetryService = options.clawTelemetryService || resolveToken(container, options, 'clawTelemetryService');
  options.setClawLocaleProvider?.(options.i18n?.getMenuLocale);
  const clawService = options.clawService || options.createClawService?.({ logger, database, sessionRuntimeEventService, productManager, authenticationManager, telemetryService: clawTelemetryService, detectIOAMachine: options.detectIOAMachine });
  if (!clawService) throw new Error('createClawService or clawService is required');
  const binaryService = options.binaryService || options.createBinaryService?.(logger, resolveToken(container, options, 'binaryManager'));
  if (!binaryService) throw new Error('createBinaryService or binaryService is required');
  const configService = options.configService || (options.createConfigService || ((log, config) => new AppConfigService(log, config)))(logger, { userDataDir: options.runtime.getUserDataDir() });
  options.setDefaultWorkspaceRootConfigService?.(configService, logger);
  options.setDefaultWorkspaceRootAppNameProvider?.(options.runtime.getAppName);
  const imaService = options.createImaService({ logger, productManager, authenticationManager });
  const coordinator = options.getCoordinator(container);
  const expertCenterService = resolveToken(container, options, 'expertCenterService');
  const expertHistoryService = resolveToken(container, options, 'expertHistoryService');
  const expertPluginService = resolveToken(container, options, 'expertPluginService');
  const inspirationService = resolveToken(container, options, 'inspirationService');
  const connectorService = resolveToken(container, options, 'connectorService');
  const connectorMcpProxy = resolveToken(container, options, 'connectorMcpProxy');
  const connectorProxyServer = resolveToken(container, options, 'connectorProxyServer');
  const connectorUiAdapter = resolveToken(container, options, 'connectorUiAdapter');
  const eventService = () => resolveToken(container, options, 'eventService');
  const automationService = createAutomationService({
    logger, database, clawService, coordinator, resolveClawCwd: options.resolveClawCwd || resolveClawCwd,
    getAppName: options.runtime.getAppName, translateAutomationTestMessage: options.i18n.translateAutomationTestMessage,
    waitUntilExecutionReady: options.waitUntilExecutionReady, createAutomationService: options.createAutomationService,
    onRunFinalized: options.onRunFinalized, automationDeliverySenders: options.automationDeliverySenders,
  });
  return {
    authService, logger, configService, expertCenterService, expertHistoryService, expertPluginService, inspirationService,
    binaryService, automationService, connectorService, connectorMcpProxy, connectorProxyServer,
    uiAdapter: connectorUiAdapter, connectorUiAdapter, database, sessionRuntimeEventService,
    systemPromptService: options.getSystemPromptService ? options.getSystemPromptService(container) : resolveToken(container, options, 'systemPromptService'),
    userPromptService: options.getUserPromptService ? options.getUserPromptService(container) : resolveToken(container, options, 'userPromptService'),
    productManager, authenticationManager, restOperations: resolveToken(container, options, 'restOperations'),
    memberCustomModelPolicyService: resolveToken(container, options, 'memberCustomModelPolicyService'),
    skillUploadPolicyService: options.skillUploadPolicyService || resolveOptionalToken(container, options, 'skillUploadPolicyService'),
    clawService, clawTelemetryService, imaService, coordinator,
    get eventService() { return eventService(); },
  };
}

module.exports = Object.freeze({ resolveWorkbuddyAppServerCellJSDeps, createUnavailableWorkbuddyAppServerDatabase, createAutomationService });
