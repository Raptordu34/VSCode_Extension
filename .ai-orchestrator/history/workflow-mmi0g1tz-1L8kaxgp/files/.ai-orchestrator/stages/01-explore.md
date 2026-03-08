# Stage 01 Explore
- Provider: Claude
- Provider model: claude-sonnet-4-6
- Provider account: default
- Claude account: default
- Claude effort: medium
- Preset: explore
- Roles: Explorer, Architect
- Status: completed
- Generated at: 2026-03-08T17:12:41.543Z
## Objective
Start by understanding the codebase, summarize key files, and wait for the next instruction before editing anything.
## User Brief
No explicit brief provided for this stage.
## Upstream Handoffs
- none
## Instructions For The Active Provider
- Read .ai-context.md first.
- Read .ai-orchestrator/brief.md if it exists.
- Read upstream stage handoffs before acting.
- Write findings, decisions, or results back into this file before stopping.
- Keep the content concrete and reusable by the next provider.

---

## Working Notes

### Project Identity
**ai-context-orchestrator** — a VS Code extension (v0.0.2) that generates reusable AI workflow context packs and launches Claude, Gemini, or GitHub Copilot with them. Maintains a provider-agnostic relay in `.ai-orchestrator/` for multi-provider handoffs.

Stack: TypeScript · VS Code Extension API · esbuild · ESLint (no runtime dependencies).

---

### Architecture: Feature-Based Vertical Slicing

```
src/
  extension.ts              Entry point. Wires providers, registers watchers, calls registerAllCommands()
  commands/index.ts         All VS Code command registrations (~30 commands). Contains flow functions.
  core/
    configuration.ts        ExtensionConfiguration reader (getExtensionConfiguration)
    eventBus.ts             Simple 'refresh' event bus (EventBus.fire / EventBus.onDidChange)
    logger.ts               Logger singleton wrapping OutputChannel
    uiRefreshDebouncer.ts   Debouncer for file-watcher-triggered UI refreshes
    workspace.ts            buildWorkspaceUri helper
    workspaceContext.ts     resolveWorkspaceFolder / getImplicitWorkspaceFolder
  features/
    workflow/
      types.ts              All shared TypeScript types/interfaces (single source of truth)
      constants.ts          File paths, model lists, view IDs, storage keys
      presets.ts            WORKFLOW_PRESETS map (explore/plan/build/debug/review/test)
      workflowService.ts    buildDefaultWorkflowPlan, buildSmartDefaultWorkflowPlan, promptForWorkflowPlan,
                            promptForWorkflowContinuation, getWorkflowDashboardState, saveLastWorkflowConfig, etc.
      ui.ts                 WorkflowControlViewProvider (WebviewViewProvider), buildWorkflowPromptFromDashboardState
    context/
      contextBuilder.ts     gatherProjectContext — scans workspace, builds .ai-context.md
      workflowPersistence.ts readWorkflowSessionState, readWorkflowBrief
      workflowHistory.ts    archiveActiveWorkflowState, restoreWorkflowFromHistory,
                            forkWorkflowFromHistory, forkWorkflowFromHistoryAtStage,
                            cleanActiveWorkflowFiles, readWorkflowHistoryIndex
    providers/
      providerCatalog.ts    ProviderCapabilities descriptors (claude/gemini/copilot)
      providerService.ts    getProviderLabel, findProviderAccount, refreshProviderStatuses,
                            switchActiveProviderAccount, manageProviderAccounts, connectProviderAccount,
                            configureProviderCredential, runProviderAuthAssist, openProviderAccountPortal
      accountManager.ts     Account CRUD helpers
      credentialService.ts  Secret storage (SecretStorage API)
      statusService.ts      Provider availability checks
    aiAgents/
      agentLauncher.ts      launchClaude, launchGemini
      promptBuilder.ts      buildSharedWorkflowInstruction
  webview/
    designSystem.ts         renderDesignShellDocument — single HTML shell for all webviews
                            Uses VS Code CSS variables; supports sidebar/panel layouts; inline CSS+JS
  utils/index.ts            createNonce, escapeHtml, capitalize
```

---

### Key Data Types (types.ts)

| Type | Purpose |
|---|---|
| `WorkflowExecutionPlan` | Full plan for a workflow run (preset, provider, model, roles, refreshMode, costProfile, brief…) |
| `ProjectContext` | Result of `gatherProjectContext` — contextFile URI, metadata, artifactPlan, session, stage |
| `WorkflowDashboardState` | Aggregated state fed to the webview — session, history, providerStatuses, configuration |
| `WorkflowSessionState` | Persisted `.ai-orchestrator/session.json` — workflowId, branchId, stages array |
| `WorkflowStageRecord` | One stage entry in a session (index, preset, provider, status, stageFile, artifactFiles) |
| `WorkflowArchiveManifest` | Full archive snapshot used for history/restore/fork |
| `LastWorkflowConfig` | globalState key for persisting last-used launch config across sessions |
| `ExtensionConfiguration` | All user-configurable settings read from `vscode.workspace.getConfiguration` |

---

### Workflow Lifecycle

```
initAI / smartInitAI
  → promptForWorkflowPlan (QuickPick or inline overrides)
  → gatherProjectContext (builds .ai-context.md, generates native artifacts)
  → launchProvider (launchClaude / launchGemini / launchCopilot)

continueWorkflow
  → readWorkflowSessionState → promptForWorkflowContinuation
  → gatherProjectContext → launchProvider

cleanActiveWorkflowFiles
  → archiveActiveWorkflowState → cleanActiveWorkflowFiles

restoreWorkflowFromHistory / forkWorkflowFromHistory / forkWorkflowFromHistoryAtStage
  → archiveActiveWorkflowState → restore/fork from .ai-orchestrator/history/
```

---

### UI Surface
- **Status bar**: "Init Workflow" (always visible) + "Continue Workflow" (when session exists)
- **Sidebar webview** (`WorkflowControlViewProvider`): Dashboard showing session state, history entries, provider statuses. Inline config drawer (no QuickPick) posts `smartInit` messages with preset/provider/model/effort/brief overrides.
- **File watchers**: session.json, history/index.json, `.ai-orchestrator/**`, `.ai-context.md` all trigger debounced UI refresh via `UiRefreshDebouncer`.
- **EventBus**: Commands fire `'refresh'` after mutations; `extension.ts` subscribes to update status bar + webview.

---

### Reusable Patterns
- **Command registration pattern**: All commands in `commands/index.ts`, each calls a local `run*Flow` async function. Flow functions compose `workflowService` + `contextBuilder` + `agentLauncher`.
- **Webview HTML**: All HTML rendered through `renderDesignShellDocument` (designSystem.ts) — nonce, CSP, VS Code CSS variables, inline style+script.
- **EventBus refresh**: Any mutation (command, file change) emits `EventBus.fire('refresh')` → single `refreshWorkflowUi()` handler updates status bar + webview.
- **Debouncer pattern**: `UiRefreshDebouncer.enqueue(key, fn)` batches rapid file-watcher events by key.
- **Provider abstraction**: `providerService.ts` wraps all provider differences; launcher switches on `workflowPlan.provider`.

---

### Notable Recent Work (git log + docs/plans)
- Config drawer replaced 7-step QuickPick with inline sidebar launcher (completed).
- `LastWorkflowConfig` persisted in `globalState` to remember last launch settings.
- Workflow history management: archive, restore, fork by workflow or by stage.
- Design system styles + provider catalog updated.
- Package at `0.0.1` → `0.0.2`; two `.vsix` build artifacts in root.

---

### Likely Next Actions
- No brief was provided; await user instruction.
- Candidate areas based on git status (modified `CHANGELOG.md`, `package.json`): could be preparing a release or changelog update.
- `docs/plans/2026-03-08-config-drawer.md` may contain additional implementation notes not yet acted on.

---

## Recommended Next Step
- Suggested preset: plan (if a feature is being designed) or build (if implementation continues).
- Suggested provider: choose the assistant best suited for the next stage.
