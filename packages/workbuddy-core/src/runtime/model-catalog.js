'use strict';

function parseHost(url) {
  if (!url) return undefined;
  try { return new URL(url).hostname.toLowerCase(); } catch { return undefined; }
}

function stripNamespacePrefix(modelId, stripCustomLocalModelPrefix = (value) => value) {
  const stripped = stripCustomLocalModelPrefix(modelId);
  const slashIndex = stripped.lastIndexOf('/');
  const colonIndex = stripped.lastIndexOf(':');
  const index = Math.max(slashIndex, colonIndex);
  return index >= 0 ? stripped.slice(index + 1) : stripped;
}

function providerMatches(provider, baseUrl, names, hosts) {
  return names.includes(provider) || hosts.some((host) => baseUrl.includes(host));
}

function deriveMaxTokensField(entry) {
  if (entry.compat?.maxTokensField === 'max_tokens' || entry.compat?.maxTokensField === 'max_completion_tokens') return entry.compat.maxTokensField;
  if (['openai-responses', 'openai-codex-responses', 'azure-openai-responses'].includes(entry.api)) return 'max_completion_tokens';
  if (entry.api !== 'openai-completions') return undefined;
  const baseUrl = entry.baseUrl ?? '';
  const provider = entry.provider ?? '';
  return providerMatches(provider, baseUrl, ['moonshotai', 'moonshotai-cn', 'together', 'cloudflare-ai-gateway'], ['api.moonshot.', 'api.together.ai', 'api.together.xyz', 'gateway.ai.cloudflare.com', 'chutes.ai']) ? 'max_tokens' : 'max_completion_tokens';
}

function deriveThinkingFormat(entry) {
  if (typeof entry.compat?.thinkingFormat === 'string') return entry.compat.thinkingFormat;
  if (entry.api !== 'openai-completions') return undefined;
  const baseUrl = entry.baseUrl ?? '';
  const provider = entry.provider ?? '';
  if (providerMatches(provider, baseUrl, ['deepseek'], ['deepseek.com'])) return 'deepseek';
  if (providerMatches(provider, baseUrl, ['zai'], ['api.z.ai'])) return 'zai';
  if (providerMatches(provider, baseUrl, ['together'], ['api.together.ai', 'api.together.xyz'])) return 'together';
  if (providerMatches(provider, baseUrl, ['openrouter'], ['openrouter.ai'])) return 'openrouter';
  return 'openai';
}

function deriveSupportsReasoningEffort(entry) {
  if (typeof entry.compat?.supportsReasoningEffort === 'boolean') return entry.compat.supportsReasoningEffort;
  if (entry.api !== 'openai-completions') return undefined;
  const baseUrl = entry.baseUrl ?? '';
  const provider = entry.provider ?? '';
  return !providerMatches(provider, baseUrl, ['xai'], ['api.x.ai'])
    && !providerMatches(provider, baseUrl, ['zai'], ['api.z.ai'])
    && !providerMatches(provider, baseUrl, ['moonshotai', 'moonshotai-cn'], ['api.moonshot.'])
    && !providerMatches(provider, baseUrl, ['together'], ['api.together.ai', 'api.together.xyz'])
    && !providerMatches(provider, baseUrl, ['cloudflare-ai-gateway'], ['gateway.ai.cloudflare.com']);
}

function pickCatalogEntry(entries, requestHost, providerPriority = []) {
  if (entries.length === 1) return entries[0];
  if (requestHost) {
    for (const entry of entries) if (parseHost(entry.baseUrl) === requestHost) return entry;
    for (const entry of entries) {
      const host = parseHost(entry.baseUrl);
      if (host && requestHost.endsWith(`.${host}`)) return entry;
    }
  }
  for (const provider of providerPriority) {
    const match = entries.find((entry) => entry.provider === provider);
    if (match) return match;
  }
  return entries[0];
}

function resolveModelCapabilitiesFromCatalog(modelId, catalog, options = {}) {
  if (!modelId || !catalog) return undefined;
  let entries = catalog.byId?.get(modelId) ?? catalog[modelId];
  const stripped = stripNamespacePrefix(modelId, options.stripCustomLocalModelPrefix);
  if (!entries && stripped !== modelId) entries = catalog.byId?.get(stripped) ?? catalog[stripped];
  if (!entries?.length) return undefined;
  const entry = pickCatalogEntry(entries, options.requestHost ?? parseHost(options.requestUrl), options.providerPriority);
  const compat = entry.compat;
  return {
    contextWindow: entry.contextWindow,
    maxTokens: entry.maxTokens,
    maxTokensField: deriveMaxTokensField(entry),
    thinkingLevelMap: entry.thinkingLevelMap,
    reasoning: entry.reasoning,
    api: entry.api,
    thinkingFormat: deriveThinkingFormat(entry),
    supportsReasoningEffort: deriveSupportsReasoningEffort(entry),
    requiresReasoningContentOnAssistantMessages: typeof compat?.requiresReasoningContentOnAssistantMessages === 'boolean' ? compat.requiresReasoningContentOnAssistantMessages : undefined,
    requiresToolResultName: typeof compat?.requiresToolResultName === 'boolean' ? compat.requiresToolResultName : undefined,
  };
}

function enrichLanguageModelFromCatalog(model, catalog, options = {}) {
  const capabilities = resolveModelCapabilitiesFromCatalog(model.id, catalog, options);
  if (!capabilities) return model;
  if (model.maxInputTokens === undefined && capabilities.contextWindow !== undefined) model.maxInputTokens = capabilities.contextWindow;
  if (model.maxOutputTokens === undefined && capabilities.maxTokens !== undefined) model.maxOutputTokens = capabilities.maxTokens;
  if (model.supportsReasoning === undefined && capabilities.reasoning !== undefined) model.supportsReasoning = capabilities.reasoning;
  if (model.thinkingLevelMap === undefined && capabilities.thinkingLevelMap !== undefined) model.thinkingLevelMap = capabilities.thinkingLevelMap;
  const supplement = options.supplements?.[model.id];
  if (supplement) {
    if (model.onlyReasoning === undefined && supplement.onlyReasoning !== undefined) model.onlyReasoning = supplement.onlyReasoning;
    const reasoning = { ...model.reasoning };
    let changed = false;
    for (const key of ['canDisableThinking', 'defaultEffort', 'supportedEfforts']) if (reasoning[key] === undefined && supplement[key] !== undefined) { reasoning[key] = supplement[key]; changed = true; }
    if (changed) model.reasoning = reasoning;
  }
  return model;
}

module.exports = { deriveMaxTokensField, deriveSupportsReasoningEffort, deriveThinkingFormat, enrichLanguageModelFromCatalog, parseHost, pickCatalogEntry, resolveModelCapabilitiesFromCatalog, stripNamespacePrefix };
