'use strict';
const LICENSE_ON_CHANGE_CHANNEL = 'license:onChange';
function registerLicenseRuntimeHandlers(registry, deps) { const servicePromise = Promise.resolve(deps.service ?? deps.licenseService ?? deps.createService?.(deps.cellDeps, deps)); registry.handle('license:getSnapshot', () => servicePromise.then((service) => service.getSnapshot())); servicePromise.then((service) => { service.start?.(); service.licenseUsable$?.subscribe?.((value) => registry.push?.(LICENSE_ON_CHANGE_CHANNEL, value)); }).catch((error) => deps.logger?.error?.('[LicenseOverview] registration failed:', String(error))); return registry; }
module.exports = Object.freeze({ LICENSE_ON_CHANGE_CHANNEL, registerLicenseRuntimeHandlers });
