'use strict';

const TAG = '[PerfHandlers]';
function register(registry, name, handler) { if (typeof registry.handle === 'function') registry.handle(name, handler); else if (typeof registry.register === 'function') registry.register(name, handler); else throw new Error('RPC registry does not support handle/register'); }
function registerPerfHandlers(registry, deps) {
  const services = Promise.resolve(deps.services); const logger = deps.logger ?? console; const getPerf = async () => (await services).perf;
  register(registry, 'perfAppendLine', async (flowType, jsonLine) => { try { await (await getPerf()).appendLine(flowType, jsonLine); } catch (error) { logger.error?.(`${TAG} Failed to append perf line:`, String(error)); } });
  register(registry, 'perfFlush', async (flowType) => { try { await (await getPerf()).flush(flowType); } catch (error) { logger.error?.(`${TAG} Failed to flush perf logger:`, String(error)); } });
  register(registry, 'perfGetLogFilePath', async (flowType) => { try { return await (await getPerf()).getLogFilePath(flowType); } catch (error) { logger.error?.(`${TAG} Failed to get log file path:`, String(error)); return null; } });
  return registry;
}
module.exports = Object.freeze({ TAG, registerPerfHandlers });
