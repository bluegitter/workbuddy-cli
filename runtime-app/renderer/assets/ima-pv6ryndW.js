import { n as __esmMin } from "./chunk-BRZcfu7K.js";
import { ld as init_use_ima_enabled, lr as useMainRouteActive, ud as useImaEnabled } from "./agent-mail-DVtNAOC2.js";
import { t as require_react } from "./react-ierAfTWN.js";
import { t as require_jsx_runtime } from "./jsx-runtime-BNEdAQtr.js";
import { t as init_app_shell } from "./app-shell-BT0QJ9Ei.js";
import { r as ImaLibraryView, t as init_ima$1 } from "./ima-DZmX4dyb.js";
//#region ../../packages/agent-ui/src/pages/ima.tsx
function ImaPage() {
	const { enabled: imaEnabled } = useImaEnabled();
	const active = useMainRouteActive();
	if (!imaEnabled) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ImaLibraryView, { visible: active });
}
var import_jsx_runtime;
//#endregion
__esmMin((() => {
	require_react();
	init_app_shell();
	init_ima$1();
	init_use_ima_enabled();
	import_jsx_runtime = require_jsx_runtime();
}))();
export { ImaPage };
