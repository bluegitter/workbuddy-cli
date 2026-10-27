'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  computeDeployTargetId,
  computeWorkspaceKey,
  computeRelativePath,
  detectEntryHtml,
  findLatestDeployRecord,
  addDeployRecord,
  queryDeployHistory,
  addUnpublishRecord,
} = require('./deploy-history');

const ENV_PRESETS = Object.freeze({
  external: Object.freeze({ paasApi: 'https://api.ap-beijing.sandbox.cloudstudio.club', wsDomain: 'e2b.ap-beijing.sandbox.cloudstudio.club', wsScheme: 'https' }),
  internal: Object.freeze({ paasApi: 'http://api.tc-nanjing.sandbox.codebuddy.woa.com', wsDomain: 'e2b.tc-nanjing.sandbox.codebuddy.woa.com', wsScheme: 'http' }),
});
const PORT_API = 65213;
const PORT_PTY = 65310;
const REMOTE_ROOT = '/workspace';
const ARCHIVE_NAME = 'deploy-bundle.tar.gz';
const DEFAULT_PORT = 3000;
const READY_TIMEOUT_MS = 120000;
const READY_POLL_INTERVAL_MS = 3000;
const SERVE_JS = 'const http=require("http"),fs=require("fs"),path=require("path");const port=parseInt(process.env.PORT||"3000",10),root=process.env.ROOT||"/workspace";http.createServer((req,res)=>{let u=req.url.split("?")[0].split("#")[0];if(u==="/")u="/index.html";const f=path.join(root,decodeURIComponent(u));if(!f.startsWith(root)){res.writeHead(403);return res.end("Forbidden")}fs.readFile(f,(e,d)=>{if(e)fs.readFile(path.join(root,"index.html"),(e2,d2)=>{res.writeHead(e2?404:200,{"Content-Type":"text/html; charset=utf-8"});res.end(e2?"Not Found":d2)});else{res.writeHead(200);res.end(d)}})}).listen(port);';

class CloudStudioDeployService {
  constructor(config = {}) {
    const preset = ENV_PRESETS[config.env || 'internal'] || ENV_PRESETS.internal;
    this.paasApi = config.paasApi || preset.paasApi;
    this.wsDomain = config.wsDomain || preset.wsDomain;
    this.wsScheme = preset.wsScheme;
    this.fetch = config.fetch || globalThis.fetch;
    this.sessionManager = null;
    this.authManager = null;
    this.productManager = null;
    this.eventService = null;
    this.sessionToken = '';
  }
  setSessionManager(value) { this.sessionManager = value; }
  setAuthDeps(authManager, productManager) { this.authManager = authManager; this.productManager = productManager; }
  setEventService(value) { this.eventService = value; }
  getAgentserverEndpoint() { const endpoint = this.productManager?.getEndpoint?.(); if (!endpoint) throw new Error('productManager endpoint not available (user not logged in?)'); return endpoint; }
  getAuthHeaders() { if (!this.authManager) throw new Error('authManager not injected'); const headers = this.authManager.buildAuthHeaders(true, false, false); if (!headers.Authorization && !headers.authorization) throw new Error('user not logged in'); return { ...headers, 'Content-Type': 'application/json' }; }
  getPaasHeaders(extra = {}) { return { ...this.getAuthHeaders(), ...extra }; }
  wsUrl(port, spaceKey) { return `${this.wsScheme}://${port}-${spaceKey}.${this.wsDomain}`; }
  bearerHeaders(extra = {}) { return this.sessionToken ? { ...extra, Authorization: `Bearer ${this.sessionToken}` } : { ...extra }; }
  reportEvent(eventCode, fields) { try { Promise.resolve(this.eventService?.report?.(eventCode, fields)).catch(() => {}); } catch {} }
  extractSandboxIdFromHostTemplate(template) { const first = template?.match(/^%d-([^.]+)\./); if (first) return first[1]; const second = template?.match(/^([^-]+)--/); return second?.[1]; }
  updateWsDomainFromEndpoint(endpoint, sandboxId) { if (!endpoint) return; try { const parsed = new URL(endpoint); this.wsScheme = parsed.protocol.slice(0, -1); const at = parsed.hostname.indexOf(sandboxId); if (at >= 0) this.wsDomain = parsed.hostname.slice(at + sandboxId.length + 1); } catch {} }
  stringifyNumericReleaseIds(text) { return text.replace(/"releaseId"\s*:\s*(\d+)/g, '"releaseId":"$1"'); }
  normalizeReleaseId(value) { return typeof value === 'string' && value ? value : Number.isFinite(value) ? String(value) : undefined; }
  async agentserverPost(urlPath, body, extraHeaders = {}) { const response = await this.fetch(`${this.getAgentserverEndpoint()}/console/as${urlPath}`, { method: 'POST', headers: { ...this.getAuthHeaders(), ...extraHeaders }, body: JSON.stringify(body) }); const json = await response.json(); if (!response.ok || (json.code !== undefined && json.code !== 0)) throw new Error(`agentserver POST ${urlPath}: ${response.status}`); return json.data ?? json; }
  async agentserverGet(urlPath) { const response = await this.fetch(`${this.getAgentserverEndpoint()}/console/as${urlPath}`, { headers: this.getAuthHeaders() }); const json = await response.json(); if (!response.ok || (json.code !== undefined && json.code !== 0)) throw new Error(`agentserver GET ${urlPath}: ${response.status}`); return json.data ?? json; }
  async paasPost(urlPath, body) { const response = await this.fetch(`${this.paasApi}${urlPath}`, { method: 'POST', headers: this.getPaasHeaders(), body: JSON.stringify(body) }); const json = await response.json(); if (json.code !== 0) throw new Error(`PaaS ${urlPath}: ${json.message || 'request failed'}`); return json.data; }
  async paasDelete(urlPath) { const response = await this.fetch(`${this.paasApi}${urlPath}`, { method: 'DELETE', headers: this.getPaasHeaders() }); const json = await response.json(); if (json.code !== 0) throw new Error(`PaaS ${urlPath}: ${json.message || 'request failed'}`); return json.data; }
  async createWorkspace() { const conversation = await this.agentserverPost('/conversations/', { name: `simple-deploy-${Date.now()}`, conversationOrigin: 'workbuddy-deploy' }, { 'X-Sandbox-Type': 'CS', 'X-Single-Sandbox-Cluster': 'true' }); if (!conversation.id) throw new Error('conversation creation returned no id'); return { spaceKey: await this.pollForSandboxId(conversation.id), conversationId: conversation.id, connections: {} }; }
  async pollForSandboxId(conversationId) { const start = Date.now(); while (Date.now() - start < READY_TIMEOUT_MS) { try { const session = await this.agentserverGet(`/conversations/${conversationId}/session`); const id = session?.sandboxId || session?.sandbox_id || this.extractSandboxIdFromHostTemplate(session?.sandboxHostTemplate); if (id) { this.sessionToken = session.token || this.sessionToken; this.updateWsDomainFromEndpoint(session.e2bDataEndpoint, id); return id; } } catch {} await new Promise((resolve) => setTimeout(resolve, READY_POLL_INTERVAL_MS)); } throw new Error(`sandbox not ready within ${READY_TIMEOUT_MS / 1000}s for conversation ${conversationId}`); }
  async getDeployHistory(workspaceRoot, taskSessionIds) { const filter = {}; if (workspaceRoot) filter.workspaceKey = computeWorkspaceKey(workspaceRoot); if (taskSessionIds?.length) filter.taskSessionIds = taskSessionIds; return queryDeployHistory(filter); }
  async destroy(spaceKey) { return this.paasDelete(`/workspaces/${spaceKey}`); }
  async uploadBuffer(spaceKey, buffer, remotePath) { const response = await this.fetch(`${this.wsUrl(PORT_API, spaceKey)}/filesystem/${remotePath.replace(/^\//, '')}`, { method: 'POST', headers: this.bearerHeaders({ 'Content-Type': 'application/octet-stream' }), body: new Uint8Array(buffer), redirect: 'manual' }); if (!response.ok || response.status === 302) throw new Error(`upload failed (${response.status})`); }
  async execInSandbox(spaceKey, command, timeoutMs = 30000) { const response = await this.fetch(`${this.wsUrl(PORT_API, spaceKey)}/console`, { method: 'POST', headers: this.bearerHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ command, shell: '/bin/bash', timeoutMs }), redirect: 'manual' }); if (!response.ok || response.status === 302) throw new Error(`exec failed (${response.status})`); const data = await response.json(); if (data.exitCode !== 0) throw new Error(`exit ${data.exitCode}: ${(data.stderr || data.stdout || '').slice(0, 300)}`); return data; }
  async setAutoStart(spaceKey, config) { const response = await this.fetch(`${this.wsUrl(PORT_PTY, spaceKey)}/replaceCloudStudioConfig`, { method: 'POST', headers: this.bearerHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(config) }); if (!response.ok) throw new Error(`replaceCloudStudioConfig failed (${response.status})`); const data = await response.json(); if (data.status === 'error') throw new Error(data.message); return data; }
  async getShareLink(spaceKey, port, expire = 157680000) { try { const data = await this.paasPost(`/workspaces/${spaceKey}/links`, { port, expire }); return data?.host ? `${data.scheme}://${data.host}` : null; } catch { return null; } }
  async createArtifactRelease(conversationId, sandboxId, port) { try { const response = await this.fetch(`${this.getAgentserverEndpoint()}/console/as/artifact-releases`, { method: 'POST', headers: this.getAuthHeaders(), body: JSON.stringify({ artifactType: 'web', conversationId, persistent: true, releaseConfig: { appName: sandboxId, port, expire: 157680000, useAppNameAsDomain: true } }) }); const json = await response.json(); const data = json.data ?? json; const domain = data?.domains?.friendlyDomains?.[0]; return { shareLink: domain ? `https://${domain}` : data?.releaseUrl || null }; } catch { return { shareLink: null }; } }
  async deploy(options = {}) { const raw = path.resolve(options.localDir || ''); const stat = await fs.promises.stat(raw); const single = stat.isFile(); const localDir = single ? path.dirname(raw) : raw; const entryHtml = single ? path.basename(raw) : options.entryHtml || detectEntryHtml(localDir); const previous = !options.forceNew && findLatestDeployRecord(localDir, entryHtml, { excludeUnpublished: true }); const workspace = previous?.sandboxId && previous?.conversationId ? previous : await this.createWorkspace(); const result = await this.deployTo(workspace.sandboxId || workspace.spaceKey, { ...options, localDir, entryHtml }, workspace.conversationId); this.reportEvent('wbx_deploy_success', { sandboxId: result.sandboxId, shareLink: result.shareLink || '' }); return result; }
  async deployTo(spaceKey, options = {}, conversationId) { const rawPath = path.resolve(options.localDir || ''); const stat = await fs.promises.stat(rawPath); const single = stat.isFile(); const localDir = single ? path.dirname(rawPath) : rawPath; const entryHtml = single ? path.basename(rawPath) : options.entryHtml || detectEntryHtml(localDir); await this.uploadBuffer(spaceKey, Buffer.from(SERVE_JS), `${REMOTE_ROOT}/_serve.js`); if (single) await this.uploadBuffer(spaceKey, await fs.promises.readFile(rawPath), `${REMOTE_ROOT}/index.html`); else { const archive = await this.packDirectory(localDir); try { await this.uploadBuffer(spaceKey, await fs.promises.readFile(archive), `${REMOTE_ROOT}/${ARCHIVE_NAME}`); } finally { await fs.promises.unlink(archive).catch(() => {}); } await this.execInSandbox(spaceKey, `cd ${REMOTE_ROOT} && tar -xzf ${ARCHIVE_NAME} && rm -f ${ARCHIVE_NAME}`); if (entryHtml !== 'index.html') await this.execInSandbox(spaceKey, `cd ${REMOTE_ROOT} && mv -f ${JSON.stringify(entryHtml)} index.html`); } const port = options.port || DEFAULT_PORT; await this.setAutoStart(spaceKey, { app: [{ name: 'app', port, cmd: `PORT=${port} node ${REMOTE_ROOT}/_serve.js` }] }); const shareLink = conversationId ? (await this.createArtifactRelease(conversationId, spaceKey, port)).shareLink : await this.getShareLink(spaceKey, port); const result = { sandboxId: spaceKey, conversationId, webIDE: null, shareLink, dataPlaneUrl: `${this.wsUrl(port, spaceKey)}/`, verified: false }; const session = await this.resolveCurrentSession(); try { addDeployRecord({ deployTargetId: computeDeployTargetId('', localDir, entryHtml), title: single ? entryHtml : path.basename(localDir), relativePath: computeRelativePath(options.workspaceRoot || session?.cwd || '', single ? rawPath : localDir), absolutePath: single ? rawPath : localDir, entryHtml, workspacePath: options.workspaceRoot || session?.cwd || '', workspaceKey: computeWorkspaceKey(options.workspaceRoot || session?.cwd || ''), sandboxId: spaceKey, conversationId: conversationId || '', taskSessionId: options.taskSessionId || session?.sessionId || '', triggerType: options.triggerType || 'agent', createdTimestamp: Date.now(), shareLink }); } catch {} return result; }
  async cancelArtifactRelease(conversationId) { const text = await (await this.fetch(`${this.getAgentserverEndpoint()}/console/as/artifact-releases?conversationId=${encodeURIComponent(conversationId)}`, { headers: this.getAuthHeaders() })).text(); const data = JSON.parse(this.stringifyNumericReleaseIds(text)).data; const release = (data?.items || []).find((item) => item.status !== 'INVALID') || data?.items?.[0]; const releaseId = this.normalizeReleaseId(release?.releaseId); if (!releaseId) throw new Error(`no artifact release found for conversation ${conversationId}`); await this.agentserverPost(`/artifact-releases/${releaseId}/cancel?conversationId=${encodeURIComponent(conversationId)}`, {}); addUnpublishRecord({ conversationId, status: 'cancelled', timestamp: Date.now() }); }
  async resolveCurrentSession() { try { const sessions = await this.sessionManager?.getActiveSessions?.(); if (!Array.isArray(sessions) || sessions.length !== 1 || typeof sessions[0]?.cwd !== 'string') return; return { cwd: sessions[0].cwd, sessionId: sessions[0].sessionId }; } catch { return; } }
  async packDirectory(localDir) { const file = path.join(os.tmpdir(), `${ARCHIVE_NAME}-${crypto.randomUUID()}`); const tar = require('tar'); await tar.create({ gzip: true, file, cwd: path.resolve(localDir), portable: true }, ['.']); return file; }
}

module.exports = Object.freeze({ ENV_PRESETS, PORT_API, PORT_PTY, REMOTE_ROOT, ARCHIVE_NAME, DEFAULT_PORT, SERVE_JS, CloudStudioDeployService });
