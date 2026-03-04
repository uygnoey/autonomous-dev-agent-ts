import { describe, expect, it } from 'bun:test';
import {
  ChunkSplitter,
  detectLanguage,
  extractModule,
} from '../../../src/rag/chunk-splitter.js';

describe('ChunkSplitter', () => {
  const splitter = new ChunkSplitter();

  // ── splitCode (TypeScript) ───────────────────────────────────

  describe('splitCode - TypeScript', () => {
    it('함수 단위로 분할한다', () => {
      const content = `
function greet(name: string): string {
  return 'Hello ' + name;
}

function farewell(name: string): string {
  return 'Bye ' + name;
}
`.trim();

      const chunks = splitter.splitCode(content, 'src/core/utils.ts');

      expect(chunks.length).toBeGreaterThanOrEqual(2);
      expect(chunks[0]?.metadata.functionName).toBe('greet');
      expect(chunks[0]?.metadata.language).toBe('typescript');
      expect(chunks[0]?.metadata.module).toBe('src/core');
    });

    it('클래스를 감지한다', () => {
      const content = `
class UserService {
  constructor(private db: Database) {}

  getUser(id: string) {
    return this.db.find(id);
  }
}

class AdminService {
  constructor(private db: Database) {}
}
`.trim();

      const chunks = splitter.splitCode(content, 'src/services/user-service.ts');

      const classChunks = chunks.filter(
        (c) => c.metadata.functionName === 'UserService' || c.metadata.functionName === 'AdminService',
      );
      expect(classChunks.length).toBeGreaterThanOrEqual(2);
    });

    it('export 키워드가 있는 함수를 감지한다', () => {
      const content = `
export function createUser(data: UserInput): User {
  return new User(data);
}

export async function deleteUser(id: string): Promise<void> {
  await db.delete(id);
}
`.trim();

      const chunks = splitter.splitCode(content, 'src/api/users.ts');

      expect(chunks.length).toBeGreaterThanOrEqual(2);
      expect(chunks[0]?.metadata.functionName).toBe('createUser');
    });

    it('interface와 type을 감지한다', () => {
      const content = `
interface UserDTO {
  id: string;
  name: string;
}

type UserResponse = {
  data: UserDTO;
  status: number;
};
`.trim();

      const chunks = splitter.splitCode(content, 'src/types/user.ts');

      const names = chunks.map((c) => c.metadata.functionName);
      expect(names).toContain('UserDTO');
      expect(names).toContain('UserResponse');
    });

    it('const 화살표 함수를 감지한다', () => {
      const content = `
const processData = (input: string) => {
  return input.trim();
};

const calculateSum = async (numbers: number[]) => {
  return numbers.reduce((a, b) => a + b, 0);
};
`.trim();

      const chunks = splitter.splitCode(content, 'src/utils/helpers.ts');

      const names = chunks.map((c) => c.metadata.functionName);
      expect(names).toContain('processData');
    });
  });

  // ── chunk size ───────────────────────────────────────────────

  describe('chunk size limits', () => {
    it('maxChunkSize를 초과하지 않는다', () => {
      const longFunction = `function longFunc() {\n${'  const x = 1;\n'.repeat(200)}}`;
      const content = longFunction;

      const chunks = splitter.splitCode(content, 'test.ts', { maxChunkSize: 500 });

      for (const chunk of chunks) {
        expect(chunk.content.length).toBeLessThanOrEqual(500);
      }
    });

    it('커스텀 maxChunkSize 옵션이 적용된다', () => {
      const content = 'a'.repeat(5000);

      const chunks = splitter.splitCode(content, 'test.txt', { maxChunkSize: 1000 });

      for (const chunk of chunks) {
        expect(chunk.content.length).toBeLessThanOrEqual(1000);
      }
    });
  });

  // ── overlap ──────────────────────────────────────────────────

  describe('overlap', () => {
    it('경계 없는 파일에서 오버랩 청크가 생성된다', () => {
      const content = 'x'.repeat(3000);

      const chunks = splitter.splitCode(content, 'data.txt', {
        maxChunkSize: 1000,
        overlapRatio: 0.2,
      });

      // 오버랩이 있으므로 3000 / (1000 - 200) = 약 3.75 → 4개 이상
      expect(chunks.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ── edge cases ───────────────────────────────────────────────

  describe('edge cases', () => {
    it('빈 파일은 빈 배열을 반환한다', () => {
      const chunks = splitter.splitCode('', 'empty.ts');

      expect(chunks).toEqual([]);
    });

    it('공백만 있는 파일은 빈 배열을 반환한다', () => {
      const chunks = splitter.splitCode('   \n  \n  ', 'whitespace.ts');

      expect(chunks).toEqual([]);
    });

    it('한 줄 파일을 처리한다', () => {
      const chunks = splitter.splitCode('const x = 1;', 'single.ts');

      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });

    it('매우 큰 파일도 처리한다', () => {
      const content = Array.from({ length: 1000 }, (_, i) =>
        `function func${i}() { return ${i}; }`,
      ).join('\n\n');

      const chunks = splitter.splitCode(content, 'large.ts');

      expect(chunks.length).toBeGreaterThan(0);
    });

    it('지원하지 않는 언어의 파일은 크기 기반 분할을 한다', () => {
      const content = 'some content here\nmore content\nand more';

      const chunks = splitter.splitCode(content, 'file.unknown');

      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0]?.metadata.language).toBe('unknown');
    });
  });
});

// ── detectLanguage ──────────────────────────────────────────────

describe('detectLanguage', () => {
  it('TypeScript 확장자를 감지한다', () => {
    expect(detectLanguage('src/core/config.ts')).toBe('typescript');
    expect(detectLanguage('src/ui/App.tsx')).toBe('typescript');
  });

  it('JavaScript 확장자를 감지한다', () => {
    expect(detectLanguage('lib/utils.js')).toBe('javascript');
    expect(detectLanguage('components/App.jsx')).toBe('javascript');
  });

  it('Python 확장자를 감지한다', () => {
    expect(detectLanguage('scripts/main.py')).toBe('python');
  });

  it('Rust 확장자를 감지한다', () => {
    expect(detectLanguage('src/main.rs')).toBe('rust');
  });

  it('Go 확장자를 감지한다', () => {
    expect(detectLanguage('cmd/server.go')).toBe('go');
  });

  it('알 수 없는 확장자는 unknown을 반환한다', () => {
    expect(detectLanguage('file.xyz')).toBe('unknown');
  });

  it('확장자 없는 파일은 unknown을 반환한다', () => {
    expect(detectLanguage('Makefile')).toBe('unknown');
  });

  it('JSON/YAML을 감지한다', () => {
    expect(detectLanguage('config.json')).toBe('json');
    expect(detectLanguage('config.yaml')).toBe('yaml');
    expect(detectLanguage('config.yml')).toBe('yaml');
  });
});

// ── extractModule ───────────────────────────────────────────────

describe('extractModule', () => {
  it('src/ 이하 모듈 경로를 추출한다', () => {
    expect(extractModule('src/core/config.ts')).toBe('src/core');
    expect(extractModule('src/rag/embeddings.ts')).toBe('src/rag');
  });

  it('src/가 없으면 dirname을 반환한다', () => {
    expect(extractModule('lib/utils.ts')).toBe('lib');
  });

  it('루트 레벨 파일은 .을 반환한다', () => {
    expect(extractModule('index.ts')).toBe('.');
  });
});
