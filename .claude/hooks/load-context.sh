#!/bin/bash
# SessionStart + PreCompact hook:
# CLAUDE.md + .claude/CLAUDE.md 를 컨텍스트로 주입
# compact 후에도 핵심 지시사항이 유실되지 않도록 보장

PROJECT_DIR="$CLAUDE_PROJECT_DIR"

echo "=== [Hook: load-context] 프로젝트 컨텍스트 로드 ==="

# 1. 루트 CLAUDE.md 먼저 (최우선 지시사항)
if [ -f "$PROJECT_DIR/CLAUDE.md" ]; then
  echo ""
  echo "--- CLAUDE.md ---"
  cat "$PROJECT_DIR/CLAUDE.md"
  echo ""
  echo "--- /CLAUDE.md ---"
fi

# 2. .claude/CLAUDE.md (상세 컨벤션)
if [ -f "$PROJECT_DIR/.claude/CLAUDE.md" ]; then
  echo ""
  echo "--- .claude/CLAUDE.md ---"
  cat "$PROJECT_DIR/.claude/CLAUDE.md"
  echo ""
  echo "--- /.claude/CLAUDE.md ---"
fi

# 3. .claude/ 폴더 구조
echo ""
echo "--- .claude/ 폴더 구조 ---"
find "$PROJECT_DIR/.claude" -type f -not -name "*.sh" 2>/dev/null | while read -r f; do
  echo "  $f"
done
echo "--- /.claude/ 폴더 구조 ---"

# 4. .claude/settings.json (프로젝트 설정)
if [ -f "$PROJECT_DIR/.claude/settings.json" ]; then
  echo ""
  echo "--- .claude/settings.json ---"
  cat "$PROJECT_DIR/.claude/settings.json"
  echo "--- /.claude/settings.json ---"
fi

# 5. .claude/settings.local.json (로컬 설정)
if [ -f "$PROJECT_DIR/.claude/settings.local.json" ]; then
  echo ""
  echo "--- .claude/settings.local.json ---"
  cat "$PROJECT_DIR/.claude/settings.local.json"
  echo "--- /.claude/settings.local.json ---"
fi

# 6. rules 폴더가 있으면 목록 출력
if [ -d "$PROJECT_DIR/.claude/rules" ]; then
  echo ""
  echo "--- .claude/rules/ ---"
  ls -1 "$PROJECT_DIR/.claude/rules/"
  echo "--- /.claude/rules/ ---"
fi

echo ""
echo "=== [Hook: load-context] 완료 ==="

exit 0
