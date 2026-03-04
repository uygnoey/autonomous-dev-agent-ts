#!/usr/bin/env bash
set -e

# adev (autonomous-dev-agent) One-Line Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/uygnoey/autonomous-dev-agent-ts/main/install.sh | bash

REPO="uygnoey/autonomous-dev-agent-ts"
BIN_DIR="$HOME/.local/bin"
INSTALL_DIR="$HOME/.adev"

echo "🚀 Installing adev (autonomous-dev-agent)..."

# ── 플랫폼 감지 / Detect platform ─────────────────────────────────
OS=$(uname -s)
ARCH=$(uname -m)

case "$OS" in
    Darwin)
        case "$ARCH" in
            arm64)  BINARY="adev-darwin-arm64" ;;
            x86_64) BINARY="adev-darwin-x64" ;;
            *) echo "❌ Unsupported architecture: $ARCH"; exit 1 ;;
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
echo "🔍 Checking latest version..."
LATEST=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
    | grep '"tag_name"' | sed 's/.*"tag_name": *"\(.*\)".*/\1/')

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

# ── 완료 / Done ────────────────────────────────────────────────────
echo ""
echo "🎉 adev $LATEST installed!"
echo ""
echo "📝 Next steps:"
if [ -n "$SHELL_RC" ]; then
    echo "   1. Restart your shell or run: source $SHELL_RC"
else
    echo "   1. Add $BIN_DIR to your PATH"
fi
echo "   2. Run: adev init    (프로젝트 초기화 + 인증 설정)"
echo ""
echo "📚 Docs: https://github.com/$REPO"
echo ""
