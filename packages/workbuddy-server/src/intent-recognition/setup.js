'use strict';
const path = require('node:path');
const { IntentRecognitionServiceToken } = require('./protocol');
const { RecallService } = require('./recall/service');
const { RecallCandidateProvider } = require('./recall/candidate-provider');
const { RecallCacheStore } = require('./recall/recall-cache-store');
const { EmbeddingClient, EMBEDDING_DEFAULT_MODEL } = require('./recall/embedding-client');
const INTENT_CACHE_SUBDIR = 'intent-cache';
function readIntentRecommendEnabled(productManager) { return productManager.getCurrentConfiguration?.()?.productFeatures?.IntentRecommend === true; }
function setupIntentRecognition(opts) {
  const { container, productManager, hostServicesPromise, connectorMcpProxy, logger = console } = opts;
  let service; try { service = container.get(IntentRecognitionServiceToken); } catch (error) { logger.warn?.('[RecallService] IntentRecognitionService not registered in container:', String(error)); return; }
  service.setEnabledResolver(() => readIntentRecommendEnabled(productManager));
  if (hostServicesPromise) hostServicesPromise.then((host) => host.plugins.start(() => service.invalidateRecall('plugin'))).catch((error) => logger.warn?.('[RecallService] subscribe plugin changes failed:', String(error)));
  connectorMcpProxy?.onToolsChanged?.(() => service.invalidateRecall('connector'));
  let lastEnabled;
  productManager.configuration?.subscribe?.(() => {
    const enabled = readIntentRecommendEnabled(productManager);
    if (enabled === lastEnabled) return;
    lastEnabled = enabled;
    if (enabled) activateRecall(service, opts); else service.setRecallService(undefined);
  });
}
function activateRecall(service, opts) {
  const provider = new RecallCandidateProvider({ connectorService: opts.connectorService, hostServicesPromise: opts.hostServicesPromise, skillsService: opts.skillsService, logger: opts.logger ?? console });
  const recall = new RecallService({ embedder: new EmbeddingClient({ authenticationManager: opts.authenticationManager, productManager: opts.productManager, fetchFn: opts.fetchFn }), cache: new RecallCacheStore(path.join(opts.resolveBundledAsset ? opts.resolveBundledAsset(opts.configDir) : opts.configDir, INTENT_CACHE_SUBDIR)), fetchCandidates: (kind) => provider.fetchCandidates(kind), model: EMBEDDING_DEFAULT_MODEL, logger: opts.logger });
  service.setRecallService(recall); recall.refresh('initial');
}
module.exports = Object.freeze({ setupIntentRecognition, readIntentRecommendEnabled, activateRecall, INTENT_CACHE_SUBDIR });
