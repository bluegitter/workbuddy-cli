#!/usr/bin/env bash
# 一键重建 5.3.8 提取版桌面端的 x64 运行环境（幂等，可重复执行）。
# 用法: scripts/bootstrap.sh [--force]
#   --force 会删除 extracted-app/node_modules 后重建
#
# 依赖的外部素材（通过环境变量可覆盖默认路径）:
#   WB_X64_NODE_MODULES  5.2.6 x64 解包产物目录 (默认 ../app_unpacked)
#   WB_ELECTRON_RUNTIME  Electron x64 运行时目录 (默认 ../electron-runtime)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/extracted-app"
PARENT="$(dirname "$ROOT")"
UNPACKED="${WB_X64_NODE_MODULES:-$PARENT/app_unpacked}"
RUNTIME="${WB_ELECTRON_RUNTIME:-$PARENT/electron-runtime}"
ELECTRON_VERSION="37.10.3"
NM="$APP/node_modules"

if [ "${1:-}" = "--force" ]; then
  echo "[*] 删除现有 node_modules"
  rm -rf "$NM"
fi

echo "[1/5] Electron $ELECTRON_VERSION x64 运行时"
if [ ! -x "$RUNTIME/Electron.app/Contents/MacOS/Electron" ]; then
  mkdir -p "$RUNTIME"
  curl -fsSL -o "$RUNTIME/electron.zip" \
    "https://npmmirror.com/mirrors/electron/$ELECTRON_VERSION/electron-v$ELECTRON_VERSION-darwin-x64.zip"
  (cd "$RUNTIME" && unzip -q -o electron.zip && rm -f electron.zip)
fi
echo "  OK: $RUNTIME/Electron.app"

echo "[2/5] 从 5.2.6 x64 产物复制 node_modules (better-sqlite3 ABI136 / node-pty / fsevents 等)"
if [ ! -d "$NM" ]; then
  [ -d "$UNPACKED/node_modules" ] || { echo "错误: 找不到 $UNPACKED/node_modules，请设置 WB_X64_NODE_MODULES" >&2; exit 1; }
  cp -R "$UNPACKED/node_modules" "$NM"
fi
echo "  OK: $(ls "$NM" | wc -l | tr -d ' ') 个顶层包"

echo "[3/5] 5.3.8 专属依赖 (npm pack 手工解包，绕开 package.json 私有包解析)"
install_tarball() {
  local spec="$1" dest="$2" tgz want have
  want="${spec##*@}"
  have="$(node -e "console.log(require('$NM/$dest/package.json').version)" 2>/dev/null || echo none)"
  if [ "$have" = "$want" ]; then echo "  跳过 $spec (已装)"; return; fi
  tgz="$(cd /tmp && npm pack "$spec" 2>/dev/null | tail -1)"
  [ -f "/tmp/$tgz" ] || { echo "错误: npm pack $spec 失败（镜像可能缺该版本）" >&2; exit 1; }
  rm -rf /tmp/wb-pkg && mkdir /tmp/wb-pkg
  tar xzf "/tmp/$tgz" -C /tmp/wb-pkg
  rm -rf "$NM/$dest" && mkdir -p "$NM/$(dirname "$dest")"
  mv /tmp/wb-pkg/package "$NM/$dest"
  rm -f "/tmp/$tgz"
  echo "  OK: $dest@${spec##*@}"
}
install_tarball "koffi@2.16.2" "koffi"
install_tarball "@lydell/node-pty@1.2.0-beta.14" "@lydell/node-pty"
install_tarball "@lydell/node-pty-darwin-x64@1.2.0-beta.14" "@lydell/node-pty-darwin-x64"

echo "[4/5] 私有包 stub (@tencent/tencent-docs-ai-engine, @tencent/qimei-node)"
mkdir -p "$NM/@tencent"
rm -rf "$NM/@tencent/tencent-docs-ai-engine" "$NM/@tencent/qimei-node"
cp -R "$ROOT/patches/stubs/tencent-docs-ai-engine" "$NM/@tencent/tencent-docs-ai-engine"
cp -R "$ROOT/patches/stubs/qimei-node" "$NM/@tencent/qimei-node"
echo "  OK"

echo "[5/5] cli 资源软链 + 数据目录"
ln -sfn "$APP/cli" "$APP/main/cli"
mkdir -p "$ROOT/wb-data/userdata" "$ROOT/wb-data/config"
echo "  OK"

echo
echo "完成。启动: scripts/run.sh   冒烟测试: scripts/smoke.sh"
