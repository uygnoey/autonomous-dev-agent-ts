# Migration Guide: Pre-v1 to v1.0.0

This guide covers breaking changes and upgrade steps from pre-release versions to v1.0.0.

## Breaking Changes

### 1. Plugin Manifest v2

Plugin manifests now use the v2 schema. Existing v1 manifests are auto-upgraded at load time, but we recommend updating manually:

```diff
 {
   "name": "my-plugin",
   "version": "1.0.0",
   "entryPoint": "index.ts",
+  "capabilities": ["phase_hook"],
+  "permissions": ["fs_read"],
+  "minAdevVersion": "1.0.0"
 }
```

### 2. Multi-Model Router

The default engine is now `ModelRouter` instead of a single-model configuration. If you had explicit model settings in `.adev/config.json`, update to the new format:

```diff
 {
-  "model": "claude-sonnet-4-20250514",
+  "engine": "model-router",
+  "models": {
+    "planning": "claude-opus-4-20250514",
+    "coding": "claude-sonnet-4-20250514",
+    "verification": "claude-opus-4-20250514"
+  }
 }
```

Single model configurations still work but are deprecated.

### 3. Circuit Breaker on External Calls

All Claude API and LanceDB calls now go through a circuit breaker. If your custom plugins make direct API calls, wrap them with the provided retry utilities:

```typescript
import { withRetry } from 'core/resilience.js';

const result = await withRetry(() => myApiCall(), { maxRetries: 3 });
```

### 4. Structured Logging Format

Log output is now JSON-structured by default. To restore the previous plain-text format:

```bash
adev start --log-format plain
```

Or in `.adev/config.json`:
```json
{
  "logFormat": "plain"
}
```

### 5. Docker Support

The Docker image is now available. If you were using custom containerization, switch to the official image:

```bash
docker compose up
```

See `docker-compose.yml` in the project root.

## Upgrade Steps

1. **Update adev**:
   ```bash
   npm install -g autonomous-dev-agent@1.0.0
   ```

2. **Update config** (if customized):
   ```bash
   cd your-project
   adev config list  # review current settings
   ```

3. **Update plugins** (if any):
   - Add `capabilities` and `permissions` to manifests
   - Set `minAdevVersion: "1.0.0"`

4. **Test**:
   ```bash
   adev start --dry-run  # verify configuration loads correctly
   ```

## Deprecated Features

| Feature | Status | Alternative |
|---------|--------|-------------|
| Single-model config | Deprecated (still works) | Use ModelRouter engine |
| Plain text logs | Deprecated | Use `--log-format plain` flag |
| Plugin manifest v1 | Auto-upgraded | Update to v2 schema |

## Getting Help

- [Getting Started Guide](./getting-started.md)
- [Architecture Overview](../ARCHITECTURE.md)
- [Plugin SDK](./plugin-sdk.md)
- [GitHub Issues](https://github.com/paperclipai/autonomous-dev-agent-ts/issues)
