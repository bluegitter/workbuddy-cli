'use strict';

const { Console } = require('node:console');

function installDaemonStdioConsoleGuard({ stdout = process.stderr, stderr = process.stderr } = {}) {
  const stderrConsole = new Console({ stdout, stderr });
  for (const method of ['log', 'info', 'debug', 'warn', 'error', 'dir', 'table', 'trace']) {
    console[method] = stderrConsole[method].bind(stderrConsole);
  }
}

function startDaemonAppServerEntry({
  initStartupContext,
  configureLogger = async () => {},
  loadMain,
  exit = (code) => process.exit(code),
  log = (...args) => console.error(...args),
} = {}) {
  initStartupContext?.('daemon');
  return Promise.resolve()
    .then(() => configureLogger({ disableConsoleTransport: true, rootScope: 'daemon-server' }))
    .then(() => loadMain?.())
    .then((main) => main?.runDaemonAppServerEntry?.())
    .catch((error) => {
      log('[DaemonAppServer] Fatal error:', error);
      exit(1);
    });
}

module.exports = { installDaemonStdioConsoleGuard, startDaemonAppServerEntry };
