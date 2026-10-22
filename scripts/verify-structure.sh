#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PACKAGES='agent-ui agent-provider agent-client-protocol workbuddy-app workbuddy-core workbuddy-server runtime context authentication telemetry enterprise-policy plugin-core sandbox-cli'

for package in $PACKAGES; do
  test -f "$ROOT/packages/$package/package.json"
  test -f "$ROOT/packages/$package/src/index.js"
  test -d "$ROOT/packages/$package/src/compiled"
done

node -e 'const fs=require("fs"); const root=process.argv[1]; for (const p of fs.readdirSync(root+"/packages")) { if (fs.statSync(root+"/packages/"+p).isDirectory()) JSON.parse(fs.readFileSync(root+"/packages/"+p+"/package.json")); }' "$ROOT"

broken=$(find "$ROOT/packages" -type l ! -exec test -e {} \; -print)
test -z "$broken"
printf '%s\n' "WorkBuddy package structure verified: $PACKAGES"
