---
name: orchestrator-test-workflow
description: Add or repair tests
---

# Workflow Skill

Focus on testing: add or repair tests, run focused checks, and only change implementation when required by failing tests.

When to use this skill:
- Use it when the request needs the test workflow.
- Keep the role chain explicit instead of blending exploration, implementation, review, and testing together.

Execution loop:
- Read the generated context pack and relevant files first.
- Work in short iterations with concrete evidence from files or command output.
- Stop after a role-specific result and hand off if another role is more appropriate.

Preset priorities:
- Select the smallest test surface that proves or disproves the change.
- Only adjust implementation when a failing test or testability issue requires it.

Completion criteria:
- Stop once the focused checks have passed or failed with clear evidence.
- Call out coverage gaps that still matter for regression confidence.

Avoid:
- Do not default to broad suite runs when a focused check is sufficient.
- Do not add coverage that does not reduce a real regression risk.

Roles prepared for this workflow:
- tester
- implementer

Workflow signals:
- .vscode-test.mjs
- CHANGELOG.md
- esbuild.js
- eslint.config.mjs
- package-lock.json
- package.json
- README.md
- tsconfig.json

Read .ai-context.md first.
Useful commands: check-types, compile, compile-tests, lint, package, pretest, test, vscode:prepublish.
