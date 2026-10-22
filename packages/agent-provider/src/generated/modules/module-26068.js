// Recovered bundle module 26068; dependencies use the original __webpack_require__ contract.
module.exports = function(eA,el,ec){let eu=ec(96667),ed=1335,ep=21522,eg=eu.getBCHDigit(ed);el.getEncodedBits=function(eA,el){let ec=eA.bit<<3|el,eh=ec<<10;for(;eu.getBCHDigit(eh)-eg>=0;)eh^=ed<<eu.getBCHDigit(eh)-eg;return(ec<<10|eh)^ep}};
