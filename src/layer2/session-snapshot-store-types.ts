/**
 * 세션 스냅샷 저장소 타입 및 변환 함수 / Session snapshot store flat record types and converters
 *
 * @description
 * KR: LanceDB에 저장되는 flat 레코드 형식 및 PersistableSessionSnapshot 변환 함수.
 * EN: Flat record format for LanceDB storage and PersistableSessionSnapshot conversion functions.
 */

import type { AgentName, Phase } from 'core/types.js';
import type { SessionState } from 'layer2/session-types.js';

// ── PersistableSessionSnapshot ───────────────────────────────────

/**
 * 영속화 가능한 세션 스냅샷 — 대화 이력 포함 / Persistable session snapshot with conversation history
 *
 * @description
 * KR: 기존 SessionSnapshot에 대화 이력 필드를 추가한 인터페이스.
 *     토큰 리셋 후 복원 시 대화 컨텍스트를 재구성하는 데 사용된다.
 * EN: SessionSnapshot extended with conversation history for token reset recovery.
 */
export interface PersistableSessionSnapshot {
  /** 세션 고유 ID / Session unique ID */
  readonly sessionId: string;
  /** 에이전트 이름 / Agent name */
  readonly agentName: AgentName;
  /** 프로젝트 ID / Project ID */
  readonly projectId: string;
  /** 기능 ID / Feature ID */
  readonly featureId: string;
  /** 현재 Phase / Current phase */
  readonly phase: Phase;
  /** 세션 상태 / Session state */
  readonly state: SessionState;
  /** 생성 시각 / Created at */
  readonly createdAt: Date;
  /** 최종 활동 시각 / Last activity */
  readonly lastActivity: Date;
  /** 추가 메타데이터 / Additional metadata */
  readonly metadata: Readonly<Record<string, unknown>>;
  /** 토큰 리셋 복원용 대화 이력 (직렬화 전 원본) / Conversation history for token reset recovery */
  readonly conversationHistory?: readonly unknown[];
  /** 진행률 (0~100) / Progress percentage (0~100) */
  readonly progressPercent?: number;
  /** 미완료 항목 목록 / Pending items list */
  readonly pendingItems?: readonly string[];
  /** 마지막 작업 설명 / Last work description */
  readonly lastWorkDescription?: string;
}

// ── FlatSessionSnapshot ──────────────────────────────────────────

/**
 * LanceDB에 저장되는 flat 레코드 형식 / Flat record format stored in LanceDB
 *
 * @description
 * KR: 모든 필드가 스칼라 타입이어야 LanceDB에 저장 가능하므로
 *     Date와 배열/객체는 JSON 문자열로 직렬화한다.
 * EN: All fields must be scalar for LanceDB storage;
 *     Date and array/object fields are JSON-serialized.
 */
export interface FlatSessionSnapshot {
  /** 세션 고유 ID / Session unique ID */
  sessionId: string;
  /** 에이전트 이름 / Agent name */
  agentName: string;
  /** 프로젝트 ID / Project ID */
  projectId: string;
  /** 기능 ID / Feature ID */
  featureId: string;
  /** 현재 Phase / Current phase */
  phase: string;
  /** 세션 상태 / Session state */
  state: string;
  /** 생성 시각 ISO8601 / Created at ISO8601 */
  createdAt: string;
  /** 최종 활동 시각 ISO8601 / Last activity ISO8601 */
  lastActivity: string;
  /** 대화 이력 JSON 직렬화 / Conversation history JSON serialized */
  conversationHistory: string;
  /** 메타데이터 JSON 직렬화 / Metadata JSON serialized */
  metadata: string;
  /** 진행률 (0~100) / Progress percentage (0~100) */
  progressPercent: number;
  /** 미완료 항목 JSON 직렬화 / Pending items JSON serialized */
  pendingItems: string;
  /** 마지막 작업 설명 / Last work description */
  lastWorkDescription: string;
  /** 더미 벡터 / Dummy embedding vector */
  vector: number[];
}

// ── 변환 함수 / Conversion functions ────────────────────────────

/**
 * PersistableSessionSnapshot → flat LanceDB 레코드 변환
 * Convert PersistableSessionSnapshot to flat LanceDB record
 *
 * @param s - 변환할 PersistableSessionSnapshot / PersistableSessionSnapshot to convert
 * @returns flat LanceDB 레코드 / Flat LanceDB record
 *
 * @example
 * const flat = toFlatSnapshot(snapshot);
 */
export function toFlatSnapshot(s: PersistableSessionSnapshot): FlatSessionSnapshot {
  return {
    sessionId: s.sessionId,
    agentName: s.agentName,
    projectId: s.projectId,
    featureId: s.featureId,
    phase: s.phase,
    state: s.state,
    createdAt: s.createdAt.toISOString(),
    lastActivity: s.lastActivity.toISOString(),
    conversationHistory: JSON.stringify(s.conversationHistory ?? []),
    metadata: JSON.stringify(s.metadata),
    progressPercent: s.progressPercent ?? 0,
    pendingItems: JSON.stringify(s.pendingItems ?? []),
    lastWorkDescription: s.lastWorkDescription ?? '',
    // WHY: 벡터 검색 미사용 — dummy 벡터로 LanceDB 스키마 요구사항 충족
    vector: Array(8).fill(0) as number[],
  };
}

/**
 * flat LanceDB 레코드 → PersistableSessionSnapshot 변환
 * Convert flat LanceDB record to PersistableSessionSnapshot
 *
 * @param f - 변환할 flat 레코드 / Flat record to convert
 * @returns PersistableSessionSnapshot
 *
 * @example
 * const snapshot = fromFlatSnapshot(flatRow);
 */
export function fromFlatSnapshot(f: FlatSessionSnapshot): PersistableSessionSnapshot {
  return {
    sessionId: f.sessionId,
    agentName: f.agentName as AgentName,
    projectId: f.projectId,
    featureId: f.featureId,
    phase: f.phase as Phase,
    state: f.state as SessionState,
    createdAt: new Date(f.createdAt),
    lastActivity: new Date(f.lastActivity),
    conversationHistory: JSON.parse(f.conversationHistory) as readonly unknown[],
    metadata: JSON.parse(f.metadata) as Readonly<Record<string, unknown>>,
    // WHY: H-002 — 0이 falsy이므로 || 대신 ?? 사용하여 progressPercent 0% 손실 방지
    progressPercent: f.progressPercent ?? undefined,
    pendingItems:
      f.pendingItems && f.pendingItems !== '[]'
        ? (JSON.parse(f.pendingItems) as readonly string[])
        : undefined,
    lastWorkDescription: f.lastWorkDescription || undefined,
  };
}
