'use strict';
function createWorkbuddyAppServerServices(options) { return { docsService: options.docsService, identityServiceRef: {}, moderationService: options.moderationService, sessionPersistence: options.sessionPersistence }; }
function startWorkbuddyAppServerIdentityBridge(options) { return options.startIdentityBridge?.({ identityServiceRef: options.services.identityServiceRef, configDir: options.configDir, pushEvent: options.pushEvent, logger: options.logger }); }
module.exports = Object.freeze({ createWorkbuddyAppServerServices, startWorkbuddyAppServerIdentityBridge });
