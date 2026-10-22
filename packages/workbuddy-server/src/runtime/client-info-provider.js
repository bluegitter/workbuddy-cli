'use strict';

const crypto = require('crypto');
const fs = require('fs');

const WORKBUDDY_PLUGIN_NAME = 'workbuddy-desktop';
const WORKBUDDY_PLATFORM = 'WorkBuddy';

class ClientInfoProvider {
  constructor(options = {}) {
    this.productManager = options.productManager || { getCurrentConfiguration: () => ({}) };
    this.filePathService = options.filePathService;
    this.assetResolver = options.assetResolver;
    this.runtimeVersion = options.runtimeVersion || (() => process.env.WORKBUDDY_VERSION || '0.0.0');
    this.machineId = options.machineId || (() => undefined);
    this.env = options.env || process.env;
    this.fallbackSessionId = options.sessionId || crypto.randomUUID();
    this.clientInfo = undefined;
    this.listeners = new Set();
    this.downloadChannelProbeStarted = false;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  initialize() {
    this.initClientInfo();
    this.productManager.configuration?.subscribe?.(() => this.initClientInfo());
  }

  get() { return Promise.resolve(this.clientInfo || this.initClientInfo()); }

  initClientInfo() {
    const product = this.productManager.getCurrentConfiguration?.() || {};
    const envInfo = this.getProcessEnvInfo();
    const fallbackVersion = this.runtimeVersion();
    const platform = product.applicationName || WORKBUDDY_PLATFORM;
    const info = {
      machineId: this.machineId(), sessionId: this.fallbackSessionId, platform,
      platformVersion: product.platformVersion || fallbackVersion,
      productName: this.resolveProductName(product.productName || ''),
      applicationName: product.applicationName || '', productVersion: product.productVersion || fallbackVersion,
      pluginName: WORKBUDDY_PLUGIN_NAME, pluginVersion: fallbackVersion, ideType: platform,
      downloadChannel: product.downloadChannel, userAgentExtension: this.resolveBundledCliUserAgent(), ...envInfo,
    };
    if (envInfo.platform && !envInfo.ideType) info.ideType = this.resolveIdeType(envInfo.platform);
    this.filePathService?.setIDEType?.(info.ideType || 'VSCode');
    this.clientInfo = info;
    for (const listener of this.listeners) listener(info);
    return info;
  }

  getProcessEnvInfo() {
    const keys = { platform: 'CODEBUDDY_CLIENT_PLATFORM', platformVersion: 'CODEBUDDY_CLIENT_PLATFORM_VERSION', ideType: 'CODEBUDDY_CLIENT_IDE_TYPE', downloadChannel: 'CODEBUDDY_CLIENT_INFO_DOWNLOAD_CHANNEL' };
    return Object.fromEntries(Object.entries(keys).filter(([, envKey]) => this.env[envKey]).map(([key, envKey]) => [key, this.env[envKey]]));
  }

  resolveProductName(fallback) {
    const product = this.readAsset('product.json');
    return typeof product?.productName === 'string' && product.productName ? product.productName : fallback;
  }

  resolveBundledCliUserAgent() {
    const pkg = this.readAsset('cli', 'package.json');
    const version = pkg?.version && pkg.version !== '0.0.0' ? pkg.version : pkg?.publishConfig?.customPackage?.version;
    return version ? `CLI/${version}` : undefined;
  }

  readAsset(...segments) {
    const file = this.assetResolver?.(...segments);
    if (!file) return undefined;
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return undefined; }
  }

  resolveIdeType(platform) { return platform === 'vscode' ? 'VSCode' : platform; }
}

function createDevEndpointProvider(resolver = { resolve: () => undefined }) {
  return { priority: -1000, provide: async () => { const endpoint = resolver.resolve?.(); return endpoint ? { endpoint } : {}; } };
}

module.exports = Object.freeze({ ClientInfoProvider, createDevEndpointProvider, WORKBUDDY_PLATFORM, WORKBUDDY_PLUGIN_NAME });
