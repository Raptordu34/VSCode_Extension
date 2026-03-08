import * as vscode from "vscode";
import type { WorkflowDashboardState, WorkflowTreeNode, WorkflowStageStatus, ExtensionConfiguration, WorkflowExecutionPlan, ProjectContext, WorkflowQuickPickItem, ClaudeEffortLevel, WorkflowPreset, WorkflowBrief, WorkflowSessionState, ProviderStatusCache, ProviderTarget, LastWorkflowConfig } from "./types.js";
import { PROVIDER_STATUS_CACHE_KEY, CONTEXT_FILE_NAME, LAST_WORKFLOW_CONFIG_KEY } from "./constants.js";
import { getProviderAccounts, getActiveProviderAccountId, findProviderAccount, getDefaultProviderModel, getDefaultClaudeEffort, getProviderLabel, promptForProviderModel, promptForProviderAccount, buildProviderDetail, promptForProviderTarget, formatProviderModel } from "../providers/providerService.js";
import { buildWorkspaceUri, fileExists, readUtf8 } from "../../core/workspace.js";
import { getImplicitWorkspaceFolder } from '../../core/workspaceContext.js';
import { readWorkflowSessionState, readWorkflowBrief, writeWorkflowSessionState, buildSuggestedNextPresets } from "../context/contextBuilder.js";
import { getWorkflowStageStatusLabel, formatWorkflowRoles } from "./ui.js";
import { getExtensionConfiguration } from "../../core/configuration.js";
import { mergeProviderStatusCache } from "../providers/providerService.js";
import { buildProviderLaunchPrompt, buildWorkflowSummary } from "../aiAgents/promptBuilder.js";
import { WORKFLOW_PRESETS } from "./presets.js";

export async function updateContinueWorkflowButtonVisibility(statusBarItem: vscode.StatusBarItem, context: vscode.ExtensionContext): Promise<void> {
	const workspaceFolder = getImplicitWorkspaceFolder(context);
	if (!workspaceFolder) {
		statusBarItem.hide();
		return;
	}

	const session = await readWorkflowSessionState(workspaceFolder.uri);
	if (session) {
		statusBarItem.show();
		return;
	}

	statusBarItem.hide();
}
export async function getWorkflowDashboardState(context: vscode.ExtensionContext): Promise<WorkflowDashboardState> {
	const configuration = getExtensionConfiguration();
	const providerStatusCache = context.globalState.get<ProviderStatusCache>(PROVIDER_STATUS_CACHE_KEY);
	const providerStatuses = mergeProviderStatusCache(configuration, providerStatusCache);
	const workspaceFolder = getImplicitWorkspaceFolder(context);
	if (!workspaceFolder) {
		return {
			contextFileExists: false,
			nextSuggestedPresets: [],
			artifactCount: 0,
			workspaceSelectionRequired: (vscode.workspace.workspaceFolders?.length ?? 0) > 1,
			configuration,
			providerStatuses,
			providerStatusUpdatedAt: providerStatusCache?.updatedAt
		};
	}

	const [session, brief, contextFileExists] = await Promise.all([
		readWorkflowSessionState(workspaceFolder.uri),
		readWorkflowBrief(workspaceFolder.uri),
		fileExists(vscode.Uri.joinPath(workspaceFolder.uri, CONTEXT_FILE_NAME))
	]);
	const latestStage = session?.stages.at(-1);
	const artifactCount = session?.stages.reduce((total, stage) => total + stage.artifactFiles.length, 0) ?? 0;

	return {
		workspaceFolder,
		session,
		brief,
		latestStage,
		selectedStage: latestStage,
		contextFileExists,
		nextSuggestedPresets: session ? buildSuggestedNextPresets(session.currentPreset) : [],
		artifactCount,
		configuration,
		providerStatuses,
		providerStatusUpdatedAt: providerStatusCache?.updatedAt
	};
}
export async function updateSelectedWorkflowStageStatus(
	loadState: () => Promise<WorkflowDashboardState>,
	node: WorkflowTreeNode | undefined,
	status: WorkflowStageStatus
): Promise<void> {
	const state = await loadState();
	const workspaceFolder = state.workspaceFolder;
	const targetStageIndex = node?.stageIndex ?? state.selectedStage?.index;
	if (!workspaceFolder || !targetStageIndex) {
		void vscode.window.showInformationMessage('Select a workflow stage first.');
		return;
	}

	await updateWorkflowStageStatus(workspaceFolder.uri, targetStageIndex, status);
	void vscode.window.showInformationMessage(`Stage ${String(targetStageIndex).padStart(2, '0')} marked as ${getWorkflowStageStatusLabel(status)}.`);
}
export async function openWorkspaceRelativeFile(workspaceUri: vscode.Uri, relativePath: string): Promise<void> {
	const fileUri = buildWorkspaceUri(workspaceUri, relativePath);
	if (!fileUri || !(await fileExists(fileUri))) {
		void vscode.window.showInformationMessage(`File not available yet: ${relativePath}`);
		return;
	}

	await vscode.window.showTextDocument(fileUri);
}
export function buildDefaultWorkflowPlan(configuration: ExtensionConfiguration): WorkflowExecutionPlan {
	return buildSmartDefaultWorkflowPlan(configuration.defaultPreset, configuration);
}
export function buildSmartDefaultWorkflowPlan(preset: WorkflowPreset, configuration: ExtensionConfiguration): WorkflowExecutionPlan {
	const presetDefinition = WORKFLOW_PRESETS[preset];
	const defaultProviderAccount = findProviderAccount(
		configuration,
		configuration.defaultProvider,
		getActiveProviderAccountId(configuration, configuration.defaultProvider)
	)?.id;
	const defaultClaudeAccount = findProviderAccount(configuration, 'claude', configuration.activeClaudeAccountId)?.id ?? configuration.claudeAccounts[0]?.id;
	return {
		preset: presetDefinition.preset,
		provider: configuration.defaultProvider,
		providerModel: getDefaultProviderModel(configuration.defaultProvider, configuration, defaultProviderAccount),
		providerAccountId: defaultProviderAccount,
		roles: [...presetDefinition.roles],
		refreshMode: configuration.contextRefreshMode,
		costProfile: configuration.costProfile,
		optimizeWithCopilot: configuration.optimizeWithCopilot,
		generateNativeArtifacts: configuration.generateNativeArtifacts,
		claudeAccountId: configuration.defaultProvider === 'claude' ? defaultClaudeAccount : undefined,
		claudeEffort: configuration.defaultProvider === 'claude' ? getDefaultClaudeEffort(configuration, defaultClaudeAccount) : undefined,
		presetDefinition
	};
}
export function buildWorkflowSummaryDocument(projectContext: ProjectContext): string {
	const artifactLines = projectContext.artifactPlan?.files.map((artifact) => `- ${artifact.relativePath}`) ?? ['- none'];
	const optimizationLine = projectContext.optimization.applied
		? `Optimized by Copilot using ${projectContext.optimization.modelName ?? 'an available model'}`
		: `Not optimized by Copilot: ${projectContext.optimization.reason}`;
	const launchPrompt = buildProviderLaunchPrompt(projectContext);

	return [
		`# ${projectContext.workflowPlan.presetDefinition.label} Workflow Summary`,
		'',
		`- Workspace: ${projectContext.workspaceFolder.name}`,
		`- Preset id: ${projectContext.workflowPlan.preset}`,
		`- Provider: ${projectContext.workflowPlan.provider}`,
		`- Roles: ${formatWorkflowRoles(projectContext.workflowPlan.roles)}`,
		`- Refresh mode: ${projectContext.workflowPlan.refreshMode}`,
		`- Cost profile: ${projectContext.workflowPlan.costProfile}`,
		`- Context reused: ${projectContext.reused ? 'yes' : 'no'}`,
		`- Optimization: ${optimizationLine}`,
		'',
		'## Objective',
		projectContext.workflowPlan.presetDefinition.launchInstruction,
		'',
		'## Context Signals',
		projectContext.metadata.keyFiles.length > 0 ? `Key files: ${projectContext.metadata.keyFiles.join(', ')}` : 'Key files: none detected',
		projectContext.metadata.commands.length > 0 ? `Useful commands: ${projectContext.metadata.commands.join(', ')}` : 'Useful commands: none detected',
		projectContext.metadata.instructionFiles.length > 0 ? `Instruction files: ${projectContext.metadata.instructionFiles.join(', ')}` : 'Instruction files: none detected',
		'',
		'## Native Artifacts',
		...artifactLines,
		'',
		'## Launch Preview',
		buildWorkflowSummary(projectContext),
		'',
		'## Exact Launch Prompt',
		'```text',
		launchPrompt,
		'```',
		'',
		'## Next Actions',
		'- Launch the selected provider now.',
		'- Open the context file for inspection.',
		'- Open one of the generated provider-native artifacts.',
		'- Stop here and test manually later.'
	].join('\n');
}
export async function promptForWorkflowPlan(configuration: ExtensionConfiguration): Promise<WorkflowExecutionPlan | undefined> {
	const presetSelection = await vscode.window.showQuickPick<WorkflowQuickPickItem>(
		Object.values(WORKFLOW_PRESETS).map((presetDefinition) => ({
			label: presetDefinition.label,
			description: presetDefinition.description,
			detail: `${presetDefinition.detail} Roles: ${formatWorkflowRoles(presetDefinition.roles)}. Recommended provider: ${getProviderLabel(presetDefinition.recommendedProvider)}.`,
			presetDefinition
		})),
		{
			title: '1/7 Workflow Preset',
			placeHolder: 'Choose the workflow goal you want to prepare',
			ignoreFocusOut: true
		}
	);

	if (!presetSelection?.presetDefinition) {
		return undefined;
	}

	const selectedPreset = presetSelection.presetDefinition;
	const enabledProviders: ProviderTarget[] = configuration.enabledProviders.length > 0
		? configuration.enabledProviders
		: ['claude', 'gemini', 'copilot'];
	const providerItems: WorkflowQuickPickItem[] = enabledProviders.map((provider: ProviderTarget) => ({
			label: getProviderLabel(provider),
			description: provider === selectedPreset.recommendedProvider ? 'Recommended for this workflow' : undefined,
			detail: buildProviderDetail(provider, selectedPreset),
			provider
		}));
	const providerSelection = await vscode.window.showQuickPick<WorkflowQuickPickItem>(
		providerItems,
		{
			title: '2/7 Provider Target',
			placeHolder: 'Choose which assistant should receive this workflow',
			ignoreFocusOut: true
		}
	);

	if (!providerSelection?.provider) {
		return undefined;
	}

	const providerAccountId = await promptForProviderAccount(providerSelection.provider, configuration);
	if (getProviderAccounts(configuration, providerSelection.provider).length > 0 && !providerAccountId) {
		return undefined;
	}

	const providerModel = await promptForProviderModel(providerSelection.provider, configuration, providerAccountId);
	if (providerModel === undefined) {
		return undefined;
	}

	let claudeAccountId: string | undefined;
	let claudeEffort: ClaudeEffortLevel | undefined;
	if (providerSelection.provider === 'claude') {
		claudeAccountId = providerAccountId;
		claudeEffort = await promptForClaudeEffort(getDefaultClaudeEffort(configuration, providerAccountId));
		if (!claudeEffort) {
			return undefined;
		}
	}

	const refreshSelection = await vscode.window.showQuickPick<WorkflowQuickPickItem>([
		{
			label: 'Reuse',
			description: 'Use the existing .ai-context.md if it exists',
			detail: 'Fastest option. Skips a workspace rescan and trusts the current context file as-is.',
			refreshMode: 'reuse'
		},
		{
			label: 'Smart Refresh',
			description: 'Regenerate only if the workspace signature changed',
			detail: 'Scans the workspace, compares a lightweight signature, and reuses the existing file if nothing changed.',
			refreshMode: 'smart-refresh'
		},
		{
			label: 'Full Rebuild',
			description: 'Always regenerate the context pack',
			detail: 'Rebuilds the context file even if a matching one already exists.',
			refreshMode: 'full-rebuild'
		}
	], {
		title: '3/7 Context Refresh',
		placeHolder: 'Choose how aggressively the workspace context should be refreshed',
		ignoreFocusOut: true
	});

	if (!refreshSelection?.refreshMode) {
		return undefined;
	}

	const costSelection = await vscode.window.showQuickPick<WorkflowQuickPickItem>([
		{
			label: 'Fast',
			description: 'Prefer speed and lower cost',
			detail: 'Best for exploration, targeted debugging, and short review loops.',
			costProfile: 'fast'
		},
		{
			label: 'Balanced',
			description: 'Default tradeoff for most work',
			detail: 'Best default for daily use across planning, implementation, and review.',
			costProfile: 'balanced'
		},
		{
			label: 'Strong',
			description: 'Favor reasoning quality',
			detail: 'Best for architecture, difficult bugs, and high-value reviews.',
			costProfile: 'strong'
		}
	], {
		title: '4/7 Model Cost Policy',
		placeHolder: 'Choose the reasoning and cost level for this run',
		ignoreFocusOut: true
	});

	if (!costSelection?.costProfile) {
		return undefined;
	}

	const optimizationSelection = await vscode.window.showQuickPick<WorkflowQuickPickItem>([
		{
			label: 'Optimized Context',
			description: 'Use Copilot to rewrite the raw context pack',
			detail: 'Runs workspace analysis first, then asks an available Copilot model to compress it.',
			booleanValue: true
		},
		{
			label: 'Raw Context',
			description: 'Write the context pack directly from local analysis',
			detail: 'Skips Copilot optimization entirely.',
			booleanValue: false
		}
	], {
		title: '5/7 Context Generation Mode',
		placeHolder: 'Choose whether to keep the raw context or ask Copilot to compress it',
		ignoreFocusOut: true
	});

	if (optimizationSelection?.booleanValue === undefined) {
		return undefined;
	}

	const artifactSelection = await vscode.window.showQuickPick<WorkflowQuickPickItem>([
		{
			label: 'Generate native provider artifacts',
			description: 'Recommended',
			detail: 'Create or update provider-native agent, skill, and instruction files for this workflow.',
			booleanValue: true
		},
		{
			label: 'Skip native artifact generation',
			description: 'Context file only',
			detail: 'Only write .ai-context.md for this run.',
			booleanValue: false
		}
	], {
		title: '6/7 Native Artifacts',
		placeHolder: 'Choose whether to generate provider-native instruction, agent, and skill files',
		ignoreFocusOut: true
	});

	if (artifactSelection?.booleanValue === undefined) {
		return undefined;
	}

	const workflowPlan: WorkflowExecutionPlan = {
		preset: presetSelection.presetDefinition.preset,
		provider: providerSelection.provider,
		providerModel,
		providerAccountId,
		roles: [...presetSelection.presetDefinition.roles],
		refreshMode: refreshSelection.refreshMode,
		costProfile: costSelection.costProfile,
		optimizeWithCopilot: optimizationSelection.booleanValue,
		generateNativeArtifacts: artifactSelection.booleanValue,
		claudeAccountId,
		claudeEffort,
		presetDefinition: presetSelection.presetDefinition
	};

	if (workflowPlan.preset !== 'explore') {
		const brief = await promptForWorkflowBrief(workflowPlan.preset);
		if (!brief) {
			return undefined;
		}
		workflowPlan.brief = brief;
	}

	const reviewSelection = await vscode.window.showQuickPick<WorkflowQuickPickItem>([
		{
			label: 'Generate workflow pack',
			description: `${getProviderLabel(workflowPlan.provider)} · ${workflowPlan.presetDefinition.label}`,
			detail: buildWorkflowPlanSetupSummary(workflowPlan)
		},
		{
			label: 'Cancel',
			description: 'Stop here',
			detail: 'Close the setup flow without generating anything.'
		}
	], {
		title: '7/7 Review Workflow Plan',
		placeHolder: 'Confirm the preset, provider, refresh mode, and artifact strategy before generation',
		ignoreFocusOut: true
	});

	if (!reviewSelection || reviewSelection.label !== 'Generate workflow pack') {
		return undefined;
	}

	return workflowPlan;
}
export async function promptForWorkflowContinuation(
	configuration: ExtensionConfiguration,
	session: WorkflowSessionState
): Promise<WorkflowExecutionPlan | undefined> {
	const suggestedPresets = buildSuggestedNextPresets(session.currentPreset);
	const presetSelection = await vscode.window.showQuickPick<WorkflowQuickPickItem>(
		suggestedPresets.map((preset) => ({
			label: WORKFLOW_PRESETS[preset].label,
			description: preset === suggestedPresets[0] ? 'Suggested next step' : undefined,
			detail: `${WORKFLOW_PRESETS[preset].description} Roles: ${formatWorkflowRoles(WORKFLOW_PRESETS[preset].roles)}.`,
			presetDefinition: WORKFLOW_PRESETS[preset]
		})),
		{
			title: 'Continue Workflow: Next Stage',
			placeHolder: `Current stage: ${WORKFLOW_PRESETS[session.currentPreset].label} with ${getProviderLabel(session.currentProvider)}`,
			ignoreFocusOut: true
		}
	);

	if (!presetSelection?.presetDefinition) {
		return undefined;
	}

	const selectedPreset = presetSelection.presetDefinition;
	const enabledProviders: ProviderTarget[] = configuration.enabledProviders.length > 0
		? configuration.enabledProviders
		: ['claude', 'gemini', 'copilot'];
	const providerItems: WorkflowQuickPickItem[] = enabledProviders.map((provider: ProviderTarget) => ({
		label: getProviderLabel(provider),
		description: provider === session.currentProvider ? 'Current provider' : undefined,
		detail: buildProviderDetail(provider, selectedPreset),
		provider
	}));
	const providerSelection = await vscode.window.showQuickPick<WorkflowQuickPickItem>(
		providerItems,
		{
			title: 'Continue Workflow: Target Provider',
			placeHolder: 'Choose which assistant should own the next stage',
			ignoreFocusOut: true
		}
	);

	if (!providerSelection?.provider) {
		return undefined;
	}

	const providerAccountId = await promptForProviderAccount(
		providerSelection.provider,
		configuration,
		session.currentProvider === providerSelection.provider ? session.currentProviderAccountId : getActiveProviderAccountId(configuration, providerSelection.provider)
	);
	if (getProviderAccounts(configuration, providerSelection.provider).length > 0 && !providerAccountId) {
		return undefined;
	}

	const providerModel = await promptForProviderModel(providerSelection.provider, configuration, providerAccountId);
	if (providerModel === undefined) {
		return undefined;
	}

	let claudeAccountId: string | undefined;
	let claudeEffort: ClaudeEffortLevel | undefined;
	if (providerSelection.provider === 'claude') {
		claudeAccountId = providerAccountId;
		claudeEffort = await promptForClaudeEffort(session.currentClaudeEffort ?? getDefaultClaudeEffort(configuration, providerAccountId));
		if (!claudeEffort) {
			return undefined;
		}
	}

	const brief = await promptForWorkflowBrief(selectedPreset.preset, session);
		if (!brief) {
		return undefined;
	}

	return {
		preset: selectedPreset.preset,
		provider: providerSelection.provider,
		providerModel,
		providerAccountId,
		roles: [...selectedPreset.roles],
		refreshMode: configuration.contextRefreshMode,
		costProfile: configuration.costProfile,
		optimizeWithCopilot: configuration.optimizeWithCopilot,
		generateNativeArtifacts: configuration.generateNativeArtifacts,
		claudeAccountId,
		claudeEffort,
		presetDefinition: selectedPreset,
		brief
	};
}
export async function promptForClaudeEffort(defaultEffort: ClaudeEffortLevel): Promise<ClaudeEffortLevel | undefined> {
	const selection = await vscode.window.showQuickPick([
		{ label: 'Low', detail: 'Fastest and cheapest reasoning for Sonnet 4.6 / Opus 4.6.', picked: defaultEffort === 'low' },
		{ label: 'Medium', detail: 'Balanced reasoning depth for most implementation work.', picked: defaultEffort === 'medium' },
		{ label: 'High', detail: 'Deepest reasoning, useful for architecture and difficult debugging.', picked: defaultEffort === 'high' }
	], {
		title: 'Claude Effort',
		placeHolder: 'Choose the Claude reasoning effort level',
		ignoreFocusOut: true
	});

	if (!selection) {
		return undefined;
	}

	return selection.label.toLowerCase() as ClaudeEffortLevel;
}
export async function promptForWorkflowBrief(preset: WorkflowPreset, existingSession?: WorkflowSessionState): Promise<WorkflowBrief | undefined> {
	const prompt = await vscode.window.showInputBox({
		title: existingSession ? 'Workflow Brief For Next Stage' : 'Workflow Brief',
		prompt: buildBriefPrompt(preset),
		placeHolder: existingSession
			? 'Example: Add a save/load system for custom obstacles without changing the rendering pipeline'
			: 'Example: Fix the fluid preset selector so it updates all active controls consistently',
		ignoreFocusOut: true,
		value: existingSession ? `Continue from ${WORKFLOW_PRESETS[existingSession.currentPreset].label}: ` : ''
	});

	if (!prompt || !prompt.trim()) {
		return undefined;
	}

	const rawText = prompt.trim();
	return {
		taskType: inferTaskType(preset, rawText),
		goal: rawText,
		constraints: [],
		rawText
	};
}
export function buildBriefPrompt(preset: WorkflowPreset): string {
	switch (preset) {
		case 'plan':
			return 'What should be planned next? Describe the feature, fix, or change to prepare.';
		case 'build':
			return 'What should be implemented next?';
		case 'debug':
			return 'What bug or failing behavior should be investigated next?';
		case 'review':
			return 'What code or change set should be reviewed next?';
		case 'test':
			return 'What test surface or regression should be covered next?';
		case 'explore':
		default:
			return 'What area of the codebase should be explored?';
	}
}
export function inferTaskType(preset: WorkflowPreset, text: string): string {
	const normalized = text.toLowerCase();
	if (preset === 'debug' || normalized.includes('bug') || normalized.includes('fix')) {
		return 'bugfix';
	}
	if (preset === 'review') {
		return 'review';
	}
	if (preset === 'test') {
		return 'test';
	}
	if (normalized.includes('refactor')) {
		return 'refactor';
	}
	return preset === 'plan' || preset === 'build' ? 'feature' : 'exploration';
}
export function buildWorkflowPlanSetupSummary(workflowPlan: WorkflowExecutionPlan): string {
	return [
		`Preset: ${workflowPlan.presetDefinition.label}`,
		`Provider: ${getProviderLabel(workflowPlan.provider)}`,
		`Model: ${formatProviderModel(workflowPlan.provider, workflowPlan.providerModel)}`,
		`Account: ${workflowPlan.providerAccountId ?? 'default'}`,
		workflowPlan.provider === 'claude' ? `Claude account: ${workflowPlan.claudeAccountId ?? 'default'}` : undefined,
		workflowPlan.provider === 'claude' ? `Claude effort: ${workflowPlan.claudeEffort ?? 'default'}` : undefined,
		`Roles: ${formatWorkflowRoles(workflowPlan.roles)}`,
		`Refresh: ${workflowPlan.refreshMode}`,
		`Cost: ${workflowPlan.costProfile}`,
		`Context: ${workflowPlan.optimizeWithCopilot ? 'optimized with Copilot' : 'raw local context'}`,
		`Artifacts: ${workflowPlan.generateNativeArtifacts ? 'generate native files' : 'context file only'}`
	].filter((value): value is string => Boolean(value)).join(' | ');
}
export async function updateWorkflowStageStatus(
	workspaceUri: vscode.Uri,
	stageIndex: number,
	status: WorkflowStageStatus
): Promise<void> {
	const session = await readWorkflowSessionState(workspaceUri);
	if (!session) {
		return;
	}

	const stages = session.stages.map((stage) => stage.index === stageIndex ? { ...stage, status } : stage);
	const updatedSession: WorkflowSessionState = {
		...session,
		updatedAt: new Date().toISOString(),
		stages
	};

	await writeWorkflowSessionState(workspaceUri, updatedSession);

	const updatedStage = stages.find((stage) => stage.index === stageIndex);
	if (!updatedStage) {
		return;
	}

	const stageUri = buildWorkspaceUri(workspaceUri, updatedStage.stageFile);
	if (!stageUri) {
		return;
	}

	try {
		const existingContent = await readUtf8(stageUri);
		const nextContent = existingContent.replace(/^- Status: .*$/m, `- Status: ${status}`);
		await vscode.workspace.fs.writeFile(stageUri, Buffer.from(nextContent, 'utf8'));
	} catch {
		return;
	}
}

export function readLastWorkflowConfig(context: vscode.ExtensionContext): LastWorkflowConfig | undefined {
  return context.globalState.get<LastWorkflowConfig>(LAST_WORKFLOW_CONFIG_KEY);
}

export async function saveLastWorkflowConfig(context: vscode.ExtensionContext, config: LastWorkflowConfig): Promise<void> {
  await context.globalState.update(LAST_WORKFLOW_CONFIG_KEY, config);
}
