/**
 * DocCollaborator 단위 테스트 / DocCollaborator unit tests
 *
 * WHY: DocCollaborator는 ClaudeApi + AgentSpawner에 의존하는 복잡한 워크플로우이므로
 *      전체 통합 테스트는 tests/module/ 또는 tests/e2e/에서 수행.
 *      이 단위 테스트는 기본 구조 검증만 수행.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from '../../../src/core/logger.js';
import { DocCollaborator } from '../../../src/layer3/doc-collaborator.js';

describe('DocCollaborator', () => {
  let logger: ConsoleLogger;

  beforeEach(() => {
    logger = new ConsoleLogger('error');
  });

  describe('생성자 / Constructor', () => {
    it('ClaudeApi, AgentSpawner, Logger로 인스턴스를 생성한다', () => {
      // WHY: 실제 ClaudeApi와 AgentSpawner Mock은 통합 테스트에서 수행
      //      단위 테스트는 타입 검증만 수행
      const mockClaudeApi = {} as unknown as ClaudeApi;
      const mockAgentSpawner = {} as unknown as AgentSpawner;

      expect(() => {
        new DocCollaborator(mockClaudeApi, mockAgentSpawner, logger);
      }).not.toThrow();
    });
  });

  describe('워크플로우 인터페이스 / Workflow Interface', () => {
    it('start 메서드가 존재한다', () => {
      const mockClaudeApi = {} as unknown as ClaudeApi;
      const mockAgentSpawner = {} as unknown as AgentSpawner;
      const collaborator = new DocCollaborator(mockClaudeApi, mockAgentSpawner, logger);

      expect(typeof collaborator.start).toBe('function');
    });

    it('requestLayer1 메서드가 존재한다', () => {
      const mockClaudeApi = {} as unknown as ClaudeApi;
      const mockAgentSpawner = {} as unknown as AgentSpawner;
      const collaborator = new DocCollaborator(mockClaudeApi, mockAgentSpawner, logger);

      expect(typeof collaborator.requestLayer1).toBe('function');
    });

    it('requestLayer2 메서드가 존재한다', () => {
      const mockClaudeApi = {} as unknown as ClaudeApi;
      const mockAgentSpawner = {} as unknown as AgentSpawner;
      const collaborator = new DocCollaborator(mockClaudeApi, mockAgentSpawner, logger);

      expect(typeof collaborator.requestLayer2).toBe('function');
    });

    it('complete 메서드가 존재한다', () => {
      const mockClaudeApi = {} as unknown as ClaudeApi;
      const mockAgentSpawner = {} as unknown as AgentSpawner;
      const collaborator = new DocCollaborator(mockClaudeApi, mockAgentSpawner, logger);

      expect(typeof collaborator.complete).toBe('function');
    });

    it('getState 메서드가 존재한다', () => {
      const mockClaudeApi = {} as unknown as ClaudeApi;
      const mockAgentSpawner = {} as unknown as AgentSpawner;
      const collaborator = new DocCollaborator(mockClaudeApi, mockAgentSpawner, logger);

      expect(typeof collaborator.getState).toBe('function');
    });
  });
});
