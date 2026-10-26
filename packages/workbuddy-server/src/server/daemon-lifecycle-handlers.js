'use strict';

const DAEMON_LIFECYCLE_RPC_CHANNELS = Object.freeze({ PING: 'daemon:ping', SHUTDOWN: 'daemon:shutdown' });
function defaultSchedule(callback) { setImmediate(callback); }
function registerDaemonLifecycleHandlers(registry, deps) {
  const schedule = deps.schedule ?? defaultSchedule;
  registry.handle(DAEMON_LIFECYCLE_RPC_CHANNELS.PING, async () => deps.getPingStatus());
  registry.handle(DAEMON_LIFECYCLE_RPC_CHANNELS.SHUTDOWN, async () => { schedule(() => deps.shutdown()); return { ok: true }; });
}
module.exports = Object.freeze({ DAEMON_LIFECYCLE_RPC_CHANNELS, registerDaemonLifecycleHandlers, defaultSchedule });
