'use strict';

/** Merge marketplace manifests using the WorkBuddy overlay rule: later entries win by id. */
function mergeExpertManifests(base = {}, overlays = []) {
  const categories = new Map((base.categories || []).filter((item) => item?.id).map((item) => [item.id, item]));
  const experts = new Map((base.experts || []).filter((item) => item?.id).map((item) => [item.id, item]));
  for (const overlay of overlays || []) {
    for (const item of overlay?.categories || []) if (item?.id) categories.set(item.id, item);
    for (const item of overlay?.experts || []) if (item?.id) experts.set(item.id, item);
  }
  const manifests = [base, ...(overlays || [])];
  const newest = (key) => manifests.map((item) => typeof item?.[key] === 'string' ? item[key] : '').reduce((a, b) => a >= b ? a : b, '');
  const mergedExperts = [...experts.values()];
  const mergedCategories = [...categories.values()];
  return {
    ...base,
    categories: mergedCategories,
    experts: mergedExperts,
    statistics: { totalExperts: mergedExperts.length, totalCategories: mergedCategories.length },
    version: newest('version') || base.version,
    lastUpdated: newest('lastUpdated') || base.lastUpdated,
  };
}

function normalizeMcpServers(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const source = raw.mcpServers && typeof raw.mcpServers === 'object' ? raw.mcpServers : raw;
  return Object.fromEntries(Object.entries(source).filter(([, config]) => config && typeof config === 'object' && !Array.isArray(config)));
}

function readExpertMcpDeclaration(manifest = {}, files = {}) {
  const declared = manifest.dependencies?.mcpServers ?? manifest.mcpServers;
  if (typeof declared === 'string') return normalizeMcpServers(files[declared]);
  if (Array.isArray(declared)) return declared.reduce((result, file) => Object.assign(result, normalizeMcpServers(files[file])), {});
  if (declared && typeof declared === 'object') return normalizeMcpServers(declared);
  return normalizeMcpServers(files['.mcp.json']);
}

module.exports = { mergeExpertManifests, normalizeMcpServers, readExpertMcpDeclaration };
