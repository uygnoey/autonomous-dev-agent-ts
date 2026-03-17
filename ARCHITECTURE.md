# adev — 아키텍처

## 핵심 개념 (설계 철학)

```
┌─────────────────────────────────────────────────────────────┐
│                  adev = 오케스트레이터                       │
│                                                             │
│  실제 작업자: Claude (기획·설계·개발·테스트·검증 모두)        │
│  adev의 역할: Claude가 일관된 고품질로 작업할 수 있게         │
│              메모리 관리 + 흐름 관리를 담당                   │
└─────────────────────────────────────────────────────────────┘
```

**adev가 하는 일**:
- **메모리 관리**: RAG(LanceDB)로 과거 결정·실패·코드 인덱스를 보존하고 Claude에 주입
- **흐름 관리**: Phase FSM(DESIGN→CODE→TEST→VERIFY)으로 개발 순서를 강제
- **역할 분리**: 7개 전문 에이전트로 Claude가 집중할 수 있게 컨텍스트 분리
- **품질 게이트**: architect→qa→coder→tester→qc→reviewer 순서로 품질을 단계적 보장
- **컨텍스트 주입**: `.claude/agents/` + CLAUDE.md로 각 Claude 인스턴스에 역할 문서 전달

**Claude가 하는 일 (adev의 도움을 받아)**:
- 유저 요구사항 분석 및 기획 (Layer1 대화)
- 설계 결정 및 아키텍처 (architect 에이전트)
- 실제 코드 작성 (coder 에이전트 ×N)
- 테스트 작성 및 실행 (tester 에이전트)
- 품질 검증 및 리뷰 (qa, qc, reviewer 에이전트)
- 문서 생성 (documenter 에이전트)

> **핵심**: adev 없이 Claude는 역할이 섞이고, 컨텍스트를 잃고, 일관성이 깨진다.
> adev가 있어야 Claude가 "서비스 가능 수준"의 코드를 자율적으로 완성한다.

---

## 3계층 구조

```
┌───────────────────────────────────────────────┐
│ 1계층: Claude API (Opus 4.6)                  │
│ 유저 대화, 기획, 설계, Contract 생성, 검증 참여 │
│ 모듈: src/layer1/                             │
├───────────────────────────────────────────────┤
│ 2계층: Claude Agent SDK (V2 Session API)       │
│ 자율 개발 (7 에이전트 + Phase Engine)           │
│ 모듈: src/layer2/                             │
├───────────────────────────────────────────────┤
│ 3계층: 산출물 + 지속 검증                      │
│ 통합 문서, 비즈니스 산출물, 지속 E2E            │
│ 모듈: src/layer3/                             │
└───────────────────────────────────────────────┘
```

## 모듈 의존성 그래프

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

**규칙**: 화살표 방향으로만 import 가능. 역방향/순환 의존 절대 금지.

## V2 Session API 런타임

```typescript
// 핵심 패턴 — AgentExecutor 추상화
import { unstable_v2_createSession } from '@anthropic-ai/claude-agent-sdk';

interface AgentExecutor {
  execute(config: AgentConfig): AsyncIterable<AgentEvent>;
}

class V2SessionExecutor implements AgentExecutor {
  async *execute(config: AgentConfig): AsyncIterable<AgentEvent> {
    const session = unstable_v2_createSession(config.options);
    for await (const event of session.stream(config.prompt, config.hooks)) {
      yield this.mapEvent(event);
    }
  }
}
```

출처: PoC 검증 (SDK v0.2.63, 5/5 PASS, $3.881) — github.com/uygnoey/adev-poc-guide

## Phase별 실행 전략

| Phase | 실행 방식 | Agent Teams | 이유 |
|-------|----------|-------------|------|
| DESIGN | session.stream() 1개 | ✅ 활성화 | 팀 토론 (architect/qa/coder/reviewer) |
| CODE | unstable_v2_prompt() ×N 동시 | ❌ | coder 독립 병렬 |
| TEST | unstable_v2_prompt() 순차 | ❌ | Fail-Fast 순차 실행 |
| VERIFY | unstable_v2_prompt() 순차 | ❌ | 4중 검증 순차 |

## 7개 에이전트 (고정, 추가/변경 금지)

루프 에이전트 (6개, 순서대로):
1. `architect` — 설계, 아키텍처 결정
2. `qa` — 예방 중심 (코딩 전 Gate)
3. `coder` — 코드 구현 (×N 병렬 가능)
4. `tester` — 테스트 생성 + 실행 (Fail-Fast)
5. `qc` — 검출 중심 (근본 원인 1개)
6. `reviewer` — 코드 리뷰

이벤트 트리거 에이전트 (1개):
7. `documenter` — Phase 완료 시 spawn → 문서 생성 → 종료

상세: `docs/references/AGENT-ROLES.md`

## 데이터 공유 전략 (2중)

```
1순위: SDK 세션 내 컨텍스트
  DESIGN → Agent Teams SendMessage (팀 토론)
  CODE/TEST/VERIFY → 독립 세션 + 파일 시스템 공유

2순위: LanceDB 벡터 공유
  과거 결정 이력, 실패 이유, 코드 인덱스 등 장기 기억
  세션 만료/재시작 후에도 보존
```

## LanceDB 테이블 4개

1. `memory` — 대화 이력, 결정, 피드백, 에러
2. `code_index` — 코드베이스 벡터 인덱스
3. `design_decisions` — 설계 결정 이력
4. `failures` — 실패 이력 + 해결책

스키마 상세: `.claude/skills/rag-integration/references/lancedb-schemas.md`

## src/ 모듈 구조

| 모듈 | 파일 수 | 핵심 책임 |
|------|---------|----------|
| `core/` | 5 | config, errors, logger, memory, plugin-loader |
| `auth/` | 4 | API key / Subscription 인증 분기 |
| `cli/` | 5 | CLI 명령어 (init, start, config, project) |
| `layer1/` | 8 | 유저 대화, 기획, 설계, Contract 생성, 검증 참여 |
| `layer2/` | 16 | 자율 개발 오케스트레이션 전체 |
| `layer3/` | 5 | 통합 문서, 지속 E2E, 비즈니스 산출물 |
| `rag/` | 7 | LanceDB, 임베딩, 코드 인덱싱, 검색 |
| `mcp/` | 12 | MCP 서버 관리, builtin 4개 |
