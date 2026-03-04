# cli 모듈

CLI 명령어. adev 엔트리포인트.

## 파일 구조

```
src/cli/
├── types.ts          — CliCommand, CliOptions
├── commands/
│   ├── init.ts       — 프로젝트 초기화. 인증 선택. .adev/ 생성
│   ├── start.ts      — 1계층 대화 시작
│   ├── config.ts     — 설정 조회/변경
│   └── project.ts    — 프로젝트 CRUD
├── main.ts           — 명령어 라우팅
└── index.ts          — public API
```

## 의존성

- core, auth, layer1

## 규칙

- process.exit()은 index.ts (bin 진입점)에서만 허용
- 나머지는 Result<T,E> 반환
