#!/usr/bin/env bash
# 用法：./apply-to-repo.sh [仓库根目录]
# 默认仓库根为「本包」的上一级（与 session-changes-bundle 并列的 zz 根目录）
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE_DIR="$(dirname "$SCRIPT_DIR")"
PATCH_ROOT="$BUNDLE_DIR/patch-root"
REPO_ROOT="${1:-$(dirname "$BUNDLE_DIR")}"

if [[ ! -d "$PATCH_ROOT" ]]; then
  echo "Missing patch-root: $PATCH_ROOT" >&2
  exit 1
fi

echo "RepoRoot: $REPO_ROOT"
echo "Patch:    $PATCH_ROOT"

cp -a "$PATCH_ROOT/." "$REPO_ROOT/"

for rel in \
  "backend/routes/admin/config.js" \
  "backend/services/ConfigService.js" \
  "admin-ui/src/views/system-config/index.vue"
do
  p="$REPO_ROOT/$rel"
  if [[ -f "$p" ]]; then
    rm -f "$p"
    echo "  (removed) $rel"
  fi
done

echo ""
echo "Next: mysql ... < session-changes-bundle/scripts/run-sql-migrations.sql"
