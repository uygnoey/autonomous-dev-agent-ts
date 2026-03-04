# autonomous-dev-agent (adev)

Claude Code Skills + RAG를 연동해 일관된 코드 품질로 자율 개발을 수행하는 상위 에이전트 시스템.

상세 컨벤션: `.claude/CLAUDE.md`
아키텍처: `ARCHITECTURE.md`
전체 스펙: `SPEC.md`
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
