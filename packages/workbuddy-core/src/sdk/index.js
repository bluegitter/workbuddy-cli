'use strict';

const { WB_SDK_VERSION } = require('./version');
const { createEventBus } = require('../infra/bus/event-bus');
const { createTelemetryNamespace } = require('./namespaces/telemetry');
const { createHttpNamespace } = require('./namespaces/http');
const { createUtilsNamespace } = require('./namespaces/utils/create');
const { createWBConfigFromFacade } = require('../domains/config/wb');
const { WBError } = require('../infra/wb-error');

const REQUIRED_NAMESPACES = ['storage', 'changes', 'conversations', 'artifacts', 'skills', 'account', 'experts', 'automations', 'models', 'notifications', 'ops', 'connectors', 'workspaces', 'config', 'windows', 'navigation'];

function createWorkbuddySDK(params = {}) {
  const { platform, http: httpService, eventBus: externalBus, upload, download } = params;
  const bus = externalBus ?? createEventBus();
  const mounted = new Map([
    ['telemetry', createTelemetryNamespace().proxy],
    ['http', createHttpNamespace({ http: httpService, eventBus: bus, upload, download })],
  ]);
  const sdkRef = { current: undefined };
  const requireNamespace = (name, message) => {
    const implementation = mounted.get(name);
    if (!implementation) throw new WBError(message || `wb.${name} is not provided`, { code: 'NOT_READY', source: `wb.${name}` });
    return implementation;
  };
  const sdk = {
    version: WB_SDK_VERSION,
    get storage() { return requireNamespace('storage', "wb.storage is not provided — call wb.$provide('storage', sdk) first"); },
    get changes() { return requireNamespace('changes'); },
    get conversations() { return requireNamespace('conversations'); },
    get artifacts() { return requireNamespace('artifacts'); },
    get skills() { return requireNamespace('skills'); },
    get account() { return requireNamespace('account'); },
    get experts() { return requireNamespace('experts'); },
    get automations() { return requireNamespace('automations'); },
    get models() { return requireNamespace('models'); },
    get notifications() { return requireNamespace('notifications'); },
    get ops() { return requireNamespace('ops'); },
    get connectors() { return requireNamespace('connectors'); },
    get workspaces() { return requireNamespace('workspaces'); },
    get config() { return requireNamespace('config'); },
    get windows() { return requireNamespace('windows'); },
    get ui() { return requireNamespace('ui', "wb.ui is not provided — call wb.$provide('ui', impl) after React mounts."); },
    get telemetry() { return mounted.get('telemetry'); },
    get http() { return mounted.get('http'); },
    utils: createUtilsNamespace(() => sdkRef.current),
    get navigation() { return requireNamespace('navigation', "wb.navigation is not provided — call wb.$provide('navigation', impl) first."); },
    platform,
    on: bus.on.bind(bus),
    off: bus.off.bind(bus),
    $eventBus: bus,
    $provide(name, implementation) {
      if (name === 'config') {
        mounted.set('config', createWBConfigFromFacade(implementation));
        implementation.onChange?.((key, value, previous) => {
          bus.emit(`config.preferences.${key}.changed`, { [key]: value, previous });
          bus.emit('config.preferences.changed', { key, value, previous });
        });
      } else if (name === 'http') {
        mounted.set('http', { ...mounted.get('http'), ...implementation });
      } else {
        mounted.set(name, implementation);
      }
    },
    $destroy() {
      bus.clear();
      mounted.clear();
      sdkRef.current = undefined;
    },
  };
  sdkRef.current = sdk;
  return sdk;
}

module.exports = Object.freeze({ REQUIRED_NAMESPACES, createWorkbuddySDK });
