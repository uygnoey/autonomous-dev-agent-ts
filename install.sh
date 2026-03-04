#!/usr/bin/env bash
set -e

# adev (autonomous-dev-agent) One-Line Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/uygnoey/autonomous-dev-agent-ts/main/install.sh | bash

echo "🚀 Installing adev (autonomous-dev-agent)..."

# Check if Bun is installed
if ! command -v bun &> /dev/null; then
    echo "📦 Bun not found. Installing Bun..."
    curl -fsSL https://bun.sh/install | bash

    # Add Bun to PATH for current session
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
fi

# Create installation directory
INSTALL_DIR="$HOME/.adev"
mkdir -p "$INSTALL_DIR"

echo "📥 Downloading adev..."
cd "$INSTALL_DIR"

# Clone or update repository
if [ -d ".git" ]; then
    echo "🔄 Updating existing installation..."
    git pull origin main
else
    echo "📦 Cloning repository..."
    git clone https://github.com/uygnoey/autonomous-dev-agent-ts.git .
fi

echo "📦 Installing dependencies..."
bun install

echo "🔨 Building adev..."
bun run build

# Create symlink
BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"
ln -sf "$INSTALL_DIR/dist/index.js" "$BIN_DIR/adev"
chmod +x "$BIN_DIR/adev"

# Add to PATH if not already present
SHELL_RC=""
if [ -n "$ZSH_VERSION" ]; then
    SHELL_RC="$HOME/.zshrc"
elif [ -n "$BASH_VERSION" ]; then
    SHELL_RC="$HOME/.bashrc"
fi

if [ -n "$SHELL_RC" ]; then
    if ! grep -q "$BIN_DIR" "$SHELL_RC" 2>/dev/null; then
        echo "" >> "$SHELL_RC"
        echo "# adev (autonomous-dev-agent)" >> "$SHELL_RC"
        echo "export PATH=\"\$HOME/.local/bin:\$PATH\"" >> "$SHELL_RC"
        echo "✅ Added adev to PATH in $SHELL_RC"
    fi
fi

echo ""
echo "✅ Installation complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Restart your shell or run: source $SHELL_RC"
echo "   2. Set up authentication (choose ONE):"
echo "      • API Key:        export ANTHROPIC_API_KEY=sk-ant-..."
echo "      • Subscription:   export CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-..."
echo "   3. Run: adev"
echo ""
echo "📚 Documentation: https://github.com/uygnoey/autonomous-dev-agent-ts"
echo ""
