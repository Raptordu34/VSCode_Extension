import { exec } from 'child_process';
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
type ClaudeEffortLevel = 'low' | 'medium' | 'high';
type ProviderStatusAvailability = 'ready' | 'needs-config' | 'warning' | 'error' | 'unavailable';

const WORKFLOW_STATE_DIRECTORY = '.ai-orchestrator';
const WORKFLOW_STAGE_DIRECTORY = '.ai-orchestrator/stages';
const WORKFLOW_SESSION_FILE = '.ai-orchestrator/session.json';
const WORKFLOW_BRIEF_FILE = '.ai-orchestrator/brief.md';
const PROVIDER_STATUS_CACHE_KEY = 'aiContextOrchestrator.providerStatusCache';
const CLAUDE_DEFAULT_MODELS = ['claude-sonnet-4-6', 'claude-opus-4-6'] as const;
const GEMINI_DEFAULT_MODELS = [
	'gemini-2.5-flash',
	'gemini-2.5-pro',
	'gemini-3.1-flash-lite-preview',
	'gemini-3-flash-preview',
	'gemini-3.1-pro-preview'
] as const;

interface MetricDisplay {
	label: string;
	value: string;
	tone?: 'normal' | 'warning' | 'critical';
}

interface ProviderAccountConfiguration {
	id: string;
	provider: ProviderTarget;
	label: string;
	configDir?: string;
	authMode?: string;
	apiKeyEnvVar?: string;
	adminApiKeyEnvVar?: string;
	workspaceId?: string;
	apiKeyId?: string;
	quotaCommand?: string;
	accountHint?: string;
	notes?: string;
}

interface ProviderAccountStatus {
	id: string;
	provider: ProviderTarget;
	label: string;
	configDir?: string;
	authMode?: string;
	accountHint?: string;
	isActive: boolean;
	availability: ProviderStatusAvailability;
	summary: string;
	detail: string;
	metrics: MetricDisplay[];
	lastCheckedAt?: string;
	errorMessage?: string;
}

interface ProviderStatusSnapshot {
	provider: ProviderTarget;
	availability: ProviderStatusAvailability;
	summary: string;
	detail: string;
	metrics: MetricDisplay[];
	lastCheckedAt?: string;
	accounts?: ProviderAccountStatus[];
}

interface ProviderStatusCache {
	updatedAt: string;
	providers: ProviderStatusSnapshot[];
}

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
	providerModel?: string;
	providerAccountId?: string;
	roles: WorkflowRole[];
	refreshMode: ContextRefreshMode;
	costProfile: CostProfile;
	optimizeWithCopilot: boolean;
	generateNativeArtifacts: boolean;
	claudeAccountId?: string;
	claudeEffort?: ClaudeEffortLevel;
	presetDefinition: WorkflowPresetDefinition;
	brief?: WorkflowBrief;
}

interface ContextMetadata {
	generatedAt: string;
	signature: string;
	preset: WorkflowPreset;
	provider: ProviderTarget;
	providerModel?: string;
	providerAccountId?: string;
	claudeAccountId?: string;
	claudeEffort?: ClaudeEffortLevel;
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
	providerModel?: string;
	providerAccountId?: string;
	status: WorkflowStageStatus;
	stageFile: string;
	generatedAt: string;
	briefSummary: string;
	contextFile: string;
	claudeAccountId?: string;
	claudeEffort?: ClaudeEffortLevel;
	artifactFiles: string[];
	upstreamStageFiles: string[];
}

interface WorkflowSessionState {
	workspaceName: string;
	updatedAt: string;
	currentStageIndex: number;
	currentPreset: WorkflowPreset;
	currentProvider: ProviderTarget;
	currentProviderModel?: string;
	currentProviderAccountId?: string;
	currentClaudeAccountId?: string;
	currentClaudeEffort?: ClaudeEffortLevel;
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
	defaultClaudeModel: string;
	defaultGeminiModel: string;
	defaultClaudeEffort: ClaudeEffortLevel;
	claudeAccounts: ProviderAccountConfiguration[];
	activeClaudeAccountId?: string;
	geminiAccounts: ProviderAccountConfiguration[];
	activeGeminiAccountId?: string;
	copilotAccounts: ProviderAccountConfiguration[];
	activeCopilotAccountId?: string;
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

interface WorkflowDashboardState {
	workspaceFolder?: vscode.WorkspaceFolder;
	session?: WorkflowSessionState;
	brief?: WorkflowBrief;
	latestStage?: WorkflowStageRecord;
	selectedStage?: WorkflowStageRecord;
	contextFileExists: boolean;
	nextSuggestedPresets: WorkflowPreset[];
	artifactCount: number;
	configuration?: ExtensionConfiguration;
	providerStatuses: ProviderStatusSnapshot[];
	providerStatusUpdatedAt?: string;
}

interface WorkflowTreeNode {
	id: string;
	label: string;
	description?: string;
	tooltip?: string;
	icon?: vscode.ThemeIcon;
	contextValue?: string;
	relativePath?: string;
	stageIndex?: number;
	collapsibleState?: vscode.TreeItemCollapsibleState;
	command?: vscode.Command;
	children?: WorkflowTreeNode[];
}

const WORKFLOW_TREE_VIEW_ID = 'aiContextOrchestrator.workflowState';
const WORKFLOW_CONTROL_VIEW_ID = 'aiContextOrchestrator.workflowControl';

class WorkflowTreeDataProvider implements vscode.TreeDataProvider<WorkflowTreeNode> {
	private readonly emitter = new vscode.EventEmitter<WorkflowTreeNode | undefined>();
	readonly onDidChangeTreeData = this.emitter.event;

	constructor(private readonly loadState: () => Promise<WorkflowDashboardState>) {}

	refresh(): void {
		this.emitter.fire(undefined);
	}

	getTreeItem(element: WorkflowTreeNode): vscode.TreeItem {
		const item = new vscode.TreeItem(element.label, element.collapsibleState ?? vscode.TreeItemCollapsibleState.None);
		item.id = element.id;
		item.description = element.description;
		item.tooltip = element.tooltip;
		item.iconPath = element.icon;
		item.contextValue = element.contextValue;
		item.command = element.command
			? {
				...element.command,
				arguments: element.command.arguments ?? [element]
			}
			: undefined;
		return item;
	}

	async getChildren(element?: WorkflowTreeNode): Promise<WorkflowTreeNode[]> {
		if (element?.children) {
			return element.children;
		}

		const state = await this.loadState();
		return buildWorkflowTreeNodes(state);
	}
}

class WorkflowControlViewProvider implements vscode.WebviewViewProvider {
	private view?: vscode.WebviewView;

	constructor(private readonly extensionUri: vscode.Uri, private readonly loadState: () => Promise<WorkflowDashboardState>) {}

	refresh(): void {
		if (!this.view) {
			return;
		}

		void this.render(this.view);
	}

	resolveWebviewView(webviewView: vscode.WebviewView): void | Thenable<void> {
		this.view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.extensionUri]
		};

		webviewView.webview.onDidReceiveMessage(async (message: { command?: string; provider?: ProviderTarget }) => {
			switch (message.command) {
				case 'init':
					await vscode.commands.executeCommand('ai-context-orchestrator.initAI');
					return;
				case 'continue':
					await vscode.commands.executeCommand('ai-context-orchestrator.continueWorkflow');
					return;
				case 'refresh':
					this.refresh();
					return;
				case 'refreshProviders':
					await vscode.commands.executeCommand('ai-context-orchestrator.refreshProviderStatus');
					return;
				case 'switchClaudeAccount':
					await vscode.commands.executeCommand('ai-context-orchestrator.switchClaudeAccount');
					return;
				case 'manageProviderAccounts':
					await vscode.commands.executeCommand('ai-context-orchestrator.manageProviderAccounts', message.provider);
					return;
				case 'switchProviderAccount':
					await vscode.commands.executeCommand('ai-context-orchestrator.switchProviderAccount', message.provider);
					return;
				case 'openBrief':
					await vscode.commands.executeCommand('ai-context-orchestrator.openWorkflowBrief');
					return;
				case 'openLatestHandoff':
					await vscode.commands.executeCommand('ai-context-orchestrator.openLatestWorkflowHandoff');
					return;
				case 'openContext':
					await vscode.commands.executeCommand('ai-context-orchestrator.openContextFile');
					return;
				case 'openSession':
					await vscode.commands.executeCommand('ai-context-orchestrator.openWorkflowSession');
					return;
				case 'previewPrompt':
					await vscode.commands.executeCommand('ai-context-orchestrator.previewWorkflowPrompt');
					return;
				case 'copyPrompt':
					await vscode.commands.executeCommand('ai-context-orchestrator.copyWorkflowPrompt');
					return;
				case 'markPrepared':
					await vscode.commands.executeCommand('ai-context-orchestrator.setSelectedStagePrepared');
					return;
				case 'markInProgress':
					await vscode.commands.executeCommand('ai-context-orchestrator.setSelectedStageInProgress');
					return;
				case 'markCompleted':
					await vscode.commands.executeCommand('ai-context-orchestrator.setSelectedStageCompleted');
					return;
			}
		});

		return this.render(webviewView);
	}

	private async render(webviewView: vscode.WebviewView): Promise<void> {
		const state = await this.loadState();
		const nonce = createNonce();
		webviewView.webview.html = getWorkflowControlHtml(webviewView.webview, state, nonce);
	}
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
	let selectedStageIndex: number | undefined;
	const loadDashboardState = async (): Promise<WorkflowDashboardState> => getWorkflowDashboardState(selectedStageIndex, context);
	const workflowTreeDataProvider = new WorkflowTreeDataProvider(loadDashboardState);
	const workflowControlViewProvider = new WorkflowControlViewProvider(context.extensionUri, loadDashboardState);
	const workflowTreeView = vscode.window.createTreeView(WORKFLOW_TREE_VIEW_ID, {
		treeDataProvider: workflowTreeDataProvider,
		showCollapseAll: true
	});
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
		await updateContinueWorkflowButtonVisibility(continueStatusBarItem);
		workflowTreeView.badge = dashboardState.session
			? { value: dashboardState.session.stages.length, tooltip: `${dashboardState.session.stages.length} workflow stage(s)` }
			: undefined;
		workflowTreeView.message = buildWorkflowTreeMessage(dashboardState);
		workflowTreeDataProvider.refresh();
		workflowControlViewProvider.refresh();
	};

	const initCommand = vscode.commands.registerCommand('ai-context-orchestrator.initAI', async () => {
		await runInitAiFlow(outputChannel);
		await refreshWorkflowUi();
	});

	const continueWorkflowCommand = vscode.commands.registerCommand('ai-context-orchestrator.continueWorkflow', async () => {
		await runContinueWorkflowFlow(outputChannel);
		await refreshWorkflowUi();
	});

	const generateContextCommand = vscode.commands.registerCommand('ai-context-orchestrator.generateContext', async () => {
		const configuration = getExtensionConfiguration();
		const workflowPlan = buildDefaultWorkflowPlan(configuration);
		const projectContext = await gatherProjectContext(outputChannel, false, workflowPlan);
		if (!projectContext) {
			return;
		}

		vscode.window.showInformationMessage(buildContextGenerationMessage(projectContext));
		await refreshWorkflowUi();
	});

	const openWorkflowBriefCommand = vscode.commands.registerCommand('ai-context-orchestrator.openWorkflowBrief', async () => {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			return;
		}

		await openWorkspaceRelativeFile(workspaceFolder.uri, WORKFLOW_BRIEF_FILE);
	});

	const openLatestWorkflowHandoffCommand = vscode.commands.registerCommand('ai-context-orchestrator.openLatestWorkflowHandoff', async () => {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
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
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			return;
		}

		await openWorkspaceRelativeFile(workspaceFolder.uri, CONTEXT_FILE_NAME);
	});

	const openWorkflowSessionCommand = vscode.commands.registerCommand('ai-context-orchestrator.openWorkflowSession', async () => {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			return;
		}

		await openWorkspaceRelativeFile(workspaceFolder.uri, WORKFLOW_SESSION_FILE);
	});

	const openWorkflowTreeNodeCommand = vscode.commands.registerCommand('ai-context-orchestrator.openWorkflowTreeNode', async (node?: WorkflowTreeNode) => {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder || !node?.relativePath) {
			return;
		}

		await openWorkspaceRelativeFile(workspaceFolder.uri, node.relativePath);
	});

	const previewWorkflowPromptCommand = vscode.commands.registerCommand('ai-context-orchestrator.previewWorkflowPrompt', async () => {
		const state = await loadDashboardState();
		const prompt = buildWorkflowPromptFromDashboardState(state);
		if (!prompt) {
			void vscode.window.showInformationMessage('No active workflow prompt is available yet.');
			return;
		}

		const document = await vscode.workspace.openTextDocument({
			language: 'markdown',
			content: buildWorkflowPromptPreviewDocument(state, prompt)
		});
		await vscode.window.showTextDocument(document, {
			preview: false,
			viewColumn: vscode.ViewColumn.Beside,
			preserveFocus: true
		});
	});

	const copyWorkflowPromptCommand = vscode.commands.registerCommand('ai-context-orchestrator.copyWorkflowPrompt', async () => {
		const state = await loadDashboardState();
		const prompt = buildWorkflowPromptFromDashboardState(state);
		if (!prompt) {
			void vscode.window.showInformationMessage('No active workflow prompt is available yet.');
			return;
		}

		await vscode.env.clipboard.writeText(prompt);
		void vscode.window.showInformationMessage('The current workflow prompt has been copied to the clipboard.');
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
	sessionWatcher.onDidCreate(() => void refreshWorkflowUi());
	sessionWatcher.onDidChange(() => void refreshWorkflowUi());
	sessionWatcher.onDidDelete(() => void refreshWorkflowUi());

	const workflowRelayWatcher = vscode.workspace.createFileSystemWatcher('**/.ai-orchestrator/**');
	workflowRelayWatcher.onDidCreate(() => void refreshWorkflowUi());
	workflowRelayWatcher.onDidChange(() => void refreshWorkflowUi());
	workflowRelayWatcher.onDidDelete(() => void refreshWorkflowUi());

	const contextFileWatcher = vscode.workspace.createFileSystemWatcher(`**/${CONTEXT_FILE_NAME}`);
	contextFileWatcher.onDidCreate(() => void refreshWorkflowUi());
	contextFileWatcher.onDidChange(() => void refreshWorkflowUi());
	contextFileWatcher.onDidDelete(() => void refreshWorkflowUi());

	const configuration = getExtensionConfiguration();
	if (configuration.autoGenerateOnStartup && vscode.workspace.workspaceFolders?.length) {
		void gatherProjectContext(outputChannel, true, buildDefaultWorkflowPlan(configuration))
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
		refreshWorkflowUiCommand,
		refreshProviderStatusCommand,
		switchClaudeAccountCommand,
		manageProviderAccountsCommand,
		switchProviderAccountCommand,
		setSelectedStagePreparedCommand,
		setSelectedStageInProgressCommand,
		setSelectedStageCompletedCommand,
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

async function updateContinueWorkflowButtonVisibility(statusBarItem: vscode.StatusBarItem): Promise<void> {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
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

async function getWorkflowDashboardState(selectedStageIndex: number | undefined, context: vscode.ExtensionContext): Promise<WorkflowDashboardState> {
	const configuration = getExtensionConfiguration();
	const providerStatusCache = context.globalState.get<ProviderStatusCache>(PROVIDER_STATUS_CACHE_KEY);
	const providerStatuses = mergeProviderStatusCache(configuration, providerStatusCache);
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder) {
		return {
			contextFileExists: false,
			nextSuggestedPresets: [],
			artifactCount: 0,
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
	const selectedStage = session?.stages.find((stage) => stage.index === selectedStageIndex) ?? latestStage;
	const artifactCount = session?.stages.reduce((total, stage) => total + stage.artifactFiles.length, 0) ?? 0;

	return {
		workspaceFolder,
		session,
		brief,
		latestStage,
		selectedStage,
		contextFileExists,
		nextSuggestedPresets: session ? buildSuggestedNextPresets(session.currentPreset) : [],
		artifactCount,
		configuration,
		providerStatuses,
		providerStatusUpdatedAt: providerStatusCache?.updatedAt
	};
}

async function updateSelectedWorkflowStageStatus(
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

function buildWorkflowPromptFromDashboardState(state: WorkflowDashboardState): string | undefined {
	if (!state.session || !state.latestStage) {
		return undefined;
	}

	const presetDefinition = WORKFLOW_PRESETS[state.session.currentPreset];
	const stageWriteInstruction = `Read ${state.latestStage.stageFile} and write your findings or results back into that file before stopping.`;
	return [
		`Use the ${presetDefinition.label} workflow for this project.`,
		`Start by reading ${CONTEXT_FILE_NAME}.`,
		`Read ${WORKFLOW_SESSION_FILE} if it exists.`,
		`Read ${WORKFLOW_BRIEF_FILE} if it exists.`,
		state.session.currentProviderModel ? `Use provider model ${state.session.currentProviderModel}.` : 'Use the provider default model if nothing more specific is configured.',
		state.session.currentProvider === 'claude' && state.session.currentClaudeEffort
			? `Use Claude effort level ${state.session.currentClaudeEffort}.`
			: 'Use the default provider reasoning depth unless the workflow specifies otherwise.',
		`Read upstream handoffs referenced by ${state.latestStage.stageFile} before acting.`,
		state.artifactCount > 0
			? `Use the generated ${getProviderLabel(state.session.currentProvider)} artifacts when they help.`
			: 'Work directly from the context pack and shared workflow files.',
		presetDefinition.launchInstruction,
		stageWriteInstruction
	].join(' ');
}

function buildWorkflowPromptPreviewDocument(state: WorkflowDashboardState, prompt: string): string {
	const session = state.session;
	const latestStage = state.latestStage;
	const stageLabel = session ? WORKFLOW_PRESETS[session.currentPreset].label : 'Unknown';
	const providerLabel = session ? getProviderLabel(session.currentProvider) : 'Unknown';
	return [
		'# Workflow Prompt Preview',
		'',
		`- Workspace: ${state.workspaceFolder?.name ?? 'Unknown'}`,
		`- Stage: ${stageLabel}`,
		`- Provider: ${providerLabel}`,
		`- Model: ${session?.currentProviderModel ?? 'default'}`,
		`- Provider account: ${session?.currentProviderAccountId ?? 'default'}`,
		`- Claude account: ${session?.currentClaudeAccountId ?? 'default'}`,
		`- Claude effort: ${session?.currentClaudeEffort ?? 'default'}`,
		`- Latest handoff: ${latestStage?.stageFile ?? 'none'}`,
		`- Context file ready: ${state.contextFileExists ? 'yes' : 'no'}`,
		`- Generated artifacts: ${state.artifactCount}`,
		'',
		'## Prompt',
		'',
		'```text',
		prompt,
		'```',
		'',
		'## Provider Launch Form',
		'',
		'```text',
		buildProviderLaunchFormPreview(state, prompt),
		'```'
	].join('\n');
}

function buildProviderLaunchFormPreview(state: WorkflowDashboardState, prompt: string): string {
	if (!state.session) {
		return prompt;
	}

	if (state.session.currentProvider === 'claude') {
		const configuration = state.configuration ?? getExtensionConfiguration();
		const account = findProviderAccount(configuration, 'claude', state.session.currentProviderAccountId ?? state.session.currentClaudeAccountId);
		const details = [
			account ? `CLAUDE_CONFIG_DIR=${account.configDir}` : undefined,
			state.session.currentProviderModel ? `ANTHROPIC_MODEL=${state.session.currentProviderModel}` : undefined,
			state.session.currentClaudeEffort ? `CLAUDE_CODE_EFFORT_LEVEL=${state.session.currentClaudeEffort}` : undefined,
			`claude --append-system-prompt-file "${CONTEXT_FILE_NAME}" "${prompt}"`
		].filter((value): value is string => Boolean(value));
		return details.join(' ');
	}

	if (state.session.currentProvider === 'gemini') {
		const configuration = state.configuration ?? getExtensionConfiguration();
		const account = findProviderAccount(configuration, 'gemini', state.session.currentProviderAccountId);
		const prefix = account?.apiKeyEnvVar && process.env[account.apiKeyEnvVar]
			? `GEMINI_API_KEY=${process.env[account.apiKeyEnvVar]} GOOGLE_API_KEY=${process.env[account.apiKeyEnvVar]} `
			: '';
		return state.session.currentProviderModel
			? `${prefix}gemini -m "${state.session.currentProviderModel}" "${prompt}"`
			: `${prefix}gemini "${prompt}"`;
	}

	return prompt;
}

function getWorkflowStageStatusLabel(status: WorkflowStageStatus): string {
	switch (status) {
		case 'completed':
			return 'Completed';
		case 'in-progress':
			return 'In Progress';
		case 'prepared':
		default:
			return 'Prepared';
	}
}

function getWorkflowStageStatusIcon(status: WorkflowStageStatus, isCurrentStage: boolean): vscode.ThemeIcon {
	if (status === 'completed') {
		return new vscode.ThemeIcon('pass-filled');
	}

	if (status === 'in-progress' || isCurrentStage) {
		return new vscode.ThemeIcon('play-circle');
	}

	return new vscode.ThemeIcon('history');
}

function buildWorkflowTreeMessage(state: WorkflowDashboardState): string | undefined {
	if (!state.workspaceFolder) {
		return 'Open a workspace to inspect the orchestrator workflow.';
	}

	if (!state.session) {
		return state.contextFileExists
			? 'Context file ready. Start Init Workflow to create the first stage.'
			: 'No active workflow. Use Init Workflow to prepare the first stage.';
	}

	return `${WORKFLOW_PRESETS[state.session.currentPreset].label} with ${getProviderLabel(state.session.currentProvider)} · ${state.session.stages.length} stage(s)`;
}

function buildDefaultProviderStatuses(configuration: ExtensionConfiguration): ProviderStatusSnapshot[] {
	const claudeAccounts = buildDefaultAccountStatuses('claude', configuration);
	const geminiAccounts = buildDefaultAccountStatuses('gemini', configuration);
	const copilotAccounts = buildDefaultAccountStatuses('copilot', configuration);

	return [
		{
			provider: 'claude',
			availability: claudeAccounts.length > 0 ? 'ready' : 'needs-config',
			summary: claudeAccounts.length > 0 ? `${claudeAccounts.length} account(s) configured` : 'No Claude accounts configured',
			detail: claudeAccounts.length > 0
				? 'Account switching uses CLAUDE_CONFIG_DIR. Quota can come from a custom command or Anthropic Admin API.'
				: 'Add Claude accounts in the UI to enable switching and quota tracking.',
			metrics: claudeAccounts.length > 0
				? [{ label: 'Active Account', value: findProviderAccount(configuration, 'claude', configuration.activeClaudeAccountId)?.label ?? claudeAccounts[0].label }]
				: [{ label: 'Active Account', value: 'none', tone: 'warning' }],
			accounts: claudeAccounts
		},
		{
			provider: 'gemini',
			availability: geminiAccounts.length > 0 ? 'ready' : 'needs-config',
			summary: geminiAccounts.length > 0 ? `${geminiAccounts.length} account(s) configured` : 'No Gemini accounts configured',
			detail: geminiAccounts.length > 0
				? 'Gemini accounts can carry auth mode, API key env references, and an optional quota command.'
				: 'Add Gemini accounts in the UI to keep linked identities and launch context together.',
			metrics: [
				{ label: 'Default Model', value: configuration.defaultGeminiModel },
				{ label: 'Active Account', value: findProviderAccount(configuration, 'gemini', configuration.activeGeminiAccountId)?.label ?? (geminiAccounts[0]?.label ?? 'none'), tone: geminiAccounts.length > 0 ? 'normal' : 'warning' }
			],
			accounts: geminiAccounts
		},
		{
			provider: 'copilot',
			availability: copilotAccounts.length > 0 ? 'warning' : 'needs-config',
			summary: copilotAccounts.length > 0 ? `${copilotAccounts.length} account reference(s) configured` : 'No Copilot accounts configured',
			detail: copilotAccounts.length > 0
				? 'Copilot accounts are tracked in the extension UI, but VS Code does not expose programmable session switching for Copilot auth.'
				: 'Add Copilot account references in the UI if you want explicit workflow ownership or labeling.',
			metrics: [
				{ label: 'Model Family', value: configuration.modelFamily || 'VS Code default' },
				{ label: 'Active Account', value: findProviderAccount(configuration, 'copilot', configuration.activeCopilotAccountId)?.label ?? (copilotAccounts[0]?.label ?? 'none'), tone: copilotAccounts.length > 0 ? 'normal' : 'warning' }
			],
			accounts: copilotAccounts
		}
	];
}

function buildDefaultAccountStatuses(provider: ProviderTarget, configuration: ExtensionConfiguration): ProviderAccountStatus[] {
	const accounts = getProviderAccounts(configuration, provider);
	const activeAccountId = getActiveProviderAccountId(configuration, provider);
	return accounts.map((account, index) => ({
		id: account.id,
		provider,
		label: account.label,
		configDir: account.configDir,
		authMode: account.authMode,
		accountHint: account.accountHint,
		isActive: account.id === activeAccountId || (!activeAccountId && index === 0),
		availability: account.label ? 'needs-config' : 'error',
		summary: buildDefaultAccountSummary(account),
		detail: account.notes ?? buildDefaultAccountDetail(account),
		metrics: buildDefaultAccountMetrics(account)
	}));
}

function buildDefaultAccountSummary(account: ProviderAccountConfiguration): string {
	if (account.provider === 'claude') {
		return account.configDir ? 'Ready to inspect or switch' : 'Missing Claude config directory';
	}

	if (account.provider === 'gemini') {
		return account.apiKeyEnvVar || account.authMode ? 'Linked Gemini account reference' : 'Linked Gemini account without auth metadata';
	}

	return account.accountHint ? 'Tracked Copilot account reference' : 'Tracked Copilot account';
}

function buildDefaultAccountDetail(account: ProviderAccountConfiguration): string {
	if (account.provider === 'claude') {
		return account.configDir
			? 'Use Refresh Provider Status to populate quota and account health.'
			: 'Set a Claude config directory before trying to switch or inspect this account.';
	}

	if (account.provider === 'gemini') {
		return 'Use auth mode, env var references, and optional quota command to document how this Gemini account should be used.';
	}

	return 'Use this account as a workflow ownership reference. Copilot auth switching is not exposed by VS Code APIs.';
}

function buildDefaultAccountMetrics(account: ProviderAccountConfiguration): MetricDisplay[] {
	if (account.provider === 'claude') {
		return [
			{ label: 'Config Dir', value: account.configDir || 'not configured', tone: account.configDir ? 'normal' : 'critical' },
			{ label: 'Quota', value: account.quotaCommand || account.adminApiKeyEnvVar ? 'refresh available' : 'no data source', tone: account.quotaCommand || account.adminApiKeyEnvVar ? 'normal' : 'warning' }
		];
	}

	if (account.provider === 'gemini') {
		return [
			{ label: 'Auth', value: account.authMode || 'not set', tone: account.authMode ? 'normal' : 'warning' },
			{ label: 'API Key Env', value: account.apiKeyEnvVar || 'not set', tone: account.apiKeyEnvVar ? 'normal' : 'warning' },
			{ label: 'Quota', value: account.quotaCommand ? 'refresh available' : 'no data source', tone: account.quotaCommand ? 'normal' : 'warning' }
		];
	}

	return [
		{ label: 'Identity', value: account.accountHint || 'not set', tone: account.accountHint ? 'normal' : 'warning' },
		{ label: 'Notes', value: account.notes || 'none' }
	];
}

function mergeProviderStatusCache(
	configuration: ExtensionConfiguration,
	cache: ProviderStatusCache | undefined
): ProviderStatusSnapshot[] {
	const defaults = buildDefaultProviderStatuses(configuration);
	if (!cache) {
		return defaults;
	}

	return defaults.map((defaultProviderStatus) => {
		const cachedProviderStatus = cache.providers.find((providerStatus) => providerStatus.provider === defaultProviderStatus.provider);
		if (!cachedProviderStatus) {
			return defaultProviderStatus;
		}

		if (defaultProviderStatus.provider !== 'claude') {
			return { ...defaultProviderStatus, ...cachedProviderStatus };
		}

		const cachedAccounts = cachedProviderStatus.accounts ?? [];
		const defaultAccounts = defaultProviderStatus.accounts ?? [];
		return {
			...defaultProviderStatus,
			...cachedProviderStatus,
			accounts: defaultAccounts.map((defaultAccount) => {
				const cachedAccount = cachedAccounts.find((account) => account.id === defaultAccount.id);
				return cachedAccount ? { ...defaultAccount, ...cachedAccount, isActive: defaultAccount.isActive } : defaultAccount;
			})
		};
	});
}

async function refreshProviderStatuses(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel): Promise<void> {
	const configuration = getExtensionConfiguration();
	const providerStatuses = await Promise.all([
		resolveClaudeProviderStatus(configuration, outputChannel),
		resolveGenericProviderStatus('gemini', configuration, outputChannel),
		resolveGenericProviderStatus('copilot', configuration, outputChannel)
	]);
	const cache: ProviderStatusCache = {
		updatedAt: new Date().toISOString(),
		providers: providerStatuses
	};
	await context.globalState.update(PROVIDER_STATUS_CACHE_KEY, cache);
	outputChannel.appendLine(`[providers] Refreshed provider status snapshot at ${cache.updatedAt}`);
	void vscode.window.showInformationMessage('Provider status refreshed.');
}

async function resolveClaudeProviderStatus(
	configuration: ExtensionConfiguration,
	outputChannel: vscode.OutputChannel
): Promise<ProviderStatusSnapshot> {
	if (configuration.claudeAccounts.length === 0) {
		return buildDefaultProviderStatuses(configuration).find((status) => status.provider === 'claude') as ProviderStatusSnapshot;
	}

	const accounts = await Promise.all(configuration.claudeAccounts.map((account) => resolveClaudeAccountStatus(account, configuration, outputChannel)));
	const activeAccount = accounts.find((account) => account.isActive) ?? accounts[0];
	const healthyAccounts = accounts.filter((account) => account.availability === 'ready' || account.availability === 'warning').length;
	return {
		provider: 'claude',
		availability: healthyAccounts > 0 ? 'ready' : 'needs-config',
		summary: `${healthyAccounts}/${accounts.length} Claude account(s) ready`,
		detail: activeAccount
			? `Active account: ${activeAccount.label}. Switch accounts directly from the workflow panel.`
			: 'Configure at least one Claude account to launch Claude with a dedicated config directory.',
		metrics: [
			{ label: 'Active Account', value: activeAccount?.label ?? 'none', tone: activeAccount ? 'normal' : 'warning' },
			{ label: 'Default Model', value: configuration.defaultClaudeModel },
			{ label: 'Default Effort', value: configuration.defaultClaudeEffort }
		],
		lastCheckedAt: new Date().toISOString(),
		accounts
	};
}

async function resolveGenericProviderStatus(
	provider: 'gemini' | 'copilot',
	configuration: ExtensionConfiguration,
	outputChannel: vscode.OutputChannel
): Promise<ProviderStatusSnapshot> {
	const accounts = getProviderAccounts(configuration, provider);
	if (accounts.length === 0) {
		return buildDefaultProviderStatuses(configuration).find((status) => status.provider === provider) as ProviderStatusSnapshot;
	}

	const statuses = await Promise.all(accounts.map((account) => resolveGenericAccountStatus(account, configuration, outputChannel)));
	const activeAccount = statuses.find((account) => account.isActive) ?? statuses[0];
	return {
		provider,
		availability: statuses.some((status) => status.availability === 'ready' || status.availability === 'warning') ? (provider === 'copilot' ? 'warning' : 'ready') : 'needs-config',
		summary: `${statuses.length} ${getProviderLabel(provider)} account(s) tracked`,
		detail: provider === 'gemini'
			? `Active account: ${activeAccount?.label ?? 'none'}. Gemini accounts are stored and can drive env-based launches.`
			: `Active account: ${activeAccount?.label ?? 'none'}. Copilot accounts are tracked in the extension only; auth switching remains manual in VS Code.`,
		metrics: provider === 'gemini'
			? [
				{ label: 'Default Model', value: configuration.defaultGeminiModel },
				{ label: 'Active Account', value: activeAccount?.label ?? 'none', tone: activeAccount ? 'normal' : 'warning' }
			]
			: [
				{ label: 'Model Family', value: configuration.modelFamily || 'VS Code default' },
				{ label: 'Active Account', value: activeAccount?.label ?? 'none', tone: activeAccount ? 'normal' : 'warning' }
			],
		lastCheckedAt: new Date().toISOString(),
		accounts: statuses
	};
}

async function resolveClaudeAccountStatus(
	account: ProviderAccountConfiguration,
	configuration: ExtensionConfiguration,
	outputChannel: vscode.OutputChannel
): Promise<ProviderAccountStatus> {
	const configDirExists = account.configDir ? await fileExists(vscode.Uri.file(account.configDir)) : false;
	const baseStatus: ProviderAccountStatus = {
		id: account.id,
		provider: 'claude',
		label: account.label,
		configDir: account.configDir,
		authMode: account.authMode,
		accountHint: account.accountHint,
		isActive: account.id === configuration.activeClaudeAccountId || (!configuration.activeClaudeAccountId && configuration.claudeAccounts[0]?.id === account.id),
		availability: configDirExists ? 'ready' : 'error',
		summary: configDirExists ? 'Claude config directory reachable' : 'Claude config directory missing',
		detail: account.notes ?? (configDirExists ? 'Ready for account switching.' : 'Update configDir to an existing Claude config directory.'),
		metrics: [{ label: 'Config Dir', value: configDirExists ? 'available' : 'missing', tone: configDirExists ? 'normal' : 'critical' }]
	};

	if (!configDirExists) {
		return baseStatus;
	}

	if (account.quotaCommand) {
		try {
			const customQuota = await runQuotaCommand(account.quotaCommand, account.configDir ?? '');
			return {
				...baseStatus,
				availability: customQuota.availability,
				summary: customQuota.summary,
				detail: customQuota.detail,
				metrics: [...baseStatus.metrics, ...customQuota.metrics],
				lastCheckedAt: new Date().toISOString()
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			outputChannel.appendLine(`[providers] Claude quota command failed for ${account.label}: ${message}`);
			return {
				...baseStatus,
				availability: 'warning',
				summary: 'Account ready, quota command failed',
				detail: message,
				metrics: [...baseStatus.metrics, { label: 'Quota Source', value: 'command error', tone: 'warning' }],
				lastCheckedAt: new Date().toISOString(),
				errorMessage: message
			};
		}
	}

	if (account.adminApiKeyEnvVar && process.env[account.adminApiKeyEnvVar]) {
		return {
			...baseStatus,
			availability: 'warning',
			summary: 'Admin API key detected',
			detail: 'Admin API telemetry is configured, but this extension currently expects either a quota command or future Anthropic analytics parsing for live remaining quota.',
			metrics: [...baseStatus.metrics, { label: 'Quota Source', value: `env:${account.adminApiKeyEnvVar}` }],
			lastCheckedAt: new Date().toISOString()
		};
	}

	return {
		...baseStatus,
		availability: 'warning',
		summary: 'Account ready, quota source missing',
		detail: 'Add quotaCommand for rolling or weekly Claude quota, or add adminApiKeyEnvVar for API usage telemetry.',
		metrics: [...baseStatus.metrics, { label: 'Quota Source', value: 'not configured', tone: 'warning' }],
		lastCheckedAt: new Date().toISOString()
	};
}

async function resolveGenericAccountStatus(
	account: ProviderAccountConfiguration,
	configuration: ExtensionConfiguration,
	outputChannel: vscode.OutputChannel
): Promise<ProviderAccountStatus> {
	const isActive = account.id === getActiveProviderAccountId(configuration, account.provider) || (!getActiveProviderAccountId(configuration, account.provider) && getProviderAccounts(configuration, account.provider)[0]?.id === account.id);
	const envVarValue = account.apiKeyEnvVar ? process.env[account.apiKeyEnvVar] : undefined;
	const baseStatus: ProviderAccountStatus = {
		id: account.id,
		provider: account.provider,
		label: account.label,
		configDir: account.configDir,
		authMode: account.authMode,
		accountHint: account.accountHint,
		isActive,
		availability: account.provider === 'copilot' ? 'warning' : (account.authMode || account.apiKeyEnvVar ? 'ready' : 'warning'),
		summary: buildDefaultAccountSummary(account),
		detail: account.notes ?? buildDefaultAccountDetail(account),
		metrics: buildDefaultAccountMetrics(account)
	};

	if (account.quotaCommand) {
		try {
			const customQuota = await runQuotaCommand(account.quotaCommand, account.configDir ?? '');
			return {
				...baseStatus,
				availability: account.provider === 'copilot' ? 'warning' : customQuota.availability,
				summary: customQuota.summary,
				detail: customQuota.detail,
				metrics: [...baseStatus.metrics, ...customQuota.metrics],
				lastCheckedAt: new Date().toISOString()
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			outputChannel.appendLine(`[providers] ${account.provider} quota command failed for ${account.label}: ${message}`);
			return {
				...baseStatus,
				availability: 'warning',
				summary: 'Account tracked, quota command failed',
				detail: message,
				metrics: [...baseStatus.metrics, { label: 'Quota Source', value: 'command error', tone: 'warning' }],
				lastCheckedAt: new Date().toISOString(),
				errorMessage: message
			};
		}
	}

	if (envVarValue) {
		return {
			...baseStatus,
			metrics: [...baseStatus.metrics, { label: 'Env', value: `env:${account.apiKeyEnvVar}` }],
			lastCheckedAt: new Date().toISOString()
		};
	}

	return {
		...baseStatus,
		lastCheckedAt: new Date().toISOString()
	};
}

async function runQuotaCommand(command: string, configDir: string): Promise<{
	availability: ProviderStatusAvailability;
	summary: string;
	detail: string;
	metrics: MetricDisplay[];
}> {
	const stdout = await execShellCommand(command, {
		...process.env,
		CLAUDE_CONFIG_DIR: configDir
	});
	const payload = JSON.parse(stdout) as {
		summary?: string;
		detail?: string;
		availability?: ProviderStatusAvailability;
		metrics?: Array<{ label?: string; value?: string; tone?: MetricDisplay['tone'] }>;
	};
	const metrics = (payload.metrics ?? [])
		.filter((metric) => metric.label && metric.value)
		.map((metric) => ({
			label: metric.label as string,
			value: metric.value as string,
			tone: metric.tone ?? 'normal'
		}));

	return {
		availability: payload.availability ?? 'ready',
		summary: payload.summary ?? 'Quota refreshed',
		detail: payload.detail ?? 'Quota command returned successfully.',
		metrics
	};
}

function execShellCommand(command: string, env: NodeJS.ProcessEnv): Promise<string> {
	return new Promise((resolve, reject) => {
		exec(command, { env, windowsHide: true, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
			if (error) {
				reject(new Error(stderr.trim() || error.message));
				return;
			}

			resolve(stdout.trim());
		});
	});
}

async function switchActiveProviderAccount(provider?: ProviderTarget): Promise<boolean> {
	const resolvedProvider = provider ?? await promptForProviderTarget('Choose the provider account to activate');
	if (!resolvedProvider) {
		return false;
	}

	const configuration = getExtensionConfiguration();
	const accounts = getProviderAccounts(configuration, resolvedProvider);
	if (accounts.length === 0) {
		void vscode.window.showInformationMessage(`No ${getProviderLabel(resolvedProvider)} accounts are configured yet.`);
		return false;
	}

	const currentAccount = findProviderAccount(configuration, resolvedProvider, getActiveProviderAccountId(configuration, resolvedProvider));
	const selection = await vscode.window.showQuickPick(accounts.map((account) => ({
		label: account.label,
		description: account.id === currentAccount?.id ? 'Active account' : undefined,
		detail: account.configDir || account.accountHint || account.apiKeyEnvVar || account.notes,
		picked: account.id === currentAccount?.id
	})), {
		title: `Switch ${getProviderLabel(resolvedProvider)} Account`,
		placeHolder: `Choose which ${getProviderLabel(resolvedProvider)} account should be active in the orchestrator UI`,
		ignoreFocusOut: true
	});

	if (!selection) {
		return false;
	}

	const nextAccount = accounts.find((account) => account.label === selection.label);
	if (!nextAccount) {
		return false;
	}

	await updateActiveProviderAccountId(resolvedProvider, nextAccount.id);
	void vscode.window.showInformationMessage(`Active ${getProviderLabel(resolvedProvider)} account set to ${nextAccount.label}.`);
	return true;
}

async function manageProviderAccounts(provider?: ProviderTarget): Promise<void> {
	const resolvedProvider = provider ?? await promptForProviderTarget('Choose the provider whose linked accounts you want to manage');
	if (!resolvedProvider) {
		return;
	}

	const configuration = getExtensionConfiguration();
	const accounts = getProviderAccounts(configuration, resolvedProvider);
	const action = await vscode.window.showQuickPick([
		{ label: 'Add Account', detail: `Create a new ${getProviderLabel(resolvedProvider)} account entry in the extension settings.` },
		{ label: 'Edit Account', detail: accounts.length > 0 ? `Edit an existing ${getProviderLabel(resolvedProvider)} account.` : 'No account to edit yet.', alwaysShow: true },
		{ label: 'Remove Account', detail: accounts.length > 0 ? `Remove an existing ${getProviderLabel(resolvedProvider)} account.` : 'No account to remove yet.', alwaysShow: true },
		{ label: 'Set Active Account', detail: accounts.length > 0 ? `Choose which ${getProviderLabel(resolvedProvider)} account should be active.` : 'No account to activate yet.', alwaysShow: true },
		{ label: 'Open Extension Settings', detail: 'Open the raw settings if you prefer direct JSON editing.' }
	], {
		title: `Manage ${getProviderLabel(resolvedProvider)} Accounts`,
		placeHolder: `Choose how to manage linked ${getProviderLabel(resolvedProvider)} accounts`,
		ignoreFocusOut: true
	});

	if (!action) {
		return;
	}

	if (action.label === 'Open Extension Settings') {
		await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:ai-context-orchestrator aiContextOrchestrator');
		return;
	}

	if (action.label === 'Set Active Account') {
		await switchActiveProviderAccount(resolvedProvider);
		return;
	}

	if ((action.label === 'Edit Account' || action.label === 'Remove Account') && accounts.length === 0) {
		void vscode.window.showInformationMessage(`No ${getProviderLabel(resolvedProvider)} accounts are configured yet.`);
		return;
	}

	if (action.label === 'Add Account') {
		const newAccount = await promptForProviderAccountDetails(resolvedProvider);
		if (!newAccount) {
			return;
		}

		await writeProviderAccounts(resolvedProvider, [...accounts, newAccount]);
		if (!getActiveProviderAccountId(getExtensionConfiguration(), resolvedProvider)) {
			await updateActiveProviderAccountId(resolvedProvider, newAccount.id);
		}
		void vscode.window.showInformationMessage(`${getProviderLabel(resolvedProvider)} account ${newAccount.label} added.`);
		return;
	}

	const targetAccount = await promptForExistingProviderAccount(resolvedProvider, accounts, action.label);
	if (!targetAccount) {
		return;
	}

	if (action.label === 'Remove Account') {
		const nextAccounts = accounts.filter((account) => account.id !== targetAccount.id);
		await writeProviderAccounts(resolvedProvider, nextAccounts);
		const activeId = getActiveProviderAccountId(getExtensionConfiguration(), resolvedProvider);
		if (activeId === targetAccount.id) {
			await updateActiveProviderAccountId(resolvedProvider, nextAccounts[0]?.id);
		}
		void vscode.window.showInformationMessage(`${getProviderLabel(resolvedProvider)} account ${targetAccount.label} removed.`);
		return;
	}

	const editedAccount = await promptForProviderAccountDetails(resolvedProvider, targetAccount);
	if (!editedAccount) {
		return;
	}

	await writeProviderAccounts(resolvedProvider, accounts.map((account) => account.id === targetAccount.id ? editedAccount : account));
	void vscode.window.showInformationMessage(`${getProviderLabel(resolvedProvider)} account ${editedAccount.label} updated.`);
}

async function promptForExistingProviderAccount(
	provider: ProviderTarget,
	accounts: ProviderAccountConfiguration[],
	actionLabel: string
): Promise<ProviderAccountConfiguration | undefined> {
	const selection = await vscode.window.showQuickPick(accounts.map((account) => ({
		label: account.label,
		description: account.accountHint,
		detail: account.configDir || account.apiKeyEnvVar || account.notes
	})), {
		title: `${actionLabel} ${getProviderLabel(provider)} Account`,
		placeHolder: `Choose the ${getProviderLabel(provider)} account to ${actionLabel.toLowerCase()}`,
		ignoreFocusOut: true
	});

	return accounts.find((account) => account.label === selection?.label);
}

async function promptForProviderAccountDetails(
	provider: ProviderTarget,
	existing?: ProviderAccountConfiguration
): Promise<ProviderAccountConfiguration | undefined> {
	const label = await vscode.window.showInputBox({
		title: `${existing ? 'Edit' : 'Add'} ${getProviderLabel(provider)} Account`,
		prompt: 'Account label shown in the UI',
		value: existing?.label,
		ignoreFocusOut: true,
		validateInput: (value) => value.trim().length === 0 ? 'Label is required.' : undefined
	});
	if (!label) {
		return undefined;
	}

	const accountHint = await vscode.window.showInputBox({
		title: `${getProviderLabel(provider)} Account Identity`,
		prompt: provider === 'copilot' ? 'Optional email or tenant hint for this Copilot account' : 'Optional email, org, or identity hint for this account',
		value: existing?.accountHint,
		ignoreFocusOut: true
	});
	if (accountHint === undefined) {
		return undefined;
	}

	const authMode = provider === 'copilot'
		? existing?.authMode
		: await vscode.window.showInputBox({
			title: `${getProviderLabel(provider)} Auth Mode`,
			prompt: provider === 'claude'
				? 'Optional auth mode, for example claudeai, console, api-key, vertex, or bedrock'
				: 'Optional auth mode, for example google-login, api-key, vertex, or service-account',
			value: existing?.authMode,
			ignoreFocusOut: true
		});
	if (authMode === undefined) {
		return undefined;
	}

	const configDir = provider === 'claude'
		? await vscode.window.showInputBox({
			title: 'Claude Config Directory',
			prompt: 'Absolute CLAUDE_CONFIG_DIR for this Claude account',
			value: existing?.configDir,
			ignoreFocusOut: true,
			validateInput: (value) => value.trim().length === 0 ? 'configDir is required for Claude accounts.' : undefined
		})
		: await vscode.window.showInputBox({
			title: `${getProviderLabel(provider)} Config Directory`,
			prompt: 'Optional local config directory or profile path reference for this account',
			value: existing?.configDir,
			ignoreFocusOut: true
		});
	if (configDir === undefined || (provider === 'claude' && configDir.trim().length === 0)) {
		return undefined;
	}

	const apiKeyEnvVar = provider === 'copilot'
		? existing?.apiKeyEnvVar
		: await vscode.window.showInputBox({
			title: `${getProviderLabel(provider)} API Key Env Var`,
			prompt: provider === 'gemini' ? 'Optional env var name containing the Gemini API key for this account' : 'Optional env var name containing the API key for this account',
			value: existing?.apiKeyEnvVar,
			ignoreFocusOut: true
		});
	if (apiKeyEnvVar === undefined) {
		return undefined;
	}

	const quotaCommand = await vscode.window.showInputBox({
		title: `${getProviderLabel(provider)} Quota Command`,
		prompt: 'Optional shell command that prints JSON quota status for this account',
		value: existing?.quotaCommand,
		ignoreFocusOut: true
	});
	if (quotaCommand === undefined) {
		return undefined;
	}

	const notes = await vscode.window.showInputBox({
		title: `${getProviderLabel(provider)} Notes`,
		prompt: 'Optional note shown in the provider account UI',
		value: existing?.notes,
		ignoreFocusOut: true
	});
	if (notes === undefined) {
		return undefined;
	}

	return {
		id: existing?.id ?? `${provider}-account-${Date.now()}`,
		provider,
		label: label.trim(),
		configDir: configDir.trim() || undefined,
		authMode: authMode?.trim() || undefined,
		apiKeyEnvVar: apiKeyEnvVar?.trim() || undefined,
		adminApiKeyEnvVar: existing?.adminApiKeyEnvVar,
		workspaceId: existing?.workspaceId,
		apiKeyId: existing?.apiKeyId,
		quotaCommand: quotaCommand.trim() || undefined,
		accountHint: accountHint.trim() || undefined,
		notes: notes.trim() || undefined
	};
}

async function promptForProviderTarget(placeHolder: string): Promise<ProviderTarget | undefined> {
	const selection = await vscode.window.showQuickPick<WorkflowQuickPickItem>([
		{ label: 'Claude', provider: 'claude', detail: 'Manage Claude Code accounts and config directories.' },
		{ label: 'Gemini', provider: 'gemini', detail: 'Manage Gemini CLI or API-backed account references.' },
		{ label: 'Copilot', provider: 'copilot', detail: 'Manage Copilot account references tracked by the extension.' }
	], {
		title: 'Provider Accounts',
		placeHolder,
		ignoreFocusOut: true
	});

	return selection?.provider;
}

function getProviderAccounts(configuration: ExtensionConfiguration, provider: ProviderTarget): ProviderAccountConfiguration[] {
	switch (provider) {
		case 'claude':
			return configuration.claudeAccounts;
		case 'gemini':
			return configuration.geminiAccounts;
		case 'copilot':
			return configuration.copilotAccounts;
	}
}

function getActiveProviderAccountId(configuration: ExtensionConfiguration, provider: ProviderTarget): string | undefined {
	switch (provider) {
		case 'claude':
			return configuration.activeClaudeAccountId;
		case 'gemini':
			return configuration.activeGeminiAccountId;
		case 'copilot':
			return configuration.activeCopilotAccountId;
	}
}

async function updateActiveProviderAccountId(provider: ProviderTarget, accountId: string | undefined): Promise<void> {
	const configuration = vscode.workspace.getConfiguration('aiContextOrchestrator');
	switch (provider) {
		case 'claude':
			await configuration.update('activeClaudeAccountId', accountId ?? '', vscode.ConfigurationTarget.Global);
			return;
		case 'gemini':
			await configuration.update('activeGeminiAccountId', accountId ?? '', vscode.ConfigurationTarget.Global);
			return;
		case 'copilot':
			await configuration.update('activeCopilotAccountId', accountId ?? '', vscode.ConfigurationTarget.Global);
			return;
	}
}

async function writeProviderAccounts(provider: ProviderTarget, accounts: ProviderAccountConfiguration[]): Promise<void> {
	const configuration = vscode.workspace.getConfiguration('aiContextOrchestrator');
	const serializedAccounts = accounts.map((account) => ({
		id: account.id,
		label: account.label,
		configDir: account.configDir,
		authMode: account.authMode,
		apiKeyEnvVar: account.apiKeyEnvVar,
		adminApiKeyEnvVar: account.adminApiKeyEnvVar,
		workspaceId: account.workspaceId,
		apiKeyId: account.apiKeyId,
		quotaCommand: account.quotaCommand,
		accountHint: account.accountHint,
		notes: account.notes
	}));

	switch (provider) {
		case 'claude':
			await configuration.update('claudeAccounts', serializedAccounts, vscode.ConfigurationTarget.Global);
			return;
		case 'gemini':
			await configuration.update('geminiAccounts', serializedAccounts, vscode.ConfigurationTarget.Global);
			return;
		case 'copilot':
			await configuration.update('copilotAccounts', serializedAccounts, vscode.ConfigurationTarget.Global);
			return;
	}
}

function buildFileTreeNode(id: string, label: string, relativePath: string, icon: string, description?: string, tooltip?: string): WorkflowTreeNode {
	return {
		id,
		label,
		description,
		tooltip: tooltip ?? relativePath,
		icon: new vscode.ThemeIcon(icon),
		contextValue: 'workflow-file',
		relativePath,
		command: {
			title: 'Open Workflow File',
			command: 'ai-context-orchestrator.openWorkflowTreeNode'
		}
	};
}

function buildWorkflowTreeNodes(state: WorkflowDashboardState): WorkflowTreeNode[] {
	if (!state.workspaceFolder) {
		return [{
			id: 'workflow.no-workspace',
			label: 'Open a workspace',
			description: 'Workflow data appears here once a folder is open.',
			icon: new vscode.ThemeIcon('folder-opened'),
			contextValue: 'workflow-empty'
		}];
	}

	const overviewChildren: WorkflowTreeNode[] = [{
		id: 'workflow.context-file',
		label: 'Context File',
		description: state.contextFileExists ? 'Ready' : 'Missing',
		tooltip: state.contextFileExists ? 'Open the generated context pack.' : 'Generate a context pack to create .ai-context.md.',
		icon: new vscode.ThemeIcon(state.contextFileExists ? 'file-code' : 'circle-slash'),
		contextValue: state.contextFileExists ? 'workflow-file' : 'workflow-missing',
		relativePath: state.contextFileExists ? CONTEXT_FILE_NAME : undefined,
		command: state.contextFileExists ? {
			title: 'Open Context File',
			command: 'ai-context-orchestrator.openWorkflowTreeNode'
		} : undefined
	}];

	if (state.brief) {
		overviewChildren.push({
			id: 'workflow.brief-file',
			label: 'Workflow Brief',
			description: state.brief.taskType,
			tooltip: state.brief.goal,
			icon: new vscode.ThemeIcon('note'),
			contextValue: 'workflow-file',
			relativePath: WORKFLOW_BRIEF_FILE,
			command: {
				title: 'Open Workflow Brief',
				command: 'ai-context-orchestrator.openWorkflowTreeNode'
			}
		});
	}

	if (state.session) {
		overviewChildren.push({
			id: 'workflow.session-file',
			label: 'Workflow Session',
			description: `Stage ${state.session.currentStageIndex}`,
			tooltip: `Updated ${new Date(state.session.updatedAt).toLocaleString()}`,
			icon: new vscode.ThemeIcon('json'),
			contextValue: 'workflow-file',
			relativePath: WORKFLOW_SESSION_FILE,
			command: {
				title: 'Open Workflow Session',
				command: 'ai-context-orchestrator.openWorkflowTreeNode'
			}
		});
	}

	const nodes: WorkflowTreeNode[] = [{
		id: 'workflow.overview',
		label: 'Overview',
		description: state.workspaceFolder.name,
		icon: new vscode.ThemeIcon('dashboard'),
		contextValue: 'workflow-overview',
		collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
		children: overviewChildren
	}];

	if (!state.session) {
		nodes.push({
			id: 'workflow.get-started',
			label: 'Get Started',
			description: state.contextFileExists ? 'Create the first workflow stage.' : 'Generate context and start a workflow.',
			tooltip: 'Run Init Workflow to choose a preset, provider, refresh mode, and artifact strategy.',
			icon: new vscode.ThemeIcon('play-circle'),
			contextValue: 'workflow-empty',
			command: {
				title: 'Init Workflow',
				command: 'ai-context-orchestrator.initAI'
			}
		});
		return nodes;
	}

	const workspaceUri = state.workspaceFolder.uri;

	nodes.push({
		id: 'workflow.session',
		label: `${WORKFLOW_PRESETS[state.session.currentPreset].label} in progress`,
		description: `${getProviderLabel(state.session.currentProvider)} · Stage ${state.session.currentStageIndex}`,
		tooltip: `Last updated ${new Date(state.session.updatedAt).toLocaleString()}`,
		icon: new vscode.ThemeIcon('run-all'),
		contextValue: 'workflow-session',
		collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
		children: state.session.stages.map((stage) => {
			const stageId = `workflow.stage.${stage.index}`;
			const isCurrentStage = stage.index === state.session?.currentStageIndex;
			const stageChildren: WorkflowTreeNode[] = [
				buildFileTreeNode(`${stageId}.handoff`, 'Stage Handoff', stage.stageFile, 'output', `${getWorkflowStageStatusLabel(stage.status)} · ${getProviderLabel(stage.provider)}`, stage.briefSummary),
				buildFileTreeNode(`${stageId}.context`, 'Context Snapshot', stage.contextFile, 'file-code', CONTEXT_FILE_NAME)
			];

			for (const artifactPath of stage.artifactFiles) {
				stageChildren.push(buildFileTreeNode(`${stageId}.artifact.${artifactPath}`, artifactPath.split('/').at(-1) ?? artifactPath, artifactPath, 'tools', 'Native artifact'));
			}

			return {
				id: stageId,
				label: `Stage ${String(stage.index).padStart(2, '0')} ${WORKFLOW_PRESETS[stage.preset].label}`,
				description: `${getProviderLabel(stage.provider)} · ${getWorkflowStageStatusLabel(stage.status)}`,
				tooltip: stage.briefSummary,
				icon: getWorkflowStageStatusIcon(stage.status, isCurrentStage),
				contextValue: isCurrentStage ? 'workflow-stage-current' : 'workflow-stage',
				relativePath: stage.stageFile,
				stageIndex: stage.index,
				collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
				command: {
					title: 'Open Workflow Handoff',
					command: 'ai-context-orchestrator.openWorkflowTreeNode'
				},
				children: stageChildren
			};
		})
	});

	if (state.latestStage) {
		nodes.push({
			id: 'workflow.latest-stage',
			label: 'Latest Handoff',
			description: state.latestStage.stageFile,
			tooltip: state.latestStage.briefSummary,
			icon: new vscode.ThemeIcon('output'),
			contextValue: 'workflow-file',
			relativePath: state.latestStage.stageFile,
			command: {
				title: 'Open Latest Workflow Handoff',
				command: 'ai-context-orchestrator.openWorkflowTreeNode'
			}
		});
	}

	if (state.nextSuggestedPresets.length > 0) {
		nodes.push({
			id: 'workflow.next-steps',
			label: 'Suggested Next Steps',
			description: 'Recommended transition order',
			icon: new vscode.ThemeIcon('sparkle'),
			collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
			children: state.nextSuggestedPresets.slice(0, 3).map((preset) => ({
				id: `workflow.next.${preset}`,
				label: WORKFLOW_PRESETS[preset].label,
				description: WORKFLOW_PRESETS[preset].description,
				tooltip: WORKFLOW_PRESETS[preset].detail,
				icon: new vscode.ThemeIcon('arrow-right'),
				contextValue: 'workflow-next-step',
				command: {
					title: 'Continue Workflow',
					command: 'ai-context-orchestrator.continueWorkflow'
				}
			}))
		});
	}

	return nodes;
}

function getWorkflowControlHtml(webview: vscode.Webview, state: WorkflowDashboardState, nonce: string): string {
	const recommendedPreset = state.nextSuggestedPresets[0];
	const selectedStage = state.selectedStage;
	const currentStageLabel = state.session
		? `${WORKFLOW_PRESETS[state.session.currentPreset].label} with ${getProviderLabel(state.session.currentProvider)}`
		: 'No active workflow';
	const briefGoal = state.brief?.goal ?? 'No brief captured yet.';
	const latestHandoff = state.latestStage?.stageFile ?? 'No handoff generated yet.';
	const updatedAt = state.session ? new Date(state.session.updatedAt).toLocaleString() : 'Not started';
	const stageCount = state.session?.stages.length ?? 0;
	const artifactCount = state.artifactCount;
	const suggestions = state.nextSuggestedPresets.length > 0
		? state.nextSuggestedPresets.slice(0, 3).map((preset) => WORKFLOW_PRESETS[preset].label).join(' · ')
		: 'Plan · Build · Review';
	const workspaceName = state.workspaceFolder?.name ?? 'No workspace';
	const primaryActionTitle = state.session
		? `Continue toward ${recommendedPreset ? WORKFLOW_PRESETS[recommendedPreset].label : 'the next stage'}`
		: 'Start the first workflow';
	const providerStatusTimestamp = state.providerStatusUpdatedAt ? new Date(state.providerStatusUpdatedAt).toLocaleString() : 'Not refreshed yet';
	const providerCards = state.providerStatuses.map((providerStatus) => {
		const accountRows = providerStatus.accounts?.map((account) => `
			<div class="stat">
				<strong>${escapeHtml(account.label)}${account.isActive ? ' · active' : ''}</strong>
				<span>${escapeHtml(account.summary)}</span>
				<span>${escapeHtml(account.detail)}</span>
				<span>${escapeHtml(account.metrics.map((metric) => `${metric.label}: ${metric.value}`).join(' · ') || 'No metrics')}</span>
			</div>`).join('') ?? '';
		return `
			<section class="card">
				<h2>${escapeHtml(getProviderLabel(providerStatus.provider))}</h2>
				<p class="lead">${escapeHtml(providerStatus.summary)}</p>
				<p class="small">${escapeHtml(providerStatus.detail)}</p>
				<div class="grid" style="margin-top: 12px;">
					${providerStatus.metrics.map((metric) => `
						<div class="stat">
							<strong>${escapeHtml(metric.value)}</strong>
							<span>${escapeHtml(metric.label)}</span>
						</div>`).join('')}
				</div>
				${accountRows ? `<div class="grid" style="margin-top: 12px;">${accountRows}</div>` : ''}
			</section>`;
	}).join('');
	const completionRatio = state.session && stageCount > 0
		? `${state.session.stages.filter((stage) => stage.status === 'completed').length}/${stageCount}`
		: '0/0';
	const stageTimeline = state.session
		? state.session.stages.slice(-4).reverse().map((stage) => `
			<li class="timeline-item">
				<div class="timeline-marker ${stage.index === state.session?.currentStageIndex ? 'current' : ''} ${stage.status === 'completed' ? 'completed' : ''}"></div>
				<div>
					<strong>${escapeHtml(`Stage ${String(stage.index).padStart(2, '0')} ${WORKFLOW_PRESETS[stage.preset].label}`)}</strong>
					<span>${escapeHtml(`${getProviderLabel(stage.provider)} · ${getWorkflowStageStatusLabel(stage.status)}`)}</span>
				</div>
			</li>`).join('')
		: '<li class="timeline-item empty"><div><strong>No stages yet</strong><span>Run Init Workflow to create the first handoff.</span></div></li>';

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Workflow Control</title>
<style>
	:root {
		color-scheme: light dark;
		--bg: var(--vscode-editor-background);
		--panel: var(--vscode-sideBar-background);
		--border: var(--vscode-panel-border);
		--text: var(--vscode-foreground);
		--muted: var(--vscode-descriptionForeground);
		--accent: var(--vscode-button-background);
		--accent-text: var(--vscode-button-foreground);
		--accent-hover: var(--vscode-button-hoverBackground);
		--success: var(--vscode-testing-iconPassed);
		--info: var(--vscode-focusBorder);
	}
	body {
		padding: 14px;
		margin: 0;
		background: radial-gradient(circle at top right, color-mix(in srgb, var(--accent) 18%, transparent), transparent 38%), var(--bg);
		color: var(--text);
		font-family: var(--vscode-font-family);
	}
	.card {
		background: color-mix(in srgb, var(--panel) 82%, transparent);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 14px;
		margin-bottom: 12px;
	}
	h1, h2, p {
		margin: 0;
	}
	h1 {
		font-size: 16px;
		font-weight: 700;
	}
	h2 {
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted);
		margin-bottom: 8px;
	}
	.lead {
		margin-top: 8px;
		color: var(--muted);
		line-height: 1.45;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}
	.stat {
		padding: 10px;
		border-radius: 10px;
		background: color-mix(in srgb, var(--panel) 88%, transparent);
		border: 1px solid var(--border);
	}
	.stat strong {
		display: block;
		font-size: 13px;
		margin-bottom: 4px;
	}
	.stat span {
		color: var(--muted);
		font-size: 12px;
	}
	.hero {
		padding: 16px;
		background: linear-gradient(145deg, color-mix(in srgb, var(--accent) 20%, transparent), color-mix(in srgb, var(--panel) 88%, transparent));
	}
	.kicker {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 5px 9px;
		border: 1px solid var(--border);
		border-radius: 999px;
		font-size: 11px;
		color: var(--muted);
		margin-bottom: 10px;
	}
	.actions {
		display: grid;
		gap: 8px;
	}
	button {
		width: 100%;
		border: 0;
		border-radius: 10px;
		padding: 10px 12px;
		background: var(--accent);
		color: var(--accent-text);
		cursor: pointer;
		font: inherit;
		text-align: left;
	}
	button.secondary {
		background: color-mix(in srgb, var(--panel) 72%, transparent);
		color: var(--text);
		border: 1px solid var(--border);
	}
	button:hover {
		background: var(--accent-hover);
	}
	button.secondary:hover {
		background: color-mix(in srgb, var(--panel) 58%, transparent);
	}
	.list {
		color: var(--muted);
		line-height: 1.5;
		font-size: 12px;
	}
	.small {
		font-size: 12px;
		color: var(--muted);
		line-height: 1.45;
	}
	.timeline {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 10px;
	}
	.timeline-item {
		display: grid;
		grid-template-columns: 10px 1fr;
		gap: 10px;
		align-items: start;
	}
	.timeline-item strong {
		display: block;
		font-size: 12px;
	}
	.timeline-item span {
		display: block;
		font-size: 12px;
		color: var(--muted);
		margin-top: 2px;
	}
	.timeline-marker {
		width: 10px;
		height: 10px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--muted) 55%, transparent);
		margin-top: 4px;
	}
	.timeline-marker.current {
		background: var(--success);
		box-shadow: 0 0 0 4px color-mix(in srgb, var(--success) 20%, transparent);
	}
	.timeline-marker.completed {
		background: color-mix(in srgb, var(--success) 75%, white);
	}
	.shortcuts {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}
	.linkButton {
		appearance: none;
		background: transparent;
		border: 1px dashed var(--border);
		border-radius: 10px;
		padding: 10px;
		color: var(--text);
		text-align: left;
	}
	.linkButton span {
		display: block;
		font-size: 11px;
		color: var(--muted);
		margin-top: 3px;
	}
	body.vscode-reduce-motion .timeline-marker.current {
		box-shadow: none;
	}
	code {
		font-family: var(--vscode-editor-font-family);
	}
	@media (max-width: 360px) {
		.grid {
			grid-template-columns: 1fr;
		}
		.shortcuts {
			grid-template-columns: 1fr;
		}
	}
</style>
</head>
<body>
	<section class="card hero">
		<div class="kicker">${escapeHtml(state.session ? 'Active workflow' : 'Guided setup')}</div>
		<h1>${escapeHtml(workspaceName)}</h1>
		<p class="lead">${escapeHtml(primaryActionTitle)}. This view keeps the current state, the likely next move, and the key files one click away.</p>
		<div class="actions" style="margin-top: 12px;">
			<button type="button" data-command="${state.session ? 'continue' : 'init'}">${escapeHtml(primaryActionTitle)}</button>
		</div>
	</section>
	<section class="card">
		<h2>Current State</h2>
		<div class="grid">
			<div class="stat">
				<strong>${escapeHtml(currentStageLabel)}</strong>
				<span>${state.session ? `${stageCount} stage(s) recorded` : 'Start with Init Workflow'}</span>
			</div>
			<div class="stat">
				<strong>${escapeHtml(state.contextFileExists ? 'Context ready' : 'Context missing')}</strong>
				<span>${escapeHtml(latestHandoff)}</span>
			</div>
			<div class="stat">
				<strong>${escapeHtml(updatedAt)}</strong>
				<span>Last session update</span>
			</div>
			<div class="stat">
				<strong>${artifactCount}</strong>
				<span>native artifact file(s) across all stages</span>
			</div>
			<div class="stat">
				<strong>${escapeHtml(completionRatio)}</strong>
				<span>completed stage(s)</span>
			</div>
		</div>
	</section>
	<section class="card">
		<h2>Providers</h2>
		<p class="lead">Claude account switching and quota status live here. Gemini and Copilot currently expose model state, with Gemini quota left for a later monitoring integration.</p>
		<p class="small">Last provider refresh: ${escapeHtml(providerStatusTimestamp)}</p>
		<div class="actions" style="margin-top: 12px;">
			<button type="button" class="secondary" data-command="refreshProviders">Refresh Provider Status</button>
			<button type="button" class="secondary" data-command="switchClaudeAccount">Switch Claude Account</button>
		</div>
	</section>
	${providerCards}
	<section class="card">
		<h2>Next Move</h2>
		<p class="lead">${escapeHtml(recommendedPreset ? `${WORKFLOW_PRESETS[recommendedPreset].label}: ${WORKFLOW_PRESETS[recommendedPreset].description}` : 'Use Continue Workflow to choose the next stage.')}</p>
		<p class="small">Suggested flow: ${escapeHtml(suggestions)}</p>
	</section>
	<section class="card">
		<h2>Selected Stage</h2>
		<p class="lead">${escapeHtml(selectedStage ? `${WORKFLOW_PRESETS[selectedStage.preset].label} with ${getProviderLabel(selectedStage.provider)}` : 'Select a stage in the tree to inspect it here.')}</p>
		<p class="small">${escapeHtml(selectedStage ? selectedStage.briefSummary : 'The latest stage is shown by default until you select another one.')}</p>
		<div class="grid" style="margin-top: 12px;">
			<div class="stat">
				<strong>${escapeHtml(selectedStage ? getWorkflowStageStatusLabel(selectedStage.status) : 'No selection')}</strong>
				<span>Status</span>
			</div>
			<div class="stat">
				<strong>${escapeHtml(selectedStage ? selectedStage.stageFile : 'No handoff')}</strong>
				<span>Handoff file</span>
			</div>
			<div class="stat">
				<strong>${selectedStage ? selectedStage.artifactFiles.length : 0}</strong>
				<span>artifact file(s)</span>
			</div>
			<div class="stat">
				<strong>${selectedStage ? selectedStage.upstreamStageFiles.length : 0}</strong>
				<span>upstream handoff(s)</span>
			</div>
		</div>
		<div class="actions" style="margin-top: 12px;">
			<button type="button" class="secondary" data-command="markPrepared" ${selectedStage ? '' : 'disabled'}>Mark Selected Stage Prepared</button>
			<button type="button" class="secondary" data-command="markInProgress" ${selectedStage ? '' : 'disabled'}>Mark Selected Stage In Progress</button>
			<button type="button" class="secondary" data-command="markCompleted" ${selectedStage ? '' : 'disabled'}>Mark Selected Stage Completed</button>
		</div>
	</section>
	<section class="card">
		<h2>Brief</h2>
		<p class="lead">${escapeHtml(briefGoal)}</p>
	</section>
	<section class="card">
		<h2>Recent Stages</h2>
		<ul class="timeline">${stageTimeline}</ul>
	</section>
	<section class="card">
		<h2>Quick Access</h2>
		<div class="shortcuts">
			<button type="button" class="linkButton" data-command="openContext" ${state.contextFileExists ? '' : 'disabled'}>Context Pack<span>${escapeHtml(CONTEXT_FILE_NAME)}</span></button>
			<button type="button" class="linkButton" data-command="openBrief" ${state.brief ? '' : 'disabled'}>Current Brief<span>${escapeHtml(state.brief ? state.brief.taskType : 'No brief yet')}</span></button>
			<button type="button" class="linkButton" data-command="openLatestHandoff" ${state.latestStage ? '' : 'disabled'}>Latest Handoff<span>${escapeHtml(latestHandoff)}</span></button>
			<button type="button" class="linkButton" data-command="openSession" ${state.session ? '' : 'disabled'}>Session State<span>${escapeHtml(WORKFLOW_SESSION_FILE)}</span></button>
			<button type="button" class="linkButton" data-command="previewPrompt" ${state.session ? '' : 'disabled'}>Prompt Preview<span>Open the current launch instruction</span></button>
			<button type="button" class="linkButton" data-command="copyPrompt" ${state.session ? '' : 'disabled'}>Copy Prompt<span>Copy the current launch instruction</span></button>
		</div>
	</section>
	<section class="card">
		<h2>Actions</h2>
		<div class="actions">
			<button type="button" data-command="init">Init Workflow</button>
			<button type="button" data-command="continue" ${state.session ? '' : 'disabled'}>Continue Workflow</button>
			<button type="button" class="secondary" data-command="previewPrompt" ${state.session ? '' : 'disabled'}>Preview Current Prompt</button>
			<button type="button" class="secondary" data-command="copyPrompt" ${state.session ? '' : 'disabled'}>Copy Current Prompt</button>
			<button type="button" class="secondary" data-command="openBrief" ${state.brief ? '' : 'disabled'}>Open Brief</button>
			<button type="button" class="secondary" data-command="openLatestHandoff" ${state.latestStage ? '' : 'disabled'}>Open Latest Handoff</button>
			<button type="button" class="secondary" data-command="openSession" ${state.session ? '' : 'disabled'}>Open Session File</button>
			<button type="button" class="secondary" data-command="openContext" ${state.contextFileExists ? '' : 'disabled'}>Open Context File</button>
			<button type="button" class="secondary" data-command="refresh">Refresh View</button>
		</div>
	</section>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		for (const button of document.querySelectorAll('button[data-command]')) {
			button.addEventListener('click', () => {
				if (button.disabled) {
					return;
				}
				vscode.postMessage({ command: button.dataset.command });
			});
		}
	</script>
</body>
</html>`;
}

async function openWorkspaceRelativeFile(workspaceUri: vscode.Uri, relativePath: string): Promise<void> {
	const fileUri = buildWorkspaceUri(workspaceUri, relativePath);
	if (!fileUri || !(await fileExists(fileUri))) {
		void vscode.window.showInformationMessage(`File not available yet: ${relativePath}`);
		return;
	}

	await vscode.window.showTextDocument(fileUri);
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(uri);
		return true;
	} catch {
		return false;
	}
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function createNonce(): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let nonce = '';
	for (let index = 0; index < 32; index += 1) {
		nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
	}
	return nonce;
}

function buildDefaultWorkflowPlan(configuration: ExtensionConfiguration): WorkflowExecutionPlan {
	const presetDefinition = WORKFLOW_PRESETS[configuration.defaultPreset];
	const defaultProviderAccount = findProviderAccount(
		configuration,
		configuration.defaultProvider,
		getActiveProviderAccountId(configuration, configuration.defaultProvider)
	)?.id;
	const defaultClaudeAccount = findProviderAccount(configuration, 'claude', configuration.activeClaudeAccountId)?.id ?? configuration.claudeAccounts[0]?.id;
	return {
		preset: presetDefinition.preset,
		provider: configuration.defaultProvider,
		providerModel: getDefaultProviderModel(configuration.defaultProvider, configuration),
		providerAccountId: defaultProviderAccount,
		roles: [...presetDefinition.roles],
		refreshMode: configuration.contextRefreshMode,
		costProfile: configuration.costProfile,
		optimizeWithCopilot: configuration.optimizeWithCopilot,
		generateNativeArtifacts: configuration.generateNativeArtifacts,
		claudeAccountId: configuration.defaultProvider === 'claude' ? defaultClaudeAccount : undefined,
		claudeEffort: configuration.defaultProvider === 'claude' ? configuration.defaultClaudeEffort : undefined,
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

	const providerModel = await promptForProviderModel(providerSelection.provider, configuration);
	if (providerModel === undefined) {
		return undefined;
	}

	const providerAccountId = await promptForProviderAccount(providerSelection.provider, configuration);
	if (getProviderAccounts(configuration, providerSelection.provider).length > 0 && !providerAccountId) {
		return undefined;
	}

	let claudeAccountId: string | undefined;
	let claudeEffort: ClaudeEffortLevel | undefined;
	if (providerSelection.provider === 'claude') {
		claudeAccountId = providerAccountId;
		claudeEffort = await promptForClaudeEffort(configuration.defaultClaudeEffort);
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

	const providerModel = await promptForProviderModel(providerSelection.provider, configuration);
	if (providerModel === undefined) {
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

	let claudeAccountId: string | undefined;
	let claudeEffort: ClaudeEffortLevel | undefined;
	if (providerSelection.provider === 'claude') {
		claudeAccountId = providerAccountId;
		claudeEffort = await promptForClaudeEffort(session.currentClaudeEffort ?? configuration.defaultClaudeEffort);
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

async function promptForProviderModel(provider: ProviderTarget, configuration: ExtensionConfiguration): Promise<string | undefined> {
	const options = getProviderModelOptions(provider, configuration);
	const selection = await vscode.window.showQuickPick(
		options.map((option) => ({
			label: option.label,
			description: option.description,
			detail: option.detail,
			picked: option.value === getDefaultProviderModel(provider, configuration)
		})),
		{
			title: 'Provider Model',
			placeHolder: `Choose the ${getProviderLabel(provider)} model for this workflow`,
			ignoreFocusOut: true
		}
	);

	if (!selection) {
		return undefined;
	}

	const matchedOption = options.find((option) => option.label === selection.label);
	return matchedOption?.value;
}

async function promptForClaudeAccount(configuration: ExtensionConfiguration, preferredId?: string): Promise<string | undefined> {
	if (configuration.claudeAccounts.length === 0) {
		return undefined;
	}

	const items = configuration.claudeAccounts.map((account) => ({
		label: account.label,
		description: account.id === (preferredId ?? configuration.activeClaudeAccountId) ? 'Active account' : undefined,
		detail: account.configDir,
		picked: account.id === (preferredId ?? configuration.activeClaudeAccountId)
	}));
	const selection = await vscode.window.showQuickPick(items, {
		title: 'Claude Account',
		placeHolder: 'Choose which Claude account/config should own this workflow',
		ignoreFocusOut: true
	});

	return configuration.claudeAccounts.find((account) => account.label === selection?.label)?.id;
}

async function promptForProviderAccount(
	provider: ProviderTarget,
	configuration: ExtensionConfiguration,
	preferredId?: string
): Promise<string | undefined> {
	if (provider === 'claude') {
		return promptForClaudeAccount(configuration, preferredId);
	}

	const accounts = getProviderAccounts(configuration, provider);
	if (accounts.length === 0) {
		return undefined;
	}

	const selection = await vscode.window.showQuickPick(accounts.map((account) => ({
		label: account.label,
		description: account.id === (preferredId ?? getActiveProviderAccountId(configuration, provider)) ? 'Active account' : undefined,
		detail: account.accountHint || account.apiKeyEnvVar || account.notes,
		picked: account.id === (preferredId ?? getActiveProviderAccountId(configuration, provider))
	})), {
		title: `${getProviderLabel(provider)} Account`,
		placeHolder: `Choose which ${getProviderLabel(provider)} account should own this workflow`,
		ignoreFocusOut: true
	});

	return accounts.find((account) => account.label === selection?.label)?.id;
}

async function promptForClaudeEffort(defaultEffort: ClaudeEffortLevel): Promise<ClaudeEffortLevel | undefined> {
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
			return `Best when ${presetDefinition.label.toLowerCase()} needs strong delegation, specialized subagents, deeper parallel investigation, or explicit account switching.`;
		case 'gemini':
			return `Best when ${presetDefinition.label.toLowerCase()} should stay terminal-first with explicit model control, fast delegation, and scriptable automation.`;
		case 'copilot':
			return `Best when ${presetDefinition.label.toLowerCase()} should stay inside VS Code with custom agents, handoffs, and chat review tools.`;
	}
	return '';
}

function getDefaultProviderModel(provider: ProviderTarget, configuration: ExtensionConfiguration): string | undefined {
	switch (provider) {
		case 'claude':
			return configuration.defaultClaudeModel;
		case 'gemini':
			return configuration.defaultGeminiModel;
		case 'copilot':
			return configuration.modelFamily || undefined;
	}
}

function getProviderModelOptions(
	provider: ProviderTarget,
	configuration: ExtensionConfiguration
): Array<{ label: string; value: string | undefined; description?: string; detail: string }> {
	if (provider === 'claude') {
		return CLAUDE_DEFAULT_MODELS.map((model) => ({
			label: model,
			value: model,
			description: model === configuration.defaultClaudeModel ? 'Default Claude model' : undefined,
			detail: model.includes('opus') ? 'Highest reasoning quality, typically the most expensive.' : 'Fastest Claude default for implementation and debugging.'
		}));
	}

	if (provider === 'gemini') {
		return GEMINI_DEFAULT_MODELS.map((model) => ({
			label: model,
			value: model,
			description: model === configuration.defaultGeminiModel ? 'Default Gemini model' : undefined,
			detail: model.includes('flash') ? 'Lower latency and cost, good for tight loops.' : 'Higher reasoning depth for planning and review.'
		}));
	}

	return [{
		label: configuration.modelFamily || 'VS Code default',
		value: configuration.modelFamily || undefined,
		description: configuration.modelFamily ? 'Configured Copilot family' : 'Uses the default chat model exposed by VS Code',
		detail: configuration.modelFamily
			? `Launch preview and setup summaries will use ${configuration.modelFamily}.`
			: 'Leave model selection to the current Copilot Chat configuration.'
	}];
}

function findProviderAccount(
	configuration: ExtensionConfiguration,
	provider: ProviderTarget,
	accountId: string | undefined
): ProviderAccountConfiguration | undefined {
	const accounts = getProviderAccounts(configuration, provider);
	if (accounts.length === 0) {
		return undefined;
	}

	return accounts.find((account) => account.id === accountId) ?? accounts[0];
}

function findClaudeAccount(configuration: ExtensionConfiguration, accountId: string | undefined): ProviderAccountConfiguration | undefined {
	return findProviderAccount(configuration, 'claude', accountId);
}

function formatProviderModel(provider: ProviderTarget, model: string | undefined): string {
	if (!model) {
		return provider === 'copilot' ? 'VS Code default' : 'provider default';
	}

	return model;
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
			workflowPlan.providerModel ?? 'default',
			workflowPlan.providerAccountId ?? 'default',
			workflowPlan.claudeAccountId ?? 'default',
			workflowPlan.claudeEffort ?? 'default',
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
			providerModel: workflowPlan.providerModel,
			providerAccountId: workflowPlan.providerAccountId,
			claudeAccountId: workflowPlan.claudeAccountId,
			claudeEffort: workflowPlan.claudeEffort,
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
			(parsedMetadata.providerModel ?? 'default') !== (workflowPlan.providerModel ?? 'default') ||
			(parsedMetadata.providerAccountId ?? 'default') !== (workflowPlan.providerAccountId ?? 'default') ||
			parsedMetadata.costProfile !== workflowPlan.costProfile
		)) {
			return undefined;
		}

		const metadata: ContextMetadata = {
			...parsedMetadata,
			reused: true,
			providerModel: workflowPlan.providerModel,
			providerAccountId: workflowPlan.providerAccountId,
			claudeAccountId: workflowPlan.claudeAccountId,
			claudeEffort: workflowPlan.claudeEffort,
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
		`Provider model: ${formatProviderModel(workflowPlan.provider, workflowPlan.providerModel)}`,
		`Provider account: ${workflowPlan.providerAccountId ?? 'default'}`,
		workflowPlan.provider === 'claude' ? `Claude account: ${workflowPlan.claudeAccountId ?? 'default'}` : undefined,
		workflowPlan.provider === 'claude' ? `Claude effort: ${workflowPlan.claudeEffort ?? 'default'}` : undefined,
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
	].filter((value): value is string => Boolean(value)).join('\n');
}

function buildContextFileContent(metadata: ContextMetadata, optimizedContent: string, optimization: OptimizationResult): string {
	return [
		'# Context Generation Metadata',
		'',
		`Generated at: ${metadata.generatedAt}`,
		`Context signature: ${metadata.signature}`,
		`Workflow preset: ${metadata.preset}`,
		`Workflow provider: ${metadata.provider}`,
		`Workflow provider model: ${metadata.providerModel ?? 'default'}`,
		`Workflow provider account: ${metadata.providerAccountId ?? 'default'}`,
		`Claude account: ${metadata.claudeAccountId ?? 'default'}`,
		`Claude effort: ${metadata.claudeEffort ?? 'default'}`,
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
	const providerModel = values.get('Workflow provider model') || undefined;
	const providerAccountId = values.get('Workflow provider account') || undefined;
	const claudeAccountId = values.get('Claude account') || undefined;
	const claudeEffort = values.get('Claude effort') as ClaudeEffortLevel | undefined;
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
		providerModel,
		providerAccountId,
		claudeAccountId,
		claudeEffort,
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

async function updateWorkflowStageStatus(
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
		providerModel: workflowPlan.providerModel,
		providerAccountId: workflowPlan.providerAccountId,
		status: 'prepared',
		stageFile,
		generatedAt: new Date().toISOString(),
		briefSummary: brief?.goal ?? (workflowPlan.preset === 'explore' ? 'Explore the repository and identify reusable patterns.' : 'No brief provided.'),
		contextFile: relativizeToWorkspace(workspaceFolder.uri, contextFile),
		claudeAccountId: workflowPlan.claudeAccountId,
		claudeEffort: workflowPlan.claudeEffort,
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
		currentProviderModel: workflowPlan.providerModel,
		currentProviderAccountId: workflowPlan.providerAccountId,
		currentClaudeAccountId: workflowPlan.claudeAccountId,
		currentClaudeEffort: workflowPlan.claudeEffort,
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
		`- Provider model: ${formatProviderModel(workflowPlan.provider, stage.providerModel)}`,
		`- Provider account: ${stage.providerAccountId ?? 'default'}`,
		workflowPlan.provider === 'claude' ? `- Claude account: ${stage.claudeAccountId ?? 'default'}` : undefined,
		workflowPlan.provider === 'claude' ? `- Claude effort: ${stage.claudeEffort ?? 'default'}` : undefined,
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
	].filter((value): value is string => Boolean(value)).join('\n');
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

function normalizeProviderAccounts(
	rawAccounts: Array<Partial<ProviderAccountConfiguration>>,
	provider: ProviderTarget
): ProviderAccountConfiguration[] {
	return rawAccounts
		.map((account, index): ProviderAccountConfiguration | undefined => {
			const label = account.label?.trim();
			const configDir = account.configDir?.trim();
			if (!label) {
				return undefined;
			}
			if (provider === 'claude' && !configDir) {
				return undefined;
			}

			const id = account.id?.trim() || `${provider}-account-${index + 1}`;
			return {
				id,
				provider,
				label,
				configDir: configDir || undefined,
				authMode: account.authMode?.trim() || undefined,
				apiKeyEnvVar: account.apiKeyEnvVar?.trim() || undefined,
				adminApiKeyEnvVar: account.adminApiKeyEnvVar?.trim() || undefined,
				workspaceId: account.workspaceId?.trim() || undefined,
				apiKeyId: account.apiKeyId?.trim() || undefined,
				quotaCommand: account.quotaCommand?.trim() || undefined,
				accountHint: account.accountHint?.trim() || undefined,
				notes: account.notes?.trim() || undefined
			};
		})
		.filter((account): account is ProviderAccountConfiguration => Boolean(account));
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
	const defaultClaudeModel = configuration.get<string>('defaultClaudeModel', CLAUDE_DEFAULT_MODELS[0]).trim() || CLAUDE_DEFAULT_MODELS[0];
	const defaultGeminiModel = configuration.get<string>('defaultGeminiModel', GEMINI_DEFAULT_MODELS[0]).trim() || GEMINI_DEFAULT_MODELS[0];
	const defaultClaudeEffort = configuration.get<ClaudeEffortLevel>('defaultClaudeEffort', 'medium');
	const rawClaudeAccounts = configuration.get<Array<Partial<ProviderAccountConfiguration>>>('claudeAccounts', []);
	const rawGeminiAccounts = configuration.get<Array<Partial<ProviderAccountConfiguration>>>('geminiAccounts', []);
	const rawCopilotAccounts = configuration.get<Array<Partial<ProviderAccountConfiguration>>>('copilotAccounts', []);
	const activeClaudeAccountId = configuration.get<string>('activeClaudeAccountId', '').trim() || undefined;
	const activeGeminiAccountId = configuration.get<string>('activeGeminiAccountId', '').trim() || undefined;
	const activeCopilotAccountId = configuration.get<string>('activeCopilotAccountId', '').trim() || undefined;
	const autoGenerateOnStartup = configuration.get<boolean>('autoGenerateOnStartup', false);
	const defaultPreset = configuration.get<WorkflowPreset>('defaultPreset', 'build');
	const defaultProvider = configuration.get<ProviderTarget>('defaultProvider', 'copilot');
	const contextRefreshMode = configuration.get<ContextRefreshMode>('contextRefreshMode', 'smart-refresh');
	const costProfile = configuration.get<CostProfile>('costProfile', 'balanced');
	const generateNativeArtifacts = configuration.get<boolean>('generateNativeArtifacts', true);
	const enabledProviders = configuration.get<ProviderTarget[]>('enabledProviders', ['claude', 'gemini', 'copilot']);
	const claudeAccounts = normalizeProviderAccounts(rawClaudeAccounts, 'claude');
	const geminiAccounts = normalizeProviderAccounts(rawGeminiAccounts, 'gemini');
	const copilotAccounts = normalizeProviderAccounts(rawCopilotAccounts, 'copilot');

	return {
		treeDepth,
		readmePreviewLines,
		contextFilePreviewLines,
		extraContextFiles: extraContextFiles.filter((entry) => entry.trim().length > 0),
		showIgnoredDirectories,
		maxEntriesPerDirectory,
		optimizeWithCopilot,
		modelFamily,
		defaultClaudeModel,
		defaultGeminiModel,
		defaultClaudeEffort,
		claudeAccounts,
		activeClaudeAccountId,
		geminiAccounts,
		activeGeminiAccountId,
		copilotAccounts,
		activeCopilotAccountId,
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
		`Model: ${formatProviderModel(projectContext.workflowPlan.provider, projectContext.workflowPlan.providerModel)}`,
		projectContext.workflowPlan.provider === 'claude' ? `Claude account: ${projectContext.workflowPlan.claudeAccountId ?? 'default'}` : undefined,
		projectContext.workflowPlan.provider === 'claude' ? `Claude effort: ${projectContext.workflowPlan.claudeEffort ?? 'default'}` : undefined,
		`Preset id: ${projectContext.workflowPlan.preset}`,
		`Roles: ${formatWorkflowRoles(projectContext.workflowPlan.roles)}`,
		`Refresh: ${projectContext.workflowPlan.refreshMode}`,
		`Cost: ${projectContext.workflowPlan.costProfile}`,
		projectContext.reused ? 'Context reused' : 'Context regenerated'
	].filter((value): value is string => Boolean(value));

	if (projectContext.artifactPlan) {
		parts.push(`Artifacts: ${projectContext.artifactPlan.files.length}`);
	}

	return parts.join(' | ');
}

function buildProviderLaunchPrompt(projectContext: ProjectContext): string {
	const sharedInstruction = buildSharedWorkflowInstruction(projectContext);
	switch (projectContext.workflowPlan.provider) {
		case 'claude':
			return buildClaudeLaunchCommand(projectContext, sharedInstruction);
		case 'gemini':
			return buildGeminiLaunchCommand(projectContext, sharedInstruction);
		case 'copilot':
			return sharedInstruction;
	}
}

function buildSharedWorkflowInstruction(projectContext: ProjectContext): string {
	const stageFile = projectContext.currentStage?.stageFile;
	const stageWriteInstruction = stageFile
		? `Read ${stageFile} and write your findings or results back into that file before stopping.`
		: 'Write your findings into the shared workflow stage file before stopping.';

	return [
		`Use the ${projectContext.workflowPlan.presetDefinition.label} workflow for this project.`,
		`Start by reading ${CONTEXT_FILE_NAME}.`,
		projectContext.workflowPlan.providerAccountId ? `Use the configured ${getProviderLabel(projectContext.workflowPlan.provider)} account ${projectContext.workflowPlan.providerAccountId}.` : `Use the active ${getProviderLabel(projectContext.workflowPlan.provider)} account for this workflow.`,
		`Read ${WORKFLOW_SESSION_FILE} if it exists.`,
		`Read ${WORKFLOW_BRIEF_FILE} if it exists.`,
		projectContext.workflowPlan.providerModel
			? `Use provider model ${projectContext.workflowPlan.providerModel}.`
			: 'Use the provider default model.',
		projectContext.workflowPlan.provider === 'claude' && projectContext.workflowPlan.claudeEffort
			? `Use Claude effort level ${projectContext.workflowPlan.claudeEffort}.`
			: 'Use the default reasoning effort for the selected provider.',
		stageFile ? `Read upstream handoffs referenced by ${stageFile} before acting.` : 'Read any upstream stage handoffs before acting.',
		projectContext.artifactPlan
			? `Use the generated ${getProviderLabel(projectContext.workflowPlan.provider)} artifacts when they help.`
			: 'Work directly from the context pack and shared workflow files.',
		projectContext.workflowPlan.presetDefinition.launchInstruction,
		stageWriteInstruction
	].join(' ');
}

function buildClaudeLaunchCommand(projectContext: ProjectContext, instruction: string): string {
	const parts = ['claude'];
	if (projectContext.workflowPlan.providerModel) {
		parts.push(`--model "${projectContext.workflowPlan.providerModel}"`);
	}
	parts.push(`--append-system-prompt-file "${CONTEXT_FILE_NAME}"`);
	parts.push(`"${instruction}"`);
	return parts.join(' ');
}

function buildGeminiLaunchCommand(projectContext: ProjectContext, instruction: string): string {
	const parts = ['gemini'];
	if (projectContext.workflowPlan.providerModel) {
		parts.push(`-m "${projectContext.workflowPlan.providerModel}"`);
	}
	parts.push(`"${instruction}"`);
	return parts.join(' ');
}

function launchClaude(projectContext: ProjectContext): void {
	const configuration = getExtensionConfiguration();
	const claudeAccount = findClaudeAccount(configuration, projectContext.workflowPlan.claudeAccountId);
	const terminal = vscode.window.createTerminal({
		name: claudeAccount ? `Claude Code (${claudeAccount.label})` : 'Claude Code',
		cwd: projectContext.workspaceFolder.uri.fsPath,
		env: {
			...(claudeAccount ? { CLAUDE_CONFIG_DIR: claudeAccount.configDir } : {}),
			...(projectContext.workflowPlan.providerModel ? { ANTHROPIC_MODEL: projectContext.workflowPlan.providerModel } : {}),
			...(projectContext.workflowPlan.claudeEffort ? { CLAUDE_CODE_EFFORT_LEVEL: projectContext.workflowPlan.claudeEffort } : {})
		}
	});

	terminal.show(true);
	terminal.sendText(buildClaudeLaunchCommand(projectContext, buildSharedWorkflowInstruction(projectContext)), true);
	void vscode.window.showInformationMessage(`Claude Code launched for the ${projectContext.workflowPlan.preset} workflow${claudeAccount ? ` with ${claudeAccount.label}` : ''}.`);
}

function launchGemini(projectContext: ProjectContext): void {
	const configuration = getExtensionConfiguration();
	const geminiAccount = findProviderAccount(configuration, 'gemini', projectContext.workflowPlan.providerAccountId);
	const apiKeyValue = geminiAccount?.apiKeyEnvVar ? process.env[geminiAccount.apiKeyEnvVar] : undefined;
	const terminal = vscode.window.createTerminal({
		name: geminiAccount ? `Gemini CLI (${geminiAccount.label})` : 'Gemini CLI',
		cwd: projectContext.workspaceFolder.uri.fsPath,
		env: {
			...(apiKeyValue ? { GEMINI_API_KEY: apiKeyValue, GOOGLE_API_KEY: apiKeyValue } : {})
		}
	});

	terminal.show(true);
	terminal.sendText(buildGeminiLaunchCommand(projectContext, buildSharedWorkflowInstruction(projectContext)), true);
	void vscode.window.showInformationMessage(`Gemini CLI launched for the ${projectContext.workflowPlan.preset} workflow${geminiAccount ? ` with ${geminiAccount.label}` : ''}.`);
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