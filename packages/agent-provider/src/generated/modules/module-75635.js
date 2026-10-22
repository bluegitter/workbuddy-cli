// Recovered bundle module 75635; dependencies use the original __webpack_require__ contract.
module.exports = function(eA,el,ec){"use strict";function logMcpUiDiag(eA,el,ec=!1){if(!eA?.info)return;let eu=[`event=${el.event}`];for(let[eA,ec]of Object.entries(el))"event"!==eA&&void 0!==ec&&eu.push(`${eA}=${"string"==typeof ec?ec:JSON.stringify(ec)}`);eu.push(`t=${new Date().toISOString()}`);let ed=`[McpUiDiag] ${eu.join(" ")}`;if(ec){let eA=Error("callsite").stack;eA&&(ed+=`
stack=${eA}`)}eA.info(ed)}ec.r(el),ec.d(el,{logMcpUiDiag:()=>logMcpUiDiag})};
