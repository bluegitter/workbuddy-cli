'use strict';
const { AutomationService } = require('./automation-service');
const { AutomationSqliteStorageAdapter } = require('./sqlite-automation-storage-adapter');
function createWorkbuddyAutomationService(deps) { return new AutomationService(deps.logger, new AutomationSqliteStorageAdapter(deps.database, deps.logger), deps.options); }
module.exports = Object.freeze({ createWorkbuddyAutomationService });
