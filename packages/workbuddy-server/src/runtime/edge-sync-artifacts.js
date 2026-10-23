'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const SMH_URL_TTL_MS = 3600 * 1000;
const CACHE_EXPIRE_BUFFER_MS = 60 * 1000;
const MAX_ARTIFACT_BYTES = 100 * 1024 * 1024;
const SENSITIVE_PATHS = ['.ssh', '.gnupg', '.aws', '.kube', '.docker', '.npmrc', '.netrc', '.gitcredentials', '.config/gcloud'];
const CONTENT_TYPES = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.html': 'text/html', '.js': 'application/javascript', '.ts': 'text/typescript', '.json': 'application/json', '.md': 'text/markdown', '.txt': 'text/plain', '.zip': 'application/zip' };

function guessContentType(fileName) { return CONTENT_TYPES[path.extname(fileName).toLowerCase()] || 'application/octet-stream'; }
function failed(requestId, errorMsg) { return { requestId, status: 'failed', ...(errorMsg ? { errorMsg } : {}) }; }
function isWithinHome(candidate, homeDir) {
  const homeWithSep = homeDir.endsWith(path.sep) ? homeDir : `${homeDir}${path.sep}`;
  return candidate === homeDir || candidate.startsWith(homeWithSep);
}
function isSensitivePath(relativePath) { return SENSITIVE_PATHS.some((root) => relativePath === root || relativePath.startsWith(`${root}${path.sep}`)); }

async function handleGetArtifact(ctx, cmd) {
  const filePath = cmd.filePath;
  const requestId = cmd.commandId;
  const log = ctx.logger || { info() {}, warn() {} };
  const homeDir = os.homedir();
  if (typeof filePath !== 'string' || filePath.includes('..')) return failed(requestId);
  const resolvedPath = path.resolve(filePath);
  if (!isWithinHome(resolvedPath, homeDir)) return failed(requestId);
  try {
    const realPath = fs.realpathSync(resolvedPath);
    if (!isWithinHome(realPath, homeDir)) return failed(requestId);
  } catch {}
  const homeWithSep = homeDir.endsWith(path.sep) ? homeDir : `${homeDir}${path.sep}`;
  if (isSensitivePath(resolvedPath.slice(homeWithSep.length))) return failed(requestId);
  if (!fs.existsSync(filePath)) return { requestId, status: 'missing' };
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_ARTIFACT_BYTES) return { requestId, status: 'too_large', size: stat.size };
  const now = Date.now();
  const cached = ctx.getArtifactCache(filePath);
  if (cached && cached.mtime_ms === stat.mtimeMs && cached.size === stat.size && cached.expires_at - CACHE_EXPIRE_BUFFER_MS > now && cached.download_url) return { requestId, status: 'success', cached: true, downloadUrl: cached.download_url, smhPath: cached.smh_path, fileHash: cached.file_hash, size: cached.size, contentType: cached.content_type || undefined, expiresAt: cached.expires_at };
  try {
    const fileName = path.basename(filePath);
    const fileHash = await new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(`sha256:${hash.digest('hex')}`));
      stream.on('error', reject);
    });
    const formData = new FormData();
    formData.append('file', await fs.openAsBlob(filePath), fileName);
    formData.append('fileName', fileName);
    formData.append('filePath', `.conversation-sync/${cmd.conversationId || 'unknown'}/${fileName}`);
    formData.append('createShare', 'true');
    const uploadResult = ctx.unwrapResponse(await ctx.deps.http.post('/v2/as/netdisk/upload', formData), 'NETDISK-UPLOAD');
    const downloadUrl = uploadResult?.downloadUrl || uploadResult?.shareUrl || '';
    if (!downloadUrl) return failed(requestId, 'upload response missing downloadUrl');
    const contentType = guessContentType(fileName);
    const smhPath = `.conversation-sync/${ctx.deps.getAccount?.()?.uid || 'unknown'}/${cmd.conversationId || 'unknown'}/${fileHash}_${fileName}`;
    const expiresAt = typeof uploadResult?.expiresAt === 'number' ? uploadResult.expiresAt : now + SMH_URL_TTL_MS;
    ctx.upsertArtifactCache({ file_path: filePath, mtime_ms: stat.mtimeMs, size: stat.size, file_hash: fileHash, download_url: downloadUrl, smh_path: smhPath, content_type: contentType, expires_at: expiresAt });
    log.info(`[EdgeSync] ARTIFACT uploaded: ${fileName} expiresAt=${expiresAt}`);
    return { requestId, status: 'success', cached: false, downloadUrl, smhPath, fileHash, size: stat.size, contentType, expiresAt };
  } catch (error) { log.warn(`[EdgeSync] ARTIFACT upload failed: ${error?.message || String(error)}`); return failed(requestId, error?.message || String(error)); }
}

module.exports = Object.freeze({ SMH_URL_TTL_MS, CACHE_EXPIRE_BUFFER_MS, MAX_ARTIFACT_BYTES, guessContentType, handleGetArtifact });
