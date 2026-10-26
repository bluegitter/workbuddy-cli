'use strict';

const PICK_LOCATION_TOOL_NAME = 'pick_location';
const NOOP_LOGGER = Object.freeze({ info() {}, warn() {} });

function createPickLocationTool(deps) {
  const { poiQuestionRegistry, setSessionPoi, isPoiMapEnabled, pushPoiPickQuestion, logger = NOOP_LOGGER } = deps;
  return {
    name: PICK_LOCATION_TOOL_NAME,
    description: "Request the user to confirm or pick a physical location (POI) for the current session.",
    inputSchema: { type: 'object', properties: { reason: { type: 'string', description: "Short, user-facing explanation of why the location is needed." } }, required: ['reason'] },
    handler: async (args, context) => {
      if (isPoiMapEnabled && !isPoiMapEnabled()) return { content: [{ type: 'text', text: 'Error: the location feature has been disabled by enterprise policy (PoiMap).' }], isError: true };
      const sessionId = context?.workbuddySessionId;
      if (!sessionId) return { content: [{ type: 'text', text: 'Error: pick_location requires an active workbuddy session (workbuddySessionId missing).' }], isError: true };
      const requestId = context?.requestId ?? `poi-pick-${Date.now()}`;
      const reason = String(args?.reason ?? '');
      try {
        const promise = poiQuestionRegistry.ask(sessionId, requestId, { reason });
        if (pushPoiPickQuestion) pushPoiPickQuestion(sessionId, requestId, { reason });
        const result = await promise;
        if (result.status === 'completed') {
          const parts = result.location.regionPath.split(' / ');
          setSessionPoi(sessionId, { lat: result.location.lat, lng: result.location.lng, province: parts[0] || undefined, city: parts.length >= 3 ? parts[1] : undefined, district: parts.length >= 3 ? parts[2] : parts.length >= 2 ? parts[1] : undefined, address: result.location.detailAddress, source: 'pick_location', capturedAt: Date.now() });
        }
        return { content: [{ type: 'text', text: JSON.stringify({ type: 'pick_location_result', ...result }) }] };
      } catch (error) { logger.warn?.(`[PickLocation] error sessionId=${sessionId} requestId=${requestId}:`, error); return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true }; }
    }
  };
}

module.exports = Object.freeze({ NOOP_LOGGER, PICK_LOCATION_TOOL_NAME, createPickLocationTool });
