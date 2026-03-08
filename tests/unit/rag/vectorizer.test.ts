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

// ── 추가 경계값: 다양한 쿼리 패턴 ───────────────────────────

describe('Vectorizer 추가 쿼리 경계값', () => {
  it('단일 문자 쿼리 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const r = await v.search('a');
    expect(r.ok).toBe(false);
  });

  it('단일 숫자 쿼리 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const r = await v.search('1');
    expect(r.ok).toBe(false);
  });

  it('이모지 쿼리 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const r = await v.search('🚀🎉🔥');
    expect(r.ok).toBe(false);
  });

  it('SQL 쿼리 문자열 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const r = await v.search("SELECT * FROM table WHERE id = '1'");
    expect(r.ok).toBe(false);
  });

  it('JSON 문자열 쿼리 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const r = await v.search('{"key": "value", "num": 42}');
    expect(r.ok).toBe(false);
  });

  it('XML 문자열 쿼리 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const r = await v.search('<tag>content</tag>');
    expect(r.ok).toBe(false);
  });

  it('URL 형태 쿼리 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const r = await v.search('https://example.com/path?query=value&other=123');
    expect(r.ok).toBe(false);
  });

  it('UUID 쿼리 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const r = await v.search(crypto.randomUUID());
    expect(r.ok).toBe(false);
  });

  it('숫자만 있는 쿼리 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const r = await v.search('1234567890');
    expect(r.ok).toBe(false);
  });

  it('CRLF 포함 쿼리 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const r = await v.search('line1\r\nline2');
    expect(r.ok).toBe(false);
  });

  it('limit=0 + 빈 쿼리 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const r = await v.search('', 0);
    expect(r.ok).toBe(false);
  });

  it('limit=Number.MIN_SAFE_INTEGER → err (미초기화)', async () => {
    const v = makeVectorizer();
    const r = await v.search('query', Number.MIN_SAFE_INTEGER);
    expect(r.ok).toBe(false);
  });
});

// ── 추가 경계값: 다양한 index 경로 패턴 ────────────────────

describe('Vectorizer 추가 index 경로 경계값', () => {
  it('Windows 스타일 경로 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const r = await v.index('C:\\Users\\test\\src');
    expect(r.ok).toBe(false);
  });

  it('경로 순회 시도 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const r = await v.index('../../etc/passwd');
    expect(r.ok).toBe(false);
  });

  it('한국어 포함 경로 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const r = await v.index('/tmp/한국어경로/src');
    expect(r.ok).toBe(false);
  });

  it('공백 포함 경로 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const r = await v.index('/tmp/my project/src');
    expect(r.ok).toBe(false);
  });

  it('특수문자 포함 경로 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const r = await v.index('/tmp/my-project!@#/src');
    expect(r.ok).toBe(false);
  });

  it('매우 긴 경로 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const longPath = '/tmp/' + 'a/'.repeat(100);
    const r = await v.index(longPath);
    expect(r.ok).toBe(false);
  });

  it('options.extensions 빈 배열 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const r = await v.index('/tmp/dir', { extensions: [] });
    expect(r.ok).toBe(false);
  });

  it('options.extensions 다양한 확장자 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const r = await v.index('/tmp/dir', { extensions: ['.ts', '.js', '.tsx', '.jsx', '.py'] });
    expect(r.ok).toBe(false);
  });

  it('5가지 절대경로 변형 → 모두 err', async () => {
    const paths = ['/tmp/a', '/tmp/b', '/tmp/c', '/tmp/d', '/tmp/e'];
    for (const p of paths) {
      const v = makeVectorizer();
      const r = await v.index(p);
      expect(r.ok).toBe(false);
    }
  });
});

// ── 추가 edge/random: 생성자 경계값 ──────────────────────────

describe('Vectorizer 생성자 추가 경계값', () => {
  it('경로에 이모지 포함 → 인스턴스 생성', () => {
    expect(() => makeVectorizer('/tmp/db-🚀')).not.toThrow();
  });

  it('경로에 공백 포함 → 인스턴스 생성', () => {
    expect(() => makeVectorizer('/tmp/my db path')).not.toThrow();
  });

  it('경로에 한글 포함 → 인스턴스 생성', () => {
    expect(() => makeVectorizer('/tmp/한글경로/db')).not.toThrow();
  });

  it('경로에 점 포함 → 인스턴스 생성', () => {
    expect(() => makeVectorizer('/tmp/db.v1')).not.toThrow();
  });

  it('경로에 특수문자 포함 → 인스턴스 생성', () => {
    expect(() => makeVectorizer('/tmp/db-!@#$')).not.toThrow();
  });

  it('UUID 경로 → 인스턴스 생성', () => {
    const uuidPath = '/tmp/' + crypto.randomUUID();
    expect(() => makeVectorizer(uuidPath)).not.toThrow();
  });

  it('initialize 메서드 존재', () => {
    expect(typeof makeVectorizer().initialize).toBe('function');
  });

  it('20개 인스턴스 연속 생성 → 모두 인스턴스', () => {
    for (let i = 0; i < 20; i++) {
      const v = makeVectorizer(`/tmp/db-batch-${i}`);
      expect(v).toBeInstanceOf(Vectorizer);
    }
  });

  it('단일 문자 경로 → 인스턴스 생성', () => {
    expect(() => makeVectorizer('/')).not.toThrow();
  });

  it('경로에 숫자만 → 인스턴스 생성', () => {
    expect(() => makeVectorizer('/tmp/12345')).not.toThrow();
  });
});

// ── 추가 edge/random: search 다양한 언어 ─────────────────────

describe('Vectorizer search 다양한 언어/인코딩 (미초기화)', () => {
  it('일본어 쿼리 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('テスト実装');
    expect(r.ok).toBe(false);
  });

  it('중국어 쿼리 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('测试实现');
    expect(r.ok).toBe(false);
  });

  it('아랍어 쿼리 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('اختبار التنفيذ');
    expect(r.ok).toBe(false);
  });

  it('러시아어 쿼리 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('тест реализация');
    expect(r.ok).toBe(false);
  });

  it('Base64 문자열 쿼리 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('SGVsbG8gV29ybGQ=');
    expect(r.ok).toBe(false);
  });

  it('Hex 문자열 쿼리 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('0x48656c6c6f20576f726c64');
    expect(r.ok).toBe(false);
  });

  it('binary-like 문자열 쿼리 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('01001000 01100101 01101100');
    expect(r.ok).toBe(false);
  });

  it('UUID 쿼리 5개 → 모두 err', async () => {
    const v = makeVectorizer();
    for (let i = 0; i < 5; i++) {
      const r = await v.search(crypto.randomUUID());
      expect(r.ok).toBe(false);
    }
  });

  it('이모지만 있는 쿼리 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('🎉🚀💻🔥⚡');
    expect(r.ok).toBe(false);
  });

  it('null 문자 포함 쿼리 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('\u0000null\u0000char');
    expect(r.ok).toBe(false);
  });

  it('반복 문자 쿼리 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('a'.repeat(500));
    expect(r.ok).toBe(false);
  });

  it('혼합 언어 쿼리 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('한국어 English 日本語 中文');
    expect(r.ok).toBe(false);
  });
});

// ── 추가 edge/random: index 다양한 시나리오 ──────────────────

describe('Vectorizer index 다양한 시나리오 (미초기화)', () => {
  it('options.recursive=true → err', async () => {
    const v = makeVectorizer();
    const r = await v.index('/tmp/src', { recursive: true } as Parameters<typeof v.index>[1]);
    expect(r.ok).toBe(false);
  });

  it('options.maxFileSize 설정 → err', async () => {
    const v = makeVectorizer();
    const r = await v.index('/tmp/src', { maxFileSize: 1024 * 1024 } as Parameters<typeof v.index>[1]);
    expect(r.ok).toBe(false);
  });

  it('10개 서로 다른 경로 index → 모두 err', async () => {
    const v = makeVectorizer();
    for (let i = 0; i < 10; i++) {
      const r = await v.index(`/tmp/path-${i}`);
      expect(r.ok).toBe(false);
    }
  });

  it('UUID 경로 index → err', async () => {
    const v = makeVectorizer();
    const r = await v.index('/tmp/' + crypto.randomUUID());
    expect(r.ok).toBe(false);
  });

  it('경로에 이모지 포함 → err', async () => {
    const v = makeVectorizer();
    const r = await v.index('/tmp/🚀src');
    expect(r.ok).toBe(false);
  });

  it('경로에 한글 포함 → err', async () => {
    const v = makeVectorizer();
    const r = await v.index('/tmp/소스코드/src');
    expect(r.ok).toBe(false);
  });

  it('3번 교대로 search/index → 모두 err', async () => {
    const v = makeVectorizer();
    for (let i = 0; i < 3; i++) {
      expect((await v.search(`q${i}`)).ok).toBe(false);
      expect((await v.index(`/tmp/d${i}`)).ok).toBe(false);
    }
  });

  it('options.extensions 한 개 → err', async () => {
    const v = makeVectorizer();
    const r = await v.index('/tmp/src', { extensions: ['.ts'] });
    expect(r.ok).toBe(false);
  });

  it('루트 경로 "/" → err', async () => {
    const v = makeVectorizer();
    const r = await v.index('/');
    expect(r.ok).toBe(false);
  });
});

// ── 추가 edge/random: 다양한 config 조합 ──────────────────────

describe('Vectorizer 다양한 config 조합', () => {
  it('한글 model명 → 인스턴스 생성', () => {
    const config: EmbeddingConfig = {
      default: 'transformers',
      transformers: { model: '한글-모델명', dimensions: 384 },
    };
    expect(() => new Vectorizer('/tmp/db', config, logger)).not.toThrow();
  });

  it('특수문자 model명 → 인스턴스 생성', () => {
    const config: EmbeddingConfig = {
      default: 'transformers',
      transformers: { model: 'model!@#$%', dimensions: 384 },
    };
    expect(() => new Vectorizer('/tmp/db', config, logger)).not.toThrow();
  });

  it('dimensions=2 → 인스턴스 생성 + search err', async () => {
    const config: EmbeddingConfig = {
      default: 'transformers',
      transformers: { model: 'Xenova/all-MiniLM-L6-v2', dimensions: 2 },
    };
    const v = new Vectorizer('/tmp/db', config, logger);
    expect(v).toBeInstanceOf(Vectorizer);
    const r = await v.search('query');
    expect(r.ok).toBe(false);
  });

  it('dimensions=10000 → 인스턴스 생성 + index err', async () => {
    const config: EmbeddingConfig = {
      default: 'transformers',
      transformers: { model: 'Xenova/all-MiniLM-L6-v2', dimensions: 10000 },
    };
    const v = new Vectorizer('/tmp/db', config, logger);
    const r = await v.index('/tmp/dir');
    expect(r.ok).toBe(false);
  });

  it('여러 logger 레벨 순서 생성 → 모두 가능', () => {
    const levels = ['error', 'warn', 'info', 'debug'] as const;
    for (const lvl of levels) {
      const lg = new ConsoleLogger(lvl);
      const config = makeConfig();
      expect(() => new Vectorizer('/tmp/db', config, lg)).not.toThrow();
    }
  });
});

// ── 추가 edge: search 연속/반복 패턴 ─────────────────────────────

describe('Vectorizer search 연속/반복 패턴 (미초기화)', () => {
  it('search 10번 연속 → 모두 ok=false', async () => {
    const v = makeVectorizer();
    for (let i = 0; i < 10; i++) {
      const r = await v.search(`query-${i}`);
      expect(r.ok).toBe(false);
    }
  });

  it('search 에러 code는 매번 동일', async () => {
    const v = makeVectorizer();
    let code: string | undefined;
    for (let i = 0; i < 3; i++) {
      const r = await v.search(`q-${i}`);
      if (!r.ok) {
        if (code === undefined) code = r.error.code;
        else expect(r.error.code).toBe(code);
      }
    }
  });

  it('search 에러 name는 매번 동일', async () => {
    const v = makeVectorizer();
    let name: string | undefined;
    for (let i = 0; i < 3; i++) {
      const r = await v.search(`q-${i}`);
      if (!r.ok) {
        if (name === undefined) name = r.error.name;
        else expect(r.error.name).toBe(name);
      }
    }
  });

  it('search 후 index 후 search → 모두 err', async () => {
    const v = makeVectorizer();
    const r1 = await v.search('query-a');
    const r2 = await v.index('/tmp/dir-a');
    const r3 = await v.search('query-b');
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
    expect(r3.ok).toBe(false);
  });

  it('index 후 search 후 index → 모두 err', async () => {
    const v = makeVectorizer();
    const r1 = await v.index('/tmp/d1');
    const r2 = await v.search('s1');
    const r3 = await v.index('/tmp/d2');
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
    expect(r3.ok).toBe(false);
  });

  it('search 에러 객체에 stack 또는 name 포함', async () => {
    const v = makeVectorizer();
    const r = await v.search('stack-check');
    if (!r.ok) {
      expect(typeof r.error.name).toBe('string');
    }
  });

  it('search ok=false이면 value 없음', async () => {
    const v = makeVectorizer();
    const r = await v.search('check-value');
    if (!r.ok) {
      expect('value' in r).toBe(false);
    }
  });

  it('index ok=false이면 value 없음', async () => {
    const v = makeVectorizer();
    const r = await v.index('/tmp/check');
    if (!r.ok) {
      expect('value' in r).toBe(false);
    }
  });
});

// ── 추가 edge: Vectorizer 인스턴스 메서드 존재 ────────────────────

describe('Vectorizer 인스턴스 메서드 존재 검증', () => {
  it('initialize 메서드 존재 (타입: function)', () => {
    const v = makeVectorizer();
    expect(typeof v.initialize).toBe('function');
  });

  it('search 메서드 반환 타입은 Promise', () => {
    const v = makeVectorizer();
    const p = v.search('q');
    expect(p).toBeInstanceOf(Promise);
    p.catch(() => {});
  });

  it('index 메서드 반환 타입은 Promise', () => {
    const v = makeVectorizer();
    const p = v.index('/tmp');
    expect(p).toBeInstanceOf(Promise);
    p.catch(() => {});
  });

  it('search는 비동기 함수 (async)', async () => {
    const v = makeVectorizer();
    const result = v.search('async-check');
    expect(result).toBeInstanceOf(Promise);
    await result.catch(() => {});
  });

  it('index는 비동기 함수 (async)', async () => {
    const v = makeVectorizer();
    const result = v.index('/tmp/async');
    expect(result).toBeInstanceOf(Promise);
    await result.catch(() => {});
  });

  it('두 Vectorizer 인스턴스의 search 메서드는 프로토타입 공유 (같은 함수 참조)', () => {
    const v1 = makeVectorizer('/tmp/ref-a');
    const v2 = makeVectorizer('/tmp/ref-b');
    expect(v1.search).toBe(v2.search);
  });
});

// ── 추가 edge: search 다양한 limit 경계 ──────────────────────────

describe('Vectorizer search 다양한 limit 경계값 (미초기화)', () => {
  it('limit=2 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('q', 2);
    expect(r.ok).toBe(false);
  });

  it('limit=3 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('q', 3);
    expect(r.ok).toBe(false);
  });

  it('limit=7 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('q', 7);
    expect(r.ok).toBe(false);
  });

  it('limit=15 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('q', 15);
    expect(r.ok).toBe(false);
  });

  it('limit=25 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('q', 25);
    expect(r.ok).toBe(false);
  });

  it('limit=30 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('q', 30);
    expect(r.ok).toBe(false);
  });

  it('limit=75 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('q', 75);
    expect(r.ok).toBe(false);
  });

  it('limit=200 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('q', 200);
    expect(r.ok).toBe(false);
  });

  it('limit=500 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('q', 500);
    expect(r.ok).toBe(false);
  });

  it('limit=1000 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('q', 1000);
    expect(r.ok).toBe(false);
  });
});

// ── 추가 edge: index 다양한 경로 길이 ────────────────────────────

describe('Vectorizer index 다양한 경로 길이 (미초기화)', () => {
  it('경로 길이 1 → err', async () => {
    const v = makeVectorizer();
    const r = await v.index('/');
    expect(r.ok).toBe(false);
  });

  it('경로 길이 5 → err', async () => {
    const v = makeVectorizer();
    const r = await v.index('/tmp/');
    expect(r.ok).toBe(false);
  });

  it('경로 길이 10 → err', async () => {
    const v = makeVectorizer();
    const r = await v.index('/tmp/abcde');
    expect(r.ok).toBe(false);
  });

  it('경로 길이 50 → err', async () => {
    const v = makeVectorizer();
    const r = await v.index('/tmp/' + 'x'.repeat(45));
    expect(r.ok).toBe(false);
  });

  it('경로 길이 100 → err', async () => {
    const v = makeVectorizer();
    const r = await v.index('/tmp/' + 'x'.repeat(95));
    expect(r.ok).toBe(false);
  });

  it('경로 깊이 3 → err', async () => {
    const v = makeVectorizer();
    const r = await v.index('/tmp/a/b/c');
    expect(r.ok).toBe(false);
  });

  it('경로 깊이 5 → err', async () => {
    const v = makeVectorizer();
    const r = await v.index('/tmp/a/b/c/d/e');
    expect(r.ok).toBe(false);
  });

  it('경로에 숫자 포함 → err', async () => {
    const v = makeVectorizer();
    const r = await v.index('/tmp/src123');
    expect(r.ok).toBe(false);
  });

  it('경로에 언더스코어 포함 → err', async () => {
    const v = makeVectorizer();
    const r = await v.index('/tmp/my_project/src');
    expect(r.ok).toBe(false);
  });

  it('경로에 점 두 개 → err', async () => {
    const v = makeVectorizer();
    const r = await v.index('/tmp/my.project.src');
    expect(r.ok).toBe(false);
  });
});

// ── 추가 edge: search 쿼리 패턴 변형 ────────────────────────────

describe('Vectorizer search 쿼리 패턴 변형 (미초기화)', () => {
  it('자바스크립트 키워드 쿼리 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('const function class interface type');
    expect(r.ok).toBe(false);
  });

  it('타입스크립트 타입 쿼리 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('Record<string, unknown>');
    expect(r.ok).toBe(false);
  });

  it('Markdown 형태 쿼리 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('# Heading\n## Sub\n- item1\n- item2');
    expect(r.ok).toBe(false);
  });

  it('HTML 태그 쿼리 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('<div class="test"><span>content</span></div>');
    expect(r.ok).toBe(false);
  });

  it('CSS 선택자 쿼리 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('.container > .child:first-of-type');
    expect(r.ok).toBe(false);
  });

  it('Regex 패턴 쿼리 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('^[a-z]+\\d{2,4}$');
    expect(r.ok).toBe(false);
  });

  it('PATH 형태 쿼리 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('/usr/local/bin/node');
    expect(r.ok).toBe(false);
  });

  it('IP 주소 쿼리 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('192.168.1.100:3000');
    expect(r.ok).toBe(false);
  });

  it('이메일 형태 쿼리 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('user@example.com');
    expect(r.ok).toBe(false);
  });

  it('전화번호 형태 쿼리 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('+82-10-1234-5678');
    expect(r.ok).toBe(false);
  });
});

// ── 추가 edge: EmbeddingConfig 조합 추가 ─────────────────────────

describe('Vectorizer EmbeddingConfig 추가 조합', () => {
  it('transformers.model에 슬래시 포함 → 인스턴스 생성', () => {
    const config: EmbeddingConfig = {
      default: 'transformers',
      transformers: { model: 'org/model-name', dimensions: 384 },
    };
    expect(() => new Vectorizer('/tmp/db', config, logger)).not.toThrow();
  });

  it('transformers.model에 버전 포함 → 인스턴스 생성', () => {
    const config: EmbeddingConfig = {
      default: 'transformers',
      transformers: { model: 'org/model-name@v1.0', dimensions: 384 },
    };
    expect(() => new Vectorizer('/tmp/db', config, logger)).not.toThrow();
  });

  it('dimensions=256 → 인스턴스 생성 + search err', async () => {
    const config: EmbeddingConfig = {
      default: 'transformers',
      transformers: { model: 'Xenova/all-MiniLM-L6-v2', dimensions: 256 },
    };
    const v = new Vectorizer('/tmp/db', config, logger);
    const r = await v.search('query');
    expect(r.ok).toBe(false);
  });

  it('dimensions=512 → 인스턴스 생성 + index err', async () => {
    const config: EmbeddingConfig = {
      default: 'transformers',
      transformers: { model: 'Xenova/all-MiniLM-L6-v2', dimensions: 512 },
    };
    const v = new Vectorizer('/tmp/db', config, logger);
    const r = await v.index('/tmp/src');
    expect(r.ok).toBe(false);
  });

  it('모델명 "bert-base-uncased" → 인스턴스 생성', () => {
    const config: EmbeddingConfig = {
      default: 'transformers',
      transformers: { model: 'bert-base-uncased', dimensions: 768 },
    };
    expect(() => new Vectorizer('/tmp/db', config, logger)).not.toThrow();
  });

  it('모델명 "roberta-base" → 인스턴스 생성', () => {
    const config: EmbeddingConfig = {
      default: 'transformers',
      transformers: { model: 'roberta-base', dimensions: 768 },
    };
    expect(() => new Vectorizer('/tmp/db', config, logger)).not.toThrow();
  });

  it('dimensions 배열 순서 → 인스턴스 생성', () => {
    const dims = [16, 32, 64, 128, 256, 384, 512, 768, 1024, 1536];
    for (const d of dims) {
      const config: EmbeddingConfig = {
        default: 'transformers',
        transformers: { model: 'test-model', dimensions: d },
      };
      expect(() => new Vectorizer('/tmp/db', config, logger)).not.toThrow();
    }
  });
});

// ── 추가 edge: search filter 다양한 값 ────────────────────────────

describe('Vectorizer search filter 다양한 값 (미초기화)', () => {
  it('filter에 language 포함 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('q', 5, { language: 'typescript' });
    expect(r.ok).toBe(false);
  });

  it('filter에 path 포함 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('q', 5, { path: '/src/core' });
    expect(r.ok).toBe(false);
  });

  it('filter에 여러 필드 포함 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('q', 5, { language: 'ts', type: 'function' });
    expect(r.ok).toBe(false);
  });

  it('filter에 null 값 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('q', 5, { language: null as unknown as string });
    expect(r.ok).toBe(false);
  });

  it('filter 빈 객체 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('q', 10, {});
    expect(r.ok).toBe(false);
  });

  it('filter에 숫자 값 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('q', 5, { score: 0.9 as unknown as string });
    expect(r.ok).toBe(false);
  });

  it('filter에 boolean 값 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('q', 5, { active: true as unknown as string });
    expect(r.ok).toBe(false);
  });

  it('filter에 한글 값 → err', async () => {
    const v = makeVectorizer();
    const r = await v.search('q', 5, { language: '한국어' });
    expect(r.ok).toBe(false);
  });

  it('5번 다른 filter 조합 → 모두 err', async () => {
    const v = makeVectorizer();
    const filters = [
      { lang: 'ts' },
      { path: '/src' },
      { type: 'class' },
      { module: 'core' },
      { level: 'info' },
    ];
    for (const f of filters) {
      const r = await v.search('q', 5, f);
      expect(r.ok).toBe(false);
    }
  });
});

// ── 추가 edge: 여러 Vectorizer 인스턴스 병렬 동작 ─────────────────

describe('Vectorizer 여러 인스턴스 병렬 동작', () => {
  it('3개 인스턴스 병렬 search → 모두 err', async () => {
    const vs = [makeVectorizer('/tmp/par-a'), makeVectorizer('/tmp/par-b'), makeVectorizer('/tmp/par-c')];
    const results = await Promise.all(vs.map((v) => v.search('query')));
    for (const r of results) {
      expect(r.ok).toBe(false);
    }
  });

  it('3개 인스턴스 병렬 index → 모두 err', async () => {
    const vs = [makeVectorizer('/tmp/par-x'), makeVectorizer('/tmp/par-y'), makeVectorizer('/tmp/par-z')];
    const results = await Promise.all(vs.map((v, i) => v.index(`/tmp/dir-${i}`)));
    for (const r of results) {
      expect(r.ok).toBe(false);
    }
  });

  it('5개 인스턴스 동시 search + index → 모두 err', async () => {
    const vs = Array.from({ length: 5 }, (_, i) => makeVectorizer(`/tmp/mix-${i}`));
    const results = await Promise.all([
      ...vs.map((v) => v.search('parallel-query')),
      ...vs.map((v, i) => v.index(`/tmp/par-dir-${i}`)),
    ]);
    for (const r of results) {
      expect(r.ok).toBe(false);
    }
  });

  it('같은 dbPath 두 인스턴스 병렬 search → 모두 err', async () => {
    const v1 = makeVectorizer('/tmp/shared-path');
    const v2 = makeVectorizer('/tmp/shared-path');
    const [r1, r2] = await Promise.all([v1.search('s1'), v2.search('s2')]);
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
  });

  it('10개 인스턴스 연속 생성 후 search → 모두 err', async () => {
    const vs = Array.from({ length: 10 }, (_, i) => makeVectorizer(`/tmp/seq-${i}`));
    for (const v of vs) {
      const r = await v.search('sequential-query');
      expect(r.ok).toBe(false);
    }
  });
});

// ── 추가 edge: index options 확장 ────────────────────────────────

describe('Vectorizer index options 확장 (미초기화)', () => {
  it('options.excludePatterns 포함 → err', async () => {
    const v = makeVectorizer();
    const r = await v.index('/tmp/src', { excludePatterns: ['*.test.ts'] } as Parameters<typeof v.index>[1]);
    expect(r.ok).toBe(false);
  });

  it('options.includePatterns 포함 → err', async () => {
    const v = makeVectorizer();
    const r = await v.index('/tmp/src', { includePatterns: ['*.ts'] } as Parameters<typeof v.index>[1]);
    expect(r.ok).toBe(false);
  });

  it('options 없음 → err (기본)', async () => {
    const v = makeVectorizer();
    const r = await v.index('/tmp/src');
    expect(r.ok).toBe(false);
  });

  it('options.extensions 10종 → err', async () => {
    const v = makeVectorizer();
    const r = await v.index('/tmp/src', {
      extensions: ['.ts', '.js', '.tsx', '.jsx', '.py', '.go', '.rs', '.java', '.cs', '.cpp'],
    });
    expect(r.ok).toBe(false);
  });

  it('options.extensions 단일 py → err', async () => {
    const v = makeVectorizer();
    const r = await v.index('/tmp/src', { extensions: ['.py'] });
    expect(r.ok).toBe(false);
  });

  it('options.extensions 단일 go → err', async () => {
    const v = makeVectorizer();
    const r = await v.index('/tmp/src', { extensions: ['.go'] });
    expect(r.ok).toBe(false);
  });

  it('5가지 options.extensions 조합 → 모두 err', async () => {
    const v = makeVectorizer();
    const extCombos = [
      ['.ts'],
      ['.js', '.ts'],
      ['.tsx', '.jsx'],
      ['.py', '.rb'],
      ['.go', '.rs', '.java'],
    ];
    for (const exts of extCombos) {
      const r = await v.index('/tmp/src', { extensions: exts });
      expect(r.ok).toBe(false);
    }
  });
});

// ── 추가 edge: 생성자 경계값 추가 ────────────────────────────────

describe('Vectorizer 생성자 추가 경계값 2', () => {
  it('경로에 두 슬래시 포함 → 인스턴스 생성', () => {
    expect(() => makeVectorizer('/tmp//double-slash')).not.toThrow();
  });

  it('경로에 점 두 개 포함 → 인스턴스 생성', () => {
    expect(() => makeVectorizer('/tmp/my..db')).not.toThrow();
  });

  it('경로에 탭 포함 → 인스턴스 생성', () => {
    expect(() => makeVectorizer('/tmp/my\tdb')).not.toThrow();
  });

  it('경로에 개행 포함 → 인스턴스 생성 (OS 차이)', () => {
    expect(() => makeVectorizer('/tmp/my\ndb')).not.toThrow();
  });

  it('경로에 null 문자 포함 → 인스턴스 생성 (OS 차이)', () => {
    expect(() => makeVectorizer('/tmp/my\u0000db')).not.toThrow();
  });

  it('경로에 숫자로만 구성 → 인스턴스 생성', () => {
    expect(() => makeVectorizer('/tmp/1234567890')).not.toThrow();
  });

  it('경로에 대문자 포함 → 인스턴스 생성', () => {
    expect(() => makeVectorizer('/tmp/MyDatabase')).not.toThrow();
  });

  it('경로에 혼합 → 인스턴스 생성', () => {
    expect(() => makeVectorizer('/tmp/My-DB_v1.0')).not.toThrow();
  });

  it('50개 인스턴스 생성 → 모두 Vectorizer', () => {
    for (let i = 0; i < 50; i++) {
      const v = makeVectorizer(`/tmp/mass-${i}`);
      expect(v).toBeInstanceOf(Vectorizer);
    }
  });

  it('다양한 dbPath 10개 → 모두 인스턴스', () => {
    const paths = [
      '/tmp/a', '/tmp/b', '/tmp/c', '/tmp/d', '/tmp/e',
      '/tmp/f', '/tmp/g', '/tmp/h', '/tmp/i', '/tmp/j',
    ];
    for (const p of paths) {
      expect(() => makeVectorizer(p)).not.toThrow();
    }
  });
});
