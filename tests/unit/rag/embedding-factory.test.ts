/**
 * embedding-factory.ts 단위 테스트 / Unit tests for embedding-factory.ts
 *
 * @description
 * KR: createEmbeddingProvider, parseEmbeddingProviderType 함수의 정상/엣지 케이스 검증.
 *     엣지 케이스 비중 80% 이상 준수.
 * EN: Validates createEmbeddingProvider and parseEmbeddingProviderType for normal/edge cases.
 *     80%+ edge case ratio enforced.
 */

import { describe, expect, it } from 'bun:test';
import type { Logger } from 'core/logger.js';
import type { EmbeddingFactoryConfig, EmbeddingProviderType } from 'rag/embedding-factory.js';
import { createEmbeddingProvider, parseEmbeddingProviderType } from 'rag/embedding-factory.js';

// ── 테스트 픽스처 / Test fixtures ────────────────────────────────

/** 로거 스텁 / Logger stub */
const createStubLogger = (): Logger =>
  ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    child: () => createStubLogger(),
  }) as unknown as Logger;

const logger = createStubLogger();

// ── parseEmbeddingProviderType ───────────────────────────────────

describe('parseEmbeddingProviderType', () => {
  // ── 정상 케이스 / Normal cases (20%) ─────────────────────────

  it('xenova-minilm을 올바르게 파싱한다', () => {
    const result = parseEmbeddingProviderType('xenova-minilm');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('xenova-minilm');
  });

  it('jina-v3을 올바르게 파싱한다', () => {
    const result = parseEmbeddingProviderType('jina-v3');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('jina-v3');
  });

  it('voyage-3-lite를 올바르게 파싱한다', () => {
    const result = parseEmbeddingProviderType('voyage-3-lite');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('voyage-3-lite');
  });

  it('voyage-code-3을 올바르게 파싱한다', () => {
    const result = parseEmbeddingProviderType('voyage-code-3');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('voyage-code-3');
  });

  // ── 엣지 케이스 / Edge cases (80%) ───────────────────────────

  it('빈 문자열은 err를 반환한다', () => {
    const result = parseEmbeddingProviderType('');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('rag_embedding_error');
      expect(result.error.message).toContain('""');
    }
  });

  it('공백만 있는 문자열은 err를 반환한다', () => {
    const result = parseEmbeddingProviderType('   ');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('rag_embedding_error');
  });

  it('대소문자 혼합 (Xenova-MiniLM)은 err를 반환한다', () => {
    const result = parseEmbeddingProviderType('Xenova-MiniLM');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('rag_embedding_error');
  });

  it('전부 대문자 (XENOVA-MINILM)는 err를 반환한다', () => {
    const result = parseEmbeddingProviderType('XENOVA-MINILM');
    expect(result.ok).toBe(false);
  });

  it('유사하지만 다른 값 (xenova)은 err를 반환한다', () => {
    const result = parseEmbeddingProviderType('xenova');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('xenova-minilm');
  });

  it('유사하지만 다른 값 (jina)은 err를 반환한다', () => {
    const result = parseEmbeddingProviderType('jina');
    expect(result.ok).toBe(false);
  });

  it('유사하지만 다른 값 (voyage)은 err를 반환한다', () => {
    const result = parseEmbeddingProviderType('voyage');
    expect(result.ok).toBe(false);
  });

  it('voyage-code-3에 버전 suffix를 붙인 값은 err를 반환한다', () => {
    const result = parseEmbeddingProviderType('voyage-code-3-v2');
    expect(result.ok).toBe(false);
  });

  it('앞뒤 공백이 있는 값은 err를 반환한다', () => {
    const result = parseEmbeddingProviderType(' xenova-minilm ');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('rag_embedding_error');
  });

  it('탭 문자가 포함된 값은 err를 반환한다', () => {
    const result = parseEmbeddingProviderType('\txenova-minilm');
    expect(result.ok).toBe(false);
  });

  it('숫자만 있는 값은 err를 반환한다', () => {
    const result = parseEmbeddingProviderType('1234');
    expect(result.ok).toBe(false);
  });

  it('null처럼 보이는 문자열은 err를 반환한다', () => {
    const result = parseEmbeddingProviderType('null');
    expect(result.ok).toBe(false);
  });

  it('undefined처럼 보이는 문자열은 err를 반환한다', () => {
    const result = parseEmbeddingProviderType('undefined');
    expect(result.ok).toBe(false);
  });

  it('특수문자가 포함된 값은 err를 반환한다', () => {
    const result = parseEmbeddingProviderType('xenova-minilm!');
    expect(result.ok).toBe(false);
  });

  it('슬래시가 포함된 값은 err를 반환한다', () => {
    const result = parseEmbeddingProviderType('xenova/minilm');
    expect(result.ok).toBe(false);
  });

  it('err 메시지에 허용값 목록이 포함된다', () => {
    const result = parseEmbeddingProviderType('bad-value');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('xenova-minilm');
      expect(result.error.message).toContain('jina-v3');
      expect(result.error.message).toContain('voyage-3-lite');
      expect(result.error.message).toContain('voyage-code-3');
    }
  });

  it('매우 긴 문자열은 err를 반환한다', () => {
    const longStr = 'a'.repeat(1000);
    const result = parseEmbeddingProviderType(longStr);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('rag_embedding_error');
  });
});

// ── createEmbeddingProvider ──────────────────────────────────────

describe('createEmbeddingProvider', () => {
  // ── 정상 케이스 / Normal cases (4 providers) ─────────────────

  describe('xenova-minilm (기본값/무료)', () => {
    it('ok 결과와 TransformersEmbeddingProvider를 반환한다', () => {
      const config: EmbeddingFactoryConfig = { type: 'xenova-minilm', logger };
      const result = createEmbeddingProvider(config);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('transformers');
        expect(result.value.tier).toBe('free');
        expect(result.value.dimensions).toBe(384);
      }
    });

    it('voyageApiKey 없이도 ok를 반환한다', () => {
      const config: EmbeddingFactoryConfig = { type: 'xenova-minilm', logger };
      const result = createEmbeddingProvider(config);
      expect(result.ok).toBe(true);
    });

    it('voyageApiKey가 undefined여도 ok를 반환한다', () => {
      const config: EmbeddingFactoryConfig = {
        type: 'xenova-minilm',
        voyageApiKey: undefined,
        logger,
      };
      const result = createEmbeddingProvider(config);
      expect(result.ok).toBe(true);
    });

    it('voyageApiKey가 빈 문자열이어도 ok를 반환한다', () => {
      const config: EmbeddingFactoryConfig = {
        type: 'xenova-minilm',
        voyageApiKey: '',
        logger,
      };
      const result = createEmbeddingProvider(config);
      // WHY: xenova-minilm은 API 키를 사용하지 않으므로 ok여야 함
      expect(result.ok).toBe(true);
    });

    it('embed 메서드가 존재한다', () => {
      const result = createEmbeddingProvider({ type: 'xenova-minilm', logger });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(typeof result.value.embed).toBe('function');
        expect(typeof result.value.embedQuery).toBe('function');
      }
    });
  });

  describe('jina-v3 (무료, 고품질)', () => {
    it('ok 결과와 JinaEmbeddingProvider를 반환한다', () => {
      const config: EmbeddingFactoryConfig = { type: 'jina-v3', logger };
      const result = createEmbeddingProvider(config);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('jina-v3');
        expect(result.value.tier).toBe('free');
        expect(result.value.dimensions).toBe(1024);
      }
    });

    it('voyageApiKey 없이도 ok를 반환한다', () => {
      const result = createEmbeddingProvider({ type: 'jina-v3', logger });
      expect(result.ok).toBe(true);
    });

    it('voyageApiKey가 빈 문자열이어도 ok를 반환한다', () => {
      const config: EmbeddingFactoryConfig = {
        type: 'jina-v3',
        voyageApiKey: '',
        logger,
      };
      const result = createEmbeddingProvider(config);
      expect(result.ok).toBe(true);
    });

    it('embed 메서드가 존재한다', () => {
      const result = createEmbeddingProvider({ type: 'jina-v3', logger });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(typeof result.value.embed).toBe('function');
      }
    });
  });

  describe('voyage-3-lite (유료, 범용)', () => {
    it('유효한 apiKey로 ok 결과를 반환한다', () => {
      const config: EmbeddingFactoryConfig = {
        type: 'voyage-3-lite',
        voyageApiKey: 'va-test-key-12345',
        logger,
      };
      const result = createEmbeddingProvider(config);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('voyage-3-lite');
        expect(result.value.tier).toBe('paid');
        expect(result.value.dimensions).toBe(512);
      }
    });

    it('voyageApiKey 없으면 err를 반환한다', () => {
      const config: EmbeddingFactoryConfig = { type: 'voyage-3-lite', logger };
      const result = createEmbeddingProvider(config);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('rag_embedding_error');
        expect(result.error.message).toContain('voyage-3-lite');
        expect(result.error.message).toContain('voyageApiKey');
      }
    });

    it('voyageApiKey가 undefined이면 err를 반환한다', () => {
      const config: EmbeddingFactoryConfig = {
        type: 'voyage-3-lite',
        voyageApiKey: undefined,
        logger,
      };
      const result = createEmbeddingProvider(config);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('rag_embedding_error');
    });

    it('voyageApiKey가 빈 문자열이면 err를 반환한다', () => {
      const config: EmbeddingFactoryConfig = {
        type: 'voyage-3-lite',
        voyageApiKey: '',
        logger,
      };
      const result = createEmbeddingProvider(config);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('rag_embedding_error');
        expect(result.error.message).toContain('voyageApiKey');
      }
    });

    it('voyageApiKey가 공백만 있어도 ok를 반환한다 (공백 유효 키로 간주)', () => {
      // WHY: 팩토리는 키 형식을 검증하지 않음 — API 호출 시 실패하도록 위임
      const config: EmbeddingFactoryConfig = {
        type: 'voyage-3-lite',
        voyageApiKey: '   ',
        logger,
      };
      const result = createEmbeddingProvider(config);
      // 빈 문자열이 아니므로 ok — API 호출 시 실패는 VoyageEmbeddingProvider 책임
      expect(result.ok).toBe(true);
    });

    it('embed 메서드가 존재한다', () => {
      const result = createEmbeddingProvider({
        type: 'voyage-3-lite',
        voyageApiKey: 'test-key',
        logger,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(typeof result.value.embed).toBe('function');
        expect(typeof result.value.embedQuery).toBe('function');
      }
    });
  });

  describe('voyage-code-3 (유료, 코드 특화)', () => {
    it('유효한 apiKey로 ok 결과를 반환한다', () => {
      const config: EmbeddingFactoryConfig = {
        type: 'voyage-code-3',
        voyageApiKey: 'va-test-key-99999',
        logger,
      };
      const result = createEmbeddingProvider(config);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('voyage-code-3');
        expect(result.value.tier).toBe('paid');
        expect(result.value.dimensions).toBe(1024);
      }
    });

    it('voyageApiKey 없으면 err를 반환한다', () => {
      const config: EmbeddingFactoryConfig = { type: 'voyage-code-3', logger };
      const result = createEmbeddingProvider(config);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('rag_embedding_error');
        expect(result.error.message).toContain('voyage-code-3');
        expect(result.error.message).toContain('voyageApiKey');
      }
    });

    it('voyageApiKey가 undefined이면 err를 반환한다', () => {
      const config: EmbeddingFactoryConfig = {
        type: 'voyage-code-3',
        voyageApiKey: undefined,
        logger,
      };
      const result = createEmbeddingProvider(config);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('rag_embedding_error');
    });

    it('voyageApiKey가 빈 문자열이면 err를 반환한다', () => {
      const config: EmbeddingFactoryConfig = {
        type: 'voyage-code-3',
        voyageApiKey: '',
        logger,
      };
      const result = createEmbeddingProvider(config);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('rag_embedding_error');
        expect(result.error.message).toContain('voyageApiKey');
      }
    });

    it('여러 자리 문자만 있는 키도 ok를 반환한다 (API가 거절)', () => {
      // WHY: 팩토리는 키 유효성을 검증하지 않음 — API 레이어 책임
      const config: EmbeddingFactoryConfig = {
        type: 'voyage-code-3',
        voyageApiKey: 'x',
        logger,
      };
      const result = createEmbeddingProvider(config);
      expect(result.ok).toBe(true);
    });

    it('embed 메서드가 존재한다', () => {
      const result = createEmbeddingProvider({
        type: 'voyage-code-3',
        voyageApiKey: 'test-key',
        logger,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(typeof result.value.embed).toBe('function');
        expect(typeof result.value.embedQuery).toBe('function');
      }
    });
  });

  // ── 엣지 케이스 — 로거 변형 / Edge cases — logger variations ──

  describe('로거 변형 엣지 케이스 / Logger edge cases', () => {
    it('다른 logger 인스턴스를 사용해도 ok를 반환한다', () => {
      const logger2 = createStubLogger();
      const result = createEmbeddingProvider({ type: 'xenova-minilm', logger: logger2 });
      expect(result.ok).toBe(true);
    });

    it('child 로거를 사용해도 ok를 반환한다', () => {
      const childLogger = logger.child({ module: 'test' });
      const result = createEmbeddingProvider({ type: 'jina-v3', logger: childLogger });
      expect(result.ok).toBe(true);
    });
  });

  // ── 엣지 케이스 — 여러 번 호출 / Edge cases — multiple calls ──

  describe('팩토리 반복 호출', () => {
    it('동일 설정으로 2번 호출하면 독립된 인스턴스를 반환한다', () => {
      const config: EmbeddingFactoryConfig = { type: 'xenova-minilm', logger };
      const result1 = createEmbeddingProvider(config);
      const result2 = createEmbeddingProvider(config);
      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      if (result1.ok && result2.ok) {
        // WHY: 팩토리는 매번 새 인스턴스를 반환해야 함
        expect(result1.value).not.toBe(result2.value);
      }
    });

    it('voyage-code-3 apiKey 없음으로 여러 번 호출해도 항상 err를 반환한다', () => {
      for (let i = 0; i < 5; i++) {
        const result = createEmbeddingProvider({ type: 'voyage-code-3', logger });
        expect(result.ok).toBe(false);
      }
    });
  });

  // ── 엣지 케이스 — 특수 API 키 값 / Edge cases — special API key values ──

  describe('특수 API 키 값 / Special API key values', () => {
    it('voyage-3-lite: 특수문자가 포함된 apiKey도 ok를 반환한다', () => {
      const result = createEmbeddingProvider({
        type: 'voyage-3-lite',
        voyageApiKey: 'va-abc!@#$%^&*()-_=+',
        logger,
      });
      // WHY: 팩토리는 키 내용을 검사하지 않음
      expect(result.ok).toBe(true);
    });

    it('voyage-code-3: 매우 긴 apiKey도 ok를 반환한다', () => {
      const longKey = 'va-' + 'x'.repeat(500);
      const result = createEmbeddingProvider({
        type: 'voyage-code-3',
        voyageApiKey: longKey,
        logger,
      });
      expect(result.ok).toBe(true);
    });

    it('voyage-code-3: 유니코드 문자가 포함된 apiKey도 ok를 반환한다', () => {
      const result = createEmbeddingProvider({
        type: 'voyage-code-3',
        voyageApiKey: 'va-키이이이이이',
        logger,
      });
      expect(result.ok).toBe(true);
    });
  });

  // ── 엣지 케이스 — tier 검증 / Edge cases — tier validation ────

  describe('프로바이더 tier 속성', () => {
    it('xenova-minilm은 tier: free이다', () => {
      const result = createEmbeddingProvider({ type: 'xenova-minilm', logger });
      if (result.ok) expect(result.value.tier).toBe('free');
    });

    it('jina-v3은 tier: free이다', () => {
      const result = createEmbeddingProvider({ type: 'jina-v3', logger });
      if (result.ok) expect(result.value.tier).toBe('free');
    });

    it('voyage-3-lite는 tier: paid이다', () => {
      const result = createEmbeddingProvider({
        type: 'voyage-3-lite',
        voyageApiKey: 'test-key',
        logger,
      });
      if (result.ok) expect(result.value.tier).toBe('paid');
    });

    it('voyage-code-3은 tier: paid이다', () => {
      const result = createEmbeddingProvider({
        type: 'voyage-code-3',
        voyageApiKey: 'test-key',
        logger,
      });
      if (result.ok) expect(result.value.tier).toBe('paid');
    });
  });
});
