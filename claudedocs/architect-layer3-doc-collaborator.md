# Layer3 설계: DocCollaborator

## 1. 개요

**목적**: 1계층(뼈대) + 2계층(상세) 협업 문서 생성

**위치**: `src/layer3/doc-collaborator.ts`

**의존성**: layer3 → core, layer1, layer2

**핵심 책임**:
- 1계층 Claude Opus가 문서 구조/방향/톤 결정 → 뼈대 생성
- 2계층 documenter가 구현 상세 채워넣기
- 1계층이 최종 검토 + 다듬기
- adev가 1↔2 계층 간 중계
- 프로젝트 문서 + 비즈니스 산출물 모두 지원

**워크플로우**:
```
1계층 (기획 의도) → 뼈대 생성
  ↓ (adev 중계)
2계층 documenter (코드/테스트) → 상세 작성
  ↓ (adev 중계)
1계층 → 최종 검토 + 다듬기
  ↓
완성
```

---

## 2. 인터페이스 정의

```typescript
/**
 * 협업 문서 생성 단계 / Collaborative document generation phase
 */
export type CollabPhase = 'structure' | 'detail' | 'review' | 'complete';

/**
 * 협업 문서 상태 / Collaborative document state
 */
export interface CollabDocState {
  /** 문서 ID / Document ID */
  readonly id: string;
  /** 프로젝트 ID / Project ID */
  readonly projectId: string;
  /** 문서 유형 / Document type */
  readonly type: ProjectDocumentType | BusinessDeliverableType;
  /** 현재 단계 / Current phase */
  readonly phase: CollabPhase;
  /** 1계층 뼈대 / Layer 1 structure */
  readonly structure?: string;
  /** 2계층 상세 / Layer 2 details */
  readonly details?: string;
  /** 최종 내용 / Final content */
  readonly finalContent?: string;
  /** 생성 시각 / Created at */
  readonly createdAt: Date;
  /** 최종 수정 시각 / Updated at */
  readonly updatedAt: Date;
}

/**
 * 1계층 요청 / Layer 1 request
 */
export interface Layer1Request {
  /** 요청 유형 / Request type */
  readonly type: 'create-structure' | 'review-and-refine';
  /** 문서 유형 / Document type */
  readonly docType: ProjectDocumentType | BusinessDeliverableType;
  /** 프로젝트 컨텍스트 / Project context */
  readonly context: string;
  /** 2계층 상세 (review 시) / Layer 2 details (for review) */
  readonly layer2Details?: string;
}

/**
 * 1계층 응답 / Layer 1 response
 */
export interface Layer1Response {
  /** 응답 유형 / Response type */
  readonly type: 'structure' | 'refined';
  /** 생성된 내용 / Generated content */
  readonly content: string;
  /** 추가 가이드 / Additional guidance */
  readonly guidance?: string;
}

/**
 * 2계층 요청 / Layer 2 request
 */
export interface Layer2Request {
  /** 문서 유형 / Document type */
  readonly docType: ProjectDocumentType | BusinessDeliverableType;
  /** 1계층 뼈대 / Layer 1 structure */
  readonly structure: string;
  /** 조각 문서 목록 / Fragment documents */
  readonly fragments: readonly DocumentFragment[];
}

/**
 * 2계층 응답 / Layer 2 response
 */
export interface Layer2Response {
  /** 상세 내용 / Detailed content */
  readonly content: string;
  /** 채워진 섹션 목록 / Filled sections */
  readonly filledSections: readonly string[];
}

/**
 * 문서 협업기 인터페이스 / Document collaborator interface
 */
export interface IDocCollaborator {
  /**
   * 협업 문서 생성을 시작한다 / Start collaborative document generation
   *
   * @param options - 협업 문서 옵션 / Collaborative document options
   * @returns 협업 문서 상태 / Collaborative document state
   */
  start(options: CollaborativeDocOptions): Promise<Result<CollabDocState>>;

  /**
   * 1계층에 뼈대 생성을 요청한다 / Request Layer 1 to create structure
   *
   * @param request - 1계층 요청 / Layer 1 request
   * @returns 1계층 응답 / Layer 1 response
   */
  requestLayer1(request: Layer1Request): Promise<Result<Layer1Response>>;

  /**
   * 2계층에 상세 작성을 요청한다 / Request Layer 2 to fill in details
   *
   * @param request - 2계층 요청 / Layer 2 request
   * @returns 2계층 응답 / Layer 2 response
   */
  requestLayer2(request: Layer2Request): Promise<Result<Layer2Response>>;

  /**
   * 협업 문서 생성을 완료한다 / Complete collaborative document generation
   *
   * @param docId - 문서 ID / Document ID
   * @returns 완성된 문서 / Completed document
   */
  complete(docId: string): Promise<Result<CollaborativeDocResult>>;

  /**
   * 협업 문서 상태를 조회한다 / Get collaborative document state
   *
   * @param docId - 문서 ID / Document ID
   * @returns 협업 문서 상태 / Collaborative document state
   */
  getState(docId: string): Promise<Result<CollabDocState>>;
}
```

---

## 3. 구현 클래스

```typescript
/**
 * DocCollaborator 구현 클래스 / DocCollaborator implementation
 */
export class DocCollaborator implements IDocCollaborator {
  private readonly logger: Logger;
  private readonly layer1Client: Layer1Client; // 1계층 API 클라이언트
  private readonly documenterSpawner: AgentSpawner; // 2계층 documenter 스포너
  private readonly stateStore: Map<string, CollabDocState>;

  constructor(
    layer1Client: Layer1Client,
    documenterSpawner: AgentSpawner,
    logger: Logger,
  ) {
    this.layer1Client = layer1Client;
    this.documenterSpawner = documenterSpawner;
    this.logger = logger.child({ module: 'doc-collaborator' });
    this.stateStore = new Map();
  }

  // 메서드 구현은 구현 단계에서 작성
}
```

---

## 4. 주요 메서드 시그니처

### 4.1 start()

**책임**: 협업 문서 생성 워크플로우 시작

**로직**:
1. `CollabDocState` 초기화 (phase: 'structure')
2. `stateStore`에 저장
3. 로그 기록
4. 상태 반환

**에러 처리**: 초기화 실패 → `Layer3Error`

---

### 4.2 requestLayer1()

**책임**: 1계층에 문서 뼈대 생성 또는 최종 검토 요청

**로직**:
1. `request.type === 'create-structure'`:
   - 1계층 Claude Opus에 프롬프트 전달
   - 프롬프트: "다음 프로젝트의 {docType} 문서 뼈대를 작성해주세요. 구조, 방향, 톤을 정의하고, 각 섹션의 제목과 간단한 설명만 작성하세요. 컨텍스트: {context}"
   - 1계층 응답 수신 (구조화된 뼈대)
2. `request.type === 'review-and-refine'`:
   - 1계층에 2계층 상세 전달
   - 프롬프트: "다음 문서를 최종 검토하고 다듬어주세요. 2계층이 작성한 상세 내용: {layer2Details}"
   - 1계층 응답 수신 (다듬어진 최종 내용)
3. `Layer1Response` 반환

**에러 처리**: 1계층 호출 실패 → `Layer3Error`

---

### 4.3 requestLayer2()

**책임**: 2계층 documenter에 상세 작성 요청

**로직**:
1. documenter 에이전트 스폰
2. 에이전트 프롬프트: "다음 문서 뼈대에 구현 상세를 채워넣으세요. 코드 예제, API 명세, 테스트 결과 등 기술적 내용을 작성하세요. 뼈대: {structure}, 조각 문서: {fragments}"
3. 에이전트 실행 완료 대기
4. 생성된 상세 내용 수집
5. `Layer2Response` 반환

**에러 처리**: 에이전트 실행 실패 → `Layer3Error`

---

### 4.4 complete()

**책임**: 협업 문서 생성 완료 및 저장

**로직**:
1. `stateStore.get(docId)` 조회
2. `state.phase === 'review'` 확인
3. `state.finalContent`를 `options.outputPath`에 저장
4. `CollaborativeDocResult` 생성
5. `state.phase = 'complete'` 업데이트
6. 결과 반환

**에러 처리**: 상태 없음 → `Layer3Error`, 파일 저장 실패 → `Layer3Error`

---

### 4.5 getState()

**책임**: 협업 문서 상태 조회

**로직**:
1. `stateStore.get(docId)` 조회
2. 없으면 에러
3. 상태 반환

**에러 처리**: 상태 없음 → `Layer3Error`

---

## 5. 워크플로우 예시

```typescript
// 1. 시작
const state = await collaborator.start({
  projectId: 'proj-1',
  type: 'user-manual',
  layer1Structure: '',
  layer2Fragments: fragments,
  outputPath: './docs/USER_MANUAL.md',
});

// 2. 1계층에 뼈대 요청
const layer1Res = await collaborator.requestLayer1({
  type: 'create-structure',
  docType: 'user-manual',
  context: '유저 인증 기능 포함',
});

// 3. 2계층에 상세 요청
const layer2Res = await collaborator.requestLayer2({
  docType: 'user-manual',
  structure: layer1Res.value.content,
  fragments,
});

// 4. 1계층에 최종 검토 요청
const refinedRes = await collaborator.requestLayer1({
  type: 'review-and-refine',
  docType: 'user-manual',
  context: '',
  layer2Details: layer2Res.value.content,
});

// 5. 완료
const result = await collaborator.complete(state.value.id);
console.log('문서 생성 완료:', result.value.outputPath);
```

---

## 6. 의존성 그래프

```
DocCollaborator
├─→ Logger (core/logger.ts)
├─→ Layer1Client (layer1/client.ts) — 1계층 API 호출
├─→ AgentSpawner (layer2/agent-spawner.ts) — documenter 스폰
└─→ Map<string, CollabDocState> (상태 저장소)
```

---

## 7. 에러 타입 정의

**에러 코드** (Layer3Error):
- `layer3_collab_init_failed`: 협업 문서 초기화 실패
- `layer3_layer1_request_failed`: 1계층 요청 실패
- `layer3_layer2_request_failed`: 2계층 요청 실패
- `layer3_collab_state_not_found`: 협업 문서 상태 없음
- `layer3_collab_complete_failed`: 협업 문서 완료 실패

---

## 8. 테스트 전략

### 단위 테스트 (tests/unit/layer3/doc-collaborator.test.ts)

**테스트 케이스**:
1. `start()` — 협업 문서 초기화
2. `requestLayer1()` — 뼈대 생성 요청
3. `requestLayer1()` — 최종 검토 요청
4. `requestLayer2()` — 상세 작성 요청
5. `complete()` — 문서 완료
6. `getState()` — 상태 조회

**모킹**: Layer1Client, AgentSpawner 모킹

---

### 통합 테스트 (tests/module/layer3-doc-collaborator.test.ts)

**테스트 케이스**:
1. 전체 워크플로우 (start → layer1 → layer2 → review → complete)
2. 실제 1계층 호출 + documenter 스폰 → 문서 생성 검증

---

## 9. 구현 우선순위

**Phase 7-1**: 인터페이스 + start, getState 구현
**Phase 7-2**: requestLayer1 구현 (1계층 호출)
**Phase 7-3**: requestLayer2 구현 (documenter 스폰)
**Phase 7-4**: complete 구현
**Phase 7-5**: 단위 테스트 + 통합 테스트

---

## 10. 참고 문서

- `SPEC.md` Section 9.2 — 문서 생성 협업 방법
- `src/layer3/types.ts` — CollaborativeDocOptions, CollaborativeDocResult
- `src/layer1/client.ts` — 1계층 API 클라이언트 (별도 구현 필요)
- `src/layer2/agent-spawner.ts` — AgentSpawner 인터페이스
