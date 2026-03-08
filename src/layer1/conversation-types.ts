/**
 * layer1 대화 타입 정의 / Layer 1 conversation type definitions
 *
 * @description
 * KR: 사용자와의 대화 및 layer2 검증 요청/결과에 사용되는 타입.
 * EN: Types for user conversation and layer2 verification requests/results.
 */

// ── 대화 / Conversation ──────────────────────────────────────────

/**
 * Claude API 대화 메시지 / Conversation message for Claude API dialog
 *
 * @description
 * KR: 사용자와 어시스턴트 간 대화 한 턴을 나타낸다.
 * EN: Represents a single turn of dialog between user and assistant.
 */
export interface ConversationMessage {
  /** 메시지 고유 ID / Unique message ID */
  readonly id: string;

  /** 발화자 역할 / Speaker role */
  readonly role: 'user' | 'assistant';

  /** 메시지 내용 / Message content */
  readonly content: string;

  /** 생성 시각 / Creation timestamp */
  readonly timestamp: Date;

  /** 소속 프로젝트 ID / Owning project ID */
  readonly projectId: string;
}

// ── layer2 검증 요청/결과 / Layer2 Verification ─────────────────

/**
 * layer2에서의 검증 요청 / Verification request from layer2
 *
 * @description
 * KR: layer2가 구현 결과를 layer1에 검증 요청할 때 사용.
 * EN: Used when layer2 requests verification of implementation from layer1.
 */
export interface Layer1VerificationRequest {
  /** 대상 기능 ID / Target feature ID */
  readonly featureId: string;

  /** 구현 코드 / Implemented code */
  readonly implementedCode: string;

  /** 테스트 결과 / Test results */
  readonly testResults: string;

  /** 질문 / Question */
  readonly question: string;
}

/**
 * layer1 검증 결과 / Layer1 verification result
 *
 * @description
 * KR: layer1이 구현을 검증한 결과.
 * EN: Result of layer1's verification of an implementation.
 */
export interface Layer1VerificationResult {
  /** 대상 기능 ID / Target feature ID */
  readonly featureId: string;

  /** 통과 여부 / Whether passed */
  readonly passed: boolean;

  /** 피드백 / Feedback */
  readonly feedback: string;

  /** 사용자 입력 필요 여부 / Whether user input is needed */
  readonly needsUserInput: boolean;
}
