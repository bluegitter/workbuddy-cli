'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createDecoder, encode, ndJsonStream, RequestError, RpcConnection, AGENT_METHODS, ClientSideConnection, PROTOCOL_VERSION, createSSEDecoder, parseSSELine, createStreamableHttpTransport } = require('../packages/agent-client-protocol/src');
const { ProtocolConnection } = require('../packages/agent-client-protocol/src');
const { parseFrontmatter } = require('../packages/plugin-core/src');
const {
  mergeMarketplaceManifests,
  scanSkillFiles,
  validatePluginManifest,
} = require('../packages/plugin-core/src');
const { CommandPolicy } = require('../packages/sandbox-cli/src');
const runtimeCliProcessEnv = require('../packages/runtime/src/source/cli-process-env.js');
const runtimeContextSource = require('../packages/runtime/src/source/runtime-context.js');
const startupContextSource = require('../packages/runtime/src/source/startup-context.js');
const runtimeHttpSource = require('../packages/runtime/src/source/runtime-http.js');
const oauthSource = require('../packages/authentication/src/source/auth.js');
const fileAuthenticationStorageSource = require('../packages/authentication/src/source/file-authentication-storage.js');
const {
  AuthSession,
  CredentialStore,
  deriveAccountContext,
  gatewaySecretEnv,
  gatewaySecretHeaders,
  getGatewaySecret,
  resolveActiveAuthMode,
  resolveTokenHeaderName,
  resolveOneidAppType,
  resolveModeTools,
  resolveResponseLocaleIsZh,
  getLogoutMarkerPath,
  AuthErrorCode,
  TimeoutError,
  Edition,
  ProductEnviroment,
  isPersonalAccount,
  ProductEnvService,
  DefaultAuthenticationStorage,
  FileAuthenticationStorage,
  CustomTokenAuthenticationStorage,
  CustomTokenAuthenticationProvider,
  AuthenticationType,
} = require('../packages/authentication/src');
const { EventBuffer, LogSampler, StructuredLogger, buildStartupSpans, exportStartupMetric, PerfFlow, WorkbuddyPerfLogger, formatLocalIsoTimestamp, formatLine, buildLifecycleLine, buildStartupPerfFields } = require('../packages/telemetry/src');
const telemetryLoggerSource = require('../packages/telemetry/src/source/logger.js');
const { configureWorkbuddyLogger, createWorkbuddyScopedLogger, getWorkbuddyLogger } = require('../packages/telemetry/src');
const promptTraceSource = require('../packages/telemetry/src/source/prompt-trace-reporter.js');
const { reportPromptDoneEvent, reportPromptForwardingEvent, reportPromptTrace, setDesktopMonitorServiceResolver } = require('../packages/telemetry/src');
const { DateRangeUtils, DeterministicIdGenerator, readOtelTraceEnv, parseKeyValueList } = require('../packages/telemetry/src');
const startupPerfSource = require('../packages/telemetry/src/source/startup-perf-exporters.js');
const { buildStartupSpans: buildStartupSpansFromPackage } = require('../packages/telemetry/src');
const { FsProtectionPolicy, PathPolicy } = require('../packages/enterprise-policy/src');
const projectHttpSource = require('../packages/workbuddy-server/src/source/http.js');
const { HANDOFF_CANARY_HEADERS, ROUTE_PREFIX, withAcceptLanguageHeader } = require('../packages/workbuddy-server/src');
const mcpSchemaSource = require('../packages/workbuddy-server/src/runtime/mcp-schema.js');
const { EMPTY_COMPLETION_RESULT, createCompletionResult, getZodSchemaObject, isZodRawShapeCompat, isZodSchemaInstance, isZodTypeLike, promptArgumentsFromSchema } = require('../packages/workbuddy-server/src');
const { startDaemonAppServerEntry } = require('../packages/workbuddy-server/src');
const logAclSource = require('../packages/enterprise-policy/src/source/log-acl-guard.js');
const { computeCutoff, DATE_DIR_PATTERN, DENY_MASK, releaseLogAclGuard, startLogAclGuardScheduler } = require('../packages/enterprise-policy/src');
const {
  AgentViewModel,
  TodoProjection,
  createEmptyTeamRuntimeSnapshot,
  formatTeammateContent,
  hasUnsettledTeamRuntime,
  parseTeammateMessage,
  adaptShareUrl,
  buildMessageTimeWindows,
  collectShareArtifacts,
  isShareTaskFileTooLargeError,
  partitionOverseasUnsupportedArtifacts,
  readArtifactBlobs,
  readCwdArtifacts,
  replaceLocalPathsInMessages,
  resolveArtifactFilePath,
  classifyDesktopOpenUrl,
  createDesktopOpenUrlHandler,
  consumePendingDesktopOpenUrls,
  normalizePendingOpenUrlPayload,
} = require('../packages/agent-ui/src');
const {
  QueueSnapshotStore,
  WindowState,
  deriveDisplayStatus,
  deriveRunState,
  resolveAppConfig,
  withDisplayStatus,
  buildRendererResourceAttributes,
  normalizeTheme,
  normalizeLanguage,
  applyLocalStorageMigrationPayload,
  readLocalFilePath,
  resolveIsMainFramePreload,
  getIsMainFramePreload,
  getIsTopWindow,
  installLocalFileDragBridge,
  isLocalFileDragInfo,
  toFileResourceUri,
  validateBootstrapInfo,
  clampBoundsToWorkArea,
  getGuestInPlaceNavigationReason,
  isAllowedGuestWebviewRedirect,
  isVisibleOnAnyDisplay,
  stripFrameEmbeddingHeaders,
  parseDeepLink,
  getDeepLinkPath,
  mapDeepLinkToRoute,
  readSkillInstallIntent,
  readExpertInstallIntent,
  readSwitchModelIntent,
  getOpenUrlFromCommandLine,
  createPendingOpenUrlQueue,
  createPendingFileQueue,
} = require('../packages/workbuddy-app/src');
const {
  CancellationTokenSource,
  DeferredPromise,
  assertRecord,
  cloneSerializable,
  raceCancellationError,
  retry,
  Event,
  Emitter,
  AsyncEmitter,
  Disposable,
  DisposableCollection,
  Deferred,
  getLiteralValue,
  getObjectShape,
  getParseErrorMessage,
  getSchemaDescription,
  isSchemaOptional,
  mergeCapabilities,
  normalizeObjectSchema,
  safeParse,
  CUSTOM_LOCAL_MODEL_PREFIX,
  isModelVariantType,
  stripCustomLocalModelPrefix,
} = require('../packages/workbuddy-core/src');
const coreContractSource = require('../packages/workbuddy-core/src/source/contract.js');
const { AUTH_RPC_CHANNELS } = require('../packages/workbuddy-core/src');
const {
  calculateContextUsage,
  compactMessages,
  selectCompactionCandidates,
  shouldTriggerCompaction,
  ContextVariableManager,
  ContextVariableNames,
  ContextVariablePriority,
} = require('../packages/context/src');
const {
  CLI_STATIC_MANAGED_ENV,
  buildCliProcessEnv,
  configureWorkbuddyRuntimeContext,
  getWorkbuddyRuntimeConfigDir,
  getWorkbuddyRuntimeLogsDir,
  initMainStartupContext,
  buildStartupContextEnv,
  initStartupContextFromEnv,
  RingBuffer,
  SessionReadyRegistry,
  controlSocketPath,
  dataSocketPath,
  sidecarRuntimeDir,
  createChildProcessSession,
  createRuntimeHttp,
  createHttpError,
  tryParseEnvelope,
  SidecarSessionManager,
  MemoryLocalStorage,
  DefaultWorkspace,
  DefaultNotifier,
  DefaultUserinfoProvider,
  DefaultExternalUriOpener,
  DefaultPagePreviewer,
} = require('../packages/runtime/src');
const {
  translateDesktopToCloudPayload,
  resolveDesktopSpanPlan,
  sanitizeChannelTraceAttributes,
  EdgeSyncMappingStore,
  syncRenameConversation,
  parseLineWithLazyLoad,
  estimateItemPayloadBytes,
  resolveAgentTeamsEnv,
  createAgentTeamsEnvResolver,
  buildAgentCliRuntimeArgs,
  writeAgentCliSystemPromptFile,
  cleanupAgentCliSystemPromptFile,
  resolveCliSettingsLanguage,
  parseCliJsonResponse,
  buildSessionReplayRequestHeaders,
  getMediaInfo,
  inferMediaInfoForUnknownExt,
  extractSessionId,
  extractToken,
  assertWorkbuddyAppServerStdioMode,
  createWorkbuddyAppServerPlatformFromEnv,
  fetchChannelCredentials,
  buildDeviceOnlinePayload,
  createInitialTaskState,
  reduceTaskStatus,
  deriveTaskStatus,
  extractPreviewUrlLocalPath,
  parseEdsdkCall,
  formatLogDetailsSuffix,
  tryParseAcpUsageUpdate,
  ALL_MEDIA_EXTS,
  NoResponseWatchdog,
  appendStateTransitionEntry,
  SessionMetaWriter,
  withSessionEnabledPluginSetting,
  isDaemonStdioFrame,
  createDaemonStdioFrameReader,
  createStdioParentRpcClient,
  isHostedCliRuntimeSessionId,
  extractHttpEndpoint,
  formatSidecarLogArgs,
  buildPrewarmActivateArgs,
  summarizePrewarmArgs,
  normalizeRuntimeConfig,
  stableJsonStringify,
  extractCliOutcome,
  materializeWorkbuddyRuntimePrompt,
  isValidW3CTraceId,
  formatTraceparent,
  registerServiceHandlers,
  getHostedCliSessionOwnerKey,
  createWorkbuddyAgentAcpClient,
  isPoiMapEnabled,
  resolvePrewarmIpcPath,
  isWhitelistedSessionEnvKey,
  managedEnvMismatchKeys,
  validateActivateReadyResponse,
  CliPrewarmPool,
  SidecarManager,
  createWorkbuddySidecarManager,
  parseToolUsage,
  createToolUsageBridge,
  createAuditAcpAdapter,
  buildMcpEntry,
  isTransientDisconnectMessage,
  buildRecallText,
  RecallCacheStore,
  Bm25Index,
  RecallIndex,
  RateLimiter,
  acquireMutex,
  withTimeout,
  resolveMemoryDirs,
  acquireFileLock,
  BufferedFileLogger,
  canonicalizeStoredPath,
  escapeSqliteLikePattern,
  parseJsonArray,
  configureWorkbuddySqliteConnection,
  createBackendRegistry,
  normalizeCloudAgentListItem,
  encodePath,
  safeParseBigIntJSON,
  extractMediaPathsFromCommand,
  extractImageToolLocalPaths,
  extractPreviewUrlLocalMediaPath,
  createWorkbuddySessionPersistence,
  AutomationDeliveryOutboxWorker,
  EmbeddingClient,
  classifyCliExit,
  isEnglishConnectorLocale,
  parseLocalizedMapKey,
  resolveLocalizedMapText,
  resolveConnectorDisplayText,
  ConnectorServerSideOauthRefresher,
  FALLBACK_REFRESH_INTERVAL_MS,
  resolveStatesFilePaths,
  isAnonymousUser,
  coerceConnectorUserDisabledState,
  coerceStringArrayMap,
  coercePlainMap,
  extractNonSensitiveFields,
  readStates,
  writeStates,
  McpOAuthMigrationService,
  computeRemainingExpiresIn,
  generateLegacyKey,
  getSourceMaxMtime,
  ConnectorTokenRefresher,
  JsonFileCache,
  TtlMemoCache,
  safeReadJsonFile,
  buildBuiltinArdotMcpUrl,
  isValidArdotDevMcpServer,
  createBuiltinArdotMcpServer,
  createBuiltinNetdriveMcpServer,
  isValidNetdriveDevMcpServer,
  IPC_CHANNEL,
  createRuntimeProgressNotifier,
  classifyBinaryError,
  DEFAULT_NPM_REGISTRIES,
  CLI_CONNECTOR_PACKAGES_DIR,
  applyNodeRuntimeEnv,
  prepareNodeRuntimeEnv,
  stripDebugNodeOptions,
  parseNpxPackageSpec,
  getManagedNpmCliPath,
  getStableNpxPackageDir,
  classifyMcpInvokeErrorKind,
  classifyMcpListErrorKind,
  setConnectorMetricReporter,
  ConnectorMetricReporter,
  toHeaderRecord,
  withExtraHeaders,
  IOA_OAUTH_NAME_PREFIX,
  IoaServerSideAuth,
  ConnectorUiAdapter,
  SHARED_HISTORY_KEY,
  ExpertHistoryCache,
  ExpertHistoryStorage,
  ExpertCenterResourceLoader,
  ExpertHistoryService,
  ALLOWED_LOOPBACK_HOSTS,
  matchesUriTemplate,
  formatProxyServerLog,
  readHeader,
  sanitizeProxyServerLogValue,
  serializeProxyServerErrorForLog,
  summarizeProxyCallArgsForLog,
  buildConnectorMcpCallContext,
  classifyToolStatus,
  extractErrorCode,
  inferConnectorKind,
  extractHostname,
  isAllowedLoopbackHost,
  validateOrigin,
  isValidProxyBearer,
  formatUndiciFetchErrorForLog,
  isHttpBusinessError,
  buildBusinessErrorResult,
  isTransportErrorByCode,
  isReconnectRipple,
  isMcpSessionLost,
  buildRippleFailureMessage,
  inferTransportCloseKind,
  shouldDedupeArdotCreateDesignCall,
  buildConnectorCallToolRequest,
  stableStringifyConnectorToolArgs,
  buildArdotCreateDesignDedupeKey,
  parseTimeoutMs,
  isStdioServerConfig,
  getConnectTimeout,
  isManagedAuthConfig,
  sanitizeRuntimeDirName,
  getWorkbuddyConfigDir,
  ensureDirectory,
  resolveStdioCwd,
  resolveTransportOrder,
  shouldSkipFallback,
  captureResourceMetadataUrl,
  resolveServiceProxyUrl,
  normalizeOAuthBaseUrl,
  isOAuthCallbackUrl,
  extractConfigIdFromCallbackUrl,
  parseOAuthCallbackUrl,
  buildStdioTransport,
  buildHttpTransportPair,
  connectStepWithTimeout,
  connectWithFallback,
  createScopedFetch,
  createConnectingEntry,
  snapshotClientEntry,
  snapshotClientEntries,
  createToolEntry,
  classifyPreflightState,
  createConnectorOAuthProvider,
  ConnectorHealthScheduler,
  isNetworkTransientError,
  isIOADeviceUnauthorized,
  isAuthMessage,
  computeReconnectDelay,
  classifyRefreshFailure,
  classifyExhaustedReconnect,
  ConnectorTokenRefreshService,
  buildQqMailConfirmationInstruction,
  markQqMailConfirmationRequired,
  convertJsonlItemToSessionNotification,
  normalizeArgs,
  resolveSessionUpdate,
} = require('../packages/workbuddy-server/src');
const acpNode = require('../packages/agent-client-protocol/src/source/acp.js');
const acpRenderer = require('../packages/agent-client-protocol/src/source/acp-renderer.js');
const { OAuthCipher, createHeader, isCipherEnvelope, ConnectorOAuthMasterKeyStore, readOAuthV3, writeOAuthV3, ConnectorOAuthStore, buildQueryString, callConnectorOauthApi, mapUserConnector: mapOauthUserConnector, verifyFileAcl, tryRepairAcl, parseIcaclsPrincipals, isBroadPrincipal } = require('../packages/authentication/src');
const {
  ArtifactIndex,
  AutomationScheduler,
  buildConnectorConfig,
  checkCompatibility,
  connectorEntries,
  ExpertCacheManager,
  McpRegistry,
  mergeExpertManifests,
  POI_CONSENT_DEFAULT_TIMEOUT_MS,
  PoiConsentRegistry,
  CONSENT_FILE_NAME,
  PoiConsentStore,
  POI_HEADER_NAME,
  buildPoiHeader,
  SessionPoiCache,
  readExpertMcpDeclaration,
  SessionStore,
  ToolRoutingTable,
  shouldHideToolsFromCli,
  runConnectorReconnect,
  ConnectorProxySessionRegistry,
  ConnectorProxyServer,
  normalizeToolResult,
  escapeHtml,
  ConnectorServiceState,
  ConnectorAuthCoordinator,
  calculateMcpConfigHash,
  listMcpServers,
  buildDesiredConnectorConfigs,
  planConnectorSync,
  ConnectorMcpClientPool,
  normalizePersistentState,
  buildEnabledPluginIndex,
  discoverPluginMcpConfigs,
  isInside,
  mergeConnectorMcpServers,
  normalizeTimeout,
  writeConnectorMcpConfig,
  disableConnectorSkills,
  markSkillFileDisabled,
  MarketplaceCache,
  normalizeEtag,
  downloadBufferWithHeaders,
  fetchRemoteEtag,
  ConnectorMarketplaceService,
  ConnectorService,
  createConnectorServiceFacade,
  createConnectorOAuthCallbackFacade,
  createConnectorCoreServices,
  buildQuery,
  resolveTeamsAcceptLanguage,
  unwrap,
  withHandoffCanaryHeaders,
  ClientInfoProvider,
  createDevEndpointProvider,
  resolveChannelBranding,
  toSafeAssetSegments,
  parseElectronProxyRules,
  getProxyEnvFromProcess,
  ProjectResourceManager,
  updateSkillFrontmatterDisable,
  createEdgeSyncTurnTraceContext,
  EdgeSyncTurnTraceStore,
  EdgeSyncNetworkRecovery,
  PoiQuestionRegistry,
  TencentDocsAgentEditorTracker,
  createIsSessionStillProcessing,
  isTencentOnlineFilePath,
  extractTencentOnlineFileId,
  computeLocalPreviewGlobalPadId,
  detectDocumentFileType,
  normalizeLocalFilePathInput,
  resolveDocArtifactSource,
  collectMentionedLocalOfficePaths,
  collectMentionedLocalOfficeFileNames,
  createMenuLocaleStore,
  ImaApiError,
  ImaErrorCode,
  buildLocalDocumentSaveChoices,
  buildLocalDocumentDirtyCloseChoices,
  getLocalDocumentDialogButtonIds,
  ImaDataCipher,
  CryptoMode,
  ImaBackendClient,
  getDefaultPathPrefix,
  ImaAuthApi,
  buildFilters,
  inferMimeByExt,
  mapRawKnowledgeItem,
  ImaAuthEventEmitter,
  normalizeLocalPath,
  getMaxUploadSizeBytes,
  formatHumanSize,
  createUploadProgress,
  throwIfUploadAborted,
  ImaFilesApi,
  ImaKnowledgeBaseApi,
  ImaUploadService,
  getDocsFeatureListString,
  getTencentDocsEngineDocType,
  isLocalTencentDocsEnginePreviewUrl,
  isTencentDocsClipboardOrigin,
  isTencentDocsUrl,
  buildAgentCliRuntimeEnv,
  readAgentCliBundledRuntimeConfigAsync,
  readAgentCliAppConfigValue,
  compareVersionsDesc,
  resolveAgentCliExecutablePath,
  resolveAgentCliRuntimeDirs,
  resolveDisabledManagedRuntimeTypes,
  buildProjectQuery,
  buildRegistryQuery,
  mapProjectConnector,
  mapUserConnector,
  unwrapData,
  parseDeeplink,
  isDomainObjectDeeplink,
  MockDeeplinkRepo,
  readLocalMemoryFiles,
  writeAiName,
  writeUserCallName,
  writeSoulBody,
  writeMemoryBody,
  createWorkbuddyIdentityService,
  WorkbuddyIdleCapabilityService,
  computeIdleCandidates,
  parseRRule,
  computeNextRunAt,
  isWithinMissedRunWindow,
  getAutomationRunIdentity,
  findEquivalentActiveAutomation,
  decideAutomationOwner,
  isReadOnlyAutomationToolName,
  isRetryBlockingToolName,
  classifyTransientPromptRetryReason,
  sanitizeErrorForNotification,
  RunCoordinator,
} = require('../packages/workbuddy-server/src');
const {
  createLegacyAuthSessionMigrator,
  getLegacyWorkbuddyIdeVscdbPath,
  parseLegacyWorkbuddyIdeAuthSession,
  applyProductExperimentOverlay,
  collectJsonChangedPaths,
  hasRemoteProductPayload,
  hostedCliRotationKeyOfNormalized,
  normalizeJsonValue,
  redactProductSnapshotLogValue,
  applyClientAuthentication,
  buildDiscoveryUrls,
  checkResourceAllowed,
  resourceUrlFromServerUrl,
  selectClientAuthMethod,
} = require('../packages/authentication/src');

async function main() {
  assert.strictEqual(runtimeCliProcessEnv.isNamedPipe('win32'), true);
  assert.strictEqual(runtimeCliProcessEnv.isNamedPipe('darwin'), false);
  assert.match(runtimeCliProcessEnv.dataSocketPath('session-1', { WORKBUDDY_CONFIG_DIR: '/tmp/workbuddy-test' }, 'darwin'), /s-[a-f0-9]{16}\.sock$/);
  assert.strictEqual(runtimeCliProcessEnv.buildCliProcessEnv({ SERVER__PORT: '1234' }, { CODEBUDDY_SECRET: 'drop', PATH: '/bin' }).SERVER__PORT, '1234');
  assert.strictEqual(typeof runtimeContextSource.configureWorkbuddyRuntimeContext, 'function');
  assert.strictEqual(startupContextSource.initStartupContextFromEnv, initStartupContextFromEnv);
  assert.strictEqual(typeof runtimeHttpSource.createRuntimeHttp, 'function');
  assert.strictEqual(typeof oauthSource.auth, 'function');
  assert.strictEqual(typeof oauthSource.auth_exports.refreshAuthorization, 'function');
  assert.strictEqual(new oauthSource.UnauthorizedError().name, 'UnauthorizedError');
  assert.strictEqual(oauthSource.buildDiscoveryUrls('https://oauth.test/api').length, 3);
  assert.strictEqual(acpNode.PROTOCOL_VERSION, 1);
  assert.strictEqual(acpRenderer.PROTOCOL_VERSION, 1);
  assert.strictEqual(typeof acpNode.RpcConnection, 'function');
  assert.strictEqual(typeof acpRenderer.ndJsonStream, 'function');
  assert.strictEqual(resolveSessionUpdate('message', 'assistant'), 'agent_message_chunk');
  assert.deepStrictEqual(normalizeArgs('{"command":"echo hi"}'), { command: 'echo hi' });
  assert.deepStrictEqual(normalizeArgs('{bad json'), {});
  assert.deepStrictEqual(convertJsonlItemToSessionNotification({
    id: 'msg-1', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'hello' }], timestamp: 42,
  }, 'session-1'), [{
    sessionId: 'session-1',
    update: {
      sessionUpdate: 'agent_message_chunk', messageId: 'msg-1', content: { type: 'text', text: 'hello' },
      _meta: { 'codebuddy.ai': { messageId: 'msg-1', isHistoryReplay: true, timestamp: 42 } },
    },
  }]);
  assert.deepStrictEqual(convertJsonlItemToSessionNotification({ id: 'compact', type: 'message', role: 'user', providerData: { isCompacted: true }, content: 'hidden' }, 'session-1'), []);
  assert.strictEqual(classifyCliExit(127), 'startup-failed');
  assert.strictEqual(classifyCliExit(9009), 'startup-failed');
  assert.strictEqual(classifyCliExit(1), 'ran-with-error');
  const localeConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-locale-'));
  fs.mkdirSync(path.join(localeConfigDir, 'app'), { recursive: true });
  fs.writeFileSync(path.join(localeConfigDir, 'app', 'app-config.json'), JSON.stringify({ locale: 'zh-CN' }));
  assert.strictEqual(isEnglishConnectorLocale({ configDir: localeConfigDir, getProductLocale: () => 'en-US', getSystemLocale: () => 'en-US' }), false);
  fs.writeFileSync(path.join(localeConfigDir, 'app', 'app-config.json'), JSON.stringify({ locale: 'en-US' }));
  assert.strictEqual(isEnglishConnectorLocale({ configDir: localeConfigDir, getProductLocale: () => 'zh-CN' }), true);
  assert.deepStrictEqual(parseLocalizedMapKey('enterprise; plan:pro, zh'), ['enterprise', 'plan:pro', 'zh']);
  assert.strictEqual(resolveLocalizedMapText({ enterprise: { en: ' Enterprise ', zh: '企业' } }, true, ['enterprise']), 'Enterprise');
  assert.deepStrictEqual(resolveConnectorDisplayText({ name: 'Fallback', name_en: 'English', name_map: { pro: { en: 'Pro', zh: '专业版' } }, description: 'Description' }, { isEnglish: true, candidateKeys: ['pro'] }), { name: 'Pro', description: 'Description' });
  fs.rmSync(localeConfigDir, { recursive: true, force: true });
  const oauthApplied = [];
  const oauth = new ConnectorServerSideOauthRefresher(
    async () => ({ token: 'api' }),
    {
      updateHeaders: async (_id, headers) => { oauthApplied.push(headers); return { success: true }; },
      onTokenApplied: async () => {},
    },
    undefined,
    { callOauthApi: async () => ({ code: 0, data: { access_token: 'access', expires_in: 900 } }) },
  );
  assert.strictEqual(oauth.computeNextDelay(undefined), FALLBACK_REFRESH_INTERVAL_MS);
  assert.strictEqual(oauth.computeNextDelay(600), 300000);
  assert.deepStrictEqual(await oauth.tryFetchToken('github'), { ok: true, token: 'access', expiresIn: 900 });
  oauth.schedule('cfg-1', 'github', { initialAccessToken: 'initial', initialExpiresIn: 3600 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepStrictEqual(oauthApplied, [{ Authorization: 'Bearer initial' }]);
  assert.strictEqual(oauth.isScheduled('cfg-1'), true);
  oauth.stopAll();
  assert.deepStrictEqual(resolveStatesFilePaths('/tmp/connectors', '/tmp/keys'), { storageDir: '/tmp/connectors', v3Path: '/tmp/connectors/connector-states.v3.json', legacyPath: '/tmp/connectors/connector-states.json', masterKeyBackupBaseDir: '/tmp/keys' });
  assert.strictEqual(isAnonymousUser('default'), true);
  assert.strictEqual(isAnonymousUser('user-1'), false);
  assert.deepStrictEqual(coerceConnectorUserDisabledState(['a', 1, 'b']), { a: true, b: true });
  assert.deepStrictEqual(coerceConnectorUserDisabledState({ a: true, b: 'yes' }), { a: true });
  assert.deepStrictEqual(coerceStringArrayMap({ a: ['x', 1], b: [], c: 'bad' }), { a: ['x'] });
  assert.deepStrictEqual(coercePlainMap({ cfg: { Authorization: 'Bearer token', invalid: 1 }, bad: null }), { cfg: { Authorization: 'Bearer token' } });
  assert.deepStrictEqual(extractNonSensitiveFields({ enabled: ['a', 1], userDisabled: ['a'], disabledToolsOverrides: { a: ['read', 1] }, secret: 'drop' }), { enabled: ['a'], userDisabled: { a: true }, disabledToolsOverrides: { a: ['read'] }, headerOverridesBearerStripped: undefined, staleManagedAuthHeadersPurged: undefined, accountIdentityKey: undefined, everConnected: undefined, mcpSecurityMigrated: undefined, cSideAutoBoundDefaultDisabledMigrated: undefined });
  const masterKey = Buffer.alloc(32, 7);
  const cipherHeader = createHeader('user-1', masterKey);
  const cipher = new OAuthCipher({ userId: 'user-1', masterKey, header: cipherHeader });
  const envelope = cipher.encrypt('secret-token', { serverKey: 'connector-a', fieldName: 'accessToken' });
  assert.strictEqual(isCipherEnvelope(envelope), true);
  assert.strictEqual(cipher.decrypt(envelope, { serverKey: 'connector-a', fieldName: 'accessToken' }), 'secret-token');
  assert.throws(() => cipher.decrypt(envelope, { serverKey: 'connector-b', fieldName: 'accessToken' }));
  const keyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-master-key-'));
  const keyStore = new ConnectorOAuthMasterKeyStore({ userId: 'user-1', primaryDir: path.join(keyRoot, 'primary'), backupBaseDir: path.join(keyRoot, 'backup') });
  assert.strictEqual(keyStore.getExisting(), undefined);
  const createdKey = keyStore.getOrCreate();
  assert.strictEqual(createdKey.key.length, 32);
  assert.deepStrictEqual(keyStore.getExisting().key, createdKey.key);
  fs.unlinkSync(keyStore.getPrimaryPath());
  assert.deepStrictEqual(keyStore.getExisting().key, createdKey.key);
  fs.rmSync(keyRoot, { recursive: true, force: true });
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-states-'));
  const statePaths = resolveStatesFilePaths(path.join(stateRoot, 'storage'), path.join(stateRoot, 'backup'));
  const stateOptions = { userId: 'user-1', paths: statePaths };
  assert.strictEqual(writeStates(stateOptions, { enabled: ['github'], headerOverrides: { github: { Authorization: 'Bearer token' } }, envOverrides: { github: { API_KEY: 'secret' } }, userDisabled: ['legacy'] }), true);
  const persistedState = JSON.parse(fs.readFileSync(statePaths.v3Path, 'utf8'));
  assert.strictEqual(persistedState.version, 3);
  assert.notStrictEqual(persistedState.headerOverrides.github.Authorization, 'Bearer token');
  assert.deepStrictEqual(readStates(stateOptions), { enabled: ['github'], userDisabled: { legacy: true }, headerOverrides: { github: { Authorization: 'Bearer token' } }, envOverrides: { github: { API_KEY: 'secret' } }, headerOverridesBearerStripped: undefined, staleManagedAuthHeadersPurged: undefined, accountIdentityKey: undefined, everConnected: undefined, disabledToolsOverrides: {}, mcpSecurityMigrated: undefined, cSideAutoBoundDefaultDisabledMigrated: undefined });
  fs.rmSync(stateRoot, { recursive: true, force: true });
  const oauthRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-oauth-'));
  const oauthPaths = { storageDir: path.join(oauthRoot, 'storage'), v3Path: path.join(oauthRoot, 'storage', '.credentials.v3.json'), masterKeyBackupBaseDir: path.join(oauthRoot, 'backup') };
  const oauthOptions = { userId: 'user-1', paths: oauthPaths, logger: console };
  assert.strictEqual(writeOAuthV3(oauthOptions, { mcpOAuth: { 'server-1': { serverName: 'server', serverUrl: 'https://mcp.test', tokenType: 'Bearer', expiresAt: 123, scope: 'read', accessToken: 'access', refreshToken: 'refresh' } }, mcpClientInfo: { 'server-1': { client_id: 'client', redirect_uris: ['http://localhost'], client_secret: 'secret' } } }), true);
  const oauthRaw = JSON.parse(fs.readFileSync(oauthPaths.v3Path, 'utf8'));
  assert.strictEqual(typeof oauthRaw.mcpOAuth['server-1'].accessToken.ct, 'string');
  assert.notStrictEqual(oauthRaw.mcpClientInfo['server-1'].client_secret, 'secret');
  assert.deepStrictEqual(readOAuthV3(oauthOptions).mcpOAuth['server-1'].accessToken, 'access');
  assert.strictEqual(readOAuthV3(oauthOptions).mcpClientInfo['server-1'].client_secret, 'secret');
  fs.rmSync(oauthRoot, { recursive: true, force: true });
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-oauth-store-'));
  const oauthStore = new ConnectorOAuthStore('user-1', { homeDir: storeRoot, backupBaseDir: path.join(storeRoot, 'backup') });
  assert.strictEqual(oauthStore.saveTokens('connector:github', 'https://mcp.test', { access_token: 'access-2', refresh_token: 'refresh-2', expires_in: 3600, token_type: 'Bearer' }, { Authorization: 'x' }), true);
  assert.strictEqual(oauthStore.loadTokens('connector:github', 'https://mcp.test', { Authorization: 'x' }).access_token, 'access-2');
  assert.strictEqual(oauthStore.peekTokens('connector:github', 'https://mcp.test', { Authorization: 'x' }).refresh_token, 'refresh-2');
  assert.strictEqual(oauthStore.isTokenExpired('connector:github', 'https://mcp.test', 300, { Authorization: 'x' }), false);
  assert.strictEqual(oauthStore.clearAccessTokenOnly('connector:github', 'https://mcp.test', { Authorization: 'x' }), true);
  assert.strictEqual(oauthStore.read().mcpOAuth[oauthStore.generateServerKey('connector:github', 'https://mcp.test', { Authorization: 'x' })].accessToken, '');
  assert.strictEqual(oauthStore.deleteClientInfo('connector:github', 'https://mcp.test', { Authorization: 'x' }), true);
  assert.strictEqual(oauthStore.deleteAll('connector:github', 'https://mcp.test', { Authorization: 'x' }), true);
  assert.strictEqual(new ConnectorOAuthStore('default', { homeDir: storeRoot }).write({}), false);
  fs.rmSync(storeRoot, { recursive: true, force: true });
  assert.strictEqual(buildQueryString({ page: 1, empty: undefined }), '?page=1');
  const apiResult = await callConnectorOauthApi('POST', '/oauth/start', { productManager: { getEndpoint: () => 'https://api.test/' }, authenticationManager: { buildAuthHeaders: () => ({ Authorization: 'Bearer token' }) }, fetch: async (url, init) => { assert.strictEqual(url, 'https://api.test/oauth/start?code=x'); assert.strictEqual(init.headers.Authorization, 'Bearer token'); return { ok: true, status: 200, headers: new Headers({ 'x-request-id': 'req-1' }), text: async () => JSON.stringify({ code: 0, data: { ok: true } }) }; } }, { code: 'x' });
  assert.strictEqual(apiResult.data.ok, true);
  assert.strictEqual(apiResult._debug.requestId, 'req-1');
  assert.deepStrictEqual(mapOauthUserConnector({ connect_status: 1, display_name: 'GitHub', oauth_client_id: 'cid' }).connectStatus, 1);
  const aclRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-acl-'));
  const aclFile = path.join(aclRoot, 'token');
  fs.writeFileSync(aclFile, 'secret', { mode: 0o644 });
  assert.strictEqual(verifyFileAcl(aclFile).reason, 'mode-too-permissive');
  assert.strictEqual(tryRepairAcl(aclFile, 'file'), true);
  assert.strictEqual(verifyFileAcl(aclFile).ok, true);
  assert.deepStrictEqual(parseIcaclsPrincipals('BUILTIN\\Users:(RX)\nDOMAIN\\user:(R,W)\nSuccessfully processed 1 files'), ['BUILTIN\\Users', 'DOMAIN\\user']);
  assert.strictEqual(isBroadPrincipal('BUILTIN\\Users'), true);
  fs.rmSync(aclRoot, { recursive: true, force: true });
  assert.strictEqual(computeRemainingExpiresIn({ expires_in: 60 }, { connect_time: 1000 }, 31000), 30);
  const migrationRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-mcp-oauth-migration-'));
  const legacyRoot = path.join(migrationRoot, 'legacy');
  const uidRoot = path.join(legacyRoot, 'uid-1');
  const migrationConfigDir = path.join(migrationRoot, '.workbuddy');
  fs.mkdirSync(uidRoot, { recursive: true });
  fs.mkdirSync(migrationConfigDir, { recursive: true });
  const legacyKey = generateLegacyKey('github', 'https://mcp.test');
  fs.writeFileSync(path.join(uidRoot, 'VSCode_mcp_oauth.json'), JSON.stringify({ tokens: { [legacyKey]: { access_token: 'legacy-access', expires_in: 3600 } }, clientInfo: { [legacyKey]: { client_id: 'client', client_secret: 'secret', connect_time: Date.now() } } }));
  fs.writeFileSync(path.join(migrationConfigDir, 'mcp.json'), JSON.stringify({ mcpServers: { github: { url: 'https://mcp.test' } } }));
  const mcpOauthMigration = new McpOAuthMigrationService(() => 'user-1', { homeDir: migrationRoot, configDir: migrationConfigDir, backupBaseDir: path.join(migrationRoot, 'backup') });
  const migrationResult = mcpOauthMigration.migrate(legacyRoot, path.join(migrationConfigDir, 'mcp.json'));
  assert.strictEqual(migrationResult.tokensMigrated, 1);
  assert.strictEqual(migrationResult.clientInfoMigrated, 1);
  assert.ok(getSourceMaxMtime(legacyRoot) > 0);
  fs.rmSync(migrationRoot, { recursive: true, force: true });
  const refreshedTokens = [];
  const savedClients = [];
  const tokenRefresher = new ConnectorTokenRefresher({
    loadTokens: () => ({ refresh_token: 'refresh' }),
    loadClientInfo: () => undefined,
    saveTokens: (_id, _url, tokens) => refreshedTokens.push(tokens),
    saveClientInfo: (_id, _url, client) => savedClients.push(client),
  }, { getMemoryClientInfo: () => ({ client_id: 'client' }) }, {
    discoverOAuthProtectedResourceMetadata: async () => ({ authorization_servers: ['https://auth.test'] }),
    discoverAuthorizationServerMetadata: async () => ({ token_endpoint: 'https://auth.test/token' }),
    refreshAuthorization: async (_url, request) => ({ access_token: `new-${request.refreshToken}`, refresh_token: 'next', expires_in: 3600 }),
  });
  await tokenRefresher.refreshNow('github', 'https://mcp.test');
  assert.strictEqual(refreshedTokens[0].access_token, 'new-refresh');
  assert.deepStrictEqual(savedClients, [{ client_id: 'client' }]);
  tokenRefresher.dispose();
  const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-cache-'));
  const cacheFile = path.join(cacheRoot, 'mcp.json');
  fs.writeFileSync(cacheFile, JSON.stringify({ version: 1, servers: ['a'] }));
  let reads = 0;
  const jsonCache = new JsonFileCache((filePath) => { reads += 1; return safeReadJsonFile(filePath, { missing: true }); });
  assert.deepStrictEqual(jsonCache.get(cacheFile), { version: 1, servers: ['a'] });
  assert.deepStrictEqual(jsonCache.get(cacheFile), { version: 1, servers: ['a'] });
  assert.strictEqual(reads, 1);
  fs.writeFileSync(cacheFile, JSON.stringify({ version: 2, servers: ['b'] }));
  jsonCache.invalidate(cacheFile);
  assert.deepStrictEqual(jsonCache.get(cacheFile), { version: 2, servers: ['b'] });
  assert.strictEqual(reads, 2);
  fs.unlinkSync(cacheFile);
  assert.deepStrictEqual(jsonCache.get(cacheFile), { missing: true });
  let computes = 0;
  const ttlCache = new TtlMemoCache(() => ({ value: ++computes }), 10);
  assert.deepStrictEqual(ttlCache.get(), { value: 1 });
  assert.deepStrictEqual(ttlCache.get(), { value: 1 });
  assert.strictEqual(computes, 1);
  ttlCache.invalidate();
  assert.deepStrictEqual(ttlCache.get(), { value: 2 });
  fs.rmSync(cacheRoot, { recursive: true, force: true });
  assert.strictEqual(buildBuiltinArdotMcpUrl(50552), 'http://127.0.0.1:50552/api/v1/mcp');
  assert.strictEqual(isValidArdotDevMcpServer({ dev: true, url: 'http://127.0.0.1:1' }), true);
  assert.strictEqual(Boolean(isValidArdotDevMcpServer({ dev: true, command: 'node', args: ['cli.cjs'], env: { MCP_APP_EMBED_URL: 'https://ardot.test' } })), true);
  assert.deepStrictEqual(createBuiltinArdotMcpServer('/tmp/cli.cjs', 'http://127.0.0.1:1'), { url: 'http://127.0.0.1:1', disabled: false, managedBy: 'workbuddy-builtin' });
  assert.strictEqual(isValidNetdriveDevMcpServer({ dev: true, url: 'http://127.0.0.1:2' }), true);
  assert.strictEqual(createBuiltinNetdriveMcpServer({ 'X-Genie-User-ID': 'u1', Authorization: 'Bearer t', Empty: '' }, 'https://netdrive.test').headers.Empty, undefined);
  const messages = [];
  const decode = createDecoder((message) => messages.push(message));
  decode(encode({ id: 1, value: 'a' }).slice(0, 8));
  decode(`${encode({ id: 1, value: 'a' }).slice(8)}${encode({ id: 2 })}`);
  assert.deepStrictEqual(messages.map((message) => message.id), [1, 2]);
  const sent = [];
  let onMessage;
  const connection = new ProtocolConnection({ write: (line) => sent.push(JSON.parse(line)), onMessage: (listener) => { onMessage = listener; } }, { requestTimeoutMs: 1000 });
  const pendingResponse = connection.request('session/new', { cwd: '/tmp' });
  assert.strictEqual(sent[0].method, 'session/new');
  onMessage({ jsonrpc: '2.0', id: sent[0].id, result: { sessionId: 's1' } });
  assert.deepStrictEqual(await pendingResponse, { sessionId: 's1' });
  await assert.rejects(() => connection.request('slow', {}, { timeoutMs: 1 }), /timed out/);
  connection.close();
  await assert.rejects(() => connection.request('after-close'), /closed/);
  const inputController = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"id":1}')); controller.enqueue(new TextEncoder().encode('\n{"id":2}')); controller.close(); } });
  const written = [];
  const stream = ndJsonStream({ getWriter: () => ({ write: async (value) => written.push(Buffer.from(value).toString('utf8')), releaseLock() {} }) }, inputController);
  const decoded = [];
  for await (const item of stream.readable) decoded.push(item.id);
  assert.deepStrictEqual(decoded, [1, 2]);
  await stream.writable.getWriter().write({ method: 'ping' });
  assert.strictEqual(written[0], '{"method":"ping"}\n');
  const rpcIncoming = new ReadableStream({ start(controller) { controller.enqueue({ jsonrpc: '2.0', id: 1, method: 'echo', params: { value: 2 } }); setTimeout(() => controller.close(), 5); } });
  const rpcWrites = [];
  const rpc = new RpcConnection(async (method, params) => { if (method === 'echo') return params.value; throw RequestError.methodNotFound(method); }, async () => {}, { readable: rpcIncoming, writable: { getWriter: () => ({ write: async (message) => rpcWrites.push(message), releaseLock() {} }) } });
  await rpc.closed;
  assert.deepStrictEqual(rpcWrites[0], { jsonrpc: '2.0', id: 1, result: 2 });
  const rpcOutbound = new RpcConnection(async () => ({}), async () => {}, { readable: new ReadableStream({ start(controller) { controller.close(); } }), writable: { getWriter: () => ({ write: async (message) => { setTimeout(() => rpcOutbound.handleResponse({ jsonrpc: '2.0', id: message.id, result: 'ok' }), 0); }, releaseLock() {} }) } });
  assert.strictEqual(await rpcOutbound.sendRequest('ping', {}), 'ok');
  assert.strictEqual(PROTOCOL_VERSION, 1);
  assert.strictEqual(AGENT_METHODS.session_prompt, 'session/prompt');
  const sseEvents = [];
  const sse = createSSEDecoder((event) => sseEvents.push(event));
  sse.push('event: message\ndata: {"id":1}\n\n');
  sse.push('id: 2\ndata: next'); sse.flush();
  assert.deepStrictEqual(sseEvents, [{ type: 'message', data: '{"id":1}' }, { type: 'message', data: 'next', id: '2' }]);
  const parsedSse = {}; assert.strictEqual(parseSSELine(': heartbeat', parsedSse).isComment, true);
  const httpCalls = [];
  const httpFetch = async (url, init) => {
    httpCalls.push({ url, init });
    if (init.method === 'GET') return { ok: true, status: 200, headers: new Headers({ 'mcp-session-id': 'mcp-1' }), body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('data: {"event":"ready"}\n\n')); controller.close(); } }) };
    if (init.method === 'POST') return { ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ ok: true }) };
    return { ok: true, status: 204, headers: new Headers() };
  };
  const httpTransport = createStreamableHttpTransport({ endpoint: 'https://agent.test/mcp/', authToken: 'token', fetch: httpFetch });
  await httpTransport.connect();
  assert.deepStrictEqual(await httpTransport.nextMessage(), { event: 'ready' });
  assert.deepStrictEqual(await httpTransport.send({ jsonrpc: '2.0', id: 1 }), { ok: true });
  await httpTransport.close();
  assert.deepStrictEqual(httpCalls.map((call) => call.init.method), ['GET', 'POST', 'DELETE']);
  const facadeWrites = [];
  const facade = new ClientSideConnection(() => ({ sessionUpdate() {} }), { readable: new ReadableStream({ start(controller) { setTimeout(() => controller.close(), 20); } }), writable: { getWriter: () => ({ write: async (message) => { facadeWrites.push(message); setTimeout(() => facade.connection.handleResponse({ id: message.id, result: { sessionId: 's1' } }), 0); }, releaseLock() {} }) } });
  assert.deepStrictEqual(await facade.newSession({ cwd: '/tmp' }), { sessionId: 's1' });
  assert.strictEqual(facadeWrites[0].method, 'session/new');
  await facade.cancel({ sessionId: 's1' });
  assert.deepStrictEqual(parseFrontmatter('---\nname: reports\nuser-invocable: false\n---\nDo it'), {
    attributes: { name: 'reports', 'user-invocable': 'false' }, body: 'Do it',
  });

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-runtime-'));
  fs.mkdirSync(path.join(root, 'skills', 'nested'), { recursive: true });
  fs.writeFileSync(path.join(root, 'skills', 'SKILL.md'), '---\nname: root\n---\nRoot');
  fs.writeFileSync(path.join(root, 'skills', 'nested', 'SKILL.md'), '---\nname: nested\n---\nNested');
  assert.strictEqual(scanSkillFiles(path.join(root, 'skills')).length, 2);
  assert.strictEqual(validatePluginManifest({ name: 'demo', version: '1.0.0' }).valid, true);
  assert.strictEqual(validatePluginManifest({ version: 1 }).valid, false);
  const memoryDir = path.join(root, 'memory');
  await writeAiName(memoryDir, 'Buddy');
  await writeUserCallName(memoryDir, 'Yanfei');
  await writeSoulBody(memoryDir, 'Helpful assistant');
  await writeMemoryBody(memoryDir, 'Remember the project conventions.');
  const localMemory = await readLocalMemoryFiles(memoryDir);
  assert.strictEqual(localMemory.aiName.value, 'Buddy');
  assert.strictEqual(localMemory.userCallName.value, 'Yanfei');
  assert.strictEqual(localMemory.soul.content, 'Helpful assistant');
  assert.strictEqual(localMemory.memory.content, 'Remember the project conventions.');
  const identityService = createWorkbuddyIdentityService({ configDir: memoryDir });
  assert.deepStrictEqual(await identityService.updateAiName('CodeBuddy'), { success: true });
  assert.deepStrictEqual(await identityService.updateMemoryBody('Updated memory'), { success: true });
  const idle = new WorkbuddyIdleCapabilityService({ homeDir: path.join(root, 'idle') });
  await idle.recordUsage({ type: 'skill', id: 'reports' });
  await idle.recordActiveDay();
  assert.deepStrictEqual(computeIdleCandidates({ skills: {}, mcps: {}, dismissedIdle: {} }, '2026-01-05', { skills: ['reports'], skillInstalledAt: { reports: Date.parse('2026-01-01T00:00:00Z') } }), []);
  await idle.dismissGlobal();
  assert.strictEqual(await idle.getIdleCardData({ skills: ['reports'] }), null);
  assert.strictEqual(parseRRule('FREQ=WEEKLY;BYDAY=MO,WE').byday.length, 2);
  const onceAt = Date.parse('2026-01-02T10:00:00Z');
  assert.strictEqual(computeNextRunAt({ id: 'a1', scheduleType: 'once', scheduledAt: '2026-01-02T10:00:00Z' }, onceAt - 1000), onceAt);
  assert.strictEqual(isWithinMissedRunWindow(onceAt, onceAt + 60_000), true);
  const automationFixture = { id: 'a1', status: 'ACTIVE', prompt: 'hello  world', scheduleType: 'once', scheduledAt: '2026-01-02', cwds: ['/tmp/automation-1'] };
  assert.strictEqual(getAutomationRunIdentity(automationFixture), getAutomationRunIdentity({ ...automationFixture, id: 'a2', prompt: ' hello world ' }));
  assert.strictEqual(findEquivalentActiveAutomation(automationFixture, [{ ...automationFixture, id: 'a2', created_at: 1 }]).id, 'a2');
  assert.strictEqual(decideAutomationOwner({ userIds: ['u1', 'u1', 'u1'] }, 'u2', 'runtime_claim').ownerUserId, 'u1');
  assert.strictEqual(isReadOnlyAutomationToolName('read_file'), true);
  assert.strictEqual(isRetryBlockingToolName('read_file'), false);
  assert.strictEqual(classifyTransientPromptRetryReason('HTTP 503 gateway timeout'), 'server-5xx');
  assert.strictEqual(sanitizeErrorForNotification('Error at /Users/example/project/file.js\ntrace'), 'Error at <path>');
  const coordinator = new RunCoordinator();
  const runId = coordinator.startRun('automation-1');
  assert.strictEqual(coordinator.isRunning('automation-1'), true);
  assert.strictEqual(coordinator.startRun('automation-1'), undefined);
  coordinator.finishRun(runId);
  assert.strictEqual(coordinator.isRunning('automation-1'), false);
  coordinator.dispose();
  assert.deepStrictEqual(mergeMarketplaceManifests(
    { plugins: [{ source: './a', name: 'A' }] },
    [{ plugins: [{ source: './a', name: 'A2' }, { source: './b', name: 'B' }] }],
  ).plugins, [{ source: './a', name: 'A2' }, { source: './b', name: 'B' }]);
  const credentials = new CredentialStore(path.join(root, 'credentials.json'));
  assert.strictEqual(getLogoutMarkerPath('/tmp/auth.json'), '/tmp/auth.json.logged-out');
  assert.strictEqual(new TimeoutError('slow').code, AuthErrorCode.Timeout);
  assert.strictEqual(isPersonalAccount({ type: Edition.Personal }), true);
  assert.strictEqual(isPersonalAccount({ type: 'enterprise' }), false);
  const productEnv = new ProductEnvService({ productManager: { waitConfiguration: async () => ({ authentication: { attributes: { internalDomain: '*.corp.test', externalDomain: 'example.test' } } }), sync: async () => {} }, sessionProvider: async () => ({ auth: { domain: 'dev.corp.test' } }) });
  assert.strictEqual(await productEnv.getCurrent(), ProductEnviroment.Internal);
  assert.strictEqual(productEnv.matchDomain('*.corp.test', 'dev.corp.test'), true);
  assert.strictEqual(productEnv.matchDomain('*.corp.test', 'corp.test'), false);
  const defaultAuthStorage = new DefaultAuthenticationStorage();
  const storedSessions = [];
  defaultAuthStorage.storeSessionSubject.subscribe((session) => storedSessions.push(session));
  assert.strictEqual(await defaultAuthStorage.priority(), 1);
  await defaultAuthStorage.store({ account: { uid: 'u1' } });
  assert.deepStrictEqual(await defaultAuthStorage.restore(), { account: { uid: 'u1' } });
  await defaultAuthStorage.clean();
  assert.strictEqual(storedSessions.length, 3);
  const authFile = path.join(root, 'auth', 'session.info');
  const fileStorage = new FileAuthenticationStorage({ filePath: authFile });
  assert.strictEqual(fileAuthenticationStorageSource.FileAuthenticationStorage, FileAuthenticationStorage);
  await fileStorage.store({ account: { uid: 'u2' }, auth: { accessToken: 'token' } });
  assert.strictEqual((await fileStorage.restore()).account.uid, 'u2');
  const authBackupsBeforeClean = fs.readdirSync(path.dirname(authFile)).filter((name) => name.includes('.session.') && name.endsWith('.info'));
  const logoutToken = await fileStorage.beginLogout();
  assert.strictEqual((await fileStorage.restore()), undefined);
  assert.strictEqual(await fileStorage.clean({ logoutToken: 'stale-token' }), false);
  assert.strictEqual(await fileStorage.clean({ logoutToken }), true);
  const authBackupsAfterClean = fs.readdirSync(path.dirname(authFile)).filter((name) => name.includes('.session.') && name.endsWith('.info'));
  assert.ok(authBackupsAfterClean.length > authBackupsBeforeClean.length);
  await fileStorage.dispose();
  const migratedAuthFile = path.join(root, 'auth', 'migrated.info');
  const { setWorkbuddyLegacyAuthSessionMigrator } = require('../packages/authentication/src/runtime/file-authentication-storage.js');
  setWorkbuddyLegacyAuthSessionMigrator({ migrate: async () => ({ account: { uid: 'legacy' }, auth: { accessToken: 'legacy-token' } }) });
  const migratedStorage = new FileAuthenticationStorage({ filePath: migratedAuthFile });
  assert.strictEqual((await migratedStorage.restore()).account.uid, 'legacy');
  await migratedStorage.dispose();
  setWorkbuddyLegacyAuthSessionMigrator(undefined);
  const watchedAuthFile = path.join(root, 'auth', 'watched.info');
  const watchedStorage = new FileAuthenticationStorage({ filePath: watchedAuthFile, watch: true });
  watchedStorage.init();
  await new Promise((resolve) => setTimeout(resolve, 25));
  fs.writeFileSync(watchedAuthFile, JSON.stringify({ account: { uid: 'external' }, auth: { accessToken: 'external-token' } }, null, 2));
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.strictEqual(watchedStorage.session.account.uid, 'external');
  await watchedStorage.dispose();
  const token = `header.${Buffer.from(JSON.stringify({ sub: 'custom-user', nickname: 'Custom', iss: 'https://sso.example/sso-ent-1' })).toString('base64url')}.signature`;
  const customProduct = { authentication: { type: AuthenticationType.CUSTOM_TOKEN, attributes: { token } } };
  const customStorage = new CustomTokenAuthenticationStorage({ productManager: { configuration: { getValue: () => customProduct }, waitConfiguration: async () => customProduct }, env: {} });
  assert.strictEqual(await customStorage.priority(), 9);
  const customSession = await customStorage.restore();
  assert.deepStrictEqual({ uid: customSession.account.uid, enterpriseId: customSession.account.enterpriseId }, { uid: 'custom-user', enterpriseId: 'ent-1' });
  assert.strictEqual(await new CustomTokenAuthenticationProvider({ productManager: { waitConfiguration: async () => customProduct }, storage: customStorage }).support(), true);
  credentials.set('workbuddy', { token: 'test' });
  assert.strictEqual(credentials.get('workbuddy').token, 'test');
  assert.strictEqual(fs.statSync(path.join(root, 'credentials.json')).mode & 0o777, 0o600);
  const auth = new AuthSession();
  assert.deepStrictEqual(auth.getStatus(), { loggedIn: false });
  auth.setSession({
    account: { uid: 'user-1', nickname: 'Tester', enterpriseId: 'enterprise-1', departmentFullName: 'R&D' },
    auth: { accessToken: 'access', refreshToken: 'refresh', domain: 'workbuddy' },
  });
  assert.strictEqual(auth.getStatus().user.id, 'user-1');
  assert.strictEqual(auth.getAccount().type, 'personal');
  assert.deepStrictEqual(auth.buildAuthHeaders(true, true, true), {
    'X-User-Id': 'user-1', Authorization: 'Bearer access', 'X-Enterprise-Id': 'enterprise-1',
    'X-Tenant-Id': 'enterprise-1', 'X-Domain': 'workbuddy', 'X-Department-Info': 'R&D', 'X-Refresh-Token': 'refresh',
  });
  assert.strictEqual(deriveAccountContext({ accountType: 'exclusive' }).deploymentKind, 'vpc');
  assert.strictEqual(deriveAccountContext({ enterpriseId: 'e1' }).kind, 'enterprise');
  assert.strictEqual(gatewaySecretEnv().CODEBUDDY_GATEWAY_PASSWORD, getGatewaySecret());
  assert.strictEqual(gatewaySecretHeaders().Authorization, `Bearer ${getGatewaySecret()}`);
  assert.strictEqual(projectHttpSource.buildQuery, buildQuery);
  assert.strictEqual(buildQuery({ q: 'hello world', empty: null }), '?q=hello%20world');
  assert.strictEqual(ROUTE_PREFIX, '/console/as/projects');
  assert.strictEqual(HANDOFF_CANARY_HEADERS['x-teams-collab-handoff-canary'], 'true');
  assert.strictEqual(unwrap({ code: 0, data: { ok: true } }, 'demo').ok, true);
  assert.throws(() => unwrap({ code: 7, msg: 'bad', requestId: 'r1' }, 'demo'), (error) => error.code === 7 && error.requestId === 'r1');
  assert.strictEqual(resolveTeamsAcceptLanguage({ resolveIsOverseas: () => true }), 'en-US');
  const projectHttpCalls = [];
  const httpStub = { get: (...args) => projectHttpCalls.push(args), post: (...args) => projectHttpCalls.push(args), put: (...args) => projectHttpCalls.push(args), patch: (...args) => projectHttpCalls.push(args), delete: (...args) => projectHttpCalls.push(args) };
  withHandoffCanaryHeaders(httpStub).get('/handoff', { headers: { 'x-extra': '1' } });
  withAcceptLanguageHeader(httpStub, () => 'zh-CN').get('/projects', { headers: { 'Accept-Language': 'en-US' } });
  assert.strictEqual(projectHttpCalls[0][1].headers['x-teams-collab-handoff-canary'], 'true');
  assert.strictEqual(projectHttpCalls[1][1].headers['Accept-Language'], 'en-US');
  const telemetryMessages = [];
  configureWorkbuddyLogger({ info: (message, ...args) => telemetryMessages.push([message, ...args]) });
  const scopedTelemetryLogger = createWorkbuddyScopedLogger('test');
  scopedTelemetryLogger.info('message', 1);
  assert.strictEqual(telemetryMessages[0][0], '[test] message');
  assert.strictEqual(telemetryLoggerSource.getWorkbuddyLogger(), getWorkbuddyLogger());
  configureWorkbuddyLogger(console);
  const promptEvents = [];
  setDesktopMonitorServiceResolver(async () => ({ getSharedInstance: () => ({ reportAegisEvent: (...args) => promptEvents.push(args) }) }));
  reportPromptForwardingEvent({ promptRequestId: 'p1', conversationId: 'c1', userId: 'u1', traceId: 't1' });
  reportPromptDoneEvent({ promptRequestId: 'p1', conversationId: 'c1', userId: 'u1', mainReceiveTime: Date.now() - 5, ok: false, traceId: 't1', errorMessage: 'failed' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(promptEvents[0][0], 'wb_main_prompt_forwarding');
  assert.strictEqual(promptEvents[1][0], 'wb_main_prompt_failed');
  assert.strictEqual(promptTraceSource.reportPromptTrace, reportPromptTrace);
  assert.strictEqual(startupPerfSource.buildStartupSpans, buildStartupSpansFromPackage);
  assert.strictEqual(logAclSource.computeCutoff, computeCutoff);
  assert.strictEqual(computeCutoff('2026-01-07'), '2026-01-01');
  assert.strictEqual(DATE_DIR_PATTERN.test('2026-01-02'), true);
  assert.strictEqual(DATE_DIR_PATTERN.test('2026-1-2'), false);
  assert.strictEqual(DENY_MASK, '(OI)(CI)(DE,DC)');
  assert.strictEqual(await releaseLogAclGuard(path.join(root, 'logs', '2026-01-01'), 'user'), undefined);
  assert.strictEqual(typeof startLogAclGuardScheduler(path.join(root, 'logs')), 'function');
  const connectorEntry = { auth_mode: 'oneid-token', enterprise_variants: { enterprise: { auth_mode: 'server-side', token_header: { name: 'X-Custom-Token' }, oneid_app_type: 'enterprise-doc' } } };
  assert.strictEqual(resolveActiveAuthMode(connectorEntry, { kind: 'enterprise', variantKey: 'enterprise' }), 'server-side');
  assert.strictEqual(resolveTokenHeaderName(connectorEntry, { kind: 'enterprise', variantKey: 'enterprise' }), 'X-Custom-Token');
  assert.strictEqual(resolveOneidAppType(connectorEntry, { kind: 'enterprise', variantKey: 'enterprise' }), 'enterprise-doc');
  assert.ok(resolveModeTools('ask').includes('AskUserQuestion'));
  assert.strictEqual(resolveResponseLocaleIsZh('en-US', 'zh-CN'), false);
  assert.match(formatLocalIsoTimestamp(new Date('2026-01-02T03:04:05.006Z')), /^2026-01-02T/);
  assert.strictEqual(formatLine('Test', { plain: 'ok', spaced: 'a b', quoted: 'x="y' }), '[Test] plain=ok spaced="a b" quoted="x=\\"y"');
  assert.strictEqual(buildLifecycleLine('Boot', { source: 'test' }, { runtime: { getAppName: () => 'WorkBuddy', getAppVersion: () => '1.0' }, product: { getCommit: () => 'abc', getBase: () => ({ networkEnvironment: 'prod', platform: 'desktop' }) }, userIdProvider: () => 'u1', processInfo: { platform: 'darwin', arch: 'arm64', versions: { node: '22' }, uptime: () => 12 } }), '[Boot] appName=WorkBuddy appVersion=1.0 build=abc platform=darwin arch=arm64 electron=unknown node=22 chrome=unknown channel=prod productConfigType=desktop userId=u1 uptimeSec=12 source=test');
  assert.deepStrictEqual(buildStartupPerfFields({ startupType: 'cold', flowType: 'startup', totalMs: 12, totalMarks: 3, firstInteractiveMs: 8, phases: { A: 2 } }), { startup_type: 'cold', flow_type: 'startup', total_ms: 12, total_marks: 3, first_interactive_ms: 8, phase_A_ms: 2 });
  const fakeSchema = { shape: { name: {} }, description: 'demo', safeParse: (value) => ({ success: typeof value === 'string', data: value }), isOptional: () => true, _def: { value: 'literal' } };
  assert.deepStrictEqual(getObjectShape(fakeSchema), { name: {} });
  assert.strictEqual(getSchemaDescription(fakeSchema), 'demo');
  assert.strictEqual(isSchemaOptional(fakeSchema), true);
  assert.strictEqual(getLiteralValue(fakeSchema), 'literal');
  assert.strictEqual(safeParse(fakeSchema, 'ok').success, true);
  assert.strictEqual(normalizeObjectSchema(fakeSchema), fakeSchema);
  assert.deepStrictEqual(mergeCapabilities({ roots: { list: true }, stale: true }, { roots: { read: true }, stale: undefined, added: false }), { roots: { list: true, read: true }, stale: true, added: false });
  assert.strictEqual(getParseErrorMessage({ issues: [{ message: 'invalid' }] }), 'invalid');
  assert.strictEqual(hasRemoteProductPayload({ mergeStrategy: 'smart', enabled: false }), true);
  assert.strictEqual(hasRemoteProductPayload({ mergeStrategy: 'smart', empty: '' }), false);
  assert.deepStrictEqual(applyProductExperimentOverlay({ models: [{ id: 'a', label: 'A', flags: { x: false } }], productFeatures: { a: false, b: false } }, { models: [{ id: 'a', flags: { x: true } }], productFeatures: { a: true } }), { models: [{ id: 'a', label: 'A', flags: { x: true } }], productFeatures: { a: true, b: false } });
  assert.strictEqual(redactProductSnapshotLogValue('api_key', 'secret'), '<redacted>');
  assert.strictEqual(redactProductSnapshotLogValue('download_url', 'https://cdn.test/a?sign=1&x=2#frag'), 'https://cdn.test/a');
  assert.strictEqual(hostedCliRotationKeyOfNormalized({ download_url: 'https://cdn.test/a?sign=1&q-ak=2&x=3' }), '{"download_url":"https://cdn.test/a?x=3"}');
  assert.deepStrictEqual(collectJsonChangedPaths({ a: 1, nested: { x: true } }, { a: 2, nested: { x: true, y: 1 } }), ['$.a', '$.nested.y']);
  assert.deepStrictEqual(normalizeJsonValue({ b: undefined, a: 1 }), { a: 1 });
  assert.strictEqual(resourceUrlFromServerUrl('https://example.test/api#fragment').href, 'https://example.test/api');
  assert.strictEqual(checkResourceAllowed({ requestedResource: 'https://example.test/api/v1/x', configuredResource: 'https://example.test/api' }), true);
  assert.strictEqual(checkResourceAllowed({ requestedResource: 'https://example.test/apix', configuredResource: 'https://example.test/api' }), false);
  assert.strictEqual(selectClientAuthMethod({ client_secret: 's' }, ['none', 'client_secret_basic']), 'client_secret_basic');
  const authHeaders = new Headers(); const authParams = new URLSearchParams(); applyClientAuthentication('client_secret_post', { client_id: 'id', client_secret: 'secret' }, authHeaders, authParams);
  assert.strictEqual(authParams.get('client_id'), 'id');
  assert.strictEqual(authParams.get('client_secret'), 'secret');
  assert.ok(buildDiscoveryUrls('https://example.test/mcp').some((url) => url.includes('oauth-authorization-server')));
  assert.strictEqual(resolveIsMainFramePreload({ processIsMainFrame: false, isTopWindow: true }), false);
  assert.strictEqual(readLocalFilePath('workbuddy://open?localFilePath=%2Ftmp%2Fa.txt'), '/tmp/a.txt');
  assert.strictEqual(getIsMainFramePreload({ processObject: { isMainFrame: true }, windowObject: {} }), true);
  assert.strictEqual(getIsTopWindow({ top: null }), false);
  assert.strictEqual(isLocalFileDragInfo({ filePath: '/tmp/a.txt' }), true);
  assert.strictEqual(isLocalFileDragInfo({}), false);
  const dragBridgeCalls = [];
  let dragBridgeHandler;
  installLocalFileDragBridge({ contextBridge: { exposeInMainWorld: (_name, handler) => { dragBridgeHandler = handler; } }, ipcRenderer: { send: (...args) => dragBridgeCalls.push(args) } });
  dragBridgeHandler({ filePath: '/tmp/a.txt', fileName: 'a.txt', dragImageRect: { x: 1, y: 2, width: 3, height: 4 } });
  assert.strictEqual(dragBridgeCalls[0][0], 'artifact:start-drag-local-file');
  assert.strictEqual(toFileResourceUri('/tmp/a b.txt'), 'file:///tmp/a%20b.txt');
  assert.strictEqual(coreContractSource.AUTH_RPC_CHANNELS, AUTH_RPC_CHANNELS);
  assert.strictEqual(AUTH_RPC_CHANNELS.LOGIN, 'auth:login');
  assert.strictEqual(AUTH_RPC_CHANNELS.LOAD_PENDING_INPUT, 'auth:loadPendingInput');
  assert.strictEqual(mcpSchemaSource.createCompletionResult, createCompletionResult);
  assert.deepStrictEqual(createCompletionResult(Array.from({ length: 102 }, (_, index) => `s${index}`)).completion, { values: Array.from({ length: 100 }, (_, index) => `s${index}`), total: 102, hasMore: true });
  assert.deepStrictEqual(EMPTY_COMPLETION_RESULT, { completion: { values: [], hasMore: false } });
  const zodLike = { parse: (value) => value, safeParse: (value) => ({ success: true, data: value }) };
  assert.strictEqual(isZodTypeLike(zodLike), true);
  assert.strictEqual(isZodSchemaInstance(zodLike), true);
  assert.strictEqual(isZodRawShapeCompat({ name: zodLike }), true);
  assert.strictEqual(getZodSchemaObject(zodLike), zodLike);
  assert.deepStrictEqual(promptArgumentsFromSchema({ shape: { name: { description: 'Name', isOptional: () => false } } }), [{ name: 'name', description: 'Name', required: true }]);
  const daemonEntryCalls = [];
  await startDaemonAppServerEntry({ initStartupContext: (proc) => daemonEntryCalls.push(['startup', proc]), configureLogger: (options) => daemonEntryCalls.push(['logger', options]), loadMain: async () => ({ runDaemonAppServerEntry: async () => daemonEntryCalls.push(['main']) }) });
  assert.deepStrictEqual(daemonEntryCalls.map(([kind]) => kind), ['startup', 'logger', 'main']);
  assert.deepStrictEqual(clampBoundsToWorkArea({ x: -10, y: 700, width: 1600, height: 900 }, { x: 0, y: 0, width: 1200, height: 800 }), { x: 0, y: 0, width: 1200, height: 800 });
  assert.strictEqual(isVisibleOnAnyDisplay({ x: 100, y: 100, width: 20, height: 20 }, [{ workArea: { x: 0, y: 0, width: 200, height: 200 } }]), true);
  assert.deepStrictEqual(stripFrameEmbeddingHeaders({ 'X-Frame-Options': ['DENY'], 'Content-Security-Policy': ['default-src \'self\'; frame-ancestors \'none\''], 'X-Test': ['ok'] }), { 'Content-Security-Policy': ["default-src 'self'"], 'X-Test': ['ok'] });
  const callbackUrl = parseDeepLink('workbuddy://agents/callback/tdocs-app?state=s1#done');
  assert.strictEqual(getDeepLinkPath(callbackUrl), '/agents/callback/tdocs-app');
  assert.strictEqual(mapDeepLinkToRoute(callbackUrl), '/callback?state=s1&name=tdocs-app');
  assert.strictEqual(mapDeepLinkToRoute('workbuddy://task/run?prompt=hello#draft'), '/task/run?prompt=hello#draft');
  assert.deepStrictEqual(readSkillInstallIntent('workbuddy://codebuddy-ide/skill/install?skillname=reports&downloadurl=https%3A%2F%2Fexample.test%2Fskill&source=market'), { skillName: 'reports', downloadUrl: 'https://example.test/skill', channelType: 'market' });
  assert.deepStrictEqual(readExpertInstallIntent('workbuddy://codebuddy-ide/expert/install?expertname=writer&sharecode=abc'), { expertName: 'writer', shareCode: 'abc' });
  assert.strictEqual(readSwitchModelIntent('workbuddy://switch-model?modelId=sonnet'), 'sonnet');
  assert.strictEqual(getOpenUrlFromCommandLine(['--x', 'file:///tmp/a', 'workbuddy://home'], (value) => value.startsWith('workbuddy:')), 'workbuddy://home');
  const openQueue = createPendingOpenUrlQueue();
  assert.strictEqual(openQueue.enqueue('workbuddy://home'), true); assert.strictEqual(openQueue.enqueue('workbuddy://home'), false);
  assert.deepStrictEqual(openQueue.markReady(), [{ url: 'workbuddy://home' }]); assert.strictEqual(openQueue.isReady(), true);
  const fileQueue = createPendingFileQueue(); fileQueue.enqueue('/tmp/a'); fileQueue.enqueue('/tmp/a'); fileQueue.enqueue('/tmp/b');
  assert.deepStrictEqual(fileQueue.consume(), ['/tmp/a', '/tmp/b']);
  const taskLink = parseDeeplink('workbuddy://task?action=start&prompt=hello&skills=a,b,a&connectorIds=x&permissionMode=unsafe&welcomeMode=unknown');
  assert.strictEqual(taskLink.ok, true);
  assert.deepStrictEqual(taskLink.value.skills, ['a', 'b']);
  assert.strictEqual(taskLink.value.permissionMode, 'default');
  assert.ok(taskLink.warnings.length >= 2);
  assert.strictEqual(isDomainObjectDeeplink('workbuddy://task?action=start&prompt=hello'), true);
  assert.strictEqual(isDomainObjectDeeplink('https://task?action=start&prompt=hello'), false);
  assert.strictEqual(parseDeeplink('workbuddy://task?action=stop&prompt=hello').reason, 'invalid-action');
  assert.strictEqual(parseDeeplink('workbuddy://task?action=start').reason, 'missing-required');
  const mockRepo = new MockDeeplinkRepo();
  assert.strictEqual((await mockRepo.resolveTaskPayload('mock-text')).value.prompt, '帮我写一个快速排序');
  assert.strictEqual((await mockRepo.resolveTaskPayload('mock-expired')).reason, 'expired');
  assert.strictEqual(isAllowedGuestWebviewRedirect('https://docs.qq.com/oauth/callback'), true);
  assert.strictEqual(getGuestInPlaceNavigationReason('https://docs.qq.com/doc/1?a=1', 'https://docs.qq.com/doc/1?a=2'), 'same-document');
  assert.ok(validateBootstrapInfo({ pendingLocalStorageMigration: { sourceSessionPath: '/tmp/session', preparedAt: 1, entries: { a: 'b' } } }).pendingLocalStorageMigration);
  const localStorage = new Map([['workbuddy-pinned-conversations', JSON.stringify([{ id: 'a' }])], ['existing', 'keep']]);
  const storage = { getItem: (key) => localStorage.get(key) ?? null, setItem: (key, value) => localStorage.set(key, value) };
  const migration = applyLocalStorageMigrationPayload(storage, { entries: { 'workbuddy-pinned-conversations': JSON.stringify([{ id: 'a' }, { id: 'b' }]), existing: 'replace', empty: '' } });
  assert.deepStrictEqual(migration.appliedKeys, ['workbuddy-pinned-conversations']);
  assert.strictEqual(JSON.parse(localStorage.get('workbuddy-pinned-conversations')).length, 2);
  const contextMessages = [{ role: 'user', content: 'a'.repeat(100) }, { role: 'assistant', content: 'b'.repeat(100) }, { role: 'user', content: 'c'.repeat(100) }];
  assert.ok(calculateContextUsage(contextMessages, 100).usedTokens > 0);
  assert.strictEqual(shouldTriggerCompaction({ messages: contextMessages, contextWindow: 100, reserveTokens: 0, threshold: 0.1 }), true);
  assert.deepStrictEqual(selectCompactionCandidates(contextMessages, { keepRecent: 1 }).length, 2);
  const compacted = await compactMessages(contextMessages, (items) => `summary:${items.length}`, { keepRecent: 1 });
  assert.strictEqual(compacted.compacted, true);
  assert.strictEqual(compacted.messages[0].type, 'summary');
  assert.strictEqual(adaptShareUrl('https://share.test/?platform=cn', () => 'overseas'), 'https://share.test/?platform=overseas');
  assert.strictEqual(resolveArtifactFilePath('agent://files/a.txt'), 'a.txt');
  assert.strictEqual(resolveArtifactFilePath('file:///tmp/a%20b.txt'), '/tmp/a b.txt');
  assert.strictEqual(isShareTaskFileTooLargeError({ error: { msg: { code: 10001 } } }), true);
  assert.deepStrictEqual(buildMessageTimeWindows([
    { requestId: 'b', createTime: 20 }, { requestId: 'a', createTime: 30 }, { requestId: 'b', createTime: 10 },
  ]), [{ requestId: 'b', startedAt: 10, nextStartedAt: 30 }, { requestId: 'a', startedAt: 30, nextStartedAt: undefined }]);
  const shareMap = new Map([['/tmp/report.txt', { url: 'https://cdn/report.txt' }]]);
  const shareMessages = [{ content: { path: '/other/report.txt' }, unchanged: 'report.txt' }];
  assert.deepStrictEqual(replaceLocalPathsInMessages(shareMessages, shareMap), [{ content: { path: 'https://cdn/report.txt' }, unchanged: 'report.txt' }]);
  assert.deepStrictEqual(partitionOverseasUnsupportedArtifacts([{ name: 'a.pdf' }, { name: 'b.png' }], (item) => item.name), {
    kept: [{ name: 'b.png' }], dropped: [{ name: 'a.pdf' }],
  });
  const cwd = path.join(root, 'cwd'); fs.mkdirSync(path.join(cwd, 'site'), { recursive: true });
  const dirs = new Map([[cwd, { success: true, entries: [{ name: 'a.txt', path: path.join(cwd, 'a.txt'), isFile: true }, { name: 'site', path: path.join(cwd, 'site'), isDirectory: true }] }], [path.join(cwd, 'site'), { success: true, entries: [{ name: 'index.html', isFile: true }] }]]);
  const cwdArtifacts = await readCwdArtifacts(cwd, async (dir) => dirs.get(dir));
  assert.deepStrictEqual(cwdArtifacts.map((item) => item.name), ['a.txt', 'site.html']);
  const blobs = await readArtifactBlobs('task-1', [{ path: '/tmp/a.txt', name: 'a.txt' }], async () => ({ content: 'blob' }));
  assert.strictEqual(blobs[0].blob, 'blob');
  const collected = await collectShareArtifacts({ getSessionArtifacts: async () => [{ uri: 'file:///tmp/a.txt', title: 'a.txt', _meta: { requestId: 'r1' } }, { type: 'task', uri: 'file:///tmp/skip' }] }, 'session-1', async () => ({ content: 'data' }));
  assert.strictEqual(collected.fileArtifacts[0].requestId, 'r1');
  assert.strictEqual(buildQuery({ q: 'a b', empty: null }), '?q=a%20b');
  assert.strictEqual(resolveTeamsAcceptLanguage({ resolveIsOverseas: () => true }), 'en-US');
  assert.strictEqual(getDocsFeatureListString({ inConversation: true }), '{"aiEdit":true}');
  assert.strictEqual(getTencentDocsEngineDocType('/tmp/report.docx'), 'doc');
  assert.strictEqual(isTencentDocsUrl('https://docs.qq.com/sheet/abc'), true);
  assert.strictEqual(isTencentDocsUrl('https://evil.example/docs.qq.com'), false);
  assert.strictEqual(isLocalTencentDocsEnginePreviewUrl('http://127.0.0.1:4321/static/doc/pc.html'), true);
  assert.strictEqual(isTencentDocsClipboardOrigin('http://127.0.0.1:4321', 'http://127.0.0.1:4321'), true);
  const cliEnv = buildAgentCliRuntimeEnv({ configDir: '/tmp/wb', gatewaySecretEnv: { CODEBUDDY_GATEWAY_PASSWORD: 'secret' }, managedNodeBinDirs: ['/tmp/node'], managedPythonBinDirs: ['/tmp/python'], cliConnectorBin: '/tmp/connector', pathDelimiter: ':', processEnv: { PATH: '/usr/bin' } });
  assert.strictEqual(cliEnv.WORKBUDDY_CONFIG_DIR, '/tmp/wb');
  assert.strictEqual(cliEnv.PATH, '/tmp/node:/usr/bin');
  assert.strictEqual(resolveDisabledManagedRuntimeTypes({ enabled: true, tools: { node: false } }, ['node', 'python']).join(','), 'node');
  assert.strictEqual(compareVersionsDesc('2.10.0', '2.9.0') < 0, true);
  assert.deepStrictEqual(resolveAgentCliExecutablePath({ bundledCliPaths: [], monorepoCliPath: '/missing', envCliPath: '/ok', exists: (file) => file === '/ok' }), { path: '/ok', source: 'env' });
  assert.deepStrictEqual(resolveAgentCliRuntimeDirs({ homeDir: '/home/test', processEnv: {} }), { configDir: '/home/test/.workbuddy', userDataDir: '/home/test/.workbuddy/app' });
  const cliConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-cli-config-'));
  fs.writeFileSync(path.join(cliConfigDir, 'app-config.json'), JSON.stringify({ bundledRuntime: { enabled: false, tools: { node: false } }, channel: 'stable' }));
  assert.strictEqual(readAgentCliAppConfigValue('channel', { userDataDir: cliConfigDir }), 'stable');
  assert.strictEqual((await readAgentCliBundledRuntimeConfigAsync(cliConfigDir)).enabled, false);
  fs.rmSync(cliConfigDir, { recursive: true, force: true });
  assert.strictEqual(buildProjectQuery('p 1'), '?project_id=p%201');
  assert.strictEqual(buildRegistryQuery({ scope: 'project', mcpOnly: true }), 'scope=project&mcp_only=true');
  assert.strictEqual(mapProjectConnector({ connector_name: 'docs', connect_status: 1 }).isConnected, true);
  assert.strictEqual(mapUserConnector({ name: 'docs', repos: 'a,b', connect_status: 1 }).repos.length, 2);
  assert.strictEqual(unwrapData({ code: 0, data: { ok: true } }, 'connector').ok, true);
  assert.strictEqual(unwrap({ code: 0, data: 'ok' }, 'demo'), 'ok');
  assert.throws(() => unwrap({ code: 7, msg: 'bad', requestId: 'r1' }, 'demo'), (error) => error.code === 7 && error.requestId === 'r1');
  const wrappedRequests = [];
  const wrappedHttp = withHandoffCanaryHeaders({ get: (url, config) => { wrappedRequests.push({ url, config }); return 'ok'; } });
  assert.strictEqual(wrappedHttp.get('/handoff', { headers: { trace: '1' } }), 'ok');
  assert.deepStrictEqual(wrappedRequests[0].config.headers, { 'x-teams-collab-handoff-canary': 'true', trace: '1' });
  assert.ok(getLegacyWorkbuddyIdeVscdbPath({ platform: 'darwin', homedir: '/home/test' }).endsWith('WorkBuddy/User/globalStorage/state.vscdb'));
  assert.deepStrictEqual(parseLegacyWorkbuddyIdeAuthSession('{"auth":{"accessToken":"a"},"account":{"uid":"u"}}').account, { uid: 'u' });
  fs.writeFileSync(path.join(root, 'legacy.vscdb'), 'fixture');
  const migrated = await createLegacyAuthSessionMigrator({
    resolvePath: () => path.join(root, 'legacy.vscdb'),
    readEncrypted: async () => Buffer.from('encrypted'),
    decryptString: async () => JSON.stringify({ auth: { accessToken: 'a' }, account: { uid: 'u' } }),
  }).migrate();
  assert.strictEqual(migrated.account.uid, 'u');
  const clientInfo = new ClientInfoProvider({
    productManager: { getCurrentConfiguration: () => ({ productName: 'Buddy', applicationName: 'WorkBuddy', productVersion: '2.0' }) },
    machineId: () => 'machine-1', env: { CODEBUDDY_CLIENT_IDE_TYPE: 'VSCode' }, runtimeVersion: () => '1.0',
  });
  assert.strictEqual((await clientInfo.get()).productName, 'Buddy');
  assert.strictEqual(clientInfo.clientInfo.machineId, 'machine-1');
  assert.deepStrictEqual(await createDevEndpointProvider({ resolve: () => 'https://dev.example' }).provide(), { endpoint: 'https://dev.example' });
  assert.deepStrictEqual(toSafeAssetSegments('../logo.png'), undefined);
  assert.strictEqual(resolveChannelBranding({ channels: { beta: { welcomeLogo: 'assets/logo.png' } } }, { env: { WORKBUDDY_USER_CHANNEL: 'beta' }, resolveAsset: () => '/tmp/logo.png' }).welcomeLogoUrl, 'local-file:///tmp/logo.png');
  assert.strictEqual(parseElectronProxyRules('DIRECT; PROXY proxy.example:8080'), 'http://proxy.example:8080/');
  assert.strictEqual(getProxyEnvFromProcess({ HTTP_PROXY: 'http://proxy', NO_PROXY: 'localhost' }).NODE_OPTIONS, '--use-system-ca');
  assert.strictEqual(updateSkillFrontmatterDisable('---\nname: demo\n---\nbody', true), '---\nname: demo\ndisable: true\n---\nbody');
  const projectManager = new ProjectResourceManager({
    configDir: root,
    loader: { installProjectSkills: async () => ({ skillDir: path.join(root, 'skills') }) },
    getToken: () => 'token-1', getUserId: () => 'user-1', getEndpoint: () => 'https://api.example/',
  });
  const projectEnv = await projectManager.registerSession('session-project', 'project-1', { mcpServers: [{ serverName: 'connector', gatewayUrl: 'https://mcp.example', connectorName: 'Demo' }] });
  assert.strictEqual(projectEnv.CODEBUDDY_SESSION_SKILL_DIRS, path.join(root, 'skills'));
  assert.strictEqual(projectManager.getMcpServersForSession('session-project').connector.headers.Authorization, 'Bearer token-1');
  assert.strictEqual(projectManager.getMcpServersForSession('session-project').connector.headers['x-project-id'], 'project-1');
  const traceContext = createEdgeSyncTurnTraceContext({ traceId: 'bad-trace', spanId: '1234567890abcdef' }, 'session-edge');
  assert.strictEqual(traceContext.traceId.length, 32);
  const traceStore = new EdgeSyncTurnTraceStore(); traceStore.bindMessages('session-edge', ['message-1'], traceContext);
  assert.strictEqual(traceStore.resolve('session-edge', ['message-1']).turnToken, traceContext.turnToken);
  let reconnects = 0;
  const recovery = new EdgeSyncNetworkRecovery({ canRecover: () => true, reconnect: async () => { reconnects += 1; }, isConnected: () => reconnects > 0, logger: { info() {}, warn() {} }, sleep: async () => {} });
  await recovery.recover('resume'); assert.strictEqual(reconnects, 1);
  const poi = new PoiQuestionRegistry(1000);
  const poiPending = poi.ask('session-poi', 'request-poi', {});
  assert.strictEqual(poi.answer('wrong-session', 'request-poi', { ok: true }), false);
  assert.strictEqual(poi.answer('session-poi', 'request-poi', { ok: true }), true);
  assert.deepStrictEqual(await poiPending, { ok: true });
  assert.strictEqual(POI_CONSENT_DEFAULT_TIMEOUT_MS, 60000);
  const consentRegistry = new PoiConsentRegistry();
  const restoredFirstConsent = consentRegistry.waitWithFirst('mcp-demo', 1000);
  const restoredSecondConsent = consentRegistry.waitWithFirst('mcp-demo', 1000);
  assert.strictEqual(restoredFirstConsent.isFirst, true);
  assert.strictEqual(restoredSecondConsent.isFirst, false);
  assert.strictEqual(consentRegistry.pendingCount, 1);
  assert.strictEqual(consentRegistry.hasPending('mcp-demo'), true);
  assert.strictEqual(consentRegistry.answer('mcp-demo', 'granted'), true);
  assert.strictEqual(await restoredFirstConsent.promise, 'granted');
  assert.strictEqual(await restoredSecondConsent.promise, 'granted');
  const deniedConsent = new PoiConsentRegistry().wait('mcp-timeout', 1);
  assert.strictEqual(await deniedConsent, 'denied');
  const cancelledRegistry = new PoiConsentRegistry();
  const cancelled = cancelledRegistry.wait('mcp-cancel', 1000);
  cancelledRegistry.cancelAll('shutdown');
  assert.strictEqual(await cancelled, 'denied');
  const consentRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-poi-consent-'));
  const consentStore = new PoiConsentStore(consentRoot);
  assert.strictEqual(CONSENT_FILE_NAME, 'poi-mcp-consent.json');
  assert.strictEqual(consentStore.get('mcp-demo'), undefined);
  consentStore.set('mcp-demo', 'denied');
  assert.strictEqual(fs.existsSync(path.join(consentRoot, CONSENT_FILE_NAME)), false);
  consentStore.set('mcp-demo', 'granted');
  assert.strictEqual(consentStore.get('mcp-demo'), 'granted');
  const reloadedStore = new PoiConsentStore(consentRoot);
  assert.strictEqual(reloadedStore.get('mcp-demo'), 'granted');
  fs.writeFileSync(path.join(consentRoot, CONSENT_FILE_NAME), '{broken');
  assert.strictEqual(new PoiConsentStore(consentRoot).get('mcp-demo'), undefined);
  const header = buildPoiHeader({ city: 'Nanjing' });
  assert.strictEqual(Object.keys(header)[0], POI_HEADER_NAME);
  assert.deepStrictEqual(JSON.parse(Buffer.from(header[POI_HEADER_NAME], 'base64').toString('utf8')), { city: 'Nanjing' });
  const sessionPoi = new SessionPoiCache();
  sessionPoi.set('session-1', { city: 'Nanjing' });
  assert.deepStrictEqual(sessionPoi.get('session-1'), { city: 'Nanjing' });
  assert.strictEqual(sessionPoi.size, 1);
  assert.strictEqual(sessionPoi.delete('session-1'), true);
  sessionPoi.clear();
  fs.rmSync(consentRoot, { recursive: true, force: true });
  const editorTracker = new TencentDocsAgentEditorTracker(); editorTracker.recordOpenedFile('s1', '/tmp/a.doc'); editorTracker.recordOpenedFile('s1', '/tmp/a.doc');
  assert.deepStrictEqual(editorTracker.takeAndClear('s1'), ['/tmp/a.doc']);
  assert.strictEqual(createIsSessionStillProcessing({ getSession: () => ({ status: 'working', isProcessing: false }) })('s1'), true);
  assert.strictEqual(isTencentOnlineFilePath('tdoc://file-1'), true);
  assert.strictEqual(extractTencentOnlineFileId('tdoc://file-1'), 'file-1');
  assert.strictEqual(computeLocalPreviewGlobalPadId('/tmp/a.doc').length, 32);
  assert.strictEqual(detectDocumentFileType('/tmp/a.xlsx'), 'spreadsheet');
  assert.strictEqual(normalizeLocalFilePathInput('file:///tmp/a%20b.doc'), '/tmp/a b.doc');
  assert.strictEqual(resolveDocArtifactSource('.xlsx'), 'excel');
  assert.deepStrictEqual(collectMentionedLocalOfficePaths('请查看 "/tmp/report.xlsx"'), ['/tmp/report.xlsx']);
  assert.deepStrictEqual(collectMentionedLocalOfficeFileNames('附件 report.xlsx 和 report.xlsx'), ['report.xlsx']);
  const localeStore = createMenuLocaleStore({ LANG: 'zh-Hans-CN' }); localeStore.set('en-US'); assert.strictEqual(localeStore.get(), 'en-US');
  const imaError = ImaApiError.fromResponse(429, { message: 'slow', traceId: 'trace-ima' });
  assert.strictEqual(imaError.errorCode, ImaErrorCode.RATE_LIMITED); assert.strictEqual(imaError.retriable(), true); assert.strictEqual(imaError.toJSON().traceId, 'trace-ima');
  const saveChoices = buildLocalDocumentSaveChoices({ labels: { cancelButton: 'Cancel', saveButton: 'Save', saveAsButton: 'Save As' }, canSaveOriginal: false, isDarwin: false });
  assert.deepStrictEqual(saveChoices.map((choice) => choice.action), ['saveAs', 'cancel']);
  assert.deepStrictEqual(getLocalDocumentDialogButtonIds({ choices: saveChoices, defaultAction: 'saveAs', cancelAction: 'cancel' }), { defaultId: 0, cancelId: 1 });
  assert.deepStrictEqual(buildLocalDocumentDirtyCloseChoices({ labels: { cancelButton: 'Cancel', saveButton: 'Save', saveAsButton: 'Save As', discardButton: 'Discard' }, canSaveOriginal: true, isDarwin: true }).map((choice) => choice.action), ['cancel', 'save', 'saveAs', 'discard']);
  const imaCipher = new ImaDataCipher();
  const encryptedIma = await imaCipher.encryptData('ima-secret');
  assert.strictEqual(encryptedIma.code, 0); assert.strictEqual(encryptedIma.data.x_ima_cm, CryptoMode.RSA);
  assert.deepStrictEqual(await imaCipher.decryptData(encryptedIma.data.data), { code: 0, msg: 'ok', data: 'ima-secret' });
  assert.strictEqual((imaCipher.setCryptoToken({ token: 'ctk', expire: Math.floor(Date.now() / 1000) + 60 })).code, 0);
  assert.strictEqual((await imaCipher.encryptData('token-secret')).data.x_ima_cm, CryptoMode.AESToken);
  assert.strictEqual(getDefaultPathPrefix('Docs'), '/console/agent-gateway/ima-docs');
  const imaRequests = [];
  const imaClient = new ImaBackendClient({ productManager: { getEndpoint: () => 'https://api.example/' }, authenticationManager: { buildAuthHeaders: () => ({ Authorization: 'Bearer test' }) }, fetchFn: async (url, init) => { imaRequests.push({ url, init }); return { ok: true, status: 200, headers: new Headers(), text: async () => JSON.stringify({ code: 0, data: { ok: true } }) }; } });
  assert.deepStrictEqual(await imaClient.post('/openapi/test', { value: 1 }), { ok: true });
  assert.strictEqual(imaRequests[0].url, 'https://api.example/console/agent-gateway/ima/openapi/test');
  const authApi = new ImaAuthApi({}, { productManager: { getEndpoint: () => 'https://api.example' }, authenticationManager: { currentSessionSubject: { getValue: () => ({ account: { uid: 'u1' }, auth: { accessToken: 'a1' } }) } }, connectorName: 'ima', fetchFn: async (url) => ({ ok: true, status: 200, json: async () => ({ code: 0, data: { status: 'connected', extra: { user_id: 'u1' } } }), text: async () => '' }) });
  assert.deepStrictEqual((await authApi.status()).userId, 'u1');
  assert.strictEqual(buildFilters({ mediaStates: [1], tags: ['important'] }).length, 2);
  assert.strictEqual(inferMimeByExt('DOCX'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.strictEqual(mapRawKnowledgeItem({ media_id: 'm1', file_size: '42' }).fileSize, 42);
  const authEvents = []; const authEmitter = new ImaAuthEventEmitter(); authEmitter.on((value) => authEvents.push(value)); authEmitter.emit(true); authEmitter.emit(true); authEmitter.emit(false); assert.deepStrictEqual(authEvents, [true, false]);
  assert.strictEqual(normalizeLocalPath('file:///tmp/a.txt'), '/tmp/a.txt'); assert.strictEqual(getMaxUploadSizeBytes('xlsx'), 10 * 1024 * 1024); assert.strictEqual(formatHumanSize(1024 * 1024), '1.0 MB');
  const uploadProgress = []; createUploadProgress((event) => uploadProgress.push(event))('cosPut', 110, { loaded: 1 }); assert.deepStrictEqual(uploadProgress[0], { stage: 'cosPut', percent: 100, loaded: 1 });
  const abortUpload = new AbortController(); abortUpload.abort(); assert.throws(() => throwIfUploadAborted(abortUpload.signal), /Upload cancelled/);
  const filesApi = new ImaFilesApi({ post: async (endpoint, body) => endpoint.includes('search_knowledge') ? { searched_knowledge_list: [], is_end: true } : endpoint.includes('preview') ? { results: { m1: { ret_code: 0, url: 'https://preview' } } } : { knowledge_list: [], current_path: [], is_end: true } }, { fetchFn: async () => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'text/plain' }), text: async () => 'content', arrayBuffer: async () => new TextEncoder().encode('blob').buffer }) });
  assert.strictEqual((await filesApi.getViewUrl('m1')).url, 'https://preview'); assert.strictEqual((await filesApi.getContent('https://content')).content, 'content');
  const kbApi = new ImaKnowledgeBaseApi({ post: async () => ({ results: [] }) }); assert.deepStrictEqual((await kbApi.list()).groups, []);
  const uploadEvents = []; const uploadService = new ImaUploadService({ createMedia: async () => ({ media_id: 'media-1', cos_credential: { key: 'cred' } }), addKnowledge: async () => ({}) }, { stat: async () => ({ size: 4 }), readFile: async () => Buffer.from('data'), uploadToCos: async (_cred, _buffer, _type, progress) => progress({ percent: 100, loaded: 4, total: 4 }) });
  assert.deepStrictEqual(await uploadService.uploadByPath({ filePath: '/tmp/a.txt', kbId: 'kb-1', onProgress: (event) => uploadEvents.push(event) }), { fileId: 'media-1', kbId: 'kb-1', folderId: null, name: 'a.txt', size: 4 }); assert.strictEqual(uploadEvents.at(-1).percent, 100);

  const policy = new CommandPolicy({ cwd: root, writableRoots: ['workspace'], deniedCommands: [/rm\s+-rf/] });
  assert.strictEqual(policy.check('echo ok', 'workspace/a.txt').allowed, true);
  assert.strictEqual(policy.check('rm -rf workspace', 'workspace/a.txt').allowed, false);
  assert.strictEqual(new PathPolicy({ roots: [root] }).allows(path.join(root, 'a')), true);
  assert.strictEqual(new PathPolicy({ roots: [root] }).allows('/tmp/outside'), false);
  const fsProtection = new FsProtectionPolicy({ configDir: path.join(root, 'config') });
  assert.strictEqual(fsProtection.inspect(path.join(root, 'config', 'workbuddy.db')).decision, 'WARN');
  assert.strictEqual(fsProtection.inspect(path.join(root, 'config', 'skills', 'old')).decision, 'ALLOW');
  assert.strictEqual(fsProtection.inspect(path.join(root, 'config'), { recursive: true }).decision, 'WARN');
  assert.strictEqual(fsProtection.inspect('/tmp/outside').decision, 'IGNORE');

  const events = [];
  const buffer = new EventBuffer({ sink: async (batch) => events.push(...batch) });
  buffer.push('agent.start', { session: 's1' });
  await buffer.flush();
  assert.strictEqual(events[0].event, 'agent.start');
  let now = 0;
  const sampler = new LogSampler({ windowMs: 1000, maxPerWindow: 1, now: () => now });
  const records = [];
  const logger = new StructuredLogger({ scope: 'test', sink: (record) => records.push(record), sampler });
  assert.strictEqual(logger.info('same'), true);
  assert.strictEqual(logger.info('same'), false);
  now = 1001;
  assert.strictEqual(logger.info('same'), true);
  assert.strictEqual(records[1].data.at(-1).suppressed, 1);
  assert.ok(logger.format(records[0]).includes('[test]'));
  const startupSpans = buildStartupSpans([
    { proc: 'main', id: 'E1', key: 'begin', phase: 'main', absEpoch: 100 },
    { proc: 'main', id: 'E8', key: 'interactive', phase: 'main', absEpoch: 125 },
  ], { startupType: 'cold', flowType: 'desktop', totalMs: 25, totalMarks: 2 }, 'galileo', 'trace-1');
  assert.strictEqual(startupSpans.length, 4);
  const metricCalls = [];
  exportStartupMetric({ getAppVersion: () => '1.0', recordDuration: (...args) => metricCalls.push(args) }, { startupType: 'cold', flowType: 'desktop', totalMs: 10, firstInteractiveMs: 8, phases: { main: 10 } });
  assert.strictEqual(metricCalls.length, 4);
  const perfLogger = new WorkbuddyPerfLogger(PerfFlow.STARTUP, { logDirectory: root, startupContext: { pid: 1, date: '2026-10-22', time: '120304', proc: 'main', timeOrigin: 0 } });
  perfLogger.startPhase('bootstrap');
  perfLogger.endPhase('bootstrap');
  perfLogger.flush();
  assert.strictEqual(perfLogger.getSummary().totalMarks, 2);
  assert.ok(fs.existsSync(perfLogger.getLogFilePath()));
  const today = DateRangeUtils.today();
  assert.strictEqual(DateRangeUtils.validate(today), true);
  assert.strictEqual(DateRangeUtils.toFilename({ start: '2026-01-01', end: '2026-01-02' }), '2026-01-01+2026-01-02');
  const ids = new DeterministicIdGenerator();
  ids.setNextTraceId('trace-fixed');
  assert.strictEqual(ids.generateTraceId(), 'trace-fixed');
  assert.strictEqual(ids.generateTraceId().length, 32);
  assert.deepStrictEqual(parseKeyValueList('a=1,b=hello%20world,invalid'), { a: '1', b: 'hello world' });
  const otel = readOtelTraceEnv({ CODEBUDDY_CODE_ENABLE_TELEMETRY: 'true', OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otel.test/', OTEL_EXPORTER_OTLP_HEADERS: 'authorization=Bearer%20x', OTEL_TRACES_EXPORTER: 'bad', OTEL_LOG_TOOL_CONTENT: '1' });
  assert.strictEqual(otel.enabledByEnv, true);
  assert.strictEqual(otel.endpoint, 'https://otel.test/v1/traces');
  assert.strictEqual(otel.headers.authorization, 'Bearer x');
  assert.strictEqual(otel.logToolContent, true);
  assert.strictEqual(otel.warnings.length, 1);
  const view = new AgentViewModel('s1');
  view.apply({ type: 'assistant', content: 'hello' });
  view.apply({ type: 'tool_start', toolUseId: 't1', name: 'read' });
  view.apply({ type: 'tool_result', toolUseId: 't1', content: 'ok' });
  assert.strictEqual(view.snapshot().pendingTools.length, 0);
  const todos = new TodoProjection('s1', () => 123);
  todos.report([{ id: '1', content: 'Draft', status: 'in_progress' }]);
  assert.strictEqual(todos.snapshot().derivedPlanStatus, 'ready');
  todos.setTalking(true);
  assert.strictEqual(todos.snapshot().derivedPlanStatus, 'building');
  todos.report([{ id: '1', content: 'Draft', status: 'completed' }]);
  assert.strictEqual(todos.snapshot().derivedPlanStatus, 'finished');
  assert.deepStrictEqual(todos.snapshot().taskDataList, []);
  const team = createEmptyTeamRuntimeSnapshot('s1', () => 123);
  team.isInTeam = true;
  team.memberHistories.researcher = [];
  assert.strictEqual(hasUnsettledTeamRuntime(team), true);
  assert.deepStrictEqual(parseTeammateMessage('<teammate-message teammate_id="researcher" summary="Done">ok</teammate-message>'), { teammateId: 'researcher', summary: 'Done', content: 'ok' });
  assert.strictEqual(formatTeammateContent('{"type":"shutdown_response","approve":true}'), 'Shutdown accepted');
  assert.strictEqual(normalizePendingOpenUrlPayload({ url: 'workbuddy://home' }), 'workbuddy://home');
  const classified = classifyDesktopOpenUrl('workbuddy://task?action=start&prompt=hello', {
    isTaskDeepLink: () => true,
  });
  assert.strictEqual(classified.type, 'task');
  const deepLinkEvents = [];
  const handleOpenUrl = createDesktopOpenUrlHandler({ isKnownDeepLinkHost: () => false, mapRoute: () => '/callback', onRoute: (event) => deepLinkEvents.push(event.route) });
  assert.strictEqual(handleOpenUrl('workbuddy://callback').type, 'route');
  assert.deepStrictEqual(deepLinkEvents, ['/callback']);
  let handledUrls = [];
  assert.strictEqual(await consumePendingDesktopOpenUrls(async () => [{ url: 'workbuddy://home' }, 'workbuddy://chat', { bad: true }], (url) => handledUrls.push(url)), 2);
  assert.deepStrictEqual(handledUrls, ['workbuddy://home', 'workbuddy://chat']);
  assert.strictEqual(new WindowState().show().visible, true);
  assert.strictEqual(resolveAppConfig(root, { WORKBUDDY_CONFIG_DIR: '/tmp/config' }).config, '/tmp/config');
  assert.strictEqual(deriveDisplayStatus('working', {}), 'working');
  assert.strictEqual(deriveDisplayStatus('pending', { messageQueueRuntime: { pendingItemCount: 1 } }), 'working');
  assert.strictEqual(deriveRunState('completed', { messageQueueRuntime: { pendingItemCount: 1 } }), 'idle');
  assert.strictEqual(deriveRunState('working', {}), 'busy');
  assert.deepStrictEqual(withDisplayStatus({ protocolStatus: 'working', status: 'pending' }), { protocolStatus: 'working', status: 'working' });
  const resource = buildRendererResourceAttributes({ isDev: true, appVersion: '2.0', userId: 'u1', random: () => 0.5, now: () => 123, os: 'macOS' });
  assert.deepStrictEqual({ env: resource.env_name, version: resource['service.version'], uid: resource.uid }, { env: 'development', version: '2.0', uid: 'u1' });
  assert.strictEqual(normalizeTheme('unknown'), 'light'); assert.strictEqual(normalizeLanguage('zh-Hans-CN'), 'zh-CN');
  const queueStore = new QueueSnapshotStore(() => 123);
  queueStore.upsert({ sessionId: 's1', items: [{ status: 'pending' }, { status: 'sending' }], runtime: { activated: true } });
  assert.deepStrictEqual(queueStore.get('s1').runtime, { activated: true, paused: false, pauseReason: undefined, inflightItemId: undefined, pendingItemCount: 1, sendingItemCount: 1, updatedAt: 123 });
  assert.strictEqual(cloneSerializable({ a: 1 }).a, 1);
  assert.strictEqual(assertRecord({ ok: true }).ok, true);
  const cancellation = new CancellationTokenSource();
  const cancelledPromise = raceCancellationError(new Promise((resolve) => setTimeout(resolve, 50)), cancellation.token);
  cancellation.cancel();
  await assert.rejects(cancelledPromise, /Cancelled/);
  let attempts = 0;
  assert.strictEqual(await retry(async () => { attempts += 1; if (attempts < 2) throw new Error('retry'); return 'ok'; }, 1, 3), 'ok');
  const contextManager = new ContextVariableManager({ resolvers: [
    { name: 'user', priority: async () => ContextVariablePriority.Fallback, resolve: async () => ({ name: 'user', value: 'fallback' }) },
  ], collectionResolvers: [
    { name: 'user', priority: async () => ContextVariablePriority.High, resolve: async () => ({ name: 'user', value: 'high' }) },
    { name: 'broken', priority: async () => { throw new Error('priority'); }, resolve: async () => ({ name: 'broken', value: 'bad' }) },
  ] });
  assert.strictEqual((await contextManager.getContextVariable({ name: 'user' })).value, 'high');
  assert.deepStrictEqual(await contextManager.getContextVariablesMap([{ name: 'user' }]), { user: 'high' });
  assert.strictEqual(ContextVariableNames.UserInputPrompt, 'userInputPrompt');
  assert.strictEqual(ContextVariablePriority.Normal, 5);
  const deferred = new DeferredPromise();
  deferred.complete('done');
  assert.strictEqual(await deferred.promise, 'done');
  const emitter = new Emitter();
  const emitted = [];
  const subscription = emitter.event((value) => emitted.push(value));
  emitter.fire('one');
  subscription.dispose();
  emitter.fire('two');
  assert.deepStrictEqual(emitted, ['one']);
  const mapped = [];
  const mappedEmitter = new Emitter();
  Event.map(mappedEmitter.event, (value) => value * 2)((value) => mapped.push(value));
  mappedEmitter.fire(3);
  assert.deepStrictEqual(mapped, [6]);
  const asyncEmitter = new AsyncEmitter();
  const asyncEvents = [];
  asyncEmitter.event((event) => { asyncEvents.push(event.value); event.waitUntil(Promise.resolve()); });
  await asyncEmitter.fire({ value: 'async' });
  assert.deepStrictEqual(asyncEvents, ['async']);
  const collection = new DisposableCollection();
  let disposed = 0;
  collection.push(Disposable.create(() => { disposed += 1; }));
  collection.dispose();
  assert.strictEqual(disposed, 1);
  const deferredValue = new Deferred();
  deferredValue.resolve('value');
  assert.strictEqual(await deferredValue.promise, 'value');
  assert.strictEqual(CUSTOM_LOCAL_MODEL_PREFIX, 'custom-local:');
  assert.strictEqual(stripCustomLocalModelPrefix('custom-local:model-x'), 'model-x');
  assert.strictEqual(isModelVariantType('reasoning'), true);
  assert.strictEqual(isModelVariantType('unknown'), false);

  const serverEvents = [];
  const sessions = new SessionStore({ clock: (() => { let now = 100; return () => ++now; })() });
  sessions.on('task.updated', (task) => serverEvents.push(task.status));
  sessions.createSession({ id: 'session-1', projectId: 'project-1' });
  sessions.createTask({ id: 'task-1', sessionId: 'session-1' });
  sessions.updateTask('task-1', { status: 'completed', result: { ok: true } });
  assert.deepStrictEqual(serverEvents, ['completed']);
  assert.throws(() => sessions.updateTask('task-1', { status: 'pending' }), /terminal/);

  const scheduler = new AutomationScheduler({ createTask: (input) => ({ id: 'automation-task', ...input }) });
  scheduler.register({ id: 'daily-report', run: async ({ input, task }) => ({ input, taskId: task.id }) });
  const automation = await scheduler.trigger('daily-report', { date: 'today' });
  assert.deepStrictEqual(automation.result, { input: { date: 'today' }, taskId: 'automation-task' });
  scheduler.close();

  const mcp = new McpRegistry();
  mcp.register({
    name: 'demo',
    listTools: async () => [{ name: 'echo', inputSchema: {} }],
    callTool: async (name, args) => ({ name, args }),
  });
  assert.deepStrictEqual(await mcp.listTools(), [{ name: 'echo', inputSchema: {}, server: 'demo' }]);
  assert.deepStrictEqual(await mcp.call('demo', 'echo', { value: 1 }), { name: 'echo', args: { value: 1 } });

  const artifacts = new ArtifactIndex();
  artifacts.put({ id: 'artifact-1', sessionId: 'session-1', path: '/tmp/report.md', kind: 'text' });
  assert.strictEqual(artifacts.list('session-1').length, 1);
  assert.strictEqual(artifacts.remove('artifact-1'), true);
  assert.strictEqual(artifacts.get('artifact-1'), undefined);

  configureWorkbuddyRuntimeContext({ configDir: root, appName: 'TestBuddy' });
  assert.strictEqual(getWorkbuddyRuntimeConfigDir(), root);
  assert.strictEqual(getWorkbuddyRuntimeLogsDir('agent'), path.join(root, 'logs', 'agent'));
  const mainStartup = initMainStartupContext();
  assert.strictEqual(mainStartup.proc, 'main');
  assert.strictEqual(buildStartupContextEnv().WORKBUDDY_STARTUP_PID, String(process.pid));
  const childStartup = initStartupContextFromEnv('daemon', {
    WORKBUDDY_STARTUP_PID: '1234', WORKBUDDY_STARTUP_DATE: '2026-10-22', WORKBUDDY_STARTUP_TIME: '120304',
  });
  assert.deepStrictEqual(childStartup, {
    pid: 1234, date: '2026-10-22', time: '120304', proc: 'daemon', timeOrigin: childStartup.timeOrigin,
  });
  const childEnv = buildCliProcessEnv({ ...CLI_STATIC_MANAGED_ENV, CUSTOM_MANAGED: 'yes' }, {
    PATH: '/bin', NODE_OPTIONS: '--inspect', CODEBUDDY_TEST: 'leak', HTTP_PROXY: 'http://proxy',
  });
  assert.strictEqual(childEnv.PATH, '/bin');
  assert.strictEqual(childEnv.NODE_OPTIONS, undefined);
  assert.strictEqual(childEnv.CODEBUDDY_TEST, undefined);
  assert.strictEqual(childEnv.CUSTOM_MANAGED, 'yes');
  assert.strictEqual(childEnv.SERVER__PORT, '0');
  const memoryStorage = new MemoryLocalStorage();
  const storageChanges = [];
  const disposeStorageListener = memoryStorage.changeEvent((event) => storageChanges.push(event.domain));
  await memoryStorage.set('theme', 'dark');
  assert.strictEqual(await memoryStorage.get('theme'), 'dark');
  await memoryStorage.remove('theme');
  disposeStorageListener();
  assert.deepStrictEqual(storageChanges, ['theme', 'theme']);
  assert.deepStrictEqual(new DefaultWorkspace(['/tmp/project']).workspaceFolders, ['/tmp/project']);
  const notifier = new DefaultNotifier();
  assert.strictEqual(notifier.formatMessage('Hello {0} {1}', ['WorkBuddy', 2]), 'Hello WorkBuddy 2');
  assert.strictEqual(await new DefaultUserinfoProvider().provide(), undefined);
  const opener = new DefaultExternalUriOpener();
  let openedUri;
  opener.urlSubject.subscribe((uri) => { openedUri = uri; });
  opener.urlSubject.next('https://example.test');
  assert.strictEqual(openedUri, 'https://example.test');
  assert.strictEqual(await opener.open('https://example.test'), false);
  assert.strictEqual(await new DefaultPagePreviewer().preview('https://example.test'), true);

  const expertManifest = mergeExpertManifests(
    { version: '1', categories: [{ id: 'writing', name: 'Writing' }], experts: [{ id: 'editor', name: 'Editor' }] },
    [{ version: '2', categories: [{ id: 'writing', name: 'Content' }], experts: [{ id: 'editor', name: 'Senior Editor' }, { id: 'analyst' }] }],
  );
  assert.strictEqual(expertManifest.version, '2');
  assert.deepStrictEqual(expertManifest.statistics, { totalExperts: 2, totalCategories: 1 });
  assert.strictEqual(expertManifest.experts[0].name, 'Senior Editor');
  assert.deepStrictEqual(readExpertMcpDeclaration(
    { dependencies: { mcpServers: ['search.json', 'docs.json'] } },
    { 'search.json': { mcpServers: { search: { url: 'https://search' } } }, 'docs.json': { docs: { command: 'docs' } } },
  ), { search: { url: 'https://search' }, docs: { command: 'docs' } });

  const connectors = connectorEntries({ connectors: [
    { source: 'search', name: 'Search', type: 'mcp', auth_mode: 'oauth' },
    { source: 'writer', name: 'Writer', type: 'skill-only' },
  ] }, { bySource: {
    search: { mcpServers: { search: { url: 'https://example.test/mcp' } }, skills: ['search-skill'] },
    writer: { skills: ['writer-skill'] },
  } });
  assert.strictEqual(connectors[0].url, 'https://example.test/mcp');
  assert.strictEqual(connectors[0].authMode, 'oauth');
  assert.deepStrictEqual(connectors[1].skills, ['writer-skill']);
  assert.strictEqual(buildConnectorConfig({}, {}), undefined);
  assert.deepStrictEqual(checkCompatibility({ currentVersion: '4.29.0', minWorkbuddyVersion: '4.30.0' }), { kind: 'needsUpgrade', requiredMinVersion: '4.30.0' });
  assert.deepStrictEqual(checkCompatibility({ currentVersion: '4.31.0', maxWorkbuddyVersion: '4.30.0' }), { kind: 'connectorRetired' });
  assert.strictEqual(checkCompatibility({ currentVersion: '4.30.0-beta.1', minWorkbuddyVersion: '4.30.0' }).kind, 'needsUpgrade');
  assert.strictEqual(checkCompatibility({ currentVersion: 'invalid', minWorkbuddyVersion: '4.30.0' }), null);
  assert.strictEqual(DEFAULT_NPM_REGISTRIES.length, 3);
  assert.ok(CLI_CONNECTOR_PACKAGES_DIR.endsWith(path.join('binaries', 'node', 'cli-connector-packages')));
  const progressEvents = [];
  let progressNow = 0;
  const progress = createRuntimeProgressNotifier('op-1', 'node', '*', { now: () => progressNow, send: (channel, payload) => progressEvents.push([channel, payload]) });
  progress.onProgress({ progress: 10 });
  progress.onProgress({ progress: 11 });
  progressNow = 600;
  progress.onProgress({ progress: 11 });
  progress.complete();
  assert.strictEqual(progressEvents[0][0], IPC_CHANNEL);
  assert.strictEqual(progressEvents[0][1].progress, 10);
  assert.strictEqual(progressEvents.at(-1)[1].status, 'complete');
  assert.deepStrictEqual(classifyBinaryError(new Error('boom')), { code: 'generic', message: 'boom' });
  const runtimeEnv = { PATH: '/usr/bin', HTTPS_PROXY: 'http://proxy', NODE_OPTIONS: '--inspect=9229', NODE_DEBUG: '1' };
  stripDebugNodeOptions(runtimeEnv);
  assert.strictEqual(runtimeEnv.NODE_OPTIONS, undefined);
  assert.strictEqual(runtimeEnv.NODE_DEBUG, undefined);
  applyNodeRuntimeEnv(runtimeEnv, { nodeInfo: { version: '20.12.0' }, nodeBinDir: '/node/bin', npmGlobalBin: '/npm/bin', registry: DEFAULT_NPM_REGISTRIES[0] });
  assert.ok(runtimeEnv.PATH.startsWith(path.join(CLI_CONNECTOR_PACKAGES_DIR, 'bin')));
  assert.strictEqual(runtimeEnv.npm_config_registry, DEFAULT_NPM_REGISTRIES[0]);
  assert.ok(runtimeEnv.NODE_OPTIONS.includes('--use-system-ca'));
  const prepared = await prepareNodeRuntimeEnv({ isInstallingType: () => false, ensure: async () => ({ type: 'node', version: '22.1.0', source: 'managed', executablePath: '/tmp/node/bin/node' }) }, { versionRange: '>=20' }, { info() {} }, { silent: true });
  assert.strictEqual(prepared.nodeInfo.source, 'managed');
  assert.deepStrictEqual(parseNpxPackageSpec(['--yes', '@scope/server@1.2.3', '--flag']), { packageSpec: '@scope/server@1.2.3', packageName: '@scope/server', serverArgs: ['--flag'] });
  assert.strictEqual(parseNpxPackageSpec(['--yes']), undefined);
  assert.ok(getManagedNpmCliPath({ nodeInfo: { executablePath: '/tmp/node/bin/node' } }).endsWith(path.join('node_modules', 'npm', 'bin', 'npm-cli.js')));
  assert.strictEqual(getStableNpxPackageDir('demo@1').length, path.join(CLI_CONNECTOR_PACKAGES_DIR, 'mcp-npx-packages').length + 13);
  assert.strictEqual(classifyMcpInvokeErrorKind(new Error('server is reconnecting')), 'reconnecting');
  assert.strictEqual(classifyMcpInvokeErrorKind(new Error('timeout waiting')), 'timeout');
  assert.strictEqual(classifyMcpListErrorKind(new Error('Method not found (-32601)')), 'method_not_found');
  assert.strictEqual(classifyMcpListErrorKind(new Error('HTTP 401 unauthorized')), 'auth');
  const metricEvents = [];
  setConnectorMetricReporter({ recordDuration: (...event) => metricEvents.push(['duration', ...event]), addCounter: (...event) => metricEvents.push(['counter', ...event]) });
  const metric = new ConnectorMetricReporter();
  metric.invoke({ dims: { mcpServer: 'docs', toolName: 'search' }, durationMs: 12, result: { isError: true } });
  metric.connect({ serverShortName: 'docs', silent: false, outcome: 'success', durationMs: 12.4 });
  metric.list({ serverShortName: 'docs', kind: 'tool', outcome: 'error', durationMs: 5, errorKind: 'timeout' });
  assert.strictEqual(metricEvents[0][1], 'wb.connector.invoke.biz_error');
  assert.strictEqual(metricEvents[1][1], 'wb.connector.main.connect.success');
  assert.deepStrictEqual(metricEvents[1][3], { mcp_server: 'docs', silent: 'false', duration_ms: '12' });
  assert.strictEqual(metricEvents[2][1], 'wb.connector.list.tool.error');
  setConnectorMetricReporter(undefined);
  const headerMap = new Map([['Authorization', 'Bearer token']]);
  assert.deepStrictEqual(toHeaderRecord(headerMap), { Authorization: 'Bearer token' });
  assert.deepStrictEqual(toHeaderRecord([['X-Test', 3]]), { 'X-Test': '3' });
  const transport = { _requestInit: { headers: { Existing: 'yes' } } };
  const transportClient = { _transport: transport };
  const headerResult = await withExtraHeaders(transportClient, { Added: 'ok' }, async () => {
    assert.deepStrictEqual(transport._requestInit.headers, { Existing: 'yes', Added: 'ok' });
    return 'done';
  });
  assert.strictEqual(headerResult, 'done');
  assert.deepStrictEqual(transport._requestInit, { headers: { Existing: 'yes' } });
  const ioaCalls = [];
  const ioa = new IoaServerSideAuth({
    getEnterpriseId: () => 'enterprise-1',
    isIOAEnterprise: (id) => id === 'enterprise-1',
    callApi: async (method, requestPath) => {
      ioaCalls.push([method, requestPath]);
      if (requestPath.endsWith('/accesstoken')) return { code: 0, data: { access_token: 'ioa-token' } };
      return { code: 0 };
    },
  });
  const ioaConfig = { url: 'https://docs.mcp.woa.com/server', headers: { 'X-Existing': '1' } };
  const ioaRule = ioa.resolveHostRule(ioaConfig);
  assert.ok(ioaRule.oauthName.startsWith(IOA_OAUTH_NAME_PREFIX));
  assert.strictEqual(ioa.resolveOauthNameByUrl(ioaConfig.url), ioaRule.oauthName);
  assert.strictEqual(ioa.resolveHostRule({ url: 'https://example.com/mcp' }), undefined);
  const ioaToken = await ioa.resolveToken(ioaConfig, { interactive: false });
  assert.strictEqual(ioaToken.success, true);
  assert.strictEqual(ioaToken.accessToken, 'ioa-token');
  const decoratedIoa = ioa.decorateConfig(ioaConfig, ioaRule, ioaToken.accessToken);
  assert.strictEqual(decoratedIoa.headers.Authorization, 'Bearer ioa-token');
  assert.strictEqual(decoratedIoa._workbuddyManagedAuth, 'server-side');
  assert.strictEqual(ioaCalls[0][0], 'GET');
  let oauthListener;
  const adapter = new ConnectorUiAdapter({
    autoRegister: false,
    connectorService: {
      connect: async () => ({ success: false, error: 'auth' }),
      getStates: async () => ({ docs: { status: 'unauthorized', needsAuth: true } }),
      cancelConnect: async () => ({ success: true }),
    },
    mcpProxy: { onOAuthCompleted: (listener) => { oauthListener = listener; } },
    toProxyConfigId: (id) => `connector:${id}`,
    toRawConfigId: (id) => id.replace(/^connector:/, ''),
  });
  adapter.registerOAuthListener();
  assert.deepStrictEqual(await adapter.connect('docs', { userInitiated: true }), { success: true });
  assert.strictEqual(adapter.pendingOAuth.has('connector:docs'), true);
  assert.strictEqual((await adapter.getStates()).docs.status, 'connecting');
  await adapter.cancelConnect('docs');
  assert.strictEqual(adapter.pendingOAuth.size, 0);
  assert.strictEqual(typeof oauthListener, 'function');
  const historyCache = new ExpertHistoryCache();
  historyCache.initFromData({ version: 1, sessions: { [SHARED_HISTORY_KEY]: [{ id: 'old', name: 'Old', summonedAt: 1 }] }, lastUpdated: 1 });
  historyCache.addExpert('session-1', { id: 'new', name: 'New' }, 2);
  assert.deepStrictEqual(historyCache.getRecentExperts('session-1').map((item) => item.id), ['new', 'old']);
  assert.strictEqual(historyCache.removeExpert('session-1', 'new'), true);
  assert.strictEqual(historyCache.clearHistory('session-1'), true);
  const historyPath = path.join(root, 'expert-history.json');
  const historyStorage = new ExpertHistoryStorage(historyPath, { writeDebounceMs: 1 });
  const historyData = { version: 1, sessions: { [SHARED_HISTORY_KEY]: [{ id: 'demo' }] }, lastUpdated: Date.now() };
  historyStorage.saveAsync(historyData); await historyStorage.flush();
  assert.deepStrictEqual((await historyStorage.load()).sessions[SHARED_HISTORY_KEY][0].id, 'demo');
  assert.strictEqual(historyStorage.isValidData({}), false);
  await historyStorage.dispose();
  const resourceCalls = [];
  let promptAttempts = 0;
  const resourceLoader = new ExpertCenterResourceLoader({
    baseUrl: 'https://experts.example/',
    manifestPath: '/expert.json',
    download: { timeout: 1000, maxRetries: 1, retryDelay: 0, batchConcurrency: 2 },
    fetchFn: async (url) => {
      resourceCalls.push(url);
      if (url.endsWith('/expert.json')) return { ok: true, status: 200, json: async () => ({ version: '1', experts: [{ id: 'base' }], categories: [] }) };
      if (url.endsWith('/internalExpert.json')) return { ok: true, status: 200, json: async () => ({ version: '2', experts: [{ id: 'internal' }], categories: [] }) };
      if (url.endsWith('/externalExpert.json')) return { ok: false, status: 404, json: async () => ({}) };
      if (url.endsWith('/retry.md') && promptAttempts++ === 0) throw new Error('temporary');
      return { ok: true, status: 200, text: async () => `prompt:${url}` };
    },
  });
  const loadedManifest = await resourceLoader.fetchManifest();
  assert.deepStrictEqual(loadedManifest.experts.map((item) => item.id), ['base', 'internal']);
  assert.strictEqual(await resourceLoader.fetchPromptWithRetry('/retry.md'), 'prompt:https://experts.example/retry.md');
  const batchProgress = [];
  const promptResults = await resourceLoader.fetchPromptsBatch([{ expertId: 'a', locale: 'zh', path: '/a.md' }, { expertId: 'b', locale: 'en', path: '/b.md' }], (...args) => batchProgress.push(args));
  assert.strictEqual(promptResults.get('a_zh').content.includes('/a.md'), true);
  assert.deepStrictEqual(batchProgress.at(-1), [2, 2, 0]);
  assert.ok(resourceCalls.includes('https://experts.example/internalExpert.json'));
  const serviceCache = new ExpertHistoryCache();
  const serviceWrites = [];
  const historyService = new ExpertHistoryService({
    cache: serviceCache,
    storage: { load: async () => ({ version: 1, sessions: { one: [{ id: 'old', summonedAt: 1 }], two: [{ id: 'new', summonedAt: 2 }] }, lastUpdated: 1 }), saveAsync: (data) => serviceWrites.push(data), flush: async () => {} },
    maxExpertsPerSession: 5,
  });
  assert.strictEqual(historyService.migrateToSharedHistory({ version: 1, sessions: { one: [{ id: 'old' }], two: [{ id: 'new' }] }, lastUpdated: 1 }).data.sessions[SHARED_HISTORY_KEY].length, 2);
  await historyService.ensureInitialized();
  assert.deepStrictEqual((await historyService.getRecentExperts('session-x')).map((item) => item.id), ['new', 'old']);
  await historyService.addExpert('session-x', { id: 'latest', name: 'Latest' });
  assert.strictEqual(serviceWrites.length > 0, true);
  assert.strictEqual(ALLOWED_LOOPBACK_HOSTS.has('127.0.0.1'), true);
  assert.strictEqual(matchesUriTemplate('starrocks://tables/foo', 'starrocks://tables/{name}'), true);
  assert.strictEqual(matchesUriTemplate('starrocks://tables/foo?limit=1', 'starrocks://tables/{name}{?limit}'), true);
  assert.strictEqual(matchesUriTemplate('starrocks://tables/foo/bar', 'starrocks://tables/{name}'), false);
  assert.strictEqual(formatProxyServerLog('event', { ok: true }), 'event {"ok":true}');
  assert.strictEqual(readHeader({ headers: { 'x-test': ['a', 'b'] } }, 'X-Test'), 'a');
  const sanitized = sanitizeProxyServerLogValue({ a: { b: { c: { d: 'hidden' } } }, list: Array.from({ length: 12 }, (_, i) => i) });
  assert.strictEqual(sanitized.a.b.c, '[truncated]');
  assert.strictEqual(sanitized.list.length, 10);
  const proxyError = serializeProxyServerErrorForLog(Object.assign(new Error('bad: detail'), { code: 'E_BAD', data: { token: 'redacted' } }));
  assert.deepStrictEqual({ name: proxyError.name, message: proxyError.message, code: proxyError.code }, { name: 'Error', message: 'bad: detail', code: 'E_BAD' });
  assert.deepStrictEqual(summarizeProxyCallArgsForLog({ a: { b: 1 } }), { a: { b: 1 } });
  const proxyContext = buildConnectorMcpCallContext(() => ({ workbuddySessionId: 's1', projectId: 'p1' }), { 'workbuddy.ai/requestId': 'r1', 'workbuddy.ai/triggerSource': 'skill', modelId: 'm1' });
  assert.deepStrictEqual(proxyContext, { workbuddySessionId: 's1', projectId: 'p1', conversationId: undefined, requestId: 'r1', messageId: undefined, toolCallId: undefined, agentMode: undefined, expertId: undefined, triggerSource: 'skill', modelId: 'm1' });
  assert.strictEqual(classifyToolStatus(new Error('operation aborted')), 'cancelled');
  assert.strictEqual(extractErrorCode(new Error('E_CONN: details')), 'E_CONN');
  assert.strictEqual(inferConnectorKind({ type: 'cli' }), 'oauthCli');
  assert.strictEqual(extractHostname('[::1]:18484'), '::1');
  assert.strictEqual(isAllowedLoopbackHost('localhost:1234'), true);
  assert.strictEqual(isAllowedLoopbackHost('attacker.example:1234'), false);
  assert.deepStrictEqual(validateOrigin('http://127.0.0.1:3000'), { allowed: true });
  assert.deepStrictEqual(validateOrigin('https://attacker.example'), { allowed: false, reason: 'invalid origin' });
  assert.deepStrictEqual(validateOrigin('not-a-url'), { allowed: false, reason: 'malformed origin' });
  assert.strictEqual(isValidProxyBearer('Bearer secret', 'secret'), true);
  assert.strictEqual(isValidProxyBearer('Bearer wrong', 'secret'), false);
  const businessError = Object.assign(new Error('Error POSTing to endpoint: {"code":40001}'), { code: 400 });
  assert.strictEqual(isHttpBusinessError(businessError), true);
  assert.deepStrictEqual(buildBusinessErrorResult(businessError), { content: [{ type: 'text', text: '{"code":40001}' }], isError: true });
  const networkError = Object.assign(new Error('fetch failed'), { code: 'ECONNRESET', cause: Object.assign(new Error('socket'), { code: 'UND_ERR_SOCKET' }) });
  assert.strictEqual(isTransportErrorByCode(networkError), true);
  assert.strictEqual(formatUndiciFetchErrorForLog(networkError).includes('cause[0]'), true);
  assert.strictEqual(isReconnectRipple(Object.assign(new Error('Connection closed'), { code: -32000 })), true);
  assert.strictEqual(isMcpSessionLost(Object.assign(new Error('not found'), { code: 404 }), 'session-1'), true);
  assert.strictEqual(buildRippleFailureMessage('connector:docs', { reason: 'entry-lost' }), 'Connector "connector:docs" was removed during call.');
  assert.strictEqual(inferTransportCloseKind(new Error('SSE stream disconnected: terminated')), 'sse-body-terminated');
  assert.strictEqual(shouldDedupeArdotCreateDesignCall('custom-mcp:ardot', 'ardot_create_design', 'create_design'), true);
  assert.deepStrictEqual(buildConnectorCallToolRequest('custom-mcp:ardot', 'create_design', { z: 1 }, { workbuddySessionId: 's1' }), { name: 'create_design', arguments: { z: 1 }, _meta: { 'workbuddy.ai/sessionId': 's1' } });
  assert.strictEqual(stableStringifyConnectorToolArgs({ b: 2, a: 1 }), '{"a":1,"b":2}');
  assert.strictEqual(buildArdotCreateDesignDedupeKey('custom-mcp:ardot', 'create_design', { b: 2, a: 1 }).endsWith('{"a":1,"b":2}'), true);
  assert.strictEqual(parseTimeoutMs(30), 30000);
  assert.strictEqual(parseTimeoutMs(5000), 5000);
  assert.strictEqual(isStdioServerConfig({ command: 'node' }), true);
  assert.strictEqual(getConnectTimeout({ timeout: 30 }), 120000);
  assert.strictEqual(getConnectTimeout({ url: 'https://mcp', timeout: 30 }), 60000);
  assert.strictEqual(isManagedAuthConfig({ _workbuddyManagedAuth: 'server-side' }), true);
  assert.ok(sanitizeRuntimeDirName('connector:中文').includes('-'));
  assert.strictEqual(getWorkbuddyConfigDir({ WORKBUDDY_CONFIG_DIR: ' /tmp/wb ' }, '/home'), '/tmp/wb');
  const cwdRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-mcp-cwd-'));
  assert.strictEqual(ensureDirectory(path.join(cwdRoot, 'nested'), 'demo').endsWith(path.join('nested')), true);
  assert.throws(() => { const file = path.join(cwdRoot, 'file'); fs.writeFileSync(file, 'x'); ensureDirectory(file, 'demo'); }, /not a directory/);
  assert.ok(resolveStdioCwd('connector:demo', {}, { configDir: cwdRoot }).startsWith(path.join(cwdRoot, 'logs')));
  assert.deepStrictEqual(resolveTransportOrder({ type: 'sse' }), { order: 'sse-first', source: 'type' });
  assert.deepStrictEqual(resolveTransportOrder({ transportType: 'sse' }), { order: 'sse-first', source: 'transportType' });
  assert.strictEqual(shouldSkipFallback(new Error('HTTP 401 unauthorized')), true);
  assert.strictEqual(captureResourceMetadataUrl({ _resourceMetadataUrl: new URL('https://mcp/.well-known') }), 'https://mcp/.well-known');
  assert.strictEqual(resolveServiceProxyUrl('http://127.0.0.1:123/'), 'http://127.0.0.1:123/internal/hooks/services/invoke');
  fs.rmSync(cwdRoot, { recursive: true, force: true });
  const oauthBase = normalizeOAuthBaseUrl('workbuddy://workbuddy/mcp/');
  assert.strictEqual(oauthBase, 'workbuddy://workbuddy/mcp');
  assert.strictEqual(isOAuthCallbackUrl('workbuddy://workbuddy/mcp/connector%3Adocs/oauth/callback?code=x', oauthBase), true);
  assert.strictEqual(extractConfigIdFromCallbackUrl('workbuddy://workbuddy/mcp/connector%3Adocs/oauth/callback'), 'connector:docs');
  const oauthStates = new Map([['state-1', 'connector:docs']]);
  assert.deepStrictEqual(parseOAuthCallbackUrl('http://127.0.0.1/oauth/callback?error=access_denied&state=state-1&error_description=Nope', oauthStates), { success: false, configId: 'connector:docs', error: 'access_denied: Nope' });
  assert.strictEqual(oauthStates.has('state-1'), false);
  assert.deepStrictEqual(parseOAuthCallbackUrl('workbuddy://workbuddy/mcp/connector%3Adocs/oauth/callback?code=abc&state=s'), { success: true, state: 's', code: 'abc', configId: 'connector:docs' });
  class FakeStdio { constructor(options) { this.options = options; } }
  const stdio = buildStdioTransport({ StdioClientTransport: FakeStdio, command: 'node', args: ['server.js'], cwd: '/tmp', env: { TEST: '1' } });
  assert.strictEqual(stdio.options.command, 'node');
  class FakeHttp { constructor(url, options) { this.url = url; this.options = options; this.closed = false; } async close() { this.closed = true; } }
  const pair = buildHttpTransportPair({ url: 'https://mcp.example', headers: { Authorization: 'Bearer x' }, StreamableHTTPClientTransport: FakeHttp, SSEClientTransport: FakeHttp, order: 'sse-first' });
  assert.deepStrictEqual(pair.map((item) => item.name), ['sse', 'streamableHttp']);
  const stepClient = { connect: async () => 'connected' };
  await connectStepWithTimeout({ client: stepClient, transport: { close: async () => {} }, handshakeTimeoutMs: 100, requestTimeoutMs: 100, stepName: 'fake' });
  let fallbackAttempts = 0;
  const fallbackTransport = await connectWithFallback({ configId: 'custom-mcp:demo', client: { connect: async () => { fallbackAttempts += 1; if (fallbackAttempts === 1) throw new Error('socket hang up'); } }, meta: { url: 'https://mcp.example', headers: {}, order: 'stream-first' }, timeout: 2000, constructors: { StreamableHTTPClientTransport: FakeHttp, SSEClientTransport: FakeHttp }, logger: { info() {}, warn() {}, error() {} } });
  assert.strictEqual(fallbackTransport instanceof FakeHttp, true);
  assert.strictEqual(fallbackAttempts, 2);
  const scopedFetch = createScopedFetch({ fetchFn: async (_input, init) => ({ headers: init.headers }), requestHeaders: { Base: 'yes' }, resolveHeaders: () => ({ hasScopedHeaders: true, headers: { Scoped: 'yes' } }), configId: 'demo' });
  assert.deepStrictEqual((await scopedFetch('https://mcp')).headers, { Scoped: 'yes' });
  const connecting = createConnectingEntry('connector:docs', { id: 'client' }, { url: 'https://mcp' });
  assert.strictEqual(connecting.status, 'connecting');
  assert.strictEqual(connecting.serverConfig.url, 'https://mcp');
  assert.strictEqual(classifyPreflightState(connecting), 'recovering');
  assert.strictEqual(classifyPreflightState({ status: 'unauthorized', needsAuth: true }), 'auth');
  assert.strictEqual(classifyPreflightState({ status: 'connected' }), 'ready');
  assert.strictEqual(classifyPreflightState(undefined), 'missing');
  assert.strictEqual(createToolEntry('custom-mcp:docs', { name: 'search', description: 'Search' }).name, 'docs_search');
  assert.strictEqual(snapshotClientEntry(connecting).transport, null);
  assert.strictEqual(snapshotClientEntries(new Map([['connector:docs', connecting]])).size, 1);
  const oauthStoreCalls = [];
  let storedTokens;
  let storedClientInfo;
  const provider = createConnectorOAuthProvider({
    configId: 'connector:docs', serverUrl: 'https://mcp.example', callbackPort: 1234, oauthBaseUrl: 'workbuddy://workbuddy/mcp',
    oauthStore: {
      loadTokens: () => storedTokens,
      saveTokens: (_id, _url, value) => { storedTokens = value; oauthStoreCalls.push('saveTokens'); },
      loadClientInfo: () => storedClientInfo,
      saveClientInfo: (_id, _url, value) => { storedClientInfo = value; oauthStoreCalls.push('saveClientInfo'); },
      deleteAll: () => oauthStoreCalls.push('deleteAll'), deleteClientInfo: () => oauthStoreCalls.push('deleteClientInfo'), clearAccessTokenOnly: () => oauthStoreCalls.push('clearAccessTokenOnly'),
    },
    hostCapabilities: { openExternal: async (url) => { oauthStoreCalls.push(`open:${url}`); } },
    callbacks: { authorizationStarted: () => oauthStoreCalls.push('authorizationStarted') },
  });
  assert.strictEqual(provider.redirectUrl, 'workbuddy://workbuddy/mcp/connector%3Adocs/oauth/callback');
  assert.strictEqual(provider.clientMetadata.client_name, 'WorkBuddy Connector (connector:docs)');
  const providerState = provider.state(); assert.strictEqual(providerState.length > 20, true);
  provider.saveClientInformation({ client_id: 'client-1' });
  provider.saveTokens({ access_token: 'token-1' });
  assert.deepStrictEqual(provider.tokens(), { access_token: 'token-1' });
  assert.deepStrictEqual(provider.clientInformation(), { client_id: 'client-1' });
  const verifier = provider.codeVerifier(); assert.strictEqual(provider.codeVerifier(), verifier);
  await provider.redirectToAuthorization(new URL('https://auth.example/start'));
  provider.invalidateCredentials('tokens'); assert.strictEqual(provider.tokens(), undefined);
  provider.invalidateCredentials('all'); assert.strictEqual(oauthStoreCalls.includes('deleteAll'), true);
  const healthEntry = { status: 'connected', client: { ping: async () => { throw new Error('temporary'); } }, consecutivePingFailures: 0 };
  let healthReconnects = 0;
  const health = new ConnectorHealthScheduler({ clients: new Map([['docs', healthEntry]]), intervalMs: 1, jitterMs: 0, pingTimeoutMs: 5, failureThreshold: 2, reconnect: async () => { healthReconnects += 1; healthEntry.status = 'connected'; return true; } });
  health.startHealthCheck('docs');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.strictEqual(healthReconnects, 1);
  health.stopHealthCheck('docs');
  const reconnecting = new Map([['docs', Promise.resolve(true)]]);
  healthEntry.status = 'connected';
  assert.deepStrictEqual(await health.waitForReconnect('docs', reconnecting, 20), { ok: true });
  healthEntry.status = 'error';
  assert.deepStrictEqual(await health.waitForReconnect('docs', new Map(), 20), { ok: false, reason: 'no-inflight' });
  healthEntry.status = 'connected';
  health.startBackoffProbe('docs', 0); health.stopBackoffProbe('docs');
  assert.strictEqual(isNetworkTransientError('fetch failed: ECONNRESET'), true);
  assert.strictEqual(isNetworkTransientError('business connection field rejected'), false);
  assert.strictEqual(isIOADeviceUnauthorized('401 Unauthorized Device'), true);
  assert.strictEqual(isAuthMessage('401 Unauthorized'), true);
  assert.strictEqual(isAuthMessage('401 Unauthorized Device'), false);
  assert.strictEqual(isAuthMessage('{"error":"invalid_token"}'), true);
  assert.strictEqual(computeReconnectDelay(1, true), 5000);
  assert.deepStrictEqual(classifyRefreshFailure(new Error('invalid_grant')), { ok: false, kind: 'auth', error: 'invalid_grant' });
  assert.deepStrictEqual(classifyRefreshFailure(new Error('socket hang up')), { ok: false, kind: 'transient', error: 'socket hang up' });
  assert.strictEqual(classifyExhaustedReconnect({ sawTransportTrouble: false, finalError: '401 Unauthorized' }), 'auth');
  assert.strictEqual(classifyExhaustedReconnect({ sawTransportTrouble: true, finalError: '401 Unauthorized' }), 'transport');
  let refreshedMemory;
  const refreshEvents = [];
  const refreshService = new ConnectorTokenRefreshService({
    oauthStore: {
      loadTokens: () => ({ refresh_token: 'refresh', expires_in: 10 }),
      loadClientInfo: () => ({ client_id: 'client' }),
      saveTokens: (_id, _url, tokens) => { refreshedMemory = tokens; refreshEvents.push('saved'); },
    },
    auth: {
      discoverOAuthProtectedResourceMetadata: async () => ({ authorization_servers: ['https://auth.example'], resource: 'https://mcp.example/resource' }),
      discoverAuthorizationServerMetadata: async () => ({ token_endpoint: 'https://auth.example/token' }),
      refreshAuthorization: async (_url, params) => { assert.strictEqual(params.refreshToken, 'refresh'); return { access_token: 'new-token', expires_in: 3600 }; },
    },
    syncProviderMemoryTokens: (_id, tokens) => { refreshedMemory = tokens; },
  });
  assert.deepStrictEqual(await refreshService.refreshIfNeeded('connector:docs', 'https://mcp.example'), { ok: true, refreshed: true });
  assert.strictEqual(refreshedMemory.access_token, 'new-token');
  const validService = new ConnectorTokenRefreshService({ oauthStore: { loadTokens: () => ({ refresh_token: 'r', expires_in: 120 }) } });
  assert.deepStrictEqual(await validService.refreshIfNeeded('docs', 'https://mcp'), { ok: true, refreshed: false });
  const authFailureService = new ConnectorTokenRefreshService({ oauthStore: { loadTokens: () => ({ refresh_token: 'r', expires_in: 1 }), loadClientInfo: () => null }, auth: { discoverAuthorizationServerMetadata: async () => { throw new Error('invalid_grant'); } }, invalidateCredentials: () => refreshEvents.push('invalidated') });
  assert.deepStrictEqual(await authFailureService.refreshIfNeeded('docs', 'https://mcp'), { ok: false, kind: 'auth', error: 'invalid_grant' });
  assert.strictEqual(refreshEvents.includes('invalidated'), true);
  const confirmationText = buildQqMailConfirmationInstruction({ token: 'confirm-token', expiresAt: '2099-01-01T00:00:00Z', originalName: 'SendMessage', originalText: '{"error":{"code":42801}}' });
  assert.strictEqual(confirmationText.includes('AskUserQuestion'), true);
  const confirmation = markQqMailConfirmationRequired('connector:qq-mail', 'SendMessage', { content: [{ type: 'text', text: JSON.stringify({ error: { code: 42801, details: { confirmation_token: 'confirm-token', expires_at: '2099-01-01T00:00:00Z' }, _hints: { suggested_action: 'confirm_with_token' } } }) }] });
  assert.strictEqual(confirmation.isError, true);
  assert.strictEqual(markQqMailConfirmationRequired('connector:docs', 'SendMessage', { content: [{ type: 'text', text: '{}' }] }), null);
  const consent = new PoiConsentRegistry();
  const firstConsent = consent.waitWithFirst('mcp:docs', 1000);
  const secondConsent = consent.waitWithFirst('mcp:docs', 1000);
  assert.strictEqual(firstConsent.isFirst, true);
  assert.strictEqual(secondConsent.isFirst, false);
  assert.strictEqual(consent.answer('mcp:docs', 'approved'), true);
  assert.strictEqual(await firstConsent.promise, 'approved');
  assert.strictEqual(await secondConsent.promise, 'approved');
  assert.strictEqual(await consent.wait('mcp:timeout', 1), 'denied');
  const clients = new Map([
    ['custom-mcp:docs', { status: 'connected', tools: [{ name: 'search', description: 'custom' }] }],
    ['connector:docs', { status: 'connected', tools: [{ name: 'search', description: 'official' }, { name: 'write' }] }],
    ['netdrive', { status: 'connected', tools: [{ name: 'files' }] }],
  ]);
  const routing = new ToolRoutingTable({ clients, disabledTools: new Map([['connector:docs', ['write']]]) });
  routing.upsert('docs_search', 'custom-mcp:docs');
  routing.upsert('docs_search', 'connector:docs');
  assert.strictEqual(routing.resolve('docs_search'), 'connector:docs');
  assert.deepStrictEqual(routing.listTools().map((tool) => tool.name), ['search']);
  assert.deepStrictEqual(routing.listTools({ projectId: 'p1' }).map((tool) => tool.name), ['search', 'files']);
  assert.strictEqual(routing.toolServerMap().search, 'docs');
  assert.strictEqual(shouldHideToolsFromCli('tencent-docs'), true);
  const hiddenRouting = new ToolRoutingTable({ clients: new Map([
    ['connector:tencent-docs', { status: 'connected', tools: [{ name: 'search' }] }],
  ]) });
  hiddenRouting.upsert('tencent-docs_search', 'connector:tencent-docs');
  assert.deepStrictEqual(hiddenRouting.listTools(), []);
  const reconnectEvents = [];
  let connectAttempts = 0;
  assert.strictEqual(await runConnectorReconnect('connector:docs', {
    getConfig: () => ({ serverUrl: 'https://mcp.example' }),
    retryDelays: [0, 0],
    sleep: async () => {},
    connect: async () => ({ success: ++connectAttempts === 2, error: 'ECONNRESET' }),
    onStatus: (_id, status) => reconnectEvents.push(status),
  }), true);
  assert.deepStrictEqual(reconnectEvents, ['connected']);
  const reconnectAuthEvents = [];
  assert.strictEqual(await runConnectorReconnect('connector:auth', {
    getConfig: () => ({ serverUrl: 'https://mcp.example' }),
    retryDelays: [0],
    refreshToken: async () => ({ ok: false, kind: 'auth', error: 'invalid_grant' }),
    markUnauthorized: (_id, error) => reconnectAuthEvents.push(error),
    onStatus: (_id, status) => reconnectAuthEvents.push(status),
  }), false);
  assert.deepStrictEqual(reconnectAuthEvents, ['invalid_grant', 'unauthorized']);
  const sessionEvents = [];
  const sentNotifications = [];
  const sessionRegistry = new ConnectorProxySessionRegistry({ logger: { info: (message) => sessionEvents.push(message), warn: () => {} } });
  sessionRegistry.add('mcp-1', { transport: { send: (value) => sentNotifications.push(value), close: () => sessionEvents.push('transport-close') }, server: { close: () => sessionEvents.push('server-close') } });
  assert.strictEqual(sessionRegistry.size, 1);
  assert.strictEqual(sessionRegistry.broadcast({ method: 'notifications/tools/list_changed' }), 1);
  assert.strictEqual(sentNotifications[0].method, 'notifications/tools/list_changed');
  assert.strictEqual(sessionRegistry.remove('mcp-1'), true);
  assert.strictEqual(sessionRegistry.size, 0);
  assert.deepStrictEqual(normalizeToolResult('ok', { mcpServer: 'docs' }), { content: [{ type: 'text', text: 'ok' }], _meta: { 'workbuddy.ai/connectorServer': 'docs' } });
  const handlerMap = new Map();
  class FakeMcpServer {
    constructor() { this.server = this; }
    setRequestHandler(schema, handler) { handlerMap.set(schema, handler); }
    async connect(transport) { this.transport = transport; }
    close() {}
  }
  class FakeTransport {
    constructor(options) { this.options = options; this.handled = 0; }
    async handleRequest() { this.handled += 1; }
    send(value) { sentNotifications.push(value); }
    close() {}
  }
  const proxyServer = new ConnectorProxyServer({
    McpServerCtor: FakeMcpServer,
    TransportCtor: FakeTransport,
    schemas: { ListToolsRequestSchema: 'tools/list', CallToolRequestSchema: 'tools/call', ListResourcesRequestSchema: 'resources/list', ListResourceTemplatesRequestSchema: 'resources/templates/list', ReadResourceRequestSchema: 'resources/read' },
    proxy: { listAllTools: () => [{ name: 'search' }], callTool: async () => 'result', getMcpInvokeDims: () => ({ mcpServer: 'docs' }), getAllClientEntries: () => new Map([['connector:docs', { status: 'connected', resources: [{ uri: 'docs://a', name: 'A' }], resourceTemplates: [{ uriTemplate: 'docs://items/{id}', name: 'Item' }] }]]), readResourceForConnector: async (configId, uri) => ({ contents: [{ uri, text: configId }] }) },
    randomBytes: () => Buffer.from('proxy-secret'),
    randomUUID: () => 'transport-1',
    createServer: () => ({ close() {} }),
    listen: async () => 19001,
    logger: { info() {}, warn() {}, error() {} },
  });
  assert.strictEqual(await proxyServer.start(), 19001);
  assert.strictEqual(proxyServer.getProxySecret(), 'cHJveHktc2VjcmV0');
  const proxyPair = await proxyServer.createSessionPair({ projectId: 'p1' });
  proxyPair.transport.options.onsessioninitialized('session-1');
  assert.strictEqual(proxyServer.sessions.has('session-1'), true);
  assert.deepStrictEqual(await handlerMap.get('tools/list')(), { tools: [{ name: 'search' }] });
  assert.deepStrictEqual(await handlerMap.get('tools/call')({ params: { name: 'search', arguments: {} } }), { content: [{ type: 'text', text: 'result' }], _meta: { 'workbuddy.ai/connectorServer': 'docs' } });
  assert.deepStrictEqual(await handlerMap.get('resources/list')(), { resources: [{ uri: 'docs://a', name: 'A', description: undefined, mimeType: undefined }] });
  assert.deepStrictEqual(await handlerMap.get('resources/templates/list')(), { resourceTemplates: [{ uriTemplate: 'docs://items/{id}', name: 'Item', description: undefined, mimeType: undefined }] });
  assert.deepStrictEqual(await handlerMap.get('resources/read')({ params: { uri: 'docs://items/42' } }), { contents: [{ uri: 'docs://items/42', text: 'connector:docs' }] });
  assert.strictEqual(escapeHtml('<script>'), '&lt;script&gt;');
  const callbackResponses = [];
  const callbackProxyServer = new ConnectorProxyServer({
    proxy: { stateToConfigId: new Map([['state-1', 'connector:docs']]), handleOAuthCallback: async (state, code, configId) => { callbackResponses.push([state, code, configId]); return { success: true }; } },
    logger: { info() {}, warn() {}, error() {} },
  });
  const callbackResponse = { headersSent: false, writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = body; } };
  await callbackProxyServer.handleOAuthCallback(new URL('http://127.0.0.1/oauth/callback?state=state-1&code=code-1'), callbackResponse);
  assert.strictEqual(callbackResponse.status, 200);
  assert.deepStrictEqual(callbackResponses, [['state-1', 'code-1', 'connector:docs']]);
  assert.deepStrictEqual(normalizePersistentState({ userDisabled: ['docs'] }).userDisabled, { docs: true });
  const stateEvents = [];
  const operationOrder = [];
  const connectorState = new ConnectorServiceState({
    persistentState: { enabled: ['docs'] },
    connect: async (id) => { operationOrder.push(`connect:${id}`); await new Promise((resolve) => setTimeout(resolve, 2)); return { success: true }; },
    disconnect: async (id) => { operationOrder.push(`disconnect:${id}`); },
    onStateChanged: (id, state) => stateEvents.push([id, state.status]),
  });
  await Promise.all([
    connectorState.connect('docs', { url: 'https://docs' }),
    connectorState.disconnect('docs'),
  ]);
  assert.deepStrictEqual(operationOrder, ['connect:docs', 'disconnect:docs']);
  await connectorState.sync({ mail: { url: 'https://mail' } });
  assert.strictEqual(connectorState.activeConfigs.has('mail'), true);
  assert.strictEqual(connectorState.activeConfigs.has('docs'), false);
  assert(stateEvents.some(([id, status]) => id === 'mail' && status === 'connected'));
  assert.deepStrictEqual([...buildEnabledPluginIndex({ 'demo@market': true }).get('market')], ['demo']);
  const pluginRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-plugin-mcp-'));
  const pluginDir = path.join(pluginRoot, 'plugins', 'marketplaces', 'market', 'plugins', 'demo');
  fs.mkdirSync(path.join(pluginDir, '.workbuddy-plugin'), { recursive: true });
  fs.writeFileSync(path.join(pluginRoot, 'settings.json'), JSON.stringify({ enabledPlugins: { 'demo@market': true } }));
  fs.writeFileSync(path.join(pluginRoot, 'plugins', 'marketplaces', 'market', 'marketplace.json'), JSON.stringify({ name: 'market', plugins: [{ name: 'demo', source: 'plugins/demo' }] }));
  fs.writeFileSync(path.join(pluginDir, '.workbuddy-plugin', 'plugin.json'), JSON.stringify({ name: 'demo', version: '1.0.0' }));
  fs.writeFileSync(path.join(pluginDir, '.mcp.json'), JSON.stringify({ mcpServers: { docs: { command: 'node', args: ['server.js'] } } }));
  const discovered = discoverPluginMcpConfigs(pluginRoot, { enabledPlugins: { 'demo@market': true } });
  assert.strictEqual(discovered.docs.sourcePluginId, 'demo@market');
  assert.strictEqual(discovered.docs.config.type, 'stdio');
  assert.strictEqual(isInside(pluginRoot, pluginDir), true);
  assert.strictEqual(isInside(pluginRoot, path.join(pluginRoot, '..')), false);
  fs.rmSync(pluginRoot, { recursive: true, force: true });
  assert.strictEqual(normalizeTimeout(2), 2000);
  assert.strictEqual(normalizeTimeout(2000), 2000);
  const connectorConfig = mergeConnectorMcpServers({ connectors: [{ source: 'docs' }, { source: 'cli', type: 'cli' }] }, {
    enabled: [],
    toProxyConfigId: (id) => `custom:${id}`,
    readConnectorMcpConfig: () => ({ mcpServers: { docs: { url: 'https://docs', timeout: 2 } } }),
  });
  assert.deepStrictEqual(connectorConfig.mcpServers['custom:docs'], { url: 'https://docs', timeout: 2000, disabled: true });
  const configFile = path.join(os.tmpdir(), `workbuddy-config-${Date.now()}`, 'mcp.json');
  writeConnectorMcpConfig(configFile, connectorConfig);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(configFile, 'utf8')), connectorConfig);
  fs.rmSync(path.dirname(configFile), { recursive: true, force: true });
  const skillRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-skills-'));
  fs.mkdirSync(path.join(skillRoot, 'nested', 'deep'), { recursive: true });
  const skillA = path.join(skillRoot, 'SKILL.md');
  const skillB = path.join(skillRoot, 'nested', 'deep', 'SKILL.md');
  fs.writeFileSync(skillA, '---\nname: demo\n---\nBody\n');
  fs.writeFileSync(skillB, '---\nname: nested\ndisable: false\n---\nBody\n');
  assert.strictEqual(disableConnectorSkills(skillRoot), 2);
  assert(fs.readFileSync(skillA, 'utf8').includes('disable: true'));
  assert(fs.readFileSync(skillB, 'utf8').includes('disable: true'));
  assert.strictEqual(markSkillFileDisabled(skillA), true);
  fs.rmSync(skillRoot, { recursive: true, force: true });
  assert.strictEqual(normalizeEtag('W/"abc"'), 'abc');
  const marketplaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-marketplace-'));
  const marketplace = new MarketplaceCache({ baseDir: path.join(marketplaceRoot, 'current'), metaPath: path.join(marketplaceRoot, 'meta.json'), lockPath: path.join(marketplaceRoot, 'lock'), now: () => 1000 });
  const fingerprint = marketplace.fingerprint(Buffer.from('marketplace'), '"etag-1"');
  assert.strictEqual(fingerprint.etag, 'etag-1');
  assert.strictEqual(marketplace.saveMeta(fingerprint), true);
  assert.deepStrictEqual(marketplace.readMeta(), fingerprint);
  const sourceMarketplace = path.join(marketplaceRoot, 'incoming');
  fs.mkdirSync(sourceMarketplace); fs.writeFileSync(path.join(sourceMarketplace, 'marketplace.json'), '{}');
  assert.strictEqual(marketplace.replaceDirectory(sourceMarketplace), true);
  assert(fs.existsSync(path.join(marketplaceRoot, 'current', 'marketplace.json')));
  fs.rmSync(marketplaceRoot, { recursive: true, force: true });
  const fakeGetResponse = { statusCode: 200, headers: { etag: 'W/"download-1"' }, on(event, listener) { if (event === 'data') listener(Buffer.from('hello')); if (event === 'end') queueMicrotask(listener); return this; }, resume() {} };
  const fakeRequest = (_url, _options, callback) => { callback(fakeGetResponse); return { on() { return this; }, end() {} }; };
  const downloaded = await downloadBufferWithHeaders('https://market.example/archive.zip', { request: fakeRequest });
  assert.strictEqual(downloaded.buffer.toString(), 'hello');
  assert.strictEqual(downloaded.etag, 'download-1');
  const fakeHeadResponse = { statusCode: 200, headers: { etag: '"head-1"' }, resume() {} };
  const fakeHeadRequest = (_url, _options, callback) => { queueMicrotask(() => callback(fakeHeadResponse)); return { on() { return this; }, setTimeout() {}, end() {} }; };
  assert.strictEqual(await fetchRemoteEtag('https://market.example/archive.zip', { request: fakeHeadRequest }), 'head-1');
  const serviceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-market-service-'));
  const marketplaceServiceCache = new MarketplaceCache({ baseDir: path.join(serviceRoot, 'current'), metaPath: path.join(serviceRoot, 'meta.json'), lockPath: path.join(serviceRoot, 'lock'), pid: 999999, now: () => 1000 });
  const marketplaceService = new ConnectorMarketplaceService({
    cache: marketplaceServiceCache,
    tempDirectory: serviceRoot,
    randomSuffix: () => 'test',
    download: async () => ({ buffer: Buffer.from('archive'), etag: 'etag-service' }),
    extract: async (_buffer, target) => { fs.writeFileSync(path.join(target, 'marketplace.json'), JSON.stringify({ name: 'demo' })); },
  });
  const synced = await marketplaceService.downloadAndReplace('https://market.example/archive.zip', 'demo');
  assert.strictEqual(synced.replaced, true);
  assert.strictEqual(synced.manifest.name, 'demo');
  assert.strictEqual(marketplaceServiceCache.readMeta().etag, 'etag-service');
  fs.rmSync(serviceRoot, { recursive: true, force: true });
  const facadeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-connector-service-'));
  const coordinatorEvents = [];
  const authCoordinator = new ConnectorAuthCoordinator({
    ioaAuth: {
      handleConnect: async (_id, config) => ({ handled: false, serverConfig: { ...config, headers: { Authorization: 'Bearer refreshed' } } }),
      abortPendingAuth: (id) => coordinatorEvents.push(`abort:${id}`),
    },
    tokenRefreshService: {
      refreshIfNeeded: async (id, url, headers) => { coordinatorEvents.push(`refresh:${id}:${url}:${headers.Authorization}`); return { ok: true, refreshed: true }; },
    },
    serverSideOauthRefresher: {
      schedule: (id, name, options) => coordinatorEvents.push(`schedule:${id}:${name}:${options.initialAccessToken}`),
      stop: (id) => coordinatorEvents.push(`stop:${id}`),
    },
    resolveConnectorName: () => 'docs-oauth',
    isServerSideAuth: () => true,
  });
  const connectorFacade = new ConnectorService({
    manifest: { connectors: [{ source: 'docs' }] },
    connectorMcpConfigPath: path.join(facadeRoot, 'connectors', 'mcp.json'),
    readConnectorMcpConfig: () => ({ mcpServers: { docs: { url: 'https://docs' } } }),
    toProxyConfigId: (id) => `connector:${id}`,
    connect: async () => ({ success: true }),
    disconnect: async () => {},
    authCoordinator,
  });
  assert.strictEqual((await connectorFacade.init()).persistentState.enabled.length, 0);
  assert.strictEqual((await connectorFacade.connect('docs', { url: 'https://docs' })).success, true);
  assert.deepStrictEqual(coordinatorEvents.slice(0, 2), ['refresh:docs:https://docs:Bearer refreshed', 'schedule:docs:docs-oauth:refreshed']);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(facadeRoot, 'connectors', 'mcp.json'), 'utf8')).mcpServers['connector:docs'].disabled, undefined);
  await connectorFacade.disconnect('docs');
  assert.deepStrictEqual(coordinatorEvents.slice(-1), ['stop:docs']);
  const listing = listMcpServers({
    customConfig: { mcpServers: { docs: { url: 'https://docs', disabledTools: ['write'] } } },
    pluginConfigs: { demo: { config: { command: 'node', args: ['server.js'] }, sourcePluginId: 'demo@market' } },
    getClientEntry: (id) => ({ status: 'connected', tools: [{ name: id.endsWith('docs') ? 'write' : 'run' }] }),
    isApproved: () => true,
    resolveDisabledToolNames: (_name, names) => new Set(names || []),
  });
  assert.strictEqual(listing.length, 2);
  assert.strictEqual(listing[0].tools[0].enabled, false);
  assert.strictEqual(listing[0].trustLevel, 'gray');
  assert.strictEqual(listing[1].configSource, 'plugin');
  assert.strictEqual(typeof calculateMcpConfigHash({ url: 'https://docs/path' }), 'string');
  const desired = buildDesiredConnectorConfigs({
    manifest: { connectors: [{ source: 'official' }, { source: 'cli', type: 'cli' }] },
    enabled: ['official'],
    readConnectorMcpConfig: () => ({ mcpServers: { main: { url: 'https://official', timeout: 2 } } }),
    readCustomMcpConfig: () => ({ mcpServers: { custom: { url: 'https://custom' }, blocked: { url: 'https://blocked' } } }),
    readPluginMcpConfigs: () => ({ plugin: { config: { command: 'node', args: ['mcp.js'] } } }),
    toProxyConfigId: (id) => `connector:${id}`,
    calculateHash: (config) => config.url === 'https://blocked' ? 'blocked' : 'ok',
    blacklist: ['blocked'],
    isApproved: () => true,
    disabledToolsOverrides: { custom: ['write'] },
  });
  assert.deepStrictEqual(Object.keys(desired), ['connector:official', 'custom-mcp:custom', 'custom-mcp:plugin']);
  assert.strictEqual(desired['connector:official'].timeout, 2000);
  assert.deepStrictEqual(desired['custom-mcp:custom'].disabledTools, ['write']);
  const syncPlan = planConnectorSync(new Map([
    ['keep', { url: 'https://keep' }],
    ['change', { url: 'https://old' }],
    ['remove', { url: 'https://remove' }],
  ]), {
    keep: { url: 'https://keep' },
    change: { url: 'https://new' },
    add: { url: 'https://add' },
  });
  assert.deepStrictEqual(syncPlan.removed, ['remove']);
  assert.deepStrictEqual(syncPlan.added.map(({ id }) => id), ['add']);
  assert.deepStrictEqual(syncPlan.reconnect.map(({ id }) => id), ['change']);
  assert.deepStrictEqual(syncPlan.unchanged.map(({ id }) => id), ['keep']);
  const poolEvents = [];
  const mcpPool = new ConnectorMcpClientPool({
    createClient: (id) => ({ id, callTool: async (request) => ({ content: [{ type: 'text', text: request.name }] }), readResource: async ({ uri }) => ({ contents: [{ uri }] }) }),
    connectClient: async (client) => { poolEvents.push(`connect:${client.id}`); },
    listClientTools: async (client) => ({ tools: [{ name: `${client.id}-tool` }] }),
    closeClient: async (client) => { poolEvents.push(`close:${client.id}`); },
  });
  assert.strictEqual((await mcpPool.connect('docs', { url: 'https://docs' })).success, true);
  assert.strictEqual((await mcpPool.connect('docs', { url: 'https://docs' })).cached, true);
  assert.strictEqual(mcpPool.listAllTools()[0].name, 'docs_docs-tool');
  mcpPool.registerBuiltinTool({ name: 'builtin', description: 'built-in', inputSchema: { type: 'object' } });
  assert.strictEqual(mcpPool.listAllTools().some(({ name }) => name === 'builtin'), true);
  assert.strictEqual(mcpPool.getToolServerMap()['docs_docs-tool'], 'docs');
  assert.deepStrictEqual(await mcpPool.callTool('docs_docs-tool', {}), { content: [{ type: 'text', text: 'docs-tool' }] });
  assert.deepStrictEqual(await mcpPool.readResourceForConnector('docs', 'docs://resource'), { contents: [{ uri: 'docs://resource' }] });
  assert.deepStrictEqual(mcpPool.getMcpInvokeDims('docs_docs-tool'), { mcpServer: 'docs', isBuiltin: false });
  assert.deepStrictEqual(mcpPool.getMcpInvokeDims('builtin'), { mcpServer: 'builtin', isBuiltin: true });
  const poolSync = await mcpPool.sync({ mail: { url: 'https://mail' }, docs: { url: 'https://docs-2' } });
  assert.deepStrictEqual(poolSync.added, ['mail']);
  assert.deepStrictEqual(poolSync.reconnected, ['docs']);
  await mcpPool.disconnect('mail');
  assert(poolEvents.includes('close:mail'));
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(facadeRoot, 'connectors', 'mcp.json'), 'utf8')).mcpServers['connector:docs'].disabled, true);
  const facadeCalls = [];
  const rpcFacade = createConnectorServiceFacade({
    connectorService: {
      init: async () => facadeCalls.push('init'),
      disconnect: async (id) => facadeCalls.push(`disconnect:${id}`),
      listMcpServers: () => [{ id: 'docs' }],
    },
    connectorUiAdapter: { connect: async (id) => facadeCalls.push(`connect:${id}`), getStates: () => ({ docs: 'connected' }) },
  });
  await rpcFacade.init();
  await rpcFacade.connect('docs');
  await rpcFacade.disconnect('docs');
  assert.deepStrictEqual(facadeCalls, ['init', 'connect:docs', 'disconnect:docs']);
  assert.deepStrictEqual(rpcFacade.listMcpServers(), [{ id: 'docs' }]);
  const oauthFacade = createConnectorOAuthCallbackFacade({ connectorMcpProxy: {
    isOAuthCallbackUrl: (url) => url.includes('/oauth/callback'),
    handleOAuthCallbackFromUrl: async (url) => ({ url }),
    handleOAuthCallback: async (state, code) => ({ state, code }),
  } });
  assert.strictEqual(oauthFacade.isOAuthCallbackUrl('http://localhost/oauth/callback'), true);
  assert.deepStrictEqual(await oauthFacade.handleOAuthCallback('state', 'code'), { state: 'state', code: 'code' });
  const coreServices = createConnectorCoreServices({
    connectorService: { listMcpServers: () => ['docs'] },
    connectorUiAdapter: { getStates: () => ({}) },
    connectorMcpProxy: { isOAuthCallbackUrl: () => true },
  });
  assert.deepStrictEqual(coreServices.connectors.listMcpServers(), ['docs']);
  assert.strictEqual(coreServices.connectorOAuthCallbacks.isOAuthCallbackUrl('callback'), true);
  fs.rmSync(facadeRoot, { recursive: true, force: true });
  proxyServer.stop();
  const expertCache = new ExpertCacheManager(path.join(root, 'experts-cache'));
  const cachedManifest = { version: '2', experts: [{ id: 'editor' }] };
  await expertCache.saveManifest(cachedManifest, 'source-1');
  assert.deepStrictEqual(await expertCache.getManifest(), cachedManifest);
  assert.strictEqual(await expertCache.isCompatible('source-1'), true);
  assert.strictEqual(await expertCache.isCompatible('source-2'), false);
  assert.strictEqual(await expertCache.getCachedVersion(), '2');
  assert.strictEqual((await expertCache.getCachedHash()).length, 64);
  await expertCache.clear();
  assert.strictEqual(await expertCache.getManifest(), null);

  const ring = new RingBuffer(5);
  ring.write(Buffer.from('abc'));
  ring.write(Buffer.from('def'));
  assert.strictEqual(ring.snapshot().toString(), 'bcdef');
  assert.strictEqual(ring.totalWritten, 6);
  const sidecarEnv = { WORKBUDDY_CONFIG_DIR: path.join(root, 'config') };
  assert.notStrictEqual(sidecarRuntimeDir(sidecarEnv), sidecarRuntimeDir({ WORKBUDDY_CONFIG_DIR: path.join(root, 'other') }));
  assert.ok(controlSocketPath(sidecarEnv).endsWith('sidecar.sock'));
  assert.ok(dataSocketPath('session/one', sidecarEnv).includes('s-'));
  const ready = new SessionReadyRegistry({ createToken: () => 'token', replayTtlMs: 1000 });
  const waiter = ready.register('ready-1', 1000);
  waiter.arm(42);
  assert.deepStrictEqual(ready.accept({ protocolVersion: 1, sessionId: 'ready-1', token: 'token', pid: 42, port: 4321 }), { pid: 42, port: 4321 });
  assert.deepStrictEqual(await waiter.promise, { pid: 42, port: 4321 });
  assert.deepStrictEqual(ready.accept({ protocolVersion: 1, sessionId: 'ready-1', token: 'token', pid: 42, port: 4321 }), { pid: 42, port: 4321 });
  assert.throws(() => ready.accept({ protocolVersion: 2, sessionId: 'ready-1', token: 'token', pid: 42, port: 4321 }), /protocol version/);
  const childSession = createChildProcessSession({ command: process.execPath, args: ['-e', "process.stdout.write('ready');"] });
  let childOutput = '';
  childSession.onData((chunk) => { childOutput += chunk.toString(); });
  await new Promise((resolve, reject) => {
    childSession.onExit((event) => { try { assert.strictEqual(event.exitCode, 0); resolve(); } catch (error) { reject(error); } });
  });
  assert.strictEqual(childOutput, 'ready');
  assert.deepStrictEqual(tryParseEnvelope('{"code":"401","msg":"expired","data":{"retry":true}}'), { code: 401, msg: 'expired', data: { retry: true }, requestId: undefined });
  const requests = [];
  const runtimeHttp = createRuntimeHttp({
    productManager: { getEndpoint: () => 'https://api.test/' },
    authenticationManager: { currentSessionSubject: { getValue: () => ({ auth: { accessToken: 'token' }, account: { uid: 'u1' } }) } },
    fetch: async (url, init) => { requests.push({ url, init }); return { ok: true, status: 200, json: async () => ({ code: 0, data: { ok: true } }) }; },
  });
  assert.deepStrictEqual(await runtimeHttp.post('/v1/test', { value: 1 }, { params: { q: 'a b' } }), { code: 0, data: { ok: true } });
  assert.strictEqual(requests[0].url, 'https://api.test/v1/test?q=a%20b');
  assert.strictEqual(requests[0].init.headers.Authorization, 'Bearer token');
  const httpError = createHttpError('get', '/x', { status: 401, statusText: 'Unauthorized' }, '{"code":401,"msg":"Nope"}');
  assert.strictEqual(httpError.code, 401);
  assert.strictEqual(httpError.message, 'Nope');
  const sidecars = new SidecarSessionManager({ command: process.execPath, args: ['-e', "process.stdout.write('sidecar');"] });
  let sidecarOutput = '';
  sidecars.on('data', (_id, chunk) => { sidecarOutput += chunk.toString(); });
  const started = sidecars.start('session-1');
  await new Promise((resolve) => sidecars.once('exit', resolve));
  assert.strictEqual(started.id, 'session-1');
  assert.strictEqual(sidecarOutput, 'sidecar');
  assert.strictEqual(sidecars.capture('session-1'), undefined);
  assert.strictEqual(sidecars.list().length, 0);
  assert.deepStrictEqual(translateDesktopToCloudPayload({ update: { sessionUpdate: 'state_update', currentState: 'error' } }).update, { sessionUpdate: 'session_end_turn', stopReason: 'refusal' });
  assert.strictEqual(translateDesktopToCloudPayload({ sessionUpdate: 'assistant_message_chunk' }).sessionUpdate, 'agent_message_chunk');
  assert.deepStrictEqual(resolveDesktopSpanPlan({ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), parentSpanId: 'c'.repeat(16) }).parentSpanId, 'c'.repeat(16));
  assert.deepStrictEqual(sanitizeChannelTraceAttributes({ safe: 1, sessionId: 'secret' }), { safe: 1 });
  const mapping = new EdgeSyncMappingStore(path.join(root, 'mapping'));
  mapping.initialize(); mapping.upsert('s1', 'c1', 'convmsg:u1');
  assert.deepStrictEqual([...mapping.loadAll().sessionToConversation], [['s1', 'c1']]);
  mapping.close();
  const calls = [];
  const apiCtx = { deps: { http: { post: async (url, body) => { calls.push({ url, body }); } } }, getConversationId: () => 'c1', logger: { warn() {} } };
  assert.strictEqual(await syncRenameConversation(apiCtx, 's1', 'New title'), 'c1');
  assert.strictEqual(calls[0].url, '/console/as/conversations/c1');
  const lazyLine = JSON.stringify({ id: 'tool-1', type: 'function_call_result', output: 'x'.repeat(120 * 1024) });
  const lazyItem = parseLineWithLazyLoad(lazyLine);
  assert.strictEqual(lazyItem._lazyLoad, true);
  assert.strictEqual(estimateItemPayloadBytes(lazyItem, lazyLine), 512);
  assert.strictEqual(resolveAgentTeamsEnv({ disableAgentTeams: true }), '0');
  assert.strictEqual(resolveAgentTeamsEnv({ disableAgentTeams: true, expertType: 'team' }), '1');
  const teams = createAgentTeamsEnvResolver({ getDisableAgentTeams: () => true });
  teams.recordSessionExpertType('s1', 'team');
  assert.strictEqual(teams.resolveForSession('s1'), '1');
  assert.deepStrictEqual(buildAgentCliRuntimeArgs({ runtimeConfig: { permissionMode: 'invalid', model: 'sonnet' }, cwd: '/tmp/project', language: 'English' }).slice(0, 4), ['--permission-mode', 'bypassPermissions', '--allowedTools', 'present_files']);
  const promptPath = writeAgentCliSystemPromptFile('runtime-test', 'hello');
  assert.strictEqual(fs.readFileSync(promptPath, 'utf8'), 'hello');
  cleanupAgentCliSystemPromptFile(promptPath);
  assert.strictEqual(resolveCliSettingsLanguage({ readAppConfigValue: () => 'zh-CN' }), '简体中文');
  assert.deepStrictEqual(buildSessionReplayRequestHeaders({ 'X-Test': 'yes' }), { 'X-CodeBuddy-Request': '1', 'X-Test': 'yes' });
  assert.deepStrictEqual(await parseCliJsonResponse({ text: async () => '{"data":{"items":[1]}}' }), { data: { items: [1] }, bytes: 22 });
  assert.deepStrictEqual(getMediaInfo('.png'), { mimeType: 'image/png', contentType: 'image' });
  assert.deepStrictEqual(inferMediaInfoForUnknownExt('glb'), { mimeType: 'model/gltf-binary', contentType: 'document' });
  assert.strictEqual(extractSessionId('/pty/session_1?token=x'), 'session_1');
  assert.strictEqual(extractToken('/pty/session_1?token=x'), 'x');
  assert.throws(() => assertWorkbuddyAppServerStdioMode([]), /Missing --stdio/);
  assert.strictEqual(createWorkbuddyAppServerPlatformFromEnv({ processEnv: { WORKBUDDY_IS_PACKAGED: 'true' }, runtime: { configDir: '/tmp/config' } }).isPackaged, true);
  const channelCalls = [];
  const channelCtx = { deps: { getDeviceId: () => 'd1', getAccount: () => ({ uid: 'u1' }), http: { post: async (...args) => { channelCalls.push(args); return { code: 0, data: { apisixPublishUrl: 'https://staging-copilot.tencent.com/ws' } }; } } } };
  const channelCredentials = await fetchChannelCredentials(channelCtx, (raw) => raw.data, ['convmsg:c1']);
  assert.strictEqual(channelCredentials.apisixPublishUrl, 'https://staging.workbuddy.cn/ws');
  assert.deepStrictEqual(channelCalls[0][1].scopes, ['convmsg:c1']);
  assert.strictEqual(buildDeviceOnlinePayload(channelCtx).type, 'device.online');
  let task = createInitialTaskState('task-1', 1);
  task = reduceTaskStatus(task, { type: 'turn_started', timestamp: 2 });
  assert.strictEqual(deriveTaskStatus(task), 'planning');
  assert.strictEqual(extractPreviewUrlLocalPath('file:///tmp/a%20b.txt'), '/tmp/a b.txt');
  assert.deepStrictEqual(parseEdsdkCall("python3 edsdk.py call open_file path='/tmp/a'"), { tool: 'open_file', args: { path: '/tmp/a' } });
  assert.strictEqual(formatLogDetailsSuffix({ count: 1 }), ' {"count":1}');
  assert.deepStrictEqual(tryParseAcpUsageUpdate({ sessionUpdate: 'usage_update', used: 2, size: 10 }), { sessionUpdate: 'usage_update', used: 2, size: 10 });
  assert.strictEqual(ALL_MEDIA_EXTS.has('png'), true);
  const telemetryEvents = [];
  const watchdogSession = { sessionId: 's1', isProcessing: true, taskState: task, promptStartedAt: 0, lastBackendMessageAt: 0, stateTransitionLog: [], hasReceivedBackendActivity: false };
  const watchdog = new NoResponseWatchdog(watchdogSession, (name, payload) => telemetryEvents.push({ name, payload }), { timeoutThresholdMs: 10 }, () => 20);
  watchdog.tick();
  assert.strictEqual(telemetryEvents[0].name, 'session_no_response_timeout');
  const transitionLog = [];
  appendStateTransitionEntry(transitionLog, { signal: 'working', fromRunState: 'running', fromTaskStatus: 'working', toRunState: 'running', toTaskStatus: 'working' });
  assert.strictEqual(transitionLog.length, 0);
  const metaWriter = new SessionMetaWriter(path.join(root, 'session-meta'));
  await metaWriter.record({ conversationId: 'c1', userId: 'u1', workDir: '/tmp', title: 'First' });
  await metaWriter.record({ conversationId: 'c1', userId: 'u1', workDir: '/tmp', title: 'Renamed' });
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(root, 'session-meta', 'sessions.json'), 'utf8')).sessions[0].title, 'Renamed');
  assert.deepStrictEqual(withSessionEnabledPluginSetting({ enabledPlugins: { old: true } }, 'new', false).enabledPlugins, { old: true, new: false });
  assert.strictEqual(isDaemonStdioFrame({ type: 'rpc-request', id: '1', channel: 'ping' }), true);
  assert.strictEqual(isDaemonStdioFrame({ type: 'rpc-request', id: '1' }), false);
  const frameInput = new (require('stream').Readable)({ read() {} });
  const frames = [];
  const reader = createDaemonStdioFrameReader(frameInput, { onFrame: (frame) => frames.push(frame) });
  frameInput.push('{"type":"ready"}\n{"type":"rpc-response","id":"1"}\n');
  frameInput.push(null);
  await new Promise((resolve) => setImmediate(resolve));
  reader.dispose();
  assert.strictEqual(frames.length, 2);
  const rpcOutput = { frames: [], write(text) { this.frames.push(JSON.parse(text)); } };
  const parentRpc = createStdioParentRpcClient({ output: rpcOutput });
  const pendingRpc = parentRpc.invoke('demo', 1);
  assert.strictEqual(rpcOutput.frames[0].channel, 'demo');
  parentRpc.handleFrame({ type: 'rpc-response', id: rpcOutput.frames[0].id, result: 'ok' });
  assert.strictEqual(await pendingRpc, 'ok');
  assert.strictEqual(isHostedCliRuntimeSessionId('__workbuddy_cli_host__-1'), true);
  assert.strictEqual(extractHttpEndpoint('http://127.0.0.1:1/api/v1/acp'), 'http://127.0.0.1:1');
  assert.strictEqual(formatSidecarLogArgs(['x', { value: 1 }]), 'x {"value":1}');
  assert.deepStrictEqual(buildPrewarmActivateArgs(['/cli', '--model', 'm'], 123), ['--serve', '--model', 'm', '--port', '123']);
  assert.strictEqual(summarizePrewarmArgs(['--settings', '{"secret":1}', '--model', 'm']), '--settings=<len=12> --model=m');
  assert.deepStrictEqual(normalizeRuntimeConfig({ model: 'm', welcomeMode: 'welcome', extra: true }).welcomeMode, 'welcome');
  assert.strictEqual(stableJsonStringify({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.strictEqual(extractCliOutcome({ 'codebuddy.ai/outcome': 'completed' }), 'completed');
  assert.deepStrictEqual(materializeWorkbuddyRuntimePrompt([{ type: 'text', text: '/mcp:docs:search hi' }]), [{ type: 'text', text: '/docs:search (MCP) hi' }]);
  assert.strictEqual(isValidW3CTraceId('a'.repeat(32)), true);
  assert.strictEqual(formatTraceparent({ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16) }), `00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`);
  const handlers = new Map();
  assert.deepStrictEqual(registerServiceHandlers({ handle: (channel, fn) => handlers.set(channel, fn) }, 'demo', { ping() { return 'pong'; } }, {}, { info() {} }), ['ping']);
  assert.strictEqual(handlers.get('demo:ping')(), 'pong');
  assert.strictEqual(getHostedCliSessionOwnerKey({ account: { uid: 'u1' }, auth: { domain: 'd' } }), 'u1|d|');
  class FakeAcpClient { constructor(options) { this.options = options; this.connection = { prompt: async (value) => value }; } connect() { return Promise.resolve(); } disconnect() {} debugState() { return 'ready'; } resolvePermission() {} rejectPermission() {} answerQuestion() {} cancelQuestion() {} respondElicitation() {} resolveInterruption() {} }
  const acpFacade = createWorkbuddyAgentAcpClient({ ClientClass: FakeAcpClient, endpoint: 'http://127.0.0.1:1' });
  assert.strictEqual(await acpFacade.connection.prompt('ok'), 'ok');
  assert.strictEqual(isPoiMapEnabled({ configuration: { getValue: () => ({ productFeatures: { PoiMap: true } }) } }), true);
  assert.strictEqual(resolvePrewarmIpcPath('abc', 'linux'), '/tmp/codebuddy-prewarm-abc.sock');
  assert.strictEqual(isWhitelistedSessionEnvKey('SERVICE_TOKEN'), true);
  assert.deepStrictEqual(managedEnvMismatchKeys({ A: '1' }, { A: '2', B: '3' }), ['A', 'B']);
  assert.throws(() => validateActivateReadyResponse({ ok: false }, { expectedPid: 1, expectedSessionId: 's' }), /invalid prewarm/);
  const pool = new CliPrewarmPool({ poolSize: 1, spawn: () => ({ pid: 42, killed: false, exitCode: null, once() {}, kill() { this.killed = true; } }) });
  assert.strictEqual(pool.hasReplenishCapacity(), true);
  pool.stop();
  assert.strictEqual(pool.hasReplenishCapacity(), false);
  const sidecarCalls = [];
  const fakeClient = {
    isConnected: true,
    async listSessions() { sidecarCalls.push('list'); return [{ sessionId: 's1', acpEndpoint: 'http://127.0.0.1:9/api/v1/acp' }]; },
    async reconnectSession(id) { sidecarCalls.push(`reconnect:${id}`); return { sessionId: id }; },
    async createSession(params) { sidecarCalls.push(`create:${params.sessionId}`); return { sessionId: params.sessionId, acpEndpoint: 'http://127.0.0.1:10/api/v1/acp' }; },
    async killSession(id) { sidecarCalls.push(`kill:${id}`); },
    onClose() {},
    dispose() {},
  };
  const manager = createWorkbuddySidecarManager({ connectClient: async () => fakeClient });
  assert.deepStrictEqual(await manager.createSession({ sessionId: 's1', cols: 80, rows: 24 }), { sessionId: 's1' });
  assert.strictEqual(sidecarCalls.includes('reconnect:s1'), true);
  manager.setPrewarmPool({ getActiveEndpoints: () => ['http://127.0.0.1:10'], getActiveEndpointForSession: (id) => id === 'warm' ? 'http://127.0.0.1:11' : undefined });
  assert.deepStrictEqual(await manager.getAllActiveEndpoints(), ['http://127.0.0.1:9', 'http://127.0.0.1:10']);
  assert.strictEqual(await manager.resolveSessionHttpBase('warm'), 'http://127.0.0.1:11');
  await manager.shutdown();
  assert.strictEqual(manager.disposed, true);
  assert(manager instanceof SidecarManager);
  assert.deepStrictEqual(parseToolUsage('Skill', { skill: 'PDF' }), { observation: { type: 'skill', id: 'pdf' } });
  assert.deepStrictEqual(parseToolUsage('mcp__docs__search', {}), { observation: { type: 'mcp', id: 'docs' } });
  assert.deepStrictEqual(parseToolUsage('DeferExecuteTool', { toolName: 'Agent', params: { subagent_type: 'reviewer' } }), { observation: { type: 'subagent', id: 'reviewer' } });
  const usageEvents = [];
  const usageBridge = createToolUsageBridge({ getFacade: () => ({ recordUsage: async (value) => usageEvents.push(['usage', value]), recordActiveDay: async () => usageEvents.push(['day']) }) });
  usageBridge.observe({ status: 'completed', toolCallId: 'tool-1', toolName: 'Skill', rawInput: { skill: 'Docs' } });
  usageBridge.observe({ status: 'completed', toolCallId: 'tool-1', toolName: 'Skill', rawInput: { skill: 'Docs' } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(usageEvents.length, 2);
  const poiRegistry = new PoiQuestionRegistry(1000);
  const answer = poiRegistry.ask('session-1', 'request-1', {});
  assert.strictEqual(poiRegistry.answer('session-2', 'request-1', 'wrong'), false);
  assert.strictEqual(poiRegistry.answer('session-1', 'request-1', 'picked'), true);
  assert.strictEqual(await answer, 'picked');
  assert.strictEqual(poiRegistry.pendingCount, 0);
  const auditEntries = [];
  const audit = createAuditAcpAdapter({ store: { append: async (entry) => auditEntries.push(entry) }, now: () => 123 });
  await audit.consume({ sessionId: 's-audit', update: { sessionUpdate: 'tool_call', toolCallId: 'tc-1', rawInput: { url: 'https://example.com' }, _meta: { 'codebuddy.ai/toolName': 'WebFetch' } } });
  await audit.consume({ sessionId: 's-audit', update: { sessionUpdate: 'tool_call_update', toolCallId: 'tc-1', status: 'completed' } });
  assert.strictEqual(auditEntries[0].messageKey, 'securityCenter.audit.network.success');
  assert.strictEqual(auditEntries[0].timestamp, 123);
  assert.strictEqual(buildMcpEntry('tc-2', { toolName: 'mcp__docs__search', rawInput: {} }, 'failed', 'denied', 's-audit', 124).messageParams.serverName, 'docs');
  assert.strictEqual(isTransientDisconnectMessage('ACP transport is not connected'), true);
  assert(buildRecallText('skill', 'cloudstudio-deploy', 'deploy').includes('CloudStudio 部署'));
  assert.strictEqual(RecallCacheStore.hashText('demo').length, 40);
  const bm25 = new Bm25Index(); bm25.build([{ id: 'a', text: 'cloud deployment' }, { id: 'b', text: 'local notes' }]);
  assert.strictEqual(bm25.score('cloud').has('a'), true);
  const recallIndex = new RecallIndex(); recallIndex.rebuild([{ id: 'a', text: 'cloud deployment', vector: [1, 0], status: 'disabled' }]);
  assert.strictEqual(recallIndex.search([1, 0], 'cloud', 1)[0].id, 'a');
  const limiter = new RateLimiter({ minIntervalMs: 0 });
  assert.strictEqual(await limiter.schedule(async () => 'ok'), 'ok');
  assert.deepStrictEqual(resolveMemoryDirs('/tmp/home'), { primaryDir: '/tmp/home/.workbuddy/memory', legacyDir: '/tmp/home/.workbuddy/memery' });
  const release = await acquireMutex('test-memory'); release();
  await assert.rejects(() => withTimeout(() => new Promise(() => {}), 5, 'test-timeout'), (error) => error.name === 'TimeoutError');
  const lockPath = path.join(root, 'memory.lock');
  const lock = await acquireFileLock(lockPath, { maxRetries: 0 }); assert(lock); await lock.release();
  assert.strictEqual(canonicalizeStoredPath('/tmp//work'), '/tmp/work');
  assert.strictEqual(escapeSqliteLikePattern('a%b_'), 'a\\%b\\_');
  assert.deepStrictEqual(parseJsonArray('["a",1,"b"]'), ['a', 'b']);
  const pragmas = []; configureWorkbuddySqliteConnection({ pragma: (value) => pragmas.push(value) });
  assert.deepStrictEqual(pragmas, ['journal_mode = WAL', 'busy_timeout = 10000', 'wal_autocheckpoint = 1000']);
  const fileLogger = new BufferedFileLogger({ logDir: path.join(root, 'logs'), filePrefix: 'test', flushIntervalMs: 100000 });
  fileLogger.info('hello'); await fileLogger.flush(); assert(fs.readFileSync(fileLogger.getLogFilePath(), 'utf8').includes('hello')); fileLogger.dispose();
  const registry = createBackendRegistry({ backends: [{ id: 'local', name: 'Local', capabilities: { supportsStreaming: true }, create: (params) => ({ params }) }], defaultBackendId: 'local' });
  assert.deepStrictEqual(registry.list(), [{ id: 'local', name: 'Local', capabilities: { supportsStreaming: true }, isDefault: true }]);
  assert.deepStrictEqual(registry.create({ sessionId: 's1' }), { params: { sessionId: 's1' } });
  assert.strictEqual(encodePath('a/b'), 'a%2Fb');
  assert.deepStrictEqual(safeParseBigIntJSON('{"value":12345678901234567}'), { value: '12345678901234567' });
  assert.deepStrictEqual(normalizeCloudAgentListItem({ id: 'a', manifest: { name: 'demo' }, currentVersion: { version: '1' } }).currentVersion.manifest, { name: 'demo' });
  assert.deepStrictEqual(extractMediaPathsFromCommand('python render.py /tmp/out.png', '/tmp'), ['/tmp/out.png']);
  assert.deepStrictEqual(extractImageToolLocalPaths({ type: 'image_gen_tool_result', images: [{ localPath: '/tmp/a.png' }] }), ['/tmp/a.png']);
  assert.strictEqual(extractPreviewUrlLocalMediaPath('file:///tmp/a.png'), '/tmp/a.png');
  const persistence = createWorkbuddySessionPersistence({
    celljs: { name: 'cell' },
    createRecordStore: (_celljs, options) => ({ kind: 'record', user: options.getCurrentUserId() }),
    createUsageStore: () => ({ kind: 'usage-store' }),
    usageServiceFactory: (options) => ({ kind: 'usage-service', ...options }),
    getCurrentUserId: () => 'user-1',
  });
  assert.deepStrictEqual(persistence.recordStore, { kind: 'record', user: 'user-1' });
  assert.strictEqual(persistence.usageCacheService.store.kind, 'usage-store');
  const deliveryUpdates = [];
  const deliveryWorker = new AutomationDeliveryOutboxWorker({ now: () => 1000, getCurrentUserId: () => 'u1', senders: { wechatmp: { send: async () => ({ success: false, retryable: true, reason: 'network', error: 'temporary' }) } }, storage: { markAutomationDeliveryFailed: async (_id, _worker, update) => { deliveryUpdates.push(update); return true; } } });
  const failure = deliveryWorker.buildFailureUpdate({ createdAt: 0, attemptCount: 0, maxAttempts: 3 }, { retryable: true, reason: 'network', error: 'temporary' }, 1000);
  assert.strictEqual(failure.status, 'retry_waiting');
  const authFailure = deliveryWorker.buildPendingAuthFailureUpdate({ createdAt: 0 }, 2_000_000_000, 'auth_not_ready', 'auth_not_ready');
  assert.strictEqual(authFailure.status, 'manual_required');
  deliveryWorker.dispose();
  const embedding = new EmbeddingClient({ authenticationManager: { currentSessionSubject: { getValue: () => ({ auth: { accessToken: 'token', domain: 'example' }, account: { uid: 'u1' } }) } }, productManager: { getEndpoint: () => 'https://api.example/' }, fetchFn: async (_url, request) => ({ ok: true, async text() { assert.strictEqual(request.headers.Authorization, 'Bearer token'); return JSON.stringify({ model: 'model2', data: [{ index: 0, embedding: [1, 0] }] }); } }) });
  const embedded = await embedding.embed({ texts: ['hello'] });
  assert.deepStrictEqual(embedded.embeddings[0].vector, [1, 0]);
  fs.rmSync(root, { recursive: true, force: true });
  console.log('package runtime tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
