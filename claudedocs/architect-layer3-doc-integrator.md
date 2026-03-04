# Layer3 설계: DocIntegrator

## 1. 개요

**목적**: 2계층 조각 문서 → 통합 프로젝트 문서

**위치**: `src/layer3/doc-integrator.ts`

**의존성**: layer3 → core, layer2 (DocumentFragment 읽기)

**핵심 책임**:
- 2계층 documenter가 생성한 조각 문서들을 수집
- 조각들을 통합하여 프로젝트 문서 8개 유형 생성
- 템플릿 기반 문서 생성 (기본 8개 + 유저 커스텀)
- 출력 형식: Markdown, HTML, PDF

**비유**: 2계층 = 벽돌 (개별 조각), 3계층 DocIntegrator = 벽돌로 집 짓기

---

## 2. 인터페이스 정의

```typescript
/**
 * 문서 통합 옵션 / Document integration options
 */
export interface IntegrateOptions {
  /** 프로젝트 ID / Project ID */
  readonly projectId: string;
  /** 문서 유형 / Document type */
  readonly type: ProjectDocumentType;
  /** 조각 문서 경로 패턴 / Fragment document path pattern */
  readonly fragmentPattern: string;
  /** 출력 경로 / Output path */
  readonly outputPath: string;
  /** 템플릿 ID (선택) / Template ID (optional) */
  readonly templateId?: string;
}

/**
 * 문서 통합기 인터페이스 / Document integrator interface
 */
export interface IDocIntegrator {
  /**
   * 조각 문서를 수집한다 / Collect fragment documents
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param pattern - 파일 패턴 / File pattern
   * @returns 조각 문서 배열 / Fragment document array
   */
  collectFragments(
    projectId: string,
    pattern: string,
  ): Promise<Result<readonly DocumentFragment[]>>;

  /**
   * 조각 문서를 통합하여 프로젝트 문서를 생성한다 / Integrate fragments into project document
   *
   * @param options - 통합 옵션 / Integration options
   * @returns 통합 문서 / Integrated document
   */
  integrate(options: IntegrateOptions): Promise<Result<IntegratedDocument>>;

  /**
   * 모든 프로젝트 문서를 생성한다 / Generate all project documents
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param outputDir - 출력 디렉토리 / Output directory
   * @returns 생성된 문서 배열 / Generated document array
   */
  generateAll(
    projectId: string,
    outputDir: string,
  ): Promise<Result<readonly IntegratedDocument[]>>;

  /**
   * 사용 가능한 템플릿 목록을 조회한다 / List available templates
   *
   * @param includeCustom - 커스텀 템플릿 포함 여부 / Whether to include custom templates
   * @returns 템플릿 배열 / Template array
   */
  listTemplates(includeCustom?: boolean): Promise<Result<readonly DocumentTemplate[]>>;

  /**
   * 커스텀 템플릿을 등록한다 / Register a custom template
   *
   * @param template - 템플릿 정의 / Template definition
   * @returns 등록 성공 여부 / Whether registration succeeded
   */
  registerTemplate(template: DocumentTemplate): Promise<Result<void>>;
}
```

---

## 3. 구현 클래스

```typescript
/**
 * DocIntegrator 구현 클래스 / DocIntegrator implementation
 */
export class DocIntegrator implements IDocIntegrator {
  private readonly logger: Logger;
  private readonly templateRegistry: Map<string, DocumentTemplate>;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'doc-integrator' });
    this.templateRegistry = new Map();
    this.loadDefaultTemplates();
  }

  /**
   * 기본 템플릿 로드 / Load default templates
   */
  private loadDefaultTemplates(): void {
    // 8개 기본 템플릿 등록
    for (const type of DEFAULT_PROJECT_TEMPLATES) {
      const template: DocumentTemplate = {
        id: `default-${type}`,
        name: type,
        type,
        templatePath: `templates/project/${type}.hbs`,
        format: type === 'api-reference' ? 'html' : 'md',
        description: `Default ${type} template`,
        custom: false,
      };
      this.templateRegistry.set(template.id, template);
    }
  }

  // 메서드 구현은 구현 단계에서 작성
}
```

---

## 4. 주요 메서드 시그니처

### 4.1 collectFragments()

**책임**: 2계층 documenter가 생성한 조각 문서 수집

**로직**:
1. `pattern`을 Glob으로 파일 검색 (예: `.adev/docs/fragments/**/*.md`)
2. 각 파일을 읽어서 `DocumentFragment` 파싱
3. Front matter에서 메타데이터 추출 (featureId, type 등)
4. 배열로 반환

**에러 처리**: 파일 읽기 실패 → `Layer3Error`

---

### 4.2 integrate()

**책임**: 조각 문서를 통합하여 하나의 프로젝트 문서 생성

**로직**:
1. `collectFragments(projectId, options.fragmentPattern)` 호출
2. `options.type`에 따라 관련 조각 필터링
   - `readme`: 전체 기능별 설명서
   - `api-reference`: 기능별 API 연동 정의서
   - `test-report`: 기능별 테스트 결과서
   - `changelog`: CHANGELOG 조각들
3. `templateId`가 없으면 기본 템플릿 선택
4. 템플릿 로드 (Handlebars)
5. 조각들을 템플릿에 전달하여 렌더링
6. `options.outputPath`에 파일 저장
7. `IntegratedDocument` 반환

**에러 처리**: 템플릿 로드 실패 → `Layer3Error`, 렌더링 실패 → `Layer3Error`

---

### 4.3 generateAll()

**책임**: 8개 프로젝트 문서 전부 생성

**로직**:
1. `DEFAULT_PROJECT_TEMPLATES` 순회
2. 각 타입에 대해 `integrate()` 호출
   - `readme` → `{outputDir}/README.md`
   - `api-reference` → `{outputDir}/API.md`
   - `architecture` → `{outputDir}/ARCHITECTURE.md`
   - `user-manual` → `{outputDir}/USER_MANUAL.md`
   - `installation-guide` → `{outputDir}/INSTALL.md`
   - `test-report` → `{outputDir}/TEST_REPORT.md`
   - `changelog` → `{outputDir}/CHANGELOG.md`
   - `contributing-guide` → `{outputDir}/CONTRIBUTING.md`
3. 생성된 문서 배열 반환

**에러 처리**: 하나라도 실패 시 에러 반환

---

### 4.4 listTemplates()

**책임**: 사용 가능한 템플릿 목록 조회

**로직**:
1. `templateRegistry`에서 템플릿 목록 추출
2. `includeCustom === false`이면 커스텀 템플릿 제외
3. 배열로 반환

**에러 처리**: 없음

---

### 4.5 registerTemplate()

**책임**: 커스텀 템플릿 등록

**로직**:
1. `template.id`가 이미 존재하면 에러
2. `template.templatePath` 파일 존재 확인
3. `templateRegistry`에 추가
4. 로그 기록

**에러 처리**: 중복 ID → `Layer3Error`, 파일 없음 → `Layer3Error`

---

## 5. 템플릿 구조 (예시: README)

```handlebars
<!-- templates/project/readme.hbs -->
# {{projectName}}

{{projectDescription}}

## Features

{{#each fragments}}
{{#if (eq type 'feature-doc')}}
### {{metadata.featureName}}

{{content}}

{{/if}}
{{/each}}

## API Reference

See [API.md](./API.md) for detailed API documentation.

## Installation

See [INSTALL.md](./INSTALL.md) for installation instructions.

## Testing

See [TEST_REPORT.md](./TEST_REPORT.md) for test results.

## License

{{license}}

---

Generated by adev on {{generatedAt}}
```

---

## 6. 의존성 그래프

```
DocIntegrator
├─→ Logger (core/logger.ts)
├─→ Handlebars (템플릿 엔진)
└─→ fs/promises (파일 I/O)
```

---

## 7. 에러 타입 정의

**에러 코드** (Layer3Error):
- `layer3_fragment_collect_failed`: 조각 수집 실패
- `layer3_template_not_found`: 템플릿 없음
- `layer3_template_render_failed`: 템플릿 렌더링 실패
- `layer3_document_save_failed`: 문서 저장 실패
- `layer3_template_duplicate`: 템플릿 ID 중복

---

## 8. 테스트 전략

### 단위 테스트 (tests/unit/layer3/doc-integrator.test.ts)

**테스트 케이스**:
1. `collectFragments()` — 조각 수집 성공
2. `collectFragments()` — 빈 결과
3. `integrate()` — README 생성
4. `integrate()` — 커스텀 템플릿 사용
5. `generateAll()` — 8개 문서 전부 생성
6. `listTemplates()` — 기본 + 커스텀 템플릿
7. `registerTemplate()` — 커스텀 템플릿 등록
8. `registerTemplate()` — 중복 ID 에러

---

### 통합 테스트 (tests/module/layer3-doc-integrator.test.ts)

**테스트 케이스**:
1. 실제 조각 파일 → README 생성 → 파일 검증
2. 8개 문서 생성 → 모든 파일 존재 확인
3. 커스텀 템플릿 등록 → 사용 → 결과 검증

---

## 9. 사용 예시

```typescript
import { DocIntegrator } from './layer3/doc-integrator.js';
import { createLogger } from './core/logger.js';

const integrator = new DocIntegrator(createLogger());

// README 생성
const readmeResult = await integrator.integrate({
  projectId: 'proj-1',
  type: 'readme',
  fragmentPattern: '.adev/docs/fragments/**/*.md',
  outputPath: './docs/README.md',
});

if (readmeResult.ok) {
  console.log('README 생성됨:', readmeResult.value.outputPath);
}

// 모든 프로젝트 문서 생성
const allDocsResult = await integrator.generateAll('proj-1', './docs');

if (allDocsResult.ok) {
  console.log(`${allDocsResult.value.length}개 문서 생성됨`);
  for (const doc of allDocsResult.value) {
    console.log(`  - ${doc.type}: ${doc.outputPath}`);
  }
}
```

---

## 10. 구현 우선순위

**Phase 7-1**: 인터페이스 + collectFragments 구현
**Phase 7-2**: integrate 구현 (기본 템플릿)
**Phase 7-3**: generateAll 구현
**Phase 7-4**: 커스텀 템플릿 지원 (registerTemplate)
**Phase 7-5**: 단위 테스트 + 통합 테스트

---

## 11. 참고 문서

- `SPEC.md` Section 9.1 — 통합 문서 생성
- `src/layer3/types.ts` — DocumentFragment, IntegratedDocument
- Handlebars 문서: https://handlebarsjs.com/
