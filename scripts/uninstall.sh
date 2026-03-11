#!/usr/bin/env bash
# uninstall.sh — adev 제거 스크립트 / adev uninstall script
#
# KR: adev 바이너리, 글로벌 설정 디렉토리, PATH 링크를 제거한다.
# EN: Removes the adev binary, global config directory, and PATH symlink.
#
# 사용법 / Usage:
#   bash scripts/uninstall.sh
#   bash scripts/uninstall.sh --dry-run   # 실제 삭제 없이 확인만

set -euo pipefail

# ── 상수 / Constants ────────────────────────────────────────────

ADEV_GLOBAL_DIR="${HOME}/.adev"
ADEV_BIN_NAME="adev"
INSTALL_DIRS=("/usr/local/bin" "${HOME}/.local/bin" "${HOME}/bin")
DRY_RUN=false

# ── 인자 파싱 / Argument parsing ────────────────────────────────

for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN=true
      ;;
    --help|-h)
      echo "Usage: $0 [--dry-run]"
      echo "  --dry-run  Show what would be removed without actually removing"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

# ── 유틸 함수 / Utilities ───────────────────────────────────────

log_info()  { echo "  [info]  $*"; }
log_done()  { echo "  [done]  $*"; }
log_skip()  { echo "  [skip]  $*"; }
log_dry()   { echo "  [dry]   would remove: $*"; }

remove_path() {
  local target="$1"
  if [ -e "$target" ] || [ -L "$target" ]; then
    if "$DRY_RUN"; then
      log_dry "$target"
    else
      rm -rf "$target"
      log_done "Removed: $target"
    fi
  else
    log_skip "Not found: $target"
  fi
}

# ── 제거 시작 / Start uninstall ─────────────────────────────────

echo ""
echo "adev Uninstaller"
echo "──────────────────────────────────────────"
if "$DRY_RUN"; then
  echo "  DRY RUN — no files will be deleted"
fi
echo ""

# 1. 바이너리 제거 / Remove binary
log_info "Searching for adev binary..."
REMOVED_BIN=false
for dir in "${INSTALL_DIRS[@]}"; do
  bin_path="${dir}/${ADEV_BIN_NAME}"
  if [ -f "$bin_path" ] || [ -L "$bin_path" ]; then
    remove_path "$bin_path"
    REMOVED_BIN=true
  fi
done
if ! "$REMOVED_BIN"; then
  log_skip "adev binary not found in standard locations"
fi

# 2. 글로벌 설정 디렉토리 제거 / Remove global config directory
log_info "Removing global config directory: ${ADEV_GLOBAL_DIR}"
remove_path "$ADEV_GLOBAL_DIR"

# 3. npm / bun 글로벌 패키지 제거 시도 / Try removing global npm/bun package
if command -v bun &>/dev/null; then
  if bun pm ls -g 2>/dev/null | grep -q 'autonomous-dev-agent'; then
    log_info "Removing bun global package..."
    if "$DRY_RUN"; then
      log_dry "bun remove -g autonomous-dev-agent"
    else
      bun remove -g autonomous-dev-agent 2>/dev/null && log_done "bun global package removed" || log_skip "bun global remove failed (may not be installed via bun)"
    fi
  else
    log_skip "bun global package not found"
  fi
fi

echo ""
echo "──────────────────────────────────────────"
if "$DRY_RUN"; then
  echo "Dry run complete. Re-run without --dry-run to actually uninstall."
else
  echo "adev uninstalled successfully."
fi
echo ""
