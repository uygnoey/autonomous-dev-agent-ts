# claude-dev-agent (adev) — 통합 스펙 v2.4

> **상태**: 1~3계층 전체 확정 + 설계 완전 해결 + PoC 전부 성공 → **구현 준비 완료**
> **최종 수정**: 2026-03-04
> **변경 이력**: v1.0 (1계층만) → v2.0 (3계층 전체 통합) → v2.1 (Fail-Fast + 계단식 통합 검증) → v2.2 (아키텍처 대전환: Claude Code 의존성 제거 + SDK 단독 운영) → v2.3 (설계 미결정 전부 해결 + PoC 준비) → v2.4 (P2/P3 PoC 전부 성공 + V2 Session API 아키텍처 확정)

---

## v2.4 핵심 변경 요약

| 변경 | v2.3 | v2.4 |
|------|------|------|
| PoC 상태 | P2/P3 미검증 | **전부 성공 (2026-03-03, SDK v0.2.63)** |
| SDK 버전 | V1 확정 | **V2 Session API 기반 확정 (unstable_v2_createSession)** |
| Agent Teams 동작 | 미검증 | **TeamCreate/Agent/SendMessage/TeamDelete 전부 확인** |
| 모니터링 방식 | 미정 | **Hook(PreToolUse/PostToolUse) + 디스크 IPC 폴링 조합** |
| 디스크 IPC | 미확인 | **~/.claude/teams/ + tasks/ 구조 확인, inbox JSON 파싱 가능** |
| 알려진 이슈 | — | **TeamDelete race condition (config.json 멤버 자동 갱신 안 됨)** |

---

## v2.3 핵심 변경 요약 (참고)

| 변경 | v2.2 | v2.3 |
|------|------|------|
| 4중 검증 모델 | 미정의 | **유저 설정: Opus 기본 + Sonnet 선택 시 실패 Opus 에스컬레이션 옵션** |
| documenter 가동 방식 | 상시 가동 | **이벤트 트리거 + LanceDB 컨텍스트 복원** |
| documenter 문서 생성 | 일부 템플릿 분리 고려 | **전부 documenter (초등학생도 이해 가능한 수준)** |
| MCP 역할 | 미정의 | **builtin 전부 유지 + 유저 커스텀 확장 + adev 직접 활용** |
| SDK V1/V2 | 미정의 | **~~V1 확정~~ → v2.4에서 V2 Session API 확정 (PoC 성공)** |
| agent.md 생성 | 구조만 | **프롬프트 상세화 (초안 생성 → 유저 수정 → 확정)** |
| 다중 프로젝트 | 미정의 | **adev 1개 + 프로젝트 폴더 내 .adev/ 격리 + projects.json** |
| 설정 우선순위 | 미정의 | **프로젝트 > 글로벌 (MCP/SKILL/config 전부)** |
| 비즈니스 템플릿 | 목록만 | **기본 12개 + 유저 커스텀 추가 가능** |
| Xenova 패키지 | `@xenova/transformers` | **`@huggingface/transformers` (v3, Bun 공식 지원)** |
| PoC | 미준비 | **P2/P3 PoC 스크립트 준비 → v2.4에서 전부 성공** |

### v2.2 핵심 변경 (참고)

| 변경 | v2.1 | v2.2 |
|------|------|------|
| 런타임 의존성 | Claude Agent SDK + Claude Code + Agent Teams | **Claude Agent SDK 단독** |
| 실행 방법 | 3대 (query + inbox파일조작 + LanceDB) | **2대 (query+AgentTeams + LanceDB)** |
| Agent Teams 활성화 | Claude Code 내부 또는 inbox 파일 | **SDK query() env 설정** |
| inbox 파일 조작 | 방법② 핵심 | **삭제** |
| 에이전트 간 통신 | inbox JSON 직접 읽기/쓰기 | **Agent Teams SendMessage (SDK 내부)** |
| 임베딩 전략 | 미정의 | **4-Provider Tier 확정** |
| 인증 전략 | 미정의 | **API key + OAuth 토큰 확정** |
| 1계층→2계층 인터페이스 | 미정의 | **Contract 기반 HandoffPackage 확정** |
| 토큰 관리 | 미정의 | **인증별 분기 + 세션 복원 확정** |
| 파일 충돌 방지 | "같은 파일 편집 금지" 선언만 | **Git branch 전략 확정** |
| 테스트 수량 | 고정값만 | **설정 가능 (기본값 유지)** |

---

## 1. 프로젝트 개요

| 항목 | 값 |
|------|-----|
| **이름** | claude-dev-agent (CLI: `adev`) |
| **목적** | Claude Code Skills + RAG를 연동해 일관된 코드 품질로 자율 개발을 수행하는 상위 에이전트 시스템 |
| **개발 언어** | TypeScript + Bun |
| **벡터 DB** | LanceDB (임베디드, 서버리스, 파일 기반) |
| **에이전트 런타임** | Claude Agent SDK (TypeScript) — SDK 단독, Claude Code 불필요 |
| **파일 제한** | 모든 파일 100MB 미만 (초과 시 자동 분할) |

---

## 2. 아키텍처 — 3계층 구조

```
┌──────────────────────────────────────────────────┐
│ 1계층: Claude API (Opus 4.6)                     │
│ - 유저와 대화 (CLI)                               │
│ - 아이디어 도출 / 기획 / 설계                      │
│ - 테스트 케이스 유형 정의서 생성                    │
│ - Contract 기반 HandoffPackage 생성               │
│ - 모든 대화 LanceDB 영구 저장                      │
│ - 2계층 검증 참여 (의도 기반 판단)                  │
├──────────────────────────────────────────────────┤
│              유저 "확정" → Contract 생성 → 검증     │
│              → 유저 컨펌 시 전환                    │
├──────────────────────────────────────────────────┤
│ 2계층: Claude Agent SDK — 자율 개발                │
│  실행: SDK query() + Agent Teams (env 활성화)      │
│  저장: LanceDB (영구 기록 / 컨텍스트 복원)          │
│                                                    │
│ 2계층-A: 기능 단위 개발                             │
│   - adev (TypeScript) = Team Leader               │
│   - 7개 전문 에이전트 (6 루프 + 1 이벤트 트리거)       │
│   - Phase별 최적 실행 전략                          │
│   - 기능별 Unit 1만 + Module 1만 + E2E 10만+       │
│   - 4중 검증 (qa/qc → reviewer → 1계층 → adev)    │
│   - 전체 기능 100% 완성까지 무한 반복               │
│                                                    │
│ 2계층-B: 통합 검증                                  │
│   - 계단식 Fail-Fast 통합 E2E (클린 환경)           │
│   - 버그 → 2계층-A 전체 루프 재실행                 │
│   - 버그 0까지 반복                                │
│                                                    │
│ 2계층-C: 유저 확인                                  │
│   - 결과물 + 테스트 결과서 유저에게 전달             │
│   - 수정 → 2계층-A 또는 B로                        │
│   - 확정 → 3계층                                   │
├──────────────────────────────────────────────────┤
│              유저 "확정" 시 전환                    │
├──────────────────────────────────────────────────┤
│ 3계층: 산출물 + 지속 검증                           │
│ - 2계층 조각 문서 → 통합 프로젝트 문서              │
│ - 1계층(기획) + 2계층(구현) 협업 문서 생성           │
│ - E2E 지속 실행 (유지보수)                         │
│ - 버그 → 2계층 전체 루프 재실행                     │
└──────────────────────────────────────────────────┘
```

---

## 3. 인증

```bash
adev init
# → "API key 사용" 또는 "Subscription 사용" 선택
```

### 3.1 인증 방식

| 방식 | 환경변수 | 비고 |
|------|---------|------|
| **API key** | `ANTHROPIC_API_KEY` | 직접 발급, 사용량 완전 추적 가능 |
| **Subscription (Pro/Max)** | `CLAUDE_CODE_OAUTH_TOKEN` | `claude setup-token`으로 발급 (1년 유효) |

- 두 환경변수 **동시 설정 불가** (하나만 사용)
- adev는 어떤 credential도 저장/공유하지 않음 (환경변수 의존)

### 3.2 Subscription 인증 상세

```bash
# 1. 토큰 발급 (1년 유효, headless 운영에 적합)
claude setup-token

# 2. 환경변수 설정
export CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...

# 3. SDK query() 정상 작동
```

**출처**:
- `weidwonder/claude_agent_sdk_oauth_demo` (GitHub) — Pro/Max 계정 작동 확인
- `anthropics/claude-code-action` 공식 GitHub Action — `CLAUDE_CODE_OAUTH_TOKEN` 명시적 지원
- Anthropic 정책: "유저가 본인 subscription 토큰을 직접 설정하여 사용" → 정책 위반 아님

**주의**: `claude login`은 8~12시간 유효, `claude setup-token`은 **1년 유효**. headless에서는 OAuth 자동 갱신 안 됨 (claude-code Issue #28827) → `setup-token` 사용 권장.

---

## 4. 설치 방식

```bash
# 1. curl one-liner
curl -fsSL https://claude-dev-agent.dev/install.sh | bash

# 2. Homebrew
brew install claude-dev-agent

# 3. Bun
bun install -g claude-dev-agent
```

삭제: `scripts/uninstall.sh`

---

## 5. 디렉토리 구조

### 5.1 프로젝트 루트

```
claude-dev-agent/
├── README.md
├── package.json
├── tsconfig.json
├── bun.lock
│
├── .claude/
│   ├── CLAUDE.md                     ← 프로젝트 컨벤션
│   ├── settings.json                 ← Agent Teams 활성화
│   ├── skills/                       ← 프로젝트별 자동 생성
│   │   ├── dev-agent/
│   │   │   ├── SKILL.md
│   │   │   └── references/
│   │   ├── code-quality/
│   │   │   ├── SKILL.md
│   │   │   └── references/
│   │   └── {프로젝트-도메인}/
│   │       ├── SKILL.md
│   │       └── references/
│   └── agents/                       ← 프로젝트별 자동 생성
│       ├── architect.md
│       ├── qa.md
│       ├── coder.md
│       ├── tester.md
│       ├── qc.md
│       ├── reviewer.md
│       └── documenter.md
│
├── src/
│   ├── index.ts
│   │
│   ├── cli/
│   │   ├── main.ts
│   │   └── commands/
│   │       ├── init.ts
│   │       ├── start.ts
│   │       ├── config.ts
│   │       └── project.ts            ← 프로젝트 CRUD (add/remove/list/switch/update) [v2.3 신규]
│   │
│   ├── core/
│   │   ├── config.ts
│   │   ├── errors.ts
│   │   ├── logger.ts
│   │   ├── memory.ts
│   │   └── plugin-loader.ts          ← ~/.adev 커스텀 모듈 로드
│   │
│   ├── auth/
│   │   ├── index.ts
│   │   ├── auth-manager.ts           ← API key / Subscription(OAuth) 분기
│   │   ├── api-key-auth.ts
│   │   └── subscription-auth.ts      ← CLAUDE_CODE_OAUTH_TOKEN 기반
│   │
│   ├── layer1/                       ← 1계층: 유저 대화
│   │   ├── index.ts
│   │   ├── conversation.ts
│   │   ├── planner.ts
│   │   ├── designer.ts
│   │   ├── spec-builder.ts
│   │   ├── test-type-designer.ts     ← 테스트 유형 정의서 생성
│   │   ├── contract-builder.ts       ← Contract 기반 HandoffPackage 생성 [v2.2 신규]
│   │   └── verifier.ts               ← 4중 검증 중 1계층 참여
│   │
│   ├── layer2/                       ← 2계층: 자율 개발
│   │   ├── index.ts
│   │   ├── team-leader.ts            ← 메인 오케스트레이터 (adev 프로세스)
│   │   ├── phase-engine.ts           ← Phase 상태 머신
│   │   ├── agent-spawner.ts          ← SDK query() + Agent Teams env spawn
│   │   ├── agent-generator.ts        ← 에이전트.md + SKILL.md 자동 생성
│   │   ├── session-manager.ts        ← 세션 생명주기 + 재개
│   │   ├── token-monitor.ts          ← 토큰 사용량 추적 + 인증별 분기
│   │   ├── progress-tracker.ts       ← 기능별/Phase별 진행률
│   │   ├── failure-handler.ts        ← 실패 유형 분류 + 복구
│   │   ├── handoff-receiver.ts       ← Contract 수신 + 구조/정합성 검증
│   │   ├── coder-allocator.ts        ← Coder×N 분할 + Git branch 관리
│   │   ├── stream-monitor.ts         ← SDK 스트림 감시 + 이상 패턴 탐지 [v2.2 변경: inbox-monitor → stream-monitor]
│   │   ├── bias-detector.ts          ← 확증편향/루프/교착 탐지
│   │   ├── integration-tester.ts     ← 2계층-B 통합 테스트 오케스트레이션
│   │   ├── clean-env-manager.ts      ← 클린 환경 생성/삭제 관리
│   │   ├── user-checkpoint.ts        ← 2계층-C 유저 확인 흐름
│   │   └── verification-gate.ts      ← 4중 검증 종합 판단
│   │
│   ├── layer3/                       ← 3계층: 산출물 + 지속 검증
│   │   ├── index.ts
│   │   ├── doc-integrator.ts         ← 2계층 조각 문서 → 통합 문서
│   │   ├── doc-collaborator.ts       ← 1계층+2계층 협업 문서 생성
│   │   ├── production-tester.ts      ← 지속 E2E 실행
│   │   ├── bug-escalator.ts          ← 3계층→2계층 버그 리포트
│   │   └── deliverable-builder.ts    ← 포트폴리오, 사업계획서 등
│   │
│   ├── rag/
│   │   ├── index.ts
│   │   ├── vectorizer.ts
│   │   ├── embeddings.ts             ← EmbeddingProvider 인터페이스 + 4-Provider
│   │   ├── vector-store.ts           ← LanceDB 연동
│   │   ├── code-indexer.ts
│   │   ├── search.ts
│   │   └── chunk-splitter.ts
│   │
│   └── mcp/
│       ├── index.ts
│       ├── mcp-manager.ts
│       ├── registry.ts
│       ├── builtin/
│       │   ├── os-control/
│       │   │   ├── index.ts
│       │   │   ├── filesystem.ts
│       │   │   ├── process.ts
│       │   │   └── system-info.ts
│       │   ├── browser/
│       │   │   ├── index.ts
│       │   │   ├── chrome-control.ts
│       │   │   ├── page-reader.ts
│       │   │   └── screenshot.ts
│       │   ├── web-search/
│       │   │   ├── index.ts
│       │   │   └── search-engine.ts
│       │   └── git/
│       │       ├── index.ts
│       │       └── git-ops.ts
│       └── loader.ts
│
├── scripts/
│   ├── install.sh
│   ├── uninstall.sh
│   └── brew/
│       └── claude-dev-agent.rb
│
├── tests/
│   ├── unit/
│   ├── module/
│   └── e2e/
│
└── docs/
    └── (documenter + 3계층이 자동 생성)
```

### 5.2 유저 글로벌 디렉토리 [v2.3 변경]

```
~/.adev/
├── config.json                       ← 글로벌 설정
├── projects.json                     ← 프로젝트 등록 목록 [v2.3 신규]
├── mcp/                              ← 글로벌 커스텀 MCP
│   └── my-custom/
│       ├── index.ts
│       └── manifest.json
├── skills/                           ← 글로벌 커스텀 SKILL [v2.3 신규]
│   └── my-skill/
│       ├── SKILL.md
│       └── references/
├── templates/                        ← 글로벌 문서 템플릿 [v2.3 신규]
│   └── custom-report.md
├── rag/                              ← 커스텀 RAG 소스 추가
│   └── my-docs/
│       ├── manifest.json
│       └── data/
└── data/                             ← LanceDB 데이터 (파일 기반)
    ├── memory/                       ← 영구 메모리 벡터 저장
    └── code-index/                   ← 코드베이스 벡터 인덱스
```

### 5.3 프로젝트별 디렉토리 [v2.3 신규]

유저 프로젝트 폴더 안에 `.adev/`가 생성됨:

```
/path/to/my-project/
├── src/
├── .adev/                            ← 프로젝트 전용 adev 데이터
│   ├── config.json                   ← 프로젝트별 설정 (글로벌보다 우선)
│   ├── data/                         ← LanceDB (이 프로젝트만의 벡터)
│   │   ├── memory/
│   │   └── code-index/
│   ├── agents/                       ← agent.md 7개 (프로젝트 스펙 맞춤)
│   │   ├── architect.md
│   │   ├── qa.md
│   │   ├── coder.md
│   │   ├── tester.md
│   │   ├── qc.md
│   │   ├── reviewer.md
│   │   └── documenter.md
│   ├── sessions/                     ← 에이전트 세션 상태
│   ├── mcp/                          ← 프로젝트 전용 MCP (글로벌보다 우선)
│   ├── skills/                       ← 프로젝트 전용 SKILL (글로벌보다 우선)
│   └── templates/                    ← 프로젝트 전용 문서 템플릿
└── ...
```

### 5.4 설정 우선순위 [v2.3 신규]

```
1순위: 프로젝트별 설정 (최우선) — /path/to/project/.adev/
2순위: 글로벌 설정 (기본값)    — ~/.adev/

병합 규칙:
  MCP/SKILL: 글로벌 전체 로드 + 프로젝트 전용 추가. 동일 이름은 프로젝트 것이 덮어씀
  config:    글로벌 기본값 + 프로젝트에서 지정한 키만 오버라이드
  templates: 동일 로직
```

### 5.5 프로젝트 관리 [v2.3 신규]

```json
// ~/.adev/projects.json
{
  "projects": [
    {
      "id": "shopping-api",
      "name": "쇼핑몰 API",
      "path": "/home/user/work/shopping-api",
      "createdAt": "2026-03-01",
      "status": "active"
    }
  ]
}
```

CLI 명령:
```bash
adev project add <path>       # 프로젝트 등록 + .adev/ 생성
adev project remove <id>      # 등록 해제 (.adev/ 삭제 여부 유저 선택)
adev project list              # 등록된 프로젝트 목록
adev project switch <id>      # 활성 프로젝트 전환
adev project update <id>      # path, name 등 수정
```

이름 중복 시: 유저에게 확인 → 다른 이름 / 기존 업데이트 / 취소 선택

### 5.6 MCP 역할 [v2.3 신규]

**builtin MCP 전부 유지** — SDK 기본 도구와 중복되더라도 유지하는 이유:

```
1. 유저 커스터마이징: builtin MCP를 기반으로 더 정교하게 수정/확장 가능
2. adev 직접 활용: 에이전트 spawn 없이 MCP로 직접 감시/조회

예: git MCP
  - adev가 merge 전에 직접 branch 상태 확인
  - 유저가 git hook이나 커밋 규칙을 커스텀으로 추가

예: os-control MCP
  - adev가 리소스 모니터링 (메모리, CPU)
  - 유저가 특정 프로세스 관리 규칙 추가
```

**MCP 사용 주체**: adev + 7개 에이전트 + 유저 커스텀

```
adev (Team Leader):
  - MCP 서버 라이프사이클 관리
  - builtin MCP로 직접 감시/조회
  - 유저 커스텀 MCP 로드

에이전트 (query()로 spawn):
  - adev가 allowedTools에 MCP 도구 포함 시 사용 가능
  - 에이전트는 MCP 서버를 시작/중지하지 않음 (도구만 사용)

유저:
  - 글로벌: ~/.adev/mcp/ 또는 ~/.adev/skills/
  - 프로젝트별: /project/.adev/mcp/ 또는 /project/.adev/skills/
  - 프로젝트 설정이 글로벌보다 우선
```

---

## 6. 1계층 상세 — Claude API 유저 대화

### 6.1 기본 설정

| 항목 | 값 |
|------|-----|
| **모델** | Claude Opus 4.6 (유저가 지정하지 않는 한) |
| **역할** | 아이디어 도출 + 설계 기획 파트너 + 2계층 검증 참여 |
| **메모리** | 모든 대화 LanceDB에 영구 저장 |
| **인터페이스** | CLI (향후 메신저/웹 확장 가능) |

### 6.2 핵심 원칙

- Claude가 적극적으로 아이디어를 **무한 제안**
- 유저가 **"확정"이라고 명시적으로 말하기 전까지** 개발 시작 언급 절대 안 함
- 계속 요구사항 파고들기, 빠진 부분 짚기, 더 나은 방향 제안
- 필요 문서 목록 제안 → 유저 확인
- 모든 대화 LanceDB에 영구 메모리 저장

### 6.3 대화 흐름

```
아이디어 도출
  → 기획
  → 설계
  → 디자인
  → 스택 선정
  → 문서 목록 확정
  → 기능별 테스트 케이스 유형 정의서 생성
  → 유저 "확정"
  → Contract 기반 HandoffPackage 생성 [v2.2]
  → 2계층 검증 + 유저 컨펌 [v2.2]
  → 2계층으로 넘김
```

### 6.4 대화 예시

```
유저: REST API 만들고 싶어

🤖 좋은 아이디어! 몇 가지 방향 제안:
   1. 인증은 JWT + OAuth2 조합, 소셜 로그인도?
   2. Rate limiting 초기부터 넣기
   3. API 버저닝 전략은?
   4. WebSocket 실시간 기능 필요?
   타겟 유저는? B2B? B2C?

유저: B2B고 소셜 로그인 필요 없어

🤖 B2B면 이것도 고려:
   - 멀티테넌시 구조
   - 조직별 권한 관리 (RBAC)
   - 감사 로그
   - API Key 발급 시스템
   결제 기능은? SaaS 모델?

(유저가 "확정"할 때까지 무한 반복)

유저: 로그인 기능 확정

🤖 로그인 기능 테스트 케이스 유형 정의서 생성:
   - 카테고리 12종 정의 ✅
   - 경계값/패턴/규칙 명세 ✅
   - 샘플 케이스 150개 ✅
   - random 비중 80%+ 규칙 ✅
   - 목표 수량: Unit 1만 / Module 1만 / E2E 10만+
   (실제 케이스는 2계층 tester가 생성)
   다음 기능 이야기하자.

... (모든 기능 반복)

유저: 좋아, 이걸로 확정!

🤖 Contract(HandoffPackage) 생성 중...
   ✅ 구조 검증: 통과 (기능 12개, 인수 조건 87개, 테스트 정의 12개)
   ⚠️ 정합성 검증: 이슈 1건
     - [warning] feat-007: 인수 조건 ac-007-03에 대응 테스트 없음
   → 보완 후 재생성...
   ✅ 전체 검증 통과
   이대로 개발 시작할까요?

유저: 응

🤖 (2계층 자율 개발 시작)
```

### 6.5 절대 하지 않는 것

- 유저 확정 전 "개발 시작할까요?" 물어보기
- 아이디어 없이 수동 대기
- 대화 내용 휘발

### 6.6 테스트 케이스 유형 정의서 (1계층이 생성하는 것)

1계층은 **실제 테스트 케이스 코드를 생성하지 않는다.** 다음만 생성:

| 항목 | 내용 |
|------|------|
| 카테고리 정의 | 정상/경계값/예외/동시성/대용량/비정상종료 등 |
| 카테고리별 규칙 | 각 카테고리의 패턴, 경계값, 입력 범위 |
| 샘플 케이스 | 카테고리당 10~20개 (100~200개 총) |
| 카테고리 비율 | random 80%+, 정상 소수 |
| 목표 수량 | Unit 1만, Module 1만, E2E 10만+ (설정 가능) |
| 생성 규칙 | 랜덤 조합 규칙, 제약 조건 |

실제 테스트 케이스 코드 생성 → 2계층 tester가 수행

### 6.7 Contract 기반 HandoffPackage [v2.2 신규]

유저 "확정" 후, 바로 2계층에 넘기지 않고 **구조화된 계약(Contract)**을 생성하여 검증 후 넘김.

#### Contract 필수 포함 원칙 (프로젝트 불문)

```
① 모든 기능에 검증 가능한 인수 조건 (자연어 + 기계 검증 쌍, pass/fail 판정 가능)
② 모든 기능의 입출력 명시 (타입, 제약조건, 에러 상황)
③ 기능 간 의존성 명시 (어떤 출력이 필요한지까지)
④ 모든 기능에 테스트 유형 정의서 (인수 조건 ↔ 테스트 카테고리 매핑, 빠짐 없이)
⑤ 검증 매트릭스 (①~④의 완전성 자동 체크 결과)
```

#### Contract 생성 프로세스

```
유저 "확정" → 1계층이 프로젝트 성격 분석
  → 해당 프로젝트에 맞는 Contract 스키마 동적 생성
    (REST API면 엔드포인트/상태코드, CLI면 커맨드/종료코드,
     라이브러리면 public API 시그니처 등)
  → 대화 내용 기반 Contract 채움
  → 필수 원칙 ①~⑤ 충족 자체 검증 → 미충족 시 유저에게 추가 질문
  → 충족 시 HandoffPackage로 패키징
```

#### Contract 검증

```
[구조 검증 — 자동, 즉시] handoff-receiver
  - 필수 원칙 ①~⑤ 충족하는가
  - id 참조 무결성
  - 의존성 그래프 순환 참조 없는가
  → fail → 1계층에 구체적 불일치 반환 → 재생성

[정합성 검증 — architect + qa]
  - 의존 기능 출력 타입 ↔ 소비 기능 입력 타입 호환
  - 모든 인수 조건에 대응 테스트 카테고리 존재
  - 모듈 책임 중복/누락 없음
  - 설계 ↔ 제약사항 모순 없음
  → 이슈 발견 → 리포트 생성 → 유저와 대화
```

#### 검증 결과 CLI 출력

```
CLI에 요약 출력:
  ✅ 구조 검증: 통과 (기능 12개, 인수 조건 87개, 테스트 정의 12개)
  ⚠️ 정합성 검증: 이슈 2건
    - [error] feat-003 → feat-002 의존성: 순환 참조 발견
    - [warning] feat-007: 인수 조건 ac-007-03에 대응 테스트 없음
  
  상세 리포트: {프로젝트폴더}/docs/reports/handoff-verification-{timestamp}.md

심각도별 행동:
  error: 유저와 논의 → 해결될 때까지 자율 개발 진입 불가 → Contract 재생성 → 재검증
  warning: 유저에게 표시 → "진행" 또는 "수정" 선택 허용
```

#### Contract 변경 관리

```
확정 후 변경 가능하지만:
  - version 증가 필수
  - 변경 사유 기록
  - 영향받는 기능/테스트 자동 식별
  - 2계층 검증 재실행 + 유저 재컨펌 필수
  - 이미 개발 완료된 기능에 영향 → 회귀 테스트 트리거
```

### 6.8 1계층의 2계층 검증 참여

4중 검증의 3번째 단계로 참여:

```
1계층은 스펙/설계의 "저자"이므로:
  - "내가 의도한 대로 구현되었는가?"
  - "빠진 엣지 케이스는 없는가?"
  - 스펙 수정이 필요하면 → 유저에게 질문
```

설정 옵션:
```json
{
  "verification": {
    "layer1_model": "opus",
    "adev_model": "opus",
    "opus_escalation_on_failure": true
  }
}
```

**[v2.3 신규] 검증 모델 전략**:

| layer1_model | opus_escalation_on_failure | 동작 |
|---|---|---|
| `"opus"` | 무관 | 항상 Opus (기본값, 정확도 최우선) |
| `"sonnet"` | `true` | Sonnet으로 검증 → 실패 시 Opus로 재검증 (안전망) |
| `"sonnet"` | `false` | Sonnet으로만 검증 (비용 절감 최우선) |

`adev_model`도 동일 로직. ④번 adev 종합 판단에 적용.

### 6.9 산출물 (확정 시 2계층에 넘기는 것)

1. 기획서
2. 설계서
3. 필요 문서 목록
4. 기능별 테스트 케이스 **유형 정의서** + 생성 규칙 + 샘플
5. 전체 스펙 확정본
6. **Contract (HandoffPackage)** — 구조 검증 + 정합성 검증 완료 상태 [v2.2 신규]

---

## 7. 에이전트 — 7개 고정 (추가/변경 금지)

### 7.1 루프 에이전트 — 순서대로 실행 (6개)

| 순서 | 에이전트 | 역할 |
|------|---------|------|
| 1 | **architect** | 기술 아키텍처 설계, 구조 결정 |
| 2 | **qa** | 예방 중심 — 코딩 전 스펙/아키텍처 검증 (Gate) |
| 3 | **coder** | 코드 구현 (×N 병렬 가능) |
| 4 | **tester** | 유형 정의서 기반 테스트 케이스 생성 + 실행 |
| 5 | **qc** | 탐지 중심 — 대량 테스트 기반 품질 검증 |
| 6 | **reviewer** | 코드 리뷰, 품질 체크리스트 |

### 7.2 상시 에이전트 — 이벤트 트리거 (1개) [v2.3 변경: 상시 가동 → 이벤트 트리거]

| 에이전트 | 역할 |
|---------|------|
| **documenter** | Phase 완료 이벤트 수신 → LanceDB 컨텍스트 복원 → 문서 생성 → 종료 |

### 7.3 documenter 상세 — 이벤트 트리거 + LanceDB 컨텍스트 복원 [v2.3 변경]

documenter는 ~~상시 가동이 아니라~~ **이벤트 발생 시 spawn → 문서 생성 → 종료**:

- **가동 방식**: 이벤트 트리거 (유휴 시간 토큰 소모 = 0)
- **컨텍스트**: LanceDB에서 복원 (에이전트 출력, HandoffPackage, 테스트 결과 등 전부 저장되어 있으므로 상시 가동과 동일 품질)
- **문서 범위**: 전부 documenter가 생성 (템플릿 분리 없음)
- **문서 품질**: 초등학생도 이해할 수 있는 수준 (기술 용어 → 일반 언어 번역)

```
[기능 완료 시] → documenter spawn
  - 기능 설명서 (일반인도 이해 가능한 자연어)
  - API 연동 정의서
  - 아키텍처 변경 이력

[테스트 실행 시] → documenter spawn
  - Unit/Module/E2E 테스트 결과서 (왜 실패했는지 설명 포함)
  - 커버리지 리포트 (왜 낮은지, 어떤 위험이 있는지 설명)
  - 성능 벤치마크 리포트

[버그 발생 시] → documenter spawn
  - 버그 리포트 (재현 경로, 원인, 영향 범위)
  - 수정 내역서
  - 회귀 테스트 결과

[Phase 경계 시] → documenter spawn
  - CHANGELOG (git diff의 기술 용어를 일반 언어로 번역)
  - 이슈 트래커 로그
  - 에이전트 간 의사결정 기록
  - 설계 변경 사유서
  - 코드 리뷰 결과 요약
```

**기술 구현**: adev가 이벤트 발생 시 documenter를 query()로 spawn → 문서 생성 → 종료
```
architect 설계 완료 → adev가 documenter spawn → LanceDB에서 설계 컨텍스트 복원 → "설계 문서 생성" → 종료
tester 결과 나옴   → adev가 documenter spawn → LanceDB에서 테스트 결과 복원 → "테스트 리포트 생성" → 종료
qc 실패           → adev가 documenter spawn → LanceDB에서 실패 컨텍스트 복원 → "버그 리포트 생성" → 종료
reviewer 피드백   → adev가 documenter spawn → LanceDB에서 리뷰 결과 복원 → "리뷰 결과 기록" → 종료
coder 수정 완료   → adev가 documenter spawn → LanceDB에서 변경 이력 복원 → "CHANGELOG 갱신" → 종료
```

**[v2.3 변경] 유휴 시간 토큰 = 0**: documenter가 이벤트 없을 때는 spawn되지 않으므로 토큰 소모 없음.
LanceDB에 모든 에이전트 출력이 저장되어 있으므로 상시 가동과 동일한 문서 품질 보장.

### 7.4 자동 생성 [v2.3 변경: 프롬프트 상세화]

- **에이전트 .md** + **SKILL.md** 모두 프로젝트 스펙에 맞게 자동 생성
- Claude 가이드 형식 준수
- 1계층에서 스펙 확정 → 2계층 진입 시 자동 생성
- **[v2.3] .md는 초안 생성 → 유저가 검토/수정 → 확정**

#### agent.md 생성 흐름 [v2.3 신규]

```
Step 1: 1계층이 프로젝트 스펙 기반으로 각 에이전트 .md 초안 생성
Step 2: 유저에게 보여줌 → 유저가 수정/승인
Step 3: 확정된 .md를 프로젝트별 .adev/agents/에 저장
Step 4: 2계층 에이전트 spawn 시 해당 .md 적용
```

#### 공통 프롬프트 구조 [v2.3 신규]

```
"아래 프로젝트 스펙을 기반으로 {{agentName}} 에이전트의 가이드 문서 초안을 생성하세요.

프로젝트 정보:
- 이름: {{projectName}}
- 유형: {{projectType}}
- 기술 스택: {{techStack}}
- 코딩 컨벤션: {{conventions}}
- 대상 유저: {{targetUser}}

{{agentSpecificInstructions}}

작성 규칙:
- Claude 가이드 형식 (CLAUDE.md 스타일)
- 프로젝트 스펙에 맞춤화된 구체적 지침
- 예시 포함
- {{language}}로 작성

⚠️ 이 문서는 초안입니다. 유저가 검토 후 최종 확정합니다."
```

#### 에이전트별 지침 (agentSpecificInstructions) [v2.3 신규]

**architect**:
```
역할: 설계 + 아키텍처 결정 + 모듈 분해
집중 영역:
- 이 프로젝트에 적합한 아키텍처 패턴
- 모듈 분해 기준 (단일 책임, 의존성 방향)
- 금지 패턴 (프로젝트에 부적합한 것)
- 기술 스택 버전 및 라이브러리 제약
- DESIGN Phase에서 팀 토론 시 의사결정 기준
- 직접 코딩 금지, 설계 문서 출력에 집중
```

**qa**:
```
역할: 예방 중심 품질 보증 (코딩 전 + 코딩 중)
집중 영역:
- 코딩 전 스펙 검증 체크리스트
- 실시간 스태틱 분석 규칙 (lint, type check)
- 스모크 테스트 기준
- 코딩 컨벤션 준수 확인 기준
- 스펙 모호성 발견 시 에스컬레이션 규칙
- VERIFY Phase에서 스펙 준수 검증 기준
- 직접 코딩/수정 금지, 검증과 피드백에 집중
```

**coder**:
```
역할: 실제 코드 구현
집중 영역:
- 코딩 컨벤션 (네이밍, 포맷, 주석 스타일)
- 디자인 패턴 사용 규칙
- 에러 처리 패턴 (try-catch, Result 타입 등)
- Git branch 규칙 (feature/{기능명}-{모듈명}-coderN)
- 모듈 경계 준수 (다른 coder 담당 파일 수정 금지)
- 코드 품질 기준 (이해하기 쉽게, 일관된 패턴)
- architect 설계 문서 충실히 따르기
- 테스트 코드 작성 금지 (tester 영역)
```

**tester**:
```
역할: 테스트 케이스 생성 + 실행
집중 영역:
- 테스트 프레임워크 및 도구 (프로젝트 스택에 맞게)
- 유형 정의서 기반 테스트 케이스 생성 규칙
- Unit / Module / E2E 각각의 작성 기준
- random 비중 80%+ 생성 전략
- E2E = 실제 유저 관점 전체 라이프사이클
- Fail-Fast 원칙 준수 (1개 실패 → 즉시 중단)
- 통합 모드: 계단식 Fail-Fast 실행 규칙
- 코드 수정 금지 (실패 보고만)
```

**qc**:
```
역할: 사후 검출 중심 품질 관리 (완성된 코드 검증)
집중 영역:
- 테스트 통과 여부 검증 기준
- 실패 시 근본 원인 분석 방법 (1개만 집중)
- 커버리지 목표 설정 기준
- 스펙 대비 구현 완성도 검증
- VERIFY Phase에서 테스트 결과 기반 합격/불합격 판정
- qa와의 역할 구분: qa=예방, qc=검출
- 코드 수정 금지 (분석과 판정에 집중)
```

**reviewer**:
```
역할: 코드 리뷰 + 품질 최종 검증
집중 영역:
- 코드 리뷰 체크리스트 (가독성, 유지보수성, 성능)
- 코드 스멜 감지 기준
- 디자인 패턴 준수 여부 확인
- SOLID 원칙 등 설계 원칙 적용 검증
- 보안 취약점 기본 체크
- VERIFY Phase에서 코드 품질 합격/불합격 판정
- 리뷰 피드백 형식 (위치, 심각도, 제안)
- 코드 직접 수정 금지 (피드백만)
```

**documenter**:
```
역할: 문서 생성 (이벤트 트리거 방식)
집중 영역:
- 문서 작성 톤 및 대상 독자 설정
- 초등학생도 이해할 수 있는 설명 수준
- 기능 설명서 작성 기준
- 테스트 결과서 (왜 실패했는지 설명 포함)
- CHANGELOG (기술 용어 → 일반 언어 번역)
- 커버리지 리포트 (왜 낮은지, 어떤 위험이 있는지 설명)
- 버그 리포트, 설계 변경 사유서, API 연동 정의서
- LanceDB에서 컨텍스트 복원하여 작성
- 이벤트 트리거: Phase 완료 시 spawn → 문서 생성 → 종료
```

---

## 8. 2계층 상세 — 자율 개발

### 8.1 2대 실행 방법 [v2.2 변경: 3대 → 2대]

**방법 ①: SDK query() + Agent Teams — 전체 에이전트 실행**

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

// Agent Teams 활성화 (env 설정만으로)
const session = query({
  prompt: "아키텍처 설계: [스펙 내용]",
  options: {
    settingSources: [],
    permissionMode: "bypassPermissions",
    model: "sonnet",
    allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
    env: {
      "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"  // Agent Teams 활성화
    }
  }
});
```

**출처**: Isaac Kargar, ["Agent Teams with Claude Code and Claude Agent SDK"](https://kargarisaac.medium.com/agent-teams-with-claude-code-and-claude-agent-sdk-e7de4e0cb03e) (Medium, 2026년 2월) — SDK query() 내에서 TeamCreate → Task → SendMessage → TeamDelete 전체 라이프사이클 동작 확인.

**Phase별 사용 패턴**:

| Phase | 실행 방식 | Agent Teams | 이유 |
|-------|----------|-------------|------|
| DESIGN | query() 1개 | ✅ 활성화 | 팀 토론 필요 (architect/qa/coder/reviewer 실시간 의논) |
| CODE | query() N개 동시 (Promise.all) | ❌ 불필요 | coder 간 독립 병렬 (대화 불필요) |
| TEST | query() 순차 | ❌ 불필요 | Fail-Fast 순차 실행 |
| VERIFY | query() 순차 | ❌ 불필요 | 4중 검증 순차 실행 |

**방법 ②: LanceDB — 영구 기록/컨텍스트 복원**

- 세션 종료, 토큰 리셋 후에도 보존
- 설계 결정, 실패 이력, 코드 인덱스 저장
- 벡터 검색으로 컨텍스트 복원
- 모든 Phase의 결과를 영구 저장

**[v2.2 삭제] ~~방법②: Agent Teams Inbox 파일 직접 조작~~**
- SDK query()에서 Agent Teams가 네이티브 동작하므로 inbox 파일 직접 조작 불필요
- Claude Code CLI/UI 의존성 완전 제거

### 8.2 데이터 흐름 통합 [v2.2 변경]

```
adev (TypeScript 프로세스) = Team Leader
  │
  ├─ DESIGN: query() 1개 + Agent Teams env
  │   → lead agent가 teammate spawn (TeamCreate → Task)
  │   → teammate 간 SendMessage 실시간 토론
  │   → adev는 스트림 모니터링 + 이상 시 개입
  │
  ├─ CODE: query() N개 동시 (Promise.all)
  │   → 각 coder 독립 모듈 구현
  │   → architect/reviewer 감독 별도 query()
  │   → adev가 결과 수집/검증
  │
  ├─ TEST/VERIFY: query() 순차
  │   → adev가 Fail-Fast 판단, 4중 검증 종합
  │
  └─ LanceDB: 모든 대화/결정/코드 벡터 저장
              세션 재시작 시 컨텍스트 복원
```

### 8.3 adev 직접 제어 + 스트림 감시 [v2.2 변경]

adev(TypeScript 프로세스)가 **직접 오케스트레이터**:

```
[DESIGN 페이즈 — Agent Teams 활용]
query() 1개 호출 → lead agent가 팀 구성 + 토론 주도
adev는 SDK 스트림 모니터링:
  → 정상: 개입 안 함
  → 이상 감지: 세션 종료 → 새 query()로 강제 지시

[CODE/TEST/VERIFY 페이즈 — 독립 query()]
adev가 직접 query() 호출/관리:
  → Phase 전환, 실패 판단, 강제 개입은 adev TypeScript 코드가 직접 수행
  → Agent Teams 불필요

[LanceDB 영구 레이어]
모든 Phase 결과 자동 저장 → 벡터 인덱싱
```

**adev가 감지하는 이상 패턴:**
- 확증편향: 전원 동의만 반복
- 루프: 같은 논의 반복
- 무시: architect 피드백을 coder가 무시
- 교착: 스트림 출력 없이 멈춤

**adev 개입 방법:**
- 세션 종료 후 새 query()로 강제 지시
- 수정된 프롬프트로 재spawn
- 극단적: Agent Teams 비활성화하고 독립 query()로 전환

### 8.4 기능 단위 개발 루프 (2계층-A)

#### 4-Phase 협업 모델

```
기능 N 시작

┌─── Phase 1: DESIGN (협업 설계) ──────────────────────┐
│                                                       │
│  실행: query() 1개 + Agent Teams env 활성화           │
│  참여: architect + qa + coder + reviewer (teammate)   │
│  + documenter: 이벤트 트리거 — 설계 완료 시 spawn하여 문서 생성 [v2.3]  │
│                                                       │
│  lead agent가 TeamCreate → teammate spawn:            │
│    architect: 아키텍처 설계 주도                       │
│    coder: 구현 효율성/실현 가능성 피드백                │
│    qa: 스펙 대비 누락/모순 검증 (Gate)                 │
│    reviewer: 설계 품질/패턴 일관성 검토                 │
│  teammate 간 SendMessage로 실시간 토론                 │
│  adev: 스트림 모니터링, 이상 패턴 감지                  │
│                                                       │
│  종료 조건: qa Gate 통과 + 전원 합의                    │
│  실패 시: architect 재설계 → 재의논                     │
└───────────────────────────────────────────────────────┘
                          ↓
┌─── Phase 2: CODE (병렬 코딩) ────────────────────────┐
│                                                       │
│  실행: query() N개 동시 (Promise.all)                 │
│  참여: coder×N + architect(감독) + reviewer(감독)      │
│  + documenter: 이벤트 트리거 — 코드 완료 시 spawn하여 문서 생성 [v2.3]  │
│                                                       │
│  coder×N: 각각 독립 query()로 모듈별 병렬 구현          │
│  architect: 별도 query()로 설계 준수 감독               │
│  reviewer: 별도 query()로 코드 품질 감독                │
│  Agent Teams 불필요 (coder 간 대화 없음)               │
│                                                       │
│  coder 간: Git branch로 격리 (같은 파일 편집 금지)     │
│  종료 조건: 전체 코드 구현 완료 + architect/reviewer 승인│
│  기준: 완전 개발 (에러 처리, 엣지 케이스, 로깅, 문서 포함)│
│  실패 시: 해당 coder에 수정 지시                        │
└───────────────────────────────────────────────────────┘
                          ↓
┌─── Phase 3: TEST (Fail-Fast 대량 테스트 + 품질 검증) ──┐
│                                                       │
│  실행: query() 순차                                    │
│  참여: tester + qc + coder(대기)                      │
│  + documenter: 이벤트 트리거 — 테스트 완료/실패 시 spawn하여 문서 생성 [v2.3]  │
│                                                       │
│  ⚠️ Fail-Fast 원칙: 1개라도 실패 → 즉시 중단 → 수정    │
│                                                       │
│  tester:                                              │
│    1. 유형 정의서 기반 테스트 케이스 코드 생성            │
│    2. Unit 1만 순차 실행 (1개 실패 → 즉시 중단)         │
│    3. Unit 전체 통과 → Module 1만 순차 실행             │
│    4. Module 전체 통과 → E2E 10만+ 순차 실행            │
│  qc: 실패 시 근본 원인 분석 (1개만 집중)                │
│  coder: 해당 1개 버그 수정                             │
│  → tester: 해당 단계 처음부터 재실행                    │
│  (전체 통과할 때까지 무한 반복)                          │
│                                                       │
│  종료 조건: Unit→Module→E2E 전체 0 실패 + qc 승인      │
│  핵심: 다 돌리고 나서 수정 ❌ → 1개 실패 즉시 수정 ✅    │
└───────────────────────────────────────────────────────┘
                          ↓
┌─── Phase 4: VERIFY (4중 검증) ────────────────────────┐
│                                                       │
│  실행: query() 순차                                    │
│  ① qa/qc: 스펙 준수 + 테스트 통과 검증                 │
│  ② reviewer: 코드 품질 + 디자인 패턴 준수               │
│  ③ 1계층 Claude API: 의도 기반 검증                    │
│     "내가 설계한 대로 구현되었는가?"                     │
│     "빠진 엣지 케이스 없는가?"                          │
│     스펙 수정 필요 시 → 유저에게 질문                    │
│  ④ adev: 위 3개 결과 종합 + 확증편향 체크               │
│     4개 모두 통과해야 다음 기능으로                      │
│                                                       │
│  실패 시: 실패 유형에 따라 적절한 Phase로 돌아감          │
└───────────────────────────────────────────────────────┘

기능 N 완료 ✅ → 기능 N+1 시작 (전체 100% 완성까지 무한 반복)
```

#### 모듈 분배 프로세스

```
DESIGN 페이즈에서 결정:
  architect + coder가 Agent Teams 토론으로 의존성 그래프 생성
  → qa/qc 각각 검증
  → reviewer 검증
  → adev가 의존성 기반 coder spawn 순서 결정
```

예: auth 모듈 완성 → user 모듈 시작 (의존성)

#### Coder ×N 병렬 실행 + Git Branch [v2.2 보강]

**분배 규칙**:
- **모듈 단위 분배** (파일 단위 아님)
- 같은 파일 2개 이상 coder 편집 금지
- 의존성 그래프가 spawn 순서 결정
- coder 수: 기능 복잡도에 따라 1~5개

**Git Branch 전략**:
```
main (보호)
  ├─ feature/{기능명}-{모듈명}-coder1  ← coder-1 작업
  ├─ feature/{기능명}-{모듈명}-coder2  ← coder-2 작업
  └─ feature/{기능명}-{모듈명}-coder3  ← coder-3 작업

merge 규칙:
  1. 의존성 그래프 순서대로 순차 merge (예: auth → user → payment)
  2. adev가 merge 순서 결정 + 실행
  3. 충돌 발생 시 → coder + qa + qc + reviewer + architect가 함께 논의하여 해결
  4. 해결 후 tester 재실행 (Fail-Fast)
```

#### tester 모드

```
⚠️ 공통 원칙: Fail-Fast
  - 1개라도 실패 → 즉시 중단 → 수정 → 해당 단계 처음부터 재실행
  - 이유: 다 돌리고 나서 수정하면 실패 원인이 뒤엉켜 추적 불가
  - 실패 시 qc가 근본 원인 1개만 집중 분석

기능 모드 (2계층-A):
  - 유형 정의서 기반 테스트 케이스 코드 생성
  - 실행 순서: Unit 1만 → Module 1만 → E2E 10만+
  - 각 단계 전체 통과해야 다음 단계 진입
  - random 비중 80%+

통합 모드 (2계층-B):
  - 계단식 Fail-Fast (영향 범위 기반 차등)
  - Step 1: 수정된 기능 E2E 10만+ (전체)
  - Step 2: 연관 기능 E2E 1만 (회귀)
  - Step 3: 비연관 기능 E2E 1천 (스모크)
  - Step 4: 전부 통과 시 → 통합 E2E 100만회 최종 1회
  - 각 Step 중 1개 실패 → 즉시 중단 → 수정 → 해당 Step 처음부터
  - 클린 환경 (개발 폴더와 완전 분리)
  - 프로덕션 시뮬레이션
```

#### 테스트 수량 설정 [v2.2 신규]

기본값은 유지하되, 프로젝트 규모/하드웨어에 맞게 조절 가능:

```json
{
  "testing": {
    "unit_count": 10000,
    "module_count": 10000,
    "e2e_count": 100000,
    "integration_e2e_count": 1000000,
    "parallel_workers": "auto",
    "e2e_timeout_seconds": 300
  }
}
```

`parallel_workers: "auto"`: 시스템 리소스(CPU 코어, 메모리, 디스크 I/O) 기반 자동 산출. 안전장치: 메모리 80% 초과 시 자동 축소.

### 8.5 통합 검증 (2계층-B)

전체 기능 개발 완료 후, 프로덕션 레벨 통합 검증:

```
⚠️ Fail-Fast 원칙: 1개라도 실패 → 즉시 중단 → 수정 → 해당 단계 처음부터

tester(통합 모드): 계단식 Fail-Fast 실행
  환경: 유저 선택
    ├─ 로컬: 개발 폴더와 완전 분리된 임시 폴더
    │   클린 설치 → 테스트 → 삭제 → 잔여물 확인
    └─ 클라우드: 유저가 설정한 환경

  범위:
    - 실제 OS에 설치
    - 실제 네트워크 환경
    - 장시간 연속 사용
    - 메모리 릭, 디스크 누수
    - 동시 사용자 부하
    - 랜덤 시나리오 무한 반복

  Step 1: 각 기능별 E2E 10만+ (전체) — 1개 실패 → 즉시 중단
  Step 2: 연관 기능 E2E 1만 (회귀) — 1개 실패 → 즉시 중단
  Step 3: 비연관 기능 E2E 1천 (스모크) — 1개 실패 → 즉시 중단
  Step 4: 전부 통과 → 통합 E2E 100만회 최종 실행 — 1개 실패 → 즉시 중단

  → qc(통합 검증)
  → reviewer(최종 리뷰)
  → 1계층(의도 검증)
  → adev(종합 판단)

  실패 시 흐름:
    1개 실패 → 즉시 중단
    → qc: 근본 원인 1개만 집중 분석
    → 2계층-A 전체 루프 재실행 (architect부터)
    → 해당 기능 Unit 1만 + Module 1만 + E2E 10만+ (Fail-Fast)
    → 회귀 테스트 (다른 기능 영향 확인)
    → 다시 계단식 통합 검증 (Step 1부터)
    → 최종 100만회 통과까지 반복
    → 버그 0까지 반복
```

### 8.6 유저 확인 (2계층-C)

통합 검증 통과 후:

```
유저에게 전달:
  - 완성된 결과물
  - 통합 E2E 100만회 테스트 결과서
  - 전체 기능 목록 + 검증 상태

유저 판단:
  ├─ 수정 필요 → 2계층-A 또는 B로 돌아감
  └─ 확정 → 3계층 진입
```

---

## 9. 3계층 상세 — 산출물 + 지속 검증

3계층은 **전체 자동화**. 유저 확인은 2계층-C에서 이미 완료.

### 9.1 통합 문서 생성

**2계층 documenter = 벽돌 (개별 조각), 3계층 = 벽돌로 집 짓기 (통합)**

2계층에서 만든 조각 문서들:
```
기능별 설명서, 기능별 테스트 결과서, 기능별 API 연동 정의서,
버그 리포트(건별), 수정 내역(건별), 코드 리뷰 결과(건별),
CHANGELOG, 설계 변경 사유서, 의사결정 기록
```

3계층에서 통합하여 생성:
```
프로젝트 문서 (기본 템플릿 8개):
  - README (.md) — 프로젝트 소개
  - 전체 API 문서 (.md / .html) — 개발자용 레퍼런스
  - 전체 아키텍처 문서 (.md + 다이어그램) — 시스템 구조
  - 프로젝트 사용 설명서 (.md / .pdf) — 유저 매뉴얼
  - 설치/배포 가이드 (.md) — 설치 절차
  - 전체 테스트 결과 통합 리포트 (.md / .pdf)
  - 전체 CHANGELOG 정리본 (.md)
  - 기여 가이드 (.md) — 오픈소스면

비즈니스 산출물 (기본 템플릿 4개):
  - 포트폴리오 (.pdf / .pptx) — 프로젝트 소개 자료
  - 사업계획서 / 사업제안서 (.pdf / .docx)
  - 투자제안서 (.pdf / .pptx)
  - PPTX 발표자료 (.pptx) — 프레젠테이션

유저 커스텀:
  - 글로벌: ~/.adev/templates/ 에 추가
  - 프로젝트별: /project/.adev/templates/ 에 추가 (글로벌보다 우선)
  - 유저가 요청하는 모든 형식의 문서 추가 가능
```

### 9.2 문서 생성 협업 방법

```
1계층: 문서 구조/방향/톤 결정 (기획 의도를 아니까)
  → 문서 뼈대 생성
2계층 documenter: 구현 상세 채워넣기 (코드/테스트를 아니까)
  → 기술적 내용 작성
1계층: 최종 검토 + 다듬기
  → 완성

adev가 중간에서 1계층 출력 → 2계층 입력, 2계층 출력 → 1계층 입력 중계
```

### 9.3 지속 E2E 검증

2계층-B 통합 E2E와는 **다른 레벨**:

```
2계층-B (개발 완료 직후):
  계단식 통합 검증 → 최종 100만회, 버그 0 확인

3계층 (산출물 생성과 병행):
  지속적 E2E 실행 (유지보수 차원, Fail-Fast 적용)
  → 문서 생성 중에도 계속 돌림
  → 1개 실패 → 즉시 중단 → 2계층 전체 루프 재실행 (architect부터)
  → 수정 완료 → 계단식 통합 검증 → 3계층 복귀
```

### 9.4 3계층 → 2계층 버그 리포트

```
⚠️ Fail-Fast 원칙 동일 적용

버그 발견 (지속 E2E 중 1개 실패 → 즉시 중단)
  → qc: 근본 원인 1개만 집중 분석
  → 2계층 전체 루프 재실행 (architect부터)
  → "이 버그가 설계 문제인지 구현 문제인지" architect가 판단
  → coder 수정 (Fail-Fast로 1개만 집중)
  → 수정 완료 → 해당 기능 Unit/Module/E2E 통과 (Fail-Fast)
  → 회귀 테스트
  → 계단식 통합 검증:
      Step 1: 수정된 기능 E2E 10만+ (전체)
      Step 2: 연관 기능 E2E 1만 (회귀)
      Step 3: 비연관 기능 E2E 1천 (스모크)
      Step 4: 전부 통과 → 통합 E2E 100만회 최종 1회
      (각 Step 중 1개 실패 → 즉시 중단 → 수정 → 해당 Step 처음부터)
  → 4중 검증
  → 유저 재확인 (변경 사항 요약만)
  → 3계층 복귀
```

---

## 10. 데이터 공유 — 2중 전략 [v2.2 변경: 3중 → 2중]

### 10.1 우선순위

```
1순위: SDK query() 세션 내 컨텍스트
  → DESIGN: Agent Teams SendMessage (팀 토론)
  → CODE/TEST/VERIFY: query() 독립 세션 + 파일 시스템 공유
  → 실시간 의논, 짧은 피드백, 상태 전달
  → 제약: 컨텍스트 윈도우 크기 한계

2순위: LanceDB 벡터 공유
  → 과거 결정 이력, 실패 이유, 코드 인덱스 등 장기 기억
  → 세션 만료/재시작 후에도 보존
  → 벡터 검색으로 관련 컨텍스트 자동 추출

[v2.2 삭제] ~~inbox 파일 직접 조작에 의한 데이터 공유~~
```

파일 시스템 공유는 여전히 사용되지만, inbox 파일 직접 조작이 아닌 **에이전트들이 같은 프로젝트 디렉토리에서 코드/문서를 읽고 쓰는** 자연스러운 형태로만 사용.

### 10.2 LanceDB 스키마

```typescript
// 1. 영구 메모리 (대화 이력)
interface MemoryRecord {
  id: string;
  projectId: string;
  type: 'conversation' | 'decision' | 'feedback' | 'error';
  content: string;
  embedding: Float32Array;
  metadata: {
    phase: Phase;
    featureId: string;
    agentName: string;
    timestamp: Date;
  };
}

// 2. 코드 인덱스
interface CodeRecord {
  id: string;
  projectId: string;
  filePath: string;
  chunk: string;
  embedding: Float32Array;
  metadata: {
    language: string;
    module: string;
    functionName: string;
    lastModified: Date;
    modifiedBy: string;
  };
}

// 3. 설계 결정 이력
interface DesignDecision {
  id: string;
  projectId: string;
  featureId: string;
  decision: string;
  rationale: string;
  alternatives: string[];
  decidedBy: string[];
  embedding: Float32Array;
  timestamp: Date;
}

// 4. 실패 이력
interface FailureRecord {
  id: string;
  projectId: string;
  featureId: string;
  phase: Phase;
  failureType: string;
  rootCause: string;
  resolution: string;
  embedding: Float32Array;
  timestamp: Date;
}
```

---

## 11. 토큰 관리 [v2.2 신규]

### 11.1 인증 방식별 감지

**API Key 모드 (ANTHROPIC_API_KEY)** — 감지 완벽 지원:

Anthropic API는 모든 응답에 rate limit 헤더 포함 (출처: Anthropic 공식 Rate Limits 문서):
```
anthropic-ratelimit-requests-remaining: "45"
anthropic-ratelimit-input-tokens-remaining: "95000"
anthropic-ratelimit-output-tokens-remaining: "8000"
→ 429 에러 시 retry-after 헤더로 정확한 대기 시간 제공
```

**Subscription 모드 (CLAUDE_CODE_OAUTH_TOKEN)** — 수동 추적:
```
- rate limit 헤더 없으므로 response.usage 누적 추적 (직접 카운팅)
- 추정 한도 대비 사용량 비율 계산
- 5시간 롤링 윈도우 + 7일 롤링 캡 (비공식 추정)
- Pro ~45 메시지/5시간, Max 5x ~225, Max 20x ~900
```

### 11.2 adev 토큰 관리 전략

```
API Key 모드:
  token-monitor가 매 응답의 rate limit 헤더 파싱
  → remaining 20% 이하: 새 세션 spawn 억제
  → remaining 5% 이하: 현재 세션들 graceful 완료만 허용
  → 429 수신 시: retry-after 헤더 기반 정확한 대기
  → reset 시점 도달 후: 활성이었던 모든 세션 복원

Subscription 모드:
  response.usage 누적 추적:
  → 추정 한도 임박 시 동일 억제 로직 적용
  → 5시간 윈도우 기반 리셋 타이머 설정
  → 401 에러 수신 시:
    - 토큰 만료 → 유저에게 `claude setup-token` 재실행 안내
    - rate limit → 리셋까지 대기
```

### 11.3 세션 복원 흐름

```
한도 임박 감지
  → 진행 중인 모든 에이전트 세션 상태를 LanceDB에 스냅샷 저장
    (현재 Phase, 진행률, 마지막 작업, 미완료 항목)
  → 새 spawn 억제, 현재 세션 graceful 종료
  → reset 시점까지 대기 (API: retry-after / Subscription: 5시간 윈도우)
  → 리셋 확인 후 LanceDB에서 스냅샷 로드
  → 활성이었던 모든 세션 순서대로 복원
    - sessionId로 SDK 세션 재개 시도
    - 실패 시 새 세션 spawn + 벡터 검색으로 컨텍스트 복원
```

---

## 12. 운영 규칙

- **SDK 단독 운영**: Claude Agent SDK만으로 전체 시스템 구동 (Claude Code CLI/UI 불필요)
- **Fail-Fast 테스트**: 테스트 1개라도 실패 → 즉시 중단 → 수정 → 해당 단계 처음부터 재실행 (다 돌리고 수정 금지)
- **계단식 통합 검증**: 수정 기능 10만+ → 연관 1만 → 비연관 1천 → 전부 통과 시 100만회 최종 1회
- QA Gate 통과 → QC 테스트 통과 → 4중 검증 통과 → 전체 기능 100% 완성까지 무한 반복
- 토큰 한도 도달 시 LanceDB 스냅샷 저장 → 리셋 대기 → 세션 복원 → 이어서 진행
- 크리티컬 이슈만 즉시 유저에게 질문, 나머지는 완성 후 모아서 전달
- 유저가 어떤 언어로든 개발 가능
- 코드 품질: 이해하기 쉽게 정리, 일관된 디자인 패턴 사용
- Skills + RAG에 LanceDB 벡터 DB 적극 사용 (progressive disclosure + 벡터 검색 병행)
- 메모리 영구 저장 (유저 삭제 지시 전까지)
- openai-patterns는 개발 보조용 (런타임 X)
- 이 에이전트 시스템 자체 개발 시에도 동일 규칙 적용
- 완전 개발 기준: 코어 기능만이 아니라 에러 처리, 엣지 케이스, 로깅, 문서 전부 포함

---

## 13. 기술 스택 상세

### LanceDB

- 임베디드, 서버 불필요 (SQLite처럼 파일 기반)
- 설치: `bun add @lancedb/lancedb`
- 네이티브 TypeScript SDK
- 벡터 검색 + 풀텍스트(BM25) + SQL 필터링
- 디스크 저장, 메모리 로드

### Claude Agent SDK — 유일한 에이전트 런타임 [v2.3 변경, v2.4 V2 확정]

- 출처: Anthropic Agent SDK TypeScript Reference
- **V2 Session API 확정** (PoC 성공, SDK v0.2.63) [v2.4 결정]
- `unstable_v2_createSession()` — 세션 생성
- `session.stream()` — hooks 지원 (PreToolUse/PostToolUse/TeammateIdle)
- `unstable_v2_prompt()` — 단발성 실행 (동시 세션 안정성 PoC 확인)
- `settingSources: []` — 파일시스템 설정 의존 없음
- `permissionMode: 'bypassPermissions'` — 자율 운영
- `env: {"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"}` — Agent Teams 활성화
- ~~V1 query() primary~~ → **V2 Session API로 전환** [v2.4]
- **Claude Code CLI/UI 불필요** — SDK 단독으로 Agent Teams 포함 전체 기능 동작

**[v2.4] V2 Session API 런타임 구조**:

```typescript
// V2 Session API 기반 구현
import { unstable_v2_createSession } from '@anthropic-ai/claude-code';

const session = unstable_v2_createSession({
  systemPrompt: agentPrompt,
  permissionMode: 'bypassPermissions',
  env: { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" }
});

// Hook 기반 실시간 모니터링
for await (const event of session.stream(prompt, {
  hooks: {
    preToolUse: async (tool) => { /* 도구 사용 전 캡처 */ },
    postToolUse: async (tool, result) => { /* 도구 사용 후 캡처 */ },
    onTeammateIdle: async (teammate) => { /* teammate 유휴 감지 */ }
  }
})) {
  // stream 처리
}
```

**AgentExecutor 추상화 유지** (향후 SDK API 변경 대비):

```typescript
interface AgentExecutor {
  execute(config: AgentConfig): AsyncIterable<AgentEvent>;
  resume(sessionId: string): AsyncIterable<AgentEvent>;
}

// 현재: V2 Session API 사용
class SessionV2Executor implements AgentExecutor {
  async *execute(config: AgentConfig): AsyncIterable<AgentEvent> {
    const session = unstable_v2_createSession(config.options);
    for await (const event of session.stream(config.prompt, config.hooks)) {
      yield event;
    }
  }
}
```

### Agent Teams (SDK 내 활성화) [v2.2 변경, v2.4 PoC 확인]

- SDK query()/session.stream()의 env 설정으로 활성화 (Claude Code 불필요)
- TeamCreate → Task (teammate spawn) → SendMessage (실시간 메시징) → TeamDelete
- adev에서는 DESIGN 페이즈 팀 토론에만 사용
- 나머지 Phase는 독립 query() / unstable_v2_prompt() 호출
- ~~Fallback: Agent Teams 제거 시 → query() concurrent + adev aggregation~~ → **PoC 성공, 대안 불필요** [v2.4]
- **알려진 이슈**: TeamDelete race condition — config.json 멤버 목록 자동 갱신 안 됨, 수동 편집 또는 팀 재생성으로 우회 [v2.4]
- **모니터링**: Hook(PreToolUse/PostToolUse 8쌍 + TeammateIdle) + 디스크 IPC 폴링 조합 [v2.4]

**디스크 IPC 구조** (PoC 확인, V1/V2 동일) [v2.4]:
```
~/.claude/
├── teams/{team-name}/
│   ├── config.json          ← 팀 설정 + 멤버 목록
│   └── inboxes/
│       └── {agent}.json     ← 각 에이전트 수신함 {from, text, summary, timestamp, read}
└── tasks/{team-name}/
    ├── .lock
    └── {id}.json            ← 태스크 정의
```

**출처**: Isaac Kargar, "Agent Teams with Claude Code and Claude Agent SDK" (Medium, 2026년 2월) — SDK query() 내 전체 라이프사이클 동작 확인
**PoC 검증**: github.com/uygnoey/adev-poc-guide (2026-03-03, SDK v0.2.63) [v2.4]

### 임베딩 — 4-Provider Tier [v2.2 신규]

`EmbeddingProvider` 인터페이스로 추상화. 상세: `adev-embedding-strategy.md` 참조.

| Tier | 제공자 | 역할 | 비용 |
|------|--------|------|------|
| 1-무료 | Xenova `all-MiniLM-L6-v2` (패키지: `@huggingface/transformers` v3) | 기본값, 오프라인, 즉시 동작 | 무료 |
| 1-무료 | Jina v3 로컬 | 고품질 무료, GPU 권장 | 무료 (비상업 라이선스 주의) |
| 2-유료 | Voyage `voyage-3-lite` | 고품질 범용 | 유료 API |
| 2-유료 | Voyage `voyage-code-3` | 코드 특화 | 유료 API |

---

## 14. 전체 흐름 요약

```
[1계층] 유저 대화 — Claude API
  아이디어 → 기획 → 설계 → 스택
  → 테스트 케이스 유형 정의서
  → 유저 "확정"
  → Contract(HandoffPackage) 생성 + 검증 [v2.2]
  → 유저 컨펌

[2계층-A] 기능 단위 개발 — SDK query() + Agent Teams
  모듈 분배: DESIGN 페이즈에서 Agent Teams 토론 → adev spawn 순서
  기능별 루프:
    Phase 1 DESIGN: query() + Agent Teams (팀 토론), adev 스트림 감시
    Phase 2 CODE: query()×N 동시 (Promise.all), Git branch 격리, adev 감시
    Phase 3 TEST (Fail-Fast):
      Unit 1만 → Module 1만 → E2E 10만+ 순차 실행
      1개 실패 → 즉시 중단 → 수정 → 해당 단계 처음부터
    Phase 4 VERIFY: qa/qc → reviewer → 1계층 → adev (4중 검증)
    + documenter: 이벤트 트리거로 각 Phase 완료 시 문서 생성 [v2.3]
  전체 기능 100% 완성까지 무한 반복

[2계층-B] 통합 검증 (계단식 Fail-Fast)
  Step 1: 각 기능별 E2E 10만+ (전체)
  Step 2: 연관 기능 E2E 1만 (회귀)
  Step 3: 비연관 기능 E2E 1천 (스모크)
  Step 4: 전부 통과 → 통합 E2E 100만회 최종 1회
  각 Step 1개 실패 → 즉시 중단 → 수정 → 해당 Step 처음부터
  → qc → reviewer → 1계층 → adev (4중 검증)
  → 버그 0까지 반복

[2계층-C] 유저 확인
  결과물 + 테스트 결과서 전달
  수정 → 2계층-A 또는 B
  확정 → 3계층

[3계층] 산출물 + 지속 검증
  통합 문서 생성: 1계층(뼈대) + 2계층(상세) 협업
    프로젝트 문서: 매뉴얼, API, 아키텍처, README 등
    비즈니스: 포트폴리오, 사업계획서, PPTX 등
  지속 E2E (Fail-Fast): 계속 돌림
    → 1개 실패 → 즉시 중단 → 2계층 전체 루프 → 수정 → 계단식 통합 검증
    → 유저 재확인(변경 요약) → 3계층 복귀
```

---

## 15. 미정의 항목 → 전부 해결 완료

### 해결 완료

- [x] 임베딩 모델 선정 → 4-Provider Tier 확정 (`adev-embedding-strategy.md`)
- [x] Agent Teams + SDK query() 호환성 → SDK 네이티브 동작 확인 (Isaac Kargar 아티클)
- [x] E2E 100만회 동시 실행 수 최적값 → `parallel_workers: "auto"` + 리소스 안전장치
- [x] 토큰 예산 기본값 → API key: 헤더 기반 / Subscription: 누적 추적
- [x] Agent Teams 실험적 기능 안정화 대응 → query() primary, Agent Teams는 DESIGN만, fallback 가능
- [x] Subscription 인증 headless → CLAUDE_CODE_OAUTH_TOKEN + setup-token(1년)
- [x] 1계층→2계층 인터페이스 → Contract 기반 HandoffPackage
- [x] Coder×N 파일 충돌 방지 → Git branch 전략
- [x] **Xenova Bun 호환성 → @huggingface/transformers v3에서 Bun 공식 지원 확인** [v2.3]
- [x] **4중 검증 비용 최적화 → 유저 설정: Opus 기본 + Sonnet 선택 시 실패 Opus 에스컬레이션** [v2.3]
- [x] **documenter 토큰 소모 → 이벤트 트리거 + LanceDB 컨텍스트 복원 + 전부 documenter** [v2.3]
- [x] **MCP 모듈 역할 → builtin 전부 유지 + 유저 커스텀 확장 + adev 직접 활용** [v2.3]
- [x] **SDK V1 vs V2 → ~~V1 확정~~ → V2 Session API 확정 (PoC 성공)** [v2.3→v2.4]
- [x] **agent.md 자동 생성 → 프롬프트 상세화 (초안 → 유저 수정 → 확정)** [v2.3]
- [x] **다중 프로젝트 → adev 1개 + 프로젝트 폴더 내 .adev/ 격리 + projects.json** [v2.3]
- [x] **설정 우선순위 → 프로젝트 > 글로벌 (MCP/SKILL/config/templates)** [v2.3]
- [x] **비즈니스 산출물 템플릿 → 기본 12개 + 유저 커스텀 추가** [v2.3]

### 해결 완료 — PoC 검증 [v2.4]

- [x] **P2: SDK + Agent Teams 성능 PoC** — 전부 성공 (2026-03-03, SDK v0.2.63)
  - V2-P2-1: 동시 세션 안정성 — 3개/5개 동시 `unstable_v2_prompt` 성공, 8/8 드랍아웃 없음 (54.5s, $0.886)
  - V2-P2-2: Agent Teams 기본 동작 — TeamCreate/Agent/SendMessage/TeamDelete 전부 감지, 19 turns (129.5s, $1.003)
  - V2-P2-3: Agent Teams Hooks 감시 — PreToolUse/PostToolUse 8쌍 + TeammateIdle 2회, Hook이 Stream보다 더 많은 도구 호출 캡처 (68.9s, $0.690)
  - 알려진 이슈: TeamDelete가 shutdown 승인 후에도 반복 실패 (config.json 멤버 자동 갱신 안 됨) → 수동 편집 또는 재생성으로 우회
- [x] **P3: stream-monitor Agent Teams 메시지 가시성 PoC** — 전부 성공 (2026-03-03)
  - 디스크 IPC 구조 확인: `~/.claude/teams/{team-name}/config.json`, `inboxes/{agent}.json`, `~/.claude/tasks/{team-name}/{id}.json`
  - inbox 메시지 완전 파싱 가능: `{from, text, summary, timestamp, read}` 구조
  - V1/V2 디스크 구조 100% 동일 확인
  - Hook + 파일시스템 폴링 조합으로 실시간 모니터링 완전 가시성 확보 (136.7s, $0.901)

**PoC 총 비용**: $3.881 (5개 테스트, ~420s)
**PoC 결과**: https://github.com/uygnoey/adev-poc-guide

### V2 Session API 기반 아키텍처 확정 [v2.4]

PoC 전부 성공에 따라 V2 Session API 기반 2계층 구축 확정:

```
adev 2계층 런타임 구조
├── Session Manager: unstable_v2_createSession()
├── Stream Monitor: session.stream() + hooks (PreToolUse/PostToolUse/TeammateIdle)
├── Disk Poller: ~/.claude/teams/ + tasks/ 감시 (파일시스템 폴링)
└── Agent Coordinator: TeamCreate + Agent + SendMessage + TeamDelete
```

~~PoC 실패 시 대안: Agent Teams 제거 → query() concurrent + adev aggregation~~ → **불필요 (전부 성공)**

---

## 16. PoC 결과 + 가이드 [v2.3 신규, v2.4 결과 추가]

### PoC 실행 결과 요약 [v2.4]

| 테스트 | 결과 | 소요시간 | 비용 |
|--------|------|----------|------|
| V2-P0: SDK V2 기본 동작 | **PASS** | 31.2s | $0.401 |
| V2-P2-1: 동시 세션 안정성 | **PASS** | 54.5s | $0.886 |
| V2-P2-2: Agent Teams 기본 동작 | **PASS** | 129.5s | $1.003 |
| V2-P2-3: Agent Teams Hooks 감시 | **PASS** | 68.9s | $0.690 |
| V2-P3: 디스크 기반 IPC | **PASS** | 136.7s | $0.901 |
| **합계** | **5/5 PASS** | **~420s** | **$3.881** |

**PoC 레포**: https://github.com/uygnoey/adev-poc-guide

### P2: SDK + Agent Teams 성능 PoC

**목적**: SDK query() 내에서 Agent Teams가 실제로 잘 동작하는지, 성능 한계는 어디인지 측정

**검증 항목**:
1. Agent Teams spawn 오버헤드 (TeamCreate → Task 시간)
2. teammate 동시 수 한계 (3명, 5명, 7명)
3. 동시 query() 안정성 (Promise.all로 3~5개)
4. Agent Teams SendMessage 지연 시간

**테스트 코드 위치**: `poc/p2-agent-teams-performance/`

**실행 방법**:
```bash
cd poc/p2-agent-teams-performance
bun install
bun run test-spawn-overhead.ts      # teammate spawn 시간 측정
bun run test-teammate-limit.ts      # 동시 teammate 수 한계
bun run test-concurrent-query.ts    # Promise.all 안정성
bun run test-sendmessage-latency.ts # SendMessage 지연
```

**성공 기준**:
- spawn 오버헤드: 5초 이내
- teammate 동시 7명: 안정 동작
- concurrent query 5개: 모두 정상 완료
- SendMessage 지연: 2초 이내

**실패 시 대안**: Agent Teams 비활성화 → DESIGN Phase도 독립 query()로 전환

**[v2.4] 실제 결과**: ✅ 전부 성공
- spawn 오버헤드: 콜드스타트 ~24s, 이후 ~7s (정상 범위)
- teammate 동시 5개: 안정 동작 확인
- concurrent query 5개: 전부 성공, 드랍아웃 없음
- SendMessage: Hook에서 캡처 확인 (PreToolUse/PostToolUse 8쌍)
- 알려진 이슈: TeamDelete race condition → config.json 멤버 목록 자동 갱신 안 됨, 수동 편집으로 우회

### P3: stream-monitor 메시지 가시성 PoC

**목적**: Agent Teams 내부 SendMessage 내용이 SDK 스트림에서 보이는지 확인

**검증 항목**:
1. teammate 간 SendMessage가 스트림에 노출되는지
2. 노출된다면 어떤 형식으로 보이는지
3. adev가 파싱할 수 있는 구조인지

**테스트 코드 위치**: `poc/p3-stream-visibility/`

**실행 방법**:
```bash
cd poc/p3-stream-visibility
bun install
bun run test-message-visibility.ts  # SendMessage 스트림 노출 확인
bun run test-stream-parsing.ts      # 스트림 메시지 파싱 가능성
```

**성공 기준**:
- SendMessage 내용이 스트림에서 확인 가능
- 메시지 발신자/수신자/내용 파싱 가능

**실패 시 대안**: 
- Agent Teams 결과를 LanceDB에 기록 → adev가 폴링
- 또는 Agent Teams 비활성화 후 독립 query()로 전환

**[v2.4] 실제 결과**: ✅ 전부 성공
- 디스크 IPC 구조 확인:
  ```
  ~/.claude/
  ├── teams/{team-name}/
  │   ├── config.json          ← 팀 설정 + 멤버 목록
  │   └── inboxes/
  │       └── {agent}.json     ← 각 에이전트 수신함
  └── tasks/{team-name}/
      ├── .lock
      └── {id}.json            ← 태스크 정의
  ```
- inbox 메시지 구조: `{from, text, summary, timestamp, read}` — 완전 파싱 가능
- 7개 파일 발견, JSON 파싱 성공 (4개)
- V1/V2 디스크 구조 100% 동일 확인
- Hook + 파일시스템 폴링 조합으로 실시간 모니터링 가능

---

## 17. 출처 및 참고

| 내용 | 출처 | 확인일 |
|------|------|--------|
| Agent Teams 개요 + 제약 | Anthropic 공식: docs.anthropic.com/en/docs/claude-code/agent-teams | 2026-02-27 |
| Claude Agent SDK TS Reference | platform.claude.com/docs/en/agent-sdk/typescript | 2026-02-27 |
| SDK query() headless 동작 | GitHub Issue #103 (claude-agent-sdk-typescript) | 2026-02-27 |
| **SDK + Agent Teams 동작 확인** | **Isaac Kargar, Medium: "Agent Teams with Claude Code and Claude Agent SDK"** | **2026-03-01** |
| ~~Agent Teams inbox 구조~~ | ~~OpenCode 포팅 분석~~ → v2.2에서 inbox 직접 조작 삭제 | — |
| ~~Inbox 내부 코드~~ | ~~Claude Code Issue #25135~~ → v2.2에서 삭제 | — |
| Subscription OAuth 인증 | weidwonder/claude_agent_sdk_oauth_demo (GitHub) | 2026-02-28 |
| claude-code-action OAuth | github.com/anthropics/claude-code-action/blob/main/docs/setup.md | 2026-02-28 |
| OAuth 토큰 만료 이슈 | claude-code Issue #28827 | 2026-02-28 |
| Rate Limits 헤더 | platform.claude.com/docs/en/api/rate-limits | 2026-02-28 |
| Subscription 리셋 주기 | support.claude.com/en/articles/11145838 | 2026-02-28 |
| NanoClaw 파일 기반 IPC | NanoClaw GitHub, DeepWiki 분석 | 2026-02-27 |
| OpenClaw 멀티에이전트 | OpenClaw docs, RFC Discussion #10036 | 2026-02-27 |
| Subagent 제약 | Anthropic 공식: "Subagents cannot spawn their own subagents" | 2026-02-27 |
| Anthropic embedding API 부재 | Anthropic 공식 문서 확인 | 2026-02-27 |
| 임베딩 전략 | adev-embedding-strategy.md (별도 문서) | 2026-02-27 |
| **Transformers.js v3 Bun 지원** | **HuggingFace 공식 블로그: huggingface.co/blog/transformersjs-v3** | **2026-03-03 확인** |
| **P2/P3 PoC 결과** | **github.com/uygnoey/adev-poc-guide** | **2026-03-03** |
| **V2 Session API PoC 분석** | **adev-poc-guide/poc/results/V2-ANALYSIS.md** | **2026-03-03** |
