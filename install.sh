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
    # Check if adev was previously installed (has data files)
    HAS_EXISTING_DATA=false
    if [ "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]; then
        HAS_EXISTING_DATA=true
    fi

    if [ "$HAS_EXISTING_DATA" = true ]; then
        echo ""
        echo "⚠️  Existing adev data found in $INSTALL_DIR"
        echo ""
        echo "Choose installation mode:"
        echo "  1) Fresh install — overwrite everything (your projects.json will be backed up)"
        echo "  2) Keep settings — preserve existing data, only install/update code"
        echo "  3) Cancel"
        echo ""
        read -p "Enter choice [1-3]: " install_choice

        case $install_choice in
            1)
                echo "🗑️  Backing up existing data..."
                BACKUP_DIR="${INSTALL_DIR}_backup_$(date +%Y%m%d_%H%M%S)"
                mv "$INSTALL_DIR" "$BACKUP_DIR"
                mkdir -p "$INSTALL_DIR"
                cd "$INSTALL_DIR"
                echo "📦 Cloning repository..."
                git clone https://github.com/uygnoey/autonomous-dev-agent-ts.git .
                # Restore only projects.json (user data)
                if [ -f "$BACKUP_DIR/projects.json" ]; then
                    cp "$BACKUP_DIR/projects.json" "$INSTALL_DIR/projects.json"
                    echo "✅ projects.json restored from backup"
                fi
                echo "📁 Backup saved at: $BACKUP_DIR"
                ;;
            2)
                echo "🔒 Keeping existing settings..."
                # Use a temp dir, then copy only code files
                TEMP_DIR=$(mktemp -d)
                git clone https://github.com/uygnoey/autonomous-dev-agent-ts.git "$TEMP_DIR"
                # Copy code files, skip user data files
                rsync -a --exclude='.env' --exclude='projects.json' --exclude='.adev/' \
                    "$TEMP_DIR/" "$INSTALL_DIR/"
                rm -rf "$TEMP_DIR"
                echo "✅ Code updated, settings preserved"
                ;;
            3)
                echo "❌ Installation cancelled."
                exit 0
                ;;
            *)
                echo "⚠️  Invalid choice, cancelling installation."
                exit 1
                ;;
        esac
    else
        echo "📦 Cloning repository..."
        git clone https://github.com/uygnoey/autonomous-dev-agent-ts.git .
    fi
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
echo "  1) Anthropic API Key"
echo "  2) Claude Code OAuth Token (Pro/Max subscription)"
echo "  3) Skip (configure later)"
echo ""
read -p "Enter choice [1-3]: " auth_choice

ENV_FILE="$INSTALL_DIR/.env"

case $auth_choice in
    1)
        echo ""
        echo "📘 Get your API key from: https://console.anthropic.com/settings/keys"
        echo ""
        read -p "Enter your Anthropic API Key (sk-ant-...): " api_key
        if [ -n "$api_key" ]; then
            # Create or update .env file
            if [ -f "$ENV_FILE" ]; then
                # Remove old ANTHROPIC_API_KEY if exists
                sed -i.bak '/^ANTHROPIC_API_KEY=/d' "$ENV_FILE"
                # Remove CLAUDE_CODE_OAUTH_TOKEN to avoid conflicts
                sed -i.bak '/^CLAUDE_CODE_OAUTH_TOKEN=/d' "$ENV_FILE"
            fi
            echo "ANTHROPIC_API_KEY=$api_key" >> "$ENV_FILE"
            chmod 600 "$ENV_FILE"  # Secure the .env file
            echo "✅ API Key saved to $ENV_FILE"
            echo "⚠️  Security: .env file is set to 600 (owner read/write only)"
        else
            echo "⚠️  No API key provided, skipping..."
        fi
        ;;
    2)
        echo ""
        echo "📘 How to get OAuth Token:"
        echo "   1. Install Claude Code CLI: https://docs.anthropic.com/claude/docs/claude-code"
        echo "   2. Run: claude setup-token"
        echo "   3. Follow the browser authentication flow"
        echo "   4. Copy the token (sk-ant-oat01-...)"
        echo ""
        read -p "Enter your Claude Code OAuth Token (sk-ant-oat01-...): " oauth_token
        if [ -n "$oauth_token" ]; then
            # Create or update .env file
            if [ -f "$ENV_FILE" ]; then
                # Remove old CLAUDE_CODE_OAUTH_TOKEN if exists
                sed -i.bak '/^CLAUDE_CODE_OAUTH_TOKEN=/d' "$ENV_FILE"
                # Remove ANTHROPIC_API_KEY to avoid conflicts
                sed -i.bak '/^ANTHROPIC_API_KEY=/d' "$ENV_FILE"
            fi
            echo "CLAUDE_CODE_OAUTH_TOKEN=$oauth_token" >> "$ENV_FILE"
            chmod 600 "$ENV_FILE"  # Secure the .env file
            echo "✅ OAuth Token saved to $ENV_FILE"
            echo "⚠️  Security: .env file is set to 600 (owner read/write only)"
        else
            echo "⚠️  No OAuth token provided, skipping..."
        fi
        ;;
    3)
        echo "⏭️  Skipping authentication setup"
        echo ""
        echo "   You can configure it later by editing: $ENV_FILE"
        echo "   Add one of the following lines:"
        echo "   • ANTHROPIC_API_KEY=sk-ant-..."
        echo "   • CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-..."
        echo ""
        echo "   ⚠️  Only set ONE authentication method, not both!"
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
