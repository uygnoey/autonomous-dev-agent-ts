/**
 * documenter 이벤트 디스패처 / Documenter event dispatcher
 *
 * @description
 * KR: 5가지 이벤트 유형에 따라 documenter를 spawn하고 적절한 프롬프트를 주입한다.
 *     이벤트 발생 → 프롬프트 생성 → documenter spawn → 문서 생성 → 종료.
 * EN: Spawns the documenter with appropriate prompts for each of the 5 event types.
 *     Event → prompt generation → documenter spawn → document generation → terminate.
 */

import { join } from 'node:path';
import type { Logger } from 'core/logger.js';
import type { AgentGenerator } from 'layer2/agent-generator.js';
import type { AgentSpawner } from 'layer2/agent-spawner.js';
import type { DocumenterEvent, DocumenterEventType } from 'layer2/documenter-event-types.js';
import { DOCUMENTER_OUTPUT_MAP } from 'layer2/documenter-event-types.js';
import type { AgentEvent } from 'layer2/types.js';

// ── 이벤트별 프롬프트 생성 / Per-event prompt builders ───────────

/**
 * 이벤트별 documenter 프롬프트를 생성한다 / Builds a documenter prompt for the given event
 *
 * @param event - documenter 이벤트 / Documenter event
 * @returns documenter에게 주입할 프롬프트 / Prompt to inject into the documenter
 */
export function buildDocumenterPrompt(event: DocumenterEvent): string {
  const outputs = DOCUMENTER_OUTPUT_MAP[event.type];
  const outputList = outputs.map((o, i) => `${i + 1}. ${o}`).join('\n');

  const header = [
    `[documenter 이벤트: ${event.type}]`,
    `프로젝트: ${event.projectId}`,
    `시간: ${event.timestamp.toISOString()}`,
    '',
    '생성할 문서:',
    outputList,
    '',
    '문서 품질 기준: 초등학생도 이해할 수 있는 수준. 기술 용어 → 일반 언어 번역.',
    '',
  ].join('\n');

  switch (event.type) {
    case 'feature_complete':
      return [
        header,
        `기능 ID: ${event.context.featureId}`,
        `기능명: ${event.context.featureName}`,
        `설명: ${event.context.description}`,
        `변경된 파일 (${event.context.changedFiles.length}개):`,
        ...event.context.changedFiles.map((f) => `  - ${f}`),
      ].join('\n');

    case 'test_executed':
      return [
        header,
        `기능 ID: ${event.context.featureId}`,
        `결과: ${event.context.passed ? '통과' : '실패'}`,
        `전체: ${event.context.totalTests} / 통과: ${event.context.passedTests} / 실패: ${event.context.failedTests}`,
        `커버리지: ${(event.context.coverage * 100).toFixed(1)}%`,
        ...(event.context.failureMessages.length > 0
          ? ['실패 메시지:', ...event.context.failureMessages.map((m) => `  - ${m}`)]
          : []),
      ].join('\n');

    case 'bug_detected':
      return [
        header,
        `기능 ID: ${event.context.featureId}`,
        `발견 Phase: ${event.context.phase}`,
        `재현 경로: ${event.context.reproductionPath}`,
        `근본 원인: ${event.context.rootCause}`,
        `영향 범위: ${event.context.impactScope}`,
      ].join('\n');

    case 'phase_boundary':
      return [
        header,
        `기능 ID: ${event.context.featureId}`,
        `Phase 전환: ${event.context.fromPhase} → ${event.context.toPhase}`,
        `전환 사유: ${event.context.reason}`,
        `의사결정 요약: ${event.context.decisionSummary}`,
      ].join('\n');

    case 'translation':
      return [
        header,
        `원본 문서: ${event.context.sourceDocPath}`,
        `대상 언어: ${event.context.targetLanguages.join(', ')}`,
        `기술 용어 보존: ${event.context.preserveTechnicalTerms ? '예' : '아니오'}`,
      ].join('\n');
  }
}

// ── DocumenterEventDispatcher ───────────────────────────────────

/**
 * documenter 이벤트 디스패처 / Documenter event dispatcher
 *
 * @description
 * KR: 이벤트를 수신하여 documenter를 spawn한다.
 *     이벤트 유형에 따라 적절한 프롬프트를 생성하고 documenter에게 주입한다.
 * EN: Receives events and spawns the documenter.
 *     Generates appropriate prompts per event type and injects them into the documenter.
 *
 * @internal 내부 구현 세부사항 — TeamLeader 전용 documenter 연동
 *
 * @param agentGenerator - 에이전트 설정 생성기 / Agent config generator
 * @param agentSpawner - 에이전트 스포너 / Agent spawner
 * @param logger - 로거 / Logger
 *
 * @example
 * const dispatcher = new DocumenterEventDispatcher(generator, spawner, logger);
 * for await (const event of dispatcher.dispatch(documenterEvent)) {
 *   // handle agent events
 * }
 */
export class DocumenterEventDispatcher {
  private readonly logger: Logger;
  private readonly projectPath: string | undefined;

  constructor(
    private readonly agentGenerator: AgentGenerator,
    private readonly agentSpawner: AgentSpawner,
    logger: Logger,
    projectPath?: string,
  ) {
    this.logger = logger.child({ module: 'documenter-event-dispatcher' });
    this.projectPath = projectPath;
  }

  /**
   * documenter 이벤트를 처리한다 / Dispatches a documenter event
   *
   * @param event - documenter 이벤트 / Documenter event
   * @returns 에이전트 이벤트 스트림 / Agent event stream
   */
  async *dispatch(event: DocumenterEvent): AsyncIterable<AgentEvent> {
    this.logger.info('documenter 이벤트 수신', {
      type: event.type,
      projectId: event.projectId,
    });

    const prompt = buildDocumenterPrompt(event);
    const featureId = extractFeatureId(event);

    const configResult = this.agentGenerator.generateAgentConfig('documenter', prompt, featureId);

    if (!configResult.ok) {
      this.logger.warn('documenter 설정 생성 실패 — 문서화 생략', {
        type: event.type,
        error: configResult.error.message,
      });
      return;
    }

    const config = {
      ...configResult.value,
      projectId: event.projectId,
      phase: 'VERIFY' as const,
    };

    this.logger.info('documenter spawn 시작', {
      type: event.type,
      featureId,
    });

    // WHY: PI-005 — documenter 출력 메시지를 수집하여 파일로 저장
    const collectedMessages: string[] = [];

    for await (const agentEvent of this.agentSpawner.spawn(config)) {
      if (agentEvent.type === 'message' && agentEvent.content) {
        collectedMessages.push(agentEvent.content);
      }
      yield agentEvent;
    }

    // WHY: PI-005 — documenter 출력을 .adev/docs/{eventType}-{timestamp}.md에 저장
    await this.saveDocumenterOutput(event.type, collectedMessages);

    this.logger.info('documenter 완료', {
      type: event.type,
      featureId,
    });
  }

  /**
   * documenter 출력을 파일로 저장한다 / Saves documenter output to file
   *
   * @param eventType - 이벤트 유형 / Event type
   * @param messages - 수집된 메시지 / Collected messages
   */
  private async saveDocumenterOutput(
    eventType: DocumenterEventType,
    messages: string[],
  ): Promise<void> {
    const docContent = messages.join('\n');
    if (!(docContent.trim() && this.projectPath)) return;

    try {
      const docsDir = join(this.projectPath, '.adev', 'docs');
      const { mkdir } = await import('node:fs/promises');
      await mkdir(docsDir, { recursive: true });

      const docPath = join(docsDir, `${eventType}-${Date.now()}.md`);
      await Bun.write(docPath, docContent);
      this.logger.info('documenter 문서 저장 완료', { path: docPath });
    } catch (error: unknown) {
      this.logger.warn('documenter 문서 저장 실패', { error: String(error) });
    }
  }

  /**
   * 지원하는 이벤트 유형 목록 반환 / Returns supported event types
   *
   * @returns 이벤트 유형 배열 / Array of event types
   */
  getSupportedEventTypes(): readonly DocumenterEventType[] {
    return ['feature_complete', 'test_executed', 'bug_detected', 'phase_boundary', 'translation'];
  }
}

// ── 유틸리티 / Utility ──────────────────────────────────────────

/**
 * 이벤트에서 featureId를 추출한다 / Extracts featureId from a documenter event
 */
function extractFeatureId(event: DocumenterEvent): string {
  switch (event.type) {
    case 'feature_complete':
      return event.context.featureId;
    case 'test_executed':
      return event.context.featureId;
    case 'bug_detected':
      return event.context.featureId;
    case 'phase_boundary':
      return event.context.featureId;
    case 'translation':
      return `translation-${event.context.sourceDocPath}`;
  }
}
