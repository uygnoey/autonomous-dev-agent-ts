# autonomous-dev-agent (adev)

> **Languages:** [English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [Español](README.es.md)

**Claude Code Skills + RAG 기반 자율 개발 에이전트 시스템**

[![TypeScript](https://img.shields.io/badge/TypeScript-ESNext-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.1-f9f1e1?logo=bun&logoColor=000)](https://bun.sh/)
[![Claude SDK](https://img.shields.io/badge/Claude_Agent_SDK-V2_Session_API-cc785c?logo=anthropic&logoColor=white)](https://docs.anthropic.com/)
[![LanceDB](https://img.shields.io/badge/LanceDB-Embedded_Vector_DB-4B8BBE)](https://lancedb.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 1. 프로젝트 개요

**adev (autonomous-dev-agent)** 는 Claude의 고급 기능과 RAG(검색 증강 생성)를 결합하여 일관된 고품질 자율 소프트웨어 개발을 제공하는 지능형 에이전트 오케스트레이션 시스템입니다.

Claude Agent SDK 기반의 3계층 아키텍처로 구축되어, 요구사항 수집부터 프로덕션 준비 코드까지 전체 개발 라이프사이클을 7개의 전문 에이전트가 조율된 단계로 관리합니다.

### 주요 기능

- **3계층 아키텍처**: 사용자 대화(Layer1), 자율 개발(Layer2), 산출물 생성(Layer3) 간 명확한 분리
- **7개 전문 에이전트**: architect, qa, coder, tester, qc, reviewer, documenter가 조율된 단계에서 작업
- **4단계 상태 머신**: DESIGN → CODE → TEST → VERIFY 워크플로우 및 FSM 기반 전환
- **4계층 검증**: qa/qc → reviewer → Layer1(의도 검증) → adev(최종 판단)
- **Fail-Fast 테스팅**: 첫 실패 시 즉시 중단 → 수정 → 해당 단계부터 재실행
- **RAG 강화 메모리**: LanceDB 벡터 데이터베이스를 통한 지속적 컨텍스트, 설계 결정, 실패 이력 관리
- **4-Provider 임베딩 계층**: 무료(Xenova/Jina) + 유료(Voyage) 자동 선택
- **내장 MCP 서버**: filesystem, lancedb, memory, web-search 및 커스텀 MCP 지원
- **다국어 문서화**: 영어, 한국어, 일본어, 스페인어 자동 생성

---

## 2. 아키텍처 개요

### 3계층 구조

```
┌───────────────────────────────────────────────┐
│ Layer 1: Claude API (Opus 4.6)               │
│ 사용자 대화, 계획, 설계, 검증                    │
│ 모듈: src/layer1/                             │
├───────────────────────────────────────────────┤
│         사용자 "확인" → Contract → Layer2      │
├───────────────────────────────────────────────┤
│ Layer 2: Claude Agent SDK (V2 Session API)   │
│ ┌─────────────────────────────────────────┐   │
│ │ Layer2-A: 기능 개발                     │   │
│ │   adev (팀 리더)                         │   │
│ │   ├─ architect  — 설계 & 아키텍처       │   │
│ │   ├─ qa         — 예방 게이트           │   │
│ │   ├─ coder ×N   — 코드 구현             │   │
│ │   ├─ tester     — 테스트 + Fail-fast   │   │
│ │   ├─ qc         — 탐지 & 근본원인분석   │   │
│ │   ├─ reviewer   — 코드 리뷰             │   │
│ │   └─ documenter — 문서화                │   │
│ ├─────────────────────────────────────────┤   │
│ │ Layer2-B: 통합 검증                      │   │
│ │   계단식 Fail-Fast E2E 테스팅           │   │
│ ├─────────────────────────────────────────┤   │
│ │ Layer2-C: 사용자 확인                    │   │
│ └─────────────────────────────────────────┘   │
├───────────────────────────────────────────────┤
│ Layer 3: 산출물 + 지속적 검증                 │
│ 통합 문서, 비즈니스 산출물, E2E               │
│ 모듈: src/layer3/                             │
└───────────────────────────────────────────────┘
```

### 모듈 의존성 그래프

```
┌─────┐
│ cli │ ─────→ core, auth, layer1
└──┬──┘
   ↓
┌────────┐
│ layer1 │ ─→ core, rag
└────┬───┘
     ↓
┌────────┐
│ layer2 │ ─→ core, rag, layer1
└────┬───┘
     ↓
┌────────┐
│ layer3 │ ─→ core, rag, layer2
└────────┘

┌─────┐     ┌──────┐     ┌─────┐
│ rag │ ─→  │ core │  ←─ │ mcp │
└─────┘     └──────┘     └─────┘
            ↑
┌──────┐    │
│ auth │ ───┘
└──────┘
```

**규칙**: 의존성은 화살표 방향으로만 흐릅니다. 순환 의존성 금지. `core` 모듈은 다른 모듈을 임포트하지 않습니다.

### 주요 모듈

| 모듈 | 파일 수 | 핵심 책임 |
|--------|-------|---------------------|
| `core/` | 5 | config, errors, logger, memory, plugin-loader |
| `auth/` | 4 | API 키 / 구독 인증 |
| `cli/` | 5 | CLI 명령어 (init, start, config, project) |
| `layer1/` | 8 | 사용자 대화, 계획, 설계, 계약 생성 |
| `layer2/` | 16 | 자율 개발 오케스트레이션 |
| `layer3/` | 5 | 통합 문서, 지속적 E2E, 비즈니스 산출물 |
| `rag/` | 7 | LanceDB, 임베딩, 코드 인덱싱, 검색 |
| `mcp/` | 12 | MCP 서버 관리, 4개 내장 서버 |

---

## 3. 설치

### 빠른 설치 (권장)

**한 줄 설치** (Bun이 없으면 자동으로 설치):

```bash
curl -fsSL https://raw.githubusercontent.com/uygnoey/autonomous-dev-agent-ts/main/install.sh | bash
```

설치 후:
```bash
# 셸 재시작 또는 PATH 재로드
source ~/.zshrc  # 또는 ~/.bashrc

# adev 실행
adev
```

### 대안: 수동 설치

<details>
<summary>수동 설치 단계 보기</summary>

#### 전제 조건

- **Bun 런타임** (≥1.1.0) - 빠른 JavaScript/TypeScript 런타임
- **Anthropic API 키** 또는 **Claude Pro/Max 구독**

#### Bun 설치

```bash
# macOS / Linux
curl -fsSL https://bun.sh/install | bash

# 설치 확인
bun --version
```

#### 클론 및 설정

```bash
# 저장소 클론
git clone https://github.com/uygnoey/autonomous-dev-agent-ts.git
cd autonomous-dev-agent-ts

# 의존성 설치
bun install

# 빌드
bun run build

# 선택사항: PATH에 추가
ln -s $(pwd)/dist/index.js /usr/local/bin/adev
```

</details>

### 인증

하나의 인증 방법만 선택하세요:

#### 방법 1: API 키

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

#### 방법 2: 구독 (Pro/Max)

```bash
claude setup-token
export CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...
```

> **참고**: 하나의 환경 변수만 설정하세요. 둘 다 동시에 설정하지 마세요.

---

## 4. 사용법

### 대화형 개발 세션

대화형 개발 세션 시작:

```bash
# 개발 모드
bun run dev

# 빌드된 바이너리 (빌드 후)
./dist/index.js
```

대화형 모드에서 가능한 작업:
- 프로젝트 요구사항 및 아이디어 논의
- 설계 문서 및 계약서 생성
- 7개 에이전트를 통한 자율 개발 트리거
- 각 단계의 출력 검토 및 검증
- 피드백 기반 반복적 개선

### CLI 명령어

```bash
# 프로젝트 + 인증 초기화
adev init

# Layer1 대화 시작
adev start

# 설정 보기/수정
adev config

# 새 프로젝트 등록
adev project add <path>

# 등록된 프로젝트 목록
adev project list

# 활성 프로젝트 전환
adev project switch <id>
```

### 프로덕션 빌드

```bash
# 빌드
bun run build

# 빌드된 바이너리 실행
./dist/index.js
```

---

## 5. 테스팅

### 모든 테스트 실행

```bash
# 전체 테스트 스위트
bun test

# 커버리지 리포트 포함
bun test --coverage
```

### 카테고리별 테스트

```bash
# 단위 테스트만
bun run test:unit

# 모듈 통합 테스트
bun run test:module

# 엔드투엔드 테스트
bun run test:e2e
```

### Fail-Fast 테스팅 전략

시스템은 **Fail-Fast** 테스팅 철학을 따릅니다:

```
기능 모드 (Layer2-A):
  단위 10,000 → 모듈 10,000 → E2E 100,000+

통합 모드 (Layer2-B) — 계단식:
  1단계: 수정된 기능 E2E 100,000+
  2단계: 관련 기능 E2E 10,000 (회귀)
  3단계: 무관한 기능 E2E 1,000 (스모크)
  4단계: 전체 통합 E2E 1,000,000

비율: 랜덤/엣지 케이스 80%+ · 정상 케이스 최대 20%
```

**원칙**: 1개 실패 → 즉시 중단 → 수정 → 해당 단계부터 재시작. 실패한 테스트로 절대 진행하지 않습니다.

---

## 6. API 문서

다국어로 제공되는 포괄적인 문서:

- 📘 [English Documentation](docs/api/en/) - 전체 API 레퍼런스
- 📗 [한국어 문서](docs/api/ko/) - 전체 API 레퍼런스
- 📙 [日本語ドキュメント](docs/api/ja/) - 완전한 API 레퍼런스
- 📕 [Documentación en Español](docs/api/es/) - 완전한 API 레퍼런스

### 주요 기술 문서

| 문서 | 설명 |
|----------|-------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | 3계층 구조, 모듈 의존성, V2 Session API 패턴 |
| [SPEC.md](SPEC.md) | 완전한 기술 사양 v2.4 |
| [IMPLEMENTATION-GUIDE.md](IMPLEMENTATION-GUIDE.md) | 단계별 구현 가이드 |
| [AGENT-ROLES.md](docs/references/AGENT-ROLES.md) | 7개 전문 에이전트 상세 |
| [PHASE-ENGINE.md](docs/references/PHASE-ENGINE.md) | 4단계 FSM 전환 규칙 |
| [EMBEDDING-STRATEGY.md](docs/references/EMBEDDING-STRATEGY.md) | 4-Provider 계층 임베딩 전략 |
| [V2-SESSION-API.md](docs/references/V2-SESSION-API.md) | SDK V2 Session API 런타임 패턴 |
| [CONTRACT-SCHEMA.md](docs/references/CONTRACT-SCHEMA.md) | 계약 기반 HandoffPackage 스키마 |
| [TESTING-STRATEGY.md](docs/references/TESTING-STRATEGY.md) | Fail-Fast + 계단식 통합 검증 |

---

## 7. 기여하기

기여를 환영합니다! 다음 가이드라인을 따라주세요:

### 코드 컨벤션

- **ES Modules만**: CommonJS (`require`) 금지
- **TypeScript Strict 모드**: `any` 타입 금지, `unknown` + 타입 가드 사용
- **Result 패턴**: 에러 처리에 `Result<T, E>` 사용, `throw` 최소화
- **네이밍 컨벤션**:
  - 변수/함수: `camelCase`
  - 타입/클래스/인터페이스: `PascalCase`
  - 상수: `UPPER_SNAKE_CASE`
  - 파일: `kebab-case.ts`
- **파일 크기**: 300줄 초과 시 분할
- **로깅**: `src/core/logger.ts` 사용, `console.log` 금지
- **환경변수**: `src/core/config.ts` 사용, `process.env` 직접 접근 금지

### 개발 워크플로우

1. 저장소 포크
2. 기능 브랜치 생성: `feature/{기능명}`
3. 코드 컨벤션을 따라 변경사항 작성
4. 품질 검사 실행: `bun run check`
5. Conventional Commits으로 커밋:
   - `feat:` - 새 기능
   - `fix:` - 버그 수정
   - `docs:` - 문서 변경
   - `refactor:` - 코드 리팩토링
   - `test:` - 테스트 변경
   - `chore:` - 유지보수 작업
6. 푸시 및 Pull Request 열기

### 품질 게이트 (모두 통과 필수)

- [ ] TypeScript 타입 체크: `bun run typecheck`
- [ ] 린팅: `bun run lint`
- [ ] 모든 테스트 통과: `bun run test`
- [ ] 테스트 커버리지 ≥80%
- [ ] 순환 의존성 없음
- [ ] 문서 업데이트됨

### Pull Request 프로세스

1. 모든 테스트 통과 확인 (`bun test`)
2. 필요시 문서 업데이트
3. PR 템플릿 따르기
4. 메인테이너에게 리뷰 요청
5. 리뷰 피드백 반영
6. 승인 후 병합

### 이슈 보고

- 버그 및 기능 요청에 이슈 템플릿 사용
- 버그 재현 단계 포함
- 기능 요청에 컨텍스트 제공
- 기존 이슈 먼저 검색

---

## 8. 라이선스

이 프로젝트는 **MIT 라이선스**로 배포됩니다 - 자세한 내용은 [LICENSE](LICENSE) 파일 참조.

---

## 추가 리소스

### 기술 스택

| 카테고리 | 기술 | 목적 |
|----------|-----------|---------|
| **런타임** | [Bun](https://bun.sh/) ≥1.1 | 패키지 매니저, 번들러, 테스트 러너 |
| **언어** | TypeScript (ESNext, strict) | 전체 코드베이스 |
| **Agent SDK** | [@anthropic-ai/claude-code](https://www.npmjs.com/package/@anthropic-ai/claude-code) | V2 Session API 기반 에이전트 실행 |
| **Vector DB** | [LanceDB](https://lancedb.com/) | 임베디드, 서버리스, 파일 기반 벡터 DB |
| **Embedding** | [@huggingface/transformers](https://huggingface.co/docs/transformers.js) | 로컬 임베딩 (Xenova/Jina) |
| **Linter** | [Biome](https://biomejs.dev/) | 린팅 + 포맷팅 |

### 4단계 엔진

에이전트는 각 단계를 거쳐 기능을 완성합니다:

```
DESIGN ──(qa 게이트 + 합의)────→ CODE
CODE   ──(구현 완료)────────────→ TEST
TEST   ──(0개 실패 + qc)───────→ VERIFY
VERIFY ──(4계층 검증)──────────→ 완료
VERIFY ──(실패)────────────────→ DESIGN/CODE/TEST로 복귀
```

| 단계 | 실행 | 리드 에이전트 | 비고 |
|-------|-----------|------------|-------|
| **DESIGN** | 에이전트 팀 (토론) | architect | qa 게이트 필수 |
| **CODE** | query() ×N 병렬 | coder ×N | 모듈별 Git 브랜치 |
| **TEST** | query() 순차 | tester | Fail-Fast (첫 실패시 중단) |
| **VERIFY** | query() 순차 | adev | 4계층 검증 |

### 7개 전문 에이전트

| 에이전트 | 타입 | 역할 | 코드 수정 |
|-------|------|------|-------------------|
| **architect** | Loop | 기술 설계, 아키텍처 결정 | ✗ |
| **qa** | Loop | 예방 게이트 — 코딩 전 스펙/설계 검증 | ✗ |
| **coder** | Loop | 코드 구현 (쓰기 권한을 가진 유일한 에이전트) | ✓ |
| **tester** | Loop | 테스트 생성 + Fail-Fast 실행 | 테스트만 |
| **qc** | Loop | 탐지 — 근본 원인 분석 (1개 원인 식별) | ✗ |
| **reviewer** | Loop | 코드 리뷰, 컨벤션/품질 판단 | ✗ |
| **documenter** | Event | 단계 완료 시 생성 → 문서 생성 → 종료 | ✗ |

> **qa**는 **예방** (코딩 전), **qc**는 **탐지** (코딩 후). 역할이 명확히 분리됨.
> **coder**는 ×N 병렬 실행 가능, 모듈별 `feature/{name}-{module}-coderN` Git 브랜치에서 작업.

### LanceDB 테이블

| 테이블 | 목적 |
|-------|---------|
| `memory` | 대화 이력, 결정, 피드백, 에러 |
| `code_index` | 코드베이스 청크 벡터 인덱스 |
| `design_decisions` | 설계 결정 이력 |
| `failures` | 실패 이력 + 솔루션 |

### 4-Provider 임베딩 계층

```
VOYAGE_API_KEY 존재?
  ├─ YES → 코드: voyage-code-3, 텍스트: voyage-4-lite  (Tier 2, 유료)
  └─ NO  → 코드: jina-v3,       텍스트: xenova-minilm  (Tier 1, 무료)
```

### 개발 스크립트

| 명령어 | 설명 |
|---------|-------------|
| `bun run dev` | 개발 모드 실행 |
| `bun run build` | 프로덕션 빌드 |
| `bun run test` | 모든 테스트 실행 |
| `bun run test:unit` | 단위 테스트만 |
| `bun run test:module` | 모듈 통합 테스트 |
| `bun run test:e2e` | E2E 테스트 |
| `bun run typecheck` | TypeScript 타입 체킹 |
| `bun run lint` | Biome 린팅 |
| `bun run format` | Biome 자동 포맷팅 |
| `bun run check` | typecheck + lint + test |

---

## 워크플로우 예시

```
사용자                        adev (Layer1)                  에이전트 (Layer2)
 │                               │                               │
 │── "REST API 만들고 싶어요" ─→ │                               │
 │                               │── 아이디어 + 질문 ──→         │
 │←── 피드백/수정 ──             │                               │
 │                               │   (무한 루프)                 │
 │── "확인" ──────────────→      │                               │
 │                               │── 계약서 생성 ──→             │
 │←── 계약서 검토 ──             │                               │
 │── "승인" ────────────────→    │                               │
 │                               │── HandoffPackage ─────────→   │
 │                               │                               │── DESIGN (팀 토론)
 │                               │                               │── CODE (coder ×N 병렬)
 │                               │                               │── TEST (Fail-Fast)
 │                               │                               │── VERIFY (4계층 검증)
 │                               │←── 검증 결과 ──────────      │
 │←── 결과 리포트 ──             │                               │
 │                               │                               │
 │── "확인" ──────────────→      │── Layer3 전환 ──→             │
 │                               │   통합 문서 + 지속적 E2E      │
```

---

## 지원

- 📧 이메일: support@adev.example.com
- 💬 Discord: [커뮤니티 참여](https://discord.gg/adev)
- 🐛 이슈: [GitHub Issues](https://github.com/yourusername/autonomous-dev-agent/issues)
- 📖 문서: [전체 문서](https://docs.adev.example.com)

---

## 감사의 말

- **Anthropic** - Claude API 및 Agent SDK
- **LanceDB** - 임베디드 벡터 데이터베이스
- **Bun** - 빠른 JavaScript 런타임
- **커뮤니티 기여자** - 기여해주셔서 감사합니다!

---

**adev 팀이 정성껏 만들었습니다**
