// Recovered bundle module 10709; dependencies use the original __webpack_require__ contract.
module.exports = function(eA,el,ec){"use strict";ec.a(eA,async function(eA,eu){try{ec.r(el),ec.d(el,{BtwPanel:()=>BtwPanel});var ed=ec(80699),ep=ec(14083),eg=ec(96540),eh=ec(66814),ef=ec(69466),em=ec(82101),eE=ec(53829),eC=ec(3513),ey=eA([eE,eC,ep,em]);[eE,eC,ep,em]=ey.then?(await ey)():ey;let eB=`<system-reminder>This is a side question from the user. You must answer this question directly in a single response.

IMPORTANT CONTEXT:
- You are a separate, lightweight agent spawned to answer this one question
- The main agent is NOT interrupted - it continues working independently in the background
- You share the conversation context but are a completely separate instance
- Do NOT reference being interrupted or what you were "previously doing" - that framing is incorrect

CRITICAL CONSTRAINTS:
- You have NO tools available - you cannot read files, run commands, search, or take any actions
- This is a one-off response - there will be no follow-up turns
- You can ONLY provide information based on what you already know from the conversation context
- NEVER say things like "Let me try...", "I'll now...", "Let me check...", or promise to take any action
- If you don't know the answer, say so - do not offer to look it up or investigate

Simply answer the question with the information you have.</system-reminder>`,BtwPanel=()=>{let eA=(0,eh.useContextSelector)(eE.AppRouterContext,eA=>eA.back),el=(0,eh.useContextSelector)(eE.AppRouterContext,eA=>eA.params),{session:ec}=(0,eC.useSessionContext)(),[eu,ey]=(0,eg.useState)(null),[ew,e_]=(0,eg.useState)(null),eI=el?.q||"";(0,ep.useInput)((0,eg.useCallback)((el,ec)=>{ec.escape||ec.return||" "===el?eA():ec.ctrl&&("c"===el||"d"===el)&&eA()},[eA])),(0,eg.useEffect)(()=>{if(!eI)return void e_("Usage: /btw <your question>");let eA=!1;return(async()=>{try{let el=ed.ContainerUtil.get(ef.AgentService),eu=`${eB}

${eI}`,ep=await el.runForked("general-purpose",eu,ec,{disableTools:!0});if(!eA){let eA=ep?.trim();ey(eA||null),eA||e_("No response received")}}catch(el){eA||e_(el?.message||"Failed to get response")}})(),()=>{eA=!0}},[eI,ec]);let ev=!eu&&!ew;return eg.createElement(em.Box,{flexDirection:"column",paddingLeft:2,marginTop:1},eg.createElement(em.Box,null,eg.createElement(em.Text,{color:"yellow",bold:!0},"/btw "),eg.createElement(em.Text,{dimColor:!0},eI)),eg.createElement(em.Box,{marginTop:1,marginLeft:2,flexDirection:"column"},ew?eg.createElement(em.Text,{color:"red"},ew):eu?eg.createElement(em.Markdown,{content:eu}):eg.createElement(em.Box,null,eg.createElement(em.Spinner,null),eg.createElement(em.Text,{color:"yellow"}," Answering..."))),!ev&&eg.createElement(em.Box,{marginTop:1},eg.createElement(em.Text,{dimColor:!0},"↑/↓ to scroll \xb7 Space, Enter, or Escape to dismiss")))};eu()}catch(eA){eu(eA)}})};
