/**
 * start 명령 타입 정의 / Start command type definitions
 *
 * @description
 * KR: start 명령에서 사용하는 인터페이스와 상수 정의
 * EN: Interface and constant definitions used in the start command
 */

import type { AuthProvider } from '../../auth/types.js';
import type { ClaudeApi } from '../../layer1/claude-api.js';
import type { ContractBuilder } from '../../layer1/contract-builder.js';
import type { ContractVerifier } from '../../layer1/contract-verifier.js';
import type { ConversationFsm } from '../../layer1/conversation-fsm.js';
import type { ConversationManager } from '../../layer1/conversation.js';
import type { Designer } from '../../layer1/designer.js';
import type { Planner } from '../../layer1/planner.js';
import type { SpecBuilder } from '../../layer1/spec-builder.js';
import type { TestTypeDesigner } from '../../layer1/test-type-designer.js';
import type { ConversationMessage } from '../../layer1/types.js';
import type { GlobalCliOptions, ProjectInfo } from '../types.js';

// ── 상수 / Constants ────────────────────────────────────────────

/** Layer1 시스템 프롬프트 / Layer1 system prompt */
export const LAYER1_SYSTEM_PROMPT = `당신은 프로젝트 기획 및 설계 전문가입니다.

사용자와 대화를 통해 다음을 수행하세요:
1. 프로젝트 요구사항 파악
2. 기능 명세 작성
3. 아키텍처 설계
4. Contract 스키마 생성

대화가 완료되면 사용자가 "확정" 또는 "완료"를 입력할 때 Contract를 생성하세요.

한국어로 명확하고 구조화된 응답을 제공하세요.`;

/** adev 현재 버전 / Current adev version */
export const ADEV_VERSION = '0.0.1';

/** Layer1 대화 기본 최대 토큰 수 / Default max tokens for Layer1 conversation */
export const LAYER1_MAX_TOKENS = 4096;

/** Layer1 대화 기본 온도 / Default temperature for Layer1 conversation */
export const LAYER1_TEMPERATURE = 0.7;

// ── 인터페이스 / Interfaces ─────────────────────────────────────

/**
 * start 명령 옵션 / Start command options
 */
export interface StartOptions extends GlobalCliOptions {
  /** 프로젝트 ID / Project ID */
  readonly projectId?: string;
  /** 기능 설명 / Feature description */
  readonly feature?: string;
  /** 프로젝트 경로 / Project path */
  readonly projectPath?: string;
}

/**
 * Layer1 세션 상태 / Layer1 session state
 */
export interface Layer1SessionState {
  /** 프로젝트 정보 / Project info */
  readonly projectInfo: ProjectInfo;
  /** 인증 공급자 / Auth provider */
  readonly authProvider: AuthProvider;
  /** Claude API 클라이언트 / Claude API client */
  readonly claudeApi: ClaudeApi;
  /** 대화 관리자 / Conversation manager */
  readonly conversationManager: ConversationManager;
  /** 대화 Phase FSM / Conversation phase FSM */
  readonly conversationFsm: ConversationFsm;
  /** Contract 빌더 / Contract builder */
  readonly contractBuilder: ContractBuilder;
  /** Contract 검증기 / Contract verifier */
  readonly contractVerifier: ContractVerifier;
  /** 기획자 / Planner */
  readonly planner: Planner;
  /** 설계자 / Designer */
  readonly designer: Designer;
  /** 스펙 빌더 / Spec builder */
  readonly specBuilder: SpecBuilder;
  /** 테스트 타입 설계자 / Test type designer */
  readonly testTypeDesigner: TestTypeDesigner;
  /** 대화 이력 / Conversation history */
  readonly messages: ConversationMessage[];
}
