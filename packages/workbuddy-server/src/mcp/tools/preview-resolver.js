'use strict';

const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');

const LOG_KEY = '[preview-resolver]';
function probeOnce(url) { return new Promise((resolve) => { try { const req = (new URL(url).protocol === 'https:' ? https : http).request(url, { method: 'HEAD', timeout: 2000 }, (res) => { res.resume(); resolve(true); }); req.on('error', () => resolve(false)); req.on('timeout', () => { req.destroy(); resolve(false); }); req.end(); } catch { resolve(false); } }); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function isLocalhostReachable(url, maxRetries = 2, retryDelayMs = 1500) { for (let attempt = 0; attempt <= maxRetries; attempt += 1) { if (await probeOnce(url)) return true; if (attempt < maxRetries) { console.log(`${LOG_KEY} localhost probe attempt ${attempt + 1} failed, retrying in ${retryDelayMs}ms...`); await sleep(retryDelayMs); } } return false; }
function tryResolveLocalFile(url, cwd) { try { const pathname = decodeURIComponent(new URL(url).pathname); const relativePath = pathname.startsWith('/') ? pathname.slice(1) : pathname; if (!relativePath || !cwd) return undefined; const fullPath = path.join(cwd, relativePath); return fs.existsSync(fullPath) ? fullPath : undefined; } catch { return undefined; } }
async function isBlacklist(url, productManager) { try { const configuration = await Promise.race([productManager.waitConfiguration(), new Promise((resolve) => setTimeout(resolve, 3000))]); if (!configuration) return false; const config = configuration.config || {}; const normalized = url.trim().toLowerCase(); const hostname = new URL(url).hostname.toLowerCase(); return (Array.isArray(config.blacklistURLs) && config.blacklistURLs.some((item) => typeof item === 'string' && item.trim().toLowerCase() === normalized)) || (Array.isArray(config.blacklistDomains) && config.blacklistDomains.some((domain) => typeof domain === 'string' && domain.trim().toLowerCase() === hostname)); } catch { return false; } }
async function resolvePreviewTarget(rawUrl, cwd, productManager, staticHtmlServer) {
  const url = rawUrl;
  if (!url) return { ok: false, errorText: 'Error: url is required' };
  const isAbsolutePath = path.isAbsolute(url); const isFileUri = url.startsWith('file://'); const isHttpUri = /^https?:\/\//i.test(url);
  if (!isAbsolutePath && !isFileUri && !isHttpUri) return { ok: false, errorText: `Error: Unsupported URL. Only http/https URLs, file:// URIs, and absolute file paths are accepted. Got: ${url}` };
  if (isAbsolutePath || isFileUri) {
    const localPath = isAbsolutePath ? url : (() => { try { return new URL(url).pathname; } catch { return ''; } })();
    if (staticHtmlServer && /\.html?$/i.test(path.extname(localPath))) { const port = staticHtmlServer.getServerPort(); if (port > 0) return { ok: true, previewUrl: `http://127.0.0.1:${port}/static-html/${staticHtmlServer.registerDir(path.dirname(localPath))}/${encodeURIComponent(path.basename(localPath))}` }; }
    return { ok: true, previewUrl: isAbsolutePath ? `file://${url}` : url };
  }
  let parsedUrl; try { parsedUrl = new URL(url); } catch { return { ok: false, errorText: `Error: Invalid URL format: ${url}` }; }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) return { ok: false, errorText: `Error: Unsupported protocol: ${parsedUrl.protocol}. Accepted: http/https URLs or local file paths.` };
  if (await isBlacklist(url, productManager)) return { ok: false, errorText: `Error: IMPORTANT: Current URL is high risk! This ${url} is blocked!` };
  if (['localhost', '127.0.0.1'].includes(parsedUrl.hostname.toLowerCase()) && !await isLocalhostReachable(url)) { const port = parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : '80'); const localFile = tryResolveLocalFile(url, cwd); const lines = [`Error: ${url} is not reachable — no server is running on port ${port}.`, '', 'To preview this URL, you need to start a local server first using the Bash tool.', '', 'Suggested actions:']; if (localFile) lines.push(`  1. The file exists at: ${localFile}`, '  2. Start a server in that directory, for example:', `     cd ${cwd} && python3 -m http.server ${port}`, `     or: cd ${cwd} && npx serve -l ${port}`, `  3. Then call present_files again with ${url}`, '', `  Alternatively, pass the absolute file path directly: ${localFile}`); else lines.push(`  1. Start a local server using the Bash tool`, `  2. Make sure it listens on port ${port}`, '  3. Then call present_files again with the server URL'); return { ok: false, errorText: lines.join('\n') }; }
  return { ok: true, previewUrl: url };
}

module.exports = Object.freeze({ isBlacklist, isLocalhostReachable, probeOnce, resolvePreviewTarget, sleep, tryResolveLocalFile });
