// Recovered bundle module 75796; dependencies use the original __webpack_require__ contract.
module.exports = function(eA,el,ec){"use strict";ec.r(el),ec.d(el,{DebugLogger:()=>DebugLogger});var eu=ec(91943),ed=ec(16928),ep=ec(44237);let DebugLogger=class DebugLogger{static async ensureLogDir(){return this.logDirPromise||(this.logDirPromise=(async()=>{let eA=(0,ed.join)(ep.PathUtils.getHomeDir(),"logs");try{await (0,eu.mkdir)(eA,{recursive:!0})}catch(eA){}return eA})()),this.logDirPromise}static async error(eA,el,ec){try{let ep=await this.ensureLogDir(),eg=(0,ed.join)(ep,"debug.log"),eh=new Date().toISOString(),ef=ec?`
${this.formatError(ec)}`:"",em=`[${eh}] [ERROR] [${eA}] ${el}${ef}
`;await (0,eu.appendFile)(eg,em,"utf-8")}catch(eA){}}static async warn(eA,el){try{let ec=await this.ensureLogDir(),ep=(0,ed.join)(ec,"debug.log"),eg=new Date().toISOString(),eh=`[${eg}] [WARN] [${eA}] ${el}
`;await (0,eu.appendFile)(ep,eh,"utf-8")}catch(eA){}}static formatError(eA){if(eA instanceof Error)return`${eA.name}: ${eA.message}
${eA.stack||""}`;try{return JSON.stringify(eA,null,2)}catch(el){return String(eA)}}};DebugLogger.logDirPromise=null};
