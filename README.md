# Dev Flow · 专家开发团队

Dev Flow 是一套面向前端开发任务的风险自适应流水线。默认走 Fast UI：一份简版方案、一次用户确认、直接实现和定向验证。只有出现真实风险增量时才升级治理或调用额外 Agent，避免文档、交接和重复审查挤占开发时间。

## 核心原则

- 默认治理深度是 `fast`，不是所有任务强制 Fast。
- `standard` 是 Fast 的风险增量，不是一套固定重流程。
- Fast 与 Standard 默认只维护一份 `PLAN.md`。
- 工作包内局部复用、本地确定性 Promise、只读 Mock 和普通 UI 状态不触发升级。
- `Reviewer` 是条件节点，不再是每个工作包的固定尾节点。
- test、lint、typecheck、build 等真实验证不因精简治理而取消。
- Fast/Standard 按视觉簇读取设计，只补充会实现或修改的部分，不递归提取所有可见子节点。

## 专家团队

Orchestrator 按任务需要调度最小 Agent 集合：

| 代号 | 角色 | 主要职责 |
| --- | --- | --- |
| Scanner | 项目扫描师 | 扫描技术栈、目录和可复用资源 |
| Lin | 需求分析师 | 仅在需求不清晰时补齐目标、范围和验收 |
| Liu | 技术负责人 | 多工作包拆分、Standard 风险增量审核和架构路由 |
| Zhang | 前端开发工程师 | 编写 `PLAN.md`、实现、测试和自检 |
| Wang | 条件质量审查官 | 命中审查触发器、用户明确要求或 Rigorous 时审查 |
| Chen | 按需架构专家 | 跨工作包/全局共享架构或 Rigorous 高风险决策 |

Chen 和 Wang 都不是 Fast/Standard 的固定岗位。

## 快速开始

环境要求为 Node.js 18 或更高版本，以及支持加载 Skill 的开发环境。

安装：

```bash
npx skills add along-h/dev-flow
```

在目标项目初始化：

```bash
npx dev-flow init
```

也可指定目录或安全升级已有 runtime：

```bash
npx dev-flow init --dir /path/to/project
npx dev-flow init --upgrade
```

`--upgrade` 只覆盖 Dev Flow 管理的 `scripts/`、`templates/`、`manifest.json` 和 `install.sh`，不会覆盖或删除 `.dev-flow/project/`、`.dev-flow/runs/`、`.dev-flow/artifacts/` 及业务产物。

检查安装状态：

```bash
sh .dev-flow/install.sh --check-only
```

完成初始化后，直接描述任务、验收要求和设计稿链接即可。

## 自适应工作模式

Dev Flow 先判断需求清晰度，再生成版本化 `agentSchedule`：

- `requirementClarity = clear`：生成精简需求基线，跳过 Lin（需求分析师）。
- `requirementClarity = unclear`：由 Lin 补齐到 `READY`，然后重新计算复杂度、风险和拓扑。

每个调度项记录 `id`、`agent`、`role`、`dependsOn`、`parallel`、`HANDOFF` 和 `stopWhen`。命中 `stopWhen` 后会重新编排并替换旧调度，而不是继续向旧计划追加角色。

| 场景 | 默认调度 |
| --- | --- |
| `direct-development` | Developer 实现与验证 |
| Fast UI | Developer `PLAN.md` → 用户确认 → 实现与验证 |
| Standard | Developer `PLAN.md` → Liu 审核风险增量 → 用户确认 → 实现与验证 → 按触发器 Reviewer |
| Rigorous | Liu → Architect → 用户确认 → Developer → Reviewer |
| Multi 无共享架构 | Liu 排依赖 → 各工作包按自身治理深度执行 |
| Multi 有共享架构 | Liu → Architect 统一共享层 → 各工作包按自身治理深度执行 |

`direct-development` 只用于清晰、低风险、可立即回滚的纯机械非 UI 修改。Fast 是普通 UI 任务的默认路线。

```text
需求与设计源
    ↓
判断清晰度、工作包边界、reuseScope 和真实风险
    ↓
默认 Fast；风险增量 → Standard；高风险/关键共享架构 → Rigorous
    ↓
Fast/Standard：一份 PLAN.md → 一次确认 → 实现
    ↓
定向测试 + lint + typecheck + build
    ↓
命中 reviewTriggers？── 否 → 直接交付
    │
    是
    ↓
限时 Reviewer → 必要修复与复验 → 交付
```

### 执行拓扑与复用范围

- `single-workstream`：一个内聚工作包，可包含多个页面或多个 UC。
- `multi-workstream`：至少两个可独立实现和验收的工作包，且确实需要依赖排序或分批交付。
- `reuseScope = local`：同一工作包内部复用，不视为共享架构信号，保持 Fast。
- `reuseScope = cross-work-package | global`：影响多个独立工作包或全局契约，才令 `hasSharedArchitecture = true`。

页面数量、UC 数量和“两个页面共用一个局部组件”本身都不会触发升级。本地确定性 Promise、只读 Mock、加载/空/错误等普通 UI 状态也按低风险处理。

### 治理深度

- `fast`：默认路线。Developer 输出不超过 150 行的 `PLAN.md`，用户一次确认后直接实现和定向验证，默认不调用 Reviewer。
- `standard`：在 Fast 上补充已识别的风险、反例、回滚或 Liu 审核；全部治理产物合计不超过 300 行。Reviewer 仅在 `reviewTriggers` 非空时介入。
- `rigorous`：权限安全、不可逆写操作、关键跨域契约、复杂并发状态或高影响共享架构。可使用完整 PRD、任务拆分、TDD、HANDOFF、逐组件 readiness 和强制 Reviewer。

Standard 不应仅因“出现复用”“存在 Promise”或“页面多于一个”而触发。单工作包 Fast/Standard 不默认创建 `PRD.md`、`TASK-BREAKDOWN.md`、`COMPONENTS.md`、`TDD.md` 或 `HANDOFF.md`。

## PLAN 与设计提取

Fast/Standard 的 `PLAN.md` 合并记录目标与范围、修改文件、关键技术决策、设计依据、真实风险与反例、验证命令和回滚方式。

设计稿按视觉簇提取，例如页头、筛选区、列表主体和弹层。仅对本次新增或修改且无法从父级证据确定的视觉簇补水；复用且不修改的组件只记录契约路径，无需再次定位精确子节点。不得递归拆解和提取所有可见 UI 子节点。

## 条件 Reviewer

Direct 和 Fast 默认由 Developer 自检后交付。Standard 只有命中 `reviewTriggers` 才调度 Reviewer；Rigorous 始终调度。典型触发器包括：

- 用户明确要求代码审查；
- 权限、安全、支付或不可逆数据写入；
- 跨工作包/全局共享契约发生变化；
- 复杂并发、乱序响应或幂等性风险；
- 核心验证失败、证据冲突或变更范围明显漂移。

Reviewer 只读取 `PLAN.md`、diff、触发风险和相关验证证据，并受明确时间预算约束。长任务必须发进度心跳；超时后返回已核验范围、未核验范围和阻塞原因，由主 Agent 超时接管，禁止短轮询和无边界重试。无真实问题时不生成完整 `REVIEW.md`。

如果产生分级问题，仍使用稳定的 P0/P1/P2 编号；只有用户选中的问题进入修复，复验只覆盖实际修改及直接影响范围。旧版完整 Review 校验器继续保留，供 Rigorous 和历史运行兼容使用。

## 验证与上下文预算

精简的是治理，不是验证。执行与交付必须记录适用于项目的定向 test、lint、typecheck 和 build 命令及实际结果；不存在某个脚本时说明替代证据。

Fast/Standard 单 Agent 默认输入上下文不超过 15KB。优先读取 `PLAN.md`、目标文件和定向证据；一次扩读一个必要 section 或 targeted full 文件，并记录触发原因。不得用连续读取多个 full 文件绕过上下文预算。

## 产物与兼容性

跨需求项目资产位于 `.dev-flow/project/`，单次需求产物位于 `.dev-flow/runs/{需求编号}/`。旧 `.dev-flow/artifacts/` 仅作为历史产物只读兼容来源。

| 文件 | 默认适用范围 | 说明 |
| --- | --- | --- |
| `PLAN.md` | Fast / Standard | 单一方案、确认、风险和验证入口 |
| `project/COMPONENT-INDEX.md` | 按需复用 | 项目组件和资源索引 |
| `PRD.md`、`TASK-BREAKDOWN.md` | Rigorous / 多工作包按需 | 需求基线与工作包依赖 |
| `COMPONENTS.md`、`TDD.md` | Rigorous / 兼容旧运行 | 逐组件设计准入与完整技术方案 |
| `HANDOFF.md`、`COMPONENT-SLICE.md` | 多 Agent 长流程按需 | 最小上下文交接 |
| `GLOBAL-ARCHITECTURE.md` | 关键共享架构 | 跨工作包或全局契约 |
| `REVIEW.md` | 条件 Review / Rigorous | 分级问题、处置和复验记录 |

旧产物校验命令仍可使用：

```bash
node .dev-flow/scripts/validate-artifact.js <type> <file>
```

## 项目结构

```text
dev-flow/
├── agents/
├── bin/init.js
├── scripts/
├── templates/
│   └── plan-template.md
├── install.sh
├── manifest.json
└── SKILL.md
```

仓库内 Skill 的修改不会自动更新全局安装副本。验证完成后需要重新安装，或同步全局 Skill 到实际安装目录。

## 常见问题

### `.dev-flow/` 已存在时没有覆盖

默认初始化只复制缺失文件。需要刷新 runtime 时使用 `npx dev-flow init --upgrade`。

### 什么时候使用多工作流

只有存在至少两个可独立实现和验收的工作包，并且需要依赖排序、共享基础或分批交付时才使用。多个页面可以仍是一个工作包。

### 可以跳过 Review 吗

可以。Direct/Fast 默认不进入 Review，Standard 未命中触发器也直接交付；但验证不能跳过。Rigorous 或用户明确要求审查时仍会执行 Reviewer。

## License

MIT
