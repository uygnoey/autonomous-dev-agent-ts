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
import {
  formatVerificationOutput,
  saveVerificationReport,
} from '../../layer1/contract-verification-reporter.js';
import type { HandoffPackage } from '../../layer1/types.js';
import type { ChatUi } from '../tui/chat.js';
import { generateHandoffDocs } from './start-handoff-docs.js';
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

    logger.info('Contract + HandoffPackage saved', { contractPath, handoffPath });

    // 9. Agent context docs — .adev/handoff-context.json, .claude/{CLAUDE,SPEC,SKILL}.md
    // WHY: Agents need detailed context files before Layer2 starts.
    //      Best-effort: warns on failure and continues.
    await generateHandoffDocs(handoffResult.value, session.projectInfo.path, logger);

    // 10. Contract 검증 (구조 + AI 정합성) — 스펙 §6.7
    chat.startSpinner('Contract 검증 중...');
    const verifyResult = await session.contractVerifier.verifyContract(handoffResult.value);
    chat.stopSpinner();

    if (verifyResult.ok) {
      // CLI 출력 (✅/⚠️/❌ 형식)
      const cliOutput = formatVerificationOutput(verifyResult.value, handoffResult.value);
      chat.showMessage({ role: 'assistant', content: cliOutput });

      // 상세 리포트 파일 저장
      await saveVerificationReport(
        session.projectInfo.path,
        verifyResult.value,
        handoffResult.value,
        logger,
      );

      // WHY: AI 검증 결과는 참고용 — error 이슈도 warn 처리하고 개발 진입 허용.
      //      AI가 summary 정보만으로 판단하므로 false-negative 발생 가능.
      const hasErrors = verifyResult.value.issues.some((i) => i.severity === 'error');
      if (hasErrors) {
        logger.warn('Contract AI 검증에서 error 이슈 발견 — 경고 후 계속 진행', {
          errorCount: verifyResult.value.issues.filter((i) => i.severity === 'error').length,
        });
      }
    } else {
      // 검증 API 실패는 warning 처리 (개발 진입은 허용)
      logger.warn('Contract 검증 API 실패 — 검증 없이 진행', {
        error: verifyResult.error.message,
      });
    }

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
