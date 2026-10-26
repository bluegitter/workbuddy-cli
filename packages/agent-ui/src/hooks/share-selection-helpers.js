'use strict';

function resolveArtifactFilePath(uri) {
  if (!uri) return undefined;
  if (uri.startsWith('agent://files/')) return uri.slice(14);
  if (uri.startsWith('file://')) {
    try {
      const parsed = new URL(uri);
      let path = decodeURIComponent(parsed.pathname);
      if (/^\/[a-zA-Z]:/.test(path)) path = path.slice(1);
      return path;
    } catch {
      const raw = uri.slice(7);
      try { return decodeURIComponent(raw); } catch { return raw; }
    }
  }
  if (uri.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(uri)) return uri;
  return undefined;
}

function pickArtifactRequestId(meta) {
  const candidate = meta?.requestId ?? meta?.['codebuddy.ai/requestId'];
  return typeof candidate === 'string' && candidate ? candidate : undefined;
}

async function readShareArtifacts(artifactFacade, sessionId, selectedMessages) {
  if (!sessionId || !artifactFacade || !selectedMessages?.length) return undefined;
  try {
    const artifacts = await artifactFacade.getSessionArtifacts(sessionId);
    if (!Array.isArray(artifacts) || artifacts.length === 0) return undefined;
    const selected = new Set(selectedMessages.map((message) => message.requestId).filter(Boolean));
    const scoped = artifacts.filter((artifact) => selected.has(pickArtifactRequestId(artifact._meta)));
    return scoped.length ? scoped : undefined;
  } catch (error) {
    console.warn('[ShareSelection] getSessionArtifacts error (skipped):', error);
    return undefined;
  }
}

async function uploadShareArtifacts(backendProvider, prepareId, artifacts) {
  if (typeof backendProvider.uploadShareTaskFile !== 'function') return { success: false };
  const seen = new Set();
  const uploadable = [];
  for (const artifact of artifacts) {
    const filePath = resolveArtifactFilePath(artifact.uri);
    if (!filePath || seen.has(filePath)) continue;
    seen.add(filePath);
    uploadable.push({ filePath, fileName: artifact.name || filePath.split(/[\\/]/).pop() || 'file' });
  }
  if (!uploadable.length) return { success: true };
  try {
    const failed = (await Promise.all(uploadable.map((item) => backendProvider.uploadShareTaskFile({ prepareId, ...item })))).filter((result) => !result.success);
    return failed.length ? { success: false, code: failed[0]?.code } : { success: true };
  } catch (error) {
    console.error('[ShareSelection] artifact upload error:', error);
    return { success: false };
  }
}

async function isShareContentBlocked(adapter, texts) {
  const validTexts = texts.filter(Boolean);
  if (typeof adapter.checkModeration !== 'function' || !validTexts.length) return false;
  try {
    const combined = validTexts.join('\n');
    if ((await adapter.checkModeration({ text: combined, scene: 'nickname' })).pass) return false;
    for (const text of validTexts) if (!(await adapter.checkModeration({ text, scene: 'nickname' })).pass) return true;
    return false;
  } catch (error) {
    console.warn('[ShareSelection] moderation check error (proceeding):', error);
    return false;
  }
}

module.exports = Object.freeze({ resolveArtifactFilePath, pickArtifactRequestId, readShareArtifacts, uploadShareArtifacts, isShareContentBlocked });
