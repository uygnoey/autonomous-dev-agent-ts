#!/usr/bin/env bash
set -e

# adev start TUI 대규모 테스트 (8000회)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  adev TUI 대규모 테스트 (8000회)                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "⚠️  예상 소요 시간: 20-30분"
echo ""

# 테스트 프로젝트 생성 (1회만)
TEST_PROJECT="/tmp/adev-tui-large-$$"
"$PROJECT_ROOT/dist/index.js" init "$TEST_PROJECT" >/dev/null 2>&1
cd "$TEST_PROJECT"

PASSED=0
FAILED=0

# 다양한 입력 케이스
declare -a INPUTS=(
    "exit"
    "종료"
    "quit"
    "확정"
    "완료"
    "finalize"
    "confirm"
    ""
    "안녕하세요"
    "Hello"
    "간단한 투두리스트"
    "Create a calculator"
    "API 만들어주세요"
    "Build a web app"
    "테스트 코드 작성"
    "Write unit tests"
    "버그 수정"
    "Fix the bug"
    "성능 최적화"
    "Optimize performance"
)

for i in {1..8000}; do
    input_idx=$(( (i - 1) % ${#INPUTS[@]} ))
    input="${INPUTS[$input_idx]}"

    # TUI 실행 (타임아웃 2초)
    result=$(timeout 2s bash -c "echo '$input' | '$PROJECT_ROOT/dist/index.js' start 2>&1 || true")

    # 기대 동작 검증
    case "$input" in
        "exit"|"종료"|"quit")
            if echo "$result" | grep -q "종료\|Exiting"; then
                ((PASSED++))
            else
                ((FAILED++))
            fi
            ;;
        "확정"|"완료"|"finalize"|"confirm")
            if echo "$result" | grep -q "Contract"; then
                ((PASSED++))
            else
                ((FAILED++))
            fi
            ;;
        *)
            # TUI 시작 확인
            if echo "$result" | grep -q "adev\|Layer1"; then
                ((PASSED++))
            else
                ((FAILED++))
            fi
            ;;
    esac

    # 진행률
    if [ $((i % 1000)) -eq 0 ]; then
        echo "  진행: $i/8000 (통과: $PASSED, 실패: $FAILED, 성공률: $((PASSED * 100 / i))%)"
    fi
done

# 정리
cd /
rm -rf "$TEST_PROJECT"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "📊 최종 결과:"
echo "   총 테스트: 8000"
echo "   통과: $PASSED"
echo "   실패: $FAILED"
echo "   성공률: $((PASSED * 100 / 8000))%"
echo "════════════════════════════════════════════════════════════════"

if [ $FAILED -lt 100 ]; then  # 99% 이상 성공
    exit 0
else
    exit 1
fi
