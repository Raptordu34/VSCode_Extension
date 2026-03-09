<!-- ai-context-orchestrator:generated:start -->
## AI Context Orchestrator

- Workflow preset: test
- Roles prepared: tester, implementer
- Refresh mode: smart-refresh
- Cost profile: balanced
- Context file: .ai-context.md
- Context budget profile: gemini-balanced
- Context budget summary: treeDepth=2, entries=28, readmeLines=20, instructionLines=80, deps=10, devDeps=8, scripts=8, keyFiles=8, instructionFiles=4

### Context First
Use the generated context pack as the primary source of truth for repository structure, key files, commands, and constraints.
This run uses a bounded context budget: treeDepth=2, entries=28, readmeLines=20, instructionLines=80, deps=10, devDeps=8, scripts=8, keyFiles=8, instructionFiles=4.
Prefer direct, well-structured reasoning with grounded file evidence over speculative expansion.

### Operating Style
- Keep the workflow explicit instead of blending exploration, planning, implementation, and review together.
- Work in short iterations and reassess after each concrete finding or edit.
- Prefer stable project patterns and minimal edits over flexible abstractions.

### Task
Focus on testing: add or repair tests, run focused checks, and only change implementation when required by failing tests.

### Preset Priorities
- Select the smallest test surface that proves or disproves the change.
- Only adjust implementation when a failing test or testability issue requires it.

### Completion Criteria
- Stop once the focused checks have passed or failed with clear evidence.
- Call out coverage gaps that still matter for regression confidence.

### Avoid
- Do not default to broad suite runs when a focused check is sufficient.
- Do not add coverage that does not reduce a real regression risk.

### Key files
- .vscode-test.mjs
- CHANGELOG.md
- esbuild.js
- eslint.config.mjs
- package-lock.json
- package.json
- README.md
- tsconfig.json

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
No provider-specific instruction files were detected during generation.
<!-- ai-context-orchestrator:generated:end -->
