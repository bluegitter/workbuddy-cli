'use strict';

const os = require('node:os');
const { WorkbuddyResourceProvider } = require('./protocol');

function safeHostname() { try { return os.hostname() || 'unknown'; } catch { return 'unknown'; } }

class WorkbuddyDaemonResourceProvider {
  provide() {
    const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev';
    return {
      'service.name': 'workbuddy-daemon',
      'service.version': '1.0.0',
      target: 'ElectronApp.WorkBuddy.Desktop',
      type: 'resource',
      env_name: isDev ? 'development' : 'production',
      namespace: isDev ? 'Development' : 'Production',
      container_name: 'genie.ElectronApp.WorkBuddy.Desktop',
      ideType: 'workbuddy-daemon',
      instance: `${safeHostname()}-${process.pid}-${Date.now()}`,
      os: process.platform,
    };
  }
}

module.exports = { WorkbuddyResourceProvider, WorkbuddyDaemonResourceProvider, safeHostname };
