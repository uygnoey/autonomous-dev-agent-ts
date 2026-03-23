/**
 * layer1 대화 타입 정의 / Layer 1 conversation type definitions
 *
 * @description
 * KR: 사용자와의 대화 및 layer2 검증 요청/결과에 사용되는 타입.
 * EN: Types for user conversation and layer2 verification requests/results.
 */

import type { HandoffPackage } from 'layer1/contract-types.js';

// ── 대화 Phase FSM / Conversation Phase FSM ─────────────────────

/**
 * 1계층 대화 흐름 FSM 상태 / Layer 1 conversation flow FSM states
 *
 * @description
 * KR: 아이디어 도출부터 Contract 생성까지의 대화 Phase를 정의한다.
 *     유저가 "확정"이라고 명시적으로 말하기 전까지 개발 시작 언급 절대 안 함.
 * EN: Defines conversation phases from idea generation to contract creation.
 *     Development must never be mentioned until user explicitly confirms.
 */
export type ConversationPhase =
  | 'IDEA'        // 아이디어 도출 / Idea generation
  | 'PLANNING'    // 기획 / Planning
  | 'DESIGN'      // 설계 / Design
  | 'UI_DESIGN'   // 디자인 / UI Design
  | 'STACK'       // 기술 스택 선정 / Tech stack selection
  | 'DOCS'        // 문서 목록 확정 / Document list finalization
  | 'TEST_TYPES'  // 테스트 유형 정의서 / Test type definition
  | 'CONFIRMED'   // 유저 확정 / User confirmed
  | 'CONTRACT';   // Contract 생성 중 / Contract generation

/**
 * Phase 전환 맵 / Phase transition map
 *
 * @description
 * KR: 각 Phase에서 다음 Phase로의 유효 전환을 정의한다.
 * EN: Defines valid transitions from each phase to the next.
 */
export const PHASE_TRANSITIONS: Readonly<Record<ConversationPhase, ConversationPhase | null>> = {
  IDEA: 'PLANNING',
  PLANNING: 'DESIGN',
  DESIGN: 'UI_DESIGN',
  UI_DESIGN: 'STACK',
  STACK: 'DOCS',
  DOCS: 'TEST_TYPES',
  TEST_TYPES: 'CONFIRMED',
  CONFIRMED: 'CONTRACT',
  CONTRACT: null, // 최종 상태 / Terminal state
};

/**
 * 유저 확정 키워드 목록 / User confirmation keywords
 *
 * @description
 * KR: 유저가 현재 Phase를 승인할 때 사용하는 키워드.
 * EN: Keywords used by the user to approve the current phase.
 */
export const CONFIRMATION_KEYWORDS: readonly string[] = [
  '확정',
  '확인',
  '진행',
  '좋아',
  '괜찮아',
  '승인',
  '다음',
  'confirm',
  'approved',
  'next',
  'ok',
  'lgtm',
];

/**
 * Phase별 시스템 프롬프트 / System prompts per phase
 *
 * @description
 * KR: 각 Phase에서 Claude에게 주입할 시스템 프롬프트를 정의한다.
 * EN: Defines system prompts to inject into Claude for each phase.
 */
export const PHASE_SYSTEM_PROMPTS: Readonly<Record<ConversationPhase, string>> = {
  IDEA: [
    '당신은 아이디어를 구체화하고 추가 방향을 무한 제안하는 창의적 파트너입니다.',
    '사용자의 아이디어를 발전시키고, 빠진 관점을 질문하고, 새로운 방향을 적극적으로 제안하세요.',
    '절대 개발, 구현, 코딩, 기술 스택 등 개발 관련 언급을 하지 마세요.',
    '아이디어의 가치, 대상 사용자, 차별점, 시장성에 집중하세요.',
  ].join('\n'),

  PLANNING: [
    '당신은 기획 전문가입니다. 아이디어를 구조화된 기획으로 변환하세요.',
    'B2B/B2C 구분, 핵심 기능 정의, 사용자 시나리오, 비즈니스 요구사항을 파악하세요.',
    '빠진 요구사항을 질문하고, 우선순위를 제안하세요.',
    '아직 기술적 구현 방법은 언급하지 마세요. 무엇을 만들지에 집중하세요.',
  ].join('\n'),

  DESIGN: [
    '당신은 소프트웨어 설계 전문가입니다.',
    '기획을 기반으로 아키텍처, 모듈 분해, 데이터 흐름, API 설계를 제안하세요.',
    '설계의 장단점과 대안을 함께 제시하세요.',
    '사용자의 피드백을 반영하여 설계를 개선하세요.',
  ].join('\n'),

  UI_DESIGN: [
    '당신은 UI/UX 디자인 전문가입니다.',
    '사용자 경험을 중심으로 화면 구성, 네비게이션, 인터랙션을 설계하세요.',
    '와이어프레임 수준의 화면 구조와 사용자 플로우를 제안하세요.',
    '디자인 시스템, 컴포넌트 구조, 반응형 설계를 고려하세요.',
  ].join('\n'),

  STACK: [
    '당신은 기술 스택 선정 전문가입니다.',
    '설계와 디자인을 기반으로 최적의 기술 스택을 추천하세요.',
    '각 기술 선택의 이유, 장단점, 대안을 함께 제시하세요.',
    '팀 규모, 학습 곡선, 생태계, 성능, 유지보수성을 고려하세요.',
  ].join('\n'),

  DOCS: [
    '당신은 문서화 전문가입니다.',
    '프로젝트에 필요한 문서 목록을 정의하세요.',
    'README, API 문서, 아키텍처 문서, 배포 가이드 등 필요한 문서를 열거하세요.',
    '각 문서의 목적, 대상 독자, 포함 내용을 명시하세요.',
  ].join('\n'),

  TEST_TYPES: [
    '당신은 테스트 전략 전문가입니다.',
    '각 기능별 테스트 카테고리, 테스트 비율, 샘플 테스트를 정의하세요.',
    '단위/모듈/E2E 테스트 비율, 경계값 테스트 전략을 포함하세요.',
    '테스트 규칙과 품질 기준을 명확히 하세요.',
  ].join('\n'),

  CONFIRMED: [
    '사용자가 모든 Phase를 확정했습니다.',
    '지금부터 Contract를 생성합니다. 최종 확인 사항을 정리하세요.',
  ].join('\n'),

  CONTRACT: [
    'Contract 생성 중입니다.',
    '기획, 설계, 디자인, 기술 스택, 문서 목록, 테스트 정의를 통합하여',
    '구조화된 Contract와 HandoffPackage를 생성하세요.',
  ].join('\n'),
};

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

  /**
   * Contract 스냅샷 (선택) — AI 검증 시 추가 컨텍스트로 활용
   * Contract snapshot (optional) — used as extra context during AI verification
   *
   * WHY: layer1/types.js가 이 파일을 re-export하여 순환 참조가 생기므로
   *      HandoffPackage를 정의하는 contract-types.js에서 직접 import한다.
   */
  readonly contractSnapshot?: HandoffPackage;
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
