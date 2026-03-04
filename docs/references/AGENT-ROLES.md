# 에이전트 역할 구조

## 7개 고정 (추가/변경 금지)

| 에이전트 | 유형 | 역할 | 코딩 권한 |
|---|---|---|---|
| architect | 루프 | 기술 설계, 구조 결정 | 금지 |
| qa | 루프 | 예방 Gate (코딩 전 검증) | 금지 |
| coder | 루프 | 코드 구현 (유일한 수정 권한) | **허용** |
| tester | 루프 | 테스트 생성 + 실행 | 테스트만 |
| qc | 루프 | 사후 검출, 근본 원인 분석 | 금지 |
| reviewer | 루프 | 코드 리뷰, 품질 판정 | 금지 |
| documenter | 이벤트 | 문서 생성 (트리거 시 spawn) | 금지 |

## qa vs qc 구분

- **qa (예방)**: 코딩 전/중 Gate. 스펙 대비 설계 완성도 검증. DESIGN Phase 주도
- **qc (검출)**: 코딩 후 분석. 테스트 결과 기반 합격/불합격. TEST/VERIFY Phase 참여

둘은 완전히 다른 시점/역할. 혼동 금지.

## Coder×N 병렬

- 모듈 단위 분배 (같은 파일 2개 이상 coder 금지)
- Git branch: `feature/{기능명}-{모듈명}-coderN`
- 충돌 시: coder + qa + qc + reviewer + architect 논의

## documenter 트리거

이벤트 발생 시 adev가 query()로 spawn → LanceDB 컨텍스트 복원 → 문서 생성 → 종료.
상시 가동 아님 (유휴 토큰 = 0).
