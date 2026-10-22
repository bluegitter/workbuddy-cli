// Recovered bundle module 69327; dependencies use the original __webpack_require__ contract.
module.exports = function(eA){"use strict";let InvalidFormatError=class InvalidFormatError extends Error{constructor(eA){super(`Format functions must be synchronous taking a two arguments: (info, opts)
Found: ${eA.toString().split("\n")[0]}
`),Error.captureStackTrace(this,InvalidFormatError)}};eA.exports=eA=>{if(eA.length>2)throw new InvalidFormatError(eA);function Format(eA={}){this.options=eA}function createFormatWrap(eA){return new Format(eA)}return Format.prototype.transform=eA,createFormatWrap.Format=Format,createFormatWrap}};
