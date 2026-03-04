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

# Determine shell RC file
SHELL_RC=""
if [ -n "$ZSH_VERSION" ]; then
    SHELL_RC="$HOME/.zshrc"
elif [ -n "$BASH_VERSION" ]; then
    SHELL_RC="$HOME/.bashrc"
elif [ -f "$HOME/.zshrc" ]; then
    SHELL_RC="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
    SHELL_RC="$HOME/.bashrc"
fi

# Add to PATH if not already present
if [ -n "$SHELL_RC" ]; then
    if ! grep -q "$BIN_DIR" "$SHELL_RC" 2>/dev/null; then
        echo "" >> "$SHELL_RC"
        echo "# adev (autonomous-dev-agent)" >> "$SHELL_RC"
        echo "export PATH=\"\$HOME/.local/bin:\$PATH\"" >> "$SHELL_RC"
    fi
fi

echo ""
echo "🔑 Setting up authentication..."
echo ""
echo "Choose authentication method:"
echo "  1) Anthropic API Key (recommended for API users)"
echo "  2) Claude Code OAuth Token (for Pro/Max subscription)"
echo "  3) Skip (configure later)"
echo ""
read -p "Enter choice [1-3]: " auth_choice

case $auth_choice in
    1)
        echo ""
        read -p "Enter your Anthropic API Key (sk-ant-...): " api_key
        if [ -n "$api_key" ]; then
            if [ -n "$SHELL_RC" ]; then
                if ! grep -q "ANTHROPIC_API_KEY" "$SHELL_RC" 2>/dev/null; then
                    echo "export ANTHROPIC_API_KEY=\"$api_key\"" >> "$SHELL_RC"
                    echo "✅ API Key saved to $SHELL_RC"
                else
                    echo "⚠️  ANTHROPIC_API_KEY already exists in $SHELL_RC"
                    read -p "Overwrite? [y/N]: " overwrite
                    if [ "$overwrite" = "y" ] || [ "$overwrite" = "Y" ]; then
                        sed -i.bak "/ANTHROPIC_API_KEY/d" "$SHELL_RC"
                        echo "export ANTHROPIC_API_KEY=\"$api_key\"" >> "$SHELL_RC"
                        echo "✅ API Key updated in $SHELL_RC"
                    fi
                fi
            fi
            export ANTHROPIC_API_KEY="$api_key"
            echo "✅ API Key configured for current session"
        else
            echo "⚠️  No API key provided, skipping..."
        fi
        ;;
    2)
        echo ""
        read -p "Enter your Claude Code OAuth Token (sk-ant-oat01-...): " oauth_token
        if [ -n "$oauth_token" ]; then
            if [ -n "$SHELL_RC" ]; then
                if ! grep -q "CLAUDE_CODE_OAUTH_TOKEN" "$SHELL_RC" 2>/dev/null; then
                    echo "export CLAUDE_CODE_OAUTH_TOKEN=\"$oauth_token\"" >> "$SHELL_RC"
                    echo "✅ OAuth Token saved to $SHELL_RC"
                else
                    echo "⚠️  CLAUDE_CODE_OAUTH_TOKEN already exists in $SHELL_RC"
                    read -p "Overwrite? [y/N]: " overwrite
                    if [ "$overwrite" = "y" ] || [ "$overwrite" = "Y" ]; then
                        sed -i.bak "/CLAUDE_CODE_OAUTH_TOKEN/d" "$SHELL_RC"
                        echo "export CLAUDE_CODE_OAUTH_TOKEN=\"$oauth_token\"" >> "$SHELL_RC"
                        echo "✅ OAuth Token updated in $SHELL_RC"
                    fi
                fi
            fi
            export CLAUDE_CODE_OAUTH_TOKEN="$oauth_token"
            echo "✅ OAuth Token configured for current session"
        else
            echo "⚠️  No OAuth token provided, skipping..."
        fi
        ;;
    3)
        echo "⏭️  Skipping authentication setup"
        echo "   You can configure it later by setting:"
        echo "   • export ANTHROPIC_API_KEY=sk-ant-..."
        echo "   • export CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-..."
        ;;
    *)
        echo "⚠️  Invalid choice, skipping authentication setup"
        ;;
esac

echo ""
echo "🎉 Installation complete!"
echo ""
echo "📝 Next steps:"
if [ -n "$SHELL_RC" ]; then
    echo "   1. Restart your shell or run: source $SHELL_RC"
else
    echo "   1. Restart your shell"
fi
echo "   2. Run: adev"
echo ""
echo "📚 Documentation: https://github.com/uygnoey/autonomous-dev-agent-ts"
echo "💬 Issues: https://github.com/uygnoey/autonomous-dev-agent-ts/issues"
echo ""
