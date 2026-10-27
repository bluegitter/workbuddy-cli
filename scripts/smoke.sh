#!/usr/bin/env bash
# 冒烟测试：1) CLI 自检+最小对话  2) 桌面端启动到 renderer bootstrap 完成
# 桌面测试使用独立临时数据目录，不影响正在运行的实例。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0; FAIL=0
ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }

echo "[1/2] CodeBuddy CLI"
V="$(node "$ROOT/runtime-app/cli/bin/codebuddy" --version 2>/dev/null | tail -1)" \
  && [ -n "$V" ] && ok "codebuddy --version = $V" || fail "CLI 启动失败"

echo "[2/2] 桌面端启动 (isolated tmp data dir, 60s 超时)"
TMPDATA="$(mktemp -d /tmp/wb-smoke.XXXXXX)"
LOG="$TMPDATA/run.log"
WORKBUDDY_USER_DATA_DIR="$TMPDATA/userdata" WORKBUDDY_CONFIG_DIR="$TMPDATA/config" \
  nohup "$ROOT/scripts/run.sh" > "$LOG" 2>&1 &
MAIN_PID=$!

FOUND=NO
for i in $(seq 1 60); do
  sleep 1
  if grep -q "Renderer bootstrap done, timeout guard cleared" "$LOG" 2>/dev/null; then FOUND=YES; break; fi
  if ! kill -0 $MAIN_PID 2>/dev/null; then break; fi
done
[ "$FOUND" = YES ] && ok "renderer bootstrap 完成 (${i}s)" || fail "启动未就绪或进程退出，见 $LOG"

# 清理冒烟实例（只匹配 runtime-app 路径，不会误伤官方安装版）
kill $MAIN_PID 2>/dev/null || true
pkill -f "runtime-app/main/daemon-app-server-entry" 2>/dev/null || true
pkill -f "runtime-app/main/cli/bin/codebuddy" 2>/dev/null || true
sleep 2
pkill -9 -f "wb-smoke.*Electron" 2>/dev/null || true
rm -rf "$TMPDATA"

echo
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" = 0 ]
