# 软件开发团队

多智能体软件开发团队，交付总监统筹产品经理、架构师、工程师与 QA，按 SOP 流程交付可用代码。

## 类型

Team 型（多角色协作团队）

## 团队成员

| 成员 ID | 名字 | 职业头衔 | 职责 |
|---------|------|---------|------|
| software-dev-team-lead | 齐活林（Qi） | 交付总监 | 编排调度、工作流路由、汇总交付 |
| software-dev-product-manager | 许清楚（Xu） | 产品经理 | 创建 PRD、市场/竞品研究 |
| software-dev-architect | 高见远（Gao） | 架构师 | 系统架构设计 + 任务分解 |
| software-dev-engineer | 寇豆码（Kou） | 工程师 | 批量编写代码、全局一致性自审 |
| software-dev-qa-engineer | 严过关（Yan） | QA 工程师 | 测试用例、执行测试、智能路由判定 |

## 功能

团队遵循「代码 = SOP(团队)」理念，按需求规模自动选择工作流：

- **⚡ 快速模式**：单页面应用、小游戏、工具脚本（≤ 10 个源文件）→ 工程师直接实现 + QA 验证
- **🔧 BugFix 快捷路径**：明确 Bug 报告 → 工程师定位修复 + QA 回归测试
- **🏗️ 标准 SOP**：中大型需求 → 产品经理(PRD) → 架构师(设计+任务分解) → 工程师(实现) → QA(测试)
- **📋 部分工作流**：仅 PRD / 架构评审 / 代码实现 / 仅测试 / 市场调研

内置两道质量关卡：工程师的全局一致性审查（IS_PASS）与 QA 的智能路由判定（源码 Bug 退回工程师、测试 Bug 自行修复），最多 2 轮，超出的问题明确标注为遗留问题。

默认技术栈：Vite + React + MUI + Tailwind CSS（前端）、Python（后端）。

## 使用示例

- 帮我做一个待办清单应用
- 开发一个贪吃蛇小游戏
- 我有一个电商平台的想法，从 PRD 开始做

## 头像

头像暂未生成，`avatars/` 目录为空。补齐以下 6 个文件后，专家卡片即可显示角色形象：

| 文件名 | 角色 |
|--------|------|
| `team.png` | 团队整体头像 |
| `software-dev-team-lead.png` | 齐活林 · 交付总监 |
| `software-dev-product-manager.png` | 许清楚 · 产品经理 |
| `software-dev-architect.png` | 高见远 · 架构师 |
| `software-dev-engineer.png` | 寇豆码 · 工程师 |
| `software-dev-qa-engineer.png` | 严过关 · QA 工程师 |

要求：PNG（推荐）或 JPG，512×512 px，单张不超过 500KB。

为保证同一团队画风一致，建议所有头像共用同一段风格锚定前缀与后缀：

- 前缀：`Professional cartoon-style illustration avatar, consistent art style with warm lighting and soft shadows,`
- 后缀：`Bust shot, facing forward. Clean simple blue-purple-toned background. High quality, professional, natural.`

也可以直接让我用图像生成能力补齐，或把你的自定义图片按上表命名后放入 `avatars/`。

## 安装

将专家包目录放到专家目录下：

```
/Users/hly/.workbuddy/plugins/marketplaces/my-experts/plugins/software-dev-team/
```

然后运行注册命令使其可见：

```bash
python3 scripts/register_expert.py <expert-dir>
```

## 打包分享

```bash
zip -r software-dev-team.zip software-dev-team/
```
