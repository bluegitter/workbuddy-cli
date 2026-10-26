'use strict';

const ENVD_FILES_PATH_RE = /^(https?:\/\/[^/]+)\/files\?path=([^&]+)/;
const SANDBOX_ABSOLUTE_PATH_RE = /^\/workspace(?:\/|$).+/i;
function normalizeSandboxRoot(root) { const value = (root || '/workspace').trim().replace(/\\/g, '/').replace(/\/+$/, ''); return value ? (value.startsWith('/') ? value : `/${value}`) : '/workspace'; }
function normalizeSandboxPath(value) { const path = value.trim().replace(/\\/g, '/').replace(/\/+/g, '/'); return path.startsWith('/') ? path : `/${path}`; }
function joinSandboxRoot(root, relativePath) { return normalizeSandboxPath(`${normalizeSandboxRoot(root)}/${relativePath.replace(/^\/+/, '')}`); }
function resolveSandboxPreviewFilePath(url, root) {
  if (url.startsWith('agent:///')) return normalizeSandboxPath(url.slice(8));
  if (url.startsWith('agent://files/')) { const raw = url.slice(14); if (!raw) return undefined; if (raw.startsWith('/')) return normalizeSandboxPath(raw); if (raw === 'workspace' || raw.startsWith('workspace/')) return normalizeSandboxPath(`/${raw}`); return joinSandboxRoot(root, raw); }
  if (url.startsWith('agent://files')) { const raw = url.slice(13).replace(/^\/+/, ''); return raw ? joinSandboxRoot(root, raw) : undefined; }
  const match = url.match(ENVD_FILES_PATH_RE);
  if (match) { try { return normalizeSandboxPath(decodeURIComponent(match[2])); } catch { return undefined; } }
  if (SANDBOX_ABSOLUTE_PATH_RE.test(url)) return normalizeSandboxPath(url);
  return undefined;
}
function toSandboxPreviewProxyPath(filePath) { return normalizeSandboxPath(filePath).replace(/^\/+/, ''); }

module.exports = Object.freeze({ normalizeSandboxRoot, normalizeSandboxPath, joinSandboxRoot, resolveSandboxPreviewFilePath, toSandboxPreviewProxyPath });
