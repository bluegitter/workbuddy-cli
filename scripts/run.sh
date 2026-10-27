#!/usr/bin/env bash
# 启动 5.3.8 提取版桌面端（数据目录与官方安装版隔离，自动更新已指到黑洞）。
# 附加参数会透传给 Electron（如 --inspect=9229）。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ELECTRON="${WB_ELECTRON_BIN:-$(dirname "$ROOT")/electron-runtime/Electron.app/Contents/MacOS/Electron}"

[ -x "$ELECTRON" ] || { echo "错误: 找不到 Electron 运行时 $ELECTRON，先跑 scripts/bootstrap.sh" >&2; exit 1; }

# 官方代码内置的隔离钩子 (runtime-app/main/index.js:185)
export WORKBUDDY_USER_DATA_DIR="${WORKBUDDY_USER_DATA_DIR:-$ROOT/wb-data/userdata}"
export WORKBUDDY_CONFIG_DIR="${WORKBUDDY_CONFIG_DIR:-$ROOT/wb-data/config}"
# 更新检查指向无效端口，防止拉取官方增量包覆盖 stub/软链/x64 依赖
export WORKBUDDY_UPDATE_URL="${WORKBUDDY_UPDATE_URL:-http://127.0.0.1:9}"
# daemon 的 SidecarManager 用 appPath 拼 cli/bin/codebuddy 找 CLI。
# 主进程 index.js:9705 createElectronPlatform 在非打包布局下 appRootPath = process.cwd()，
# 且会在 10999 行用这个值覆盖 daemon 的 WORKBUDDY_APP_PATH（run.sh 里 export 的也会被覆盖掉），
# 所以唯一可靠的修法是从 runtime-app 目录里启动 Electron。
cd "$ROOT/runtime-app"
exec "$ELECTRON" "$ROOT/runtime-app" "$@"
