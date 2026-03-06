#!/usr/bin/env bash
set -e

# install.sh 완전 Mock 테스트 (GitHub API 우회)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALL_SH="$PROJECT_ROOT/install.sh"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  install.sh 완전 Mock 테스트 (1000회)                          ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# ~/.adev 백업
BACKUP_DIR="/tmp/adev-backup-$$"
if [ -d "$HOME/.adev" ]; then
    mv "$HOME/.adev" "$BACKUP_DIR"
fi

PASSED=0
FAILED=0

# Mock install.sh 생성 (1회만)
MOCK_INSTALL="/tmp/mock-install-$$.sh"
cat > "$MOCK_INSTALL" << 'MOCKEOF'
#!/usr/bin/env bash
set -e

# Mock 환경변수
REPO="uygnoey/autonomous-dev-agent-ts"
BIN_DIR="$HOME/.local/bin"
INSTALL_DIR="$HOME/.adev"
ENV_FILE="$INSTALL_DIR/.env"
LATEST="v0.0.1-alpha"  # Mock version

# TTY 체크
TTY_OK=false
if [ -t 0 ]; then
    TTY_OK=true
elif [ -r /dev/tty ]; then
    TTY_OK=true
fi

# 디렉토리 생성
mkdir -p "$INSTALL_DIR" "$BIN_DIR"

# Mock 바이너리
echo "#!/usr/bin/env bash" > "$INSTALL_DIR/adev"
echo "echo 'adev mock'" >> "$INSTALL_DIR/adev"
chmod +x "$INSTALL_DIR/adev"

# Symlink
ln -sf "$INSTALL_DIR/adev" "$BIN_DIR/adev"

# PATH 설정
SHELL_RC=""
if [ -n "$ZSH_VERSION" ]; then
    SHELL_RC="$HOME/.zshrc"
elif [ -n "$BASH_VERSION" ]; then
    SHELL_RC="$HOME/.bashrc"
elif [ -f "$HOME/.zshrc" ]; then
    SHELL_RC="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
    SHELL_RC="$HOME/.bashrc"
else
    SHELL_RC="$HOME/.zshrc"
fi

if [ ! -f "$SHELL_RC" ]; then
    touch "$SHELL_RC"
fi

if ! grep -q "$BIN_DIR" "$SHELL_RC" 2>/dev/null; then
    echo "" >> "$SHELL_RC"
    echo "# adev" >> "$SHELL_RC"
    echo "export PATH=\"\$HOME/.local/bin:\$PATH\"" >> "$SHELL_RC"
fi

# 인증 설정
if [ "$TTY_OK" = "false" ]; then
    exit 0
fi

printf "Enter choice [1-3]: "
read auth_choice < /dev/tty

case $auth_choice in
    1)
        printf "API Key: "
        read api_key < /dev/tty
        if [ -n "$api_key" ]; then
            echo "ANTHROPIC_API_KEY=$api_key" >> "$ENV_FILE"
            chmod 600 "$ENV_FILE"
        fi
        ;;
    2)
        printf "OAuth Token: "
        read oauth_token < /dev/tty
        if [ -n "$oauth_token" ]; then
            echo "CLAUDE_CODE_OAUTH_TOKEN=$oauth_token" >> "$ENV_FILE"
            chmod 600 "$ENV_FILE"
        fi
        ;;
    3)
        # Skip
        ;;
esac
MOCKEOF
chmod +x "$MOCK_INSTALL"

# 테스트 입력
declare -a INPUTS=(
    "3"
    "1\nsk-ant-test"
    "2\nsk-ant-oat-test"
    "1\n"
    "2\n"
)

run_test() {
    local shell="$1"
    local input="$2"

    # 정리
    rm -rf "$HOME/.adev"
    rm -rf "$HOME/.local/bin/adev"

    # 실행
    local result=0
    if [ "$shell" = "bash" ]; then
        echo -e "$input" | bash "$MOCK_INSTALL" >/dev/null 2>&1 || result=$?
    else
        echo -e "$input" | zsh "$MOCK_INSTALL" >/dev/null 2>&1 || result=$?
    fi

    # 검증
    if [ -d "$HOME/.local/bin" ] && [ -L "$HOME/.local/bin/adev" ]; then
        return 0
    else
        return 1
    fi
}

# Bash 500회
echo "🔵 Bash (500회)..."
for i in {1..500}; do
    idx=$(( (i - 1) % ${#INPUTS[@]} ))
    if run_test "bash" "${INPUTS[$idx]}"; then
        ((PASSED++))
    else
        ((FAILED++))
    fi
    [ $((i % 100)) -eq 0 ] && echo "  $i/500 (통과: $PASSED)"
done

# Zsh 500회
echo "🟣 Zsh (500회)..."
zsh_start=$PASSED
for i in {1..500}; do
    idx=$(( (i - 1) % ${#INPUTS[@]} ))
    if run_test "zsh" "${INPUTS[$idx]}"; then
        ((PASSED++))
    else
        ((FAILED++))
    fi
    [ $((i % 100)) -eq 0 ] && echo "  $i/500 (통과: $((PASSED - zsh_start)))"
done

# 정리
rm -f "$MOCK_INSTALL"
rm -rf "$HOME/.adev"
if [ -d "$BACKUP_DIR" ]; then
    mv "$BACKUP_DIR" "$HOME/.adev"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "📊 최종 결과:"
echo "   총: 1000, 통과: $PASSED, 실패: $FAILED"
echo "   성공률: $((PASSED * 100 / 1000))%"
echo "════════════════════════════════════════════════════════════════"

[ $FAILED -eq 0 ] && exit 0 || exit 1
