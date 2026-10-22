'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CACHE_FORMAT_VERSION = 2;

class ExpertCacheManager {
  constructor(cacheDir) { if (!cacheDir) throw new TypeError('cache directory is required'); this.cacheDir = cacheDir; }
  filePath(name) { return path.join(this.cacheDir, name); }
  async exists(filePath) { try { await fs.promises.access(filePath, fs.constants.F_OK); return true; } catch { return false; } }
  async ensureDir() { await fs.promises.mkdir(this.cacheDir, { recursive: true }); }
  computeHash(manifest) { return crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex'); }
  async getManifest() { try { return JSON.parse(await fs.promises.readFile(this.filePath('manifest.json'), 'utf8')); } catch { return null; } }
  async getMetadata() { try { return JSON.parse(await fs.promises.readFile(this.filePath('metadata.json'), 'utf8')); } catch { return null; } }
  async getCachedVersion() { try { return (await fs.promises.readFile(this.filePath('version.txt'), 'utf8')).trim(); } catch { return null; } }
  async getCachedHash() { const metadata = await this.getMetadata(); if (metadata?.manifestHash) return metadata.manifestHash; const manifest = await this.getManifest(); return manifest ? this.computeHash(manifest) : null; }
  async isCompatible(sourceSignature) { return (await this.getMetadata())?.sourceSignature === sourceSignature; }
  async saveManifest(manifest, sourceSignature) {
    await this.ensureDir();
    await fs.promises.writeFile(this.filePath('manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await fs.promises.writeFile(this.filePath('version.txt'), String(manifest.version || ''), 'utf8');
    await fs.promises.writeFile(this.filePath('metadata.json'), `${JSON.stringify({ version: manifest.version, cachedAt: new Date().toISOString(), sourceSignature, manifestHash: this.computeHash(manifest), cacheFormatVersion: CACHE_FORMAT_VERSION }, null, 2)}\n`, 'utf8');
  }
  async clear() { try { await fs.promises.rm(this.cacheDir, { recursive: true, force: true }); } catch {} }
}

module.exports = { CACHE_FORMAT_VERSION, ExpertCacheManager };
