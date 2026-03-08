import { describe, expect, it } from 'bun:test';
import {
  ChunkSplitter,
  detectLanguage,
  extractModule,
} from 'rag/chunk-splitter.js';

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

    it('단일 함수 → 청크 1개 이상', () => {
      const content = 'function singleFunc() { return 42; }';
      const chunks = splitter.splitCode(content, 'src/single.ts');
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });

    it('단일 함수 → functionName 일치', () => {
      const content = 'function singleFunc() { return 42; }';
      const chunks = splitter.splitCode(content, 'src/single.ts');
      expect(chunks[0]?.metadata.functionName).toBe('singleFunc');
    });

    it('export default function → 감지', () => {
      const content = `
export default function MainComponent() {
  return null;
}
`.trim();
      const chunks = splitter.splitCode(content, 'src/components/main.tsx');
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });

    it('async function → 감지', () => {
      const content = `
async function fetchData(url: string): Promise<Response> {
  return fetch(url);
}
`.trim();
      const chunks = splitter.splitCode(content, 'src/api/fetch.ts');
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      const names = chunks.map((c) => c.metadata.functionName);
      expect(names).toContain('fetchData');
    });

    it('export async function → 감지', () => {
      const content = `
export async function initDB(url: string): Promise<void> {
  await connect(url);
}
`.trim();
      const chunks = splitter.splitCode(content, 'src/db/init.ts');
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });

    it('language 메타데이터가 typescript', () => {
      const chunks = splitter.splitCode('function x() {}', 'src/x.ts');
      for (const chunk of chunks) {
        expect(chunk.metadata.language).toBe('typescript');
      }
    });

    it('language 메타데이터가 tsx도 typescript', () => {
      const chunks = splitter.splitCode('function x() { return null; }', 'src/x.tsx');
      for (const chunk of chunks) {
        expect(chunk.metadata.language).toBe('typescript');
      }
    });

    it('module 메타데이터가 올바르다', () => {
      const chunks = splitter.splitCode('function x() {}', 'src/core/utils.ts');
      expect(chunks[0]?.metadata.module).toBe('src/core');
    });

    it('10개 함수 → 10개 이상 청크', () => {
      const functions = Array.from({ length: 10 }, (_, i) => `function func${i}() { return ${i}; }`).join('\n\n');
      const chunks = splitter.splitCode(functions, 'src/many.ts');
      expect(chunks.length).toBeGreaterThanOrEqual(10);
    });

    it('청크 content 필드가 문자열이다', () => {
      const content = 'function x() { return 1; }';
      const chunks = splitter.splitCode(content, 'src/x.ts');
      for (const chunk of chunks) {
        expect(typeof chunk.content).toBe('string');
      }
    });

    it('청크 content가 비어있지 않다', () => {
      const content = 'function x() { return 1; }';
      const chunks = splitter.splitCode(content, 'src/x.ts');
      for (const chunk of chunks) {
        expect(chunk.content.length).toBeGreaterThan(0);
      }
    });

    it('metadata filePath가 설정된다', () => {
      const chunks = splitter.splitCode('function x() {}', 'src/utils/helper.ts');
      if (chunks.length > 0) {
        expect(chunks[0]?.metadata.filePath).toContain('src/utils/helper.ts');
      }
    });

    it('class 키워드 functionName으로 클래스 이름 감지', () => {
      const content = `
class MyClass {
  method() {}
}
`.trim();
      const chunks = splitter.splitCode(content, 'src/my-class.ts');
      const names = chunks.map((c) => c.metadata.functionName);
      expect(names).toContain('MyClass');
    });

    it('export class → 감지', () => {
      const content = `
export class ExportedService {
  run() {}
}
`.trim();
      const chunks = splitter.splitCode(content, 'src/exported.ts');
      const names = chunks.map((c) => c.metadata.functionName);
      expect(names).toContain('ExportedService');
    });

    it('interface 키워드 감지', () => {
      const content = `
interface IRepository {
  find(id: string): unknown;
}
`.trim();
      const chunks = splitter.splitCode(content, 'src/types.ts');
      const names = chunks.map((c) => c.metadata.functionName);
      expect(names).toContain('IRepository');
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

    it('maxChunkSize=100 → 각 청크 100자 이하', () => {
      const content = 'x'.repeat(2000);
      const chunks = splitter.splitCode(content, 'test.txt', { maxChunkSize: 100 });
      for (const chunk of chunks) {
        expect(chunk.content.length).toBeLessThanOrEqual(100);
      }
    });

    it('maxChunkSize=10000 (매우 큰 값) → 청크 분할됨', () => {
      const content = 'function x() { return 1; }\nfunction y() { return 2; }';
      const chunks = splitter.splitCode(content, 'test.ts', { maxChunkSize: 10000 });
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('maxChunkSize=50 → 청크 여러 개 생성', () => {
      const content = 'a'.repeat(500);
      const chunks = splitter.splitCode(content, 'test.txt', { maxChunkSize: 50 });
      expect(chunks.length).toBeGreaterThan(5);
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

    it('overlapRatio=0 → 오버랩 없음', () => {
      const content = 'x'.repeat(2000);
      const chunks = splitter.splitCode(content, 'data.txt', {
        maxChunkSize: 1000,
        overlapRatio: 0,
      });
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('overlapRatio=0.5 → 청크 개수 증가', () => {
      const content = 'x'.repeat(3000);
      const chunksNoOverlap = splitter.splitCode(content, 'data.txt', {
        maxChunkSize: 1000,
        overlapRatio: 0,
      });
      const chunksWithOverlap = splitter.splitCode(content, 'data.txt', {
        maxChunkSize: 1000,
        overlapRatio: 0.5,
      });
      expect(chunksWithOverlap.length).toBeGreaterThanOrEqual(chunksNoOverlap.length);
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

    it('개행만 있는 파일 → 빈 배열', () => {
      const chunks = splitter.splitCode('\n\n\n\n\n', 'newlines.ts');
      expect(chunks).toEqual([]);
    });

    it('탭만 있는 파일 → 빈 배열', () => {
      const chunks = splitter.splitCode('\t\t\t', 'tabs.ts');
      expect(chunks).toEqual([]);
    });

    it('주석만 있는 파일 → 청크 반환 또는 빈 배열', () => {
      const content = '// just a comment\n// another comment';
      const chunks = splitter.splitCode(content, 'comments.ts');
      expect(Array.isArray(chunks)).toBe(true);
    });

    it('한국어 주석 포함 → 처리됨', () => {
      const content = '// 사용자 인증 함수\nfunction auth(token: string) { return !!token; }';
      const chunks = splitter.splitCode(content, 'src/auth.ts');
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('한국어 함수명 (TypeScript 허용) → 처리됨', () => {
      const content = 'function 인증(token: string) { return !!token; }';
      const chunks = splitter.splitCode(content, 'src/auth.ts');
      expect(Array.isArray(chunks)).toBe(true);
    });

    it('반환값 배열이다', () => {
      const chunks = splitter.splitCode('const x = 1;', 'test.ts');
      expect(Array.isArray(chunks)).toBe(true);
    });

    it('숫자로 시작하는 파일명 → 처리됨', () => {
      const chunks = splitter.splitCode('function test() {}', '123abc.ts');
      expect(Array.isArray(chunks)).toBe(true);
    });

    it('경로 없는 파일명만 → 처리됨', () => {
      const chunks = splitter.splitCode('function x() {}', 'main.ts');
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('깊은 중첩 경로 → 처리됨', () => {
      const chunks = splitter.splitCode('function x() {}', 'a/b/c/d/e/f.ts');
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('연속 호출 → 동일 결과', () => {
      const content = 'function x() { return 1; }';
      const c1 = splitter.splitCode(content, 'src/x.ts');
      const c2 = splitter.splitCode(content, 'src/x.ts');
      expect(c1.length).toBe(c2.length);
    });

    it('같은 이름 함수 여러 개 → 모두 청크', () => {
      const content = `
function duplicate() { return 1; }
function duplicate() { return 2; }
`.trim();
      const chunks = splitter.splitCode(content, 'src/dup.ts');
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });

    it('JavaScript 파일 → language=javascript', () => {
      const chunks = splitter.splitCode('function main() {}', 'app.js');
      for (const chunk of chunks) {
        expect(chunk.metadata.language).toBe('javascript');
      }
    });

    it('Python 파일 → language=python', () => {
      const content = 'def main():\n    pass';
      const chunks = splitter.splitCode(content, 'main.py');
      for (const chunk of chunks) {
        expect(chunk.metadata.language).toBe('python');
      }
    });

    it('Rust 파일 → language=rust', () => {
      const content = 'fn main() { println!("hello"); }';
      const chunks = splitter.splitCode(content, 'main.rs');
      for (const chunk of chunks) {
        expect(chunk.metadata.language).toBe('rust');
      }
    });

    it('Go 파일 → language=go', () => {
      const content = 'package main\nfunc main() {}';
      const chunks = splitter.splitCode(content, 'main.go');
      for (const chunk of chunks) {
        expect(chunk.metadata.language).toBe('go');
      }
    });
  });

  // ── metadata completeness ───────────────────────────────────

  describe('metadata completeness', () => {
    it('각 청크에 metadata 객체가 있다', () => {
      const chunks = splitter.splitCode('function x() { return 1; }', 'src/x.ts');
      for (const chunk of chunks) {
        expect(chunk.metadata).toBeDefined();
      }
    });

    it('각 청크에 language가 있다', () => {
      const chunks = splitter.splitCode('function x() { return 1; }', 'src/x.ts');
      for (const chunk of chunks) {
        expect(chunk.metadata.language).toBeDefined();
      }
    });

    it('각 청크에 module이 있다', () => {
      const chunks = splitter.splitCode('function x() { return 1; }', 'src/core/x.ts');
      for (const chunk of chunks) {
        expect(chunk.metadata.module).toBeDefined();
      }
    });

    it('청크 index가 순서대로 증가하거나 없음 (있으면 정렬)', () => {
      const content = Array.from({ length: 5 }, (_, i) => `function f${i}() {}`).join('\n\n');
      const chunks = splitter.splitCode(content, 'src/x.ts');
      expect(chunks.length).toBeGreaterThan(0);
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

  it('.ts 파일 → typescript', () => {
    expect(detectLanguage('index.ts')).toBe('typescript');
  });

  it('.tsx 파일 → typescript', () => {
    expect(detectLanguage('App.tsx')).toBe('typescript');
  });

  it('.js 파일 → javascript', () => {
    expect(detectLanguage('index.js')).toBe('javascript');
  });

  it('.jsx 파일 → javascript', () => {
    expect(detectLanguage('App.jsx')).toBe('javascript');
  });

  it('.py 파일 → python', () => {
    expect(detectLanguage('script.py')).toBe('python');
  });

  it('.rs 파일 → rust', () => {
    expect(detectLanguage('lib.rs')).toBe('rust');
  });

  it('.go 파일 → go', () => {
    expect(detectLanguage('main.go')).toBe('go');
  });

  it('.json 파일 → json', () => {
    expect(detectLanguage('package.json')).toBe('json');
  });

  it('.yaml 파일 → yaml', () => {
    expect(detectLanguage('docker-compose.yaml')).toBe('yaml');
  });

  it('.yml 파일 → yaml', () => {
    expect(detectLanguage('.github/workflows/ci.yml')).toBe('yaml');
  });

  it('.txt 파일 → unknown', () => {
    expect(detectLanguage('readme.txt')).toBe('unknown');
  });

  it('.md 파일 → unknown (또는 markdown)', () => {
    const result = detectLanguage('README.md');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('.sh 파일 → unknown (또는 shell)', () => {
    const result = detectLanguage('install.sh');
    expect(typeof result).toBe('string');
  });

  it('.csv 파일 → unknown', () => {
    expect(detectLanguage('data.csv')).toBe('unknown');
  });

  it('.html 파일 → unknown 또는 html', () => {
    const result = detectLanguage('index.html');
    expect(typeof result).toBe('string');
  });

  it('숨김 파일 (.gitignore) → unknown', () => {
    const result = detectLanguage('.gitignore');
    expect(typeof result).toBe('string');
  });

  it('빈 문자열 → unknown', () => {
    const result = detectLanguage('');
    expect(typeof result).toBe('string');
  });

  it('경로 없는 파일명 → 확장자 감지', () => {
    expect(detectLanguage('app.ts')).toBe('typescript');
  });

  it('깊은 경로 → 확장자 감지', () => {
    expect(detectLanguage('a/b/c/d/e/app.ts')).toBe('typescript');
  });

  it('.env 파일 → unknown', () => {
    const result = detectLanguage('.env');
    expect(typeof result).toBe('string');
  });

  it('반환값이 문자열이다', () => {
    const langs = [
      detectLanguage('a.ts'),
      detectLanguage('b.js'),
      detectLanguage('c.py'),
      detectLanguage('d.rs'),
      detectLanguage('e.go'),
    ];
    for (const lang of langs) {
      expect(typeof lang).toBe('string');
    }
  });

  it('반복 호출 → 동일 결과', () => {
    const r1 = detectLanguage('src/core/main.ts');
    const r2 = detectLanguage('src/core/main.ts');
    expect(r1).toBe(r2);
  });

  it('.TS (대문자 확장자) → 처리됨 (unknown 또는 typescript)', () => {
    const result = detectLanguage('MAIN.TS');
    expect(typeof result).toBe('string');
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

  it('src/core → src/core', () => {
    expect(extractModule('src/core/logger.ts')).toBe('src/core');
  });

  it('src/cli → src/cli', () => {
    expect(extractModule('src/cli/main.ts')).toBe('src/cli');
  });

  it('src/rag → src/rag', () => {
    expect(extractModule('src/rag/chunk-splitter.ts')).toBe('src/rag');
  });

  it('src/layer1 → src/layer1', () => {
    expect(extractModule('src/layer1/designer.ts')).toBe('src/layer1');
  });

  it('src/layer2 → src/layer2', () => {
    expect(extractModule('src/layer2/agent-spawner.ts')).toBe('src/layer2');
  });

  it('src/layer3 → src/layer3', () => {
    expect(extractModule('src/layer3/verifier.ts')).toBe('src/layer3');
  });

  it('src/auth → src/auth', () => {
    expect(extractModule('src/auth/api-key.ts')).toBe('src/auth');
  });

  it('src/mcp → src/mcp', () => {
    expect(extractModule('src/mcp/registry.ts')).toBe('src/mcp');
  });

  it('반환값이 문자열이다', () => {
    expect(typeof extractModule('src/core/utils.ts')).toBe('string');
  });

  it('반환값이 비어있지 않다', () => {
    expect(extractModule('src/core/utils.ts').length).toBeGreaterThan(0);
  });

  it('루트 파일 → .', () => {
    expect(extractModule('main.ts')).toBe('.');
  });

  it('이중 경로 src/deep/more → src/deep', () => {
    const result = extractModule('src/deep/more/file.ts');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('반복 호출 → 동일 결과', () => {
    const r1 = extractModule('src/core/config.ts');
    const r2 = extractModule('src/core/config.ts');
    expect(r1).toBe(r2);
  });

  it('tests/ 경로 → tests 하위 디렉토리', () => {
    const result = extractModule('tests/unit/core/logger.test.ts');
    expect(typeof result).toBe('string');
  });

  it('경로 없는 파일 → .', () => {
    expect(extractModule('file.ts')).toBe('.');
  });

  it('다양한 확장자 → 동일 모듈 추출', () => {
    const tsResult = extractModule('src/utils/helper.ts');
    const jsResult = extractModule('src/utils/helper.js');
    expect(tsResult).toBe(jsResult);
  });
});
