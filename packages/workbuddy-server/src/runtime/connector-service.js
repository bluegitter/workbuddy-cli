'use strict';

const { ConnectorMarketplaceService } = require('./connector-marketplace-service');
const { mergeConnectorMcpServers, writeConnectorMcpConfig } = require('./connector-mcp-config-writer');
const { ConnectorServiceState } = require('./connector-service-state');
const { disableConnectorSkills } = require('./connector-skill-state');
const { ConnectorAuthCoordinator } = require('./connector-auth-coordinator');
const { listMcpServers } = require('./mcp-server-listing');

/**
 * Readable composition root for connector operations. The concrete auth/MCP
 * implementations stay injectable while lifecycle policy remains centralized.
 */
class ConnectorService {
  constructor(options = {}) {
    this.logger = options.logger || { info() {}, warn() {} };
    this.manifest = options.manifest || { connectors: [] };
    this.configDir = options.configDir;
    this.connectorSkillsRoot = options.connectorSkillsRoot;
    this.connectorMcpConfigPath = options.connectorMcpConfigPath;
    this.readConnectorMcpConfig = options.readConnectorMcpConfig || (() => undefined);
    this.toProxyConfigId = options.toProxyConfigId || ((id) => id);
    this.state = options.state || new ConnectorServiceState({
      persistentState: options.persistentState,
      connect: options.connect,
      disconnect: options.disconnect,
      onStateChanged: options.onStateChanged,
      logger: this.logger,
    });
    this.auth = options.authCoordinator || new ConnectorAuthCoordinator({
      tokenRefreshService: options.tokenRefreshService,
      serverSideOauthRefresher: options.serverSideOauthRefresher,
      ioaAuth: options.ioaAuth,
      resolveConnectorName: options.resolveConnectorName,
      isServerSideAuth: options.isServerSideAuth,
      logger: this.logger,
    });
    this.marketplace = options.marketplace || (options.marketplaceCache ? new ConnectorMarketplaceService({ cache: options.marketplaceCache, ...options.marketplaceOptions }) : undefined);
    this.readCustomMcpConfig = options.readCustomMcpConfig || (() => ({ mcpServers: {} }));
    this.readPluginMcpConfigs = options.readPluginMcpConfigs || (() => ({}));
    this.getClientEntry = options.getClientEntry || (() => undefined);
    this.getTrustLists = options.getTrustLists || (() => ({ whitelist: [], blacklist: [] }));
    this.isUserServerApproved = options.isUserServerApproved || (() => false);
    this.getLastApprovedAt = options.getLastApprovedAt || (() => undefined);
    this.resolveDisabledToolNames = options.resolveDisabledToolNames || ((name, configured) => new Set([...(Array.isArray(configured) ? configured : []), ...(this.persistentState.disabledToolsOverrides?.[name] || [])]));
  }

  async init() {
    this.writeConnectorMcpConfig();
    return this.snapshot();
  }

  async connect(configId, config, options) {
    const authResult = await this.auth.prepareConnect(configId, config, options);
    if (!authResult.success) return authResult;
    const result = await this.state.connect(configId, authResult.config, options);
    if (result.success && !this.state.persistentState.enabled.includes(configId)) this.state.persistentState.enabled.push(configId);
    if (result.success) {
      await this.auth.connected(configId, authResult.config, options);
      this.writeConnectorMcpConfig();
    }
    return result;
  }

  async disconnect(configId, options) {
    const result = await this.state.disconnect(configId, options);
    this.auth.disconnected(configId);
    this.state.persistentState.enabled = this.state.persistentState.enabled.filter((id) => id !== configId);
    this.writeConnectorMcpConfig();
    if (this.connectorSkillsRoot) disableConnectorSkills(`${this.connectorSkillsRoot}/connector-${configId}`, { logger: this.logger });
    return result;
  }

  async sync(desiredConfigs) { return this.state.sync(desiredConfigs); }

  listMcpServers() {
    const trust = this.getTrustLists() || {};
    return listMcpServers({
      customConfig: this.readCustomMcpConfig(),
      pluginConfigs: this.readPluginMcpConfigs(),
      getClientEntry: this.getClientEntry,
      customPrefix: 'custom-mcp:',
      whitelist: trust.whitelist || trust.WHITELIST_HASHES,
      blacklist: trust.blacklist || trust.BLACKLIST_HASHES,
      isApproved: this.isUserServerApproved,
      lastApprovedAt: this.getLastApprovedAt,
      resolveDisabledToolNames: this.resolveDisabledToolNames,
    });
  }

  writeConnectorMcpConfig() {
    if (!this.connectorMcpConfigPath) return undefined;
    const config = mergeConnectorMcpServers(this.manifest, { enabled: this.state.persistentState.enabled, readConnectorMcpConfig: this.readConnectorMcpConfig, toProxyConfigId: this.toProxyConfigId });
    return writeConnectorMcpConfig(this.connectorMcpConfigPath, config);
  }

  async syncMarketplace(url, marketplaceName) {
    if (!this.marketplace) throw new Error('marketplace service is unavailable');
    return this.marketplace.downloadAndReplace(url, marketplaceName);
  }

  snapshot() { return this.state.snapshot(); }
}

module.exports = { ConnectorService };
