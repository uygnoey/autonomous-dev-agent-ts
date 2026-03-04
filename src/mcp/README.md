# mcp 모듈

MCP (Model Context Protocol) 서버 관리.

## 파일 구조

```
src/mcp/
├── types.ts       — McpServer, McpTool, McpManifest
├── registry.ts    — 서버 등록/조회 (글로벌+프로젝트 병합)
├── loader.ts      — ~/.adev/mcp/ + /project/.adev/mcp/ 로드
├── mcp-manager.ts — 라이프사이클 (start/stop/health check)
├── builtin/
│   ├── os-control/index.ts
│   ├── browser/index.ts
│   ├── web-search/index.ts
│   └── git/index.ts
└── index.ts       — public API
```

## 의존성

- core (config, errors, types)

## builtin 4개

- os-control: 파일 시스템, 프로세스 관리
- browser: 웹 브라우저 제어
- web-search: 웹 검색
- git: Git 작업
