> **Languages:** [한국어](../ko/integration-tester.md) | [English](../en/integration-tester.md) | [日本語](../ja/integration-tester.md) | [Español](../es/integration-tester.md)

# IntegrationTester — Integration Test Runner

## 🎯 What is this?

**Elementary School Analogy:**
IntegrationTester is a "staircase climbing game"!

Climbing a 4-floor building:
- **Floor 1 (Unit)**: Test by feature → Pass to floor 2!
- **Floor 2 (Module)**: Test related features → Pass to floor 3!
- **Floor 3 (Integration)**: Quick test of all features → Pass to floor 4!
- **Floor 4 (E2E)**: Perfect test of entire system → Pass = Success! 🎉

**Important Rule:** If you fail at any floor, game over! Must start from beginning.

This is called "**Fail-Fast**". Fail quickly to fix quickly!

**Technical Description:**
Tester that executes 4-stage integration tests with Fail-Fast principle.
- Step 1: Unit Tests (feature-by-feature E2E)
- Step 2: Module Tests (related feature regression)
- Step 3: Integration Tests (unrelated feature smoke)
- Step 4: E2E Tests (complete integration)
- Executes `bun test` with ProcessExecutor
- Test isolation with CleanEnvManager
- Stops immediately on single failure

---

## 🔍 Why is it needed?

### 1. Fail-Fast Principle
**Problem:** Waste time if you discover failures after running all tests!

**Solution:** Stop immediately on first failure → Fix right away → Start from beginning
```
❌ Bad way: After 10 minutes "Floor 1 failed" → Wasted 10 minutes
✅ Good way: After 30 seconds "Floor 1 failed!" → Fix immediately → Solved in 2 minutes
```

### 2. Test Isolation (Clean Environment)
Each test runs in clean environment:
```typescript
// Test 1: Clean environment
await tester.runIntegrationTests('project-a', '/path/a');

// Test 2: Another clean environment (0% impact from 1)
await tester.runIntegrationTests('project-b', '/path/b');
```

### 3. 4-Stage Cascading Validation
Why divide into 4 stages?
```
Floor 1 (Unit): Check if individual features work
   ↓
Floor 2 (Module): Check if related features work together
   ↓
Floor 3 (Integration): Quick check if all features work
   ↓
Floor 4 (E2E): Check if everything works perfectly like real users
```

Dividing into stages:
- Know immediately where problem occurred
- Efficient from fast tests → slow tests
- Can find problems in small units

---

## 📐 Architecture

### Fail-Fast Flow (Staircase Climbing Game)

```
┌─────────────────┐
│ Start Test      │
└────────┬────────┘
         ↓
┌─────────────────┐
│ Floor 1: Unit   │
└────────┬────────┘
         ↓
     Pass? ───YES──→ ┌─────────────────┐
       │            │ Floor 2: Module │
       NO           └────────┬────────┘
       ↓                     ↓
   ❌ Stop Now          Pass? ───YES──→ ┌──────────────────────┐
   (Fail-Fast)            │            │ Floor 3: Integration │
                          NO           └────────┬─────────────┘
                          ↓                     ↓
                      ❌ Stop Now          Pass? ───YES──→ ┌─────────────────┐
                                            │            │ Floor 4: E2E    │
                                            NO           └────────┬────────┘
                                            ↓                     ↓
                                        ❌ Stop Now          Pass? ───YES──→ ✅ Complete Success!
                                                              │
                                                              NO
                                                              ↓
                                                          ❌ Stop Now
```

### Internal Mechanism

```
┌────────────────────────────────────────────┐
│ IntegrationTester                          │
├────────────────────────────────────────────┤
│ runIntegrationTests()                      │
│   ↓                                        │
│ CleanEnvManager.create() → Create isolated env│
│   ↓                                        │
│ for each step (1~4):                       │
│   ↓                                        │
│   runStep() → ProcessExecutor              │
│   ↓                                        │
│   bun test {testPath}                      │
│   ↓                                        │
│   parseTestResult() → exitCode + stdout    │
│   ↓                                        │
│   passed? ───YES──→ Next step              │
│       │                                    │
│       NO ────→ ❌ break (Fail-Fast)        │
│                                            │
│ CleanEnvManager.destroy() → Clean env      │
└────────────────────────────────────────────┘
```

### Design Improvement Point (Architect Insight)

**Original Design:** Run tester agent with Agent Spawn
```typescript
// Complex way
const testerAgent = await agentSpawner.spawn('tester', config);
await testerAgent.run();
```

**Actual Implementation:** Run `bun test` directly with ProcessExecutor
```typescript
// Simple way
await processExecutor.execute('bun', ['test', 'tests/unit']);
```

**WHY Improved?**
1. **Integration test is just "command execution"** → ProcessExecutor fits
2. **Agent Spawn is complex** → Overhead
3. **Simpler solution** → Faster and more stable

**Lesson:** Always consider simplest solution first!

---

## 🔧 Dependencies

### Direct Dependencies
- `ProcessExecutor` (`src/core/process-executor.ts`) — Run `bun test`
- `CleanEnvManager` (`src/layer2/clean-env-manager.ts`) — Test isolation
- `Logger` (`src/core/logger.ts`) — Logging
- `Result` (`src/core/types.ts`) — Error handling

### Dependency Graph
```
layer2/integration-tester
  ↓
┌─────────────┬─────────────────┬──────────────┐
│ ProcessExecutor │ CleanEnvManager │ core/logger  │
└─────────────┴─────────────────┴──────────────┘
        ↓
    core/types (Result pattern)
```

**Rule:** layer2 can only depend on core, layer1, rag

---

## 📦 How to use?

### Step 1: Create Instance

```typescript
import { IntegrationTester } from '../layer2/integration-tester.js';
import { ProcessExecutor } from '../core/process-executor.js';
import { CleanEnvManager } from '../layer2/clean-env-manager.js';
import { Logger } from '../core/logger.js';

// 1. Create logger
const logger = new Logger({ level: 'info' });

// 2. Create ProcessExecutor
const processExecutor = new ProcessExecutor(logger);

// 3. Create CleanEnvManager
const envManager = new CleanEnvManager(logger, '/tmp/clean-envs');

// 4. Create IntegrationTester
const tester = new IntegrationTester(logger, processExecutor, envManager);
```

### Step 2: Run Integration Tests

```typescript
// Set project path
const projectId = 'my-awesome-project';
const projectPath = '/Users/you/projects/my-project';

// Run integration tests
const result = await tester.runIntegrationTests(projectId, projectPath);

if (result.ok) {
  const results = result.value;

  console.log('✅ Integration test results:');
  results.forEach((stepResult) => {
    console.log(`Step ${stepResult.step}:`, stepResult.passed ? '✅ Passed' : '❌ Failed');
    if (!stepResult.passed) {
      console.log(`   Failures: ${stepResult.failCount}`);
    }
  });

  // All steps passed?
  const allPassed = results.every((r) => r.passed);
  if (allPassed) {
    console.log('🎉 All steps passed!');
  } else {
    console.log('❌ Some steps failed. Fix the code.');
  }
} else {
  console.error('Test execution error:', result.error.message);
}
```

### Step 3: Check Real-time Progress

```typescript
// Check current step
const currentStep = tester.getCurrentStep();
console.log('Current step:', currentStep);

// Check intermediate results
const intermediateResults = tester.getResults();
console.log('Results so far:', intermediateResults);
```

### Step 4: Verify Fail-Fast Behavior

```typescript
// If floor 1 fails, floors 2~4 don't execute
const result = await tester.runIntegrationTests('project', '/path');

if (result.ok) {
  const results = result.value;

  console.log('Steps executed:', results.length);
  // Floor 1 fails → Only 1 executed (Fail-Fast)
  // All pass → All 4 executed
}
```

### Step 5: Test Directory Structure

IntegrationTester finds tests at these paths:
```
/path/to/project/
├── tests/
│   ├── unit/          ← Step 1: Feature tests
│   ├── module/        ← Step 2: Module integration tests
│   ├── integration/   ← Step 3: Complete integration tests
│   └── e2e/           ← Step 4: End-to-End tests
```

Write `.test.ts` files in each directory:
```typescript
// tests/unit/auth.test.ts
import { describe, it, expect } from 'bun:test';

describe('Authentication', () => {
  it('Login success', () => {
    // Test code
    expect(result).toBe(true);
  });
});
```

---

## ⚠️ Cautions

### 1. Test Timeout
**Default timeout: 5 minutes (300 seconds)**

Consider timeout if you have very long E2E tests:
```typescript
// Currently fixed at 5 minutes
// Can add option when creating IntegrationTester if needed
```

**Workarounds:**
- Split tests into smaller pieces
- Consider parallel execution
- Remove unnecessary wait times

### 2. Understand Fail-Fast Meaning
**Fail-Fast is not "fail quickly" but "stop immediately on failure":**

```typescript
// ❌ Wrong understanding: Run all tests quickly
// ✅ Correct understanding: Don't run rest if 1 fails

const result = await tester.runIntegrationTests(projectId, projectPath);

if (result.ok) {
  const results = result.value;

  if (results.length < 4) {
    console.log('Fail-Fast triggered! Only some steps executed');
    console.log('Steps executed:', results.length);
  }
}
```

### 3. Clean Environment Auto-cleanup
Environment automatically cleaned after tests:
```typescript
// Before test: Create clean environment
// During test: Use isolated environment
// After test: Auto-delete environment (success/failure regardless)
```

**Caution:** Files created during tests are deleted with environment!

### 4. Check Both exitCode and failCount
Test pass condition:
```typescript
const passed = exitCode === 0 && failCount === 0;
```

**WHY check both?**
- `exitCode === 0`: Process terminated normally
- `failCount === 0`: No failed tests actually

Fail if either is false!

---

## 💡 Example Code

### Example 1: Analyze Step-by-Step Results

```typescript
/**
 * Output detailed results for each step
 */
async function analyzeStepByStep(
  tester: IntegrationTester,
  projectId: string,
  projectPath: string,
) {
  const result = await tester.runIntegrationTests(projectId, projectPath);

  if (!result.ok) {
    console.error('Test execution error:', result.error.message);
    return;
  }

  const results = result.value;

  console.log('=== Integration Test Detailed Results ===\n');

  const stepNames = ['Unit', 'Module', 'Integration', 'E2E'];

  results.forEach((stepResult, idx) => {
    const name = stepNames[stepResult.step - 1];
    const icon = stepResult.passed ? '✅' : '❌';

    console.log(`${icon} Step ${stepResult.step}: ${name}`);
    console.log(`   Status: ${stepResult.passed ? 'Passed' : 'Failed'}`);
    console.log(`   Failures: ${stepResult.failCount}`);
    console.log('');
  });

  // Check if Fail-Fast triggered
  if (results.length < 4) {
    const failedStep = results.findIndex((r) => !r.passed) + 1;
    console.log(`⚠️ Fail-Fast triggered! Stopped at Step ${failedStep}.`);
  } else if (results.every((r) => r.passed)) {
    console.log('🎉 All steps passed! Ready to deploy!');
  }
}
```

### Example 2: Auto-retry (Give Fix Opportunity on Failure, Then Retry)

```typescript
/**
 * Give user fix opportunity on failure, then retry
 */
async function runWithRetry(
  tester: IntegrationTester,
  projectId: string,
  projectPath: string,
  maxRetries = 3,
) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`\n=== Attempt ${attempt}/${maxRetries} ===`);

    const result = await tester.runIntegrationTests(projectId, projectPath);

    if (!result.ok) {
      console.error('Test execution error:', result.error.message);
      continue;
    }

    const results = result.value;
    const allPassed = results.every((r) => r.passed);

    if (allPassed) {
      console.log('✅ All tests passed!');
      return true;
    }

    // Find failed step
    const failedStep = results.find((r) => !r.passed);
    if (failedStep) {
      console.log(`❌ Step ${failedStep.step} failed (${failedStep.failCount} failures)`);

      if (attempt < maxRetries) {
        console.log('\nPress Enter after fixing code to continue...');
        // In reality, wait for user input with readline
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  console.log('❌ Maximum retries exceeded');
  return false;
}
```

### Example 3: Real-time Progress Display

```typescript
/**
 * Display test progress in real-time
 */
async function runWithProgress(
  tester: IntegrationTester,
  projectId: string,
  projectPath: string,
) {
  const stepNames = ['Unit', 'Module', 'Integration', 'E2E'];

  console.log('Starting integration tests...\n');

  // Progress display interval
  const progressInterval = setInterval(() => {
    const currentStep = tester.getCurrentStep();
    const results = tester.getResults();

    if (currentStep > 0) {
      const currentName = stepNames[currentStep - 1];
      console.log(`Currently running: Step ${currentStep} (${currentName})...`);
    }

    results.forEach((result, idx) => {
      if (result.passed) {
        console.log(`✅ Step ${result.step} completed`);
      }
    });
  }, 2000);

  const result = await tester.runIntegrationTests(projectId, projectPath);

  clearInterval(progressInterval);

  if (result.ok) {
    console.log('\nTests completed!');
  }
}
```

---

## 🐛 What to do when errors occur?

### Error Code Types

#### 1. ProcessExecutor Error
**Cause:** `bun test` command execution failed

**Solution:**
```typescript
const result = await tester.runIntegrationTests(projectId, projectPath);

if (!result.ok && result.error.code === 'process_execution_error') {
  console.error('bun test execution failed:');
  console.error('1. Check if Bun is installed');
  console.error('2. Check if project path is correct');
  console.error('3. Check if tests/ directory exists');

  // Verify path
  console.log('Project path:', projectPath);
}
```

#### 2. CleanEnvManager Error
**Cause:** Failed to create/delete isolated environment

**Solution:**
```typescript
if (!result.ok && result.error.code === 'env_creation_failed') {
  console.error('Clean environment creation failed:');
  console.error('1. Check /tmp directory write permissions');
  console.error('2. Check disk space');
  console.error('3. Clean previous environments (rm -rf /tmp/clean-envs)');
}
```

#### 3. Test Timeout
**Cause:** Tests did not complete within 5 minutes

**Solution:**
```typescript
// Currently fixed at 5 minutes, need to optimize tests
console.error('Test timeout:');
console.error('1. Identify slow tests (bun test --bail)');
console.error('2. Consider parallel execution');
console.error('3. Remove unnecessary wait times');
```

### Step-by-Step Failure Handling

```typescript
const result = await tester.runIntegrationTests(projectId, projectPath);

if (result.ok) {
  const results = result.value;

  // Analyze failure cause for each step
  results.forEach((stepResult) => {
    if (!stepResult.passed) {
      console.error(`\n❌ Step ${stepResult.step} failure analysis:`);

      switch (stepResult.step) {
        case 1:
          console.error('Unit Tests failed:');
          console.error('→ Problem with individual functions or classes.');
          console.error('→ Check tests in tests/unit/ directory.');
          break;

        case 2:
          console.error('Module Tests failed:');
          console.error('→ Problem with module integration.');
          console.error('→ Check tests in tests/module/ directory.');
          break;

        case 3:
          console.error('Integration Tests failed:');
          console.error('→ Problem with complete system integration.');
          console.error('→ Check tests in tests/integration/ directory.');
          break;

        case 4:
          console.error('E2E Tests failed:');
          console.error('→ Problem with actual user scenarios.');
          console.error('→ Check tests in tests/e2e/ directory.');
          break;
      }

      console.error(`Failed test count: ${stepResult.failCount}`);
    }
  });
}
```

---

## 📊 API Reference

### `IntegrationTester` Class

#### Constructor
```typescript
constructor(
  logger: Logger,
  processExecutor: ProcessExecutor,
  envManager: CleanEnvManager,
)
```

**Parameters:**
- `logger`: Logger instance
- `processExecutor`: ProcessExecutor instance (for `bun test` execution)
- `envManager`: CleanEnvManager instance (for test isolation)

---

#### `runIntegrationTests()` Method
```typescript
async runIntegrationTests(
  projectId: string,
  projectPath: string,
): Promise<Result<readonly IntegrationStepResult[]>>
```

**Parameters:**
- `projectId`: Project unique ID
- `projectPath`: Project absolute path

**Return Value:**
- Success: `IntegrationStepResult[]` (each step result)
- Failure: `AgentError`

**Behavior:**
1. Create isolated environment with CleanEnvManager
2. Execute 4 stages sequentially (Fail-Fast)
3. Auto-cleanup environment (success/failure regardless)

---

#### `getCurrentStep()` Method
```typescript
getCurrentStep(): number
```

**Return Value:** Currently running step (0 if not started)

---

#### `getResults()` Method
```typescript
getResults(): IntegrationStepResult[]
```

**Return Value:** Array of results for steps executed so far

---

### `IntegrationStepResult` Interface

```typescript
interface IntegrationStepResult {
  step: 1 | 2 | 3 | 4;  // Step number
  passed: boolean;      // Pass status
  failCount: number;    // Number of failed tests
}
```

---

## 🧪 Test Writing Guide

### Test Directory Structure

```
tests/
├── unit/              ← Step 1: Individual feature tests
│   ├── auth.test.ts
│   ├── config.test.ts
│   └── logger.test.ts
│
├── module/            ← Step 2: Module integration tests
│   ├── auth-module.test.ts
│   └── rag-module.test.ts
│
├── integration/       ← Step 3: Complete integration smoke tests
│   └── system.test.ts
│
└── e2e/               ← Step 4: End-to-End user scenarios
    ├── login-flow.test.ts
    └── complete-task.test.ts
```

### Test Writing Examples

#### Step 1: Unit Test
```typescript
// tests/unit/auth.test.ts
import { describe, it, expect } from 'bun:test';
import { authenticate } from '../../src/auth/api-key-auth.js';

describe('Authentication', () => {
  it('Authentication success with valid API key', async () => {
    const result = await authenticate('valid-key');
    expect(result.ok).toBe(true);
  });

  it('Authentication failure with invalid API key', async () => {
    const result = await authenticate('invalid-key');
    expect(result.ok).toBe(false);
  });
});
```

#### Step 2: Module Test
```typescript
// tests/module/auth-module.test.ts
import { describe, it, expect } from 'bun:test';
import { AuthManager } from '../../src/auth/auth-manager.js';

describe('Auth Module', () => {
  it('API key auth → Rate limit tracking', async () => {
    const manager = new AuthManager();
    await manager.authenticate('valid-key');

    const rateLimit = manager.getRateLimitStatus();
    expect(rateLimit.remaining).toBeGreaterThan(0);
  });
});
```

#### Step 3: Integration Test
```typescript
// tests/integration/system.test.ts
import { describe, it, expect } from 'bun:test';

describe('System Integration', () => {
  it('Complete system initialization and basic operation', async () => {
    // Simple smoke test
    const system = await initializeSystem();
    expect(system.isReady()).toBe(true);
  });
});
```

#### Step 4: E2E Test
```typescript
// tests/e2e/complete-task.test.ts
import { describe, it, expect } from 'bun:test';

describe('Complete Task E2E', () => {
  it('User completes entire task', async () => {
    // 1. Login
    const user = await login('test@example.com', 'password');
    expect(user).toBeDefined();

    // 2. Create project
    const project = await createProject('My Project');
    expect(project.id).toBeDefined();

    // 3. Execute task
    const result = await runTask(project.id, 'Build feature');
    expect(result.success).toBe(true);
  });
});
```

---

## 🎓 Advanced Usage

### 1. Run Specific Step Only (Currently Not Supported)

```typescript
// Currently can only run all 4 steps
// Future improvement: Can add feature to start from specific step

// Expected interface:
// await tester.runFrom(3, projectId, projectPath); // Start from Step 3
```

### 2. Parallel Project Testing

```typescript
// Test multiple projects in parallel
const projects = [
  { id: 'project-a', path: '/path/a' },
  { id: 'project-b', path: '/path/b' },
  { id: 'project-c', path: '/path/c' },
];

const results = await Promise.all(
  projects.map(({ id, path }) =>
    tester.runIntegrationTests(id, path),
  ),
);

results.forEach((result, idx) => {
  const { id } = projects[idx]!;
  if (result.ok) {
    const allPassed = result.value.every((r) => r.passed);
    console.log(`${id}:`, allPassed ? '✅' : '❌');
  }
});
```

### 3. Save Test Results to LanceDB

```typescript
/**
 * Permanently save integration test results to LanceDB
 */
async function saveTestResultsToDb(
  tester: IntegrationTester,
  vectorStore: VectorStore,
  projectId: string,
  projectPath: string,
) {
  const result = await tester.runIntegrationTests(projectId, projectPath);

  if (result.ok) {
    const results = result.value;

    // Save to LanceDB
    await vectorStore.addDocument({
      id: `test-${projectId}-${Date.now()}`,
      content: JSON.stringify({
        projectId,
        timestamp: new Date().toISOString(),
        results,
        allPassed: results.every((r) => r.passed),
      }),
      metadata: { type: 'integration-test-result' },
    });

    console.log('Test results saved');
  }
}
```

---

## 🔗 Related Modules

- **ProcessExecutor** (`src/core/process-executor.ts`) - `bun test` execution
- **CleanEnvManager** (`src/layer2/clean-env-manager.ts`) - Test isolation
- **Logger** (`src/core/logger.ts`) - Logging
- **Result Pattern** (`src/core/types.ts`) - Error handling
- **AgentError** (`src/core/errors.ts`) - Error types

---

## ✅ Checklist

Before using IntegrationTester:
- [ ] Is tests/ directory structure correct? (unit, module, integration, e2e)
- [ ] Are there .test.ts files in each directory?
- [ ] Is Bun installed?
- [ ] Created ProcessExecutor and CleanEnvManager?
- [ ] Is project path absolute?
- [ ] Understand Fail-Fast principle?
- [ ] Is test timeout (5 minutes) sufficient?

---

**Last Updated:** 2026-03-04
**Author:** documenter agent
**Architect Score:** 100/100
**Reference Code:** src/layer2/integration-tester.ts (252 lines)
**Design Improvement:** Agent Spawn → ProcessExecutor (simplicity wins!)
