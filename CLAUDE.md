<!-- ai-context-orchestrator:generated:start -->
## AI Context Orchestrator

- Workflow preset: build
- Roles prepared: architect, implementer, reviewer, tester
- Refresh mode: smart-refresh
- Cost profile: balanced
- Context file: .ai-context.md
- Context budget profile: claude-balanced
- Context budget summary: treeDepth=2, entries=28, readmeLines=20, instructionLines=72, deps=10, devDeps=8, scripts=8, keyFiles=8, instructionFiles=5

<workflow>
Validate the plan, implement the feature, review the result, and run focused verification before finishing.
Validate the plan quickly, then move toward a minimal end-to-end implementation milestone.
Keep verification focused and explicit before stopping.
</workflow>

<context>
Read the generated context pack first and treat it as the primary grounded source for this run.
Reuse existing project patterns before inventing new abstractions.
Keep edits minimal and verify with the smallest relevant checks.
Context budget for this run: treeDepth=2, entries=28, readmeLines=20, instructionLines=72, deps=10, devDeps=8, scripts=8, keyFiles=8, instructionFiles=5.
</context>

<when_to_delegate>
Use subagents when work can run in parallel, when isolated context helps, or when a role can return a compact summary.
Avoid delegating simple sequential work, single-file edits, or tasks where maintaining shared context is more valuable than isolation.
</when_to_delegate>

### Preset priorities
Focus now:
- Validate the plan quickly, then move toward a minimal end-to-end implementation milestone.
- Keep verification focused and explicit before stopping.

Stop when:
- Stop once the requested path is implemented and verified with the smallest relevant checks.
- Call out any remaining risks or intentionally deferred work.

Avoid:
- Do not expand scope into unrelated cleanup or architecture changes.
- Do not stop at partial implementation when a narrow end-to-end slice is achievable.

### Key files
- .vscode-test.mjs
- CHANGELOG.md
- CLAUDE.md
- esbuild.js
- eslint.config.mjs
- GEMINI.md
- package-lock.json
- package.json

### Useful commands
- check-types
- compile
- compile-tests
- lint
- package
- pretest
- test
- vscode:prepublish

### Instruction files already present
- CLAUDE.md
- Claude.md
- claude.md
<!-- ai-context-orchestrator:generated:end -->
