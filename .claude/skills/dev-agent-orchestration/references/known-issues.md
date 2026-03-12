# 알려진 이슈

## TeamDelete Race Condition

- 현상: TeamDelete 호출 후에도 config.json 멤버 목록이 자동 갱신되지 않음
- 영향: 팀 재생성 시 이전 멤버가 남아있을 수 있음
- 우회: 수동으로 config.json 편집하거나 팀을 새 이름으로 재생성
- 출처: V2-P2-2 PoC (SDK v0.2.63)

## unstable_v2 API 불안정성

- `unstable_v2_createSession`, `unstable_v2_prompt` 모두 unstable 접두사
- SDK 업데이트 시 API 변경 가능성 있음
- 대응: AgentExecutor 추상화로 격리. SDK 변경 시 구현체만 교체
