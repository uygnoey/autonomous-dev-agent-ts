/**
 * adev 프로젝트 전역 공유 타입 / Global shared types
 *
 * @description
 * Result 패턴, Phase/AgentName 리터럴, LanceDB 레코드 인터페이스,
 * VectorRepository 인터페이스를 정의한다.
 */

import type { AdevError } from './errors.js';

// ── Result 패턴 ──────────────────────────────────────────────

/**
 * 성공/실패를 명시적으로 표현하는 Result 타입 / Discriminated union for success/failure
 *
 * @example
 * function divide(a: number, b: number): Result<number> {
 *   if (b === 0) return err(new AdevError('div_zero', '0으로 나눌 수 없음'));
 *   return ok(a / b);
 * }
 */
export type Result<T, E = AdevError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/**
 * 성공 Result 생성 헬퍼 / Create a success Result
 *
 * @example
 * return ok(42);
 */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/**
 * 실패 Result 생성 헬퍼 / Create a failure Result
 *
 * @example
 * return err(new ConfigError('config_missing_key', 'API key 없음'));
 */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// ── 리터럴 타입 ─────────────────────────────────────────────

/** 4-Phase FSM 상태 */
export type Phase = 'DESIGN' | 'CODE' | 'TEST' | 'VERIFY';

/** 7개 고정 에이전트 이름 */
export type AgentName = 'architect' | 'qa' | 'coder' | 'tester' | 'qc' | 'reviewer' | 'documenter';

/** 기능 진행 상태 */
export type FeatureStatus =
  | 'pending'
  | 'designing'
  | 'coding'
  | 'testing'
  | 'verifying'
  | 'complete'
  | 'failed';

/** 메모리 레코드 유형 */
export type MemoryType = 'conversation' | 'decision' | 'feedback' | 'error';

// ── LanceDB 레코드 인터페이스 ────────────────────────────────

/** memory 테이블 메타데이터 */
export interface MemoryMetadata {
  readonly phase: Phase;
  readonly featureId: string;
  readonly agentName: string;
  readonly timestamp: Date;
}

/** memory 테이블 레코드 — 대화 이력, 결정, 피드백, 에러 */
export interface MemoryRecord {
  readonly id: string;
  readonly projectId: string;
  readonly type: MemoryType;
  readonly content: string;
  readonly embedding: Float32Array;
  readonly metadata: MemoryMetadata;
}

/** code_index 테이블 메타데이터 */
export interface CodeMetadata {
  readonly language: string;
  readonly module: string;
  readonly functionName: string;
  readonly lastModified: Date;
  readonly modifiedBy: string;
}

/** code_index 테이블 레코드 — 코드베이스 청크 벡터 인덱스 */
export interface CodeRecord {
  readonly id: string;
  readonly projectId: string;
  readonly filePath: string;
  readonly chunk: string;
  readonly embedding: Float32Array;
  readonly metadata: CodeMetadata;
}

/** design_decisions 테이블 레코드 — 설계 결정 이력 */
export interface DesignDecision {
  readonly id: string;
  readonly projectId: string;
  readonly featureId: string;
  readonly decision: string;
  readonly rationale: string;
  readonly alternatives: readonly string[];
  readonly decidedBy: readonly string[];
  readonly embedding: Float32Array;
  readonly timestamp: Date;
}

/** failures 테이블 레코드 — 실패 이력 + 해결책 */
export interface FailureRecord {
  readonly id: string;
  readonly projectId: string;
  readonly featureId: string;
  readonly phase: Phase;
  readonly failureType: string;
  readonly rootCause: string;
  readonly resolution: string;
  readonly embedding: Float32Array;
  readonly timestamp: Date;
}

// ── Repository 인터페이스 ────────────────────────────────────

/**
 * LanceDB 벡터 Repository 인터페이스 / Generic vector repository
 *
 * @description
 * LanceDB 테이블에 대한 CRUD + 벡터 검색 추상화.
 * 구현체: MemoryRepository (core), CodeRepository 등 (rag 모듈).
 */
export interface VectorRepository<T> {
  /** 레코드 삽입 */
  insert(record: T): Promise<Result<void>>;

  /** 벡터 유사도 검색 */
  search(
    query: Float32Array,
    limit: number,
    filter?: Record<string, unknown>,
  ): Promise<Result<T[]>>;

  /** ID로 단건 조회 */
  getById(id: string): Promise<Result<T | null>>;

  /** 부분 업데이트 */
  update(id: string, partial: Partial<T>): Promise<Result<void>>;

  /** 삭제 */
  delete(id: string): Promise<Result<void>>;
}
