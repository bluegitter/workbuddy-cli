'use strict';
const { RECALL_KIND } = require('./recall-cache-store');
const { PLUGIN_STATUS, CONNECTOR_RECALL_STATUS, SKILL_STATUS } = require('../protocol');
const { isSkillAllowed, isPluginAllowed, isConnectorAllowed } = require('./candidate-allowlist');
const { buildRecallText, getCandidateAugmentation } = require('./candidate-augmentation');

class RecallCandidateProvider {
  constructor(deps) { this.deps = deps; }
  async fetchCandidates(kind) {
    if (kind === RECALL_KIND.Skill) { const skills = await this.getHiddenSkills(); return skills === null ? null : skills.filter((s) => s.description).map((s) => ({ kind, id: s.name, text: buildRecallText(kind, s.name, s.description, getCandidateAugmentation(kind, s.name)), status: s.status })); }
    if (kind === RECALL_KIND.Plugin) { const plugins = await this.getMarketplacePluginHints(); return plugins === null ? null : plugins.map((p) => ({ kind, id: p.id, text: buildRecallText(kind, p.name, p.description, getCandidateAugmentation(kind, p.name)), status: p.status })); }
    if (kind === RECALL_KIND.Connector) { const list = await this.getDisconnectedConnectors(); return list === null ? null : list.filter((c) => c.description).map((c) => ({ kind, id: c.id, text: buildRecallText(kind, c.name, c.description, getCandidateAugmentation(kind, c.id)), status: c.status })); }
    return undefined;
  }
  async getMarketplacePluginHints() {
    if (!this.deps.hostServicesPromise) { this.deps.logger?.warn?.('[IntentRecognition] hostServices not bound, skip getMarketplacePluginHints'); return null; }
    let plugins; let marketplaces;
    try { ({ plugins } = await this.deps.hostServicesPromise); marketplaces = await plugins.getPluginMarketplaces(false); } catch (error) { this.deps.logger?.warn?.('[IntentRecognition] getPluginMarketplaces failed:', error); return null; }
    const hints = []; let browsedAny = false;
    for (const marketplace of marketplaces) try { const list = await plugins.getMarketplacePlugins(marketplace.name, false); browsedAny = true; for (const plugin of list) { if (!plugin.description || !isPluginAllowed(plugin.name)) continue; const status = plugin.status ?? (plugin.installed ? PLUGIN_STATUS.Enabled : PLUGIN_STATUS.NotInstalled); if (status !== PLUGIN_STATUS.Enabled) hints.push({ id: `${plugin.name}@${plugin.marketplaceName}`, name: plugin.name, marketplaceName: plugin.marketplaceName, description: plugin.description, status }); } } catch (error) { this.deps.logger?.warn?.(`[IntentRecognition] browse marketplace "${marketplace.name}" failed:`, error); }
    if (marketplaces.length > 0 && !browsedAny) return null;
    return hints;
  }
  async getDisconnectedConnectors() {
    if (!this.deps.connectorService) { this.deps.logger?.warn?.('[IntentRecognition] ConnectorService not available'); return null; }
    let states; let configs;
    try { [states, configs] = await Promise.all([this.deps.connectorService.getStates(), this.deps.connectorService.getConfigs()]); } catch (error) { this.deps.logger?.warn?.('[IntentRecognition] getDisconnectedConnectors failed:', error); return null; }
    return configs.filter((config) => isConnectorAllowed(config.id)).filter((config) => states[config.id]?.status !== 'connected').map((config) => ({ id: config.id, name: config.name, description: config.description, status: states[config.id]?.everConnected ? CONNECTOR_RECALL_STATUS.EverConnected : CONNECTOR_RECALL_STATUS.NeverConnected }));
  }
  async getHiddenSkills() {
    if (!this.deps.skillsService) { this.deps.logger?.warn?.('[IntentRecognition] skillsService not bound, skip getHiddenSkills'); return []; }
    try { const result = await this.deps.skillsService.getSkillList({ excludePluginSkills: true }); return result.results.filter((skill) => skill.source === 'builtin' && skill.description && isSkillAllowed(skill.name)).map((skill) => ({ name: skill.name, description: skill.description, status: skill.disable ? SKILL_STATUS.Disabled : SKILL_STATUS.Enabled })); } catch (error) { this.deps.logger?.warn?.('[IntentRecognition] getHiddenSkills failed:', error); return null; }
  }
}
module.exports = Object.freeze({ RecallCandidateProvider });
