#!/usr/bin/env bash
set -e

# adev (autonomous-dev-agent) One-Line Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/uygnoey/autonomous-dev-agent-ts/main/install.sh | bash

# curl | bash 환경에서도 키보드 입력을 받기 위해 stdin을 터미널로 전환
TTY_OK=false
if [ -t 0 ]; then
    TTY_OK=true
elif [ -r /dev/tty ] && exec < /dev/tty 2>/dev/null; then
    TTY_OK=true
fi

REPO="uygnoey/autonomous-dev-agent-ts"
BIN_DIR="$HOME/.local/bin"
INSTALL_DIR="$HOME/.adev"
ENV_FILE="$INSTALL_DIR/.env"

echo "🚀 Installing adev (autonomous-dev-agent)..."

# ── 플랫폼 감지 / Detect platform ─────────────────────────────────
OS=$(uname -s)
ARCH=$(uname -m)

case "$OS" in
    Darwin)
        case "$ARCH" in
            arm64)  BINARY="adev-darwin-arm64" ;;
            *) echo "❌ macOS는 Apple Silicon(arm64)만 지원합니다. arch: $ARCH"; exit 1 ;;
        esac
        ;;
    Linux)
        case "$ARCH" in
            x86_64) BINARY="adev-linux-x64" ;;
            aarch64|arm64) BINARY="adev-linux-arm64" ;;
            *) echo "❌ Unsupported architecture: $ARCH"; exit 1 ;;
        esac
        ;;
    *)
        echo "❌ Unsupported OS: $OS"
        exit 1
        ;;
esac

# ── 최신 버전 조회 / Get latest version ───────────────────────────
# WHY: /releases/latest는 prerelease를 반환 안 함 → /releases 리스트에서 첫 번째 사용
echo "🔍 Checking latest version..."
LATEST=$(curl -fsSL "https://api.github.com/repos/$REPO/releases" \
    | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\(.*\)".*/\1/')

if [ -z "$LATEST" ]; then
    echo "❌ Failed to fetch latest version. Check your internet connection."
    exit 1
fi

echo "📦 Latest version: $LATEST"

# ── 다운로드 / Download binary ─────────────────────────────────────
DOWNLOAD_URL="https://github.com/$REPO/releases/download/$LATEST/$BINARY"

mkdir -p "$INSTALL_DIR" "$BIN_DIR"

echo "⬇️  Downloading $BINARY..."
curl -fsSL "$DOWNLOAD_URL" -o "$INSTALL_DIR/adev"
chmod +x "$INSTALL_DIR/adev"

# ── Symlink 생성 / Create symlink ─────────────────────────────────
ln -sf "$INSTALL_DIR/adev" "$BIN_DIR/adev"

# ── PATH 설정 / Setup PATH ─────────────────────────────────────────
SHELL_RC=""
if [ -f "$HOME/.zshrc" ]; then
    SHELL_RC="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
    SHELL_RC="$HOME/.bashrc"
fi

if [ -n "$SHELL_RC" ]; then
    if ! grep -q "$BIN_DIR" "$SHELL_RC" 2>/dev/null; then
        echo "" >> "$SHELL_RC"
        echo "# adev (autonomous-dev-agent)" >> "$SHELL_RC"
        echo "export PATH=\"\$HOME/.local/bin:\$PATH\"" >> "$SHELL_RC"
    fi
fi

# ── 인증 설정 / Authentication setup ──────────────────────────────
echo ""
echo "🔑 Authentication Setup"
echo ""

if [ "$TTY_OK" = "false" ]; then
    echo "⚠️  비대화형 환경 감지 — 인증 설정을 건너뜁니다."
    echo "   설치 후 'adev auth'로 설정하세요."
else
    echo "Choose authentication method:"
    echo "  1) Anthropic API Key      (api.anthropic.com에서 발급)"
    echo "  2) Claude Code OAuth Token (Pro/Max 구독자)"
    echo "  3) Skip                   (나중에 'adev auth'로 설정)"
    echo ""
    read -p "Enter choice [1-3]: " auth_choice

    case $auth_choice in
        1)
            echo ""
            echo "📘 API Key 발급: https://console.anthropic.com/settings/keys"
            echo ""
            read -p "Anthropic API Key (sk-ant-...): " api_key
            if [ -n "$api_key" ]; then
                [ -f "$ENV_FILE" ] && sed -i.bak '/^ANTHROPIC_API_KEY=/d;/^CLAUDE_CODE_OAUTH_TOKEN=/d' "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
                echo "ANTHROPIC_API_KEY=$api_key" >> "$ENV_FILE"
                chmod 600 "$ENV_FILE"
                echo "✅ API Key 저장 완료"
            else
                echo "⚠️  입력 없음. 나중에 'adev auth'로 설정하세요."
            fi
            ;;
        2)
            echo ""
            echo "📘 OAuth Token 확인 방법:"
            echo "   cat ~/.claude/.credentials.json | grep oauthToken"
            echo ""
            read -p "Claude Code OAuth Token (sk-ant-oat01-...): " oauth_token
            if [ -n "$oauth_token" ]; then
                [ -f "$ENV_FILE" ] && sed -i.bak '/^ANTHROPIC_API_KEY=/d;/^CLAUDE_CODE_OAUTH_TOKEN=/d' "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
                echo "CLAUDE_CODE_OAUTH_TOKEN=$oauth_token" >> "$ENV_FILE"
                chmod 600 "$ENV_FILE"
                echo "✅ OAuth Token 저장 완료"
            else
                echo "⚠️  입력 없음. 나중에 'adev auth'로 설정하세요."
            fi
            ;;
        3)
            echo "⏭️  건너뜀. 나중에 'adev auth'로 설정하세요."
            ;;
        *)
            echo "⚠️  잘못된 입력. 나중에 'adev auth'로 설정하세요."
            ;;
    esac
fi

# ── 완료 / Done ────────────────────────────────────────────────────
echo ""
echo "🎉 adev $LATEST 설치 완료!"
echo ""
echo "📝 다음 단계:"
if [ -n "$SHELL_RC" ]; then
    echo "   1. 셸 재시작 또는: source $SHELL_RC"
else
    echo "   1. $BIN_DIR 를 PATH에 추가"
fi
echo "   2. adev init     — 새 프로젝트 시작"
echo "   3. adev auth     — 인증 만료 시 재설정"
echo ""
echo "📚 Docs: https://github.com/$REPO"
echo ""
