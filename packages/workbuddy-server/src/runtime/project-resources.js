'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_RESOURCES_DIR_NAME = 'project-resources';
const SKILL_META_FILE = '.skill-source-meta.json';
const BUILTIN_PROJECT_MCPS = Object.freeze([{ serverName: 'wb-issues', path: '/console/agent-gateway/wb-issues/_internal/issues/mcp', needsUserId: true, deferLoading: true }]);

class ProjectResourceLoader {
  constructor(configDir) { this.baseDir = path.join(configDir, PROJECT_RESOURCES_DIR_NAME); }
  async installProjectSkills(projectId, resources = {}) {
    const skills = [...(resources.connectorSkills || []).map((item) => ({ id: item.skillId, url: item.downloadUrl })), ...(resources.projectSkills || []).map((item) => ({ id: item.name, url: item.downloadUrl }))];
    const projectDir = path.join(this.baseDir, projectId);
    if (!skills.length) { if (fs.existsSync(projectDir)) this.syncSkillDisableState(projectDir, new Set()); return { skillDir: undefined, installedSkills: 0, failedSkills: [] }; }
    fs.mkdirSync(projectDir, { recursive: true });
    const result = { skillDir: projectDir, installedSkills: 0, failedSkills: [] };
    for (const skill of skills) {
      try { await this.downloadAndInstallSkill(projectDir, skill.id, skill.url); result.installedSkills += 1; }
      catch { result.failedSkills.push(skill.id); }
    }
    this.syncSkillDisableState(projectDir, new Set(skills.map((skill) => skill.id)));
    return result;
  }
  syncSkillDisableState(projectDir, activeIds) {
    try { for (const entry of fs.readdirSync(projectDir, { withFileTypes: true })) if (entry.isDirectory()) this.setSkillDisabled(path.join(projectDir, entry.name), !activeIds.has(entry.name)); } catch {}
  }
  setSkillDisabled(skillDir, disabled) {
    const file = path.join(skillDir, 'SKILL.md'); if (!fs.existsSync(file)) return;
    const content = fs.readFileSync(file, 'utf8'); const next = updateSkillFrontmatterDisable(content, disabled); if (next !== content) fs.writeFileSync(file, next, 'utf8');
  }
  async downloadAndInstallSkill(projectDir, skillId, downloadUrl) {
    if (typeof this.downloadAndExtract === 'function') return this.downloadAndExtract(projectDir, skillId, downloadUrl);
    throw new Error('ProjectResourceLoader requires downloadAndExtract for network installs');
  }
}

function updateSkillFrontmatterDisable(content, disabled) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return disabled ? `---\ndisable: true\n---\n\n${content}` : content;
  const body = content.slice(match[0].length); const frontmatter = match[1];
  const hasDisable = /^disable\s*:/m.test(frontmatter);
  const next = disabled ? (hasDisable ? frontmatter.replace(/^disable\s*:.*/m, 'disable: true') : `${frontmatter}\ndisable: true`) : frontmatter.split(/\r?\n/).filter((line) => !/^disable\s*:/m.test(line)).join('\n');
  return `---\n${next}\n---\n${body}`;
}

class ProjectResourceManager {
  constructor(deps) {
    this.configDir = deps.configDir; this.loader = deps.loader || new ProjectResourceLoader(deps.configDir);
    this.projectStates = new Map(); this.sessionProjectMap = new Map();
    this.getToken = deps.getToken; this.getEndpoint = deps.getEndpoint; this.getUserId = deps.getUserId;
  }
  setTokenProvider(provider) { this.getToken = provider; }
  setEndpointProvider(provider) { this.getEndpoint = provider; }
  setUserIdProvider(provider) { this.getUserId = provider; }
  async registerSession(sessionId, projectId, resources = {}) { this.sessionProjectMap.set(sessionId, projectId); const state = await this.buildProjectState(projectId, resources); this.projectStates.set(projectId, state); this.persistOrRemoveMcp(projectId, state.mcpConfigJson); return this.buildEnv(state); }
  registerSessionFromRecord(sessionId, projectId) { this.sessionProjectMap.set(sessionId, projectId); if (!this.projectStates.has(projectId)) { const state = this.restoreProjectState(projectId); if (state) this.projectStates.set(projectId, state); } }
  getEnvForSession(sessionId) { const state = this.getStateForSession(sessionId); return state ? this.buildEnv(state) : undefined; }
  getMcpServersForSession(sessionId) {
    const projectId = this.sessionProjectMap.get(sessionId); const state = this.getStateForSession(sessionId); if (!projectId || !state?.mcpConfigJson) return undefined;
    try {
      const parsed = JSON.parse(state.mcpConfigJson); const servers = {};
      for (const [name, config] of Object.entries(parsed.mcpServers || {})) {
        if (config.disabled) continue;
        const sanitized = sanitizeMcpServerConfig(config); const builtin = BUILTIN_PROJECT_MCPS.find((item) => item.serverName === name); const headers = { ...(sanitized.headers || {}) };
        const token = this.getToken?.(); const userId = this.getUserId?.();
        if (token) headers.Authorization = `Bearer ${token}`; if (builtin?.needsUserId && userId) headers['x-user-id'] = userId; headers['x-project-id'] = projectId;
        servers[name] = { url: sanitized.url, type: sanitized.type || 'http', description: sanitized.description, defer_loading: builtin?.deferLoading ?? sanitized.defer_loading ?? false, ...(Object.keys(headers).length ? { headers } : {}) };
      }
      return Object.keys(servers).length ? servers : undefined;
    } catch { return undefined; }
  }
  async refreshProjectResources(projectId, resources) { const state = await this.buildProjectState(projectId, resources); this.projectStates.set(projectId, state); this.persistOrRemoveMcp(projectId, state.mcpConfigJson); }
  async buildProjectState(projectId, resources = {}) { const loaded = await this.loader.installProjectSkills(projectId, resources); return { skillDir: loaded.skillDir, mcpConfigJson: this.buildMcpConfigJson(projectId, resources) }; }
  buildMcpConfigJson(projectId, resources = {}) {
    const mcpServers = {}; const existing = this.projectStates.get(projectId) || this.restoreProjectState(projectId);
    if (existing?.mcpConfigJson) try { for (const [name, config] of Object.entries(JSON.parse(existing.mcpConfigJson).mcpServers || {})) mcpServers[name] = { ...sanitizeMcpServerConfig(config), disabled: true }; } catch {}
    for (const item of resources.mcpServers || []) mcpServers[item.serverName] = { url: item.gatewayUrl, type: item.transport || 'http', defer_loading: true, description: `Project connector MCP server: ${item.connectorName}` };
    const endpoint = this.getEndpoint?.()?.replace(/\/+$/, '');
    if (endpoint) for (const builtin of BUILTIN_PROJECT_MCPS) mcpServers[builtin.serverName] = { url: endpoint + builtin.path, type: 'http', defer_loading: builtin.deferLoading, description: builtin.description };
    return Object.keys(mcpServers).length ? JSON.stringify({ mcpServers }) : undefined;
  }
  buildEnv(state) { return state.skillDir ? { CODEBUDDY_SESSION_SKILL_DIRS: state.skillDir } : {}; }
  getStateForSession(sessionId) { const projectId = this.sessionProjectMap.get(sessionId); if (!projectId) return undefined; return this.projectStates.get(projectId) || this.restoreProjectState(projectId); }
  persistOrRemoveMcp(projectId, json) { if (json) { const dir = path.join(this.configDir, PROJECT_RESOURCES_DIR_NAME, projectId); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'mcp.json'), sanitizeMcpConfigJson(json)); } else { try { fs.unlinkSync(path.join(this.configDir, PROJECT_RESOURCES_DIR_NAME, projectId, 'mcp.json')); } catch {} } }
  restoreProjectState(projectId) { const dir = path.join(this.configDir, PROJECT_RESOURCES_DIR_NAME, projectId); if (!fs.existsSync(dir)) return undefined; const state = {}; try { if (fs.readdirSync(dir).some((entry) => entry !== 'mcp.json')) state.skillDir = dir; } catch {} try { state.mcpConfigJson = sanitizeMcpConfigJson(fs.readFileSync(path.join(dir, 'mcp.json'), 'utf8')); } catch {} return state.skillDir || state.mcpConfigJson ? state : undefined; }
}

function sanitizeMcpServerConfig(config = {}) { const next = { ...config }; if (next.headers) { next.headers = { ...next.headers }; delete next.headers.Authorization; delete next.headers.authorization; if (!Object.keys(next.headers).length) delete next.headers; } return next; }
function sanitizeMcpConfigJson(json) { try { const parsed = JSON.parse(json); for (const [name, config] of Object.entries(parsed.mcpServers || {})) parsed.mcpServers[name] = sanitizeMcpServerConfig(config); return JSON.stringify(parsed); } catch { return json; } }

module.exports = Object.freeze({ BUILTIN_PROJECT_MCPS, PROJECT_RESOURCES_DIR_NAME, SKILL_META_FILE, ProjectResourceLoader, ProjectResourceManager, sanitizeMcpConfigJson, sanitizeMcpServerConfig, updateSkillFrontmatterDisable });
