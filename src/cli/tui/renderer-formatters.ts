/**
 * TUI 메시지 포맷터 / TUI Message Formatters
 *
 * @description
 * 사용자/어시스턴트/시스템/에러/성공/OAuth 경고 메시지 포맷 함수.
 * 레이아웃 컴포넌트: renderHeader, renderFooter, renderDivider, renderPrompt.
 * Format functions for user/assistant/system/error/success/OAuth warning messages.
 * Layout: renderHeader, renderFooter, renderDivider, renderPrompt.
 */

import type { OAuthExpiryInfo } from 'auth/oauth-expiry-types.js';
import { bold, cyan, dim, gray, green, red, yellow } from 'cli/tui/ansi.js';
import { getTerminalWidth, renderBox, wrapText } from 'cli/tui/renderer-box.js';

// ── 시간 유틸 / Time utility ─────────────────────────────────────

/**
 * 시간 포맷팅 / Format time
 *
 * @param date - 날짜
 * @returns HH:MM:SS 형식 문자열
 */
export function formatTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// ── 메시지 포맷터 / Message formatters ────────────────────────────

/**
 * 사용자 메시지 포맷팅 / Format user message
 *
 * @param content - 메시지 내용
 * @param timestamp - 타임스탬프 (선택)
 * @returns 포맷된 문자열
 */
export function formatUserMessage(content: string, timestamp?: Date): string {
  const prefix = bold('You');
  const ts = timestamp ? gray(` [${formatTime(timestamp)}]`) : '';
  const header = `${prefix}${ts}`;

  const termWidth = getTerminalWidth();
  const innerWidth = termWidth - 4; // indent
  const lines = wrapText(content, innerWidth);

  return `\n${header}\n${lines.map((l) => `  ${l}`).join('\n')}\n`;
}

/**
 * 어시스턴트 메시지 포맷팅 / Format assistant message
 *
 * @param content - 메시지 내용
 * @param timestamp - 타임스탬프 (선택)
 * @returns 포맷된 문자열
 */
export function formatAssistantMessage(content: string, timestamp?: Date): string {
  const termWidth = getTerminalWidth();
  const maxW = Math.min(termWidth - 2, 100);

  const ts = timestamp ? gray(` [${formatTime(timestamp)}]`) : '';
  const title = `adev${ts}`;

  return `\n${renderBox(content, {
    title,
    maxWidth: maxW,
    style: 'rounded',
    color: 'cyan',
    titleColor: 'brightCyan',
  })}\n`;
}

/**
 * 시스템 메시지 포맷팅 / Format system message
 *
 * @param content - 메시지 내용
 * @returns 포맷된 문자열
 */
export function formatSystemMessage(content: string): string {
  return `\n${yellow('  ◆')} ${dim(content)}\n`;
}

/**
 * 에러 메시지 포맷팅 / Format error message
 *
 * @param content - 에러 내용
 * @returns 포맷된 문자열
 */
export function formatErrorMessage(content: string): string {
  return `\n${red('  ✖')} ${red(content)}\n`;
}

/**
 * 성공 메시지 포맷팅 / Format success message
 *
 * @param content - 성공 내용
 * @returns 포맷된 문자열
 */
export function formatSuccessMessage(content: string): string {
  return `\n${green('  ✔')} ${green(content)}\n`;
}

/**
 * OAuth 만료 경고 메시지를 포맷한다 / Formats OAuth expiry warning message
 *
 * @param info - OAuth 만료 정보 / OAuth expiry information
 * @returns 포맷된 경고 문자열. valid 상태이면 빈 문자열 반환 / Empty string if valid
 *
 * @example
 * const info = checker.check(token);
 * const warning = formatOAuthExpiryWarning(info);
 * if (warning) process.stdout.write(warning + '\n');
 */
export function formatOAuthExpiryWarning(info: OAuthExpiryInfo): string {
  if (info.status === 'expired') {
    return `${red('  ⚠')} ${red(`OAuth 토큰이 만료되었습니다. 재발급: ${info.renewalCommand}`)}`;
  }
  if (info.status === 'expiring_soon') {
    const days = info.daysRemaining ?? 0;
    return `${yellow('  ⚠')} ${yellow(`OAuth 토큰이 ${days}일 후 만료됩니다. 갱신: ${info.renewalCommand}`)}`;
  }
  return '';
}

// ── 레이아웃 컴포넌트 / Layout components ─────────────────────────

/**
 * TUI 헤더 렌더링 / Render TUI header
 *
 * @description
 * Claude Code 스타일의 상단 헤더 박스.
 * ╭─ adev v0.0.1 ─ claude-opus-4-6 ──────────────────╮
 *
 * @param version - 버전 문자열
 * @param model - 모델 이름
 * @returns 렌더링된 헤더
 */
export function renderHeader(version: string, model?: string): string {
  const termWidth = getTerminalWidth();
  const { tl, tr } = { tl: '╭', tr: '╮' };
  const h = '─';

  // 레이블 구성: adev v{version} [─ model]
  const versionLabel = `adev ${dim(`v${version}`)}`;
  const modelLabel = model ? `  ${dim('─')}  ${cyan(model)}` : '';

  // 표시 너비 계산 (ANSI 제외)
  const rawLabel = `adev v${version}${model ? `  ─  ${model}` : ''}`;
  // ╭─  {label}  ─...─╮ : 좌우 테두리(2) + 공백(2) + 레이블 + 공백(1)
  const prefixLen = 3; // "╭─ "
  const suffixLen = 1; // "╮"
  const rightDashLen = Math.max(0, termWidth - prefixLen - rawLabel.length - 2 - suffixLen);

  const top =
    dim(`${tl}${h} `) + versionLabel + modelLabel + dim(` ${'─'.repeat(rightDashLen)}${tr}`);

  return `\n${top}\n`;
}

/**
 * 푸터 렌더링 / Render footer
 *
 * @param shortcuts - 키보드 단축키 목록
 * @returns 렌더링된 푸터
 */
export function renderFooter(shortcuts: Array<[string, string]>): string {
  const parts = shortcuts.map(([key, desc]) => `${cyan(key)} ${dim(desc)}`);
  return `\n${dim(`  ${parts.join('  ·  ')}`)}\n`;
}

/**
 * 구분선 렌더링 / Render divider
 *
 * @param label - 선택적 레이블
 * @returns 구분선 문자열
 */
export function renderDivider(label?: string): string {
  const termWidth = getTerminalWidth();
  if (label) {
    const labelStr = ` ${label} `;
    const halfLen = Math.floor((termWidth - labelStr.length) / 2);
    const leftDash = dim('─'.repeat(Math.max(0, halfLen)));
    const rightDash = dim('─'.repeat(Math.max(0, termWidth - halfLen - labelStr.length)));
    return `${leftDash}${dim(labelStr)}${rightDash}`;
  }
  return dim('─'.repeat(termWidth));
}

/**
 * 입력 프롬프트 렌더링 / Render input prompt
 *
 * @param text - 현재 입력 텍스트
 * @returns 프롬프트 문자열
 */
export function renderPrompt(text = ''): string {
  return `${cyan('❯')} ${text}`;
}
