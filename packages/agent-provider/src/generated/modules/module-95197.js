// Recovered bundle module 95197; dependencies use the original __webpack_require__ contract.
module.exports = function(eA,el,ec){"use strict";var eu=ec(88511);el.permuteDomain=function(eA){var el=eu.getPublicSuffix(eA);if(!el)return null;if(el==eA)return[eA];for(var ec=eA.slice(0,-(el.length+1)).split(".").reverse(),ed=el,ep=[ed];ec.length;)ep.push(ed=ec.shift()+"."+ed);return ep}};
