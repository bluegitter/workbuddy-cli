'use strict';
const { FEEDBACK_RPC_CHANNELS } = require('./contract');
function registerFeedbackHandlers(registry, deps) { const service = Promise.resolve(deps.services).then((value) => value.feedback); const logger = deps.logger ?? console; registry.handle(FEEDBACK_RPC_CHANNELS.SUBMIT, async (params) => { try { return await (await service).submit(params); } catch (error) { const message = error instanceof Error ? error.message : String(error); logger.error?.('[FeedbackHandlers] feedbackSubmit failed:', message); return { success: false, error: message, errorCode: 500 }; } }); }
module.exports = Object.freeze({ registerFeedbackHandlers });
