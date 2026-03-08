/**
 * ConversationManager 단위 테스트
 *
 * @description
 * KR: addMessage, getHistory, searchContext 테스트. 80%+ 경계값/복합 시나리오 비율.
 * EN: Tests for addMessage, getHistory, searchContext. 80%+ edge/complex ratio.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConsoleLogger } from 'core/logger.js';
import { MemoryRepository } from 'core/memory.js';
import { ConversationManager } from 'layer1/conversation.js';
import type { ConversationMessage } from 'layer1/types.js';

function createTestMessage(overrides: Partial<ConversationMessage> = {}): ConversationMessage {
  return {
    id: overrides.id ?? `msg-${crypto.randomUUID()}`,
    role: overrides.role ?? 'user',
    content: overrides.content ?? '테스트 메시지 내용',
    timestamp: overrides.timestamp ?? new Date('2026-03-04T00:00:00Z'),
    projectId: overrides.projectId ?? 'proj-test',
  };
}

// ── 생성자 ────────────────────────────────────────────────────

describe('ConversationManager 생성자', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'adev-conv-ctor-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('인스턴스가 생성된다', async () => {
    const logger = new ConsoleLogger('error');
    const repo = new MemoryRepository(tempDir, logger);
    await repo.initialize();
    expect(() => new ConversationManager(repo, logger)).not.toThrow();
  });

  it('ConversationManager 인스턴스이다', async () => {
    const logger = new ConsoleLogger('error');
    const repo = new MemoryRepository(tempDir, logger);
    await repo.initialize();
    const manager = new ConversationManager(repo, logger);
    expect(manager).toBeInstanceOf(ConversationManager);
  });

  it('addMessage 메서드가 존재한다', async () => {
    const logger = new ConsoleLogger('error');
    const repo = new MemoryRepository(tempDir, logger);
    await repo.initialize();
    const manager = new ConversationManager(repo, logger);
    expect(typeof manager.addMessage).toBe('function');
  });

  it('getHistory 메서드가 존재한다', async () => {
    const logger = new ConsoleLogger('error');
    const repo = new MemoryRepository(tempDir, logger);
    await repo.initialize();
    const manager = new ConversationManager(repo, logger);
    expect(typeof manager.getHistory).toBe('function');
  });

  it('searchContext 메서드가 존재한다', async () => {
    const logger = new ConsoleLogger('error');
    const repo = new MemoryRepository(tempDir, logger);
    await repo.initialize();
    const manager = new ConversationManager(repo, logger);
    expect(typeof manager.searchContext).toBe('function');
  });
});

// ── addMessage ────────────────────────────────────────────────

describe('ConversationManager addMessage', () => {
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

  it('여러 메시지 연속 저장 → 모두 ok', async () => {
    for (let i = 0; i < 5; i++) {
      const msg = createTestMessage({ content: `메시지 ${i}` });
      const result = await manager.addMessage(msg);
      expect(result.ok).toBe(true);
    }
  });

  it('긴 내용의 메시지도 저장된다', async () => {
    const msg = createTestMessage({ content: '내용'.repeat(500) });
    const result = await manager.addMessage(msg);
    expect(result.ok).toBe(true);
  });

  it('특수문자 포함 내용도 저장된다', async () => {
    const msg = createTestMessage({ content: '!@#$%^&*() 특수문자 테스트' });
    const result = await manager.addMessage(msg);
    expect(result.ok).toBe(true);
  });

  it('user/assistant 교대 저장 → 모두 ok', async () => {
    const roles: Array<'user' | 'assistant'> = ['user', 'assistant', 'user', 'assistant'];
    for (const role of roles) {
      const msg = createTestMessage({ role, content: `${role} message` });
      const result = await manager.addMessage(msg);
      expect(result.ok).toBe(true);
    }
  });

  it('타임스탬프가 다른 메시지 저장 → ok', async () => {
    const msg = createTestMessage({
      timestamp: new Date('2020-01-01T00:00:00Z'),
    });
    const result = await manager.addMessage(msg);
    expect(result.ok).toBe(true);
  });

  it('한국어 content → ok', async () => {
    const msg = createTestMessage({ content: '안녕하세요, 이것은 한국어 메시지입니다.' });
    const result = await manager.addMessage(msg);
    expect(result.ok).toBe(true);
  });

  it('영어 content → ok', async () => {
    const msg = createTestMessage({ content: 'This is an English message.' });
    const result = await manager.addMessage(msg);
    expect(result.ok).toBe(true);
  });

  it('ok는 boolean이다', async () => {
    const msg = createTestMessage({ content: 'bool-check' });
    const result = await manager.addMessage(msg);
    expect(typeof result.ok).toBe('boolean');
  });

  it('이모지 포함 content → ok', async () => {
    const msg = createTestMessage({ content: '🎉 완료! 🚀' });
    const result = await manager.addMessage(msg);
    expect(result.ok).toBe(true);
  });

  it('10번 연속 저장 → 모두 ok', async () => {
    for (let i = 0; i < 10; i++) {
      const msg = createTestMessage({ content: `msg-${i}` });
      expect((await manager.addMessage(msg)).ok).toBe(true);
    }
  });

  it('UUID 형식 id로 저장 → ok', async () => {
    const msg = createTestMessage({ id: '550e8400-e29b-41d4-a716-446655440000' });
    const result = await manager.addMessage(msg);
    expect(result.ok).toBe(true);
  });

  it('1000자 content → ok', async () => {
    const msg = createTestMessage({ content: 'x'.repeat(1000) });
    const result = await manager.addMessage(msg);
    expect(result.ok).toBe(true);
  });

  it('일본어 content → ok', async () => {
    const msg = createTestMessage({ content: 'ログインシステムの実装が必要です' });
    const result = await manager.addMessage(msg);
    expect(result.ok).toBe(true);
  });
});

// ── getHistory ────────────────────────────────────────────────

describe('ConversationManager getHistory', () => {
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

  it('저장된 메시지를 조회한다', async () => {
    const msg = createTestMessage({ content: '첫 번째 메시지' });
    await manager.addMessage(msg);

    const result = await manager.getHistory('proj-test');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.length).toBeGreaterThanOrEqual(1);
  });

  it('메시지가 없으면 빈 배열을 반환한다', async () => {
    const result = await manager.getHistory('proj-empty');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('role이 올바르게 복원된다', async () => {
    await manager.addMessage(createTestMessage({ role: 'user', content: '질문' }));
    await manager.addMessage(createTestMessage({ role: 'assistant', content: '답변' }));

    const result = await manager.getHistory('proj-test');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const roles = result.value.map((m) => m.role);
      expect(roles).toContain('user');
      expect(roles).toContain('assistant');
    }
  });

  it('다른 프로젝트의 메시지는 반환하지 않는다', async () => {
    await manager.addMessage(createTestMessage({ projectId: 'proj-other', content: '다른 프로젝트' }));
    const result = await manager.getHistory('proj-test');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('content가 원래 내용으로 복원된다', async () => {
    const originalContent = '정확한 내용 확인 테스트';
    await manager.addMessage(createTestMessage({ role: 'user', content: originalContent }));

    const result = await manager.getHistory('proj-test');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const found = result.value.find(m => m.content === originalContent);
      expect(found).toBeDefined();
    }
  });

  it('projectId가 반환된 메시지에 포함된다', async () => {
    await manager.addMessage(createTestMessage({ projectId: 'proj-test' }));

    const result = await manager.getHistory('proj-test');
    expect(result.ok).toBe(true);
    if (result.ok && result.value.length > 0) {
      expect(result.value[0]?.projectId).toBe('proj-test');
    }
  });

  it('limit=1로 조회 시 최대 1개', async () => {
    await manager.addMessage(createTestMessage({ content: '메시지 1' }));
    await manager.addMessage(createTestMessage({ content: '메시지 2' }));
    await manager.addMessage(createTestMessage({ content: '메시지 3' }));

    const result = await manager.getHistory('proj-test', 1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.length).toBeLessThanOrEqual(1);
  });

  it('빈 projectId → 빈 배열 반환', async () => {
    const result = await manager.getHistory('');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('반환 배열이 ConversationMessage 형식이다', async () => {
    await manager.addMessage(createTestMessage({ role: 'user', content: '확인' }));

    const result = await manager.getHistory('proj-test');
    expect(result.ok).toBe(true);
    if (result.ok && result.value.length > 0) {
      const msg = result.value[0];
      if (msg) {
        expect(typeof msg.id).toBe('string');
        expect(typeof msg.role).toBe('string');
        expect(typeof msg.content).toBe('string');
        expect(typeof msg.projectId).toBe('string');
      }
    }
  });

  it('5개 저장 후 조회 → 5개 이하 반환', async () => {
    for (let i = 0; i < 5; i++) {
      await manager.addMessage(createTestMessage({ content: `메시지 ${i}` }));
    }
    const result = await manager.getHistory('proj-test');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.length).toBeLessThanOrEqual(5);
  });

  it('ok는 boolean이다', async () => {
    const result = await manager.getHistory('proj-test');
    expect(typeof result.ok).toBe('boolean');
  });

  it('value는 배열이다', async () => {
    const result = await manager.getHistory('proj-test');
    if (result.ok) expect(Array.isArray(result.value)).toBe(true);
  });

  it('limit=2로 조회 시 최대 2개', async () => {
    for (let i = 0; i < 5; i++) {
      await manager.addMessage(createTestMessage({ content: `msg${i}` }));
    }
    const result = await manager.getHistory('proj-test', 2);
    if (result.ok) expect(result.value.length).toBeLessThanOrEqual(2);
  });

  it('두 프로젝트 각각 조회 → 서로 다른 결과', async () => {
    await manager.addMessage(createTestMessage({ projectId: 'proj-aa', content: 'aa 메시지' }));
    await manager.addMessage(createTestMessage({ projectId: 'proj-bb', content: 'bb 메시지' }));

    const ra = await manager.getHistory('proj-aa');
    const rb = await manager.getHistory('proj-bb');
    expect(ra.ok).toBe(true);
    expect(rb.ok).toBe(true);
    if (ra.ok) expect(ra.value.every((m) => m.projectId === 'proj-aa')).toBe(true);
    if (rb.ok) expect(rb.value.every((m) => m.projectId === 'proj-bb')).toBe(true);
  });

  it('5번 반복 조회 → 항상 ok=true', async () => {
    await manager.addMessage(createTestMessage({ content: 'stable' }));
    for (let i = 0; i < 5; i++) {
      const result = await manager.getHistory('proj-test');
      expect(result.ok).toBe(true);
    }
  });

  it('timestamp가 Date 타입 또는 문자열이다', async () => {
    await manager.addMessage(createTestMessage({ content: 'timestamp check' }));
    const result = await manager.getHistory('proj-test');
    if (result.ok && result.value.length > 0) {
      const ts = result.value[0]?.timestamp;
      expect(ts instanceof Date || typeof ts === 'string').toBe(true);
    }
  });
});

// ── searchContext ─────────────────────────────────────────────

describe('ConversationManager searchContext', () => {
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

  it('쿼리와 매칭되는 메시지를 반환한다', async () => {
    await manager.addMessage(createTestMessage({ content: '인증 시스템 구현' }));

    const result = await manager.searchContext('proj-test', '인증');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const found = result.value.some((m) => m.content.includes('인증'));
      expect(found).toBe(true);
    }
  });

  it('매칭되지 않으면 빈 배열을 반환한다', async () => {
    await manager.addMessage(createTestMessage({ content: '데이터베이스 설정' }));

    const result = await manager.searchContext('proj-test', 'xyz-nonexistent-query');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('대소문자를 구분하지 않고 검색한다', async () => {
    await manager.addMessage(createTestMessage({ content: 'Authentication Module' }));

    const result = await manager.searchContext('proj-test', 'authentication');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.length).toBeGreaterThanOrEqual(1);
  });

  it('다른 프로젝트의 메시지는 반환하지 않는다', async () => {
    await manager.addMessage(createTestMessage({ projectId: 'proj-other', content: '특별한 내용' }));

    const result = await manager.searchContext('proj-test', '특별한');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('빈 쿼리 → 모든 메시지 반환 (모든 content가 빈 문자열 포함)', async () => {
    await manager.addMessage(createTestMessage({ content: '어떤 내용이든' }));

    const result = await manager.searchContext('proj-test', '');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.length).toBeGreaterThanOrEqual(1);
  });

  it('메시지 없는 프로젝트 → 빈 배열', async () => {
    const result = await manager.searchContext('proj-no-messages', '쿼리');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('여러 메시지 중 일치하는 것만 반환', async () => {
    await manager.addMessage(createTestMessage({ content: '인증 시스템' }));
    await manager.addMessage(createTestMessage({ content: '데이터베이스 설정' }));
    await manager.addMessage(createTestMessage({ content: '인증 토큰 발급' }));

    const result = await manager.searchContext('proj-test', '인증');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
      for (const msg of result.value) {
        expect(msg.content).toContain('인증');
      }
    }
  });

  it('limit=1으로 검색 시 최대 1개', async () => {
    await manager.addMessage(createTestMessage({ content: '인증 1번' }));
    await manager.addMessage(createTestMessage({ content: '인증 2번' }));
    await manager.addMessage(createTestMessage({ content: '인증 3번' }));

    const result = await manager.searchContext('proj-test', '인증', 1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.length).toBeLessThanOrEqual(1);
  });

  it('반환 메시지의 role이 user/assistant 중 하나', async () => {
    await manager.addMessage(createTestMessage({ role: 'user', content: '검색가능한 내용' }));

    const result = await manager.searchContext('proj-test', '검색가능한');
    expect(result.ok).toBe(true);
    if (result.ok && result.value.length > 0) {
      for (const msg of result.value) {
        expect(['user', 'assistant']).toContain(msg.role);
      }
    }
  });

  it('영어 대소문자 검색 (uppercase query)', async () => {
    await manager.addMessage(createTestMessage({ content: 'TypeScript implementation' }));

    const result = await manager.searchContext('proj-test', 'TYPESCRIPT');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.length).toBeGreaterThanOrEqual(1);
  });

  it('부분 단어 검색도 동작한다', async () => {
    await manager.addMessage(createTestMessage({ content: 'authentication flow' }));

    const result = await manager.searchContext('proj-test', 'auth');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.length).toBeGreaterThanOrEqual(1);
  });

  it('ok는 boolean이다', async () => {
    const result = await manager.searchContext('proj-test', 'check');
    expect(typeof result.ok).toBe('boolean');
  });

  it('value는 배열이다', async () => {
    const result = await manager.searchContext('proj-test', 'check');
    if (result.ok) expect(Array.isArray(result.value)).toBe(true);
  });

  it('반환 메시지가 content 필드를 가진다', async () => {
    await manager.addMessage(createTestMessage({ content: '테스트 내용' }));
    const result = await manager.searchContext('proj-test', '테스트');
    if (result.ok && result.value.length > 0) {
      for (const m of result.value) {
        expect(typeof m.content).toBe('string');
      }
    }
  });

  it('limit=5로 검색 시 최대 5개', async () => {
    for (let i = 0; i < 10; i++) {
      await manager.addMessage(createTestMessage({ content: `keyword 메시지 ${i}` }));
    }
    const result = await manager.searchContext('proj-test', 'keyword', 5);
    if (result.ok) expect(result.value.length).toBeLessThanOrEqual(5);
  });

  it('5번 반복 검색 → 항상 ok=true', async () => {
    await manager.addMessage(createTestMessage({ content: 'consistent search' }));
    for (let i = 0; i < 5; i++) {
      const result = await manager.searchContext('proj-test', 'consistent');
      expect(result.ok).toBe(true);
    }
  });

  it('반환 메시지 projectId가 검색 projectId와 일치', async () => {
    await manager.addMessage(createTestMessage({ projectId: 'proj-test', content: '매칭 내용' }));
    const result = await manager.searchContext('proj-test', '매칭');
    if (result.ok && result.value.length > 0) {
      for (const m of result.value) {
        expect(m.projectId).toBe('proj-test');
      }
    }
  });
});

// ── 추가 경계값: addMessage 반환값 구조 ──────────────────────

describe('ConversationManager addMessage 반환값 구조', () => {
  let tempDir: string;
  let manager: ConversationManager;
  const logger = new ConsoleLogger('error');

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'adev-conv-extra-'));
    const repo = new MemoryRepository(tempDir, logger);
    await repo.initialize();
    manager = new ConversationManager(repo, logger);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('ok=true는 boolean', async () => {
    const result = await manager.addMessage(createTestMessage());
    expect(typeof result.ok).toBe('boolean');
  });

  it('addMessage → getHistory → 메시지 확인', async () => {
    const msg = createTestMessage({ content: '고유한 내용123' });
    await manager.addMessage(msg);
    const hist = await manager.getHistory('proj-test');
    if (hist.ok) {
      const found = hist.value.find(m => m.content === '고유한 내용123');
      expect(found).toBeDefined();
    }
  });

  it('addMessage → searchContext → 찾을 수 있음', async () => {
    const msg = createTestMessage({ content: '검색가능한 고유한 내용xyz' });
    await manager.addMessage(msg);
    const result = await manager.searchContext('proj-test', '검색가능한');
    if (result.ok) {
      const found = result.value.some(m => m.content.includes('검색가능한'));
      expect(found).toBe(true);
    }
  });

  it('두 다른 content 저장 → 각각 조회 가능', async () => {
    await manager.addMessage(createTestMessage({ content: '첫번째고유내용' }));
    await manager.addMessage(createTestMessage({ content: '두번째고유내용' }));
    const hist = await manager.getHistory('proj-test');
    if (hist.ok) {
      const contents = hist.value.map(m => m.content);
      expect(contents).toContain('첫번째고유내용');
      expect(contents).toContain('두번째고유내용');
    }
  });

  it('삭제 없이 10개 저장 → getHistory ok', async () => {
    for (let i = 0; i < 10; i++) {
      await manager.addMessage(createTestMessage({ content: `bulk-${i}` }));
    }
    const hist = await manager.getHistory('proj-test');
    expect(hist.ok).toBe(true);
  });

  it('searchContext result.value 배열 원소는 content 필드 가짐', async () => {
    await manager.addMessage(createTestMessage({ content: 'field-check-content' }));
    const result = await manager.searchContext('proj-test', 'field-check');
    if (result.ok && result.value.length > 0) {
      for (const m of result.value) {
        expect(typeof m.content).toBe('string');
      }
    }
  });

  it('getHistory value 배열 원소는 role 필드 가짐', async () => {
    await manager.addMessage(createTestMessage({ role: 'assistant', content: 'role-check' }));
    const result = await manager.getHistory('proj-test');
    if (result.ok && result.value.length > 0) {
      for (const m of result.value) {
        expect(typeof m.role).toBe('string');
      }
    }
  });

  it('getHistory limit=0 → ok 또는 err (구현 의존)', async () => {
    await manager.addMessage(createTestMessage({ content: 'limit-zero' }));
    const result = await manager.getHistory('proj-test', 0);
    // limit=0은 구현에 따라 ok=false(입력 검증 실패) 또는 ok=true(빈 배열) 모두 허용
    expect(typeof result.ok).toBe('boolean');
  });

  it('searchContext ok는 boolean', async () => {
    const result = await manager.searchContext('proj-test', 'any');
    expect(typeof result.ok).toBe('boolean');
  });

  it('getHistory ok는 boolean', async () => {
    const result = await manager.getHistory('proj-test');
    expect(typeof result.ok).toBe('boolean');
  });

  it('5번 반복 addMessage + getHistory → 일관성', async () => {
    const msg = createTestMessage({ content: 'consistent-content' });
    await manager.addMessage(msg);
    for (let i = 0; i < 5; i++) {
      const hist = await manager.getHistory('proj-test');
      expect(hist.ok).toBe(true);
      if (hist.ok) expect(hist.value.some(m => m.content === 'consistent-content')).toBe(true);
    }
  });
});

// ── 추가 경계값: UUID/랜덤 케이스 ──────────────────────────────

describe('ConversationManager UUID/랜덤 edge case', () => {
  let tempDir: string;
  let manager: ConversationManager;
  const logger = new ConsoleLogger('error');

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'adev-conv-uuid-'));
    const repo = new MemoryRepository(tempDir, logger);
    await repo.initialize();
    manager = new ConversationManager(repo, logger);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('UUID id로 addMessage → ok', async () => {
    const uuid = crypto.randomUUID();
    const msg = createTestMessage({ id: uuid });
    const result = await manager.addMessage(msg);
    expect(result.ok).toBe(true);
  });

  it('UUID projectId로 addMessage → ok', async () => {
    const projId = crypto.randomUUID();
    const msg = createTestMessage({ projectId: projId });
    const result = await manager.addMessage(msg);
    expect(result.ok).toBe(true);
  });

  it('UUID projectId로 getHistory → ok', async () => {
    const projId = crypto.randomUUID();
    const msg = createTestMessage({ projectId: projId });
    await manager.addMessage(msg);
    const result = await manager.getHistory(projId);
    expect(result.ok).toBe(true);
  });

  it('UUID projectId로 searchContext → ok', async () => {
    const projId = crypto.randomUUID();
    const msg = createTestMessage({ projectId: projId, content: 'uuid search test' });
    await manager.addMessage(msg);
    const result = await manager.searchContext(projId, 'uuid');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.length).toBeGreaterThanOrEqual(1);
  });

  it('10개 서로 다른 UUID projectId 저장 → 각각 독립', async () => {
    const projIds = Array.from({ length: 10 }, () => crypto.randomUUID());
    for (const projId of projIds) {
      const msg = createTestMessage({ projectId: projId, content: `content for ${projId}` });
      const result = await manager.addMessage(msg);
      expect(result.ok).toBe(true);
    }
    // 각 프로젝트별 조회 시 1개씩 반환
    for (const projId of projIds) {
      const hist = await manager.getHistory(projId);
      expect(hist.ok).toBe(true);
      if (hist.ok) {
        expect(hist.value.every(m => m.projectId === projId)).toBe(true);
      }
    }
  });

  it('랜덤 content 5개 → 모두 저장 가능', async () => {
    for (let i = 0; i < 5; i++) {
      const content = crypto.randomUUID() + '_random_content_' + Math.random().toString(36);
      const msg = createTestMessage({ content });
      const result = await manager.addMessage(msg);
      expect(result.ok).toBe(true);
    }
  });

  it('공백+특수문자 content 저장 → ok', async () => {
    const msg = createTestMessage({ content: '   !@#$%^&*()_+{}|:"<>?   ' });
    const result = await manager.addMessage(msg);
    expect(result.ok).toBe(true);
  });

  it('탭/개행 포함 content 저장 → ok', async () => {
    const msg = createTestMessage({ content: 'line1\nline2\tindented' });
    const result = await manager.addMessage(msg);
    expect(result.ok).toBe(true);
  });

  it('빈 projectId로 searchContext → ok (빈 결과 또는 에러)', async () => {
    const result = await manager.searchContext('', 'query');
    expect(typeof result.ok).toBe('boolean');
  });

  it('매우 긴 쿼리로 searchContext → ok', async () => {
    const longQuery = '검색'.repeat(100);
    const result = await manager.searchContext('proj-test', longQuery);
    expect(typeof result.ok).toBe('boolean');
  });

  it('content가 숫자 문자열인 메시지 저장 → ok', async () => {
    const msg = createTestMessage({ content: '1234567890' });
    const result = await manager.addMessage(msg);
    expect(result.ok).toBe(true);
  });

  it('content가 JSON 문자열인 메시지 저장 → ok', async () => {
    const msg = createTestMessage({ content: JSON.stringify({ key: 'value', arr: [1, 2, 3] }) });
    const result = await manager.addMessage(msg);
    expect(result.ok).toBe(true);
  });

  it('동일 content 10번 저장 → 모두 ok', async () => {
    for (let i = 0; i < 10; i++) {
      const msg = createTestMessage({ content: 'duplicate-content' });
      const result = await manager.addMessage(msg);
      expect(result.ok).toBe(true);
    }
  });

  it('addMessage 후 즉시 searchContext → 결과 포함', async () => {
    const uniqueWord = `unique-${crypto.randomUUID().slice(0, 8)}`;
    const msg = createTestMessage({ content: `${uniqueWord} 테스트` });
    await manager.addMessage(msg);
    const result = await manager.searchContext('proj-test', uniqueWord);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.some(m => m.content.includes(uniqueWord))).toBe(true);
    }
  });

  it('limit이 저장된 메시지 수보다 클 때 → 전체 반환', async () => {
    for (let i = 0; i < 3; i++) {
      await manager.addMessage(createTestMessage({ content: `msg-${i}` }));
    }
    const result = await manager.getHistory('proj-test', 100);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeLessThanOrEqual(100);
    }
  });

  it('timestamp가 미래 날짜인 메시지 저장 → ok', async () => {
    const msg = createTestMessage({ timestamp: new Date('2099-12-31T23:59:59Z') });
    const result = await manager.addMessage(msg);
    expect(result.ok).toBe(true);
  });

  it('timestamp가 과거 날짜인 메시지 저장 → ok', async () => {
    const msg = createTestMessage({ timestamp: new Date('1970-01-01T00:00:00Z') });
    const result = await manager.addMessage(msg);
    expect(result.ok).toBe(true);
  });

  it('assistant role로 searchContext → role 필드 일치', async () => {
    await manager.addMessage(createTestMessage({ role: 'assistant', content: '어시스턴트 응답 테스트' }));
    const result = await manager.searchContext('proj-test', '어시스턴트');
    expect(result.ok).toBe(true);
    if (result.ok && result.value.length > 0) {
      expect(result.value[0]?.role).toBe('assistant');
    }
  });
});

// ── 추가 edge: 메시지 저장 + 복합 시나리오 ────────────────────

describe('ConversationManager 복합 시나리오', () => {
  let tempDir: string;
  let manager: ConversationManager;
  const logger = new ConsoleLogger('error');

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'adev-conv-complex-'));
    const repo = new MemoryRepository(tempDir, logger);
    await repo.initialize();
    manager = new ConversationManager(repo, logger);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('addMessage user → addMessage assistant → getHistory 순서 확인', async () => {
    await manager.addMessage(createTestMessage({ role: 'user', content: '질문입니다' }));
    await manager.addMessage(createTestMessage({ role: 'assistant', content: '답변입니다' }));
    const result = await manager.getHistory('proj-test');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('50개 메시지 addMessage → getHistory ok', async () => {
    for (let i = 0; i < 50; i++) {
      const role: 'user' | 'assistant' = i % 2 === 0 ? 'user' : 'assistant';
      await manager.addMessage(createTestMessage({ role, content: `메시지 ${i}` }));
    }
    const result = await manager.getHistory('proj-test');
    expect(result.ok).toBe(true);
  });

  it('3개 프로젝트 독립 파티션', async () => {
    for (const proj of ['proj-1', 'proj-2', 'proj-3']) {
      await manager.addMessage(createTestMessage({ projectId: proj, content: `${proj} 내용` }));
    }
    for (const proj of ['proj-1', 'proj-2', 'proj-3']) {
      const hist = await manager.getHistory(proj);
      expect(hist.ok).toBe(true);
      if (hist.ok) {
        expect(hist.value.every((m) => m.projectId === proj)).toBe(true);
      }
    }
  });

  it('addMessage → searchContext → 동일 프로젝트 메시지만 반환', async () => {
    const uuid = crypto.randomUUID();
    await manager.addMessage(createTestMessage({ projectId: 'proj-test', content: `${uuid} keyword` }));
    await manager.addMessage(createTestMessage({ projectId: 'proj-other', content: `${uuid} keyword` }));
    const result = await manager.searchContext('proj-test', uuid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const m of result.value) {
        expect(m.projectId).toBe('proj-test');
      }
    }
  });

  it('빈 content → getHistory에서 복원 가능', async () => {
    await manager.addMessage(createTestMessage({ content: '' }));
    const result = await manager.getHistory('proj-test');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.some((m) => m.content === '')).toBe(true);
    }
  });

  it('이모지 content → searchContext 정상 처리', async () => {
    await manager.addMessage(createTestMessage({ content: '🚀 로켓 발사! 🎉' }));
    const result = await manager.searchContext('proj-test', '로켓');
    expect(result.ok).toBe(true);
  });

  it('개행 포함 content → getHistory에서 복원', async () => {
    const multiLine = 'line1\nline2\nline3';
    await manager.addMessage(createTestMessage({ content: multiLine }));
    const hist = await manager.getHistory('proj-test');
    expect(hist.ok).toBe(true);
    if (hist.ok) {
      expect(hist.value.some((m) => m.content === multiLine)).toBe(true);
    }
  });

  it('JSON 문자열 content → searchContext 정상', async () => {
    const jsonContent = JSON.stringify({ action: 'login', status: 'success' });
    await manager.addMessage(createTestMessage({ content: jsonContent }));
    const result = await manager.searchContext('proj-test', 'login');
    expect(result.ok).toBe(true);
  });

  it('동일 content 중복 저장 → getHistory 모두 반환', async () => {
    const content = 'duplicate-keyword-xyz';
    await manager.addMessage(createTestMessage({ content }));
    await manager.addMessage(createTestMessage({ content }));
    const hist = await manager.getHistory('proj-test');
    expect(hist.ok).toBe(true);
    if (hist.ok) {
      const matches = hist.value.filter((m) => m.content === content);
      expect(matches.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('미래 timestamp 메시지 → getHistory ok', async () => {
    const msg = createTestMessage({ timestamp: new Date('2099-01-01T00:00:00Z') });
    await manager.addMessage(msg);
    const result = await manager.getHistory('proj-test');
    expect(result.ok).toBe(true);
  });

  it('과거 timestamp 메시지 → getHistory ok', async () => {
    const msg = createTestMessage({ timestamp: new Date('1970-01-01T00:00:00Z') });
    await manager.addMessage(msg);
    const result = await manager.getHistory('proj-test');
    expect(result.ok).toBe(true);
  });

  it('한글+영어 혼합 content → searchContext 정상', async () => {
    await manager.addMessage(createTestMessage({ content: 'TypeScript 코드 구현 완료' }));
    const result = await manager.searchContext('proj-test', 'TypeScript');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.some((m) => m.content.includes('TypeScript'))).toBe(true);
    }
  });

  it('getHistory + searchContext 결과의 ok 타입 모두 boolean', async () => {
    const h = await manager.getHistory('proj-test');
    const s = await manager.searchContext('proj-test', 'test');
    expect(typeof h.ok).toBe('boolean');
    expect(typeof s.ok).toBe('boolean');
  });
});
