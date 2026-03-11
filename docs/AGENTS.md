# adev Agent Roles Reference

> Detailed reference for the 7 specialized agents in Layer2, their responsibilities, constraints, and interaction patterns.

For a quick overview, see [docs/references/AGENT-ROLES.md](./references/AGENT-ROLES.md).

---

## Overview

Layer2 uses 7 specialized agents working in coordination through a 4-Phase FSM (DESIGN → CODE → TEST → VERIFY). Each agent has a strictly defined role — mixing responsibilities is prohibited.

```
┌─────────────────────────────────────────────────────────────┐
│  adev (Team Leader)                                         │
│  ├─ architect  — Technical design & architecture decisions  │
│  ├─ qa         — Prevention gate (before coding)            │
│  ├─ coder ×N   — Code implementation (parallel)             │
│  ├─ tester     — Test generation + Fail-Fast execution      │
│  ├─ qc         — Detection & root cause analysis            │
│  ├─ reviewer   — Code review + quality judgment             │
│  └─ documenter — Documentation (event-driven)               │
└─────────────────────────────────────────────────────────────┘
```

---

## Agent Summary Table

| Agent | Phase | Code Modification | Execution Model |
|-------|-------|-------------------|-----------------|
| `architect` | DESIGN | No | Loop (team discussion) |
| `qa` | DESIGN | No | Loop (gate validation) |
| `coder` | CODE | **Yes (only agent)** | Loop ×N parallel |
| `tester` | TEST | Tests only | Loop sequential |
| `qc` | TEST/VERIFY | No | Loop on failure |
| `reviewer` | VERIFY | No | Loop sequential |
| `documenter` | Post-phase | No | Event-driven (spawn/exit) |

---

## `architect` — Technical Design

### Role

Leads technical design discussions and makes architecture decisions before any code is written.

### Responsibilities

- Analyze requirements from the `HandoffPackage`
- Design module structure and component boundaries
- Define interfaces and data flow before implementation
- Identify technical risks and propose mitigations
- Review design decisions with the team
- Maintain consistency with existing architecture patterns

### Constraints

- **Cannot modify source code** — design only
- Must produce a concrete technical design document before CODE phase begins
- Must validate against `ARCHITECTURE.md` dependency rules

### Phase involvement

- **DESIGN** (primary) — leads design discussion
- **VERIFY** (secondary) — validates implementation matches design

### Output

- Technical design document
- Interface definitions (TypeScript types)
- Module dependency map
- Architecture decision records

---

## `qa` — Quality Assurance (Prevention)

### Role

Prevention gate that validates design quality **before coding begins**. Catches issues at the design stage when they are cheapest to fix.

### Responsibilities

- Validate that design satisfies all spec requirements
- Check for missing edge cases and error conditions
- Verify interface completeness
- Review test plans for coverage adequacy
- Approve (or reject) transition from DESIGN to CODE phase
- Run pre-commit quality checks: `bunx tsc --noEmit`, `bunx biome check src/`

### Constraints

- **Cannot modify source code** — validation only
- Gate function: CODE phase cannot start without qa approval
- Must document specific approval/rejection reasons

### Phase involvement

- **DESIGN** (primary) — mandatory gate before CODE
- **VERIFY** (secondary) — post-implementation quality check

### Difference from `qc`

| | `qa` | `qc` |
|-|------|------|
| Timing | Before coding (prevention) | After coding (detection) |
| Focus | Design completeness | Root cause analysis |
| Input | Design docs, interfaces | Test failures, errors |

---

## `coder` — Code Implementation

### Role

The **only agent** with write access to source code. Implements code based on the architect's design and qa's approval.

### Responsibilities

- Implement TypeScript code following design specifications
- Follow all conventions from `.claude/CLAUDE.md` and `.claude/rules/`
- Write code that satisfies the test contract
- Create feature branches: `feature/{name}-{module}-coder{N}`
- Fix code based on qc's root cause analysis reports

### Constraints

- **Only agent allowed to write/modify source code**
- Must follow architect's design — no architectural changes without architect approval
- Cannot run tests (tester's job)
- Cannot review code (reviewer's job)
- Parallel instances allowed: `coder1`, `coder2`, ..., `coderN` work on separate modules

### Execution model

```
CODE phase:
  coder1 → feature/{name}-auth-coder1
  coder2 → feature/{name}-api-coder2
  coder3 → feature/{name}-db-coder3
  (parallel — no blocking between coders)
```

### Code quality rules (non-negotiable)

- No `any` types — use `unknown` + type guards
- No `console.log` — use `src/core/logger.ts`
- No `process.env` direct access — use `src/core/config.ts`
- ES Modules only — no `require()`
- `Result<T, E>` pattern — minimize `throw`
- Files ≤ 300 lines — split if exceeded

---

## `tester` — Test Execution

### Role

Generates and runs tests with **Fail-Fast** discipline. Stops immediately on first failure.

### Responsibilities

- Write unit, module, and E2E tests for all new code
- Execute `bun test` and report results
- Enforce Fail-Fast: stop on first failure, do NOT continue running
- Report exact failure information to `qc`
- Ensure test ratio: 80%+ random/edge cases, ≤20% normal cases

### Constraints

- **Cannot modify source code** — tests only
- Must stop immediately on first test failure (Fail-Fast)
- Cannot diagnose failures (qc's job)
- Cannot skip tests (`test.skip`, `test.todo` forbidden)

### Test hierarchy (Feature Mode)

```
Unit tests      10,000+   (tests/unit/)
Module tests    10,000+   (tests/module/)
E2E tests      100,000+   (tests/e2e/)
```

### Test hierarchy (Integration Mode — Cascading)

```
Step 1: Modified feature E2E   100,000+
Step 2: Related features E2E    10,000   (regression)
Step 3: Unrelated features E2E   1,000   (smoke)
Step 4: Full integration E2E 1,000,000
```

### Fail-Fast protocol

```
1 failure → STOP immediately
           ↓
          Report to qc with:
          - Exact test name
          - Error message
          - Stack trace
          - Test input values
           ↓
          Wait for coder fix
           ↓
          Restart test from BEGINNING of current phase
```

---

## `qc` — Quality Control (Detection)

### Role

Root cause analysis specialist. When tests fail, `qc` identifies the **single root cause** — not multiple issues.

### Responsibilities

- Receive failure reports from tester
- Analyze stack traces, logs, and test inputs
- Identify ONE root cause per investigation cycle
- Produce a clear, actionable fix report for coder
- Distinguish symptoms from root causes

### Constraints

- **Cannot modify source code** — analysis only
- Must identify exactly ONE root cause per report (Fail-Fast: fix one thing at a time)
- Cannot run tests directly

### Root cause report format

```
ROOT CAUSE ANALYSIS
══════════════════
Test:     src/layer2/v2-session-executor.test.ts:45
Failure:  TypeError: Cannot read property 'session' of undefined
Root Cause: executeOneShot() does not handle null session from factory
  Location: src/layer2/v2-session-factory.ts:67
  Evidence: session returned null when ANTHROPIC_API_KEY is missing
Fix:
  Add null check after createSession() call
  Return err(new AgentError('session_create_failed', ...)) if session is null
```

### Escalation

If the same root cause reappears 3+ times, `qc` escalates to `architect` for design-level review.

---

## `reviewer` — Code Review

### Role

Final code quality judgment before VERIFY phase. Reviews all code written by `coder`.

### Responsibilities

- Review implementation against design spec
- Check all code quality conventions
- Verify test coverage adequacy
- Approve or reject transition to VERIFY phase
- Document review findings with line-level specificity

### Constraints

- **Cannot modify source code** — review only
- Must produce a written review with clear pass/fail judgment
- Cannot approve code with `any` types, `console.log`, or circular dependencies

### Review checklist

- [ ] TypeScript strict compliance (no `any`, no `!` non-null assertions)
- [ ] Result pattern used consistently
- [ ] No `console.log` (use logger)
- [ ] No direct `process.env` access (use config)
- [ ] ES Modules only (no `require`)
- [ ] File size ≤ 300 lines
- [ ] All exports have JSDoc
- [ ] No circular dependencies (`bunx madge --circular src/`)
- [ ] Tests have 80%+ edge/random case ratio
- [ ] Error messages are specific and actionable

---

## `documenter` — Documentation

### Role

Event-driven documentation generator. Spawned automatically when a phase completes — does its work and exits.

### Responsibilities

- Generate or update module documentation
- Write API reference in multiple languages (EN, KO, JA, ES)
- Update `docs/api/{lang}/` files
- Generate phase summary reports
- Update `docs/DEV-STATUS.md`

### Constraints

- **Cannot modify source code** — docs only
- Event-driven: spawned on phase completion, not persistent
- Must write bilingual (KR + EN) documentation per project convention

### Trigger events

| Event | Documentation output |
|-------|---------------------|
| DESIGN phase complete | Architecture decision record |
| CODE phase complete | Module API reference (all languages) |
| TEST phase complete | Test coverage report |
| VERIFY phase complete | Phase summary + status update |

### Language matrix

All API documentation is generated in 4 languages:

| Language | Path |
|----------|------|
| English | `docs/api/en/` |
| Korean | `docs/api/ko/` |
| Japanese | `docs/api/ja/` |
| Spanish | `docs/api/es/` |

---

## Role Separation Rules (Enforcement)

The following violations will cause the team leader (`adev`) to reject the action:

| Action | Only allowed agent |
|--------|-------------------|
| Modify `.ts` source files | `coder` |
| Run `bun test` | `tester` |
| Root cause analysis | `qc` |
| Code review judgment | `reviewer` |
| Quality gate approval | `qa` |
| Architecture decisions | `architect` |
| Write documentation | `documenter` |

**Mixing roles is strictly forbidden.** If an agent tries to perform another agent's role, the action must be rejected and reassigned to the correct agent.

---

## Related Documents

- [docs/references/AGENT-ROLES.md](./references/AGENT-ROLES.md) — Concise roles reference
- [docs/references/PHASE-ENGINE.md](./references/PHASE-ENGINE.md) — Phase FSM transitions
- [ARCHITECTURE.md](../ARCHITECTURE.md) — Full system architecture
- [.claude/agents/](../.claude/agents/) — Agent definition files
