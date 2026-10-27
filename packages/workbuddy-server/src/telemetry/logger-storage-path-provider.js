'use strict';

const { getWorkbuddyRuntimeLogsDir } = require('../../../runtime/src/runtime/runtime-context');

class LoggerStoragePathProviderImpl {
  provide() { return getWorkbuddyRuntimeLogsDir(); }
}

module.exports = { LoggerStoragePathProviderImpl };
