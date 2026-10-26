'use strict';

async function configureDaemonNetworkProxy({ resolveDaemonProxyEnv, pacResolver, netLog, initialize, authCoordinator, productConfig, disableTlsVerification, logger = console, env = process.env } = {}) {
  let pacRpcHandle;
  if (pacResolver) {
    try {
      netLog?.setPacResolver?.(pacResolver);
      logger.info?.('PAC resolver installed (per-request resolveProxy via host bridge)');
    } catch (error) {
      logger.warn?.('install PAC resolver failed (non-fatal, falling back to env)', error);
    }
    try {
      pacRpcHandle = await initialize?.startPacRpcService?.(pacResolver, { logger: { info: (message) => logger.info?.(message), warn: (message) => logger.warn?.(message) } });
      if (pacRpcHandle) {
        env[initialize.PAC_RPC_SOCKET_ENV] = pacRpcHandle.socketPath;
        env[initialize.PAC_RPC_TOKEN_ENV] = pacRpcHandle.token;
        logger.info?.(`PAC RPC service started: socket=${pacRpcHandle.socketPath} (token written to env)`);
      }
    } catch (error) {
      logger.warn?.('start PAC RPC service failed (non-fatal, CLI will skip L0)', error);
    }
  }
  try {
    const proxyEnv = await resolveDaemonProxyEnv?.() || {};
    for (const [key, value] of Object.entries(proxyEnv)) {
      if (key !== 'NODE_OPTIONS' && typeof value === 'string' && value.length > 0) env[key] = value;
    }
  } catch (error) {
    logger.warn?.('resolve daemon proxy env failed (non-fatal)', error);
  }
  netLog?.installUndiciProxyDispatcher?.();
  netLog?.installAxiosGlobalProxy?.();
  authCoordinator?.suppressTlsRejectWarning?.();
  try {
    if (disableTlsVerification?.(productConfig?.(), productConfig?.DisableTlsVerification)) authCoordinator?.disableTlsVerificationForProcess?.('bootstrap:daemon:product.json');
  } catch (error) {
    logger.warn?.('[TlsVerification] early bootstrap injection skipped (non-fatal)', error);
  }
  return pacRpcHandle;
}

module.exports = { configureDaemonNetworkProxy };
