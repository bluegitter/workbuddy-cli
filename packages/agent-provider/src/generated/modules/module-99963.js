// Recovered bundle module 99963; dependencies use the original __webpack_require__ contract.
module.exports = function(eA,el,ec){"use strict";ec.r(el),ec.d(el,{InsightsReportServiceImpl:()=>eD,StatsServiceImpl:()=>eI,StatsService:()=>eh.StatsService,SessionFacetServiceImpl:()=>eN,SessionFacetService:()=>em,InsightsReportService:()=>ef});var eu,ed,ep,eg,eh=ec(49754);let ef=Symbol("InsightsReportService"),em=Symbol("SessionFacetService");var eE=ec(80699),eC=ec(18553),ey=ec(99006),eB=ec(93039),__decorate=function(eA,el,ec,eu){var ed,ep=arguments.length,eg=ep<3?el:null===eu?eu=Object.getOwnPropertyDescriptor(el,ec):eu;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)eg=Reflect.decorate(eA,el,ec,eu);else for(var eh=eA.length-1;eh>=0;eh--)(ed=eA[eh])&&(eg=(ep<3?ed(eg):ep>3?ed(el,ec,eg):ed(el,ec))||eg);return ep>3&&eg&&Object.defineProperty(el,ec,eg),eg},__metadata=function(eA,el){if("object"==typeof Reflect&&"function"==typeof Reflect.metadata)return Reflect.metadata(eA,el)};let ew=new Set(eC.CUSTOM_INPUT_ITEM_TYPES),e_=new Set(["function_call_result","function_call","hosted_tool_call"]),eI=class{async calculateStats(){let eA=await this.sessionStore.getAllAcrossProjects();if(0===eA.length)return this.getEmptyStatsResult();let el=new Map,ec=new Map,eu=new Map,ed={},ep=new Map,eg=[],eh=0,ef=1/0,em=0;for(let eE of eA){let eA=(eE.history||[]).filter(eA=>this.isValidMessage(eA));if(0===eA.length||this.isLegacySession(eA))continue;let eC=eB.SessionUtils.isSubAgent(eE),ey=eA[0],ew=eA[eA.length-1],e_=this.getTimestampMs(ey),eI=this.getTimestampMs(ew);if(!eC){let ec=eI-e_;eg.push({sessionId:eE.id,duration:ec,messageCount:eA.length,timestamp:new Date(e_).toISOString()}),e_<ef&&(ef=e_),eI>em&&(em=eI),eh+=eA.length;let eu=this.getDateFromTimestamp(e_);el.has(eu)||el.set(eu,{date:eu,messageCount:0,sessionCount:0,toolCallCount:0});let ed=el.get(eu);ed.sessionCount++}for(let eg of eA){let eA=this.getTimestampMs(eg),eh=this.getDateFromTimestamp(eA);if(!eC){let ec=new Date(eA).getHours();el.has(eh)||el.set(eh,{date:eh,messageCount:0,sessionCount:0,toolCallCount:0});let ed=el.get(eh);if(ed.messageCount++,ep.set(ec,(ep.get(ec)||0)+1),this.isToolCall(eg)){let eA=eg.name;eA&&(eu.set(eA,(eu.get(eA)||0)+1),ed.toolCallCount++)}}let ef=eg.providerData,em=ef?.rawUsage||ef?.usage;if(em){let eA=ef?.requestModelId||ef?.model;if(!eA||"unknown"===eA)continue;ed[eA]||(ed[eA]=this.getDefaultModelUsage());let el=ed[eA],eu=ef?.requestModelName;eu&&!el.displayName&&(el.displayName=eu);let ep=em.prompt_tokens||em.input_tokens||em.inputTokens||0,eg=em.completion_tokens||em.output_tokens||em.outputTokens||0,eE=eB.UsageUtils.getCacheReadTokens(em),eC=eB.UsageUtils.getCacheCreationTokens(em);el.inputTokens+=ep,el.outputTokens+=eg,el.cacheReadInputTokens+=eE,el.cacheCreationInputTokens+=eC;let ey=ep+eg;if(ey>0){ec.has(eh)||ec.set(eh,{});let el=ec.get(eh);el[eA]=(el[eA]||0)+ey}}}}let eE=Array.from(el.values()).sort((eA,el)=>eA.date.localeCompare(el.date)),eC=Array.from(ec.entries()).map(([eA,el])=>({date:eA,tokensByModel:el})).sort((eA,el)=>eA.date.localeCompare(el.date)),ey=Array.from(eu.entries()).map(([eA,el])=>({toolName:eA,count:el})).sort((eA,el)=>el.count-eA.count),ew=new Set(eE.map(eA=>eA.date)),e_=this.calculateStreaks(ew),eI=eg.length>0?eg.reduce((eA,el)=>el.duration>eA.duration?el:eA):null,ev=eg.length>0?eg.reduce((eA,el)=>eA+el.duration,0)/eg.length:0,eQ=eE.length>0?eE.reduce((eA,el)=>el.messageCount>eA.messageCount?el:eA).date:null,eS=ep.size>0?Array.from(ep.entries()).reduce((eA,el)=>el[1]>eA[1]?el:eA)[0]:null,eD=ef<1/0&&em>0?Math.ceil((em-ef)/864e5)+1:0;return{totalSessions:eA.filter(eA=>!eB.SessionUtils.isSubAgent(eA)).length,totalMessages:eh,totalDays:eD,activeDays:ew.size,streaks:e_,dailyActivity:eE,dailyModelTokens:eC,toolUsage:ey,longestSession:eI,averageSessionDuration:ev,modelUsage:ed,firstSessionDate:ef<1/0?new Date(ef).toISOString():null,lastSessionDate:em>0?new Date(em).toISOString():null,peakActivityDay:eQ,peakActivityHour:eS}}getEmptyStatsResult(){return{totalSessions:0,totalMessages:0,totalDays:0,activeDays:0,streaks:{currentStreak:0,longestStreak:0,currentStreakStart:null,longestStreakStart:null,longestStreakEnd:null},dailyActivity:[],dailyModelTokens:[],toolUsage:[],longestSession:null,averageSessionDuration:0,modelUsage:{},firstSessionDate:null,lastSessionDate:null,peakActivityDay:null,peakActivityHour:null}}getDefaultModelUsage(){return{inputTokens:0,outputTokens:0,cacheReadInputTokens:0,cacheCreationInputTokens:0,webSearchRequests:0,costUSD:0,contextWindow:0}}isValidMessage(eA){return!(eA.type&&ew.has(eA.type))&&!!eA.timestamp}isLegacySession(eA){let el=eA.filter(eA=>this.isAssistantMessage(eA));return 0!==el.length&&el.every(eA=>{let el=eA.providerData,ec=el?.requestModelId||el?.model;return!ec||"unknown"===ec})}isAssistantMessage(eA){return("message"===eA.type||void 0===eA.type)&&"assistant"===eA.role}isToolCall(eA){return void 0!==eA.type&&e_.has(eA.type)}getTimestampMs(eA){let el=eA?.timestamp;return"number"==typeof el?el:"string"==typeof el?new Date(el).getTime():Date.now()}getDateFromTimestamp(eA){let el=new Date(eA),ec=el.getFullYear(),eu=String(el.getMonth()+1).padStart(2,"0"),ed=String(el.getDate()).padStart(2,"0");return`${ec}-${eu}-${ed}`}calculateStreaks(eA){if(0===eA.size)return{currentStreak:0,longestStreak:0,currentStreakStart:null,longestStreakStart:null,longestStreakEnd:null};let el=new Date;el.setHours(0,0,0,0);let ec=0,eu=null,ed=new Date(el);for(;;){let el=ed.getFullYear(),ep=String(ed.getMonth()+1).padStart(2,"0"),eg=String(ed.getDate()).padStart(2,"0"),eh=`${el}-${ep}-${eg}`;if(!eA.has(eh))break;ec++,eu=eh,ed.setDate(ed.getDate()-1)}let ep=0,eg=null,eh=null;if(eA.size>0){let el=Array.from(eA).sort(),ec=1,eu=el[0];for(let eA=1;eA<el.length;eA++){let ed=new Date(el[eA-1]);1===Math.round((new Date(el[eA]).getTime()-ed.getTime())/864e5)?ec++:(ec>ep&&(ep=ec,eg=eu,eh=el[eA-1]),ec=1,eu=el[eA])}ec>ep&&(ep=ec,eg=eu,eh=el[el.length-1])}return{currentStreak:ec,longestStreak:ep,currentStreakStart:eu,longestStreakStart:eg,longestStreakEnd:eh}}};__decorate([(0,eE.Autowired)(eE.Logger),__metadata("design:type","function"==typeof(eu=void 0!==eE.Logger&&eE.Logger)?eu:Object)],eI.prototype,"logger",void 0),__decorate([(0,eE.Autowired)(ey.SessionStore),__metadata("design:type","function"==typeof(ed=void 0!==ey.SessionStore&&ey.SessionStore)?ed:Object)],eI.prototype,"sessionStore",void 0),eI=__decorate([(0,eE.Component)(eh.StatsService)],eI);var ev=ec(91943),eQ=ec(16928),insights_report_service_decorate=function(eA,el,ec,eu){var ed,ep=arguments.length,eg=ep<3?el:null===eu?eu=Object.getOwnPropertyDescriptor(el,ec):eu;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)eg=Reflect.decorate(eA,el,ec,eu);else for(var eh=eA.length-1;eh>=0;eh--)(ed=eA[eh])&&(eg=(ep<3?ed(eg):ep>3?ed(el,ec,eg):ed(el,ec))||eg);return ep>3&&eg&&Object.defineProperty(el,ec,eg),eg};let eS={title:{zh:"CodeBuddy Code 使用洞察",en:"CodeBuddy Code Insights"},at_a_glance:{zh:"概览",en:"At a Glance"},whats_working:{zh:"做得好的",en:"What's working:"},whats_hindering:{zh:"需要改进的",en:"What's hindering you:"},quick_wins:{zh:"快速提升建议",en:"Quick wins to try:"},ambitious_workflows:{zh:"进阶工作流",en:"Ambitious workflows:"},impressive_things:{zh:"亮点成就",en:"Impressive Things You Did"},friction:{zh:"问题与障碍",en:"Where Things Go Wrong"},features_to_try:{zh:"推荐功能",en:"Features to Try"},on_the_horizon:{zh:"未来展望",en:"On the Horizon"},nav_work:{zh:"工作内容",en:"What You Work On"},nav_usage:{zh:"使用方式",en:"How You Use CBC"},nav_wins:{zh:"亮点成就",en:"Impressive Things"},nav_friction:{zh:"问题障碍",en:"Where Things Go Wrong"},nav_features:{zh:"推荐功能",en:"Features to Try"},nav_patterns:{zh:"新用法",en:"New Usage Patterns"},nav_horizon:{zh:"未来展望",en:"On the Horizon"},messages:{zh:"消息数",en:"Messages"},sessions:{zh:"会话数",en:"Sessions"},active_hours:{zh:"活跃小时",en:"Active Hours"},current_streak:{zh:"当前连续",en:"Current Streak"},longest_streak:{zh:"最长连续",en:"Longest Streak"},peak_hour:{zh:"高峰时段",en:"Peak Hour"},section_work:{zh:"你的工作内容",en:"What You Work On"},top_tools:{zh:"常用工具",en:"Top Tools Used"},top_models:{zh:"常用模型",en:"Most Used Models"},section_usage:{zh:"你如何使用 CodeBuddy Code",en:"How You Use CodeBuddy Code"},key_pattern:{zh:"关键模式：",en:"Key pattern:"},section_wins:{zh:"亮点成就",en:"Impressive Things You Did"},section_friction:{zh:"问题与障碍",en:"Where Things Go Wrong"},section_features:{zh:"推荐尝试的功能",en:"Existing CBC Features to Try"},codebuddy_md_additions:{zh:"建议添加到 CODEBUDDY.md",en:"Suggested CODEBUDDY.md Additions"},copy_hint:{zh:"复制到 CodeBuddy Code 即可添加到 CODEBUDDY.md",en:"Just copy this into CodeBuddy Code to add it to your CODEBUDDY.md."},copy_all:{zh:"复制全部选中项",en:"Copy All Checked"},copy:{zh:"复制",en:"Copy"},copied:{zh:"已复制！",en:"Copied!"},paste_hint:{zh:"复制到 CodeBuddy Code 即可开始",en:"Just copy this into CodeBuddy Code and it'll set it up for you."},section_patterns:{zh:"新的使用方式",en:"New Ways to Use CodeBuddy Code"},pattern_hint:{zh:"复制到 CodeBuddy Code，它会指导你完成",en:"Just copy this into CodeBuddy Code and it'll walk you through it."},paste_into_cbc:{zh:"粘贴到 CodeBuddy Code：",en:"Paste into CodeBuddy Code:"},section_horizon:{zh:"未来展望",en:"On the Horizon"},getting_started:{zh:"如何开始：",en:"Getting started:"},why_for_you:{zh:"为什么适合你：",en:"Why for you:"},no_data:{zh:"暂无数据",en:"No data."},no_project_areas:{zh:"暂未识别到项目区域",en:"No project areas identified."},no_model_data:{zh:"暂无模型数据",en:"No model data."},no_workflows:{zh:"暂未识别到显著工作流",en:"No notable workflows identified yet."},no_friction:{zh:"暂未识别到问题点",en:"No friction points identified."},no_feature_suggestions:{zh:"暂无功能推荐",en:"No feature suggestions."},no_pattern_suggestions:{zh:"暂无用法推荐",en:"No usage pattern suggestions."},no_opportunities:{zh:"暂未识别到机会",en:"No opportunities identified yet."},footer:{zh:"由 CodeBuddy Code 生成",en:"Generated by CodeBuddy Code"}};function isChinese(eA){if(!eA)return!1;let el=eA.toLowerCase();return el.includes("中文")||el.includes("chinese")||el.includes("zh")||"cn"===el}function insights_report_service_t(eA,el){let ec=eS[eA];return ec?isChinese(el)?ec.zh:ec.en:eA}let eD=class{async generateReport(eA,el){let ec=eQ.join(eB.PathUtils.getHomeDir(),"usage-data");await ev.mkdir(ec,{recursive:!0});let eu=eQ.join(ec,"facets");await ev.mkdir(eu,{recursive:!0});let ed=new Date().toISOString().replace(/[:.]/g,"-").slice(0,19),ep=eQ.join(eu,`insights-${ed}.json`);await ev.writeFile(ep,JSON.stringify(eA,null,2),"utf-8");let eg=eQ.join(ec,"report.html"),eh=this.buildHtml(eA,el);return await ev.writeFile(eg,eh,"utf-8"),eg}buildHtml(eA,el){let ec=eA,eu=ec.activity_summary||{},ed=ec.usage_patterns||{},ep=ec.streaks||{},eg=ec.interaction_style||{},eh=ec.what_works||{},ef=ec.friction_analysis||{},em=ec.suggestions||{},eE=ec.on_the_horizon||{},eC=ec.fun_ending||{},ey=ec.at_a_glance||{},eB=ec.project_areas||{},ew=eu.date_range||{};return`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${insights_report_service_t("title",el)}</title>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace; background: #fff; color: #1a1a1a; line-height: 1.65; font-size: 14px; }
    .container { max-width: 860px; margin: 0 auto; padding: 0 32px 48px; }

    /* Header */
    .report-header { border-bottom: 1px solid #e0e0e0; padding: 40px 32px 32px; margin-bottom: 32px; }
    .report-header .container { padding-bottom: 0; }
    .report-header h1 { font-size: 20px; font-weight: 700; color: #1a1a1a; margin-bottom: 6px; letter-spacing: -0.3px; }
    .report-header .subtitle { color: #888; font-size: 13px; margin-bottom: 0; }

    /* Typography */
    h2 { font-size: 18px; font-weight: 700; color: #1a1a1a; margin-top: 40px; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid #e0e0e0; letter-spacing: 0.5px; }
    h3 { font-size: 13px; font-weight: 600; color: #555; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 1px; }
    .section-intro { font-size: 14px; color: #888; margin-bottom: 16px; line-height: 1.6; }

    /* Nav TOC */
    .nav-toc { display: flex; flex-wrap: wrap; gap: 0; margin: 0 0 32px 0; padding: 0; background: transparent; border: 1px solid #e0e0e0; overflow: hidden; }
    .nav-toc a { font-size: 11px; color: #1a1a1a; text-decoration: none; padding: 8px 14px; border-right: 1px solid #e0e0e0; transition: background 0.1s; letter-spacing: 0.5px; text-transform: uppercase; }
    .nav-toc a:last-child { border-right: none; }
    .nav-toc a:hover { background: #f5f5f5; }

    /* Stats Row */
    .stats-row { display: flex; gap: 0; margin-bottom: 32px; flex-wrap: wrap; border: 1px solid #e0e0e0; }
    .stat { flex: 1; min-width: 100px; text-align: center; padding: 20px 8px; border-right: 1px solid #e0e0e0; }
    .stat:last-child { border-right: none; }
    .stat-value { font-size: 24px; font-weight: 700; color: #1a1a1a; }
    .stat-label { font-size: 10px; color: #999; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 4px; }

    /* At a Glance */
    .at-a-glance { border: 1px solid #e0e0e0; padding: 20px 24px; margin-bottom: 28px; }
    .glance-title { font-size: 16px; font-weight: 700; color: #1a1a1a; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
    .glance-title::before { content: '/'; color: #6C4DFF; font-weight: 700; }
    .glance-sections { display: flex; flex-direction: column; gap: 0; }
    .glance-section { font-size: 14px; color: #444; line-height: 1.7; padding: 12px 0; border-bottom: 1px solid #f0f0f0; }
    .glance-section:last-child { border-bottom: none; }
    .glance-section strong { color: #1a1a1a; font-weight: 600; }
    .see-more { color: #6C4DFF; text-decoration: none; font-size: 12px; white-space: nowrap; }
    .see-more:hover { text-decoration: underline; }

    /* Cards (shared) */
    .card { border: 1px solid #e0e0e0; padding: 16px; }

    /* Project Areas */
    .project-areas { display: flex; flex-direction: column; gap: 0; margin-bottom: 24px; border: 1px solid #e0e0e0; }
    .project-area { padding: 14px 16px; border-bottom: 1px solid #f0f0f0; transition: background 0.1s; }
    .project-area:last-child { border-bottom: none; }
    .project-area:hover { background: #fafafa; }
    .area-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
    .area-name { font-weight: 600; font-size: 13px; color: #1a1a1a; }
    .area-count { font-size: 11px; color: #6C4DFF; padding: 2px 8px; border: 1px solid #6C4DFF; }
    .area-desc { font-size: 13px; color: #888; line-height: 1.5; }

    /* Narrative / Usage Style */
    .narrative { border: 1px solid #e0e0e0; padding: 20px; margin-bottom: 24px; }
    .narrative p { margin-bottom: 10px; font-size: 14px; color: #444; line-height: 1.7; }
    .key-insight { border-left: 2px solid #28B894; padding: 10px 14px; margin-top: 12px; font-size: 13px; color: #333; background: #fafffe; }

    /* Big Wins */
    .big-wins { display: flex; flex-direction: column; gap: 0; margin-bottom: 24px; border: 1px solid #e0e0e0; }
    .big-win { padding: 14px 16px; border-bottom: 1px solid #f0f0f0; }
    .big-win:last-child { border-bottom: none; }
    .big-win-title { font-weight: 600; font-size: 13px; color: #1a1a1a; margin-bottom: 4px; }
    .big-win-title::before { content: '+  '; color: #28B894; font-weight: 700; }
    .big-win-desc { font-size: 13px; color: #666; line-height: 1.5; padding-left: 18px; }

    /* Friction */
    .friction-categories { display: flex; flex-direction: column; gap: 0; margin-bottom: 24px; border: 1px solid #e0e0e0; }
    .friction-category { padding: 14px 16px; border-bottom: 1px solid #f0f0f0; }
    .friction-category:last-child { border-bottom: none; }
    .friction-title { font-weight: 600; font-size: 13px; color: #1a1a1a; margin-bottom: 4px; }
    .friction-title::before { content: 'x  '; color: #e25; font-weight: 700; }
    .friction-desc { font-size: 13px; color: #666; margin-bottom: 8px; padding-left: 18px; }
    .friction-examples { margin: 0 0 0 18px; font-size: 12px; color: #888; padding-left: 18px; }
    .friction-examples li { margin-bottom: 3px; }

    /* CODEBUDDY.md Section */
    .codebuddy-md-section { border: 1px solid #e0e0e0; padding: 16px 20px; margin-bottom: 20px; }
    .codebuddy-md-item { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 10px; padding: 12px 0; border-bottom: 1px solid #f0f0f0; }
    .codebuddy-md-item:last-child { border-bottom: none; }
    .cmd-checkbox { flex-shrink: 0; margin-top: 3px; cursor: pointer; accent-color: #6C4DFF; width: 14px; height: 14px; }
    .cmd-code { background: #f8f8f8; padding: 10px 14px; font-size: 14px; color: #333; border: 1px solid #e0e0e0; font-family: 'JetBrains Mono', monospace; display: block; white-space: pre-wrap; word-break: break-word; flex: 1; min-width: 0; line-height: 1.6; }
    .cmd-why-inline { display: block; font-size: 12px; color: #999; margin-top: 8px; }

    /* Feature & Pattern Cards */
    .features-section, .patterns-section { display: flex; flex-direction: column; gap: 0; margin: 14px 0; border: 1px solid #e0e0e0; }
    .feature-card { padding: 14px 16px; border-bottom: 1px solid #f0f0f0; }
    .feature-card:last-child { border-bottom: none; }
    .pattern-card { padding: 14px 16px; border-bottom: 1px solid #f0f0f0; }
    .pattern-card:last-child { border-bottom: none; }
    .feature-title { font-weight: 600; font-size: 13px; color: #1a1a1a; margin-bottom: 4px; }
    .feature-title::before { content: '->  '; color: #28B894; }
    .pattern-title { font-weight: 600; font-size: 13px; color: #1a1a1a; margin-bottom: 4px; }
    .pattern-title::before { content: '::  '; color: #6C4DFF; }
    .feature-oneliner { font-size: 13px; color: #666; margin-bottom: 6px; }
    .pattern-summary { font-size: 13px; color: #666; margin-bottom: 6px; }
    .feature-why, .pattern-detail { font-size: 12px; color: #999; line-height: 1.5; }
    .copyable-prompt-section { margin-top: 10px; padding-top: 10px; border-top: 1px solid #f0f0f0; }
    .copyable-prompt-row { display: flex; align-items: flex-start; gap: 8px; }
    .copyable-prompt { flex: 1; background: #f8f8f8; padding: 10px 14px; font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #333; border: 1px solid #e0e0e0; white-space: pre-wrap; line-height: 1.5; }

    /* Charts */
    .charts-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin: 20px 0; border: 1px solid #e0e0e0; }
    .chart-card { padding: 16px; border-right: 1px solid #e0e0e0; }
    .chart-card:last-child { border-right: none; }
    .chart-title { font-size: 10px; font-weight: 700; color: #1a1a1a; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 14px; }
    .bar-row { display: flex; align-items: center; margin-bottom: 8px; }
    .bar-label { width: 100px; font-size: 12px; color: #888; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bar-track { flex: 1; height: 4px; background: #f0f0f0; margin: 0 10px; }
    .bar-fill { height: 100%; }
    .bar-value { width: 36px; font-size: 12px; color: #888; text-align: right; }

    /* Horizon */
    .horizon-section { display: flex; flex-direction: column; gap: 0; border: 1px solid #e0e0e0; }
    .horizon-card { padding: 14px 16px; border-bottom: 1px solid #f0f0f0; }
    .horizon-card:last-child { border-bottom: none; }
    .horizon-title { font-weight: 600; font-size: 13px; color: #6C4DFF; margin-bottom: 6px; }
    .horizon-possible { font-size: 13px; color: #666; margin-bottom: 8px; line-height: 1.5; }
    .horizon-tip { font-size: 12px; color: #555; background: #f8f8f8; padding: 8px 12px; border: 1px solid #e0e0e0; }
    .pattern-prompt { background: #f8f8f8; padding: 12px; margin-top: 10px; border: 1px solid #e0e0e0; }
    .pattern-prompt code { font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #333; display: block; white-space: pre-wrap; margin-bottom: 8px; }
    .prompt-label { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #999; margin-bottom: 6px; letter-spacing: 1.5px; }

    /* Buttons */
    .copy-btn { background: #fff; border: 1px solid #ddd; padding: 4px 12px; font-size: 12px; cursor: pointer; color: #666; font-family: 'JetBrains Mono', monospace; flex-shrink: 0; transition: all 0.1s; }
    .copy-btn:hover { border-color: #1a1a1a; color: #1a1a1a; }
    .copy-btn.copied { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }

    /* Fun Ending */
    .fun-ending { border: 1px solid #e0e0e0; border-top: 2px solid #1a1a1a; padding: 32px; margin-top: 40px; text-align: center; }
    .fun-headline { font-size: 14px; font-weight: 700; color: #1a1a1a; margin-bottom: 8px; }
    .fun-detail { font-size: 13px; color: #888; }

    /* Footer */
    .footer { text-align: center; color: #ccc; font-size: 11px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0e0e0; letter-spacing: 1px; text-transform: uppercase; }

    @media (max-width: 640px) { .charts-row { grid-template-columns: 1fr; } .chart-card { border-right: none; border-bottom: 1px solid #e0e0e0; } .chart-card:last-child { border-bottom: none; } .stats-row { flex-direction: column; } .stat { min-width: 0; border-right: none; border-bottom: 1px solid #e0e0e0; } .stat:last-child { border-bottom: none; } }
  </style>
</head>
<body>
  <div class="report-header">
    <div class="container" style="padding-bottom:0">
      <h1>${insights_report_service_t("title",el)}</h1>
      <p class="subtitle">${eu.total_messages||0} ${insights_report_service_t("messages",el).toLowerCase()} &middot; ${eu.total_sessions||0} ${insights_report_service_t("sessions",el).toLowerCase()} &middot; ${ew.start||""} - ${ew.end||""}</p>
    </div>
  </div>
  <div class="container">

    <!-- At a Glance -->
    <div class="at-a-glance">
      <div class="glance-title">${insights_report_service_t("at_a_glance",el)}</div>
      <div class="glance-sections">
        <div class="glance-section"><strong>${insights_report_service_t("whats_working",el)}</strong> ${this.md(ey.whats_working)} <a href="#section-wins" class="see-more">${insights_report_service_t("impressive_things",el)} &rarr;</a></div>
        <div class="glance-section"><strong>${insights_report_service_t("whats_hindering",el)}</strong> ${this.md(ey.whats_hindering)} <a href="#section-friction" class="see-more">${insights_report_service_t("friction",el)} &rarr;</a></div>
        <div class="glance-section"><strong>${insights_report_service_t("quick_wins",el)}</strong> ${this.md(ey.quick_wins)} <a href="#section-features" class="see-more">${insights_report_service_t("features_to_try",el)} &rarr;</a></div>
        <div class="glance-section"><strong>${insights_report_service_t("ambitious_workflows",el)}</strong> ${this.md(ey.ambitious_workflows)} <a href="#section-horizon" class="see-more">${insights_report_service_t("on_the_horizon",el)} &rarr;</a></div>
      </div>
    </div>

    <!-- TOC -->
    <nav class="nav-toc">
      <a href="#section-work">${insights_report_service_t("nav_work",el)}</a>
      <a href="#section-usage">${insights_report_service_t("nav_usage",el)}</a>
      <a href="#section-wins">${insights_report_service_t("nav_wins",el)}</a>
      <a href="#section-friction">${insights_report_service_t("nav_friction",el)}</a>
      <a href="#section-features">${insights_report_service_t("nav_features",el)}</a>
      <a href="#section-patterns">${insights_report_service_t("nav_patterns",el)}</a>
      <a href="#section-horizon">${insights_report_service_t("nav_horizon",el)}</a>
    </nav>

    <!-- Stats Row -->
    <div class="stats-row">
      <div class="stat"><div class="stat-value">${eu.total_messages||0}</div><div class="stat-label">${insights_report_service_t("messages",el)}</div></div>
      <div class="stat"><div class="stat-value">${eu.total_sessions||0}</div><div class="stat-label">${insights_report_service_t("sessions",el)}</div></div>
      <div class="stat"><div class="stat-value">${eu.active_days||0}</div><div class="stat-label">${insights_report_service_t("active_hours",el)}</div></div>
      <div class="stat"><div class="stat-value">${ep.current||0}d</div><div class="stat-label">${insights_report_service_t("current_streak",el)}</div></div>
      <div class="stat"><div class="stat-value">${ep.longest||0}d</div><div class="stat-label">${insights_report_service_t("longest_streak",el)}</div></div>
      <div class="stat"><div class="stat-value">${null!=eu.peak_hour?eu.peak_hour+":00":"?"}</div><div class="stat-label">${insights_report_service_t("peak_hour",el)}</div></div>
    </div>

    <!-- What You Work On -->
    <h2 id="section-work">${insights_report_service_t("section_work",el)}</h2>
    <div class="project-areas">
${this.buildProjectAreas(eB.areas,el)}
    </div>

    <!-- Charts: Tools & Models -->
    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-title">${insights_report_service_t("top_tools",el)}</div>
${this.buildBarChart(ed.favorite_tools,"#6C4DFF",el)}
      </div>
      <div class="chart-card">
        <div class="chart-title">${insights_report_service_t("top_models",el)}</div>
${this.buildModelChart(ed.most_used_models,el)}
      </div>
    </div>

    <!-- How You Use CBC -->
    <h2 id="section-usage">${insights_report_service_t("section_usage",el)}</h2>
    <div class="narrative">
      <p>${this.md(eg.narrative)}</p>
${eg.key_pattern?`      <div class="key-insight"><strong>${insights_report_service_t("key_pattern",el)}</strong> ${this.md(eg.key_pattern)}</div>`:""}
    </div>

    <!-- Impressive Things -->
    <h2 id="section-wins">${insights_report_service_t("section_wins",el)}</h2>
${eh.intro?`    <p class="section-intro">${this.md(eh.intro)}</p>`:""}
    <div class="big-wins">
${this.buildBigWins(eh.impressive_workflows,el)}
    </div>

    <!-- Friction -->
    <h2 id="section-friction">${insights_report_service_t("section_friction",el)}</h2>
${ef.intro?`    <p class="section-intro">${this.md(ef.intro)}</p>`:""}
    <div class="friction-categories">
${this.buildFrictionCategories(ef.categories,el)}
    </div>

    <!-- Suggestions: CODEBUDDY.md -->
    <h2 id="section-features">${insights_report_service_t("section_features",el)}</h2>
${this.buildCodebuddyMdSection(em.claude_md_additions,el)}

    <!-- Features to Try -->
    <p class="section-intro">${insights_report_service_t("paste_hint",el)}</p>
    <div class="features-section">
${this.buildFeatureCards(em.features_to_try,el)}
    </div>

    <!-- Usage Patterns -->
    <h2 id="section-patterns">${insights_report_service_t("section_patterns",el)}</h2>
    <p class="section-intro">${insights_report_service_t("pattern_hint",el)}</p>
    <div class="patterns-section">
${this.buildPatternCards(em.usage_patterns,el)}
    </div>

    <!-- On the Horizon -->
    <h2 id="section-horizon">${insights_report_service_t("section_horizon",el)}</h2>
${eE.intro?`    <p class="section-intro">${this.md(eE.intro)}</p>`:""}
    <div class="horizon-section">
${this.buildHorizonCards(eE.opportunities,el)}
    </div>

    <!-- Fun Ending -->
    <div class="fun-ending">
      <div class="fun-headline">${this.md(eC.headline)}</div>
      <div class="fun-detail">${this.md(eC.detail)}</div>
    </div>

    <div class="footer">${insights_report_service_t("footer",el)} &middot; ${new Date().toLocaleDateString()}</div>
  </div>
  <script>
    var COPY_TEXT = '${insights_report_service_t("copy",el)}';
    var COPIED_TEXT = '${insights_report_service_t("copied",el)}';
    function copyText(btn) {
      const code = btn.previousElementSibling;
      navigator.clipboard.writeText(code.textContent).then(function() {
        btn.textContent = COPIED_TEXT;
        btn.classList.add('copied');
        setTimeout(function() { btn.textContent = COPY_TEXT; btn.classList.remove('copied'); }, 2000);
      });
    }
    function copyAllCheckedCodebuddyMd() {
      var checkboxes = document.querySelectorAll('.cmd-checkbox:checked');
      var texts = [];
      checkboxes.forEach(function(cb) { if (cb.dataset.text) texts.push(cb.dataset.text); });
      var combined = texts.join('\\n');
      var btn = document.querySelector('.copy-all-btn');
      if (btn) {
        navigator.clipboard.writeText(combined).then(function() {
          btn.textContent = COPIED_TEXT + ' ' + texts.length + '!';
          btn.classList.add('copied');
          setTimeout(function() { btn.textContent = '${insights_report_service_t("copy_all",el)}'; btn.classList.remove('copied'); }, 2000);
        });
      }
    }
  </script>
</body>
</html>`}esc(eA){return eA?String(eA).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"):""}md(eA){return eA?this.esc(eA).replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/\n\n+/g,"</p><p>").replace(/\n/g,"<br>"):""}buildProjectAreas(eA,el){return Array.isArray(eA)&&0!==eA.length?eA.map(eA=>`      <div class="project-area">
        <div class="area-header">
          <span class="area-name">${this.esc(eA.name)}</span>
          ${eA.session_count?`<span class="area-count">~${eA.session_count} ${insights_report_service_t("sessions",el).toLowerCase()}</span>`:""}
        </div>
        <div class="area-desc">${this.md(eA.description)}</div>
      </div>`).join("\n"):`      <p style="color:#94a3b8">${insights_report_service_t("no_project_areas",el)}</p>`}buildBarChart(eA,el,ec){if(!Array.isArray(eA)||0===eA.length)return`        <p style="color:#94a3b8">${insights_report_service_t("no_data",ec)}</p>`;let eu=Math.max(...eA.map(eA=>(Array.isArray(eA)?eA[1]:eA.count)||0));return eA.slice(0,6).map(eA=>{let ec=Array.isArray(eA)?eA[0]:eA.name,ed=Array.isArray(eA)?eA[1]:eA.count,ep=eu>0?ed/eu*100:0;return`        <div class="bar-row"><div class="bar-label">${this.esc(ec)}</div><div class="bar-track"><div class="bar-fill" style="width:${ep}%;background:${el}"></div></div><div class="bar-value">${ed}</div></div>`}).join("\n")}buildModelChart(eA,el){if(!Array.isArray(eA)||0===eA.length)return`        <p style="color:#94a3b8">${insights_report_service_t("no_model_data",el)}</p>`;let ec=Math.max(...eA.map(eA=>(eA.input_tokens||0)+(eA.output_tokens||0)));return eA.slice(0,6).map(eA=>{let el=(eA.input_tokens||0)+(eA.output_tokens||0),eu=ec>0?el/ec*100:0,ed=el>=1e6?`${(el/1e6).toFixed(1)}M`:el>=1e3?`${(el/1e3).toFixed(0)}K`:`${el}`;return`        <div class="bar-row"><div class="bar-label">${this.esc(eA.name)}</div><div class="bar-track"><div class="bar-fill" style="width:${eu}%;background:#28B894"></div></div><div class="bar-value">${ed}</div></div>`}).join("\n")}buildBigWins(eA,el){return Array.isArray(eA)&&0!==eA.length?eA.map(eA=>`      <div class="big-win">
        <div class="big-win-title">${this.esc(eA.title)}</div>
        <div class="big-win-desc">${this.md(eA.description)}</div>
      </div>`).join("\n"):`      <p style="color:#94a3b8">${insights_report_service_t("no_workflows",el)}</p>`}buildFrictionCategories(eA,el){return Array.isArray(eA)&&0!==eA.length?eA.map(eA=>{let el=Array.isArray(eA.examples)?eA.examples.map(eA=>`<li>${this.esc("string"==typeof eA?eA:eA.description||eA.title||"")}</li>`).join(""):"";return`      <div class="friction-category">
        <div class="friction-title">${this.esc(eA.category)}</div>
        <div class="friction-desc">${this.md(eA.description)}</div>
        ${el?`<ul class="friction-examples">${el}</ul>`:""}
      </div>`}).join("\n"):`      <p style="color:#94a3b8">${insights_report_service_t("no_friction",el)}</p>`}buildCodebuddyMdSection(eA,el){if(!Array.isArray(eA)||0===eA.length)return"";let ec=insights_report_service_t("copy",el),eu=eA.map(eA=>{let el=eA.title||eA.rule||"",eu=eA.description||eA.why||"",ed=el||eu,ep=el?eu:"";return`        <div class="codebuddy-md-item">
          <input type="checkbox" class="cmd-checkbox" checked data-text="${this.esc(ed)}">
          <code class="cmd-code">${this.esc(ed)}${ep?`<span class="cmd-why-inline">${this.esc(ep)}</span>`:""}</code>
          <button class="copy-btn" onclick="copyText(this)">${ec}</button>
        </div>`}).join("\n");return`    <div class="codebuddy-md-section">
      <h3>${insights_report_service_t("codebuddy_md_additions",el)}</h3>
      <p style="font-size: 12px; color: #999; margin-bottom: 12px;">${insights_report_service_t("copy_hint",el)}</p>
      <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #e0e0e0;">
        <button class="copy-btn copy-all-btn" style="background:#1a1a1a;color:#fff;padding:6px 14px;border:1px solid #1a1a1a;font-family:'JetBrains Mono',monospace;font-size:12px" onclick="copyAllCheckedCodebuddyMd()">${insights_report_service_t("copy_all",el)}</button>
      </div>
${eu}
    </div>`}buildFeatureCards(eA,el){if(!Array.isArray(eA)||0===eA.length)return`      <p style="color:#94a3b8">${insights_report_service_t("no_feature_suggestions",el)}</p>`;let ec=insights_report_service_t("copy",el),eu=insights_report_service_t("why_for_you",el);return eA.map(eA=>{let el=Array.isArray(eA.examples)?eA.examples.map(eA=>`          <div style="margin-top:8px"><div style="display:flex;align-items:flex-start;gap:8px"><code style="flex:1;background:#f8f8f8;padding:8px 14px;border:1px solid #e0e0e0;font-family:'JetBrains Mono',monospace;font-size:13px;color:#333;white-space:pre-wrap">${this.esc(eA.code||eA.description||eA)}</code><button class="copy-btn" onclick="copyText(this)">${ec}</button></div></div>`).join("\n"):"",ed=eA.getting_started?`          <div style="margin-top:12px;display:flex;align-items:flex-start;gap:8px"><code style="flex:1;background:#f8f8f8;padding:8px 14px;border:1px solid #e0e0e0;font-family:'JetBrains Mono',monospace;font-size:13px;color:#333;white-space:pre-wrap">${this.esc(eA.getting_started)}</code><button class="copy-btn" onclick="copyText(this)">${ec}</button></div>`:"";return`      <div class="feature-card">
        <div class="feature-title">${this.esc(eA.feature)}</div>
        <div class="feature-oneliner">${this.esc(eA.one_liner)}</div>
        ${eA.why?`<div class="feature-why"><strong>${eu}</strong> ${this.md(eA.why)}</div>`:""}
${ed}
${el}
      </div>`}).join("\n")}buildPatternCards(eA,el){if(!Array.isArray(eA)||0===eA.length)return`      <p style="color:#94a3b8">${insights_report_service_t("no_pattern_suggestions",el)}</p>`;let ec=insights_report_service_t("copy",el),eu=insights_report_service_t("paste_into_cbc",el);return eA.map(eA=>{let el=eA.copyable_prompt||eA.prompt||"";return`      <div class="pattern-card">
        <div class="pattern-title">${this.esc(eA.title)}</div>
        <div class="pattern-summary">${this.md(eA.suggestion||eA.summary)}</div>
        ${eA.detail?`<div class="pattern-detail">${this.md(eA.detail)}</div>`:""}
        ${el?`<div class="copyable-prompt-section"><div class="prompt-label">${eu}</div><div class="copyable-prompt-row"><code class="copyable-prompt">${this.esc(el)}</code><button class="copy-btn" onclick="copyText(this)">${ec}</button></div></div>`:""}
      </div>`}).join("\n")}buildHorizonCards(eA,el){if(!Array.isArray(eA)||0===eA.length)return`      <p style="color:#94a3b8">${insights_report_service_t("no_opportunities",el)}</p>`;let ec=insights_report_service_t("copy",el),eu=insights_report_service_t("getting_started",el),ed=insights_report_service_t("paste_into_cbc",el);return eA.map(eA=>`      <div class="horizon-card">
        <div class="horizon-title">${this.esc(eA.title)}</div>
        <div class="horizon-possible">${this.md(eA.whats_possible)}</div>
        ${eA.getting_started?`<div class="horizon-tip"><strong>${eu}</strong> ${this.esc(eA.getting_started)}</div>`:""}
        ${eA.copyable_prompt?`<div class="pattern-prompt"><div class="prompt-label">${ed}</div><code>${this.esc(eA.copyable_prompt)}</code><button class="copy-btn" onclick="copyText(this)">${ec}</button></div>`:""}
      </div>`).join("\n")}};eD=insights_report_service_decorate([(0,eE.Component)(ef)],eD);var eT=ec(79896),eR=ec(23785),ek=ec(92735),eM=ec(30277),ex=ec(69466),session_facet_service_decorate=function(eA,el,ec,eu){var ed,ep=arguments.length,eg=ep<3?el:null===eu?eu=Object.getOwnPropertyDescriptor(el,ec):eu;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)eg=Reflect.decorate(eA,el,ec,eu);else for(var eh=eA.length-1;eh>=0;eh--)(ed=eA[eh])&&(eg=(ep<3?ed(eg):ep>3?ed(el,ec,eg):ed(el,ec))||eg);return ep>3&&eg&&Object.defineProperty(el,ec,eg),eg},session_facet_service_metadata=function(eA,el){if("object"==typeof Reflect&&"function"==typeof Reflect.metadata)return Reflect.metadata(eA,el)};let eO=20,eN=class{getFacetsDir(){return eQ.join(eB.PathUtils.getHomeDir(),"usage-data","facets")}async analyzeAllSessions(eA,el,ec){let eu=this.getFacetsDir();await ev.mkdir(eu,{recursive:!0});let ed=Date.now()-2592e6,ep=await this.loadExistingFacets(eu),eg=eB.PathUtils.getHomeProjectsDir(),eh=[],ef=[];try{for(let eA of(await ev.readdir(eg))){let el=eQ.join(eg,eA);try{if(!(await ev.stat(el)).isDirectory())continue}catch{continue}try{for(let eA of(await ev.readdir(el))){if(!eA.endsWith(".jsonl")||eA.startsWith("agent-"))continue;let ec=eQ.join(el,eA);try{let el=await ev.stat(ec);if(el.mtimeMs<ed||0===el.size)continue;let eu=eA.replace(".jsonl",""),eg=ep.get(eu);eg&&eg._updatedAt&&eg._updatedAt>=el.mtimeMs?eg._error||eh.push(eg):ef.push(ec)}catch{continue}}}catch{continue}}}catch{}this.logger.debug(`[SessionFacetService] Scan complete: ${eh.length} cached, ${ef.length} need analysis`),el?.(0,ef.length,eh.length);let em=await this.analyzeFilesBatched(ef,eu,eA,el,eh.length,ec);return[...eh,...em]}async loadExistingFacets(eA){let el=new Map;try{for(let ec of(await ev.readdir(eA)))if(ec.endsWith(".json"))try{let eu=await ev.readFile(eQ.join(eA,ec),"utf-8"),ed=JSON.parse(eu);ed.session_id&&el.set(ed.session_id,ed)}catch{}}catch{}return el}async analyzeFilesBatched(eA,el,ec,eu,ed=0,ep){let eg=[],eh=ep?new Promise((eA,el)=>{if(ep.aborted){let eA=Error("Session analysis cancelled by user");eA.name="AbortError",el(eA);return}ep.addEventListener("abort",()=>{let eA=Error("Session analysis cancelled by user");eA.name="AbortError",el(eA)},{once:!0})}):null;for(let ef=0;ef<eA.length;ef+=eO){let em;if(ep?.aborted){this.logger.debug(`[SessionFacetService] Analysis cancelled after ${eg.length} facets`);break}let eE=Promise.allSettled(eA.slice(ef,ef+eO).map(async eA=>{let eu=eQ.basename(eA,".jsonl");return this.analyzeSessionFile(eu,eA,el,ec)}));try{em=eh?await Promise.race([eE,eh]):await eE}catch(eA){if("AbortError"===eA.name){this.logger.debug(`[SessionFacetService] Batch cancelled by user after ${eg.length} facets`);break}throw eA}for(let eA of em)"fulfilled"===eA.status&&eA.value&&eg.push(eA.value);let eC=Math.min(ef+eO,eA.length);eu?.(eC,eA.length,ed),this.logger.debug(`[SessionFacetService] Analyzed batch ${Math.floor(ef/eO)+1}, ${eg.length} facets so far`)}return eg}async analyzeSessionFile(eA,el,ec,eu){try{let ed=await ev.stat(el),ep=await this.readHistoryLines(el,200);if(0===ep.length)return await this.saveErrorFacet(ec,eA,ed.mtimeMs,"empty_history"),null;let eg=this.buildTranscriptFromHistory(ep);if(!eg)return await this.saveErrorFacet(ec,eA,ed.mtimeMs,"empty_transcript"),null;let eh=await this.promptRenderer.render("insights-session-facet",{data:eg,sessionId:eA,language:eu});if(!eh)return this.logger.warn(`[SessionFacetService] Failed to render template for session ${eA}`),await this.saveErrorFacet(ec,eA,ed.mtimeMs,"template_render_failed"),null;let ef=eE.ContainerUtil.get(ex.AgentService),em=await ef.runOneTime(ex.AgentNames.INSIGHTS_ANALYZER,eh),eC=this.parseJsonResponse(em);if(!eC)return this.logger.warn(`[SessionFacetService] Failed to parse facet for session ${eA}`),await this.saveErrorFacet(ec,eA,ed.mtimeMs,"json_parse_failed"),null;eC.session_id=eA,eC._updatedAt=ed.mtimeMs;let ey=eQ.join(ec,`${eA}.json`);return await ev.writeFile(ey,JSON.stringify(eC,null,2),"utf-8"),this.logger.debug(`[SessionFacetService] Saved facet for session ${eA}`),eC}catch(eu){this.logger.warn(`[SessionFacetService] Failed to analyze session ${eA}: ${eu.message}`);try{let ed=await ev.stat(el);await this.saveErrorFacet(ec,eA,ed.mtimeMs,eu.message||"unknown_error")}catch{}return null}}async saveErrorFacet(eA,el,ec,eu){try{let ed={session_id:el,_updatedAt:ec,_error:!0,_errorReason:eu},ep=eQ.join(eA,`${el}.json`);await ev.writeFile(ep,JSON.stringify(ed,null,2),"utf-8"),this.logger.debug(`[SessionFacetService] Saved error facet for session ${el}: ${eu}`)}catch{}}buildTranscriptFromHistory(eA){if(0===eA.length)return"";let el=[],ec=0,eu=8e3;for(let ed of eA){if(ec>=eu)break;let eA=ed;if("summary"!==eA.type&&"topic"!==eA.type&&!eA.isSidechain){if("user"===eA.role&&eA.content){let eu=this.extractText(eA.content);if(eu){let eA=`User: ${eu}`;el.push(eA.substring(0,500)),ec+=Math.min(eA.length,500)}}else if("assistant"===eA.role&&eA.content){let eu=this.extractText(eA.content);if(eu){let eA=`Assistant: ${eu}`;el.push(eA.substring(0,500)),ec+=Math.min(eA.length,500)}}else if("function_call"===eA.type){let eu=`Tool call: ${eA.name||"unknown"}`;el.push(eu),ec+=eu.length}else if("function_call_result"===eA.type){let eu=`Tool result: ${eA.name||"unknown"} (${eA.error?"error":"success"})`;el.push(eu),ec+=eu.length}}}return el.join("\n")}extractText(eA){return"string"==typeof eA?eA:Array.isArray(eA)?eA.filter(eA=>"text"===eA.type||"input_text"===eA.type||"output_text"===eA.type).map(eA=>eA.text||"").join(" ").substring(0,500):""}async readHistoryLines(eA,el){let ec=[],eu=eR.createInterface({input:(0,eT.createReadStream)(eA,{encoding:"utf-8"}),crlfDelay:1/0});for await(let eA of eu){let ed=eA.trim();if(ed){try{ec.push(JSON.parse(ed))}catch{}if(ec.length>=el){eu.close();break}}}return ec}parseJsonResponse(eA){let el=eA.trim();el.startsWith("```json")?el=el.slice(7):el.startsWith("```")&&(el=el.slice(3)),el.endsWith("```")&&(el=el.slice(0,-3)),el=el.trim();try{return JSON.parse(el)}catch{return this.logger.warn(`[SessionFacetService] JSON parse error: ${el.substring(0,200)}`),null}}};session_facet_service_decorate([(0,eE.Autowired)(eM.PromptRenderer),session_facet_service_metadata("design:type","function"==typeof(ep=void 0!==eM.PromptRenderer&&eM.PromptRenderer)?ep:Object)],eN.prototype,"promptRenderer",void 0),session_facet_service_decorate([(0,eE.Autowired)(ek.Logger),session_facet_service_metadata("design:type","function"==typeof(eg=void 0!==ek.Logger&&ek.Logger)?eg:Object)],eN.prototype,"logger",void 0),eN=session_facet_service_decorate([(0,eE.Component)(em)],eN)};
