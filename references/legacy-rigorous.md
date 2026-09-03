# Legacy Rigorous compatibility

## Explicit load conditions

This reference exists only for resuming, validating, or migrating an existing run that already contains legacy Rigorous artifacts. Load it only when the user explicitly requests legacy compatibility or an existing run records that workflow. New Fast, Standard, Multi, and Rigorous runs use the v2 contract in `SKILL.md` and do not load this file.

## Artifact-to-template map

| Legacy artifact | Template |
| --- | --- |
| `PRD.md` | `templates/prd-template.md` |
| `DESIGN-SOURCES.md` | `templates/design-sources-template.md` |
| `design/{module}.md` | `templates/module-design-spec-template.md` |
| `COMPONENT-INDEX.md` | `templates/component-index-template.md` |
| `COMPONENT-SLICE.md` | `templates/component-slice-template.md` |
| `COMPONENTS.md` | `templates/components-template.md` |
| `TDD.md` | `templates/tdd-template.md` |
| `HANDOFF.md` | `templates/handoff-template.md` |
| `REVIEW.md` | `templates/review-report-template.md` |
| `TASK-BREAKDOWN.md` | `templates/task-breakdown-template.md` |
| `GLOBAL-ARCHITECTURE.md` | `templates/global-architecture-template.md` |

## Validator command

Use the retained validator only against legacy artifacts:

```bash
node .dev-flow/scripts/validate-artifact.js <type> <file>
```

Supported historical types remain defined by `scripts/validate-artifact.js` and its compatibility tests. Do not add legacy artifacts merely to satisfy the validator.

## Migration boundary

Legacy and v2 records are not converted implicitly. Keep an active legacy run on its recorded artifact chain unless the user explicitly approves migration. A migration creates a new v2 requirement baseline and work-package plan from confirmed facts; it does not treat old matrices or readiness status as current truth. Never rewrite, delete, or silently reinterpret historical artifacts.
