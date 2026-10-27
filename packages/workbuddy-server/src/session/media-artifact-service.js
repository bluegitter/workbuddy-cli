'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');

const MEDIA_TYPES = Object.freeze({
  jpg: { mimeType: 'image/jpeg', contentType: 'image' }, jpeg: { mimeType: 'image/jpeg', contentType: 'image' }, png: { mimeType: 'image/png', contentType: 'image' }, gif: { mimeType: 'image/gif', contentType: 'image' }, webp: { mimeType: 'image/webp', contentType: 'image' }, svg: { mimeType: 'image/svg+xml', contentType: 'image' }, mp4: { mimeType: 'video/mp4', contentType: 'video' }, mov: { mimeType: 'video/quicktime', contentType: 'video' }, mp3: { mimeType: 'audio/mpeg', contentType: 'audio' }, wav: { mimeType: 'audio/wav', contentType: 'audio' }, pdf: { mimeType: 'application/pdf', contentType: 'document' }, html: { mimeType: 'text/html', contentType: 'html' }, md: { mimeType: 'text/markdown', contentType: 'document' }, excalidraw: { mimeType: 'application/vnd.excalidrawlib+json', contentType: 'diagram' }, drawio: { mimeType: 'application/x-drawio', contentType: 'diagram' },
});

function mediaInfoForPath(filePath) { return MEDIA_TYPES[path.extname(filePath).slice(1).toLowerCase()]; }

class MediaArtifactService {
  constructor(options = {}) { this.pushEvent = options.pushEvent || (() => {}); this.logger = options.logger || console; this.sessions = new Map(); this.cwdSessions = new Map(); this.executingSessionsByCwd = new Map(); this.explicitMediaBySession = new Map(); this.indexCache = new Map(); }
  registerSession(sessionId, cwd) { const normalized = path.normalize(cwd); this.sessions.set(sessionId, normalized); const set = this.cwdSessions.get(normalized) || new Set(); set.add(sessionId); this.cwdSessions.set(normalized, set); this.indexCache.set(sessionId, this.indexCache.get(sessionId) || []); this.explicitMediaBySession.set(sessionId, this.explicitMediaBySession.get(sessionId) || new Map()); }
  unregisterSession(sessionId) { const cwd = this.sessions.get(sessionId); this.sessions.delete(sessionId); this.indexCache.delete(sessionId); this.explicitMediaBySession.delete(sessionId); const set = this.cwdSessions.get(cwd); set?.delete(sessionId); if (set?.size === 0) this.cwdSessions.delete(cwd); }
  getSessionCwd(sessionId) { return this.sessions.get(sessionId); }
  isKnownMediaExtension(filePath) { return Boolean(mediaInfoForPath(filePath)); }
  registerExplicitMedia({ sessionId, filePath, sourceType }) { const bySession = this.explicitMediaBySession.get(sessionId) || new Map(); bySession.set(path.normalize(filePath), { sourceType, registeredAt: Date.now() }); this.explicitMediaBySession.set(sessionId, bySession); }
  unregisterExplicitMedia(sessionId, filePath) { this.explicitMediaBySession.get(sessionId)?.delete(path.normalize(filePath)); }
  getExplicitOwnerSessionIdsForPath(filePath) { const normalized = path.normalize(filePath); return [...this.explicitMediaBySession.entries()].filter(([, files]) => files.has(normalized)).map(([sessionId]) => sessionId); }
  findOwnerSessionIdForPath(filePath) { const explicit = this.getExplicitOwnerSessionIdsForPath(filePath); if (explicit.length) return explicit[0]; const target = path.normalize(filePath); const candidates = [...this.cwdSessions.entries()].filter(([cwd]) => target === cwd || target.startsWith(`${cwd}${path.sep}`)); const best = candidates.sort((a, b) => b[0].length - a[0].length)[0]; if (!best) return; const executing = this.executingSessionsByCwd.get(best[0]); if (executing?.size === 1) return [...executing][0]; if (best[1].size === 1) return [...best[1]][0]; }
  findOwnerSessionIdForCwd(cwd) { const set = this.cwdSessions.get(path.normalize(cwd)); return set?.size === 1 ? [...set][0] : undefined; }
  markSessionExecuting(sessionId, cwd) { const normalized = path.normalize(cwd); this.sessions.set(sessionId, normalized); const set = this.executingSessionsByCwd.get(normalized) || new Set(); set.add(sessionId); this.executingSessionsByCwd.set(normalized, set); }
  pauseSessionExecuting(sessionId) { const cwd = this.sessions.get(sessionId); this.executingSessionsByCwd.get(cwd)?.delete(sessionId); }
  unmarkSessionExecuting(sessionId) { this.pauseSessionExecuting(sessionId); }
  async recordArtifactFromEvent(sessionId, artifact, event = 'created') { if (!artifact?.uri) return; const records = this.indexCache.get(sessionId) || []; const index = records.findIndex((item) => item.uri === artifact.uri); if (event === 'deleted') { if (index >= 0) records.splice(index, 1); } else if (index >= 0) records[index] = { ...records[index], ...artifact }; else records.push({ ...artifact }); this.indexCache.set(sessionId, records); if (event !== 'deleted') this.pushEvent(`session:event:${sessionId}`, { type: 'extNotification', sessionId, method: '_codebuddy.ai/artifact', params: { sessionId, event: event === 'updated' ? 'updated' : 'created', artifact } }); }
  async registerMediaArtifact(sessionId, filePath, options = {}) { const info = mediaInfoForPath(filePath); if (!info) return; const artifact = { type: 'media', uri: pathToFileURL(filePath).href, name: path.basename(filePath), title: path.basename(filePath), ...info, ...options }; await this.recordArtifactFromEvent(sessionId, artifact, 'created'); return artifact; }
  getSessionArtifacts(sessionId) { return [...(this.indexCache.get(sessionId) || [])]; }
  findArtifactByUri(sessionId, uri) { return this.getSessionArtifacts(sessionId).find((artifact) => artifact.uri === uri); }
  dispose() { this.sessions.clear(); this.cwdSessions.clear(); this.executingSessionsByCwd.clear(); this.explicitMediaBySession.clear(); this.indexCache.clear(); }
}

module.exports = Object.freeze({ MEDIA_TYPES, mediaInfoForPath, MediaArtifactService });
