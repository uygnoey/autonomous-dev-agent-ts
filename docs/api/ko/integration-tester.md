> **Languages:** [한국어](../ko/integration-tester.md) | [English](../en/integration-tester.md) | [日本語](../ja/integration-tester.md) | [Español](../es/integration-tester.md)

# IntegrationTester — 통합 테스트 실행기

## 🎯 이게 뭐야?

**초등학생 비유:**
IntegrationTester는 "계단 오르기 게임"이에요!

4층 건물을 오르는데:
- **1층 (Unit)**: 기능별 테스트 → 통과하면 2층으로!
- **2층 (Module)**: 관련 기능 테스트 → 통과하면 3층으로!
- **3층 (Integration)**: 전체 기능 간단 테스트 → 통과하면 4층으로!
- **4층 (E2E)**: 전체 시스템 완벽 테스트 → 통과하면 성공! 🎉

**중요한 규칙:** 한 층이라도 실패하면 게임 오버! 처음부터 다시 시작해야 해요.

이걸 "**Fail-Fast**"라고 해요. 빨리 실패해서 빨리 고치는 거죠!

**기술 설명:**
4단계 통합 테스트를 Fail-Fast 원칙으로 실행하는 테스터입니다.
- Step 1: Unit Tests (기능별 E2E)
- Step 2: Module Tests (관련 기능 회귀)
- Step 3: Integration Tests (비관련 기능 스모크)
- Step 4: E2E Tests (전체 통합)
- ProcessExecutor로 `bun test` 실행
- CleanEnvManager로 테스트 격리
- 1개 실패 시 즉시 중단

---

## 🔍 왜 필요해?

### 1. Fail-Fast 원칙
**문제:** 모든 테스트를 다 돌리고 나서 실패를 발견하면 시간 낭비!

**해결:** 첫 실패에서 즉시 중단 → 바로 고치기 → 다시 처음부터
```
❌ 나쁜 방법: 10분 돌린 후 "1층에서 실패했네요" → 10분 낭비
✅ 좋은 방법: 30초 만에 "1층 실패!" → 바로 고침 → 2분 만에 해결
```

### 2. 테스트 격리 (Clean Environment)
각 테스트마다 깨끗한 환경에서 실행:
```typescript
// 테스트 1: 깨끗한 환경
await tester.runIntegrationTests('project-a', '/path/a');

// 테스트 2: 또 다른 깨끗한 환경 (1의 영향 0%)
await tester.runIntegrationTests('project-b', '/path/b');
```

### 3. 4단계 계단식 검증
왜 4단계로 나눌까요?
```
1층 (Unit): 개별 기능이 작동하는지 확인
   ↓
2층 (Module): 관련된 기능끼리 잘 동작하는지 확인
   ↓
3층 (Integration): 전체 기능이 간단히 동작하는지 확인
   ↓
4층 (E2E): 실제 사용자처럼 완벽하게 동작하는지 확인
```

단계를 나누면:
- 어디서 문제가 생겼는지 바로 알 수 있음
- 빠른 테스트 → 느린 테스트 순서로 효율적
- 문제를 작은 단위로 찾을 수 있음

---

## 📐 아키텍처

### Fail-Fast 흐름도 (계단 오르기 게임)

```
┌─────────────────┐
│ 테스트 시작      │
└────────┬────────┘
         ↓
┌─────────────────┐
│ 1층: Unit Tests │
└────────┬────────┘
         ↓
     통과? ───YES──→ ┌─────────────────┐
       │            │ 2층: Module Tests│
       NO           └────────┬────────┘
       ↓                     ↓
   ❌ 즉시 중단          통과? ───YES──→ ┌──────────────────────┐
   (Fail-Fast)            │            │ 3층: Integration Tests│
                          NO           └────────┬─────────────┘
                          ↓                     ↓
                      ❌ 즉시 중단          통과? ───YES──→ ┌─────────────────┐
                                            │            │ 4층: E2E Tests   │
                                            NO           └────────┬────────┘
                                            ↓                     ↓
                                        ❌ 즉시 중단          통과? ───YES──→ ✅ 전체 성공!
                                                              │
                                                              NO
                                                              ↓
                                                          ❌ 즉시 중단
```

### 내부 메커니즘

```
┌────────────────────────────────────────────┐
│ IntegrationTester                          │
├────────────────────────────────────────────┤
│ runIntegrationTests()                      │
│   ↓                                        │
│ CleanEnvManager.create() → 격리된 환경 생성│
│   ↓                                        │
│ for each step (1~4):                       │
│   ↓                                        │
│   runStep() → ProcessExecutor              │
│   ↓                                        │
│   bun test {testPath}                      │
│   ↓                                        │
│   parseTestResult() → exitCode + stdout    │
│   ↓                                        │
│   passed? ───YES──→ 다음 단계              │
│       │                                    │
│       NO ────→ ❌ break (Fail-Fast)        │
│                                            │
│ CleanEnvManager.destroy() → 환경 정리      │
└────────────────────────────────────────────┘
```

### 설계 개선 포인트 (Architect 인사이트)

**원래 설계:** Agent Spawn으로 tester 에이전트 실행
```typescript
// 복잡한 방법
const testerAgent = await agentSpawner.spawn('tester', config);
await testerAgent.run();
```

**실제 구현:** ProcessExecutor로 `bun test` 직접 실행
```typescript
// 단순한 방법
await processExecutor.execute('bun', ['test', 'tests/unit']);
```

**WHY 개선됐을까?**
1. **통합 테스트는 "명령 실행"이 전부** → ProcessExecutor가 적합
2. **Agent Spawn은 복잡함** → 오버헤드
3. **더 단순한 해결책** → 더 빠르고 안정적

**교훈:** 항상 가장 단순한 해결책부터 고려하라!

---

## 🔧 의존성

### 직접 의존성
- `ProcessExecutor` (`src/core/process-executor.ts`) — `bun test` 실행
- `CleanEnvManager` (`src/layer2/clean-env-manager.ts`) — 테스트 격리
- `Logger` (`src/core/logger.ts`) — 로깅
- `Result` (`src/core/types.ts`) — 에러 처리

### 의존성 그래프
```
layer2/integration-tester
  ↓
┌─────────────┬─────────────────┬──────────────┐
│ ProcessExecutor │ CleanEnvManager │ core/logger  │
└─────────────┴─────────────────┴──────────────┘
        ↓
    core/types (Result 패턴)
```

**규칙:** layer2는 core, layer1, rag에만 의존 가능

---

## 📦 어떻게 쓰는지?

### 단계 1: 인스턴스 생성

```typescript
import { IntegrationTester } from '../layer2/integration-tester.js';
import { ProcessExecutor } from '../core/process-executor.js';
import { CleanEnvManager } from '../layer2/clean-env-manager.js';
import { Logger } from '../core/logger.js';

// 1. 로거 생성
const logger = new Logger({ level: 'info' });

// 2. ProcessExecutor 생성
const processExecutor = new ProcessExecutor(logger);

// 3. CleanEnvManager 생성
const envManager = new CleanEnvManager(logger, '/tmp/clean-envs');

// 4. IntegrationTester 생성
const tester = new IntegrationTester(logger, processExecutor, envManager);
```

### 단계 2: 통합 테스트 실행

```typescript
// 프로젝트 경로 설정
const projectId = 'my-awesome-project';
const projectPath = '/Users/you/projects/my-project';

// 통합 테스트 실행
const result = await tester.runIntegrationTests(projectId, projectPath);

if (result.ok) {
  const results = result.value;

  console.log('✅ 통합 테스트 결과:');
  results.forEach((stepResult) => {
    console.log(`Step ${stepResult.step}:`, stepResult.passed ? '✅ 통과' : '❌ 실패');
    if (!stepResult.passed) {
      console.log(`   실패 개수: ${stepResult.failCount}`);
    }
  });

  // 모든 단계 통과?
  const allPassed = results.every((r) => r.passed);
  if (allPassed) {
    console.log('🎉 모든 단계 통과!');
  } else {
    console.log('❌ 일부 단계 실패. 코드를 수정하세요.');
  }
} else {
  console.error('테스트 실행 에러:', result.error.message);
}
```

### 단계 3: 실시간 진행 상황 확인

```typescript
// 현재 진행 중인 단계 확인
const currentStep = tester.getCurrentStep();
console.log('현재 단계:', currentStep);

// 중간 결과 확인
const intermediateResults = tester.getResults();
console.log('지금까지 결과:', intermediateResults);
```

### 단계 4: Fail-Fast 동작 확인

```typescript
// 1층에서 실패하면 2~4층은 실행되지 않음
const result = await tester.runIntegrationTests('project', '/path');

if (result.ok) {
  const results = result.value;

  console.log('실행된 단계 수:', results.length);
  // 1층 실패 시 → 1개만 실행됨 (Fail-Fast)
  // 모두 통과 시 → 4개 전부 실행됨
}
```

### 단계 5: 테스트 디렉토리 구조

IntegrationTester는 다음 경로에서 테스트를 찾습니다:
```
/path/to/project/
├── tests/
│   ├── unit/          ← Step 1: 기능별 테스트
│   ├── module/        ← Step 2: 모듈 통합 테스트
│   ├── integration/   ← Step 3: 전체 통합 테스트
│   └── e2e/           ← Step 4: End-to-End 테스트
```

각 디렉토리에 `.test.ts` 파일을 작성하세요:
```typescript
// tests/unit/auth.test.ts
import { describe, it, expect } from 'bun:test';

describe('Authentication', () => {
  it('로그인 성공', () => {
    // 테스트 코드
    expect(result).toBe(true);
  });
});
```

---

## ⚠️ 조심할 점

### 1. 테스트 타임아웃
**기본 타임아웃: 5분 (300초)**

매우 오래 걸리는 E2E 테스트가 있다면 타임아웃을 고려하세요:
```typescript
// 현재는 5분 고정
// 필요하면 IntegrationTester 생성 시 옵션 추가 가능
```

**회피 방법:**
- 테스트를 작게 나누기
- 병렬 실행 고려
- 불필요한 대기 시간 제거

### 2. Fail-Fast 의미 이해
**Fail-Fast는 "빨리 실패"가 아니라 "실패 시 즉시 중단"입니다:**

```typescript
// ❌ 잘못된 이해: 모든 테스트를 빨리 실행
// ✅ 올바른 이해: 1개 실패 시 나머지는 실행 안 함

const result = await tester.runIntegrationTests(projectId, projectPath);

if (result.ok) {
  const results = result.value;

  if (results.length < 4) {
    console.log('Fail-Fast 발동! 일부 단계만 실행됨');
    console.log('실행된 단계:', results.length);
  }
}
```

### 3. Clean Environment 자동 정리
테스트 완료 후 자동으로 환경이 정리됩니다:
```typescript
// 테스트 전: 깨끗한 환경 생성
// 테스트 중: 격리된 환경 사용
// 테스트 후: 자동으로 환경 삭제 (성공/실패 무관)
```

**주의:** 테스트 중 생성된 파일은 환경과 함께 삭제됩니다!

### 4. exitCode와 failCount 동시 체크
테스트 통과 조건:
```typescript
const passed = exitCode === 0 && failCount === 0;
```

**WHY 둘 다 체크?**
- `exitCode === 0`: 프로세스가 정상 종료
- `failCount === 0`: 실제로 실패한 테스트 없음

둘 중 하나라도 false면 실패로 판정!

---

## 💡 예제 코드

### 예제 1: 단계별 결과 분석

```typescript
/**
 * 각 단계별로 상세 결과 출력
 */
async function analyzeStepByStep(
  tester: IntegrationTester,
  projectId: string,
  projectPath: string,
) {
  const result = await tester.runIntegrationTests(projectId, projectPath);

  if (!result.ok) {
    console.error('테스트 실행 에러:', result.error.message);
    return;
  }

  const results = result.value;

  console.log('=== 통합 테스트 상세 결과 ===\n');

  const stepNames = ['Unit', 'Module', 'Integration', 'E2E'];

  results.forEach((stepResult, idx) => {
    const name = stepNames[stepResult.step - 1];
    const icon = stepResult.passed ? '✅' : '❌';

    console.log(`${icon} Step ${stepResult.step}: ${name}`);
    console.log(`   상태: ${stepResult.passed ? '통과' : '실패'}`);
    console.log(`   실패 개수: ${stepResult.failCount}`);
    console.log('');
  });

  // Fail-Fast 발동 여부 확인
  if (results.length < 4) {
    const failedStep = results.findIndex((r) => !r.passed) + 1;
    console.log(`⚠️ Fail-Fast 발동! Step ${failedStep}에서 중단되었습니다.`);
  } else if (results.every((r) => r.passed)) {
    console.log('🎉 모든 단계 통과! 배포 준비 완료!');
  }
}
```

### 예제 2: 자동 재시도 (실패 시 코드 수정 후 재실행)

```typescript
/**
 * 실패 시 사용자에게 수정 기회 제공 후 재시도
 */
async function runWithRetry(
  tester: IntegrationTester,
  projectId: string,
  projectPath: string,
  maxRetries = 3,
) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`\n=== 시도 ${attempt}/${maxRetries} ===`);

    const result = await tester.runIntegrationTests(projectId, projectPath);

    if (!result.ok) {
      console.error('테스트 실행 에러:', result.error.message);
      continue;
    }

    const results = result.value;
    const allPassed = results.every((r) => r.passed);

    if (allPassed) {
      console.log('✅ 모든 테스트 통과!');
      return true;
    }

    // 실패한 단계 찾기
    const failedStep = results.find((r) => !r.passed);
    if (failedStep) {
      console.log(`❌ Step ${failedStep.step} 실패 (${failedStep.failCount}개)`);

      if (attempt < maxRetries) {
        console.log('\n코드를 수정한 후 계속하려면 Enter를 누르세요...');
        // 실제로는 readline 등으로 사용자 입력 대기
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  console.log('❌ 최대 재시도 횟수 초과');
  return false;
}
```

### 예제 3: 실시간 진행 표시

```typescript
/**
 * 테스트 진행 상황을 실시간으로 표시
 */
async function runWithProgress(
  tester: IntegrationTester,
  projectId: string,
  projectPath: string,
) {
  const stepNames = ['Unit', 'Module', 'Integration', 'E2E'];

  console.log('통합 테스트 시작...\n');

  // 진행 상황 표시용 인터벌
  const progressInterval = setInterval(() => {
    const currentStep = tester.getCurrentStep();
    const results = tester.getResults();

    if (currentStep > 0) {
      const currentName = stepNames[currentStep - 1];
      console.log(`현재 실행 중: Step ${currentStep} (${currentName})...`);
    }

    results.forEach((result, idx) => {
      if (result.passed) {
        console.log(`✅ Step ${result.step} 완료`);
      }
    });
  }, 2000);

  const result = await tester.runIntegrationTests(projectId, projectPath);

  clearInterval(progressInterval);

  if (result.ok) {
    console.log('\n테스트 완료!');
  }
}
```

---

## 🐛 에러 나면 어떻게?

### 에러 코드 종류

#### 1. ProcessExecutor 에러
**원인:** `bun test` 명령 실행 실패

**해결:**
```typescript
const result = await tester.runIntegrationTests(projectId, projectPath);

if (!result.ok && result.error.code === 'process_execution_error') {
  console.error('bun test 실행 실패:');
  console.error('1. Bun이 설치되어 있는지 확인');
  console.error('2. 프로젝트 경로가 올바른지 확인');
  console.error('3. tests/ 디렉토리가 존재하는지 확인');

  // 경로 확인
  console.log('프로젝트 경로:', projectPath);
}
```

#### 2. CleanEnvManager 에러
**원인:** 격리된 환경 생성/삭제 실패

**해결:**
```typescript
if (!result.ok && result.error.code === 'env_creation_failed') {
  console.error('클린 환경 생성 실패:');
  console.error('1. /tmp 디렉토리 쓰기 권한 확인');
  console.error('2. 디스크 공간 확인');
  console.error('3. 이전 환경 정리 (rm -rf /tmp/clean-envs)');
}
```

#### 3. Test Timeout
**원인:** 테스트가 5분 내에 완료되지 않음

**해결:**
```typescript
// 현재는 5분 고정이므로, 테스트를 최적화해야 함
console.error('테스트 타임아웃:');
console.error('1. 느린 테스트 식별 (bun test --bail)');
console.error('2. 병렬 실행 고려');
console.error('3. 불필요한 대기 시간 제거');
```

### 단계별 실패 처리

```typescript
const result = await tester.runIntegrationTests(projectId, projectPath);

if (result.ok) {
  const results = result.value;

  // 각 단계별로 실패 원인 분석
  results.forEach((stepResult) => {
    if (!stepResult.passed) {
      console.error(`\n❌ Step ${stepResult.step} 실패 분석:`);

      switch (stepResult.step) {
        case 1:
          console.error('Unit Tests 실패:');
          console.error('→ 개별 함수나 클래스에 문제가 있습니다.');
          console.error('→ tests/unit/ 디렉토리의 테스트를 확인하세요.');
          break;

        case 2:
          console.error('Module Tests 실패:');
          console.error('→ 모듈 간 통합에 문제가 있습니다.');
          console.error('→ tests/module/ 디렉토리의 테스트를 확인하세요.');
          break;

        case 3:
          console.error('Integration Tests 실패:');
          console.error('→ 전체 시스템 통합에 문제가 있습니다.');
          console.error('→ tests/integration/ 디렉토리의 테스트를 확인하세요.');
          break;

        case 4:
          console.error('E2E Tests 실패:');
          console.error('→ 실제 사용자 시나리오에 문제가 있습니다.');
          console.error('→ tests/e2e/ 디렉토리의 테스트를 확인하세요.');
          break;
      }

      console.error(`실패한 테스트 개수: ${stepResult.failCount}`);
    }
  });
}
```

---

## 📊 API 레퍼런스

### `IntegrationTester` 클래스

#### 생성자
```typescript
constructor(
  logger: Logger,
  processExecutor: ProcessExecutor,
  envManager: CleanEnvManager,
)
```

**매개변수:**
- `logger`: Logger 인스턴스
- `processExecutor`: ProcessExecutor 인스턴스 (`bun test` 실행용)
- `envManager`: CleanEnvManager 인스턴스 (테스트 격리용)

---

#### `runIntegrationTests()` 메서드
```typescript
async runIntegrationTests(
  projectId: string,
  projectPath: string,
): Promise<Result<readonly IntegrationStepResult[]>>
```

**매개변수:**
- `projectId`: 프로젝트 고유 ID
- `projectPath`: 프로젝트 절대 경로

**반환값:**
- 성공 시: `IntegrationStepResult[]` (각 단계 결과)
- 실패 시: `AgentError`

**동작:**
1. CleanEnvManager로 격리된 환경 생성
2. 4단계 순차 실행 (Fail-Fast)
3. 환경 자동 정리 (성공/실패 무관)

---

#### `getCurrentStep()` 메서드
```typescript
getCurrentStep(): number
```

**반환값:** 현재 진행 중인 단계 (0이면 미시작)

---

#### `getResults()` 메서드
```typescript
getResults(): IntegrationStepResult[]
```

**반환값:** 지금까지 실행된 단계의 결과 배열

---

### `IntegrationStepResult` 인터페이스

```typescript
interface IntegrationStepResult {
  step: 1 | 2 | 3 | 4;  // 단계 번호
  passed: boolean;      // 통과 여부
  failCount: number;    // 실패한 테스트 개수
}
```

---

## 🧪 테스트 작성 가이드

### 테스트 디렉토리 구조

```
tests/
├── unit/              ← Step 1: 개별 기능 테스트
│   ├── auth.test.ts
│   ├── config.test.ts
│   └── logger.test.ts
│
├── module/            ← Step 2: 모듈 통합 테스트
│   ├── auth-module.test.ts
│   └── rag-module.test.ts
│
├── integration/       ← Step 3: 전체 통합 스모크 테스트
│   └── system.test.ts
│
└── e2e/               ← Step 4: End-to-End 사용자 시나리오
    ├── login-flow.test.ts
    └── complete-task.test.ts
```

### 테스트 작성 예제

#### Step 1: Unit Test
```typescript
// tests/unit/auth.test.ts
import { describe, it, expect } from 'bun:test';
import { authenticate } from '../../src/auth/api-key-auth.js';

describe('Authentication', () => {
  it('올바른 API key로 인증 성공', async () => {
    const result = await authenticate('valid-key');
    expect(result.ok).toBe(true);
  });

  it('잘못된 API key로 인증 실패', async () => {
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
  it('API key 인증 → Rate limit 추적', async () => {
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
  it('전체 시스템 초기화 및 기본 작동', async () => {
    // 간단한 스모크 테스트
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
  it('사용자가 작업 전체를 완료', async () => {
    // 1. 로그인
    const user = await login('test@example.com', 'password');
    expect(user).toBeDefined();

    // 2. 프로젝트 생성
    const project = await createProject('My Project');
    expect(project.id).toBeDefined();

    // 3. 작업 실행
    const result = await runTask(project.id, 'Build feature');
    expect(result.success).toBe(true);
  });
});
```

---

## 🎓 고급 사용법

### 1. 특정 단계만 실행 (현재 미지원)

```typescript
// 현재는 전체 4단계만 실행 가능
// 향후 개선: 특정 단계부터 시작하는 기능 추가 가능

// 예상 인터페이스:
// await tester.runFrom(3, projectId, projectPath); // Step 3부터 시작
```

### 2. 병렬 프로젝트 테스트

```typescript
// 여러 프로젝트를 병렬로 테스트
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

### 3. 테스트 결과 LanceDB 저장

```typescript
/**
 * 통합 테스트 결과를 LanceDB에 영구 저장
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

    // LanceDB에 저장
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

    console.log('테스트 결과 저장 완료');
  }
}
```

---

## 🔗 관련 모듈

- **ProcessExecutor** (`src/core/process-executor.ts`) - `bun test` 실행
- **CleanEnvManager** (`src/layer2/clean-env-manager.ts`) - 테스트 격리
- **Logger** (`src/core/logger.ts`) - 로깅
- **Result 패턴** (`src/core/types.ts`) - 에러 처리
- **AgentError** (`src/core/errors.ts`) - 에러 타입

---

## ✅ 체크리스트

IntegrationTester를 사용하기 전에:
- [ ] tests/ 디렉토리 구조가 올바른가요? (unit, module, integration, e2e)
- [ ] 각 디렉토리에 .test.ts 파일이 있나요?
- [ ] Bun이 설치되어 있나요?
- [ ] ProcessExecutor와 CleanEnvManager를 생성했나요?
- [ ] 프로젝트 경로가 절대 경로인가요?
- [ ] Fail-Fast 원칙을 이해했나요?
- [ ] 테스트 타임아웃(5분)이 충분한가요?

---

**마지막 업데이트:** 2026-03-04
**작성자:** documenter 에이전트
**Architect 점수:** 100/100
**참조 코드:** src/layer2/integration-tester.ts (252줄)
**설계 개선:** Agent Spawn → ProcessExecutor (단순함이 승리!)
