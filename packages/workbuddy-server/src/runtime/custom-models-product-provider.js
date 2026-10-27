'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const MODEL_TAG_CUSTOM = 'custom';
const CUSTOM_LOCAL_MODEL_PREFIX = 'custom-local:';
const PRODUCT_FEATURE_CUSTOM_MODELS_JSON = 'CustomModelsJSON';
const PRODUCT_FEATURE_CUSTOM_MODEL_ID_PREFIX = 'CustomModelIdPrefix';
const MERGE_STRATEGY_SMART_MERGE = 'smartMerge';
const PRODUCT_PROVIDER_PRIORITY_ENV = 20000;

let baseProductConfigurationProvider;

function setWorkbuddyCustomModelsBaseProductConfigurationProvider(provider) {
  baseProductConfigurationProvider = typeof provider === 'function' ? provider : undefined;
}

function resolveEnvVariables(value, env = process.env) {
  if (typeof value !== 'string') return value;
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, braced, plain) => env[braced || plain] ?? '');
}

class WorkbuddyCustomModelsProductProvider {
  static FILE_WATCH_DEBOUNCE_MS = 1000;

  constructor({ fileSystem = fs, logger = console, policyService, productManager, runtimeConfigDir, homeDir = os.homedir } = {}) {
    this.fs = fileSystem;
    this.logger = logger;
    this.policyService = policyService;
    this.productManager = productManager;
    this.runtimeConfigDir = runtimeConfigDir;
    this.homeDir = homeDir;
    this.listenerRegistered = false;
    this.lastAllowed = undefined;
    this.fileWatcher = undefined;
    this.fileWatcherPath = undefined;
    this.debounceSyncTimer = undefined;
    this.priority = PRODUCT_PROVIDER_PRIORITY_ENV - 1000;
  }

  async provide(ctx = { current: {} }) {
    if (!this.fs) return {};
    const current = ctx.current || {};
    if (!current.productFeatures?.[PRODUCT_FEATURE_CUSTOM_MODELS_JSON]) {
      this.logger.info?.('disable use custom model');
      return {};
    }
    this.ensurePolicyListener();
    if (this.policyService) {
      const policy = this.policyService.getCachedSnapshot?.();
      if (!policy) {
        this.policyService.scheduleRefresh?.();
        this.lastAllowed = true;
      } else {
        this.lastAllowed = policy.allowed;
        if (!policy.allowed) {
          this.logger.info?.(`[CustomModelsProvider] policy disallow: reason=${policy.reason} mode=${policy.policy_mode} source=${policy.source}; skipping local custom models`);
          return {};
        }
      }
    }
    const userConfigPath = this.getUserConfigPath();
    this.ensureFileWatcher(userConfigPath);
    try {
      if (!this.fs.existsSync(userConfigPath)) return {};
      const parsed = JSON.parse(this.fs.readFileSync(userConfigPath, { encoding: 'utf-8' }).toString());
      const { models: rawModels, availableModels: rawAvailableModels } = this.extractUserConfig(parsed);
      const models = rawModels.map((model) => this.normalizeCustomModel(model));
      if (current.productFeatures?.[PRODUCT_FEATURE_CUSTOM_MODEL_ID_PREFIX]) {
        for (const model of models) {
          if (typeof model.id === 'string' && !model.id.startsWith(CUSTOM_LOCAL_MODEL_PREFIX)) model.id = `${CUSTOM_LOCAL_MODEL_PREFIX}${model.id}`;
        }
      }
      this.logger.info?.(`Loaded custom models config from user: ${userConfigPath} (entries=${models.length})`);
      if (Array.isArray(rawAvailableModels)) {
        let mergedAvailableModels = rawAvailableModels;
        if (current.productFeatures?.[PRODUCT_FEATURE_CUSTOM_MODEL_ID_PREFIX]) {
          const prefixedIds = rawAvailableModels
            .filter((id) => !id.startsWith(CUSTOM_LOCAL_MODEL_PREFIX))
            .map((id) => `${CUSTOM_LOCAL_MODEL_PREFIX}${id}`);
          mergedAvailableModels = Array.from(new Set([...rawAvailableModels, ...prefixedIds]));
        }
        return { models, availableModels: mergedAvailableModels, mergeStrategy: MERGE_STRATEGY_SMART_MERGE };
      }
      if (Array.isArray(current.availableModels) && current.availableModels.length > 0) {
        return {
          models,
          availableModels: Array.from(new Set([...current.availableModels, ...this.collectCustomModelIds(models)])),
          mergeStrategy: MERGE_STRATEGY_SMART_MERGE,
        };
      }
      return { models, mergeStrategy: MERGE_STRATEGY_SMART_MERGE };
    } catch (error) {
      this.logger.error?.(`Failed to load user-level custom models configuration from ${userConfigPath}`, error);
      return {};
    }
  }

  extractUserConfig(parsed) {
    if (Array.isArray(parsed)) return { models: parsed, availableModels: undefined };
    if (parsed && typeof parsed === 'object') {
      return {
        models: Array.isArray(parsed.models) ? parsed.models : [],
        availableModels: Array.isArray(parsed.availableModels) ? parsed.availableModels.filter((item) => typeof item === 'string') : undefined,
      };
    }
    return { models: [], availableModels: undefined };
  }

  collectCustomModelIds(models) {
    return models.map((model) => typeof model.id === 'string' ? model.id.trim() : '').filter(Boolean);
  }

  getUserConfigPath() {
    const configuredDir = process.env.WORKBUDDY_CONFIG_DIR?.trim() || process.env.CODEBUDDY_CONFIG_DIR?.trim();
    if (configuredDir) return path.join(configuredDir, 'models.json');
    const dataFolderName = baseProductConfigurationProvider?.()?.dataFolderName;
    if (typeof dataFolderName === 'string' && dataFolderName.trim()) return path.join(this.homeDir(), dataFolderName.trim(), 'models.json');
    return path.join(this.runtimeConfigDir || path.join(this.homeDir(), '.workbuddy'), 'models.json');
  }

  normalizeCustomModel(model) {
    const normalized = { disabled: false, ...model };
    const tags = Array.isArray(normalized.tags) ? [...normalized.tags] : [];
    if (!tags.includes(MODEL_TAG_CUSTOM)) tags.push(MODEL_TAG_CUSTOM);
    normalized.tags = tags;
    if (normalized.apiKey) normalized.apiKey = resolveEnvVariables(normalized.apiKey);
    if (normalized.url) normalized.url = resolveEnvVariables(normalized.url);
    return normalized;
  }

  ensureFileWatcher(filePath) {
    if (this.fileWatcher && this.fileWatcherPath === filePath) return;
    this.fileWatcher?.close?.();
    try {
      const watcher = this.fs.watch(path.dirname(filePath), (_, filename) => {
        if (filename?.toString() === path.basename(filePath)) this.debounceSyncForFileChange();
      });
      watcher.on?.('error', () => { watcher.close?.(); if (this.fileWatcher === watcher) this.fileWatcher = undefined; });
      this.fileWatcher = watcher;
      this.fileWatcherPath = filePath;
      this.logger.info?.(`[CustomModelsProvider] watching ${filePath} for changes`);
    } catch {}
  }

  debounceSyncForFileChange() {
    if (this.debounceSyncTimer) clearTimeout(this.debounceSyncTimer);
    this.debounceSyncTimer = setTimeout(() => {
      const productManager = this.productManager;
      if (!productManager?.sync) return;
      this.logger.info?.('[CustomModelsProvider] models.json changed, triggering sync');
      Promise.resolve(productManager.sync(true)).catch((error) => this.logger.warn?.(`[CustomModelsProvider] sync after file change failed: ${String(error)}`));
    }, WorkbuddyCustomModelsProductProvider.FILE_WATCH_DEBOUNCE_MS);
  }

  ensurePolicyListener() {
    if (this.listenerRegistered || !this.policyService?.onChanged) return;
    this.listenerRegistered = true;
    this.policyService.onChanged((snapshot) => {
      if (this.lastAllowed === undefined || this.lastAllowed === snapshot.allowed) return;
      this.lastAllowed = snapshot.allowed;
      Promise.resolve(this.productManager?.sync?.(true)).catch((error) => this.logger.warn?.(`[CustomModelsProvider] productManager.sync failed: ${String(error)}`));
    });
  }
}

module.exports = {
  WorkbuddyCustomModelsProductProvider,
  setWorkbuddyCustomModelsBaseProductConfigurationProvider,
  MODEL_TAG_CUSTOM,
  CUSTOM_LOCAL_MODEL_PREFIX,
  PRODUCT_FEATURE_CUSTOM_MODELS_JSON,
  PRODUCT_FEATURE_CUSTOM_MODEL_ID_PREFIX,
  MERGE_STRATEGY_SMART_MERGE,
};
