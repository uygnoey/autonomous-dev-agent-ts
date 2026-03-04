> **Languages:** [한국어](../ko/process-executor.md) | [English](../en/process-executor.md) | [日本語](../ja/process-executor.md) | [Español](../es/process-executor.md)

# ProcessExecutor — Process Execution Wrapper

## 🎯 What is this?

**Elementary School Analogy:**
It's a robot that tells the computer to "run another program!"

For example:
- "Run the git program" → Check code status
- "Run bun test" → Execute tests
- "Run ls" → Show file list

The robot waits until the program finishes, then brings back the results.

**Technical Description:**
A utility for executing external processes that wraps `Bun.spawn`.
- Automatic stdout/stderr capture
- Timeout management
- Integrated error handling
- Returns Result pattern

---

## 🔍 Why is it needed?

### 1. Safe Execution
If you use `Bun.spawn` directly:
- Must implement timeout handling every time
- Memory overflow if output is too large
- Complex error handling

ProcessExecutor solves this automatically.

### 2. Consistent Interface
All process executions use the same pattern:
```typescript
const result = await executor.execute('command', ['args']);
if (result.ok) {
  console.log(result.value.stdout); // Output result
}
```

### 3. Observability
All process executions are logged through Logger.
- Which command was executed
- How long it took
- What errors occurred

---

## 📦 How to use?

### Step 1: Create Instance

```typescript
import { ProcessExecutor } from '../core/process-executor.js';
import { Logger } from '../core/logger.js';

// Create logger
const logger = new Logger({ level: 'info' });

// Create ProcessExecutor
const executor = new ProcessExecutor(logger);
```

### Step 2: Execute Simple Command

```typescript
// Execute 'ls -la'
const result = await executor.execute('ls', ['-la']);

if (result.ok) {
  console.log('Execution successful!');
  console.log('Exit code:', result.value.exitCode); // 0
  console.log('Output:', result.value.stdout);
  console.log('Execution time:', result.value.durationMs, 'ms');
} else {
  console.error('Execution failed:', result.error.message);
}
```

### Step 3: Execute with Options

```typescript
// Check Git status (in specific directory)
const result = await executor.execute('git', ['status'], {
  cwd: '/path/to/project', // Working directory
  timeoutMs: 10000,         // 10 second timeout
  env: {                     // Additional environment variables
    GIT_PAGER: 'cat',
  },
});

if (result.ok) {
  console.log(result.value.stdout);
}
```

### Step 4: Execute with stdin Input

```typescript
// Pass input to echo command
const result = await executor.execute('cat', [], {
  stdin: 'Hello, World!\n', // Pass to stdin
});

if (result.ok) {
  console.log(result.value.stdout); // "Hello, World!"
}
```

### Step 5: Test Execution Example

```typescript
// Execute Bun tests
const result = await executor.execute('bun', ['test', 'tests/unit'], {
  cwd: '/project/path',
  timeoutMs: 300000, // 5 minute timeout (tests can take long)
});

if (result.ok) {
  const { exitCode, stdout, stderr } = result.value;

  if (exitCode === 0) {
    console.log('✅ All tests passed!');
  } else {
    console.error('❌ Tests failed:');
    console.error(stderr);
  }
}
```

---

## ⚠️ Cautions

### 1. Timeout Settings
**Default timeout: 30 seconds**

Increase timeout for long-running tasks:
```typescript
// ❌ Wrong: Build may not finish in 30 seconds
await executor.execute('bun', ['build']);

// ✅ Correct: Set sufficient timeout
await executor.execute('bun', ['build'], {
  timeoutMs: 120000, // 2 minutes
});
```

### 2. Output Size Limit
**Maximum output: 10MB**

Be careful with commands that output large files:
```typescript
// ❌ Dangerous: Error if outputting 100MB file
await executor.execute('cat', ['huge-file.log']);

// ✅ Safe: Output only part with head
await executor.execute('head', ['-n', '100', 'huge-file.log']);
```

### 3. Verify Working Directory
Without cwd specification, executes in current directory:
```typescript
// If you want to execute in project directory, must specify cwd
await executor.execute('git', ['status'], {
  cwd: projectPath, // Explicitly specify
});
```

### 4. Result Pattern Check
Always check `.ok` before accessing `.value`:
```typescript
// ❌ Dangerous: undefined access on error
const result = await executor.execute('unknown-command', []);
console.log(result.value.stdout); // Error occurs!

// ✅ Safe: Access after ok check
if (result.ok) {
  console.log(result.value.stdout);
} else {
  console.error(result.error.message);
}
```

---

## 💡 Example Code

### Example 1: Check for Uncommitted Git Changes

```typescript
/**
 * Check if there are uncommitted changes in Git repository
 */
async function hasUncommittedChanges(
  executor: ProcessExecutor,
  repoPath: string,
): Promise<boolean> {
  const result = await executor.execute('git', ['status', '--porcelain'], {
    cwd: repoPath,
  });

  if (!result.ok) {
    console.error('Git status failed:', result.error.message);
    return false;
  }

  // If output is not empty → changes exist
  return result.value.stdout.trim().length > 0;
}
```

### Example 2: Timeout Retry

```typescript
/**
 * Function that retries on timeout
 */
async function executeWithRetry(
  executor: ProcessExecutor,
  command: string,
  args: string[],
  maxRetries = 3,
): Promise<Result<ProcessResult>> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await executor.execute(command, args, {
      timeoutMs: 30000,
    });

    if (result.ok) {
      return result; // Return immediately on success
    }

    // Don't retry non-timeout errors
    if (result.error.code !== 'process_timeout') {
      return result;
    }

    console.log(`Timeout occurred (${attempt}/${maxRetries}), retrying...`);
  }

  return err(new AdevError('process_timeout', 'Maximum retries exceeded'));
}
```

### Example 3: Real-time Progress Display (Simple Version)

```typescript
/**
 * Display progress during long task execution
 */
async function executeWithProgress(
  executor: ProcessExecutor,
  command: string,
  args: string[],
  description: string,
): Promise<Result<ProcessResult>> {
  console.log(`⏳ Starting ${description}...`);
  const startTime = Date.now();

  const result = await executor.execute(command, args, {
    timeoutMs: 120000, // 2 minutes
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  if (result.ok) {
    console.log(`✅ ${description} completed (${duration}s)`);
  } else {
    console.error(`❌ ${description} failed (${duration}s):`, result.error.message);
  }

  return result;
}

// Usage example:
await executeWithProgress(executor, 'bun', ['test'], 'Test execution');
```

---

## 🐛 What to do when errors occur?

### Error Code Types

ProcessExecutor returns 3 types of errors:

#### 1. `process_timeout`
**Cause:** Command did not complete within timeout

**Solution:**
```typescript
// Increase timeoutMs
const result = await executor.execute('slow-command', [], {
  timeoutMs: 120000, // Increase from 30s to 120s
});
```

#### 2. `process_output_too_large`
**Cause:** stdout or stderr exceeds 10MB

**Solution:**
```typescript
// Add options to reduce output
const result = await executor.execute('cat', ['large-file.txt'], {
  // Or output only part with head/tail
});

// Alternative: Redirect to file
await executor.execute('sh', ['-c', 'cat large-file.txt > output.txt']);
```

#### 3. `process_execution_error`
**Cause:** Process execution itself failed (command not found, no permission, etc.)

**Solution:**
```typescript
const result = await executor.execute('nonexistent-command', []);
if (!result.ok) {
  if (result.error.code === 'process_execution_error') {
    console.error('Cannot find or execute command.');
    console.error('Check spelling or if it\'s in PATH.');
  }
}
```

### Error Handling Pattern

```typescript
const result = await executor.execute('some-command', ['arg1', 'arg2']);

if (!result.ok) {
  const { code, message } = result.error;

  switch (code) {
    case 'process_timeout':
      console.error('⏱️ Timeout! Command execution took too long.');
      console.error('→ Increase timeoutMs option.');
      break;

    case 'process_output_too_large':
      console.error('📦 Output size exceeded! Over 10MB.');
      console.error('→ Reduce output or redirect to file.');
      break;

    case 'process_execution_error':
      console.error('❌ Execution failed:', message);
      console.error('→ Check if command exists and has permissions.');
      break;

    default:
      console.error('❓ Unknown error:', message);
  }

  return; // Exit after error handling
}

// Success case
console.log('✅ Execution successful:', result.value.stdout);
```

---

## 📊 API Reference

### `ProcessExecutor` Class

#### Constructor
```typescript
constructor(logger: Logger)
```

**Parameters:**
- `logger`: Logger instance (for logging)

---

#### `execute()` Method
```typescript
async execute(
  command: string,
  args?: readonly string[],
  options?: ProcessOptions,
): Promise<Result<ProcessResult>>
```

**Parameters:**
- `command`: Command to execute (e.g., 'git', 'bun', 'ls')
- `args`: Command argument array (optional, default: `[]`)
- `options`: Execution options (optional)

**Return Value:**
- `Result<ProcessResult>`: `.ok === true` on success, `.error` on failure

---

### `ProcessOptions` Interface

```typescript
interface ProcessOptions {
  cwd?: string;              // Working directory
  env?: Record<string, string>; // Environment variables
  timeoutMs?: number;        // Timeout (default: 30000ms)
  stdin?: string;            // stdin input
}
```

---

### `ProcessResult` Interface

```typescript
interface ProcessResult {
  exitCode: number;    // Exit code (0 = success)
  stdout: string;      // Standard output
  stderr: string;      // Standard error
  durationMs: number;  // Execution time (milliseconds)
}
```

---

## 🎓 Advanced Usage

### 1. Parallel Execution

Execute multiple commands simultaneously:
```typescript
const [result1, result2, result3] = await Promise.all([
  executor.execute('bun', ['test', 'tests/unit']),
  executor.execute('bun', ['test', 'tests/module']),
  executor.execute('bun', ['test', 'tests/integration']),
]);

// Check if all succeeded
if (result1.ok && result2.ok && result3.ok) {
  console.log('✅ All tests passed!');
}
```

### 2. Check Error Code

Result can be ok even if program exits with non-zero code:
```typescript
const result = await executor.execute('grep', ['pattern', 'file.txt']);

if (result.ok) {
  // Execution succeeded, but judge actual result by exitCode
  if (result.value.exitCode === 0) {
    console.log('Pattern found!');
  } else if (result.value.exitCode === 1) {
    console.log('Pattern not found.');
  }
}
```

### 3. Override Environment Variables

Change only specific environment variables:
```typescript
const result = await executor.execute('node', ['script.js'], {
  env: {
    NODE_ENV: 'production',  // Add/override
    DEBUG: '*',              // Enable debug
    // Other environment variables are automatically inherited
  },
});
```

---

## 🔗 Related Modules

- **Logger** (`src/core/logger.ts`) - Logging
- **Result Pattern** (`src/core/types.ts`) - Error handling pattern
- **AdevError** (`src/core/errors.ts`) - Error types

---

## ✅ Checklist

Before using ProcessExecutor:
- [ ] Created Logger instance?
- [ ] Is command spelling correct?
- [ ] Is timeout long enough?
- [ ] Handled errors with Result pattern?
- [ ] Set cwd correctly?

---

**Last Updated:** 2026-03-04
**Author:** documenter agent
