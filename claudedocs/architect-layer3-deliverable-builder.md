# Layer3 설계: DeliverableBuilder

## 1. 개요

**목적**: 비즈니스 산출물 생성 (포트폴리오, 사업계획서, 투자제안서, PPTX)

**위치**: `src/layer3/deliverable-builder.ts`

**의존성**: layer3 → core, layer1 (협업 문서 생성)

**핵심 책임**:
- 4가지 비즈니스 산출물 생성 (기본 템플릿)
- 템플릿 기반 문서 생성 (Handlebars + PDF/DOCX/PPTX 변환)
- 1계층 + 2계층 협업 (DocCollaborator 활용)
- 유저 커스텀 템플릿 지원

**비즈니스 산출물 4개**:
1. **Portfolio** (.pdf / .pptx) — 프로젝트 소개 자료
2. **Business Plan** (.pdf / .docx) — 사업계획서 / 사업제안서
3. **Investment Proposal** (.pdf / .pptx) — 투자제안서
4. **Presentation** (.pptx) — 프레젠테이션 발표자료

---

## 2. 인터페이스 정의

```typescript
/**
 * 산출물 빌더 인터페이스 / Deliverable builder interface
 */
export interface IDeliverableBuilder {
  /**
   * 비즈니스 산출물을 생성한다 / Generate a business deliverable
   *
   * @param options - 빌드 옵션 / Build options
   * @returns 생성된 산출물 / Generated deliverable
   */
  build(options: DeliverableBuildOptions): Promise<Result<BusinessDeliverable>>;

  /**
   * 모든 기본 산출물을 생성한다 / Generate all default deliverables
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param metadata - 산출물 메타데이터 / Deliverable metadata
   * @param outputDir - 출력 디렉토리 / Output directory
   * @returns 생성된 산출물 배열 / Generated deliverable array
   */
  buildAll(
    projectId: string,
    metadata: DeliverableMetadata,
    outputDir: string,
  ): Promise<Result<readonly BusinessDeliverable[]>>;

  /**
   * 사용 가능한 산출물 템플릿 목록을 조회한다 / List available deliverable templates
   *
   * @param includeCustom - 커스텀 템플릿 포함 여부 / Whether to include custom templates
   * @returns 템플릿 배열 / Template array
   */
  listTemplates(includeCustom?: boolean): Promise<Result<readonly DocumentTemplate[]>>;

  /**
   * 커스텀 산출물 템플릿을 등록한다 / Register a custom deliverable template
   *
   * @param template - 템플릿 정의 / Template definition
   * @returns 등록 성공 여부 / Whether registration succeeded
   */
  registerTemplate(template: DocumentTemplate): Promise<Result<void>>;

  /**
   * Markdown을 PDF로 변환한다 / Convert Markdown to PDF
   *
   * @param mdPath - Markdown 파일 경로 / Markdown file path
   * @param pdfPath - PDF 파일 경로 / PDF file path
   * @returns 변환 성공 여부 / Conversion success status
   */
  convertToPdf(mdPath: string, pdfPath: string): Promise<Result<void>>;

  /**
   * Markdown을 PPTX로 변환한다 / Convert Markdown to PPTX
   *
   * @param mdPath - Markdown 파일 경로 / Markdown file path
   * @param pptxPath - PPTX 파일 경로 / PPTX file path
   * @returns 변환 성공 여부 / Conversion success status
   */
  convertToPptx(mdPath: string, pptxPath: string): Promise<Result<void>>;
}
```

---

## 3. 구현 클래스

```typescript
/**
 * DeliverableBuilder 구현 클래스 / DeliverableBuilder implementation
 */
export class DeliverableBuilder implements IDeliverableBuilder {
  private readonly logger: Logger;
  private readonly docCollaborator: DocCollaborator; // 1+2계층 협업
  private readonly templateRegistry: Map<string, DocumentTemplate>;

  constructor(
    docCollaborator: DocCollaborator,
    logger: Logger,
  ) {
    this.docCollaborator = docCollaborator;
    this.logger = logger.child({ module: 'deliverable-builder' });
    this.templateRegistry = new Map();
    this.loadDefaultTemplates();
  }

  /**
   * 기본 비즈니스 산출물 템플릿 로드 / Load default business deliverable templates
   */
  private loadDefaultTemplates(): void {
    // 4개 기본 템플릿 등록
    for (const type of DEFAULT_BUSINESS_TEMPLATES) {
      const template: DocumentTemplate = {
        id: `default-${type}`,
        name: type,
        type,
        templatePath: `templates/business/${type}.hbs`,
        format: this.getDefaultFormat(type),
        description: `Default ${type} template`,
        custom: false,
      };
      this.templateRegistry.set(template.id, template);
    }
  }

  private getDefaultFormat(type: BusinessDeliverableType): 'pdf' | 'pptx' | 'docx' {
    switch (type) {
      case 'portfolio':
        return 'pdf';
      case 'business-plan':
        return 'docx';
      case 'investment-proposal':
        return 'pdf';
      case 'presentation':
        return 'pptx';
    }
  }

  // 메서드 구현은 구현 단계에서 작성
}
```

---

## 4. 주요 메서드 시그니처

### 4.1 build()

**책임**: 비즈니스 산출물 1개 생성

**로직**:
1. `options.templateId`로 템플릿 조회
2. 템플릿이 없으면 기본 템플릿 선택
3. **1+2계층 협업**:
   - `docCollaborator.start()` 호출
   - `docCollaborator.requestLayer1()` → 문서 뼈대 생성
   - `docCollaborator.requestLayer2()` → 기술 상세 작성
   - `docCollaborator.requestLayer1()` → 최종 검토
   - `docCollaborator.complete()` → 최종 내용 저장
4. 최종 내용을 템플릿에 전달하여 렌더링
5. 출력 형식에 따라 변환:
   - `pdf`: `convertToPdf()` 호출
   - `pptx`: `convertToPptx()` 호출
   - `docx`: Pandoc으로 변환
6. `BusinessDeliverable` 생성
7. 로그 기록
8. 결과 반환

**에러 처리**: 템플릿 로드 실패 → `Layer3Error`, 변환 실패 → `Layer3Error`

---

### 4.2 buildAll()

**책임**: 4개 기본 산출물 전부 생성

**로직**:
1. `DEFAULT_BUSINESS_TEMPLATES` 순회
2. 각 타입에 대해 `build()` 호출:
   - `portfolio` → `{outputDir}/portfolio.pdf`
   - `business-plan` → `{outputDir}/business-plan.docx`
   - `investment-proposal` → `{outputDir}/investment-proposal.pdf`
   - `presentation` → `{outputDir}/presentation.pptx`
3. 생성된 산출물 배열 반환

**에러 처리**: 하나라도 실패 시 에러 반환

---

### 4.3 listTemplates()

**책임**: 사용 가능한 산출물 템플릿 목록 조회

**로직**:
1. `templateRegistry`에서 비즈니스 산출물 템플릿만 필터링
2. `includeCustom === false`이면 커스텀 템플릿 제외
3. 배열로 반환

**에러 처리**: 없음

---

### 4.4 registerTemplate()

**책임**: 커스텀 산출물 템플릿 등록

**로직**:
1. `template.id`가 이미 존재하면 에러
2. `template.templatePath` 파일 존재 확인
3. `templateRegistry`에 추가
4. 로그 기록

**에러 처리**: 중복 ID → `Layer3Error`, 파일 없음 → `Layer3Error`

---

### 4.5 convertToPdf()

**책임**: Markdown을 PDF로 변환

**로직**:
1. `md-to-pdf` 패키지 사용 (또는 Pandoc)
2. `mdPath` 읽기
3. PDF 변환
4. `pdfPath`에 저장
5. 로그 기록

**에러 처리**: 변환 실패 → `Layer3Error`

---

### 4.6 convertToPptx()

**책임**: Markdown을 PPTX로 변환

**로직**:
1. `officegen` 패키지 사용 (또는 Pandoc)
2. `mdPath` 읽기
3. Markdown 파싱 (제목 → 슬라이드)
4. PPTX 생성
5. `pptxPath`에 저장
6. 로그 기록

**에러 처리**: 변환 실패 → `Layer3Error`

---

## 5. 템플릿 구조 (예시: Portfolio)

```handlebars
<!-- templates/business/portfolio.hbs -->
# {{metadata.projectName}}

{{metadata.projectDescription}}

## Overview

**Target Audience**: {{metadata.targetAudience}}
**Purpose**: {{metadata.purpose}}

## Key Features

{{#each features}}
- {{name}}: {{description}}
{{/each}}

## Technical Stack

{{#each techStack}}
- {{name}}: {{version}}
{{/each}}

## Achievements

{{#each achievements}}
- {{description}}
{{/each}}

## Screenshots

{{#each screenshots}}
![{{title}}]({{path}})
{{/each}}

## Team

{{#each team}}
- **{{name}}**: {{role}}
{{/each}}

## Contact

- Email: {{contact.email}}
- Website: {{contact.website}}

---

Generated by adev on {{generatedAt}}
```

---

## 6. 의존성 그래프

```
DeliverableBuilder
├─→ Logger (core/logger.ts)
├─→ DocCollaborator (layer3/doc-collaborator.ts) — 1+2계층 협업
├─→ Handlebars (템플릿 엔진)
├─→ md-to-pdf (Markdown → PDF 변환)
├─→ officegen (Markdown → PPTX 변환)
└─→ Pandoc (선택적, Markdown → DOCX 변환)
```

**외부 패키지**:
```bash
bun add md-to-pdf officegen
# Pandoc은 시스템 설치 필요 (optional)
```

---

## 7. 에러 타입 정의

**에러 코드** (Layer3Error):
- `layer3_deliverable_build_failed`: 산출물 생성 실패
- `layer3_deliverable_template_not_found`: 템플릿 없음
- `layer3_deliverable_convert_failed`: 형식 변환 실패
- `layer3_deliverable_template_duplicate`: 템플릿 ID 중복

---

## 8. 테스트 전략

### 단위 테스트 (tests/unit/layer3/deliverable-builder.test.ts)

**테스트 케이스**:
1. `build()` — Portfolio 생성 (PDF)
2. `build()` — Business Plan 생성 (DOCX)
3. `build()` — Investment Proposal 생성 (PDF)
4. `build()` — Presentation 생성 (PPTX)
5. `buildAll()` — 4개 산출물 전부 생성
6. `listTemplates()` — 기본 + 커스텀 템플릿
7. `registerTemplate()` — 커스텀 템플릿 등록
8. `convertToPdf()` — Markdown → PDF 변환
9. `convertToPptx()` — Markdown → PPTX 변환

**모킹**: DocCollaborator 모킹

---

### 통합 테스트 (tests/module/layer3-deliverable-builder.test.ts)

**테스트 케이스**:
1. 실제 1+2계층 협업 → Portfolio PDF 생성 → 파일 검증
2. 4개 산출물 생성 → 모든 파일 존재 확인
3. 커스텀 템플릿 등록 → 사용 → 결과 검증

---

## 9. 사용 예시

```typescript
import { DeliverableBuilder } from './layer3/deliverable-builder.js';
import { DocCollaborator } from './layer3/doc-collaborator.js';
import { createLogger } from './core/logger.js';

const docCollaborator = new DocCollaborator(/* ... */);
const builder = new DeliverableBuilder(docCollaborator, createLogger());

// Portfolio 생성
const portfolioResult = await builder.build({
  projectId: 'proj-1',
  type: 'portfolio',
  templateId: 'default-portfolio',
  metadata: {
    projectName: 'My Awesome Project',
    projectDescription: '혁신적인 SaaS 플랫폼',
    targetAudience: '스타트업, 개발자',
    purpose: '투자 유치',
    extra: {
      features: [
        { name: '인증', description: 'JWT 기반 인증' },
        { name: 'API', description: 'RESTful API' },
      ],
    },
  },
  outputPath: './deliverables/portfolio.pdf',
});

if (portfolioResult.ok) {
  console.log('Portfolio 생성됨:', portfolioResult.value.outputPath);
}

// 모든 산출물 생성
const allDeliverablesResult = await builder.buildAll(
  'proj-1',
  metadata,
  './deliverables',
);

if (allDeliverablesResult.ok) {
  console.log(`${allDeliverablesResult.value.length}개 산출물 생성됨`);
  for (const deliverable of allDeliverablesResult.value) {
    console.log(`  - ${deliverable.type}: ${deliverable.outputPath}`);
  }
}
```

---

## 10. 구현 우선순위

**Phase 7-1**: 인터페이스 + build 구현 (Markdown 생성)
**Phase 7-2**: convertToPdf, convertToPptx 구현 (형식 변환)
**Phase 7-3**: buildAll 구현
**Phase 7-4**: 커스텀 템플릿 지원 (registerTemplate)
**Phase 7-5**: 단위 테스트 + 통합 테스트

---

## 11. 참고 문서

- `SPEC.md` Section 9.1 — 통합 문서 생성 (비즈니스 산출물)
- `src/layer3/types.ts` — BusinessDeliverableType, DeliverableBuildOptions
- `src/layer3/doc-collaborator.ts` — DocCollaborator 인터페이스
- md-to-pdf 문서: https://www.npmjs.com/package/md-to-pdf
- officegen 문서: https://www.npmjs.com/package/officegen
