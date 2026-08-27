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
        desc: "设计源状态必须是 inactive、required 或 waived",
        check: (content) => /当前状态[\s\S]{0,40}`?(inactive|required|waived)`?/i.test(content),
      },
      {
        desc: "waived 状态必须记录用户原话或明确豁免依据",
        check: (content, filePath) => {
          if (isTemplateArtifact(filePath) || !/当前状态[\s\S]{0,40}`?waived`?/i.test(content)) {
            return true;
          }
          return /用户.*原话|用户.*明确|豁免.*依据/i.test(content);
        },
      },
      {
        desc: "模块设计源清单必须使用表格记录模块和完整度",
        check: (content) =>
          /\|\s*模块\s*\|/i.test(content) && /完整度|Completeness/i.test(content),
      },
    ],
  },

  "module-design-spec": {
    label: "模块设计规格",
    requiredSections: [
      { pattern: /设计源|Design Source/i, label: "设计源" },
      { pattern: /布局与尺寸|Layout.*Size/i, label: "布局与尺寸" },
      { pattern: /组件状态|Component State/i, label: "组件状态" },
      { pattern: /文字与溢出|Text.*Overflow/i, label: "文字与溢出" },
      { pattern: /提取完整度|Extraction Completeness/i, label: "提取完整度" },
    ],
    requiredFields: [],
    formatRules: [
      {
        desc: "设计源必须包含可回查链接、提取时间和节点范围",
        check: (content, filePath) =>
          isTemplateArtifact(filePath) ||
          (/https?:\/\//i.test(extractMarkdownSection(content, /设计源|Design Source/i)) &&
            /提取时间|Extracted At/i.test(extractMarkdownSection(content, /设计源|Design Source/i)) &&
            /节点范围|Node Scope/i.test(extractMarkdownSection(content, /设计源|Design Source/i))),
      },
      {
        desc: "组件状态必须覆盖 normal、hover、active、focus、disabled、loading、empty、error 或说明不适用",
        check: (content, filePath) => {
          if (isTemplateArtifact(filePath)) return true;
          const stateSection = extractMarkdownSection(content, /组件状态|Component State/i);
          if (/整体不适用|全部不适用/i.test(stateSection)) return true;
          return ["normal", "hover", "active", "focus", "disabled", "loading", "empty", "error"]
            .every((state) => new RegExp(`\\b${state}\\b`, "i").test(stateSection));
        },
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

  components: {
    label: "组件拆分方案",
    requiredSections: [
      { pattern: /页面.*组件树|组件树|Component Tree/i, label: "页面级组件树" },
      { pattern: /通用组件|复用组件|Shared.*Component/i, label: "通用组件清单" },
    ],
    requiredFields: [],
    formatRules: [
      {
        desc: "组件树必须描述组件层级（嵌套结构）",
        check: (content) =>
          /├──|└──|──\s/i.test(content) || /<.*>/.test(content),
      },
      {
        desc: "每个组件必须有职责描述",
        check: (content) =>
          /职责|Responsibility|负责/i.test(content),
      },
      {
        desc: "每个组件必须有Props/State/数据来源",
        check: (content) =>
          /Props|props/i.test(content) && /State|state/i.test(content),
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
      { pattern: /架构对抗审查|对抗性审查|Adversarial Review/i, label: "架构对抗审查" },
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
      {
        desc: "架构对抗审查必须包含明确结论",
        check: (content) =>
          /\b(BLOCK|ACCEPT_WITH_RISK|ACCEPT)\b/.test(content),
      },
      {
        desc: "架构对抗审查必须记录审查者、独立输入边界和BLOCK处置",
        check: (content) =>
          /审查者|Reviewer/i.test(content) &&
          /输入边界|Input Boundary/i.test(content) &&
          /BLOCK.*处置|BLOCK.*Disposition/i.test(content),
      },
      {
        desc: "异步路径的乱序响应和重复提交必须至少为9分，或提供不适用证明",
        check: (content, filePath) =>
          isTemplateArtifact(filePath) || hasValidAsyncRiskDecision(content),
      },
      {
        desc: "风险评估和架构对抗审查不能保留占位内容",
        check: (content, filePath) =>
          isTemplateArtifact(filePath) ||
          (!hasUnresolvedPlaceholder(
            extractMarkdownSection(content, /风险评估|Risk Assessment/i),
          ) &&
            !hasUnresolvedPlaceholder(
              extractMarkdownSection(content, /架构对抗审查|对抗性审查|Adversarial Review/i),
            )),
      },
    ],
  },

  review: {
    label: "审查报告",
    requiredSections: [
      { pattern: /审查摘要|Review Summary|概览/i, label: "审查摘要" },
      { pattern: /审查依据层级|Review Hierarchy/i, label: "审查依据层级" },
      { pattern: /问题.*列表|问题.*清单|Issue.*List|问题详情/i, label: "问题列表" },
      { pattern: /反例验证|Counterexample/i, label: "反例验证" },
      { pattern: /运行证据|Verification Evidence/i, label: "运行证据" },
    ],
    requiredFields: [],
    formatRules: [
      {
        desc: "每个问题必须有级别（P0/P1/P2）",
        check: (content) => {
          const issues = extractIssues(content);
          if (issues.length === 0) return true; // 无问题则通过
          return issues.every((i) => /\bP[012]\b/.test(i));
        },
        failDetail: (content) => {
          const issues = extractIssues(content);
          const badIssues = issues.filter((i) => !/\bP[012]\b/.test(i));
          return `以下问题缺少级别标注：${badIssues.map((i) => i.slice(0, 60)).join(" | ")}`;
        },
      },
      {
        desc: "每个问题必须有修复方案",
        check: (content) => {
          const issues = extractIssues(content);
          if (issues.length === 0) return true;
          return issues.every(
            (i) =>
              /修复|fix|改为|改为|改成|建议|方案/i.test(i)
          );
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
        desc: "第二轮及以后必须记录增量复审输入：未关闭问题、本轮修改文件和相关测试证据",
        check: (content, filePath) => {
          if (
            isLegacyArtifactPath(filePath) ||
            isTemplateArtifact(filePath) ||
            !/第\s*[2-9]\d*\s*轮/i.test(content)
          ) {
            return true;
          }
          const section = extractMarkdownSection(
            content,
            /复审模式.*输入范围/i,
          );
          return (
            /incremental/i.test(section) &&
            /未关闭问题/i.test(section) &&
            /本轮修改文件/i.test(section) &&
            /相关测试证据/i.test(section)
          );
        },
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
    ],
  },

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

  "global-architecture": {
    label: "全局架构方案",
    requiredSections: [
      { pattern: /统一数据模型|数据模型|Data Model|types/i, label: "统一数据模型" },
      { pattern: /共享组件|Shared.*Component|组件库/i, label: "共享组件库" },
      { pattern: /路由|布局|Layout|Router/i, label: "全局路由/布局" },
      { pattern: /各.*工作包.*架构.*边界|工作包.*边界|各.*UC.*架构.*边界|UC.*边界|架构.*边界/i, label: "各工作包架构边界" },
      { pattern: /风险评估|Risk Assessment/i, label: "风险评估" },
      { pattern: /架构对抗审查|对抗性审查|Adversarial Review/i, label: "架构对抗审查" },
    ],
    requiredFields: [],
    formatRules: [
      {
        desc: "目录结构必须有清晰的层级",
        check: (content) =>
          /src\/|pages\/|components\/|├──|└──/i.test(content),
      },
      {
        desc: "每个共享组件必须有Props契约",
        check: (content) =>
          /interface.*Props|type.*Props/i.test(content),
      },
      {
        desc: "架构对抗审查必须包含明确结论",
        check: (content) =>
          /\b(BLOCK|ACCEPT_WITH_RISK|ACCEPT)\b/.test(content),
      },
      {
        desc: "架构对抗审查必须记录审查者、独立输入边界和BLOCK处置",
        check: (content) =>
          /审查者|Reviewer/i.test(content) &&
          /输入边界|Input Boundary/i.test(content) &&
          /BLOCK.*处置|BLOCK.*Disposition/i.test(content),
      },
      {
        desc: "风险评估和架构对抗审查不能保留占位内容",
        check: (content, filePath) =>
          isTemplateArtifact(filePath) ||
          (!hasUnresolvedPlaceholder(
            extractMarkdownSection(content, /风险评估|Risk Assessment/i),
          ) &&
            !hasUnresolvedPlaceholder(
              extractMarkdownSection(content, /架构对抗审查|对抗性审查|Adversarial Review/i),
            )),
      },
    ],
  },
};

// ============================================================
// 辅助函数
// ============================================================

/**
 * 从审查报告中提取每个问题块
 */
function extractIssues(content) {
  // 匹配问题块：以"###"或"|"或"P0/P1/P2"开头的段落
  const blocks = content.split(/\n(?=###\s|\*\*P[012]\*\*|P[012][：:])/);
  // 过滤掉太短的块（不是问题）
  return blocks.filter(
    (b) => b.length > 20 && (/\bP[012]\b/.test(b) || /###\s+问题/.test(b) || /问题\s*\d+/.test(b))
  );
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
  node scripts/validate-artifact.js tdd .dev-flow/artifacts/TDD.md
  node scripts/validate-artifact.js review .dev-flow/runs/REQ-001/work-packages/WP01/REVIEW.md
  node scripts/validate-artifact.js task-breakdown .dev-flow/artifacts/TASK-BREAKDOWN.md
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
