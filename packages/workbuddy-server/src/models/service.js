'use strict';
class ModelsService {
  constructor(deps) { this.http = deps.context.http; this.accountProvider = deps.context.accountProvider; }
  async getTeamsModels() { const accountId = this.accountProvider?.()?.enterpriseId || 'personal'; const response = await this.http.get(`/console/enterprises/${accountId}/models`); const payload = response.data ?? response; const models = payload.models ?? []; const ids = (payload.agents ?? []).find((agent) => agent.name === 'cli')?.models ?? []; return (ids.length ? models.filter((model) => ids.includes(model.id)) : models).map(toModelInfo); }
}
function toModelInfo(model) { return { id: model.id, name: model.name ?? model.id, description: model.description, credits: model.credits, configurable: model.configurable, configured: model.configured, isDefault: model.isDefault, supportsImages: model.supportsImages, supportsReasoning: model.supportsReasoning, onlyReasoning: model.onlyReasoning, reasoning: model.reasoning, disabledMultimodal: model.disabledMultimodal, disabled: model.disabled, disabledReason: model.disabledReason, disabledAction: model.disabledAction }; }
module.exports = Object.freeze({ ModelsService, toModelInfo });
