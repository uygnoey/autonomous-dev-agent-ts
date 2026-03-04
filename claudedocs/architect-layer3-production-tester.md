# Layer3 설계: ProductionTester

## 1. 개요

**목적**: 지속 E2E 실행 (유지보수 차원)

**위치**: `src/layer3/production-tester.ts`

**의존성**: layer3 → core, layer2 (IntegrationTester)

**핵심 책임**:
- 3계층에서 문서 생성과 병행하여 지속적 E2E 실행
- Fail-Fast 원칙: 1개 실패 → 즉시 중단
- 2계층-B 통합 E2E와는 다른 레벨 (유지보수 차원)
- 버그 발견 시 BugEscalator에 전달

**2계층-B vs 3계층 차이**:
```
2계층-B (개발 완료 직후):
  계단식 통합 검증 → 최종 100만회, 버그 0 확인

3계층 (산출물 생성과 병행):
  지속적 E2E 실행 (유지보수)
  → 문서 생성 중에도 계속 돌림
  → 1개 실패 → 즉시 중단
```

---

## 2. 인터페이스 정의

```typescript
/**
 * 지속 E2E 실행 상태 / Continuous E2E execution status
 */
export type ContinuousE2EStatus = 'idle' | 'running' | 'paused' | 'stopped';

/**
 * 지속 E2E 세션 / Continuous E2E session
 */
export interface ContinuousE2ESession {
  /** 세션 ID / Session ID */
  readonly id: string;
  /** 프로젝트 ID / Project ID */
  readonly projectId: string;
  /** 설정 / Configuration */
  readonly config: ContinuousE2EConfig;
  /** 상태 / Status */
  readonly status: ContinuousE2EStatus;
  /** 총 실행 횟수 / Total execution count */
  readonly totalExecutions: number;
  /** 성공 횟수 / Success count */
  readonly successCount: number;
  /** 실패 횟수 / Failure count */
  readonly failureCount: number;
  /** 시작 시각 / Started at */
  readonly startedAt: Date;
  /** 최종 실행 시각 / Last executed at */
  readonly lastExecutedAt?: Date;
}

/**
 * 지속 E2E 실행 옵션 / Continuous E2E execution options
 */
export interface StartContinuousE2EOptions {
  /** 프로젝트 ID / Project ID */
  readonly projectId: string;
  /** E2E 테스트 경로 / E2E test path */
  readonly testPath: string;
  /** 실행 간격 (ms, 기본: 5분) / Execution interval in milliseconds (default: 5min) */
  readonly intervalMs?: number;
  /** Fail-Fast 활성화 (기본: true) / Enable fail-fast (default: true) */
  readonly failFast?: boolean;
}

/**
 * 지속 E2E 테스터 인터페이스 / Continuous E2E tester interface
 */
export interface IProductionTester {
  /**
   * 지속 E2E 실행을 시작한다 / Start continuous E2E execution
   *
   * @param options - 실행 옵션 / Execution options
   * @returns 세션 / Session
   */
  start(options: StartContinuousE2EOptions): Promise<Result<ContinuousE2ESession>>;

  /**
   * 지속 E2E 실행을 중지한다 / Stop continuous E2E execution
   *
   * @param sessionId - 세션 ID / Session ID
   * @returns 성공 여부 / Success status
   */
  stop(sessionId: string): Promise<Result<void>>;

  /**
   * 지속 E2E 실행을 일시 정지한다 / Pause continuous E2E execution
   *
   * @param sessionId - 세션 ID / Session ID
   * @returns 성공 여부 / Success status
   */
  pause(sessionId: string): Promise<Result<void>>;

  /**
   * 지속 E2E 실행을 재개한다 / Resume continuous E2E execution
   *
   * @param sessionId - 세션 ID / Session ID
   * @returns 성공 여부 / Success status
   */
  resume(sessionId: string): Promise<Result<void>>;

  /**
   * 세션 상태를 조회한다 / Get session status
   *
   * @param sessionId - 세션 ID / Session ID
   * @returns 세션 / Session
   */
  getSession(sessionId: string): Promise<Result<ContinuousE2ESession>>;

  /**
   * 모든 활성 세션을 조회한다 / List all active sessions
   *
   * @returns 세션 배열 / Session array
   */
  listSessions(): Promise<Result<readonly ContinuousE2ESession[]>>;
}
```

---

## 3. 구현 클래스

```typescript
/**
 * ProductionTester 구현 클래스 / ProductionTester implementation
 */
export class ProductionTester implements IProductionTester {
  private readonly logger: Logger;
  private readonly integrationTester: IntegrationTester; // 2계층 IntegrationTester 재사용
  private readonly sessions: Map<string, ContinuousE2ESession>;
  private readonly timers: Map<string, NodeJS.Timeout>;

  constructor(
    integrationTester: IntegrationTester,
    logger: Logger,
  ) {
    this.integrationTester = integrationTester;
    this.logger = logger.child({ module: 'production-tester' });
    this.sessions = new Map();
    this.timers = new Map();
  }

  // 메서드 구현은 구현 단계에서 작성
}
```

---

## 4. 주요 메서드 시그니처

### 4.1 start()

**책임**: 지속 E2E 실행 시작 (백그라운드 루프)

**로직**:
1. `ContinuousE2ESession` 초기화
   - `status = 'running'`
   - `totalExecutions = 0`
   - `successCount = 0`
   - `failureCount = 0`
2. `sessions.set(sessionId, session)` 저장
3. 백그라운드 타이머 시작 (`setInterval`)
4. 타이머 콜백:
   - `executeOnce(sessionId)` 호출
   - Fail-Fast: 실패 시 `stop(sessionId)` 호출
5. `timers.set(sessionId, timer)` 저장
6. 로그 기록
7. 세션 반환

**에러 처리**: 초기화 실패 → `Layer3Error`

---

### 4.2 stop()

**책임**: 지속 E2E 실행 중지

**로직**:
1. `sessions.get(sessionId)` 조회
2. `timers.get(sessionId)` 조회
3. `clearInterval(timer)` 호출
4. `session.status = 'stopped'` 업데이트
5. `timers.delete(sessionId)` 삭제
6. 로그 기록

**에러 처리**: 세션 없음 → `Layer3Error`

---

### 4.3 pause()

**책임**: 지속 E2E 실행 일시 정지

**로직**:
1. `sessions.get(sessionId)` 조회
2. `timers.get(sessionId)` 조회
3. `clearInterval(timer)` 호출
4. `session.status = 'paused'` 업데이트
5. 로그 기록

**에러 처리**: 세션 없음 → `Layer3Error`

---

### 4.4 resume()

**책임**: 지속 E2E 실행 재개

**로직**:
1. `sessions.get(sessionId)` 조회
2. `session.status === 'paused'` 확인
3. 타이머 재시작 (`setInterval`)
4. `session.status = 'running'` 업데이트
5. 로그 기록

**에러 처리**: 세션 없음 → `Layer3Error`, 상태 불일치 → `Layer3Error`

---

### 4.5 executeOnce()

**책임**: E2E 테스트 1회 실행 (내부 메서드)

**로직**:
1. `sessions.get(sessionId)` 조회
2. `integrationTester.runE2E(session.config.testPath)` 호출
3. 결과 처리:
   - 성공: `session.successCount++`
   - 실패:
     - `session.failureCount++`
     - Fail-Fast 활성화 시:
       - `ContinuousE2EResult` 생성
       - `BugEscalator.escalate()` 호출 (버그 리포트)
       - `stop(sessionId)` 호출 (즉시 중단)
4. `session.totalExecutions++`
5. `session.lastExecutedAt = new Date()` 업데이트

**에러 처리**: 실행 실패 → 로그 + Fail-Fast 처리

---

### 4.6 getSession()

**책임**: 세션 상태 조회

**로직**:
1. `sessions.get(sessionId)` 조회
2. 없으면 에러
3. 세션 반환

**에러 처리**: 세션 없음 → `Layer3Error`

---

### 4.7 listSessions()

**책임**: 모든 활성 세션 목록 조회

**로직**:
1. `sessions.values()` 반환
2. 배열로 변환

**에러 처리**: 없음

---

## 5. Fail-Fast 동작 흐름

```
지속 E2E 실행 중...
  ↓ (5분마다 자동 실행)
E2E 테스트 1회 실행
  ↓
성공 → 계속
  ↓
실패 → Fail-Fast 활성화 시:
  1. 즉시 중단 (stop)
  2. ContinuousE2EResult 생성
  3. BugEscalator.escalate() 호출
  4. BugEscalator가 2계층 전체 루프 재실행
  5. 수정 완료 → 3계층 복귀
```

---

## 6. 의존성 그래프

```
ProductionTester
├─→ Logger (core/logger.ts)
├─→ IntegrationTester (layer2/integration-tester.ts) — E2E 실행 재사용
└─→ NodeJS.Timeout (타이머)
```

**IntegrationTester 재사용**: 2계층의 E2E 테스트 로직을 그대로 사용

---

## 7. 에러 타입 정의

**에러 코드** (Layer3Error):
- `layer3_continuous_e2e_start_failed`: 지속 E2E 시작 실패
- `layer3_continuous_e2e_stop_failed`: 지속 E2E 중지 실패
- `layer3_continuous_e2e_session_not_found`: 세션 없음
- `layer3_continuous_e2e_invalid_state`: 상태 불일치

---

## 8. 테스트 전략

### 단위 테스트 (tests/unit/layer3/production-tester.test.ts)

**테스트 케이스**:
1. `start()` — 세션 시작
2. `stop()` — 세션 중지
3. `pause()` — 세션 일시 정지
4. `resume()` — 세션 재개
5. `executeOnce()` — E2E 1회 실행 (성공)
6. `executeOnce()` — E2E 1회 실행 (실패 + Fail-Fast)
7. `getSession()` — 세션 조회
8. `listSessions()` — 세션 목록

**모킹**: IntegrationTester 모킹

---

### 통합 테스트 (tests/module/layer3-production-tester.test.ts)

**테스트 케이스**:
1. 실제 E2E 테스트로 지속 실행 → 성공 확인
2. Fail-Fast 동작 확인 (실패 시 즉시 중단)
3. 타이머 간격 정확성 검증

---

## 9. 사용 예시

```typescript
import { ProductionTester } from './layer3/production-tester.js';
import { IntegrationTester } from './layer2/integration-tester.js';
import { createLogger } from './core/logger.js';

const integrationTester = new IntegrationTester(/* ... */);
const tester = new ProductionTester(integrationTester, createLogger());

// 지속 E2E 시작
const sessionResult = await tester.start({
  projectId: 'proj-1',
  testPath: './tests/e2e/**/*.test.ts',
  intervalMs: 300_000, // 5분
  failFast: true,
});

if (sessionResult.ok) {
  const session = sessionResult.value;
  console.log('지속 E2E 시작:', session.id);

  // ... 문서 생성 작업 병행 ...

  // 상태 확인
  const stateResult = await tester.getSession(session.id);
  if (stateResult.ok) {
    const state = stateResult.value;
    console.log(`실행 횟수: ${state.totalExecutions}`);
    console.log(`성공: ${state.successCount}, 실패: ${state.failureCount}`);
  }

  // 완료 후 중지
  await tester.stop(session.id);
}
```

---

## 10. 구현 우선순위

**Phase 7-1**: 인터페이스 + start, stop 구현
**Phase 7-2**: pause, resume 구현
**Phase 7-3**: executeOnce 구현 (IntegrationTester 연동)
**Phase 7-4**: Fail-Fast 로직 구현
**Phase 7-5**: 단위 테스트 + 통합 테스트

---

## 11. 참고 문서

- `SPEC.md` Section 9.3 — 지속 E2E 검증
- `src/layer3/types.ts` — ContinuousE2EConfig, ContinuousE2EResult
- `src/layer2/integration-tester.ts` — IntegrationTester 인터페이스
