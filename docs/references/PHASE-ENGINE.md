# 4-Phase FSM

## Phase 전환

```
DESIGN ──(qa Gate 통과 + 전원 합의)──→ CODE
CODE ──(구현 완료 + architect/reviewer 승인)──→ TEST
TEST ──(Unit→Module→E2E 전체 0 실패 + qc 승인)──→ VERIFY
VERIFY ──(4중 검증 통과)──→ 완료
VERIFY ──(실패)──→ 실패 유형에 따라 DESIGN/CODE/TEST
```

## Phase별 참여 에이전트

| Phase | 주도 | 참여 | 비참여 |
|---|---|---|---|
| DESIGN | architect | qa(Gate), coder(피드백), reviewer(검토) | tester, qc |
| CODE | coder(×N) | architect(감독), reviewer(감독) | qa, tester, qc |
| TEST | tester | qc(실패 분석) | architect, qa, coder, reviewer |
| VERIFY | adev(종합) | qa, qc, reviewer, 1계층 | architect, coder, tester |

## 전환 규칙

- 역방향 전환: VERIFY 실패 시만 허용
  - 설계 결함 → DESIGN
  - 구현 결함 → CODE
  - 테스트 미달 → TEST
  - 스펙 모호 → 1계층 (유저 질문)
- 전환 시 documenter 트리거 (Phase 경계 문서 생성)

## DESIGN Phase 실행 방식

Agent Teams 사용 (환경변수 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`).
전원 토론 → 합의 → qa Gate 통과 → CODE 진입.

## CODE/TEST/VERIFY Phase 실행 방식

독립 `query()` 세션. 각 에이전트 병렬 실행.
