'use strict';
function createPerfFacade(deps) { return { appendLine: (flowType, jsonLine) => deps.getLogger(flowType).appendRendererLine(jsonLine), flush: (flowType) => deps.getLogger(flowType).flush(), getLogFilePath: (flowType) => deps.getLogger(flowType).getLogFilePath() }; }
module.exports = Object.freeze({ createPerfFacade });
