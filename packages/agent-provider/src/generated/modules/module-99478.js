// Recovered bundle module 99478; dependencies use the original __webpack_require__ contract.
module.exports = function(eA,el,ec){"use strict";ec.r(el),ec.d(el,{TerminalSetupUtils:()=>TerminalSetupUtils});var eu=ec(35317),ed=ec(79896),ep=ec(70857),eg=ec(16928),eh=ec(39023),ef=ec(90097),em=ec(46949);let eE=(0,eh.promisify)(eu.exec),eC=(0,eh.promisify)(eu.execFile);let TerminalSetupUtils=class TerminalSetupUtils{static async setupITerm2(){let eA=(0,eg.join)((0,ep.homedir)(),"Library","Preferences","com.googlecode.iterm2.plist"),el=`${eA}.bak`;try{return(0,ed.existsSync)(eA)&&(0,ed.copyFileSync)(eA,el),await eE(`defaults write com.googlecode.iterm2 GlobalKeyMap -dict-add "0xd-0x20000-0x24" '<dict>
        <key>Text</key>
        <string>\\n</string>
        <key>Action</key>
        <integer>12</integer>
        <key>Version</key>
        <integer>1</integer>
        <key>Keycode</key>
        <integer>13</integer>
        <key>Modifiers</key>
        <integer>131072</integer>
      </dict>'`),await eC("defaults",["export","com.googlecode.iterm2",eA]),em.ThemeUtils.chalk.success("Installed iTerm2 Shift+Enter key binding")+"\nSee iTerm2 → Preferences → Keys"}catch(eA){throw Error(`Failed to install iTerm2 Shift+Enter key binding: ${eA}`)}}static async setupAppleTerminal(){let eA=(0,eg.join)((0,ep.homedir)(),"Library","Preferences","com.apple.Terminal.plist"),el=`${eA}.bak`;try{let{stdout:ec}=await eE('defaults read com.apple.Terminal "Default Window Settings"'),{stdout:eu}=await eE('defaults read com.apple.Terminal "Startup Window Settings"');(0,ed.existsSync)(eA)&&await eC("defaults",["export","com.apple.Terminal",el]);let ep=[ec.trim(),eu.trim()];for(let el of[...new Set(ep)]){try{await eC("/usr/libexec/PlistBuddy",["-c",`Add :'Window Settings':'${el}':useOptionAsMetaKey bool true`,eA])}catch{await eC("/usr/libexec/PlistBuddy",["-c",`Set :'Window Settings':'${el}':useOptionAsMetaKey true`,eA])}try{await eC("/usr/libexec/PlistBuddy",["-c",`Add :'Window Settings':'${el}':Bell bool false`,eA])}catch{await eC("/usr/libexec/PlistBuddy",["-c",`Set :'Window Settings':'${el}':Bell false`,eA])}}return await eE("killall cfprefsd"),em.ThemeUtils.chalk.success('Configured Terminal.app settings:\n- Enabled "Use Option as Meta key"\n- Switched to visual bell')+"\nOption+Enter will now enter a newline.\nYou must restart Terminal.app for changes to take effect."}catch(eA){throw Error(`Failed to configure Terminal.app: ${eA}`)}}static async setupVSCode(eA="VSCode"){let el="VSCode"===eA?"Code":"Zed"===eA?"Zed":eA,ec=(0,eg.join)((0,ep.homedir)(),"win32"===process.platform?(0,eg.join)("AppData","Roaming",el,"User"):"darwin"===process.platform?(0,eg.join)("Library","Application Support",el,"User"):(0,eg.join)(".config",el,"User")),eu=(0,eg.join)(ec,"keybindings.json");try{(0,ed.existsSync)(ec)||(0,ed.mkdirSync)(ec,{recursive:!0});let el=[];if((0,ed.existsSync)(eu)){let eA=(0,ed.readFileSync)(eu,"utf-8");try{el=JSON.parse(eA)}catch{}let ec=`${eu}.bak`;(0,ed.copyFileSync)(eu,ec)}if(el.find(eA=>"shift+enter"===eA.key&&"workbench.action.terminal.sendSequence"===eA.command&&"terminalFocus"===eA.when))return em.ThemeUtils.chalk.warning(`Found existing ${eA} terminal Shift+Enter key binding. Remove it to continue.`)+`
See ${eu}`;return el.push({key:"shift+enter",command:"workbench.action.terminal.sendSequence",args:{text:"\\\r\n"},when:"terminalFocus"}),(0,ed.writeFileSync)(eu,JSON.stringify(el,null,2),"utf-8"),em.ThemeUtils.chalk.success(`Installed ${eA} terminal Shift+Enter key binding`)+`
See ${eu}`}catch(el){throw Error(`Failed to install ${eA} terminal Shift+Enter key binding: ${el}`)}}static async setupGhostty(){let eA=process.env.XDG_CONFIG_HOME,el=[];eA?el.push((0,eg.join)(eA,"ghostty","config")):el.push((0,eg.join)((0,ep.homedir)(),".config","ghostty","config")),"darwin"===process.platform&&el.push((0,eg.join)((0,ep.homedir)(),"Library","Application Support","com.mitchellh.ghostty","config"));let ec=null;for(let eA of el)if((0,ed.existsSync)(eA)){ec=eA;break}ec||(ec=el[0]);try{let eA="";if((0,ed.existsSync)(ec)){if((eA=(0,ed.readFileSync)(ec,"utf-8")).includes("shift+enter"))return em.ThemeUtils.chalk.warning("Found existing Ghostty Shift+Enter key binding. Remove it to continue.")+`
See ${ec}`;let el=`${ec}.bak`;(0,ed.copyFileSync)(ec,el)}else{let eA=(0,eg.dirname)(ec);(0,ed.existsSync)(eA)||(0,ed.mkdirSync)(eA,{recursive:!0})}return eA&&!eA.endsWith("\n")&&(eA+="\n"),eA+="keybind = shift+enter=text:\\x1b\\r",(0,ed.writeFileSync)(ec,eA,"utf-8"),em.ThemeUtils.chalk.success(`Installed Ghostty Shift+Enter key binding
You may need to restart Ghostty for changes to take effect`)+`
See ${ec}`}catch(eA){throw Error(`Failed to install Ghostty Shift+Enter key binding: ${eA}`)}}static async setupWezTerm(){let eA=(0,eg.join)((0,ep.homedir)(),".wezterm.lua");try{let el="",ec=!1;if((0,ed.existsSync)(eA)){if(ec=!0,(el=(0,ed.readFileSync)(eA,"utf-8")).includes('mods="SHIFT"')&&el.includes('key="Enter"'))return em.ThemeUtils.chalk.warning("Found existing WezTerm Shift+Enter key binding. Remove it to continue.")+`
See ${eA}`;let eu=`${eA}.bak`;(0,ed.copyFileSync)(eA,eu)}if(ec){let eA=el.match(/config\.keys\s*=\s*\{([^}]*)\}/s);if(eA){let ec=eA[1]??"",eu=ec.trim()?`${ec.trim()},
  {key="Enter", mods="SHIFT", action=wezterm.action{SendString="\\x1b\\r"}},`:`
  {key="Enter", mods="SHIFT", action=wezterm.action{SendString="\\x1b\\r"}},
`;el=el.replace(/config\.keys\s*=\s*\{[^}]*\}/s,`config.keys = {${eu}}`)}else el.match(/return\s+config/s)?el=el.replace(/return\s+config/s,`config.keys = {
  {key="Enter", mods="SHIFT", action=wezterm.action{SendString="\\x1b\\r"}},
}

return config`):el+=`
config.keys = {
  {key="Enter", mods="SHIFT", action=wezterm.action{SendString="\\x1b\\r"}},
}
`}else el=`local wezterm = require 'wezterm'
local config = wezterm.config_builder()

config.keys = {
  {key="Enter", mods="SHIFT", action=wezterm.action{SendString="\\x1b\\r"}},
}

return config
`;return(0,ed.writeFileSync)(eA,el,"utf-8"),em.ThemeUtils.chalk.success(`Installed WezTerm Shift+Enter key binding
You may need to restart WezTerm for changes to take effect`)+`
See ${eA}`}catch(eA){throw Error(`Failed to install WezTerm Shift+Enter key binding: ${eA}`)}}static async setupWindowsTerminal(){let eA=process.env.LOCALAPPDATA;if(!eA)throw Error("LOCALAPPDATA is not set, cannot locate Windows Terminal settings");let el=(0,eg.join)(eA,"Packages");if(!(0,ed.existsSync)(el))throw Error("Windows Terminal Packages directory not found");let ec=(0,ed.readdirSync)(el,{withFileTypes:!0}).find(eA=>eA.isDirectory()&&eA.name.startsWith("Microsoft.WindowsTerminal_"));if(!ec)throw Error("Windows Terminal settings directory not found");let eu=(0,eg.join)(el,ec.name,"LocalState","settings.json");if(!(0,ed.existsSync)(eu))throw Error("Windows Terminal settings.json not found");try{let eA,el=(0,ed.readFileSync)(eu,"utf-8");try{eA=JSON.parse(el)}catch{throw Error("Failed to parse Windows Terminal settings.json")}let ec=`${eu}.bak`;(0,ed.copyFileSync)(eu,ec);let ep=Array.isArray(eA.actions)?"actions":"keybindings",eg=Array.isArray(eA[ep])?eA[ep]:[];if(eg.some(eA=>{let el=eA.keys,ec=Array.isArray(el)?el:[el],eu=ec&&ec.includes("shift+enter"),ed=(eA.command??eA.action)||{},ep="sendInput"===ed.action||"sendInput"===eA.action;return eu&&ep}))return em.ThemeUtils.chalk.warning("Found existing Windows Terminal Shift+Enter key binding. Remove it to continue.")+`
See ${eu}`;let eh={keys:"shift+enter",command:{action:"sendInput",input:"\x1b\r"}},ef=[...eg,eh];return eA[ep]=ef,(0,ed.writeFileSync)(eu,JSON.stringify(eA,null,2),"utf-8"),em.ThemeUtils.chalk.success("Installed Windows Terminal Shift+Enter key binding\nYou may need to restart Windows Terminal for changes to take effect")+`
See ${eu}`}catch(eA){throw Error(`Failed to install Windows Terminal Shift+Enter key binding: ${eA}`)}}static async setupKitty(){let eA=process.env.XDG_CONFIG_HOME,el=[];eA?el.push((0,eg.join)(eA,"kitty","kitty.conf")):el.push((0,eg.join)((0,ep.homedir)(),".config","kitty","kitty.conf")),"darwin"===process.platform&&el.push((0,eg.join)((0,ep.homedir)(),"Library","Application Support","kitty","kitty.conf"));let ec=null;for(let eA of el)if((0,ed.existsSync)(eA)){ec=eA;break}ec||(ec=el[0]);try{let eA="";if((0,ed.existsSync)(ec)){if((eA=(0,ed.readFileSync)(ec,"utf-8")).includes("map shift+enter"))return em.ThemeUtils.chalk.warning("Found existing Kitty Shift+Enter key binding. Remove it to continue.")+`
See ${ec}`;let el=`${ec}.bak`;(0,ed.copyFileSync)(ec,el)}else{let eA=(0,eg.dirname)(ec);(0,ed.existsSync)(eA)||(0,ed.mkdirSync)(eA,{recursive:!0})}return eA&&!eA.endsWith("\n")&&(eA+="\n"),eA+="map shift+enter send_text all \\x1b\\r",(0,ed.writeFileSync)(ec,eA,"utf-8"),em.ThemeUtils.chalk.success(`Installed Kitty Shift+Enter key binding
You may need to restart Kitty for changes to take effect`)+`
See ${ec}`}catch(eA){throw Error(`Failed to install Kitty Shift+Enter key binding: ${eA}`)}}static async setupAlacritty(){let eA=process.env.XDG_CONFIG_HOME,el=[];eA?el.push((0,eg.join)(eA,"alacritty","alacritty.toml")):el.push((0,eg.join)((0,ep.homedir)(),".config","alacritty","alacritty.toml")),"darwin"===process.platform&&el.push((0,eg.join)((0,ep.homedir)(),"Library","Application Support","alacritty","alacritty.toml"));let ec=null;for(let eA of el)if((0,ed.existsSync)(eA)){ec=eA;break}ec||(ec=el[0]);try{let eA="",el=!1;if((0,ed.existsSync)(ec)){if(el=!0,(eA=(0,ed.readFileSync)(ec,"utf-8")).includes("shift+enter")||eA.includes('"Return"')&&eA.includes('"Shift"'))return em.ThemeUtils.chalk.warning("Found existing Alacritty Shift+Enter key binding. Remove it to continue.")+`
See ${ec}`;let eu=`${ec}.bak`;(0,ed.copyFileSync)(ec,eu)}else{let eA=(0,eg.dirname)(ec);(0,ed.existsSync)(eA)||(0,ed.mkdirSync)(eA,{recursive:!0})}let eu=`[[keyboard.bindings]]
key = "Return"
mods = "Shift"
chars = "\\x1b\\r"

[[keyboard.bindings]]
key = "Return"
mods = "Alt"
chars = "\\x1b\\r"`;return el?eA.includes("[[keyboard.bindings]]")?(eA&&!eA.endsWith("\n")&&(eA+="\n"),eA+=`
${eu}`):(eA&&!eA.endsWith("\n")&&(eA+="\n"),eA+=`
[keyboard]
${eu}`):eA=`# Alacritty configuration
[keyboard]
${eu}`,(0,ed.writeFileSync)(ec,eA,"utf-8"),em.ThemeUtils.chalk.success(`Installed Alacritty Shift+Enter key binding
You may need to restart Alacritty for changes to take effect`)+`
See ${ec}`}catch(eA){throw Error(`Failed to install Alacritty Shift+Enter key binding: ${eA}`)}}static async setupWarp(){let eA=(0,eg.join)((0,ep.homedir)(),".warp","warp_terminal_config.yaml");try{let el="";if((0,ed.existsSync)(eA)){if((el=(0,ed.readFileSync)(eA,"utf-8")).includes("shift+enter"))return em.ThemeUtils.chalk.warning("Found existing Warp Shift+Enter key binding. Remove it to continue.")+`
See ${eA}`;let ec=`${eA}.bak`;(0,ed.copyFileSync)(eA,ec)}else{let el=(0,eg.dirname)(eA);(0,ed.existsSync)(el)||(0,ed.mkdirSync)(el,{recursive:!0})}el&&!el.endsWith("\n")&&(el+="\n");let ec=`keyboard:
  bindings:
    - keys: shift+enter
      action: insert_newline`;return el?el.includes("keyboard:")?el+=`
  - keys: shift+enter
    action: insert_newline`:el+=`
${ec}`:el=ec,(0,ed.writeFileSync)(eA,el,"utf-8"),em.ThemeUtils.chalk.success(`Installed Warp Shift+Enter key binding
You may need to restart Warp for changes to take effect`)+`
See ${eA}`}catch(eA){throw Error(`Failed to install Warp Shift+Enter key binding: ${eA}`)}}static async setup(eA){switch(eA){case ef.TerminalType.ITERM:case ef.TerminalType.ITERM_LEGACY:return await this.setupITerm2();case ef.TerminalType.APPLE_TERMINAL:return await this.setupAppleTerminal();case ef.TerminalType.VSCODE:return await this.setupVSCode("VSCode");case ef.TerminalType.CODEBUDDY:return await this.setupVSCode("CodeBuddy");case ef.TerminalType.CODEBUDDY_CN:return await this.setupVSCode("CodeBuddy CN");case ef.TerminalType.CURSOR:return await this.setupVSCode("Cursor");case ef.TerminalType.WINDSURF:return await this.setupVSCode("Windsurf");case ef.TerminalType.CODIUM:return await this.setupVSCode("VSCodium");case ef.TerminalType.ZED:return await this.setupVSCode("Zed");case ef.TerminalType.PYCHARM:return await this.setupVSCode("PyCharm");case ef.TerminalType.INTELLIJ_IDEA:return await this.setupVSCode("IntelliJ IDEA");case ef.TerminalType.WEBSTORM:return await this.setupVSCode("WebStorm");case ef.TerminalType.PHPSTORM:return await this.setupVSCode("PhpStorm");case ef.TerminalType.GOLAND:return await this.setupVSCode("GoLand");case ef.TerminalType.RIDER:return await this.setupVSCode("Rider");case ef.TerminalType.CLION:return await this.setupVSCode("CLion");case ef.TerminalType.RUBYMINE:return await this.setupVSCode("RubyMine");case ef.TerminalType.APPCODE:return await this.setupVSCode("AppCode");case ef.TerminalType.DATAGRIP:return await this.setupVSCode("DataGrip");case ef.TerminalType.GHOSTTY:return await this.setupGhostty();case ef.TerminalType.KITTY:return await this.setupKitty();case ef.TerminalType.ALACRITTY:return await this.setupAlacritty();case ef.TerminalType.WARP:return await this.setupWarp();case ef.TerminalType.WEZTERM:return await this.setupWezTerm();case ef.TerminalType.WINDOWS_TERMINAL:return await this.setupWindowsTerminal();default:throw Error("Unsupported terminal type")}}}};
