#!/usr/bin/env bash
set -e

# adev (autonomous-dev-agent) One-Line Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/uygnoey/autonomous-dev-agent-ts/main/install.sh | bash

# curl | bash 환경에서도 키보드 입력을 받기 위해 stdin을 터미널로 전환
TTY_OK=false
if [ -t 0 ]; then
    TTY_OK=true
elif [ -r /dev/tty ]; then
    # WHY: exec는 현재 셸을 교체하므로 조건문에서 사용 불가
    #      대신 /dev/tty를 read 명령어에서 직접 사용
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
# WHY: macOS는 기본 셸이 zsh이지만 .zshrc가 없을 수 있음 → 자동 생성
SHELL_RC=""
if [ -n "$ZSH_VERSION" ]; then
    # 현재 zsh 실행 중
    SHELL_RC="$HOME/.zshrc"
elif [ -n "$BASH_VERSION" ]; then
    # 현재 bash 실행 중
    SHELL_RC="$HOME/.bashrc"
elif [ -f "$HOME/.zshrc" ]; then
    # zsh 설정 파일 존재
    SHELL_RC="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
    # bash 설정 파일 존재
    SHELL_RC="$HOME/.bashrc"
else
    # 아무것도 없으면 macOS 기본 셸(zsh) 우선
    SHELL_RC="$HOME/.zshrc"
fi

# 설정 파일 없으면 생성
if [ ! -f "$SHELL_RC" ]; then
    touch "$SHELL_RC"
    echo "# Created by adev installer" >> "$SHELL_RC"
fi

# PATH 추가 (중복 방지)
if ! grep -q "$BIN_DIR" "$SHELL_RC" 2>/dev/null; then
    echo "" >> "$SHELL_RC"
    echo "# adev (autonomous-dev-agent)" >> "$SHELL_RC"
    echo "export PATH=\"\$HOME/.local/bin:\$PATH\"" >> "$SHELL_RC"
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
    printf "Enter choice [1-3]: "
    read auth_choice < /dev/tty

    case $auth_choice in
        1)
            echo ""
            echo "📘 API Key 발급: https://console.anthropic.com/settings/keys"
            echo ""
            printf "Anthropic API Key (sk-ant-...): "
            read api_key < /dev/tty
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
            printf "Claude Code OAuth Token (sk-ant-oat01-...): "
            read oauth_token < /dev/tty
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
echo ""
echo "   🔄 PATH 활성화 (둘 중 하나):"
if [ -n "$SHELL_RC" ]; then
    echo "      • 새 터미널 창 열기 (권장)"
    echo "      • 또는 실행: source $SHELL_RC"
else
    echo "      • $BIN_DIR 를 PATH에 추가"
fi
echo ""
echo "   🚀 사용 시작:"
echo "      adev init ~/my-project  — 새 프로젝트 생성"
echo "      cd ~/my-project"
echo "      adev start              — 자율 개발 시작"
echo ""
echo "   🔑 인증 재설정 (필요 시):"
echo "      adev auth"
echo ""
echo "📚 Docs: https://github.com/$REPO"
echo ""
