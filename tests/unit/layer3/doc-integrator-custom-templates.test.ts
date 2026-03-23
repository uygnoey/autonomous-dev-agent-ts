import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { DocumentTemplate } from 'layer3/types.js';
import {
  loadCustomTemplates,
  loadDefaultTemplates,
  registerTemplate,
} from 'layer3/doc-integrator-template.js';
import { ConsoleLogger } from 'core/logger.js';

// ── 테스트 헬퍼 / Test helpers ────────────────────────────────────

const logger = new ConsoleLogger('error');

describe('loadCustomTemplates()', () => {
  // WHY: loadCustomTemplates는 고정 경로(.adev/templates, ~/.adev/templates)를 스캔하므로
  //      실제 디렉토리 생성 없이는 통합 테스트가 어렵다.
  //      여기서는 scanAndRegisterTemplates의 에러 내성을 검증한다.

  it('[edge] 디렉토리가 없어도 에러 없이 완료', async () => {
    const registry = new Map<string, DocumentTemplate>();
    loadDefaultTemplates(registry, logger);
    const before = registry.size;
    // WHY: 실제 .adev/templates가 없으면 조용히 건너뜀
    await loadCustomTemplates(registry, logger);
    // 기본 8개 템플릿은 유지되어야 함
    expect(registry.size).toBeGreaterThanOrEqual(before);
  });

  it('[normal] 기본 템플릿은 loadCustomTemplates 후에도 유지', async () => {
    const registry = new Map<string, DocumentTemplate>();
    loadDefaultTemplates(registry, logger);
    await loadCustomTemplates(registry, logger);
    expect(registry.has('default-readme')).toBe(true);
    expect(registry.has('default-api-reference')).toBe(true);
    expect(registry.has('default-architecture')).toBe(true);
  });
});

describe('registerTemplate()', () => {
  it('[edge] 중복 ID → 에러 반환', async () => {
    const registry = new Map<string, DocumentTemplate>();
    const template: DocumentTemplate = {
      id: 'test-dup',
      name: 'test',
      type: 'custom',
      templatePath: '/nonexistent.hbs',
      format: 'md',
      description: 'Test',
      custom: true,
    };
    const first = await registerTemplate(registry, template, logger);
    expect(first.ok).toBe(true);

    const second = await registerTemplate(registry, template, logger);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe('layer3_template_duplicate');
    }
  });

  it('[normal] 신규 ID → 등록 성공', async () => {
    const registry = new Map<string, DocumentTemplate>();
    const template: DocumentTemplate = {
      id: 'custom-new',
      name: 'new-template',
      type: 'custom',
      templatePath: '/tmp/test.hbs',
      format: 'md',
      description: 'New',
      custom: true,
    };
    const result = await registerTemplate(registry, template, logger);
    expect(result.ok).toBe(true);
    expect(registry.has('custom-new')).toBe(true);
  });

  it('[edge] custom=true + templatePath 파일 미존재 → 경고만, 등록은 성공', async () => {
    const registry = new Map<string, DocumentTemplate>();
    const template: DocumentTemplate = {
      id: 'custom-missing-file',
      name: 'missing',
      type: 'custom',
      templatePath: '/nonexistent/path/template.hbs',
      format: 'md',
      description: 'Missing file test',
      custom: true,
    };
    const result = await registerTemplate(registry, template, logger);
    expect(result.ok).toBe(true);
    expect(registry.has('custom-missing-file')).toBe(true);
  });

  it('[edge] id 없는 템플릿 → 자동 생성 ID로 등록', async () => {
    const registry = new Map<string, DocumentTemplate>();
    const template: DocumentTemplate = {
      name: 'no-id',
      type: 'custom',
      templatePath: '/tmp/no-id.hbs',
      format: 'md',
      description: 'No ID',
      custom: false,
    };
    const result = await registerTemplate(registry, template, logger);
    expect(result.ok).toBe(true);
    // 자동 생성 ID는 custom-{timestamp} 형태
    const keys = Array.from(registry.keys());
    expect(keys.some((k) => k.startsWith('custom-'))).toBe(true);
  });
});
