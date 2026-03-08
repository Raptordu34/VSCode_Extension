# Stage 03 Plan
- Provider: Claude
- Provider model: claude-sonnet-4-6
- Provider account: claude-account-1772904606138
- Claude account: claude-account-1772904606138
- Claude effort: medium
- Preset: plan
- Roles: Explorer, Architect
- Status: completed
- Generated at: 2026-03-08T17:25:26.399Z
## Objective
Investigate the codebase, produce an implementation plan, and highlight reuse opportunities before any code changes.
## User Brief
Continue from Review:
## Upstream Handoffs
- .ai-orchestrator/stages/01-explore.md
- .ai-orchestrator/stages/02-review.md
## Instructions For The Active Provider
- Read .ai-context.md first.
- Read .ai-orchestrator/brief.md if it exists.
- Read upstream stage handoffs before acting.
- Write findings, decisions, or results back into this file before stopping.
- Keep the content concrete and reusable by the next provider.
## Working Notes

### Context

The review (stage 02) identified three structural risks against the user's extensibility goal. This plan acts on them in priority order, with Phase 1 being the only immediately recommended work.

---

### Risk Assessment

| Risk | Severity | Effort | Phase |
|------|----------|--------|-------|
| `commands/index.ts` monolith (660 lines, 30 commands) | High — bottleneck for every new feature | Medium | 1 — Now |
| `types.ts` global registry (360 lines, all domains) | Medium — artificial cross-feature coupling | Medium | 2 — Follow-up |
| `agentLauncher.ts` switch statement (3 cases) | Low — only matters if providers > 3 | Low | 3 — Deferred |

---

### Phase 1: Decentralize Command Registration

**Goal**: Split `src/commands/index.ts` into feature-level registrars. The file becomes a thin coordinator (~30 lines). Zero behavioral change — all command IDs are unchanged.

#### New files

| File | Commands | Local helpers |
|------|----------|---------------|
| `src/features/workflow/commands.ts` | `initAI`, `continueWorkflow`, `smartInitAI`, `restoreWorkflowFromHistory`, `forkWorkflowFromHistory`, `forkWorkflowFromStage`, `forkWorkflowFromArchivedStage`, `cleanActiveWorkflowFiles`, `setSelectedStage*` | `runInitAiFlow`, `runContinueWorkflowFlow`, `runSmartInitAiFlow`, `runRestoreWorkflowFromHistoryFlow`, `runForkWorkflowFromHistoryFlow`, `runForkWorkflowFromStageFlow`, `runForkWorkflowFromArchivedStageFlow`, `runCleanActiveWorkflowFilesFlow`, `showWorkflowLaunchSummary`, `inspectGeneratedArtifacts`, `restoreArchivedWorkflow` |
| `src/features/context/commands.ts` | `generateContext`, `openWorkflowBrief`, `openLatestWorkflowHandoff`, `openContextFile`, `openWorkflowSession`, `openWorkflowTreeNode` | none |
| `src/features/providers/commands.ts` | `refreshProviderStatus`, `switchClaudeAccount`, `manageProviderAccounts`, `connectProviderAccount`, `configureProviderCredential`, `runProviderAuthAssist`, `openProviderAccountPortal`, `switchProviderAccount` | none |

UI utility commands (`refreshWorkflowUi`, `previewWorkflowPrompt`, `copyWorkflowPrompt`) stay inline in `src/commands/index.ts` — they are thin one-liners that already delegate to `loadDashboardState` / `workflowUiHelpers` injected at the top.

#### `launchProvider` + `launchCopilot` migration

Both helpers live in `src/commands/index.ts` today but are provider-specific. Move them to `src/features/aiAgents/agentLauncher.ts` alongside the existing `launchClaude` / `launchGemini` exports. Export `launchProvider` from there.

#### Registrar signatures

```typescript
// src/features/workflow/commands.ts
export function registerWorkflowCommands(
  context: vscode.ExtensionContext,
  loadDashboardState: () => Promise<WorkflowDashboardState>,
  workflowUiHelpers: WorkflowUiHelpers
): void

// src/features/context/commands.ts
export function registerContextCommands(
  context: vscode.ExtensionContext
): void

// src/features/providers/commands.ts
export function registerProviderCommands(
  context: vscode.ExtensionContext
): void
```

#### Updated `src/commands/index.ts` (coordinator)

```typescript
export function registerAllCommands(
  context: vscode.ExtensionContext,
  loadDashboardState: () => Promise<WorkflowDashboardState>,
  workflowUiHelpers: WorkflowUiHelpers
): void {
  registerWorkflowCommands(context, loadDashboardState, workflowUiHelpers);
  registerContextCommands(context);
  registerProviderCommands(context);

  // UI utilities: thin one-liners kept inline
  context.subscriptions.push(
    vscode.commands.registerCommand('ai-context-orchestrator.refreshWorkflowUi', () => { EventBus.fire('refresh'); }),
    vscode.commands.registerCommand('ai-context-orchestrator.previewWorkflowPrompt', async () => { /* ... */ }),
    vscode.commands.registerCommand('ai-context-orchestrator.copyWorkflowPrompt', async () => { /* ... */ })
  );
}
```

#### Implementation checkpoints

1. **Add `launchProvider` + `launchCopilot` to `agentLauncher.ts`**
   — Export `launchProvider(context, workflowPlan, projectContext)` from there.
   — Verify: `check-types` passes.

2. **Create `src/features/providers/commands.ts`**
   — Move the 8 provider management commands + their `EventBus.fire('refresh')` calls.
   — Import `refreshProviderStatuses`, `switchActiveProviderAccount`, etc. from `providerService.ts` directly.
   — Verify: `check-types` passes.

3. **Create `src/features/context/commands.ts`**
   — Move the 6 context/file-access commands.
   — Verify: `check-types` passes.

4. **Create `src/features/workflow/commands.ts`**
   — Move the 9 workflow + history commands + all local flow helpers.
   — Import `launchProvider` from `agentLauncher.ts`.
   — Verify: `check-types` passes.

5. **Slim `src/commands/index.ts`**
   — Remove all moved registrations and helpers.
   — Keep only the 3 `register*Commands(...)` calls + 3 inline UI commands.
   — Verify: `check-types` and `compile` both pass.

6. **Smoke-test**
   — Run `npm run compile` clean.
   — Manually trigger one command per group in the Extension Development Host.

#### Tradeoffs / Prerequisites

- **No `package.json` changes** — command IDs are unchanged.
- **No `extension.ts` changes** — `registerAllCommands` signature is unchanged.
- **Import churn is contained** — only the moved files and `commands/index.ts` are affected.
- **Single risk**: `resolveCommandWorkspaceFolder` is a closure in `registerAllCommands` that captures `context`. Each feature registrar will need to accept `context` and reconstruct the same resolver locally, or accept a pre-built resolver. Simplest: pass `context` and let each registrar call `resolveWorkspaceFolder(context, ...)` directly — same 2-line pattern repeated, no abstraction needed.

---

### Phase 2: Provider Type Co-location (follow-up, not now)

**Goal**: Extract provider-specific types from `src/features/workflow/types.ts` to `src/features/providers/types.ts`.

**Types to move** (provider-domain only, no workflow references):
```
ProviderTarget, ProviderCapabilities, ProviderModelDescriptor, ProviderModelTier,
ProviderAccountConfiguration, ProviderAccountStatus, ProviderStatusSnapshot,
ProviderStatusCache, ProviderStatusAvailability, MetricDisplay
```

**Types to keep** in `src/features/workflow/types.ts`:
All workflow/execution/session/brief/history/dashboard types. `ExtensionConfiguration` references `ProviderAccountConfiguration[]` — keep it in workflow/types.ts and import the provider types from providers/types.ts.

**Strategy**: Do not re-export for backward compat. Update all import sites in one pass — TypeScript will catch any miss at `check-types`. Estimated ~12-15 import sites.

**Prerequisite**: Phase 1 must ship first (it creates the `src/features/providers/` module boundary cleanly).

---

### Phase 3: Provider Launcher Registry (deferred)

Skip. The current 3-case `switch` in `launchProvider` is typed, exhaustive, and readable. Abstracting to a registry adds boilerplate with no current benefit. Revisit if a 4th provider (`openai`, `mistral`, etc.) is added.

---

### Files Touched (Phase 1 only)

| File | Change |
|------|--------|
| `src/features/aiAgents/agentLauncher.ts` | Add `launchCopilot` + `launchProvider` |
| `src/features/workflow/commands.ts` | **New** — workflow + history commands |
| `src/features/context/commands.ts` | **New** — context/file-access commands |
| `src/features/providers/commands.ts` | **New** — provider management commands |
| `src/commands/index.ts` | Shrinks to coordinator (~30 lines) |

No other files are affected.

## Recommended Next Step
- Suggested preset: build
- Suggested provider: claude
- Note: Phase 1 is ready to implement. Start with checkpoint 1 (agentLauncher) then work top-down through the checkpoints. Run `check-types` after each checkpoint before proceeding.
