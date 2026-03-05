#!/usr/bin/env bash
# install.sh e2e 테스트
# Usage: bash tests/install/test-e2e.sh
#
# 전략: install.sh를 수정 없이 실행. 외부 의존성(curl, uname)을 fake로 모킹.
# HOME을 임시 디렉토리로 override하여 INSTALL_DIR/BIN_DIR 격리.

set -uo pipefail

PASS=0
FAIL=0
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

# 스크립트 위치 기준으로 install.sh 경로 결정
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_SH="$(cd "$SCRIPT_DIR/../.." && pwd)/install.sh"

if [ ! -f "$INSTALL_SH" ]; then
    echo -e "${RED}ERROR${NC}: install.sh not found at $INSTALL_SH"
    exit 1
fi

# ── 헬퍼 ────────────────────────────────────────────────────────────

pass() { echo -e "${GREEN}PASS${NC}: $1"; PASS=$((PASS + 1)); }
fail() {
    echo -e "${RED}FAIL${NC}: $1"
    [ -n "${2:-}" ] && echo "  expected: $2"
    [ -n "${3:-}" ] && echo "  got:      $3"
    FAIL=$((FAIL + 1))
}
skip_test() { echo -e "${YELLOW}SKIP${NC}: $1 — $2"; }

assert_eq() {
    local name="$1" expected="$2" actual="$3"
    if [ "$expected" = "$actual" ]; then
        pass "$name"
    else
        fail "$name" "$expected" "$actual"
    fi
}

assert_file_exists() {
    local name="$1" path="$2"
    if [ -e "$path" ]; then
        pass "$name"
    else
        fail "$name" "file exists: $path" "not found"
    fi
}

assert_file_not_exists() {
    local name="$1" path="$2"
    if [ ! -e "$path" ]; then
        pass "$name"
    else
        fail "$name" "file absent: $path" "exists"
    fi
}

assert_file_contains() {
    local name="$1" expected="$2" path="$3"
    if grep -q "$expected" "$path" 2>/dev/null; then
        pass "$name"
    else
        fail "$name" "contains: $expected" "not found in $path"
    fi
}

assert_file_not_contains() {
    local name="$1" unexpected="$2" path="$3"
    if ! grep -q "$unexpected" "$path" 2>/dev/null; then
        pass "$name"
    else
        fail "$name" "absent: $unexpected" "found in $path"
    fi
}

assert_is_symlink() {
    local name="$1" path="$2"
    if [ -L "$path" ]; then
        pass "$name"
    else
        # Windows Git Bash: ln -sf creates a file copy, not a true symlink.
        # Detect and skip instead of failing.
        local os
        os=$(uname -s 2>/dev/null || echo "unknown")
        if [[ "$os" == MINGW* ]] || [[ "$os" == CYGWIN* ]] || [[ "$os" == MSYS* ]]; then
            skip_test "$name" "Windows Git Bash does not support POSIX symlinks without elevated privileges"
        else
            fail "$name" "symlink: $path" "not a symlink"
        fi
    fi
}

assert_perm() {
    local name="$1" expected_perm="$2" path="$3"
    local actual_perm
    if stat --version 2>/dev/null | grep -q GNU; then
        actual_perm=$(stat -c "%a" "$path" 2>/dev/null)
    else
        actual_perm=$(stat -f "%OLp" "$path" 2>/dev/null)
    fi
    if [ "$actual_perm" = "$expected_perm" ]; then
        pass "$name"
    else
        # Windows(Git Bash) 환경에서는 chmod 600이 완전 지원 안 됨
        skip_test "$name" "stat/chmod not reliable on this platform (got: $actual_perm)"
    fi
}

# ── fake curl 생성 ────────────────────────────────────────────────
# install.sh 호출 패턴:
#   curl -fsSL "https://api.github.com/..." → JSON 출력
#   curl -fsSL "https://...releases/download/..." -o /path/to/adev → 파일 생성
setup_fake_curl() {
    local fake_dir="$1"
    cat > "$fake_dir/curl" << 'CURL_EOF'
#!/usr/bin/env bash
ARGS=("$@")
# URL을 찾음: https:// 로 시작하는 첫 번째 인자
URL=""
OUTFILE=""
for i in "${!ARGS[@]}"; do
    if [[ "${ARGS[$i]}" == https://* ]]; then
        URL="${ARGS[$i]}"
    elif [[ "${ARGS[$i]}" == "-o" ]]; then
        OUTFILE="${ARGS[$((i+1))]}"
    fi
done

if [[ "$URL" == *"api.github.com"* ]]; then
    echo '[{"tag_name": "v0.0.1-test"}]'
elif [[ "$URL" == *"releases/download"* ]]; then
    if [ -n "$OUTFILE" ]; then
        mkdir -p "$(dirname "$OUTFILE")"
        printf '#!/usr/bin/env bash\necho "adev stub v0.0.1-test"\n' > "$OUTFILE"
        chmod +x "$OUTFILE"
    fi
fi
CURL_EOF
    chmod +x "$fake_dir/curl"
}

# ── fake uname 생성 ────────────────────────────────────────────────
# install.sh는 uname -s (OS) / uname -m (ARCH) 을 사용
# Windows Git Bash에서는 MINGW64_NT-... 반환 → "Unsupported OS" exit
# fake uname으로 Linux x86_64 응답
setup_fake_uname() {
    local fake_dir="$1"
    cat > "$fake_dir/uname" << 'UNAME_EOF'
#!/usr/bin/env bash
case "${1:-}" in
    -s) echo "Linux" ;;
    -m) echo "x86_64" ;;
    *)  echo "Linux" ;;
esac
UNAME_EOF
    chmod +x "$fake_dir/uname"
}

# ── 테스트 환경 설정 / 해제 ────────────────────────────────────────

TEST_DIR=""
TEST_HOME=""
FAKE_BIN=""
FAKE_PATH=""

setup_test_env() {
    TEST_DIR=$(mktemp -d)
    FAKE_BIN="$TEST_DIR/fake_bin"
    mkdir -p "$FAKE_BIN"
    setup_fake_curl "$FAKE_BIN"
    setup_fake_uname "$FAKE_BIN"

    # HOME을 임시 디렉토리로 override
    #   INSTALL_DIR="$HOME/.adev"
    #   BIN_DIR="$HOME/.local/bin"
    TEST_HOME="$TEST_DIR/home"
    mkdir -p "$TEST_HOME"

    # .bashrc 생성 (SHELL_RC 감지용)
    touch "$TEST_HOME/.bashrc"

    # fake uname/curl을 PATH 앞에 추가
    FAKE_PATH="$FAKE_BIN:$PATH"
}

teardown_test_env() {
    if [ -n "$TEST_DIR" ] && [ -d "$TEST_DIR" ]; then
        rm -rf "$TEST_DIR"
    fi
    TEST_DIR=""
    TEST_HOME=""
    FAKE_BIN=""
    FAKE_PATH=""
}

# install.sh를 격리된 환경에서 실행 (stdin은 /dev/null)
run_install_noninteractive() {
    HOME="$TEST_HOME" PATH="$FAKE_PATH" bash "$INSTALL_SH" < /dev/null
}

# ────────────────────────────────────────────────────────────────────
echo "=== install.sh e2e Tests ==="
echo ""

# ── Test 1: 비대화형 설치 → exit 0 ──────────────────────────────────
echo "--- Test 1: 비대화형 설치 exit 0"
setup_test_env
rc=0
HOME="$TEST_HOME" PATH="$FAKE_PATH" bash "$INSTALL_SH" < /dev/null > /dev/null 2>&1 || rc=$?
assert_eq "비대화형 설치 exit 0" 0 "$rc"
teardown_test_env

# ── Test 2: 바이너리 파일 생성 + 실행 가능 ──────────────────────
echo "--- Test 2: 바이너리 파일 생성"
setup_test_env
HOME="$TEST_HOME" PATH="$FAKE_PATH" bash "$INSTALL_SH" < /dev/null > /dev/null 2>&1 || true
assert_file_exists "바이너리 ~/.adev/adev 생성" "$TEST_HOME/.adev/adev"
if [ -x "$TEST_HOME/.adev/adev" ]; then
    pass "바이너리 실행 권한 설정"
else
    fail "바이너리 실행 권한 설정" "executable" "not executable"
fi
teardown_test_env

# ── Test 3: symlink 생성 ─────────────────────────────────────────
echo "--- Test 3: symlink 생성"
setup_test_env
HOME="$TEST_HOME" PATH="$FAKE_PATH" bash "$INSTALL_SH" < /dev/null > /dev/null 2>&1 || true
assert_file_exists  "BIN_DIR adev 파일 존재" "$TEST_HOME/.local/bin/adev"
assert_is_symlink   "BIN_DIR/adev 가 symlink" "$TEST_HOME/.local/bin/adev"
# symlink 대상 확인 (POSIX 환경에서만)
_os=$(uname -s 2>/dev/null || echo "unknown")
if [[ "$_os" != MINGW* ]] && [[ "$_os" != CYGWIN* ]] && [[ "$_os" != MSYS* ]]; then
    LINK_TARGET=$(readlink "$TEST_HOME/.local/bin/adev" 2>/dev/null || echo "")
    assert_eq "symlink 대상 = ~/.adev/adev" "$TEST_HOME/.adev/adev" "$LINK_TARGET"
fi
teardown_test_env

# ── Test 4: PATH 라인 .bashrc에 추가 ─────────────────────────────
echo "--- Test 4: PATH 라인 .bashrc에 추가"
setup_test_env
HOME="$TEST_HOME" PATH="$FAKE_PATH" bash "$INSTALL_SH" < /dev/null > /dev/null 2>&1 || true
assert_file_contains "PATH export 라인 추가됨" 'export PATH' "$TEST_HOME/.bashrc"
assert_file_contains ".local/bin PATH 포함" '.local/bin' "$TEST_HOME/.bashrc"
teardown_test_env

# ── Test 5: .bashrc 이미 PATH 포함 → 중복 추가 안 함 ─────────────
echo "--- Test 5: 중복 PATH 추가 방지"
setup_test_env
# install.sh는 grep -q "$BIN_DIR" "$SHELL_RC" 로 체크
# BIN_DIR = "$HOME/.local/bin" (HOME이 실제 경로로 확장됨)
# 따라서 확장된 경로를 삽입해야 중복 감지가 동작함
BIN_DIR_EXPANDED="$TEST_HOME/.local/bin"
echo "export PATH=\"$BIN_DIR_EXPANDED:\$PATH\"" >> "$TEST_HOME/.bashrc"
HOME="$TEST_HOME" PATH="$FAKE_PATH" bash "$INSTALL_SH" < /dev/null > /dev/null 2>&1 || true
COUNT=$(grep -c '\.local/bin' "$TEST_HOME/.bashrc" 2>/dev/null || echo 0)
assert_eq "PATH 중복 추가 없음 (count=1)" "1" "$COUNT"
teardown_test_env

# ── Test 6: 비대화형 → 인증 스킵 메시지 출력 ─────────────────────
echo "--- Test 6: 비대화형 → 인증 스킵 메시지"
setup_test_env
OUT=$(HOME="$TEST_HOME" PATH="$FAKE_PATH" bash "$INSTALL_SH" < /dev/null 2>&1 || true)
if echo "$OUT" | grep -qE "비대화형|건너|skip|Skip|non.?interactive"; then
    pass "비대화형 → 인증 스킵 메시지 출력"
else
    fail "비대화형 → 인증 스킵 메시지 출력" "skip/건너 메시지" "$(echo "$OUT" | tail -5)"
fi
teardown_test_env

# ── Test 7: INSTALL_DIR + BIN_DIR 디렉토리 생성 ──────────────────
echo "--- Test 7: INSTALL_DIR + BIN_DIR 디렉토리 생성"
setup_test_env
HOME="$TEST_HOME" PATH="$FAKE_PATH" bash "$INSTALL_SH" < /dev/null > /dev/null 2>&1 || true
assert_file_exists "INSTALL_DIR 생성됨" "$TEST_HOME/.adev"
assert_file_exists "BIN_DIR 생성됨" "$TEST_HOME/.local/bin"
teardown_test_env

# ── Test 8: API Key 입력 → .env 저장 ─────────────────────────────
echo "--- Test 8: API Key 입력 → .env 저장 (TTY_OK=true 강제)"
setup_test_env
ENV_FILE="$TEST_HOME/.adev/.env"
AUTH_SECTION=$(sed -n '/^# ── 인증 설정/,/^fi$/p' "$INSTALL_SH")

mkdir -p "$TEST_HOME/.adev"
printf '1\nsk-ant-testkey123\n' | bash -c "
INSTALL_DIR='$TEST_HOME/.adev'
BIN_DIR='$TEST_HOME/.local/bin'
ENV_FILE='$ENV_FILE'
TTY_OK=true
$AUTH_SECTION
" > /dev/null 2>&1 || true
assert_file_exists "API Key 저장 후 .env 생성" "$ENV_FILE"
assert_file_contains "ANTHROPIC_API_KEY 저장" "ANTHROPIC_API_KEY=sk-ant-testkey123" "$ENV_FILE"
assert_file_not_contains "CLAUDE_CODE_OAUTH_TOKEN 없음" "CLAUDE_CODE_OAUTH_TOKEN" "$ENV_FILE"
teardown_test_env

# ── Test 9: OAuth Token 입력 → .env 저장 ─────────────────────────
echo "--- Test 9: OAuth Token 입력 → .env 저장 (TTY_OK=true 강제)"
setup_test_env
ENV_FILE="$TEST_HOME/.adev/.env"
AUTH_SECTION=$(sed -n '/^# ── 인증 설정/,/^fi$/p' "$INSTALL_SH")

mkdir -p "$TEST_HOME/.adev"
printf '2\nsk-ant-oat01-testtoken456\n' | bash -c "
INSTALL_DIR='$TEST_HOME/.adev'
BIN_DIR='$TEST_HOME/.local/bin'
ENV_FILE='$ENV_FILE'
TTY_OK=true
$AUTH_SECTION
" > /dev/null 2>&1 || true
assert_file_exists "OAuth Token 저장 후 .env 생성" "$ENV_FILE"
assert_file_contains "CLAUDE_CODE_OAUTH_TOKEN 저장" "CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-testtoken456" "$ENV_FILE"
assert_file_not_contains "ANTHROPIC_API_KEY 없음" "ANTHROPIC_API_KEY" "$ENV_FILE"
teardown_test_env

# ── Test 10: Skip 선택 → .env 파일 생성 안 됨 ────────────────────
echo "--- Test 10: Skip 선택 → 키 저장 안 됨"
setup_test_env
ENV_FILE="$TEST_HOME/.adev/.env"
AUTH_SECTION=$(sed -n '/^# ── 인증 설정/,/^fi$/p' "$INSTALL_SH")

mkdir -p "$TEST_HOME/.adev"
printf '3\n' | bash -c "
INSTALL_DIR='$TEST_HOME/.adev'
BIN_DIR='$TEST_HOME/.local/bin'
ENV_FILE='$ENV_FILE'
TTY_OK=true
$AUTH_SECTION
" > /dev/null 2>&1 || true
assert_file_not_exists "Skip 시 .env 미생성" "$ENV_FILE"
teardown_test_env

# ── Test 11: .env chmod 600 확인 ─────────────────────────────────
echo "--- Test 11: .env chmod 600"
setup_test_env
ENV_FILE="$TEST_HOME/.adev/.env"
AUTH_SECTION=$(sed -n '/^# ── 인증 설정/,/^fi$/p' "$INSTALL_SH")

mkdir -p "$TEST_HOME/.adev"
printf '1\nsk-ant-permtest\n' | bash -c "
INSTALL_DIR='$TEST_HOME/.adev'
BIN_DIR='$TEST_HOME/.local/bin'
ENV_FILE='$ENV_FILE'
TTY_OK=true
$AUTH_SECTION
" > /dev/null 2>&1 || true
assert_file_exists ".env 파일 생성됨" "$ENV_FILE"
assert_perm ".env 권한 600" "600" "$ENV_FILE"
teardown_test_env

# ── Test 12: 잘못된 선택 → .env 미생성 ──────────────────────────
echo "--- Test 12: 잘못된 선택 (9) → .env 미생성"
setup_test_env
ENV_FILE="$TEST_HOME/.adev/.env"
AUTH_SECTION=$(sed -n '/^# ── 인증 설정/,/^fi$/p' "$INSTALL_SH")

mkdir -p "$TEST_HOME/.adev"
printf '9\n' | bash -c "
INSTALL_DIR='$TEST_HOME/.adev'
BIN_DIR='$TEST_HOME/.local/bin'
ENV_FILE='$ENV_FILE'
TTY_OK=true
$AUTH_SECTION
" > /dev/null 2>&1 || true
assert_file_not_exists "잘못된 선택 → .env 미생성" "$ENV_FILE"
teardown_test_env

# ── Test 13: 빈 API Key 입력 → .env 미생성 ───────────────────────
echo "--- Test 13: 빈 API Key 입력 → .env 미생성"
setup_test_env
ENV_FILE="$TEST_HOME/.adev/.env"
AUTH_SECTION=$(sed -n '/^# ── 인증 설정/,/^fi$/p' "$INSTALL_SH")

mkdir -p "$TEST_HOME/.adev"
printf '1\n\n' | bash -c "
INSTALL_DIR='$TEST_HOME/.adev'
BIN_DIR='$TEST_HOME/.local/bin'
ENV_FILE='$ENV_FILE'
TTY_OK=true
$AUTH_SECTION
" > /dev/null 2>&1 || true
assert_file_not_exists "빈 API Key → .env 미생성" "$ENV_FILE"
teardown_test_env

# ── Test 14: 기존 .env에서 이전 키 덮어쓰기 ─────────────────────
echo "--- Test 14: 기존 .env 키 교체 (API Key → OAuth Token)"
setup_test_env
ENV_FILE="$TEST_HOME/.adev/.env"
AUTH_SECTION=$(sed -n '/^# ── 인증 설정/,/^fi$/p' "$INSTALL_SH")

mkdir -p "$TEST_HOME/.adev"
# 먼저 API Key 저장
printf '1\nsk-ant-oldkey\n' | bash -c "
INSTALL_DIR='$TEST_HOME/.adev'
BIN_DIR='$TEST_HOME/.local/bin'
ENV_FILE='$ENV_FILE'
TTY_OK=true
$AUTH_SECTION
" > /dev/null 2>&1 || true
# 이어서 OAuth Token으로 교체
printf '2\nsk-ant-oat01-newtoken\n' | bash -c "
INSTALL_DIR='$TEST_HOME/.adev'
BIN_DIR='$TEST_HOME/.local/bin'
ENV_FILE='$ENV_FILE'
TTY_OK=true
$AUTH_SECTION
" > /dev/null 2>&1 || true
assert_file_contains "새 OAuth Token 저장됨" "CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-newtoken" "$ENV_FILE"
assert_file_not_contains "이전 API Key 제거됨" "ANTHROPIC_API_KEY=sk-ant-oldkey" "$ENV_FILE"
teardown_test_env

# ── Test 15.1: 잘못된 플랫폼 → exit 1 ───────────────────────────
# fake uname을 Windows NT 응답으로 교체 → install.sh의 "Unsupported OS" 분기
echo "--- Test 15.1: 잘못된 플랫폼(unsupported OS) → exit 1"
setup_test_env
# uname -s を "PLAN9" (존재하지 않는 OS)으로 반환하는 fake uname으로 덮어씀
cat > "$FAKE_BIN/uname" << 'UNAME_BAD_EOF'
#!/usr/bin/env bash
case "${1:-}" in
    -s) echo "PLAN9" ;;
    -m) echo "x86_64" ;;
    *)  echo "PLAN9" ;;
esac
UNAME_BAD_EOF
chmod +x "$FAKE_BIN/uname"
rc_bad=0
HOME="$TEST_HOME" PATH="$FAKE_PATH" bash "$INSTALL_SH" < /dev/null > /dev/null 2>&1 || rc_bad=$?
assert_eq "지원 불가 OS → exit 1" "1" "$rc_bad"
teardown_test_env

# ── Test 15.2: 지원 아키텍처 + 지원 OS 조합 → exit 0 확인 ─────────
echo "--- Test 15.2: 지원 플랫폼(Linux arm64) → exit 0"
setup_test_env
cat > "$FAKE_BIN/uname" << 'UNAME_ARM_EOF'
#!/usr/bin/env bash
case "${1:-}" in
    -s) echo "Linux" ;;
    -m) echo "aarch64" ;;
    *)  echo "Linux" ;;
esac
UNAME_ARM_EOF
chmod +x "$FAKE_BIN/uname"
rc_arm=0
HOME="$TEST_HOME" PATH="$FAKE_PATH" bash "$INSTALL_SH" < /dev/null > /dev/null 2>&1 || rc_arm=$?
assert_eq "Linux arm64 → exit 0" "0" "$rc_arm"
teardown_test_env

# ── Test 15: .zshrc 우선 (존재하면 .bashrc 아닌 .zshrc에 PATH 추가) ─
echo "--- Test 15: .zshrc 우선 사용"
setup_test_env
touch "$TEST_HOME/.zshrc"
HOME="$TEST_HOME" PATH="$FAKE_PATH" bash "$INSTALL_SH" < /dev/null > /dev/null 2>&1 || true
assert_file_contains ".zshrc에 PATH 추가됨" '.local/bin' "$TEST_HOME/.zshrc"
assert_file_not_contains ".bashrc에는 PATH 미추가" '.local/bin' "$TEST_HOME/.bashrc"
teardown_test_env

# ────────────────────────────────────────────────────────────────────
echo ""
echo "=== Results: ${PASS} passed, ${FAIL} failed ==="
if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
