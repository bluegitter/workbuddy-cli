// Recovered bundle module 88476; dependencies use the original __webpack_require__ contract.
module.exports = function(eA,el,ec){"use strict";ec.a(eA,async function(eA,eu){try{ec.r(el),ec.d(el,{TerminalSetupPanel:()=>TerminalSetupPanel});var ed=ec(14083),ep=ec(96540),eg=ec(90097),eh=ec(99478),ef=ec(36330),em=ec(53829),eE=ec(47693),eC=eA([em,eE,ed,ef]);[em,eE,ed,ef]=eC.then?(await eC)():eC;let TerminalSetupPanel=({availableHeight:eA,onExit:el})=>{let{session:ec}=(0,em.useSessionContext)(),[eu,eC]=(0,ep.useState)(""),[ey,eB]=(0,ep.useState)(!0);return(0,ep.useEffect)(()=>()=>{(0,eE.commandManager)().finalizeCommandExecution(ec)},[ec.id]),(0,ep.useEffect)(()=>{(async()=>{let eA=eg.TerminalDetectorUtils.detect(),el=eg.TerminalDetectorUtils.detectAsType();if(!eg.TerminalDetectorUtils.isSupported()){let el=`Terminal setup cannot be run from ${eA||"unknown terminal"}.

This command configures a convenient Shift+Enter shortcut for multi-line prompts.
Note: You can already use backslash (\\) + return to add newlines.

To set up the shortcut (optional):
1. Exit tmux/screen temporarily
2. Run /terminal-setup directly in one of these terminals:
   • macOS: iTerm2, Terminal.app
   • IDE: VSCode, Cursor, Windsurf, Zed, CodeBuddy
   • JetBrains: PyCharm, IntelliJ IDEA, WebStorm, PhpStorm, GoLand, Rider, CLion, RubyMine, AppCode, DataGrip
   • Emulators: Ghostty, WezTerm, Kitty, Alacritty, Hyper, Tabby, Warp
   • Windows: Windows Terminal
3. Return to tmux/screen - settings will persist`;eC(el),eB(!1);return}try{let eA=await eh.TerminalSetupUtils.setup(el);eC(eA)}catch(el){let eA=el instanceof Error?el.message:String(el);eC(`Error: ${eA}`)}eB(!1)})()},[]),ep.createElement(ed.Box,{flexDirection:"column"},ey?ep.createElement(ed.Text,null,"Setting up terminal..."):ep.createElement(ep.Fragment,null,ep.createElement(ef.BranchNode,null,ep.createElement(ed.Text,null,eu))),ep.createElement(ef.ContinueBox,null))};eu()}catch(eA){eu(eA)}})};
