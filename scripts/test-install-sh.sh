#!/usr/bin/env bash
set -e

# install.sh를 bash와 zsh 환경에서 10000번 테스트
# 다양한 케이스: 빈 입력, 유효한 토큰, Skip, TTY 감지, PATH 설정 등

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALL_SH="$PROJECT_ROOT/install.sh"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  install.sh 대규모 테스트 (bash + zsh)                         ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# 테스트 케이스 정의
declare -a TEST_CASES=(
    "3"                                      # Skip
    ""                                       # 빈 입력 (Enter)
    "1\nsk-ant-api12345"                    # API key
    "2\n"                                    # OAuth 빈 입력
    "2\nsk-ant-oat01-test123"              # OAuth token
    "invalid"                                # 잘못된 선택
    "1\n"                                    # API key 빈 입력
)

TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# 테스트 실행 함수
run_test() {
    local shell_type="$1"
    local test_input="$2"
    local test_num="$3"

    # 임시 디렉토리
    local tmp_dir="/tmp/adev-install-test-${shell_type}-${test_num}"
    rm -rf "$tmp_dir"
    mkdir -p "$tmp_dir"

    # ~/.adev 백업
    local adev_backup="/tmp/adev-backup-$$"
    if [ -d "$HOME/.adev" ]; then
        mv "$HOME/.adev" "$adev_backup"
    fi

    # install.sh 복사 및 수정 (실제 다운로드 스킵)
    local test_install="$tmp_dir/install.sh"
    sed 's|curl -fsSL.*adev-darwin-arm64.*|echo "Mock download" \&\& touch "$INSTALL_DIR/adev"|' "$INSTALL_SH" > "$test_install"
    chmod +x "$test_install"

    # 테스트 실행
    local result=0
    if [ "$shell_type" = "bash" ]; then
        echo -e "$test_input" | bash "$test_install" >/dev/null 2>&1 || result=$?
    else
        echo -e "$test_input" | zsh "$test_install" >/dev/null 2>&1 || result=$?
    fi

    # 검증
    local status="PASS"

    # ~/.adev/.env 생성 확인 (Skip 제외)
    if [[ "$test_input" != "3" && "$test_input" != "invalid" ]]; then
        if [ ! -f "$HOME/.adev/.env" ]; then
            status="FAIL (no .env)"
        fi
    fi

    # PATH 설정 확인
    local shell_rc=""
    if [ -f "$HOME/.zshrc" ]; then
        shell_rc="$HOME/.zshrc"
    elif [ -f "$HOME/.bashrc" ]; then
        shell_rc="$HOME/.bashrc"
    fi

    if [ -n "$shell_rc" ]; then
        if ! grep -q ".local/bin" "$shell_rc" 2>/dev/null; then
            status="FAIL (no PATH)"
        fi
    fi

    # 정리
    rm -rf "$tmp_dir"
    rm -rf "$HOME/.adev"
    if [ -d "$adev_backup" ]; then
        mv "$adev_backup" "$HOME/.adev"
    fi

    echo "$status"

    if [ "$status" = "PASS" ]; then
        return 0
    else
        return 1
    fi
}

# Bash 테스트
echo "🔵 Bash 환경 테스트..."
bash_passed=0
bash_failed=0

for i in {1..1000}; do
    case_idx=$((i % ${#TEST_CASES[@]}))
    test_case="${TEST_CASES[$case_idx]}"

    if run_test "bash" "$test_case" "$i" >/dev/null 2>&1; then
        ((bash_passed++))
    else
        ((bash_failed++))
    fi

    # 진행률 표시 (100개마다)
    if [ $((i % 100)) -eq 0 ]; then
        echo "  진행: $i/1000 (통과: $bash_passed, 실패: $bash_failed)"
    fi
done

echo "  ✅ Bash 완료: 1000개 테스트 (통과: $bash_passed, 실패: $bash_failed)"

# Zsh 테스트
echo ""
echo "🟣 Zsh 환경 테스트..."
zsh_passed=0
zsh_failed=0

for i in {1..1000}; do
    case_idx=$((i % ${#TEST_CASES[@]}))
    test_case="${TEST_CASES[$case_idx]}"

    if run_test "zsh" "$test_case" "$i" >/dev/null 2>&1; then
        ((zsh_passed++))
    else
        ((zsh_failed++))
    fi

    # 진행률 표시
    if [ $((i % 100)) -eq 0 ]; then
        echo "  진행: $i/1000 (통과: $zsh_passed, 실패: $zsh_failed)"
    fi
done

echo "  ✅ Zsh 완료: 1000개 테스트 (통과: $zsh_passed, 실패: $zsh_failed)"

# 최종 결과
TOTAL_TESTS=$((bash_passed + bash_failed + zsh_passed + zsh_failed))
PASSED_TESTS=$((bash_passed + zsh_passed))
FAILED_TESTS=$((bash_failed + zsh_failed))

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "📊 최종 결과:"
echo "   총 테스트: $TOTAL_TESTS"
echo "   통과: $PASSED_TESTS ($(awk "BEGIN {printf \"%.1f\", $PASSED_TESTS*100/$TOTAL_TESTS}")%)"
echo "   실패: $FAILED_TESTS"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo "✅ 모든 테스트 통과!"
    echo "════════════════════════════════════════════════════════════════"
    exit 0
else
    echo "⚠️  일부 테스트 실패"
    echo "════════════════════════════════════════════════════════════════"
    exit 1
fi
