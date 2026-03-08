---
name: orchestrator-review-workflow
description: Review code with specialized lenses
---

# Workflow Skill

Review the code or changes for correctness, maintainability, reuse, and risk. Report findings before suggesting edits.

When to use this skill:
- Use it when the request needs the review workflow.
- Keep the role chain explicit instead of blending exploration, implementation, review, and testing together.

Execution loop:
- Read the generated context pack and relevant files first.
- Work in short iterations with concrete evidence from files or command output.
- Stop after a role-specific result and hand off if another role is more appropriate.

Preset priorities:
- Lead with correctness, regression risk, and missing verification.
- Keep findings concrete, severity-ordered, and backed by repository evidence.

Completion criteria:
- Stop after findings, open questions, and verification gaps are explicit.
- Keep any summary or suggested edits secondary to the findings.

Avoid:
- Do not rewrite code by default during review.
- Do not dilute real risks with low-signal style commentary.

Roles prepared for this workflow:
- reviewer
- architect

Workflow signals:
- .vscode-test.mjs
- CHANGELOG.md
- CLAUDE.md
- esbuild.js
- eslint.config.mjs
- package-lock.json
- package.json
- README.md

Read .ai-context.md first.
Useful commands: check-types, compile, compile-tests, lint, package, pretest, test, vscode:prepublish.
