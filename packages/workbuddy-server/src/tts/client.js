'use strict';

const { TTS_RPC_CHANNELS } = require('./contract');

function invoke(channel) {
  return Object.freeze({ type: 'invoke', channel });
}

function listener(channel) {
  return Object.freeze({ type: 'listener', channel });
}

const TTS_CHANNEL_MAP = Object.freeze({
  startTts: invoke(TTS_RPC_CHANNELS.START_TTS),
  stopTts: invoke(TTS_RPC_CHANNELS.STOP_TTS),
  onTtsEvent: listener(TTS_RPC_CHANNELS.EVENT),
});

module.exports = Object.freeze({ TTS_CHANNEL_MAP, invoke, listener });
