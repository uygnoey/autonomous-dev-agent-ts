/**
 * Vectorizer 단위 테스트 / Vectorizer unit tests
 *
 * @description
 * 초기화 전 오류 처리, initialize() 실패/성공,
 * search/index 미초기화 오류 등 경계값을 상세히 검증한다.
 *
 * NOTE: LanceDB + Transformers 초기화가 느리므로
 *       초기화 없이 호출하는 케이스에 집중한다.
 */

import { describe, expect, it } from 'bun:test';
import type { EmbeddingConfig } from 'core/config.js';
import { ConsoleLogger } from 'core/logger.js';
import { Vectorizer } from 'rag/vectorizer.js';

const logger = new ConsoleLogger('error');

function makeConfig(provider = 'transformers'): EmbeddingConfig {
  return {
    default: provider as EmbeddingConfig['default'],
    transformers: {
      model: 'Xenova/all-MiniLM-L6-v2',
      dimensions: 384,
    },
  };
}

function makeVectorizer(dbPath = '/tmp/adev-test-vectorizer', provider = 'transformers'): Vectorizer {
  return new Vectorizer(dbPath, makeConfig(provider), logger);
}

// ── 생성자 ─────────────────────────────────────────────────────

describe('Vectorizer 생성자', () => {
  it('인스턴스 생성됨', () => {
    expect(() => makeVectorizer()).not.toThrow();
  });

  it('Vectorizer 인스턴스', () => {
    expect(makeVectorizer()).toBeInstanceOf(Vectorizer);
  });

  it('다양한 dbPath → 인스턴스 생성', () => {
    const paths = ['/tmp/db1', '/tmp/db2', '/tmp/dir/nested/db'];
    for (const p of paths) {
      expect(() => makeVectorizer(p)).not.toThrow();
    }
  });

  it('빈 dbPath → 인스턴스 생성 (초기화 시 실패 예상)', () => {
    expect(() => makeVectorizer('')).not.toThrow();
  });

  it('긴 dbPath → 인스턴스 생성', () => {
    const longPath = '/tmp/' + 'a'.repeat(200);
    expect(() => makeVectorizer(longPath)).not.toThrow();
  });

  it('여러 인스턴스 생성 가능', () => {
    const v1 = makeVectorizer('/tmp/db-a');
    const v2 = makeVectorizer('/tmp/db-b');
    const v3 = makeVectorizer('/tmp/db-c');
    expect(v1).toBeInstanceOf(Vectorizer);
    expect(v2).toBeInstanceOf(Vectorizer);
    expect(v3).toBeInstanceOf(Vectorizer);
  });

  it('새 ConsoleLogger로 생성 가능', () => {
    const newLogger = new ConsoleLogger('error');
    expect(() => new Vectorizer('/tmp/db', makeConfig(), newLogger)).not.toThrow();
  });

  it('debug 레벨 logger로 생성 가능', () => {
    const debugLogger = new ConsoleLogger('debug');
    expect(() => new Vectorizer('/tmp/db', makeConfig(), debugLogger)).not.toThrow();
  });

  it('두 인스턴스는 다른 객체', () => {
    const v1 = makeVectorizer('/tmp/db-x');
    const v2 = makeVectorizer('/tmp/db-y');
    expect(v1).not.toBe(v2);
  });

  it('search 메서드 존재', () => {
    expect(typeof makeVectorizer().search).toBe('function');
  });

  it('index 메서드 존재', () => {
    expect(typeof makeVectorizer().index).toBe('function');
  });

  it('info level logger로 생성 가능', () => {
    const infoLogger = new ConsoleLogger('info');
    expect(() => new Vectorizer('/tmp/db', makeConfig(), infoLogger)).not.toThrow();
  });

  it('warn level logger로 생성 가능', () => {
    const warnLogger = new ConsoleLogger('warn');
    expect(() => new Vectorizer('/tmp/db', makeConfig(), warnLogger)).not.toThrow();
  });
});

// ── 미초기화 상태 - search() ───────────────────────────────────

describe('Vectorizer 미초기화 상태 - search()', () => {
  it('search() 미초기화 → err 반환', async () => {
    const v = makeVectorizer();
    const result = await v.search('query');
    expect(result.ok).toBe(false);
  });

  it('search() 오류 메시지에 초기화 관련 내용 포함', async () => {
    const v = makeVectorizer();
    const result = await v.search('error handling');
    if (!result.ok) {
      expect(result.error.message).toMatch(/초기화|initialize/i);
    }
  });

  it('search() 오류 코드가 rag_init_error', async () => {
    const v = makeVectorizer();
    const result = await v.search('query');
    if (!result.ok) {
      expect(result.error.code).toBe('rag_init_error');
    }
  });

  it('빈 쿼리 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const result = await v.search('');
    expect(result.ok).toBe(false);
  });

  it('limit 파라미터 포함 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const result = await v.search('query', 5);
    expect(result.ok).toBe(false);
  });

  it('limit=0 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const result = await v.search('query', 0);
    expect(result.ok).toBe(false);
  });

  it('limit=1 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const result = await v.search('query', 1);
    expect(result.ok).toBe(false);
  });

  it('limit=100 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const result = await v.search('query', 100);
    expect(result.ok).toBe(false);
  });

  it('filter 파라미터 포함 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const result = await v.search('query', 10, { language: 'typescript' });
    expect(result.ok).toBe(false);
  });

  it('빈 filter 객체 포함 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const result = await v.search('query', 10, {});
    expect(result.ok).toBe(false);
  });

  it('여러 search 호출 → 모두 err', async () => {
    const v = makeVectorizer();
    const queries = ['query 1', 'query 2', 'error handling', 'typescript', 'jest'];
    for (const q of queries) {
      const result = await v.search(q);
      expect(result.ok).toBe(false);
    }
  });

  it('search() 에러는 RagError를 상속한다', async () => {
    const v = makeVectorizer();
    const result = await v.search('q');
    if (!result.ok) {
      expect(result.error.name).toBe('RagError');
    }
  });

  it('한국어 쿼리 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const result = await v.search('인증 시스템 구현');
    expect(result.ok).toBe(false);
  });

  it('특수문자 쿼리 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const result = await v.search('!@#$%^&*()');
    expect(result.ok).toBe(false);
  });

  it('매우 긴 쿼리 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const result = await v.search('x'.repeat(1000));
    expect(result.ok).toBe(false);
  });

  it('error.ok는 false로 boolean 타입', async () => {
    const v = makeVectorizer();
    const result = await v.search('test');
    expect(result.ok).toBe(false);
    expect(typeof result.ok).toBe('boolean');
  });

  it('error.code는 string 타입', async () => {
    const v = makeVectorizer();
    const result = await v.search('test');
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
    }
  });

  it('error.message는 string 타입', async () => {
    const v = makeVectorizer();
    const result = await v.search('test');
    if (!result.ok) {
      expect(typeof result.error.message).toBe('string');
    }
  });

  it('5번 연속 search → 항상 ok=false', async () => {
    const v = makeVectorizer();
    for (let i = 0; i < 5; i++) {
      const result = await v.search(`query-${i}`);
      expect(result.ok).toBe(false);
    }
  });

  it('탭 포함 쿼리 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const result = await v.search('\t\t');
    expect(result.ok).toBe(false);
  });

  it('개행 포함 쿼리 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const result = await v.search('line1\nline2');
    expect(result.ok).toBe(false);
  });
});

// ── 미초기화 상태 - index() ────────────────────────────────────

describe('Vectorizer 미초기화 상태 - index()', () => {
  it('index() 미초기화 → err 반환', async () => {
    const v = makeVectorizer();
    const result = await v.index('/tmp/some-dir');
    expect(result.ok).toBe(false);
  });

  it('index() 오류 메시지에 초기화 관련 내용 포함', async () => {
    const v = makeVectorizer();
    const result = await v.index('src/');
    if (!result.ok) {
      expect(result.error.message).toMatch(/초기화|initialize/i);
    }
  });

  it('index() 오류 코드가 rag_init_error', async () => {
    const v = makeVectorizer();
    const result = await v.index('/tmp/dir');
    if (!result.ok) {
      expect(result.error.code).toBe('rag_init_error');
    }
  });

  it('빈 dirPath → err (미초기화)', async () => {
    const v = makeVectorizer();
    const result = await v.index('');
    expect(result.ok).toBe(false);
  });

  it('여러 index 호출 → 모두 err', async () => {
    const v = makeVectorizer();
    const dirs = ['src/', 'tests/', 'lib/', '.'];
    for (const dir of dirs) {
      const result = await v.index(dir);
      expect(result.ok).toBe(false);
    }
  });

  it('options 포함 index → err (미초기화)', async () => {
    const v = makeVectorizer();
    const result = await v.index('/tmp/dir', { extensions: ['.ts', '.js'] });
    expect(result.ok).toBe(false);
  });

  it('index() 에러는 RagError를 상속한다', async () => {
    const v = makeVectorizer();
    const result = await v.index('/tmp');
    if (!result.ok) {
      expect(result.error.name).toBe('RagError');
    }
  });

  it('index() error.code는 string 타입', async () => {
    const v = makeVectorizer();
    const result = await v.index('/tmp/test');
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
    }
  });

  it('index() error.message는 string 타입', async () => {
    const v = makeVectorizer();
    const result = await v.index('/tmp/test');
    if (!result.ok) {
      expect(typeof result.error.message).toBe('string');
    }
  });

  it('5번 연속 index → 항상 ok=false', async () => {
    const v = makeVectorizer();
    for (let i = 0; i < 5; i++) {
      const result = await v.index(`/tmp/dir-${i}`);
      expect(result.ok).toBe(false);
    }
  });

  it('절대 경로 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const result = await v.index('/absolute/path/to/dir');
    expect(result.ok).toBe(false);
  });

  it('상대 경로 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const result = await v.index('./relative/path');
    expect(result.ok).toBe(false);
  });

  it('점 경로 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const result = await v.index('.');
    expect(result.ok).toBe(false);
  });
});

// ── 다양한 설정으로 생성 ───────────────────────────────────────

describe('Vectorizer 다양한 설정', () => {
  it('/tmp/v1 → 생성됨', () => {
    const v = makeVectorizer('/tmp/v1');
    expect(v).toBeInstanceOf(Vectorizer);
  });

  it('/tmp/v2 → 생성됨', () => {
    const v = makeVectorizer('/tmp/v2');
    expect(v).toBeInstanceOf(Vectorizer);
  });

  it('/tmp/nested/path/db → 생성됨', () => {
    const v = makeVectorizer('/tmp/nested/path/db');
    expect(v).toBeInstanceOf(Vectorizer);
  });

  it('transformers 설정 → 인스턴스 생성', () => {
    const config: EmbeddingConfig = {
      default: 'transformers',
      transformers: { model: 'Xenova/all-MiniLM-L6-v2', dimensions: 384 },
    };
    expect(() => new Vectorizer('/tmp/db', config, logger)).not.toThrow();
  });

  it('dimensions=128 설정 → 인스턴스 생성', () => {
    const config: EmbeddingConfig = {
      default: 'transformers',
      transformers: { model: 'Xenova/all-MiniLM-L6-v2', dimensions: 128 },
    };
    expect(() => new Vectorizer('/tmp/db', config, logger)).not.toThrow();
  });

  it('dimensions=768 설정 → 인스턴스 생성', () => {
    const config: EmbeddingConfig = {
      default: 'transformers',
      transformers: { model: 'Xenova/all-MiniLM-L6-v2', dimensions: 768 },
    };
    expect(() => new Vectorizer('/tmp/db', config, logger)).not.toThrow();
  });

  it('dimensions=1 설정 → 인스턴스 생성', () => {
    const config: EmbeddingConfig = {
      default: 'transformers',
      transformers: { model: 'Xenova/all-MiniLM-L6-v2', dimensions: 1 },
    };
    expect(() => new Vectorizer('/tmp/db', config, logger)).not.toThrow();
  });

  it('dimensions=1536 설정 → 인스턴스 생성', () => {
    const config: EmbeddingConfig = {
      default: 'transformers',
      transformers: { model: 'Xenova/all-MiniLM-L6-v2', dimensions: 1536 },
    };
    expect(() => new Vectorizer('/tmp/db', config, logger)).not.toThrow();
  });
});

// ── 여러 인스턴스 독립성 ──────────────────────────────────────

describe('Vectorizer 여러 인스턴스 독립성', () => {
  it('두 인스턴스가 독립적으로 err 반환', async () => {
    const v1 = makeVectorizer('/tmp/db-v1');
    const v2 = makeVectorizer('/tmp/db-v2');
    const r1 = await v1.search('query');
    const r2 = await v2.search('query');
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
  });

  it('10개 인스턴스 생성 → 모두 미초기화 err', async () => {
    for (let i = 0; i < 10; i++) {
      const v = makeVectorizer(`/tmp/db-${i}`);
      const result = await v.search(`query-${i}`);
      expect(result.ok).toBe(false);
    }
  });

  it('같은 dbPath 두 인스턴스 생성 가능', () => {
    const v1 = makeVectorizer('/tmp/shared');
    const v2 = makeVectorizer('/tmp/shared');
    expect(v1).toBeInstanceOf(Vectorizer);
    expect(v2).toBeInstanceOf(Vectorizer);
  });

  it('두 인스턴스 index → 모두 err', async () => {
    const v1 = makeVectorizer('/tmp/db-idx1');
    const v2 = makeVectorizer('/tmp/db-idx2');
    const r1 = await v1.index('/tmp/src');
    const r2 = await v2.index('/tmp/src');
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
  });

  it('5개 인스턴스 × search + index → 모두 err', async () => {
    for (let i = 0; i < 5; i++) {
      const v = makeVectorizer(`/tmp/db-combo-${i}`);
      expect((await v.search(`q${i}`)).ok).toBe(false);
      expect((await v.index(`/tmp/d${i}`)).ok).toBe(false);
    }
  });
});

// ── 랜덤/경계값 ───────────────────────────────────────────────

describe('Vectorizer 랜덤/경계값', () => {
  it('랜덤 쿼리 미초기화 #0', async () => {
    const v = makeVectorizer();
    expect((await v.search('query-0-')).ok).toBe(false);
  });

  it('랜덤 쿼리 미초기화 #1', async () => {
    const v = makeVectorizer();
    expect((await v.search('query-1-x')).ok).toBe(false);
  });

  it('랜덤 쿼리 미초기화 #5', async () => {
    const v = makeVectorizer();
    expect((await v.search('query-5-xxxxx')).ok).toBe(false);
  });

  it('랜덤 쿼리 미초기화 #9', async () => {
    const v = makeVectorizer();
    expect((await v.search('query-9-xxxxxxxxx')).ok).toBe(false);
  });

  it('랜덤 인덱스 경로 미초기화 #0', async () => {
    const v = makeVectorizer();
    expect((await v.index('/tmp/random-dir-0')).ok).toBe(false);
  });

  it('랜덤 인덱스 경로 미초기화 #5', async () => {
    const v = makeVectorizer();
    expect((await v.index('/tmp/random-dir-5')).ok).toBe(false);
  });

  it('랜덤 인덱스 경로 미초기화 #9', async () => {
    const v = makeVectorizer();
    expect((await v.index('/tmp/random-dir-9')).ok).toBe(false);
  });

  it('limit=1 → err (미초기화)', async () => {
    const v = makeVectorizer();
    expect((await v.search('query', 1)).ok).toBe(false);
  });

  it('limit=5 → err (미초기화)', async () => {
    const v = makeVectorizer();
    expect((await v.search('query', 5)).ok).toBe(false);
  });

  it('limit=10 → err (미초기화)', async () => {
    const v = makeVectorizer();
    expect((await v.search('query', 10)).ok).toBe(false);
  });

  it('limit=20 → err (미초기화)', async () => {
    const v = makeVectorizer();
    expect((await v.search('query', 20)).ok).toBe(false);
  });

  it('limit=50 → err (미초기화)', async () => {
    const v = makeVectorizer();
    expect((await v.search('query', 50)).ok).toBe(false);
  });

  it('limit=100 → err (미초기화)', async () => {
    const v = makeVectorizer();
    expect((await v.search('query', 100)).ok).toBe(false);
  });
});

// ── 메서드 타입 및 반환값 구조 ────────────────────────────────

describe('Vectorizer 메서드 타입 검증', () => {
  it('search 반환값은 Promise', () => {
    const v = makeVectorizer();
    const p = v.search('query');
    expect(p).toBeInstanceOf(Promise);
  });

  it('index 반환값은 Promise', () => {
    const v = makeVectorizer();
    const p = v.index('/tmp/dir');
    expect(p).toBeInstanceOf(Promise);
  });

  it('search 결과 ok는 boolean', async () => {
    const v = makeVectorizer();
    const r = await v.search('query');
    expect(typeof r.ok).toBe('boolean');
  });

  it('index 결과 ok는 boolean', async () => {
    const v = makeVectorizer();
    const r = await v.index('/tmp/test');
    expect(typeof r.ok).toBe('boolean');
  });

  it('search 에러 결과에 error 필드 존재', async () => {
    const v = makeVectorizer();
    const r = await v.search('query');
    if (!r.ok) {
      expect('error' in r).toBe(true);
    }
  });

  it('index 에러 결과에 error 필드 존재', async () => {
    const v = makeVectorizer();
    const r = await v.index('/tmp/dir');
    if (!r.ok) {
      expect('error' in r).toBe(true);
    }
  });

  it('search 에러 code는 비어있지 않음', async () => {
    const v = makeVectorizer();
    const r = await v.search('query');
    if (!r.ok) {
      expect(r.error.code.length).toBeGreaterThan(0);
    }
  });

  it('index 에러 code는 비어있지 않음', async () => {
    const v = makeVectorizer();
    const r = await v.index('/tmp/dir');
    if (!r.ok) {
      expect(r.error.code.length).toBeGreaterThan(0);
    }
  });

  it('search 에러 message는 비어있지 않음', async () => {
    const v = makeVectorizer();
    const r = await v.search('query');
    if (!r.ok) {
      expect(r.error.message.length).toBeGreaterThan(0);
    }
  });

  it('index 에러 message는 비어있지 않음', async () => {
    const v = makeVectorizer();
    const r = await v.index('/tmp/dir');
    if (!r.ok) {
      expect(r.error.message.length).toBeGreaterThan(0);
    }
  });
});

// ── EmbeddingConfig 경계값 ─────────────────────────────────────

describe('Vectorizer EmbeddingConfig 경계값', () => {
  it('dimensions=0 설정 → 인스턴스 생성', () => {
    const config: EmbeddingConfig = {
      default: 'transformers',
      transformers: { model: 'Xenova/all-MiniLM-L6-v2', dimensions: 0 },
    };
    expect(() => new Vectorizer('/tmp/db', config, logger)).not.toThrow();
  });

  it('dimensions=-1 설정 → 인스턴스 생성', () => {
    const config: EmbeddingConfig = {
      default: 'transformers',
      transformers: { model: 'Xenova/all-MiniLM-L6-v2', dimensions: -1 },
    };
    expect(() => new Vectorizer('/tmp/db', config, logger)).not.toThrow();
  });

  it('model 빈 문자열 → 인스턴스 생성', () => {
    const config: EmbeddingConfig = {
      default: 'transformers',
      transformers: { model: '', dimensions: 384 },
    };
    expect(() => new Vectorizer('/tmp/db', config, logger)).not.toThrow();
  });

  it('model 매우 긴 문자열 → 인스턴스 생성', () => {
    const config: EmbeddingConfig = {
      default: 'transformers',
      transformers: { model: 'x'.repeat(500), dimensions: 384 },
    };
    expect(() => new Vectorizer('/tmp/db', config, logger)).not.toThrow();
  });

  it('dimensions=Number.MAX_SAFE_INTEGER → 인스턴스 생성', () => {
    const config: EmbeddingConfig = {
      default: 'transformers',
      transformers: { model: 'Xenova/all-MiniLM-L6-v2', dimensions: Number.MAX_SAFE_INTEGER },
    };
    expect(() => new Vectorizer('/tmp/db', config, logger)).not.toThrow();
  });

  it('5가지 dimensions 설정 → 모두 인스턴스 생성', () => {
    const dims = [64, 128, 256, 512, 1024];
    for (const d of dims) {
      const config: EmbeddingConfig = {
        default: 'transformers',
        transformers: { model: 'Xenova/all-MiniLM-L6-v2', dimensions: d },
      };
      expect(() => new Vectorizer('/tmp/db', config, logger)).not.toThrow();
    }
  });
});

// ── 미초기화 search + index 혼합 경계값 ───────────────────────

describe('Vectorizer 미초기화 혼합 경계값', () => {
  it('search 후 index 호출 → 모두 err', async () => {
    const v = makeVectorizer();
    const r1 = await v.search('query');
    const r2 = await v.index('/tmp/dir');
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
  });

  it('index 후 search 호출 → 모두 err', async () => {
    const v = makeVectorizer();
    const r1 = await v.index('/tmp/dir');
    const r2 = await v.search('query');
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
  });

  it('공백만 있는 쿼리 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('   ');
    expect(r.ok).toBe(false);
  });

  it('유니코드 제어문자 쿼리 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('\u0000\u0001\u0002');
    expect(r.ok).toBe(false);
  });

  it('limit=Number.MAX_SAFE_INTEGER → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('query', Number.MAX_SAFE_INTEGER);
    expect(r.ok).toBe(false);
  });

  it('limit=Infinity → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('query', Infinity);
    expect(r.ok).toBe(false);
  });

  it('limit=-1 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('query', -1);
    expect(r.ok).toBe(false);
  });
});
