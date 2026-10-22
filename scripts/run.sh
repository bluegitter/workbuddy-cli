#!/usr/bin/env bash
# 启动 5.3.8 提取版桌面端（数据目录与官方安装版隔离，自动更新已指到黑洞）。
# 附加参数会透传给 Electron（如 --inspect=9229）。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ELECTRON="${WB_ELECTRON_BIN:-$(dirname "$ROOT")/electron-runtime/Electron.app/Contents/MacOS/Electron}"

[ -x "$ELECTRON" ] || { echo "错误: 找不到 Electron 运行时 $ELECTRON，先跑 scripts/bootstrap.sh" >&2; exit 1; }

# 官方代码内置的隔离钩子 (extracted-app/main/index.js:185)
export WORKBUDDY_USER_DATA_DIR="${WORKBUDDY_USER_DATA_DIR:-$ROOT/wb-data/userdata}"
export WORKBUDDY_CONFIG_DIR="${WORKBUDDY_CONFIG_DIR:-$ROOT/wb-data/config}"
# 更新检查指向无效端口，防止拉取官方增量包覆盖 stub/软链/x64 依赖
export WORKBUDDY_UPDATE_URL="${WORKBUDDY_UPDATE_URL:-http://127.0.0.1:9}"

exec "$ELECTRON" "$ROOT/extracted-app" "$@"
