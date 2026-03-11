/**
 * Contract 변경 관리 타입 정의 / Contract change management type definitions
 *
 * @description
 * KR: Contract 버전 간 변경 이력을 추적하기 위한 타입.
 *     ContractDiffEntry는 단일 필드 변경을 나타내고,
 *     ContractChangeRecord는 하나의 버전 전환을 기록한다.
 * EN: Types for tracking change history between contract versions.
 *     ContractDiffEntry represents a single field change,
 *     ContractChangeRecord captures one version transition.
 */

// ── ContractDiffEntry ────────────────────────────────────────────

/**
 * Contract 필드 단위 변경 항목 / Single field-level diff entry
 *
 * @description
 * KR: 두 ContractSchema 버전 간 특정 필드의 변경 내용을 기록한다.
 * EN: Records the change in a specific field between two ContractSchema versions.
 *
 * @example
 * const entry: ContractDiffEntry = {
 *   field: 'features',
 *   previousValue: [],
 *   currentValue: [{ id: 'f1', name: 'Login' }],
 *   changeType: 'modified',
 * };
 */
export interface ContractDiffEntry {
  /** 변경된 최상위 필드 이름 / Top-level field name that changed */
  readonly field: string;

  /** 이전 값 (없으면 undefined) / Previous value (undefined if added) */
  readonly previousValue: unknown;

  /** 현재 값 (없으면 undefined) / Current value (undefined if removed) */
  readonly currentValue: unknown;

  /** 변경 유형 / Change type */
  readonly changeType: 'added' | 'removed' | 'modified';
}

// ── ContractChangeRecord ─────────────────────────────────────────

/**
 * Contract 버전 전환 이력 레코드 / Version transition change record
 *
 * @description
 * KR: 한 번의 Contract 변경(이전 버전 → 현재 버전)을 완전히 기록하는 불변 구조.
 *     affectedFeatureIds가 비어있으면 ['*']으로 전체 영향을 표시한다.
 * EN: Immutable record fully capturing one Contract change (prev→next version).
 *     When affectedFeatureIds is empty, use ['*'] to signal global impact.
 *
 * @example
 * const record: ContractChangeRecord = {
 *   version: 2,
 *   previousVersion: 1,
 *   changedAt: new Date(),
 *   reason: '기능 추가 요청',
 *   changedBy: 'user',
 *   diffs: [...],
 *   affectedFeatureIds: ['feature-1'],
 *   regressionTestRequired: true,
 * };
 */
export interface ContractChangeRecord {
  /** 새 버전 번호 / New version number */
  readonly version: number;

  /** 이전 버전 번호 / Previous version number */
  readonly previousVersion: number;

  /** 변경 시각 / Change timestamp */
  readonly changedAt: Date;

  /** 변경 사유 / Reason for the change */
  readonly reason: string;

  /** 변경 주체 / Who triggered the change */
  readonly changedBy: 'user' | 'system';

  /** 필드 단위 변경 목록 / Field-level diff list */
  readonly diffs: readonly ContractDiffEntry[];

  /** 영향받는 기능 ID 목록 (전체 영향 시 ['*']) / Affected feature IDs (['*'] for global) */
  readonly affectedFeatureIds: readonly string[];

  /** 회귀 테스트 필요 여부 / Whether regression tests are required */
  readonly regressionTestRequired: boolean;
}
