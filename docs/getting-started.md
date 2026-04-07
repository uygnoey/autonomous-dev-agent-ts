# Getting Started with adev

Get up and running with `adev` in 5 minutes.

---

## Prerequisites

- **Bun >= 1.3.0** ([install](https://bun.sh/))
- **Anthropic API key** ([get one](https://console.anthropic.com/))

## Install

```bash
# Option 1: npm (global)
npm install -g autonomous-dev-agent

# Option 2: bun (global)
bun install -g autonomous-dev-agent

# Option 3: shell script
curl -fsSL https://raw.githubusercontent.com/uygnoey/autonomous-dev-agent-ts/main/install.sh | bash
```

## Initialize a Project

```bash
cd your-project
adev init
```

This creates an `.adev/` directory with default configuration.

## Configure

Set your Anthropic API key:

```bash
adev config set ANTHROPIC_API_KEY sk-ant-...
```

Or use an environment variable:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## Start Development

```bash
adev start
```

adev will:
1. Open an interactive dialogue (Layer 1) to understand your requirements
2. Create a design contract for your approval
3. Autonomously orchestrate 7 specialized agents (Layer 2) through DESIGN -> CODE -> TEST -> VERIFY phases
4. Generate documentation and artifacts (Layer 3)

## Example Session

```
$ adev start
[adev] Starting autonomous development session...
[Layer1] What would you like to build?

> Add a REST API endpoint for user authentication with JWT tokens

[Layer1] Creating design contract...
[Layer1] Design contract ready. Review and confirm? (Y/n)

> Y

[Layer2] Spawning agents: architect, qa, coder, tester, qc, reviewer, documenter
[Layer2] Phase: DESIGN -> architect analyzing requirements...
[Layer2] Phase: CODE -> coder implementing...
[Layer2] Phase: TEST -> tester running fail-fast tests...
[Layer2] Phase: VERIFY -> reviewer + qc final validation...
[Layer2] All phases complete. 4-layer validation passed.

[Layer3] Generating documentation...
[adev] Session complete. Files changed: 8, Tests: 12 passed
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `adev init` | Initialize adev in current project |
| `adev start` | Start an interactive development session |
| `adev config` | View/set configuration |
| `adev project` | Manage project settings |
| `adev plugin list` | List installed plugins |
| `adev plugin install <name>` | Install a plugin |
| `adev plugin create <name>` | Scaffold a new plugin |

## What's Next?

- [Architecture Overview](../ARCHITECTURE.md) — Understand the 3-layer design
- [Plugin SDK](plugin-sdk.md) — Build custom plugins
- [Configuration Guide](CONFIGURATION.md) — Advanced configuration options
- [Contributing](CONTRIBUTING.md) — Help improve adev
