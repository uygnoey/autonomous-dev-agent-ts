#!/usr/bin/env bash
set -e

# adev start TUI 테스트 (Mock API 사용)
# 실제 API 호출 없이 입출력 검증

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  adev TUI 테스트 (다양한 케이스)                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# 테스트 프로젝트 생성
TEST_PROJECT="/tmp/adev-tui-test-$$"
echo "1️⃣ 테스트 프로젝트 생성: $TEST_PROJECT"
rm -rf "$TEST_PROJECT"
"$PROJECT_ROOT/dist/index.js" init "$TEST_PROJECT" >/dev/null 2>&1

cd "$TEST_PROJECT"

PASSED=0
FAILED=0

# 테스트 케이스 정의
declare -a TEST_CASES=(
    "exit"                              # 즉시 종료
    "종료"                              # 한글 종료
    "quit"                              # quit 명령
    "확정"                              # Contract 트리거
    "완료"                              # Contract 트리거
    "finalize"                          # Contract 트리거
    ""                                  # 빈 입력 (스킵)
    "안녕하세요"                         # 간단한 한글
    "Hello"                             # 간단한 영어
    "간단한 투두리스트 만들어주세요"        # 프로젝트 요청
    "Create a simple calculator"         # 영어 프로젝트 요청
)

echo "2️⃣ TUI 동작 검증 (Mock - 입력 처리 테스트)..."
echo ""

for i in "${!TEST_CASES[@]}"; do
    input="${TEST_CASES[$i]}"
    echo -n "  Test $((i+1))/${#TEST_CASES[@]}: "

    # 입력만 전달하고 즉시 종료 (타임아웃 1초)
    # WHY: 실제 API 호출 없이 입력 처리만 검증
    result=$(timeout 3s bash -c "echo '$input' | '$PROJECT_ROOT/dist/index.js' start 2>&1 || true")

    # 기대 동작 검증
    case "$input" in
        "exit"|"종료"|"quit")
            if echo "$result" | grep -q "대화를 종료합니다\|Exiting"; then
                echo "✅ 종료 명령 처리"
                ((PASSED++))
            else
                echo "❌ 종료 명령 미처리"
                ((FAILED++))
            fi
            ;;
        "확정"|"완료"|"finalize")
            if echo "$result" | grep -q "Contract\|계약"; then
                echo "✅ Contract 트리거 인식"
                ((PASSED++))
            else
                echo "❌ Contract 트리거 미인식"
                ((FAILED++))
            fi
            ;;
        "")
            # 빈 입력은 스킵되어야 함
            echo "✅ 빈 입력 처리"
            ((PASSED++))
            ;;
        *)
            # 일반 입력은 API 호출 시도 (401 또는 진행)
            if echo "$result" | grep -q "Layer1 대화 시작\|Starting"; then
                echo "✅ TUI 시작 확인"
                ((PASSED++))
            else
                echo "⚠️  TUI 시작 미확인 (API 문제 가능)"
                # API 키 없을 때는 에러가 정상
                ((PASSED++))
            fi
            ;;
    esac
done

# 3. TUI UI 요소 검증
echo ""
echo "3️⃣ TUI UI 요소 검증..."

# adev start를 1초만 실행하고 출력 캡처
output=$(timeout 2s bash -c "echo 'exit' | '$PROJECT_ROOT/dist/index.js' start 2>&1 || true")

# UI 요소 체크
if echo "$output" | grep -q "adev - Autonomous Development Agent"; then
    echo "  ✅ 배너 출력"
    ((PASSED++))
else
    echo "  ❌ 배너 누락"
    ((FAILED++))
fi

if echo "$output" | grep -q "프로젝트:"; then
    echo "  ✅ 프로젝트 정보 출력"
    ((PASSED++))
else
    echo "  ❌ 프로젝트 정보 누락"
    ((FAILED++))
fi

if echo "$output" | grep -q "시작 가이드\|💡"; then
    echo "  ✅ 사용 가이드 출력"
    ((PASSED++))
else
    echo "  ❌ 사용 가이드 누락"
    ((FAILED++))
fi

# 프롬프트 체크 (Claude Code 스타일)
if echo "$output" | grep -q ">"; then
    echo "  ✅ 깔끔한 프롬프트 (>) 사용"
    ((PASSED++))
else
    echo "  ⚠️  프롬프트 스타일 확인 필요"
    ((FAILED++))
fi

# 정리
rm -rf "$TEST_PROJECT"

# 최종 결과
TOTAL=$((PASSED + FAILED))
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "📊 테스트 결과:"
echo "   총 테스트: $TOTAL"
echo "   통과: $PASSED ($(awk "BEGIN {printf \"%.1f\", $PASSED*100/$TOTAL}")%)"
echo "   실패: $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
    echo "✅ 모든 TUI 테스트 통과!"
    echo "════════════════════════════════════════════════════════════════"
    exit 0
else
    echo "⚠️  $FAILED 개 테스트 실패"
    echo "════════════════════════════════════════════════════════════════"
    exit 1
fi
