# fullrun 테스트 전략

## 원칙
- 각 fullrun은 독립 프로젝트 폴더 (`~/test/adev/fullrun{N}/`)
- 이전 fullrun 성공 → 다음 fullrun은 더 복잡한 앱
- **완료 기준**: 코드 완성이 아닌 **실제 서비스 가능 수준**

## 프로젝트 구조
```
~/test/adev/
  fullrun1/   ← 현재: 간단 웹 TODO 앱
  fullrun2/   ← 다음: REST API + SQLite DB
  fullrun3/   ← 미래: React SPA + Express API
  fullrun4/   ← 미래: SaaS (인증+결제)
```

## fullrun 난이도 로드맵

| fullrun | 앱 유형 | 핵심 기능 | 완료 기준 |
|---------|---------|----------|---------|
| fullrun1 | 웹 TODO | HTML+CSS+JS, 로컬스토리지 | 브라우저 동작 확인 |
| fullrun2 | REST API | Express/Bun, SQLite, CRUD | curl 테스트 전체 통과 |
| fullrun3 | 풀스택 | React, API, 인증 JWT | 빌드 후 실제 동작 |
| fullrun4 | SaaS | 멀티테넌트, Stripe, 배포 | 실서비스 수준 |

## 완료 기준 상세 (서비스 가능 수준)

### 필수 조건
1. **빌드/실행**: `npm run dev` 또는 동등 명령으로 실행
2. **테스트 통과**: 단위+통합 테스트 전체 GREEN
3. **실제 동작**: 브라우저/curl에서 모든 핵심 기능 동작
4. **git commit**: 의미있는 커밋 히스토리 존재
5. **문서**: README.md 존재 + 실행 방법 기술

### 추가 조건 (fullrun3~4)
- 배포 가능 (`Dockerfile` 또는 배포 스크립트)
- 환경변수 설정 가이드
- API 문서 (Swagger 또는 README)

## .claude 폴더 문서 주입 규칙

Agent .md 파일은 두 곳에 동시 저장:
- `.adev/agents/{agent}.md` — adev 내부 참조용
- `.claude/agents/{agent}.md` — **Claude Code Agent Teams 실행용** ← 핵심!

Claude Code CLI가 Agent Teams 기능을 사용할 때 `.claude/agents/`에서 에이전트 정의를 읽으므로
반드시 두 경로에 동기화되어야 한다.

## 현재 상태 (2026-03-17)

### BUG 수정 완료
- BUG-A: V2Session env 파라미터에 process.env 병합 — PATH 누락 수정
- BUG-B: Session stream error 로깅 개선 — 에러 메시지/스택 포함
- BUG-C: CLAUDECODE 환경변수 제거로 nested session 에러 수정

### 코드 리팩토링
- 300줄 초과 파일 5개 분할 완료 (main.ts, ipc-poller.ts, v2-session-executor.ts, parallel-coder-runner.ts, deliverable-writer.ts)
- 커밋: `bb64ec6`

### fullrun 진행 상황
- **fullrun13**: 실행 중 (feat-0, feat-1 완료, feat-2~4 진행 중)
- **fullrun1**: 스크립트 준비 완료 (`/tmp/adev-fullrun1.sh`), fullrun13 종료 대기 중
  - Bun HTTP REST API TODO 앱 (SQLite, 포트 3000)
  - fullrun13 종료 후 `nohup /tmp/adev-fullrun1.sh &`로 실행 예정
