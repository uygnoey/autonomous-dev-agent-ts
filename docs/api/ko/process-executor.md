> **Languages:** [한국어](../ko/process-executor.md) | [English](../en/process-executor.md) | [日本語](../ja/process-executor.md) | [Español](../es/process-executor.md)

# ProcessExecutor — 프로세스 실행기

## 🎯 이게 뭐야?

**초등학생 비유:**
컴퓨터에게 "다른 프로그램 실행해줘!" 하고 부탁하는 로봇이에요.

예를 들어:
- "git" 프로그램 실행해서 → 코드 상태 확인
- "bun test" 실행해서 → 테스트 돌리기
- "ls" 실행해서 → 파일 목록 보기

로봇은 프로그램이 끝날 때까지 기다렸다가, 결과를 가져다줘요.

**기술 설명:**
`Bun.spawn`을 래핑한 외부 프로세스 실행 유틸리티입니다.
- stdout/stderr 자동 캡처
- 타임아웃 관리
- 에러 처리 통합
- Result 패턴 반환

---

## 🔍 왜 필요해?

### 1. 안전한 실행
직접 `Bun.spawn`을 쓰면:
- 타임아웃 처리를 매번 구현해야 함
- 출력이 너무 크면 메모리 터짐
- 에러 처리가 복잡함

ProcessExecutor는 이걸 자동으로 해결해줍니다.

### 2. 일관된 인터페이스
모든 프로세스 실행이 같은 방식:
```typescript
const result = await executor.execute('명령어', ['인자들']);
if (result.ok) {
  console.log(result.value.stdout); // 결과 출력
}
```

### 3. 관찰 가능성
모든 프로세스 실행이 Logger를 통해 기록됩니다.
- 어떤 명령 실행했는지
- 얼마나 걸렸는지
- 에러는 뭐였는지

---

## 📦 어떻게 쓰는지?

### 단계 1: 인스턴스 생성

```typescript
import { ProcessExecutor } from '../core/process-executor.js';
import { Logger } from '../core/logger.js';

// 로거 생성
const logger = new Logger({ level: 'info' });

// ProcessExecutor 생성
const executor = new ProcessExecutor(logger);
```

### 단계 2: 간단한 명령 실행

```typescript
// 'ls -la' 실행
const result = await executor.execute('ls', ['-la']);

if (result.ok) {
  console.log('실행 성공!');
  console.log('종료 코드:', result.value.exitCode); // 0
  console.log('출력:', result.value.stdout);
  console.log('실행 시간:', result.value.durationMs, 'ms');
} else {
  console.error('실행 실패:', result.error.message);
}
```

### 단계 3: 옵션과 함께 실행

```typescript
// Git status 확인 (특정 디렉토리에서)
const result = await executor.execute('git', ['status'], {
  cwd: '/path/to/project', // 작업 디렉토리
  timeoutMs: 10000,         // 10초 타임아웃
  env: {                     // 환경변수 추가
    GIT_PAGER: 'cat',
  },
});

if (result.ok) {
  console.log(result.value.stdout);
}
```

### 단계 4: stdin 입력과 함께 실행

```typescript
// echo 명령에 입력 전달
const result = await executor.execute('cat', [], {
  stdin: 'Hello, World!\n', // stdin으로 전달
});

if (result.ok) {
  console.log(result.value.stdout); // "Hello, World!"
}
```

### 단계 5: 테스트 실행 예제

```typescript
// Bun 테스트 실행
const result = await executor.execute('bun', ['test', 'tests/unit'], {
  cwd: '/project/path',
  timeoutMs: 300000, // 5분 타임아웃 (테스트는 오래 걸릴 수 있음)
});

if (result.ok) {
  const { exitCode, stdout, stderr } = result.value;

  if (exitCode === 0) {
    console.log('✅ 모든 테스트 통과!');
  } else {
    console.error('❌ 테스트 실패:');
    console.error(stderr);
  }
}
```

---

## ⚠️ 조심할 점

### 1. 타임아웃 설정
**기본 타임아웃: 30초**

오래 걸리는 작업은 반드시 타임아웃을 늘려주세요:
```typescript
// ❌ 잘못된 예: 빌드는 30초 안에 안 끝날 수 있음
await executor.execute('bun', ['build']);

// ✅ 올바른 예: 충분한 타임아웃 설정
await executor.execute('bun', ['build'], {
  timeoutMs: 120000, // 2분
});
```

### 2. 출력 크기 제한
**최대 출력: 10MB**

큰 파일을 출력하는 명령은 조심하세요:
```typescript
// ❌ 위험: 100MB 파일 출력하면 에러
await executor.execute('cat', ['huge-file.log']);

// ✅ 안전: head로 일부만 출력
await executor.execute('head', ['-n', '100', 'huge-file.log']);
```

### 3. 작업 디렉토리 확인
cwd를 지정하지 않으면 현재 디렉토리에서 실행됩니다:
```typescript
// 프로젝트 디렉토리에서 실행하고 싶다면 반드시 cwd 지정
await executor.execute('git', ['status'], {
  cwd: projectPath, // 명시적으로 지정
});
```

### 4. Result 패턴 체크
항상 `.ok` 확인 후 `.value` 접근:
```typescript
// ❌ 위험: 에러 시 undefined 접근
const result = await executor.execute('unknown-command', []);
console.log(result.value.stdout); // 에러 발생!

// ✅ 안전: ok 체크 후 접근
if (result.ok) {
  console.log(result.value.stdout);
} else {
  console.error(result.error.message);
}
```

---

## 💡 예제 코드

### 예제 1: Git 커밋 여부 확인

```typescript
/**
 * Git 저장소에 커밋 안 된 변경사항이 있는지 확인
 */
async function hasUncommittedChanges(
  executor: ProcessExecutor,
  repoPath: string,
): Promise<boolean> {
  const result = await executor.execute('git', ['status', '--porcelain'], {
    cwd: repoPath,
  });

  if (!result.ok) {
    console.error('Git status 실패:', result.error.message);
    return false;
  }

  // 출력이 비어있지 않으면 → 변경사항 있음
  return result.value.stdout.trim().length > 0;
}
```

### 예제 2: 타임아웃 재시도

```typescript
/**
 * 타임아웃 발생 시 재시도하는 함수
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
      return result; // 성공 시 즉시 반환
    }

    // 타임아웃이 아닌 에러는 재시도 안 함
    if (result.error.code !== 'process_timeout') {
      return result;
    }

    console.log(`타임아웃 발생 (${attempt}/${maxRetries}), 재시도 중...`);
  }

  return err(new AdevError('process_timeout', '최대 재시도 횟수 초과'));
}
```

### 예제 3: 실시간 진행 상황 표시 (간단 버전)

```typescript
/**
 * 긴 작업 실행 시 진행 중임을 표시
 */
async function executeWithProgress(
  executor: ProcessExecutor,
  command: string,
  args: string[],
  description: string,
): Promise<Result<ProcessResult>> {
  console.log(`⏳ ${description} 시작...`);
  const startTime = Date.now();

  const result = await executor.execute(command, args, {
    timeoutMs: 120000, // 2분
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  if (result.ok) {
    console.log(`✅ ${description} 완료 (${duration}초)`);
  } else {
    console.error(`❌ ${description} 실패 (${duration}초):`, result.error.message);
  }

  return result;
}

// 사용 예:
await executeWithProgress(executor, 'bun', ['test'], '테스트 실행');
```

---

## 🐛 에러 나면 어떻게?

### 에러 코드 종류

ProcessExecutor는 3가지 에러를 반환합니다:

#### 1. `process_timeout`
**원인:** 명령이 타임아웃 시간 내에 완료되지 않음

**해결:**
```typescript
// timeoutMs를 늘려주세요
const result = await executor.execute('slow-command', [], {
  timeoutMs: 120000, // 30초 → 120초로 증가
});
```

#### 2. `process_output_too_large`
**원인:** stdout 또는 stderr가 10MB를 초과함

**해결:**
```typescript
// 출력을 줄이는 옵션 추가
const result = await executor.execute('cat', ['large-file.txt'], {
  // 또는 head/tail로 일부만 출력
});

// 대안: 파일로 리다이렉트
await executor.execute('sh', ['-c', 'cat large-file.txt > output.txt']);
```

#### 3. `process_execution_error`
**원인:** 프로세스 실행 자체가 실패함 (명령 없음, 권한 없음 등)

**해결:**
```typescript
const result = await executor.execute('nonexistent-command', []);
if (!result.ok) {
  if (result.error.code === 'process_execution_error') {
    console.error('명령을 찾을 수 없거나 실행할 수 없습니다.');
    console.error('명령어 철자를 확인하거나 PATH에 있는지 확인하세요.');
  }
}
```

### 에러 처리 패턴

```typescript
const result = await executor.execute('some-command', ['arg1', 'arg2']);

if (!result.ok) {
  const { code, message } = result.error;

  switch (code) {
    case 'process_timeout':
      console.error('⏱️ 타임아웃! 명령 실행 시간이 너무 깁니다.');
      console.error('→ timeoutMs 옵션을 늘려주세요.');
      break;

    case 'process_output_too_large':
      console.error('📦 출력 크기 초과! 10MB를 넘었습니다.');
      console.error('→ 출력을 줄이거나 파일로 리다이렉트하세요.');
      break;

    case 'process_execution_error':
      console.error('❌ 실행 실패:', message);
      console.error('→ 명령어가 존재하는지, 권한이 있는지 확인하세요.');
      break;

    default:
      console.error('❓ 알 수 없는 에러:', message);
  }

  return; // 에러 처리 후 종료
}

// 성공 케이스
console.log('✅ 실행 성공:', result.value.stdout);
```

---

## 📊 API 레퍼런스

### `ProcessExecutor` 클래스

#### 생성자
```typescript
constructor(logger: Logger)
```

**매개변수:**
- `logger`: Logger 인스턴스 (로깅용)

---

#### `execute()` 메서드
```typescript
async execute(
  command: string,
  args?: readonly string[],
  options?: ProcessOptions,
): Promise<Result<ProcessResult>>
```

**매개변수:**
- `command`: 실행할 명령 (예: 'git', 'bun', 'ls')
- `args`: 명령 인자 배열 (옵션, 기본값: `[]`)
- `options`: 실행 옵션 (옵션)

**반환값:**
- `Result<ProcessResult>`: 성공 시 `.ok === true`, 실패 시 `.error` 포함

---

### `ProcessOptions` 인터페이스

```typescript
interface ProcessOptions {
  cwd?: string;              // 작업 디렉토리
  env?: Record<string, string>; // 환경변수
  timeoutMs?: number;        // 타임아웃 (기본: 30000ms)
  stdin?: string;            // stdin 입력
}
```

---

### `ProcessResult` 인터페이스

```typescript
interface ProcessResult {
  exitCode: number;    // 종료 코드 (0 = 성공)
  stdout: string;      // 표준 출력
  stderr: string;      // 표준 에러
  durationMs: number;  // 실행 시간 (밀리초)
}
```

---

## 🎓 고급 사용법

### 1. 병렬 실행

여러 명령을 동시에 실행:
```typescript
const [result1, result2, result3] = await Promise.all([
  executor.execute('bun', ['test', 'tests/unit']),
  executor.execute('bun', ['test', 'tests/module']),
  executor.execute('bun', ['test', 'tests/integration']),
]);

// 모두 성공했는지 확인
if (result1.ok && result2.ok && result3.ok) {
  console.log('✅ 모든 테스트 통과!');
}
```

### 2. 에러 코드 확인

프로그램이 0이 아닌 코드로 종료해도 Result는 ok일 수 있습니다:
```typescript
const result = await executor.execute('grep', ['pattern', 'file.txt']);

if (result.ok) {
  // 실행은 성공했지만 exitCode로 실제 결과 판단
  if (result.value.exitCode === 0) {
    console.log('패턴을 찾았습니다!');
  } else if (result.value.exitCode === 1) {
    console.log('패턴을 찾지 못했습니다.');
  }
}
```

### 3. 환경변수 오버라이드

특정 환경변수만 변경:
```typescript
const result = await executor.execute('node', ['script.js'], {
  env: {
    NODE_ENV: 'production',  // 추가/오버라이드
    DEBUG: '*',              // 디버그 활성화
    // 나머지 환경변수는 자동 상속됨
  },
});
```

---

## 🔗 관련 모듈

- **Logger** (`src/core/logger.ts`) - 로깅 담당
- **Result 패턴** (`src/core/types.ts`) - 에러 처리 패턴
- **AdevError** (`src/core/errors.ts`) - 에러 타입

---

## ✅ 체크리스트

ProcessExecutor를 사용하기 전에:
- [ ] Logger 인스턴스를 생성했나요?
- [ ] 명령어 철자가 올바른가요?
- [ ] 타임아웃이 충분히 긴가요?
- [ ] Result 패턴으로 에러 처리를 했나요?
- [ ] cwd를 올바르게 설정했나요?

---

**마지막 업데이트:** 2026-03-04
**작성자:** documenter 에이전트
