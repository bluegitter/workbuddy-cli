'use strict';
const fs = require('node:fs');
const path = require('node:path');
class JsonFileDataRetentionConfigStore {
  constructor(configDir) { this.filePath = path.join(configDir, 'app', 'app-config.json'); }
  async read() { try { return (JSON.parse(await fs.promises.readFile(this.filePath, 'utf8')).dataRetention) ?? null; } catch (error) { if (error?.code === 'ENOENT') return null; throw error; } }
  async write(state) { await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true }); let data = {}; try { data = JSON.parse(await fs.promises.readFile(this.filePath, 'utf8')); } catch (error) { if (error?.code !== 'ENOENT') throw error; } data.dataRetention = state; const temporaryPath = `${this.filePath}.tmp`; await fs.promises.writeFile(temporaryPath, JSON.stringify(data, null, 2), 'utf8'); await fs.promises.rename(temporaryPath, this.filePath); }
}
module.exports = Object.freeze({ JsonFileDataRetentionConfigStore });
