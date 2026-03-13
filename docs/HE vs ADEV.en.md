# Harness Engineering vs adev — In-Depth Comparative Analysis

> 🌐 **Language**: [한국어](HE%20vs%20ADEV.md) | **English** | [日本語](HE%20vs%20ADEV.ja.md) | [Español](HE%20vs%20ADEV.es.md)

> **Date**: 2026-03-13
> **adev reference**: v2.4 spec confirmed + implementation status (201 files, ~32,681 lines)
> **Harness Engineering reference**: OpenAI (officially coined 2026-02), Anthropic Engineering Blog, Martin Fowler, LangChain DeepAgents

---

## Table of Contents

1. [What is Harness Engineering?](#1-what-is-harness-engineering)
2. [adev Architecture — Accurate Understanding](#2-adev-architecture--accurate-understanding)
3. [Core Formula Comparison](#3-core-formula-comparison)
4. [Harness Engineering 4-Function Comparative Analysis](#4-harness-engineering-4-function-comparative-analysis)
5. [TDD / CI Implementation Comparison](#5-tdd--ci-implementation-comparison)
6. [Agent Orchestration Comparison](#6-agent-orchestration-comparison)
7. [Context & Memory Comparison](#7-context--memory-comparison)
8. [Session Continuity Comparison](#8-session-continuity-comparison)
9. [Similarities](#9-similarities)
10. [Differences — Key Distinctions](#10-differences--key-distinctions)
11. [adev Strengths](#11-adev-strengths)
12. [adev Weaknesses / Areas for Improvement](#12-adev-weaknesses--areas-for-improvement)
13. [Comprehensive Evaluation Matrix](#13-comprehensive-evaluation-matrix)

---

## 1. What is Harness Engineering?

### Overview

**Harness Engineering** is an **environment design discipline** for reliably leveraging AI agents in real-world tasks.

> "A horse (AI model) is powerful but lacks direction. The harness channels that power in the right direction."

### Core Formula

```
Agent = Model + Harness
```

| Entity  | Role                                      |
| ------- | ----------------------------------------- |
| Model   | Intelligence — writing code, analysis, judgment |
| Harness | Direction — constraints, context, verification, correction |

### Background (2026)

| Date    | Event                                                                                                    |
| ------- | -------------------------------------------------------------------------------------------------------- |
| 2025    | Year of proving AI agent capabilities                                                                    |
| 2026-02 | **OpenAI**: Generated 1M lines of production code autonomously with Codex + Harness; officially coined "Harness Engineering" |
| 2026    | Industry consensus: **"It's not the agent itself but the harness that is hard"**                         |

### The Real Cause of Agent Failure (The Starting Point of Harness Engineering)

Not model capability deficiency, but **orchestration environment issues**:

- Loses direction after too many steps
- Repeats failed approaches
- Context lost when sessions break
- Cannot track objectives

> Vercel lesson: **Reducing agent tools by 80% actually improved success rate.**

### Martin Fowler's 4 Functions

```
① Constrain  — Limits what the agent can do
               (architecture boundaries, allowed tools, style rules)

② Inform     — Tells the agent what to do
               (specifications, role guidelines, architecture docs, Context Engineering)

③ Verify     — Confirms the agent did it correctly
               (automated tests, type checks, linters, code review)

④ Correct    — Fixes what went wrong
               (feedback loops, self-repair, inter-session progress logs)
```

### Anthropic's 2-Agent Harness (Minimal HE Implementation Reference)

```
[Initializer Agent] — Runs once
  git init / init scripts / feature list / create claude-progress.txt

[Coding Agent] — Repeats each session
  Read claude-progress.txt → Identify current position → Implement 1 feature
  → Run tests → Commit → Update progress log → End session
  → Resume in next session
```

---

## 2. adev Architecture — Accurate Understanding

### What adev Is

```
adev = AI Autonomous Development System
      Automates the entire pipeline: "Idea → Production Code + Documentation + Business Deliverables"
```

### ⚠️ Critical Distinction — bun vs Claude Agent SDK

The most important distinction for understanding adev:

```
┌─────────────────────────────────────────────────────────────────┐
│  bun (TypeScript runtime)                                        │
│  Role: Runtime that executes the adev process (harness) itself  │
│  Handles: adev orchestrator code execution                       │
│  Target: adev itself (autonomous-dev-agent-ts codebase)          │
├─────────────────────────────────────────────────────────────────┤
│  Claude Agent SDK V2 (unstable_v2_createSession / prompt)        │
│  Role: SDK that spawns actual development agents                 │
│  Handles: Writing code, generating/running tests, docs for       │
│           target project                                         │
│  Target: The project the user wants to build (target project)    │
└─────────────────────────────────────────────────────────────────┘
```

In other words:

- **bun test / bunx tsc / bunx biome** → Code quality management for adev itself (adev dev infrastructure)
- **Claude Agent SDK agents** → Write code, run tests, and perform CI for the target project

### Full 3-Layer Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ Layer 1: Claude API (Opus 4.6) — Conversation Interface           │
│                                                                    │
│  User ↔ Claude API conversation:                                  │
│    Idea exploration → Planning → Design → Tech stack → Doc list   │
│    → Test case type definition (not actual code, rules/categories)│
│    → User confirms → Generate Contract (HandoffPackage)           │
│    → Structural & consistency validation → User approves → Layer2 │
│                                                                    │
│  Outputs: Plans, design docs, confirmed specs, Contract, test defs│
├──────────────────────────────────────────────────────────────────┤
│  adev (TypeScript/Bun process) = Team Leader = Harness            │
│  ↓ Calls Claude Agent SDK V2                                      │
├──────────────────────────────────────────────────────────────────┤
│ Layer 2: Claude Agent SDK V2 — Autonomous Development             │
│          (develops the target project)                            │
│                                                                    │
│  Layer2-A: Per-feature development loop                           │
│    Phase FSM: DESIGN → CODE → TEST → VERIFY                       │
│    7 Agents (Claude instances):                                   │
│      architect: Design, module structure (no coding)              │
│      qa: Pre-coding spec validation Gate (no coding)              │
│      coder×N: Actual code writing (sole coding authority, Git     │
│               branch isolation)                                   │
│      tester: Test code generation + execution via Bash (target    │
│              stack)                                               │
│      qc: Root cause analysis on failures (no coding)             │
│      reviewer: Code review (no coding)                            │
│      documenter: Event-triggered → spawn → generate docs → exit  │
│                                                                    │
│  Layer2-B: Integration Verification                               │
│    Cascading Fail-Fast: Step1(E2E 100k) → Step2(10k) → Step3(1k) │
│    → Step4(integration 1M) — repeat until 0 bugs                 │
│                                                                    │
│  Layer2-C: User Confirmation Checkpoint                           │
│    Deliver results + test report → User approves → Layer3         │
├──────────────────────────────────────────────────────────────────┤
│ Layer 3: Deliverables + Continuous E2E                            │
│    8 integrated documents + 4 business deliverables               │
│    Continuous E2E every 5 min → Bug found → Re-run Layer2         │
└──────────────────────────────────────────────────────────────────┘
```

### Core Development Flow

```
[Layer1 — Claude API]
  Generates "Test Case Type Definition" for tester agent:
  → Defines 12 categories, rules/patterns/boundary values per category,
    100-200 sample cases, random 80%+ ratio rule
  → Does NOT write actual test code (spec only)

[Layer2 — Claude Agent SDK]
  tester agent:
  → Reads type definitions → Identifies target project tech stack
  → Generates test code directly (Write tool)
  → Runs via Bash (target project's test framework)
  → Jest? pytest? go test? → whatever was decided in Layer1 spec

  TDD cycle:
  → tester writes failing tests first
  → coder implements to make them pass
  → 1 failure → immediate stop → qc root cause → coder fix → restart

  CI role:
  → Cascading E2E integration after feature completion
  → Regression verification that new features don't break existing ones
```

---

## 3. Core Formula Comparison

### Harness Engineering Formula

```
Agent = Model + Harness
Harness = Constrain + Inform + Verify + Correct
```

### adev Formula

```
adev = Harness (TypeScript/Bun orchestrator)
     + Claude Agent SDK agents (Model)

adev Harness:
  Constrain:
    - Unidirectional module dependencies (layer-dependencies.md)
    - allowedTools list (tool restrictions per agent)
    - Coding authority separation by agent (only coder can code)
    - Git branch isolation (prevents Coder×N file conflicts)
    - Fixed 7 agents (additions/changes prohibited)
    - settingSources: [] (removes filesystem config dependency)

  Inform:
    - Layer1 Contract (HandoffPackage): Planning intent → Development spec
    - 7 agent.md files: Per-agent role guidelines (auto-generated for project spec)
    - SKILL.md: Domain knowledge injection
    - LanceDB RAG: Design decision history, failure history — real-time search injection
    - Test Case Type Definition: tester agent behavior standard

  Verify:
    - tester: Generate + run target project test code (Bash tool)
    - Fail-Fast: 1 failure → immediate stop (restart from beginning)
    - 4-layer verification: qa/qc → reviewer → Layer1 intent → adev comprehensive
    - Haiku → Sonnet → Opus automatic escalation

  Correct:
    - qc: Focus on 1 root cause only → instruct coder to fix
    - failure-handler: Classify failure type → return to appropriate Phase
    - bias-detector: Detect confirmation bias/loops/deadlocks/scope creep → restart session
    - session-restore-orchestrator: Token expiry → LanceDB-based restoration
    - bug-escalator: Layer3 bugs → re-run entire Layer2 loop
```

---

## 4. Harness Engineering 4-Function Comparative Analysis

### ① Constrain

| HE Principle              | adev Implementation File | Content                                         | Status |
| ------------------------- | ------------------------ | ----------------------------------------------- | ------ |
| Architecture boundaries   | `layer-dependencies.md`  | Unidirectional dependencies + no circular       | ✅     |
| Tool restrictions         | `v2-session-factory.ts`  | Phase/agent-level `allowedTools` specified      | ✅     |
| Code style enforcement    | `agent.md` (coder guide) | Target project conventions — decided from spec  | ✅     |
| No role mixing            | `AGENT-ROLES.md`         | Only coder codes, only tester tests, qc only analyzes | ✅ |
| File conflict prevention  | `coder-allocator.ts`     | No same-file edits across Coder×N               | ✅     |
| Fixed agent count         | Spec §7                  | Fixed at 7 (additions/changes prohibited)       | ✅     |
| Environment dep removal   | `v2-session-factory.ts`  | `settingSources: []`                            | ✅     |
| **Vercel Principle**      | Phase-level allowedTools | Only necessary tools per role; exclude extras   | ✅     |

### ② Inform

| HE Principle             | adev Implementation                                | Content                                                                     | Status         |
| ------------------------ | -------------------------------------------------- | --------------------------------------------------------------------------- | -------------- |
| Spec provision           | `contract-builder.ts`                              | Contract (HandoffPackage) — Kahn topological sort, verification matrix      | ✅             |
| Role guidelines          | `agent-md-generator.ts`                            | 7 agent.md files — auto-generated per project spec                          | ✅             |
| Domain knowledge         | `skill-merger.ts`                                  | SKILL.md global + project merge injection                                   | ✅             |
| Coding conventions       | Layer1 spec decision                               | Conventions defined in target project spec → reflected in agent.md          | ✅             |
| Progress logs            | `progress-tracker.ts`, `session-snapshot-store.ts` | Feature/Phase-level progress tracking                                       | ✅             |
| Dynamic context          | `src/rag/` LanceDB RAG                             | Similar design decisions, failure history — real-time search → agent prompt | ✅ (Beyond HE) |
| Test behavior standard   | `test-type-designer.ts`                            | Test type definition (12 categories, 80% random) → passed to tester agent  | ✅ (Not in HE) |
| Handoff spec             | `handoff-receiver.ts`                              | Layer1 → Layer2 Contract reception + structural/consistency validation      | ✅ (Not in HE) |

### ③ Verify

| HE Principle              | adev Implementation         | Content                                              | Status         |
| ------------------------- | --------------------------- | ---------------------------------------------------- | -------------- |
| Automated tests           | tester agent                | **Generate + run target project test code via Bash** | ✅             |
| TDD                       | tester → coder order        | Failing tests first, coder implements to pass        | ✅             |
| CI role                   | Cascading integration E2E   | Regression check after feature completion            | ✅             |
| Fail-Fast                 | `integration-tester.ts`     | 1 failure → immediate stop, restart from beginning   | ✅ (Strict)    |
| Type safety               | coder agent guidelines      | Target project type checks — per spec tech stack     | ✅             |
| Code review               | reviewer agent              | Independent session quality judgment                 | ✅             |
| **4-layer verification**  | `verification-gate.ts`      | qa/qc → reviewer → Layer1 intent → adev comprehensive | ✅ (Beyond HE) |
| **Intent verification**   | `layer1-verifier.ts`        | "Was it implemented as I intended?" (Layer1 Claude API) | ✅ (Not in HE) |
| **Bias detection**        | `bias-detector.ts`          | Detect confirmation bias/loops/deadlocks/scope creep | ✅ (Not in HE) |
| **Verification escalation** | `verification-escalator.ts` | Haiku → Sonnet → Opus automatic                   | ✅ (Not in HE) |

### ④ Correct

| HE Principle              | adev Implementation               | Content                                               | Status         |
| ------------------------- | --------------------------------- | ----------------------------------------------------- | -------------- |
| Feedback loops            | `team-leader-phase.ts`            | Failure → classify type → return to appropriate Phase | ✅             |
| Self-repair               | `failure-handler.ts`              | Auto-determine recovery strategy per failure type     | ✅             |
| Inter-session continuity  | `session-restore-orchestrator.ts` | `unstable_v2_resumeSession` + LanceDB vector restoration | ✅           |
| **Root cause focus**      | qc agent                          | Focus on 1 only (no multi-analysis → ensures Fail-Fast) | ✅ (HE specificized) |
| **Pattern memory**        | `failure-store.ts`                | Store failure vectors → RAG injection for recurrence prevention | ✅ (Not in HE) |
| **Bug escalation**        | `bug-escalator.ts`                | Layer3 bugs → re-run entire Layer2 loop               | ✅ (Not in HE) |

---

## 5. TDD / CI Implementation Comparison

### HE's Recommended TDD/CI Approach

```
TDD: Write failing test first → Implement to pass → Refactor
CI: Auto-run tests on commit → Block merge on failure
```

HE recommends "use TDD and CI" but **leaves the specific implementation to each team**.

### adev's TDD/CI — Full Flow

```
[Layer1 — Test Type Definition (not actual code)]

  Layer1 Claude API generates:
  - 12 test categories (normal/boundary/exception/concurrency/high-volume/abnormal-termination, etc.)
  - Rules/patterns/boundary values/input ranges per category
  - 100-200 sample cases
  - 80%+ random ratio rule
  - Target counts: Unit 10k / Module 10k / E2E 100k+ (configurable)
  - Included in Contract → passed to Layer2 tester agent

[Layer2 — tester agent generates + runs actual test code]

  tester agent (Claude Agent SDK V2 instance):
    ① Read type definitions → identify target project tech stack
       (Python → pytest, TypeScript → Jest/Vitest, Go → go test, etc.)
    ② Write test code based on definition rules (Write tool)
       - Unit test: function/method level
       - Module test: cross-module integration
       - E2E test: full user scenario lifecycle
    ③ Run via Bash tool:
       `pytest tests/` or `jest` or `bun test` — per spec tech stack
    ④ Fail-Fast: 1 failure → immediate stop → report to qc

[TDD Cycle]
  tester: writes failing test
  coder: implements to make it pass (target module Git branch)
  tester: re-runs → confirms pass
  → All Unit pass → Start Module → Module pass → Start E2E

[CI Role — Cascading Integration E2E (Layer2-B)]
  After all features complete:
  Step1: Modified feature E2E 100k+ (feature completeness check)
  Step2: Related feature E2E 10k (regression: did it break other features?)
  Step3: Unrelated feature E2E 1k (smoke: system-wide impact)
  Step4: Final integration E2E 1M (production simulation)
  Each Step failure → immediate stop → restart entire Layer2-A loop (from architect)
```

| Item                    | HE Recommended              | adev Implementation                               |
| ----------------------- | --------------------------- | ------------------------------------------------- |
| Test spec generation    | Developer does it manually  | **Layer1 Claude API auto-generates type definitions** |
| Test code generation    | Developer does it manually  | **tester agent auto-generates from type definitions** |
| Test execution          | CI tool (Jenkins, etc.)     | **tester agent runs directly via Bash tool**      |
| Test framework          | Team decides                | **Exactly the tech stack decided in layer1 spec** |
| TDD order               | Recommended (low compliance) | **Enforced (tester → coder order fixed)**        |
| Failure handling        | Developer analyzes          | **qc agent auto root-cause analysis**             |
| CI scale                | Tests per commit            | **Per feature: Unit 10k + Module 10k + E2E 100k** |
| Integration scale       | Deployment pipeline         | **Cascading final 1M runs**                       |
| Regression tests        | CI pipeline                 | **Step2 (related 10k) + Step3 (unrelated 1k) automatic** |

---

## 6. Agent Orchestration Comparison

### Anthropic HE Recommendation: 2-Agent Linear Structure

```
Initializer → [Coding Agent × feature count] sequential
1 feature per session, state handoff via progress.txt
```

### LangChain DeepAgents: Hierarchical Structure

```
Main Agent
  └─ Sub-agents (dynamically spawned as needed)
     Filesystem / Planning / Memory / Code Exec
```

### adev: Phase FSM + Role Separation + Parallel Development

```
adev (TypeScript/Bun) = Team Leader = Orchestrator
  │
  ├─ DESIGN Phase [Agent Teams enabled]
  │    session.stream() + CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
  │    → lead agent creates Team → spawns architect, qa, coder, reviewer as teammates
  │    → Team discussion via SendMessage (design decisions)
  │    → qa Gate passed + full consensus → enter CODE Phase
  │    → On exit: trigger documenter (generate design docs)
  │
  ├─ CODE Phase [No Agent Teams, parallel independent execution]
  │    unstable_v2_prompt() × N (Promise.allSettled)
  │    → coder1: feature/featureName-moduleA-coder1 branch
  │    → coder2: feature/featureName-moduleB-coder2 branch
  │    → coderN: feature/featureName-moduleN-coderN branch
  │    architect + reviewer: separate supervision sessions (no coding)
  │    → adev merges in dependency graph order
  │    → On completion: trigger documenter (update CHANGELOG)
  │
  ├─ TEST Phase [Fail-Fast sequential]
  │    unstable_v2_prompt() sequential execution
  │    → tester: generate test code from type definitions (Write tool)
  │               run target project tests via Bash tool
  │               Unit 10k → (stop immediately on failure) → Module 10k → E2E 100k
  │    → qc: analyze 1 root cause on failure
  │    → coder: fix only that bug (Fail-Fast: 1 only)
  │    → tester: restart that phase from beginning
  │    → On completion/failure: trigger documenter (test result report)
  │
  └─ VERIFY Phase [4-layer sequential]
       unstable_v2_prompt() sequential
       ① qa/qc: spec compliance + test pass verification
       ② reviewer: code quality + pattern compliance
       ③ Layer1 Claude API: "Was it implemented as I intended?"
       ④ adev: combine above 3 + confirmation bias check
       Failure → return to DESIGN/CODE/TEST based on type
```

| Item              | Anthropic 2-Agent | LangChain DeepAgents | adev                                      |
| ----------------- | ----------------- | -------------------- | ----------------------------------------- |
| Agent count       | 2                 | Variable             | 7 fixed                                   |
| Structure         | Linear sequential | Hierarchical         | Phase FSM                                 |
| Parallel dev      | None              | Partial              | Coder×N Promise.allSettled                |
| Git isolation     | None              | None                 | feature branch + dependency-order merge   |
| Team discussion   | None              | None                 | DESIGN Phase Agent Teams                  |
| Bias detection    | None              | None                 | bias-detector (loop/deadlock/confirmation bias) |
| Intent verification | None            | None                 | Layer1 compares planning intent vs implementation |
| Monitoring method | None              | None                 | Hook (PreToolUse/PostToolUse) + IPC polling |

---

## 7. Context & Memory Comparison

### Anthropic HE: claude-progress.txt

```
[Completed] feature-1: User authentication
[In Progress] feature-2: Product listing (50%)
[Pending] feature-3: Payment
```

- Pros: Simple, human-readable
- Limits: Text parsing, no types, no past pattern search, token waste

### adev: LanceDB 4-Table + RAG

| Table               | Stores                        | Used When                                     |
| ------------------- | ----------------------------- | --------------------------------------------- |
| `memory`            | User conversation history, feedback, decisions | Next conversation context     |
| `code_index`        | Target project code vectors   | Code search, duplicate prevention             |
| `design_decisions`  | "Why was it designed this way" history | Consistency, prevent re-examining same decisions |
| `failures`          | Failure causes + solution vectors | Recurrence prevention — RAG alert on similar situations |
| `session_snapshots` | Session state (added outside spec) | Accurate restoration after token expiry |

**Dynamic context injection flow**:

```
Agent starts task
  → Vectorize current context
  → LanceDB similarity search:
      Search design_decisions for similar past decisions
      Search failures for similar failure history
      Search code_index for related code
  → Inject search results into agent prompt dynamically
  → Agent makes better decisions by referencing learned past patterns
```

| Item                  | HE progress.txt  | adev LanceDB                            |
| --------------------- | ---------------- | --------------------------------------- |
| Storage format        | Text             | Vector DB (type-safe)                   |
| Past pattern search   | Not possible     | Similarity search (semantic)            |
| Failure recurrence    | None             | failure-store → RAG alert               |
| Design consistency    | None             | design-decision-store → past decisions  |
| Token efficiency      | Load entire file | Search and inject only relevant items   |
| Persistence           | File (volatile)  | Embedded DB (structured persistence)    |

---

## 8. Session Continuity Comparison

### HE's Core Problem: "All context lost when session breaks"

Anthropic's solution:

```
At start of each Coding Agent session:
  1. Read claude-progress.txt → identify current position
  2. Implement only 1 feature
  3. Complete → update log → end session
  4. Repeat same process in next session
```

### adev's Session Continuity Strategy

```
[When token limit reached — token-monitor.ts]
  20% remaining → suppress new session spawning (finish only in-progress)
  5% remaining  → graceful completion mode (no new tasks)
  Tokens depleted → token-wait-loop.ts: check every 1 min, wait up to 1 hour

[Session restoration — session-restore-orchestrator.ts]
  1. Load last snapshot from session-snapshot-store
  2. Attempt unstable_v2_resumeSession(sessionId)
  3. On restoration failure: new session + LanceDB vector context reconstruction
  4. Resume exactly from where it was interrupted

[Session ID System]
  {projectId}:{featureId}:{agentName}:{phase}
  Example: "proj-001:feat-auth:architect:DESIGN"
  → Track which project, feature, agent, and phase
```

---

## 9. Similarities

### 1. Core Philosophy: "Harness is harder than the model"

- HE: Agent failures are orchestration environment problems, not model capability deficiencies
- adev: The majority of 201 files, 32,681 lines is harness (orchestration) code

### 2. Inter-Session Context Continuity is Essential

- HE (Anthropic): `claude-progress.txt` for session handoff
- adev: `session-snapshot-store` + LanceDB + `unstable_v2_resumeSession`

### 3. Constraints Yield Better Results Than Freedom

- HE (Vercel): Reducing tools by 80% improved success rate
- adev: Coding authority separation by role, Phase-level allowedTools restrictions, fixed 7 agents

### 4. TDD + Fail-Fast Essential

- HE: Recommends TDD and fast feedback loops as core
- adev: tester → coder order enforced, 1 failure → immediate stop, restart from beginning (strictly applied)

### 5. Git-Based Work Units

- HE (Anthropic): 1 feature → commit → end session
- adev: 1 feature → feature/{feature}-{module}-coderN branch → dependency-order merge

### 6. Spec is the Standard for Agent Behavior

- HE: "Provide agents with clear specifications"
- adev: Contract (HandoffPackage) — includes feature list, acceptance criteria, I/O types, test type definitions

### 7. Role Separation

- HE (LangChain): Main agent + Sub-agents role separation
- adev: 7 agents with strict role separation (mixing absolutely prohibited)

### 8. Context Engineering

- HE: Providing correct context = core of agent performance
- adev: agent.md (role guidelines) + SKILL.md (domain knowledge) + LanceDB RAG (dynamic)

### 9. Self-Repair

- HE: Failure → root cause analysis → retry
- adev: qc (focus on 1 root cause) + failure-handler (Phase return per failure type)

### 10. Multi-Project Isolation

- HE: Recommends per-project harness configuration
- adev: `projects.json` + `.adev/` isolation + config priority (project > global)

---

## 10. Differences — Key Distinctions

### The Most Fundamental Difference: Methodology vs Implementation

```
Harness Engineering: "How should an agent harness be designed?" — Presents principles/patterns
adev: A complete system that implements HE principles + more in actual TypeScript code
```

### 12 Key Differences

| #   | Item                    | Harness Engineering (Methodology) | adev (Implementation)                            |
| --- | ----------------------- | --------------------------------- | ------------------------------------------------- |
| 1   | **Nature**              | Principles/discipline/methodology | Immediately executable software                   |
| 2   | **TDD spec**            | "Use TDD"                         | Layer1 auto-generates test type definitions        |
| 3   | **TDD implementation**  | Developer does it                 | tester agent runs via Bash                         |
| 4   | **CI**                  | "Use CI"                          | Up to 110,000 per feature + 1M final              |
| 5   | **Planning→dev handoff** | Not defined                      | Contract (HandoffPackage) + topological sort       |
| 6   | **Memory**              | Text file                         | LanceDB vector 4-table + RAG                       |
| 7   | **Dynamic context**     | Not defined                       | Real-time RAG search of failure history/design decisions |
| 8   | **Verification**        | 1-layer automated tests           | 4-layer (qa/qc → reviewer → Layer1 → adev)        |
| 9   | **Intent verification** | Not defined                       | Layer1 compares planning intent vs implementation  |
| 10  | **Bias detection**      | Not defined                       | bias-detector (confirmation bias/loops/deadlocks)  |
| 11  | **Token management**    | Unresolved                        | Rolling window + graceful completion + session restore |
| 12  | **Deliverables**        | Code only                         | Code + 8 docs + 4 business deliverables            |

### What adev Solves That HE Doesn't Address

```
① Planning phase (Layer1)
   HE: "Provide specifications" — who creates them and how is undefined
   adev: Generates the spec itself through conversation with user via Claude API

② Test spec automation
   HE: "Write tests" — which tests and how many is undefined
   adev: Auto-generates type definitions (12 categories, 80% random, target counts)

③ Token limit management
   Most practical problem for long-running agents — unresolved anywhere in HE
   adev: 5-hour rolling window, threshold-based response, session restoration

④ Continuous E2E (Layer3)
   HE: No mention of management after code completion
   adev: Continuous E2E every 5 min → bug → automatic Layer2 re-run

⑤ Business deliverables
   HE: Code only
   adev: Portfolio, business plan, investment proposal, PPTX presentation auto-generation
```

---

## 11. adev Strengths

### Strength 1: The Only Structure That Actually Enforces TDD

HE recommends TDD but actual compliance rates are low. adev **structurally enforces TDD with fixed tester → coder order**. The tester agent must write failing tests before the coder agent can begin coding.

### Strength 2: Verification of Planning Intent vs Implementation

A concept not in HE. In the 3rd step of 4-layer verification, **Layer1 (planner) directly verifies Layer2 (implementation result)**. "Was it implemented as I designed?" — Not just verifying tests pass, but confirming intent was implemented.

### Strength 3: Self-Improvement Through Failure Learning

`failure-store.ts` — Stores failure causes and solutions as vectors. On similar future situations, searches via RAG to alert agents. **The agent system makes fewer repeated mistakes the more it operates**.

### Strength 4: Dynamic Context — Surpassing HE

Anthropic's recommended progress.txt is static. adev **searches for relevant past decisions in real-time via LanceDB similarity search and injects them**. Agents receive only the most relevant context to current tasks, not the entire history.

### Strength 5: Coder×N Parallel + Git Isolation

Multiple coders develop one feature in parallel. Distributed by module, each working in independent Git branches. Merged in dependency graph order. **N× development speed + no file conflicts**.

### Strength 6: Automatic Token Limit Management

The most practical problem in long-running agent systems. No solution found anywhere in HE. adev enables **uninterrupted long-term development** with 5-hour rolling windows, threshold-based responses (20%, 5%), 1-hour wait loops, and `unstable_v2_resumeSession`.

### Strength 7: Confirmation Bias Detection

The most sophisticated implementation of HE's Correct principle. `bias-detector.ts` detects patterns where agents repeat wrong directions (confirmation bias, loops, deadlocks, scope creep). On detection: forced session termination + restart with new session.

### Strength 8: Fully Local Execution

No server required. LanceDB is embedded (file-based). No external services beyond Anthropic API. **Data fully preserved locally**. Installation is a single `curl one-liner` or `bun -g`.

---

## 12. adev Weaknesses / Areas for Improvement

### Weakness 1: Actual Target Project E2E Not Run (Critical)

**Current state**: 204,903 tests pass for adev itself (autonomous-dev-agent-ts), but the **full flow of adev autonomously developing a real target project (Layer1 conversation → Contract → Layer2 agent development → Layer3 deliverables) with real Claude API E2E has not been run**.

- Validated only in simulation (mock) form
- `adev init` + `adev start` → real Claude API call flow unverified
- **HE Verify perspective**: Core of verification is testing in "real environment". The most important thing is missing.

### Weakness 2: 7-Teammate Simultaneous PoC Incomplete

Spec §16: Only up to 5 confirmed, 7 simultaneous execution unverified.

- Actual upper limit of N in Coder×N parallel development uncertain
- HE Constrain perspective: Actual limits of constraints unclear

### Weakness 3: PPTX/DOCX Renderer Incomplete

- PPTX: Code comment "not implemented", HTML fallback in use
- DOCX: HTML fallback in use
- PDF: 3 test failures due to pdfkit not installed (immediately fixable with bun install)
- Layer3 business deliverables spec incomplete

### Weakness 4: Single AI Provider Dependency

Claude Agent SDK = Anthropic-only. No support for GPT, Gemini, or local LLMs.

- Entire system stops on API price increases or service outages
- HE trend suggests: "Harness should be model-independent"

### Weakness 5: tester Agent Test Code Quality Assurance Uncertain

- No quality validation of test code generated by tester agent itself
- Mechanism to detect "meaningless tests" (tests written to always pass) not implemented
- HE Verify perspective: Quality assurance of verification tools themselves needed

### Weakness 6: Tech Stack Dependency Opacity

Test commands run by tester agent via Bash depend on target project environment.

- If target project has unusual test environment (needs Docker, special DB, etc.), agent must resolve it alone
- Failure handling for this process insufficiently detailed in spec

### Weakness 7: Harness Itself Not Pluggable

MCP/Skill extension possible, but **Phase addition, agent addition, verification step customization not possible**.

- HE long-term direction: Harness itself should become an extensible platform
- Currently: 7 agents fixed, 4 Phases fixed

### Weakness 8: Tool Minimization Needs Review (Vercel Principle)

Vercel: Reducing tools by 80% improved success rate.

- Phase-level allowedTools restrictions exist, but whether tools provided to each agent are minimized needs re-examination
- Especially room for tool selection optimization in DESIGN Phase Agent Teams scenarios

---

## 13. Comprehensive Evaluation Matrix

### Based on HE's 4 Functions

| HE Function   | Subitem                 | adev Level | Notes                                         |
| ------------- | ----------------------- | ---------- | --------------------------------------------- |
| **Constrain** | Architecture boundaries | ★★★★★      | Unidirectional dependencies enforced          |
|               | Tool restrictions       | ★★★★☆      | Phase-level allowedTools — optimization room  |
|               | Role separation         | ★★★★★      | 7 agents strictly separated                   |
|               | File conflict prevention | ★★★★★     | Git branch module-level isolation             |
| **Inform**    | Planning spec automation | ★★★★★     | Contract + type definitions (not in HE)       |
|               | Role guidelines         | ★★★★★      | agent.md per-project generation               |
|               | Dynamic context         | ★★★★★      | LanceDB RAG (surpasses HE)                    |
|               | Progress tracking       | ★★★★☆      | session-snapshot — real-world validation needed |
| **Verify**    | TDD enforcement         | ★★★★★      | tester → coder order fixed                    |
|               | Test auto-generation    | ★★★★☆      | Type-def based — quality assurance needed     |
|               | CI role                 | ★★★★★      | Cascading + final 1M runs                     |
|               | Fail-Fast               | ★★★★★      | Strictly applied                              |
|               | Multi-layer verification | ★★★★★     | 4-layer (surpasses HE)                        |
|               | Intent verification     | ★★★★★      | Layer1 intent vs implementation (not in HE)   |
| **Correct**   | Feedback loops          | ★★★★★      | failure-handler + Phase return                |
|               | Root cause analysis     | ★★★★★      | qc dedicated (focus on 1)                     |
|               | Failure learning        | ★★★★★      | failure-store RAG (not in HE)                 |
|               | Session restoration     | ★★★★☆      | Real E2E validation needed                    |

### adev Position Summary

```
Harness Engineering (Methodology Principles)
  ↑ Referenced as implementation
  adev
    ✅ All 4 HE functions implemented
    ✅ Surpasses HE in multiple areas:
         - LanceDB RAG dynamic context
         - Failure learning (failure-store)
         - 4-layer verification + intent verification
         - Confirmation bias detection
         - Token management
         - Contract-based handoff
    ⚠️ Incomplete/Unverified:
         - Real E2E flow (most important)
         - PPTX/DOCX renderers
         - 7-agent simultaneous PoC
    ❌ Missing:
         - Extensibility beyond single AI provider
         - Harness itself as a pluggable platform
```

---

_Analysis date: 2026-03-13_
_Sources: OpenAI Harness Engineering (2026-02) / Anthropic Engineering Blog / martinfowler.com Birgitta Böckeler / LangChain DeepAgents / adev-spec-full-v2_4.md / docs/references/_
