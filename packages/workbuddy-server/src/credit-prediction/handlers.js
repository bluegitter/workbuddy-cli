'use strict';
const { CREDIT_PREDICTION_RPC_CHANNELS } = require('./contract');
const TAG = '[CreditPredictionHandlers]';
function registerCreditPredictionHandlers(registry, deps) { const service = Promise.resolve(deps.services).then((value) => value.creditPrediction); const logger = deps.logger ?? console; registry.handle(CREDIT_PREDICTION_RPC_CHANNELS.PREDICT, async (request) => { try { return await (await service).predict(request); } catch (error) { const message = error instanceof Error ? error.message : String(error); logger.error?.(`${TAG} predict failed:`, message); return { success: false, error: message }; } }); registry.handle(CREDIT_PREDICTION_RPC_CHANNELS.CANCEL, async (id) => { try { return await (await service).cancel(id); } catch (error) { logger.error?.(`${TAG} cancel failed:`, error instanceof Error ? error.message : String(error)); return { success: false }; } }); }
module.exports = Object.freeze({ registerCreditPredictionHandlers });
