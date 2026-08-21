# Dev Flow · 专家开发团队

Dev Flow 是一套面向前端开发任务的多 Agent 协作流水线。它将需求分析、任务拆分、架构设计、测试驱动开发、代码审查和交付组织成可确认、可校验的标准流程。

你只需要提供开发需求、UC 文档和设计稿。Dev Flow 会先与你补齐需求基线，再把 UC 聚合为可独立验证的工作包，最后按执行拓扑和风险深度选择编排方式。

## 核心能力

- 以 6 个专家 Agent 分工完成需求到代码交付
- 将页面、UC、工作包和架构边界分开建模，避免“一 UC 一任务”
- 支持 `single-workstream` / `multi-workstream` 执行拓扑和 `fast` / `standard` / `rigorous` 治理深度
- 根据治理深度缩放需求、组件拆分、TDD 和审查门控
- 自动扫描目标项目的技术栈、目录结构和可复用组件
- 使用模板与校验脚本约束 PRD、TDD、审查报告等产物格式
- 通过结构化上下文包完成 Agent 之间的精简交接
- 使用 P0、P1、P2 分级审查和修复回环保障交付质量
- 在 PRD 中分离事实、假设、硬约束与方案偏好，优先验证高影响假设
- 在架构门控内执行风险分级和独立对抗性审查，不额外增加常规审批节点
- 从系统不变量派生乱序、重复提交、权限变化和部分失败等反例测试
- 交付前记录 typecheck、lint、test、build 的实际命令、退出码和结果

## 专家团队

| 代号 | 角色 | 主要职责 |
| --- | --- | --- |
| Scanner | 项目扫描师 | 扫描技术栈、项目结构与可复用资源 |
| Lin | 需求分析师 | 澄清需求、边界条件和异常状态 |
| Liu | 任务拆分师 | 将 UC 聚合为工作包，梳理共享边界、依赖与执行顺序 |
| Chen | 架构师 | 设计组件边界、复用方案和 TDD |
| Zhang | 开发者 | 按 TDD 实现业务代码与测试 |
| Wang | 独立质量审查官 | 挑战架构假设、执行反例验证、分级审查并推动修复 |

## 环境要求

- Node.js 18 或更高版本
- 支持加载 Skill 和多 Agent 协作的开发环境

## 快速开始

### 1. 安装 Dev Flow

推荐通过 Skill 仓库安装：

```bash
npx skills add along-h/dev-flow
```

### 2. 初始化目标项目

进入需要开发的项目目录后执行：

```bash
npx dev-flow init
```

也可以显式指定目标目录：

```bash
npx dev-flow init --dir /path/to/project
```

初始化命令会在目标项目中创建 `dev-flow/`，并复制运行所需的脚本、模板、配置和产物目录。

### 3. 检查安装状态

```bash
sh dev-flow/install.sh --check-only
```

检查内容包括目录完整性、配置格式、Node.js 版本、产物模板和核心脚本。

### 4. 描述开发需求

完成初始化后，直接向 Agent 描述前端开发任务。例如：

```text
开发一个词条审核页面，支持通过和驳回操作，设计稿：[设计稿链接]
```

```text
启动 Dev Flow，完成用户列表、用户详情和编辑用户三个用例。
```

```text
用多 Agent 开发这个前端需求，并在每个设计阶段让我确认。
```

## 自适应工作模式

Dev Flow 使用两阶段分诊：

```text
UC 文档 + 设计稿 + 用户说明
          ↓
初步接入：只选择需求发现深度，finalRoute = pending
          ↓
需求基线：补齐事实、假设、边界状态和验收标准
          ↓
工作包拆分：按状态/契约/独立验收边界聚合 UC
          ↓
最终编排：执行拓扑 × 治理深度
```

### 执行拓扑

- `single-workstream`：一个内聚工作包；可以包含多个页面或多个 UC，但统一设计、开发和验收。
- `multi-workstream`：至少两个可独立验证的工作包，并且需要依赖排序、共享基础或分批交付。

### 治理深度

- `fast`：明确、局部、可逆且无共享契约或高风险状态变化。
- `standard`：存在有限需求不确定性、局部架构决策或中等风险异步交互。
- `rigorous`：高不确定性、高影响、权限安全、复杂状态或关键共享架构。

例如，同一订单页中的查看、编辑、取消和重试可以是 4 个 UC，但如果共享状态、类型和服务且必须整体验收，仍是一个工作包。反过来，一个第三方登录 UC 跨多个可独立验证的权限和回调边界时，可以拆成多个工作包。

## 产物说明

流水线产生的文档默认保存在目标项目的 `dev-flow/artifacts/` 目录中。

| 文件 | 说明 |
| --- | --- |
| `PRD.md` | 包含拆分就绪结论的需求基线；简单任务可使用会话内精简版本 |
| `COMPONENT-INDEX.md` | 项目已有组件与可复用资源索引 |
| `COMPONENTS.md` | 当前工作包的组件拆分方案 |
| `TDD.md` | 技术设计与测试驱动开发方案 |
| `REVIEW.md` | 分级代码审查报告 |
| `TASK-BREAKDOWN.md` | 工作包、UC 映射、依赖、二维编排决策和升级触发器 |
| `GLOBAL-ARCHITECTURE.md` | 多工作流存在共享契约时的共享架构设计 |

每份标准产物在进入用户确认门控前，都会先通过 `validate-artifact.js` 校验。

结构校验只证明必需章节存在，不证明内容正确。架构正确性由独立对抗性审查尝试证伪，交付状态由实际运行命令和验收标准映射证明。

## 风险分级与审查结论

风险分数使用“影响 × 发生可能性 × 不确定性”，每项取 1–3：

- 1–8：低风险，由独立审查视角执行限时轻量挑战。
- 9–18：中风险，执行一次独立架构挑战。
- 19–27 或关键共享架构：高风险，执行独立挑战、反例测试与回滚设计。

对抗性审查结论为 `BLOCK`、`ACCEPT_WITH_RISK` 或 `ACCEPT`。`BLOCK` 返回架构阶段修订；其他结论及未关闭风险进入原有用户门控。

所有风险级别在 TDD 或全局架构确认前都必须经过独立挑战；风险分级只控制审查深度，不决定是否审查。异步读写、mutation、提交、重试或状态切换路径中的乱序响应和重复提交风险不得低于 9 分，除非给出可核验的不适用证明。

## 手动校验产物

可以使用以下格式手动校验产物：

```bash
node dev-flow/scripts/validate-artifact.js <type> <file>
```

例如：

```bash
node dev-flow/scripts/validate-artifact.js prd dev-flow/artifacts/PRD.md
node dev-flow/scripts/validate-artifact.js tdd dev-flow/artifacts/TDD.md
node dev-flow/scripts/validate-artifact.js review dev-flow/artifacts/REVIEW.md
```

支持的产物类型包括：

- `prd`
- `component-index`
- `components`
- `tdd`
- `review`
- `task-breakdown`
- `global-architecture`

## 项目结构

```text
dev-flow/
├── agents/                 # 专家 Agent 定义
├── artifacts/              # 流水线运行产物
├── bin/
│   └── init.js             # 项目初始化 CLI
├── scripts/
│   ├── scan-project.js     # 项目结构与资源扫描
│   └── validate-artifact.js # 产物格式校验
├── templates/              # 标准产物模板
├── install.sh              # 安装完整性检查
├── manifest.json           # Skill 元数据与能力声明
├── package.json            # npm 包与 CLI 配置
└── SKILL.md                # 主 Agent 编排规则
```

初始化到目标项目的 `dev-flow/` 目录只包含运行时所需的脚本、模板、配置和产物目录；完整仓库中的 `SKILL.md` 与 `agents/` 用于安装和加载 Skill。

## 常见问题

### 提示“项目尚未初始化 Dev Flow”

确认目标项目中存在 `dev-flow/scripts/scan-project.js`。如果不存在，请在项目根目录重新执行：

```bash
npx dev-flow init
```

### Node.js 版本过低

Dev Flow 要求 Node.js 18 或更高版本。可以通过以下命令查看当前版本：

```bash
node --version
```

### `dev-flow/` 已存在时没有覆盖

初始化命令检测到已有目录时会跳过复制，避免覆盖现有产物和配置。请先确认并备份已有内容，再决定是否重新初始化。

### 什么时候会使用多工作流

只有存在至少两个可独立实现和验收的工作包，并且需要依赖排序、共享基础或分批交付时，才使用 `multi-workstream`。页面或 UC 数量本身不会触发多工作流。

### 一个页面有多个 UC 怎么处理

先判断这些 UC 是否共享状态、数据模型、接口契约和整体验收边界。共享且无法独立验收时聚合为一个工作包；只有具备真实独立交付边界时才拆分。

## License

MIT
