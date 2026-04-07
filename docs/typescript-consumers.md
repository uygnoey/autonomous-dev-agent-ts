# TypeScript Consumer Guide

`autonomous-dev-agent` ships full TypeScript declarations (`.d.ts`) for all public subpath exports.

## Requirements

- TypeScript ≥ 5.0
- `moduleResolution: "bundler"` or `"node16"` / `"nodenext"` in your `tsconfig.json`

## Installation

```bash
npm install autonomous-dev-agent
# or
bun add autonomous-dev-agent
```

## Subpath Imports

Every public entrypoint has a matching `.d.ts`:

| Import path                        | Declaration file              |
| ---------------------------------- | ----------------------------- |
| `autonomous-dev-agent`             | `dist/index.d.ts`             |
| `autonomous-dev-agent/core`        | `dist/core/index.d.ts`        |
| `autonomous-dev-agent/rag`         | `dist/rag/index.d.ts`         |
| `autonomous-dev-agent/layer1`      | `dist/layer1/index.d.ts`      |
| `autonomous-dev-agent/layer2`      | `dist/layer2/index.d.ts`      |
| `autonomous-dev-agent/layer3`      | `dist/layer3/index.d.ts`      |

## tsconfig.json (recommended)

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler",
    "module": "ESNext",
    "strict": true
  }
}
```

## Example

```typescript
import type { AdevConfig } from "autonomous-dev-agent/core";
import { createAgent } from "autonomous-dev-agent";

const config: AdevConfig = {
  // ...
};
```

## Generating declarations locally

If you are building from source:

```bash
bun run build:types   # emits dist/**/*.d.ts via tsconfig.build.json
bun run build         # emits dist/**/*.js via bun build
```

Both steps are required before publishing to npm. `prepublishOnly` runs `typecheck` and `lint`; add `build:types` to your publish flow as needed.

## Verifying the npm tarball includes .d.ts

```bash
npm pack --dry-run | grep '\.d\.ts'
```

You should see `dist/index.d.ts` and one entry per subpath export.
