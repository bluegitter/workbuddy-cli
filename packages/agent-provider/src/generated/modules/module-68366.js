// Recovered bundle module 68366; dependencies use the original __webpack_require__ contract.
module.exports = function(eA,el,ec){"use strict";ec.r(el),ec.d(el,{TEAM_MEMBER_COLORS:()=>eh,TeamCleanupService:()=>ep,TeamInboxDispatchService:()=>eg,TeamMailbox:()=>ed,TeamManager:()=>eu,formatTeammateMessage:()=>formatTeammateMessage,getTeamMemberColor:()=>getTeamMemberColor});let eu=Symbol("TeamManager"),ed=Symbol("TeamMailbox"),ep=Symbol("TeamCleanupService"),eg=Symbol("TeamInboxDispatchService");function formatTeammateMessage(eA,el,ec){return`<teammate-message teammate_id="${eA}" summary="${el}">
${ec}
</teammate-message>`}let eh=["blue","green","yellow","magenta","cyan","red"];function getTeamMemberColor(eA){return eh[eA%eh.length]}};
