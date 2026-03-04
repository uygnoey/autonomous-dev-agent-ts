# CLI 설계: commands/start.ts

## 1. 개요

**목적**: Layer1 대화 시작

**위치**: `src/cli/commands/start.ts`

**의존성**: cli → core, layer1

**핵심 책임**:
- Layer1 Claude Opus와 대화 세션 시작
- 프로젝트 컨텍스트 로드
- 기획/설계 대화 진행
- Contract 생성 → Layer2 handoff

**사용법**:
```bash
adev start                           # 활성 프로젝트에서 시작
adev start --project-id proj-1       # 특정 프로젝트
adev start --feature "인증 기능 추가"  # 기능 설명 제공
```

---

## 2. 인터페이스 정의

```typescript
export interface IStartCommand extends CliCommandHandler<StartOptions> {
  /**
   * 활성 프로젝트를 로드한다 / Load active project
   */
  loadActiveProject(): Promise<Result<ProjectInfo>>;

  /**
   * Layer1 세션을 시작한다 / Start Layer1 session
   */
  startLayer1Session(projectId: string): Promise<Result<void>>;

  /**
   * 대화 루프를 실행한다 / Run conversation loop
   */
  runConversationLoop(): Promise<Result<void>>;
}
```

---

## 3. 주요 로직

### execute()
1. 활성 프로젝트 로드 (또는 `--project-id` 사용)
2. 프로젝트 초기화 확인 (`.adev/` 존재)
3. Layer1Client 생성
4. 대화 세션 시작
5. 유저 입력 → Claude Opus 응답 루프
6. "확정" 입력 시 Contract 생성 → Layer2 handoff
7. 세션 종료

### startLayer1Session()
1. Layer1Client 초기화 (Opus 4.6)
2. 프로젝트 컨텍스트 로드 (코드 인덱스, 과거 대화 등)
3. 초기 시스템 프롬프트 설정
4. 대화 준비 완료

### runConversationLoop()
1. REPL 루프 시작
2. 유저 입력 받기
3. Layer1Client.sendMessage(input) 호출
4. Claude Opus 응답 스트리밍 출력
5. "확정" 입력 → Contract 생성 요청
6. Contract 검증 → Layer2 전환 확인
7. 종료 조건: "exit", "quit", Ctrl+C

---

## 4. 의존성

```
StartCommand
├─→ Logger
├─→ ProjectManager
├─→ Layer1Client (layer1/client.ts) — Layer1 API 호출
└─→ readline (Node.js 내장) — REPL
```

---

## 5. 구현 우선순위

1. 인터페이스 + loadActiveProject
2. startLayer1Session (Layer1Client 연동)
3. runConversationLoop (REPL)
4. 단위 테스트 + 통합 테스트

---

## 6. 참고 문서

- `SPEC.md` Section 2 — 아키텍처 (1계층)
- `src/layer1/client.ts` — Layer1Client 인터페이스
