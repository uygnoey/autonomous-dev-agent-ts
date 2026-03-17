/**
 * fullrun13 E2E 테스트 스크립트 / fullrun13 E2E test script
 *
 * @description
 * KR: BUG-A/B/C 수정 후 Layer2(PhaseEngine reset + commitChanges) + Layer3 전 구간을 검증한다.
 *     ~/test/adev 프로젝트에서 feat-1~4를 순차 실행하고 결과를 JSON으로 저장한다.
 * EN: Validates full Layer2 (PhaseEngine reset + commitChanges) + Layer3 after BUG-A/B/C fixes.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ConsoleLogger } from '../src/core/logger.js';
import { ApiKeyAuth } from '../src/auth/api-key-auth.js';
import { Layer2Bootstrap } from '../src/layer2/layer2-bootstrap.js';
import { ProcessExecutor } from '../src/core/process-executor.js';
import { CleanEnvManager } from '../src/layer2/clean-env-manager.js';
import { IntegrationTester } from '../src/layer2/integration-tester.js';
import { runStepwiseVerification } from '../src/layer3/verification-runner.js';
import type { HandoffPackage } from '../src/layer1/types.js';

const TEST_PROJECT_PATH = resolve(process.env['HOME'] ?? '/Users/yeongyu.yang', 'test/adev');
const HANDOFF_PATH = resolve(TEST_PROJECT_PATH, '.adev/handoff.json');
const RESULT_PATH = resolve(process.cwd(), 'e2e-fullrun13-result-2026-03-17.json');

interface FeatureResult {
  featureId: string;
  events: Array<{ type: string; content: string; timestamp: string }>;
  phases: string[];
  status: 'SUCCESS' | 'FAILED' | 'PARTIAL';
  durationMs: number;
}

async function main(): Promise<void> {
  const logger = new ConsoleLogger('info');
  const startTime = Date.now();

  logger.info('fullrun13 E2E 시작', { projectPath: TEST_PROJECT_PATH });

  // 1. handoff.json 로드
  let handoff: HandoffPackage;
  try {
    const raw = await readFile(HANDOFF_PATH, 'utf-8');
    handoff = JSON.parse(raw) as HandoffPackage;
    logger.info('handoff.json 로드 완료', { projectId: handoff.projectId, featureCount: handoff.contract.implementationOrder.length });
  } catch (err) {
    logger.error('handoff.json 로드 실패', { error: String(err) });
    process.exit(1);
  }

  // 2. AuthProvider 초기화
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    logger.error('ANTHROPIC_API_KEY 환경변수 없음');
    process.exit(1);
  }
  const authProvider = new ApiKeyAuth(apiKey, logger);

  // 3. Layer2Bootstrap으로 TeamLeader 생성
  const bootstrap = new Layer2Bootstrap({
    authProvider,
    logger,
    projectCwd: TEST_PROJECT_PATH,
  });

  const teamLeader = await bootstrap.createTeamLeader();
  logger.info('TeamLeader 생성 완료');

  // 4. 각 feature 실행
  const featureResults: FeatureResult[] = [];
  const features = handoff.contract.implementationOrder;

  for (const featureId of features) {
    const featStart = Date.now();
    const events: Array<{ type: string; content: string; timestamp: string }> = [];
    const phases: Set<string> = new Set();
    let status: FeatureResult['status'] = 'FAILED';

    logger.info(`[${featureId}] 실행 시작`);

    try {
      for await (const event of teamLeader.executeFeature(featureId, handoff)) {
        events.push({
          type: event.type,
          content: event.content.substring(0, 200),
          timestamp: event.timestamp.toISOString(),
        });

        if (event.type === 'done') {
          status = 'SUCCESS';
        } else if (event.type === 'error') {
          status = 'PARTIAL';
        }
      }

      if (status !== 'FAILED') {
        logger.info(`[${featureId}] 완료`, { status, eventCount: events.length });
      }
    } catch (err) {
      logger.error(`[${featureId}] 예외 발생`, { error: String(err) });
      events.push({ type: 'error', content: String(err), timestamp: new Date().toISOString() });
    }

    featureResults.push({
      featureId,
      events: events.slice(-20), // 마지막 20개만 저장
      phases: [...phases],
      status,
      durationMs: Date.now() - featStart,
    });
  }

  // 5. Layer3 E2E 검증
  logger.info('Layer3 E2E 검증 시작');
  const processExecutor = new ProcessExecutor(logger);
  const cleanEnvManager = new CleanEnvManager(logger);
  const integrationTester = new IntegrationTester(logger, processExecutor, cleanEnvManager);

  const layer3Result = await runStepwiseVerification(handoff.projectId, 'all', integrationTester, logger);
  const layer3Steps = layer3Result.ok ? layer3Result.value : [];
  const layer3PassCount = layer3Steps.filter((s) => s.passed).length;

  // 6. 결과 저장
  const totalDuration = Date.now() - startTime;
  const successCount = featureResults.filter((r) => r.status === 'SUCCESS').length;
  const failCount = featureResults.filter((r) => r.status === 'FAILED').length;

  const result = {
    runId: 'fullrun13',
    timestamp: new Date().toISOString(),
    totalDurationMs: totalDuration,
    overallStatus: failCount === 0 ? 'SUCCESS' : successCount > 0 ? 'PARTIAL_SUCCESS' : 'FAILED',
    summary: {
      totalFeatures: features.length,
      successCount,
      partialCount: featureResults.filter((r) => r.status === 'PARTIAL').length,
      failCount,
    },
    layer2: { featureResults },
    layer3: {
      totalSteps: layer3Steps.length,
      passCount: layer3PassCount,
      failCount: layer3Steps.length - layer3PassCount,
      steps: layer3Steps,
    },
    bugFixes: {
      'BUG-A': 'PhaseEngine.reset() - feature 간 Phase 상태 초기화',
      'BUG-B': 'runLayer3() - CLI에서 Layer3 E2E 검증 호출',
      'BUG-C': 'GitBranchManager.commitChanges() - CODE Phase 완료 후 git commit',
    },
  };

  await writeFile(RESULT_PATH, JSON.stringify(result, null, 2), 'utf-8');
  logger.info('fullrun13 완료', {
    overallStatus: result.overallStatus,
    totalDurationMs: totalDuration,
    resultPath: RESULT_PATH,
  });

  // 결과 요약 출력
  console.log('\n=== fullrun13 E2E 결과 ===');
  console.log(`전체 상태: ${result.overallStatus}`);
  console.log(`Feature: ${successCount}/${features.length} 성공`);
  console.log(`Layer3: ${layer3PassCount}/${layer3Steps.length} 단계 통과`);
  console.log(`총 소요 시간: ${(totalDuration / 1000).toFixed(1)}초`);
}

main().catch((err) => {
  console.error('fullrun13 실패:', err);
  process.exit(1);
});
