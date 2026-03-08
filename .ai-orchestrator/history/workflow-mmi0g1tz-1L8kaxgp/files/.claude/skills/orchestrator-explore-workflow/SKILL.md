---
name: orchestrator-explore-workflow
description: Understand the codebase before changing anything
disable-model-invocation: true
context: fork
agent: Explore
---

Start by understanding the codebase, summarize key files, and wait for the next instruction before editing anything.

When to use this skill:
- Use it when the request matches the explore workflow.
- Use the prepared roles instead of improvising a new workflow structure.

Execution loop:
- Read the generated context pack and relevant instruction files first.
- Pick the smallest number of roles needed for the task.
- Keep each role scoped to its responsibility and stop after a concrete result.
- Verify with focused checks before handing back to the user.

Preset priorities:
- Map the relevant code paths, extension points, and reusable patterns before proposing changes.
- Keep the output descriptive and grounded in files instead of speculative solutioning.

Completion criteria:
- Stop once the user has a clear map of the relevant surface and the likely next action.
- Do not edit code unless a later instruction explicitly converts exploration into implementation.

Avoid:
- Do not drift into implementation detail that the exploration evidence does not justify.
- Do not broaden the scan beyond the user-relevant area of the repository.

Use these roles as references:
- orchestrator-explorer
- orchestrator-architect

Workflow signals:
- .vscode-test.mjs
- CHANGELOG.md
- esbuild.js
- eslint.config.mjs
- package-lock.json
- package.json
- README.md
- tsconfig.json

Read .ai-context.md before acting.
Suggested commands: check-types, compile, compile-tests, lint, package, pretest, test, vscode:prepublish.
