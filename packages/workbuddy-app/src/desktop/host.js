'use strict';

const OPEN_LOCAL_DAEMON_TRANSPORT_PORT_MESSAGE = 'workbuddy:open-local-daemon-transport-port';
const WORKBUDDY_POWER_SUSPEND_EVENT = 'power:suspend';
const WORKBUDDY_POWER_RESUME_EVENT = 'power:resume';
const WORKBUDDY_POWER_UNLOCK_SCREEN_EVENT = 'power:unlock-screen';
function getDesktopHost(windowObject = globalThis.window) {
  if (!windowObject) return null;
  const host = windowObject.workbuddyDesktop;
  if (!host || typeof host !== 'object' || typeof host.invoke !== 'function' || !host.events || typeof host.events.on !== 'function') return null;
  return host;
}

module.exports = Object.freeze({ OPEN_LOCAL_DAEMON_TRANSPORT_PORT_MESSAGE, WORKBUDDY_POWER_SUSPEND_EVENT, WORKBUDDY_POWER_RESUME_EVENT, WORKBUDDY_POWER_UNLOCK_SCREEN_EVENT, getDesktopHost });
