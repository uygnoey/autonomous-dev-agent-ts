# layer2 모듈 (2계층)

> 최종 갱신: 2026-03-11
> SDK: `@anthropic-ai/claude-agent-sdk@0.2.72` (완전 통합)

SDK 기반 자율 개발 오케스트레이션. 가장 복잡한 모듈.

## 파일 구조 (29개)

```
src/layer2/
├── types.ts                    — AgentConfig, AgentEvent, PhaseTransition, VerificationResult
├── v2-session-executor-types.ts — V2Session 인터페이스, V2SessionFactory, V2SessionExecutorOptions
├── v2-session-factory.ts       — sdkSessionFactory, executeOneShot, sdkResumeSession, mapSdkEvent
├── v2-session-executor.ts      — V2SessionExecutor (AgentExecutor 구현체, 완전 구현)
├── layer2-bootstrap.ts         — Layer2Bootstrap 팩토리
├── phase-engine.ts             — 4-Phase FSM (DESIGN→CODE→TEST→VERIFY)
├── agent-spawner.ts            — AgentExecutor 얇은 래퍼
├── session-manager.ts          — 세션 생명주기
├── token-monitor.ts            — 토큰 사용량 추적
├── progress-tracker.ts         — 기능별/Phase별 진행률
├── handoff-receiver.ts         — Contract 수신 + 구조/정합성 검증
├── agent-generator.ts          — 역할별 AgentConfig 생성
├── coder-allocator.ts          — Coder×N 분할. Git branch 관리
├── stream-monitor.ts           — SDK 스트림 감시. Hook 처리
├── bias-detector.ts            — 확증편향/루프/교착 탐지
├── failure-handler.ts          — 실패 유형 분류 + 복구 전략
├── verification-gate.ts        — 4중 검증 종합 판단
├── integration-tester.ts       — 계단식 통합 테스트 오케스트레이션
├── clean-env-manager.ts        — 클린 환경 생성/삭제
├── user-checkpoint.ts          — 유저 확인 흐름
├── team-leader.ts              — 메인 오케스트레이터
├── team-leader-helpers.ts      — executePhase 등 순수 함수 분리
└── index.ts                    — public API
```

## V2 Session API 핵심 패턴

```typescript
// send() 먼저 → stream() 별도 호출 필수
await session.send(config.prompt);
for await (const msg of session.stream()) {
  // type:'assistant' → tool_use/message 이벤트
  // type:'result'    → done/error 이벤트
}
```

- **DESIGN Phase**: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 설정
- **기타 Phase**: 환경변수 키 미설정 (비활성화)

## 의존성

- core, rag, layer1
