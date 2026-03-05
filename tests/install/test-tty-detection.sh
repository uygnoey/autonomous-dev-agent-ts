#!/usr/bin/env bash
# install.sh TTY 감지 로직 단위 테스트
# Usage: bash tests/install/test-tty-detection.sh

set -euo pipefail

PASS=0
FAIL=0
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

pass() { echo -e "${GREEN}PASS${NC}: $1"; PASS=$((PASS + 1)); }
fail() { echo -e "${RED}FAIL${NC}: $1"; echo "  expected: $2"; echo "  got:      $3"; FAIL=$((FAIL + 1)); }

assert_contains() {
    local name="$1" expected="$2" actual="$3"
    if echo "$actual" | grep -q "$expected"; then
        pass "$name"
    else
        fail "$name" "$expected" "$actual"
    fi
}

assert_not_contains() {
    local name="$1" unexpected="$2" actual="$3"
    if echo "$actual" | grep -q "$unexpected"; then
        fail "$name" "(not) $unexpected" "$actual"
    else
        pass "$name"
    fi
}

assert_exit_ok() {
    local name="$1"; shift
    local rc=0
    "$@" < /dev/null > /dev/null 2>&1 || rc=$?
    if [ "$rc" -eq 0 ]; then
        pass "$name"
    else
        fail "$name" "exit 0" "exit $rc"
    fi
}

# ── 테스트 대상: TTY 감지 + 인증 분기 로직 ─────────────────────────
# Windows Git Bash 환경 호환: /dev/tty exec 실패 시 TTY_OK=false 유지하도록 보완된 로직
TTY_DETECT='
TTY_OK=false
if [ -t 0 ]; then
    TTY_OK=true
elif [ -r /dev/tty ] && exec < /dev/tty 2>/dev/null; then
    TTY_OK=true
fi
if [ "$TTY_OK" = "false" ]; then
    echo "SKIP: 비대화형 환경 감지"
else
    echo "PROMPT: Choose authentication method"
fi
'

FLAG_DETECT='
TTY_OK=false
if [ -t 0 ]; then
    TTY_OK=true
elif [ -r /dev/tty ] && exec < /dev/tty 2>/dev/null; then
    TTY_OK=true
fi
echo "TTY_OK=$TTY_OK"
'

echo "=== install.sh TTY Detection Tests ==="
echo ""

# Test 1: /dev/null stdin → SKIP 출력
OUT=$(bash -c "$TTY_DETECT" < /dev/null 2>&1)
assert_contains     "비대화형: SKIP 메시지 출력"       "SKIP:"   "$OUT"
assert_not_contains "비대화형: PROMPT 미출력"           "PROMPT:" "$OUT"

# Test 2: 파이프 stdin → TTY_OK=false
OUT=$(echo "" | bash -c "$FLAG_DETECT" 2>&1)
assert_contains "파이프 stdin → TTY_OK=false" "TTY_OK=false" "$OUT"

# Test 3: 비대화형에서 exit 0 (스크립트 hang 없음)
assert_exit_ok "비대화형 환경에서 exit 0" bash -c "$TTY_DETECT"

# Test 4: TTY_OK=false 강제 → auth 섹션 스킵 확인
FORCED_FALSE='
TTY_OK=false
if [ "$TTY_OK" = "false" ]; then
    echo "SKIP: 비대화형 환경 감지"
else
    echo "PROMPT: Choose authentication method"
fi
'
OUT=$(bash -c "$FORCED_FALSE")
assert_contains     "TTY_OK=false 강제 → SKIP"   "SKIP:"   "$OUT"
assert_not_contains "TTY_OK=false 강제 → 프롬프트 없음" "PROMPT:" "$OUT"

# Test 5: TTY_OK=true 강제 → 프롬프트 출력 확인
FORCED_TRUE='
TTY_OK=true
if [ "$TTY_OK" = "false" ]; then
    echo "SKIP: 비대화형 환경 감지"
else
    echo "PROMPT: Choose authentication method"
fi
'
OUT=$(bash -c "$FORCED_TRUE")
assert_contains     "TTY_OK=true 강제 → PROMPT"  "PROMPT:" "$OUT"
assert_not_contains "TTY_OK=true 강제 → SKIP 없음" "SKIP:"   "$OUT"

# ── 결과 ────────────────────────────────────────────────────────────
echo ""
echo "=== Results: ${PASS} passed, ${FAIL} failed ==="
if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
