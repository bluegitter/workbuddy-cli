'use strict';

const crypto = require('node:crypto');

function getSandboxDomain(link) { try { return new URL(String(link || '').replace(/^http:\/\//, 'https://')).hostname.split('.').slice(1).join('.') || 'e2b.dev'; } catch { return 'e2b.dev'; } }
function resolveSandboxId(sandboxId, link) { if (sandboxId) return sandboxId; try { return new URL(String(link || '').replace(/^http:\/\//, 'https://')).hostname.split('.')[0].replace(/^\d+-/, ''); } catch { return ''; } }
class SandboxPreviewMountService {
  static MAX_MOUNT_ENTRIES = 200;
  constructor(clock = Date) { this.clock = clock; this.mounts = new Map(); }
  registerMount(params, getPort) { if (this.mounts.size >= SandboxPreviewMountService.MAX_MOUNT_ENTRIES) this.mounts.delete(this.mounts.keys().next().value); const mountId = crypto.randomBytes(16).toString('hex'); const root = params.root || '/workspace'; const link = params.sandbox.link; const entry = { apiBase: `https://49983-${resolveSandboxId(params.sandbox.sandboxId, link)}.${getSandboxDomain(link)}`, token: params.sandbox.token, root: root.startsWith('/') ? root : `/${root}`, source: params.source, sessionId: params.sessionId, expiresAt: this.clock.now() + 1_440 * 60 * 1_000 }; this.mounts.set(mountId, entry); return { ok: true, mountId, baseUrl: `http://127.0.0.1:${getPort()}/sandbox-preview/${mountId}/` }; }
  resolve(mountId) { const entry = this.mounts.get(mountId); if (!entry) return undefined; if (this.clock.now() > entry.expiresAt) { this.mounts.delete(mountId); return undefined; } this.mounts.delete(mountId); this.mounts.set(mountId, entry); return entry; }
  remove(mountId) { return this.mounts.delete(mountId); }
}

module.exports = { SandboxPreviewMountService, getSandboxDomain, resolveSandboxId };
