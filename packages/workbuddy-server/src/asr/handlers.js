'use strict';
const TAG = '[AsrHandlers]';
function registerAsrHandlers(registry, deps) {
  const asrService = Promise.resolve(deps.services).then((services) => services.asr);
  const logger = deps.logger ?? console;
  registry.handle('asr:speechToText', async (params) => {
    try { return await (await asrService).speechToText(params); }
    catch (error) { const message = error instanceof Error ? error.message : String(error); logger.error?.(`${TAG} speechToText failed:`, message); return { success: false, error: message }; }
  });
}
module.exports = Object.freeze({ registerAsrHandlers });
