'use strict';

class WorkbuddyHostIDEInfoEventProcessor {
  constructor({ clientInfoProvider } = {}) { this.clientInfoProvider = clientInfoProvider; }
  async process({ event = {} } = {}) {
    try {
      const { platform, ideType, platformVersion, machineId, sessionId, downloadChannel } = await this.clientInfoProvider.get();
      event.ideName = event.ideName ?? platform;
      event.ideType = event.ideType ?? ideType;
      event.ideVersion = event.ideVersion ?? platformVersion;
      event.machineId = event.machineId || machineId;
      event.sessionId = event.sessionId || sessionId;
      event.downloadChannel = event.downloadChannel ?? downloadChannel;
    } catch {}
  }
}

module.exports = { WorkbuddyHostIDEInfoEventProcessor };
