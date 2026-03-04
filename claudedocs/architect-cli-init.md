# CLI 설계: commands/init.ts

## 1. 개요

**목적**: 프로젝트 초기화 (인증 선택, .adev/ 생성)

**위치**: `src/cli/commands/init.ts`

**의존성**: cli → core, auth

**핵심 책임**:
- 프로젝트 초기화 워크플로우
- 인증 방식 선택 (API key / Subscription)
- .adev/ 디렉토리 구조 생성
- 초기 설정 파일 생성
- projects.json에 프로젝트 등록

**사용법**:
```bash
adev init                    # 대화형 모드
adev init --auth api-key     # API key 인증
adev init --auth subscription # Subscription 인증
adev init --path /path/to/project # 특정 경로에 초기화
adev init --yes              # 기본값으로 자동 초기화
```

---

## 2. 인터페이스 정의

```typescript
/**
 * Init 명령어 핸들러 인터페이스 / Init command handler interface
 */
export interface IInitCommand extends CliCommandHandler<InitOptions> {
  /**
   * 인증 방식을 선택한다 / Select authentication method
   *
   * @param interactive - 대화형 모드 여부 / Interactive mode
   * @returns 선택된 인증 방식 / Selected auth method
   */
  selectAuthMethod(interactive: boolean): Promise<Result<AuthMethod>>;

  /**
   * .adev/ 디렉토리를 생성한다 / Create .adev/ directory
   *
   * @param projectPath - 프로젝트 경로 / Project path
   * @returns 생성 성공 여부 / Success status
   */
  createAdevDirectory(projectPath: string): Promise<Result<void>>;

  /**
   * 초기 설정 파일을 생성한다 / Create initial config files
   *
   * @param projectPath - 프로젝트 경로 / Project path
   * @param authMethod - 인증 방식 / Auth method
   * @returns 생성 성공 여부 / Success status
   */
  createConfigFiles(projectPath: string, authMethod: AuthMethod): Promise<Result<void>>;

  /**
   * 프로젝트를 레지스트리에 등록한다 / Register project to registry
   *
   * @param projectInfo - 프로젝트 정보 / Project information
   * @returns 등록 성공 여부 / Success status
   */
  registerProject(projectInfo: ProjectInfo): Promise<Result<void>>;

  /**
   * 환경변수를 확인한다 / Check environment variables
   *
   * @param authMethod - 인증 방식 / Auth method
   * @returns 환경변수 존재 여부 / Whether env var exists
   */
  checkEnvVar(authMethod: AuthMethod): Promise<Result<boolean>>;
}
```

---

## 3. 구현 클래스

```typescript
/**
 * Init 명령어 구현 / Init command implementation
 */
export class InitCommand implements IInitCommand {
  private readonly logger: Logger;
  private readonly configManager: ConfigManager;
  private readonly projectManager: ProjectManager;

  constructor(
    configManager: ConfigManager,
    projectManager: ProjectManager,
    logger: Logger,
  ) {
    this.configManager = configManager;
    this.projectManager = projectManager;
    this.logger = logger.child({ module: 'cli-init' });
  }

  // 메서드 구현은 구현 단계에서 작성
}
```

---

## 4. 주요 메서드 로직

### 4.1 execute()

**책임**: init 명령어 전체 워크플로우 실행

**로직**:
1. `options.path` 또는 현재 디렉토리를 프로젝트 경로로 설정
2. 프로젝트 경로가 이미 초기화되어 있는지 확인 (`.adev/` 존재 여부)
3. 이미 존재하면 에러 반환 (`CliResult { success: false, exitCode: 2 }`)
4. `selectAuthMethod(interactive)` 호출 → 인증 방식 선택
5. `checkEnvVar(authMethod)` 호출 → 환경변수 확인
6. 환경변수 없으면 경고 메시지 출력
7. `createAdevDirectory(projectPath)` 호출
8. `createConfigFiles(projectPath, authMethod)` 호출
9. `ProjectInfo` 생성 (id: UUID, name: 프로젝트 폴더명, path, createdAt)
10. `registerProject(projectInfo)` 호출
11. 성공 메시지 출력
12. `CliResult { success: true, exitCode: 0 }` 반환

**에러 처리**: 각 단계 실패 시 적절한 exitCode 반환

---

### 4.2 selectAuthMethod()

**책임**: 인증 방식 선택 (대화형 또는 옵션)

**로직**:
1. `options.auth`가 지정되어 있으면 해당 방식 반환
2. `interactive === false`이면 기본값 `api-key` 반환
3. `interactive === true`이면 프롬프트 표시:
   ```
   인증 방식을 선택하세요:
   1. API key (ANTHROPIC_API_KEY)
   2. Subscription (CLAUDE_CODE_OAUTH_TOKEN)
   선택 (1 또는 2):
   ```
4. 유저 입력 받기 (inquirer 또는 prompts 라이브러리)
5. 선택된 방식 반환

**에러 처리**: 잘못된 입력 → 재시도

---

### 4.3 createAdevDirectory()

**책임**: .adev/ 디렉토리 구조 생성

**로직**:
1. `.adev/` 디렉토리 생성
2. 하위 디렉토리 생성:
   ```
   .adev/
   ├── data/
   │   ├── memory/
   │   └── code-index/
   ├── agents/
   ├── sessions/
   ├── mcp/
   ├── skills/
   └── templates/
   ```
3. 각 디렉토리 생성 확인

**에러 처리**: 디렉토리 생성 실패 → `ConfigError`

---

### 4.4 createConfigFiles()

**책임**: 초기 설정 파일 생성

**로직**:
1. `.adev/config.json` 생성:
   ```json
   {
     "authMethod": "api-key",
     "defaultModel": "claude-opus-4-6",
     "verificationModel": "claude-opus-4-6",
     "embeddingProvider": "xenova-minilm",
     "logLevel": "info"
   }
   ```
2. `.adev/agents/` 에 7개 agent.md 파일 생성 (기본 템플릿)
   - `architect.md`, `qa.md`, `coder.md`, `tester.md`, `qc.md`, `reviewer.md`, `documenter.md`
3. `.gitignore`에 `.adev/data/` 추가 (이미 있으면 스킵)

**에러 처리**: 파일 생성 실패 → `ConfigError`

---

### 4.5 registerProject()

**책임**: 프로젝트를 ~/.adev/projects.json에 등록

**로직**:
1. `~/.adev/projects.json` 읽기
2. 파일 없으면 빈 레지스트리 생성
3. 동일 경로의 프로젝트가 이미 존재하면 에러
4. `projects` 배열에 새 프로젝트 추가
5. `activeProjectId`를 새 프로젝트 ID로 설정
6. 파일 저장

**에러 처리**: 중복 프로젝트 → `ConfigError`

---

### 4.6 checkEnvVar()

**책임**: 인증 방식에 맞는 환경변수 확인

**로직**:
1. `authMethod === 'api-key'`: `process.env.ANTHROPIC_API_KEY` 확인
2. `authMethod === 'subscription'`: `process.env.CLAUDE_CODE_OAUTH_TOKEN` 확인
3. 존재 여부 반환

**에러 처리**: 없음 (경고만 출력)

---

### 4.7 help()

**책임**: 도움말 표시

**반환**:
```
adev init - 프로젝트 초기화

사용법:
  adev init [옵션]

옵션:
  --path <path>        프로젝트 경로 (기본: 현재 디렉토리)
  --auth <method>      인증 방식 (api-key | subscription)
  --yes                대화형 모드 스킵 (기본값 사용)
  --help               도움말 표시

예제:
  adev init
  adev init --auth api-key
  adev init --path /path/to/project
```

---

## 5. .adev/ 디렉토리 구조

```
.adev/
├── config.json               # 프로젝트 설정
├── data/                     # LanceDB 데이터
│   ├── memory/
│   └── code-index/
├── agents/                   # 에이전트 프롬프트
│   ├── architect.md
│   ├── qa.md
│   ├── coder.md
│   ├── tester.md
│   ├── qc.md
│   ├── reviewer.md
│   └── documenter.md
├── sessions/                 # 세션 상태
├── mcp/                      # 프로젝트 전용 MCP
├── skills/                   # 프로젝트 전용 SKILL
└── templates/                # 프로젝트 전용 문서 템플릿
```

---

## 6. 의존성 그래프

```
InitCommand
├─→ Logger (core/logger.ts)
├─→ ConfigManager (core/config.ts) — 설정 파일 생성
├─→ ProjectManager (cli/project-manager.ts) — 프로젝트 레지스트리 관리
└─→ inquirer 또는 prompts (npm 패키지) — 대화형 프롬프트
```

---

## 7. 에러 타입 정의

**에러 코드** (ConfigError):
- `cli_init_already_initialized`: 이미 초기화된 프로젝트
- `cli_init_directory_create_failed`: 디렉토리 생성 실패
- `cli_init_config_create_failed`: 설정 파일 생성 실패
- `cli_init_register_failed`: 프로젝트 등록 실패
- `cli_init_duplicate_project`: 중복 프로젝트

---

## 8. 테스트 전략

### 단위 테스트 (tests/unit/cli/init.test.ts)

**테스트 케이스**:
1. `execute()` — 정상 초기화 (대화형 모드)
2. `execute()` — 이미 초기화된 프로젝트 → 에러
3. `selectAuthMethod()` — API key 선택
4. `selectAuthMethod()` — Subscription 선택
5. `createAdevDirectory()` — 디렉토리 구조 생성
6. `createConfigFiles()` — 설정 파일 생성
7. `registerProject()` — 프로젝트 등록
8. `checkEnvVar()` — 환경변수 확인

**모킹**: ConfigManager, ProjectManager 모킹

---

### 통합 테스트 (tests/module/cli-init.test.ts)

**테스트 케이스**:
1. 실제 디렉토리에 `adev init` 실행 → .adev/ 생성 확인
2. 중복 초기화 시도 → 에러 확인
3. projects.json에 프로젝트 등록 확인

---

## 9. 사용 예시

```typescript
import { InitCommand } from './cli/commands/init.js';
import { ConfigManager } from './core/config.js';
import { ProjectManager } from './cli/project-manager.js';
import { createLogger } from './core/logger.js';

const configManager = new ConfigManager(createLogger());
const projectManager = new ProjectManager(createLogger());
const initCommand = new InitCommand(configManager, projectManager, createLogger());

// 대화형 모드로 초기화
const result = await initCommand.execute({
  path: './my-project',
});

if (result.success) {
  console.log(result.message); // "프로젝트가 성공적으로 초기화되었습니다."
} else {
  console.error(result.message);
  process.exit(result.exitCode);
}
```

---

## 10. 구현 우선순위

**Phase 8-1**: 인터페이스 + createAdevDirectory 구현
**Phase 8-2**: createConfigFiles 구현 (7개 agent.md 템플릿)
**Phase 8-3**: registerProject 구현 (projects.json 관리)
**Phase 8-4**: selectAuthMethod 구현 (대화형 프롬프트)
**Phase 8-5**: execute 전체 워크플로우 구현
**Phase 8-6**: 단위 테스트 + 통합 테스트

---

## 11. 참고 문서

- `SPEC.md` Section 3 — 인증
- `SPEC.md` Section 5.3 — 프로젝트별 디렉토리
- `SPEC.md` Section 5.5 — 프로젝트 관리
- `src/cli/types.ts` — InitOptions, ProjectInfo
