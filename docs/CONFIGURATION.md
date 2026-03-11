# adev Configuration Reference

> Full reference for all adev configuration options, environment variables, and runtime settings.

---

## Configuration File

**Location**: `~/.adev/config.json`

Created automatically by `adev init`. Edit manually or via `adev config set <key> <value>`.

### Default config

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

---

## `embedding` — Embedding Provider Settings

Controls which embedding model is used for RAG vector search.

### `embedding.default`

**Type**: `string`
**Default**: `"xenova-minilm"`
**Options**: `"xenova-minilm"`, `"jina-v3"`, `"voyage-code-3"`, `"voyage-3-lite"`

General-purpose embedding provider for natural language text (docs, design decisions, memory).

```json
"embedding": {
  "default": "jina-v3"
}
```

### `embedding.code`

**Type**: `string`
**Default**: `"xenova-minilm"`
**Options**: `"xenova-minilm"`, `"jina-v3"`, `"voyage-code-3"`, `"voyage-3-lite"`

Code-specific embedding provider for source code indexing and search.

```json
"embedding": {
  "code": "voyage-code-3"
}
```

### `embedding.voyageApiKey`

**Type**: `string | null`
**Default**: `null`

Voyage AI API key. When set, enables the paid Voyage embedding tier automatically.

```json
"embedding": {
  "voyageApiKey": "pa-..."
}
```

> **Recommended**: Set via environment variable `VOYAGE_API_KEY` instead of hardcoding in config.

---

## `verification` — Layer2 Verification Settings

Controls the 4-layer validation process in Layer2 VERIFY phase.

### `verification.layer1Model`

**Type**: `string`
**Default**: `"opus"`
**Options**: `"opus"`, `"sonnet"`, `"haiku"`

Model used by Layer1 for intent validation in the VERIFY phase.

- `"opus"` — Highest accuracy, slower, more expensive
- `"sonnet"` — Balanced accuracy and speed
- `"haiku"` — Fastest, lowest cost, less thorough

### `verification.adevModel`

**Type**: `string`
**Default**: `"opus"`
**Options**: `"opus"`, `"sonnet"`, `"haiku"`

Model used by the adev team leader for final judgment in the VERIFY phase.

### `verification.opusEscalationOnFailure`

**Type**: `boolean`
**Default**: `true`

When `true`, automatically escalates to Opus model if lower-tier model verification fails. Ensures thorough validation on critical failures.

```json
"verification": {
  "layer1Model": "sonnet",
  "adevModel": "sonnet",
  "opusEscalationOnFailure": true
}
```

---

## `log` — Logging Settings

### `log.level`

**Type**: `string`
**Default**: `"info"`
**Options**: `"debug"`, `"info"`, `"warn"`, `"error"`, `"silent"`

Log verbosity level.

| Level | Description |
|-------|-------------|
| `debug` | All messages including internal state |
| `info` | Normal operational messages (default) |
| `warn` | Warnings and non-fatal issues |
| `error` | Errors only |
| `silent` | No output |

---

## Environment Variables

Stored in `~/.adev/.env`. Set via `adev init` or edit manually.

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | One of these two | Anthropic API key |
| `CLAUDE_CODE_OAUTH_TOKEN` | One of these two | Claude Pro/Max OAuth token |
| `VOYAGE_API_KEY` | Optional | Voyage AI API key (enables Tier 2 embeddings) |

### `ANTHROPIC_API_KEY`

Standard Anthropic API key. Get from: https://console.anthropic.com/settings/keys

```bash
ANTHROPIC_API_KEY=sk-ant-api03-...
```

### `CLAUDE_CODE_OAUTH_TOKEN`

OAuth token from Claude Code (for Pro/Max subscription users).

```bash
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...
```

### `VOYAGE_API_KEY`

Voyage AI API key. When set, switches embedding tier from free to paid:

| Without VOYAGE_API_KEY | With VOYAGE_API_KEY |
|------------------------|---------------------|
| Code: `xenova-minilm` (384d) or `jina-v3` (1024d) | Code: `voyage-code-3` (1024d) |
| Text: `xenova-minilm` (384d) | Text: `voyage-3-lite` (512d) |

Get a Voyage API key from: https://www.voyageai.com/

```bash
VOYAGE_API_KEY=pa-...
```

---

## `~/.adev/` Directory Structure

Created by `adev init` and `scripts/install.sh`:

```
~/.adev/
├── .env                    # API keys (chmod 600)
├── config.json             # Configuration
├── mcp/                    # MCP server configs
│   └── servers.json        # MCP server registry
├── skills/                 # Custom skills
├── templates/              # Project templates
├── rag/                    # RAG settings
│   └── embedding.json      # Per-project embedding config
└── data/
    ├── memory/             # LanceDB memory store
    │   └── memory.lance/
    └── code-index/         # LanceDB code index
        └── code.lance/
```

---

## 4-Provider Embedding Tier

Automatic selection based on available API keys and `config.json` settings:

```
Tier 1 (Free) — No VOYAGE_API_KEY:
  Code:  jina-v3 (1024d, jinaai/jina-embeddings-v3, local)
  Text:  xenova-minilm (384d, Xenova/all-MiniLM-L6-v2, local)

Tier 2 (Paid) — VOYAGE_API_KEY set:
  Code:  voyage-code-3 (1024d, Voyage AI HTTP API)
  Text:  voyage-3-lite (512d, Voyage AI HTTP API)
```

### Provider comparison

| Provider | Tier | Dimensions | Model | Mode |
|----------|------|------------|-------|------|
| `xenova-minilm` | Free | 384 | Xenova/all-MiniLM-L6-v2 | Local inference |
| `jina-v3` | Free | 1024 | jinaai/jina-embeddings-v3 | Local inference |
| `voyage-code-3` | Paid | 1024 | voyage-code-3 | HTTP API |
| `voyage-3-lite` | Paid | 512 | voyage-3-lite | HTTP API |

---

## MCP Server Configuration

MCP servers are configured in `~/.adev/mcp/servers.json`:

```json
{
  "servers": [
    {
      "name": "filesystem",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user"],
      "enabled": true
    },
    {
      "name": "custom-server",
      "command": "node",
      "args": ["path/to/server.js"],
      "env": {
        "MY_KEY": "value"
      },
      "enabled": true
    }
  ]
}
```

### Built-in MCP servers

| Server | Purpose | Auto-enabled |
|--------|---------|--------------|
| `filesystem` | File read/write access | Yes |
| `lancedb` | Vector DB access | Yes |
| `memory` | Conversation memory | Yes |
| `web-search` | Web search capability | Yes |

---

## Related Documents

- [COMMANDS.md](./COMMANDS.md) — CLI command reference
- [AGENTS.md](./AGENTS.md) — Agent roles and behavior
- [docs/references/EMBEDDING-STRATEGY.md](./references/EMBEDDING-STRATEGY.md) — Embedding tier details
- [ARCHITECTURE.md](../ARCHITECTURE.md) — System architecture
