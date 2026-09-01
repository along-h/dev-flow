# 组件拆分方案

## 页面级组件树

```text
[UI] StudentHomePage（职责：承载学生首页可见内容）
├── [UI] VocabularyStudyCard（职责：展示词汇学习进度、状态与入口）
├── [UI] ExistingNotice（职责：展示既有通知视觉）
├── [UI] WordDetailModal（职责：展示词条详情弹窗）
└── [UI] LegacyBanner（职责：展示首页旧版横幅）
```

每个可见 UI 条目必须显式写成 `[UI] ComponentName`。所有 `[UI]` 名称的集合必须与下方矩阵中排除 `not-applicable` 后的 UI 组件集合完全一致，不得遗漏、额外添加或重复。

## 职责目录树

每个目录和文件使用 `# [新增|修改|复用|不变][WP编号|共享] 单一职责；允许或禁止的改动范围` 备注。

```text
src/                                    # [不变][共享] 源码根目录；禁止当前方案扩展无关边界
├── modules/                           # [不变][共享] 共享模块目录；只允许承载跨工作包复用组件
│   └── TabBar/                         # [复用][共享] 跨模块页签；当前工作包只允许扩展配置与图标
├── pages/student/home/                 # [不变][WP01] 学生首页入口；禁止修改周报模块
│   └── components/                   # [不变][WP01] 首页私有组件目录；只允许承载当前页面组件
│       └── VocabularyStudyCard/        # [新增][WP01] 首页词汇学习卡片；承载当前工作包 UI
│           ├── index.vue               # [新增][WP01] 卡片布局、状态展示与用户交互入口
│           ├── types.ts                # [新增][WP01] 负责定义 Props、视图状态和事件类型
│           ├── hooks/                  # [新增][WP01] 负责管理卡片内部状态与副作用
│           └── services/               # [新增][WP01] 卡片专属数据访问边界
└── pkg-stu/pkg-vocabulary/             # [修改][WP01] 学生词汇分包入口；调整为挂载词汇学习卡片
    ├── index.vue                       # [修改][WP01] 词汇 Tab 根页面；仅修改模块入口组合
    └── types.ts                        # [修改][WP01] 分包公共输入输出类型；仅补充卡片所需字段
```

## 设计覆盖矩阵

| UI 组件 | 文件路径 | 所属工作包 | 精确设计节点 | 必需状态 | 完整度 | 处置 |
|---------|---------|-----------|-------------|---------|--------|------|
| StudentHomePage | `src/pages/student/home/index.vue` | WP01 | https://design.example/file/student-home?node-id=page | normal/loading/error | complete | 按规格开发 |
| VocabularyStudyCard | `src/pages/student/home/components/VocabularyStudyCard/index.vue` | WP01 | https://design.example/file/student-home?node-id=card | normal/loading/empty/error | complete | 按规格开发 |
| ExistingNotice | `src/pages/student/home/components/ExistingNotice/index.vue` | WP01 | 项目视觉基线：`src/pages/student/home/components/ExistingNotice/index.module.scss` | normal/empty/error | complete | inactive：沿用现有视觉规范并核对全部适用状态 |
| WordDetailModal | `src/pages/student/home/components/WordDetailModal/index.vue` | WP01 | 尚未定位 | normal/loading/error | blocked | 开发前补充精确节点链接 |
| LegacyBanner | `src/pages/student/home/components/LegacyBanner/index.vue` | WP01 | 无 | normal | waived | 用户原话摘要：“保留现有样式”；残余风险：与后续设计稿可能不一致；人工视觉验收范围：首页横幅 normal 状态 |
| types.ts | `src/pages/student/home/components/VocabularyStudyCard/types.ts` | WP01 | 不适用 | 不适用 | not-applicable | 非视觉文件 |

完整度只允许 `complete`、`blocked`、`waived`、`not-applicable`。

每个数据行必须恰有七列且所有字段非空；视觉行的 UI 组件名必须逐项对应页面级组件树中的 `[UI] ComponentName`，非视觉 `not-applicable` 行不参与该集合比较。

`complete` 必须满足以下一种证据分支：已提供设计源时记录含 `node-id`、`nodeId` 或 `node` 参数/片段的可回查精确节点 URL；确无任何设计源、任务状态为 `inactive` 时，记录 `项目视觉基线：<真实组件或样式文件路径>`，该路径经规范化后必须是项目 cwd 内真实存在的文件，并在必需状态和处置中明确沿用的现有视觉规范。`not-applicable` 只可用于非视觉文件。`waived` 只属于逐组件处置，必须同时填写 `用户原话摘要：...`、`残余风险：...` 和 `人工视觉验收范围：...`，不得作为任务级捷径。

## 通用组件清单

| 组件 | 复用边界 | 允许的改动范围 |
|------|----------|----------------|
| TabBar | 共享 | 仅扩展配置与图标，不改变其他模块行为 |

## Props 与 State

| 组件 | Props | State | 数据来源 |
|------|-------|-------|----------|
| VocabularyStudyCard | `entryId` | `loading`、`error` | 词汇学习接口 |

以上字段需与页面级组件树、职责目录树和设计覆盖矩阵保持一致。
