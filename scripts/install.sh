#!/usr/bin/env bash
# install.sh — adev 설치 스크립트 / adev install script
#
# KR: Bun 런타임을 확인하고 adev CLI를 시스템에 설치한다.
#     macOS / Linux 지원. Windows는 WSL 권장.
# EN: Checks for Bun runtime and installs the adev CLI.
#     Supports macOS / Linux. Windows: use WSL.
#
# 사용법 / Usage:
#   curl -fsSL https://autonomous-dev-agent.dev/install.sh | bash
#   bash scripts/install.sh [--dev]
#   bash scripts/install.sh --help

set -euo pipefail

# ── 상수 / Constants ────────────────────────────────────────────

REPO_URL="https://github.com/uygnoey/autonomous-dev-agent-ts"
PACKAGE_NAME="autonomous-dev-agent"
ADEV_BIN_NAME="adev"
ADEV_GLOBAL_DIR="${HOME}/.adev"
MIN_BUN_VERSION="1.1.0"
DEV_MODE=false

# ── 색상 / Colors ────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ── 유틸 함수 / Utilities ───────────────────────────────────────

log_info()    { echo -e "  ${CYAN}[info]${RESET}  $*"; }
log_success() { echo -e "  ${GREEN}[done]${RESET}  $*"; }
log_warn()    { echo -e "  ${YELLOW}[warn]${RESET}  $*"; }
log_error()   { echo -e "  ${RED}[error]${RESET} $*" >&2; }
log_step()    { echo -e "\n${BOLD}$*${RESET}"; }

die() {
  log_error "$*"
  exit 1
}

# ── 인자 파싱 / Argument parsing ────────────────────────────────

for arg in "$@"; do
  case "$arg" in
    --dev)
      DEV_MODE=true
      ;;
    --help|-h)
      echo ""
      echo "adev Installer"
      echo ""
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --dev      Install from local source (for development)"
      echo "  --help     Show this help message"
      echo ""
      exit 0
      ;;
    *)
      die "Unknown argument: $arg. Use --help for usage."
      ;;
  esac
done

# ── OS 감지 / OS detection ──────────────────────────────────────

detect_os() {
  local os
  os="$(uname -s)"
  case "$os" in
    Linux*)  echo "linux"  ;;
    Darwin*) echo "macos"  ;;
    MINGW*|MSYS*|CYGWIN*)
      die "Windows 네이티브 쉘은 지원하지 않습니다. WSL(Windows Subsystem for Linux)을 사용하세요.\nNative Windows shell is not supported. Use WSL (Windows Subsystem for Linux)."
      ;;
    *)
      die "지원하지 않는 OS: $os / Unsupported OS: $os"
      ;;
  esac
}

# ── Bun 버전 비교 / Compare Bun version ────────────────────────

version_ge() {
  # WHY: sort -V는 버전 비교용 — 두 버전이 같거나 첫 번째가 크면 true
  [ "$(printf '%s\n' "$1" "$2" | sort -V | head -n1)" = "$2" ]
}

# ── Bun 확인/설치 / Check Bun ───────────────────────────────────

check_bun() {
  if ! command -v bun &>/dev/null; then
    log_warn "Bun이 설치되어 있지 않습니다. 설치 중... / Bun not found. Installing..."
    curl -fsSL https://bun.sh/install | bash
    # shellcheck source=/dev/null
    export PATH="${HOME}/.bun/bin:${PATH}"
    if ! command -v bun &>/dev/null; then
      die "Bun 설치 실패. https://bun.sh 에서 수동 설치 후 재시도하세요."
    fi
    log_success "Bun 설치 완료"
  fi

  local bun_version
  bun_version="$(bun --version)"

  if ! version_ge "$bun_version" "$MIN_BUN_VERSION"; then
    die "Bun 버전이 너무 낮습니다. 최소 버전: ${MIN_BUN_VERSION}, 현재: ${bun_version}.\n'bun upgrade'로 업데이트 후 재시도하세요."
  fi

  log_success "Bun ${bun_version} 확인됨"
}

# ── adev 설치 / Install adev ────────────────────────────────────

install_adev() {
  if "$DEV_MODE"; then
    log_step "개발 모드: 로컬 소스에서 설치 / Dev mode: installing from local source"

    # WHY: 개발 모드에서는 현재 디렉토리의 소스를 빌드하여 설치
    if [ ! -f "package.json" ]; then
      die "package.json을 찾을 수 없습니다. 프로젝트 루트에서 실행하세요."
    fi

    log_info "의존성 설치 중 / Installing dependencies..."
    bun install --frozen-lockfile

    log_info "바이너리 빌드 중 / Building binary..."
    bun build src/index.ts --outfile "dist/${ADEV_BIN_NAME}" --target bun --compile

    install_binary "dist/${ADEV_BIN_NAME}"
  else
    log_step "최신 버전 설치 중 / Installing latest version..."

    # WHY: Bun 글로벌 설치가 가장 간단한 방법
    log_info "bun install -g ${PACKAGE_NAME}"
    bun install -g "${PACKAGE_NAME}"

    if ! command -v "${ADEV_BIN_NAME}" &>/dev/null; then
      # fallback: PATH에 Bun global bin 추가 시도
      export PATH="${HOME}/.bun/bin:${PATH}"
      if ! command -v "${ADEV_BIN_NAME}" &>/dev/null; then
        die "adev 설치 후 PATH 인식 실패. 쉘을 재시작하거나 PATH를 확인하세요."
      fi
    fi

    log_success "adev 설치 완료 (bun global)"
  fi
}

install_binary() {
  local bin_src="$1"
  local install_dir

  # WHY: ~/.local/bin 우선 — sudo 불필요, 사용자 공간 설치
  if [[ ":${PATH}:" == *":${HOME}/.local/bin:"* ]]; then
    install_dir="${HOME}/.local/bin"
  elif [[ ":${PATH}:" == *":${HOME}/bin:"* ]]; then
    install_dir="${HOME}/bin"
  else
    install_dir="${HOME}/.local/bin"
    mkdir -p "$install_dir"
    log_warn "${install_dir}이 PATH에 없습니다. ~/.bashrc 또는 ~/.zshrc에 다음 줄을 추가하세요:"
    log_warn "  export PATH=\"${install_dir}:\$PATH\""
  fi

  mkdir -p "$install_dir"
  cp "$bin_src" "${install_dir}/${ADEV_BIN_NAME}"
  chmod +x "${install_dir}/${ADEV_BIN_NAME}"
  log_success "바이너리 설치됨: ${install_dir}/${ADEV_BIN_NAME}"
}

# ── 글로벌 설정 디렉토리 생성 / Create global config dir ────────

create_global_dir() {
  mkdir -p \
    "${ADEV_GLOBAL_DIR}" \
    "${ADEV_GLOBAL_DIR}/mcp" \
    "${ADEV_GLOBAL_DIR}/skills" \
    "${ADEV_GLOBAL_DIR}/templates" \
    "${ADEV_GLOBAL_DIR}/rag" \
    "${ADEV_GLOBAL_DIR}/data/memory" \
    "${ADEV_GLOBAL_DIR}/data/code-index"

  # 빈 config.json 생성 (없을 때만)
  if [ ! -f "${ADEV_GLOBAL_DIR}/config.json" ]; then
    cat > "${ADEV_GLOBAL_DIR}/config.json" <<'EOF'
{
  "embedding": {
    "default": "xenova-minilm",
    "code": "xenova-minilm",
    "voyageApiKey": null
  },
  "verification": {
    "layer1Model": "opus",
    "adevModel": "opus",
    "opusEscalationOnFailure": true
  },
  "log": {
    "level": "info"
  }
}
EOF
    log_success "글로벌 설정 생성됨: ${ADEV_GLOBAL_DIR}/config.json"
  fi
}

# ── 설치 완료 메시지 / Post-install message ─────────────────────

print_success() {
  local version
  version="$(${ADEV_BIN_NAME} --version 2>/dev/null || echo "unknown")"

  echo ""
  echo -e "${GREEN}${BOLD}✔ adev ${version} 설치 완료!${RESET}"
  echo ""
  echo -e "  시작하기 / Get started:"
  echo -e "    ${CYAN}adev init${RESET}          ← 인증 설정 / Set up authentication"
  echo -e "    ${CYAN}adev start${RESET}         ← 대화 시작 / Start a conversation"
  echo -e "    ${CYAN}adev --help${RESET}        ← 도움말 / Help"
  echo ""
  echo -e "  문서 / Docs: ${CYAN}${REPO_URL}#readme${RESET}"
  echo ""
}

# ── 메인 / Main ─────────────────────────────────────────────────

main() {
  echo ""
  echo -e "${BOLD}adev Installer${RESET}"
  echo "──────────────────────────────────────────"
  echo ""

  local os
  os="$(detect_os)"
  log_info "OS: ${os}"

  log_step "1/3 Bun 런타임 확인 / Checking Bun runtime"
  check_bun

  log_step "2/3 adev 설치 / Installing adev"
  install_adev

  log_step "3/3 글로벌 설정 초기화 / Initializing global config"
  create_global_dir

  print_success
}

main "$@"
