/**
 * Layer1 파이프라인 / Layer1 pipeline
 *
 * @description
 * KR: Contract 생성 파이프라인 (Planner → Designer → SpecBuilder → TestTypeDesigner → ContractBuilder)
 *     및 AgentMd 생성, Layer2 실행 로직.
 * EN: Contract generation pipeline and Layer2 execution logic.
 */

import { resolve } from 'node:path';
import { AdevError } from '../../core/errors.js';
import type { Logger } from '../../core/logger.js';
import { err, ok } from '../../core/types.js';
import type { Result } from '../../core/types.js';
import type { HandoffPackage } from '../../layer1/types.js';
import type { ChatUi } from '../tui/chat.js';
import type { Layer1SessionState } from './start-types.js';

/**
 * Contract 생성 파이프라인 / Generate Contract via Layer1 pipeline
 *
 * @description
 * KR: Planner → Designer → SpecBuilder → TestTypeDesigner → ContractBuilder 파이프라인으로
 *     Contract와 HandoffPackage를 생성한다.
 * EN: Generates Contract and HandoffPackage via the full Layer1 pipeline.
 *
 * @param session - Layer1 세션 상태 / Layer1 session state
 * @param chat - TUI 채팅 인터페이스 / TUI chat interface
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns 성공 시 ok(HandoffPackage), 실패 시 err(AdevError)
 */
export async function generateContract(
  session: Layer1SessionState,
  chat: ChatUi,
  logger: Logger,
): Promise<Result<HandoffPackage, AdevError>> {
  try {
    chat.startSpinner('기획 문서 분석 중...');

    // 1. Planner: 대화에서 기획 문서 생성
    const planResult = session.planner.createPlan(session.projectInfo.id, session.messages);
    if (!planResult.ok) {
      chat.failSpinner('기획 문서 생성 실패');
      return err(
        new AdevError(
          'cli_start_contract_generation_failed',
          `기획 문서 생성 실패 / Plan creation failed: ${planResult.error.message}`,
          planResult.error,
        ),
      );
    }

    // 2. Planner: 기능 추출
    const featuresResult = session.planner.extractFeatures(planResult.value);
    if (!featuresResult.ok) {
      chat.failSpinner('기능 추출 실패');
      return err(
        new AdevError(
          'cli_start_contract_generation_failed',
          `기능 추출 실패 / Feature extraction failed: ${featuresResult.error.message}`,
          featuresResult.error,
        ),
      );
    }

    chat.succeedSpinner('기획 문서 완성');
    chat.startSpinner('설계 문서 생성 중...');

    // 3. Designer: 설계 문서 생성
    const designResult = session.designer.createDesign(
      session.projectInfo.id,
      planResult.value,
      featuresResult.value,
    );
    if (!designResult.ok) {
      chat.failSpinner('설계 문서 생성 실패');
      return err(
        new AdevError(
          'cli_start_contract_generation_failed',
          `설계 문서 생성 실패 / Design creation failed: ${designResult.error.message}`,
          designResult.error,
        ),
      );
    }

    chat.succeedSpinner('설계 문서 완성');
    chat.startSpinner('테스트 정의 생성 중...');

    // 4. TestTypeDesigner: 테스트 케이스 유형 정의서 생성
    const testDefsResult = session.testTypeDesigner.createDefinitions(featuresResult.value);
    if (!testDefsResult.ok) {
      chat.failSpinner('테스트 정의 생성 실패');
      return err(
        new AdevError(
          'cli_start_contract_generation_failed',
          `테스트 정의 생성 실패 / Test definition creation failed: ${testDefsResult.error.message}`,
          testDefsResult.error,
        ),
      );
    }

    chat.succeedSpinner('테스트 정의 완성');
    chat.startSpinner('스펙 문서 생성 중...');

    // 5. SpecBuilder: 스펙 문서 생성
    const specResult = session.specBuilder.buildSpec(
      planResult.value,
      designResult.value,
      featuresResult.value,
    );
    if (!specResult.ok) {
      chat.failSpinner('스펙 문서 생성 실패');
      return err(
        new AdevError(
          'cli_start_contract_generation_failed',
          `스펙 문서 생성 실패 / Spec build failed: ${specResult.error.message}`,
          specResult.error,
        ),
      );
    }

    chat.succeedSpinner('스펙 문서 완성');
    chat.startSpinner('Contract 생성 중...');

    // 6. ContractBuilder: ContractSchema 생성
    const contractResult = session.contractBuilder.buildContract(
      featuresResult.value,
      testDefsResult.value,
      designResult.value,
    );
    if (!contractResult.ok) {
      chat.failSpinner('Contract 생성 실패');
      return err(
        new AdevError(
          'cli_start_contract_generation_failed',
          `Contract 생성 실패 / Contract build failed: ${contractResult.error.message}`,
          contractResult.error,
        ),
      );
    }

    // 7. HandoffPackage 생성 (Layer2 전달용)
    const handoffResult = session.contractBuilder.buildHandoffPackage(
      session.projectInfo.id,
      contractResult.value,
      planResult.value,
      designResult.value,
      specResult.value,
    );
    if (!handoffResult.ok) {
      chat.failSpinner('HandoffPackage 생성 실패');
      return err(
        new AdevError(
          'cli_start_contract_generation_failed',
          `HandoffPackage 생성 실패 / HandoffPackage build failed: ${handoffResult.error.message}`,
          handoffResult.error,
        ),
      );
    }

    chat.succeedSpinner('Contract 생성 완료');

    // 8. Contract + HandoffPackage 파일 저장
    const contractPath = resolve(session.projectInfo.path, '.adev', 'contract.json');
    const handoffPath = resolve(session.projectInfo.path, '.adev', 'handoff.json');
    await Bun.write(contractPath, JSON.stringify(contractResult.value, null, 2));
    await Bun.write(handoffPath, JSON.stringify(handoffResult.value, null, 2));

    logger.info('Contract + HandoffPackage 생성 완료', { contractPath, handoffPath });

    return ok(handoffResult.value);
  } catch (error: unknown) {
    return err(
      new AdevError(
        'cli_start_contract_generation_failed',
        `Contract 생성 실패 / Contract generation failed: ${error instanceof Error ? error.message : String(error)}`,
        error,
      ),
    );
  }
}
