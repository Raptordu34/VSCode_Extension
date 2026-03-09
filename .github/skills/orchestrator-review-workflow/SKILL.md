---
name: orchestrator-review-workflow
description: Review code with specialized lenses
---

# Workflow Skill

Review the code or changes for correctness, maintainability, reuse, and risk. Report findings before suggesting edits.

When to use this skill:
- Use it when the user request maps to the review workflow.
- Keep the work split across the prepared agents and handoffs rather than treating everything as one generic chat.

Execution loop:
- Read the generated context pack first.
- Route the task to the narrowest valid role.
- Use handoffs when the next step is better owned by another prepared agent.
- End with verification status, open risks, and the next concrete action.

Preset priorities:
- Lead with correctness, regression risk, and missing verification.
- Keep findings concrete, severity-ordered, and backed by repository evidence.

Completion criteria:
- Stop once findings, open questions, and verification gaps are explicit.
- Keep any summary or suggested edits secondary to the findings.

Avoid:
- Do not rewrite code by default during review.
- Do not dilute real risks with low-signal style commentary.

Workflow roles to invoke or hand off to:
- Orchestrator Reviewer
- Orchestrator Architect

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
