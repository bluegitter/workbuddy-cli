// Recovered bundle module 27283; dependencies use the original __webpack_require__ contract.
module.exports = function(eA){eA.exports={stringify:function(eA,{EOL:el="\n",finalEOL:ec=!0,replacer:eu=null,spaces:ed}={}){let ep=ec?el:"";return JSON.stringify(eA,eu,ed).replace(/\n/g,el)+ep},stripBom:function(eA){return Buffer.isBuffer(eA)&&(eA=eA.toString("utf8")),eA.replace(/^\uFEFF/,"")}}};
