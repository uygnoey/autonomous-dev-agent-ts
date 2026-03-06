#!/usr/bin/env bash
set -e

# install.sh Smoke Test - 핵심 케이스만 빠르게 검증

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALL_SH="$PROJECT_ROOT/install.sh"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  install.sh Smoke Test (핵심 검증)                             ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

ERRORS=0

# 1. 문법 체크
echo "1️⃣ 문법 검증..."
if bash -n "$INSTALL_SH" 2>/dev/null; then
    echo "  ✅ Bash 문법 OK"
else
    echo "  ❌ Bash 문법 에러"
    ((ERRORS++))
fi

if zsh -n "$INSTALL_SH" 2>/dev/null; then
    echo "  ✅ Zsh 문법 OK"
else
    echo "  ❌ Zsh 문법 에러"
    ((ERRORS++))
fi

# 2. POSIX 호환성 체크
echo ""
echo "2️⃣ POSIX 호환성 검증..."

# read -p 사용 금지 (zsh 비호환)
if grep -q "read -p" "$INSTALL_SH"; then
    echo "  ❌ 'read -p' 발견 (zsh 비호환)"
    ((ERRORS++))
else
    echo "  ✅ POSIX 호환 read 사용"
fi

# printf + read 패턴 확인
if grep -q "printf.*read" "$INSTALL_SH"; then
    echo "  ✅ printf + read 패턴 확인"
else
    echo "  ⚠️  printf + read 패턴 없음 (경고)"
fi

# 3. 필수 기능 체크
echo ""
echo "3️⃣ 필수 기능 검증..."

# TTY 체크
if grep -q "TTY_OK" "$INSTALL_SH" && grep -q "/dev/tty" "$INSTALL_SH"; then
    echo "  ✅ TTY 감지 로직 존재"
else
    echo "  ❌ TTY 감지 로직 누락"
    ((ERRORS++))
fi

# PATH 설정
if grep -q "\.local/bin" "$INSTALL_SH" && grep -q "export PATH" "$INSTALL_SH"; then
    echo "  ✅ PATH 설정 로직 존재"
else
    echo "  ❌ PATH 설정 로직 누락"
    ((ERRORS++))
fi

# 인증 방법 선택
if grep -q "ANTHROPIC_API_KEY" "$INSTALL_SH" && grep -q "CLAUDE_CODE_OAUTH_TOKEN" "$INSTALL_SH"; then
    echo "  ✅ 인증 방법 로직 존재"
else
    echo "  ❌ 인증 방법 로직 누락"
    ((ERRORS++))
fi

# claude setup-token 안내
if grep -q "claude setup-token" "$INSTALL_SH"; then
    echo "  ✅ 'claude setup-token' 안내 존재"
else
    echo "  ❌ 'claude setup-token' 안내 누락"
    ((ERRORS++))
fi

# 4. Shell RC 파일 처리
echo ""
echo "4️⃣ Shell RC 파일 처리 검증..."

if grep -q "\.zshrc" "$INSTALL_SH" && grep -q "\.bashrc" "$INSTALL_SH"; then
    echo "  ✅ .zshrc 와 .bashrc 모두 지원"
else
    echo "  ❌ Shell RC 파일 지원 불완전"
    ((ERRORS++))
fi

# zsh 우선순위 체크
if grep -n "\.zshrc" "$INSTALL_SH" | head -1 | grep -q "75"; then
    echo "  ✅ .zshrc 우선 처리"
else
    echo "  ⚠️  .zshrc 우선순위 확인 필요"
fi

# 5. 안전성 체크
echo ""
echo "5️⃣ 안전성 검증..."

# set -e 확인
if head -5 "$INSTALL_SH" | grep -q "set -e"; then
    echo "  ✅ 'set -e' 사용 (에러 시 중단)"
else
    echo "  ⚠️  'set -e' 미사용"
fi

# chmod 600 확인 (.env 보안)
if grep -q "chmod 600" "$INSTALL_SH"; then
    echo "  ✅ .env 파일 권한 설정"
else
    echo "  ❌ .env 파일 권한 미설정"
    ((ERRORS++))
fi

# 6. 실제 다운로드 URL 체크
echo ""
echo "6️⃣ GitHub Release URL 검증..."

if grep -q "github.com.*releases/download" "$INSTALL_SH"; then
    echo "  ✅ GitHub Release URL 존재"
else
    echo "  ❌ GitHub Release URL 누락"
    ((ERRORS++))
fi

# 최종 결과
echo ""
echo "════════════════════════════════════════════════════════════════"
if [ $ERRORS -eq 0 ]; then
    echo "✅ Smoke Test 통과!"
    echo "════════════════════════════════════════════════════════════════"
    exit 0
else
    echo "❌ $ERRORS 개 문제 발견"
    echo "════════════════════════════════════════════════════════════════"
    exit 1
fi
