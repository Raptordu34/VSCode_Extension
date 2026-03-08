---
name: orchestrator-plan-workflow
description: Produce a concrete implementation plan
disable-model-invocation: true
context: fork
agent: Explore
---

Investigate the codebase, produce an implementation plan, and highlight reuse opportunities before any code changes.

When to use this skill:
- Use it when the request matches the plan workflow.
- Use the prepared roles instead of improvising a new workflow structure.

Execution loop:
- Read the generated context pack and relevant instruction files first.
- Pick the smallest number of roles needed for the task.
- Keep each role scoped to its responsibility and stop after a concrete result.
- Verify with focused checks before handing back to the user.

Preset priorities:
- Turn the gathered context into a constrained implementation plan with explicit checkpoints.
- Prefer reuse and low-complexity changes over fresh abstractions.

Completion criteria:
- Stop once the plan is concrete enough to implement without design guesswork.
- Keep code changes out of scope unless the user explicitly requests implementation.

Avoid:
- Do not present multiple equivalent plans when one clear recommendation is defensible.
- Do not hide tradeoffs or prerequisites.

Use these roles as references:
- orchestrator-explorer
- orchestrator-architect

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
