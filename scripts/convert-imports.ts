import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative, dirname, join } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');
const SRC  = join(ROOT, 'src');
const TESTS = join(ROOT, 'tests');

/** 상대경로 import → @/ 절대경로 변환 */
function convertImports(filePath: string, content: string): string {
  const fileDir = dirname(filePath);

  return content.replace(
    /from\s+'(\.[^']+)'/g,
    (_match: string, importPath: string) => {
      if (!importPath.startsWith('.')) return _match;

      // 절대 경로로 해석
      const abs = resolve(fileDir, importPath);

      // src/ 기준 상대 경로 계산
      const relFromSrc = relative(SRC, abs).split('\\').join('/');

      // src/ 하위가 아니면 그대로
      if (relFromSrc.startsWith('..')) return _match;

      return `from '@/${relFromSrc}'`;
    }
  ).replace(
    /from\s+"(\.[^"]+)"/g,
    (_match: string, importPath: string) => {
      if (!importPath.startsWith('.')) return _match;

      const abs = resolve(fileDir, importPath);
      const relFromSrc = relative(SRC, abs).split('\\').join('/');

      if (relFromSrc.startsWith('..')) return _match;

      return `from "@/${relFromSrc}"`;
    }
  );
}

/** 디렉토리 내 .ts 파일 재귀 수집 */
function collectTs(dir: string): string[] {
  const result: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) result.push(...collectTs(full));
    else if (e.isFile() && e.name.endsWith('.ts')) result.push(full);
  }
  return result;
}

let changed = 0;
const files = [...collectTs(SRC), ...collectTs(TESTS)];

for (const filePath of files) {
  const original = readFileSync(filePath, 'utf8');
  const converted = convertImports(filePath, original);
  if (converted !== original) {
    writeFileSync(filePath, converted, 'utf8');
    changed++;
    console.log('  ✔ ' + relative(ROOT, filePath).split('\\').join('/'));
  }
}

console.log(`\n총 ${changed}개 파일 변환 완료`);
