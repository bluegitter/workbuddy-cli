'use strict';

const DEFAULT_SHARE_TITLE = 'Workbuddy Preview';
const SHARE_TASK_FILE_TOO_LARGE_CODE = 10001;
const OVERSEAS_UNSUPPORTED_EXTENSIONS = new Set([
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'rtf', 'odt', 'ods', 'odp',
  'pages', 'numbers', 'key', 'keynote', 'pdf',
]);

function readCwdArtifacts(cwd, readDirByPath) {
  if (!cwd || typeof readDirByPath !== 'function') return undefined;
  const isHidden = (name) => name.startsWith('.') || name === 'Thumbs.db' || name === 'desktop.ini';
  return Promise.resolve().then(async () => {
    const result = await readDirByPath(cwd);
    if (!result?.success || !result.entries) return undefined;
    const files = [];
    for (const entry of result.entries) {
      if (isHidden(entry.name)) continue;
      if (entry.isFile) {
        files.push(entry);
        continue;
      }
      if (!entry.isDirectory) continue;
      try {
        const subPath = entry.path || `${cwd}/${entry.name}`;
        const sub = await readDirByPath(subPath);
        if (!sub?.success || !sub.entries || !sub.entries.some((item) => item.isFile && /\.html?$/i.test(item.name))) continue;
        for (const item of sub.entries) {
          if (!item.isFile || isHidden(item.name)) continue;
          const ext = item.name.slice(item.name.lastIndexOf('.'));
          const name = /^index\.html?$/i.test(item.name) ? `${entry.name}${ext}` : item.name;
          files.push({ ...item, path: item.path || `${subPath}/${item.name}`, name });
        }
      } catch {}
    }
    return files.length ? files : undefined;
  }).catch(() => undefined);
}

function adaptShareUrl(url, resolvePlatform) {
  if (!url) return url;
  const platform = typeof resolvePlatform === 'function' ? resolvePlatform() : undefined;
  return platform ? url.replace(/([?&])platform=\w+/, `$1platform=${platform}`) : url;
}

function isShareTaskFileTooLargeError(error) {
  if (!error) return false;
  if (typeof error !== 'object') return false;
  if (error.code === SHARE_TASK_FILE_TOO_LARGE_CODE) return true;
  return isShareTaskFileTooLargeError(error.msg ?? error.message ?? error.error);
}

function buildMessageTimeWindows(messages = []) {
  const starts = new Map();
  for (const message of messages) {
    if (!message?.requestId || typeof message.createTime !== 'number') continue;
    const previous = starts.get(message.requestId);
    if (previous === undefined || message.createTime < previous) starts.set(message.requestId, message.createTime);
  }
  const sorted = [...starts.entries()].sort((a, b) => a[1] - b[1]);
  return sorted.map(([requestId, startedAt], index) => ({ requestId, startedAt, nextStartedAt: sorted[index + 1]?.[1] }));
}

function replaceLocalPathsInMessages(messages = [], artifactUrlMap = new Map()) {
  if (!artifactUrlMap.size) return messages;
  const byBasename = new Map();
  for (const [key, value] of artifactUrlMap) {
    const basename = String(key).replace(/\\/g, '/').split('/').pop();
    if (basename) byBasename.set(basename, value?.url);
  }
  const looksLikePath = (value) => /[\\/]/.test(value) || /^\.{1,2}\//.test(value) || /^~\//.test(value) || /^[A-Za-z]:[\\/]/.test(value);
  const resolve = (value) => {
    const exact = artifactUrlMap.get(value)?.url;
    if (exact) return exact;
    if (!looksLikePath(value)) return undefined;
    return byBasename.get(value.replace(/\\/g, '/').split('/').pop());
  };
  const walk = (value) => {
    if (typeof value === 'string') return resolve(value) ?? value;
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, walk(item)]));
    return value;
  };
  return messages.map(walk);
}

function extractExtension(nameOrPath) {
  if (!nameOrPath) return '';
  const filename = String(nameOrPath).split(/[\\/]/).pop().split(/[?#]/)[0].trim();
  const dot = filename.lastIndexOf('.');
  return dot > 0 && dot < filename.length - 1 ? filename.slice(dot + 1).toLowerCase() : '';
}

function isUnsupportedOverseasArtifact(nameOrPath) { return OVERSEAS_UNSUPPORTED_EXTENSIONS.has(extractExtension(nameOrPath)); }

function partitionOverseasUnsupportedArtifacts(items = [], getName = (item) => item) {
  const kept = [], dropped = [];
  for (const item of items) (isUnsupportedOverseasArtifact(getName(item)) ? dropped : kept).push(item);
  return { kept, dropped };
}

function fillFileIconKind(artifactUrlMap, artifacts = [], getIconKind = (name) => undefined) {
  const names = new Map(artifacts.map((artifact) => [artifact.path, artifact.name]));
  for (const [key, entry] of artifactUrlMap) {
    if (!entry.iconKind) entry.iconKind = getIconKind(names.get(key) || String(key).replace(/[\\/]/g, '/').split('/').pop() || key);
  }
  return artifactUrlMap;
}

function resolveArtifactFilePath(uri) {
  if (!uri) return undefined;
  if (uri.startsWith('agent://files/')) return uri.slice('agent://files/'.length);
  if (uri.startsWith('file://')) {
    try {
      const parsed = new URL(uri);
      let pathname = decodeURIComponent(parsed.pathname);
      if (/^\/[A-Za-z]:/.test(pathname)) pathname = pathname.slice(1);
      return pathname;
    } catch {
      try { return decodeURIComponent(uri.slice('file://'.length)); } catch { return uri.slice('file://'.length); }
    }
  }
  return uri.startsWith('/') || /^[A-Za-z]:[\\/]/.test(uri) ? uri : undefined;
}

function pickArtifactRequestId(meta) {
  const value = meta?.requestId ?? meta?.['codebuddy.ai/requestId'];
  return typeof value === 'string' && value ? value : undefined;
}

async function collectShareArtifacts(artifactFacade, sessionId, readFile, messages = [], collectVirtualArtifacts) {
  if (!sessionId || !artifactFacade?.getSessionArtifacts) return { fileArtifacts: [], virtualArtifacts: [] };
  let artifacts;
  try { artifacts = await artifactFacade.getSessionArtifacts(sessionId); } catch { return { fileArtifacts: [], virtualArtifacts: [] }; }
  if (!Array.isArray(artifacts)) return { fileArtifacts: [], virtualArtifacts: [] };
  const fileArtifacts = [], ardotArtifacts = [];
  for (const artifact of artifacts) {
    if (artifact.type === 'ardot_canvas') { ardotArtifacts.push(artifact); continue; }
    if (['implementation-plan', 'task', 'overview', 'file-changes'].includes(artifact.type)) continue;
    const filePath = resolveArtifactFilePath(artifact.uri);
    if (!filePath) continue;
    const readBlob = async (path) => {
      if (typeof readFile !== 'function') return null;
      try { return (await readFile(sessionId, path, 'blob'))?.content ?? null; } catch { return null; }
    };
    fileArtifacts.push({ path: filePath, name: artifact.title || artifact.name || filePath.replace(/[\\/]/g, '/').split('/').pop() || 'file', blob: await readBlob(filePath), requestId: pickArtifactRequestId(artifact._meta), createdAt: artifact.createdAt, readBlob });
  }
  const virtualArtifacts = ardotArtifacts.length && typeof collectVirtualArtifacts === 'function' ? await collectVirtualArtifacts(ardotArtifacts, messages) : [];
  return { fileArtifacts, virtualArtifacts: virtualArtifacts || [] };
}

async function readArtifactBlobs(taskId, fileArtifacts = [], readFile) {
  return Promise.all(fileArtifacts.map(async (artifact) => {
    try {
      const result = await readFile?.(taskId, artifact.path, 'blob');
      return { path: artifact.path, name: artifact.name, blob: result?.content, readBlob: async (path) => { try { return (await readFile?.(taskId, path, 'blob'))?.content ?? null; } catch { return null; } } };
    } catch { return { path: artifact.path, name: artifact.name, blob: undefined }; }
  }));
}

module.exports = {
  DEFAULT_SHARE_TITLE, SHARE_TASK_FILE_TOO_LARGE_CODE, OVERSEAS_UNSUPPORTED_EXTENSIONS,
  adaptShareUrl, buildMessageTimeWindows, collectShareArtifacts, extractExtension,
  fillFileIconKind, isShareTaskFileTooLargeError, isUnsupportedOverseasArtifact,
  partitionOverseasUnsupportedArtifacts, pickArtifactRequestId, readArtifactBlobs,
  readCwdArtifacts, replaceLocalPathsInMessages, resolveArtifactFilePath,
};
