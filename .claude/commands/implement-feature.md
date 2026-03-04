# 기능 구현 워크플로우

$ARGUMENTS: 기능명과 간단한 설명

## 단계

1. ARCHITECTURE.md에서 해당 모듈 구조 확인
2. IMPLEMENTATION-GUIDE.md에서 구현 순서 확인
3. 인터페이스 정의 (types.ts)
4. 구현 (Result<T,E> 패턴, JSDoc 포함)
5. 단위 테스트 작성 + 실행
   ```bash
   bun test tests/unit/{모듈명}/{파일명}.test.ts
   ```
6. 타입체크 + 린트
   ```bash
   bunx tsc --noEmit && bunx biome check src/
   ```
7. 의존성 방향 확인
   ```bash
   bunx madge --circular --extensions ts src/
   ```
