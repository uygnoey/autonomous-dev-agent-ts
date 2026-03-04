# CLI 설계: index.ts (엔트리포인트)

## 1. 개요

**목적**: CLI 엔트리포인트 (bin 파일)

**위치**: `src/index.ts`

**의존성**: → cli/main.ts

**핵심 책임**:
- CLI 애플리케이션 초기화
- process.argv 전달
- 종료 코드 처리 (process.exit)
- 글로벌 에러 처리

**bin 설정** (package.json):
```json
{
  "bin": {
    "adev": "./dist/index.js"
  }
}
```

---

## 2. 구현 코드

```typescript
#!/usr/bin/env bun
/**
 * adev CLI 엔트리포인트 / adev CLI entry point
 *
 * @description
 * KR: adev CLI 애플리케이션의 진입점. process.argv를 받아 CliApp에 전달하고,
 *     종료 코드를 process.exit()로 반환한다.
 * EN: Entry point for adev CLI application. Receives process.argv, passes to CliApp,
 *     and returns exit code via process.exit().
 */

import { CliApp } from './cli/main.js';
import { createLogger } from './core/logger.js';

/**
 * 메인 함수 / Main function
 */
async function main(): Promise<void> {
  // 1. Logger 초기화
  const logger = createLogger();

  // 2. CliApp 생성
  const app = new CliApp(logger);

  // 3. CLI 실행 (process.argv 전달)
  const exitCode = await app.run(process.argv.slice(2));

  // 4. 종료 코드로 프로세스 종료
  process.exit(exitCode);
}

/**
 * 글로벌 에러 핸들러 / Global error handler
 */
process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught exception:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  console.error('Unhandled rejection:', reason);
  process.exit(1);
});

// SIGINT 핸들러 (Ctrl+C)
process.on('SIGINT', () => {
  console.log('\nInterrupted. Exiting...');
  process.exit(130); // 128 + SIGINT(2) = 130
});

// 메인 함수 실행
main().catch((error: unknown) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

---

## 3. 주요 로직

### main()

**책임**: CLI 애플리케이션 초기화 및 실행

**로직**:
1. Logger 초기화 (기본 로그 레벨: info)
2. CliApp 생성
3. `app.run(process.argv.slice(2))` 호출
   - `process.argv.slice(2)`: `['node', 'index.js', ...args]`에서 실제 인자만 추출
4. 종료 코드 반환
5. `process.exit(exitCode)` 호출

**에러 처리**: 모든 에러를 글로벌 핸들러에서 처리

---

### 글로벌 에러 핸들러

**uncaughtException**: 동기 코드에서 발생한 예외 처리
**unhandledRejection**: Promise에서 처리되지 않은 reject 처리
**SIGINT**: Ctrl+C 입력 시 정상 종료

---

## 4. 빌드 및 실행

### 빌드

```bash
bun build src/index.ts --outdir ./dist --target bun
chmod +x dist/index.js
```

### 실행

```bash
# 로컬 개발
bun run src/index.ts init

# 빌드 후 실행
./dist/index.js init

# 글로벌 설치 후
adev init
```

---

## 5. package.json 설정

```json
{
  "name": "claude-dev-agent",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "adev": "./dist/index.js"
  },
  "scripts": {
    "build": "bun build src/index.ts --outdir ./dist --target bun",
    "dev": "bun run src/index.ts",
    "start": "bun run dist/index.js"
  },
  "files": [
    "dist/",
    "README.md",
    "LICENSE"
  ]
}
```

---

## 6. 설치 후 실행 흐름

```
사용자: adev init
  ↓
/usr/local/bin/adev (symlink)
  ↓
/path/to/dist/index.js (shebang: #!/usr/bin/env bun)
  ↓
Bun 런타임 시작
  ↓
main() 함수 실행
  ↓
CliApp.run(['init'])
  ↓
InitCommand.execute({})
  ↓
.adev/ 디렉토리 생성
  ↓
process.exit(0)
```

---

## 7. 종료 코드 정의

```typescript
// src/cli/types.ts
export const EXIT_CODES = {
  SUCCESS: 0,                // 성공
  GENERAL_ERROR: 1,          // 일반 에러
  INVALID_USAGE: 2,          // 잘못된 사용법
  NOT_FOUND: 3,              // 리소스 없음
  PERMISSION_DENIED: 4,      // 권한 거부
  AUTH_ERROR: 5,             // 인증 에러
  SIGINT: 130,               // Ctrl+C (128 + 2)
} as const;
```

---

## 8. 테스트 전략

### 단위 테스트 (tests/unit/cli/index.test.ts)

**테스트 케이스**:
1. `main()` — 정상 실행
2. 글로벌 에러 핸들러 — uncaughtException
3. 글로벌 에러 핸들러 — unhandledRejection
4. SIGINT 핸들러

**모킹**: CliApp 모킹, process.exit 모킹

---

### 통합 테스트 (tests/e2e/cli.test.ts)

**테스트 케이스**:
1. `bun run src/index.ts init` 실행 → 종료 코드 0
2. `bun run src/index.ts unknown` 실행 → 종료 코드 2

---

## 9. 구현 우선순위

1. 기본 구조 + main 함수
2. 글로벌 에러 핸들러
3. 빌드 스크립트 설정
4. 단위 테스트 + E2E 테스트

---

## 10. 참고 문서

- `IMPLEMENTATION-GUIDE.md` Phase 8
- `src/cli/main.ts` — CliApp 인터페이스
- `package.json` — bin 설정
