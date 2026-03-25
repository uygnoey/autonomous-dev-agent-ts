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
import { generateAgentMds, runLayer2, runLayer3 } from './start-execution.js';
import type { Layer1SessionState } from './start-types.js';

/**
 * Contract 후처리 결과 / Contract post-processing result
 *
 * @description
 * KR: contract case에서 후속 흐름(AgentMd 생성, 품질 검증, Layer2 진행)의 결과를 나타낸다.
 * EN: Represents the outcome of post-contract flow (AgentMd, quality check, Layer2 launch).
 */
export type ContractFlowAction = 'exit' | 'continue_conversation';

/**
 * Contract 생성 후 후속 흐름 처리 / Handle post-contract flow
 *
 * @description
 * KR: Contract 생성 성공 후 AgentMd 생성 확인, 품질 검증, Layer2 진행 여부를 처리한다.
 *     chat.waitForInput()으로 유저 확인을 받으므로 async 함수이다.
 * EN: Handles AgentMd generation prompt, quality gate check, and Layer2 launch confirmation.
 *
 * @param session - Layer1 세션 상태 / Layer1 session state
 * @param handoff - HandoffPackage
 * @param chat - TUI 채팅 인터페이스 / TUI chat interface
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns 'exit' (루프 종료) 또는 'continue_conversation' (대화 계속)
 */
export async function handleContractPostProcess(
  session: Layer1SessionState,
  handoff: HandoffPackage,
  chat: ChatUi,
  logger: Logger,
): Promise<ContractFlowAction> {
  const contractPath = `${session.projectInfo.path}/.adev/contract.json`;
  chat.showContractComplete(contractPath);

  // AgentMd 생성 확인
  chat.system('AI로 에이전트 가이드 문서(.adev/agents/*.md)를 생성하려면 "yes"를 입력하세요.');
  const agentMdEvent = await chat.waitForInput();
  if (
    agentMdEvent.type === 'message' &&
    ['yes', 'y', '네', '예'].includes(agentMdEvent.text.toLowerCase())
  ) {
    await generateAgentMds(session, handoff, chat, logger);
  }

  // WHY: CV-002 — completenessScore < 1.0 시 부족한 항목을 명시하고
  //      유저가 대화를 이어가 개선할 수 있도록 안내한다 (스펙 §6.7).
  const matrix = handoff.contract.verificationMatrix;
  const hasQualityIssues =
    matrix.completenessScore < 1.0 || !matrix.allIODefined || !matrix.allFeaturesHaveCriteria;

  if (hasQualityIssues) {
    const missing: string[] = [];
    if (!matrix.allIODefined) missing.push('기능 입출력 정의');
    if (!matrix.allFeaturesHaveCriteria) missing.push('수락 기준');
    if (matrix.completenessScore < 1.0)
      missing.push(`완전성 점수 (현재: ${matrix.completenessScore})`);
    chat.system(
      `⚠️ Contract 품질 미달: [${missing.join(', ')}] 항목이 부족합니다.\n계속 진행하려면 "yes"를 입력하세요. 대화로 개선하려면 다른 메시지를 입력하세요.`,
    );
  } else {
    chat.system('Layer2 자율 개발을 시작하려면 "yes"를 입력하세요.');
  }

  const confirmEvent = await chat.waitForInput();
  if (
    confirmEvent.type === 'message' &&
    ['yes', 'y', '네', '예'].includes(confirmEvent.text.toLowerCase())
  ) {
    const layer2Result = await runLayer2(session, handoff, chat, logger);
    if (!layer2Result.ok) {
      chat.error(`Layer2 실행 실패: ${layer2Result.error.message}`);
    } else {
      // WHY: Layer2 성공 시 Layer3 E2E 검증 자동 실행 (스펙 §계층 연동)
      await runLayer3(session, handoff, chat, logger);
    }
    return 'exit';
  }

  // WHY: 품질 이슈가 있고 유저가 "yes"를 입력하지 않으면 대화 루프를 유지해
  //      누락된 항목을 보완할 수 있도록 한다.
  if (hasQualityIssues) {
    chat.system(
      '대화를 계속하여 누락된 항목을 추가해 주세요. Contract를 다시 생성하려면 "/contract"를 입력하세요.',
    );
    return 'continue_conversation';
  }

  return 'exit';
}

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
