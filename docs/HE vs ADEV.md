# Harness Engineering vs adev — 심층 비교 분석

> 🌐 **언어 선택**: **한국어** | [English](HE%20vs%20ADEV.en.md) | [日本語](HE%20vs%20ADEV.ja.md) | [Español](HE%20vs%20ADEV.es.md)

> **작성일**: 2026-03-13
> **adev 기준**: v2.4 스펙 확정 + 구현 현황 (201파일, ~32,681줄)
> **Harness Engineering 기준**: OpenAI (2026-02 공식화), Anthropic Engineering Blog, Martin Fowler, LangChain DeepAgents

---

## 목차

1. [Harness Engineering 정의](#1-harness-engineering-정의)
2. [adev 구조 — 정확한 이해](#2-adev-구조--정확한-이해)
3. [핵심 공식 비교](#3-핵심-공식-비교)
4. [Harness Engineering 4대 기능 대조 분석](#4-harness-engineering-4대-기능-대조-분석)
5. [TDD / CI 구현 방식 비교](#5-tdd--ci-구현-방식-비교)
6. [에이전트 오케스트레이션 비교](#6-에이전트-오케스트레이션-비교)
7. [컨텍스트 & 메모리 비교](#7-컨텍스트--메모리-비교)
8. [세션 연속성 비교](#8-세션-연속성-비교)
9. [같은 점](#9-같은-점)
10. [다른 점 — 핵심 차이](#10-다른-점--핵심-차이)
11. [adev 강점](#11-adev-강점)
12. [adev 약점 / 개선 필요 사항](#12-adev-약점--개선-필요-사항)
13. [종합 평가 매트릭스](#13-종합-평가-매트릭스)

---

## 1. Harness Engineering 정의

### 개요

**Harness Engineering**은 AI 에이전트를 신뢰성 있게 실제 작업에 활용하기 위한 **환경 설계 규율(discipline)**이다.

> "말(AI 모델)은 강력하지만 방향을 모른다. 마구(하네스)가 그 힘을 올바른 방향으로 채널링한다."

### 핵심 공식

```
에이전트 = 모델(Model) + 하네스(Harness)
```

| 주체   | 역할                              |
| ------ | --------------------------------- |
| 모델   | 지능 — 코드 작성, 분석, 판단      |
| 하네스 | 방향 — 제약, 컨텍스트, 검증, 교정 |

### 등장 배경 (2026년)

| 시점    | 사건                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------ |
| 2025년  | AI 에이전트 능력 증명의 해                                                                       |
| 2026-02 | **OpenAI**: Codex + 하네스로 100만 줄 프로덕션 코드 무인 생성, "Harness Engineering" 공식 용어화 |
| 2026년  | 업계 컨센서스: **"에이전트 자체가 아니라 하네스가 어렵다"**                                      |

### 에이전트 실패의 진짜 원인 (Harness Engineering의 출발점)

모델 능력 부족이 아니라 **오케스트레이션 환경 문제**:

- 너무 많은 단계 후 방향을 잃음
- 실패한 접근법을 반복
- 세션이 끊기면 컨텍스트 소실
- 목표를 추적하지 못함

> Vercel 교훈: 에이전트 도구를 **80% 줄였더니 성공률이 오히려 향상**됨.

### Martin Fowler의 4대 기능

```
① Constrain  — 에이전트가 할 수 있는 것을 제한
               (아키텍처 경계, 허용 도구, 스타일 규칙)

② Inform     — 에이전트가 무엇을 해야 할지 알려줌
               (명세, 역할 지침, 아키텍처 문서, Context Engineering)

③ Verify     — 에이전트가 올바르게 했는지 확인
               (자동화 테스트, 타입체크, 린터, 코드 리뷰)

④ Correct    — 잘못되었을 때 수정
               (피드백 루프, self-repair, 세션 간 진행 로그)
```

### Anthropic의 2-에이전트 하네스 (Harness Engineering 최소 구현 참고)

```
[Initializer Agent] — 최초 1회
  git init / init 스크립트 / 기능 목록 / claude-progress.txt 생성

[Coding Agent] — 세션마다 반복
  claude-progress.txt 읽기 → 현 위치 파악 → 기능 1개 구현
  → 테스트 실행 → 커밋 → 진행 로그 업데이트 → 세션 종료
  → 다음 세션에서 재개
```

---

## 2. adev 구조 — 정확한 이해

### adev가 무엇인지

```
adev = AI 자율 개발 시스템
      "아이디어 → 프로덕션 코드 + 문서 + 비즈니스 산출물" 전체를 자동화
```

### ⚠️ 핵심 구분 — bun vs Claude Agent SDK

adev를 이해하는 데 가장 중요한 구분:

| 항목 | **bun** (TypeScript 런타임) | **Claude Agent SDK V2** (`unstable_v2_createSession / prompt`) |
|------|----------------------------|----------------------------------------------------------------|
| **역할** | adev 자체 프로세스(하네스)를 실행하는 런타임 | 실제 개발 에이전트를 spawn하는 SDK |
| **담당** | adev 오케스트레이터 코드 실행 | target project의 코드 작성, 테스트 생성/실행, 문서 작성 |
| **대상** | adev 자신 (`autonomous-dev-agent-ts` 코드베이스) | 유저가 만들고자 하는 프로젝트 (target project) |

즉:

- **bun test / bunx tsc / bunx biome** → adev 자신의 코드 품질 관리 (adev 개발 인프라)
- **Claude Agent SDK 에이전트** → target project 코드 작성, 테스트, CI 수행

### 3계층 구조 전체

```
┌─ 1계층: Claude API (Opus 4.6) — 대화 인터페이스
│
│  유저 ↔ Claude API 대화:
│    아이디어 도출 → 기획 → 설계 → 기술 스택 → 문서 목록
│    → 테스트 케이스 유형 정의서 생성 (실제 코드 아님, 규칙/카테고리)
│    → 유저 "확정" → Contract(HandoffPackage) 생성
│    → 구조 검증 + 정합성 검증 → 유저 컨펌 → 2계층 시작
│
│  출력: 기획서, 설계서, 스펙 확정본, Contract, 테스트 유형 정의서
│
├─ adev (TypeScript/Bun 프로세스) = Team Leader = 하네스
│  ↓ Claude Agent SDK V2 호출
│
├─ 2계층: Claude Agent SDK V2 — 자율 개발 (target project 개발)
│
│  2계층-A: 기능 단위 개발 루프
│    Phase FSM: DESIGN → CODE → TEST → VERIFY
│    에이전트 7개 (Claude 인스턴스):
│      architect  설계, 모듈 구조 결정 (코딩 금지)
│      qa         코딩 전 스펙 검증 Gate (코딩 금지)
│      coder×N    실제 코드 작성 (유일한 코딩 권한, Git branch 격리)
│      tester     테스트 코드 생성 + Bash로 실행 (target 스택 기준)
│      qc         실패 근본 원인 분석 (코딩 금지)
│      reviewer   코드 리뷰 (코딩 금지)
│      documenter 이벤트 트리거 → spawn → 문서 생성 → 종료
│
│  2계층-B: 통합 검증
│    계단식 Fail-Fast: Step1(E2E 10만) → Step2(1만) → Step3(1천)
│    → Step4(통합 100만회) — 버그 0까지 반복
│
│  2계층-C: 유저 확인 체크포인트
│    결과물 + 테스트 결과서 전달 → 유저 승인 → 3계층
│
└─ 3계층: 산출물 + 지속 E2E
   통합 문서 8종 + 비즈니스 산출물 4종
   5분 간격 지속 E2E → 버그 발견 → 2계층 재실행
```

### 개발 흐름의 핵심

```
[Layer1 — Claude API]
  tester 에이전트에게 줄 "테스트 케이스 유형 정의서" 생성:
  → 카테고리 12종 정의, 각 카테고리 규칙/패턴/경계값, 샘플 케이스, random 80%+ 비율
  → 실제 테스트 코드는 작성하지 않음 (명세만)

[Layer2 — Claude Agent SDK]
  tester 에이전트:
  → 유형 정의서 기반으로 target project 테스트 코드 직접 생성
  → Bash 도구로 실제 실행 (target project의 테스트 프레임워크 사용)
  → Jest? pytest? go test? → layer1 스펙에서 결정된 기술 스택 그대로

  TDD 사이클:
  → tester가 failing 테스트 먼저 작성
  → coder가 통과하도록 구현
  → 1개 실패 → 즉시 중단 → qc 근본 원인 → coder 수정 → 처음부터

  CI 역할:
  → 기능 완료 후 통합 E2E (계단식 Fail-Fast)
  → 새 기능이 기존 기능 깨지는지 회귀 검증
```

---

## 3. 핵심 공식 비교

### Harness Engineering 공식

```
에이전트 = 모델 + 하네스
하네스 = Constrain + Inform + Verify + Correct
```

### adev 공식

```
adev = 하네스 (TypeScript/Bun 오케스트레이터)
     + Claude Agent SDK 에이전트들 (모델)

adev 하네스:
  Constrain:
    - 단방향 모듈 의존성 (layer-dependencies.md)
    - allowedTools 목록 (에이전트별 도구 제한)
    - 에이전트별 코딩 권한 분리 (coder만 코딩 가능)
    - Git branch 격리 (Coder×N 파일 충돌 방지)
    - 에이전트 7개 고정 (추가/변경 금지)
    - settingSources: [] (파일시스템 설정 의존 제거)

  Inform:
    - Layer1 Contract(HandoffPackage): 기획 의도 → 개발 명세
    - agent.md 7개: 에이전트별 역할 지침 (프로젝트 스펙 맞춤 자동 생성)
    - SKILL.md: 도메인 지식 주입
    - LanceDB RAG: 설계 결정 이력, 실패 이력 실시간 검색 주입
    - 테스트 케이스 유형 정의서: tester 에이전트 행동 기준

  Verify:
    - tester: target project 테스트 코드 생성 + 실행 (Bash 도구)
    - Fail-Fast: 1개 실패 → 즉시 중단 (처음부터 재실행)
    - 4중 검증: qa/qc → reviewer → 1계층 의도 검증 → adev 종합
    - Haiku → Sonnet → Opus 자동 에스컬레이션

  Correct:
    - qc: 근본 원인 1개만 집중 분석 → coder 수정 지시
    - failure-handler: 실패 유형 분류 → 적절한 Phase 복귀
    - bias-detector: 확증편향/루프/교착/범위확장 탐지 → 세션 재시작
    - session-restore-orchestrator: 토큰 만료 후 LanceDB 기반 복원
    - bug-escalator: 3계층 버그 → 2계층 전체 루프 재실행
```

---

## 4. Harness Engineering 4대 기능 대조 분석

### ① Constrain — 제약

| Harness Engineering 원칙            | adev 구현 파일          | 내용                                       | 평가 |
| ------------------ | ----------------------- | ------------------------------------------ | ---- |
| 아키텍처 경계 설정 | `layer-dependencies.md` | 단방향 의존성 + 순환 금지                  | ✅   |
| 허용 도구 제한     | `v2-session-factory.ts` | Phase별, 에이전트별 `allowedTools` 명시    | ✅   |
| 코드 스타일 강제   | `agent.md` (coder 지침) | target project 컨벤션 — 스펙에서 결정      | ✅   |
| 역할 혼용 금지     | `AGENT-ROLES.md`        | coder만 코딩, tester만 테스트, qc는 분석만 | ✅   |
| 파일 충돌 방지     | `coder-allocator.ts`    | Coder×N 간 같은 파일 편집 금지             | ✅   |
| 에이전트 수 고정   | 스펙 §7                 | 7개 고정 (추가/변경 금지)                  | ✅   |
| 환경 의존성 제거   | `v2-session-factory.ts` | `settingSources: []`                       | ✅   |
| **Vercel 원칙**    | Phase별 allowedTools    | 역할에 필요한 도구만, 불필요 도구 제외     | ✅   |

### ② Inform — 정보 제공

| Harness Engineering 원칙          | adev 구현                                          | 내용                                                                      | 평가           |
| ---------------- | -------------------------------------------------- | ------------------------------------------------------------------------- | -------------- |
| 명세 제공        | `contract-builder.ts`                              | Contract(HandoffPackage) — Kahn 위상 정렬, 검증 매트릭스                  | ✅             |
| 역할 지침        | `agent-md-generator.ts`                            | agent.md 7개 — 프로젝트 스펙 맞춤 자동 생성                               | ✅             |
| 도메인 지식      | `skill-merger.ts`                                  | SKILL.md 글로벌 + 프로젝트 병합 주입                                      | ✅             |
| 코딩 컨벤션      | 1계층 스펙 결정                                    | target project 스펙에 정의된 컨벤션 → agent.md에 반영                     | ✅             |
| 진행 로그        | `progress-tracker.ts`, `session-snapshot-store.ts` | 기능별/Phase별 진행 상태 추적                                             | ✅             |
| 동적 컨텍스트    | `src/rag/` LanceDB RAG                             | 유사 설계 결정, 실패 이력 실시간 검색 → 에이전트 프롬프트 주입            | ✅ (Harness Engineering 초월)   |
| 테스트 행동 기준 | `test-type-designer.ts`                            | 테스트 유형 정의서 (카테고리 12종, random 80%) → tester 에이전트에게 전달 | ✅ (Harness Engineering에 없음) |
| 인계 명세        | `handoff-receiver.ts`                              | 1계층 → 2계층 Contract 수신 + 구조/정합성 검증                            | ✅ (Harness Engineering에 없음) |

### ③ Verify — 검증

| Harness Engineering 원칙               | adev 구현                   | 내용                                               | 평가           |
| --------------------- | --------------------------- | -------------------------------------------------- | -------------- |
| 자동화 테스트         | tester 에이전트             | **target project 테스트 코드 생성 + Bash 실행**    | ✅             |
| TDD                   | tester → coder 순서         | failing 테스트 먼저, coder가 통과하도록 구현       | ✅             |
| CI 역할               | 통합 E2E 계단식             | 기능 완료 후 기존 기능 회귀 확인                   | ✅             |
| Fail-Fast             | `integration-tester.ts`     | 1개 실패 → 즉시 중단, 처음부터                     | ✅ (엄격 적용) |
| 타입 안전성           | coder 에이전트 지침         | target project 타입체크 — 스펙 결정 기술 스택 기준 | ✅             |
| 코드 리뷰             | reviewer 에이전트           | 독립 세션으로 코드 품질 판정                       | ✅             |
| **4중 검증**          | `verification-gate.ts`      | qa/qc → reviewer → 1계층 의도 → adev 종합          | ✅ (Harness Engineering 초월)   |
| **의도 검증**         | `layer1-verifier.ts`        | "기획 의도대로 구현됐는가?" (1계층 Claude API)     | ✅ (Harness Engineering에 없음) |
| **편향 탐지**         | `bias-detector.ts`          | 확증편향/루프/교착/범위확장 감지                   | ✅ (Harness Engineering에 없음) |
| **검증 에스컬레이션** | `verification-escalator.ts` | Haiku → Sonnet → Opus 자동                         | ✅ (Harness Engineering에 없음) |

### ④ Correct — 교정

| Harness Engineering 원칙               | adev 구현                         | 내용                                              | 평가           |
| --------------------- | --------------------------------- | ------------------------------------------------- | -------------- |
| 피드백 루프           | `team-leader-phase.ts`            | 실패 → 유형 분류 → 적절한 Phase 복귀              | ✅             |
| Self-repair           | `failure-handler.ts`              | 실패 유형별 복구 전략 자동 결정                   | ✅             |
| 세션 간 연속성        | `session-restore-orchestrator.ts` | `unstable_v2_resumeSession` + LanceDB 벡터 복원   | ✅             |
| **근본 원인 집중**    | qc 에이전트                       | 1개만 집중 분석 (다수 분석 금지 → Fail-Fast 보장) | ✅ (Harness Engineering 구체화) |
| **패턴 기억**         | `failure-store.ts`                | 실패 벡터 저장 → 재발 방지 RAG 주입               | ✅ (Harness Engineering에 없음) |
| **버그 에스컬레이션** | `bug-escalator.ts`                | 3계층 버그 → 2계층 전체 루프 재실행               | ✅ (Harness Engineering에 없음) |

---

## 5. TDD / CI 구현 방식 비교

### Harness Engineering의 TDD/CI 권장 방식

```
TDD: 실패 테스트 먼저 작성 → 통과하도록 구현 → 리팩터
CI: 커밋 시 자동 테스트 실행 → 실패 시 머지 차단
```

Harness Engineering는 "TDD와 CI를 써라"고 권장하지만 **구체적 구현 방법은 각자 결정**.

### adev의 TDD/CI — 전체 흐름

```
[1계층 — 테스트 유형 정의서 생성 (실제 코드 아님)]

  Layer1 Claude API가 생성:
  - 테스트 카테고리 12종 (정상/경계값/예외/동시성/대용량/비정상종료 등)
  - 카테고리별 규칙/패턴/경계값/입력범위
  - 샘플 케이스 100~200개
  - random 비중 80%+ 규칙
  - 목표 수량: Unit 1만 / Module 1만 / E2E 10만+ (설정 가능)
  - Contract에 포함 → 2계층 tester 에이전트에게 전달

[2계층 — tester 에이전트가 실제 테스트 코드 생성 + 실행]

  tester 에이전트 (Claude Agent SDK V2 인스턴스):
    ① 유형 정의서 읽기 → target project의 기술 스택 파악
       (Python → pytest, TypeScript → Jest/Vitest, Go → go test, etc.)
    ② 정의서 규칙에 따라 테스트 코드 직접 작성 (Write 도구)
       - Unit test: 함수/메서드 단위
       - Module test: 모듈 간 통합
       - E2E test: 실제 유저 시나리오 전체 라이프사이클
    ③ Bash 도구로 실행:
       `pytest tests/` 또는 `jest` 또는 `bun test` — 스펙 결정 기술 스택
    ④ Fail-Fast: 1개 실패 → 즉시 중단 → qc에게 보고

[TDD 사이클]
  tester: failing 테스트 작성
  coder: 통과하도록 구현 (해당 모듈 Git branch)
  tester: 재실행 → 통과 확인
  → Unit 전체 통과 → Module 시작 → Module 통과 → E2E 시작

[CI 역할 — 통합 E2E 계단식 (2계층-B)]
  전체 기능 개발 완료 후:
  Step1: 수정 기능 E2E 10만+ (기능 완성도 확인)
  Step2: 연관 기능 E2E 1만 (회귀: 다른 기능 안 깨졌나)
  Step3: 비연관 기능 E2E 1천 (스모크: 전체 시스템 영향)
  Step4: 통합 최종 E2E 100만회 (프로덕션 시뮬레이션)
  각 Step 실패 → 즉시 중단 → 2계층-A 전체 루프 재실행 (architect부터)
```

| 항목              | Harness Engineering 권장                 | adev 구현                                         |
| ----------------- | ----------------------- | ------------------------------------------------- |
| 테스트 명세 생성  | 개발자가 직접           | **1계층 Claude API가 유형 정의서 자동 생성**      |
| 테스트 코드 생성  | 개발자가 직접           | **tester 에이전트가 유형 정의서 기반 자동 생성**  |
| 테스트 실행       | CI 도구 (Jenkins 등)    | **tester 에이전트가 Bash 도구로 직접 실행**       |
| 테스트 프레임워크 | 팀이 결정               | **layer1 스펙에서 결정된 기술 스택 그대로**       |
| TDD 순서          | 권장 (실제 준수율 낮음) | **강제 (tester → coder 순서 고정)**               |
| 실패 처리         | 개발자가 분석           | **qc 에이전트가 자동 근본 원인 분석**             |
| CI 규모           | 커밋당 테스트           | **기능당 Unit 1만 + Module 1만 + E2E 10만**       |
| 통합 검증 규모    | 배포 파이프라인         | **계단식 최종 100만회**                           |
| 회귀 테스트       | CI 파이프라인           | **Step2(연관 기능 1만) + Step3(비연관 1천) 자동** |

---

## 6. 에이전트 오케스트레이션 비교

### Anthropic Harness Engineering 권장: 2-에이전트 선형 구조

```
Initializer → [Coding Agent × 기능 수] 순차
세션마다 1기능, progress.txt로 상태 인계
```

### LangChain DeepAgents: 계층형 구조

```
Main Agent
  └─ Sub-agents (필요 시 동적 생성)
     Filesystem / Planning / Memory / Code Exec
```

### adev: Phase FSM + 역할 분리 + 병렬 개발

```
adev (TypeScript/Bun) = Team Leader = 오케스트레이터
  │
  ├─ DESIGN Phase [Agent Teams 활성화]
  │    session.stream() + CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
  │    → lead agent가 TeamCreate → architect, qa, coder, reviewer를 teammate로 spawn
  │    → SendMessage로 팀 토론 (설계 의사결정)
  │    → qa Gate 통과 + 전원 합의 → CODE Phase 진입
  │    → 종료 시 documenter 트리거 (설계 문서 생성)
  │
  ├─ CODE Phase [Agent Teams 없음, 병렬 독립 실행]
  │    unstable_v2_prompt() × N (Promise.allSettled)
  │    → coder1: feature/기능명-모듈A-coder1 브랜치
  │    → coder2: feature/기능명-모듈B-coder2 브랜치
  │    → coderN: feature/기능명-모듈N-coderN 브랜치
  │    architect + reviewer: 별도 세션으로 감독 (코딩 금지)
  │    → 의존성 그래프 순서대로 adev가 merge
  │    → 완료 시 documenter 트리거 (CHANGELOG 갱신)
  │
  ├─ TEST Phase [Fail-Fast 순차]
  │    unstable_v2_prompt() 순차 실행
  │    → tester: 유형 정의서 기반 테스트 코드 생성 (Write 도구)
  │               Bash 도구로 target project 테스트 실행
  │               Unit 1만 → (실패 즉시 중단) → Module 1만 → E2E 10만
  │    → qc: 실패 시 근본 원인 1개 분석
  │    → coder: 해당 버그만 수정 (Fail-Fast: 1개만)
  │    → tester: 해당 단계 처음부터 재실행
  │    → 완료/실패 시 documenter 트리거 (테스트 결과서)
  │
  └─ VERIFY Phase [4중 검증 순차]
       unstable_v2_prompt() 순차
       ① qa/qc: 스펙 준수 + 테스트 통과 검증
       ② reviewer: 코드 품질 + 패턴 준수
       ③ 1계층 Claude API: "내가 의도한 대로 구현됐나?"
       ④ adev: 위 3개 종합 + 확증편향 체크
       실패 → 유형에 따라 DESIGN/CODE/TEST 복귀
```

| 항목        | Anthropic 2-에이전트 | LangChain DeepAgents | adev                                    |
| ----------- | -------------------- | -------------------- | --------------------------------------- |
| 에이전트 수 | 2개                  | 가변                 | 7개 고정                                |
| 구조        | 선형 순차            | 계층형               | Phase FSM                               |
| 병렬 개발   | 없음                 | 부분                 | Coder×N Promise.allSettled              |
| Git 격리    | 없음                 | 없음                 | feature 브랜치 + 의존성 순서 merge      |
| 팀 토론     | 없음                 | 없음                 | DESIGN Phase Agent Teams                |
| 편향 탐지   | 없음                 | 없음                 | bias-detector (루프/교착/확증편향)      |
| 의도 검증   | 없음                 | 없음                 | 1계층이 기획 의도 vs 구현 비교          |
| 감시 방법   | 없음                 | 없음                 | Hook(PreToolUse/PostToolUse) + IPC 폴링 |

---

## 7. 컨텍스트 & 메모리 비교

### Anthropic Harness Engineering: claude-progress.txt

```
[완료] feature-1: 유저 인증
[진행중] feature-2: 상품 목록 (50%)
[미완] feature-3: 결제
```

- 장점: 간단, 사람도 읽을 수 있음
- 한계: 텍스트 파싱, 타입 없음, 과거 패턴 검색 불가, 토큰 낭비

### adev: LanceDB 4테이블 + RAG

| 테이블              | 저장 내용                    | 활용 시점                          |
| ------------------- | ---------------------------- | ---------------------------------- |
| `memory`            | 유저 대화 이력, 피드백, 결정 | 다음 대화 컨텍스트                 |
| `code_index`        | target project 코드 벡터     | 코드 검색, 중복 방지               |
| `design_decisions`  | "왜 이렇게 설계했는가" 이력  | 일관성 유지, 같은 결정 재검토 방지 |
| `failures`          | 실패 원인 + 해결책 벡터      | 재발 방지 — 유사 상황 RAG 경보     |
| `session_snapshots` | 세션 상태 (스펙 외 추가)     | 토큰 만료 후 정확히 복원           |

**동적 컨텍스트 주입 흐름**:

```
에이전트 작업 시작
  → 현재 컨텍스트 벡터화
  → LanceDB 유사도 검색:
      design_decisions에서 유사 설계 결정 검색
      failures에서 유사 실패 이력 검색
      code_index에서 관련 코드 검색
  → 검색 결과를 에이전트 프롬프트에 동적 주입
  → 에이전트가 과거 학습된 패턴을 참고하여 더 나은 결정
```

| 항목           | Harness Engineering progress.txt  | adev LanceDB                           |
| -------------- | ---------------- | -------------------------------------- |
| 저장 형식      | 텍스트           | 벡터 DB (타입 안전)                    |
| 과거 패턴 검색 | 불가             | 유사도 검색 (의미 기반)                |
| 실패 재발 방지 | 없음             | failure-store → RAG 경보               |
| 설계 일관성    | 없음             | design-decision-store → 과거 결정 참조 |
| 토큰 효율      | 전체 파일 로드   | 관련 항목만 검색하여 주입              |
| 영속성         | 파일 (휘발 가능) | 임베디드 DB (구조적 영속)              |

---

## 8. 세션 연속성 비교

### Harness Engineering의 핵심 문제: "세션이 끊기면 모든 컨텍스트 소실"

Anthropic 해법:

```
각 Coding Agent 세션 시작 시:
  1. claude-progress.txt 읽기 → 현재 위치 파악
  2. 기능 1개만 구현
  3. 완료 → 로그 업데이트 → 세션 종료
  4. 다음 세션에서 같은 과정 반복
```

### adev의 세션 연속성 전략

```
[토큰 한도 도달 시 — token-monitor.ts]
  remaining 20% → 새 세션 spawn 억제 (진행 중인 것만 완료)
  remaining 5%  → graceful 완료 모드 (새 작업 시작 금지)
  토큰 소진     → token-wait-loop.ts: 1분 체크, 최대 1시간 대기

[세션 복원 — session-restore-orchestrator.ts]
  1. session-snapshot-store에서 마지막 스냅샷 로드
  2. unstable_v2_resumeSession(sessionId) 시도
  3. 복원 실패 시: 새 세션 + LanceDB 벡터 컨텍스트 재구성
  4. 정확히 중단된 지점에서 재개

[세션 ID 체계]
  {projectId}:{featureId}:{agentName}:{phase}
  예: "proj-001:feat-auth:architect:DESIGN"
  → 어느 프로젝트의 어느 기능의 어느 에이전트가 어느 Phase인지 추적
```

---

## 9. 같은 점

### 1. 핵심 철학: "모델보다 하네스가 어렵다"

- Harness Engineering: 에이전트 실패는 모델 능력 부족이 아니라 오케스트레이션 환경 문제
- adev: 201파일, 32,681줄의 대부분이 하네스 (오케스트레이션) 코드

### 2. 세션 간 컨텍스트 연속성 필수

- Harness Engineering(Anthropic): `claude-progress.txt`로 세션 인계
- adev: `session-snapshot-store` + LanceDB + `unstable_v2_resumeSession`

### 3. 제약이 자유보다 성과를 높인다

- Harness Engineering(Vercel): 도구 80% 줄이니 성공률 향상
- adev: 역할별 코딩 권한 분리, Phase별 allowedTools 제한, 에이전트 7개 고정

### 4. TDD + Fail-Fast 필수

- Harness Engineering: TDD와 빠른 피드백 루프를 핵심으로 권장
- adev: tester → coder 순서 강제, 1개 실패 → 즉시 중단, 처음부터 재실행 (엄격 적용)

### 5. Git 기반 작업 단위

- Harness Engineering(Anthropic): 기능 1개 → 커밋 → 세션 종료
- adev: 기능 1개 → feature/{기능}-{모듈}-coderN 브랜치 → 의존성 순서 merge

### 6. 명세(Spec)가 에이전트 행동의 기준

- Harness Engineering: "에이전트에게 명확한 명세를 제공하라"
- adev: Contract(HandoffPackage) — 기능 목록, 인수 조건, 입출력 타입, 테스트 유형 정의서 전부 포함

### 7. 역할 분리

- Harness Engineering(LangChain): Main agent + Sub-agents 역할 분리
- adev: 7개 에이전트 엄격한 역할 분리 (혼용 절대 금지)

### 8. 컨텍스트 엔지니어링

- Harness Engineering: 올바른 컨텍스트 제공 = 에이전트 성능의 핵심
- adev: agent.md(역할 지침) + SKILL.md(도메인 지식) + LanceDB RAG(동적)

### 9. 자기 교정(Self-repair)

- Harness Engineering: 실패 → 근본 원인 분석 → 재시도
- adev: qc(근본 원인 1개 집중) + failure-handler(유형별 Phase 복귀)

### 10. 다중 프로젝트 격리

- Harness Engineering: 프로젝트별 하네스 설정 권장
- adev: `projects.json` + `.adev/` 격리 + 설정 우선순위(프로젝트 > 글로벌)

---

## 10. 다른 점 — 핵심 차이

### 가장 근본적인 차이: 방법론 vs 구현체

```
Harness Engineering:   "에이전트 하네스를 어떻게 설계해야 하는가" — 원칙/패턴 제시
adev: Harness Engineering 원칙 + 그 이상을 실제 TypeScript 코드로 구현한 완성 시스템
```

### 주요 차이 12가지

| #   | 항목               | Harness Engineering (방법론)         | adev (구현체)                              |
| --- | ------------------ | ------------------- | ------------------------------------------ |
| 1   | **성격**           | 원칙/규율/방법론    | 즉시 실행 가능한 소프트웨어                |
| 2   | **TDD 명세**       | "TDD 써라"          | 1계층이 테스트 유형 정의서 자동 생성       |
| 3   | **TDD 구현**       | 개발자가 직접       | tester 에이전트가 Bash로 실행              |
| 4   | **CI**             | "CI 써라"           | 기능당 최대 110,000 + 최종 100만회         |
| 5   | **기획→개발 인계** | 없음                | Contract(HandoffPackage) + 위상 정렬       |
| 6   | **메모리**         | 텍스트 파일         | LanceDB 벡터 4테이블 + RAG                 |
| 7   | **동적 컨텍스트**  | 없음                | 실패 이력/설계 결정 실시간 RAG 검색        |
| 8   | **검증**           | 자동화 테스트 1단계 | 4중 검증 (qa/qc → reviewer → 1계층 → adev) |
| 9   | **의도 검증**      | 없음                | 1계층이 기획 의도 vs 구현 비교             |
| 10  | **편향 탐지**      | 없음                | bias-detector (확증편향/루프/교착)         |
| 11  | **토큰 관리**      | 미해결              | 롤링 윈도우 + graceful 완료 + 세션 복원    |
| 12  | **산출물**         | 코드까지            | 코드 + 문서 8종 + 비즈니스 산출물 4종      |

### Harness Engineering가 다루지 않는 영역 중 adev가 해결한 것

```
① 기획 단계 (1계층)
   Harness Engineering: "명세를 제공하라" — 누가 어떻게 만드는지 미정의
   adev: Claude API로 유저와 대화하며 명세 자체를 생성

② 테스트 명세 자동화
   Harness Engineering: "테스트를 써라" — 어떤 테스트를, 얼마나 쓰는지 미정의
   adev: 유형 정의서 (카테고리 12종, random 80%, 목표 수량) 자동 생성

③ 토큰 한도 관리
   장기 실행 에이전트의 가장 실용적 문제 — Harness Engineering 어디서도 미해결
   adev: 5시간 롤링 윈도우, 임계값별 대응, 세션 복원

④ 지속 E2E (3계층)
   Harness Engineering: 코드 완성 이후 관리 언급 없음
   adev: 5분 간격 지속 E2E → 버그 → 2계층 자동 재실행

⑤ 비즈니스 산출물
   Harness Engineering: 코드까지
   adev: 포트폴리오, 사업계획서, 투자제안서, PPTX 발표자료 자동 생성
```

---

## 11. adev 강점

### 강점 1: TDD를 실제로 강제하는 유일한 구조

Harness Engineering는 TDD를 권장하지만 실제 준수율은 낮다. adev는 **tester → coder 순서 고정**으로 TDD를 구조적으로 강제한다. tester 에이전트가 failing 테스트를 먼저 작성해야 coder 에이전트가 코딩을 시작할 수 있다.

### 강점 2: 기획 의도와 구현의 정합성 검증

Harness Engineering에 없는 개념. 4중 검증의 3번째 단계에서 **1계층(기획자)이 2계층(구현 결과)를 직접 검증**한다. "내가 설계한 대로 구현됐는가?" — 단순히 테스트가 통과하는 게 아니라 의도가 구현됐는지 확인.

### 강점 3: 실패 학습으로 자기 개선

`failure-store.ts` — 실패 원인과 해결책을 벡터로 저장. 다음번 유사 상황에서 RAG로 검색하여 에이전트에게 경보. 에이전트 시스템이 **운영될수록 같은 실수를 반복하지 않는다**.

### 강점 4: 동적 컨텍스트 — Harness Engineering를 초월

Anthropic이 권장하는 progress.txt는 정적이다. adev는 **LanceDB 유사도 검색으로 관련 과거 결정을 실시간 검색하여 주입**. 에이전트는 전체 이력이 아니라 현재 작업에 가장 관련 높은 컨텍스트만 받는다.

### 강점 5: Coder×N 병렬 + Git 격리

기능 하나를 여러 coder가 병렬로 개발. 모듈 단위로 분배하고 각각 독립 Git branch에서 작업. 의존성 그래프 순서로 merge. **개발 속도 N배 + 파일 충돌 없음**.

### 강점 6: 토큰 한도 자동 관리

장기 실행 에이전트 시스템에서 가장 실용적인 문제. Harness Engineering 어디에도 해결책이 없다. adev는 5시간 롤링 윈도우, 임계값별 대응(20%, 5%), 1시간 대기 루프, `unstable_v2_resumeSession`으로 **중단 없이 장기 개발 가능**.

### 강점 7: 확증편향 탐지

Harness Engineering의 Correct 원칙을 가장 정교하게 구현한 부분. `bias-detector.ts`로 에이전트가 잘못된 방향을 반복하는 패턴(확증편향, 루프, 교착, 범위확장)을 탐지. 탐지 시 세션 강제 종료 + 새 세션 재시작.

### 강점 8: 완전 로컬 실행

서버 불필요. LanceDB는 임베디드(파일 기반). Anthropic API 외 외부 서비스 없음. **데이터가 로컬에 완전 보존**. 설치는 `curl one-liner` 또는 `bun -g` 하나.

---

## 12. adev 약점 / 개선 필요 사항

### 약점 1: target project 실제 E2E 검증 미수행 (치명적)

**현재 상태**: adev 자체(autonomous-dev-agent-ts)에 대한 테스트 204,903개는 통과했지만, adev가 실제 target project를 자율 개발하는 전체 플로우(Layer1 대화 → Contract → Layer2 에이전트 개발 → Layer3 산출물)의 **실제 Claude API 연동 E2E가 미수행**.

- 시뮬레이션(mock) 형태로만 검증됨
- `adev init` + `adev start` → 실제 Claude API 호출 플로우 미검증
- **Harness Engineering 관점**: Verify의 핵심은 "실제 환경"에서의 검증. 가장 중요한 것이 빠져 있음.

### 약점 2: 7명 teammate 동시 PoC 미완료

스펙 §16: 5명까지만 확인, 7명 동시 실행 미검증.

- Coder×N 병렬 개발에서 N의 상한이 실제로 얼마인지 불확실
- Harness Engineering Constrain 관점: 제약의 실제 한계 불명확

### 약점 3: PPTX/DOCX 렌더러 미완성

- PPTX: 코드 주석 "미구현", HTML fallback 중
- DOCX: HTML fallback 중
- PDF: pdfkit 미설치로 3개 테스트 실패 (bun install로 즉시 해결 가능)
- 3계층 비즈니스 산출물 스펙 미완성

### 약점 4: 단일 AI 공급자 의존

Claude Agent SDK = Anthropic 전용. GPT, Gemini, 로컬 LLM 지원 없음.

- API 가격 인상, 서비스 장애 시 전체 시스템 중단
- Harness Engineering에서는 "하네스는 모델에 독립적이어야 한다"는 원칙을 제시하는 흐름

### 약점 5: tester 에이전트 테스트 코드 품질 보장 불확실

- tester 에이전트가 생성한 테스트 코드 자체의 품질 검증 없음
- "의미 없는 테스트"(항상 pass하도록 작성된 테스트)를 탐지하는 메커니즘 미구현
- Harness Engineering Verify 관점: 검증 도구 자체의 품질 보증 필요

### 약점 6: 기술 스택 의존성 불투명

tester 에이전트가 Bash로 실행하는 테스트 명령이 target project 환경에 의존.

- target project가 특이한 테스트 환경(Docker 필요, 특수 DB 등)이면 에이전트가 스스로 해결해야 함
- 이 과정의 실패 처리 메커니즘이 스펙에 상세 정의 부족

### 약점 7: 하네스 자체의 플러그인화 미지원

MCP/Skill 확장은 가능하지만, **Phase 추가, 에이전트 추가, 검증 단계 커스텀이 불가**.

- Harness Engineering의 장기 방향: 하네스 자체가 확장 가능한 플랫폼이 되어야 함
- 현재 7개 에이전트 고정, Phase 4개 고정

### 약점 8: 도구 최소화 재검토 필요 (Vercel 원칙)

Vercel: 도구 80% 줄이니 성공률 향상.

- 현재 Phase별 allowedTools 제한은 있지만 각 에이전트에게 제공하는 도구가 최소화됐는지 재점검 필요
- 특히 DESIGN Phase의 Agent Teams 상황에서 도구 선택 최적화 여지

---

## 13. 종합 평가 매트릭스

### Harness Engineering 4대 기능 기준

| Harness Engineering 기능       | 세부 항목        | adev 구현 수준 | 비고                               |
| ------------- | ---------------- | -------------- | ---------------------------------- |
| **Constrain** | 아키텍처 경계    | ★★★★★          | 단방향 의존성 강제                 |
|               | 허용 도구 제한   | ★★★★☆          | Phase별 allowedTools — 최적화 여지 |
|               | 역할 분리        | ★★★★★          | 7개 에이전트 엄격 분리             |
|               | 파일 충돌 방지   | ★★★★★          | Git branch 모듈 단위 격리          |
| **Inform**    | 기획 명세 자동화 | ★★★★★          | Contract + 유형 정의서 (Harness Engineering에 없음) |
|               | 역할 지침        | ★★★★★          | agent.md 프로젝트 맞춤 생성        |
|               | 동적 컨텍스트    | ★★★★★          | LanceDB RAG (Harness Engineering를 초월)            |
|               | 진행 상태 추적   | ★★★★☆          | session-snapshot — 실 검증 필요    |
| **Verify**    | TDD 강제         | ★★★★★          | tester→coder 순서 고정             |
|               | 테스트 자동 생성 | ★★★★☆          | 유형 정의서 기반 — 품질 보증 필요  |
|               | CI 역할          | ★★★★★          | 계단식 + 최종 100만회              |
|               | Fail-Fast        | ★★★★★          | 엄격 적용                          |
|               | 다층 검증        | ★★★★★          | 4중 검증 (Harness Engineering 초월)                 |
|               | 의도 검증        | ★★★★★          | 1계층 의도 vs 구현 (Harness Engineering에 없음)     |
| **Correct**   | 피드백 루프      | ★★★★★          | failure-handler + Phase 복귀       |
|               | 근본 원인 분석   | ★★★★★          | qc 전담 (1개 집중)                 |
|               | 실패 학습        | ★★★★★          | failure-store RAG (Harness Engineering에 없음)      |
|               | 세션 복원        | ★★★★☆          | 실 E2E 검증 필요                   |

### adev 위치 요약

```
Harness Engineering (방법론 원칙)
  ↑ 구현체로서 참조
  adev
    ✅ Harness Engineering 4대 기능 전부 구현
    ✅ 여러 영역에서 Harness Engineering를 초월:
         - LanceDB RAG 동적 컨텍스트
         - 실패 학습 (failure-store)
         - 4중 검증 + 의도 검증
         - 확증편향 탐지
         - 토큰 관리
         - Contract 기반 인계
    ⚠️ 미완성/미검증:
         - 실제 E2E 플로우 (가장 중요)
         - PPTX/DOCX 렌더러
         - 7명 동시 PoC
    ❌ 없는 것:
         - 단일 AI 공급자 이상의 확장성
         - 하네스 자체의 플러그인화
```

---

_분석 기준일: 2026-03-13_
_참고 출처: OpenAI Harness Engineering (2026-02) / Anthropic Engineering Blog / martinfowler.com Birgitta Böckeler / LangChain DeepAgents / adev-spec-full-v2_4.md / docs/references/_
