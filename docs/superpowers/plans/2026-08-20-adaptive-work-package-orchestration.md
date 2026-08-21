# Adaptive Work Package Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace UC-count routing with progressive requirement convergence, work-package decomposition, and two-dimensional orchestration.

**Architecture:** Keep `SKILL.md` as the orchestration entrypoint, preserve existing artifact filenames for compatibility, and change `TASK-BREAKDOWN.md` from a UC-per-task document into a work-package plan containing UC mappings and routing decisions. Update Agent instructions, templates, deterministic validation, manifest metadata, and README together so the vocabulary cannot drift.

**Tech Stack:** Markdown Skill instructions, Node.js CommonJS validation scripts, Node.js built-in test runner.

**Spec:** `docs/superpowers/specs/2026-08-20-adaptive-work-package-orchestration-design.md`

## Global Constraints

- Do not execute Git commands.
- Preserve existing artifact filenames unless the approved design explicitly changes them.
- UC remains a requirement and acceptance concept; work package becomes the execution unit.
- Final routing is selected only after the requirement baseline is ready for decomposition.
- Hidden complexity may upgrade governance or topology; execution must not silently downgrade.
- Comments added to JavaScript files must be written in Chinese.

---

### Task 1: Add failing structural and routing contract tests

**Files:**
- Modify: `tests/validate-artifact.test.js`
- Modify: `scripts/validate-artifact.js`

**Interfaces:**
- Consumes: existing `validateArtifact(type, content)` behavior.
- Produces: task-breakdown validation requiring work-package mapping and orchestration decision sections.

- [ ] Add a task-breakdown fixture that uses the legacy UC-per-task shape and assert that it fails the new contract.
- [ ] Add a fixture containing requirement readiness, work packages, UC mapping, topology, governance, reasons, and upgrade triggers.
- [ ] Run `node --test tests/validate-artifact.test.js` and verify the new test fails because the validator still accepts the legacy shape or rejects the new shape.
- [ ] Update task-breakdown required sections in `scripts/validate-artifact.js`.
- [ ] Re-run the focused test and verify it passes.

### Task 2: Replace top-level UC routing with two-stage orchestration

**Files:**
- Modify: `SKILL.md`

**Interfaces:**
- Consumes: approved requirement baseline and existing structured context protocol.
- Produces: `discoveryDepth`, `topology`, `governance`, `workPackageId`, and upgrade triggers.

- [ ] Replace the single-UC/multi-UC decision table with preliminary intake and post-baseline routing.
- [ ] Define decomposition readiness, work-package rules, topology, governance depth, and escalation invariants.
- [ ] Rewrite single and multi execution loops to iterate over work packages rather than UCs.
- [ ] Update context schema, gates, exceptions, quality checks, and final delivery terminology.
- [ ] Search for remaining statements that equate UC count, page count, and task count.

### Task 3: Update specialist Agent contracts

**Files:**
- Modify: `agents/requirements-analyst.md`
- Modify: `agents/task-decomposer.md`
- Modify: `agents/architect.md`
- Modify: `agents/developer.md`
- Modify: `agents/code-reviewer.md`

**Interfaces:**
- Requirements Analyst produces a confirmed, decomposition-ready requirement baseline.
- Task Decomposer produces candidate work packages and dependency topology.
- Orchestrator owns the final routing decision.
- Architect, Developer, and Reviewer consume work-package context.

- [ ] Add decomposition-readiness output and checks to Requirements Analyst.
- [ ] Replace “one UC equals one task” with cohesion and independent-verification rules.
- [ ] Update architecture modes from UC-count modes to shared-boundary and work-package modes.
- [ ] Update development and review instructions to maintain UC-to-test coverage inside each work package.
- [ ] Ensure the reviewer challenges false splits and false merges.

### Task 4: Update artifact templates and documentation

**Files:**
- Modify: `templates/prd-template.md`
- Modify: `templates/task-breakdown-template.md`
- Modify: `templates/tdd-template.md`
- Modify: `templates/global-architecture-template.md`
- Modify: `templates/review-report-template.md`
- Modify: `manifest.json`
- Modify: `README.md`

**Interfaces:**
- `PRD.md` exposes decomposition readiness.
- `TASK-BREAKDOWN.md` exposes work packages, UC mapping, topology, governance, and upgrade triggers.
- Architecture and review artifacts reference work packages consistently.

- [ ] Add the decomposition-readiness section to the PRD template.
- [ ] Rewrite the task-breakdown template around work packages and the routing decision.
- [ ] Replace UC-loop terminology in architecture, TDD, and review templates where it denotes execution units.
- [ ] Update manifest capabilities to advertise workstream topology and governance depth.
- [ ] Update README examples, mode descriptions, artifacts, and routing explanation.

### Task 5: Skill behavior verification and cleanup

**Files:**
- Verify: `SKILL.md`
- Verify: `agents/*.md`
- Verify: `templates/*.md`
- Verify: `README.md`
- Verify: `manifest.json`

**Interfaces:**
- Scenario input maps to a stable work-package and governance decision.

- [ ] Run baseline scenarios against the legacy instructions and record the UC-count misrouting.
- [ ] Run the same scenarios against the updated Skill and verify single-page/multi-UC cohesion, single-UC/cross-boundary decomposition, and multi-page atomic changes.
- [ ] Check frontmatter, skill name, description, overview, decision table, common mistakes, and examples.
- [ ] Run `node --test tests/validate-artifact.test.js`.
- [ ] Run `npm test`.
- [ ] Run `sh install.sh --check-only`.
- [ ] Run the Skill quick validator if available.
- [ ] Search for obsolete single-UC/multi-UC routing assertions and unresolved placeholders.

## Skill Editing Checklist

### RED

- [ ] Create application and counterexample scenarios.
- [ ] Run the scenarios against the legacy Skill and record failures.
- [ ] Identify the recurring UC/page/task conflation.

### GREEN

- [ ] Preserve the valid `dev-flow` skill name and frontmatter.
- [ ] Keep the description discriminating and focused on invocation conditions.
- [ ] Add searchable work-package, workstream, UC, design, routing, dependency, and risk terminology.
- [ ] State the work-package core principle early.
- [ ] Address the observed baseline failures with a positive routing contract.
- [ ] Use condition-based routing rules instead of broad prohibitions.
- [ ] Keep examples focused on the approved counterexamples.
- [ ] Run the same scenarios against the updated Skill.

### REFACTOR

- [ ] Identify new false-split or false-merge behavior.
- [ ] Add counters only for observed or approved adversarial cases.
- [ ] Re-run scenarios until routing decisions are stable.
- [ ] Keep the decision flow small and non-obvious decisions explicit.
- [ ] Maintain a quick-reference decision table.
- [ ] Document common routing mistakes without narrative history.
- [ ] Add supporting files only when they carry distinct maintained information.

### Deployment

- [ ] Complete local validation without Git operations.
- [ ] Report that commit, push, and PR steps were intentionally skipped because project instructions prohibit Git operations.

