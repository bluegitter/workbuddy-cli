'use strict';
const os = require('node:os');
const path = require('node:path');
const { BufferedFileLogger } = require('../common/buffered-file-logger');
function getWorkbuddyConfigDir() { return process.env.WORKBUDDY_CONFIG_DIR?.trim() || process.env.CODEBUDDY_CONFIG_DIR?.trim() || path.join(os.homedir(), '.workbuddy'); }
function getMigrationLogDir() { return path.join(getWorkbuddyConfigDir(), 'logs', 'migration'); }
class MigrationFileLogger extends BufferedFileLogger { constructor() { super({ logDir: getMigrationLogDir(), filePrefix: 'migration' }); } static getInstance() { MigrationFileLogger.instance ??= new MigrationFileLogger(); return MigrationFileLogger.instance; } }
MigrationFileLogger.instance = null;
module.exports = Object.freeze({ getWorkbuddyConfigDir, getMigrationLogDir, MigrationFileLogger });
