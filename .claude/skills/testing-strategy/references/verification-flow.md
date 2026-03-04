# 4중 검증 흐름 상세

## 순서

```
Phase 4: VERIFY
  ① qa: 스펙 대비 구현 완성도 검증
     qc: 테스트 결과 기반 합격/불합격
  ② reviewer: 코드 품질 체크리스트 검증
  ③ 1계층 Claude API: "의도대로 구현되었는가?"
     → 스펙 수정 필요 시 유저에게 질문
  ④ adev: 위 3개 결과 종합 + 확증편향 체크
     → 4개 모두 통과해야 다음 기능으로
```

## 실패 시 분기

```
검증 실패 유형 → 돌아갈 Phase
  설계 결함 → Phase 1 (DESIGN)
  구현 결함 → Phase 2 (CODE)
  테스트 미달 → Phase 3 (TEST)
  스펙 모호 → 1계층 (유저 질문)
```

## 모델 전략

```json
{
  "verification": {
    "layer1_model": "opus",          // 기본 Opus
    "adev_model": "opus",
    "opus_escalation_on_failure": true // Sonnet 실패 시 Opus 재검증
  }
}
```

| layer1_model | escalation | 동작 |
|---|---|---|
| "opus" | 무관 | 항상 Opus (기본값) |
| "sonnet" | true | Sonnet → 실패 시 Opus 재검증 |
| "sonnet" | false | Sonnet만 (비용 절감) |
