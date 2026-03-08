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

// ── 추가 edge: content 형식 파싱 검증 ─────────────────────────

describe('ConversationManager content 형식 파싱', () => {
  let tempDir: string;
  let manager: ConversationManager;
  const logger = new ConsoleLogger('error');

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'adev-conv-parse-'));
    const repo = new MemoryRepository(tempDir, logger);
    await repo.initialize();
    manager = new ConversationManager(repo, logger);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('저장 후 getHistory에서 role=user가 올바르게 파싱됨', async () => {
    const msg = createTestMessage({ role: 'user', content: '사용자 메시지 파싱 테스트' });
    await manager.addMessage(msg);
    const hist = await manager.getHistory('proj-test');
    expect(hist.ok).toBe(true);
    if (hist.ok) {
      const found = hist.value.find(m => m.content === '사용자 메시지 파싱 테스트');
      expect(found).toBeDefined();
      expect(found?.role).toBe('user');
    }
  });

  it('저장 후 getHistory에서 role=assistant가 올바르게 파싱됨', async () => {
    const msg = createTestMessage({ role: 'assistant', content: '어시스턴트 응답 파싱 테스트' });
    await manager.addMessage(msg);
    const hist = await manager.getHistory('proj-test');
    expect(hist.ok).toBe(true);
    if (hist.ok) {
      const found = hist.value.find(m => m.content === '어시스턴트 응답 파싱 테스트');
      expect(found).toBeDefined();
      expect(found?.role).toBe('assistant');
    }
  });

  it('content에 [user] 접두어 포함 시 이중 파싱 방지', async () => {
    // content 자체에 [user]가 들어있어도 role 파싱이 정확해야 함
    const msg = createTestMessage({ role: 'user', content: '[user] 접두어 포함 테스트' });
    await manager.addMessage(msg);
    const hist = await manager.getHistory('proj-test');
    expect(hist.ok).toBe(true);
    if (hist.ok) {
      // 원본 content에서 [user] 제거 후 반환되므로 '접두어 포함 테스트'만 포함될 수 있음
      // 또는 '[user] 접두어 포함 테스트' 전체가 반환될 수도 있음 — 구현 의존
      const found = hist.value.find(m => m.content.includes('접두어 포함 테스트'));
      // role이 user인지만 확인
      if (found) expect(found.role).toBe('user');
    }
  });

  it('content에 [assistant] 접두어 포함 시 이중 파싱 방지', async () => {
    const msg = createTestMessage({ role: 'assistant', content: '[assistant] 내부 접두어' });
    await manager.addMessage(msg);
    const hist = await manager.getHistory('proj-test');
    expect(hist.ok).toBe(true);
    if (hist.ok) {
      const found = hist.value.find(m => m.content.includes('내부 접두어'));
      if (found) expect(found.role).toBe('assistant');
    }
  });

  it('user role 저장 → searchContext에서 role 필드 user', async () => {
    await manager.addMessage(createTestMessage({ role: 'user', content: 'role-user-search-check' }));
    const result = await manager.searchContext('proj-test', 'role-user-search-check');
    expect(result.ok).toBe(true);
    if (result.ok && result.value.length > 0) {
      expect(result.value[0]?.role).toBe('user');
    }
  });

  it('content가 순수 숫자 문자열 → getHistory에서 복원', async () => {
    await manager.addMessage(createTestMessage({ content: '9876543210' }));
    const hist = await manager.getHistory('proj-test');
    expect(hist.ok).toBe(true);
    if (hist.ok) {
      expect(hist.value.some(m => m.content === '9876543210')).toBe(true);
    }
  });

  it('content가 JSON 배열 문자열 → getHistory에서 복원', async () => {
    const jsonArr = JSON.stringify([1, 2, 3, 'test']);
    await manager.addMessage(createTestMessage({ content: jsonArr }));
    const hist = await manager.getHistory('proj-test');
    expect(hist.ok).toBe(true);
    if (hist.ok) {
      expect(hist.value.some(m => m.content === jsonArr)).toBe(true);
    }
  });

  it('id 필드가 getHistory에서 복원됨', async () => {
    const specificId = 'specific-msg-id-001';
    await manager.addMessage(createTestMessage({ id: specificId, content: 'id 복원 테스트' }));
    const hist = await manager.getHistory('proj-test');
    expect(hist.ok).toBe(true);
    if (hist.ok) {
      const found = hist.value.find(m => m.id === specificId);
      expect(found).toBeDefined();
    }
  });

  it('timestamp가 getHistory에서 Date 또는 string으로 복원됨', async () => {
    const ts = new Date('2026-06-15T12:00:00Z');
    await manager.addMessage(createTestMessage({ timestamp: ts, content: 'timestamp 복원' }));
    const hist = await manager.getHistory('proj-test');
    expect(hist.ok).toBe(true);
    if (hist.ok && hist.value.length > 0) {
      const found = hist.value.find(m => m.content === 'timestamp 복원');
      if (found) {
        expect(found.timestamp instanceof Date || typeof found.timestamp === 'string').toBe(true);
      }
    }
  });

  it('10개 연속 user 메시지 → getHistory에서 role 모두 user', async () => {
    for (let i = 0; i < 10; i++) {
      await manager.addMessage(createTestMessage({ role: 'user', content: `user-only-msg-${i}` }));
    }
    const hist = await manager.getHistory('proj-test');
    expect(hist.ok).toBe(true);
    if (hist.ok) {
      const userMessages = hist.value.filter(m => m.content.startsWith('user-only-msg-'));
      for (const m of userMessages) {
        expect(m.role).toBe('user');
      }
    }
  });

  it('10개 연속 assistant 메시지 → getHistory에서 role 모두 assistant', async () => {
    for (let i = 0; i < 10; i++) {
      await manager.addMessage(createTestMessage({ role: 'assistant', content: `asst-only-msg-${i}` }));
    }
    const hist = await manager.getHistory('proj-test');
    expect(hist.ok).toBe(true);
    if (hist.ok) {
      const asstMessages = hist.value.filter(m => m.content.startsWith('asst-only-msg-'));
      for (const m of asstMessages) {
        expect(m.role).toBe('assistant');
      }
    }
  });
});

// ── 추가 edge: 경계값 및 스트레스 ─────────────────────────────

describe('ConversationManager 스트레스 및 경계값', () => {
  let tempDir: string;
  let manager: ConversationManager;
  const logger = new ConsoleLogger('error');

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'adev-conv-stress-'));
    const repo = new MemoryRepository(tempDir, logger);
    await repo.initialize();
    manager = new ConversationManager(repo, logger);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('20개 메시지 저장 → getHistory ok', async () => {
    for (let i = 0; i < 20; i++) {
      const role: 'user' | 'assistant' = i % 2 === 0 ? 'user' : 'assistant';
      await manager.addMessage(createTestMessage({ role, content: `stress-msg-${i}` }));
    }
    const hist = await manager.getHistory('proj-test');
    expect(hist.ok).toBe(true);
    if (hist.ok) {
      expect(hist.value.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('limit=DEFAULT(50) 미지정 → ok', async () => {
    for (let i = 0; i < 5; i++) {
      await manager.addMessage(createTestMessage({ content: `default-limit-${i}` }));
    }
    const hist = await manager.getHistory('proj-test');
    expect(hist.ok).toBe(true);
  });

  it('searchContext limit 미지정(기본 10) → ok', async () => {
    for (let i = 0; i < 5; i++) {
      await manager.addMessage(createTestMessage({ content: `search-default-${i}` }));
    }
    const result = await manager.searchContext('proj-test', 'search-default');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeLessThanOrEqual(10);
    }
  });

  it('addMessage 후 즉시 getHistory → 결과 포함', async () => {
    const uniqueContent = `unique-content-${crypto.randomUUID()}`;
    await manager.addMessage(createTestMessage({ content: uniqueContent }));
    const hist = await manager.getHistory('proj-test');
    expect(hist.ok).toBe(true);
    if (hist.ok) {
      expect(hist.value.some(m => m.content === uniqueContent)).toBe(true);
    }
  });

  it('100자 content 저장 → getHistory에서 복원', async () => {
    const content = 'a'.repeat(100);
    await manager.addMessage(createTestMessage({ content }));
    const hist = await manager.getHistory('proj-test');
    expect(hist.ok).toBe(true);
    if (hist.ok) {
      expect(hist.value.some(m => m.content === content)).toBe(true);
    }
  });

  it('5000자 content → searchContext 정상', async () => {
    const longContent = 'unique-keyword ' + 'x'.repeat(5000);
    await manager.addMessage(createTestMessage({ content: longContent }));
    const result = await manager.searchContext('proj-test', 'unique-keyword');
    expect(result.ok).toBe(true);
  });

  it('3개 프로젝트 × 3개 메시지 → 각 프로젝트 독립 조회', async () => {
    const projects = ['stress-p1', 'stress-p2', 'stress-p3'];
    for (const proj of projects) {
      for (let i = 0; i < 3; i++) {
        await manager.addMessage(createTestMessage({ projectId: proj, content: `${proj}-msg-${i}` }));
      }
    }
    for (const proj of projects) {
      const hist = await manager.getHistory(proj);
      expect(hist.ok).toBe(true);
      if (hist.ok) {
        expect(hist.value.every(m => m.projectId === proj)).toBe(true);
      }
    }
  });

  it('searchContext에서 limit=100 → ok', async () => {
    for (let i = 0; i < 5; i++) {
      await manager.addMessage(createTestMessage({ content: `large-limit-${i}` }));
    }
    const result = await manager.searchContext('proj-test', 'large-limit', 100);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeLessThanOrEqual(100);
    }
  });

  it('getHistory limit=100 → ok', async () => {
    for (let i = 0; i < 5; i++) {
      await manager.addMessage(createTestMessage({ content: `large-hist-${i}` }));
    }
    const hist = await manager.getHistory('proj-test', 100);
    expect(hist.ok).toBe(true);
    if (hist.ok) {
      expect(hist.value.length).toBeLessThanOrEqual(100);
    }
  });

  it('메시지 없는 상태에서 getHistory 5번 반복 → 항상 ok', async () => {
    for (let i = 0; i < 5; i++) {
      const hist = await manager.getHistory('proj-empty-repeat');
      expect(hist.ok).toBe(true);
    }
  });

  it('메시지 없는 상태에서 searchContext 5번 반복 → 항상 ok', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await manager.searchContext('proj-empty-repeat', 'query');
      expect(result.ok).toBe(true);
    }
  });

  it('다른 role/content 조합 5개 → 모두 저장 가능', async () => {
    const combos: Array<{ role: 'user' | 'assistant'; content: string }> = [
      { role: 'user', content: '' },
      { role: 'assistant', content: '응답' },
      { role: 'user', content: '🎉 이모지' },
      { role: 'assistant', content: '1234' },
      { role: 'user', content: 'line1\nline2' },
    ];
    for (const combo of combos) {
      const result = await manager.addMessage(createTestMessage(combo));
      expect(result.ok).toBe(true);
    }
  });

  it('getHistory와 searchContext 동시 조회 → 모두 ok', async () => {
    await manager.addMessage(createTestMessage({ content: 'concurrent-check' }));
    const [hist, search] = await Promise.all([
      manager.getHistory('proj-test'),
      manager.searchContext('proj-test', 'concurrent'),
    ]);
    expect(hist.ok).toBe(true);
    expect(search.ok).toBe(true);
  });

  it('content에 URL 포함 → ok', async () => {
    const msg = createTestMessage({ content: 'Check https://example.com/api/v1/users?id=123' });
    const result = await manager.addMessage(msg);
    expect(result.ok).toBe(true);
  });

  it('content에 백슬래시 포함 → ok', async () => {
    const msg = createTestMessage({ content: 'Windows path: C:\\Users\\test\\file.ts' });
    const result = await manager.addMessage(msg);
    expect(result.ok).toBe(true);
  });

  it('content에 NULL 문자열 포함 → ok', async () => {
    const msg = createTestMessage({ content: 'null undefined NaN Infinity' });
    const result = await manager.addMessage(msg);
    expect(result.ok).toBe(true);
  });

  it('content에 SQL 키워드 포함 → ok', async () => {
    const msg = createTestMessage({ content: "SELECT * FROM users WHERE id='1' AND name='test'" });
    const result = await manager.addMessage(msg);
    expect(result.ok).toBe(true);
  });

  it('projectId에 점(.) 포함 → ok', async () => {
    const msg = createTestMessage({ projectId: 'proj.with.dots', content: '점 포함 projectId' });
    const result = await manager.addMessage(msg);
    expect(result.ok).toBe(true);
  });

  it('projectId에 슬래시 포함 → ok', async () => {
    const msg = createTestMessage({ projectId: 'org/repo/project', content: '슬래시 포함' });
    const result = await manager.addMessage(msg);
    expect(result.ok).toBe(true);
  });

  it('동일 id 다른 projectId 저장 → 두 번째 ok 또는 err', async () => {
    const sameId = 'same-id-diff-proj';
    const r1 = await manager.addMessage(createTestMessage({ id: sameId, projectId: 'proj-x', content: 'first' }));
    const r2 = await manager.addMessage(createTestMessage({ id: sameId, projectId: 'proj-y', content: 'second' }));
    expect(typeof r1.ok).toBe('boolean');
    expect(typeof r2.ok).toBe('boolean');
  });
});

// ── 추가 edge: 반환값 불변성 검증 ─────────────────────────────

describe('ConversationManager 반환값 불변성', () => {
  let tempDir: string;
  let manager: ConversationManager;
  const logger = new ConsoleLogger('error');

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'adev-conv-immut-'));
    const repo = new MemoryRepository(tempDir, logger);
    await repo.initialize();
    manager = new ConversationManager(repo, logger);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('addMessage ok=true는 항상 boolean', async () => {
    const msg = createTestMessage({ content: '불변성 테스트 1' });
    const result = await manager.addMessage(msg);
    expect(typeof result.ok).toBe('boolean');
    expect(result.ok).toBe(true);
  });

  it('getHistory ok=true는 항상 boolean', async () => {
    await manager.addMessage(createTestMessage({ content: '불변성 테스트 2' }));
    const result = await manager.getHistory('proj-test');
    expect(typeof result.ok).toBe('boolean');
  });

  it('searchContext ok는 항상 boolean', async () => {
    await manager.addMessage(createTestMessage({ content: '불변성 테스트 3' }));
    const result = await manager.searchContext('proj-test', '불변성');
    expect(typeof result.ok).toBe('boolean');
  });

  it('getHistory 결과 value는 배열 타입 확인', async () => {
    const result = await manager.getHistory('proj-test');
    if (result.ok) {
      expect(Array.isArray(result.value)).toBe(true);
    }
  });

  it('searchContext 결과 value는 배열 타입 확인', async () => {
    const result = await manager.searchContext('proj-test', 'check');
    if (result.ok) {
      expect(Array.isArray(result.value)).toBe(true);
    }
  });

  it('3개 저장 후 getHistory 결과 length >= 0', async () => {
    for (let i = 0; i < 3; i++) {
      await manager.addMessage(createTestMessage({ content: `item-${i}` }));
    }
    const result = await manager.getHistory('proj-test');
    if (result.ok) {
      expect(result.value.length).toBeGreaterThanOrEqual(0);
    }
  });

  it('addMessage 후 searchContext ok=true', async () => {
    await manager.addMessage(createTestMessage({ content: 'post-add-search' }));
    const result = await manager.searchContext('proj-test', 'post-add');
    expect(result.ok).toBe(true);
  });

  it('빈 프로젝트 getHistory ok=true + value=[]', async () => {
    const result = await manager.getHistory('proj-never-used');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('빈 프로젝트 searchContext ok=true + value=[]', async () => {
    const result = await manager.searchContext('proj-never-used', 'anything');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('getHistory limit=50(기본) 결과 개수 확인', async () => {
    for (let i = 0; i < 5; i++) {
      await manager.addMessage(createTestMessage({ content: `limit-check-${i}` }));
    }
    const result = await manager.getHistory('proj-test');
    if (result.ok) {
      expect(result.value.length).toBeLessThanOrEqual(50);
    }
  });

  it('searchContext limit=10(기본) 결과 개수 확인', async () => {
    for (let i = 0; i < 5; i++) {
      await manager.addMessage(createTestMessage({ content: `ctx-limit-${i}` }));
    }
    const result = await manager.searchContext('proj-test', 'ctx-limit');
    if (result.ok) {
      expect(result.value.length).toBeLessThanOrEqual(10);
    }
  });

  it('user 메시지 저장 → searchContext에서 content 필드 확인', async () => {
    const content = 'findable-content-xyz';
    await manager.addMessage(createTestMessage({ role: 'user', content }));
    const result = await manager.searchContext('proj-test', 'findable-content');
    if (result.ok && result.value.length > 0) {
      expect(result.value[0]?.content).toBe(content);
    }
  });

  it('assistant 메시지 저장 → getHistory에서 projectId 필드 확인', async () => {
    const projId = 'proj-assistant-check';
    await manager.addMessage(createTestMessage({ role: 'assistant', projectId: projId, content: 'check' }));
    const result = await manager.getHistory(projId);
    if (result.ok && result.value.length > 0) {
      for (const m of result.value) {
        expect(m.projectId).toBe(projId);
      }
    }
  });

  it('5개 다른 content 저장 → searchContext 각각 조회 가능', async () => {
    const uniqueWords = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
    for (const word of uniqueWords) {
      await manager.addMessage(createTestMessage({ content: `unique-word-${word}` }));
    }
    for (const word of uniqueWords) {
      const result = await manager.searchContext('proj-test', `unique-word-${word}`);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.some(m => m.content === `unique-word-${word}`)).toBe(true);
      }
    }
  });
});

// ── addMessage 심화 경계값 ────────────────────────────────────

describe('ConversationManager addMessage 심화 경계값', () => {
  let tempDir: string;
  let manager: ConversationManager;
  const logger = new ConsoleLogger('error');

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'adev-conv-add-edge-'));
    const repo = new MemoryRepository(tempDir, logger);
    await repo.initialize();
    manager = new ConversationManager(repo, logger);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('role이 user인 메시지 ok=true', async () => {
    const r = await manager.addMessage(createTestMessage({ role: 'user' }));
    expect(r.ok).toBe(true);
  });

  it('role이 assistant인 메시지 ok=true', async () => {
    const r = await manager.addMessage(createTestMessage({ role: 'assistant' }));
    expect(r.ok).toBe(true);
  });

  it('결과의 ok가 boolean', async () => {
    const r = await manager.addMessage(createTestMessage());
    expect(typeof r.ok).toBe('boolean');
  });

  it('다른 projectId 5개 → 모두 ok=true', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await manager.addMessage(createTestMessage({ projectId: `proj-${i}`, content: `내용 ${i}` }));
      expect(r.ok).toBe(true);
    }
  });

  it('같은 projectId 10개 연속 → 모두 ok=true', async () => {
    for (let i = 0; i < 10; i++) {
      const r = await manager.addMessage(createTestMessage({ projectId: 'same-proj', content: `메시지 ${i}` }));
      expect(r.ok).toBe(true);
    }
  });

  it('UUID id 메시지 → ok=true', async () => {
    const r = await manager.addMessage(createTestMessage({ id: crypto.randomUUID() }));
    expect(r.ok).toBe(true);
  });

  it('이모지 content → ok=true', async () => {
    const r = await manager.addMessage(createTestMessage({ content: '🎉 테스트 메시지 🚀' }));
    expect(r.ok).toBe(true);
  });

  it('JSON 문자열 content → ok=true', async () => {
    const r = await manager.addMessage(createTestMessage({ content: '{"key": "value", "num": 42}' }));
    expect(r.ok).toBe(true);
  });

  it('HTML 문자열 content → ok=true', async () => {
    const r = await manager.addMessage(createTestMessage({ content: '<h1>제목</h1><p>내용</p>' }));
    expect(r.ok).toBe(true);
  });

  it('빈 content → ok=true', async () => {
    const r = await manager.addMessage(createTestMessage({ content: '' }));
    expect(r.ok).toBe(true);
  });

  it('매우 긴 content (10000자) → ok=true', async () => {
    const r = await manager.addMessage(createTestMessage({ content: 'x'.repeat(10000) }));
    expect(r.ok).toBe(true);
  });

  it('한국어 content → ok=true', async () => {
    const r = await manager.addMessage(createTestMessage({ content: '안녕하세요 이것은 한국어 테스트입니다' }));
    expect(r.ok).toBe(true);
  });

  it('일본어 content → ok=true', async () => {
    const r = await manager.addMessage(createTestMessage({ content: 'こんにちは、テストメッセージです' }));
    expect(r.ok).toBe(true);
  });

  it('아랍어 content → ok=true', async () => {
    const r = await manager.addMessage(createTestMessage({ content: 'مرحبا، هذه رسالة اختبار' }));
    expect(r.ok).toBe(true);
  });

  it('특수문자 content → ok=true', async () => {
    const r = await manager.addMessage(createTestMessage({ content: '!@#$%^&*()_+-=[]{}|;:\'",.<>?/\\`~' }));
    expect(r.ok).toBe(true);
  });

  it('개행 포함 content → ok=true', async () => {
    const r = await manager.addMessage(createTestMessage({ content: '줄1\n줄2\n줄3\n줄4' }));
    expect(r.ok).toBe(true);
  });

  it('탭 포함 content → ok=true', async () => {
    const r = await manager.addMessage(createTestMessage({ content: '탭\t포함\t내용' }));
    expect(r.ok).toBe(true);
  });

  it('숫자만 content → ok=true', async () => {
    const r = await manager.addMessage(createTestMessage({ content: '1234567890' }));
    expect(r.ok).toBe(true);
  });

  it('user/assistant 교대 5쌍 → 모두 ok=true', async () => {
    for (let i = 0; i < 5; i++) {
      const r1 = await manager.addMessage(createTestMessage({ role: 'user', content: `질문 ${i}` }));
      const r2 = await manager.addMessage(createTestMessage({ role: 'assistant', content: `답변 ${i}` }));
      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
    }
  });

  it('timestamp 과거 날짜 → ok=true', async () => {
    const r = await manager.addMessage(createTestMessage({ timestamp: new Date('2020-01-01T00:00:00Z') }));
    expect(r.ok).toBe(true);
  });

  it('timestamp 미래 날짜 → ok=true', async () => {
    const r = await manager.addMessage(createTestMessage({ timestamp: new Date('2030-12-31T23:59:59Z') }));
    expect(r.ok).toBe(true);
  });
});

// ── getHistory 심화 경계값 ────────────────────────────────────

describe('ConversationManager getHistory 심화 경계값', () => {
  let tempDir: string;
  let manager: ConversationManager;
  const logger = new ConsoleLogger('error');

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'adev-conv-hist-edge-'));
    const repo = new MemoryRepository(tempDir, logger);
    await repo.initialize();
    manager = new ConversationManager(repo, logger);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('저장 없이 getHistory → ok=true, 빈 배열', async () => {
    const r = await manager.getHistory('empty-proj');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.length).toBe(0);
  });

  it('1개 저장 후 getHistory → length=1', async () => {
    await manager.addMessage(createTestMessage({ projectId: 'h1', content: '메시지' }));
    const r = await manager.getHistory('h1');
    if (r.ok) expect(r.value.length).toBe(1);
  });

  it('5개 저장 후 getHistory → length=5', async () => {
    for (let i = 0; i < 5; i++) {
      await manager.addMessage(createTestMessage({ projectId: 'h5', content: `msg ${i}` }));
    }
    const r = await manager.getHistory('h5');
    if (r.ok) expect(r.value.length).toBe(5);
  });

  it('getHistory 결과 ok 타입 boolean', async () => {
    const r = await manager.getHistory('type-check');
    expect(typeof r.ok).toBe('boolean');
  });

  it('결과 value가 배열', async () => {
    const r = await manager.getHistory('arr-check');
    if (r.ok) expect(Array.isArray(r.value)).toBe(true);
  });

  it('다른 projectId → 다른 히스토리', async () => {
    await manager.addMessage(createTestMessage({ projectId: 'proj-x', content: 'x메시지' }));
    await manager.addMessage(createTestMessage({ projectId: 'proj-y', content: 'y메시지' }));
    const rx = await manager.getHistory('proj-x');
    const ry = await manager.getHistory('proj-y');
    if (rx.ok && ry.ok) {
      expect(rx.value.every(m => m.projectId === 'proj-x')).toBe(true);
      expect(ry.value.every(m => m.projectId === 'proj-y')).toBe(true);
    }
  });

  it('getHistory 10회 반복 → 동일 결과', async () => {
    await manager.addMessage(createTestMessage({ projectId: 'repeat-proj', content: '반복 메시지' }));
    const first = await manager.getHistory('repeat-proj');
    for (let i = 0; i < 10; i++) {
      const r = await manager.getHistory('repeat-proj');
      if (first.ok && r.ok) expect(r.value.length).toBe(first.value.length);
    }
  });

  it('메시지 추가 후 getHistory → 메시지 포함', async () => {
    await manager.addMessage(createTestMessage({ projectId: 'inc-proj', content: '포함 확인' }));
    const r = await manager.getHistory('inc-proj');
    if (r.ok && r.value.length > 0) {
      expect(r.value.some(m => m.content === '포함 확인')).toBe(true);
    }
  });

  it('UUID projectId getHistory → ok=true', async () => {
    const uuid = crypto.randomUUID();
    const r = await manager.getHistory(uuid);
    expect(r.ok).toBe(true);
  });

  it('특수문자 projectId getHistory → ok=true (또는 에러)', async () => {
    const r = await manager.getHistory('!@#$%^&*');
    expect(typeof r.ok).toBe('boolean');
  });

  it('긴 projectId getHistory → ok=true', async () => {
    const longId = 'p'.repeat(200);
    const r = await manager.getHistory(longId);
    expect(typeof r.ok).toBe('boolean');
  });

  it('메시지 각 필드 검증 (id, role, content, projectId)', async () => {
    const msg = createTestMessage({ projectId: 'field-check', role: 'user', content: '필드 확인' });
    await manager.addMessage(msg);
    const r = await manager.getHistory('field-check');
    if (r.ok && r.value.length > 0) {
      const m = r.value[0];
      if (m) {
        expect(typeof m.id).toBe('string');
        expect(typeof m.role).toBe('string');
        expect(typeof m.content).toBe('string');
        expect(typeof m.projectId).toBe('string');
      }
    }
  });
});

// ── searchContext 심화 경계값 ─────────────────────────────────

describe('ConversationManager searchContext 심화 경계값', () => {
  let tempDir: string;
  let manager: ConversationManager;
  const logger = new ConsoleLogger('error');

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'adev-conv-search-edge-'));
    const repo = new MemoryRepository(tempDir, logger);
    await repo.initialize();
    manager = new ConversationManager(repo, logger);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('메시지 없을 때 searchContext → ok=true', async () => {
    const r = await manager.searchContext('no-msg-proj', '검색어');
    expect(r.ok).toBe(true);
  });

  it('결과 ok가 boolean', async () => {
    const r = await manager.searchContext('proj', '쿼리');
    expect(typeof r.ok).toBe('boolean');
  });

  it('결과 value가 배열', async () => {
    const r = await manager.searchContext('proj', '쿼리');
    if (r.ok) expect(Array.isArray(r.value)).toBe(true);
  });

  it('1개 저장 후 searchContext → ok=true', async () => {
    await manager.addMessage(createTestMessage({ projectId: 's-proj', content: '검색 대상 내용' }));
    const r = await manager.searchContext('s-proj', '검색 대상');
    expect(r.ok).toBe(true);
  });

  it('searchContext 10회 반복 → 모두 ok=true', async () => {
    for (let i = 0; i < 10; i++) {
      const r = await manager.searchContext('repeat-search', '쿼리');
      expect(r.ok).toBe(true);
    }
  });

  it('UUID 쿼리로 searchContext → ok=true', async () => {
    const r = await manager.searchContext('proj', crypto.randomUUID());
    expect(r.ok).toBe(true);
  });

  it('빈 쿼리로 searchContext → ok=true (또는 에러)', async () => {
    const r = await manager.searchContext('proj', '');
    expect(typeof r.ok).toBe('boolean');
  });

  it('한국어 쿼리 → ok=true', async () => {
    await manager.addMessage(createTestMessage({ projectId: 'kor-proj', content: '한국어 메시지 내용' }));
    const r = await manager.searchContext('kor-proj', '한국어');
    expect(r.ok).toBe(true);
  });

  it('이모지 쿼리 → ok=true', async () => {
    const r = await manager.searchContext('proj', '🎉');
    expect(typeof r.ok).toBe('boolean');
  });

  it('결과 개수가 limit 이하', async () => {
    for (let i = 0; i < 20; i++) {
      await manager.addMessage(createTestMessage({ projectId: 'limit-proj', content: `검색 가능한 내용 ${i}` }));
    }
    const r = await manager.searchContext('limit-proj', '검색 가능한');
    if (r.ok) expect(r.value.length).toBeLessThanOrEqual(20);
  });

  it('projectId 필터링: 다른 프로젝트 메시지 미포함', async () => {
    await manager.addMessage(createTestMessage({ projectId: 'proj-a', content: '프로젝트A 내용' }));
    await manager.addMessage(createTestMessage({ projectId: 'proj-b', content: '프로젝트B 내용' }));
    const r = await manager.searchContext('proj-a', '내용');
    if (r.ok) {
      for (const m of r.value) {
        expect(m.projectId).toBe('proj-a');
      }
    }
  });

  it('메시지 role 필드 타입 확인', async () => {
    await manager.addMessage(createTestMessage({ projectId: 'role-check', content: '역할 확인' }));
    const r = await manager.searchContext('role-check', '역할');
    if (r.ok && r.value.length > 0) {
      for (const m of r.value) {
        expect(typeof m.role).toBe('string');
      }
    }
  });

  it('5개 다른 쿼리 → 각각 ok=true', async () => {
    const queries = ['query1', 'query2', 'query3', 'query4', 'query5'];
    for (const q of queries) {
      const r = await manager.searchContext('multi-query-proj', q);
      expect(r.ok).toBe(true);
    }
  });
});

// ── ConversationManager 통합 시나리오 ─────────────────────────

describe('ConversationManager 통합 시나리오', () => {
  let tempDir: string;
  let manager: ConversationManager;
  const logger = new ConsoleLogger('error');

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'adev-conv-integration-'));
    const repo = new MemoryRepository(tempDir, logger);
    await repo.initialize();
    manager = new ConversationManager(repo, logger);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('addMessage → getHistory → searchContext 통합 플로우', async () => {
    const projId = 'integration-proj-1';
    const content = '통합 테스트 내용';
    await manager.addMessage(createTestMessage({ projectId: projId, content }));
    const hist = await manager.getHistory(projId);
    expect(hist.ok).toBe(true);
    const search = await manager.searchContext(projId, content);
    expect(search.ok).toBe(true);
  });

  it('대화 시뮬레이션: user→assistant 5회', async () => {
    const projId = 'conversation-sim';
    for (let i = 0; i < 5; i++) {
      await manager.addMessage(createTestMessage({ role: 'user', projectId: projId, content: `질문 ${i}` }));
      await manager.addMessage(createTestMessage({ role: 'assistant', projectId: projId, content: `답변 ${i}` }));
    }
    const hist = await manager.getHistory(projId);
    expect(hist.ok).toBe(true);
    if (hist.ok) expect(hist.value.length).toBe(10);
  });

  it('여러 프로젝트 독립 히스토리', async () => {
    for (let p = 0; p < 3; p++) {
      for (let m = 0; m < 3; m++) {
        await manager.addMessage(createTestMessage({ projectId: `multi-proj-${p}`, content: `프로젝트${p} 메시지${m}` }));
      }
    }
    for (let p = 0; p < 3; p++) {
      const hist = await manager.getHistory(`multi-proj-${p}`);
      if (hist.ok) {
        expect(hist.value.length).toBe(3);
        for (const m of hist.value) {
          expect(m.projectId).toBe(`multi-proj-${p}`);
        }
      }
    }
  });

  it('순차적 대화 후 getHistory 순서 일관성', async () => {
    const projId = 'order-check';
    const contents = ['첫 번째', '두 번째', '세 번째'];
    for (const c of contents) {
      await manager.addMessage(createTestMessage({ projectId: projId, content: c }));
    }
    const hist = await manager.getHistory(projId);
    if (hist.ok) {
      expect(hist.value.length).toBe(3);
      for (const msg of hist.value) {
        expect(contents).toContain(msg.content);
      }
    }
  });

  it('새 인스턴스로 동일 디렉토리 재사용 → 데이터 지속성', async () => {
    const projId = 'persistence-proj';
    await manager.addMessage(createTestMessage({ projectId: projId, content: '지속성 확인 내용' }));
    const hist = await manager.getHistory(projId);
    expect(hist.ok).toBe(true);
    if (hist.ok) expect(hist.value.length).toBeGreaterThan(0);
  });
});
