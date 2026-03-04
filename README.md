# adev — Autonomous Development Agent

> Claude Agent SDK + RAG 기반의 자율 개발 에이전트 시스템.
> 7개 전문 에이전트가 설계부터 검증까지 전체 개발 사이클을 자율적으로 수행합니다.

[![TypeScript](https://img.shields.io/badge/TypeScript-ESNext-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.1-f9f1e1?logo=bun&logoColor=000)](https://bun.sh/)
[![Claude SDK](https://img.shields.io/badge/Claude_Agent_SDK-V2_Session_API-cc785c?logo=anthropic&logoColor=white)](https://docs.anthropic.com/)
[![LanceDB](https://img.shields.io/badge/LanceDB-Embedded_Vector_DB-4B8BBE)](https://lancedb.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## Overview

**adev**는 Claude Code Skills과 RAG(Retrieval-Augmented Generation)를 연동하여, 일관된 코드 품질로 자율 개발을 수행하는 상위 에이전트 시스템입니다.

유저와의 대화를 통해 아이디어를 기획·설계한 뒤, 7개 전문 에이전트가 4-Phase(DESIGN → CODE → TEST → VERIFY) 파이프라인을 자율적으로 실행하며, 4중 검증과 Fail-Fast 원칙을 통해 프로덕션 수준의 코드를 산출합니다.

### 핵심 특징

- **3계층 아키텍처**: 유저 대화(1계층) → 자율 개발(2계층) → 산출물/지속 검증(3계층)
- **7개 전문 에이전트**: architect, qa, coder, tester, qc, reviewer, documenter
- **4-Phase 상태 머신**: DESIGN → CODE → TEST → VERIFY (FSM 기반 전환)
- **4중 검증**: qa/qc → reviewer → 1계층(의도 검증) → adev(종합 판정)
- **Fail-Fast 테스트**: 1개 실패 → 즉시 중단 → 수정 → 재실행
- **LanceDB 벡터 메모리**: 대화, 설계 결정, 실패 이력을 영구 저장하여 경험 학습
- **4-Provider 임베딩**: 무료(Xenova/Jina) + 유료(Voyage) 자동 선택
- **MCP 서버 확장**: builtin 4개 + 유저 커스텀 MCP 지원

---

## Architecture

```
┌───────────────────────────────────────────────────┐
│  1계층: Claude API (Opus 4.6)                      │
│  유저 대화 · 기획 · 설계 · Contract 생성 · 검증 참여 │
├───────────────────────────────────────────────────┤
│            유저 "확정" → Contract → 2계층 전환       │
├───────────────────────────────────────────────────┤
│  2계층: Claude Agent SDK (V2 Session API)           │
│  ┌─────────────────────────────────────────────┐   │
│  │ 2계층-A: 기능 단위 개발                       │   │
│  │  adev (Team Leader)                         │   │
│  │  ├─ architect  — 기술 설계, 아키텍처 결정      │   │
│  │  ├─ qa         — 예방 Gate (코딩 전 검증)     │   │
│  │  ├─ coder ×N   — 코드 구현 (Git branch 병렬)  │   │
│  │  ├─ tester     — 테스트 생성 + Fail-Fast 실행  │   │
│  │  ├─ qc         — 사후 검출, 근본 원인 분석     │   │
│  │  ├─ reviewer   — 코드 리뷰, 품질 판정         │   │
│  │  └─ documenter — Phase 완료 시 문서 생성       │   │
│  ├─────────────────────────────────────────────┤   │
│  │ 2계층-B: 통합 검증 (계단식 Fail-Fast E2E)     │   │
│  ├─────────────────────────────────────────────┤   │
│  │ 2계층-C: 유저 확인                            │   │
│  └─────────────────────────────────────────────┘   │
├───────────────────────────────────────────────────┤
│  3계층: 산출물 + 지속 검증                          │
│  통합 문서 · 비즈니스 산출물 · 지속 E2E              │
└───────────────────────────────────────────────────┘
```

### 모듈 의존성 (단방향만 허용)

```
cli ──→ core, auth, layer1
layer1 ──→ core, rag
layer2 ──→ core, rag, layer1
layer3 ──→ core, rag, layer2
rag ──→ core
mcp ──→ core
auth ──→ core
```

> 역방향/순환 의존 절대 금지. `core`는 어떤 모듈도 import하지 않습니다.

---

## 4-Phase Engine

에이전트들이 각 Phase를 거치며 기능을 완성합니다.

```
DESIGN ──(qa Gate + 전원 합의)──→ CODE
CODE   ──(구현 완료 + 승인)────→ TEST
TEST   ──(전체 0 실패 + qc)───→ VERIFY
VERIFY ──(4중 검증 통과)──────→ 완료
VERIFY ──(실패)───────────────→ 실패 유형에 따라 DESIGN/CODE/TEST 복귀
```

| Phase | 실행 방식 | 주도 에이전트 | 비고 |
|-------|----------|-------------|------|
| **DESIGN** | Agent Teams (팀 토론) | architect | qa Gate 필수 통과 |
| **CODE** | query() ×N 동시 | coder ×N | 모듈별 Git branch 병렬 |
| **TEST** | query() 순차 | tester | Fail-Fast (1실패 → 즉시 중단) |
| **VERIFY** | query() 순차 | adev | 4중 검증 종합 판정 |

---

## 7 Agents

| Agent | 유형 | 역할 | 코드 수정 |
|-------|------|------|----------|
| **architect** | 루프 | 기술 설계, 구조 결정, 의존성 분석 | ✗ |
| **qa** | 루프 | 예방 Gate — 코딩 전 스펙/설계 검증 | ✗ |
| **coder** | 루프 | 코드 구현 (유일한 코드 수정 권한) | ✓ |
| **tester** | 루프 | 테스트 생성 + Fail-Fast 실행 | 테스트만 |
| **qc** | 루프 | 사후 검출, 근본 원인 1개 특정 | ✗ |
| **reviewer** | 루프 | 코드 리뷰, 컨벤션/품질 판정 | ✗ |
| **documenter** | 이벤트 | Phase 완료 시 spawn → 문서 생성 → 종료 | ✗ |

> qa는 **예방**(코딩 전), qc는 **검출**(코딩 후). 역할이 명확히 분리되어 있습니다.
> coder는 ×N 병렬 실행되며, 모듈별로 `feature/{기능명}-{모듈명}-coderN` Git branch에서 작업합니다.

---

## Tech Stack

| 분류 | 기술 | 용도 |
|------|------|------|
| **Runtime** | [Bun](https://bun.sh/) ≥1.1 | 패키지 매니저, 번들러, 테스트 러너 |
| **Language** | TypeScript (ESNext, strict) | 전체 코드베이스 |
| **Agent SDK** | [@anthropic-ai/claude-code](https://www.npmjs.com/package/@anthropic-ai/claude-code) | V2 Session API 기반 에이전트 실행 |
| **Vector DB** | [LanceDB](https://lancedb.com/) | 임베디드, 서버리스, 파일 기반 벡터 DB |
| **Embedding** | [@huggingface/transformers](https://huggingface.co/docs/transformers.js) | 로컬 임베딩 (Xenova/Jina) |
| **Linter** | [Biome](https://biomejs.dev/) | 린트 + 포맷팅 |

### 4-Provider Embedding Tier

```
VOYAGE_API_KEY 존재?
  ├─ YES → 코드: voyage-code-3, 텍스트: voyage-4-lite  (Tier 2, 유료)
  └─ NO  → 코드: jina-v3,       텍스트: xenova-minilm  (Tier 1, 무료)
```

---

## Project Structure

```
autonomous-dev-agent/
├── src/
│   ├── index.ts              # CLI 엔트리포인트
│   ├── core/                 # 설정, 에러, 로거, 메모리, 플러그인 (의존성 없음)
│   ├── auth/                 # API key / Subscription(OAuth) 인증 분기
│   ├── rag/                  # LanceDB, 임베딩, 코드 인덱싱, 하이브리드 검색
│   ├── mcp/                  # MCP 서버 관리 (builtin 4개 + 커스텀)
│   │   └── builtin/          # os-control, browser, web-search, git
│   ├── cli/                  # CLI 명령어 (init, start, config, project)
│   ├── layer1/               # 1계층: 유저 대화, 기획, 설계, Contract
│   ├── layer2/               # 2계층: 자율 개발 오케스트레이션 (16개 모듈)
│   └── layer3/               # 3계층: 통합 문서, 비즈니스 산출물, 지속 E2E
├── tests/
│   ├── unit/                 # 단위 테스트
│   ├── module/               # 모듈 간 통합 테스트
│   └── e2e/                  # E2E 테스트
├── docs/
│   └── references/           # 에이전트, Phase, 임베딩, 세션 API 등 상세 문서
├── scripts/                  # 설치/삭제 스크립트
├── ARCHITECTURE.md           # 3계층 구조, 모듈 의존성
├── SPEC.md                   # v2.4 전체 스펙
├── IMPLEMENTATION-GUIDE.md   # 구현 순서 가이드
├── package.json
├── tsconfig.json
└── biome.json
```

### LanceDB Tables

| 테이블 | 용도 |
|--------|------|
| `memory` | 대화 이력, 결정, 피드백, 에러 |
| `code_index` | 코드베이스 청크 벡터 인덱스 |
| `design_decisions` | 설계 결정 이력 |
| `failures` | 실패 이력 + 해결책 |

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) ≥ 1.1
- Claude API Key 또는 Claude Pro/Max Subscription

### Installation

```bash
# 저장소 클론
git clone https://github.com/yeongyu-yang/autonomous-dev-agent-ts.git
cd autonomous-dev-agent-ts

# 의존성 설치
bun install
```

### Authentication

```bash
# 방법 1: API Key
export ANTHROPIC_API_KEY=sk-ant-...

# 방법 2: Subscription (Pro/Max)
claude setup-token
export CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...
```

> 두 환경변수는 동시에 설정할 수 없습니다. 하나만 선택하세요.

### Usage

```bash
# 개발 모드 실행
bun run dev

# 빌드
bun run build

# 전체 검증 (타입체크 + 린트 + 테스트)
bun run check
```

### CLI Commands

```bash
adev init                    # 프로젝트 초기화 + 인증 선택
adev start                   # 1계층 대화 시작
adev config                  # 설정 조회/변경
adev project add <path>      # 프로젝트 등록
adev project list             # 등록된 프로젝트 목록
adev project switch <id>     # 활성 프로젝트 전환
```

---

## Development

### Scripts

| 명령어 | 설명 |
|--------|------|
| `bun run dev` | 개발 모드 실행 |
| `bun run build` | 프로덕션 빌드 |
| `bun run test` | 전체 테스트 |
| `bun run test:unit` | 단위 테스트 |
| `bun run test:module` | 모듈 통합 테스트 |
| `bun run test:e2e` | E2E 테스트 |
| `bun run typecheck` | TypeScript 타입 체크 |
| `bun run lint` | Biome 린트 |
| `bun run format` | Biome 자동 포맷팅 |
| `bun run check` | typecheck + lint + test 통합 |

### Code Conventions

- **ES Modules only** — CommonJS 사용 금지
- **TypeScript strict** — `any` 금지, `unknown` + 타입 가드 사용
- **Result\<T, E\> 패턴** — throw 최소화, 경계에서만 catch
- **파일명**: `kebab-case.ts` / 300줄 초과 시 분할
- **로깅**: `console.log` 금지 → `src/core/logger.ts` 사용
- **환경변수**: `process.env` 직접 접근 금지 → `src/core/config.ts` 경유

### Testing Strategy

```
Fail-Fast 원칙:
  1개 실패 → 즉시 중단 → 수정 → 해당 단계 처음부터 재실행

기능 모드 (2계층-A):
  Unit 10,000 → Module 10,000 → E2E 100,000+

통합 모드 (2계층-B) — 계단식:
  Step 1: 수정 기능 E2E 100,000+
  Step 2: 연관 기능 E2E 10,000 (회귀)
  Step 3: 비연관 기능 E2E 1,000 (스모크)
  Step 4: 전체 통합 E2E 1,000,000

비율: random/edge case 80%+ · normal case 20% 이내
```

---

## Documentation

| 문서 | 설명 |
|------|------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | 3계층 구조, 모듈 의존성, V2 Session API 패턴 |
| [SPEC.md](SPEC.md) | v2.4 전체 스펙 (인증, 설치, 에이전트, Phase, 검증 등) |
| [IMPLEMENTATION-GUIDE.md](IMPLEMENTATION-GUIDE.md) | Phase별 구현 순서 가이드 |
| [docs/references/AGENT-ROLES.md](docs/references/AGENT-ROLES.md) | 7개 에이전트 역할 상세 |
| [docs/references/PHASE-ENGINE.md](docs/references/PHASE-ENGINE.md) | 4-Phase FSM 전환 규칙 |
| [docs/references/EMBEDDING-STRATEGY.md](docs/references/EMBEDDING-STRATEGY.md) | 4-Provider Tier 임베딩 전략 |
| [docs/references/V2-SESSION-API.md](docs/references/V2-SESSION-API.md) | SDK V2 Session API 런타임 패턴 |
| [docs/references/CONTRACT-SCHEMA.md](docs/references/CONTRACT-SCHEMA.md) | Contract 기반 HandoffPackage 스키마 |
| [docs/references/TESTING-STRATEGY.md](docs/references/TESTING-STRATEGY.md) | Fail-Fast + 계단식 통합 검증 전략 |

---

## Workflow

```
유저                          adev (1계층)                    에이전트 (2계층)
 │                               │                               │
 │── "REST API 만들고 싶어" ──→  │                               │
 │                               │── 아이디어 제안 + 질문 ──→    │
 │←── 피드백/수정 ──             │                               │
 │                               │   (무한 반복)                  │
 │── "확정" ──────────────→      │                               │
 │                               │── Contract 생성 ──→           │
 │←── Contract 확인 ──           │                               │
 │── "컨펌" ──────────────→      │                               │
 │                               │── HandoffPackage ─────────→   │
 │                               │                               │── DESIGN (팀 토론)
 │                               │                               │── CODE (coder ×N 병렬)
 │                               │                               │── TEST (Fail-Fast)
 │                               │                               │── VERIFY (4중 검증)
 │                               │←── 검증 결과 ────────────     │
 │←── 결과 리포트 ──             │                               │
 │                               │                               │
 │── "확정" ──────────────→      │── 3계층 전환 ──→              │
 │                               │   통합 문서 + 지속 E2E         │
```

---

## License

[MIT](LICENSE)
