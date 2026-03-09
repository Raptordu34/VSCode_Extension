<!-- ai-context-orchestrator:generated:start -->
## AI Context Orchestrator

- Workflow preset: plan
- Roles prepared: explorer, architect
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
Investigate the codebase, produce an implementation plan, and highlight reuse opportunities before any code changes.

### Preset Priorities
- Turn the gathered context into a constrained implementation plan with explicit checkpoints.
- Prefer reuse and low-complexity changes over fresh abstractions.

### Completion Criteria
- Stop once the plan is concrete enough to implement without design guesswork.
- Keep code changes out of scope unless the user explicitly requests implementation.

### Avoid
- Do not present multiple equivalent plans when one clear recommendation is defensible.
- Do not hide tradeoffs or prerequisites.

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
