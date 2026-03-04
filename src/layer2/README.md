# layer2 모듈 (2계층)

SDK 기반 자율 개발 오케스트레이션. 가장 복잡한 모듈.

## 파일 구조 (18개)

```
src/layer2/
├── types.ts              — AgentConfig, PhaseTransition, VerificationResult
├── phase-engine.ts       — 4-Phase FSM
├── agent-spawner.ts      — V2 Session 생성 + AgentExecutor
├── session-manager.ts    — 세션 생명주기. LanceDB 스냅샷
├── token-monitor.ts      — 토큰 사용량 추적
├── progress-tracker.ts   — 기능별/Phase별 진행률
├── handoff-receiver.ts   — Contract 수신 + 구조/정합성 검증
├── agent-generator.ts    — 에이전트.md + SKILL.md 자동 생성
├── coder-allocator.ts    — Coder×N 분할. Git branch 관리
├── stream-monitor.ts     — SDK 스트림 감시. Hook 처리
├── bias-detector.ts      — 확증편향/루프/교착 탐지
├── failure-handler.ts    — 실패 유형 분류 + 복구 전략
├── verification-gate.ts  — 4중 검증 종합 판단
├── integration-tester.ts — 계단식 통합 테스트 오케스트레이션
├── clean-env-manager.ts  — 클린 환경 생성/삭제
├── user-checkpoint.ts    — 유저 확인 흐름
├── team-leader.ts        — 메인 오케스트레이터 (마지막 구현)
└── index.ts              — public API
```

## 의존성

- core, rag, layer1

## 구현 순서

6-A(기반) → 6-B(개발 제어) → 6-C(검증+통합) → 6-D(오케스트레이터)
team-leader.ts는 반드시 마지막.
