'use strict';

const { getWorkbuddyRuntimeConfigDir } = require('../server/runtime-context');

function resolveDatabaseService(options) {
  if (typeof options.DatabaseService === 'function') return options.DatabaseService;
  try { return require('./database-service').WorkbuddyDatabaseService; }
  catch (error) {
    if (error?.code !== 'MODULE_NOT_FOUND') throw error;
    throw new Error('WorkbuddyDatabaseService has not been restored; provide options.DatabaseService');
  }
}

function createWorkbuddyServerDatabase(options = {}) {
  const DatabaseService = resolveDatabaseService(options);
  const { DatabaseService: _ignored, ...serviceOptions } = options;
  return new DatabaseService({ ...serviceOptions, configDir: options.configDir ?? getWorkbuddyRuntimeConfigDir() });
}

module.exports = Object.freeze({ createWorkbuddyServerDatabase, resolveDatabaseService });
