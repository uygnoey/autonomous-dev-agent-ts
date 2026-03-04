# 버그 수정 워크플로우

$ARGUMENTS: 버그 설명

## 단계

1. 재현 테스트 작성 (실패하는 테스트 먼저)
   ```bash
   bun test tests/unit/{모듈명}/{버그}.test.ts
   ```
2. 근본 원인 1개만 분석 (여러 개 동시 수정 금지)
3. 최소 범위 수정
4. 재현 테스트 통과 확인
   ```bash
   bun test tests/unit/{모듈명}/{버그}.test.ts
   ```
5. 회귀 테스트
   ```bash
   bun test
   ```
6. 타입체크 + 린트
   ```bash
   bunx tsc --noEmit && bunx biome check src/
   ```
