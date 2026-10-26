'use strict';
const { handleRpc } = require('../server/handler-registry');
function registerTelemetryHandlers(registry, deps) { const service = deps.service; if (!service) throw new Error('telemetry service is required'); handleRpc(registry, 'telemetryReport', (eventName, payload) => service.report(eventName, payload)); handleRpc(registry, 'telemetryReportSync', (eventName, payload) => service.reportSync(eventName, payload)); handleRpc(registry, 'appLifecycleLog', (tag, fields) => service.lifecycleLog(tag, fields)); return registry; }
module.exports = Object.freeze({ registerTelemetryHandlers });
