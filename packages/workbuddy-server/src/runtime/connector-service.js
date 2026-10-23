'use strict';

const { ConnectorMarketplaceService } = require('./connector-marketplace-service');
const { mergeConnectorMcpServers, writeConnectorMcpConfig } = require('./connector-mcp-config-writer');
const { ConnectorServiceState } = require('./connector-service-state');
const { disableConnectorSkills } = require('./connector-skill-state');

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
    this.marketplace = options.marketplace || (options.marketplaceCache ? new ConnectorMarketplaceService({ cache: options.marketplaceCache, ...options.marketplaceOptions }) : undefined);
  }

  async init() {
    this.writeConnectorMcpConfig();
    return this.snapshot();
  }

  async connect(configId, config, options) {
    const result = await this.state.connect(configId, config, options);
    if (result.success && !this.state.persistentState.enabled.includes(configId)) this.state.persistentState.enabled.push(configId);
    if (result.success) this.writeConnectorMcpConfig();
    return result;
  }

  async disconnect(configId, options) {
    const result = await this.state.disconnect(configId, options);
    this.state.persistentState.enabled = this.state.persistentState.enabled.filter((id) => id !== configId);
    this.writeConnectorMcpConfig();
    if (this.connectorSkillsRoot) disableConnectorSkills(`${this.connectorSkillsRoot}/connector-${configId}`, { logger: this.logger });
    return result;
  }

  async sync(desiredConfigs) { return this.state.sync(desiredConfigs); }

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
