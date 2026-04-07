# Example Plugins

This directory contains example plugins for the adev Plugin SDK v2.

## Plugins

### [plugin-hello-world](./plugin-hello-world/)
Minimal plugin that logs a message on each lifecycle event. Start here to understand the plugin structure.

### [plugin-metrics-logger](./plugin-metrics-logger/)
Tracks time spent in each pipeline phase and emits metrics events. Demonstrates `emitEvent()` and stateful plugin patterns.

## Installation

Copy any example plugin directory to your adev plugins folder:

```bash
cp -r examples/plugin-hello-world ~/.adev/plugins/hello-world
```

adev automatically discovers and loads plugins from `~/.adev/plugins/`.

## Creating Your Own Plugin

See the [Plugin SDK documentation](../docs/plugin-sdk.md) for the full API reference.
