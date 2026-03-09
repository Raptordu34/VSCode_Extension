---
name: orchestrator-plan-workflow
description: Produce a concrete implementation plan
---

# Workflow Skill

Investigate the codebase, produce an implementation plan, and highlight reuse opportunities before any code changes.

When to use this skill:
- Use it when the request needs the plan workflow.
- Keep the role chain explicit instead of blending exploration, implementation, review, and testing together.

Execution loop:
- Read the generated context pack and relevant files first.
- Work in short iterations with concrete evidence from files or command output.
- Stop after a role-specific result and hand off if another role is more appropriate.

Preset priorities:
- Turn the gathered context into a constrained implementation plan with explicit checkpoints.
- Prefer reuse and low-complexity changes over fresh abstractions.

Completion criteria:
- Stop once the plan is concrete enough to implement without design guesswork.
- Keep code changes out of scope unless the user explicitly requests implementation.

Avoid:
- Do not present multiple equivalent plans when one clear recommendation is defensible.
- Do not hide tradeoffs or prerequisites.

Roles prepared for this workflow:
- explorer
- architect

Workflow signals:
- .vscode-test.mjs
- CHANGELOG.md
- CLAUDE.md
- esbuild.js
- eslint.config.mjs
- GEMINI.md
- package-lock.json
- package.json

Read .ai-context.md first.
Useful commands: check-types, compile, compile-tests, lint, package, pretest, test, vscode:prepublish.
