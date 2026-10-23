'use strict';

require('./fs-protection.js');

const { initStartupContextFromEnv } = require('../runtime/startup-context');
const { installDaemonStdioConsoleGuard, startDaemonAppServerEntry } = require('../runtime/daemon-app-server-entry');

installDaemonStdioConsoleGuard();
startDaemonAppServerEntry({
  initStartupContext: initStartupContextFromEnv,
  configureLogger: () => import('./workbuddy-server-logger.js').then(({ configureDesktopWorkbuddyServerLogger }) => configureDesktopWorkbuddyServerLogger({ disableConsoleTransport: true, rootScope: 'daemon-server' })),
  loadMain: () => import('./daemon-app-server-main.js'),
});
