'use strict';

function createWorkbuddySessionPersistence(deps = {}) {
  const createRecordStore = deps.createRecordStore || ((celljs, options) => deps.recordStoreFactory?.(celljs, options));
  const createUsageStore = deps.createUsageStore || ((celljs) => deps.usageStoreFactory?.(celljs));
  const usageServiceFactory = deps.usageServiceFactory || ((options) => options);
  const recordStore = createRecordStore?.(deps.celljs, { getCurrentUserId: deps.getCurrentUserId });
  const usageStore = createUsageStore?.(deps.celljs);
  return {
    recordStore,
    usageCacheService: usageServiceFactory({ store: usageStore, logger: deps.logger }),
  };
}

module.exports = Object.freeze({ createWorkbuddySessionPersistence });
