# CLI 설계: main.ts

## 1. 개요

**목적**: 명령어 라우팅 및 CLI 애플리케이션 진입점

**위치**: `src/cli/main.ts`

**의존성**: cli → core, all commands

**핵심 책임**:
- CLI 명령어 파싱
- 명령어별 핸들러 라우팅
- 전역 옵션 처리 (--verbose, --help, --version)
- 에러 처리 및 종료 코드 반환

---

## 2. 인터페이스 정의

```typescript
/**
 * CLI 애플리케이션 / CLI application
 */
export interface ICliApp {
  /**
   * CLI 애플리케이션을 실행한다 / Run CLI application
   *
   * @param argv - 명령행 인자 / Command-line arguments
   * @returns 종료 코드 / Exit code
   */
  run(argv: string[]): Promise<number>;

  /**
   * 명령어 핸들러를 등록한다 / Register command handler
   *
   * @param command - 명령어 이름 / Command name
   * @param handler - 핸들러 / Handler
   */
  registerCommand(command: CliCommand, handler: CliCommandHandler): void;

  /**
   * 전역 도움말을 표시한다 / Show global help
   */
  showHelp(): void;

  /**
   * 버전을 표시한다 / Show version
   */
  showVersion(): void;
}
```

---

## 3. 구현 클래스

```typescript
/**
 * CliApp 구현 / CliApp implementation
 */
export class CliApp implements ICliApp {
  private readonly logger: Logger;
  private readonly commandHandlers: Map<CliCommand, CliCommandHandler>;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'cli-app' });
    this.commandHandlers = new Map();
    this.registerDefaultCommands();
  }

  /**
   * 기본 명령어 핸들러 등록 / Register default command handlers
   */
  private registerDefaultCommands(): void {
    // InitCommand, StartCommand 등 등록
  }

  // 메서드 구현
}
```

---

## 4. 주요 메서드 로직

### run()

**책임**: CLI 애플리케이션 메인 로직

**로직**:
1. `argv`를 파싱 (yargs 또는 commander.js 사용)
   ```typescript
   // yargs 예시
   const parsed = yargs(argv)
     .command('init', 'Initialize project')
     .command('start', 'Start Layer1 conversation')
     .command('config <sub>', 'Manage configuration')
     .command('project <sub>', 'Manage projects')
     .option('verbose', { alias: 'v', type: 'boolean' })
     .option('help', { alias: 'h', type: 'boolean' })
     .option('version', { alias: 'V', type: 'boolean' })
     .parse();
   ```

2. 전역 옵션 처리:
   - `--help`: `showHelp()` 호출 → 종료 코드 0
   - `--version`: `showVersion()` 호출 → 종료 코드 0
   - `--verbose`: 로그 레벨 debug로 설정

3. 명령어 추출:
   ```typescript
   const command = parsed._[0] as CliCommand;
   ```

4. 명령어 핸들러 조회:
   ```typescript
   const handler = this.commandHandlers.get(command);
   if (!handler) {
     console.error(`Unknown command: ${command}`);
     return EXIT_CODES.INVALID_USAGE;
   }
   ```

5. 핸들러 실행:
   ```typescript
   const result = await handler.execute(parsed);
   ```

6. 결과 출력 및 종료 코드 반환:
   ```typescript
   if (result.success) {
     console.log(result.message);
   } else {
     console.error(result.message);
   }
   return result.exitCode;
   ```

**에러 처리**: 모든 에러를 catch하여 적절한 종료 코드 반환

---

### registerCommand()

**책임**: 명령어 핸들러 등록

**로직**:
1. `commandHandlers.set(command, handler)` 저장
2. 로그 기록

---

### showHelp()

**책임**: 전역 도움말 표시

**출력**:
```
adev - Claude Code Agent Development CLI

사용법:
  adev <command> [옵션]

명령어:
  init              프로젝트 초기화
  start             Layer1 대화 시작
  config <sub>      설정 관리 (get/set/list/reset)
  project <sub>     프로젝트 관리 (add/remove/list/switch/update)

전역 옵션:
  -v, --verbose     상세 로그 출력
  -h, --help        도움말 표시
  -V, --version     버전 표시
  --no-color        색상 비활성화

자세한 명령어 도움말:
  adev <command> --help

예제:
  adev init
  adev start
  adev config get authMethod
  adev project list
```

---

### showVersion()

**책임**: 버전 표시

**출력**:
```
adev v1.0.0
```

---

## 5. 명령어 라우팅 흐름

```
argv (process.argv)
  ↓ 파싱 (yargs/commander)
parsed options
  ↓ 전역 옵션 체크
--help → showHelp() → exit 0
--version → showVersion() → exit 0
  ↓ 명령어 추출
command = 'init' | 'start' | 'config' | 'project'
  ↓ 핸들러 조회
handler = commandHandlers.get(command)
  ↓ 핸들러 실행
result = await handler.execute(options)
  ↓ 결과 출력
console.log/error(result.message)
  ↓ 종료 코드 반환
return result.exitCode
```

---

## 6. 의존성

```
CliApp
├─→ Logger (core/logger.ts)
├─→ InitCommand (cli/commands/init.ts)
├─→ StartCommand (cli/commands/start.ts)
├─→ ConfigCommand (cli/commands/config.ts)
├─→ ProjectCommand (cli/commands/project.ts)
└─→ yargs 또는 commander (npm 패키지)
```

**CLI 라이브러리 선택**:
- **yargs**: 유연한 명령어 파싱, 자동 도움말 생성
- **commander**: 간단한 API, 타입 안전성

**권장**: yargs (더 많은 기능)

---

## 7. 에러 처리

```typescript
async run(argv: string[]): Promise<number> {
  try {
    // ... 메인 로직 ...
  } catch (error: unknown) {
    if (isAdevError(error)) {
      this.logger.error('CLI error', { code: error.code, message: error.message });
      console.error(`Error: ${error.message}`);
      return EXIT_CODES.GENERAL_ERROR;
    }

    this.logger.error('Unexpected error', { error });
    console.error('An unexpected error occurred. Please check logs.');
    return EXIT_CODES.GENERAL_ERROR;
  }
}
```

---

## 8. 테스트 전략

### 단위 테스트 (tests/unit/cli/main.test.ts)

**테스트 케이스**:
1. `run()` — init 명령어 라우팅
2. `run()` — 알 수 없는 명령어 → 에러
3. `run()` — --help 플래그 → 도움말 표시
4. `run()` — --version 플래그 → 버전 표시
5. `registerCommand()` — 핸들러 등록
6. `showHelp()` — 도움말 출력
7. `showVersion()` — 버전 출력

**모킹**: 모든 command 핸들러 모킹

---

### 통합 테스트 (tests/module/cli-main.test.ts)

**테스트 케이스**:
1. 실제 `adev init` 실행 → 종료 코드 0
2. 실제 `adev unknown` 실행 → 종료 코드 2

---

## 9. 구현 우선순위

1. 인터페이스 + run 기본 구조 (yargs 설정)
2. registerCommand, showHelp, showVersion
3. 에러 처리
4. 단위 테스트 + 통합 테스트

---

## 10. 참고 문서

- `src/cli/types.ts` — CliCommand, EXIT_CODES
- `src/cli/commands/*.ts` — 각 명령어 핸들러
- yargs 문서: https://yargs.js.org/
