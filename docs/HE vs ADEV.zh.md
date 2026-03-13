# Harness Engineering vs adev — 深度对比分析

> 🌐 **语言选择**: [한국어](HE%20vs%20ADEV.md) | [English](HE%20vs%20ADEV.en.md) | [日本語](HE%20vs%20ADEV.ja.md) | **中文**

> **撰写日期**: 2026-03-13
> **adev 基准**: v2.4 规格确认 + 实现状态（201个文件，约32,681行）
> **Harness Engineering 基准**: OpenAI（2026-02 正式确立）、Anthropic Engineering Blog、Martin Fowler、LangChain DeepAgents

---

## 目录

1. [Harness Engineering 定义](#1-harness-engineering-定义)
2. [adev 架构 — 准确理解](#2-adev-架构--准确理解)
3. [核心公式对比](#3-核心公式对比)
4. [Harness Engineering 四大功能对照分析](#4-harness-engineering-四大功能对照分析)
5. [TDD / CI 实现方式对比](#5-tdd--ci-实现方式对比)
6. [智能体编排对比](#6-智能体编排对比)
7. [上下文与内存对比](#7-上下文与内存对比)
8. [会话连续性对比](#8-会话连续性对比)
9. [相同点](#9-相同点)
10. [不同点 — 核心差异](#10-不同点--核心差异)
11. [adev 的优势](#11-adev-的优势)
12. [adev 的弱点 / 待改进事项](#12-adev-的弱点--待改进事项)
13. [综合评估矩阵](#13-综合评估矩阵)

---

## 1. Harness Engineering 定义

### 概述

**Harness Engineering** 是一种**环境设计规律（discipline）**，旨在将 AI 智能体可靠地应用于实际工作中。

> "马（AI 模型）虽然强大，但不知方向。缰绳（Harness）将其力量引导至正确方向。"

### 核心公式

```
智能体 = 模型（Model）+ 缰绳（Harness）
```

| 主体   | 职责                              |
| ------ | --------------------------------- |
| 模型   | 智能 — 代码编写、分析、判断        |
| 缰绳   | 方向 — 约束、上下文、验证、纠错    |

### 出现背景（2026年）

| 时间    | 事件                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------ |
| 2025年  | AI 智能体能力验证年                                                                               |
| 2026-02 | **OpenAI**: 利用 Codex + Harness 无人生成100万行生产代码，正式确立"Harness Engineering"术语      |
| 2026年  | 行业共识：**"难的不是智能体本身，而是缰绳"**                                                     |

### 智能体失败的真正原因（Harness Engineering 的出发点）

不是模型能力不足，而是**编排环境问题**：

- 经过太多步骤后迷失方向
- 重复失败的方法
- 会话中断时上下文丢失
- 无法追踪目标

> Vercel 教训：将智能体工具**减少80%后，成功率反而提升**。

### Martin Fowler 的四大功能

```
① Constrain  — 限制智能体能做什么
               （架构边界、允许工具、代码风格规则）

② Inform     — 告知智能体要做什么
               （规格说明、角色指南、架构文档、Context Engineering）

③ Verify     — 确认智能体是否正确完成
               （自动化测试、类型检查、代码检查器、代码审查）

④ Correct    — 出错时进行纠正
               （反馈循环、自我修复、跨会话进度日志）
```

### Anthropic 的双智能体缰绳（HE 最小实现参考）

```
[初始化智能体] — 只运行一次
  git init / 初始化脚本 / 功能列表 / 创建 claude-progress.txt

[编码智能体] — 每个会话重复
  读取 claude-progress.txt → 确认当前位置 → 实现1个功能
  → 运行测试 → 提交 → 更新进度日志 → 结束会话
  → 在下一个会话中继续
```

---

## 2. adev 架构 — 准确理解

### adev 是什么

```
adev = AI 自主开发系统
      将"想法 → 生产代码 + 文档 + 商业成果物"全程自动化
```

### ⚠️ 核心区分 — bun vs Claude Agent SDK

理解 adev 最重要的区分：

```
┌─────────────────────────────────────────────────────────────────┐
│  bun（TypeScript 运行时）                                         │
│  职责: 运行 adev 自身进程（缰绳）的运行时                        │
│  负责: adev 编排器代码的执行                                      │
│  对象: adev 自身（autonomous-dev-agent-ts 代码库）                │
├─────────────────────────────────────────────────────────────────┤
│  Claude Agent SDK V2（unstable_v2_createSession / prompt）        │
│  职责: 生成实际开发智能体的 SDK                                   │
│  负责: 目标项目的代码编写、测试生成/执行、文档编写               │
│  对象: 用户想要构建的项目（target project）                       │
└─────────────────────────────────────────────────────────────────┘
```

也就是说：

- **bun test / bunx tsc / bunx biome** → adev 自身的代码质量管理（adev 开发基础设施）
- **Claude Agent SDK 智能体** → 目标项目的代码编写、测试、CI 执行

### 三层架构全貌

```
┌──────────────────────────────────────────────────────────────────┐
│ 第1层: Claude API（Opus 4.6）— 对话界面                           │
│                                                                    │
│  用户 ↔ Claude API 对话：                                         │
│    构思创意 → 规划 → 设计 → 技术栈 → 文档清单                     │
│    → 测试用例类型定义书生成（非实际代码，是规则/类别）             │
│    → 用户"确认"→ 生成 Contract（HandoffPackage）                  │
│    → 结构验证 + 一致性验证 → 用户确认 → 第2层开始                 │
│                                                                    │
│  输出: 规划书、设计书、规格确认版、Contract、测试类型定义书        │
├──────────────────────────────────────────────────────────────────┤
│  adev（TypeScript/Bun 进程）= 团队领导 = 缰绳                     │
│  ↓ 调用 Claude Agent SDK V2                                       │
├──────────────────────────────────────────────────────────────────┤
│ 第2层: Claude Agent SDK V2 — 自主开发（目标项目开发）             │
│                                                                    │
│  第2层-A: 功能单元开发循环                                        │
│    Phase FSM: DESIGN → CODE → TEST → VERIFY                       │
│    7个智能体（Claude 实例）：                                     │
│      architect: 设计、模块结构决策（禁止编码）                    │
│      qa: 编码前规格验证关卡（禁止编码）                           │
│      coder×N: 实际代码编写（唯一编码权限，Git 分支隔离）          │
│      tester: 测试代码生成 + Bash 执行（目标栈基准）               │
│      qc: 失败根本原因分析（禁止编码）                             │
│      reviewer: 代码审查（禁止编码）                               │
│      documenter: 事件触发 → spawn → 生成文档 → 结束               │
│                                                                    │
│  第2层-B: 集成验证                                                │
│    级联 Fail-Fast: Step1（E2E 10万）→ Step2（1万）→ Step3（1千）  │
│    → Step4（集成 100万）— 反复直到0 bug                          │
│                                                                    │
│  第2层-C: 用户确认检查点                                          │
│    交付成果物 + 测试结果报告 → 用户批准 → 第3层                   │
├──────────────────────────────────────────────────────────────────┤
│ 第3层: 成果物 + 持续 E2E                                          │
│    集成文档8种 + 商业成果物4种                                     │
│    5分钟间隔持续 E2E → 发现 bug → 重新执行第2层                   │
└──────────────────────────────────────────────────────────────────┘
```

### 开发流程核心

```
[第1层 — Claude API]
  生成给 tester 智能体的"测试用例类型定义书"：
  → 定义12种类别，各类别的规则/模式/边界值，100-200个样例，
    random 80%+ 比例规则
  → 不编写实际测试代码（仅规格说明）

[第2层 — Claude Agent SDK]
  tester 智能体：
  → 读取类型定义书 → 了解目标项目技术栈
  → 根据定义书规则直接编写测试代码（Write 工具）
  → 通过 Bash 工具执行（目标项目的测试框架）
  → Jest? pytest? go test? → 第1层规格决定的技术栈原样使用

  TDD 循环：
  → tester 先编写 failing 测试
  → coder 实现使其通过
  → 1个失败 → 立即停止 → qc 根本原因 → coder 修复 → 从头开始

  CI 职责：
  → 功能完成后进行集成 E2E（级联 Fail-Fast）
  → 验证新功能是否破坏现有功能（回归测试）
```

---

## 3. 核心公式对比

### Harness Engineering 公式

```
智能体 = 模型 + 缰绳
缰绳 = Constrain + Inform + Verify + Correct
```

### adev 公式

```
adev = 缰绳（TypeScript/Bun 编排器）
     + Claude Agent SDK 智能体群（模型）

adev 缰绳：
  Constrain:
    - 单向模块依赖关系（layer-dependencies.md）
    - allowedTools 列表（各智能体工具限制）
    - 各智能体编码权限分离（仅 coder 可编码）
    - Git 分支隔离（防止 Coder×N 文件冲突）
    - 固定7个智能体（禁止添加/修改）
    - settingSources: []（消除文件系统配置依赖）

  Inform:
    - 第1层 Contract（HandoffPackage）: 规划意图 → 开发规格
    - 7个 agent.md: 各智能体角色指南（按项目规格自动生成）
    - SKILL.md: 领域知识注入
    - LanceDB RAG: 设计决策历史、失败历史实时检索注入
    - 测试用例类型定义书: tester 智能体行为标准

  Verify:
    - tester: 目标项目测试代码生成 + 执行（Bash 工具）
    - Fail-Fast: 1个失败 → 立即停止（从头重新执行）
    - 四重验证: qa/qc → reviewer → 第1层意图 → adev 综合
    - Haiku → Sonnet → Opus 自动升级

  Correct:
    - qc: 仅聚焦分析1个根本原因 → 指示 coder 修复
    - failure-handler: 失败类型分类 → 返回适当 Phase
    - bias-detector: 确认偏见/循环/死锁/范围扩大检测 → 重启会话
    - session-restore-orchestrator: Token 耗尽后基于 LanceDB 恢复
    - bug-escalator: 第3层 bug → 重新执行第2层全循环
```

---

## 4. Harness Engineering 四大功能对照分析

### ① Constrain — 约束

| HE 原则              | adev 实现文件               | 内容                                             | 评估 |
| -------------------- | --------------------------- | ------------------------------------------------ | ---- |
| 架构边界设置         | `layer-dependencies.md`     | 单向依赖性 + 禁止循环                            | ✅   |
| 允许工具限制         | `v2-session-factory.ts`     | Phase级、智能体级 `allowedTools` 明确指定        | ✅   |
| 代码风格强制         | `agent.md`（coder 指南）    | 目标项目约定 — 由规格决定                        | ✅   |
| 禁止角色混用         | `AGENT-ROLES.md`            | 仅 coder 编码，仅 tester 测试，qc 仅分析         | ✅   |
| 文件冲突防止         | `coder-allocator.ts`        | 禁止 Coder×N 间编辑同一文件                      | ✅   |
| 固定智能体数量       | 规格 §7                     | 固定7个（禁止添加/修改）                         | ✅   |
| 消除环境依赖         | `v2-session-factory.ts`     | `settingSources: []`                             | ✅   |
| **Vercel 原则**      | Phase 级 allowedTools       | 仅角色所需工具，排除不必要工具                   | ✅   |

### ② Inform — 信息提供

| HE 原则          | adev 实现                                          | 内容                                                                     | 评估           |
| ---------------- | -------------------------------------------------- | ------------------------------------------------------------------------ | -------------- |
| 提供规格         | `contract-builder.ts`                              | Contract（HandoffPackage）— Kahn 拓扑排序、验证矩阵                      | ✅             |
| 角色指南         | `agent-md-generator.ts`                            | 7个 agent.md — 按项目规格自动生成                                        | ✅             |
| 领域知识         | `skill-merger.ts`                                  | SKILL.md 全局 + 项目合并注入                                             | ✅             |
| 编码约定         | 第1层规格决定                                      | 在目标项目规格中定义的约定 → 反映到 agent.md                             | ✅             |
| 进度日志         | `progress-tracker.ts`、`session-snapshot-store.ts` | 功能级/Phase 级进度追踪                                                  | ✅             |
| 动态上下文       | `src/rag/` LanceDB RAG                             | 类似设计决策、失败历史实时检索 → 动态注入智能体提示词                    | ✅（超越 HE）  |
| 测试行为标准     | `test-type-designer.ts`                            | 测试类型定义书（12种类别，random 80%）→ 传递给 tester 智能体             | ✅（HE 无此）  |
| 交接规格         | `handoff-receiver.ts`                              | 第1层 → 第2层 Contract 接收 + 结构/一致性验证                            | ✅（HE 无此）  |

### ③ Verify — 验证

| HE 原则               | adev 实现                    | 内容                                                   | 评估           |
| --------------------- | ---------------------------- | ------------------------------------------------------ | -------------- |
| 自动化测试            | tester 智能体                | **目标项目测试代码生成 + Bash 执行**                   | ✅             |
| TDD                   | tester → coder 顺序          | 先写 failing 测试，coder 实现使其通过                  | ✅             |
| CI 职责               | 集成 E2E 级联式              | 功能完成后确认现有功能的回归                           | ✅             |
| Fail-Fast             | `integration-tester.ts`      | 1个失败 → 立即停止，从头开始                           | ✅（严格执行） |
| 类型安全              | coder 智能体指南             | 目标项目类型检查 — 规格决定技术栈基准                  | ✅             |
| 代码审查              | reviewer 智能体              | 独立会话中判断代码质量                                 | ✅             |
| **四重验证**          | `verification-gate.ts`       | qa/qc → reviewer → 第1层意图 → adev 综合               | ✅（超越 HE）  |
| **意图验证**          | `layer1-verifier.ts`         | "是否按我的意图实现了？"（第1层 Claude API）            | ✅（HE 无此）  |
| **偏见检测**          | `bias-detector.ts`           | 检测确认偏见/循环/死锁/范围扩大                        | ✅（HE 无此）  |
| **验证升级**          | `verification-escalator.ts`  | Haiku → Sonnet → Opus 自动升级                         | ✅（HE 无此）  |

### ④ Correct — 纠正

| HE 原则          | adev 实现                         | 内容                                             | 评估           |
| ---------------- | --------------------------------- | ------------------------------------------------ | -------------- |
| 反馈循环         | `team-leader-phase.ts`            | 失败 → 类型分类 → 返回适当 Phase                 | ✅             |
| 自我修复         | `failure-handler.ts`              | 按失败类型自动决定恢复策略                       | ✅             |
| 跨会话连续性     | `session-restore-orchestrator.ts` | `unstable_v2_resumeSession` + LanceDB 向量恢复   | ✅             |
| **根本原因聚焦** | qc 智能体                         | 仅聚焦分析1个（禁止多项分析 → 保证 Fail-Fast）   | ✅（具体化 HE）|
| **模式记忆**     | `failure-store.ts`                | 存储失败向量 → RAG 注入防止复发                  | ✅（HE 无此）  |
| **Bug 升级**     | `bug-escalator.ts`                | 第3层 bug → 重新执行第2层全循环                  | ✅（HE 无此）  |

---

## 5. TDD / CI 实现方式对比

### Harness Engineering 的 TDD/CI 推荐方式

```
TDD: 先写 failing 测试 → 实现使其通过 → 重构
CI: 提交时自动运行测试 → 失败时阻断合并
```

Harness Engineering 推荐"使用 TDD 和 CI"，但**具体实现方法由各团队决定**。

### adev 的 TDD/CI — 完整流程

```
[第1层 — 测试类型定义书生成（非实际代码）]

  第1层 Claude API 生成：
  - 12种测试类别（正常/边界值/异常/并发/大容量/异常终止等）
  - 各类别的规则/模式/边界值/输入范围
  - 100-200个样例
  - random 比例 80%+ 规则
  - 目标数量: Unit 1万 / Module 1万 / E2E 10万+（可配置）
  - 包含在 Contract 中 → 传递给第2层 tester 智能体

[第2层 — tester 智能体生成 + 执行实际测试代码]

  tester 智能体（Claude Agent SDK V2 实例）：
    ① 读取类型定义书 → 了解目标项目技术栈
       （Python → pytest，TypeScript → Jest/Vitest，Go → go test 等）
    ② 根据定义书规则直接编写测试代码（Write 工具）
       - Unit 测试: 函数/方法级别
       - Module 测试: 模块间集成
       - E2E 测试: 实际用户场景全生命周期
    ③ 通过 Bash 工具执行：
       `pytest tests/` 或 `jest` 或 `bun test` — 规格决定技术栈
    ④ Fail-Fast: 1个失败 → 立即停止 → 报告给 qc

[TDD 循环]
  tester: 编写 failing 测试
  coder: 实现使其通过（目标模块 Git 分支）
  tester: 重新执行 → 确认通过
  → Unit 全部通过 → 开始 Module → Module 通过 → 开始 E2E

[CI 职责 — 集成 E2E 级联式（第2层-B）]
  全部功能开发完成后：
  Step1: 修改功能 E2E 10万+（功能完整性确认）
  Step2: 相关功能 E2E 1万（回归: 其他功能是否被破坏）
  Step3: 非相关功能 E2E 1千（冒烟: 整体系统影响）
  Step4: 集成最终 E2E 100万次（生产环境模拟）
  各 Step 失败 → 立即停止 → 重新执行第2层-A 全循环（从 architect 开始）
```

| 项目          | HE 推荐                     | adev 实现                                         |
| ------------- | --------------------------- | ------------------------------------------------- |
| 测试规格生成  | 开发者手动完成              | **第1层 Claude API 自动生成类型定义书**           |
| 测试代码生成  | 开发者手动完成              | **tester 智能体基于类型定义书自动生成**           |
| 测试执行      | CI 工具（Jenkins 等）       | **tester 智能体通过 Bash 工具直接执行**           |
| 测试框架      | 团队决定                    | **第1层规格决定的技术栈原样使用**                 |
| TDD 顺序      | 推荐（实际遵循率低）        | **强制（tester → coder 顺序固定）**               |
| 失败处理      | 开发者分析                  | **qc 智能体自动根本原因分析**                     |
| CI 规模       | 每次提交的测试              | **每个功能 Unit 1万 + Module 1万 + E2E 10万**     |
| 集成验证规模  | 部署流水线                  | **级联式最终 100万次**                            |
| 回归测试      | CI 流水线                   | **Step2（相关功能1万）+ Step3（非相关1千）自动**  |

---

## 6. 智能体编排对比

### Anthropic HE 推荐: 双智能体线性结构

```
Initializer → [Coding Agent × 功能数量] 顺序
每个会话1个功能，通过 progress.txt 传递状态
```

### LangChain DeepAgents: 分层结构

```
Main Agent
  └─ Sub-agents（按需动态创建）
     Filesystem / Planning / Memory / Code Exec
```

### adev: Phase FSM + 角色分离 + 并行开发

```
adev（TypeScript/Bun）= 团队领导 = 编排器
  │
  ├─ DESIGN Phase [Agent Teams 启用]
  │    session.stream() + CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
  │    → 主智能体 TeamCreate → 将 architect、qa、coder、reviewer spawn 为队友
  │    → 通过 SendMessage 进行团队讨论（设计决策）
  │    → qa 关卡通过 + 全员共识 → 进入 CODE Phase
  │    → 结束时触发 documenter（生成设计文档）
  │
  ├─ CODE Phase [无 Agent Teams，并行独立执行]
  │    unstable_v2_prompt() × N（Promise.allSettled）
  │    → coder1: feature/功能名-模块A-coder1 分支
  │    → coder2: feature/功能名-模块B-coder2 分支
  │    → coderN: feature/功能名-模块N-coderN 分支
  │    architect + reviewer: 独立会话中监督（禁止编码）
  │    → adev 按依赖关系图顺序合并
  │    → 完成时触发 documenter（更新 CHANGELOG）
  │
  ├─ TEST Phase [Fail-Fast 顺序执行]
  │    unstable_v2_prompt() 顺序执行
  │    → tester: 基于类型定义书生成测试代码（Write 工具）
  │               通过 Bash 工具执行目标项目测试
  │               Unit 1万 → （失败立即停止）→ Module 1万 → E2E 10万
  │    → qc: 失败时分析1个根本原因
  │    → coder: 仅修复该 bug（Fail-Fast: 仅1个）
  │    → tester: 从该阶段头部重新执行
  │    → 完成/失败时触发 documenter（测试结果报告）
  │
  └─ VERIFY Phase [四重验证顺序执行]
       unstable_v2_prompt() 顺序
       ① qa/qc: 规格合规 + 测试通过验证
       ② reviewer: 代码质量 + 模式合规
       ③ 第1层 Claude API: "是否按我的意图实现了？"
       ④ adev: 综合以上3项 + 确认偏见检查
       失败 → 根据类型返回 DESIGN/CODE/TEST
```

| 项目          | Anthropic 双智能体 | LangChain DeepAgents | adev                                      |
| ------------- | ------------------ | -------------------- | ----------------------------------------- |
| 智能体数量    | 2个                | 可变                 | 固定7个                                   |
| 结构          | 线性顺序           | 分层型               | Phase FSM                                 |
| 并行开发      | 无                 | 部分                 | Coder×N Promise.allSettled                |
| Git 隔离      | 无                 | 无                   | feature 分支 + 依赖顺序合并               |
| 团队讨论      | 无                 | 无                   | DESIGN Phase Agent Teams                  |
| 偏见检测      | 无                 | 无                   | bias-detector（循环/死锁/确认偏见）       |
| 意图验证      | 无                 | 无                   | 第1层对比规划意图 vs 实现                 |
| 监控方式      | 无                 | 无                   | Hook（PreToolUse/PostToolUse）+ IPC 轮询  |

---

## 7. 上下文与内存对比

### Anthropic HE: claude-progress.txt

```
[已完成] feature-1: 用户认证
[进行中] feature-2: 商品列表（50%）
[未完成] feature-3: 支付
```

- 优点: 简单，人类也可读
- 局限: 文本解析、无类型、无法搜索历史模式、浪费 Token

### adev: LanceDB 4张表 + RAG

| 表                  | 存储内容                     | 使用时机                               |
| ------------------- | ---------------------------- | -------------------------------------- |
| `memory`            | 用户对话历史、反馈、决策     | 下次对话上下文                         |
| `code_index`        | 目标项目代码向量             | 代码搜索、防止重复                     |
| `design_decisions`  | "为什么这样设计"历史         | 维护一致性、防止重新审视相同决策       |
| `failures`          | 失败原因 + 解决方案向量      | 防止复发 — 类似情况 RAG 警报           |
| `session_snapshots` | 会话状态（规格外追加）       | Token 耗尽后准确恢复                   |

**动态上下文注入流程**：

```
智能体开始工作
  → 将当前上下文向量化
  → LanceDB 相似度搜索：
      在 design_decisions 中搜索类似的设计决策
      在 failures 中搜索类似的失败历史
      在 code_index 中搜索相关代码
  → 将搜索结果动态注入智能体提示词
  → 智能体参考过去的学习模式做出更好的决策
```

| 项目           | HE progress.txt  | adev LanceDB                            |
| -------------- | ---------------- | --------------------------------------- |
| 存储格式       | 文本             | 向量数据库（类型安全）                  |
| 历史模式搜索   | 不可能           | 相似度搜索（基于语义）                  |
| 防止失败复发   | 无               | failure-store → RAG 警报                |
| 设计一致性     | 无               | design-decision-store → 参考历史决策    |
| Token 效率     | 加载整个文件     | 仅搜索相关项目注入                      |
| 持久性         | 文件（可能丢失） | 嵌入式数据库（结构化持久）              |

---

## 8. 会话连续性对比

### HE 的核心问题: "会话中断时所有上下文丢失"

Anthropic 的解决方案：

```
每个 Coding Agent 会话开始时：
  1. 读取 claude-progress.txt → 确认当前位置
  2. 仅实现1个功能
  3. 完成 → 更新日志 → 结束会话
  4. 在下一个会话中重复相同过程
```

### adev 的会话连续性策略

```
[达到 Token 上限时 — token-monitor.ts]
  剩余 20% → 抑制新会话 spawn（仅完成进行中的任务）
  剩余 5%  → 优雅完成模式（禁止开始新任务）
  Token 耗尽 → token-wait-loop.ts: 每1分钟检查，最多等待1小时

[会话恢复 — session-restore-orchestrator.ts]
  1. 从 session-snapshot-store 加载最后快照
  2. 尝试 unstable_v2_resumeSession(sessionId)
  3. 恢复失败时: 新会话 + LanceDB 向量上下文重建
  4. 从中断点准确恢复

[会话 ID 体系]
  {projectId}:{featureId}:{agentName}:{phase}
  例: "proj-001:feat-auth:architect:DESIGN"
  → 追踪哪个项目的哪个功能的哪个智能体处于哪个 Phase
```

---

## 9. 相同点

### 1. 核心哲学: "缰绳比模型更难"

- HE: 智能体失败是编排环境问题，而非模型能力不足
- adev: 201个文件、32,681行中的大部分都是缰绳（编排）代码

### 2. 跨会话上下文连续性必不可少

- HE（Anthropic）: `claude-progress.txt` 进行会话交接
- adev: `session-snapshot-store` + LanceDB + `unstable_v2_resumeSession`

### 3. 约束比自由产生更好的结果

- HE（Vercel）: 减少80%工具后成功率提升
- adev: 按角色分离编码权限、Phase 级 allowedTools 限制、固定7个智能体

### 4. TDD + Fail-Fast 必不可少

- HE: 将 TDD 和快速反馈循环作为核心推荐
- adev: 强制 tester → coder 顺序，1个失败 → 立即停止，从头重新执行（严格执行）

### 5. 基于 Git 的工作单元

- HE（Anthropic）: 1个功能 → 提交 → 结束会话
- adev: 1个功能 → feature/{功能}-{模块}-coderN 分支 → 依赖顺序合并

### 6. 规格是智能体行为的标准

- HE: "为智能体提供明确的规格说明"
- adev: Contract（HandoffPackage）— 包含功能列表、验收条件、输入输出类型、测试类型定义书

### 7. 角色分离

- HE（LangChain）: Main agent + Sub-agents 角色分离
- adev: 7个智能体严格角色分离（绝对禁止混用）

### 8. 上下文工程

- HE: 提供正确的上下文 = 智能体性能的核心
- adev: agent.md（角色指南）+ SKILL.md（领域知识）+ LanceDB RAG（动态）

### 9. 自我修复（Self-repair）

- HE: 失败 → 根本原因分析 → 重试
- adev: qc（聚焦1个根本原因）+ failure-handler（按类型返回 Phase）

### 10. 多项目隔离

- HE: 推荐按项目配置缰绳
- adev: `projects.json` + `.adev/` 隔离 + 配置优先级（项目 > 全局）

---

## 10. 不同点 — 核心差异

### 最根本的区别: 方法论 vs 实现体

```
Harness Engineering:   "智能体缰绳应该如何设计" — 提供原则/模式
adev: 用实际 TypeScript 代码实现了 HE 原则及其以上的完整系统
```

### 12个主要差异

| #   | 项目               | Harness Engineering（方法论）  | adev（实现体）                               |
| --- | ------------------ | ------------------------------ | -------------------------------------------- |
| 1   | **性质**           | 原则/规律/方法论               | 可立即执行的软件                             |
| 2   | **TDD 规格**       | "使用 TDD"                     | 第1层自动生成测试类型定义书                  |
| 3   | **TDD 实现**       | 开发者手动完成                 | tester 智能体通过 Bash 执行                  |
| 4   | **CI**             | "使用 CI"                      | 每个功能最多110,000次 + 最终100万次           |
| 5   | **规划→开发交接**  | 未定义                         | Contract（HandoffPackage）+ 拓扑排序          |
| 6   | **内存**           | 文本文件                       | LanceDB 向量4张表 + RAG                       |
| 7   | **动态上下文**     | 未定义                         | 失败历史/设计决策实时 RAG 搜索               |
| 8   | **验证**           | 自动化测试1阶段                | 四重验证（qa/qc → reviewer → 第1层 → adev）  |
| 9   | **意图验证**       | 未定义                         | 第1层对比规划意图 vs 实现                    |
| 10  | **偏见检测**       | 未定义                         | bias-detector（确认偏见/循环/死锁）          |
| 11  | **Token 管理**     | 未解决                         | 滚动窗口 + 优雅完成 + 会话恢复               |
| 12  | **成果物**         | 仅代码                         | 代码 + 8种文档 + 4种商业成果物               |

---

## 11. adev 的优势

### 优势1: 唯一真正强制执行 TDD 的结构

HE 推荐 TDD，但实际遵循率很低。adev 通过**固定 tester → coder 顺序**从结构上强制执行 TDD。tester 智能体必须先编写 failing 测试，coder 智能体才能开始编码。

### 优势2: 验证规划意图与实现的一致性

HE 中没有的概念。在四重验证的第3步，**第1层（规划者）直接验证第2层（实现结果）**。"是否按我设计的方式实现了？" — 不仅仅是验证测试通过，而是确认意图得到了实现。

### 优势3: 通过失败学习自我改进

`failure-store.ts` — 将失败原因和解决方案存储为向量。在未来类似情况中通过 RAG 搜索向智能体发出警报。**智能体系统运行时间越长，重复相同错误越少**。

### 优势4: 动态上下文 — 超越 HE

Anthropic 推荐的 progress.txt 是静态的。adev 通过**LanceDB 相似度搜索实时检索相关历史决策并注入**。智能体不是接收整个历史记录，而是只接收与当前工作最相关的上下文。

### 优势5: Coder×N 并行 + Git 隔离

一个功能由多个 coder 并行开发。按模块分配，各自在独立的 Git 分支中工作。按依赖关系图顺序合并。**开发速度 N倍 + 零文件冲突**。

### 优势6: 自动 Token 上限管理

长期运行智能体系统中最实际的问题。HE 中找不到任何解决方案。adev 通过5小时滚动窗口、阈值响应（20%、5%）、1小时等待循环、`unstable_v2_resumeSession` 实现**不中断的长期开发**。

### 优势7: 确认偏见检测

HE Correct 原则最精细的实现部分。`bias-detector.ts` 检测智能体重复错误方向的模式（确认偏见、循环、死锁、范围扩大）。检测到时强制终止会话 + 用新会话重启。

### 优势8: 完全本地执行

无需服务器。LanceDB 是嵌入式（基于文件）。除 Anthropic API 外无外部服务。**数据完整保存在本地**。安装只需一条 `curl` 命令或 `bun -g`。

---

## 12. adev 的弱点 / 待改进事项

### 弱点1: 目标项目实际 E2E 验证未执行（致命）

**当前状态**: adev 自身（autonomous-dev-agent-ts）的204,903个测试通过，但 adev 自主开发实际目标项目的完整流程（第1层对话 → Contract → 第2层智能体开发 → 第3层成果物）的**实际 Claude API 集成 E2E 未执行**。

- 仅以模拟（mock）形式验证
- `adev init` + `adev start` → 实际 Claude API 调用流程未验证
- **HE Verify 观点**: 验证的核心是在"真实环境"中的验证。最重要的部分缺失。

### 弱点2: 7个队友同时 PoC 未完成

规格 §16: 只确认了5个，7个同时执行未验证。

- Coder×N 并行开发中 N 的实际上限不确定
- HE Constrain 观点: 约束的实际限制不明确

### 弱点3: PPTX/DOCX 渲染器未完成

- PPTX: 代码注释"未实现"，HTML 回退中
- DOCX: HTML 回退中
- PDF: 因 pdfkit 未安装导致3个测试失败（执行 bun install 可立即解决）
- 第3层商业成果物规格未完成

### 弱点4: 单一 AI 提供商依赖

Claude Agent SDK = 仅 Anthropic。不支持 GPT、Gemini、本地 LLM。

- API 涨价、服务中断时整个系统停止
- HE 趋势表明："缰绳应该独立于模型"

### 弱点5: tester 智能体测试代码质量保证不确定

- tester 智能体生成的测试代码本身的质量验证缺失
- 检测"无意义测试"（被编写为始终通过的测试）的机制未实现
- HE Verify 观点: 需要对验证工具本身进行质量保证

### 弱点6: 技术栈依赖不透明

tester 智能体通过 Bash 执行的测试命令依赖于目标项目环境。

- 如果目标项目具有特殊测试环境（需要 Docker、特殊数据库等），智能体需要自行解决
- 此过程的失败处理机制在规格中定义不够详细

### 弱点7: 缰绳本身不支持插件化

MCP/Skill 扩展可能，但**Phase 添加、智能体添加、验证步骤自定义不可能**。

- HE 长期方向: 缰绳本身应成为可扩展平台
- 当前: 7个智能体固定，4个 Phase 固定

### 弱点8: 需要重新审视工具最小化（Vercel 原则）

Vercel: 减少80%工具后成功率提升。

- 目前存在 Phase 级 allowedTools 限制，但需要重新检查提供给各智能体的工具是否已最小化
- 特别是 DESIGN Phase 中 Agent Teams 情况下工具选择优化空间

---

## 13. 综合评估矩阵

### 基于 HE 四大功能

| HE 功能       | 细项           | adev 实现水平 | 备注                                     |
| ------------- | -------------- | ------------- | ---------------------------------------- |
| **Constrain** | 架构边界       | ★★★★★         | 强制单向依赖性                           |
|               | 允许工具限制   | ★★★★☆         | Phase 级 allowedTools — 仍有优化空间     |
|               | 角色分离       | ★★★★★         | 7个智能体严格分离                        |
|               | 文件冲突防止   | ★★★★★         | Git 分支模块级隔离                       |
| **Inform**    | 规划规格自动化 | ★★★★★         | Contract + 类型定义书（HE 无此）         |
|               | 角色指南       | ★★★★★         | agent.md 按项目生成                      |
|               | 动态上下文     | ★★★★★         | LanceDB RAG（超越 HE）                   |
|               | 进度追踪       | ★★★★☆         | session-snapshot — 需要实际验证          |
| **Verify**    | TDD 强制       | ★★★★★         | tester → coder 顺序固定                  |
|               | 测试自动生成   | ★★★★☆         | 基于类型定义书 — 需要质量保证            |
|               | CI 职责        | ★★★★★         | 级联式 + 最终100万次                     |
|               | Fail-Fast      | ★★★★★         | 严格执行                                 |
|               | 多层验证       | ★★★★★         | 四重验证（超越 HE）                      |
|               | 意图验证       | ★★★★★         | 第1层意图 vs 实现（HE 无此）             |
| **Correct**   | 反馈循环       | ★★★★★         | failure-handler + Phase 返回             |
|               | 根本原因分析   | ★★★★★         | qc 专任（聚焦1个）                       |
|               | 失败学习       | ★★★★★         | failure-store RAG（HE 无此）             |
|               | 会话恢复       | ★★★★☆         | 需要实际 E2E 验证                        |

### adev 定位总结

```
Harness Engineering（方法论原则）
  ↑ 作为实现体参考
  adev
    ✅ 全部实现 HE 四大功能
    ✅ 在多个领域超越 HE：
         - LanceDB RAG 动态上下文
         - 失败学习（failure-store）
         - 四重验证 + 意图验证
         - 确认偏见检测
         - Token 管理
         - 基于 Contract 的交接
    ⚠️ 未完成/未验证：
         - 实际 E2E 流程（最重要）
         - PPTX/DOCX 渲染器
         - 7个智能体同时 PoC
    ❌ 缺少的内容：
         - 超越单一 AI 提供商的扩展性
         - 缰绳本身的插件化
```

---

_分析基准日: 2026-03-13_
_参考来源: OpenAI Harness Engineering (2026-02) / Anthropic Engineering Blog / martinfowler.com Birgitta Böckeler / LangChain DeepAgents / adev-spec-full-v2_4.md / docs/references/_
