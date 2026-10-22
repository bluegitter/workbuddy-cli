'use strict';

function classifyMcpInvokeErrorKind(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/disabled by user/i.test(message)) return 'disabled';
  if (/requires re-authorization/i.test(message)) return 'auth';
  if (/is unavailable/i.test(message)) return 'unavailable';
  if (/is not connected/i.test(message)) return 'not_connected';
  if (/is reconnecting/i.test(message)) return 'reconnecting';
  if (/not found in any connected connector/i.test(message)) return 'not_found';
  if (/timeout|timed out/i.test(message)) return 'timeout';
  return 'unknown';
}

function classifyMcpListErrorKind(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/method not found|-32601/i.test(message)) return 'method_not_found';
  if (/timeout|timed out/i.test(message)) return 'timeout';
  if (/unauthor|401|403/i.test(message)) return 'auth';
  return 'unknown';
}

let metricReporter;
function setConnectorMetricReporter(reporter) { metricReporter = reporter; }

class ConnectorMetricReporter {
  duration(metric, durationMs, dimensions) { metricReporter?.recordDuration(metric, durationMs, dimensions); }
  count(metric, dimensions) { metricReporter?.addCounter(metric, 1, dimensions); }

  invoke({ dims, durationMs, result, error }) {
    const baseDims = { mcp_server: dims.mcpServer, tool_name: dims.toolName };
    if (error !== undefined) {
      this.duration('wb.connector.invoke.error', durationMs, { ...baseDims, error_kind: classifyMcpInvokeErrorKind(error) });
      return;
    }
    const businessError = !!(result && typeof result === 'object' && (result.isError || result.is_error));
    this.duration(`wb.connector.invoke.${businessError ? 'biz_error' : 'success'}`, durationMs, baseDims);
  }

  transportError(connector, errorKind) { this.count(`wb.connector.transport.error.${errorKind}`, { connector }); }

  connect(args) {
    const dimensions = { mcp_server: args.serverShortName, silent: String(args.silent) };
    if (args.errorKind) dimensions.error_kind = args.errorKind;
    if (args.durationMs !== undefined) dimensions.duration_ms = String(Math.max(0, Math.round(args.durationMs)));
    this.count(`wb.connector.main.connect.${args.outcome}`, dimensions);
  }

  disconnect(args) {
    const dimensions = { mcp_server: args.serverShortName, reason: args.reason };
    if (args.errorKind) dimensions.error_kind = args.errorKind;
    if (args.durationMs !== undefined) dimensions.duration_ms = String(Math.max(0, Math.round(args.durationMs)));
    this.count(`wb.connector.main.disconnect.${args.outcome}`, dimensions);
  }

  list(args) {
    const dimensions = { mcp_server: args.serverShortName };
    if (args.errorKind) dimensions.error_kind = args.errorKind;
    this.duration(`wb.connector.list.${args.kind}.${args.outcome}`, args.durationMs, dimensions);
  }

  oauthCallback(args) {
    const dimensions = { mcp_server: args.serverShortName };
    if (args.errorKind) dimensions.error_kind = args.errorKind;
    this.duration(`wb.connector.oauth.callback.${args.outcome}`, args.durationMs, dimensions);
  }
}

module.exports = { classifyMcpInvokeErrorKind, classifyMcpListErrorKind, setConnectorMetricReporter, ConnectorMetricReporter };
