# 코드 리뷰 워크플로우

$ARGUMENTS: 리뷰 대상 (파일 경로 또는 git diff 범위)

## 단계

1. 변경 사항 확인
   ```bash
   git diff --stat
   git diff
   ```
2. 체크리스트 검증 (.claude/skills/code-quality/references/review-checklist.md)
3. 타입체크
   ```bash
   bunx tsc --noEmit
   ```
4. 린트
   ```bash
   bunx biome check src/
   ```
5. 테스트 실행
   ```bash
   bun test
   ```
6. 피드백 작성 (위치, 심각도, 제안)
