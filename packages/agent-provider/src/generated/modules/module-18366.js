// Recovered bundle module 18366; dependencies use the original __webpack_require__ contract.
module.exports = function(eA){"use strict";function getParamSize(eA){return(eA/8|0)+ +(eA%8!=0)}var el={ES256:getParamSize(256),ES384:getParamSize(384),ES512:getParamSize(521)};eA.exports=function(eA){var ec=el[eA];if(ec)return ec;throw Error('Unknown algorithm "'+eA+'"')}};
