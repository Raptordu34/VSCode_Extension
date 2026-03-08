---
name: orchestrator-build-workflow
description: Implement a feature end-to-end
disable-model-invocation: true
context: fork
agent: general-purpose
---

Validate the plan, implement the feature, review the result, and run focused verification before finishing.

When to use this skill:
- Use it when the request matches the build workflow.
- Use the prepared roles instead of improvising a new workflow structure.

Execution loop:
- Read the generated context pack and relevant instruction files first.
- Pick the smallest number of roles needed for the task.
- Keep each role scoped to its responsibility and stop after a concrete result.
- Verify with focused checks before handing back to the user.

Preset priorities:
- Validate the plan quickly, then move toward a minimal end-to-end implementation milestone.
- Keep verification focused and explicit before stopping.

Completion criteria:
- Stop once the requested path is implemented and verified with the smallest relevant checks.
- Call out any remaining risks or intentionally deferred work.

Avoid:
- Do not expand scope into unrelated cleanup or architecture changes.
- Do not stop at partial implementation when a narrow end-to-end slice is achievable.

Use these roles as references:
- orchestrator-architect
- orchestrator-implementer
- orchestrator-reviewer
- orchestrator-tester

Workflow signals:
- .vscode-test.mjs
- CHANGELOG.md
- CLAUDE.md
- esbuild.js
- eslint.config.mjs
- GEMINI.md
- package-lock.json
- package.json

Read .ai-context.md before acting.
Suggested commands: check-types, compile, compile-tests, lint, package, pretest, test, vscode:prepublish.
