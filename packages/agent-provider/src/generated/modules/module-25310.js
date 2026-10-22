// Recovered bundle module 25310; dependencies use the original __webpack_require__ contract.
module.exports = function(eA,el,ec){"use strict";ec.r(el),ec.d(el,{FeedbackService:()=>eu,FeedbackServiceImpl:()=>eI});let eu=Symbol("FeedbackService");var ed,ep,eg,eh,ef=ec(80699),em=ec(86482),eE=ec(9151),eC=ec(79814),ey=ec(29827),eB=ec(93747),ew=ec(39113),e_=ec(3828),__decorate=function(eA,el,ec,eu){var ed,ep=arguments.length,eg=ep<3?el:null===eu?eu=Object.getOwnPropertyDescriptor(el,ec):eu;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)eg=Reflect.decorate(eA,el,ec,eu);else for(var eh=eA.length-1;eh>=0;eh--)(ed=eA[eh])&&(eg=(ep<3?ed(eg):ep>3?ed(el,ec,eg):ed(el,ec))||eg);return ep>3&&eg&&Object.defineProperty(el,ec,eg),eg},__metadata=function(eA,el){if("object"==typeof Reflect&&"function"==typeof Reflect.metadata)return Reflect.metadata(eA,el)};let eI=class{constructor(){this.stateSubject=new ey.BehaviorSubject({status:"idle"})}async openFeedbackPage(eA){this.stateSubject.next({status:"loading"});try{let el=await this.productManager.waitConfiguration(),ec=el.links?.issueCreation;if(!ec)return void this.stateSubject.next({status:"not-configured"});let eu=await this.buildFeedbackUrl(ec,eA);this.stateSubject.next({status:"opening",feedbackUrl:eu});let ed=await this.externalUriOpener.open(eu);this.stateSubject.next({status:ed?"success":"failed",feedbackUrl:eu})}catch(eA){this.stateSubject.next({status:"failed",feedbackUrl:this.stateSubject.value.feedbackUrl})}}reset(){this.stateSubject.next({status:"idle"})}async buildFeedbackUrl(eA,el){let ec=await this.buildFeedbackBody(el),eu=new URL(eA);return eu.searchParams.set("body",ec),eu.toString()}async buildFeedbackBody(eA){let el=this.authenticationManager.currentSessionSubject.value,ec=el?.account.uid??"Not logged in",eu=e_.SystemInfoUtils.getCliVersion(),ed=e_.SystemInfoUtils.getPlatform(),ep=e_.SystemInfoUtils.getArch(),eg=e_.SystemInfoUtils.getOSVersion(),eh=e_.SystemInfoUtils.getNodeVersion(),ef=e_.SystemInfoUtils.getShell()??"Unknown",em=e_.SystemInfoUtils.getTerminalType()??"Unknown",eE=await ew.ModelUtils.getCurrentModel(eA),eC=eE.name??eE.id??"Unknown",ey=await this.getInstallMethod(),eB=new Date().toISOString();return`

---
User ID: ${ec}
Session ID: ${eA.id}

Version: ${eu}
Model: ${eC}
Install Method: ${ey}

Platform: ${ed} (${ep})
OS Version: ${eg}
Node: ${eh}
Shell: ${ef}
Terminal: ${em}

Time: ${eB}
---
`}async getInstallMethod(){try{let eA=await this.installService.currentInstallation();if("native"===eA.method.type)return"Native";if("package-manager"===eA.method.type)return eA.method.packageManager;return"Unknown"}catch{return"Unknown"}}};__decorate([(0,ef.Autowired)(eE.ProductManager),__metadata("design:type","function"==typeof(ed=void 0!==eE.ProductManager&&eE.ProductManager)?ed:Object)],eI.prototype,"productManager",void 0),__decorate([(0,ef.Autowired)(eC.ExternalUriOpener),__metadata("design:type","function"==typeof(ep=void 0!==eC.ExternalUriOpener&&eC.ExternalUriOpener)?ep:Object)],eI.prototype,"externalUriOpener",void 0),__decorate([(0,ef.Autowired)(em.AuthenticationManager),__metadata("design:type","function"==typeof(eg=void 0!==em.AuthenticationManager&&em.AuthenticationManager)?eg:Object)],eI.prototype,"authenticationManager",void 0),__decorate([(0,ef.Autowired)(eB.InstallService),__metadata("design:type","function"==typeof(eh=void 0!==eB.InstallService&&eB.InstallService)?eh:Object)],eI.prototype,"installService",void 0),eI=__decorate([(0,ef.Component)(eu)],eI)};
