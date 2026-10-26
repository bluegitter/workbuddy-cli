'use strict';

const { BufferedFileLogger } = require('../common/buffered-file-logger');
const { getWorkbuddyRuntimeLogsDir } = require('../../../runtime/src/runtime/runtime-context');

class DatabaseFileLogger extends BufferedFileLogger {
  static instance = null;
  constructor() { super({ logDir: getWorkbuddyRuntimeLogsDir('database'), filePrefix: 'database', retentionDays: 30 }); }
  static getInstance() { if (!DatabaseFileLogger.instance) DatabaseFileLogger.instance = new DatabaseFileLogger(); return DatabaseFileLogger.instance; }
}
function getDatabaseLogger() { return DatabaseFileLogger.getInstance(); }
module.exports = Object.freeze({ DatabaseFileLogger, getDatabaseLogger });
