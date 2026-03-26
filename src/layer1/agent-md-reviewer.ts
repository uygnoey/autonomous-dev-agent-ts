/**
 * Agent .md 초안 유저 검토/수정 CLI 인터랙션 / Agent .md draft user review/edit CLI interaction
 *
 * @description
 * KR: SPEC.md §7.4 Step 2. AI가 생성한 에이전트 .md 초안을
 *     유저에게 보여주고, 수정/승인을 받아 확정된 내용을 반환한다.
 * EN: SPEC.md §7.4 Step 2. Shows AI-generated agent .md drafts to the user,
 *     collects edits/approval, and returns confirmed content.
 */

import type { Logger } from 'core/logger.js';
import type { AgentName } from 'core/types.js';
import { ALL_AGENT_NAMES } from 'layer1/agent-md-generator-instructions.js';

// ── 유저 입력 추상화 / User input abstraction ─────────────────

/**
 * 에이전트 .md 검토용 유저 입력 제공자 / User input provider for agent .md review
 *
 * @description
 * KR: ChatUi 또는 테스트 환경에서 사용할 수 있는 추상 인터페이스.
 * EN: Abstract interface usable from ChatUi or test environments.
 */
export interface AgentMdReviewInput {
  /** 시스템 메시지를 출력한다 / Outputs a system message */
  system(message: string): void;
  /** 성공 메시지를 출력한다 / Outputs a success message */
  success(message: string): void;
  /** 사용자 입력을 대기한다 / Waits for user input */
  waitForInput(): Promise<{ type: string; text?: string }>;
}

/**
 * 유저 검토 결정 / User review decision
 *
 * @description
 * KR: approve = 현재 초안 그대로 확정, edit = 유저가 수정한 텍스트로 교체, skip = 해당 에이전트 건너뜀
 * EN: approve = confirm as-is, edit = replace with user text, skip = skip this agent
 */
export type ReviewDecision = 'approve' | 'edit' | 'skip';

/**
 * 단일 에이전트 검토 결과 / Single agent review result
 */
export interface AgentReviewResult {
  readonly agentName: AgentName;
  readonly decision: ReviewDecision;
  /** 확정된 내용 (skip이면 원본) / Confirmed content (original if skipped) */
  readonly content: string;
}

// ── AgentMdReviewer ───────────────────────────────────────────

/**
 * 에이전트 .md 초안 유저 검토기 / Agent .md draft user reviewer
 *
 * @description
 * KR: 7개 에이전트 .md 초안을 순서대로 유저에게 보여주고,
 *     approve/edit/skip 인터랙션을 통해 확정된 내용을 반환한다.
 *     approve_all 단축 명령으로 나머지를 일괄 승인할 수 있다.
 * EN: Shows 7 agent .md drafts to the user in order,
 *     returns confirmed content via approve/edit/skip interaction.
 *     approve_all shortcut confirms all remaining.
 *
 * @param logger - 로거 인스턴스 / Logger instance
 *
 * @example
 * const reviewer = new AgentMdReviewer(logger);
 * const results = await reviewer.reviewAll(drafts, input);
 */
export class AgentMdReviewer {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'agent-md-reviewer' });
  }

  /**
   * 7개 에이전트 .md 초안을 순서대로 유저 검토한다 / Review all 7 agent .md drafts in order
   *
   * @param drafts - 에이전트 이름 → 초안 내용 맵 / AgentName → draft content map
   * @param input - 유저 입력 제공자 / User input provider
   * @returns 확정된 에이전트 이름 → 내용 맵 / Confirmed AgentName → content map
   */
  async reviewAll(
    drafts: Record<AgentName, string>,
    input: AgentMdReviewInput,
  ): Promise<Record<AgentName, string>> {
    const confirmed: Partial<Record<AgentName, string>> = {};
    let approveAllRemaining = false;

    input.system('=== 에이전트 .md 초안 검토 ===');
    input.system(`총 ${ALL_AGENT_NAMES.length}개 에이전트 문서를 검토합니다.\n`);

    for (let i = 0; i < ALL_AGENT_NAMES.length; i++) {
      const agentName = ALL_AGENT_NAMES[i]!;
      const draft = drafts[agentName];

      if (draft === undefined) {
        this.logger.warn('초안 없음 — 건너뜀', { agentName });
        continue;
      }

      if (approveAllRemaining) {
        confirmed[agentName] = draft;
        input.success(`[${i + 1}/${ALL_AGENT_NAMES.length}] ${agentName} — 자동 승인`);
        this.logger.info('일괄 승인 적용', { agentName });
        continue;
      }

      const result = await this.reviewOne(agentName, draft, input, i + 1, ALL_AGENT_NAMES.length);

      if (result.decision === 'approve' && result.content === 'APPROVE_ALL') {
        // WHY: approve_all 단축 명령 — 현재 + 나머지 모두 승인
        confirmed[agentName] = draft;
        approveAllRemaining = true;
        input.success(
          `[${i + 1}/${ALL_AGENT_NAMES.length}] ${agentName} — 승인 (나머지 일괄 승인)`,
        );
        this.logger.info('일괄 승인 시작', {
          agentName,
          remaining: ALL_AGENT_NAMES.length - i - 1,
        });
        continue;
      }

      confirmed[agentName] = result.content;
      this.logger.info('에이전트 검토 완료', { agentName, decision: result.decision });
    }

    input.success('\n에이전트 .md 초안 검토 완료!');
    return confirmed as Record<AgentName, string>;
  }

  /**
   * 단일 에이전트 .md 초안을 유저 검토한다 / Review a single agent .md draft
   *
   * @param agentName - 에이전트 이름 / Agent name
   * @param draft - 초안 내용 / Draft content
   * @param input - 유저 입력 제공자 / User input provider
   * @param index - 현재 인덱스 (1-based) / Current index (1-based)
   * @param total - 전체 개수 / Total count
   * @returns 검토 결과 / Review result
   */
  private async reviewOne(
    agentName: AgentName,
    draft: string,
    input: AgentMdReviewInput,
    index: number,
    total: number,
  ): Promise<AgentReviewResult> {
    input.system(`\n--- [${index}/${total}] ${agentName}.md ---`);

    // WHY: 초안 전체를 보여줌 — 유저가 내용을 확인할 수 있어야 함
    const previewLines = draft.split('\n');
    const MAX_PREVIEW = 50;

    if (previewLines.length > MAX_PREVIEW) {
      input.system(previewLines.slice(0, MAX_PREVIEW).join('\n'));
      input.system(`\n... (${previewLines.length - MAX_PREVIEW}줄 더 있음)`);
    } else {
      input.system(draft);
    }

    input.system('\n선택:');
    input.system('  approve       — 이 초안을 그대로 승인');
    input.system('  approve_all   — 이 초안 + 나머지 모두 일괄 승인');
    input.system('  edit          — 직접 수정 (수정 내용 입력)');
    input.system('  skip          — 원본 유지 (건너뜀)');

    while (true) {
      const event = await input.waitForInput();

      if (event.type === 'interrupt' || event.type === 'eof') {
        // WHY: 인터럽트 시 현재 초안 그대로 승인
        this.logger.info('인터럽트 — 현재 초안 승인으로 처리', { agentName });
        return { agentName, decision: 'approve', content: draft };
      }

      if (event.type !== 'message' || !event.text) {
        continue;
      }

      const cmd = event.text.trim().toLowerCase();

      if (cmd === 'approve' || cmd === '승인') {
        return { agentName, decision: 'approve', content: draft };
      }

      if (cmd === 'approve_all' || cmd === '일괄승인' || cmd === '전체승인') {
        // WHY: 특수 마커로 approve_all을 상위에 전달
        return { agentName, decision: 'approve', content: 'APPROVE_ALL' };
      }

      if (cmd === 'skip' || cmd === '건너뜀' || cmd === '스킵') {
        return { agentName, decision: 'skip', content: draft };
      }

      if (cmd === 'edit' || cmd === '수정') {
        return this.handleEdit(agentName, draft, input);
      }

      input.system('잘못된 입력입니다. approve / approve_all / edit / skip 중 하나를 입력하세요.');
    }
  }

  /**
   * 유저 수정 입력을 처리한다 / Handles user edit input
   *
   * @param agentName - 에이전트 이름 / Agent name
   * @param original - 원본 초안 / Original draft
   * @param input - 유저 입력 제공자 / User input provider
   * @returns 수정된 검토 결과 / Edited review result
   */
  private async handleEdit(
    agentName: AgentName,
    original: string,
    input: AgentMdReviewInput,
  ): Promise<AgentReviewResult> {
    input.system('수정 내용을 입력하세요 (빈 줄 입력으로 종료):');
    input.system('(원본을 완전히 대체합니다. 취소하려면 cancel 입력)');

    const lines: string[] = [];

    while (true) {
      const event = await input.waitForInput();

      if (event.type === 'interrupt' || event.type === 'eof') {
        // WHY: 수정 중 인터럽트 → 원본 유지
        input.system('수정 취소 — 원본 유지');
        return { agentName, decision: 'skip', content: original };
      }

      if (event.type !== 'message') {
        continue;
      }

      const text = event.text ?? '';

      if (text.trim().toLowerCase() === 'cancel' || text.trim().toLowerCase() === '취소') {
        input.system('수정 취소 — 원본 유지');
        return { agentName, decision: 'skip', content: original };
      }

      // WHY: 빈 줄이면 입력 종료
      if (text === '') {
        break;
      }

      lines.push(text);
    }

    if (lines.length === 0) {
      input.system('수정 내용 없음 — 원본 유지');
      return { agentName, decision: 'skip', content: original };
    }

    const edited = lines.join('\n');
    input.success(`${agentName}.md 수정 완료 (${edited.length}자)`);

    return { agentName, decision: 'edit', content: edited };
  }
}
