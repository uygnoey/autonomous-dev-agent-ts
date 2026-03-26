# QC 테스트 실패 분석 리포트
## 분석 일시: 2026-03-26

### 1. 테스트 실행 결과 요약

| 구분 | 테스트 수 | 파일 수 | 소요 시간 | 결과 |
|------|----------|---------|----------|------|
| Unit | 13,512 | 106 | 35.21s | ALL PASS |
| Module | 1,068 | 8 | 5.34s | ALL PASS |
| E2E | 191,233 | 8 | 5.83s | ALL PASS |
| Integration | 24 | 2 | 4.28s | ALL PASS |
| **전체** | **205,837** | **124** | **47.98s** | **ALL PASS** |

- 전체: 205,837개
- 통과: 205,837개
- 실패: 0개
- 에러: 0개

### 2. 실패 테스트 상세

| 테스트 파일 | 테스트명 | 실패 메시지 | 근본 원인 | 분류 |
|-----------|--------|-----------|---------|-----|
| (없음) | — | — | — | — |

**모든 테스트가 통과했습니다. 실패 항목 없음.**

### 3. 테스트 없는 src 모듈

총 구현 파일(index.ts, types 제외): 170개
테스트 없는 파일: 82개
**테스트 커버리지율 (파일 기준): 51.8% (88/170)**

#### CLI 모듈 (26개 미커버)

| 모듈 파일 | 비고 |
|---------|-----|
| `src/cli/cli-yargs-builder.ts` | CLI 빌더 — 통합테스트에서 간접 커버 가능 |
| `src/cli/commands/config-reader.ts` | config 명령어 하위 모듈 |
| `src/cli/commands/config-writer.ts` | config 명령어 하위 모듈 |
| `src/cli/commands/init-scaffold.ts` | init 명령어 하위 모듈 |
| `src/cli/commands/init-wizard.ts` | init 명령어 하위 모듈 |
| `src/cli/commands/project-crud-reads.ts` | project 명령어 하위 모듈 |
| `src/cli/commands/project-crud.ts` | project 명령어 하위 모듈 |
| `src/cli/commands/project-mutate.ts` | project 명령어 하위 모듈 |
| `src/cli/commands/project-registry.ts` | project 명령어 하위 모듈 |
| `src/cli/commands/start-execution.ts` | start 명령어 하위 모듈 |
| `src/cli/commands/start-handoff-docs.ts` | start 명령어 하위 모듈 |
| `src/cli/commands/start-pipeline.ts` | start 명령어 하위 모듈 |
| `src/cli/commands/start-session.ts` | start 명령어 하위 모듈 |
| `src/cli/commands/status.ts` | status 명령어 |
| `src/cli/layer2-runner.ts` | Layer2 실행 브릿지 |
| `src/cli/yargs-commands.ts` | yargs 명령어 등록 |
| `src/cli/tui/ansi.ts` | ANSI 코드 유틸 |
| `src/cli/tui/chat-input.ts` | 채팅 입력 UI |
| `src/cli/tui/chat-output.ts` | 채팅 출력 UI |
| `src/cli/tui/chat-streaming.ts` | 스트리밍 처리 |
| `src/cli/tui/chat.ts` | 채팅 메인 컴포넌트 |
| `src/cli/tui/input.ts` | 입력 처리 |
| `src/cli/tui/renderer-box.ts` | 박스 렌더러 |
| `src/cli/tui/renderer-formatters.ts` | 포맷터 |
| `src/cli/tui/renderer.ts` | 메인 렌더러 |
| `src/cli/tui/spinner.ts` | 스피너 UI |

#### Core 모듈 (3개 미커버)

| 모듈 파일 | 비고 |
|---------|-----|
| `src/core/config-merge.ts` | config 병합 로직 |
| `src/core/config-schema.ts` | config 스키마 정의 |
| `src/core/file-size-guard.ts` | 파일 크기 제한 유틸 |

#### Layer1 모듈 (5개 미커버)

| 모듈 파일 | 비고 |
|---------|-----|
| `src/layer1/agent-md-generator-instructions.ts` | 에이전트 MD 생성 지시문 |
| `src/layer1/claude-api-helpers.ts` | Claude API 헬퍼 |
| `src/layer1/contract-builder-utils.ts` | 계약 빌더 유틸 |
| `src/layer1/contract-verification-reporter.ts` | 계약 검증 리포터 |
| `src/layer1/skill-md-generator.ts` | 스킬 MD 생성기 |

#### Layer2 모듈 (15개 미커버)

| 모듈 파일 | 비고 |
|---------|-----|
| `src/layer2/agent-coordinator.ts` | 에이전트 코디네이터 |
| `src/layer2/git-branch-utils.ts` | Git 브랜치 유틸 |
| `src/layer2/integration-tester-helpers.ts` | 통합 테스트 헬퍼 |
| `src/layer2/integration-tester-steps.ts` | 통합 테스트 스텝 |
| `src/layer2/ipc-poller-helpers.ts` | IPC 폴러 헬퍼 |
| `src/layer2/layer1-verifier.ts` | Layer1 검증기 |
| `src/layer2/layer2-bootstrap.ts` | Layer2 부트스트랩 |
| `src/layer2/parallel-coder-runner-helpers.ts` | 병렬 코더 헬퍼 |
| `src/layer2/session-restore-orchestrator-fallback.ts` | 세션 복원 fallback |
| `src/layer2/session-restore-orchestrator-helpers.ts` | 세션 복원 헬퍼 |
| `src/layer2/team-leader-code-phase.ts` | 팀 리더 코드 페이즈 |
| `src/layer2/team-leader-design-phase.ts` | 팀 리더 설계 페이즈 |
| `src/layer2/team-leader-helpers.ts` | 팀 리더 헬퍼 |
| `src/layer2/team-leader-phase-dispatch.ts` | 팀 리더 페이즈 디스패치 |
| `src/layer2/team-leader-phase.ts` | 팀 리더 페이즈 |
| `src/layer2/team-leader-test-phase.ts` | 팀 리더 테스트 페이즈 |
| `src/layer2/team-leader-verify.ts` | 팀 리더 검증 |
| `src/layer2/v2-session-env-builder.ts` | V2 세션 환경 빌더 |
| `src/layer2/v2-session-factory.ts` | V2 세션 팩토리 |
| `src/layer2/worker-resolver.ts` | 워커 리졸버 |

#### Layer3 모듈 (11개 미커버)

| 모듈 파일 | 비고 |
|---------|-----|
| `src/layer3/deliverable-builder-template.ts` | 산출물 빌더 템플릿 |
| `src/layer3/deliverable-docx-renderer.ts` | DOCX 렌더러 |
| `src/layer3/deliverable-format-writers.ts` | 포맷 작성기 |
| `src/layer3/deliverable-html-renderer.ts` | HTML 렌더러 |
| `src/layer3/deliverable-pdf-renderer.ts` | PDF 렌더러 |
| `src/layer3/deliverable-pptx-renderer.ts` | PPTX 렌더러 |
| `src/layer3/deliverable-renderer.ts` | 렌더러 메인 |
| `src/layer3/deliverable-writer.ts` | 산출물 작성기 |
| `src/layer3/doc-collaborator-bridge.ts` | 문서 협업 브릿지 |
| `src/layer3/doc-integrator-fragment.ts` | 문서 통합 조각 |
| `src/layer3/doc-integrator-merge.ts` | 문서 통합 병합 |
| `src/layer3/doc-integrator-template.ts` | 문서 통합 템플릿 |
| `src/layer3/production-tester-session.ts` | 프로덕션 테스터 세션 |

#### MCP 모듈 (12개 미커버)

| 모듈 파일 | 비고 |
|---------|-----|
| `src/mcp/builtin/browser/chrome-control.ts` | Chrome 제어 |
| `src/mcp/builtin/browser/page-reader.ts` | 페이지 읽기 |
| `src/mcp/builtin/browser/playwright-operations.ts` | Playwright 연동 |
| `src/mcp/builtin/browser/screenshot.ts` | 스크린샷 |
| `src/mcp/builtin/git/git-operations.ts` | Git 연산 |
| `src/mcp/builtin/git/git-read.ts` | Git 읽기 |
| `src/mcp/builtin/git/git-write.ts` | Git 쓰기 |
| `src/mcp/builtin/os-control/filesystem.ts` | 파일시스템 |
| `src/mcp/builtin/os-control/fs-read.ts` | FS 읽기 |
| `src/mcp/builtin/os-control/fs-write.ts` | FS 쓰기 |
| `src/mcp/builtin/os-control/process.ts` | 프로세스 제어 |
| `src/mcp/builtin/os-control/system-info.ts` | 시스템 정보 |
| `src/mcp/builtin/web-search/search-operations.ts` | 웹 검색 |

#### RAG 모듈 (3개 미커버)

| 모듈 파일 | 비고 |
|---------|-----|
| `src/rag/chunk-splitter-utils.ts` | 청크 분할 유틸 |
| `src/rag/openai-embeddings.ts` | OpenAI 임베딩 |
| `src/rag/sql-utils.ts` | SQL 유틸 |

### 4. 심각도별 분류

#### CRITICAL (즉시 수정 필요):
- **없음** — 모든 205,837개 테스트 통과

#### HIGH (테스트 커버리지 확장 필요):
- **core 모듈 3개 미커버**: `config-merge.ts`, `config-schema.ts`, `file-size-guard.ts` — core는 전체 시스템의 기반이므로 우선 커버 필요
- **layer2 team-leader 관련 7개 미커버**: 팀 리더는 핵심 오케스트레이션 로직으로 분할된 헬퍼 파일에 테스트 부재
- **layer2 session/bootstrap 관련 5개 미커버**: 세션 복원, 부트스트랩 등 런타임 안정성 핵심 모듈

#### MEDIUM (계획적 보강 필요):
- **layer1 5개 미커버**: 헬퍼/유틸 성격이나 contract 검증 리포터는 품질 게이트 관련
- **layer3 산출물 렌더러 8개 미커버**: DOCX/PDF/PPTX/HTML 렌더러 — 기능은 독립적이나 산출물 품질에 직결
- **RAG 유틸 3개 미커버**: 청크 분할, SQL, OpenAI 임베딩 유틸

#### LOW (장기 개선):
- **CLI/TUI 26개 미커버**: UI 컴포넌트는 통합테스트로 간접 커버 가능, 단위 테스트 우선순위 낮음
- **MCP builtin 12개 미커버**: 외부 시스템(Chrome, Git, FS) 연동 모듈로 mocking이 필요한 영역

### 5. 테스트 품질 관찰

- **로그 출력**: 테스트 실행 시 `error` 레벨 로그가 다수 출력됨 (429 에러, MCP 서버 시작 실패 등). 이는 **의도된 에러 케이스 테스트의 부산물**이지만, 테스트 출력의 가독성을 떨어뜨림
- **MCP 서버 시작 실패 로그**: `Executable not found in $PATH: "builtin"` — 테스트 환경에서 MCP builtin 실행 파일이 없어 발생. 테스트 자체는 통과하나 로그 노이즈
- **E2E 테스트 수**: 191,233개로 매우 많음 — 파라미터라이즈된 테스트 또는 프로퍼티 기반 테스트로 추정

### 6. 권장 사항

1. **core 모듈 테스트 추가 (HIGH)**: `config-merge.ts`, `config-schema.ts`, `file-size-guard.ts`
2. **team-leader 분할 모듈 테스트 (HIGH)**: 통합 테스트(`team-leader.test.ts`)가 존재하나, 분할된 7개 헬퍼 파일의 단위 테스트 필요
3. **테스트 로그 억제**: 에러 케이스 테스트 시 Logger를 mock하여 stderr 노이즈 감소
4. **layer3 렌더러 테스트 (MEDIUM)**: 산출물 형식별 렌더러에 대한 단위 테스트
5. **MCP builtin 모듈 (LOW)**: 외부 의존성 mocking 기반 단위 테스트
