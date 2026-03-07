import * as vscode from 'vscode';
import {
	CLAUDE_DEFAULT_MODELS,
	CONTEXT_FILE_NAME,
	DEFAULT_CONTEXT_FILES,
	GEMINI_DEFAULT_MODELS,
	GENERATED_SECTION_END,
	GENERATED_SECTION_START,
	IGNORED_DIRECTORIES,
	PROVIDER_ACCOUNT_SECRET_PREFIX,
	PROVIDER_STATUS_CACHE_KEY,
	WORKFLOW_BRIEF_FILE,
	WORKFLOW_CONTROL_VIEW_ID,
	WORKFLOW_SESSION_FILE,
	WORKFLOW_STAGE_DIRECTORY,
	WORKFLOW_STATE_DIRECTORY,
	WORKFLOW_TREE_VIEW_ID
} from './features/workflow/constants.js';
import { WORKFLOW_PRESETS } from './features/workflow/presets.js';
import type {
	AdditionalContextResult,
	ArtifactKind,
	ArtifactPlan,
	ClaudeEffortLevel,
	ContextMetadata,
	ContextRefreshMode,
	CostProfile,
	ExtensionConfiguration,
	GeneratedArtifact,
	MetricDisplay,
	OptimizationResult,
	PackageDetails,
	ProjectContext,
	ProviderAccountConfiguration,
	ProviderAccountStatus,
	ProviderStatusAvailability,
	ProviderStatusCache,
	ProviderStatusSnapshot,
	ProviderTarget,
	WorkflowBrief,
	WorkflowDashboardState,
	WorkflowExecutionPlan,
	WorkflowPreset,
	WorkflowPresetDefinition,
	WorkflowQuickPickItem,
	WorkflowRole,
	WorkflowSessionState,
	WorkflowStageRecord,
	WorkflowStageStatus,
	WorkflowTreeNode
} from './features/workflow/types.js';
import {
	WorkflowControlViewProvider,
	WorkflowTreeDataProvider,
	buildWorkflowPromptFromDashboardState,
	buildWorkflowPromptPreviewDocument,
	buildWorkflowTreeMessage,
	getWorkflowStageStatusLabel,
	getWorkflowStudioHtml,
	type WorkflowUiHelpers
} from './features/workflow/ui.js';
import { execShellCommand, escapeHtml, createNonce, serializeList, parseList, computeSignature, clampNumber, formatListForMarkdown, capitalize } from "./utils/index.js";
import { normalizeProviderAccounts, getExtensionConfiguration } from "./core/configuration.js";
import { relativizeToWorkspace, isIgnoredDirectory, shouldIncludeEntry, isRelevantFile, isBinaryLikeFile, buildWorkspaceUri } from "./core/workspace.js";
import { getImplicitWorkspaceFolder, resolveWorkspaceFolder } from './core/workspaceContext.js';
import { UiRefreshDebouncer } from './core/uiRefreshDebouncer.js';
import { buildDefaultProviderStatuses, buildDefaultAccountStatuses, buildDefaultAccountSummary, buildDefaultAccountDetail, buildDefaultAccountMetrics, mergeProviderStatusCache, refreshProviderStatuses, getAccountSecretStorageKey, getStoredProviderCredential, setStoredProviderCredential, getEnvProviderCredential, getResolvedProviderCredential, getManagedClaudeConfigDir, getProviderAccountPortalUrl, buildDefaultAuthAssistCommand, buildProviderLaunchEnvironment, resolveClaudeProviderStatus, resolveGenericProviderStatus, resolveClaudeAccountStatus, resolveGenericAccountStatus, switchActiveProviderAccount, manageProviderAccounts, connectProviderAccount, configureProviderCredential, runProviderAuthAssist, openProviderAccountPortal, promptForExistingProviderAccount, promptForProviderAccountDetails, promptForProviderTarget, promptForStoredCredential, promptForAccountClaudeEffort, ensureManagedClaudeConfigDir, promptForClaudeAccount, runQuotaCommand, getProviderAccounts, getActiveProviderAccountId, updateActiveProviderAccountId, writeProviderAccounts, findProviderAccount, findClaudeAccount, getProviderLabel, getDefaultProviderModel, getDefaultClaudeEffort, getProviderModelOptions, formatProviderModel, promptForProviderModel, promptForProviderAccount, buildProviderDetail } from "./features/providers/providerService.js";
import { fileExists, readUtf8 } from "./core/workspace.js";
import { buildRawContextContent, buildContextFileContent, parseContextMetadata, optimizeContextWithCopilot, readReadmeSummary, readAdditionalContextFiles, buildWorkspaceTree, getOptimizationSelector, gatherProjectContext, readWorkflowSessionState, readWorkflowBrief, writeArtifactPlan, ensureParentDirectory, buildContextGenerationMessage, writeWorkflowBrief, writeWorkflowSessionState, buildSuggestedNextPresets } from "./features/context/contextBuilder.js";
import { buildArtifactPlan, buildInstructionArtifact, getInstructionArtifactPath, buildInstructionArtifactContent, buildAgentArtifact, buildClaudeAgentContent, buildGeminiAgentContent, buildCopilotAgentContent, buildSkillArtifact, buildClaudeSkillContent, buildGeminiSkillContent, buildCopilotSkillContent, getPresetSpecificInstructions, getRoleDelegationGuidance, getRoleOutputContract, getRoleDescription, getRoleInstructions, getClaudeToolsForRole, getClaudeModelForRole, getGeminiToolsForRole, getGeminiModelForRole, getCopilotToolsForRole, getCopilotAllowedSubagents, getCopilotHandoffsForRole, getClaudeSkillAgent, replaceManagedBlock, buildWorkflowSummary, buildProviderLaunchPrompt, buildSharedWorkflowInstruction } from "./features/aiAgents/promptBuilder.js";
import { buildClaudeLaunchCommand, buildGeminiLaunchCommand, launchClaude, launchGemini } from "./features/aiAgents/agentLauncher.js";
import { formatWorkflowRoles } from "./features/workflow/ui.js";
import { updateContinueWorkflowButtonVisibility, getWorkflowDashboardState, updateSelectedWorkflowStageStatus, openWorkspaceRelativeFile, buildDefaultWorkflowPlan, buildWorkflowSummaryDocument, promptForWorkflowPlan, promptForWorkflowContinuation, promptForClaudeEffort, promptForWorkflowBrief, buildBriefPrompt, inferTaskType, buildWorkflowPlanSetupSummary, updateWorkflowStageStatus } from "./features/workflow/workflowService.js";

export let extensionContextRef: vscode.ExtensionContext | undefined;

export function activate(context: vscode.ExtensionContext) {
	extensionContextRef = context;
	const outputChannel = vscode.window.createOutputChannel('AI Context Orchestrator');
	let selectedStageIndex: number | undefined;
	const workflowUiHelpers: WorkflowUiHelpers = {
		createNonce,
		escapeHtml,
		getProviderLabel,
		getExtensionConfiguration,
		findProviderAccount
	};
	const loadDashboardState = async (): Promise<WorkflowDashboardState> => getWorkflowDashboardState(selectedStageIndex, context);
	const workflowTreeDataProvider = new WorkflowTreeDataProvider(loadDashboardState, workflowUiHelpers);
	const workflowControlViewProvider = new WorkflowControlViewProvider(context.extensionUri, loadDashboardState, workflowUiHelpers);
	let workflowStudioPanel: vscode.WebviewPanel | undefined;
	const workflowTreeView = vscode.window.createTreeView(WORKFLOW_TREE_VIEW_ID, {
		treeDataProvider: workflowTreeDataProvider,
		showCollapseAll: true
	});
	const refreshDebouncer = new UiRefreshDebouncer();
	workflowTreeView.onDidChangeSelection((event) => {
		selectedStageIndex = event.selection[0]?.stageIndex;
		workflowControlViewProvider.refresh();
	});
	context.subscriptions.push(vscode.window.registerWebviewViewProvider(WORKFLOW_CONTROL_VIEW_ID, workflowControlViewProvider));

	const initStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	initStatusBarItem.text = '$(hubot) Init Workflow';
	initStatusBarItem.tooltip = 'Start a new workflow: generate a context pack, prepare artifacts, and launch a provider';
	initStatusBarItem.command = 'ai-context-orchestrator.initAI';
	initStatusBarItem.show();

	const continueStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
	continueStatusBarItem.text = '$(arrow-right) Continue Workflow';
	continueStatusBarItem.tooltip = 'Continue the current workflow to the next stage, optionally with another provider';
	continueStatusBarItem.command = 'ai-context-orchestrator.continueWorkflow';
	continueStatusBarItem.hide();

	const refreshWorkflowUi = async (): Promise<void> => {
		const dashboardState = await loadDashboardState();
		await updateContinueWorkflowButtonVisibility(continueStatusBarItem, context);
		workflowTreeView.badge = dashboardState.session
			? { value: dashboardState.session.stages.length, tooltip: `${dashboardState.session.stages.length} workflow stage(s)` }
			: undefined;
		workflowTreeView.message = buildWorkflowTreeMessage(dashboardState, workflowUiHelpers);
		workflowTreeDataProvider.refresh();
		workflowControlViewProvider.refresh();
		if (workflowStudioPanel) {
			workflowStudioPanel.webview.html = getWorkflowStudioHtml(workflowStudioPanel.webview, dashboardState, createNonce(), workflowUiHelpers);
		}
	};

	const resolveCommandWorkspaceFolder = async (placeHolder: string): Promise<vscode.WorkspaceFolder | undefined> => {
		return resolveWorkspaceFolder(context, {
			placeHolder,
			showWarning: true
		});
	};

	const initCommand = vscode.commands.registerCommand('ai-context-orchestrator.initAI', async () => {
		const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder to initialize');
		if (!workspaceFolder) {
			return;
		}

		await runInitAiFlow(outputChannel, workspaceFolder);
		await refreshWorkflowUi();
	});

	const continueWorkflowCommand = vscode.commands.registerCommand('ai-context-orchestrator.continueWorkflow', async () => {
		const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder whose workflow you want to continue');
		if (!workspaceFolder) {
			return;
		}

		await runContinueWorkflowFlow(outputChannel, workspaceFolder);
		await refreshWorkflowUi();
	});

	const generateContextCommand = vscode.commands.registerCommand('ai-context-orchestrator.generateContext', async () => {
		const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder whose context should be generated');
		if (!workspaceFolder) {
			return;
		}

		const configuration = getExtensionConfiguration();
		const workflowPlan = buildDefaultWorkflowPlan(configuration);
		const projectContext = await gatherProjectContext(outputChannel, false, workflowPlan, workspaceFolder);
		if (!projectContext) {
			return;
		}

		vscode.window.showInformationMessage(buildContextGenerationMessage(projectContext));
		await refreshWorkflowUi();
	});

	const openWorkflowBriefCommand = vscode.commands.registerCommand('ai-context-orchestrator.openWorkflowBrief', async () => {
		const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder whose brief should be opened');
		if (!workspaceFolder) {
			return;
		}

		await openWorkspaceRelativeFile(workspaceFolder.uri, WORKFLOW_BRIEF_FILE);
	});

	const openLatestWorkflowHandoffCommand = vscode.commands.registerCommand('ai-context-orchestrator.openLatestWorkflowHandoff', async () => {
		const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder whose latest handoff should be opened');
		if (!workspaceFolder) {
			return;
		}

		const session = await readWorkflowSessionState(workspaceFolder.uri);
		const latestStage = session?.stages.at(-1);
		if (!latestStage) {
			void vscode.window.showInformationMessage('No workflow handoff is available yet.');
			return;
		}

		await openWorkspaceRelativeFile(workspaceFolder.uri, latestStage.stageFile);
	});

	const openContextFileCommand = vscode.commands.registerCommand('ai-context-orchestrator.openContextFile', async () => {
		const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder whose context file should be opened');
		if (!workspaceFolder) {
			return;
		}

		await openWorkspaceRelativeFile(workspaceFolder.uri, CONTEXT_FILE_NAME);
	});

	const openWorkflowSessionCommand = vscode.commands.registerCommand('ai-context-orchestrator.openWorkflowSession', async () => {
		const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder whose session should be opened');
		if (!workspaceFolder) {
			return;
		}

		await openWorkspaceRelativeFile(workspaceFolder.uri, WORKFLOW_SESSION_FILE);
	});

	const openWorkflowTreeNodeCommand = vscode.commands.registerCommand('ai-context-orchestrator.openWorkflowTreeNode', async (node?: WorkflowTreeNode) => {
		const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder whose workflow file should be opened');
		if (!workspaceFolder || !node?.relativePath) {
			return;
		}

		await openWorkspaceRelativeFile(workspaceFolder.uri, node.relativePath);
	});

	const previewWorkflowPromptCommand = vscode.commands.registerCommand('ai-context-orchestrator.previewWorkflowPrompt', async () => {
		const state = await loadDashboardState();
		const prompt = buildWorkflowPromptFromDashboardState(state, workflowUiHelpers);
		if (!prompt) {
			void vscode.window.showInformationMessage('No active workflow prompt is available yet.');
			return;
		}

		const document = await vscode.workspace.openTextDocument({
			language: 'markdown',
			content: buildWorkflowPromptPreviewDocument(state, prompt, workflowUiHelpers)
		});
		await vscode.window.showTextDocument(document, {
			preview: false,
			viewColumn: vscode.ViewColumn.Beside,
			preserveFocus: true
		});
	});

	const copyWorkflowPromptCommand = vscode.commands.registerCommand('ai-context-orchestrator.copyWorkflowPrompt', async () => {
		const state = await loadDashboardState();
		const prompt = buildWorkflowPromptFromDashboardState(state, workflowUiHelpers);
		if (!prompt) {
			void vscode.window.showInformationMessage('No active workflow prompt is available yet.');
			return;
		}

		await vscode.env.clipboard.writeText(prompt);
		void vscode.window.showInformationMessage('The current workflow prompt has been copied to the clipboard.');
	});

	const openWorkflowStudioCommand = vscode.commands.registerCommand('ai-context-orchestrator.openWorkflowStudio', async () => {
		const state = await loadDashboardState();
		if (!workflowStudioPanel) {
			workflowStudioPanel = vscode.window.createWebviewPanel(
				'aiContextOrchestrator.workflowStudio',
				'AI Workflow Studio',
				vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One,
				{
					enableScripts: true,
					retainContextWhenHidden: true,
					localResourceRoots: [context.extensionUri]
				}
			);
			workflowStudioPanel.onDidDispose(() => {
				workflowStudioPanel = undefined;
			});
		} else {
			workflowStudioPanel.reveal(vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One, false);
		}

		workflowStudioPanel.webview.html = getWorkflowStudioHtml(workflowStudioPanel.webview, state, createNonce(), workflowUiHelpers);
	});

	const refreshWorkflowUiCommand = vscode.commands.registerCommand('ai-context-orchestrator.refreshWorkflowUi', async () => {
		await refreshWorkflowUi();
	});

	const refreshProviderStatusCommand = vscode.commands.registerCommand('ai-context-orchestrator.refreshProviderStatus', async () => {
		await refreshProviderStatuses(context, outputChannel);
		await refreshWorkflowUi();
	});

	const switchClaudeAccountCommand = vscode.commands.registerCommand('ai-context-orchestrator.switchClaudeAccount', async () => {
		const switched = await switchActiveProviderAccount('claude');
		if (!switched) {
			return;
		}

		await refreshProviderStatuses(context, outputChannel);
		await refreshWorkflowUi();
	});

	const manageProviderAccountsCommand = vscode.commands.registerCommand('ai-context-orchestrator.manageProviderAccounts', async (provider?: ProviderTarget) => {
		await manageProviderAccounts(provider);
		await refreshProviderStatuses(context, outputChannel);
		await refreshWorkflowUi();
	});

	const connectProviderAccountCommand = vscode.commands.registerCommand('ai-context-orchestrator.connectProviderAccount', async (provider?: ProviderTarget) => {
		await connectProviderAccount(provider);
		await refreshProviderStatuses(context, outputChannel);
		await refreshWorkflowUi();
	});

	const configureProviderCredentialCommand = vscode.commands.registerCommand('ai-context-orchestrator.configureProviderCredential', async (provider?: ProviderTarget) => {
		await configureProviderCredential(provider);
		await refreshProviderStatuses(context, outputChannel);
		await refreshWorkflowUi();
	});

	const runProviderAuthAssistCommand = vscode.commands.registerCommand('ai-context-orchestrator.runProviderAuthAssist', async (provider?: ProviderTarget) => {
		await runProviderAuthAssist(provider);
		await refreshProviderStatuses(context, outputChannel);
		await refreshWorkflowUi();
	});

	const openProviderAccountPortalCommand = vscode.commands.registerCommand('ai-context-orchestrator.openProviderAccountPortal', async (provider?: ProviderTarget) => {
		await openProviderAccountPortal(provider);
	});

	const switchProviderAccountCommand = vscode.commands.registerCommand('ai-context-orchestrator.switchProviderAccount', async (provider?: ProviderTarget) => {
		const switched = await switchActiveProviderAccount(provider);
		if (!switched) {
			return;
		}

		await refreshProviderStatuses(context, outputChannel);
		await refreshWorkflowUi();
	});

	const setSelectedStagePreparedCommand = vscode.commands.registerCommand('ai-context-orchestrator.setSelectedStagePrepared', async (node?: WorkflowTreeNode) => {
		await updateSelectedWorkflowStageStatus(loadDashboardState, node, 'prepared');
		await refreshWorkflowUi();
	});

	const setSelectedStageInProgressCommand = vscode.commands.registerCommand('ai-context-orchestrator.setSelectedStageInProgress', async (node?: WorkflowTreeNode) => {
		await updateSelectedWorkflowStageStatus(loadDashboardState, node, 'in-progress');
		await refreshWorkflowUi();
	});

	const setSelectedStageCompletedCommand = vscode.commands.registerCommand('ai-context-orchestrator.setSelectedStageCompleted', async (node?: WorkflowTreeNode) => {
		await updateSelectedWorkflowStageStatus(loadDashboardState, node, 'completed');
		await refreshWorkflowUi();
	});

	const sessionWatcher = vscode.workspace.createFileSystemWatcher(`**/${WORKFLOW_SESSION_FILE}`);
	sessionWatcher.onDidCreate(() => refreshDebouncer.enqueue('session-create', refreshWorkflowUi));
	sessionWatcher.onDidChange(() => refreshDebouncer.enqueue('session-change', refreshWorkflowUi));
	sessionWatcher.onDidDelete(() => refreshDebouncer.enqueue('session-delete', refreshWorkflowUi));

	const workflowRelayWatcher = vscode.workspace.createFileSystemWatcher('**/.ai-orchestrator/**');
	workflowRelayWatcher.onDidCreate(() => refreshDebouncer.enqueue('relay-create', refreshWorkflowUi));
	workflowRelayWatcher.onDidChange(() => refreshDebouncer.enqueue('relay-change', refreshWorkflowUi));
	workflowRelayWatcher.onDidDelete(() => refreshDebouncer.enqueue('relay-delete', refreshWorkflowUi));

	const contextFileWatcher = vscode.workspace.createFileSystemWatcher(`**/${CONTEXT_FILE_NAME}`);
	contextFileWatcher.onDidCreate(() => refreshDebouncer.enqueue('context-create', refreshWorkflowUi));
	contextFileWatcher.onDidChange(() => refreshDebouncer.enqueue('context-change', refreshWorkflowUi));
	contextFileWatcher.onDidDelete(() => refreshDebouncer.enqueue('context-delete', refreshWorkflowUi));

	const configuration = getExtensionConfiguration();
	const startupWorkspaceFolder = getImplicitWorkspaceFolder(context);
	if (configuration.autoGenerateOnStartup && startupWorkspaceFolder) {
		void gatherProjectContext(outputChannel, true, buildDefaultWorkflowPlan(configuration), startupWorkspaceFolder)
			.finally(() => refreshWorkflowUi());
	}

	void refreshWorkflowUi();

	context.subscriptions.push(
		initStatusBarItem,
		continueStatusBarItem,
		initCommand,
		continueWorkflowCommand,
		generateContextCommand,
		openWorkflowBriefCommand,
		openLatestWorkflowHandoffCommand,
		openContextFileCommand,
		openWorkflowSessionCommand,
		openWorkflowTreeNodeCommand,
		previewWorkflowPromptCommand,
		copyWorkflowPromptCommand,
		openWorkflowStudioCommand,
		refreshWorkflowUiCommand,
		refreshProviderStatusCommand,
		switchClaudeAccountCommand,
		manageProviderAccountsCommand,
		connectProviderAccountCommand,
		configureProviderCredentialCommand,
		runProviderAuthAssistCommand,
		openProviderAccountPortalCommand,
		switchProviderAccountCommand,
		setSelectedStagePreparedCommand,
		setSelectedStageInProgressCommand,
		setSelectedStageCompletedCommand,
		refreshDebouncer,
		sessionWatcher,
		workflowRelayWatcher,
		contextFileWatcher,
		workflowTreeView,
		outputChannel
	);
}

export function deactivate() {
	return undefined;
}

async function runInitAiFlow(outputChannel: vscode.OutputChannel, workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
	const configuration = getExtensionConfiguration();
	const workflowPlan = await promptForWorkflowPlan(configuration);
	if (!workflowPlan) {
		return;
	}

	const projectContext = await gatherProjectContext(outputChannel, false, workflowPlan, workspaceFolder);
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

async function runContinueWorkflowFlow(outputChannel: vscode.OutputChannel, workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
	const configuration = getExtensionConfiguration();

	const existingSession = await readWorkflowSessionState(workspaceFolder.uri);
	if (!existingSession) {
		vscode.window.showWarningMessage('No workflow session found yet. Start with Init Workflow first.');
		return;
	}

	const workflowPlan = await promptForWorkflowContinuation(configuration, existingSession);
	if (!workflowPlan) {
		return;
	}

	const projectContext = await gatherProjectContext(outputChannel, false, workflowPlan, workspaceFolder);
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
}
