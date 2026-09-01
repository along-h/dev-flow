const assert = require("node:assert/strict");
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const VALIDATOR_PATH = resolve(__dirname, "../scripts/validate-artifact.js");

const VALID_CONFIRMED_TDD_WITHOUT_ADVERSARIAL_REVIEW = `# TDD
## 组件树
OrderEditor 负责编辑订单，OrderStatusBadge 负责展示订单状态。
## 职责目录树
src/pages/orders/ # [修改][WP01] 订单页面目录；职责是承载订单查看与编辑流程。
└── OrderEditor/ # [新增][WP01] 订单编辑组件目录；职责是隔离订单表单交互。
    └── index.tsx # [新增][WP01] 订单编辑入口；职责是提交订单变更。
## 设计覆盖版本
设计覆盖版本：COMPONENTS.md v2。若 TDD 改变已确认组件职责，返回组件方案确认。
## 数据流
页面先读取订单，再由用户提交订单变更。
## API 契约
GET /api/orders/:orderId
POST /api/orders
interface OrderItemData {
  id: string;
  status: string;
}
## 性能策略
订单详情按订单编号缓存，提交期间禁用重复操作。
## 风险评估
订单状态过期的影响为 3、可能性为 2、不确定性为 2，总分 12；通过提交前版本校验和失败回滚控制。异步风险判定：乱序响应 12 分，重复提交 12 分。
## 技术方案确认
方案确认状态：CONFIRMED。确认依据：用户于 2026-08-28 明确确认当前技术方案。
`;

const UNCONFIRMED_TDD_WITHOUT_ADVERSARIAL_REVIEW = `# TDD
## 组件树
OrderEditor 负责编辑订单，OrderStatusBadge 负责展示订单状态。
## 职责目录树
src/pages/orders/ # [修改][WP01] 订单页面目录；职责是承载订单查看与编辑流程。
└── OrderEditor/ # [新增][WP01] 订单编辑组件目录；职责是隔离订单表单交互。
    └── index.tsx # [新增][WP01] 订单编辑入口；职责是提交订单变更。
## 设计覆盖版本
设计覆盖版本：COMPONENTS.md v2。若 TDD 改变已确认组件职责，返回组件方案确认。
## 数据流
页面先读取订单，再由用户提交订单变更。
## API 契约
GET /api/orders/:orderId
POST /api/orders
interface OrderItemData {
  id: string;
  status: string;
}
## 性能策略
订单详情按订单编号缓存，提交期间禁用重复操作。
## 风险评估
订单状态过期的影响为 3、可能性为 2、不确定性为 2，总分 12；通过提交前版本校验和失败回滚控制。异步风险判定：乱序响应 12 分，重复提交 12 分。
## 技术方案确认
方案确认状态：PENDING_USER_CONFIRMATION。确认依据：用户尚未确认当前技术方案。
`;

const VALID_CONFIRMED_GLOBAL_ARCHITECTURE_WITHOUT_ADVERSARIAL_REVIEW = `# 全局架构
## 统一数据模型
interface SharedOrderData {
  id: string;
  status: string;
}
## 共享组件
### 共享可见组件声明
| 组件名 | Props 契约 | 使用工作包 |
|---|---|---|
| Status | interface StatusProps { status: string; } | WP01 |
| StatusBadge | interface StatusBadgeProps { status: string; } | WP02 |
## 共享职责目录树
src/components/ui/ # [复用][共享] 全局 UI 目录；职责是承载跨工作包可见组件。
├── Status/ # [修改][共享] 共享状态文本目录；职责是统一订单状态语义。
│   └── index.tsx # [修改][共享] 共享状态文本入口；职责是渲染状态文字。
└── StatusBadge/ # [新增][共享] 共享状态标签目录；职责是统一订单状态视觉表达。
    └── index.tsx # [新增][共享] 共享状态标签入口；职责是渲染状态标签。
## 共享可见组件设计归属
| 组件名 | 工作包设计矩阵 |
|---|---|
| Status | WP01 COMPONENTS.md |
| StatusBadge | WP02 COMPONENTS.md |
## 全局 API 层
GET /api/orders/:orderId
POST /api/orders
## 全局路由与布局
src/pages/orders/ 由 WP01 拥有，src/components/ui/ 作为共享边界。
## 各工作包架构边界
WP01 拥有订单页面并引用 Status，WP02 引用 StatusBadge 和共享订单类型。
## 风险评估
共享状态语义漂移的影响为 3、可能性为 2、不确定性为 2，总分 12；由 WP01 的 COMPONENTS.md 固定视觉状态并在契约变化时回滚。
## 技术方案确认
方案确认状态：CONFIRMED。确认依据：用户于 2026-08-28 明确确认当前技术方案。
`;

const VALID_TDD_PROPOSAL = VALID_CONFIRMED_TDD_WITHOUT_ADVERSARIAL_REVIEW.replace(
  /## 技术方案确认[\s\S]*$/,
  "",
);

const VALID_GLOBAL_ARCHITECTURE_PROPOSAL =
  VALID_CONFIRMED_GLOBAL_ARCHITECTURE_WITHOUT_ADVERSARIAL_REVIEW.replace(
    /## 技术方案确认[\s\S]*$/,
    "",
  );

const DUPLICATED_DESIGN_COVERAGE_MATRIX = `## 设计覆盖矩阵
| UI 组件 | 文件路径 | 所属工作包 | 精确设计节点 | 必需状态 | 完整度 | 处置 |
|---|---|---|---|---|---|---|
| OrderEditor | src/pages/orders/OrderEditor/index.tsx | WP01 | https://design.example/node/1 | normal/loading/error | complete | 按规格开发 |
`;

/**
 * 使用真实 CLI 校验临时产物，避免测试脚本内部实现细节。
 *
 * @param {string} type 产物类型
 * @param {string} content 产物内容
 * @param {{ projectFiles?: Record<string, string>, isTemplateArtifact?: boolean }} [options] 临时项目文件与模板模式
 * @returns {{ status: number | null, stdout: string }} CLI 执行结果
 */
function runValidator(type, content, options = {}) {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "dev-flow-validator-"));
  const artifactPath = options.isTemplateArtifact
    ? join(temporaryDirectory, "templates", `${type}-template.md`)
    : join(temporaryDirectory, `${type}.md`);
  mkdirSync(dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, content, "utf8");

  // 在隔离的项目 cwd 中创建真实依赖文件，验证器必须针对项目而非宿主仓库判断路径。
  for (const [relativePath, fileContent] of Object.entries(options.projectFiles ?? {})) {
    const projectFilePath = resolve(temporaryDirectory, relativePath);
    mkdirSync(dirname(projectFilePath), { recursive: true });
    writeFileSync(projectFilePath, fileContent, "utf8");
  }

  try {
    const result = spawnSync(process.execPath, [VALIDATOR_PATH, type, artifactPath], {
      cwd: temporaryDirectory,
      encoding: "utf8",
    });
    return { status: result.status, stdout: result.stdout };
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

/**
 * 构造满足组件结构契约的测试产物，仅由调用方提供设计覆盖矩阵数据行。
 *
 * @param {string} matrixRows 设计覆盖矩阵数据行
 * @param {string[]} [visibleComponents] 页面组件树中的可见 UI 组件名
 * @returns {string} 可供真实 CLI 校验的组件方案内容
 */
function buildValidComponentsArtifact(matrixRows, visibleComponents = ["OrderCard"]) {
  const componentTree = visibleComponents
    .map((componentName, index) => `${index === visibleComponents.length - 1 ? "└──" : "├──"} [UI] ${componentName}，职责：展示订单状态。`)
    .join("\n");
  return `# 组件方案
## 页面级组件树
${componentTree}
## 职责目录树
src/pages/orders/OrderCard/ # [新增][WP01] 订单卡片目录；仅承载订单卡片 UI。
└── index.tsx # [新增][WP01] 订单卡片渲染入口；负责展示订单信息。
## 设计覆盖矩阵
| UI 组件 | 文件路径 | 所属工作包 | 精确设计节点 | 必需状态 | 完整度 | 处置 |
|---|---|---|---|---|---|---|
${matrixRows}
## 通用组件清单
StatusBadge。
## Props 与 State
Props: orderId；State: loading。
`;
}

/** 满足 required 分支全部组件证据要求的设计源登记表。 */
const VALID_REQUIRED_DESIGN_SOURCES = `# 设计源登记表
## 1. 状态判定
- **当前状态**：\`required\`
判定依据：已提供顶层设计源。
## 2. 当前任务范围
- 状态唯一性规则：运行产物全文只能保留一个状态判定章节（\`## 状态判定\` 或 \`## 1. 状态判定\`）和一个 \`当前状态\` 字段；规则说明中的自然语言“当前状态”不计作字段，状态判定章节不得记录任务级豁免
用户列表调整。
## 3. 模块设计源清单与组件节点映射
| 模块 | 页面 | UI 组件 | 工作包 | 顶层设计源 | 精确组件节点 | 节点层级路径 | 适用状态 | 完整度 | 关联模块规格 | 提取时间 | 响应式差异 | 文字溢出 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 用户列表 | 用户页 | UserCard | WP01 | https://design.example/file/abc | https://design.example/file/abc?node-id=2 | 用户页/UserList/UserCard | normal/hover/loading/error | complete | design/user-list.md | 2026-08-28 10:00 +08:00 | 768px 下切换单列 | ellipsis |
## 4. 刷新记录
2026-08-28：完成组件精确节点提取。
`;

/** 验证官方模板的编号标题和规则说明不会被误判为重复状态字段。 */
test("官方编号状态标题及说明文本允许唯一 required 状态通过", () => {
  const result = runValidator("design-sources", VALID_REQUIRED_DESIGN_SOURCES);

  assert.equal(result.status, 0, result.stdout);
});

/** 满足 complete 分支全部组件级证据要求的模块设计规格。 */
const VALID_COMPLETE_MODULE_DESIGN_SPEC = `# 模块设计规格：用户列表
## 设计源
模块链接：https://mastergo.com/file/abc?node-id=1。顶层链接：https://mastergo.com/file/abc。节点名称：UserCard。节点范围：用户列表。节点层级路径：用户页/UserList/UserCard。提取时间：2026-08-28 10:00 +08:00。
## UI 组件与精确节点映射
| UI 组件 | 所在页面 | 精确节点名称 | 精确节点链接 | 节点层级路径 | 提取时间 | 适用状态 |
|---|---|---|---|---|---|---|
| UserCard | 用户页 | UserCard | https://mastergo.com/file/abc?node-id=2 | 用户页/UserList/UserCard | 2026-08-28 10:00 +08:00 | normal/hover/loading/error |
## 证据引用
COMPONENTS 设计覆盖：COMPONENTS.md v2，UI 组件 UserCard。
DESIGN-SOURCES 记录：DESIGN-SOURCES.md 的 UserCard 组件节点映射。
## 布局与尺寸
| 区域/组件 | 布局 | 宽度 | 高度 | 间距 | 对齐 |
|---|---|---|---|---|---|
| UserCard | grid | 1200px | 48px | 12px | 左对齐 |
## 设计 Token
| 类别 | Token/属性 | 值 | 来源节点 |
|---|---|---|---|
| 颜色 | color-text | #222 | UserCard |
| 字体 | typography-body | 14px/20px 500 | UserCard |
| 间距 | spacing-card | 12px | UserCard |
| 圆角 | radius-card | 8px | UserCard |
| 阴影 | shadow-card | 0 2px 8px #0000001a | UserCard |
## 组件状态
| UI 组件 | 状态 | 规格 | 证据 |
|---|---|---|---|
| UserCard | normal | 白色背景、#222 文字 | UserCard/normal |
| UserCard | hover | 阴影提升至 0 4px 12px #00000026 | UserCard/hover |
| UserCard | loading | 48px 骨架屏 | UserCard/loading |
| UserCard | error | 红色错误文案与重试按钮 | UserCard/error |

active、focus、disabled、empty 经节点确认不适用，不进入适用状态表。
## 文字与溢出
| 场景 | 字体规格 | 最大行数/宽度 | 溢出处理 |
|---|---|---|---|
| 用户名 | 14px/20px | 1 行 | ellipsis |
## 响应式规则
| 断点 | 布局变化 | 尺寸/间距变化 |
|---|---|---|
| 768px | 单列 | 间距 12px |
## 提取完整度
结论：\`complete\`。未确认项：无。
`;

test("组件方案缺少职责目录树或设计覆盖矩阵时拒绝通过", () => {
  const result = runValidator(
    "components",
    "# 组件方案\n## 页面级组件树\n└── OrderCard，职责：展示订单。\n## 通用组件清单\nStatusBadge。\n## Props 与 State\nProps: orderId；State: loading。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /职责目录树|设计覆盖矩阵/);
});

test("职责目录树缺少变更类型工作包和文件作用时拒绝通过", () => {
  const result = runValidator(
    "components",
    "# 组件方案\n## 页面级组件树\n└── OrderCard，职责：展示订单。\n## 职责目录树\nsrc/pages/orders/OrderCard/index.tsx\n## 设计覆盖矩阵\n| UI 组件 | 文件路径 | 所属工作包 | 精确设计节点 | 必需状态 | 完整度 | 处置 |\n|---|---|---|---|---|---|---|\n| OrderCard | src/pages/orders/OrderCard/index.tsx | WP01 | https://design.example/node/1 | normal/loading/error | complete | 按规格开发 |\n## 通用组件清单\nStatusBadge。\n## Props 与 State\nProps: orderId；State: loading。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /新增|修改|复用|不变|职责/);
});

test("组件设计仍有 blocked 项时开发准入拒绝通过", () => {
  const content = buildValidComponentsArtifact(
    "| OrderCard | src/pages/orders/OrderCard/index.tsx | WP01 | 尚未定位 | normal/loading/error | blocked | 请求精确节点 |",
  );
  const result = runValidator("components-readiness", content);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /blocked|开发准入/);
});

test("complete、明确 waived 和非视觉 not-applicable 允许开发准入", () => {
  const rows = [
    "| OrderCard | src/pages/orders/OrderCard/index.tsx | WP01 | https://design.example/file/1?node-id=1 | normal/loading/error | complete | 按规格开发 |",
    "| LegacyBanner | src/pages/orders/LegacyBanner/index.tsx | WP01 | 无 | normal | waived | 用户原话摘要：“保留现有样式”；残余风险：与新稿可能不一致；人工视觉验收范围：订单页横幅 |",
    "| types.ts | src/pages/orders/types.ts | WP01 | 不适用 | 不适用 | not-applicable | 非视觉文件 |",
  ].join("\n");
  const result = runValidator(
    "components-readiness",
    buildValidComponentsArtifact(rows, ["OrderCard", "LegacyBanner"]),
  );

  assert.equal(result.status, 0, result.stdout);
});

test("职责目录树每个非空条目都必须带变更、边界和职责约束", () => {
  const content = buildValidComponentsArtifact(
    "| OrderCard | src/pages/orders/OrderCard/index.tsx | WP01 | 尚未定位 | normal | blocked | 开发前补充节点 |",
  ).replace(
    "└── index.tsx # [新增][WP01] 订单卡片渲染入口；负责展示订单信息。",
    "├── index.tsx # [新增][WP01] 订单卡片渲染入口；负责展示订单信息。\n└── styles.module.scss",
  );
  const result = runValidator("components", content);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /每个.*目录树|逐项|变更类型|工作包|职责|约束/);
});

test("页面组件树的 UI 标记集合必须与视觉设计矩阵集合一致", () => {
  const rows = [
    "| OrderCard | src/pages/orders/OrderCard/index.tsx | WP01 | 尚未定位 | normal | blocked | 开发前补充节点 |",
    "| HiddenBanner | src/pages/orders/HiddenBanner/index.tsx | WP01 | 尚未定位 | normal | blocked | 开发前补充节点 |",
  ].join("\n");
  const result = runValidator("components", buildValidComponentsArtifact(rows));

  assert.equal(result.status, 1);
  assert.match(result.stdout, /\[UI\]|组件树|视觉.*集合|设计覆盖矩阵/);
});

test("设计覆盖矩阵七列中的任一字段为空时拒绝通过", () => {
  const result = runValidator(
    "components",
    buildValidComponentsArtifact(
      "| OrderCard |  | WP01 | 尚未定位 | normal | blocked | 开发前补充节点 |",
    ),
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /七列.*非空|字段.*非空|设计覆盖矩阵/);
});

/** 验证 complete 不能在缺少设计节点或项目视觉基线证据时绕过准入。 */
test("complete 缺少可回查设计证据时开发准入拒绝通过", () => {
  const result = runValidator(
    "components-readiness",
    buildValidComponentsArtifact(
      "| OrderCard | src/pages/orders/OrderCard/index.tsx | WP01 | 无 | normal/loading/error | complete | 按规格开发 |",
    ),
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /complete|精确设计节点|项目视觉基线|开发准入/);
});

/** 验证 inactive 可通过真实项目视觉基线路径进入开发。 */
test("inactive 的真实项目视觉基线路径允许 complete 进入开发", () => {
  const result = runValidator(
    "components-readiness",
    buildValidComponentsArtifact(
      "| OrderCard | src/pages/orders/OrderCard/index.tsx | WP01 | 项目视觉基线：./src/styles/../styles/order-card.module.scss | normal/loading/error | complete | inactive：沿用现有视觉规范并核对全部适用状态 |",
    ),
    { projectFiles: { "src/styles/order-card.module.scss": ".orderCard { color: #222; }" } },
  );

  assert.equal(result.status, 0, result.stdout);
});

/** 验证模板文件允许保留视觉基线路径占位，不访问项目文件系统。 */
test("模板中的项目视觉基线路径占位允许开发准入结构校验", () => {
  const templateContent = buildValidComponentsArtifact(
    "| OrderCard | src/pages/orders/OrderCard/index.tsx | WP01 | 项目视觉基线：{真实组件或样式文件路径} | normal | complete | inactive：沿用现有视觉规范 |",
  ).replace(
    "└── index.tsx # [新增][WP01] 订单卡片渲染入口；负责展示订单信息。",
    "├── index.tsx # [新增][WP01] 订单卡片渲染入口；负责展示订单信息。\n├── styles.scss # [修改][WP01] 订单卡片样式；负责视觉调整。\n├── StatusBadge.tsx # [复用][共享] 状态组件；负责状态展示。\n└── legacy.scss # [不变][WP01] 旧样式；禁止修改。",
  );
  const result = runValidator(
    "components-readiness",
    templateContent,
    { isTemplateArtifact: true },
  );

  assert.equal(result.status, 0, result.stdout);
});

/** 验证仅有文件形状但 cwd 中不存在的视觉基线不能进入开发。 */
test("inactive 的不存在视觉基线路径不能通过开发准入", () => {
  const result = runValidator(
    "components-readiness",
    buildValidComponentsArtifact(
      "| OrderCard | src/pages/orders/OrderCard/index.tsx | WP01 | 项目视觉基线：src/styles/missing.module.scss | normal | complete | inactive：沿用现有视觉规范 |",
    ),
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /项目视觉基线|真实.*存在|开发准入/);
});

/** 验证顶层或普通 HTTP URL 不能冒充精确组件节点。 */
test("complete 的普通设计 URL 不能通过开发准入", () => {
  const result = runValidator(
    "components-readiness",
    buildValidComponentsArtifact(
      "| OrderCard | src/pages/orders/OrderCard/index.tsx | WP01 | https://design.example/file/1 | normal | complete | 按规格开发 |",
    ),
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /精确设计节点|节点参数|开发准入/);
});

/** 验证笼统默认样式不能伪装成项目视觉基线路径。 */
test("inactive 的非路径视觉基线不能通过开发准入", () => {
  const result = runValidator(
    "components-readiness",
    buildValidComponentsArtifact(
      "| OrderCard | src/pages/orders/OrderCard/index.tsx | WP01 | 项目视觉基线：默认样式 | normal | complete | inactive：沿用现有视觉规范 |",
    ),
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /项目视觉基线|真实.*路径|开发准入/);
});

/** 验证 complete 必须同时声明适用状态和具体处置。 */
test("complete 缺少适用状态或处置时开发准入拒绝通过", () => {
  const missingState = runValidator(
    "components-readiness",
    buildValidComponentsArtifact(
      "| OrderCard | src/pages/orders/OrderCard/index.tsx | WP01 | https://design.example/node/1 | 不适用 | complete | 按规格开发 |",
    ),
  );
  const missingDisposition = runValidator(
    "components-readiness",
    buildValidComponentsArtifact(
      "| OrderCard | src/pages/orders/OrderCard/index.tsx | WP01 | https://design.example/node/1 | normal | complete | 无 |",
    ),
  );

  assert.equal(missingState.status, 1);
  assert.equal(missingDisposition.status, 1);
  assert.match(`${missingState.stdout}\n${missingDisposition.stdout}`, /适用状态|处置|开发准入/);
});

/** 验证 waived 不能只堆叠证据关键词而缺少逐项内容。 */
test("waived 缺少原话风险或验收范围的具体内容时开发准入拒绝通过", () => {
  const result = runValidator(
    "components-readiness",
    buildValidComponentsArtifact(
      "| LegacyBanner | src/pages/orders/LegacyBanner/index.tsx | WP01 | 无 | normal | waived | 用户原话；残余风险；人工视觉验收范围 |",
    ),
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /用户原话|残余风险|人工视觉验收范围|waived/);
});

test("设计覆盖矩阵含畸形 blocked 行时开发准入拒绝通过", () => {
  const rows = [
    "| OrderCard | src/pages/orders/OrderCard/index.tsx | WP01 | https://design.example/node/1 | normal/loading/error | complete | 按规格开发 |",
    "| LoadingState | src/pages/orders/LoadingState.tsx | WP01 | 尚未定位 | normal/loading/error | blocked |",
  ].join("\n");
  const result = runValidator("components-readiness", buildValidComponentsArtifact(rows));

  assert.equal(result.status, 1);
  assert.match(result.stdout, /七列|矩阵/);
});

test("设计覆盖矩阵含无尾管道的 blocked 行时开发准入拒绝通过", () => {
  const rows = [
    "| OrderCard | src/pages/orders/OrderCard/index.tsx | WP01 | https://design.example/node/1 | normal/loading/error | complete | 按规格开发 |",
    "| LoadingState | src/pages/orders/LoadingState.tsx | WP01 | 尚未定位 | normal/loading/error | blocked | 请求精确节点",
  ].join("\n");
  const result = runValidator("components-readiness", buildValidComponentsArtifact(rows));

  assert.equal(result.status, 1);
  assert.match(result.stdout, /blocked|开发准入/);
});

test("设计覆盖矩阵含无首尾管道的六列 blocked 行时开发准入拒绝通过", () => {
  const rows = [
    "| OrderCard | src/pages/orders/OrderCard/index.tsx | WP01 | https://design.example/node/1 | normal/loading/error | complete | 按规格开发 |",
    "LoadingState | src/pages/orders/LoadingState.tsx | WP01 | 尚未定位 | normal/loading/error | blocked",
  ].join("\n");
  const result = runValidator("components-readiness", buildValidComponentsArtifact(rows));

  assert.equal(result.status, 1);
  assert.match(result.stdout, /七列|矩阵/);
});

test("数据行的完整度写为表头文本时开发准入拒绝通过", () => {
  const rows = [
    "| OrderCard | src/pages/orders/OrderCard/index.tsx | WP01 | https://design.example/node/1 | normal/loading/error | complete | 按规格开发 |",
    "| MisleadingRow | src/pages/orders/MisleadingRow.tsx | WP01 | 尚未定位 | normal | 完整度 | 伪造为表头文本 |",
  ].join("\n");
  const result = runValidator("components-readiness", buildValidComponentsArtifact(rows));

  assert.equal(result.status, 1);
  assert.match(result.stdout, /完整度|矩阵/);
});

test("可见组件标记为 not-applicable 时开发准入拒绝通过", () => {
  const result = runValidator(
    "components-readiness",
    buildValidComponentsArtifact(
      "| OrderCard | src/pages/orders/OrderCard/index.tsx | WP01 | https://design.example/node/1 | normal | not-applicable | 非视觉文件 |",
    ),
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /not-applicable|非视觉文件/);
});

test("反引号包裹的组件入口标记为 not-applicable 时开发准入拒绝通过", () => {
  const result = runValidator(
    "components-readiness",
    buildValidComponentsArtifact(
      "| OrderCard | `src/pages/orders/OrderCard/index.tsx` | WP01 | 不适用 | 不适用 | not-applicable | 非视觉文件 |",
    ),
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /not-applicable|非视觉文件/);
});

test("图片资源标记为 not-applicable 时开发准入拒绝通过", () => {
  const result = runValidator(
    "components-readiness",
    buildValidComponentsArtifact(
      "| OrderCardImage | src/pages/orders/assets/order-card.png | WP01 | 不适用 | 不适用 | not-applicable | 非视觉文件 |",
    ),
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /not-applicable|非视觉文件/);
});

test("hooks 目录中的 tsx 组件入口标记为 not-applicable 时开发准入拒绝通过", () => {
  const result = runValidator(
    "components-readiness",
    buildValidComponentsArtifact(
      "| HookEntry | `src/pages/orders/hooks/index.tsx` | WP01 | 不适用 | 不适用 | not-applicable | 非视觉文件 |",
    ),
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /not-applicable|非视觉文件/);
});

test("utils 目录中的图片资源标记为 not-applicable 时开发准入拒绝通过", () => {
  const result = runValidator(
    "components-readiness",
    buildValidComponentsArtifact(
      "| IconAsset | `src/pages/orders/utils/icon.png` | WP01 | 不适用 | 不适用 | not-applicable | 非视觉文件 |",
    ),
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /not-applicable|非视觉文件/);
});

test("waived 的用户明确决定不在处置列时开发准入拒绝通过", () => {
  const result = runValidator(
    "components-readiness",
    buildValidComponentsArtifact(
      "| 用户明确豁免 Banner | src/pages/orders/LegacyBanner/index.tsx | WP01 | 无 | normal | waived | 人工视觉验收 |",
    ),
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /waived|用户/);
});

test("waived 的人工视觉验收不在处置列时开发准入拒绝通过", () => {
  const result = runValidator(
    "components-readiness",
    buildValidComponentsArtifact(
      "| LegacyBanner | src/pages/orders/LegacyBanner/index.tsx | WP01 | 无 | normal/人工视觉验收 | waived | 用户明确豁免 |",
    ),
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /waived|人工视觉验收|残余风险/);
});

test("PRD 缺少第一性原理分析时拒绝通过", () => {
  const result = runValidator(
    "prd",
    "# PRD\n## 用户故事\n## 页面清单\n## 设计规范\n颜色 字体 间距\n## 验收标准。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /第一性原理/);
});

test("HANDOFF 缺少读取清单和下一动作时拒绝通过", () => {
  const result = runValidator(
    "handoff",
    "# WP01 交接\n## 当前目标\n完成订单筛选。\n## 范围与非目标\n只修改订单列表。\n## 已确认决策与契约\n筛选条件写入 URL。\n## 风险与阻塞项\n无。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /读取清单|下一动作/);
});

test("HANDOFF 包含最小上下文契约时通过", () => {
  const result = runValidator(
    "handoff",
    "# WP01 交接\n## 当前目标与覆盖 UC\n完成订单筛选，覆盖 UC01。\n## 范围与非目标\n范围为订单列表；不修改订单详情。\n## 已确认决策与接口契约\n筛选条件写入 URL，接口为 GET /api/orders。\n## 系统不变量与风险\n权限边界不变；未关闭风险为无。\n## 当前阻塞项\n无。\n## 允许读取清单\n| 路径 | 读取模式 | 范围 | 理由 | 失效条件 |\n|---|---|---|---|---|\n| src/pages/orders | targeted | OrderList | 当前实现 | 范围变化 |\n## 代码与测试范围\nsrc/pages/orders 和订单筛选测试。\n## 下一动作与停止条件\n先写筛选测试；发现共享契约变化时停止。\n",
  );

  assert.equal(result.status, 0, result.stdout);
});

test("组件切片缺少索引版本和生成条件时拒绝通过", () => {
  const result = runValidator(
    "component-slice",
    "# WP01 组件切片\n## 候选组件\n| 名称 | 导入路径 | 用途 |\n|---|---|---|\n| StatusBadge | @/components/StatusBadge | 展示状态 |\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /索引版本|生成条件|来源/);
});

test("组件切片包含来源和候选资源时通过", () => {
  const result = runValidator(
    "component-slice",
    "# WP01 组件切片\n## 索引来源\n完整索引：.dev-flow/project/COMPONENT-INDEX.md；索引版本：sha256:abc123。\n## 生成条件\n模块路径 src/pages/orders；关键词为订单、状态。\n## 候选组件\n| 名称 | 类型 | 导入路径 | 用途 | 关键 Props | 可复用性 | 证据 |\n|---|---|---|---|---|---|---|\n| StatusBadge | 组件 | @/components/StatusBadge | 展示状态 | status | 可直接复用 | 索引匹配 |\n## 未命中与定向回查\n无。\n",
  );

  assert.equal(result.status, 0, result.stdout);
});

test("未提供设计稿时完整组件映射允许设计源登记表使用 inactive 状态", () => {
  const result = runValidator(
    "design-sources",
    "# 设计源登记表\n## 状态判定\n当前状态：`inactive`\n判定依据：当前任务未提供设计稿。\n## 当前任务范围\n用户列表的小功能调整。\n## 模块设计源清单与组件节点映射\n| 模块 | 页面 | UI 组件 | 工作包 | 顶层设计源 | 精确组件节点 | 节点层级路径 | 适用状态 | 完整度 | 关联模块规格 | 提取时间 | 响应式差异 | 文字溢出 |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|\n| 用户列表 | 用户页 | UserCard | WP01 | 无 | 项目视觉基线：src/styles/user-card.module.scss | 用户页/UserCard | normal/loading/error | complete | 无（inactive） | 2026-08-28 10:00 +08:00 | 桌面与移动端沿用现有断点 | ellipsis |\n## 刷新记录\n2026-08-28：完成组件基线登记。\n",
    { projectFiles: { "src/styles/user-card.module.scss": ".userCard { color: #222; }" } },
  );

  assert.equal(result.status, 0, result.stdout);
});

/** 验证旧模块级登记表无法满足组件节点证据契约。 */
test("设计源登记表缺少组件节点层级状态和提取字段时拒绝通过", () => {
  const result = runValidator(
    "design-sources",
    "# 设计源登记表\n## 状态判定\n当前状态：`inactive`。判定依据：当前任务未提供设计稿。\n## 当前任务范围\n用户列表调整。\n## 模块设计源清单\n| 模块 | 工作包 | 设计源 | 完整度 | 规格文件 |\n|---|---|---|---|---|\n| 用户列表 | WP01 | 无 | 不适用 | 无 |\n## 刷新记录\n2026-08-28：完成初始判定。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /UI 组件|精确组件节点|节点层级路径|适用状态|提取时间|响应式差异|文字溢出/);
});

/** 验证存在设计链接时不能把需求状态登记为 inactive。 */
test("已提供设计源时 inactive 状态拒绝通过", () => {
  const result = runValidator(
    "design-sources",
    "# 设计源登记表\n## 状态判定\n当前状态：`inactive`\n判定依据：已有设计稿。\n## 当前任务范围\n用户列表调整。\n## 模块设计源清单与组件节点映射\n| 模块 | 页面 | UI 组件 | 工作包 | 顶层设计源 | 精确组件节点 | 节点层级路径 | 适用状态 | 完整度 | 关联模块规格 | 提取时间 | 响应式差异 | 文字溢出 |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|\n| 用户列表 | 用户页 | UserCard | WP01 | https://design.example/file/1 | https://design.example/file/1?node-id=2 | 用户页/UserCard | normal | complete | design/user-list.md | 2026-08-28 | 无差异 | ellipsis |\n## 刷新记录\n2026-08-28：完成提取。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /inactive|required|设计源/);
});

/** 验证任务级 waived 不再覆盖已经提供的 required 设计源。 */
test("任务级 waived 状态不能覆盖已提供设计源", () => {
  const result = runValidator(
    "design-sources",
    "# 设计源登记表\n## 状态判定\n当前状态：`waived`。用户原话：整体跳过。\n## 当前任务范围\n用户列表调整。\n## 模块设计源清单与组件节点映射\n| 模块 | 页面 | UI 组件 | 工作包 | 顶层设计源 | 精确组件节点 | 节点层级路径 | 适用状态 | 完整度 | 关联模块规格 | 提取时间 | 响应式差异 | 文字溢出 |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|\n| 用户列表 | 用户页 | UserCard | WP01 | https://design.example/file/1 | 无 | 用户页/UserCard | normal | waived | design/user-list.md | 2026-08-28 | 无差异 | ellipsis |\n## 刷新记录\n2026-08-28：标记任务豁免。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /任务级|waived|inactive|required/);
});

/** 验证宽松拼接不能让非法任务级 waived 借后续 required 穿透。 */
test("状态判定把 waived 与 required 拼接时拒绝通过", () => {
  const result = runValidator(
    "design-sources",
    VALID_REQUIRED_DESIGN_SOURCES.replace(
      "- **当前状态**：`required`",
      "- **当前状态**：`waived`，后续切换为 `required`",
    ),
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /当前状态|inactive|required|waived/);
});

/** 验证状态判定章节本身登记的 URL 也会触发 required。 */
test("状态判定章节含设计链接时 inactive 拒绝通过", () => {
  const content = "# 设计源登记表\n## 状态判定\n当前状态：`inactive`\n设计源证据：https://design.example/file/abc\n## 当前任务范围\n用户列表调整。\n## 模块设计源清单与组件节点映射\n| 模块 | 页面 | UI 组件 | 工作包 | 顶层设计源 | 精确组件节点 | 节点层级路径 | 适用状态 | 完整度 | 关联模块规格 | 提取时间 | 响应式差异 | 文字溢出 |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|\n| 用户列表 | 用户页 | UserCard | WP01 | 无 | 项目视觉基线：src/styles/user-card.module.scss | 用户页/UserCard | normal | complete | 无（inactive） | 2026-08-28 | 沿用现有断点 | ellipsis |\n## 刷新记录\n2026-08-28：完成登记。\n";
  const result = runValidator("design-sources", content, {
    projectFiles: { "src/styles/user-card.module.scss": ".userCard { color: #222; }" },
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /inactive|required|设计源/);
});

/** 验证全文不能通过重复状态判定章节保留多套任务状态。 */
test("设计源登记表包含重复状态判定章节时拒绝通过", () => {
  const result = runValidator(
    "design-sources",
    VALID_REQUIRED_DESIGN_SOURCES.replace(
      "## 2. 当前任务范围",
      "## 状态判定\n当前状态：`required`\n## 2. 当前任务范围",
    ),
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /状态判定|恰好.*一个|唯一/);
});

/** 验证当前状态字段即使位于其他章节也会被计入全文唯一性。 */
test("设计源登记表全文包含重复当前状态时拒绝通过", () => {
  const result = runValidator(
    "design-sources",
    VALID_REQUIRED_DESIGN_SOURCES.replace(
      "用户列表调整。",
      "当前状态：`required`\n用户列表调整。",
    ),
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /当前状态|恰好.*一个|唯一/);
});

/** 验证非法值的当前状态字段也会参与全文字段唯一性计数。 */
test("设计源登记表其他章节包含非法重复当前状态字段时拒绝通过", () => {
  const result = runValidator(
    "design-sources",
    VALID_REQUIRED_DESIGN_SOURCES.replace(
      "用户列表调整。",
      "当前状态：`waived`\n用户列表调整。",
    ),
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /当前状态|恰好.*一个|唯一/);
});

/** 验证合法 required 字段不能掩盖状态章节中的任务级 waived。 */
test("状态判定章节包含任务级 waived 说明时拒绝通过", () => {
  const result = runValidator(
    "design-sources",
    VALID_REQUIRED_DESIGN_SOURCES.replace(
      "判定依据：已提供顶层设计源。",
      "任务级 waived：整体跳过设计。\n判定依据：已提供顶层设计源。",
    ),
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /状态判定|waived|任务级/);
});

/** required complete 映射中每项字段都必须是真实可回查证据。 */
const INVALID_REQUIRED_DESIGN_SOURCE_FIELDS = [
  ["顶层设计源", "https://design.example/file/abc", "无"],
  ["精确组件节点", "https://design.example/file/abc?node-id=2", "https://design.example/file/abc"],
  ["节点层级路径", "用户页/UserList/UserCard", "无"],
  ["适用状态", "normal/hover/loading/error", "不适用"],
  ["提取时间", "2026-08-28 10:00 +08:00", "无"],
  ["响应式差异", "768px 下切换单列", "无"],
  ["文字溢出", "ellipsis", "不适用"],
];

for (const [fieldName, validValue, invalidValue] of INVALID_REQUIRED_DESIGN_SOURCE_FIELDS) {
  /** 验证 required complete 行无法用空语义值冒充具体组件证据。 */
  test(`required complete 的${fieldName}为无效值时拒绝通过`, () => {
    const result = runValidator(
      "design-sources",
      VALID_REQUIRED_DESIGN_SOURCES.replace(validValue, invalidValue),
    );

    assert.equal(result.status, 1);
    assert.match(result.stdout, /组件|精确|层级|状态|提取|响应式|溢出|设计源/);
  });
}

/** required complete 行的关联模块规格必须是可执行的真实证据。 */
const INVALID_REQUIRED_MODULE_SPEC_VALUES = ["无", "N/A", "TODO", "待补", "待补充", "占位"];

for (const invalidValue of INVALID_REQUIRED_MODULE_SPEC_VALUES) {
  /** 验证真实 CLI 会逐一拒绝关联模块规格列的通用空语义。 */
  test(`required complete 的关联模块规格为 ${invalidValue} 时拒绝通过`, () => {
    const result = runValidator(
      "design-sources",
      VALID_REQUIRED_DESIGN_SOURCES.replace("design/user-list.md", invalidValue),
    );

    assert.equal(result.status, 1);
    assert.match(result.stdout, /关联模块规格|组件.*证据/);
  });
}

/** required complete 与 blocked 行中的占位语义和伪日期反例。 */
const INVALID_DESIGN_SOURCE_PLACEHOLDER_FIELDS = [
  ["节点层级占位", "用户页/UserList/UserCard", "占位"],
  ["适用状态 unknown", "normal/hover/loading/error", "unknown"],
  ["文字溢出占位", "ellipsis", "占位"],
  ["伪提取时间", "2026-08-28 10:00 +08:00", "占位 2026-08-28"],
];

for (const [fieldName, validValue, invalidValue] of INVALID_DESIGN_SOURCE_PLACEHOLDER_FIELDS) {
  /** 验证占位词或夹带日期不能冒充 complete 组件证据。 */
  test(`required complete 的${fieldName}拒绝通过`, () => {
    const result = runValidator(
      "design-sources",
      VALID_REQUIRED_DESIGN_SOURCES.replace(validValue, invalidValue),
    );

    assert.equal(result.status, 1);
    assert.match(result.stdout, /占位|unknown|提取时间|组件|证据/);
  });
}

/** 验证非 complete 分支也不能把 N/A 当作已填写字段。 */
test("required blocked 映射使用 N/A 时拒绝通过", () => {
  const content = VALID_REQUIRED_DESIGN_SOURCES
    .replace("https://design.example/file/abc?node-id=2", "N/A")
    .replace("| complete |", "| blocked |");
  const result = runValidator("design-sources", content);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /N\/A|占位|组件|证据/);
});

test("设计源登记表使用任务级 waived 状态时拒绝通过", () => {
  const result = runValidator(
    "design-sources",
    "# 设计源登记表\n## 状态判定\n当前状态：`waived`。\n## 当前任务范围\n用户列表调整。\n## 模块设计源清单\n| 模块 | 工作包 | 设计源 | 完整度 | 规格文件 |\n|---|---|---|---|---|\n| 用户列表 | WP01 | 不适用 | 豁免 | 无 |\n## 刷新记录\n2026-08-27：标记豁免。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /inactive|required|waived.*逐组件/);
});

test("用户明确豁免设计稿时 PRD 不强制设计 Token", () => {
  const result = runValidator(
    "prd",
    "# PRD\n## 第一性原理分析\n成功指标：功能验收通过。事实证据来源：用户说明。假设验证方式：运行测试。最小方案：局部修改。停止条件：验收失败时回退。\n## 用户故事\n作为管理员，我希望调整提示文案，以便准确理解操作。\n## 页面/模块清单\n用户列表模块。\n## 设计规范\n当前状态：`waived`。用户明确原话：本次不需要设计稿。视觉结果采用人工验收。\n## 需求拆分就绪\n结论：READY。高影响未知项：无，证据为现有实现和用户说明。\n## 验收标准\n提示文案与确认内容一致。\n",
  );

  assert.equal(result.status, 0);
});

test("包含来源和完整状态的模块设计规格通过校验", () => {
  const result = runValidator("module-design-spec", VALID_COMPLETE_MODULE_DESIGN_SPEC);

  assert.equal(result.status, 0, result.stdout);
});

test("complete 模块规格必须引用 COMPONENTS 与 DESIGN-SOURCES 对应记录", () => {
  const content = VALID_COMPLETE_MODULE_DESIGN_SPEC.replace(
    /## 证据引用[\s\S]*?(?=## 布局与尺寸)/,
    "",
  );
  const result = runValidator("module-design-spec", content);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /证据引用|COMPONENTS|DESIGN-SOURCES/);
});

test("complete 模块规格的设计 Token 必须结构化覆盖五类视觉属性", () => {
  const content = VALID_COMPLETE_MODULE_DESIGN_SPEC.replace(
    "| 间距 | spacing-card | 12px | UserCard |\n",
    "",
  );
  const result = runValidator("module-design-spec", content);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /设计 Token|颜色|字体|间距|圆角|阴影/);
});

test("complete 模块规格的布局尺寸不能使用非结构化描述", () => {
  const content = VALID_COMPLETE_MODULE_DESIGN_SPEC.replace(
    /## 布局与尺寸[\s\S]*?(?=## 设计 Token)/,
    "## 布局与尺寸\n桌面布局，内容宽度 1200px，表格行高 48px。\n",
  );
  const result = runValidator("module-design-spec", content);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /布局与尺寸|结构化|宽度|高度|间距/);
});

test("complete 模块规格不能只罗列状态名称而缺少逐状态规格证据", () => {
  const content = VALID_COMPLETE_MODULE_DESIGN_SPEC.replace(
    /## 组件状态[\s\S]*?(?=## 文字与溢出)/,
    "## 组件状态\nnormal、hover、active、focus、disabled、loading、empty、error。\n",
  );
  const result = runValidator("module-design-spec", content);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /组件状态|逐.*状态|规格|证据|表格/);
});

test("complete 模块规格的适用状态规格为空时拒绝通过", () => {
  const content = VALID_COMPLETE_MODULE_DESIGN_SPEC.replace(
    "| UserCard | hover | 阴影提升至 0 4px 12px #00000026 | UserCard/hover |",
    "| UserCard | hover |  | UserCard/hover |",
  );
  const result = runValidator("module-design-spec", content);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /组件状态|规格|非空|证据/);
});

/** complete 模块规格不允许在关键组件证据中使用空语义值。 */
const INVALID_COMPLETE_MODULE_FIELDS = [
  ["精确节点链接", "https://mastergo.com/file/abc?node-id=2", "https://mastergo.com/file/abc"],
  [
    "组件映射节点层级路径",
    "| UserCard | 用户页 | UserCard | https://mastergo.com/file/abc?node-id=2 | 用户页/UserList/UserCard |",
    "| UserCard | 用户页 | UserCard | https://mastergo.com/file/abc?node-id=2 | 无 |",
  ],
  ["适用状态", "normal/hover/loading/error", "不适用"],
  ["响应式规则", "| 768px | 单列 | 间距 12px |", "| 768px | 无 | 无 |"],
  ["文字溢出", "| 用户名 | 14px/20px | 1 行 | ellipsis |", "| 用户名 | 14px/20px | 1 行 | 无 |"],
];

for (const [fieldName, validValue, invalidValue] of INVALID_COMPLETE_MODULE_FIELDS) {
  /** 验证 complete 模块规格的逐字段证据不能退化为普通链接或空语义。 */
  test(`complete 模块规格的${fieldName}无效时拒绝通过`, () => {
    const result = runValidator(
      "module-design-spec",
      VALID_COMPLETE_MODULE_DESIGN_SPEC.replace(validValue, invalidValue),
    );

    assert.equal(result.status, 1);
    assert.match(result.stdout, /精确|节点|层级|状态|响应式|溢出/);
  });
}

/** complete 模块规格中的占位语义、伪日期和空布局反例。 */
const INVALID_COMPLETE_MODULE_PLACEHOLDER_FIELDS = [
  [
    "设计源伪提取时间",
    "提取时间：2026-08-28 10:00 +08:00。",
    "提取时间：占位 2026-08-28。",
  ],
  [
    "组件映射伪提取时间",
    "| 用户页/UserList/UserCard | 2026-08-28 10:00 +08:00 | normal/hover/loading/error |",
    "| 用户页/UserList/UserCard | 占位 2026-08-28 | normal/hover/loading/error |",
  ],
  [
    "组件映射层级占位",
    "| UserCard | 用户页 | UserCard | https://mastergo.com/file/abc?node-id=2 | 用户页/UserList/UserCard |",
    "| UserCard | 用户页 | UserCard | https://mastergo.com/file/abc?node-id=2 | 占位 |",
  ],
  ["响应式 unknown", "| 768px | 单列 | 间距 12px |", "| 768px | unknown | unknown |"],
  ["文字溢出占位", "| 用户名 | 14px/20px | 1 行 | ellipsis |", "| 用户名 | 14px/20px | 1 行 | 占位 |"],
  [
    "布局与尺寸为空语义",
    "| UserCard | grid | 1200px | 48px | 12px | 左对齐 |",
    "| UserCard | grid | 无 | 无 | 无 | 左对齐 |",
  ],
];

for (const [fieldName, validValue, invalidValue] of INVALID_COMPLETE_MODULE_PLACEHOLDER_FIELDS) {
  /** 验证 complete 模块规格不能用占位词、夹带日期或空布局冒充证据。 */
  test(`complete 模块规格的${fieldName}拒绝通过`, () => {
    const result = runValidator(
      "module-design-spec",
      VALID_COMPLETE_MODULE_DESIGN_SPEC.replace(validValue, invalidValue),
    );

    assert.equal(result.status, 1);
    assert.match(result.stdout, /占位|unknown|提取时间|布局|节点|响应式|溢出|证据/);
  });
}

/** 验证模块规格必须携带组件节点、层级、状态、响应式与溢出证据。 */
test("模块设计规格缺少组件级新增证据字段时拒绝通过", () => {
  const result = runValidator(
    "module-design-spec",
    "# 模块设计规格：用户列表\n## 设计源\n模块链接：https://mastergo.com/file/abc?node-id=1。提取时间：2026-08-28。节点范围：用户列表。\n## 布局与尺寸\n桌面布局。\n## 组件状态\nnormal、hover、active、focus、disabled、loading、empty、error。\n## 文字与溢出\nellipsis。\n## 提取完整度\n结论：`complete`。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /UI 组件.*精确节点映射|节点层级路径|响应式规则|文字.*溢出/);
});

test("模块设计规格缺少可回查设计源时拒绝通过", () => {
  const result = runValidator(
    "module-design-spec",
    "# 模块设计规格：用户列表\n## 设计源\n来源稍后补充。\n## 布局与尺寸\n桌面布局。\n## 组件状态\nnormal、hover、active、focus、disabled、loading、empty、error。\n## 文字与溢出\nellipsis。\n## 提取完整度\n结论：`complete`。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /链接|设计源/);
});

test("第一性原理章节缺少可执行字段时拒绝通过", () => {
  const result = runValidator(
    "prd",
    "# PRD\n## 第一性原理分析\n稍后补充。\n## 用户故事\n## 页面清单\n## 设计规范\n颜色 字体 间距\n## 验收标准。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /成功指标|事实.*证据|假设.*验证|最小.*方案|停止.*条件/);
});

test("第一性原理字段仍是占位内容时拒绝通过", () => {
  const result = runValidator(
    "prd",
    "# PRD\n## 第一性原理分析\n成功指标：待补充。事实证据来源：...。假设验证方式：TODO。最小方案：{方案}。停止条件：稍后补充。\n## 用户故事\n## 页面清单\n## 设计规范\n颜色 字体 间距\n## 验收标准。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /占位/);
});

test("PRD 缺少需求拆分就绪判断时拒绝通过", () => {
  const result = runValidator(
    "prd",
    "# PRD\n## 第一性原理分析\n成功指标有目标值。事实有证据来源。假设有验证方式。最小可行方案明确。停止条件明确。\n## 用户故事\n## 页面清单\n## 设计规范\n颜色 字体 间距\n## 验收标准。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /拆分就绪/);
});

test("用户确认且职责目录树已引用设计覆盖版本的最终 TDD 无需架构对抗审查", () => {
  const result = runValidator("tdd", VALID_CONFIRMED_TDD_WITHOUT_ADVERSARIAL_REVIEW);

  assert.equal(result.status, 0, result.stdout);
});

test("架构方案在用户确认前可以使用 proposal 类型完成结构校验", () => {
  const tddResult = runValidator("tdd-proposal", VALID_TDD_PROPOSAL);
  const globalArchitectureResult = runValidator(
    "global-architecture-proposal",
    VALID_GLOBAL_ARCHITECTURE_PROPOSAL,
  );

  assert.equal(tddResult.status, 0, tddResult.stdout);
  assert.equal(globalArchitectureResult.status, 0, globalArchitectureResult.stdout);
});

test("TDD proposal 缺少职责目录树时拒绝在用户确认前通过", () => {
  const content = VALID_TDD_PROPOSAL.replace(
    /## 职责目录树[\s\S]*?(?=## 设计覆盖版本)/,
    "",
  );
  const result = runValidator("tdd-proposal", content);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /职责目录树/);
});

test("TDD proposal 缺少 COMPONENTS.md 设计覆盖版本时拒绝通过", () => {
  const content = VALID_TDD_PROPOSAL.replace(
    /## 设计覆盖版本[\s\S]*?(?=## 数据流)/,
    "",
  );
  const result = runValidator("tdd-proposal", content);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /COMPONENTS\.md|设计覆盖版本/);
});

test("全局架构 proposal 缺少共享职责目录树时拒绝通过", () => {
  const content = VALID_GLOBAL_ARCHITECTURE_PROPOSAL.replace(
    /## 共享职责目录树[\s\S]*?(?=## 共享可见组件设计归属)/,
    "",
  );
  const result = runValidator("global-architecture-proposal", content);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /职责目录树/);
});

test("全局架构 proposal 缺少共享可见组件设计归属时拒绝通过", () => {
  const content = VALID_GLOBAL_ARCHITECTURE_PROPOSAL.replace(
    /## 共享可见组件设计归属[\s\S]*?(?=## 全局 API 层)/,
    "",
  );
  const result = runValidator("global-architecture-proposal", content);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /共享可见组件|COMPONENTS\.md|工作包/);
});

test("全局架构 proposal 漏配一个共享可见组件时拒绝通过", () => {
  const content = VALID_GLOBAL_ARCHITECTURE_PROPOSAL.replace(
    "| Status | WP01 COMPONENTS.md |\n",
    "",
  );
  const result = runValidator("global-architecture-proposal", content);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /共享可见组件|COMPONENTS\.md|工作包/);
});

test("最终 TDD 缺少用户明确确认时拒绝通过", () => {
  const result = runValidator("tdd", UNCONFIRMED_TDD_WITHOUT_ADVERSARIAL_REVIEW);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /用户已确认技术方案/);
});

test("技术方案仍为待确认状态时不能用候选值中的 CONFIRMED 绕过门禁", () => {
  const content = VALID_CONFIRMED_TDD_WITHOUT_ADVERSARIAL_REVIEW
    .replace("方案确认状态：CONFIRMED", "方案确认状态：PENDING_USER_CONFIRMATION / CONFIRMED")
    .replace(
      "确认依据：用户于 2026-08-28 明确确认当前技术方案。",
      "确认依据：用户尚未确认。",
    );
  const result = runValidator(
    "tdd",
    content,
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /用户已确认技术方案/);
});

test("确认依据明确写着用户未确认时拒绝通过", () => {
  const content = VALID_CONFIRMED_TDD_WITHOUT_ADVERSARIAL_REVIEW.replace(
    "确认依据：用户于 2026-08-28 明确确认当前技术方案。",
    "确认依据：用户尚未确认当前技术方案。",
  );
  const result = runValidator("tdd", content);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /用户已确认技术方案/);
});

test("最终技术方案确认依据包含用户否定确认语义时拒绝通过", () => {
  const negativeConfirmations = [
    "用户于 2026-08-28 拒绝确认当前技术方案。",
    "用户于 2026-08-28 不同意确认当前技术方案。",
    "用户于 2026-08-28 取消确认当前技术方案。",
  ];

  for (const confirmation of negativeConfirmations) {
    const content = VALID_CONFIRMED_TDD_WITHOUT_ADVERSARIAL_REVIEW.replace(
      "用户于 2026-08-28 明确确认当前技术方案。",
      confirmation,
    );
    const result = runValidator("tdd", content);

    assert.equal(result.status, 1, `${confirmation}\n${result.stdout}`);
    assert.match(result.stdout, /用户已确认技术方案/);
  }
});

test("最终技术方案确认依据写明用户不确认时拒绝通过", () => {
  const content = VALID_CONFIRMED_TDD_WITHOUT_ADVERSARIAL_REVIEW.replace(
    "用户于 2026-08-28 明确确认当前技术方案。",
    "用户于 2026-08-28 不确认当前技术方案。",
  );
  const result = runValidator("tdd", content);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /用户已确认技术方案/);
});

test("最终技术方案确认依据在日期后写明用户无法明确确认时拒绝通过", () => {
  const content = VALID_CONFIRMED_TDD_WITHOUT_ADVERSARIAL_REVIEW.replace(
    "用户于 2026-08-28 明确确认当前技术方案。",
    "用户于 2026-08-28 无法明确确认当前技术方案。",
  );
  const result = runValidator("tdd", content);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /用户已确认技术方案/);
});

test("最终技术方案确认依据在日期后写明用户不能明确确认时拒绝通过", () => {
  const content = VALID_CONFIRMED_TDD_WITHOUT_ADVERSARIAL_REVIEW.replace(
    "用户于 2026-08-28 明确确认当前技术方案。",
    "用户于 2026-08-28 不能明确确认当前技术方案。",
  );
  const result = runValidator("tdd", content);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /用户已确认技术方案/);
});

test("最终技术方案确认依据在日期后写明用户不做明确确认时拒绝通过", () => {
  const content = VALID_CONFIRMED_TDD_WITHOUT_ADVERSARIAL_REVIEW.replace(
    "用户于 2026-08-28 明确确认当前技术方案。",
    "用户于 2026-08-28 不做明确确认当前技术方案。",
  );
  const result = runValidator("tdd", content);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /用户已确认技术方案/);
});

test("最终技术方案确认依据允许用户无日期明确确认本方案", () => {
  const content = VALID_CONFIRMED_TDD_WITHOUT_ADVERSARIAL_REVIEW.replace(
    "用户于 2026-08-28 明确确认当前技术方案。",
    "用户明确确认本方案。",
  );
  const result = runValidator("tdd", content);

  assert.equal(result.status, 0, result.stdout);
});

test("最终技术方案确认依据拒绝日期与本方案的混合格式", () => {
  const content = VALID_CONFIRMED_TDD_WITHOUT_ADVERSARIAL_REVIEW.replace(
    "用户于 2026-08-28 明确确认当前技术方案。",
    "用户于 2026-08-28 明确确认本方案。",
  );
  const result = runValidator("tdd", content);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /用户已确认技术方案/);
});

test("最终技术方案确认依据拒绝无日期与当前技术方案的混合格式", () => {
  const content = VALID_CONFIRMED_TDD_WITHOUT_ADVERSARIAL_REVIEW.replace(
    "用户于 2026-08-28 明确确认当前技术方案。",
    "用户明确确认当前技术方案。",
  );
  const result = runValidator("tdd", content);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /用户已确认技术方案/);
});

test("同一确认依据中的正向确认文字不能覆盖否定确认语义", () => {
  const content = VALID_CONFIRMED_TDD_WITHOUT_ADVERSARIAL_REVIEW.replace(
    "用户于 2026-08-28 明确确认当前技术方案。",
    "用户否认已经确认当前技术方案；后续‘用户确认’仅为系统字段说明。",
  );
  const result = runValidator("tdd", content);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /用户已确认技术方案/);
});

test("用户确认且共享职责目录树完整的全局架构无需架构对抗审查", () => {
  const result = runValidator(
    "global-architecture",
    VALID_CONFIRMED_GLOBAL_ARCHITECTURE_WITHOUT_ADVERSARIAL_REVIEW,
  );

  assert.equal(result.status, 0, result.stdout);
});

test("纯类型与 API 共享架构可结构化声明无共享可见组件", () => {
  const result = runValidator(
    "global-architecture-proposal",
    "# 全局架构\n## 统一数据模型\ninterface SharedOrderData { id: string; }\n## 共享组件与契约\n共享范围只有类型与 API 契约。\n### 共享可见组件声明\n共享可见组件结论：无共享可见组件。\n非视觉证明：仅包含 src/types/order.ts 与 src/services/order.ts，不包含 JSX、Vue、HTML 或样式渲染。\n## 共享职责目录树\nsrc/ # [不变][共享] 源码根目录；禁止扩展到视觉组件。\n├── types/order.ts # [新增][共享] 共享订单类型；只负责跨工作包数据契约。\n└── services/order.ts # [新增][共享] 共享订单 API；只负责 GET/POST 请求契约。\n## 共享可见组件设计归属\n设计归属结论：不适用：无共享可见组件，因此没有工作包视觉矩阵归属。\n## 全局路由与布局\nsrc/pages/orders/ 仍由 WP01 拥有，不修改布局。\n## 各工作包架构边界\nWP01 与 WP02 只引用共享订单类型和 API。\n## 风险评估\n共享字段漂移总分 12；通过契约测试与版本回滚控制。\n",
  );

  assert.equal(result.status, 0, result.stdout);
});

test("无共享可见组件分支夹带视觉组件文件时拒绝通过", () => {
  const result = runValidator(
    "global-architecture-proposal",
    "# 全局架构\n## 统一数据模型\ninterface SharedOrderData { id: string; }\n## 共享组件与契约\n共享类型与按钮。\n### 共享可见组件声明\n共享可见组件结论：无共享可见组件。\n非视觉证明：仅包含 types 与 API。\n## 共享职责目录树\nsrc/components/SharedButton.tsx # [新增][共享] 共享按钮；负责渲染跨工作包操作入口。\n## 共享可见组件设计归属\n设计归属结论：不适用：无共享可见组件。\n## 全局路由与布局\nsrc/pages/orders/ 由 WP01 拥有。\n## 各工作包架构边界\nWP01 与 WP02 引用共享按钮。\n## 风险评估\n视觉漂移总分 12；回滚共享按钮。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /无共享可见组件|非视觉|视觉组件|\.tsx/);
});

test("最终 TDD 缺少职责目录树时拒绝通过", () => {
  const content = VALID_CONFIRMED_TDD_WITHOUT_ADVERSARIAL_REVIEW.replace(
    /## 职责目录树[\s\S]*?(?=## 设计覆盖版本)/,
    "",
  );
  const result = runValidator("tdd", content);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /职责目录树/);
});

test("最终 TDD 缺少 COMPONENTS.md 设计覆盖版本引用时拒绝通过", () => {
  const content = VALID_CONFIRMED_TDD_WITHOUT_ADVERSARIAL_REVIEW.replace(
    /## 设计覆盖版本[\s\S]*?(?=## 数据流)/,
    "",
  );
  const result = runValidator("tdd", content);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /COMPONENTS\.md|设计覆盖版本/);
});

test("最终全局架构缺少共享职责目录树时拒绝通过", () => {
  const content = VALID_CONFIRMED_GLOBAL_ARCHITECTURE_WITHOUT_ADVERSARIAL_REVIEW.replace(
    /## 共享职责目录树[\s\S]*?(?=## 共享可见组件设计归属)/,
    "",
  );
  const result = runValidator("global-architecture", content);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /职责目录树/);
});

test("全局架构的每个共享可见组件都必须归属具体工作包设计矩阵", () => {
  const content = VALID_CONFIRMED_GLOBAL_ARCHITECTURE_WITHOUT_ADVERSARIAL_REVIEW.replace(
    "| Status | WP01 COMPONENTS.md |\n",
    "",
  );
  const result = runValidator("global-architecture", content);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /共享可见组件|COMPONENTS\.md|工作包/);
});

test("共享可见组件归属必须覆盖声明中的全部使用工作包", () => {
  const content = VALID_CONFIRMED_GLOBAL_ARCHITECTURE_WITHOUT_ADVERSARIAL_REVIEW.replace(
    "| Status | interface StatusProps { status: string; } | WP01 |",
    "| Status | interface StatusProps { status: string; } | WP01、WP02 |",
  );
  const result = runValidator("global-architecture", content);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /共享可见组件|COMPONENTS\.md|工作包/);
});

test("全局架构使用纯文本声明共享可见组件时拒绝通过", () => {
  const content = VALID_CONFIRMED_GLOBAL_ARCHITECTURE_WITHOUT_ADVERSARIAL_REVIEW.replace(
    /### 共享可见组件声明[\s\S]*?(?=## 共享职责目录树)/,
    "### 共享可见组件声明\nStatus 负责共享状态文字，Props 契约为 interface StatusProps { status: string; }。\nStatusBadge 负责共享状态标签，Props 契约为 interface StatusBadgeProps { status: string; }。\n",
  );
  const result = runValidator("global-architecture", content);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /声明表|共享可见组件/);
});

test("TDD proposal 复制设计覆盖矩阵时拒绝通过", () => {
  const result = runValidator(
    "tdd-proposal",
    `${VALID_TDD_PROPOSAL}\n${DUPLICATED_DESIGN_COVERAGE_MATRIX}`,
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /不得复制|设计覆盖矩阵/);
});

test("最终 TDD 复制设计覆盖矩阵时拒绝通过", () => {
  const result = runValidator(
    "tdd",
    `${VALID_CONFIRMED_TDD_WITHOUT_ADVERSARIAL_REVIEW}\n${DUPLICATED_DESIGN_COVERAGE_MATRIX}`,
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /不得复制|设计覆盖矩阵/);
});

test("TDD proposal 使用副本标题复制设计覆盖矩阵时拒绝通过", () => {
  const duplicatedMatrix = DUPLICATED_DESIGN_COVERAGE_MATRIX.replace(
    "## 设计覆盖矩阵",
    "## 设计覆盖矩阵副本",
  );
  const result = runValidator("tdd-proposal", `${VALID_TDD_PROPOSAL}\n${duplicatedMatrix}`);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /不得复制|设计覆盖矩阵/);
});

test("最终 TDD 包含无标题七列设计覆盖表时拒绝通过", () => {
  const duplicatedMatrix = DUPLICATED_DESIGN_COVERAGE_MATRIX.replace(
    "## 设计覆盖矩阵\n",
    "",
  );
  const result = runValidator(
    "tdd",
    `${VALID_CONFIRMED_TDD_WITHOUT_ADVERSARIAL_REVIEW}\n${duplicatedMatrix}`,
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /不得复制|设计覆盖矩阵/);
});

test("异步路径将乱序或重复提交评为 8 分时拒绝通过", () => {
  const content = VALID_CONFIRMED_TDD_WITHOUT_ADVERSARIAL_REVIEW.replace(
    "异步风险判定：乱序响应 12 分，重复提交 12 分。",
    "异步风险判定：乱序响应 8 分，重复提交 8 分。",
  );
  const result = runValidator("tdd", content);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /乱序响应.*重复提交.*至少为9分/);
});

test("审查报告缺少反例验证和运行证据时拒绝通过", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n## 问题清单\n当前没有问题。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /反例验证|运行证据/);
});

test("运行证据缺少本轮命令、退出码或结果摘要时拒绝通过", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n## 审查依据层级\n## 问题清单\n当前没有问题。\n## 反例验证\n乱序响应已验证。\n## 运行证据\n稍后补充。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /实际命令|退出码|结果摘要/);
});

test("运行证据仍是占位内容时拒绝通过", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n## 审查依据层级\n## 问题清单\n当前没有问题。\n## 反例验证\n乱序响应已验证。\n## 运行证据\n本轮实际命令：{项目实际命令}，执行时间：待补充，退出码：...，结果摘要：TODO，原始输出：稍后补充。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /占位/);
});

test("review-proposal 拒绝有级别但没有稳定编号的问题标题", () => {
  const result = runValidator(
    "review-proposal",
    "# 审查报告\n## 审查摘要\n审查轮次：第 1 轮。\n## 复审模式与输入范围\n模式：full。首轮覆盖当前工作包。\n## 问题状态\n待用户决定。\n## 级别变更记录\n无。\n## 审查依据层级\n用户目标优先。\n## 问题清单\n### P0: 重复提交\n修复方案：增加提交锁。\n## 反例验证\n重复提交可复现。\n## 运行证据\n本轮实际命令 node --test，执行时间 2026-08-28，退出码 0，结果摘要为测试通过。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /稳定问题编号|### P0-1|未编号/);
});

test("review-proposal 拒绝重复稳定问题编号", () => {
  const result = runValidator(
    "review-proposal",
    "# 审查报告\n## 审查摘要\n审查轮次：第 1 轮。\n## 复审模式与输入范围\n模式：full。首轮覆盖当前工作包。\n## 问题状态\n待用户决定。\n## 级别变更记录\n无。\n## 审查依据层级\n用户目标优先。\n## 问题清单\n### P1-1: 错误提示缺失\n修复方案：补充统一提示。\n### P1-1: 错误日志缺失\n修复方案：记录结构化错误。\n## 反例验证\n网络失败可复现。\n## 运行证据\n本轮实际命令 node --test，执行时间 2026-08-28，退出码 0，结果摘要为测试通过。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /P1-1.*重复|重复.*P1-1/);
});

test("最终 review 不能用 NO_CHANGES_REQUESTED 掩盖未编号问题", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n审查轮次：第 1 轮。\n## 复审模式与输入范围\n模式：full。首轮覆盖当前工作包。\n## 问题状态\n待用户决定。\n## 级别变更记录\n无。\n## 审查依据层级\n用户目标优先。\n## 问题清单\n### [P2] 命名不清晰\n修复方案：调整变量名。\n## 审查问题处置\nNO_CHANGES_REQUESTED。\n## 反例验证\n变量语义不可辨识。\n## 运行证据\n本轮实际命令 node --test，执行时间 2026-08-28，退出码 0，结果摘要为测试通过。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /稳定问题编号|NO_CHANGES_REQUESTED|未编号/);
});

test("代码审查存在问题但缺少用户处置记录时拒绝通过", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n审查轮次：第 1 轮。\n## 复审模式与输入范围\n模式：full。首轮覆盖当前工作包。\n## 问题状态\n待用户决定，修复方案见问题清单。\n## 级别变更记录\n无。\n## 审查依据层级\n用户目标优先。\n## 问题清单\n### P0-1: 重复提交\n修复方案：增加提交锁。\n## 反例验证\n重复提交可复现。\n## 运行证据\n本轮实际命令 node --test，执行时间 2026-08-28，退出码 0，结果摘要为测试通过。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /用户.*处置|审查问题处置/);
});

test("审查候选允许在用户处置前通过且最终审查仍被门禁阻止", () => {
  const content = "# 审查报告\n## 审查摘要\n审查轮次：第 1 轮。\n## 复审模式与输入范围\n模式：full。首轮覆盖当前工作包。\n## 问题状态\n待用户决定，修复方案见问题清单。\n## 级别变更记录\n无。\n## 审查依据层级\n用户目标优先。\n## 问题清单\n### P0-1: 重复提交\n修复方案：增加提交锁。\n## 反例验证\n重复提交可复现。\n## 运行证据\n本轮实际命令 node --test，执行时间 2026-08-28，退出码 0，结果摘要为测试通过。\n";
  const proposalResult = runValidator("review-proposal", content);
  const finalResult = runValidator("review", content);

  assert.equal(proposalResult.status, 0, proposalResult.stdout);
  assert.equal(finalResult.status, 1);
  assert.match(finalResult.stdout, /审查问题处置/);
});

test("用户明确跳过 P0 修改并记录残余风险时允许继续", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n审查轮次：第 1 轮。\n## 复审模式与输入范围\n模式：full。首轮覆盖当前工作包。\n## 问题状态\n用户已决定跳过，修复方案见问题清单。\n## 级别变更记录\n无。\n## 审查依据层级\n用户目标优先。\n## 问题清单\n### P0-1: 重复提交\n修复方案：增加提交锁。\n## 审查问题处置\n| 问题编号 | 级别 | 用户决定 | 状态 | 用户依据与残余风险 |\n|---|---|---|---|---|\n| P0-1 | P0 | 跳过此次修改 | WAIVED_BY_USER | 用户原话：“跳过此次修改”；残余风险：仍可能重复提交 |\n## 反例验证\n重复提交可复现。\n## 运行证据\n本轮实际命令 node --test，执行时间 2026-08-28，退出码 0，结果摘要为测试通过。\n",
  );

  assert.equal(result.status, 0, result.stdout);
});

test("最终审查拒绝用散落关键词代替结构化处置表", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n审查轮次：第 1 轮。\n## 复审模式与输入范围\n模式：full。首轮覆盖当前工作包。\n## 问题状态\n用户已决定跳过，修复方案见问题清单。\n## 级别变更记录\n无。\n## 审查依据层级\n用户目标优先。\n## 问题清单\n### P0-1: 重复提交\n修复方案：增加提交锁。\n## 审查问题处置\nP0-1：WAIVED_BY_USER。用户原话：“跳过此次修改”；残余风险：仍可能重复提交。\n## 反例验证\n重复提交可复现。\n## 运行证据\n本轮实际命令 node --test，执行时间 2026-08-28，退出码 0，结果摘要为测试通过。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /结构化|处置表/);
});

test("最终审查拒绝用户决定与状态矛盾", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n审查轮次：第 1 轮。\n## 复审模式与输入范围\n模式：full。首轮覆盖当前工作包。\n## 问题状态\n修复方案见问题清单。\n## 级别变更记录\n无。\n## 审查依据层级\n用户目标优先。\n## 问题清单\n### P1-1: 错误处理缺失\n修复方案：补充错误提示。\n## 审查问题处置\n| 问题编号 | 级别 | 用户决定 | 状态 | 用户依据与残余风险 |\n|---|---|---|---|---|\n| P1-1 | P1 | 修改 | WAIVED_BY_USER | 用户原话：“修改 P1-1”；残余风险：错误仍可能静默 |\n## 反例验证\n网络失败无提示。\n## 运行证据\n本轮实际命令 node --test，执行时间 2026-08-28，退出码 0，结果摘要为测试通过。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /P1-1.*矛盾|决定.*状态/);
});

test("最终审查拒绝 SELECTED_FOR_REVISION 缺少用户决定依据", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n审查轮次：第 1 轮。\n## 复审模式与输入范围\n模式：full。首轮覆盖当前工作包。\n## 问题状态\n修复方案见问题清单。\n## 级别变更记录\n无。\n## 审查依据层级\n用户目标优先。\n## 问题清单\n### P2-1: 命名不清晰\n修复方案：调整变量名。\n## 审查问题处置\n| 问题编号 | 级别 | 用户决定 | 状态 | 用户依据与残余风险 |\n|---|---|---|---|---|\n| P2-1 | P2 | 修改 | SELECTED_FOR_REVISION | 无 |\n## 反例验证\n变量语义不可辨识。\n## 运行证据\n本轮实际命令 node --test，执行时间 2026-08-28，退出码 0，结果摘要为测试通过。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /P2-1.*用户决定依据|用户决定依据.*P2-1/);
});

test("最终审查拒绝 SELECTED_FOR_REVISION 的关键词空壳依据", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n审查轮次：第 1 轮。\n## 复审模式与输入范围\n模式：full。首轮覆盖当前工作包。\n## 问题状态\n修复方案见问题清单。\n## 级别变更记录\n无。\n## 审查依据层级\n用户目标优先。\n## 问题清单\n### P2-1: 命名不清晰\n修复方案：调整变量名。\n## 审查问题处置\n| 问题编号 | 级别 | 用户决定 | 状态 | 用户依据与残余风险 |\n|---|---|---|---|---|\n| P2-1 | P2 | 修改 | SELECTED_FOR_REVISION | 用户决定依据：P2-1 |\n## 反例验证\n变量语义不可辨识。\n## 运行证据\n本轮实际命令 node --test，执行时间 2026-08-28，退出码 0，结果摘要为测试通过。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /P2-1.*明确用户决定依据/);
});

test("最终审查拒绝 SELECTED_FOR_REVISION 依据中带中文引号的待确认空壳", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n审查轮次：第 1 轮。\n## 复审模式与输入范围\n模式：full。首轮覆盖当前工作包。\n## 问题状态\n修复方案见问题清单。\n## 级别变更记录\n无。\n## 审查依据层级\n用户目标优先。\n## 问题清单\n### P2-1: 命名不清晰\n修复方案：调整变量名。\n## 审查问题处置\n| 问题编号 | 级别 | 用户决定 | 状态 | 用户依据与残余风险 |\n|---|---|---|---|---|\n| P2-1 | P2 | 修改 | SELECTED_FOR_REVISION | 用户明确决定修改 P2-1；补充说明：“待确认” |\n## 反例验证\n变量语义不可辨识。\n## 运行证据\n本轮实际命令 node --test，执行时间 2026-08-28，退出码 0，结果摘要为测试通过。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /P2-1.*明确用户决定依据/);
});

test("第二轮审查拒绝直接影响中带英文引号的无空壳", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n审查轮次：第 2 轮。\n## 审查依据层级\n用户目标优先。\n## 复审模式与输入范围\n审查模式：incremental。\n用户选中修改的问题：P1-1。\n本轮实际修改项：P1-1 修改 src/pages/orders/submit.ts 的重复提交锁。\n直接影响范围：直接调用方：\"无\" src/pages/orders/index.tsx。\n相关测试证据：实际命令：node --test tests/order-submit.test.ts；退出码：0；结果摘要：3 项通过。\n## 问题状态\nP1-1 已按修复方案关闭，没有新问题。\n## 问题清单\n当前没有问题。\n## 审查问题处置\nNO_CHANGES_REQUESTED。复审未发现新问题。\n## 反例验证\n重复提交反例已验证。\n## 运行证据\n本轮实际命令 node --test tests/order-submit.test.ts，执行时间 2026-08-28，退出码 0，结果摘要为 3 项通过。\n## 级别变更记录\n无。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /有效的增量复审输入/);
});

test("第二轮审查拒绝测试证据中被书名号和反引号包裹的空壳", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n审查轮次：第 2 轮。\n## 审查依据层级\n用户目标优先。\n## 复审模式与输入范围\n审查模式：incremental。\n用户选中修改的问题：P1-1。\n本轮实际修改项：P1-1 修改 src/pages/orders/submit.ts 的重复提交锁。\n直接影响范围：直接调用方：src/pages/orders/index.tsx。\n相关测试证据：实际命令：`待确认`；退出码：0；结果摘要：《无》。\n## 问题状态\nP1-1 已按修复方案关闭，没有新问题。\n## 问题清单\n当前没有问题。\n## 审查问题处置\nNO_CHANGES_REQUESTED。复审未发现新问题。\n## 反例验证\n重复提交反例已验证。\n## 运行证据\n本轮实际命令 node --test tests/order-submit.test.ts，执行时间 2026-08-28，退出码 0，结果摘要为 3 项通过。\n## 级别变更记录\n无。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /有效的增量复审输入/);
});

test("最终审查拒绝 SELECTED_FOR_REVISION 与用户不修改原话矛盾", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n审查轮次：第 1 轮。\n## 复审模式与输入范围\n模式：full。首轮覆盖当前工作包。\n## 问题状态\n修复方案见问题清单。\n## 级别变更记录\n无。\n## 审查依据层级\n用户目标优先。\n## 问题清单\n### P2-1: 命名不清晰\n修复方案：调整变量名。\n## 审查问题处置\n| 问题编号 | 级别 | 用户决定 | 状态 | 用户依据与残余风险 |\n|---|---|---|---|---|\n| P2-1 | P2 | 修改 | SELECTED_FOR_REVISION | 用户决定依据：用户原话“不修改 P2-1” |\n## 反例验证\n变量语义不可辨识。\n## 运行证据\n本轮实际命令 node --test，执行时间 2026-08-28，退出码 0，结果摘要为测试通过。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /P2-1.*明确用户决定依据/);
});

test("最终审查拒绝 SELECTED_FOR_REVISION 先正向修改后否定修改的混合依据", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n审查轮次：第 1 轮。\n## 复审模式与输入范围\n模式：full。首轮覆盖当前工作包。\n## 问题状态\n修复方案见问题清单。\n## 级别变更记录\n无。\n## 审查依据层级\n用户目标优先。\n## 问题清单\n### P2-1: 命名不清晰\n修复方案：调整变量名。\n## 审查问题处置\n| 问题编号 | 级别 | 用户决定 | 状态 | 用户依据与残余风险 |\n|---|---|---|---|---|\n| P2-1 | P2 | 修改 | SELECTED_FOR_REVISION | 用户明确决定修改 P2-1；用户原话“不修改 P2-1” |\n## 反例验证\n变量语义不可辨识。\n## 运行证据\n本轮实际命令 node --test，执行时间 2026-08-28，退出码 0，结果摘要为测试通过。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /P2-1.*明确用户决定依据/);
});

test("最终审查拒绝 SELECTED_FOR_REVISION 先否定修改后正向修改的混合依据", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n审查轮次：第 1 轮。\n## 复审模式与输入范围\n模式：full。首轮覆盖当前工作包。\n## 问题状态\n修复方案见问题清单。\n## 级别变更记录\n无。\n## 审查依据层级\n用户目标优先。\n## 问题清单\n### P2-1: 命名不清晰\n修复方案：调整变量名。\n## 审查问题处置\n| 问题编号 | 级别 | 用户决定 | 状态 | 用户依据与残余风险 |\n|---|---|---|---|---|\n| P2-1 | P2 | 修改 | SELECTED_FOR_REVISION | 用户原话“不修改 P2-1”；用户明确决定修改 P2-1 |\n## 反例验证\n变量语义不可辨识。\n## 运行证据\n本轮实际命令 node --test，执行时间 2026-08-28，退出码 0，结果摘要为测试通过。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /P2-1.*明确用户决定依据/);
});

test("最终审查允许 SELECTED_FOR_REVISION 记录用户明确选择修复", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n审查轮次：第 1 轮。\n## 复审模式与输入范围\n模式：full。首轮覆盖当前工作包。\n## 问题状态\n用户已经明确选择修复。\n## 级别变更记录\n无。\n## 审查依据层级\n用户目标优先。\n## 问题清单\n### P2-1: 命名不清晰\n修复方案：调整变量名。\n## 审查问题处置\n| 问题编号 | 级别 | 用户决定 | 状态 | 用户依据与残余风险 |\n|---|---|---|---|---|\n| P2-1 | P2 | 修改 | SELECTED_FOR_REVISION | 用户明确选择修复 P2-1 |\n## 反例验证\n变量语义不可辨识。\n## 运行证据\n本轮实际命令 node --test，执行时间 2026-08-28，退出码 0，结果摘要为测试通过。\n",
  );

  assert.equal(result.status, 0, result.stdout);
});

test("最终审查允许结构化记录选中与豁免问题", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n审查轮次：第 1 轮。\n## 复审模式与输入范围\n模式：full。首轮覆盖当前工作包。\n## 问题状态\n用户已经逐项决定，修复方案见问题清单。\n## 级别变更记录\n无。\n## 审查依据层级\n用户目标优先。\n## 问题清单\n### P0-1: 重复提交\n修复方案：增加提交锁。\n### P2-1: 命名不清晰\n修复方案：调整变量名。\n## 审查问题处置\n| 问题编号 | 级别 | 用户决定 | 状态 | 用户依据与残余风险 |\n|---|---|---|---|---|\n| P0-1 | P0 | 修改 | SELECTED_FOR_REVISION | 用户决定依据：用户原话“修改 P0-1” |\n| P2-1 | P2 | 不修改 | WAIVED_BY_USER | 用户原话：“P2-1 不修改”；残余风险：命名理解成本保留 |\n## 反例验证\n重复提交可复现，命名语义不可辨识。\n## 运行证据\n本轮实际命令 node --test，执行时间 2026-08-28，退出码 0，结果摘要为测试通过。\n",
  );

  assert.equal(result.status, 0, result.stdout);
});

test("用户豁免问题时残余风险不得填写为无", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n审查轮次：第 1 轮。\n## 复审模式与输入范围\n模式：full。首轮覆盖当前工作包。\n## 问题状态\n用户已决定跳过，修复方案见问题清单。\n## 级别变更记录\n无。\n## 审查依据层级\n用户目标优先。\n## 问题清单\n### P1-1: 错误处理缺失\n修复方案：补充统一错误提示。\n## 审查问题处置\n| 问题编号 | 级别 | 用户决定 | 状态 | 用户依据与残余风险 |\n|---|---|---|---|---|\n| P1-1 | P1 | 跳过此次修改 | WAIVED_BY_USER | 用户原话：“跳过此次修改”；残余风险：无 |\n## 反例验证\n网络失败时没有错误提示。\n## 运行证据\n本轮实际命令 node --test，执行时间 2026-08-28，退出码 0，结果摘要为测试通过。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /P1-1.*残余风险|残余风险.*P1-1/);
});

test("代码审查的每个问题都必须记录用户决定", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n审查轮次：第 1 轮。\n## 复审模式与输入范围\n模式：full。首轮覆盖当前工作包。\n## 问题状态\nP0-1 与 P2-1 待用户决定，修复方案见问题清单。\n## 级别变更记录\n无。\n## 审查依据层级\n用户目标优先。\n## 问题清单\n### P0-1: 重复提交\n修复方案：增加提交锁。\n### P2-1: 命名不清晰\n修复方案：调整变量命名。\n## 审查问题处置\n| 问题编号 | 级别 | 用户决定 | 状态 | 用户依据与残余风险 |\n|---|---|---|---|---|\n| P0-1 | P0 | 跳过此次修改 | WAIVED_BY_USER | 用户原话：“跳过此次修改”；残余风险：仍可能重复提交 |\n## 反例验证\n重复提交可复现。\n## 运行证据\n本轮实际命令 node --test，执行时间 2026-08-28，退出码 0，结果摘要为测试通过。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /P2-1.*结构化用户处置记录/);
});

test("第二轮审查缺少增量输入范围时拒绝通过", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n审查轮次：第 2 轮。\n## 审查依据层级\n用户目标优先。\n## 复审模式与输入范围\n模式：incremental。\n## 问题状态\nP0-1 未关闭。\n## 问题清单\nP0-1 仍需修复。\n## 反例验证\n重复提交仍可复现。\n## 运行证据\n本轮实际命令 node --test，退出码 0，结果摘要为受影响测试通过。\n## 级别变更记录\n无。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /有效的增量复审输入/);
});

test("第二轮审查不得恢复为全量模式", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n审查轮次：第 2 轮。\n## 审查依据层级\n用户目标优先。\n## 复审模式与输入范围\n审查模式：full，incremental 不适用。\n用户选中修改的问题：上一轮选中项。\n本轮实际修改项：稳定编号及 src/a.ts 修复逻辑。\n直接影响范围：src/caller.ts、OrderData 契约和受影响测试。\n相关测试证据：node --test，退出码 0，输出见本轮记录。\n## 问题状态\n选中项已经关闭。\n## 问题清单\n当前没有问题。\n## 审查问题处置\nNO_CHANGES_REQUESTED。复审未发现问题。\n## 反例验证\n修改项反例已验证。\n## 运行证据\n本轮实际命令 node --test，执行时间 2026-08-28，退出码 0，结果摘要为通过。\n## 级别变更记录\n无。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /incremental|增量复审/);
});

test("第二轮审查的四项增量输入填写为无时拒绝通过", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n审查轮次：第 2 轮。\n## 审查依据层级\n用户目标优先。\n## 复审模式与输入范围\n审查模式：incremental。\n用户选中修改的问题：无。\n本轮实际修改项：无。\n直接影响范围：无。\n相关测试证据：无。\n## 问题状态\n没有新问题。\n## 问题清单\n当前没有问题。\n## 审查问题处置\nNO_CHANGES_REQUESTED。复审未发现问题。\n## 反例验证\n修改项反例已验证。\n## 运行证据\n本轮实际命令 node --test，执行时间 2026-08-28，退出码 0，结果摘要为通过。\n## 级别变更记录\n无。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /有效.*增量复审输入|稳定问题编号|精确文件路径|直接影响范围|测试证据/);
});

test("第二轮审查包含有效限定复审输入时允许通过", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n审查轮次：第 2 轮。\n## 审查依据层级\n用户目标优先。\n## 复审模式与输入范围\n审查模式：incremental。\n用户选中修改的问题：P1-1。\n本轮实际修改项：P1-1 修改 src/pages/orders/submit.ts 的重复提交锁。\n直接影响范围：直接调用方：src/pages/orders/index.tsx；直接契约：OrderSubmitData；直接受影响测试：tests/order-submit.test.ts。\n相关测试证据：实际命令：node --test tests/order-submit.test.ts；退出码：0；结果摘要：3 项通过。\n## 问题状态\nP1-1 已按修复方案关闭，没有新问题。\n## 问题清单\n当前没有问题。\n## 审查问题处置\nNO_CHANGES_REQUESTED。复审未发现新问题。\n## 反例验证\n重复提交反例已验证。\n## 运行证据\n本轮实际命令 node --test tests/order-submit.test.ts，执行时间 2026-08-28，退出码 0，结果摘要为 3 项通过。\n## 级别变更记录\n无。\n",
  );

  assert.equal(result.status, 0, result.stdout);
});

test("第二轮审查的实际修改问题必须是用户选中问题的非空子集", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n审查轮次：第 2 轮。\n## 审查依据层级\n用户目标优先。\n## 复审模式与输入范围\n审查模式：incremental。\n用户选中修改的问题：P1-1。\n本轮实际修改项：P2-1 修改 src/pages/orders/submit.ts 的重复提交锁。\n直接影响范围：直接调用方：src/pages/orders/index.tsx；直接契约：OrderSubmitData；直接受影响测试：tests/order-submit.test.ts。\n相关测试证据：实际命令：node --test tests/order-submit.test.ts；退出码：0；结果摘要：3 项通过。\n## 问题状态\nP2-1 已关闭。\n## 问题清单\n当前没有问题。\n## 审查问题处置\nNO_CHANGES_REQUESTED。复审未发现新问题。\n## 反例验证\n重复提交反例已验证。\n## 运行证据\n本轮实际命令 node --test tests/order-submit.test.ts，执行时间 2026-08-28，退出码 0，结果摘要为 3 项通过。\n## 级别变更记录\n无。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /实际修改.*选中.*子集|P2-1.*P1-1/);
});

test("第二轮审查必须分别记录三类直接影响证据", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n审查轮次：第 2 轮。\n## 审查依据层级\n用户目标优先。\n## 复审模式与输入范围\n审查模式：incremental。\n用户选中修改的问题：P1-1。\n本轮实际修改项：P1-1 修改 src/pages/orders/submit.ts 的重复提交锁。\n直接影响范围：直接调用方：src/pages/orders/index.tsx。\n相关测试证据：实际命令：node --test tests/order-submit.test.ts；退出码：0；结果摘要：3 项通过。\n## 问题状态\nP1-1 已关闭。\n## 问题清单\n当前没有问题。\n## 审查问题处置\nNO_CHANGES_REQUESTED。复审未发现新问题。\n## 反例验证\n重复提交反例已验证。\n## 运行证据\n本轮实际命令 node --test tests/order-submit.test.ts，执行时间 2026-08-28，退出码 0，结果摘要为 3 项通过。\n## 级别变更记录\n无。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /直接调用方.*直接契约.*直接受影响测试|三类直接影响/);
});

test("第二轮审查允许三类直接影响逐项提供有证据的不适用原因", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n审查轮次：第 2 轮。\n## 审查依据层级\n用户目标优先。\n## 复审模式与输入范围\n审查模式：incremental。\n用户选中修改的问题：P1-1、P2-1。\n本轮实际修改项：P1-1 修改 src/pages/orders/constants.ts 的本地常量。\n直接影响范围：直接调用方：不适用：该常量只在同文件纯函数中消费；直接契约：不适用：未改变导出类型或 API；直接受影响测试：不适用：该纯文案常量没有行为测试入口，已人工核对调用点。\n相关测试证据：实际命令：node --test tests/order-submit.test.ts；退出码：0；结果摘要：3 项通过。\n## 问题状态\nP1-1 已关闭，P2-1 未修改。\n## 问题清单\n当前没有问题。\n## 审查问题处置\nNO_CHANGES_REQUESTED。复审未发现新问题。\n## 反例验证\n常量调用点已逐项核对。\n## 运行证据\n本轮实际命令 node --test tests/order-submit.test.ts，执行时间 2026-08-28，退出码 0，结果摘要为 3 项通过。\n## 级别变更记录\n无。\n",
  );

  assert.equal(result.status, 0, result.stdout);
});

test("第二轮审查的直接调用方填写为无时拒绝通过", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n审查轮次：第 2 轮。\n## 审查依据层级\n用户目标优先。\n## 复审模式与输入范围\n审查模式：incremental。\n用户选中修改的问题：P1-1。\n本轮实际修改项：P1-1 修改 src/pages/orders/submit.ts 的重复提交锁。\n直接影响范围：直接调用方：无。\n相关测试证据：实际命令：node --test tests/order-submit.test.ts；退出码：0；结果摘要：3 项通过。\n## 问题状态\nP1-1 已按修复方案关闭，没有新问题。\n## 问题清单\n当前没有问题。\n## 审查问题处置\nNO_CHANGES_REQUESTED。复审未发现新问题。\n## 反例验证\n重复提交反例已验证。\n## 运行证据\n本轮实际命令 node --test tests/order-submit.test.ts，执行时间 2026-08-28，退出码 0，结果摘要为 3 项通过。\n## 级别变更记录\n无。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /有效的增量复审输入/);
});

test("第二轮审查的测试命令和结果填写为无时拒绝通过", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n审查轮次：第 2 轮。\n## 审查依据层级\n用户目标优先。\n## 复审模式与输入范围\n审查模式：incremental。\n用户选中修改的问题：P1-1。\n本轮实际修改项：P1-1 修改 src/pages/orders/submit.ts 的重复提交锁。\n直接影响范围：直接调用方：src/pages/orders/index.tsx。\n相关测试证据：实际命令：无；退出码：0；结果摘要：无。\n## 问题状态\nP1-1 已按修复方案关闭，没有新问题。\n## 问题清单\n当前没有问题。\n## 审查问题处置\nNO_CHANGES_REQUESTED。复审未发现新问题。\n## 反例验证\n重复提交反例已验证。\n## 运行证据\n本轮实际命令 node --test tests/order-submit.test.ts，执行时间 2026-08-28，退出码 0，结果摘要为 3 项通过。\n## 级别变更记录\n无。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /有效的增量复审输入/);
});

test("修复后的复审缺少用户选中项和直接影响范围时拒绝通过", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n审查轮次：第 2 轮。\n## 审查依据层级\n用户目标优先。\n## 复审模式与输入范围\n模式：incremental。未关闭问题：P1-1。本轮修改文件：src/a.ts。相关测试证据：node --test。\n## 问题状态\nP1-1 已修复。\n## 问题清单\n当前没有问题。\n## 审查问题处置\nNO_CHANGES_REQUESTED。复审未发现问题。\n## 反例验证\n修改项反例已验证。\n## 运行证据\n本轮实际命令 node --test，执行时间 2026-08-28，退出码 0，结果摘要为通过。\n## 级别变更记录\n无。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /有效的增量复审输入/);
});

test("P1 升级 P0 缺少新证据时拒绝通过", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n审查轮次：第 2 轮。\n## 审查依据层级\n用户目标优先。\n## 复审模式与输入范围\n模式：incremental。未关闭问题：P1-1。本轮修改文件：src/a.ts。相关测试证据：node --test。\n## 问题状态\nP1-1 从 P1 升级为 P0。\n## 问题清单\nP0-1 必须修改。\n## 反例验证\n未发现新反例。\n## 运行证据\n本轮实际命令 node --test，退出码 0，结果摘要为通过。\n## 级别变更记录\nP1-1：P1→P0，原因是尚未修改。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /新证据|可复现反例|影响升级/);
});

test("旧版一 UC 一任务的拆分方案拒绝通过", () => {
  const result = runValidator(
    "task-breakdown",
    "# 任务拆分方案\n## UC 任务清单\n| UC | 任务 |\n| --- | --- |\n| UC01 | 查看订单 |\n## 跨 UC 依赖分析\n无。\n## 执行顺序\nUC01。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /需求拆分就绪|工作包|UC.*映射|编排决策|升级触发/);
});

test("工作包与二维编排信息完整的拆分方案通过校验", () => {
  const result = runValidator(
    "task-breakdown",
    "# 任务拆分方案\n## 需求拆分就绪\n结论：READY。高影响未知项已有验证计划。\n## 工作包清单\n| 工作包 | 范围 | 独立验收 |\n| --- | --- | --- |\n| WP01 | 订单工作台 | 是 |\n## UC 与工作包映射\n| UC | 工作包 |\n| --- | --- |\n| UC01 | WP01 |\n## 工作包依赖分析\nWP01 无依赖。\n## 编排决策\ntopology: single-workstream。governance: standard。理由：共享订单状态。升级触发：修改全局订单契约。\n## 执行顺序\nWP01。\n",
  );

  assert.equal(result.status, 0, result.stdout);
});

test("被依赖说明不会被误判为工作包循环依赖", () => {
  const templatePath = resolve(__dirname, "../templates/task-breakdown-template.md");
  const result = spawnSync(
    process.execPath,
    [VALIDATOR_PATH, "task-breakdown", templatePath],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stdout);
});

test("显式双向工作包依赖拒绝通过", () => {
  const result = runValidator(
    "task-breakdown",
    "# 任务拆分方案\n## 需求拆分就绪\nREADY，高影响未知项已有验证计划。\n## 工作包清单\n| 工作包 | 覆盖 UC |\n| --- | --- |\n| WP01 | UC01 |\n| WP02 | UC02 |\n## UC 与工作包映射\nUC01 → WP01，UC02 → WP02。\n## 工作包依赖分析\n- WP01 依赖 WP02\n- WP02 依赖 WP01\n## 编排决策\ntopology: multi-workstream，governance: standard，理由：独立验收。升级触发：共享契约变化。\n## 执行顺序\n待解除循环依赖。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /循环依赖/);
});

test("包含新增质量契约的代表性产物通过校验", () => {
  const cases = [
    {
      type: "prd",
      content:
        "# PRD\n## 第一性原理分析\n成功指标有目标值。事实有证据来源。假设有验证方式。最小可行方案明确。停止/回退条件明确。\n## 用户故事\n## 页面清单\n## 设计规范\n颜色 字体 间距\n## 需求拆分就绪\n结论：READY。异常流程和验收标准明确，高影响未知项已有验证计划。\n## 验收标准。\n",
    },
    {
      type: "tdd",
      content: VALID_CONFIRMED_TDD_WITHOUT_ADVERSARIAL_REVIEW,
    },
    {
      type: "global-architecture",
      content: VALID_CONFIRMED_GLOBAL_ARCHITECTURE_WITHOUT_ADVERSARIAL_REVIEW,
    },
    {
      type: "review",
      content:
        "# 审查报告\n## 审查摘要\n审查轮次：第 1 轮。\n## 复审模式与输入范围\n模式：full。首轮覆盖当前工作包。\n## 问题状态\n无。\n## 级别变更记录\n无。\n## 审查依据层级\n## 问题清单\n当前没有问题。\n## 审查问题处置\nNO_CHANGES_REQUESTED。审查未发现问题，进入下一阶段。\n## 反例验证\n乱序响应已验证。\n## 运行证据\n本轮实际命令 node --test，退出码 0，结果摘要为 5 项通过。\n",
    },
  ];

  for (const artifact of cases) {
    const result = runValidator(artifact.type, artifact.content);
    assert.equal(result.status, 0, `${artifact.type} 校验失败：${result.stdout}`);
  }
});

test("审查模板同时通过候选与最终校验且问题编号引用不被误判", () => {
  const templatePath = resolve(__dirname, "../templates/review-report-template.md");
  for (const artifactType of ["review-proposal", "review"]) {
    const result = spawnSync(process.execPath, [VALIDATOR_PATH, artifactType, templatePath], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, `${artifactType} 模板校验失败：${result.stdout}`);
  }
});
