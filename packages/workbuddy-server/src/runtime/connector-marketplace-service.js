'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { downloadBufferWithHeaders } = require('./marketplace-download');

class ConnectorMarketplaceService {
  constructor(options = {}) {
    this.cache = options.cache;
    this.baseDir = options.baseDir || this.cache?.baseDir;
    this.manifestPath = options.manifestPath || 'marketplace.json';
    this.download = options.download || downloadBufferWithHeaders;
    this.extract = options.extract || (() => { throw new Error('marketplace archive extractor is unavailable'); });
    this.tempDirectory = options.tempDirectory || os.tmpdir();
    this.randomSuffix = options.randomSuffix || (() => `${process.pid}-${Date.now()}`);
    this.logger = options.logger || { info() {}, warn() {} };
    this.afterReplace = options.afterReplace || (async () => {});
  }

  async downloadAndReplace(url, marketplaceName) {
    const target = path.join(this.tempDirectory, `connectors-marketplace-tmp-${this.randomSuffix()}`);
    try {
      const downloaded = await this.download(url);
      const result = await this.extractToDirectory(downloaded.buffer, target, downloaded.etag);
      if (!this.cache?.replaceDirectory(target)) return { replaced: false, reason: 'lock-held', manifest: result.manifest };
      this.cache?.saveMeta(result.fingerprint);
      await this.afterReplace({ marketplaceName, manifest: result.manifest, fingerprint: result.fingerprint });
      this.logger.info?.(`[ConnectorMarketplaceService] synced marketplace ${marketplaceName}`);
      return { replaced: true, ...result };
    } finally {
      fs.rmSync(target, { recursive: true, force: true });
    }
  }

  async extractToDirectory(buffer, targetDir, etag) {
    fs.mkdirSync(targetDir, { recursive: true });
    await this.extract(buffer, targetDir);
    const manifestFile = path.join(targetDir, this.manifestPath);
    if (!fs.existsSync(manifestFile)) throw new Error(`Downloaded archive does not contain ${this.manifestPath}`);
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    return { manifest, fingerprint: { etag: etag ?? null, sha256: crypto.createHash('sha256').update(buffer).digest('hex') } };
  }
}

module.exports = { ConnectorMarketplaceService };
