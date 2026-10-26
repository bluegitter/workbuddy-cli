'use strict';

function initializeWorkbuddyAppServerDatabase(database, options = {}) {
  database.initialize();
  options.logger?.info?.(`[AppServerDatabase] Unified database ready: ${database.getDatabasePath()}`);
  return database;
}

function createInitializedWorkbuddyAppServerDatabase(options = {}) {
  const { logger, createDatabase, ...databaseOptions } = options;
  if (typeof createDatabase !== 'function') throw new TypeError('createDatabase is required');
  return initializeWorkbuddyAppServerDatabase(createDatabase(databaseOptions), { logger });
}

module.exports = Object.freeze({ initializeWorkbuddyAppServerDatabase, createInitializedWorkbuddyAppServerDatabase });
