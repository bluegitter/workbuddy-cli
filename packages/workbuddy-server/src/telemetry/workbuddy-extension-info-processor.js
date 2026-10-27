'use strict';

class WorkbuddyExtensionInfoEventProcessor {
  constructor({ clientInfoProvider } = {}) { this.clientInfoProvider = clientInfoProvider; }
  async process({ event = {} } = {}) {
    try {
      const { pluginName, pluginVersion } = await this.clientInfoProvider.get();
      event.extName = pluginName;
      event.extVersion = pluginVersion;
    } catch {}
  }
}

module.exports = { WorkbuddyExtensionInfoEventProcessor };
