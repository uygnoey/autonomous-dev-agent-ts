#!/usr/bin/env bash
set -e

# adev init 대규모 테스트 (1000회)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  adev init 대규모 테스트 (1000회)                               ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "⚠️  예상 소요 시간: 10-15분"
echo ""

PASSED=0
FAILED=0

for i in {1..1000}; do
    TEST_PROJECT="/tmp/adev-test-$$-$i"

    # adev init 실행
    if "$PROJECT_ROOT/dist/index.js" init "$TEST_PROJECT" >/dev/null 2>&1; then
        # 구조 검증
        if [ -d "$TEST_PROJECT/.adev" ] && \
           [ -d "$TEST_PROJECT/.claude" ] && \
           [ -f "$TEST_PROJECT/.adev/config.json" ] && \
           [ -f "$TEST_PROJECT/.adev/agents/architect.md" ] && \
           [ -f "$TEST_PROJECT/.gitignore" ]; then
            ((PASSED++))
        else
            ((FAILED++))
        fi
    else
        ((FAILED++))
    fi

    # 정리
    rm -rf "$TEST_PROJECT"

    # 진행률
    if [ $((i % 100)) -eq 0 ]; then
        echo "  진행: $i/1000 (통과: $PASSED, 실패: $FAILED)"
    fi
done

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "📊 최종 결과:"
echo "   총 테스트: 1000"
echo "   통과: $PASSED"
echo "   실패: $FAILED"
echo "   성공률: $((PASSED * 100 / 1000))%"
echo "════════════════════════════════════════════════════════════════"

if [ $FAILED -eq 0 ]; then
    exit 0
else
    exit 1
fi
