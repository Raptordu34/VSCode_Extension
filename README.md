# AI Context Orchestrator

AI Context Orchestrator is a VS Code extension that prepares an AI workflow instead of only launching an assistant. It generates a reusable workflow context pack, can refresh or reuse that pack intelligently, and can create provider-native artifacts for Claude, Gemini, or GitHub Copilot.

It now also maintains a provider-agnostic workflow relay in `.ai-orchestrator/` so you can explore with one assistant, plan with another, and implement with a third without losing the shared handoff.

## What It Does

- Generates a hidden `.ai-context.md` file at the workspace root.
- Scans the workspace tree, README preview, package metadata, key files, scripts, and AI instruction files.
- Supports workflow presets: `explore`, `plan`, `build`, `debug`, `review`, and `test`.
- Lets you choose a provider target: Claude, Gemini, or Copilot.
- Lets you choose a provider model per workflow run.
- Lets you choose a Claude effort level for Sonnet 4.6 and Opus 4.6 workflows.
- Lets you manage linked accounts directly in the UI for Claude, Gemini, and Copilot.
- Lets you switch the active account per provider from the UI.
- Tracks provider status in the UI, including per-account health and optional quota snapshots.
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
- Adds an `AI Workflow` sidebar with a control panel and a workflow state tree so the current session is visible inside VS Code.

## Workflow

1. Run `AI Context Orchestrator: Init Workflow` from the command palette, or click the status bar button.
2. Choose a workflow preset.
3. Choose the provider target.
4. Choose the provider model.
5. If the provider is Claude, choose the Claude account and effort level.
6. Choose the context refresh mode.
7. Choose the model cost policy.
8. Choose raw or Copilot-optimized context generation.
9. Choose whether to generate provider-native artifacts.
10. The extension builds or reuses `.ai-context.md`, writes metadata into it, and optionally writes native workflow files for the chosen provider.
11. The extension also writes a shared stage handoff in `.ai-orchestrator/stages/`.
12. You can stop after generation or launch the provider immediately.
13. Later, run `AI Context Orchestrator: Continue Workflow` to move to the next stage, optionally with a different provider.
14. Use the `AI Workflow` activity bar view to inspect the current brief, open the latest handoff, refresh provider status, and switch Claude accounts.

## Commands

- `AI Context Orchestrator: Init Workflow`
- `AI Context Orchestrator: Continue Workflow`
- `AI Context Orchestrator: Generate Context File`
- `AI Context Orchestrator: Open Workflow Brief`
- `AI Context Orchestrator: Open Latest Workflow Handoff`
- `AI Context Orchestrator: Open Context File`
- `AI Context Orchestrator: Open Workflow Session`
- `AI Context Orchestrator: Preview Workflow Prompt`
- `AI Context Orchestrator: Copy Workflow Prompt`
- `AI Context Orchestrator: Refresh Provider Status`
- `AI Context Orchestrator: Switch Claude Account`
- `AI Context Orchestrator: Manage Provider Accounts`
- `AI Context Orchestrator: Switch Provider Account`
- `AI Context Orchestrator: Mark Selected Stage Prepared`
- `AI Context Orchestrator: Mark Selected Stage In Progress`
- `AI Context Orchestrator: Mark Selected Stage Completed`

## In-Editor UI

The extension now contributes an `AI Workflow` view container in the activity bar.

- `Workflow Control` is now organized around the current state, the next recommended move, recent stages, and quick file access.
- `Workflow Control` now also exposes a provider section with linked account management for Claude, Gemini, and Copilot, provider status refresh, configured provider models, and per-account quota cards when a quota source is available.
- Each provider card exposes `Manage ... Accounts` and `Set Active ... Account` directly inside the sidebar.
- `Workflow Control` also lets you preview or copy the exact launch prompt that matches the current stage without launching the provider.
- `Workflow Control` also reflects the currently selected stage from the tree so you can inspect its files, upstream dependencies, artifacts, and status in one place.
- `Workflow State` shows the workspace overview, stage history, latest handoff, session file, context snapshot, and generated artifacts per stage.
- Both views refresh automatically when `.ai-context.md` or `.ai-orchestrator/*` changes.
- Tree items expose context actions so you can open a handoff or continue the workflow directly from the sidebar.
- Stage items can be marked `Prepared`, `In Progress`, or `Completed` directly from the sidebar UI.
- The tree view exposes a badge and short status message so you can understand workflow progress without opening files.
- View toolbar actions expose `Init Workflow`, `Continue Workflow`, `Refresh Workflow UI`, prompt preview, and quick completion of the selected stage directly in the sidebar header.
- Empty states are handled directly in the tree view and control panel so the first use stays guided even before a session exists.

## Provider Launch Behavior

- Claude: opens a terminal with the selected `CLAUDE_CONFIG_DIR`, `ANTHROPIC_MODEL`, and `CLAUDE_CODE_EFFORT_LEVEL`, then runs `claude --append-system-prompt-file ".ai-context.md"` with the selected workflow objective.
- Gemini: opens a terminal and runs `gemini -m <selected-model>` with the selected workflow objective and the generated context file. If the linked Gemini account references an API key env var that is present locally, the launch terminal injects it as `GEMINI_API_KEY` and `GOOGLE_API_KEY`.
- Copilot: opens Copilot Chat and copies a workflow-oriented prompt to the clipboard.

Copilot account references are tracked in the extension UI for ownership and planning, but the extension cannot programmatically switch the signed-in Copilot session because VS Code does not expose that capability.

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
- `aiContextOrchestrator.defaultClaudeModel`
- `aiContextOrchestrator.defaultGeminiModel`
- `aiContextOrchestrator.defaultClaudeEffort`
- `aiContextOrchestrator.claudeAccounts`
- `aiContextOrchestrator.activeClaudeAccountId`
- `aiContextOrchestrator.geminiAccounts`
- `aiContextOrchestrator.activeGeminiAccountId`
- `aiContextOrchestrator.copilotAccounts`
- `aiContextOrchestrator.activeCopilotAccountId`
- `aiContextOrchestrator.autoGenerateOnStartup`

New workflow settings:

- `aiContextOrchestrator.defaultPreset`
- `aiContextOrchestrator.defaultProvider`
- `aiContextOrchestrator.contextRefreshMode`
- `aiContextOrchestrator.costProfile`
- `aiContextOrchestrator.generateNativeArtifacts`
- `aiContextOrchestrator.enabledProviders`

`aiContextOrchestrator.claudeAccounts` accepts objects like:

```json
{
	"id": "work",
	"label": "Claude Work",
	"configDir": "C:/Users/you/.claude-work",
	"quotaCommand": "node C:/scripts/claude-quota.js",
	"notes": "Team org account"
}
```

`aiContextOrchestrator.geminiAccounts` accepts objects like:

```json
{
	"id": "gemini-work",
	"label": "Gemini Work",
	"authMode": "api-key",
	"apiKeyEnvVar": "GEMINI_WORK_API_KEY",
	"quotaCommand": "node C:/scripts/gemini-quota.js",
	"accountHint": "workspace-team-a",
	"notes": "Primary Gemini account for fast build/test loops"
}
```

`aiContextOrchestrator.copilotAccounts` accepts lightweight references like:

```json
{
	"id": "copilot-main",
	"label": "Copilot Main",
	"accountHint": "me@company.com",
	"notes": "Main VS Code sign-in"
}
```

If `quotaCommand` is provided, it should print JSON to stdout using this shape:

```json
{
	"availability": "ready",
	"summary": "2h 10m left in rolling window",
	"detail": "Weekly quota 68% remaining",
	"metrics": [
		{ "label": "Rolling", "value": "43% left", "tone": "warning" },
		{ "label": "Weekly", "value": "68% left" }
	]
}
```

## Requirements

- Claude workflows require the `claude` CLI to be installed and available in `PATH` if you want to launch Claude directly.
- Gemini workflows require the `gemini` CLI to be installed and available in `PATH` if you want to launch Gemini directly.
- Copilot workflows require GitHub Copilot Chat in VS Code.
- Live Claude quota snapshots require either a custom `quotaCommand` per Claude account or a future Admin API integration path.

## Known Limitations

- The current workflow context is generated from the first workspace folder only.
- The workspace tree is intentionally depth-limited to keep the context pack compact.
- Refresh matching currently uses a lightweight signature of scanned inputs, not a full file content hash of the repository.
- Copilot custom agents and skills are generated as files, but the extension does not yet validate that each generated artifact is loaded by the chat customizations UI.
- The extension prepares provider-native roles, but it does not implement its own multi-agent runtime.
- Shared stage handoff files are prepared automatically, but the quality of the transition still depends on the active provider actually updating the generated stage file.
- Copilot personal plan quota is shown as unavailable because there is no stable public API for reliable individual premium request telemetry.
- Gemini quota telemetry is not implemented yet; the UI currently exposes model state and reserves quota refresh for a later monitoring integration.

## Development

- Run `npm run compile` to build the extension.
- Run the default Extension launch configuration to test it in an Extension Development Host.
