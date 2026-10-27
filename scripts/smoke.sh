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
  WORKBUDDY_CLI_PREWARM_POOL_SIZE=0 \
  nohup "$ROOT/scripts/run.sh" > "$LOG" 2>&1 &
MAIN_PID=$!

cleanup() {
  # Electron reparents daemon/sidecar children. Match only this checkout's
  # runtime paths so an installed WorkBuddy instance is untouched.
  runtime_patterns=(
    "$ROOT/runtime-app/main/daemon-app-server-entry.js"
    "$ROOT/runtime-app/main/sidecar-entry.js"
    "$ROOT/runtime-app/main/cli/bin/codebuddy"
    "$ROOT/runtime-app/cli/bin/codebuddy"
  )
  matching_pids() {
    ps -axo pid=,command= | awk -v pattern="$1" '$0 !~ /awk/ && $0 !~ /ps -axo/ && index($0, pattern) { print $1 }'
  }
  for round in 1 2 3 4 5; do
    for pattern in "${runtime_patterns[@]}"; do
      matching_pids "$pattern" | while read -r pid; do
        [ "$pid" = "$$" ] || kill -TERM "$pid" 2>/dev/null || true
      done
    done
    kill "$MAIN_PID" 2>/dev/null || true
    sleep 1
    active=0
    for pattern in "${runtime_patterns[@]}"; do
      if [ -n "$(matching_pids "$pattern")" ]; then active=1; break; fi
    done
    [ "$active" = 0 ] && break
  done
  for pattern in "${runtime_patterns[@]}"; do
    matching_pids "$pattern" | while read -r pid; do
      [ "$pid" = "$$" ] || kill -KILL "$pid" 2>/dev/null || true
    done
  done
  rm -rf "$TMPDATA"
}
trap cleanup EXIT INT TERM

FOUND=NO
for i in $(seq 1 60); do
  sleep 1
  if grep -q "Renderer bootstrap done, timeout guard cleared" "$LOG" 2>/dev/null; then FOUND=YES; break; fi
  if ! kill -0 $MAIN_PID 2>/dev/null; then break; fi
done
[ "$FOUND" = YES ] && ok "renderer bootstrap 完成 (${i}s)" || fail "启动未就绪或进程退出，见 $LOG"

echo
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" = 0 ]
