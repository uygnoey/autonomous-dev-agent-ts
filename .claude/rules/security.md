---
globs: "src/**/*.ts"
---

# 보안 규칙

## Credential
- 환경변수에서만 읽기 (src/core/config.ts 경유)
- 하드코딩 금지 (API key, token, password)
- 로그에 credential 출력 금지 (마스킹 필수)
- .env 파일 .gitignore 확인

## 입력 검증
- 외부 입력은 항상 검증 후 사용
- 파일 경로: path traversal 방지
- CLI 인자: 타입 + 범위 검증

## 프로세스
- process.exit()은 CLI 진입점에서만
- process.env 직접 접근은 src/core/config.ts에서만
- child_process 사용 시 입력 이스케이프 필수
