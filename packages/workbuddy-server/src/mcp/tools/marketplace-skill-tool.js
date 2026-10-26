'use strict';

const SEARCH_TOOL_NAME = 'workbuddy_search_marketplace_skill';
const INSTALL_TOOL_NAME = 'workbuddy_install_marketplace_skill';
const MARKETPLACE_SKILL_TOOL_NAME = 'workbuddy_marketplace_skill';

function isRemoteNewer(remote, local) {
  if (!remote || !local) return Boolean(remote && !local);
  const parse = (value) => {
    const match = String(value).match(/\d+(?:\.\d+){0,2}/);
    return match ? match[0].split('.').map(Number) : undefined;
  };
  const remoteVersion = parse(remote);
  const localVersion = parse(local);
  if (!remoteVersion || !localVersion) return remote.trim() !== local.trim();
  for (let index = 0; index < 3; index++) {
    const difference = (remoteVersion[index] || 0) - (localVersion[index] || 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

function textResult(value, isError = false) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }], ...(isError ? { isError: true } : {}) };
}

function createMarketplaceSkillSearchTool({ skillsService }) {
  return {
    name: SEARCH_TOOL_NAME,
    description: 'Search WorkBuddy 推荐市场 for Skills by keyword.',
    inputSchema: { type: 'object', properties: { keyword: { type: 'string' }, limit: { type: 'number' } }, required: ['keyword'] },
    handler: async (args) => {
      const keyword = typeof args?.keyword === 'string' ? args.keyword.trim() : '';
      if (!keyword) return textResult({ success: false, error: 'keyword parameter is required and must be non-empty.' }, true);
      const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(args.limit, 20) : 5;
      try {
        const [list, installed] = await Promise.all([
          skillsService.getBuiltinMarketList({ keyword, page: 1, pageSize: limit }),
          skillsService.getBuiltinMarketInstalledMetas(),
        ]);
        if (list.code !== 0) return textResult({ success: false, error: `[BUILTIN_MARKET_ERROR] ${list.msg || 'unknown error'}`, code: list.code }, true);
        const results = [];
        for (const skill of list.data?.skills || []) {
          const skillId = skill.id || skill.skill_id;
          if (!skillId) continue;
          const meta = installed.find((item) => item.skillId === skillId || (!item.skillId && (item.name === skill.name || item.skillName === skill.name)));
          results.push({ skillId, name: skill.name, version: skill.version, description: skill.description_zh || skill.description || skill.description_en || '', categories: skill.categories || [], installedVersion: meta?.version || null, installed: Boolean(meta), updateAvailable: isRemoteNewer(skill.version, meta?.version || null) });
        }
        return textResult({ success: true, keyword, total: list.data?.total_count ?? results.length, results });
      } catch (error) { return textResult({ success: false, error: `[BUILTIN_MARKET_ERROR] ${error?.message || String(error)}` }, true); }
    },
  };
}

function createMarketplaceSkillInstallTool({ skillsService }) {
  return {
    name: INSTALL_TOOL_NAME,
    description: 'Install a Skill from WorkBuddy 推荐市场 by skillId.',
    inputSchema: { type: 'object', properties: { skillId: { type: 'string' }, version: { type: 'string' } }, required: ['skillId'] },
    handler: async (args) => {
      const skillId = typeof args?.skillId === 'string' ? args.skillId.trim() : '';
      const version = typeof args?.version === 'string' && args.version.trim() ? args.version.trim() : undefined;
      if (!skillId) return textResult({ success: false, error: 'skillId parameter is required.' }, true);
      try {
        const response = await skillsService.getBuiltinMarketByIds([skillId]);
        if (response.code !== 0) return textResult({ success: false, skillId, error: `[BUILTIN_MARKET_ERROR] ${response.msg || 'unknown error'}`, code: response.code }, true);
        const detail = response.data?.skills?.[0];
        if (!detail) return textResult({ success: false, skillId, error: `[UNKNOWN_SKILL_ID] skillId "${skillId}" was not found in 推荐市场.` }, true);
        const result = await skillsService.installBuiltinMarketSkill({ skillId, version, name: detail.description?.trim() || detail.name, skillName: detail.name, icon: detail.icon, examples_zh: detail.examples_zh, examples_en: detail.examples_en });
        if (!result.success) return textResult({ success: false, skillId, skillName: result.skillName, error: result.errorMessage || 'install failed' }, true);
        return textResult({ success: true, skillId, skillName: result.skillName, version: result.version, refreshHint: 'skills', message: `Skill ${result.skillName}(v${result.version || '-'}) 已安装到 ~/.workbuddy/skills/` });
      } catch (error) { return textResult({ success: false, skillId, error: `[INSTALL_ERROR] ${error?.message || String(error)}` }, true); }
    },
  };
}

function createMarketplaceSkillTool(deps) {
  const search = createMarketplaceSkillSearchTool(deps);
  const install = createMarketplaceSkillInstallTool(deps);
  return {
    name: MARKETPLACE_SKILL_TOOL_NAME,
    description: 'Search or install Skills from WorkBuddy 推荐市场.',
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['search', 'install'] }, keyword: { type: 'string' }, limit: { type: 'number' }, skillId: { type: 'string' }, version: { type: 'string' } }, required: ['action'] },
    handler: (args, context) => args?.action === 'search' ? search.handler(args, context) : args?.action === 'install' ? install.handler(args, context) : textResult({ success: false, error: `action must be "search" or "install", got "${args?.action || ''}".` }, true),
  };
}

module.exports = { SEARCH_TOOL_NAME, INSTALL_TOOL_NAME, MARKETPLACE_SKILL_TOOL_NAME, isRemoteNewer, createMarketplaceSkillSearchTool, createMarketplaceSkillInstallTool, createMarketplaceSkillTool };
