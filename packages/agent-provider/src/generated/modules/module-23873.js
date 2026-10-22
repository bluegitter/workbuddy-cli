// Recovered bundle module 23873; dependencies use the original __webpack_require__ contract.
module.exports = function(eA,el,ec){"use strict";ec.r(el),ec.d(el,{ClipboardUtils:()=>ClipboardUtils});var eu=ec(80699),ed=ec(35317),ep=ec(79896),eg=ec(71238),eh=ec(70857),ef=ec(16928),em=ec(8443),eE=ec(87731),eC=ec(14956),ey=ec(8481);let ClipboardUtils=class ClipboardUtils{static delay(eA){return new Promise(el=>setTimeout(el,eA))}static async hasImage(eA){let el=eA?.retry??!1,{maxRetries:ec,retryDelayMs:eu}=this.DEFAULT_RETRY_CONFIG;try{let eA,ed=eh.platform();if("darwin"===ed)eA=()=>this.hasImageMacOS();else if("win32"===ed)eA=()=>this.hasImageWindows();else{if("linux"!==ed)return!1;eA=()=>this.hasImageLinux()}let ep=await eA();if(ep)return!0;if(el)for(let el=0;el<ec&&!ep;el++)await this.delay(eu),ep=await eA();return ep}catch(eA){return!1}}static async readImage(eA){let el=eA?.retry??!1,{maxRetries:ec,retryDelayMs:eu}=this.DEFAULT_RETRY_CONFIG;try{let eA,ed=eh.platform();if("darwin"===ed)eA=()=>this.readImageMacOS();else if("win32"===ed)eA=()=>this.readImageWindows();else{if("linux"!==ed)return;eA=()=>this.readImageLinux()}let ep=await eA();if(ep)return ep;if(el)for(let el=0;el<ec&&!ep;el++)await this.delay(eu),ep=await eA();return ep}catch(eA){return}}static async hasImageMacOS(){try{let{stdout:eA}=await (0,eg.default)("osascript",["-e","clipboard info"]);if(this.MACOS_IMAGE_FORMATS.some(el=>eA.includes(el))||this.MACOS_DYNAMIC_IMAGE_PREFIXES.some(el=>eA.includes(el))&&await this.probeImageMacOS())return!0;return!1}catch{return!1}}static async probeImageMacOS(){try{if(await this.isPngpasteAvailable()){let eA=ef.join(eh.tmpdir(),`clipboard-probe-${Date.now()}.png`);try{await (0,eg.default)("pngpaste",[eA]);let el=ep.existsSync(eA);return el&&ep.unlinkSync(eA),el}catch{return!1}}try{let{stdout:eA}=await (0,eg.default)("osascript",["-e",'try\nthe clipboard as \xabclass TIFF\xbb\nreturn "yes"\non error\nreturn "no"\nend try']);if("yes"===eA.trim())return!0}catch{}try{let eA=`
ObjC.import('Cocoa');
var pb = $.NSPasteboard.generalPasteboard;
var img = $.NSImage.alloc.initWithPasteboard(pb);
img.isNil() ? 'no' : 'yes';
`,{stdout:el}=await (0,eg.default)("osascript",["-l","JavaScript","-e",eA]);return"yes"===el.trim()}catch{return!1}}catch{return!1}}static async checkPlatformCompatibility(){return eE.ClipboardCompatibilityUtils.checkPlatformCompatibility()}static async isPngpasteAvailable(){try{return await (0,eg.default)("which",["pngpaste"],{stdout:"ignore",stderr:"ignore"}),!0}catch{return!1}}static syncTmuxToSystemClipboard(){if(process.env.TMUX)try{(0,ed.execSync)("tmux save-buffer - 2>/dev/null | pbcopy",{timeout:1e3,stdio:"ignore"})}catch(eA){}}static async readImageMacOSFallback(){let eA=eh.tmpdir(),el=ef.join(eA,`clipboard-image-${Date.now()}.png`);this.syncTmuxToSystemClipboard();let ec=await this.readImageWithAppleScript(el);return ec||this.readImageWithNSPasteboard(el)}static async readImageWithAppleScript(eA){for(let{className:el,format:ec}of[{className:"\xabclass PNGf\xbb",format:"png"},{className:"\xabclass TIFF\xbb",format:"png"}]){let eu=`
                set theFile to POSIX file "${eA}"
                try
                    set theImage to the clipboard as ${el}
                    set fileRef to open for access theFile with write permission
                    write theImage to fileRef
                    close access fileRef
                    return "success"
                on error errMsg
                    try
                        close access fileRef
                    end try
                    return "error: " & errMsg
                end try
            `;try{let{stdout:el}=await (0,eg.default)("osascript",["-e",eu]);if("success"===el.trim()&&ep.existsSync(eA)){let el=ep.readFileSync(eA);if(el.length>0)return{data:el,format:ec,tempFilePath:eA}}}catch{continue}}}static async readImageWithNSPasteboard(eA){let el=`
ObjC.import('Cocoa');
ObjC.import('Foundation');

var pasteboard = $.NSPasteboard.generalPasteboard;

// 使用 NSImage 从剪贴板读取图片（最大兼容性）
// NSImage 能自动处理各种图片格式，包括企业微信等非标准格式
var image = $.NSImage.alloc.initWithPasteboard(pasteboard);
if (image.isNil()) {
    'no_image';
} else {
    // 获取 TIFF 数据并转换为 PNG
    var tiffData = image.TIFFRepresentation;
    var bitmap = $.NSBitmapImageRep.imageRepWithData(tiffData);
    var pngData = bitmap.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $.NSDictionary.dictionary);

    if (pngData.isNil()) {
        'conversion_failed';
    } else {
        var outputPath = '${eA}';
        pngData.writeToFileAtomically(outputPath, true);
        'success';
    }
}
`;try{let{stdout:ec}=await (0,eg.default)("osascript",["-l","JavaScript","-e",el]),eu=ec.trim();if("success"===eu&&ep.existsSync(eA)){let el=ep.readFileSync(eA);if(el.length>0)return{data:el,format:"png",tempFilePath:eA}}}catch{}}static async readImageMacOS(){return await this.isPngpasteAvailable()?this.readImageMacOSWithPngpaste():this.readImageMacOSFallback()}static async readImageMacOSWithPngpaste(){let eA=eh.tmpdir(),el=ef.join(eA,`clipboard-image-${Date.now()}.png`);this.syncTmuxToSystemClipboard();try{if(await (0,eg.default)("pngpaste",[el]),ep.existsSync(el))return{data:ep.readFileSync(el),format:"png",tempFilePath:el};return}catch{return}}static async hasImageWindows(){try{let{stdout:eA}=await (0,eg.default)("powershell",["-NoProfile","-NonInteractive","-WindowStyle","Hidden","-Command","Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::ContainsImage()"],{windowsHide:!0});return"True"===eA.trim()}catch{return!1}}static async readImageWindows(){let eA=eh.tmpdir(),el=ef.join(eA,`clipboard-image-${Date.now()}.png`),ec=`Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $img = [System.Windows.Forms.Clipboard]::GetImage(); if ($img -ne $undefined) { $img.Save('${el}', [System.Drawing.Imaging.ImageFormat]::Png); 'Success' } else { 'No image' }`;try{if(await (0,eg.default)("powershell",["-NoProfile","-NonInteractive","-WindowStyle","Hidden","-Command",ec],{windowsHide:!0}),ep.existsSync(el))return{data:ep.readFileSync(el),format:"png",tempFilePath:el};return}catch{return}}static async hasImageLinux(){try{let{stdout:eA}=await (0,eg.default)("xclip",["-selection","clipboard","-t","TARGETS","-o"]);return eA.includes("image/")}catch{return!1}}static async readImageLinux(){return new Promise(eA=>{let el=eh.tmpdir(),ec=ef.join(el,`clipboard-image-${Date.now()}.png`),eu=(0,ed.spawn)("xclip",["-selection","clipboard","-t","image/png","-o"]),eg=ep.createWriteStream(ec);eu.stdout.pipe(eg),eu.on("close",el=>{if(eg.end(),0===el&&ep.existsSync(ec))try{let el=ep.readFileSync(ec);el.length>0?eA({data:el,format:"png",tempFilePath:ec}):eA(void 0)}catch(el){eA(void 0)}else eA(void 0)}),eu.on("error",()=>{eA(void 0)})})}static readTextFromClipboard(){return"win32"!==process.platform?Promise.resolve(void 0):this.readTextFromClipboardWindows()}static readTextFromClipboardWindows(){return new Promise(eA=>{(0,ed.execFile)("powershell.exe",["-NoProfile","-NonInteractive","-Command","[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Clipboard -Raw"],{encoding:"utf8",maxBuffer:0x4000000,windowsHide:!0},(el,ec)=>{if(el){let ec=el instanceof Error?el.message:String(el);eu.ContainerUtil.get(eu.Logger).debug(`Failed to read clipboard text on Windows: ${ec}`),eA(void 0);return}eA(ec.replace(/\r?\n$/,""))})})}static async copyToClipboard(eA){let el=eu.ContainerUtil.get(eu.Logger),ec=Buffer.from(eA,"utf8").toString("utf8");if(eC.OscProtocolUtils.isSSHSession()){if(eC.OscProtocolUtils.supportsOSC52())return!!eC.OscProtocolUtils.copyToClipboardViaOSC52(ec)||(el.warn("OSC 52 clipboard copy failed in SSH session"),!1);el.warn("OSC 52 not supported, clipboard copy may fail in SSH session")}switch(process.platform){case"win32":return ey.ProcessUtils.copyToClipboardWindows(ec);case"darwin":return ey.ProcessUtils.runCommand("pbcopy",[],ec);case"linux":try{return ey.ProcessUtils.runCommand("xclip",["-selection","clipboard"],ec)}catch(eA){try{return ey.ProcessUtils.runCommand("xsel",["--clipboard","--input"],ec)}catch(ed){let ec=eA instanceof Error?eA.message:String(eA),eu=ed instanceof Error?ed.message:String(ed);return el.error(`All copy commands failed. xclip: "${ec}", xsel: "${eu}". Please ensure xclip or xsel is installed and configured.`),!1}}default:return el.error(`Unsupported platform: ${process.platform}`),!1}}static cleanupTempFile(eA){try{ep.existsSync(eA)&&ep.unlinkSync(eA)}catch(eA){}}static async getClipboardFiles(){let eA=eh.platform();try{switch(eA){case"darwin":return this.getClipboardFilesMacOS();case"win32":return this.getClipboardFilesWindows();case"linux":return this.getClipboardFilesLinux();default:return Promise.resolve([])}}catch(eA){return eu.ContainerUtil.get(eu.Logger).warn(`Failed to getClipboardFiles : ${eA}`),[]}}static getClipboardFilesMacOS(){return new Promise((eA,el)=>{try{if((0,ed.execSync)('osascript -e "clipboard info"',{stdio:"pipe",encoding:"utf8"}).toString().indexOf("\xabclass furl\xbb")>=0){let el=[];try{let eA=`osascript -e 'try
                set theClip to the clipboard as \xabclass furl\xbb
                return POSIX path of theClip
            on error
                return ""
            end try'`,ec=(0,ed.execSync)(eA,{encoding:"utf8",stdio:"pipe"}).trim();ec&&ec.startsWith("/")&&el.push(ec)}catch(eA){}if(el.length>0)try{let eA=(0,ed.execSync)("pbpaste",{encoding:"utf8",stdio:"pipe"}),ec=/([a-zA-Z0-9_-]+\.(png|jpg|jpeg|gif|bmp|webp))/gi,eu=eA.match(ec);if(eu&&eu.length>0){let eA=el.length>0?el[0].substring(0,el[0].lastIndexOf("/")):"";eu.forEach(ec=>{let eu=`${eA}/${ec}`;if(!el.includes(eu))try{ep.accessSync(eu),el.push(eu)}catch(eA){}})}}catch(eA){eu.ContainerUtil.get(em.ConsoleManager).error("解析文本失败:",eA.message,{mode:em.ConsoleOutputMode.NATIVE})}if(el.length>0)return void eA(el)}}catch(eA){}eA([])})}static getClipboardFilesWindows(){return new Promise((eA,el)=>{let ec=`
            Add-Type -AssemblyName System.Windows.Forms;
            Add-Type -AssemblyName System.Drawing;
            $files = [System.Windows.Forms.Clipboard]::GetFileDropList();
            if ($files -and $files.Count -gt 0) {
                $files | ForEach-Object { $_ };
                exit;
            }
            if ([System.Windows.Forms.Clipboard]::ContainsImage()) {
                $image = [System.Windows.Forms.Clipboard]::GetImage();
                if ($image) {
                    $guid = [guid]::NewGuid().ToString();
                    $tempFile = Join-Path $env:TEMP "clipboard_$guid.png";
                    $image.Save($tempFile, [System.Drawing.Imaging.ImageFormat]::Png);
                    $image.Dispose();
                    Write-Output $tempFile;
                }
            }
            `.trim();(0,ed.execFile)("powershell",["-NoProfile","-NonInteractive","-WindowStyle","Hidden","-Command",ec.replace(/\n/g," ")],{windowsHide:!0},(ec,eu,ed)=>{if(ec)return void el(ec);let ep=eu.trim();ep?eA(ep.split("\n").map(eA=>eA.trim()).filter(eA=>eA.length>0)):eA([])})})}static getClipboardFilesLinux(){return new Promise((eA,el)=>{(0,ed.exec)("xclip -selection clipboard -t text/uri-list -o",(el,ec,eu)=>{!el&&ec.trim()?eA(ec.trim().split("\n").map(eA=>eA.startsWith("file://")?decodeURIComponent(eA.substring(7)):eA).filter(eA=>eA.length>0)):(0,ed.exec)("xsel --clipboard --output",(el,ec,eu)=>{!el&&ec.trim()?eA(ec.trim().split("\n").map(eA=>eA.startsWith("file://")?decodeURIComponent(eA.substring(7)):eA).filter(eA=>eA.length>0&&ep.existsSync(eA))):eA([])})})})}};ClipboardUtils.DEFAULT_RETRY_CONFIG={maxRetries:5,retryDelayMs:150},ClipboardUtils.MACOS_IMAGE_FORMATS=["\xabclass PNGf\xbb","TIFF","\xabclass TIFF\xbb","JPEG","\xabclass jp2 \xbb","\xabclass BMP \xbb","\xabclass GIF \xbb","\xabclass HEIC\xbb","public.png","public.jpeg","public.tiff"],ClipboardUtils.MACOS_DYNAMIC_IMAGE_PREFIXES=["dyn."]};
