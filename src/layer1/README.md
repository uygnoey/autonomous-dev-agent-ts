# layer1 모듈 (1계층)

Claude API 기반 유저 대화, 기획, 설계, Contract 생성.

## 파일 구조

```
src/layer1/
├── types.ts              — ConversationMessage, HandoffPackage, ContractSchema
├── conversation.ts       — Claude API 대화 관리. LanceDB 영구 저장
├── planner.ts            — 기획 흐름 (아이디어→기획→설계→스택)
├── designer.ts           — 설계 상세화
├── spec-builder.ts       — 스펙 확정본 생성
├── test-type-designer.ts — 테스트 유형 정의서 (카테고리, 규칙, 비율)
├── contract-builder.ts   — Contract 기반 HandoffPackage. 필수 원칙 5가지
├── verifier.ts           — 4중 검증 중 1계층 참여 ("의도대로?")
└── index.ts              — public API
```

## 의존성

- core (config, errors, types, memory)
- rag (검색, 컨텍스트 복원)

## 핵심 규칙

- 유저 "확정" 전까지 개발 시작 언급 절대 금지
- Claude 자유롭게 아이디어 제안 가능 (확정 전까지)
