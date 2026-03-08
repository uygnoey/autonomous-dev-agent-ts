/**
 * 산출물 빌더 인터페이스 타입 정의 / Deliverable builder interface type definitions
 *
 * @description
 * KR: DeliverableBuilder가 구현하는 인터페이스 타입.
 * EN: Interface types implemented by DeliverableBuilder.
 */

import type { Result } from 'core/types.js';
import type {
  BusinessDeliverable,
  DeliverableBuildOptions,
  DeliverableMetadata,
} from 'layer3/deliverable-types.js';

/**
 * 산출물 빌더 인터페이스 / Deliverable builder interface
 */
export interface IDeliverableBuilder {
  /**
   * 비즈니스 산출물을 생성한다 / Build a business deliverable
   *
   * @param options - 빌드 옵션 / Build options
   * @returns 생성된 산출물 / Generated deliverable
   */
  build(options: DeliverableBuildOptions): Promise<Result<BusinessDeliverable>>;

  /**
   * 모든 기본 산출물을 생성한다 / Build all default deliverables
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param metadata - 산출물 메타데이터 / Deliverable metadata
   * @param outputDir - 출력 디렉토리 / Output directory
   * @returns 생성된 산출물 목록 / Generated deliverables
   */
  buildAll(
    projectId: string,
    metadata: DeliverableMetadata,
    outputDir: string,
  ): Promise<Result<readonly BusinessDeliverable[]>>;
}
