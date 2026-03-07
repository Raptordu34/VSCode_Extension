# AI Context Orchestrator

AI Context Orchestrator is a VS Code extension that prepares an AI workflow instead of only launching an assistant. It generates a reusable workflow context pack, can refresh or reuse that pack intelligently, and can create provider-native artifacts for Claude, Gemini, or GitHub Copilot.

It now also maintains a provider-agnostic workflow relay in `.ai-orchestrator/` so you can explore with one assistant, plan with another, and implement with a third without losing the shared handoff.

## What It Does

- Generates a hidden `.ai-context.md` file at the workspace root.
- Scans the workspace tree, README preview, package metadata, key files, scripts, and AI instruction files.
- Supports workflow presets: `explore`, `plan`, `build`, `debug`, `review`, and `test`.
- Lets you choose a provider target: Claude, Gemini, or Copilot.
- Supports refresh strategies: `reuse`, `smart-refresh`, and `full-rebuild`.
- Supports cost policies: `fast`, `balanced`, and `strong`.
- Can optionally ask a Copilot model to compress and optimize the generated context pack.
- Can generate provider-native artifacts:
	- Claude: `CLAUDE.md`, `.claude/agents/`, `.claude/skills/`
	- Gemini: `GEMINI.md`, `.gemini/agents/`, `.gemini/skills/`
	- Copilot: `.github/copilot-instructions.md`, `.github/agents/`, `.github/skills/`
- Creates shared workflow files in `.ai-orchestrator/`:
	- `session.json` tracks the current stage and previous transitions
	- `brief.md` stores the current user objective
	- `stages/*.md` stores reusable handoffs between assistants

## Workflow

1. Run `AI Context Orchestrator: Init Workflow` from the command palette, or click the status bar button.
2. Choose a workflow preset.
3. Choose the provider target.
4. Choose the context refresh mode.
5. Choose the model cost policy.
6. Choose raw or Copilot-optimized context generation.
7. Choose whether to generate provider-native artifacts.
8. The extension builds or reuses `.ai-context.md`, writes metadata into it, and optionally writes native workflow files for the chosen provider.
9. The extension also writes a shared stage handoff in `.ai-orchestrator/stages/`.
10. You can stop after generation or launch the provider immediately.
11. Later, run `AI Context Orchestrator: Continue Workflow` to move to the next stage, optionally with a different provider.

## Commands

- `AI Context Orchestrator: Init Workflow`
- `AI Context Orchestrator: Continue Workflow`
- `AI Context Orchestrator: Generate Context File`

## Provider Launch Behavior

- Claude: opens a terminal and runs `claude --append-system-prompt-file ".ai-context.md"` with the selected workflow objective.
- Gemini: opens a terminal and runs `gemini` with the selected workflow objective and the generated context file.
- Copilot: opens Copilot Chat and copies a workflow-oriented prompt to the clipboard.

All provider prompts now also reference the shared workflow relay files so each assistant can read the previous handoff and write its own output back into the workspace.

## Native Artifacts

Generated role files are intentionally namespaced with `orchestrator-...` so they do not collide with user-defined agents or skills.

Examples:

- `.claude/agents/orchestrator-architect.md`
- `.gemini/agents/orchestrator-debugger.md`
- `.github/agents/orchestrator-reviewer.agent.md`
- `.github/skills/orchestrator-build-workflow/SKILL.md`

Top-level provider instruction files are updated through a managed section instead of being overwritten completely.

## Shared Workflow Relay

The extension now supports cross-provider transitions such as:

1. Explore with Gemini
2. Continue to Plan with Claude
3. Continue to Build with Copilot

This works by storing the shared workflow state in `.ai-orchestrator/`.

- `.ai-orchestrator/session.json` stores the current stage and prior stages.
- `.ai-orchestrator/brief.md` stores the current user request for the next stage.
- `.ai-orchestrator/stages/01-explore.md`, `02-plan.md`, and so on store handoffs that the next provider should read.

The extension does not try to make providers talk to each other directly. Instead, it uses these relay files as a neutral handoff protocol.

## Settings

Existing settings remain available:

- `aiContextOrchestrator.treeDepth`
- `aiContextOrchestrator.readmePreviewLines`
- `aiContextOrchestrator.contextFilePreviewLines`
- `aiContextOrchestrator.extraContextFiles`
- `aiContextOrchestrator.showIgnoredDirectories`
- `aiContextOrchestrator.maxEntriesPerDirectory`
- `aiContextOrchestrator.optimizeWithCopilot`
- `aiContextOrchestrator.modelFamily`
- `aiContextOrchestrator.autoGenerateOnStartup`

New workflow settings:

- `aiContextOrchestrator.defaultPreset`
- `aiContextOrchestrator.defaultProvider`
- `aiContextOrchestrator.contextRefreshMode`
- `aiContextOrchestrator.costProfile`
- `aiContextOrchestrator.generateNativeArtifacts`
- `aiContextOrchestrator.enabledProviders`

## Requirements

- Claude workflows require the `claude` CLI to be installed and available in `PATH` if you want to launch Claude directly.
- Gemini workflows require the `gemini` CLI to be installed and available in `PATH` if you want to launch Gemini directly.
- Copilot workflows require GitHub Copilot Chat in VS Code.

## Known Limitations

- The current workflow context is generated from the first workspace folder only.
- The workspace tree is intentionally depth-limited to keep the context pack compact.
- Refresh matching currently uses a lightweight signature of scanned inputs, not a full file content hash of the repository.
- Copilot custom agents and skills are generated as files, but the extension does not yet validate that each generated artifact is loaded by the chat customizations UI.
- The extension prepares provider-native roles, but it does not implement its own multi-agent runtime.
- Shared stage handoff files are prepared automatically, but the quality of the transition still depends on the active provider actually updating the generated stage file.

## Development

- Run `npm run compile` to build the extension.
- Run the default Extension launch configuration to test it in an Extension Development Host.
