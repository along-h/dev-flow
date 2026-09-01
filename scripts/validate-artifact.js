#!/usr/bin/env node

/**
 * 产物格式校验脚本 (validate-artifact)
 *
 * 用法：
 *   node scripts/validate-artifact.js <artifact-type> <file-path>
 *   node scripts/validate-artifact.js prd .dev-flow/runs/REQ-001/PRD.md
 *   node scripts/validate-artifact.js components .dev-flow/runs/REQ-001/work-packages/WP01/COMPONENTS.md
 *   node scripts/validate-artifact.js --list  (列出所有支持的产物类型)
 *
 * 输出：JSON
 *   { "pass": true/false, "errors": [...], "warnings": [...] }
 *   退出码：0 通过, 1 失败
 */

const fs = require("node:fs");
const path = require("node:path");

// ============================================================
// 校验规则定义
// ============================================================

/**
 * 每个产物类型定义了三层规则：
 *   requiredSections  — 必须包含的章节标题
 *   requiredFields    — 每行/每组件必须包含的字段
 *   formatRules       — 格式约束（正则匹配）
 */
const COMPONENT_REQUIRED_SECTIONS = [
  { pattern: /页面.*组件树|组件树|Component Tree/i, label: "页面级组件树" },
  { pattern: /职责目录树|Responsibility Tree/i, label: "职责目录树" },
  { pattern: /设计覆盖矩阵|Design Coverage Matrix/i, label: "设计覆盖矩阵" },
  { pattern: /通用组件|复用组件|Shared.*Component/i, label: "通用组件清单" },
];

/** 设计源登记表的组件级证据列。 */
const DESIGN_SOURCE_MAPPING_HEADER = [
  "模块",
  "页面",
  "UI 组件",
  "工作包",
  "顶层设计源",
  "精确组件节点",
  "节点层级路径",
  "适用状态",
  "完整度",
  "关联模块规格",
  "提取时间",
  "响应式差异",
  "文字溢出",
];

/** 模块规格的组件级精确节点映射列。 */
const MODULE_COMPONENT_MAPPING_HEADER = [
  "UI 组件",
  "所在页面",
  "精确节点名称",
  "精确节点链接",
  "节点层级路径",
  "提取时间",
  "适用状态",
];

/** 模块布局与尺寸的固定结构化列。 */
const MODULE_LAYOUT_HEADER = ["区域/组件", "布局", "宽度", "高度", "间距", "对齐"];

/** 模块设计 Token 的固定结构化列。 */
const MODULE_DESIGN_TOKEN_HEADER = ["类别", "Token/属性", "值", "来源节点"];

/** complete 模块规格必须覆盖的设计 Token 类别。 */
const REQUIRED_DESIGN_TOKEN_CATEGORIES = ["颜色", "字体", "间距", "圆角", "阴影"];

/** 模块组件状态逐状态证据的固定结构化列。 */
const MODULE_COMPONENT_STATE_HEADER = ["UI 组件", "状态", "规格", "证据"];

/** 设计规格允许声明的组件状态。 */
const ALLOWED_COMPONENT_STATES = new Set([
  "normal",
  "hover",
  "active",
  "focus",
  "disabled",
  "loading",
  "empty",
  "error",
]);

const RESPONSIBILITY_TREE_FORMAT_RULES = [
  {
    desc: "职责目录树每个非空树条目都必须逐项标注变更类型、工作包或共享边界，并填写职责说明或修改约束",
    /**
     * 校验职责目录树的每一个目录或文件条目，而不是只检查全文是否出现过标记。
     *
     * @param {string} content 架构产物 Markdown 内容
     * @returns {boolean} 是否逐项具备完整注解
     */
    check: (content) => {
      const entries = getResponsibilityTreeEntries(content);
      return entries.length > 0 && entries.every((entry) => isValidResponsibilityTreeEntry(entry));
    },
  },
  {
    desc: "职责目录树必须标注变更类型；模板示例需包含新增、修改、复用和不变",
    /**
     * 校验职责目录树包含所需的变更类型标注。
     *
     * @param {string} content 架构产物 Markdown 内容
     * @param {string} filePath 当前校验文件路径
     * @returns {boolean} 是否满足模板或运行产物的变更类型要求
     */
    check: (content, filePath) => {
      const responsibilityTree = extractMarkdownSection(content, /职责目录树|Responsibility Tree/i);
      if (isTemplateArtifact(filePath)) {
        return ["新增", "修改", "复用", "不变"].every((marker) =>
          responsibilityTree.includes(marker),
        );
      }
      return /新增|修改|复用|不变/.test(responsibilityTree);
    },
  },
  {
    desc: "职责目录树必须标注工作包编号或共享边界",
    /**
     * 校验职责目录树已声明工作包或共享边界。
     *
     * @param {string} content 架构产物 Markdown 内容
     * @returns {boolean} 是否存在 WP 编号或共享边界
     */
    check: (content) => /\bWP\d+\b|共享/i.test(
      extractMarkdownSection(content, /职责目录树|Responsibility Tree/i),
    ),
  },
  {
    desc: "职责目录树必须说明目录或文件的单一职责",
    /**
     * 校验职责目录树说明了目录或文件的职责。
     *
     * @param {string} content 架构产物 Markdown 内容
     * @returns {boolean} 是否存在职责说明
     */
    check: (content) => /职责|Responsibility|负责/i.test(
      extractMarkdownSection(content, /职责目录树|Responsibility Tree/i),
    ),
  },
];

const COMPONENT_FORMAT_RULES = [
  {
    desc: "组件树必须描述组件层级（嵌套结构）",
    /**
     * 校验组件树包含可读的嵌套层级。
     *
     * @param {string} content 组件方案 Markdown 内容
     * @returns {boolean} 是否存在组件层级标识
     */
    check: (content) => /├──|└──|──\s/i.test(content) || /<.*>/.test(content),
  },
  {
    desc: "每个组件必须有职责描述",
    /**
     * 校验组件方案说明了组件职责。
     *
     * @param {string} content 组件方案 Markdown 内容
     * @returns {boolean} 是否存在职责描述
     */
    check: (content) => /职责|Responsibility|负责/i.test(content),
  },
  {
    desc: "每个组件必须有Props/State/数据来源",
    /**
     * 校验组件方案记录了 Props 与 State。
     *
     * @param {string} content 组件方案 Markdown 内容
     * @returns {boolean} 是否同时存在 Props 与 State 字段
     */
    check: (content) => /Props|props/i.test(content) && /State|state/i.test(content),
  },
  ...RESPONSIBILITY_TREE_FORMAT_RULES,
  {
    desc: "设计覆盖矩阵必须包含 UI 组件、文件路径、所属工作包、精确设计节点、必需状态、完整度和处置七列",
    /**
     * 校验设计覆盖矩阵包含全部约定列。
     *
     * @param {string} content 组件方案 Markdown 内容
     * @returns {boolean} 是否包含七个矩阵列名
     */
    check: (content) => {
      const matrix = extractMarkdownSection(content, /设计覆盖矩阵|Design Coverage Matrix/i);
      return ["UI 组件", "文件路径", "所属工作包", "精确设计节点", "必需状态", "完整度", "处置"].every(
        (column) => matrix.includes(column),
      );
    },
  },
  {
    desc: "设计覆盖矩阵的每个数据行必须恰有七列",
    /**
     * 校验设计覆盖矩阵中不存在列数错误的数据行。
     *
     * @param {string} content 组件方案 Markdown 内容
     * @returns {boolean} 是否每个数据行均包含七列
     */
    check: (content) => {
      const rows = getDesignCoverageRows(content);
      return rows.length > 0 && rows.every((row) => row.length === 7);
    },
  },
  {
    desc: "设计覆盖矩阵的每个数据行必须恰有七列且每个字段非空",
    /**
     * 校验矩阵所有字段都具备非空语义，模板占位值仍可用于指导填写。
     *
     * @param {string} content 组件方案 Markdown 内容
     * @returns {boolean} 是否每行七列均非空
     */
    check: (content) => {
      const rows = getDesignCoverageRows(content);
      return rows.length > 0 && rows.every(
        (row) => row.length === 7 && row.every((cell) => cell.trim().length > 0),
      );
    },
  },
  {
    desc: "设计覆盖矩阵完整度只允许 complete、blocked、waived 或 not-applicable",
    /**
     * 校验设计覆盖矩阵的每个完整度值均在允许范围内。
     *
     * @param {string} content 组件方案 Markdown 内容
     * @returns {boolean} 是否存在至少一行且完整度均合法
     */
    check: (content) => {
      const rows = getDesignCoverageRows(content);
      const allowedCompleteness = new Set(["complete", "blocked", "waived", "not-applicable"]);
      return rows.length > 0 && rows.every(
        (row) => row.length === 7 && allowedCompleteness.has(row[5].toLowerCase()),
      );
    },
  },
  {
    desc: "页面组件树的每个可见 UI 条目必须使用 [UI] ComponentName 标记，且其集合必须与设计覆盖矩阵的视觉行集合一致",
    /**
     * 校验组件树显式 UI 标记与矩阵视觉行形成一一对应关系。
     *
     * @param {string} content 组件方案 Markdown 内容
     * @returns {boolean} 是否不存在遗漏、额外项或重复项
     */
    check: (content) => hasMatchingVisibleComponentCoverage(content),
  },
];

/**
 * 创建组件方案或开发准入复用的结构校验规则。
 *
 * @param {{ requireReady: boolean }} options 是否额外要求所有设计项可进入开发
 * @returns {{ label: string, requiredSections: Array<{ pattern: RegExp, label: string }>, requiredFields: Array<unknown>, formatRules: Array<{ desc: string, check: (content: string, filePath: string) => boolean }> }} 组件产物校验规则
 */
function createComponentRules({ requireReady }) {
  return {
    label: requireReady ? "组件设计开发准入" : "组件拆分方案",
    requiredSections: COMPONENT_REQUIRED_SECTIONS,
    requiredFields: [],
    formatRules: [
      ...COMPONENT_FORMAT_RULES,
      ...(requireReady ? [COMPONENT_DESIGN_READY_RULE] : []),
    ],
  };
}

const COMPONENT_DESIGN_READY_RULE = {
  desc: "开发准入不允许 blocked；complete 必须有带节点参数的精确设计 URL，或项目 cwd 中真实存在的 inactive 视觉基线路径及适用状态/处置；not-applicable 和 waived 必须记录完整证据",
  /**
   * 校验设计覆盖矩阵中的每项均满足开发准入条件。
   *
   * @param {string} content 组件方案 Markdown 内容
   * @param {string} filePath 当前校验文件路径
   * @returns {boolean} 是否不存在未处置的设计阻塞项
   */
  check: (content, filePath) => {
    const rows = getDesignCoverageRows(content);
    return rows.every((row) => {
      if (row.length !== 7) return false;

      const completeness = row[5].toLowerCase();
      if (completeness === "complete") {
        return hasCompleteDesignCoverageEvidence(row, filePath);
      }
      if (completeness === "not-applicable") {
        return (
          isNonVisualDesignCoverageFile(row[1]) &&
          row[3] === "不适用" &&
          row[4] === "不适用" &&
          /非视觉文件/.test(row[6])
        );
      }
      if (completeness !== "waived") return false;

      return hasDetailedWaiverDisposition(row[6]);
    });
  },
};

const TDD_RESPONSIBILITY_REQUIRED_SECTIONS = [
  { pattern: /职责目录树|Responsibility Tree/i, label: "职责目录树" },
  { pattern: /设计覆盖版本|Design Coverage Version/i, label: "设计覆盖版本" },
];

const GLOBAL_ARCHITECTURE_RESPONSIBILITY_REQUIRED_SECTIONS = [
  { pattern: /职责目录树|Responsibility Tree/i, label: "共享职责目录树" },
  { pattern: /共享可见组件声明|Shared Visible Component Declaration/i, label: "共享可见组件声明" },
  { pattern: /共享可见组件设计归属|Shared Visible Component Ownership/i, label: "共享可见组件设计归属" },
];

const TDD_DESIGN_COVERAGE_FORMAT_RULES = [
  {
    desc: "TDD 必须引用 COMPONENTS.md 设计覆盖版本",
    /**
     * 校验 TDD 引用了组件方案的具体设计覆盖版本。
     *
     * @param {string} content TDD Markdown 内容
     * @param {string} filePath 当前校验文件路径
     * @returns {boolean} 是否存在合法的 COMPONENTS.md 版本引用
     */
    check: (content, filePath) => {
      const coverageVersionSection = extractMarkdownSection(
        content,
        /设计覆盖版本|Design Coverage Version/i,
      );
      const hasVersion = isTemplateArtifact(filePath)
        ? /v\{N\}/i.test(coverageVersionSection)
        : /\bv\d+\b/i.test(coverageVersionSection);
      return /COMPONENTS\.md/i.test(coverageVersionSection) && hasVersion;
    },
  },
  {
    desc: "TDD 不得复制设计覆盖矩阵，只能引用 COMPONENTS.md 版本",
    /**
     * 校验 TDD 未复制组件方案中的设计覆盖矩阵章节。
     *
     * @param {string} content TDD Markdown 内容
     * @returns {boolean} 是否不存在设计覆盖矩阵标题
     */
    check: (content) => {
      const hasMatrixHeading =
        /^#{1,6}\s+(?:\d+\.\s*)?(?:设计覆盖矩阵|Design Coverage Matrix)/im.test(
          content,
        );
      return !hasMatrixHeading && !hasDesignCoverageMatrixSignature(content);
    },
  },
];

const GLOBAL_ARCHITECTURE_RESPONSIBILITY_FORMAT_RULES = [
  ...RESPONSIBILITY_TREE_FORMAT_RULES,
  {
    desc: "共享可见组件必须逐项映射到工作包 COMPONENTS.md；纯非视觉共享架构必须结构化声明无共享可见组件并证明仅含 types/API 等非视觉边界",
    /**
     * 校验共享可见组件的声明与设计覆盖归属。
     *
     * @param {string} content 全局架构 Markdown 内容
     * @returns {boolean} 是否完成逐项精确映射
     */
    check: (content, filePath) => hasSharedVisibleComponentOwnership(content, filePath),
  },
];

const REVIEW_COMMON_REQUIRED_SECTIONS = [
  { pattern: /审查摘要|Review Summary|概览/i, label: "审查摘要" },
  { pattern: /审查依据层级|Review Hierarchy/i, label: "审查依据层级" },
  { pattern: /问题.*列表|问题.*清单|Issue.*List|问题详情/i, label: "问题列表" },
  { pattern: /反例验证|Counterexample/i, label: "反例验证" },
  { pattern: /运行证据|Verification Evidence/i, label: "运行证据" },
];

const REVIEW_COMMON_FORMAT_RULES = [
  {
    desc: "审查问题必须使用 ### P0-1/P1-1/P2-1 形式的稳定唯一编号",
    check: (content, filePath) =>
      isLegacyArtifactPath(filePath) || getReviewIssueFormatErrors(content).length === 0,
    failDetail: (content) => getReviewIssueFormatErrors(content).join("；"),
  },
  {
    desc: "每个问题必须有级别（P0/P1/P2）",
    check: (content) => {
      const issues = extractIssues(content);
      if (issues.length === 0) return true;
      return issues.every((issue) => /\bP[012]\b/.test(issue));
    },
    failDetail: (content) => {
      const issues = extractIssues(content);
      const badIssues = issues.filter((issue) => !/\bP[012]\b/.test(issue));
      return `以下问题缺少级别标注：${badIssues.map((issue) => issue.slice(0, 60)).join(" | ")}`;
    },
  },
  {
    desc: "每个问题必须有修复方案",
    check: (content) => {
      const issues = extractIssues(content);
      if (issues.length === 0) return true;
      return issues.every((issue) => /修复|fix|改为|改成|建议|方案/i.test(issue));
    },
  },
  {
    desc: "运行证据必须包含本轮实际命令、退出码和结果摘要",
    check: (content) =>
      /本轮|审查时间|执行时间/i.test(content) &&
      /实际命令/i.test(content) &&
      /退出码/i.test(content) &&
      /结果摘要|原始输出/i.test(content),
  },
  {
    desc: "运行证据不能保留占位内容",
    check: (content, filePath) =>
      isTemplateArtifact(filePath) ||
      !hasUnresolvedPlaceholder(
        extractMarkdownSection(content, /运行证据|Verification Evidence/i),
      ),
  },
  {
    desc: "新格式审查报告必须包含复审范围、问题状态和级别变更记录",
    check: (content, filePath) =>
      isLegacyArtifactPath(filePath) ||
      (/复审模式.*输入范围/i.test(content) &&
        /问题状态/i.test(content) &&
        /级别变更记录/i.test(content)),
  },
  {
    desc: "第二轮及以后必须记录有效的增量复审输入：实际修改编号为选中编号的非空子集，且分别填写直接调用方、直接契约和直接受影响测试",
    check: (content, filePath) => {
      if (
        isLegacyArtifactPath(filePath) ||
        isTemplateArtifact(filePath) ||
        !/第\s*[2-9]\d*\s*轮/i.test(content)
      ) {
        return true;
      }
      return hasValidIncrementalReviewInput(content);
    },
    failDetail: () =>
      "第二轮及以后必须记录有效的增量复审输入并使用 incremental；本轮实际修改问题必须是用户选中问题的非空子集，并分别记录直接调用方、直接契约、直接受影响测试及测试证据",
  },
  {
    desc: "P1 升级 P0 必须记录新证据、可复现反例或影响升级",
    check: (content, filePath) => {
      if (
        isLegacyArtifactPath(filePath) ||
        isTemplateArtifact(filePath) ||
        !/P1\s*(?:→|->|升级为)\s*P0/i.test(content)
      ) {
        return true;
      }
      const section = extractMarkdownSection(content, /级别变更记录/i);
      return /新证据|可复现反例|影响升级|违反.*不变量/i.test(section);
    },
  },
];

const REVIEW_DISPOSITION_RULE = {
  desc: "审查问题必须逐项记录结构化用户决定；无问题时必须记录 NO_CHANGES_REQUESTED",
  check: (content, filePath) =>
    isLegacyArtifactPath(filePath) ||
    isTemplateArtifact(filePath) ||
    getReviewDispositionErrors(content).length === 0,
  failDetail: (content) => getReviewDispositionErrors(content).join("；"),
};

/**
 * 创建候选或最终审查报告规则，确保两阶段共享同一内容与证据契约。
 *
 * @param {boolean} requireDisposition 是否要求最终用户处置
 * @returns {{ label: string, requiredSections: Array<{ pattern: RegExp, label: string }>, requiredFields: string[], formatRules: object[] }} 审查产物校验规则
 */
function createReviewRules(requireDisposition) {
  const dispositionSection = {
    pattern: /审查问题处置|Review Issue Disposition/i,
    label: "审查问题处置",
  };
  return {
    label: requireDisposition ? "最终审查报告" : "审查报告候选",
    requiredSections: requireDisposition
      ? [...REVIEW_COMMON_REQUIRED_SECTIONS, dispositionSection]
      : REVIEW_COMMON_REQUIRED_SECTIONS,
    requiredFields: [],
    formatRules: requireDisposition
      ? [...REVIEW_COMMON_FORMAT_RULES, REVIEW_DISPOSITION_RULE]
      : REVIEW_COMMON_FORMAT_RULES,
  };
}

const VALIDATION_RULES = {
  prd: {
    label: "PRD（需求文档）",
    requiredSections: [
      { pattern: /第一性原理|First Principles/i, label: "第一性原理分析" },
      { pattern: /用户故事|User Story/i, label: "用户故事" },
      { pattern: /页面.*清单|模块.*清单|UC.*清单/i, label: "页面/模块清单" },
      { pattern: /设计.*Token|设计.*规范|设计.*约束/i, label: "设计Token/规范" },
      { pattern: /需求.*拆分.*就绪|拆分.*就绪|Decomposition Readiness/i, label: "需求拆分就绪" },
      { pattern: /验收.*标准|Acceptance Criteria/i, label: "验收标准" },
    ],
    requiredFields: [],
    formatRules: [
      {
        desc: "设计Token必须包含颜色体系",
        check: (content) =>
          isDesignSourceWaived(content) || /颜色|color|primary|--color/i.test(content),
      },
      {
        desc: "设计Token必须包含字体/字号",
        check: (content) =>
          isDesignSourceWaived(content) || /字体|字号|font|font-size|typography/i.test(content),
      },
      {
        desc: "设计Token必须包含间距体系",
        check: (content) =>
          isDesignSourceWaived(content) || /间距|spacing|padding|margin|gap/i.test(content),
      },
      {
        desc: "第一性原理分析必须包含成功指标",
        check: (content) => /成功指标|Success Metric/i.test(content),
      },
      {
        desc: "第一性原理分析必须包含事实证据",
        check: (content) => /事实[\s\S]{0,40}(证据|来源)/i.test(content),
      },
      {
        desc: "第一性原理分析必须包含假设验证方式",
        check: (content) => /假设[\s\S]{0,60}验证/i.test(content),
      },
      {
        desc: "第一性原理分析必须包含最小方案和停止条件",
        check: (content) =>
          /最小.*方案|Minimum.*Solution/i.test(content) &&
          /停止.*条件|回退.*条件|Stop.*Condition/i.test(content),
      },
      {
        desc: "第一性原理分析不能保留占位内容",
        check: (content, filePath) =>
          isTemplateArtifact(filePath) ||
          !hasUnresolvedPlaceholder(
            extractMarkdownSection(content, /第一性原理|First Principles/i),
          ),
      },
      {
        desc: "需求拆分就绪必须给出明确结论和高影响未知项处置",
        check: (content, filePath) =>
          isTemplateArtifact(filePath) ||
          (/(READY|BLOCKED|已就绪|未就绪)/i.test(
            extractMarkdownSection(
              content,
              /需求.*拆分.*就绪|拆分.*就绪|Decomposition Readiness/i,
            ),
          ) &&
            /高影响.*(未知|假设)|验证计划|证据/i.test(
              extractMarkdownSection(
                content,
                /需求.*拆分.*就绪|拆分.*就绪|Decomposition Readiness/i,
              ),
            )),
      },
    ],
  },

  "design-sources": {
    label: "设计源登记表",
    requiredSections: [
      { pattern: /状态判定|Design Source Status/i, label: "状态判定" },
      { pattern: /当前任务范围|Task Scope/i, label: "当前任务范围" },
      { pattern: /模块设计源清单|Module Design Sources/i, label: "模块设计源清单" },
      { pattern: /刷新记录|Refresh Log/i, label: "刷新记录" },
    ],
    requiredFields: [],
    formatRules: [
      {
        desc: "全文必须恰好一个状态判定章节和一个当前状态字段；任务状态只允许 inactive 或 required，状态章节不得包含 waived",
        check: (content, filePath) =>
          isTemplateArtifact(filePath) || ["inactive", "required"].includes(getDesignSourceStatus(content)),
      },
      {
        desc: "存在顶层或精确设计源时任务状态必须是 required，不能使用 inactive",
        check: (content, filePath) =>
          isTemplateArtifact(filePath) ||
          getDesignSourceStatus(content) !== "inactive" ||
          !hasRegisteredDesignSource(content),
      },
      {
        desc: "模块设计源清单必须按状态逐组件记录有效顶层源、带节点参数的精确节点、真实基线路径、节点层级、适用状态、关联模块规格、提取时间、响应式差异和文字溢出",
        check: (content, filePath) => hasDesignSourceComponentMapping(content, filePath),
      },
    ],
  },

  "module-design-spec": {
    label: "模块设计规格",
    requiredSections: [
      { pattern: /设计源|Design Source/i, label: "设计源" },
      {
        pattern: /UI\s*组件.*精确节点映射|Component.*Node Mapping/i,
        label: "UI 组件与精确节点映射",
      },
      { pattern: /证据引用|Evidence References/i, label: "COMPONENTS 与 DESIGN-SOURCES 证据引用" },
      { pattern: /布局与尺寸|Layout.*Size/i, label: "布局与尺寸" },
      { pattern: /设计\s*Token|Design Tokens?/i, label: "设计 Token" },
      { pattern: /组件状态|Component State/i, label: "组件状态" },
      { pattern: /文字与溢出|Text.*Overflow/i, label: "文字与溢出" },
      { pattern: /响应式规则|Responsive Rules/i, label: "响应式规则" },
      { pattern: /提取完整度|Extraction Completeness/i, label: "提取完整度" },
    ],
    requiredFields: [],
    formatRules: [
      {
        desc: "设计源必须包含可回查链接、节点名称、节点范围、节点层级路径和提取时间",
        check: (content, filePath) =>
          isTemplateArtifact(filePath) ||
          hasModuleDesignSourceEvidence(content),
      },
      {
        desc: "模块设计规格必须逐组件记录带节点参数的精确节点链接、有效层级路径、提取时间和适用状态",
        check: (content, filePath) => hasModuleComponentMapping(content, filePath),
      },
      {
        desc: "模块设计规格必须引用对应的 COMPONENTS.md 版本与 DESIGN-SOURCES.md 组件记录",
        check: (content, filePath) => hasModuleEvidenceReferences(content, filePath),
      },
      {
        desc: "complete 模块设计规格必须使用表格填写布局、宽度、高度、间距和对齐，不能使用空语义",
        check: (content, filePath) => hasModuleLayoutEvidence(content, filePath),
      },
      {
        desc: "complete 模块设计规格的结构化设计 Token 必须覆盖颜色、字体、间距、圆角和阴影",
        check: (content, filePath) => hasModuleDesignTokenEvidence(content, filePath),
      },
      {
        desc: "组件状态必须使用表格逐适用状态记录非空规格与可回查证据，不能只罗列状态名称",
        check: (content, filePath) => hasModuleComponentStateEvidence(content, filePath),
      },
      {
        desc: "响应式规则必须使用断点、布局变化和尺寸/间距变化表格记录具体规则",
        check: (content, filePath) => hasResponsiveEvidence(content, filePath),
      },
      {
        desc: "文字与溢出必须使用场景、字体规格、最大行数/宽度和溢出处理表格记录具体规则",
        check: (content, filePath) => hasOverflowEvidence(content, filePath),
      },
      {
        desc: "提取完整度必须给出 complete、incomplete 或 blocked 结论",
        check: (content) => /结论[\s\S]{0,40}`?(complete|incomplete|blocked)`?/i.test(content),
      },
    ],
  },

  "component-index": {
    label: "组件索引表",
    requiredSections: [
      { pattern: /项目结构概览|Project Overview/i, label: "项目结构概览" },
      { pattern: /组件索引|Component Index/i, label: "组件索引" },
      { pattern: /扫描日志|Scan Log/i, label: "扫描日志" },
    ],
    requiredFields: [],
    formatRules: [
      {
        desc: "组件索引必须包含表格（至少一个组件行）",
        check: (content) => {
          // 匹配 Markdown 表格行: | 组件名 | ... |
          const tableRows = content.match(/^\|.+\|.+\|$/gm);
          return tableRows && tableRows.length >= 2; // header + 至少一行
        },
      },
      {
        desc: "每个组件行必须包含'导入路径'列",
        check: (content) =>
          /导入路径|import.*path|import/i.test(content),
      },
    ],
  },

  handoff: {
    label: "工作包最小上下文交接",
    requiredSections: [
      { pattern: /当前目标.*覆盖 UC/i, label: "当前目标与覆盖 UC" },
      { pattern: /范围.*非目标/i, label: "范围与非目标" },
      { pattern: /已确认决策.*接口契约/i, label: "已确认决策与接口契约" },
      { pattern: /系统不变量.*风险/i, label: "系统不变量与风险" },
      { pattern: /当前阻塞项/i, label: "当前阻塞项" },
      { pattern: /允许读取清单/i, label: "允许读取清单" },
      { pattern: /代码.*测试范围/i, label: "代码与测试范围" },
      { pattern: /下一动作.*停止条件/i, label: "下一动作与停止条件" },
    ],
    requiredFields: [],
    formatRules: [
      {
        desc: "读取清单必须包含路径、读取模式、范围、理由和失效条件",
        check: (content) =>
          /路径/i.test(content) &&
          /读取模式/i.test(content) &&
          /范围/i.test(content) &&
          /理由/i.test(content) &&
          /失效条件/i.test(content) &&
          /\b(section|targeted|full)\b/i.test(content),
      },
    ],
  },

  "component-slice": {
    label: "工作包组件上下文切片",
    requiredSections: [
      { pattern: /索引来源/i, label: "索引来源" },
      { pattern: /生成条件/i, label: "生成条件" },
      { pattern: /候选组件|候选资源/i, label: "候选资源" },
      { pattern: /未命中.*定向回查/i, label: "未命中与定向回查" },
    ],
    requiredFields: [],
    formatRules: [
      {
        desc: "组件切片必须记录完整索引路径和版本",
        check: (content) =>
          /COMPONENT-INDEX\.md/i.test(content) && /索引版本/i.test(content),
      },
      {
        desc: "候选资源必须包含导入路径、用途、可复用性和证据",
        check: (content) =>
          /导入路径/i.test(content) &&
          /用途/i.test(content) &&
          /可复用性/i.test(content) &&
          /证据/i.test(content),
      },
    ],
  },

  components: createComponentRules({ requireReady: false }),

  "components-readiness": createComponentRules({ requireReady: true }),

  "tdd-proposal": {
    label: "TDD（待确认技术方案）",
    requiredSections: [
      { pattern: /组件树|Component Tree/i, label: "组件树" },
      { pattern: /数据流|Data Flow|状态管理/i, label: "数据流设计" },
      { pattern: /API.*契约|接口.*契约|API.*Contract|services/i, label: "API契约" },
      { pattern: /性能|Performance|优化/i, label: "性能策略" },
      { pattern: /风险评估|Risk Assessment/i, label: "风险评估" },
      ...TDD_RESPONSIBILITY_REQUIRED_SECTIONS,
    ],
    requiredFields: [],
    formatRules: [
      {
        desc: "API契约必须包含请求方法(GET/POST/PUT/DELETE)",
        check: (content) => /\b(GET|POST|PUT|DELETE|PATCH)\b/i.test(content),
      },
      {
        desc: "TypeScript类型定义必须存在（无any）",
        check: (content) => /interface|type\s+\w+\s*=/i.test(content),
      },
      ...RESPONSIBILITY_TREE_FORMAT_RULES,
      ...TDD_DESIGN_COVERAGE_FORMAT_RULES,
      {
        desc: "异步路径的乱序响应和重复提交必须至少为9分，或提供不适用证明",
        check: (content, filePath) =>
          isTemplateArtifact(filePath) || hasValidAsyncRiskDecision(content),
      },
      {
        desc: "风险评估不能保留占位内容",
        check: (content, filePath) =>
          isTemplateArtifact(filePath) ||
          !hasUnresolvedPlaceholder(
            extractMarkdownSection(content, /风险评估|Risk Assessment/i),
          ),
      },
    ],
  },

  tdd: {
    label: "TDD（技术设计文档）",
    requiredSections: [
      { pattern: /组件树|Component Tree/i, label: "组件树" },
      { pattern: /数据流|Data Flow|状态管理/i, label: "数据流设计" },
      { pattern: /API.*契约|接口.*契约|API.*Contract|services/i, label: "API契约" },
      { pattern: /性能|Performance|优化/i, label: "性能策略" },
      { pattern: /风险评估|Risk Assessment/i, label: "风险评估" },
      ...TDD_RESPONSIBILITY_REQUIRED_SECTIONS,
      { pattern: /技术方案确认|方案确认记录|Proposal Confirmation/i, label: "技术方案确认" },
    ],
    requiredFields: [],
    formatRules: [
      {
        desc: "API契约必须包含请求方法(GET/POST/PUT/DELETE)",
        check: (content) =>
          /\b(GET|POST|PUT|DELETE|PATCH)\b/i.test(content),
      },
      {
        desc: "TypeScript类型定义必须存在（无any）",
        check: (content) =>
          /interface|type\s+\w+\s*=/i.test(content),
      },
      ...RESPONSIBILITY_TREE_FORMAT_RULES,
      ...TDD_DESIGN_COVERAGE_FORMAT_RULES,
      {
        desc: "最终 TDD 必须记录用户已确认技术方案",
        check: (content, filePath) =>
          isTemplateArtifact(filePath) ||
          isLegacyArtifactPath(filePath) ||
          hasConfirmedArchitectureProposal(content),
      },
      {
        desc: "异步路径的乱序响应和重复提交必须至少为9分，或提供不适用证明",
        check: (content, filePath) =>
          isTemplateArtifact(filePath) || hasValidAsyncRiskDecision(content),
      },
      {
        desc: "风险评估不能保留占位内容",
        check: (content, filePath) =>
          isTemplateArtifact(filePath) ||
          !hasUnresolvedPlaceholder(
            extractMarkdownSection(content, /风险评估|Risk Assessment/i),
          ),
      },
    ],
  },

  "review-proposal": createReviewRules(false),
  review: createReviewRules(true),

  "task-breakdown": {
    label: "任务拆分方案",
    requiredSections: [
      { pattern: /需求.*拆分.*就绪|拆分.*就绪|Decomposition Readiness/i, label: "需求拆分就绪" },
      { pattern: /工作包.*清单|Work Package.*List/i, label: "工作包清单" },
      { pattern: /UC.*工作包.*映射|工作包.*UC.*映射|UC.*Mapping/i, label: "UC与工作包映射" },
      { pattern: /工作包.*依赖|依赖.*分析|Dependency/i, label: "工作包依赖分析" },
      { pattern: /编排.*决策|Orchestration Decision/i, label: "编排决策" },
      { pattern: /执行.*顺序|Execution.*Order|批次/i, label: "执行顺序" },
    ],
    requiredFields: [],
    formatRules: [
      {
        desc: "编排决策必须包含执行拓扑、治理深度、理由和升级触发器",
        check: (content, filePath) =>
          isTemplateArtifact(filePath) ||
          (/\b(single-workstream|multi-workstream)\b/i.test(content) &&
            /\b(fast|standard|rigorous)\b/i.test(content) &&
            /理由|reason/i.test(content) &&
            /升级触发|upgrade trigger/i.test(content)),
      },
      {
        desc: "工作包清单和UC映射必须使用工作包编号",
        check: (content, filePath) =>
          isTemplateArtifact(filePath) ||
          (/\bWP\d+\b/i.test(content) &&
            /UC.*WP\d+|WP\d+.*UC/i.test(content)),
      },
      {
        desc: "依赖关系不能有循环引用",
        check: (content) => {
          // 工作包依赖图只做双向循环的轻量检测，完整拓扑仍由语义审查负责。
          const deps = [];
          const depRegex = /^\s*-\s*(WP\d+)\s+依赖(?:于)?\s+(WP\d+)/gim;
          let match;
          while ((match = depRegex.exec(content)) !== null) {
            deps.push({ from: match[1], to: match[2] });
          }
          // 检查是否有双向依赖
          for (const d of deps) {
            const reverse = deps.find((x) => x.from === d.to && x.to === d.from);
            if (reverse) return false;
          }
          return true;
        },
        failDetail: () => "检测到循环依赖（A依赖B且B依赖A）",
      },
    ],
  },

  "global-architecture-proposal": {
    label: "全局架构方案（待用户确认）",
    requiredSections: [
      { pattern: /统一数据模型|数据模型|Data Model|types/i, label: "统一数据模型" },
      { pattern: /共享组件|Shared.*Component|组件库/i, label: "共享组件库" },
      { pattern: /路由|布局|Layout|Router/i, label: "全局路由/布局" },
      { pattern: /各.*工作包.*架构.*边界|工作包.*边界|各.*UC.*架构.*边界|UC.*边界|架构.*边界/i, label: "各工作包架构边界" },
      { pattern: /风险评估|Risk Assessment/i, label: "风险评估" },
      ...GLOBAL_ARCHITECTURE_RESPONSIBILITY_REQUIRED_SECTIONS,
    ],
    requiredFields: [],
    formatRules: [
      {
        desc: "目录结构必须有清晰的层级",
        check: (content) => /src\/|pages\/|components\/|├──|└──/i.test(content),
      },
      {
        desc: "共享可见组件必须有 Props 契约；纯非视觉共享架构必须提供 types/API 契约",
        check: (content, filePath) => hasSharedArchitectureContract(content, filePath),
      },
      ...GLOBAL_ARCHITECTURE_RESPONSIBILITY_FORMAT_RULES,
      {
        desc: "风险评估不能保留占位内容",
        check: (content, filePath) =>
          isTemplateArtifact(filePath) ||
          !hasUnresolvedPlaceholder(
            extractMarkdownSection(content, /风险评估|Risk Assessment/i),
          ),
      },
    ],
  },

  "global-architecture": {
    label: "全局架构方案",
    requiredSections: [
      { pattern: /统一数据模型|数据模型|Data Model|types/i, label: "统一数据模型" },
      { pattern: /共享组件|Shared.*Component|组件库/i, label: "共享组件库" },
      { pattern: /路由|布局|Layout|Router/i, label: "全局路由/布局" },
      { pattern: /各.*工作包.*架构.*边界|工作包.*边界|各.*UC.*架构.*边界|UC.*边界|架构.*边界/i, label: "各工作包架构边界" },
      { pattern: /风险评估|Risk Assessment/i, label: "风险评估" },
      ...GLOBAL_ARCHITECTURE_RESPONSIBILITY_REQUIRED_SECTIONS,
      { pattern: /技术方案确认|方案确认记录|Proposal Confirmation/i, label: "技术方案确认" },
    ],
    requiredFields: [],
    formatRules: [
      {
        desc: "目录结构必须有清晰的层级",
        check: (content) =>
          /src\/|pages\/|components\/|├──|└──/i.test(content),
      },
      {
        desc: "共享可见组件必须有 Props 契约；纯非视觉共享架构必须提供 types/API 契约",
        check: (content, filePath) => hasSharedArchitectureContract(content, filePath),
      },
      ...GLOBAL_ARCHITECTURE_RESPONSIBILITY_FORMAT_RULES,
      {
        desc: "最终全局架构必须记录用户已确认技术方案",
        check: (content, filePath) =>
          isTemplateArtifact(filePath) ||
          isLegacyArtifactPath(filePath) ||
          hasConfirmedArchitectureProposal(content),
      },
      {
        desc: "风险评估不能保留占位内容",
        check: (content, filePath) =>
          isTemplateArtifact(filePath) ||
          !hasUnresolvedPlaceholder(
            extractMarkdownSection(content, /风险评估|Risk Assessment/i),
          ),
      },
    ],
  },
};

// ============================================================
// 辅助函数
// ============================================================

/**
 * 读取问题清单中的全部 Markdown 标题行。
 *
 * @param {string} content 审查报告 Markdown 内容
 * @returns {string[]} 去除空白后的问题标题
 */
function getReviewIssueHeadingLines(content) {
  const issueSection = extractMarkdownSection(
    content,
    /问题.*(?:列表|清单)|Issue.*List|问题详情/i,
  );
  return issueSection
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^#{3,6}\s+/.test(line));
}

/**
 * 从严格的三级问题标题读取稳定编号。
 *
 * @param {string} content 审查报告 Markdown 内容
 * @returns {string[]} 保留出现顺序的大写稳定问题编号
 */
function getReviewIssueIds(content) {
  return getReviewIssueHeadingLines(content).flatMap((heading) => {
    const match = heading.match(/^###\s+(P[012]-\d+)\s*[:：-]\s*\S/i);
    return match ? [match[1].toUpperCase()] : [];
  });
}

/**
 * 检查问题标题是否全部使用稳定唯一编号。
 *
 * @param {string} content 审查报告 Markdown 内容
 * @returns {string[]} 问题格式错误列表
 */
function getReviewIssueFormatErrors(content) {
  const headings = getReviewIssueHeadingLines(content);
  const issueLikeHeadings = headings.filter(
    (heading) => /\bP[012](?:\b|-)|\[P[012]\]|问题\s*\d+/i.test(heading),
  );
  const invalidHeadings = issueLikeHeadings.filter(
    (heading) => !/^###\s+P[012]-\d+\s*[:：-]\s*\S/i.test(heading),
  );
  const issueSection = extractMarkdownSection(
    content,
    /问题.*(?:列表|清单)|Issue.*List|问题详情/i,
  );
  const unheadedSeverityIssues = issueSection
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        !/^#{3,6}\s+/.test(line) &&
        /^(?:[-*]\s*)?(?:\*\*)?\[?P[012]\]?(?:\*\*)?\s*[:：-]\s*\S/i.test(line),
    );
  const issueIds = getReviewIssueIds(content);
  const duplicateIds = Array.from(new Set(issueIds.filter(
    (issueId, index) => issueIds.indexOf(issueId) !== index,
  )));
  const errors = [];

  if (invalidHeadings.length > 0 || unheadedSeverityIssues.length > 0) {
    errors.push(
      `以下问题未使用 ### P0-1/P1-1/P2-1 稳定问题编号：${[
        ...invalidHeadings,
        ...unheadedSeverityIssues,
      ].join(" | ")}`,
    );
  }
  if (duplicateIds.length > 0) {
    errors.push(`稳定问题编号重复：${duplicateIds.join("、")}`);
  }
  return errors;
}

/**
 * 从审查报告中提取每个严格编号的问题块。
 *
 * @param {string} content 审查报告 Markdown 内容
 * @returns {string[]} 带标题和正文的问题块
 */
function extractIssues(content) {
  const issueSection = extractMarkdownSection(
    content,
    /问题.*(?:列表|清单)|Issue.*List|问题详情/i,
  );
  const matches = Array.from(
    issueSection.matchAll(/^###\s+P[012]-\d+\s*[:：-]\s*\S.*$/gim),
  );
  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? issueSection.length;
    return issueSection.slice(start, end).trim();
  });
}

/**
 * 判断当前校验对象是否为仓库模板，模板允许保留引导性占位符。
 *
 * @param {string} filePath 文件路径
 * @returns {boolean} 是否为模板文件
 */
function isTemplateArtifact(filePath) {
  return /templates[\\/].+-template\.md$/i.test(filePath);
}

/**
 * 判断文件是否位于旧版 artifacts 目录。
 *
 * @param {string} filePath 产物路径。
 * @returns {boolean} 是否为旧版只读产物。
 */
function isLegacyArtifactPath(filePath) {
  const normalizedPath = path.normalize(filePath);
  return normalizedPath.includes(
    `${path.sep}.dev-flow${path.sep}artifacts${path.sep}`,
  );
}

/**
 * 提取指定 Markdown 标题下的内容，供语义槽位校验使用。
 *
 * @param {string} content Markdown 内容
 * @param {RegExp} headingPattern 标题匹配规则
 * @returns {string} 章节内容
 */
function extractMarkdownSection(content, headingPattern) {
  const lines = content.split("\n");
  const headingIndex = lines.findIndex(
    (line) => /^#{1,6}\s+/.test(line) && headingPattern.test(line),
  );
  if (headingIndex === -1) return "";

  const headingLevel = lines[headingIndex].match(/^(#{1,6})\s+/)?.[1].length ?? 6;
  const sectionLines = [];

  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const nextHeading = lines[index].match(/^(#{1,6})\s+/);
    if (nextHeading && nextHeading[1].length <= headingLevel) break;
    sectionLines.push(lines[index]);
  }

  return sectionLines.join("\n");
}

/**
 * 读取职责目录树中的目录和文件条目。
 *
 * @param {string} content 架构产物 Markdown 内容
 * @returns {string[]} 去除空白后的树条目
 */
function getResponsibilityTreeEntries(content) {
  const section = extractMarkdownSection(content, /职责目录树|Responsibility Tree/i);
  const fencedBlocks = Array.from(
    section.matchAll(/```(?:text)?\s*\n([\s\S]*?)```/gi),
    (match) => match[1],
  );
  const treeSource = fencedBlocks.length > 0 ? fencedBlocks.join("\n") : section;

  return treeSource
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      if (line.length === 0 || /^[-*>]/.test(line) || line.includes("|")) return false;
      return /(?:├──|└──|│)|^(?:\.?\.?\/)?[A-Za-z0-9_.@-]+(?:\/|\\)/.test(line);
    });
}

/**
 * 判断单个职责目录树条目是否具备逐项变更、边界和职责约束注解。
 *
 * @param {string} entry 单个目录或文件树条目
 * @returns {boolean} 是否满足逐项注解契约
 */
function isValidResponsibilityTreeEntry(entry) {
  const annotation = entry.match(
    /#\s*\[(新增|修改|复用|不变)\]\[(WP\d+|共享)\]\s*(.+)$/i,
  )?.[3]?.trim() ?? "";
  return (
    hasMeaningfulArtifactValue(annotation) &&
    /职责|负责|承载|入口|边界|只|仅|禁止|保持|允许|不得|不变|展示|提供|管理/.test(
      annotation,
    )
  );
}

/**
 * 读取页面组件树中的显式可见 UI 条目。
 *
 * @param {string} content 组件方案 Markdown 内容
 * @returns {{ entries: string[], names: string[] }} 树条目及显式组件名
 */
function getVisibleComponentTreeData(content) {
  const section = extractMarkdownSection(content, /页面.*组件树|组件树|Component Tree/i);
  const fencedBlocks = Array.from(
    section.matchAll(/```(?:text)?\s*\n([\s\S]*?)```/gi),
    (match) => match[1],
  );
  const treeSource = fencedBlocks.length > 0 ? fencedBlocks.join("\n") : section;
  const candidateLines = treeSource
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const entries = fencedBlocks.length > 0
    ? candidateLines
    : candidateLines.filter((line) => /(?:├──|└──|──\s)|^\[UI\]/.test(line));
  const names = entries.flatMap((entry) => {
    const match = entry.match(/\[UI\]\s*([A-Za-z][A-Za-z0-9_]*)/);
    return match ? [match[1]] : [];
  });
  return { entries, names };
}

/**
 * 校验页面组件树显式 UI 集合与设计矩阵视觉行集合完全一致。
 *
 * @param {string} content 组件方案 Markdown 内容
 * @returns {boolean} 是否一一对应且不存在重复组件名
 */
function hasMatchingVisibleComponentCoverage(content) {
  const { entries, names } = getVisibleComponentTreeData(content);
  if (entries.length === 0 || entries.some((entry) => !/\[UI\]\s*[A-Za-z]/.test(entry))) {
    return false;
  }

  const visualRows = getDesignCoverageRows(content).filter(
    (row) => row.length === 7 && row[5].toLowerCase() !== "not-applicable",
  );
  const matrixNames = visualRows.map((row) => row[0]);
  const treeNameSet = new Set(names);
  const matrixNameSet = new Set(matrixNames);
  return (
    treeNameSet.size === names.length &&
    matrixNameSet.size === matrixNames.length &&
    treeNameSet.size === matrixNameSet.size &&
    Array.from(treeNameSet).every((name) => matrixNameSet.has(name))
  );
}

/**
 * 校验第二轮及以后是否声明了增量模式和四类输入标签。
 *
 * @param {string} content 审查报告 Markdown 内容
 * @returns {boolean} 是否具备基础增量复审输入
 */
function hasValidIncrementalReviewInput(content) {
  const section = extractMarkdownSection(content, /复审模式.*输入范围/i);
  const selectedIssues = extractReviewInputValue(
    section,
    "用户选中.*修改.*问题",
  );
  const actualChanges = extractReviewInputValue(
    section,
    "本轮实际修改(?:项|文件)",
  );
  const directImpact = extractReviewInputValue(section, "直接影响范围");
  const testEvidence = extractReviewInputValue(section, "相关测试证据");
  const directCaller = extractInlineReviewEvidenceValue(
    directImpact,
    "直接调用方",
  );
  const directContract = extractInlineReviewEvidenceValue(
    directImpact,
    "直接契约",
  );
  const affectedTest = extractInlineReviewEvidenceValue(
    directImpact,
    "直接受影响测试",
  );
  const actualCommand = extractInlineReviewEvidenceValue(
    testEvidence,
    "(?:实际|测试)命令",
  );
  const testResult = extractInlineReviewEvidenceValue(
    testEvidence,
    "结果(?:摘要)?",
  );
  const hasNumericExitCode = /(?:^|[；;])\s*退出码\s*[:：]\s*\d+(?:\s*[；;。]|$)/.test(
    testEvidence,
  );
  const selectedIssueIds = getStableIssueIdSet(selectedIssues);
  const actualChangeIds = getStableIssueIdSet(actualChanges);
  const isActualNonEmptySubset =
    actualChangeIds.size > 0 &&
    Array.from(actualChangeIds).every((issueId) => selectedIssueIds.has(issueId));
  const hasAllDirectImpactEvidence =
    hasValidDirectImpactValue(directCaller, "caller") &&
    hasValidDirectImpactValue(directContract, "contract") &&
    hasValidDirectImpactValue(affectedTest, "test");

  return (
    /(?:审查模式|模式|mode)\s*[:：]\s*`?incremental`?(?:\s|[。；;，,]|$)/i.test(section) &&
    selectedIssueIds.size > 0 &&
    isActualNonEmptySubset &&
    hasPreciseReviewFilePath(actualChanges) &&
    directImpact.trim().length > 0 &&
    hasAllDirectImpactEvidence &&
    hasStrictReviewEvidenceValue(testEvidence) &&
    hasStrictReviewEvidenceValue(actualCommand) &&
    hasNumericExitCode &&
    hasStrictReviewEvidenceValue(testResult)
  );
}

/**
 * 从复审输入值中读取稳定问题编号集合。
 *
 * @param {string} value 用户选中项或实际修改项字段
 * @returns {Set<string>} 大写稳定问题编号集合
 */
function getStableIssueIdSet(value) {
  return new Set(
    Array.from(value.matchAll(/\bP[012]-\d+\b/gi), (match) => match[0].toUpperCase()),
  );
}

/**
 * 判断直接影响值是否为具体证据，或为带可核验原因的不适用说明。
 *
 * @param {string} value 单类直接影响证据
 * @param {"caller" | "contract" | "test"} evidenceType 证据类别
 * @returns {boolean} 是否满足具体值或带证据不适用分支
 */
function hasValidDirectImpactValue(value, evidenceType) {
  const notApplicableReason = value.match(/^不适用\s*[:：]\s*(.+)$/)?.[1]?.trim() ?? "";
  if (notApplicableReason.length > 0) {
    return (
      notApplicableReason.length >= 6 &&
      hasMeaningfulArtifactValue(notApplicableReason) &&
      !/^(?:无|未知|待确认|没有原因)$/.test(notApplicableReason)
    );
  }
  if (!hasStrictReviewEvidenceValue(value)) return false;
  if (evidenceType === "contract") {
    return /(?:[A-Za-z_$][A-Za-z0-9_$]{2,}|(?:GET|POST|PUT|PATCH|DELETE)\s+\/\S+)/.test(
      value,
    );
  }
  return hasPreciseReviewFilePath(value);
}

/**
 * 从增量复审章节读取单行标签值。
 *
 * @param {string} section 复审模式与输入范围章节
 * @param {string} labelPattern 字段标签正则文本
 * @returns {string} 去除空白后的字段值
 */
function extractReviewInputValue(section, labelPattern) {
  const match = section.match(
    new RegExp(`^\\s*-?\\s*${labelPattern}\\s*[:：]\\s*(.+)$`, "im"),
  );
  return match?.[1]?.trim() ?? "";
}

/**
 * 从复审字段内部读取分号分隔的标签值。
 *
 * @param {string} evidence 复审字段完整内容
 * @param {string} labelPattern 内部标签正则文本
 * @returns {string} 内部标签对应值
 */
function extractInlineReviewEvidenceValue(evidence, labelPattern) {
  const match = evidence.match(
    new RegExp(`(?:^|[；;])\\s*${labelPattern}\\s*[:：]\\s*([^；;]+)`, "i"),
  );
  return match?.[1]?.trim() ?? "";
}

/**
 * 判断复审证据值去除引号后是否排除严格空语义与占位内容。
 *
 * @param {string} value 复审证据值
 * @returns {boolean} 是否为可执行的非空证据
 */
function hasStrictReviewEvidenceValue(value) {
  const normalizedValue = value
    .replace(/[`'"“”‘’「」『』《》〈〉]/g, "")
    .trim();
  return (
    hasMeaningfulArtifactValue(normalizedValue) &&
    !/(?:^|[:：；;，,\s])(?:无|不适用|待确认|占位)(?=$|[。；;，,\s])/i.test(
      normalizedValue,
    )
  );
}

/**
 * 判断复审证据是否包含带目录和扩展名的精确文件路径。
 *
 * @param {string} value 可能包含路径的证据值
 * @returns {boolean} 是否包含精确文件路径
 */
function hasPreciseReviewFilePath(value) {
  return /(?:^|[\s`])(?:\.{0,2}\/)?(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.[A-Za-z0-9]+/.test(
    value,
  );
}

/**
 * 汇总最终审查报告的用户处置错误。
 *
 * @param {string} content 审查报告 Markdown 内容
 * @returns {string[]} 用户处置错误列表
 */
function getReviewDispositionErrors(content) {
  const issueFormatErrors = getReviewIssueFormatErrors(content);
  const issueIds = [...new Set(getReviewIssueIds(content))];
  const dispositionSection = extractMarkdownSection(
    content,
    /审查问题处置|Review Issue Disposition/i,
  );
  const expectedHeader = ["问题编号", "级别", "用户决定", "状态", "用户依据与残余风险"];

  // 无问题时只接受固定终态，防止处置关键词散落在其他章节后绕过门禁。
  if (issueFormatErrors.length > 0) {
    return issueFormatErrors;
  }

  if (issueIds.length === 0) {
    return /\bNO_CHANGES_REQUESTED\b/i.test(dispositionSection)
      ? []
      : ["问题清单没有稳定问题编号，审查问题处置必须记录 NO_CHANGES_REQUESTED"];
  }

  // 有问题时必须使用固定五列表格，才能逐编号验证决定与状态的映射。
  const tableRows = getSectionTableRows(
    content,
    /审查问题处置|Review Issue Disposition/i,
  );
  if (!hasExactTableHeader(tableRows, expectedHeader)) {
    return ["审查问题处置必须使用固定五列结构化处置表，不能用散落关键词代替"];
  }
  const dispositionRows = getTableDataRows(tableRows, expectedHeader);
  const errors = [];

  for (const issueId of issueIds) {
    const matchingRows = dispositionRows.filter(
      (row) => row[0]?.toUpperCase() === issueId,
    );
    if (matchingRows.length !== 1) {
      errors.push(`${issueId} 必须且只能匹配一条结构化用户处置记录`);
      continue;
    }
    errors.push(...validateReviewDispositionRow(matchingRows[0], issueId));
  }

  // 表中不允许出现问题清单之外的编号，避免历史问题或散落关键词混入本轮处置。
  for (const row of dispositionRows) {
    const dispositionIssueId = row[0]?.toUpperCase();
    if (/^P[012]-\d+$/.test(dispositionIssueId) && !issueIds.includes(dispositionIssueId)) {
      errors.push(`${dispositionIssueId} 不在本轮问题清单中`);
    }
  }
  return errors;
}

/**
 * 校验单条审查问题处置的级别、决定、状态和用户依据。
 *
 * @param {string[]} row 五列处置表数据行
 * @param {string} issueId 稳定问题编号
 * @returns {string[]} 当前行的校验错误
 */
function validateReviewDispositionRow(row, issueId) {
  if (row.length !== 5) return [`${issueId} 的结构化处置记录必须为五列`];
  const [, severity, decision, status, evidence] = row;
  const errors = [];

  // 级别由稳定编号前缀唯一确定，表格不得另行改写。
  if (severity !== issueId.slice(0, 2)) {
    errors.push(`${issueId} 的级别列必须为 ${issueId.slice(0, 2)}`);
  }

  // 用户决定与机器状态使用一一映射，拒绝矛盾或自造枚举值。
  if (decision === "修改" && status !== "SELECTED_FOR_REVISION") {
    errors.push(`${issueId} 的用户决定“修改”与状态矛盾，必须为 SELECTED_FOR_REVISION`);
  } else if (
    (decision === "不修改" || decision === "跳过此次修改") &&
    status !== "WAIVED_BY_USER"
  ) {
    errors.push(`${issueId} 的用户决定“${decision}”与状态矛盾，必须为 WAIVED_BY_USER`);
  } else if (!["修改", "不修改", "跳过此次修改"].includes(decision)) {
    errors.push(`${issueId} 的用户决定必须为修改、不修改或跳过此次修改`);
  }

  // 选中项记录决定依据，豁免项还必须保留可追溯原话和具体残余风险。
  if (
    status === "SELECTED_FOR_REVISION" &&
    !hasSelectedReviewDecisionEvidence(evidence, issueId)
  ) {
    errors.push(`${issueId} 的 SELECTED_FOR_REVISION 缺少明确用户决定依据`);
  }
  if (status === "WAIVED_BY_USER" && !hasWaivedReviewDecisionEvidence(evidence)) {
    errors.push(`${issueId} 的 WAIVED_BY_USER 必须记录用户明确原话或决定与具体残余风险`);
  }
  if (!["SELECTED_FOR_REVISION", "WAIVED_BY_USER"].includes(status)) {
    errors.push(`${issueId} 的状态必须为 SELECTED_FOR_REVISION 或 WAIVED_BY_USER`);
  }
  return errors;
}

/**
 * 判断选中修改的问题是否记录了具体且方向为修改或修复的用户决定依据。
 *
 * @param {string} evidence 用户依据列
 * @param {string} issueId 当前稳定问题编号
 * @returns {boolean} 是否具备明确、非空且正向选择修改的决定依据
 */
function hasSelectedReviewDecisionEvidence(evidence, issueId) {
  const normalizedEvidence = evidence
    .normalize("NFKC")
    .replace(/[`'"“”‘’「」『』《》〈〉]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const hasNegativeRevision = /(?:不(?:要|再|予|做|需要)?\s*(?:修改|修复|改动)|跳过(?:此次)?\s*(?:修改|修复|改动)?|拒绝(?:进行)?\s*(?:修改|修复|改动)|无需(?:进行)?\s*(?:修改|修复|改动)|不用\s*(?:修改|修复|改动)|放弃(?:此次|进行)?\s*(?:修改|修复|改动))/.test(
    normalizedEvidence,
  );

  // 整格任一否定决定都优先于局部正向片段，避免证据顺序改变校验结果。
  if (hasNegativeRevision) return false;

  const explicitSelection = normalizedEvidence.match(
    /用户[^；;|]*(?:明确(?:选择|决定)|原话)[^；;|]*/,
  )?.[0] ?? "";
  const hasPositiveRevision = /(?:修改|修复)/.test(explicitSelection);
  const hasMatchingIssueId = new RegExp(`\\b${issueId}\\b`, "i").test(normalizedEvidence);
  return (
    hasStrictReviewEvidenceValue(normalizedEvidence) &&
    explicitSelection.length > 0 &&
    hasPositiveRevision &&
    hasMatchingIssueId
  );
}

/**
 * 判断用户豁免是否同时记录明确决定和具体残余风险。
 *
 * @param {string} evidence 用户依据与残余风险列
 * @returns {boolean} 是否具备完整豁免证据
 */
function hasWaivedReviewDecisionEvidence(evidence) {
  const hasUserDecision =
    hasLabeledDispositionValue(evidence, "用户(?:明确)?原话(?:摘要)?") ||
    hasLabeledDispositionValue(evidence, "用户(?:明确)?决定");
  return hasUserDecision && hasLabeledDispositionValue(evidence, "残余风险");
}

/**
 * 读取设计覆盖矩阵中的数据行，忽略表头与分隔行。
 *
 * @param {string} content 组件方案 Markdown 内容
 * @returns {string[][]} 每行按 Markdown 单元格拆分后的字段列表
 */
function getDesignCoverageRows(content) {
  const matrix = extractMarkdownSection(content, /设计覆盖矩阵|Design Coverage Matrix/i);
  return matrix
    .split("\n")
    .filter((line) => line.trim().length > 0 && line.includes("|"))
    .map((line) => parseMarkdownTableRow(line))
    .filter((cells) =>
      !isDesignCoverageMatrixHeader(cells) &&
      !cells.every((cell) => /^-+$/.test(cell)),
    );
}

/**
 * 按 Markdown 表格规则解析一行，兼容可选的首尾管道。
 *
 * @param {string} line Markdown 表格行
 * @returns {string[]} 去除空白后的单元格列表
 */
function parseMarkdownTableRow(line) {
  const normalizedLine = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return normalizedLine.split("|").map((cell) => cell.trim());
}

/**
 * 读取指定章节中的 Markdown 表格行。
 *
 * @param {string} content Markdown 内容
 * @param {RegExp} headingPattern 章节标题匹配规则
 * @returns {string[][]} 章节内的表格单元格
 */
function getSectionTableRows(content, headingPattern) {
  return extractMarkdownSection(content, headingPattern)
    .split("\n")
    .filter((line) => line.trim().startsWith("|") && line.trim().endsWith("|"))
    .map((line) => parseMarkdownTableRow(line));
}

/**
 * 判断表格行是否为 Markdown 分隔行。
 *
 * @param {string[]} row Markdown 表格单元格
 * @returns {boolean} 是否为分隔行
 */
function isMarkdownSeparatorRow(row) {
  return row.length > 0 && row.every((cell) => /^:?-{3,}:?$/.test(cell));
}

/**
 * 判断表格是否包含精确表头。
 *
 * @param {string[][]} rows 表格行
 * @param {string[]} expectedHeader 公开契约表头
 * @returns {boolean} 是否包含精确表头
 */
function hasExactTableHeader(rows, expectedHeader) {
  return rows.some(
    (row) =>
      row.length === expectedHeader.length &&
      row.every((cell, index) => cell === expectedHeader[index]),
  );
}

/**
 * 过滤表头与分隔行，仅保留数据行。
 *
 * @param {string[][]} rows 表格行
 * @param {string[]} expectedHeader 公开契约表头
 * @returns {string[][]} 数据行
 */
function getTableDataRows(rows, expectedHeader) {
  return rows.filter(
    (row) =>
      !isMarkdownSeparatorRow(row) &&
      !(
        row.length === expectedHeader.length &&
        row.every((cell, index) => cell === expectedHeader[index])
      ),
  );
}

/**
 * 判断产物字段是否已填写为可执行值。
 *
 * @param {string} value 字段值
 * @returns {boolean} 是否不是空值或未完成占位
 */
function hasConcreteArtifactValue(value) {
  const normalizedValue = value.trim();
  return (
    normalizedValue.length > 0 &&
    !/\{[^}\n]+\}|占位|待补(?:充)?|稍后补充|\bTBD\b|\bTODO\b|\bunknown\b|\.\.\./i.test(
      normalizedValue,
    ) &&
    !/^(?:无(?:[（(][^)）]*[)）])?|不适用|none|n\/?a)$/i.test(normalizedValue)
  );
}

/**
 * 判断字段是否包含可执行且非空语义的证据。
 *
 * @param {string} value 产物字段值
 * @returns {boolean} 是否不是无、不适用或等价空值
 */
function hasMeaningfulArtifactValue(value) {
  return hasConcreteArtifactValue(value);
}

/**
 * 判断字段是否为合法的日历日期，可选时间和时区。
 *
 * @param {string} value 日期证据字段
 * @returns {boolean} 是否为 YYYY-MM-DD 或带合法时间/时区的日期值
 */
function hasValidArtifactDate(value) {
  if (!hasConcreteArtifactValue(value)) return false;

  const dateMatch = value.trim().match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\s*(Z|[+-]\d{2}:\d{2}))?)?$/,
  );
  if (!dateMatch) return false;

  const [, yearText, monthText, dayText, hourText = "0", minuteText = "0", secondText = "0", timezone] = dateMatch;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const isCalendarDate =
    utcDate.getUTCFullYear() === year &&
    utcDate.getUTCMonth() === month - 1 &&
    utcDate.getUTCDate() === day;
  if (!isCalendarDate || hour > 23 || minute > 59 || second > 59) return false;
  if (!timezone || timezone === "Z") return true;

  const [, timezoneHourText, timezoneMinuteText] = timezone.match(/[+-](\d{2}):(\d{2})/) ?? [];
  return Number(timezoneHourText) <= 14 && Number(timezoneMinuteText) <= 59;
}

/**
 * 判断 URL 是否携带可识别的精确设计节点参数或片段。
 *
 * @param {string} value 设计证据字段
 * @returns {boolean} 是否包含 node-id、nodeId 或 node 的非空值
 */
function hasPreciseDesignNodeUrl(value) {
  const urlMatch = value.match(/https?:\/\/[^\s`|]+/i);
  if (!urlMatch) return false;

  try {
    const designUrl = new URL(urlMatch[0].replace(/[。；;,]+$/, ""));
    const hasNodeQuery = Array.from(designUrl.searchParams.entries()).some(
      ([key, parameterValue]) =>
        ["node-id", "nodeid", "node"].includes(key.toLowerCase()) &&
        parameterValue.trim().length > 0,
    );
    const decodedHash = decodeURIComponent(designUrl.hash);
    const hasNodeHash = /(?:^|[?#&])(?:node-id|nodeid|node)=([^&#\s]+)/i.test(decodedHash);
    return hasNodeQuery || hasNodeHash;
  } catch {
    return false;
  }
}

/**
 * 从项目视觉基线证据中读取并规范化相对项目路径。
 *
 * @param {string} designEvidence 设计覆盖矩阵或登记表中的证据字段
 * @returns {string} 规范化后的项目相对路径，非法时返回空字符串
 */
function getNormalizedProjectBaselinePath(designEvidence) {
  const baselineMatch = designEvidence.match(/^项目视觉基线\s*[:：]\s*`?([^`]+)`?$/i);
  const rawBaselinePath = baselineMatch?.[1]?.trim().replaceAll("\\", "/") ?? "";
  if (!rawBaselinePath || path.isAbsolute(rawBaselinePath)) return "";

  const aliasNormalizedPath = rawBaselinePath.startsWith("@/")
    ? `src/${rawBaselinePath.slice(2)}`
    : rawBaselinePath;
  const normalizedPath = path.normalize(aliasNormalizedPath);
  const resolvedPath = path.resolve(process.cwd(), normalizedPath);
  const relativePath = path.relative(process.cwd(), resolvedPath);
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) return "";
  return relativePath;
}

/**
 * 判断视觉基线证据是否指向项目 cwd 内真实存在的组件或样式文件。
 *
 * @param {string} designEvidence 项目视觉基线证据字段
 * @param {string} filePath 当前校验文件路径
 * @returns {boolean} 是否为合法且存在的项目文件
 */
function hasExistingProjectVisualBaseline(designEvidence, filePath) {
  if (
    isTemplateArtifact(filePath) &&
    /^项目视觉基线\s*[:：]\s*`?[^`\n]+`?$/i.test(designEvidence.trim())
  ) {
    return true;
  }

  const baselinePath = getNormalizedProjectBaselinePath(designEvidence);
  if (!baselinePath) return false;
  if (!/\.(?:tsx?|jsx?|vue|svelte|css|scss|sass|less|styl)$/i.test(baselinePath)) return false;

  try {
    const projectRoot = fs.realpathSync(process.cwd());
    const realBaselinePath = fs.realpathSync(path.resolve(projectRoot, baselinePath));
    const relativeRealPath = path.relative(projectRoot, realBaselinePath);
    const isInsideProject =
      relativeRealPath.length > 0 &&
      !relativeRealPath.startsWith("..") &&
      !path.isAbsolute(relativeRealPath);
    return isInsideProject && fs.statSync(realBaselinePath).isFile();
  } catch {
    return false;
  }
}

/**
 * 读取设计源状态判定章节中的唯一任务级状态。
 *
 * @param {string} content 设计源登记表内容
 * @returns {string} 精确的 inactive、required 或空字符串
 */
function getDesignSourceStatus(content) {
  const contentLines = content.split("\n");
  const statusHeadingPattern = /^##\s+(?:\d+\.\s*)?(?:状态判定|Design Source Status)\s*$/i;
  const statusFieldPattern = /^\s*(?:[-*+]\s*)?(?:\*\*)?当前状态(?:\*\*)?\s*[:：]/i;
  const exactStatusPattern = /^\s*(?:[-*+]\s*)?(?:\*\*)?当前状态(?:\*\*)?\s*[:：]\s*`?(inactive|required)`?\s*[。.;；]?\s*$/i;
  const statusHeadings = contentLines.filter((line) => statusHeadingPattern.test(line));
  const statusFields = contentLines.filter((line) => statusFieldPattern.test(line));
  if (statusHeadings.length !== 1 || statusFields.length !== 1) return "";

  const statusSection = extractMarkdownSection(content, /状态判定|Design Source Status/i);
  if (/\bwaived\b|任务级[^。；;\n]{0,16}豁免|整体[^。；;\n]{0,16}豁免/i.test(statusSection)) {
    return "";
  }

  return statusFields[0]
    .match(exactStatusPattern)
    ?.[1]?.toLowerCase() ?? "";
}

/**
 * 判断登记表是否实际登记了顶层或精确设计链接。
 *
 * @param {string} content 设计源登记表内容
 * @returns {boolean} 是否存在已提供设计源
 */
function hasRegisteredDesignSource(content) {
  return /https?:\/\//i.test(content);
}

/**
 * 校验设计源登记表的逐组件证据映射。
 *
 * @param {string} content 设计源登记表内容
 * @param {string} filePath 当前校验文件路径
 * @returns {boolean} 是否包含完整表头和真实数据行
 */
function hasDesignSourceComponentMapping(content, filePath) {
  const rows = getSectionTableRows(content, /模块设计源清单|Module Design Sources/i);
  if (!hasExactTableHeader(rows, DESIGN_SOURCE_MAPPING_HEADER)) return false;
  if (isTemplateArtifact(filePath)) return true;

  const designSourceStatus = getDesignSourceStatus(content);
  const allowedCompleteness = new Set(["complete", "blocked", "waived", "not-applicable"]);
  const dataRows = getTableDataRows(rows, DESIGN_SOURCE_MAPPING_HEADER);
  return dataRows.length > 0 && dataRows.every((row) => {
    if (row.length !== DESIGN_SOURCE_MAPPING_HEADER.length) return false;
    if (
      ![row[0], row[1], row[2], row[3], row[8]].every(
        (value) => hasConcreteArtifactValue(value),
      ) ||
      !/\bWP\d+\b/i.test(row[3]) ||
      !allowedCompleteness.has(row[8].toLowerCase())
    ) {
      return false;
    }
    if (!hasValidArtifactDate(row[10])) return false;

    const completeness = row[8].toLowerCase();
    if (completeness === "not-applicable") {
      return [row[5], row[6], row[7], row[11], row[12]].every(
        (value) => value.trim().toLowerCase() === "不适用",
      );
    }
    if (completeness !== "complete") {
      const branchEvidence = [row[5], row[6], row[7], row[11], row[12]];
      if (!branchEvidence.every((value) => hasConcreteArtifactValue(value))) return false;
      if (designSourceStatus === "inactive") {
        return /^(?:无|不适用)$/i.test(row[4]);
      }
      return designSourceStatus === "required" && hasConcreteArtifactValue(row[4]);
    }

    const hasCompleteSharedEvidence = [row[6], row[7], row[11], row[12]].every(
      (value) => hasMeaningfulArtifactValue(value),
    );
    if (!hasCompleteSharedEvidence) return false;
    if (designSourceStatus === "inactive") {
      return (
        /^(?:无|不适用)$/i.test(row[4]) &&
        hasExistingProjectVisualBaseline(row[5], filePath)
      );
    }
    if (designSourceStatus !== "required") return false;

    return (
      /https?:\/\//i.test(row[4]) &&
      hasPreciseDesignNodeUrl(row[5]) &&
      hasMeaningfulArtifactValue(row[9])
    );
  });
}

/**
 * 从章节中读取标签后的单行字段值。
 *
 * @param {string} section 规格章节内容
 * @param {string} labelPattern 标签正则文本
 * @returns {string} 标签对应字段值，未找到时返回空字符串
 */
function getLabeledArtifactValue(section, labelPattern) {
  return section
    .match(new RegExp(`(?:${labelPattern})\\s*[:：]\\s*([^。；;\\n]+)`, "i"))
    ?.[1]?.trim() ?? "";
}

/**
 * 校验模块设计源章节的节点链接与逐字段证据。
 *
 * @param {string} content 模块规格内容
 * @returns {boolean} 是否具有可回查且非空语义的设计源证据
 */
function hasModuleDesignSourceEvidence(content) {
  const designSourceSection = extractMarkdownSection(content, /设计源|Design Source/i);
  const moduleUrl = getLabeledArtifactValue(designSourceSection, "模块链接|Module URL");
  const topLevelUrl = getLabeledArtifactValue(designSourceSection, "顶层链接|Top Level URL");
  const nodeName = getLabeledArtifactValue(designSourceSection, "节点名称|Node Name");
  const nodeScope = getLabeledArtifactValue(designSourceSection, "节点范围|Node Scope");
  const nodeHierarchy = getLabeledArtifactValue(
    designSourceSection,
    "节点层级路径|Node Hierarchy",
  );
  const extractedAt = getLabeledArtifactValue(designSourceSection, "提取时间|Extracted At");

  if (getModuleExtractionStatus(content) !== "complete") {
    return (
      /https?:\/\//i.test(designSourceSection) &&
      [nodeName, nodeScope, nodeHierarchy, extractedAt].every(
        (value) => hasConcreteArtifactValue(value),
      )
    );
  }

  return (
    hasPreciseDesignNodeUrl(moduleUrl) &&
    /https?:\/\//i.test(topLevelUrl) &&
    [nodeName, nodeScope, nodeHierarchy].every((value) => hasMeaningfulArtifactValue(value)) &&
    hasValidArtifactDate(extractedAt)
  );
}

/**
 * 校验模块规格中的 UI 组件精确节点映射。
 *
 * @param {string} content 模块规格内容
 * @param {string} filePath 当前校验文件路径
 * @returns {boolean} 是否逐组件保存可回查节点证据
 */
function hasModuleComponentMapping(content, filePath) {
  const rows = getSectionTableRows(
    content,
    /UI\s*组件.*精确节点映射|Component.*Node Mapping/i,
  );
  if (!hasExactTableHeader(rows, MODULE_COMPONENT_MAPPING_HEADER)) return false;
  if (isTemplateArtifact(filePath)) return true;

  const isCompleteExtraction = getModuleExtractionStatus(content) === "complete";
  const dataRows = getTableDataRows(rows, MODULE_COMPONENT_MAPPING_HEADER);
  return dataRows.length > 0 && dataRows.every((row) => {
    const hasBaseEvidence =
      row.length === MODULE_COMPONENT_MAPPING_HEADER.length &&
      row.every((cell) => hasConcreteArtifactValue(cell)) &&
      /https?:\/\//i.test(row[3]) &&
      hasValidArtifactDate(row[5]) &&
      hasMeaningfulArtifactValue(row[6]);
    if (!hasBaseEvidence || !isCompleteExtraction) return hasBaseEvidence;

    return (
      [row[0], row[1], row[2], row[4], row[6]].every(
        (value) => hasMeaningfulArtifactValue(value),
      ) && hasPreciseDesignNodeUrl(row[3])
    );
  });
}

/**
 * 校验模块规格显式引用 COMPONENTS 设计覆盖版本与 DESIGN-SOURCES 组件记录。
 *
 * @param {string} content 模块规格内容
 * @param {string} filePath 当前校验文件路径
 * @returns {boolean} 是否能按组件回查两类上游证据
 */
function hasModuleEvidenceReferences(content, filePath) {
  const section = extractMarkdownSection(content, /证据引用|Evidence References/i);
  if (isTemplateArtifact(filePath)) {
    return /COMPONENTS\.md/i.test(section) && /DESIGN-SOURCES\.md/i.test(section);
  }

  const mappingRows = getTableDataRows(
    getSectionTableRows(content, /UI\s*组件.*精确节点映射|Component.*Node Mapping/i),
    MODULE_COMPONENT_MAPPING_HEADER,
  );
  return (
    /COMPONENTS\.md\s+v\d+/i.test(section) &&
    /DESIGN-SOURCES\.md/i.test(section) &&
    mappingRows.length > 0 &&
    mappingRows.every((row) => hasMeaningfulArtifactValue(row[0]) && section.includes(row[0])) &&
    !hasUnresolvedPlaceholder(section)
  );
}

/**
 * 校验模块设计 Token 使用固定表格并覆盖全部视觉类别。
 *
 * @param {string} content 模块规格内容
 * @param {string} filePath 当前校验文件路径
 * @returns {boolean} 是否具备颜色、字体、间距、圆角和阴影证据
 */
function hasModuleDesignTokenEvidence(content, filePath) {
  const rows = getSectionTableRows(content, /设计\s*Token|Design Tokens?/i);
  if (!hasExactTableHeader(rows, MODULE_DESIGN_TOKEN_HEADER)) return false;
  if (isTemplateArtifact(filePath)) return true;

  const dataRows = getTableDataRows(rows, MODULE_DESIGN_TOKEN_HEADER);
  const categories = new Set(dataRows.map((row) => row[0]));
  return (
    REQUIRED_DESIGN_TOKEN_CATEGORIES.every((category) => categories.has(category)) &&
    dataRows.every(
      (row) =>
        row.length === MODULE_DESIGN_TOKEN_HEADER.length &&
        row.every((cell) => hasMeaningfulArtifactValue(cell)),
    )
  );
}

/**
 * 将组件映射中的适用状态字段拆分为规范状态集合。
 *
 * @param {string} value 斜杠、逗号或空格分隔的适用状态
 * @returns {string[]} 统一为小写的状态列表
 */
function parseApplicableComponentStates(value) {
  return value
    .split(/[\/，,、\s]+/)
    .map((state) => state.trim().toLowerCase())
    .filter((state) => state.length > 0);
}

/**
 * 校验模块规格为每个适用状态逐行保存规格与证据。
 *
 * @param {string} content 模块规格内容
 * @param {string} filePath 当前校验文件路径
 * @returns {boolean} 是否逐组件、逐适用状态完整记录
 */
function hasModuleComponentStateEvidence(content, filePath) {
  const stateRows = getSectionTableRows(content, /组件状态|Component State/i);
  if (!hasExactTableHeader(stateRows, MODULE_COMPONENT_STATE_HEADER)) return false;
  if (isTemplateArtifact(filePath)) return true;

  const mappingRows = getTableDataRows(
    getSectionTableRows(content, /UI\s*组件.*精确节点映射|Component.*Node Mapping/i),
    MODULE_COMPONENT_MAPPING_HEADER,
  );
  const dataRows = getTableDataRows(stateRows, MODULE_COMPONENT_STATE_HEADER);
  const stateKeys = dataRows.map((row) => `${row[0]}::${row[1].toLowerCase()}`);
  const uniqueStateKeys = new Set(stateKeys);
  const hasValidRows = dataRows.length > 0 && dataRows.every(
    (row) =>
      row.length === MODULE_COMPONENT_STATE_HEADER.length &&
      row.every((cell) => hasMeaningfulArtifactValue(cell)) &&
      ALLOWED_COMPONENT_STATES.has(row[1].toLowerCase()),
  );
  if (!hasValidRows || uniqueStateKeys.size !== stateKeys.length) return false;

  return mappingRows.every((row) => {
    const componentName = row[0];
    const applicableStates = parseApplicableComponentStates(row[6]);
    return (
      applicableStates.length > 0 &&
      applicableStates.every(
        (state) =>
          ALLOWED_COMPONENT_STATES.has(state) &&
          uniqueStateKeys.has(`${componentName}::${state}`),
      )
    );
  });
}

/**
 * 读取模块规格提取完整度章节的明确结论。
 *
 * @param {string} content 模块规格内容
 * @returns {string} complete、incomplete、blocked 或空字符串
 */
function getModuleExtractionStatus(content) {
  const completenessSection = extractMarkdownSection(
    content,
    /提取完整度|Extraction Completeness/i,
  );
  return completenessSection
    .match(/结论\s*[:：]\s*`?(complete|incomplete|blocked)`?/i)
    ?.[1]?.toLowerCase() ?? "";
}

/**
 * 校验 complete 模块规格中的布局与尺寸证据。
 *
 * @param {string} content 模块规格内容
 * @param {string} filePath 当前校验文件路径
 * @returns {boolean} 是否包含非空语义的布局与尺寸说明
 */
function hasModuleLayoutEvidence(content, filePath) {
  const rows = getSectionTableRows(content, /布局与尺寸|Layout.*Size/i);
  if (!hasExactTableHeader(rows, MODULE_LAYOUT_HEADER)) return false;
  if (isTemplateArtifact(filePath)) return true;

  const dataRows = getTableDataRows(rows, MODULE_LAYOUT_HEADER);
  return dataRows.length > 0 && dataRows.every(
    (row) =>
      row.length === MODULE_LAYOUT_HEADER.length &&
      row.every((cell) => hasMeaningfulArtifactValue(cell)),
  );
}

/**
 * 校验指定规格章节使用固定表头并包含真实数据行。
 *
 * @param {string} content 模块规格内容
 * @param {RegExp} headingPattern 章节标题匹配规则
 * @param {string[]} expectedHeader 公开契约表头
 * @param {string} filePath 当前校验文件路径
 * @returns {boolean} 是否包含结构化证据
 */
function hasStructuredEvidenceTable(content, headingPattern, expectedHeader, filePath) {
  const rows = getSectionTableRows(content, headingPattern);
  if (!hasExactTableHeader(rows, expectedHeader)) return false;
  if (isTemplateArtifact(filePath)) return true;

  const dataRows = getTableDataRows(rows, expectedHeader);
  return dataRows.length > 0 && dataRows.every(
    (row) =>
      row.length === expectedHeader.length &&
      row.every((cell) => hasConcreteArtifactValue(cell)),
  );
}

/**
 * 校验响应式规则证据。
 *
 * @param {string} content 模块规格内容
 * @param {string} filePath 当前校验文件路径
 * @returns {boolean} 是否包含响应式结构化证据
 */
function hasResponsiveEvidence(content, filePath) {
  const hasStructuredEvidence = hasStructuredEvidenceTable(
    content,
    /响应式规则|Responsive Rules/i,
    ["断点", "布局变化", "尺寸/间距变化"],
    filePath,
  );
  if (!hasStructuredEvidence || isTemplateArtifact(filePath)) return hasStructuredEvidence;
  if (getModuleExtractionStatus(content) !== "complete") return true;

  const rows = getSectionTableRows(content, /响应式规则|Responsive Rules/i);
  return getTableDataRows(rows, ["断点", "布局变化", "尺寸/间距变化"]).every(
    (row) => row.every((cell) => hasMeaningfulArtifactValue(cell)),
  );
}

/**
 * 校验文字溢出规则证据。
 *
 * @param {string} content 模块规格内容
 * @param {string} filePath 当前校验文件路径
 * @returns {boolean} 是否包含文字溢出结构化证据
 */
function hasOverflowEvidence(content, filePath) {
  const hasStructuredEvidence = hasStructuredEvidenceTable(
    content,
    /文字与溢出|Text.*Overflow/i,
    ["场景", "字体规格", "最大行数/宽度", "溢出处理"],
    filePath,
  );
  if (!hasStructuredEvidence || isTemplateArtifact(filePath)) return hasStructuredEvidence;
  if (getModuleExtractionStatus(content) !== "complete") return true;

  const rows = getSectionTableRows(content, /文字与溢出|Text.*Overflow/i);
  return getTableDataRows(rows, ["场景", "字体规格", "最大行数/宽度", "溢出处理"]).every(
    (row) => row.every((cell) => hasMeaningfulArtifactValue(cell)),
  );
}

/**
 * 判断 complete 行是否具有可回查设计证据、适用状态和处置。
 *
 * @param {string[]} row 设计覆盖矩阵行
 * @param {string} filePath 当前校验文件路径
 * @returns {boolean} 是否满足 complete 开发准入
 */
function hasCompleteDesignCoverageEvidence(row, filePath) {
  const designEvidence = row[3].replace(/^`+|`+$/g, "").trim();
  const requiredStates = row[4].trim();
  const disposition = row[6].trim();
  const hasDesignUrl = hasPreciseDesignNodeUrl(designEvidence);
  const hasRealBaselinePath = hasExistingProjectVisualBaseline(designEvidence, filePath);
  const hasApplicableStates =
    hasConcreteArtifactValue(requiredStates) && !/^(?:无|不适用)$/i.test(requiredStates);
  const hasDisposition =
    hasConcreteArtifactValue(disposition) && !/^(?:无|不适用)$/i.test(disposition);
  const hasInactiveBaselineDisposition = /inactive/i.test(disposition) && /沿用现有视觉规范/.test(disposition);

  return (
    hasApplicableStates &&
    hasDisposition &&
    (hasDesignUrl || (hasRealBaselinePath && hasInactiveBaselineDisposition))
  );
}

/**
 * 判断处置字段是否为带具体值的证据项。
 *
 * @param {string} disposition 逐组件处置记录
 * @param {string} labelPattern 标签正则文本
 * @returns {boolean} 是否存在非占位内容
 */
function hasLabeledDispositionValue(disposition, labelPattern) {
  const match = disposition.match(new RegExp(`${labelPattern}\\s*[:：]\\s*([^；;|\\n]+)`, "i"));
  if (!match) return false;
  const value = match[1].trim().replace(/^[“”"']+|[“”"']+$/g, "");
  return (
    value.length >= 2 &&
    hasConcreteArtifactValue(value) &&
    !/^(?:无|不适用)[。.]?$/.test(value)
  );
}

/**
 * 校验逐组件 waived 同时记录用户原话、残余风险和人工验收范围。
 *
 * @param {string} disposition 逐组件处置记录
 * @returns {boolean} 是否具备完整豁免证据
 */
function hasDetailedWaiverDisposition(disposition) {
  return (
    hasLabeledDispositionValue(disposition, "用户(?:明确)?原话(?:摘要)?") &&
    hasLabeledDispositionValue(disposition, "残余风险") &&
    hasLabeledDispositionValue(disposition, "人工视觉验收范围")
  );
}

/**
 * 从声明字段中读取全部工作包编号。
 *
 * @param {string} value 工作包声明字段
 * @returns {Set<string>} 统一为大写的工作包编号集合
 */
function getWorkPackageIds(value) {
  return new Set(
    Array.from(value.matchAll(/\bWP\d+\b/gi), (match) => match[0].toUpperCase()),
  );
}

/**
 * 从设计归属字段中读取已明确绑定 COMPONENTS.md 的工作包编号。
 *
 * @param {string} value 工作包设计矩阵字段
 * @returns {Set<string>} 已绑定设计矩阵的工作包编号集合
 */
function getDesignMatrixWorkPackageIds(value) {
  return new Set(
    Array.from(
      value.matchAll(/\b(WP\d+)\b\s+COMPONENTS\.md/gi),
      (match) => match[1].toUpperCase(),
    ),
  );
}

/**
 * 判断全局架构是否选择结构化的“无共享可见组件”分支。
 *
 * @param {string} content 全局架构 Markdown 内容
 * @returns {boolean} 是否声明纯非视觉共享边界
 */
function hasNoSharedVisibleComponentsDeclaration(content) {
  const declarationSection = extractMarkdownSection(
    content,
    /共享可见组件声明|Shared Visible Component Declaration/i,
  );
  return /共享可见组件结论\s*[:：]\s*`?无共享可见组件`?/i.test(declarationSection);
}

/**
 * 校验纯非视觉共享架构的证明与职责树未夹带可见文件。
 *
 * @param {string} content 全局架构 Markdown 内容
 * @returns {boolean} 是否仅包含 types、API、service 等非视觉边界
 */
function hasValidNonVisualSharedArchitectureProof(content) {
  const declarationSection = extractMarkdownSection(
    content,
    /共享可见组件声明|Shared Visible Component Declaration/i,
  );
  const ownershipSection = extractMarkdownSection(
    content,
    /共享可见组件设计归属|Shared Visible Component Ownership/i,
  );
  const proof = getLabeledArtifactValue(declarationSection, "非视觉证明");
  const responsibilityEntries = getResponsibilityTreeEntries(content);
  const hasConcreteNonVisualPath = /(?:^|[\s`])(?:[A-Za-z0-9_.-]+\/)+(?:[A-Za-z0-9_.-]+)\.(?:ts|js|json)\b/i.test(
    proof,
  );
  const hasNonVisualBoundary = /types?|services?|API|接口|数据契约|store/i.test(proof);
  const hasVisualTreeEntry = responsibilityEntries.some((entry) => {
    const treePath = entry.split("#")[0].replace(/[├└│─\s]/g, "");
    return (
      /\.(?:tsx|jsx|vue|svelte|html|css|scss|sass|less)\b/i.test(treePath) ||
      /(?:^|\/)(?:components?|layouts?|styles?)(?:\/|$)/i.test(treePath)
    );
  });
  return (
    hasMeaningfulArtifactValue(proof) &&
    hasConcreteNonVisualPath &&
    hasNonVisualBoundary &&
    responsibilityEntries.length > 0 &&
    !hasVisualTreeEntry &&
    /设计归属结论\s*[:：]\s*不适用\s*[:：]\s*无共享可见组件/i.test(ownershipSection)
  );
}

/**
 * 校验共享架构提供与所选分支一致的契约。
 *
 * @param {string} content 全局架构 Markdown 内容
 * @param {string} filePath 当前校验文件路径
 * @returns {boolean} 是否具备 Props 或纯非视觉数据/API 契约
 */
function hasSharedArchitectureContract(content, filePath) {
  if (isTemplateArtifact(filePath)) {
    return /interface.*Props|type.*Props/is.test(content) && /无共享可见组件/.test(content);
  }
  if (!hasNoSharedVisibleComponentsDeclaration(content)) {
    return /interface.*Props|type.*Props/is.test(content);
  }
  return (
    /interface\s+[A-Za-z_$][A-Za-z0-9_$]*(?:Data|Params|Response|Request)|type\s+[A-Za-z_$][A-Za-z0-9_$]*\s*=/i.test(
      content,
    ) &&
    /\b(?:GET|POST|PUT|PATCH|DELETE)\b|services?|API|接口契约/i.test(content)
  );
}

/**
 * 校验共享架构使用明确表格声明可见组件，并逐项精确映射设计矩阵。
 *
 * @param {string} content 全局架构 Markdown 内容
 * @param {string} filePath 当前校验文件路径
 * @returns {boolean} 是否声明表与归属表组件集合完全一致
 */
function hasSharedVisibleComponentOwnership(content, filePath) {
  if (isTemplateArtifact(filePath)) {
    return (
      /\|\s*组件名\s*\|\s*Props 契约\s*\|\s*使用工作包\s*\|/.test(content) &&
      /\|\s*组件名\s*\|\s*工作包设计矩阵\s*\|/.test(content) &&
      /无共享可见组件/.test(content)
    );
  }
  if (hasNoSharedVisibleComponentsDeclaration(content)) {
    return hasValidNonVisualSharedArchitectureProof(content);
  }

  // 分别读取唯一声明表与设计归属表，禁止从共享组件 prose 或接口名称反推组件清单。
  const declarationSection = extractMarkdownSection(
    content,
    /共享可见组件声明|Shared Visible Component Declaration/i,
  );
  const ownershipSection = extractMarkdownSection(
    content,
    /共享可见组件设计归属|Shared Visible Component Ownership/i,
  );
  const declarationRows = declarationSection
    .split("\n")
    .filter((line) => line.trim().startsWith("|") && line.trim().endsWith("|"))
    .map((line) => parseMarkdownTableRow(line));
  const ownershipRows = ownershipSection
    .split("\n")
    .filter((line) => line.trim().startsWith("|") && line.trim().endsWith("|"))
    .map((line) => parseMarkdownTableRow(line));

  // 表头固定为公开产物契约，避免不同列含义被宽松文本匹配误判为合法结构。
  const declarationHeader = ["组件名", "Props 契约", "使用工作包"];
  const ownershipHeader = ["组件名", "工作包设计矩阵"];
  const hasDeclarationHeader = declarationRows.some((row) =>
    row.length === declarationHeader.length && row.every(
      (cell, index) => cell === declarationHeader[index],
    ),
  );
  const hasOwnershipHeader = ownershipRows.some((row) =>
    row.length === ownershipHeader.length && row.every(
      (cell, index) => cell === ownershipHeader[index],
    ),
  );
  if (!hasDeclarationHeader || !hasOwnershipHeader) return false;

  /**
   * 判断 Markdown 表格行是否为分隔行。
   *
   * @param {string[]} row Markdown 表格单元格
   * @returns {boolean} 是否为分隔行
  */
  const isSeparatorRow = (row) => row.every((cell) => /^:?-+:?$/.test(cell));

  // 过滤表头和分隔行后，逐行验证列数、组件标识符、Props 以及具体工作包引用。
  const declarationDataRows = declarationRows.filter(
    (row) => row[0] !== declarationHeader[0] && !isSeparatorRow(row),
  );
  const ownershipDataRows = ownershipRows.filter(
    (row) => row[0] !== ownershipHeader[0] && !isSeparatorRow(row),
  );
  /**
   * 判断共享可见组件名是否为明确的代码标识符。
   *
   * @param {string} name 组件名
   * @returns {boolean} 是否为合法组件名
   */
  const isComponentName = (name) => /^[A-Za-z][A-Za-z0-9_]*$/.test(name);
  const isValidDeclaration = declarationDataRows.length > 0 && declarationDataRows.every(
    (row) =>
      row.length === declarationHeader.length &&
      isComponentName(row[0]) &&
      /Props/.test(row[1]) &&
      getWorkPackageIds(row[2]).size > 0,
  );
  const isValidOwnership = ownershipDataRows.length > 0 && ownershipDataRows.every(
    (row) =>
      row.length === ownershipHeader.length &&
      isComponentName(row[0]) &&
      getDesignMatrixWorkPackageIds(row[1]).size > 0,
  );
  if (!isValidDeclaration || !isValidOwnership) return false;

  // 精确比较组件名集合，并确认每个组件的归属矩阵覆盖声明中的全部使用工作包。
  const declarationNames = new Set(declarationDataRows.map((row) => row[0]));
  const ownershipNames = new Set(ownershipDataRows.map((row) => row[0]));
  const declarationWorkPackages = new Map(
    declarationDataRows.map((row) => [row[0], getWorkPackageIds(row[2])]),
  );
  const ownershipWorkPackages = new Map(
    ownershipDataRows.map((row) => [row[0], getDesignMatrixWorkPackageIds(row[1])]),
  );
  return (
    declarationNames.size === declarationDataRows.length &&
    ownershipNames.size === ownershipDataRows.length &&
    declarationNames.size === ownershipNames.size &&
    Array.from(declarationNames).every((name) => {
      const declaredWorkPackages = declarationWorkPackages.get(name) ?? new Set();
      const ownedWorkPackages = ownershipWorkPackages.get(name) ?? new Set();
      return ownershipNames.has(name) && Array.from(declaredWorkPackages).every(
        (workPackage) => ownedWorkPackages.has(workPackage),
      );
    })
  );
}

/**
 * 判断矩阵单元格是否为完整的设计覆盖矩阵表头。
 *
 * @param {string[]} cells Markdown 表格单元格列表
 * @returns {boolean} 是否为七列设计覆盖矩阵表头
 */
function isDesignCoverageMatrixHeader(cells) {
  const expectedColumns = ["UI 组件", "文件路径", "所属工作包", "精确设计节点", "必需状态", "完整度", "处置"];
  return cells.length === expectedColumns.length && cells.every(
    (cell, index) => cell === expectedColumns[index],
  );
}

/**
 * 检查内容中是否存在设计覆盖矩阵的完整七列表头签名。
 *
 * @param {string} content TDD Markdown 内容
 * @returns {boolean} 是否存在不依赖章节标题的矩阵表头
 */
function hasDesignCoverageMatrixSignature(content) {
  return content
    .split("\n")
    .filter((line) => line.includes("|"))
    .map((line) => parseMarkdownTableRow(line))
    .some((cells) => isDesignCoverageMatrixHeader(cells));
}

/**
 * 判断设计覆盖矩阵中的文件是否属于可直接判定的非视觉文件类型。
 *
 * @param {string} filePath 设计覆盖矩阵中的文件路径
 * @returns {boolean} 是否属于允许标记为不适用的非视觉技术文件
 */
function isNonVisualDesignCoverageFile(filePath) {
  const normalizedPath = filePath.trim().replace(/^`+|`+$/g, "").replaceAll("\\", "/").toLowerCase();
  const isTechnicalDirectory = /(?:^|\/)(?:types?|hooks?|services?|utils?|constants?|tests?|__tests__|mock)(?:\/|$)/.test(
    normalizedPath,
  );
  const isNonVisualCodeFile = /\.(?:ts|js|json)$/.test(normalizedPath);
  const isExplicitTechnicalFile = /(?:^|\/)(?:types?|constants?)\.(?:ts|js|json)$/.test(
    normalizedPath,
  );
  return (isTechnicalDirectory && isNonVisualCodeFile) || isExplicitTechnicalFile;
}

/**
 * 判断 PRD 是否记录了用户明确的设计稿豁免。
 *
 * @param {string} content PRD 内容
 * @returns {boolean} 是否允许跳过设计 Token 校验
 */
function isDesignSourceWaived(content) {
  const designSection = extractMarkdownSection(
    content,
    /设计.*Token|设计.*规范|设计.*约束/i,
  );
  return (
    /当前状态[\s\S]{0,40}`waived`/i.test(designSection) &&
    /用户.*(原话|明确)|豁免.*依据/i.test(designSection)
  );
}

/**
 * 检查关键章节是否仍含未完成占位内容。
 *
 * @param {string} content 章节内容
 * @returns {boolean} 是否存在占位内容
 */
function hasUnresolvedPlaceholder(content) {
  return /\.\.\.|待补充|稍后补充|\bTBD\b|\bTODO\b|\{[^}\n]+\}/i.test(content);
}

/**
 * 校验异步风险是否给出最低分数或可核验的不适用证明。
 *
 * @param {string} content TDD 内容
 * @returns {boolean} 是否满足风险判定要求
 */
function hasValidAsyncRiskDecision(content) {
  const riskSection = extractMarkdownSection(content, /风险评估|Risk Assessment/i);
  const isNotApplicable =
    /异步风险判定[\s\S]{0,120}不适用[\s\S]{0,80}证明\s*[：:][^\n|]{4,}/i.test(
      riskSection,
    );
  if (isNotApplicable && !hasUnresolvedPlaceholder(riskSection)) return true;

  const validScore = "(?:9|1[0-9]|2[0-7])";
  const orderedScores = new RegExp(
    `乱序响应[^\\d]{0,20}${validScore}\\s*分[\\s\\S]{0,120}重复提交[^\\d]{0,20}${validScore}\\s*分`,
    "i",
  );
  const reversedScores = new RegExp(
    `重复提交[^\\d]{0,20}${validScore}\\s*分[\\s\\S]{0,120}乱序响应[^\\d]{0,20}${validScore}\\s*分`,
    "i",
  );
  return orderedScores.test(riskSection) || reversedScores.test(riskSection);
}

/**
 * 校验最终架构产物是否记录用户对技术方案的明确肯定确认。
 *
 * @param {string} content 最终架构产物内容
 * @returns {boolean} 是否存在满足肯定契约且无否定语义的方案确认记录
 */
function hasConfirmedArchitectureProposal(content) {
  const confirmationSection = extractMarkdownSection(
    content,
    /技术方案确认|方案确认记录|Proposal Confirmation/i,
  );
  const hasNegativeConfirmation =
    /(?:尚未|未|待|拒绝|不同意|不接受|取消|撤销|不予|没有|不再|不)(?:明确)?确认/i.test(
      confirmationSection,
    ) ||
    /否认[^。；;\n]{0,16}(?:已(?:经)?确认|确认)/i.test(confirmationSection) ||
    /明确(?:表示)?(?:拒绝|不同意|不接受|取消|撤销|不予|不)确认/i.test(
      confirmationSection,
    );
  return (
    /方案确认状态\s*[：:]\s*`?CONFIRMED`?(?:\s|[。.;；]|$)/im.test(
      confirmationSection,
    ) &&
    /(?:确认依据(?:\*\*)?[ \t]*[：:][ \t]*用户[ \t]*于[ \t]+\d{4}-\d{2}-\d{2}[ \t]*明确确认[ \t]*当前技术方案[ \t]*(?:[。.;；]|$)|确认依据(?:\*\*)?[ \t]*[：:][ \t]*用户[ \t]*明确确认[ \t]*本方案[ \t]*(?:[。.;；]|$))/im.test(
      confirmationSection,
    ) &&
    !hasNegativeConfirmation &&
    !hasUnresolvedPlaceholder(confirmationSection)
  );
}

/**
 * 验证单个产物
 */
function validateArtifact(type, filePath) {
  const rules = VALIDATION_RULES[type];
  if (!rules) {
    return {
      pass: false,
      errors: [`未知的产物类型: "${type}"。支持的类型: ${Object.keys(VALIDATION_RULES).join(", ")}`],
      warnings: [],
    };
  }

  // 检查文件是否存在
  if (!fs.existsSync(filePath)) {
    return {
      pass: false,
      errors: [`文件不存在: ${filePath}`],
      warnings: [],
    };
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const errors = [];
  const warnings = [];

  // 1. 检查必填章节
  for (const section of rules.requiredSections) {
    if (!section.pattern.test(content)) {
      errors.push(`缺少必填章节: "${section.label}"`);
    }
  }

  // 2. 检查必填字段
  for (const field of rules.requiredFields) {
    if (!field.pattern.test(content)) {
      errors.push(`缺少必填字段: "${field.label}"`);
    }
  }

  // 3. 检查格式规则
  for (const rule of rules.formatRules) {
    if (!rule.check(content, filePath)) {
      const detail = rule.failDetail ? rule.failDetail(content) : rule.desc;
      errors.push(`格式不满足: ${detail}`);
    }
  }

  // 4. 通用检查（所有产物）
  // 检查是否有空文件
  if (content.trim().length === 0) {
    errors.push("文件内容为空");
  }

  // 检查是否为纯占位符（模板未填充）
  const placeholderCount = (content.match(/\{[a-zA-Z_]+\}/g) || []).length;
  if (placeholderCount > 10) {
    warnings.push(`文件包含 ${placeholderCount} 个未填充的占位符，可能模板未填充`);
  }

  // 检查是否有明显的截断（最后一个字符不是换行或标点）
  const lastLine = content.trimEnd().split("\n").pop() || "";
  if (lastLine.length > 0 && !/[.!?。！？)\]\}」]$/.test(lastLine.trim())) {
    warnings.push("文件末尾可能被截断（最后一行没有结束标点）");
  }

  return {
    pass: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
    meta: {
      type,
      label: rules.label,
      file: filePath,
      size: content.length,
      lines: content.split("\n").length,
    },
  };
}

// ============================================================
// 主入口
// ============================================================

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(`
产物格式校验工具 (validate-artifact)

用法:
  node scripts/validate-artifact.js <artifact-type> <file-path>
  node scripts/validate-artifact.js --list

示例:
  node scripts/validate-artifact.js prd .dev-flow/artifacts/PRD.md
  node scripts/validate-artifact.js components .dev-flow/artifacts/COMPONENTS.md
  node scripts/validate-artifact.js tdd-proposal .dev-flow/runs/REQ-001/work-packages/WP01/TDD.md
  node scripts/validate-artifact.js tdd .dev-flow/artifacts/TDD.md
  node scripts/validate-artifact.js review-proposal .dev-flow/runs/REQ-001/work-packages/WP01/REVIEW.md
  node scripts/validate-artifact.js review .dev-flow/runs/REQ-001/work-packages/WP01/REVIEW.md
  node scripts/validate-artifact.js task-breakdown .dev-flow/artifacts/TASK-BREAKDOWN.md
  node scripts/validate-artifact.js global-architecture-proposal .dev-flow/runs/REQ-001/GLOBAL-ARCHITECTURE.md
  node scripts/validate-artifact.js global-architecture .dev-flow/artifacts/GLOBAL-ARCHITECTURE.md
  node scripts/validate-artifact.js component-index .dev-flow/artifacts/COMPONENT-INDEX.md

支持的产物类型: ${Object.keys(VALIDATION_RULES).join(", ")}

退出码: 0 = 通过, 1 = 失败
    `.trim());
    process.exit(0);
  }

  if (args.includes("--list")) {
    for (const [type, rules] of Object.entries(VALIDATION_RULES)) {
      console.log(`${type.padEnd(22)} ${rules.label}`);
    }
    process.exit(0);
  }

  if (args.length < 2) {
    console.error("错误: 需要指定产物类型和文件路径。使用 --help 查看用法。");
    process.exit(1);
  }

  const [type, filePath] = args;
  const result = validateArtifact(type, path.resolve(filePath));

  console.log(JSON.stringify(result, null, 2));

  process.exit(result.pass ? 0 : 1);
}

main();
