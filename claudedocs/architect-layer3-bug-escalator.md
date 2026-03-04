# Layer3 설계: BugEscalator

## 1. 개요

**목적**: 3계층→2계층 버그 리포트 + 재실행 트리거

**위치**: `src/layer3/bug-escalator.ts`

**의존성**: layer3 → core, layer2 (TeamLeader, FailureHandler)

**핵심 책임**:
- ProductionTester가 발견한 버그를 2계층에 에스컬레이션
- qc 에이전트에 근본 원인 분석 요청
- 2계층 전체 루프 재실행 트리거 (architect부터)
- Fail-Fast 원칙 적용: 1개 버그만 집중
- 계단식 통합 검증 → 4중 검증 → 유저 재확인

**워크플로우**:
```
버그 발견 (지속 E2E 중 1개 실패)
  ↓ (즉시 중단)
BugEscalator.escalate()
  ↓
qc: 근본 원인 1개만 집중 분석
  ↓
2계층 전체 루프 재실행 (architect부터)
  ↓
architect: 설계 문제 vs 구현 문제 판단
  ↓
coder: 수정 (Fail-Fast로 1개만)
  ↓
tester: Unit/Module/E2E 통과 확인
  ↓
계단식 통합 검증 (Step 1~4)
  ↓
4중 검증
  ↓
유저 재확인 (변경 사항 요약만)
  ↓
3계층 복귀
```

---

## 2. 인터페이스 정의

```typescript
/**
 * 버그 에스컬레이션 옵션 / Bug escalation options
 */
export interface EscalateBugOptions {
  /** 프로젝트 ID / Project ID */
  readonly projectId: string;
  /** 기능 ID (연관된 경우) / Feature ID (if related) */
  readonly featureId?: string;
  /** 실패한 E2E 테스트 결과 / Failed E2E test result */
  readonly failedTest: ContinuousE2EResult;
  /** 추가 컨텍스트 / Additional context */
  readonly context?: string;
}

/**
 * 2계층 재실행 트리거 옵션 / Layer 2 re-execution trigger options
 */
export interface TriggerLayer2Options {
  /** 프로젝트 ID / Project ID */
  readonly projectId: string;
  /** 버그 리포트 / Bug report */
  readonly bugReport: BugReport;
  /** 시작 Phase (architect 고정) / Start phase (fixed to architect) */
  readonly startPhase: 'DESIGN';
}

/**
 * 계단식 통합 검증 결과 / Stepwise integration verification result
 */
export interface StepwiseVerificationResult {
  /** Step 번호 (1~4) / Step number (1~4) */
  readonly step: number;
  /** 통과 여부 / Whether passed */
  readonly passed: boolean;
  /** 실패 수 / Fail count */
  readonly failCount: number;
  /** 실패 메시지 (실패 시) / Fail message (if failed) */
  readonly failMessage?: string;
}

/**
 * 버그 에스컬레이터 인터페이스 / Bug escalator interface
 */
export interface IBugEscalator {
  /**
   * 버그를 2계층에 에스컬레이션한다 / Escalate bug to Layer 2
   *
   * @param options - 에스컬레이션 옵션 / Escalation options
   * @returns 에스컬레이션 결과 / Escalation result
   */
  escalate(options: EscalateBugOptions): Promise<Result<BugEscalationResult>>;

  /**
   * qc 에이전트에 근본 원인 분석을 요청한다 / Request root cause analysis from qc agent
   *
   * @param failedTest - 실패한 테스트 / Failed test
   * @returns 버그 리포트 / Bug report
   */
  analyzeRootCause(failedTest: ContinuousE2EResult): Promise<Result<BugReport>>;

  /**
   * 2계층 전체 루프 재실행을 트리거한다 / Trigger Layer 2 full loop re-execution
   *
   * @param options - 트리거 옵션 / Trigger options
   * @returns 재실행 성공 여부 / Re-execution success status
   */
  triggerLayer2(options: TriggerLayer2Options): Promise<Result<void>>;

  /**
   * 계단식 통합 검증을 실행한다 / Execute stepwise integration verification
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param featureId - 수정된 기능 ID / Modified feature ID
   * @returns 검증 결과 배열 / Verification result array
   */
  runStepwiseVerification(
    projectId: string,
    featureId: string,
  ): Promise<Result<readonly StepwiseVerificationResult[]>>;

  /**
   * 유저에게 변경 사항 재확인을 요청한다 / Request user re-confirmation of changes
   *
   * @param bugReport - 버그 리포트 / Bug report
   * @param changes - 변경 사항 요약 / Changes summary
   * @returns 유저 승인 여부 / User approval status
   */
  requestUserConfirmation(
    bugReport: BugReport,
    changes: string,
  ): Promise<Result<boolean>>;
}
```

---

## 3. 구현 클래스

```typescript
/**
 * BugEscalator 구현 클래스 / BugEscalator implementation
 */
export class BugEscalator implements IBugEscalator {
  private readonly logger: Logger;
  private readonly teamLeader: TeamLeader; // 2계층 TeamLeader
  private readonly failureHandler: FailureHandler; // 2계층 FailureHandler
  private readonly integrationTester: IntegrationTester; // 계단식 검증용

  constructor(
    teamLeader: TeamLeader,
    failureHandler: FailureHandler,
    integrationTester: IntegrationTester,
    logger: Logger,
  ) {
    this.teamLeader = teamLeader;
    this.failureHandler = failureHandler;
    this.integrationTester = integrationTester;
    this.logger = logger.child({ module: 'bug-escalator' });
  }

  // 메서드 구현은 구현 단계에서 작성
}
```

---

## 4. 주요 메서드 시그니처

### 4.1 escalate()

**책임**: 버그 에스컬레이션 전체 워크플로우 오케스트레이션

**로직**:
1. `analyzeRootCause(options.failedTest)` 호출 → 버그 리포트 생성
2. `triggerLayer2({ bugReport })` 호출 → 2계층 재실행
3. 2계층 완료 대기
4. `runStepwiseVerification(projectId, featureId)` 호출 → 계단식 검증
5. 4중 검증 실행 (qa_qc, reviewer, layer1, adev)
6. `requestUserConfirmation(bugReport, changes)` 호출 → 유저 재확인
7. `BugEscalationResult` 생성
8. 로그 기록
9. 결과 반환

**에러 처리**: 각 단계 실패 시 `Layer3Error`

---

### 4.2 analyzeRootCause()

**책임**: qc 에이전트에 근본 원인 분석 요청

**로직**:
1. qc 에이전트 스폰
2. 프롬프트: "다음 E2E 테스트 실패의 근본 원인을 1개만 집중 분석하세요. 실패 정보: {failedTest}"
3. qc 응답 수신 (근본 원인 1개)
4. `BugReport` 생성:
   - `title`: 실패한 테스트 이름
   - `description`: 실패 상세
   - `rootCause`: qc 분석 결과
   - `severity`: qc가 판단한 심각도
   - `category`: qc가 판단한 카테고리
5. 버그 리포트 반환

**에러 처리**: qc 실행 실패 → `Layer3Error`

---

### 4.3 triggerLayer2()

**책임**: 2계층 전체 루프 재실행 트리거

**로직**:
1. `teamLeader.restart({ phase: 'DESIGN', bugReport })` 호출
2. architect 에이전트 스폰 (버그 리포트 전달)
3. architect가 "설계 문제 vs 구현 문제" 판단
4. 2계층 4-Phase 루프 실행 (DESIGN → CODE → TEST → VERIFY)
5. Fail-Fast: 각 Phase에서 1개 실패 → 즉시 중단 → 수정 → 해당 Phase 처음부터
6. 2계층 완료 대기
7. 로그 기록

**에러 처리**: 2계층 재실행 실패 → `Layer3Error`

---

### 4.4 runStepwiseVerification()

**책임**: 계단식 통합 검증 실행 (4단계)

**로직**:
1. **Step 1**: 수정된 기능 E2E 10만+ (전체)
   - `integrationTester.runE2E(featureId, 100_000)` 호출
   - 1개 실패 → 즉시 중단 → 결과 반환
2. **Step 2**: 연관 기능 E2E 1만 (회귀)
   - 연관 기능 목록 조회 (의존성 그래프)
   - 각 연관 기능에 대해 `integrationTester.runE2E(relatedId, 10_000)` 호출
   - 1개 실패 → 즉시 중단 → 수정 → Step 1부터
3. **Step 3**: 비연관 기능 E2E 1천 (스모크)
   - 비연관 기능 목록 조회
   - 각 기능에 대해 `integrationTester.runE2E(otherId, 1_000)` 호출
   - 1개 실패 → 즉시 중단 → 수정 → Step 1부터
4. **Step 4**: 전부 통과 → 통합 E2E 100만회 최종 1회
   - `integrationTester.runE2E('all', 1_000_000)` 호출
   - 1개 실패 → 즉시 중단 → 수정 → Step 1부터
5. 모든 Step 통과 → 결과 배열 반환

**에러 처리**: 각 Step 실패 시 즉시 중단 → `Layer3Error`

---

### 4.5 requestUserConfirmation()

**책임**: 유저에게 변경 사항 재확인 요청

**로직**:
1. 1계층 Claude Opus 호출
2. 프롬프트: "다음 버그 수정 사항을 유저에게 설명하고 승인을 요청하세요. 버그: {bugReport}, 변경 사항: {changes}"
3. 1계층 응답을 유저에게 전달
4. 유저 입력 대기 ("승인" / "거부" / "수정 요청")
5. 승인 여부 반환

**에러 처리**: 1계층 호출 실패 → `Layer3Error`

---

## 5. Fail-Fast 흐름 예시

```
ProductionTester: E2E 1개 실패 감지
  ↓
BugEscalator.escalate()
  ↓
analyzeRootCause() → qc: "인증 토큰 만료 체크 누락"
  ↓
triggerLayer2() → architect: "구현 문제 → coder 수정"
  ↓
coder: auth.ts:45 수정 (1개만 집중)
  ↓
tester: Unit 10회 통과, Module 1만회 통과, E2E 10만회 통과
  ↓
runStepwiseVerification()
  Step 1: auth 기능 E2E 10만+ → 통과
  Step 2: profile 기능 E2E 1만 (연관) → 통과
  Step 3: dashboard 기능 E2E 1천 (비연관) → 통과
  Step 4: 통합 E2E 100만회 → 통과
  ↓
4중 검증 (qa_qc, reviewer, layer1, adev)
  ↓
requestUserConfirmation() → 유저: "승인"
  ↓
3계층 복귀 → 문서 생성 계속
```

---

## 6. 의존성 그래프

```
BugEscalator
├─→ Logger (core/logger.ts)
├─→ TeamLeader (layer2/team-leader.ts) — 2계층 재실행
├─→ FailureHandler (layer2/failure-handler.ts) — 실패 처리
└─→ IntegrationTester (layer2/integration-tester.ts) — 계단식 검증
```

---

## 7. 에러 타입 정의

**에러 코드** (Layer3Error):
- `layer3_bug_escalate_failed`: 버그 에스컬레이션 실패
- `layer3_root_cause_analysis_failed`: 근본 원인 분석 실패
- `layer3_layer2_trigger_failed`: 2계층 트리거 실패
- `layer3_stepwise_verification_failed`: 계단식 검증 실패
- `layer3_user_confirmation_failed`: 유저 재확인 실패

---

## 8. 테스트 전략

### 단위 테스트 (tests/unit/layer3/bug-escalator.test.ts)

**테스트 케이스**:
1. `analyzeRootCause()` — qc 분석 성공
2. `analyzeRootCause()` — qc 분석 실패
3. `triggerLayer2()` — 2계층 재실행 트리거
4. `runStepwiseVerification()` — Step 1~4 전부 통과
5. `runStepwiseVerification()` — Step 2 실패 → 중단
6. `requestUserConfirmation()` — 유저 승인
7. `requestUserConfirmation()` — 유저 거부
8. `escalate()` — 전체 워크플로우 성공

**모킹**: TeamLeader, FailureHandler, IntegrationTester 모킹

---

### 통합 테스트 (tests/module/layer3-bug-escalator.test.ts)

**테스트 케이스**:
1. 실제 버그 에스컬레이션 → 2계층 재실행 → 계단식 검증 → 유저 승인
2. Fail-Fast 동작 확인 (Step 실패 시 즉시 중단)

---

## 9. 사용 예시

```typescript
import { BugEscalator } from './layer3/bug-escalator.js';
import { TeamLeader } from './layer2/team-leader.js';
import { FailureHandler } from './layer2/failure-handler.js';
import { IntegrationTester } from './layer2/integration-tester.js';
import { createLogger } from './core/logger.js';

const teamLeader = new TeamLeader(/* ... */);
const failureHandler = new FailureHandler(/* ... */);
const integrationTester = new IntegrationTester(/* ... */);

const escalator = new BugEscalator(
  teamLeader,
  failureHandler,
  integrationTester,
  createLogger(),
);

// 버그 에스컬레이션
const failedTest: ContinuousE2EResult = {
  id: 'test-1',
  projectId: 'proj-1',
  executedAt: new Date(),
  passed: false,
  failedTest: 'tests/e2e/auth.test.ts',
  errorMessage: '401 Unauthorized',
};

const escalationResult = await escalator.escalate({
  projectId: 'proj-1',
  featureId: 'feat-auth',
  failedTest,
});

if (escalationResult.ok) {
  console.log('버그 에스컬레이션 완료:', escalationResult.value.id);
  console.log('2계층 재실행 트리거됨:', escalationResult.value.triggered);
}
```

---

## 10. 구현 우선순위

**Phase 7-1**: 인터페이스 + analyzeRootCause 구현
**Phase 7-2**: triggerLayer2 구현
**Phase 7-3**: runStepwiseVerification 구현 (Step 1~4)
**Phase 7-4**: requestUserConfirmation 구현
**Phase 7-5**: escalate 전체 오케스트레이션 구현
**Phase 7-6**: 단위 테스트 + 통합 테스트

---

## 11. 참고 문서

- `SPEC.md` Section 9.4 — 3계층 → 2계층 버그 리포트
- `src/layer3/types.ts` — BugReport, BugEscalationResult
- `src/layer2/team-leader.ts` — TeamLeader 인터페이스
- `src/layer2/failure-handler.ts` — FailureHandler 인터페이스
- `src/layer2/integration-tester.ts` — IntegrationTester 인터페이스
