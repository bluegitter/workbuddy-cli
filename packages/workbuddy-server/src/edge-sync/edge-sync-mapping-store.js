'use strict';

const fs = require('fs');
const path = require('path');

class EdgeSyncMappingStore {
  constructor(configDir) { this.dbPath = path.join(configDir, 'edge-sync-mapping.db'); this.db = undefined; }
  initialize() {
    try {
      fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
      this.db = new (require('better-sqlite3'))(this.dbPath);
      this.db.pragma('journal_mode = WAL'); this.db.pragma('busy_timeout = 5000');
      this.db.exec(`CREATE TABLE IF NOT EXISTS edge_sync_mapping (session_id TEXT NOT NULL, conversation_id TEXT NOT NULL, msg_channel TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY (session_id)); CREATE UNIQUE INDEX IF NOT EXISTS idx_edge_sync_mapping_conv ON edge_sync_mapping(conversation_id); CREATE TABLE IF NOT EXISTS edge_sync_image_mapping (blob_id TEXT NOT NULL PRIMARY KEY, cos_uri TEXT NOT NULL, session_id TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch())); CREATE TABLE IF NOT EXISTS edge_sync_artifact_cache (file_path TEXT NOT NULL, mtime_ms INTEGER NOT NULL, size INTEGER NOT NULL, file_hash TEXT NOT NULL, download_url TEXT NOT NULL, smh_path TEXT NOT NULL, content_type TEXT NOT NULL DEFAULT '', expires_at INTEGER NOT NULL, uploaded_at INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY (file_path));`);
    } catch (error) { console.error('[EdgeSyncMappingStore] initialize failed:', String(error)); this.db = undefined; }
  }
  loadAll() { const sessionToConversation = new Map(); const sessionToMsgChannel = new Map(); if (!this.db) return { sessionToConversation, sessionToMsgChannel }; try { for (const row of this.db.prepare('SELECT session_id, conversation_id, msg_channel FROM edge_sync_mapping').all()) { sessionToConversation.set(row.session_id, row.conversation_id); if (row.msg_channel) sessionToMsgChannel.set(row.session_id, row.msg_channel); } } catch (error) { console.error('[EdgeSyncMappingStore] loadAll failed:', String(error)); } return { sessionToConversation, sessionToMsgChannel }; }
  upsert(sessionId, conversationId, msgChannel = '') { if (!this.db) return; try { this.db.prepare(`INSERT INTO edge_sync_mapping (session_id, conversation_id, msg_channel, created_at) VALUES (?, ?, ?, unixepoch()) ON CONFLICT(session_id) DO UPDATE SET conversation_id = excluded.conversation_id, msg_channel = excluded.msg_channel`).run(sessionId, conversationId, msgChannel); } catch (error) { console.error('[EdgeSyncMappingStore] upsert failed:', String(error)); } }
  upsertBatch(entries) { if (!this.db || !entries.length) return; try { const stmt = this.db.prepare(`INSERT INTO edge_sync_mapping (session_id, conversation_id, msg_channel, created_at) VALUES (?, ?, ?, unixepoch()) ON CONFLICT(session_id) DO UPDATE SET conversation_id = excluded.conversation_id, msg_channel = excluded.msg_channel`); this.db.exec('BEGIN'); for (const entry of entries) stmt.run(entry.sessionId, entry.conversationId, entry.msgChannel || ''); this.db.exec('COMMIT'); } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} console.error('[EdgeSyncMappingStore] upsertBatch failed:', String(error)); } }
  delete(sessionId) { if (!this.db) return; try { this.db.prepare('DELETE FROM edge_sync_mapping WHERE session_id = ?').run(sessionId); } catch (error) { console.error('[EdgeSyncMappingStore] delete failed:', String(error)); } }
  clear() { if (!this.db) return; try { this.db.exec('DELETE FROM edge_sync_mapping'); } catch (error) { console.error('[EdgeSyncMappingStore] clear failed:', String(error)); } }
  getArtifactCache(filePath) { if (!this.db) return undefined; try { return this.db.prepare('SELECT file_path, mtime_ms, size, file_hash, download_url, smh_path, content_type, expires_at, uploaded_at FROM edge_sync_artifact_cache WHERE file_path = ?').get(filePath); } catch (error) { console.error('[EdgeSyncMappingStore] getArtifactCache failed:', String(error)); return undefined; } }
  upsertArtifactCache(entry) { if (!this.db) return; try { this.db.prepare(`INSERT INTO edge_sync_artifact_cache (file_path, mtime_ms, size, file_hash, download_url, smh_path, content_type, expires_at, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch()) ON CONFLICT(file_path) DO UPDATE SET mtime_ms = excluded.mtime_ms, size = excluded.size, file_hash = excluded.file_hash, download_url = excluded.download_url, smh_path = excluded.smh_path, content_type = excluded.content_type, expires_at = excluded.expires_at, uploaded_at = unixepoch()`).run(entry.file_path, entry.mtime_ms, entry.size, entry.file_hash, entry.download_url, entry.smh_path, entry.content_type ?? '', entry.expires_at); } catch (error) { console.error('[EdgeSyncMappingStore] upsertArtifactCache failed:', String(error)); } }
  upsertImageMapping(blobId, cosUri, sessionId) { if (!this.db) return; try { this.db.prepare(`INSERT INTO edge_sync_image_mapping (blob_id, cos_uri, session_id, created_at) VALUES (?, ?, ?, unixepoch()) ON CONFLICT(blob_id) DO NOTHING`).run(blobId, cosUri, sessionId); } catch (error) { console.error('[EdgeSyncMappingStore] upsertImageMapping failed:', String(error)); } }
  getImageUri(blobId) { if (!this.db) return undefined; try { return this.db.prepare('SELECT cos_uri FROM edge_sync_image_mapping WHERE blob_id = ?').get(blobId)?.cos_uri; } catch (error) { console.error('[EdgeSyncMappingStore] getImageUri failed:', String(error)); return undefined; } }
  close() { try { this.db?.close(); } catch {} this.db = undefined; }
}

module.exports = Object.freeze({ EdgeSyncMappingStore });
