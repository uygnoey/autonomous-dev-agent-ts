# autonomous-dev-agent (adev)
이 문서를 읽을떄마다 읽은 년월일을  YYYY-MM-DD HH24:mm:ss 포멧으로 표기하고 아랫줄에다 main-claude.md 읽기시작 이라고 tui에 표시해

## 핵심 역할 정의

**adev = 오케스트레이터** | **Claude = 실제 작업자**

- Claude가 기획·설계·개발·테스트·검증을 **모두** 수행한다
- adev는 Claude가 일관된 고품질로 작업할 수 있게 **메모리 관리 + 흐름 관리**를 담당한다
  - 메모리: RAG(LanceDB) — 과거 결정, 실패 이력, 코드 인덱스를 Claude에 주입
  - 흐름: Phase FSM + HandoffPackage — 개발 순서와 역할 분리를 강제
  - 컨텍스트: `.claude/agents/` + CLAUDE.md — 각 Claude 인스턴스에 역할 문서 주입

> adev가 없으면 Claude는 역할이 섞이고 컨텍스트를 잃는다.
> adev가 있어야 Claude가 서비스 가능 수준의 결과물을 자율적으로 완성한다.

---

Claude Code Skills + RAG를 연동해 일관된 코드 품질로 자율 개발을 수행하는 상위 에이전트 시스템.

상세 컨벤션: `.claude/CLAUDE.md`
아키텍처: `ARCHITECTURE.md`
전체 스펙: `adev-spec-full-v2_4.md`
구현 가이드: `IMPLEMENTATION-GUIDE.md`

---

## Agent Teams 필수 규칙 (세션 시작 시 반드시 준수)

### 1. Agent Teams 무조건 활성화
- 프로젝트 시작 시 **TeamCreate로 팀 생성** (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`은 `.claude/settings.json`에 이미 설정됨)
- 단순 질문/분석이라도 팀을 구성해 역할 분리

### 2. 에이전트 우선순위 (절대 규칙)
1. **`.claude/agents/` 커스텀 에이전트 최우선 사용**
2. 커스텀으로 불가능한 경우에만 빌트인 에이전트 사용
3. 빌트인: `general-purpose`, `Explore`, `Plan`, `claude-code-guide`, `statusline-setup`

### 3. 커스텀 에이전트 역할표 (`.claude/agents/`)
| 에이전트 | 역할 | 언제 사용 |
|---------|------|----------|
| `architect` | 아키텍처 설계, 갭 분석 | 설계 결정, 모듈 구조 파악 |
| `coder` | 코드 구현 (N개 병렬 가능) | 실제 코드 작성/수정 |
| `tester` | 테스트 실행 (`bun test`) + Fail-Fast | 테스트 실행, 결과 검증 |
| `qc` | 실패 근본 원인 분석 | 테스트 실패 시 원인 진단 |
| `qa` | 코딩 전/후 품질 게이트 | tsc, biome, 스펙 준수 검증 |
| `reviewer` | 코드 리뷰 + 최종 품질 판정 | 코드 완성 후 검토 |
| `documenter` | 문서 생성 | Phase 완료 시 문서화 |

### 4. 역할 분리 원칙 (혼용 금지)
- **코드 수정**: `coder`만 (qa, qc, reviewer, tester는 코드 수정 금지)
- **테스트 실행**: `tester`만
- **실패 분석**: `qc`만
- **품질 검증**: `qa` (코딩 전), `reviewer` (코딩 후)
- **문서화**: `documenter`만
- **관리 감독**: `architect` 와 `qa`, `reviewer` 가 `coder`와 `tester` 가 코딩 및 테스트하는 것을 실시간으로 감독 하여 코드와 테스트가 잘되게 감독

---

## 문서 체계 (절대 준수)

### 문서 종류와 역할

| 문서 | 위치 | 역할 |
|------|------|------|
| `CLAUDE.md` | 프로젝트 루트 | 모든 세션에 자동 로드되는 프로젝트 헌법. 세션마다 반드시 존재해야 함 |
| `SPEC.md` | 작업 디렉터리 또는 `docs/specs/` | 특정 기능의 **what**과 **why**를 담은 설계 문서 |
| `plan.md` | 프로젝트 루트 또는 작업 디렉터리 | 에이전트가 실행할 수 있는 2~5분 단위 태스크 리스트 |

### CLAUDE.md 작성 규칙
- **프로젝트 루트에 반드시 존재** — 없으면 세션 시작 전에 생성
- 헌법처럼 변경 빈도 낮음. 변경 시 반드시 Git 커밋 + 변경 사유 명시
- 코딩 컨벤션, 에이전트 역할, 금지 사항 등 세션 불변 규칙만 포함

### SPEC.md 작성 규칙
- 기능 구현 전 반드시 작성 (코드보다 스펙이 먼저)
- **what**: 이 기능이 무엇을 하는가
- **why**: 왜 이렇게 설계했는가 (결정 근거, 대안 검토 포함)
- 완성된 스펙은 `docs/specs/YYYY-MM-DD-주제.md`로 저장 후 Git 커밋
- 에이전트가 `git diff docs/specs/`로 스펙 변경 이력 추적 가능
- 코드 리뷰 시 "의도한 건지 우연인지" 판단하는 근거로 활용

### plan.md 작성 규칙
- **태스크 단위**: 2~5분 이내 완료 가능한 단일 작업
- **파일 경로 명시 필수**: 각 태스크에 대상 파일 경로를 명시하여 에이전트의 추측 차단
  ```markdown
  - [ ] `src/layer2/agent-generator.ts` — AgentConfig 인터페이스 정의
  - [ ] `tests/unit/layer2/agent-generator.test.ts` — 실패 테스트 먼저 작성
  ```
- **TDD 순서 고정**: 테스트 먼저 → 구현 → 통과 확인 → 커밋
  ```markdown
  - [ ] [TEST] `tests/unit/foo/bar.test.ts` — 실패 테스트 작성
  - [ ] [IMPL] `src/foo/bar.ts` — 구현
  - [ ] [VERIFY] `bun test tests/unit/foo/bar.test.ts` — 통과 확인
  - [ ] [COMMIT] feat: bar 기능 구현
  ```
- 완료된 태스크는 `- [x]`로 체크 후 다음 태스크 진행

---

## 기능 단위 완료 시 필수 다이어그램 생성 (절대 준수)

기능 개발이 끝날 때마다 **반드시** 아키텍처 다이어그램을 생성해야 한다.
코드 커밋 없이 다이어그램 없이 완료로 처리하는 것은 금지.

### 사용 도구

| 도구 | GitHub | 역할 |
|------|--------|------|
| **visual-explainer** | https://lnkd.in/g7Zw9XVT | 코드/아키텍처 시각적 설명 생성 |
| **Excalidraw MCP** | https://lnkd.in/gWPnWMdt | Excalidraw 다이어그램 자동 생성 |
| **beautiful-mermaid** | https://lnkd.in/gRkizduS | Mermaid 다이어그램 (Mermaid 사용 시 반드시 이것만 사용) |

### Mermaid 사용 규칙 (절대 준수)
- Mermaid 다이어그램이 필요할 때 **raw Mermaid 코드 블록 단독 출력 금지**
- **beautiful-mermaid** (https://lnkd.in/gRkizduS)를 반드시 경유하여 렌더링

### 다이어그램 생성 절차 (기능 완료 체크리스트)

```markdown
- [ ] [DIAGRAM] Excalidraw MCP로 변경된 모듈 아키텍처 다이어그램 생성
- [ ] [DIAGRAM] visual-explainer로 데이터 흐름 / 시퀀스 다이어그램 생성
- [ ] [SAVE] docs/diagrams/YYYY-MM-DD-기능명.excalidraw 저장
- [ ] [COMMIT] docs: 기능명 아키텍처 다이어그램 추가
```

### 다이어그램 포함 내용 (최소 기준)

- **모듈 관계도**: 새로 추가/변경된 모듈과 기존 모듈 간 의존성
- **데이터 흐름**: 입력 → 처리 → 출력 흐름
- **Phase 전환**: 해당 기능이 관여하는 Phase FSM 상태 전환

### documenter 에이전트 의무

`documenter` 에이전트는 Phase 완료 시 다음을 **순서대로** 실행:
1. Excalidraw MCP (`mcp__claude_ai_Excalidraw__export_to_excalidraw`) 호출 → 다이어그램 생성
2. `docs/diagrams/` 에 저장
3. Git 커밋

---

## 세션 관리 규칙

### Context Window 50% 룰
- **context window가 50% 이상 차면 새 세션으로 전환**
- 전환 전 현재 상태를 `plan.md`에 반드시 기록 (어디까지 완료했는지)
- 새 세션에서 `plan.md`를 읽어 작업 재개
- 이유: context window가 가득 차면 에이전트가 초기 지시를 망각하고 품질이 저하됨