#!/usr/bin/env bash
set -e

# adev init 후 프로젝트 구조가 스펙 v2.4에 맞는지 검증
# Usage: ./scripts/test-project-structure.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  adev 프로젝트 구조 검증 (스펙 v2.4 기준)                       ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# 테스트 프로젝트 생성
TEST_PROJECT="/tmp/adev-structure-test-$$"
echo "1️⃣ 테스트 프로젝트 생성: $TEST_PROJECT"
mkdir -p "$TEST_PROJECT"

# adev init 실행
echo "2️⃣ adev init 실행..."
cd "$TEST_PROJECT"
"$PROJECT_ROOT/dist/index.js" init "$TEST_PROJECT" >/dev/null 2>&1 || {
    echo "❌ adev init 실패"
    exit 1
}

# 스펙 v2.4에 따른 필수 구조 검증
echo ""
echo "3️⃣ 디렉토리 구조 검증..."
echo ""

ERRORS=0

# .adev/ 구조
check_dir() {
    local path="$1"
    local desc="$2"
    if [ -d "$path" ]; then
        echo "  ✅ $desc"
    else
        echo "  ❌ $desc (없음)"
        ((ERRORS++))
    fi
}

check_file() {
    local path="$1"
    local desc="$2"
    if [ -f "$path" ]; then
        echo "  ✅ $desc"
    else
        echo "  ❌ $desc (없음)"
        ((ERRORS++))
    fi
}

echo "📁 .adev/ 구조:"
check_dir "$TEST_PROJECT/.adev" ".adev/"
check_file "$TEST_PROJECT/.adev/config.json" ".adev/config.json"
check_dir "$TEST_PROJECT/.adev/data" ".adev/data/"
check_dir "$TEST_PROJECT/.adev/data/memory" ".adev/data/memory/"
check_dir "$TEST_PROJECT/.adev/data/code-index" ".adev/data/code-index/"
check_dir "$TEST_PROJECT/.adev/agents" ".adev/agents/"
check_dir "$TEST_PROJECT/.adev/sessions" ".adev/sessions/"
check_dir "$TEST_PROJECT/.adev/mcp" ".adev/mcp/"
check_dir "$TEST_PROJECT/.adev/skills" ".adev/skills/"
check_dir "$TEST_PROJECT/.adev/templates" ".adev/templates/"

echo ""
echo "📁 .adev/agents/ - 7개 에이전트:"
check_file "$TEST_PROJECT/.adev/agents/architect.md" "architect.md"
check_file "$TEST_PROJECT/.adev/agents/qa.md" "qa.md"
check_file "$TEST_PROJECT/.adev/agents/coder.md" "coder.md"
check_file "$TEST_PROJECT/.adev/agents/tester.md" "tester.md"
check_file "$TEST_PROJECT/.adev/agents/qc.md" "qc.md"
check_file "$TEST_PROJECT/.adev/agents/reviewer.md" "reviewer.md"
check_file "$TEST_PROJECT/.adev/agents/documenter.md" "documenter.md"

echo ""
echo "📁 .claude/ 구조 (Claude Code 호환):"
check_dir "$TEST_PROJECT/.claude" ".claude/"
check_dir "$TEST_PROJECT/.claude/agents" ".claude/agents/"
check_dir "$TEST_PROJECT/.claude/skills" ".claude/skills/"
check_dir "$TEST_PROJECT/.claude/mcp" ".claude/mcp/"
check_dir "$TEST_PROJECT/.claude/memory" ".claude/memory/"

echo ""
echo "📄 .gitignore 검증:"
if [ -f "$TEST_PROJECT/.gitignore" ]; then
    if grep -q ".adev/data/" "$TEST_PROJECT/.gitignore"; then
        echo "  ✅ .adev/data/ 포함"
    else
        echo "  ❌ .adev/data/ 누락"
        ((ERRORS++))
    fi
    if grep -q ".claude/memory/" "$TEST_PROJECT/.gitignore"; then
        echo "  ✅ .claude/memory/ 포함"
    else
        echo "  ❌ .claude/memory/ 누락"
        ((ERRORS++))
    fi
else
    echo "  ❌ .gitignore 없음"
    ((ERRORS++))
fi

# ~/.adev/projects.json 검증
echo ""
echo "📄 글로벌 프로젝트 레지스트리:"
if [ -f "$HOME/.adev/projects.json" ]; then
    echo "  ✅ ~/.adev/projects.json 생성됨"
    if grep -q "$TEST_PROJECT" "$HOME/.adev/projects.json"; then
        echo "  ✅ 프로젝트 등록 확인"
    else
        echo "  ❌ 프로젝트 미등록"
        ((ERRORS++))
    fi
else
    echo "  ❌ ~/.adev/projects.json 없음"
    ((ERRORS++))
fi

# 정리
echo ""
echo "4️⃣ 정리..."
rm -rf "$TEST_PROJECT"

# 결과
echo ""
echo "════════════════════════════════════════════════════════════════"
if [ $ERRORS -eq 0 ]; then
    echo "✅ 모든 검증 통과! 스펙 v2.4 준수 확인"
    echo "════════════════════════════════════════════════════════════════"
    exit 0
else
    echo "❌ $ERRORS 개 항목 실패"
    echo "════════════════════════════════════════════════════════════════"
    exit 1
fi
