# adev CLI Commands Reference

> Full reference for all `adev` CLI commands and their options.

---

## Global Options

| Flag | Short | Description |
|------|-------|-------------|
| `--help` | `-h` | Show help for a command |
| `--version` | `-v` | Show adev version |
| `--verbose` | | Enable verbose/debug logging |
| `--config <path>` | | Path to custom config file (default: `~/.adev/config.json`) |

---

## `adev init`

Initialize adev — configure authentication and create the global config directory.

```bash
adev init [options]
```

### What it does

1. Creates `~/.adev/` global config directory structure
2. Prompts for authentication method (API key or OAuth token)
3. Writes credentials to `~/.adev/.env`
4. Sets correct file permissions (`chmod 600 ~/.adev/.env`)
5. Verifies the API key/token is valid

### Options

| Flag | Description |
|------|-------------|
| `--force` | Re-initialize even if already configured |

### Authentication methods

**Option 1: Anthropic API Key**

```bash
adev init
# → Select "API Key"
# → Enter: sk-ant-api03-...
```

Saved as `ANTHROPIC_API_KEY` in `~/.adev/.env`.

**Option 2: Claude Pro/Max Subscription (OAuth)**

```bash
claude setup-token   # Get OAuth token from Claude Code
adev init
# → Select "OAuth Token"
# → Enter: sk-ant-oat01-...
```

Saved as `CLAUDE_CODE_OAUTH_TOKEN` in `~/.adev/.env`.

> **Note**: Set only ONE method. Do not set both simultaneously.

### Output

```
  [done]  ~/.adev/ 디렉토리 생성됨
  [done]  인증 정보 저장됨: ~/.adev/.env
  [done]  API 키 검증 완료
```

---

## `adev start`

Start a Layer1 dialogue session — interactive conversation with Claude to define requirements and generate a development contract.

```bash
adev start [options]
```

### What it does

1. Loads active project context (if configured)
2. Injects relevant RAG context from code index
3. Starts an interactive Layer1 dialogue loop with Claude
4. Accepts user requirements, ideas, and feedback
5. When user confirms, generates a `HandoffPackage` (contract)
6. Optionally triggers Layer2 autonomous development

### Options

| Flag | Description |
|------|-------------|
| `--project <id>` | Use a specific registered project |
| `--model <model>` | Override Layer1 model (default: `claude-opus-4-6`) |
| `--no-rag` | Disable RAG context injection |

### Interactive commands (during session)

| Command | Description |
|---------|-------------|
| `confirm` | Accept current plan and generate contract |
| `reset` | Clear current context and start over |
| `exit` / `quit` | End the session |
| `help` | Show available commands |

### Session flow

```
adev start

[Layer1] Hello! What would you like to build today?
> I want to build a REST API for user management

[Layer1] Great! Let me ask a few questions...
  1. What authentication method? (JWT/OAuth/API Key)
  2. What database? (PostgreSQL/MySQL/MongoDB)
  ...

> JWT, PostgreSQL

[Layer1] Here's my proposed plan:
  - 5 endpoints: POST /users, GET /users/:id, PUT /users/:id, DELETE /users/:id, POST /auth/login
  - JWT middleware
  - Repository pattern with PostgreSQL
  - ...

> confirm

[Layer1] Generating HandoffPackage...
  [done] Contract created: .adev/contracts/contract-2026-03-11T00-00-00.json
  [info] Starting Layer2 autonomous development...
```

---

## `adev config`

View and modify adev configuration settings.

```bash
adev config [subcommand] [options]
```

### Subcommands

#### `adev config show`

Display current configuration:

```bash
adev config show
```

Output:

```json
{
  "embedding": {
    "default": "xenova-minilm",
    "code": "xenova-minilm",
    "voyageApiKey": null
  },
  "verification": {
    "layer1Model": "opus",
    "adevModel": "opus",
    "opusEscalationOnFailure": true
  },
  "log": {
    "level": "info"
  }
}
```

#### `adev config set <key> <value>`

Set a configuration value:

```bash
adev config set embedding.default jina-v3
adev config set log.level debug
adev config set verification.layer1Model sonnet
```

#### `adev config get <key>`

Get a single configuration value:

```bash
adev config get embedding.default
# → xenova-minilm
```

#### `adev config reset`

Reset configuration to defaults:

```bash
adev config reset [--key <key>]   # reset specific key
adev config reset                  # reset all to defaults
```

---

## `adev project`

Manage registered projects for adev to work with.

```bash
adev project <subcommand> [options]
```

### `adev project add <path>`

Register a project directory:

```bash
adev project add /path/to/my-project
adev project add .   # register current directory
```

adev will:
1. Index the codebase into LanceDB vector store
2. Extract design decisions and patterns
3. Register the project with a unique ID

### `adev project list`

List all registered projects:

```bash
adev project list
```

Output:

```
  ID        Name                Path                    Status
  ────────  ──────────────────  ──────────────────────  ──────
  proj-001  my-api              /home/user/my-api       active
  proj-002  frontend-app        /home/user/frontend     indexed
```

### `adev project switch <id>`

Set the active project:

```bash
adev project switch proj-002
```

The active project's context will be injected into Layer1 dialogues.

### `adev project remove <id>`

Unregister a project (does not delete source files):

```bash
adev project remove proj-002
```

### `adev project reindex <id>`

Re-index a project's codebase:

```bash
adev project reindex proj-001
adev project reindex .   # reindex current directory's project
```

---

## Environment Variables

The following environment variables are read from `~/.adev/.env` (set via `adev init`):

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key (Method 1) |
| `CLAUDE_CODE_OAUTH_TOKEN` | OAuth token from Claude Pro/Max (Method 2) |
| `VOYAGE_API_KEY` | Voyage AI API key (optional, enables paid embeddings) |

> All environment variables are accessed exclusively through `src/core/config.ts`. Never set them directly.

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | General error |
| `2` | Authentication error |
| `3` | Project not found |
| `4` | Configuration error |

---

## Related Documents

- [CONFIGURATION.md](./CONFIGURATION.md) — Full configuration reference
- [AGENTS.md](./AGENTS.md) — Agent roles and behavior
- [CONTRIBUTING.md](./CONTRIBUTING.md) — Contributing guide
- [ARCHITECTURE.md](../ARCHITECTURE.md) — System architecture
