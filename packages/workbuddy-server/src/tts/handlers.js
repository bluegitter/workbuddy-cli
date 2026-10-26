'use strict';

const { TTS_RPC_CHANNELS } = require('./contract');

const TAG = '[TtsHandlers]';

function registerTtsHandlers(registry, deps) {
  const service = Promise.resolve(deps.services).then((services) => services.tts);
  const logger = deps.logger ?? console;

  registry.handle(TTS_RPC_CHANNELS.START_TTS, async (params) => {
    try {
      const pushEvent = (payload) => registry.push(TTS_RPC_CHANNELS.EVENT, payload);
      return await (await service).startTts(params, pushEvent);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`${TAG} startTts failed:`, message);
      return { success: false, error: message };
    }
  });

  registry.handle(TTS_RPC_CHANNELS.STOP_TTS, async (params) => {
    try {
      await (await service).stopTts(params);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`${TAG} stopTts failed:`, message);
    }
  });
}

module.exports = Object.freeze({ registerTtsHandlers });
