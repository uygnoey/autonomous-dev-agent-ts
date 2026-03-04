# layer3 모듈 (3계층)

통합 문서, 비즈니스 산출물, 지속 E2E.

## 파일 구조

```
src/layer3/
├── types.ts               — DocumentTemplate, DeliverableType
├── doc-integrator.ts      — 2계층 조각 문서 → 통합 프로젝트 문서
├── doc-collaborator.ts    — 1계층(뼈대) + 2계층(상세) 협업 문서
├── production-tester.ts   — 지속 E2E 실행 (유지보수). Fail-Fast
├── bug-escalator.ts       — 3계층→2계층 버그 리포트 + 재실행 트리거
├── deliverable-builder.ts — 포트폴리오, 사업계획서 등 비즈니스 산출물
└── index.ts               — public API
```

## 의존성

- core, rag, layer2
