---
name: agent-orchestration
description: 7개 에이전트 역할, Phase FSM, Coder×N Git branch, documenter 이벤트 트리거. layer2 구현 시 참조.
---

# 에이전트 오케스트레이션

## 7개 에이전트 (고정, 추가/변경 금지)

루프 에이전트 6개:
1. architect — 설계, 코딩 금지
2. qa — 예방(Gate), 코딩 금지
3. coder — 유일한 코드 수정 권한, ×N 병렬
4. tester — 테스트 생성+실행, 코드 수정 금지
5. qc — 검출, 근본 원인 1개, 코드 수정 금지
6. reviewer — 리뷰, 코드 직접 수정 금지

이벤트 트리거 1개:
7. documenter — Phase 완료 시 spawn → 문서 생성 → 종료

상세: `references/agent-roles-detail.md`

## Phase 전환 FSM

```
DESIGN ──(qa Gate 통과 + 전원 합의)──→ CODE
CODE ──(구현 완료 + architect/reviewer 승인)──→ TEST
TEST ──(Unit→Module→E2E 전체 0 실패 + qc 승인)──→ VERIFY
VERIFY ──(4중 검증 통과)──→ 완료
VERIFY ──(실패)──→ 실패 유형에 따라 DESIGN/CODE/TEST
```

## Coder×N Git Branch

```
main (보호)
  ├─ feature/{기능명}-{모듈명}-coder1
  ├─ feature/{기능명}-{모듈명}-coder2
  └─ feature/{기능명}-{모듈명}-coder3

merge 순서: 의존성 그래프 순 (예: auth → user → payment)
충돌 시: coder + qa + qc + reviewer + architect 논의
```

## documenter 이벤트 트리거

```
이벤트 → adev가 documenter spawn → LanceDB 컨텍스트 복원 → 문서 생성 → 종료

트리거:
  - 기능 완료: 기능 설명서, API 연동 정의서
  - 테스트 완료/실패: 테스트 결과서, 커버리지 리포트
  - 버그 발생: 버그 리포트, 수정 내역서
  - Phase 경계: CHANGELOG, 의사결정 기록
```
