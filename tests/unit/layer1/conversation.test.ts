import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConsoleLogger } from '../../../src/core/logger.js';
import { MemoryRepository } from '../../../src/core/memory.js';
import { ConversationManager } from '../../../src/layer1/conversation.js';
import type { ConversationMessage } from '../../../src/layer1/types.js';

function createTestMessage(overrides: Partial<ConversationMessage> = {}): ConversationMessage {
  return {
    id: overrides.id ?? `msg-${crypto.randomUUID()}`,
    role: overrides.role ?? 'user',
    content: overrides.content ?? '테스트 메시지 내용',
    timestamp: overrides.timestamp ?? new Date('2026-03-04T00:00:00Z'),
    projectId: overrides.projectId ?? 'proj-test',
  };
}

describe('ConversationManager', () => {
  let tempDir: string;
  let memoryRepo: MemoryRepository;
  let manager: ConversationManager;
  const logger = new ConsoleLogger('error');

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'adev-conv-test-'));
    memoryRepo = new MemoryRepository(tempDir, logger);
    await memoryRepo.initialize();
    manager = new ConversationManager(memoryRepo, logger);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // ── addMessage ──────────────────────────────────────────────

  describe('addMessage', () => {
    it('user 메시지를 저장한다', async () => {
      const msg = createTestMessage({ role: 'user', content: 'Hello' });
      const result = await manager.addMessage(msg);

      expect(result.ok).toBe(true);
    });

    it('assistant 메시지를 저장한다', async () => {
      const msg = createTestMessage({ role: 'assistant', content: 'Hi there' });
      const result = await manager.addMessage(msg);

      expect(result.ok).toBe(true);
    });

    it('빈 내용의 메시지도 저장된다', async () => {
      const msg = createTestMessage({ content: '' });
      const result = await manager.addMessage(msg);

      expect(result.ok).toBe(true);
    });

    it('서로 다른 프로젝트 메시지를 각각 저장한다', async () => {
      const msg1 = createTestMessage({ projectId: 'proj-a' });
      const msg2 = createTestMessage({ projectId: 'proj-b' });

      const r1 = await manager.addMessage(msg1);
      const r2 = await manager.addMessage(msg2);

      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
    });
  });

  // ── getHistory ──────────────────────────────────────────────

  describe('getHistory', () => {
    it('저장된 메시지를 조회한다', async () => {
      const msg = createTestMessage({ content: '첫 번째 메시지' });
      await manager.addMessage(msg);

      const result = await manager.getHistory('proj-test');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('메시지가 없으면 빈 배열을 반환한다', async () => {
      const result = await manager.getHistory('proj-empty');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    it('role이 올바르게 복원된다', async () => {
      const userMsg = createTestMessage({ role: 'user', content: '질문' });
      const assistantMsg = createTestMessage({ role: 'assistant', content: '답변' });

      await manager.addMessage(userMsg);
      await manager.addMessage(assistantMsg);

      const result = await manager.getHistory('proj-test');

      expect(result.ok).toBe(true);
      if (result.ok) {
        const roles = result.value.map((m) => m.role);
        expect(roles).toContain('user');
        expect(roles).toContain('assistant');
      }
    });
  });

  // ── searchContext ───────────────────────────────────────────

  describe('searchContext', () => {
    it('쿼리와 매칭되는 메시지를 반환한다', async () => {
      const msg = createTestMessage({ content: '인증 시스템 구현' });
      await manager.addMessage(msg);

      const result = await manager.searchContext('proj-test', '인증');

      expect(result.ok).toBe(true);
      if (result.ok) {
        const found = result.value.some((m) => m.content.includes('인증'));
        expect(found).toBe(true);
      }
    });

    it('매칭되지 않으면 빈 배열을 반환한다', async () => {
      const msg = createTestMessage({ content: '데이터베이스 설정' });
      await manager.addMessage(msg);

      const result = await manager.searchContext('proj-test', 'xyz-nonexistent');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    it('대소문자를 구분하지 않고 검색한다', async () => {
      const msg = createTestMessage({ content: 'Authentication Module' });
      await manager.addMessage(msg);

      const result = await manager.searchContext('proj-test', 'authentication');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('다른 프로젝트의 메시지는 반환하지 않는다', async () => {
      const msg = createTestMessage({ projectId: 'proj-other', content: '특별한 내용' });
      await manager.addMessage(msg);

      const result = await manager.searchContext('proj-test', '특별한');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });
  });
});
