---
globs: "src/**/*.ts"
---

# 모듈 의존성 규칙

## 단방향 의존성 그래프 (역방향 금지)

```
cli → core, auth, layer1
layer1 → core, rag
layer2 → core, rag, layer1
layer3 → core, rag, layer2
rag → core
auth → core
mcp → core
```

## 규칙
- 상위 → 하위만 허용. 하위 → 상위 금지
- 같은 레벨 간: layer1 ↔ layer2 직접 참조 금지 (core 경유)
- 순환 의존 금지 (발견 시 즉시 수정)
- core는 다른 모듈 import 금지 (독립)

## import 검증
```bash
# 순환 의존 검사
bunx madge --circular --extensions ts src/
```

## 위반 시
- 인터페이스를 core에 정의 → 구현은 각 모듈
- 이벤트 기반 통신으로 대체
