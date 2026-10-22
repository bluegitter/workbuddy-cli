// Recovered bundle module 91444; dependencies use the original __webpack_require__ contract.
module.exports = function(eA,el,ec){let eu=ec(80520),ed=5,ep=31,eg=32;function toVLQSigned(eA){return eA<0?(-eA<<1)+1:(eA<<1)+0}el.encode=function(eA){let el,ec="",eh=toVLQSigned(eA);do el=eh&ep,(eh>>>=ed)>0&&(el|=eg),ec+=eu.encode(el);while(eh>0);return ec}};
