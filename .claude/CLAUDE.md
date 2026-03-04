# adev — 프로젝트 컨벤션

## 프로젝트 개요

CLI `adev`. TypeScript + Bun. Claude Agent SDK (V2 Session API) 단독 런타임. LanceDB 벡터 DB. 3계층 구조.

## 필수 읽기

작업 전 반드시 관련 문서를 먼저 읽을 것:
- `ARCHITECTURE.md` — 3계층 구조, 모듈 의존성
- `SPEC.md` — v2.4 전체 스펙
- `IMPLEMENTATION-GUIDE.md` — 구현 순서
- `docs/references/` — 에이전트, Phase, 테스트, Contract 상세

## 기술 스택

- **런타임**: Bun (`bun` 명령어만 사용, npm/node 금지)
- **패키지**: `bun install`, `bun add`, `bun remove`
- **빌드**: `bun build src/index.ts --outdir ./dist --target bun`
- **테스트**: `bun test`
- **타입체크**: `bunx tsc --noEmit`
- **린트**: `bunx biome check src/`
- **포맷**: `bunx biome format src/ --write`

## 코드 컨벤션

- ES Modules only (CommonJS 금지)
- TypeScript strict (`strict: true`, `noUncheckedIndexedAccess: true`)
- 에러 처리: `Result<T, E>` 패턴 (throw 최소화, 경계에서만 catch). 상세 → `.claude/skills/code-quality/references/result-pattern.md`
- 네이밍: `camelCase` 변수/함수, `PascalCase` 타입/클래스/인터페이스, `UPPER_SNAKE_CASE` 상수
- 파일명: `kebab-case.ts`
- 한 파일 한 책임, 300줄 초과 시 분할
- public 함수/인터페이스에 JSDoc. 인라인 주석은 WHY만
- `console.log` 금지 → `src/core/logger.ts` 사용
- `process.env` 직접 접근 금지 → `src/core/config.ts` 경유
- `any` 금지 → `unknown` + 타입 가드

## 디자인 패턴 (일관성 필수)

- **의존성 주입**: 생성자 주입. 글로벌 싱글턴 금지
- **인터페이스 우선**: 구현 전 인터페이스 정의 → 구현 클래스 분리
- **추상화 계층**: `EmbeddingProvider`, `AgentExecutor`, `AuthProvider` 등 교체 가능한 추상화
- **이벤트 기반**: Phase 전환, 에이전트 완료 등은 EventEmitter 패턴
- **상태 머신**: Phase 전환은 명시적 FSM (`phase-engine.ts`)
- **Repository 패턴**: LanceDB 접근은 repository 계층 경유

## 모듈 의존성 (단방향만 허용)

```
cli → core, auth, layer1
layer1 → core, rag
layer2 → core, rag, layer1
layer3 → core, rag, layer2
rag → core
mcp → core
auth → core
```

순환 의존성 절대 금지.

## 워크플로우

### 기능 구현

1. ARCHITECTURE.md에서 해당 모듈 위치 확인
2. 관련 인터페이스 정의 먼저 (types 파일)
3. 구현 클래스 작성
4. 단위 테스트 작성 (`tests/unit/`)
5. `bun test` 통과 확인
6. `bunx tsc --noEmit` 타입체크
7. `bunx biome check src/` 린트 통과

### 버그 수정

1. 실패 재현 테스트 먼저 작성
2. 원인 1개만 집중 수정 (Fail-Fast 원칙)
3. 수정 후 관련 테스트 전부 통과 확인

## Git 컨벤션

- 브랜치: `feature/{기능명}`, `fix/{버그명}`, `refactor/{대상}`
- 커밋: Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`)
- 커밋 단위: 논리적 완결 단위 (한 커밋 = 한 변경)

## 절대 금지

- `any` 타입 사용
- `console.log` 직접 사용
- 순환 의존성
- `process.env` 직접 접근
- 하드코딩된 매직 넘버/문자열
- `node:` 내장 모듈 사용 시 Bun 호환성 미확인
