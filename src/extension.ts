import * as vscode from 'vscode';

const CONTEXT_FILE_NAME = '.ai-context.md';
const GENERATED_SECTION_START = '<!-- ai-context-orchestrator:generated:start -->';
const GENERATED_SECTION_END = '<!-- ai-context-orchestrator:generated:end -->';
const IGNORED_DIRECTORIES = new Set([
	'.git',
	'.hg',
	'.next',
	'.turbo',
	'.venv',
	'dist',
	'node_modules',
	'out',
	'target'
]);
const DEFAULT_CONTEXT_FILES = [
	'AGENTS.md',
	'CLAUDE.md',
	'Claude.md',
	'claude.md',
	'COPILOT.md',
	'Copilot.md',
	'copilot.md',
	'GEMINI.md',
	'Gemini.md',
	'gemini.md',
	'.github/copilot-instructions.md'
];

type ProviderTarget = 'claude' | 'gemini' | 'copilot';
type WorkflowPreset = 'explore' | 'plan' | 'build' | 'debug' | 'review' | 'test';
type ContextRefreshMode = 'reuse' | 'smart-refresh' | 'full-rebuild';
type CostProfile = 'fast' | 'balanced' | 'strong';
type WorkflowRole = 'explorer' | 'architect' | 'implementer' | 'reviewer' | 'tester' | 'debugger';
type ArtifactKind = 'instruction' | 'agent' | 'skill';
type WorkflowStageStatus = 'prepared' | 'in-progress' | 'completed';

const WORKFLOW_STATE_DIRECTORY = '.ai-orchestrator';
const WORKFLOW_STAGE_DIRECTORY = '.ai-orchestrator/stages';
const WORKFLOW_SESSION_FILE = '.ai-orchestrator/session.json';
const WORKFLOW_BRIEF_FILE = '.ai-orchestrator/brief.md';

interface PackageDetails {
	summary: string;
	scripts: string[];
}

interface AdditionalContextResult {
	sections: string[];
	foundPaths: string[];
}

interface OptimizationResult {
	content: string;
	applied: boolean;
	modelName?: string;
	reason: string;
}

interface WorkflowPresetDefinition {
	preset: WorkflowPreset;
	label: string;
	description: string;
	detail: string;
	recommendedProvider: ProviderTarget;
	roles: WorkflowRole[];
	launchInstruction: string;
	artifactSkillName: string;
}

interface WorkflowExecutionPlan {
	preset: WorkflowPreset;
	provider: ProviderTarget;
	roles: WorkflowRole[];
	refreshMode: ContextRefreshMode;
	costProfile: CostProfile;
	optimizeWithCopilot: boolean;
	generateNativeArtifacts: boolean;
	presetDefinition: WorkflowPresetDefinition;
	brief?: WorkflowBrief;
}

interface ContextMetadata {
	generatedAt: string;
	signature: string;
	preset: WorkflowPreset;
	provider: ProviderTarget;
	refreshMode: ContextRefreshMode;
	costProfile: CostProfile;
	reused: boolean;
	keyFiles: string[];
	instructionFiles: string[];
	commands: string[];
	artifactFiles: string[];
}

interface GeneratedArtifact {
	relativePath: string;
	kind: ArtifactKind;
	content: string;
}

interface ArtifactPlan {
	provider: ProviderTarget;
	files: GeneratedArtifact[];
}

interface WorkflowStageRecord {
	index: number;
	preset: WorkflowPreset;
	provider: ProviderTarget;
	status: WorkflowStageStatus;
	stageFile: string;
	generatedAt: string;
	briefSummary: string;
	contextFile: string;
	artifactFiles: string[];
	upstreamStageFiles: string[];
}

interface WorkflowSessionState {
	workspaceName: string;
	updatedAt: string;
	currentStageIndex: number;
	currentPreset: WorkflowPreset;
	currentProvider: ProviderTarget;
	briefFile: string;
	stages: WorkflowStageRecord[];
}

interface WorkflowBrief {
	taskType: string;
	goal: string;
	constraints: string[];
	rawText: string;
}

interface ProjectContext {
	workspaceFolder: vscode.WorkspaceFolder;
	contextFile: vscode.Uri;
	content: string;
	optimization: OptimizationResult;
	metadata: ContextMetadata;
	workflowPlan: WorkflowExecutionPlan;
	artifactPlan?: ArtifactPlan;
	reused: boolean;
	workflowSession?: WorkflowSessionState;
	currentStage?: WorkflowStageRecord;
	brief?: WorkflowBrief;
}

interface ExtensionConfiguration {
	treeDepth: number;
	readmePreviewLines: number;
	contextFilePreviewLines: number;
	extraContextFiles: string[];
	showIgnoredDirectories: boolean;
	maxEntriesPerDirectory: number;
	optimizeWithCopilot: boolean;
	modelFamily: string;
	autoGenerateOnStartup: boolean;
	defaultPreset: WorkflowPreset;
	defaultProvider: ProviderTarget;
	contextRefreshMode: ContextRefreshMode;
	costProfile: CostProfile;
	generateNativeArtifacts: boolean;
	enabledProviders: ProviderTarget[];
}

interface WorkflowQuickPickItem extends vscode.QuickPickItem {
	presetDefinition?: WorkflowPresetDefinition;
	provider?: ProviderTarget;
	refreshMode?: ContextRefreshMode;
	costProfile?: CostProfile;
	booleanValue?: boolean;
	action?: 'launch' | 'open-context' | 'inspect-artifacts' | 'stop';
}

const WORKFLOW_PRESETS: Record<WorkflowPreset, WorkflowPresetDefinition> = {
	explore: {
		preset: 'explore',
		label: 'Explore',
		description: 'Understand the codebase before changing anything',
		detail: 'Prepare explorer and architect roles to map the repository and find reusable patterns.',
		recommendedProvider: 'copilot',
		roles: ['explorer', 'architect'],
		launchInstruction: 'Start by understanding the codebase, summarize key files, and wait for the next instruction before editing anything.',
		artifactSkillName: 'orchestrator-explore-workflow'
	},
	plan: {
		preset: 'plan',
		label: 'Plan',
		description: 'Produce a concrete implementation plan',
		detail: 'Prepare explorer and architect roles to investigate and then challenge the proposed implementation plan.',
		recommendedProvider: 'copilot',
		roles: ['explorer', 'architect'],
		launchInstruction: 'Investigate the codebase, produce an implementation plan, and highlight reuse opportunities before any code changes.',
		artifactSkillName: 'orchestrator-plan-workflow'
	},
	build: {
		preset: 'build',
		label: 'Build',
		description: 'Implement a feature end-to-end',
		detail: 'Prepare architect, implementer, reviewer, and tester roles for a delivery workflow.',
		recommendedProvider: 'claude',
		roles: ['architect', 'implementer', 'reviewer', 'tester'],
		launchInstruction: 'Validate the plan, implement the feature, review the result, and run focused verification before finishing.',
		artifactSkillName: 'orchestrator-build-workflow'
	},
	debug: {
		preset: 'debug',
		label: 'Debug',
		description: 'Investigate and fix a bug',
		detail: 'Prepare debugger, implementer, and tester roles to isolate root cause and verify the fix.',
		recommendedProvider: 'claude',
		roles: ['debugger', 'implementer', 'tester'],
		launchInstruction: 'Investigate the failing behavior, identify the root cause, apply the fix, and verify it with the smallest relevant checks.',
		artifactSkillName: 'orchestrator-debug-workflow'
	},
	review: {
		preset: 'review',
		label: 'Review',
		description: 'Review code with specialized lenses',
		detail: 'Prepare reviewer and architect roles to inspect correctness, consistency, and risk.',
		recommendedProvider: 'copilot',
		roles: ['reviewer', 'architect'],
		launchInstruction: 'Review the code or changes for correctness, maintainability, reuse, and risk. Report findings before suggesting edits.',
		artifactSkillName: 'orchestrator-review-workflow'
	},
	test: {
		preset: 'test',
		label: 'Test',
		description: 'Add or repair tests',
		detail: 'Prepare tester and implementer roles to write, run, and repair tests efficiently.',
		recommendedProvider: 'gemini',
		roles: ['tester', 'implementer'],
		launchInstruction: 'Focus on testing: add or repair tests, run focused checks, and only change implementation when required by failing tests.',
		artifactSkillName: 'orchestrator-test-workflow'
	}
};

export function activate(context: vscode.ExtensionContext) {
	const outputChannel = vscode.window.createOutputChannel('AI Context Orchestrator');
	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.text = '$(hubot) Init Workflow';
	statusBarItem.tooltip = 'Generate a workflow context pack, prepare native artifacts, and launch a provider';
	statusBarItem.command = 'ai-context-orchestrator.initAI';
	statusBarItem.show();

	const initCommand = vscode.commands.registerCommand('ai-context-orchestrator.initAI', async () => {
		await runInitAiFlow(outputChannel);
	});

	const continueWorkflowCommand = vscode.commands.registerCommand('ai-context-orchestrator.continueWorkflow', async () => {
		await runContinueWorkflowFlow(outputChannel);
	});

	const generateContextCommand = vscode.commands.registerCommand('ai-context-orchestrator.generateContext', async () => {
		const configuration = getExtensionConfiguration();
		const workflowPlan = buildDefaultWorkflowPlan(configuration);
		const projectContext = await gatherProjectContext(outputChannel, false, workflowPlan);
		if (!projectContext) {
			return;
		}

		vscode.window.showInformationMessage(buildContextGenerationMessage(projectContext));
	});

	const configuration = getExtensionConfiguration();
	if (configuration.autoGenerateOnStartup && vscode.workspace.workspaceFolders?.length) {
		void gatherProjectContext(outputChannel, true, buildDefaultWorkflowPlan(configuration));
	}

	context.subscriptions.push(statusBarItem, initCommand, continueWorkflowCommand, generateContextCommand, outputChannel);
}

export function deactivate() {
	return undefined;
}

function buildDefaultWorkflowPlan(configuration: ExtensionConfiguration): WorkflowExecutionPlan {
	const presetDefinition = WORKFLOW_PRESETS[configuration.defaultPreset];
	return {
		preset: presetDefinition.preset,
		provider: configuration.defaultProvider,
		roles: [...presetDefinition.roles],
		refreshMode: configuration.contextRefreshMode,
		costProfile: configuration.costProfile,
		optimizeWithCopilot: configuration.optimizeWithCopilot,
		generateNativeArtifacts: configuration.generateNativeArtifacts,
		presetDefinition
	};
}

async function runInitAiFlow(outputChannel: vscode.OutputChannel): Promise<void> {
	const configuration = getExtensionConfiguration();
	const workflowPlan = await promptForWorkflowPlan(configuration);
	if (!workflowPlan) {
		return;
	}

	const projectContext = await gatherProjectContext(outputChannel, false, workflowPlan);
	if (!projectContext) {
		return;
	}

	const summaryAction = await showWorkflowLaunchSummary(projectContext);
	if (!summaryAction || summaryAction.action === 'stop') {
		vscode.window.showInformationMessage(buildContextGenerationMessage(projectContext));
		return;
	}

	if (summaryAction.action === 'open-context') {
		await vscode.window.showTextDocument(projectContext.contextFile);
		return;
	}

	if (summaryAction.action === 'inspect-artifacts') {
		await inspectGeneratedArtifacts(projectContext);
		return;
	}

	switch (workflowPlan.provider) {
		case 'claude':
			launchClaude(projectContext);
			break;
		case 'gemini':
			launchGemini(projectContext);
			break;
		case 'copilot':
			await launchCopilot(projectContext);
			break;
	}

	outputChannel.appendLine(`[launch] Started workflow ${workflowPlan.preset} with provider ${workflowPlan.provider}`);
}

async function runContinueWorkflowFlow(outputChannel: vscode.OutputChannel): Promise<void> {
	const configuration = getExtensionConfiguration();
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder) {
		vscode.window.showWarningMessage('Open a workspace folder before continuing a workflow.');
		return;
	}

	const existingSession = await readWorkflowSessionState(workspaceFolder.uri);
	if (!existingSession) {
		vscode.window.showWarningMessage('No workflow session found yet. Start with Init Workflow first.');
		return;
	}

	const workflowPlan = await promptForWorkflowContinuation(configuration, existingSession);
	if (!workflowPlan) {
		return;
	}

	const projectContext = await gatherProjectContext(outputChannel, false, workflowPlan);
	if (!projectContext) {
		return;
	}

	const summaryAction = await showWorkflowLaunchSummary(projectContext);
	if (!summaryAction || summaryAction.action === 'stop') {
		vscode.window.showInformationMessage(buildContextGenerationMessage(projectContext));
		return;
	}

	if (summaryAction.action === 'open-context') {
		await vscode.window.showTextDocument(projectContext.contextFile);
		return;
	}

	if (summaryAction.action === 'inspect-artifacts') {
		await inspectGeneratedArtifacts(projectContext);
		return;
	}

	switch (workflowPlan.provider) {
		case 'claude':
			launchClaude(projectContext);
			break;
		case 'gemini':
			launchGemini(projectContext);
			break;
		case 'copilot':
			await launchCopilot(projectContext);
			break;
	}

	outputChannel.appendLine(`[launch] Continued workflow from ${existingSession.currentPreset} to ${workflowPlan.preset} with provider ${workflowPlan.provider}`);
}

async function showWorkflowLaunchSummary(projectContext: ProjectContext): Promise<WorkflowQuickPickItem | undefined> {
	const document = await vscode.workspace.openTextDocument({
		language: 'markdown',
		content: buildWorkflowSummaryDocument(projectContext)
	});
	await vscode.window.showTextDocument(document, {
		preview: false,
		viewColumn: vscode.ViewColumn.Beside,
		preserveFocus: true
	});

	const actions: WorkflowQuickPickItem[] = [
		{
			label: 'Launch provider now',
			description: `${projectContext.workflowPlan.provider} · ${projectContext.workflowPlan.presetDefinition.label}`,
			detail: 'Context, artifacts, and provider-specific prompt are ready. Start the target provider now.',
			action: 'launch'
		},
		{
			label: 'Open context file',
			description: CONTEXT_FILE_NAME,
			detail: 'Inspect the generated context pack before launching anything.',
			action: 'open-context'
		}
	];

	if (projectContext.artifactPlan && projectContext.artifactPlan.files.length > 0) {
		actions.push({
			label: 'Inspect native artifacts',
			description: `${projectContext.artifactPlan.files.length} generated file(s)`,
			detail: 'Choose one of the generated provider-native files to open.',
			action: 'inspect-artifacts'
		});
	}

	actions.push({
		label: 'Stop after generation',
		description: 'Do not launch a provider yet',
		detail: 'Keep the generated context and artifacts, but stop here.',
		action: 'stop'
	});

	return vscode.window.showQuickPick(actions, {
		title: 'Workflow Summary',
		placeHolder: 'Review the generated summary document, then choose the next action',
		ignoreFocusOut: true
	});
}

function buildWorkflowSummaryDocument(projectContext: ProjectContext): string {
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

async function inspectGeneratedArtifacts(projectContext: ProjectContext): Promise<void> {
	if (!projectContext.artifactPlan || projectContext.artifactPlan.files.length === 0) {
		vscode.window.showInformationMessage('No native artifacts were generated for this workflow.');
		return;
	}

	const selection = await vscode.window.showQuickPick(
		projectContext.artifactPlan.files.map<WorkflowQuickPickItem>((artifact) => ({
			label: artifact.relativePath,
			description: artifact.kind,
			detail: `Open generated ${artifact.kind} file`
		})),
		{
			title: 'Generated Native Artifacts',
			placeHolder: 'Choose a generated file to open',
			ignoreFocusOut: true
		}
	);

	if (!selection) {
		return;
	}

	const artifactUri = buildWorkspaceUri(projectContext.workspaceFolder.uri, selection.label);
	if (!artifactUri) {
		return;
	}

	await vscode.window.showTextDocument(artifactUri);
}

async function promptForWorkflowPlan(configuration: ExtensionConfiguration): Promise<WorkflowExecutionPlan | undefined> {
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
		roles: [...presetSelection.presetDefinition.roles],
		refreshMode: refreshSelection.refreshMode,
		costProfile: costSelection.costProfile,
		optimizeWithCopilot: optimizationSelection.booleanValue,
		generateNativeArtifacts: artifactSelection.booleanValue,
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

async function promptForWorkflowContinuation(
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
	const enabledProviders = configuration.enabledProviders.length > 0
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

	const brief = await promptForWorkflowBrief(selectedPreset.preset, session);
		if (!brief) {
		return undefined;
	}

	return {
		preset: selectedPreset.preset,
		provider: providerSelection.provider,
		roles: [...selectedPreset.roles],
		refreshMode: configuration.contextRefreshMode,
		costProfile: configuration.costProfile,
		optimizeWithCopilot: configuration.optimizeWithCopilot,
		generateNativeArtifacts: configuration.generateNativeArtifacts,
		presetDefinition: selectedPreset,
		brief
	};
}

async function promptForWorkflowBrief(preset: WorkflowPreset, existingSession?: WorkflowSessionState): Promise<WorkflowBrief | undefined> {
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

function buildBriefPrompt(preset: WorkflowPreset): string {
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

function inferTaskType(preset: WorkflowPreset, text: string): string {
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

function buildSuggestedNextPresets(currentPreset: WorkflowPreset): WorkflowPreset[] {
	switch (currentPreset) {
		case 'explore':
			return ['plan', 'debug', 'review', 'build', 'test'];
		case 'plan':
			return ['build', 'review', 'debug', 'test', 'explore'];
		case 'build':
			return ['review', 'test', 'debug', 'plan', 'explore'];
		case 'debug':
			return ['test', 'review', 'build', 'plan', 'explore'];
		case 'review':
			return ['build', 'test', 'debug', 'plan', 'explore'];
		case 'test':
		default:
			return ['build', 'review', 'debug', 'plan', 'explore'];
	}
}

function buildProviderDetail(provider: ProviderTarget, presetDefinition: WorkflowPresetDefinition): string {
	switch (provider) {
		case 'claude':
			return `Best when ${presetDefinition.label.toLowerCase()} needs strong delegation, specialized subagents, or deeper parallel investigation.`;
		case 'gemini':
			return `Best when ${presetDefinition.label.toLowerCase()} should stay terminal-first with fast delegation and scriptable automation.`;
		case 'copilot':
			return `Best when ${presetDefinition.label.toLowerCase()} should stay inside VS Code with custom agents, handoffs, and chat review tools.`;
	}
	return '';
}

function getProviderLabel(provider: ProviderTarget): string {
	switch (provider) {
		case 'claude':
			return 'Claude';
		case 'gemini':
			return 'Gemini';
		case 'copilot':
			return 'Copilot';
	}
}

function formatWorkflowRoles(roles: WorkflowRole[]): string {
	return roles.map((role) => capitalize(role)).join(', ');
}

function buildWorkflowPlanSetupSummary(workflowPlan: WorkflowExecutionPlan): string {
	return [
		`Preset: ${workflowPlan.presetDefinition.label}`,
		`Provider: ${getProviderLabel(workflowPlan.provider)}`,
		`Roles: ${formatWorkflowRoles(workflowPlan.roles)}`,
		`Refresh: ${workflowPlan.refreshMode}`,
		`Cost: ${workflowPlan.costProfile}`,
		`Context: ${workflowPlan.optimizeWithCopilot ? 'optimized with Copilot' : 'raw local context'}`,
		`Artifacts: ${workflowPlan.generateNativeArtifacts ? 'generate native files' : 'context file only'}`
	].join(' | ');
}

async function gatherProjectContext(
	outputChannel: vscode.OutputChannel,
	isStartupAutoGeneration: boolean,
	workflowPlan: WorkflowExecutionPlan
): Promise<ProjectContext | undefined> {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder) {
		vscode.window.showWarningMessage('Open a workspace folder before running AI Context Orchestrator.');
		return undefined;
	}

	const contextFile = vscode.Uri.joinPath(workspaceFolder.uri, CONTEXT_FILE_NAME);

	try {
		if (workflowPlan.refreshMode === 'reuse') {
			const reusedProjectContext = await tryReuseExistingContext(contextFile, workspaceFolder, workflowPlan, outputChannel, 'Reused existing context file by user request.');
			if (reusedProjectContext) {
				return reusedProjectContext;
			}
		}

		const configuration = getExtensionConfiguration();
		const [treeLines, readmeLines, packageDetails, additionalContext, keyFiles] = await Promise.all([
			buildWorkspaceTree(workspaceFolder.uri, 0, configuration),
			readReadmeSummary(workspaceFolder.uri, configuration.readmePreviewLines),
			readPackageDetails(workspaceFolder.uri),
			readAdditionalContextFiles(workspaceFolder.uri, configuration.extraContextFiles, configuration.contextFilePreviewLines),
			collectKeyFiles(workspaceFolder.uri)
		]);

		const detectedTech = detectTechStack(packageDetails.summary, treeLines, readmeLines);
		const signatureSource = [
			workflowPlan.preset,
			workflowPlan.provider,
			workflowPlan.costProfile,
			packageDetails.summary,
			readmeLines.join('\n'),
			treeLines.join('\n'),
			additionalContext.sections.join('\n')
		].join('\n');
		const signature = computeSignature(signatureSource);

		if (workflowPlan.refreshMode === 'smart-refresh') {
			const reusedProjectContext = await tryReuseExistingContext(
				contextFile,
				workspaceFolder,
				workflowPlan,
				outputChannel,
				'Smart refresh reused the existing context file because the workspace signature matched.',
				signature
			);
			if (reusedProjectContext) {
				return reusedProjectContext;
			}
		}

		const rawContent = buildRawContextContent(workflowPlan, workspaceFolder, detectedTech, readmeLines, packageDetails, treeLines, additionalContext.sections, keyFiles);
		const optimization = workflowPlan.optimizeWithCopilot
			? await optimizeContextWithCopilot(rawContent, configuration, workflowPlan.costProfile)
			: {
				content: rawContent,
				applied: false,
				reason: 'Copilot optimization disabled for this run.'
			};

		const baseMetadata: ContextMetadata = {
			generatedAt: new Date().toISOString(),
			signature,
			preset: workflowPlan.preset,
			provider: workflowPlan.provider,
			refreshMode: workflowPlan.refreshMode,
			costProfile: workflowPlan.costProfile,
			reused: false,
			keyFiles,
			instructionFiles: additionalContext.foundPaths,
			commands: packageDetails.scripts,
			artifactFiles: []
		};

		const preliminaryArtifactPlan = workflowPlan.generateNativeArtifacts
			? buildArtifactPlan(workspaceFolder.uri, workflowPlan, baseMetadata)
			: undefined;
		const metadata: ContextMetadata = {
			...baseMetadata,
			artifactFiles: preliminaryArtifactPlan?.files.map((file) => file.relativePath) ?? []
		};
		const artifactPlan = workflowPlan.generateNativeArtifacts
			? buildArtifactPlan(workspaceFolder.uri, workflowPlan, metadata)
			: undefined;

		const content = buildContextFileContent(metadata, optimization.content, optimization);
		await vscode.workspace.fs.writeFile(contextFile, Buffer.from(content, 'utf8'));

		if (artifactPlan) {
			await writeArtifactPlan(workspaceFolder.uri, artifactPlan);
		}
		const workflowArtifacts = await persistWorkflowArtifacts(workspaceFolder, workflowPlan, metadata, contextFile, artifactPlan);

		outputChannel.appendLine(`[context] Generated ${CONTEXT_FILE_NAME} for ${workspaceFolder.name}`);
		outputChannel.appendLine(`[context] Workflow=${workflowPlan.preset} provider=${workflowPlan.provider} refresh=${workflowPlan.refreshMode} cost=${workflowPlan.costProfile}`);
		outputChannel.appendLine(`[context] Optimizer requested=${workflowPlan.optimizeWithCopilot} applied=${optimization.applied} model=${optimization.modelName ?? 'n/a'} note=${optimization.reason}`);
		if (artifactPlan) {
			outputChannel.appendLine(`[artifacts] Generated ${artifactPlan.files.length} ${workflowPlan.provider} artifact(s)`);
		}
		outputChannel.appendLine(`[workflow] Prepared shared handoff ${workflowArtifacts.stage.stageFile}`);
		if (!isStartupAutoGeneration) {
			void vscode.window.setStatusBarMessage(buildContextGenerationMessage({
				workspaceFolder,
				contextFile,
				content,
				optimization,
				metadata,
				workflowPlan,
				artifactPlan,
				reused: false,
				workflowSession: workflowArtifacts.session,
				currentStage: workflowArtifacts.stage,
				brief: workflowArtifacts.brief
			}), 6000);
		}

		return {
			workspaceFolder,
			contextFile,
			content,
			optimization,
			metadata,
			workflowPlan,
			artifactPlan,
			reused: false,
			workflowSession: workflowArtifacts.session,
			currentStage: workflowArtifacts.stage,
			brief: workflowArtifacts.brief
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		outputChannel.appendLine(`[error] ${message}`);
		vscode.window.showErrorMessage(`Failed to generate ${CONTEXT_FILE_NAME}: ${message}`);
		return undefined;
	}
}

async function tryReuseExistingContext(
	contextFile: vscode.Uri,
	workspaceFolder: vscode.WorkspaceFolder,
	workflowPlan: WorkflowExecutionPlan,
	outputChannel: vscode.OutputChannel,
	reason: string,
	expectedSignature?: string
): Promise<ProjectContext | undefined> {
	try {
		const content = await readUtf8(contextFile);
		const parsedMetadata = parseContextMetadata(content);
		if (!parsedMetadata) {
			return undefined;
		}

		if (expectedSignature && parsedMetadata.signature !== expectedSignature) {
			return undefined;
		}

		if (expectedSignature && (
			parsedMetadata.preset !== workflowPlan.preset ||
			parsedMetadata.provider !== workflowPlan.provider ||
			parsedMetadata.costProfile !== workflowPlan.costProfile
		)) {
			return undefined;
		}

		const metadata: ContextMetadata = {
			...parsedMetadata,
			reused: true,
			refreshMode: workflowPlan.refreshMode,
			preset: workflowPlan.preset,
			provider: workflowPlan.provider,
			costProfile: workflowPlan.costProfile
		};
		const artifactPlan = workflowPlan.generateNativeArtifacts
			? buildArtifactPlan(workspaceFolder.uri, workflowPlan, metadata)
			: undefined;
		if (artifactPlan) {
			await writeArtifactPlan(workspaceFolder.uri, artifactPlan);
		}
		const workflowArtifacts = await persistWorkflowArtifacts(workspaceFolder, workflowPlan, metadata, contextFile, artifactPlan);

		outputChannel.appendLine(`[context] ${reason}`);
		if (artifactPlan) {
			outputChannel.appendLine(`[artifacts] Refreshed ${artifactPlan.files.length} ${workflowPlan.provider} artifact(s) while reusing context`);
		}
		outputChannel.appendLine(`[workflow] Prepared shared handoff ${workflowArtifacts.stage.stageFile}`);

		return {
			workspaceFolder,
			contextFile,
			content,
			optimization: {
				content,
				applied: false,
				reason
			},
			metadata,
			workflowPlan,
			artifactPlan,
			reused: true,
			workflowSession: workflowArtifacts.session,
			currentStage: workflowArtifacts.stage,
			brief: workflowArtifacts.brief
		};
	} catch {
		return undefined;
	}
}

function buildRawContextContent(
	workflowPlan: WorkflowExecutionPlan,
	workspaceFolder: vscode.WorkspaceFolder,
	detectedTech: string[],
	readmeLines: string[],
	packageDetails: PackageDetails,
	treeLines: string[],
	additionalSections: string[],
	keyFiles: string[]
): string {
	return [
		'# AI Workflow Context Pack',
		'',
		`Workspace: ${workspaceFolder.name}`,
		`Workflow preset: ${workflowPlan.presetDefinition.label}`,
		`Target provider: ${workflowPlan.provider}`,
		`Role set: ${workflowPlan.roles.join(', ')}`,
		`Cost policy: ${workflowPlan.costProfile}`,
		'',
		'## Workflow Goal',
		workflowPlan.presetDefinition.launchInstruction,
		'',
		'## Workflow Shared Files',
		`Session file: ${WORKFLOW_SESSION_FILE}`,
		`Brief file: ${WORKFLOW_BRIEF_FILE}`,
		`Stage directory: ${WORKFLOW_STAGE_DIRECTORY}`,
		workflowPlan.brief ? `Current brief: ${workflowPlan.brief.goal}` : 'Current brief: none provided for this stage',
		'',
		'## Project Summary',
		detectedTech.length > 0 ? `Detected stack: ${detectedTech.join(', ')}` : 'Detected stack: Unknown',
		keyFiles.length > 0 ? `Key files: ${keyFiles.join(', ')}` : 'Key files: none detected',
		packageDetails.scripts.length > 0 ? `Useful commands: ${packageDetails.scripts.join(', ')}` : 'Useful commands: none detected',
		'',
		'## README Preview',
		readmeLines.length > 0 ? readmeLines.join('\n') : 'README.md not found.',
		'',
		'## Package Summary',
		packageDetails.summary,
		'',
		'## Workspace Tree',
		treeLines.length > 0 ? treeLines.join('\n') : '(workspace is empty)',
		'',
		'## Additional AI Instruction Files',
		additionalSections.length > 0 ? additionalSections.join('\n\n') : 'No assistant-specific instruction files found.',
		''
	].join('\n');
}

function buildContextFileContent(metadata: ContextMetadata, optimizedContent: string, optimization: OptimizationResult): string {
	return [
		'# Context Generation Metadata',
		'',
		`Generated at: ${metadata.generatedAt}`,
		`Context signature: ${metadata.signature}`,
		`Workflow preset: ${metadata.preset}`,
		`Workflow provider: ${metadata.provider}`,
		`Context refresh mode: ${metadata.refreshMode}`,
		`Cost profile: ${metadata.costProfile}`,
		`Context reused: ${metadata.reused ? 'yes' : 'no'}`,
		`Optimizer applied: ${optimization.applied ? 'yes' : 'no'}`,
		`Optimizer model: ${optimization.modelName ?? 'n/a'}`,
		`Optimizer note: ${optimization.reason}`,
		`Key files: ${serializeList(metadata.keyFiles)}`,
		`Instruction files: ${serializeList(metadata.instructionFiles)}`,
		`Suggested commands: ${serializeList(metadata.commands)}`,
		`Native artifacts: ${serializeList(metadata.artifactFiles)}`,
		'',
		optimizedContent
	].join('\n');
}

function parseContextMetadata(content: string): ContextMetadata | undefined {
	const lines = content.split(/\r?\n/);
	if (lines.length === 0 || lines[0].trim() !== '# Context Generation Metadata') {
		return undefined;
	}

	const values = new Map<string, string>();
	for (const line of lines.slice(1)) {
		if (!line.trim()) {
			break;
		}
		const separatorIndex = line.indexOf(':');
		if (separatorIndex <= 0) {
			continue;
		}
		const key = line.slice(0, separatorIndex).trim();
		const value = line.slice(separatorIndex + 1).trim();
		values.set(key, value);
	}

	const preset = values.get('Workflow preset') as WorkflowPreset | undefined;
	const provider = values.get('Workflow provider') as ProviderTarget | undefined;
	const refreshMode = values.get('Context refresh mode') as ContextRefreshMode | undefined;
	const costProfile = values.get('Cost profile') as CostProfile | undefined;
	const signature = values.get('Context signature');
	const generatedAt = values.get('Generated at');
	if (!preset || !provider || !refreshMode || !costProfile || !signature || !generatedAt) {
		return undefined;
	}

	return {
		generatedAt,
		signature,
		preset,
		provider,
		refreshMode,
		costProfile,
		reused: values.get('Context reused') === 'yes',
		keyFiles: parseList(values.get('Key files')),
		instructionFiles: parseList(values.get('Instruction files')),
		commands: parseList(values.get('Suggested commands')),
		artifactFiles: parseList(values.get('Native artifacts'))
	};
}

function serializeList(values: string[]): string {
	return values.length > 0 ? values.join(', ') : 'none';
}

async function readWorkflowSessionState(workspaceUri: vscode.Uri): Promise<WorkflowSessionState | undefined> {
	const sessionUri = buildWorkspaceUri(workspaceUri, WORKFLOW_SESSION_FILE);
	if (!sessionUri) {
		return undefined;
	}

	try {
		const content = await readUtf8(sessionUri);
		return JSON.parse(content) as WorkflowSessionState;
	} catch {
		return undefined;
	}
}

async function readWorkflowBrief(workspaceUri: vscode.Uri): Promise<WorkflowBrief | undefined> {
	const briefUri = buildWorkspaceUri(workspaceUri, WORKFLOW_BRIEF_FILE);
	if (!briefUri) {
		return undefined;
	}

	try {
		const content = await readUtf8(briefUri);
		const lines = content.split(/\r?\n/);
		const taskType = lines.find((line) => line.startsWith('Type:'))?.slice('Type:'.length).trim() ?? 'general';
		const goal = lines.find((line) => line.startsWith('Goal:'))?.slice('Goal:'.length).trim() ?? '';
		return {
			taskType,
			goal,
			constraints: lines.filter((line) => line.startsWith('- ')).map((line) => line.slice(2).trim()),
			rawText: content.trim()
		};
	} catch {
		return undefined;
	}
}

async function persistWorkflowArtifacts(
	workspaceFolder: vscode.WorkspaceFolder,
	workflowPlan: WorkflowExecutionPlan,
	metadata: ContextMetadata,
	contextFile: vscode.Uri,
	artifactPlan?: ArtifactPlan
): Promise<{ session: WorkflowSessionState; stage: WorkflowStageRecord; brief?: WorkflowBrief }> {
	const existingSession = await readWorkflowSessionState(workspaceFolder.uri);
	const brief = workflowPlan.brief ?? await readWorkflowBrief(workspaceFolder.uri);
	if (brief) {
		await writeWorkflowBrief(workspaceFolder.uri, brief);
	}

	const nextIndex = (existingSession?.currentStageIndex ?? 0) + 1;
	const stageFile = `${WORKFLOW_STAGE_DIRECTORY}/${String(nextIndex).padStart(2, '0')}-${workflowPlan.preset}.md`;
	const upstreamStageFiles = existingSession?.stages.map((stage) => stage.stageFile) ?? [];
	const stage: WorkflowStageRecord = {
		index: nextIndex,
		preset: workflowPlan.preset,
		provider: workflowPlan.provider,
		status: 'prepared',
		stageFile,
		generatedAt: new Date().toISOString(),
		briefSummary: brief?.goal ?? (workflowPlan.preset === 'explore' ? 'Explore the repository and identify reusable patterns.' : 'No brief provided.'),
		contextFile: relativizeToWorkspace(workspaceFolder.uri, contextFile),
		artifactFiles: artifactPlan?.files.map((file) => file.relativePath) ?? [],
		upstreamStageFiles
	};

	await writeWorkflowStageFile(workspaceFolder.uri, stageFile, buildWorkflowStageContent(workflowPlan, stage, brief));

	const session: WorkflowSessionState = {
		workspaceName: workspaceFolder.name,
		updatedAt: new Date().toISOString(),
		currentStageIndex: nextIndex,
		currentPreset: workflowPlan.preset,
		currentProvider: workflowPlan.provider,
		briefFile: WORKFLOW_BRIEF_FILE,
		stages: [...(existingSession?.stages ?? []), stage]
	};

	await writeWorkflowSessionState(workspaceFolder.uri, session);
	return { session, stage, brief };
}

async function writeWorkflowBrief(workspaceUri: vscode.Uri, brief: WorkflowBrief): Promise<void> {
	const briefUri = buildWorkspaceUri(workspaceUri, WORKFLOW_BRIEF_FILE);
	if (!briefUri) {
		return;
	}

	await ensureParentDirectory(briefUri);
	const content = [
		'# User Brief',
		'',
		`Type: ${brief.taskType}`,
		`Goal: ${brief.goal}`,
		'',
		'Constraints:',
		...(brief.constraints.length > 0 ? brief.constraints.map((constraint) => `- ${constraint}`) : ['- none provided']),
		'',
		'Raw:',
		brief.rawText
	].join('\n');
	await vscode.workspace.fs.writeFile(briefUri, Buffer.from(content.trimEnd() + '\n', 'utf8'));
}

async function writeWorkflowStageFile(workspaceUri: vscode.Uri, relativePath: string, content: string): Promise<void> {
	const fileUri = buildWorkspaceUri(workspaceUri, relativePath);
	if (!fileUri) {
		return;
	}

	await ensureParentDirectory(fileUri);
	await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content.trimEnd() + '\n', 'utf8'));
}

async function writeWorkflowSessionState(workspaceUri: vscode.Uri, session: WorkflowSessionState): Promise<void> {
	const sessionUri = buildWorkspaceUri(workspaceUri, WORKFLOW_SESSION_FILE);
	if (!sessionUri) {
		return;
	}

	await ensureParentDirectory(sessionUri);
	await vscode.workspace.fs.writeFile(sessionUri, Buffer.from(`${JSON.stringify(session, null, 2)}\n`, 'utf8'));
}

function buildWorkflowStageContent(
	workflowPlan: WorkflowExecutionPlan,
	stage: WorkflowStageRecord,
	brief?: WorkflowBrief
): string {
	return [
		`# Stage ${String(stage.index).padStart(2, '0')} ${workflowPlan.presetDefinition.label}`,
		'',
		`- Provider: ${getProviderLabel(workflowPlan.provider)}`,
		`- Preset: ${workflowPlan.preset}`,
		`- Roles: ${formatWorkflowRoles(workflowPlan.roles)}`,
		`- Status: ${stage.status}`,
		`- Generated at: ${stage.generatedAt}`,
		'',
		'## Objective',
		workflowPlan.presetDefinition.launchInstruction,
		'',
		'## User Brief',
		brief ? brief.goal : 'No explicit brief provided for this stage.',
		'',
		'## Upstream Handoffs',
		...(stage.upstreamStageFiles.length > 0 ? stage.upstreamStageFiles.map((file) => `- ${file}`) : ['- none']),
		'',
		'## Instructions For The Active Provider',
		'- Read .ai-context.md first.',
		'- Read .ai-orchestrator/brief.md if it exists.',
		'- Read upstream stage handoffs before acting.',
		'- Write findings, decisions, or results back into this file before stopping.',
		'- Keep the content concrete and reusable by the next provider.',
		'',
		'## Working Notes',
		'- Fill this section with exploration findings, plans, implementation notes, review findings, or test results.',
		'',
		'## Recommended Next Step',
		`- Suggested preset: ${buildSuggestedNextPresets(workflowPlan.preset)[0]}`,
		'- Suggested provider: choose the assistant best suited for the next stage.'
	].join('\n');
}

function relativizeToWorkspace(workspaceUri: vscode.Uri, targetUri: vscode.Uri): string {
	const workspacePath = workspaceUri.path.endsWith('/') ? workspaceUri.path : `${workspaceUri.path}/`;
	if (!targetUri.path.startsWith(workspacePath)) {
		return targetUri.path;
	}

	return targetUri.path.slice(workspacePath.length);
}

function parseList(value: string | undefined): string[] {
	if (!value || value === 'none') {
		return [];
	}

	return value
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
}

function computeSignature(input: string): string {
	let hash = 2166136261;
	for (let index = 0; index < input.length; index += 1) {
		hash ^= input.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return `sig-${(hash >>> 0).toString(16)}`;
}

function getExtensionConfiguration(): ExtensionConfiguration {
	const configuration = vscode.workspace.getConfiguration('aiContextOrchestrator');
	const treeDepth = clampNumber(configuration.get<number>('treeDepth', 2), 1, 6);
	const readmePreviewLines = clampNumber(configuration.get<number>('readmePreviewLines', 20), 5, 200);
	const contextFilePreviewLines = clampNumber(configuration.get<number>('contextFilePreviewLines', 80), 10, 400);
	const maxEntriesPerDirectory = clampNumber(configuration.get<number>('maxEntriesPerDirectory', 40), 5, 200);
	const extraContextFiles = configuration.get<string[]>('extraContextFiles', DEFAULT_CONTEXT_FILES);
	const showIgnoredDirectories = configuration.get<boolean>('showIgnoredDirectories', true);
	const optimizeWithCopilot = configuration.get<boolean>('optimizeWithCopilot', false);
	const modelFamily = configuration.get<string>('modelFamily', '').trim();
	const autoGenerateOnStartup = configuration.get<boolean>('autoGenerateOnStartup', false);
	const defaultPreset = configuration.get<WorkflowPreset>('defaultPreset', 'build');
	const defaultProvider = configuration.get<ProviderTarget>('defaultProvider', 'copilot');
	const contextRefreshMode = configuration.get<ContextRefreshMode>('contextRefreshMode', 'smart-refresh');
	const costProfile = configuration.get<CostProfile>('costProfile', 'balanced');
	const generateNativeArtifacts = configuration.get<boolean>('generateNativeArtifacts', true);
	const enabledProviders = configuration.get<ProviderTarget[]>('enabledProviders', ['claude', 'gemini', 'copilot']);

	return {
		treeDepth,
		readmePreviewLines,
		contextFilePreviewLines,
		extraContextFiles: extraContextFiles.filter((entry) => entry.trim().length > 0),
		showIgnoredDirectories,
		maxEntriesPerDirectory,
		optimizeWithCopilot,
		modelFamily,
		autoGenerateOnStartup,
		defaultPreset,
		defaultProvider,
		contextRefreshMode,
		costProfile,
		generateNativeArtifacts,
		enabledProviders: enabledProviders.filter((provider): provider is ProviderTarget => ['claude', 'gemini', 'copilot'].includes(provider))
	};
}

function clampNumber(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

async function buildWorkspaceTree(folder: vscode.Uri, depth: number, configuration: ExtensionConfiguration): Promise<string[]> {
	if (depth > configuration.treeDepth) {
		return [];
	}

	const entries = await vscode.workspace.fs.readDirectory(folder);
	const sortedEntries = entries
		.sort(([leftName, leftType], [rightName, rightType]) => {
			if (leftType !== rightType) {
				return leftType === vscode.FileType.Directory ? -1 : 1;
			}

			return leftName.localeCompare(rightName);
		});

	const lines: string[] = [];
	let includedEntries = 0;
	let omittedEntries = 0;

	for (const [name, type] of sortedEntries) {
		const prefix = `${'  '.repeat(depth)}- `;
		if (type === vscode.FileType.Directory && isIgnoredDirectory(name)) {
			if (configuration.showIgnoredDirectories) {
				lines.push(`${prefix}${name}/ (excluded)`);
			}
			continue;
		}

		if (name === CONTEXT_FILE_NAME) {
			continue;
		}

		if (!shouldIncludeEntry(name, type, depth)) {
			omittedEntries += 1;
			continue;
		}

		if (includedEntries >= configuration.maxEntriesPerDirectory) {
			omittedEntries += 1;
			continue;
		}

		includedEntries += 1;
		if (type === vscode.FileType.Directory) {
			lines.push(`${prefix}${name}/`);
			if (depth < configuration.treeDepth) {
				lines.push(...await buildWorkspaceTree(vscode.Uri.joinPath(folder, name), depth + 1, configuration));
			}
			continue;
		}

		lines.push(`${prefix}${name}`);
	}

	if (omittedEntries > 0) {
		lines.push(`${'  '.repeat(depth)}- ... ${omittedEntries} additional entries omitted`);
	}

	return lines;
}

function isIgnoredDirectory(name: string): boolean {
	return IGNORED_DIRECTORIES.has(name);
}

function shouldIncludeEntry(name: string, type: vscode.FileType, depth: number): boolean {
	if (type === vscode.FileType.Directory) {
		return true;
	}

	if (depth === 0) {
		return !isBinaryLikeFile(name);
	}

	return isRelevantFile(name);
}

function isRelevantFile(name: string): boolean {
	const normalized = name.toLowerCase();
	const relevantNames = new Set([
		'dockerfile',
		'makefile',
		'package-lock.json',
		'package.json',
		'pnpm-lock.yaml',
		'pyproject.toml',
		'readme.md',
		'requirements.txt',
		'tsconfig.json',
		'vite.config.ts',
		'vite.config.js',
		'webpack.config.js',
		'yarn.lock'
	]);

	if (relevantNames.has(normalized)) {
		return true;
	}

	const relevantExtensions = new Set([
		'.c',
		'.cc',
		'.cpp',
		'.cs',
		'.css',
		'.env',
		'.go',
		'.graphql',
		'.h',
		'.hpp',
		'.html',
		'.java',
		'.js',
		'.json',
		'.jsx',
		'.md',
		'.mjs',
		'.php',
		'.ps1',
		'.py',
		'.rb',
		'.rs',
		'.scss',
		'.sh',
		'.sql',
		'.toml',
		'.ts',
		'.tsx',
		'.txt',
		'.vue',
		'.xml',
		'.yaml',
		'.yml'
	]);

	for (const extension of relevantExtensions) {
		if (normalized.endsWith(extension)) {
			return true;
		}
	}

	return false;
}

function isBinaryLikeFile(name: string): boolean {
	const normalized = name.toLowerCase();
	const ignoredExtensions = [
		'.7z',
		'.dll',
		'.exe',
		'.gif',
		'.ico',
		'.jpeg',
		'.jpg',
		'.mp3',
		'.mp4',
		'.pdf',
		'.png',
		'.svg',
		'.webp',
		'.zip'
	];

	return ignoredExtensions.some((extension) => normalized.endsWith(extension));
}

async function readReadmeSummary(workspaceUri: vscode.Uri, maxLines: number): Promise<string[]> {
	const candidates = ['README.md', 'Readme.md', 'readme.md'];
	for (const candidate of candidates) {
		const file = vscode.Uri.joinPath(workspaceUri, candidate);
		try {
			const content = await readUtf8(file);
			return content.split(/\r?\n/).slice(0, maxLines);
		} catch {
			continue;
		}
	}

	return [];
}

async function readAdditionalContextFiles(
	workspaceUri: vscode.Uri,
	filePaths: string[],
	maxLines: number
): Promise<AdditionalContextResult> {
	const sections: string[] = [];
	const foundPaths: string[] = [];

	for (const relativePath of filePaths) {
		const sanitizedPath = relativePath.trim();
		if (!sanitizedPath) {
			continue;
		}

		const fileUri = buildWorkspaceUri(workspaceUri, sanitizedPath);
		if (!fileUri) {
			continue;
		}

		try {
			const content = await readUtf8(fileUri);
			const preview = content.split(/\r?\n/).slice(0, maxLines).join('\n');
			sections.push(`### ${sanitizedPath}\n\n${preview}`);
			foundPaths.push(sanitizedPath);
		} catch {
			continue;
		}
	}

	return { sections, foundPaths };
}

function buildWorkspaceUri(workspaceUri: vscode.Uri, relativePath: string): vscode.Uri | undefined {
	const segments = relativePath
		.split('/')
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0);

	if (segments.length === 0) {
		return undefined;
	}

	return vscode.Uri.joinPath(workspaceUri, ...segments);
}

async function optimizeContextWithCopilot(
	rawContext: string,
	configuration: ExtensionConfiguration,
	costProfile: CostProfile
): Promise<OptimizationResult> {
	try {
		const selector = configuration.modelFamily
			? { vendor: 'copilot', family: configuration.modelFamily }
			: getOptimizationSelector(costProfile);
		const models = await vscode.lm.selectChatModels(selector);
		if (models.length === 0) {
			return {
				content: rawContext,
				applied: false,
				reason: 'No Copilot chat model was available for optimization.'
			};
		}

		const [model] = models;
		const messages = [
			vscode.LanguageModelChatMessage.User([
				'You are optimizing a repository workflow context file for coding assistants.',
				'Rewrite the context as compact markdown.',
				'Keep only project-relevant structure, important files, instructions, stack details, constraints, key commands, and likely entry points.',
				'Do not invent facts.',
				'Keep the workflow goal and the provider-specific focus intact.',
				'Return only the optimized markdown that should be written to .ai-context.md.',
				'',
				'Raw context:',
				rawContext
			].join('\n'))
		];

		const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
		let optimized = '';
		for await (const fragment of response.text) {
			optimized += fragment;
		}

		const trimmed = optimized.trim();
		if (trimmed.length === 0) {
			return {
				content: rawContext,
				applied: false,
				reason: 'Copilot returned an empty optimization result.',
				modelName: model.name
			};
		}

		return {
			content: trimmed,
			applied: true,
			modelName: model.name,
			reason: 'Copilot rewrote the raw workflow context successfully.'
		};
	} catch (error) {
		if (error instanceof vscode.LanguageModelError) {
			return {
				content: rawContext,
				applied: false,
				reason: `Copilot optimization unavailable: ${error.message}`
			};
		}

		return {
			content: rawContext,
			applied: false,
			reason: error instanceof Error ? error.message : 'Unknown optimization error.'
		};
	}
}

function getOptimizationSelector(costProfile: CostProfile): { vendor: string; family?: string } {
	switch (costProfile) {
		case 'fast':
			return { vendor: 'copilot', family: 'gpt-4o-mini' };
		case 'strong':
			return { vendor: 'copilot', family: 'gpt-4o' };
		case 'balanced':
		default:
			return { vendor: 'copilot' };
	}
}

function buildContextGenerationMessage(projectContext: ProjectContext): string {
	const parts = [
		`${projectContext.workflowPlan.presetDefinition.label} workflow prepared for ${projectContext.workflowPlan.provider}.`,
		projectContext.reused
			? 'Existing context pack reused.'
			: projectContext.optimization.applied
				? `Context optimized by Copilot (${projectContext.optimization.modelName ?? 'model unknown'}).`
				: `Context generated without Copilot optimization. ${projectContext.optimization.reason}`
	];

	if (projectContext.artifactPlan) {
		parts.push(`${projectContext.artifactPlan.files.length} native artifact(s) prepared.`);
	}

	if (projectContext.currentStage) {
		parts.push(`Shared handoff prepared at ${projectContext.currentStage.stageFile}.`);
	}

	return parts.join(' ');
}

async function readPackageDetails(workspaceUri: vscode.Uri): Promise<PackageDetails> {
	const packageUri = vscode.Uri.joinPath(workspaceUri, 'package.json');
	try {
		const packageContent = await readUtf8(packageUri);
		const packageJson = JSON.parse(packageContent) as {
			name?: string;
			version?: string;
			description?: string;
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
			scripts?: Record<string, string>;
		};

		const dependencies = formatDependencyList(packageJson.dependencies);
		const devDependencies = formatDependencyList(packageJson.devDependencies);
		const scripts = packageJson.scripts
			? Object.keys(packageJson.scripts)
				.sort((left, right) => left.localeCompare(right))
				.slice(0, 8)
			: [];

		return {
			summary: [
				`Name: ${packageJson.name ?? 'unknown'}`,
				`Version: ${packageJson.version ?? 'unknown'}`,
				`Description: ${packageJson.description ?? 'n/a'}`,
				`Dependencies: ${dependencies}`,
				`Dev dependencies: ${devDependencies}`,
				`Scripts: ${scripts.length > 0 ? scripts.join(', ') : 'none'}`
			].join('\n'),
			scripts
		};
	} catch {
		return {
			summary: 'package.json not found.',
			scripts: []
		};
	}
}

async function collectKeyFiles(workspaceUri: vscode.Uri): Promise<string[]> {
	try {
		const entries = await vscode.workspace.fs.readDirectory(workspaceUri);
		return entries
			.filter(([name, type]) => type === vscode.FileType.File && isRelevantFile(name) && name !== CONTEXT_FILE_NAME)
			.map(([name]) => name)
			.sort((left, right) => left.localeCompare(right))
			.slice(0, 8);
	} catch {
		return [];
	}
}

function detectTechStack(packageSummary: string, treeLines: string[], readmeLines: string[]): string[] {
	const detected = new Set<string>();
	const summary = packageSummary.toLowerCase();
	const tree = treeLines.join('\n').toLowerCase();
	const readme = readmeLines.join('\n').toLowerCase();
	const combined = `${summary}\n${tree}\n${readme}`;

	if (combined.includes('typescript') || tree.includes('.ts') || tree.includes('.tsx')) {
		detected.add('TypeScript');
	}
	if (combined.includes('react') || tree.includes('.jsx') || tree.includes('.tsx')) {
		detected.add('React');
	}
	if (combined.includes('vscode')) {
		detected.add('VS Code Extension');
	}
	if (combined.includes('eslint')) {
		detected.add('ESLint');
	}
	if (combined.includes('esbuild')) {
		detected.add('esbuild');
	}
	if (combined.includes('mocha')) {
		detected.add('Mocha');
	}
	if (tree.includes('index.html') || tree.includes('.html')) {
		detected.add('HTML');
	}
	if (tree.includes('.css') || tree.includes('.scss')) {
		detected.add('CSS');
	}
	if (tree.includes('.js') || summary.includes('package.json')) {
		detected.add('JavaScript');
	}
	if (tree.includes('server.js') || combined.includes('express') || combined.includes('fastify') || combined.includes('koa')) {
		detected.add('Node.js');
	}
	if (tree.includes('worker') || tree.includes('worker.js') || tree.includes('worker.ts')) {
		detected.add('Web Workers');
	}

	return [...detected];
}

function formatDependencyList(dependencies: Record<string, string> | undefined): string {
	if (!dependencies || Object.keys(dependencies).length === 0) {
		return 'none';
	}

	return Object.entries(dependencies)
		.sort(([left], [right]) => left.localeCompare(right))
		.slice(0, 12)
		.map(([name, version]) => `${name}@${version}`)
		.join(', ');
}

async function readUtf8(uri: vscode.Uri): Promise<string> {
	const bytes = await vscode.workspace.fs.readFile(uri);
	return Buffer.from(bytes).toString('utf8');
}

function buildArtifactPlan(workspaceUri: vscode.Uri, workflowPlan: WorkflowExecutionPlan, metadata: ContextMetadata): ArtifactPlan {
	const files: GeneratedArtifact[] = [];
	void workspaceUri;
	files.push(buildInstructionArtifact(workflowPlan, metadata));
	for (const role of workflowPlan.roles) {
		files.push(buildAgentArtifact(workflowPlan, metadata, role));
	}
	files.push(buildSkillArtifact(workflowPlan, metadata));

	return {
		provider: workflowPlan.provider,
		files
	};
}

function buildInstructionArtifact(workflowPlan: WorkflowExecutionPlan, metadata: ContextMetadata): GeneratedArtifact {
	const relativePath = getInstructionArtifactPath(workflowPlan.provider);
	const content = buildInstructionArtifactContent(workflowPlan, metadata);
	return {
		relativePath,
		kind: 'instruction',
		content
	};
}

function getInstructionArtifactPath(provider: ProviderTarget): string {
	switch (provider) {
		case 'claude':
			return 'CLAUDE.md';
		case 'gemini':
			return 'GEMINI.md';
		case 'copilot':
			return '.github/copilot-instructions.md';
	}
}

function buildInstructionArtifactContent(workflowPlan: WorkflowExecutionPlan, metadata: ContextMetadata): string {
	return [
		'## AI Context Orchestrator',
		'',
		`- Workflow preset: ${workflowPlan.preset}`,
		`- Roles prepared: ${workflowPlan.roles.join(', ')}`,
		`- Refresh mode: ${workflowPlan.refreshMode}`,
		`- Cost profile: ${workflowPlan.costProfile}`,
		`- Context file: ${CONTEXT_FILE_NAME}`,
		'',
		'### Current objective',
		workflowPlan.presetDefinition.launchInstruction,
		'',
		'### Key files',
		...formatListForMarkdown(metadata.keyFiles, 'No key files detected.'),
		'',
		'### Useful commands',
		...formatListForMarkdown(metadata.commands, 'No package scripts detected.'),
		'',
		'### Instruction files already present',
		...formatListForMarkdown(metadata.instructionFiles, 'No provider-specific instruction files were detected during generation.'),
		'',
		'### Working rules',
		'- Read the generated context pack before acting.',
		'- Reuse existing project patterns before introducing new abstractions.',
		'- Keep edits minimal and verify with the smallest relevant checks.',
		'- Escalate to stronger reasoning only if the current role or model policy is insufficient.'
	].join('\n');
}

function formatListForMarkdown(values: string[], fallback: string): string[] {
	if (values.length === 0) {
		return [fallback];
	}

	return values.map((value) => `- ${value}`);
}

function buildAgentArtifact(workflowPlan: WorkflowExecutionPlan, metadata: ContextMetadata, role: WorkflowRole): GeneratedArtifact {
	switch (workflowPlan.provider) {
		case 'claude':
			return {
				relativePath: `.claude/agents/orchestrator-${role}.md`,
				kind: 'agent',
				content: buildClaudeAgentContent(workflowPlan, metadata, role)
			};
		case 'gemini':
			return {
				relativePath: `.gemini/agents/orchestrator-${role}.md`,
				kind: 'agent',
				content: buildGeminiAgentContent(workflowPlan, metadata, role)
			};
		case 'copilot':
			return {
				relativePath: `.github/agents/orchestrator-${role}.agent.md`,
				kind: 'agent',
				content: buildCopilotAgentContent(workflowPlan, metadata, role)
			};
	}
}

function buildClaudeAgentContent(workflowPlan: WorkflowExecutionPlan, metadata: ContextMetadata, role: WorkflowRole): string {
	return [
		'---',
		`name: orchestrator-${role}`,
		`description: ${getRoleDescription(role)}`,
		`tools: ${getClaudeToolsForRole(role)}`,
		`model: ${getClaudeModelForRole(role, workflowPlan.costProfile)}`,
		'---',
		'',
		`You are the ${role} role for AI Context Orchestrator.`,
		`Current workflow preset: ${workflowPlan.preset}.`,
		`Workflow objective: ${workflowPlan.presetDefinition.launchInstruction}`,
		`Context file: ${CONTEXT_FILE_NAME}.`,
		'',
		'Primary responsibilities:',
		...getRoleInstructions(role),
		'',
		'Preset-specific focus:',
		...getPresetSpecificInstructions(workflowPlan.preset, role),
		'',
		'Project signals:',
		...formatListForMarkdown(metadata.keyFiles, 'No key files were detected.'),
		'',
		'Useful commands:',
		...formatListForMarkdown(metadata.commands, 'No package scripts were detected.'),
		'',
		'Execution rules:',
		'- Read the generated context pack before acting.',
		'- Stay inside your role boundary instead of trying to solve the whole workflow.',
		'- Prefer existing project patterns, utilities, and file layouts over invention.',
		'- Verify with the smallest relevant check before stopping when your role edits code or tests.',
		'',
		'Delegation and stop conditions:',
		...getRoleDelegationGuidance(workflowPlan, role),
		'',
		'Output contract:',
		...getRoleOutputContract(role)
	].join('\n');
}

function buildGeminiAgentContent(workflowPlan: WorkflowExecutionPlan, metadata: ContextMetadata, role: WorkflowRole): string {
	return [
		'---',
		`name: orchestrator-${role}`,
		`description: ${getRoleDescription(role)}`,
		'kind: local',
		'tools:',
		...getGeminiToolsForRole(role).map((tool) => `  - ${tool}`),
		`model: ${getGeminiModelForRole(role, workflowPlan.costProfile)}`,
		'max_turns: 12',
		'---',
		'',
		`You are the ${role} role for AI Context Orchestrator.`,
		`Current workflow preset: ${workflowPlan.preset}.`,
		`Workflow objective: ${workflowPlan.presetDefinition.launchInstruction}`,
		`Context file: ${CONTEXT_FILE_NAME}.`,
		'',
		'Primary responsibilities:',
		...getRoleInstructions(role),
		'',
		'Preset-specific focus:',
		...getPresetSpecificInstructions(workflowPlan.preset, role),
		'',
		'Useful project files:',
		...formatListForMarkdown(metadata.keyFiles, 'No key files were detected.'),
		'',
		'Useful commands:',
		...formatListForMarkdown(metadata.commands, 'No package scripts were detected.'),
		'',
		'Execution rules:',
		'- Read the generated context pack before acting.',
		'- Use concise steps and re-evaluate after each concrete finding or edit.',
		'- Prefer grounded file evidence over speculative reasoning.',
		'- Escalate only when the current role is blocked by missing context or ownership.',
		'',
		'Delegation and stop conditions:',
		...getRoleDelegationGuidance(workflowPlan, role),
		'',
		'Output contract:',
		...getRoleOutputContract(role)
	].join('\n');
}

function buildCopilotAgentContent(workflowPlan: WorkflowExecutionPlan, metadata: ContextMetadata, role: WorkflowRole): string {
	const handoffs = getCopilotHandoffsForRole(workflowPlan, role);
	const handoffLines = handoffs.flatMap((handoff) => [
		`  - label: ${handoff.label}`,
		`    agent: ${handoff.agent}`,
		`    prompt: ${handoff.prompt}`,
		`    send: ${handoff.send ? 'true' : 'false'}`
	]);

	return [
		'---',
		`name: Orchestrator ${capitalize(role)}`,
		`description: ${getRoleDescription(role)}`,
		`tools: [${getCopilotToolsForRole(role).map((tool) => `'${tool}'`).join(', ')}]`,
		`user-invocable: ${role === 'implementer' || role === 'reviewer' ? 'true' : 'false'}`,
		'disable-model-invocation: false',
		`agents: [${getCopilotAllowedSubagents(workflowPlan, role).map((agent) => `'${agent}'`).join(', ')}]`,
		...(handoffs.length > 0 ? ['handoffs:', ...handoffLines] : []),
		'---',
		'',
		`You are the ${role} role for AI Context Orchestrator.`,
		`Current workflow preset: ${workflowPlan.preset}.`,
		`Workflow objective: ${workflowPlan.presetDefinition.launchInstruction}`,
		`Read ${CONTEXT_FILE_NAME} before acting.`,
		'',
		'Primary responsibilities:',
		...getRoleInstructions(role),
		'',
		'Preset-specific focus:',
		...getPresetSpecificInstructions(workflowPlan.preset, role),
		'',
		'Key files to inspect first:',
		...formatListForMarkdown(metadata.keyFiles, 'No key files were detected.'),
		'',
		'Useful commands:',
		...formatListForMarkdown(metadata.commands, 'No package scripts were detected.'),
		'',
		'Execution rules:',
		'- Keep the conversation anchored in the generated context pack and the files you verify directly.',
		'- Use handoffs or subagents when another role can complete the next step more precisely than you can.',
		'- Prefer minimal edits, minimal test scope, and explicit risk reporting.',
		'',
		'Delegation and stop conditions:',
		...getRoleDelegationGuidance(workflowPlan, role),
		'',
		'Output contract:',
		...getRoleOutputContract(role),
		'',
		`Preferred cost policy for this run: ${workflowPlan.costProfile}.`
	].join('\n');
}

function buildSkillArtifact(workflowPlan: WorkflowExecutionPlan, metadata: ContextMetadata): GeneratedArtifact {
	switch (workflowPlan.provider) {
		case 'claude':
			return {
				relativePath: `.claude/skills/${workflowPlan.presetDefinition.artifactSkillName}/SKILL.md`,
				kind: 'skill',
				content: buildClaudeSkillContent(workflowPlan, metadata)
			};
		case 'gemini':
			return {
				relativePath: `.gemini/skills/${workflowPlan.presetDefinition.artifactSkillName}/SKILL.md`,
				kind: 'skill',
				content: buildGeminiSkillContent(workflowPlan, metadata)
			};
		case 'copilot':
			return {
				relativePath: `.github/skills/${workflowPlan.presetDefinition.artifactSkillName}/SKILL.md`,
				kind: 'skill',
				content: buildCopilotSkillContent(workflowPlan, metadata)
			};
	}
}

function buildClaudeSkillContent(workflowPlan: WorkflowExecutionPlan, metadata: ContextMetadata): string {
	return [
		'---',
		`name: ${workflowPlan.presetDefinition.artifactSkillName}`,
		`description: ${workflowPlan.presetDefinition.description}`,
		'disable-model-invocation: true',
		'context: fork',
		`agent: ${getClaudeSkillAgent(workflowPlan.preset)}`,
		'---',
		'',
		workflowPlan.presetDefinition.launchInstruction,
		'',
		'When to use this skill:',
		`- Use it when the request matches the ${workflowPlan.presetDefinition.label.toLowerCase()} workflow.`,
		'- Use the prepared roles instead of improvising a new workflow structure.',
		'',
		'Execution loop:',
		'- Read the generated context pack and relevant instruction files first.',
		'- Pick the smallest number of roles needed for the task.',
		'- Keep each role scoped to its responsibility and stop after a concrete result.',
		'- Verify with focused checks before handing back to the user.',
		'',
		'Use these roles as references:',
		...formatListForMarkdown(workflowPlan.roles.map((role) => `orchestrator-${role}`), 'No roles defined.'),
		'',
		'Workflow signals:',
		...formatListForMarkdown(metadata.keyFiles, 'No key files detected.'),
		'',
		`Read ${CONTEXT_FILE_NAME} before acting.`,
		`Suggested commands: ${serializeList(metadata.commands)}.`
	].join('\n');
}

function buildGeminiSkillContent(workflowPlan: WorkflowExecutionPlan, metadata: ContextMetadata): string {
	return [
		'---',
		`name: ${workflowPlan.presetDefinition.artifactSkillName}`,
		`description: ${workflowPlan.presetDefinition.description}`,
		'---',
		'',
		'# Workflow Skill',
		'',
		workflowPlan.presetDefinition.launchInstruction,
		'',
		'When to use this skill:',
		`- Use it when the request needs the ${workflowPlan.presetDefinition.label.toLowerCase()} workflow.`,
		'- Keep the role chain explicit instead of blending exploration, implementation, review, and testing together.',
		'',
		'Execution loop:',
		'- Read the generated context pack and relevant files first.',
		'- Work in short iterations with concrete evidence from files or command output.',
		'- Stop after a role-specific result and hand off if another role is more appropriate.',
		'',
		'Roles prepared for this workflow:',
		...formatListForMarkdown(workflowPlan.roles, 'No roles defined.'),
		'',
		'Workflow signals:',
		...formatListForMarkdown(metadata.keyFiles, 'No key files detected.'),
		'',
		`Read ${CONTEXT_FILE_NAME} first.`,
		`Useful commands: ${serializeList(metadata.commands)}.`
	].join('\n');
}

function buildCopilotSkillContent(workflowPlan: WorkflowExecutionPlan, metadata: ContextMetadata): string {
	return [
		'---',
		`name: ${workflowPlan.presetDefinition.artifactSkillName}`,
		`description: ${workflowPlan.presetDefinition.description}`,
		'---',
		'',
		'# Workflow Skill',
		'',
		workflowPlan.presetDefinition.launchInstruction,
		'',
		'When to use this skill:',
		`- Use it when the user request maps to the ${workflowPlan.presetDefinition.label.toLowerCase()} workflow.`,
		'- Keep the work split across the prepared agents and handoffs rather than treating everything as one generic chat.',
		'',
		'Execution loop:',
		'- Read the generated context pack first.',
		'- Route the task to the narrowest valid role.',
		'- Use handoffs when the next step is better owned by another prepared agent.',
		'- End with verification status, open risks, and the next concrete action.',
		'',
		'Workflow roles to invoke or hand off to:',
		...formatListForMarkdown(workflowPlan.roles.map((role) => `Orchestrator ${capitalize(role)}`), 'No roles defined.'),
		'',
		'Workflow signals:',
		...formatListForMarkdown(metadata.keyFiles, 'No key files detected.'),
		'',
		`Read ${CONTEXT_FILE_NAME} first.`,
		`Useful commands: ${serializeList(metadata.commands)}.`
	].join('\n');
}

function getPresetSpecificInstructions(preset: WorkflowPreset, role: WorkflowRole): string[] {
	switch (preset) {
		case 'explore':
			return role === 'explorer'
				? ['- Map the relevant code paths, dependencies, and extension points without editing code.', '- Surface the fastest path to answer the user request.']
				: ['- Stay lightweight and avoid proposing implementation depth that the exploration does not justify yet.'];
		case 'plan':
			return role === 'architect'
				? ['- Turn the context into a small implementation plan with explicit constraints and checkpoints.', '- Reject unnecessary abstractions before they enter the plan.']
				: ['- Support planning with concrete evidence, not speculative design.'];
		case 'build':
			return role === 'implementer'
				? ['- Translate the validated plan into minimal code changes.', '- Leave the codebase in a verifiable state before stopping.']
				: ['- Keep the build workflow moving toward a concrete implementation milestone.'];
		case 'debug':
			return role === 'debugger'
				? ['- Isolate the root cause before proposing edits.', '- Prefer reproduction evidence, logs, and narrow experiments.']
				: ['- Keep all reasoning tied to the reported symptom and the most plausible root cause.'];
		case 'review':
			return role === 'reviewer'
				? ['- Prioritize correctness, regression risk, and missing verification.', '- Keep findings concrete and severity-driven.']
				: ['- Support review with concise evidence instead of broad rewrites.'];
		case 'test':
			return role === 'tester'
				? ['- Select the smallest test surface that proves or disproves the change.', '- Add or adjust coverage only where it reduces real regression risk.']
				: ['- Support testing with explicit scope, edge cases, and pass-fail criteria.'];
	}

	return [];
}

function getRoleDelegationGuidance(workflowPlan: WorkflowExecutionPlan, role: WorkflowRole): string[] {
	const availableOtherRoles = workflowPlan.roles.filter((candidateRole) => candidateRole !== role);
	const nextRoleText = availableOtherRoles.length > 0 ? availableOtherRoles.join(', ') : 'none';

	switch (role) {
		case 'explorer':
			return [
				`- Stop once the relevant map is clear enough for downstream roles. Available downstream roles: ${nextRoleText}.`,
				'- Do not implement code unless the workflow explicitly routes that responsibility back to you.'
			];
		case 'architect':
			return [
				`- Stop after the design constraints and implementation path are clear. Available downstream roles: ${nextRoleText}.`,
				'- Hand off once the plan is concrete enough to execute without design guesswork.'
			];
		case 'implementer':
			return [
				`- Stop after the requested code path is implemented and minimally verified. Available downstream roles: ${nextRoleText}.`,
				'- Hand off when review or testing would add more precision than continued coding.'
			];
		case 'reviewer':
			return [
				`- Stop after findings, risks, and verification gaps are explicit. Available downstream roles: ${nextRoleText}.`,
				'- Do not rewrite the implementation unless the workflow specifically requires it.'
			];
		case 'tester':
			return [
				`- Stop after the targeted checks have passed or failed with clear evidence. Available downstream roles: ${nextRoleText}.`,
				'- Escalate back only when a failure reveals a product bug, flaky test, or missing prerequisite.'
			];
		case 'debugger':
			return [
				`- Stop after the root cause and smallest valid fix are identified or applied. Available downstream roles: ${nextRoleText}.`,
				'- Hand off once verification or follow-up implementation becomes the dominant task.'
			];
	}

	return [];
}

function getRoleOutputContract(role: WorkflowRole): string[] {
	switch (role) {
		case 'explorer':
			return ['- Return a compact map of files, dependencies, and reusable patterns.', '- Call out uncertainties explicitly instead of filling gaps with guesses.'];
		case 'architect':
			return ['- Return a short plan with constraints, tradeoffs, and the recommended approach.', '- Make the expected edit scope and validation path explicit.'];
		case 'implementer':
			return ['- Return the concrete change made, the files touched, and the verification performed.', '- Mention any remaining risk or intentionally deferred work.'];
		case 'reviewer':
			return ['- Return findings first, ordered by severity and backed by concrete evidence.', '- Keep the summary brief and secondary to the findings.'];
		case 'tester':
			return ['- Return the checks performed, their outcomes, and the exact failing surface if any.', '- Call out gaps in coverage or confidence explicitly.'];
		case 'debugger':
			return ['- Return the observed symptom, root cause, and the smallest valid fix.', '- Distinguish confirmed causes from hypotheses that still need validation.'];
	}

	return [];
}

function getRoleDescription(role: WorkflowRole): string {
	switch (role) {
		case 'explorer':
			return 'Map the codebase, identify key files, dependencies, and reusable patterns before implementation.';
		case 'architect':
			return 'Validate plans and implementations against existing project architecture and reusable patterns.';
		case 'implementer':
			return 'Write or modify code to implement the requested behavior while respecting project conventions.';
		case 'reviewer':
			return 'Review code for correctness, maintainability, consistency, and risk.';
		case 'tester':
			return 'Add, run, and repair tests with a focus on focused verification and regression safety.';
		case 'debugger':
			return 'Investigate symptoms, generate hypotheses, isolate the root cause, and propose or apply the smallest valid fix.';
	}
}

function getRoleInstructions(role: WorkflowRole): string[] {
	switch (role) {
		case 'explorer':
			return [
				'- Read only what is needed to map the relevant area of the codebase.',
				'- Identify entry points, key dependencies, and reusable utilities.',
				'- Return a concise map with concrete file references.'
			];
		case 'architect':
			return [
				'- Challenge duplication, unnecessary abstractions, and pattern drift.',
				'- Prefer the smallest design that fits the existing codebase.',
				'- Highlight constraints before code is written when possible.'
			];
		case 'implementer':
			return [
				'- Implement the requested change with minimal, focused edits.',
				'- Reuse existing patterns and utilities before introducing new ones.',
				'- Verify with the smallest relevant checks before stopping.'
			];
		case 'reviewer':
			return [
				'- Prioritize bugs, regressions, and missing verification over style nits.',
				'- Report findings clearly with concrete evidence and impact.',
				'- Keep summaries brief after findings.'
			];
		case 'tester':
			return [
				'- Prefer focused tests over broad suite runs when possible.',
				'- Cover edge cases and regression paths that are easy to miss.',
				'- If tests fail, isolate whether the bug is in the code or the test expectation.'
			];
		case 'debugger':
			return [
				'- Start from the symptom and work backward toward the root cause.',
				'- Prefer reproductions, logs, and tight hypotheses over speculative edits.',
				'- Explain the root cause before or alongside the fix.'
			];
	}
}

function getClaudeToolsForRole(role: WorkflowRole): string {
	switch (role) {
		case 'explorer':
		case 'architect':
		case 'reviewer':
			return 'Read, Grep, Glob';
		case 'tester':
		case 'debugger':
			return 'Read, Grep, Glob, Bash';
		case 'implementer':
		default:
			return 'Read, Grep, Glob, Edit, Bash';
	}
}

function getClaudeModelForRole(role: WorkflowRole, costProfile: CostProfile): string {
	if (costProfile === 'fast') {
		return role === 'architect' || role === 'reviewer' ? 'sonnet' : 'haiku';
	}

	if (costProfile === 'strong') {
		return role === 'implementer' || role === 'tester' ? 'sonnet' : 'opus';
	}

	return role === 'explorer' || role === 'tester' ? 'haiku' : 'sonnet';
}

function getGeminiToolsForRole(role: WorkflowRole): string[] {
	switch (role) {
		case 'explorer':
		case 'architect':
		case 'reviewer':
			return ['read_file', 'grep_search'];
		case 'tester':
		case 'debugger':
			return ['read_file', 'grep_search', 'run_shell_command'];
		case 'implementer':
		default:
			return ['read_file', 'grep_search', 'replace', 'run_shell_command'];
	}
}

function getGeminiModelForRole(role: WorkflowRole, costProfile: CostProfile): string {
	if (costProfile === 'fast') {
		return 'gemini-2.5-flash';
	}

	if (costProfile === 'strong') {
		return role === 'explorer' || role === 'tester' ? 'gemini-2.5-flash' : 'gemini-2.5-pro';
	}

	return role === 'architect' || role === 'reviewer' ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
	}

function getCopilotToolsForRole(role: WorkflowRole): string[] {
	switch (role) {
		case 'explorer':
		case 'architect':
		case 'reviewer':
			return ['read', 'search'];
		case 'tester':
		case 'debugger':
			return ['read', 'search', 'runTests'];
		case 'implementer':
		default:
			return ['agent', 'read', 'search', 'edit', 'runTests'];
	}
}

function getCopilotAllowedSubagents(workflowPlan: WorkflowExecutionPlan, role: WorkflowRole): string[] {
	if (role === 'implementer') {
		return workflowPlan.roles
			.filter((candidateRole) => candidateRole !== 'implementer')
			.map((candidateRole) => `Orchestrator ${capitalize(candidateRole)}`);
	}

	return [];
}

function getCopilotHandoffsForRole(
	workflowPlan: WorkflowExecutionPlan,
	role: WorkflowRole
): Array<{ label: string; agent: string; prompt: string; send: boolean }> {
	if (role === 'explorer' && workflowPlan.roles.includes('architect')) {
		return [{
			label: 'Turn Map Into Plan',
			agent: 'orchestrator-architect',
			prompt: 'Use the exploration results and generated context pack to produce a constrained implementation plan.',
			send: false
		}];
	}

	if (role === 'architect' && workflowPlan.roles.includes('implementer')) {
		return [{
			label: 'Start Implementation',
			agent: 'orchestrator-implementer',
			prompt: 'Now implement the validated plan using the generated context pack and provider artifacts.',
			send: false
		}];
	}

	if (role === 'implementer' && workflowPlan.roles.includes('reviewer')) {
		return [{
			label: 'Review Changes',
			agent: 'orchestrator-reviewer',
			prompt: 'Review the current implementation for correctness, consistency, and missing verification.',
			send: false
		}, ...(workflowPlan.roles.includes('tester') ? [{
			label: 'Verify With Tests',
			agent: 'orchestrator-tester',
			prompt: 'Run or extend the smallest relevant tests for the current implementation and report any verification gaps.',
			send: false
		}] : [])];
	}

	if (role === 'reviewer' && workflowPlan.roles.includes('tester')) {
		return [{
			label: 'Validate Reviewed Surface',
			agent: 'orchestrator-tester',
			prompt: 'Validate the reviewed change with the smallest relevant verification and report remaining confidence gaps.',
			send: false
		}];
	}

	if (role === 'debugger' && workflowPlan.roles.includes('tester')) {
		return [{
			label: 'Verify Fix',
			agent: 'orchestrator-tester',
			prompt: 'Run the smallest relevant verification for the identified bug fix and report any gaps.',
			send: false
		}];
	}

	return [];
}

function getClaudeSkillAgent(preset: WorkflowPreset): string {
	switch (preset) {
		case 'explore':
		case 'plan':
		case 'review':
			return 'Explore';
		default:
			return 'general-purpose';
	}
}

function capitalize(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

async function writeArtifactPlan(workspaceUri: vscode.Uri, artifactPlan: ArtifactPlan): Promise<void> {
	for (const artifact of artifactPlan.files) {
		const fileUri = buildWorkspaceUri(workspaceUri, artifact.relativePath);
		if (!fileUri) {
			continue;
		}

		await ensureParentDirectory(fileUri);
		if (artifact.kind === 'instruction') {
			await upsertManagedMarkdown(fileUri, artifact.content);
			continue;
		}

		await vscode.workspace.fs.writeFile(fileUri, Buffer.from(artifact.content.trimEnd() + '\n', 'utf8'));
	}
}

async function ensureParentDirectory(fileUri: vscode.Uri): Promise<void> {
	const path = fileUri.path;
	const lastSlashIndex = path.lastIndexOf('/');
	if (lastSlashIndex <= 0) {
		return;
	}

	const parentPath = path.slice(0, lastSlashIndex);
	const parentUri = fileUri.with({ path: parentPath });
	await vscode.workspace.fs.createDirectory(parentUri);
}

async function upsertManagedMarkdown(fileUri: vscode.Uri, generatedContent: string): Promise<void> {
	const managedBlock = `${GENERATED_SECTION_START}\n${generatedContent.trim()}\n${GENERATED_SECTION_END}\n`;
	try {
		const existingContent = await readUtf8(fileUri);
		const nextContent = replaceManagedBlock(existingContent, managedBlock);
		await vscode.workspace.fs.writeFile(fileUri, Buffer.from(nextContent, 'utf8'));
	} catch {
		await vscode.workspace.fs.writeFile(fileUri, Buffer.from(managedBlock, 'utf8'));
	}
}

function replaceManagedBlock(existingContent: string, managedBlock: string): string {
	const startIndex = existingContent.indexOf(GENERATED_SECTION_START);
	const endIndex = existingContent.indexOf(GENERATED_SECTION_END);
	if (startIndex >= 0 && endIndex > startIndex) {
		const prefix = existingContent.slice(0, startIndex).trimEnd();
		const suffix = existingContent.slice(endIndex + GENERATED_SECTION_END.length).trimStart();
		return [prefix, managedBlock.trimEnd(), suffix].filter((part) => part.length > 0).join('\n\n') + '\n';
	}

	if (existingContent.trim().length === 0) {
		return managedBlock;
	}

	return `${existingContent.trimEnd()}\n\n${managedBlock}`;
}

function buildWorkflowSummary(projectContext: ProjectContext): string {
	const parts = [
		`${projectContext.workflowPlan.presetDefinition.label} -> ${getProviderLabel(projectContext.workflowPlan.provider)}`,
		`Preset id: ${projectContext.workflowPlan.preset}`,
		`Roles: ${formatWorkflowRoles(projectContext.workflowPlan.roles)}`,
		`Refresh: ${projectContext.workflowPlan.refreshMode}`,
		`Cost: ${projectContext.workflowPlan.costProfile}`,
		projectContext.reused ? 'Context reused' : 'Context regenerated'
	];

	if (projectContext.artifactPlan) {
		parts.push(`Artifacts: ${projectContext.artifactPlan.files.length}`);
	}

	return parts.join(' | ');
}

function buildProviderLaunchPrompt(projectContext: ProjectContext): string {
	switch (projectContext.workflowPlan.provider) {
		case 'claude':
			return `claude --append-system-prompt-file "${CONTEXT_FILE_NAME}" "${projectContext.workflowPlan.presetDefinition.launchInstruction}"`;
		case 'gemini':
			return `Read ${CONTEXT_FILE_NAME}, use the generated Gemini artifacts if present, and ${projectContext.workflowPlan.presetDefinition.launchInstruction.toLowerCase()}`;
		case 'copilot':
			return [
				`Use the ${projectContext.workflowPlan.presetDefinition.label} workflow for this project.`,
				`Start by reading ${CONTEXT_FILE_NAME}.`,
				projectContext.artifactPlan
					? 'Use the generated custom agents, skills, and instructions if they are relevant.'
					: 'Work directly from the context pack and current workspace context.',
				projectContext.workflowPlan.presetDefinition.launchInstruction
			].join(' ');
	}
}

function launchClaude(projectContext: ProjectContext): void {
	const terminal = vscode.window.createTerminal({
		name: 'Claude Code',
		cwd: projectContext.workspaceFolder.uri.fsPath
	});

	terminal.show(true);
	terminal.sendText(
		`claude --append-system-prompt-file "${CONTEXT_FILE_NAME}" "${buildSharedWorkflowInstruction(projectContext)}"`,
		true
	);
	void vscode.window.showInformationMessage(`Claude Code launched for the ${projectContext.workflowPlan.preset} workflow.`);
}

function launchGemini(projectContext: ProjectContext): void {
	const terminal = vscode.window.createTerminal({
		name: 'Gemini CLI',
		cwd: projectContext.workspaceFolder.uri.fsPath
	});

	terminal.show(true);
	terminal.sendText(
		`gemini "${buildSharedWorkflowInstruction(projectContext)}"`,
		true
	);
	void vscode.window.showInformationMessage(`Gemini CLI launched for the ${projectContext.workflowPlan.preset} workflow.`);
}

async function launchCopilot(projectContext: ProjectContext): Promise<void> {
	const prompt = buildSharedWorkflowInstruction(projectContext);

	await vscode.env.clipboard.writeText(prompt);
	await vscode.commands.executeCommand('workbench.action.chat.open');

	const action = await vscode.window.showInformationMessage(
		'Copilot Chat opened. The workflow prompt has been copied to the clipboard.',
		'Copy Prompt Again',
		'Open Context File'
	);

	if (action === 'Copy Prompt Again') {
		await vscode.env.clipboard.writeText(prompt);
		return;
	}

	if (action === 'Open Context File') {
		await vscode.window.showTextDocument(projectContext.contextFile);
	}
}			? 'Use the generated custom agents, skills, and instructions if they are relevant.'
			: 'Work directly from the context pack and current workspace context.',
		projectContext.workflowPlan.presetDefinition.launchInstruction
	].join(' ');

	await vscode.env.clipboard.writeText(prompt);
	await vscode.commands.executeCommand('workbench.action.chat.open');

	const action = await vscode.window.showInformationMessage(
		'Copilot Chat opened. The workflow prompt has been copied to the clipboard.',
		'Copy Prompt Again',
		'Open Context File'
	);

	if (action === 'Copy Prompt Again') {
		await vscode.env.clipboard.writeText(prompt);
		return;
	}

	if (action === 'Open Context File') {
		await vscode.window.showTextDocument(projectContext.contextFile);
	}
}	}

	if (action === 'Open Context File') {
		await vscode.window.showTextDocument(projectContext.contextFile);
	}
}