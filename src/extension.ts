import * as vscode from 'vscode';
import {
	CONTEXT_FILE_NAME,
	WORKFLOW_CONTROL_VIEW_ID,
	WORKFLOW_SESSION_FILE,
	WORKFLOW_TREE_VIEW_ID
} from './features/workflow/constants.js';
import type { WorkflowDashboardState } from './features/workflow/types.js';
import {
	WorkflowControlViewProvider,
	WorkflowTreeDataProvider,
	buildWorkflowTreeMessage,
	getWorkflowStudioHtml,
	type WorkflowUiHelpers
} from './features/workflow/ui.js';
import { createNonce, escapeHtml } from "./utils/index.js";
import { getExtensionConfiguration } from "./core/configuration.js";
import { getImplicitWorkspaceFolder } from './core/workspaceContext.js';
import { UiRefreshDebouncer } from './core/uiRefreshDebouncer.js';
import { getProviderLabel, findProviderAccount } from "./features/providers/providerService.js";
import { gatherProjectContext } from "./features/context/contextBuilder.js";
import { updateContinueWorkflowButtonVisibility, getWorkflowDashboardState, buildDefaultWorkflowPlan } from "./features/workflow/workflowService.js";
import { Logger } from './core/logger.js';
import { EventBus } from './core/eventBus.js';
import { registerAllCommands } from './commands/index.js';

export let extensionContextRef: vscode.ExtensionContext | undefined;

export function activate(context: vscode.ExtensionContext) {
	extensionContextRef = context;
	
	Logger.initialize('AI Context Orchestrator');
	
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

	const openWorkflowStudio = async () => {
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
	};

	registerAllCommands(context, loadDashboardState, workflowUiHelpers, openWorkflowStudio);

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
		void gatherProjectContext(true, buildDefaultWorkflowPlan(configuration), startupWorkspaceFolder)
			.finally(() => refreshWorkflowUi());
	}

	EventBus.onDidChange((event) => {
		if (event === 'refresh') {
			refreshWorkflowUi();
		}
	});

	void refreshWorkflowUi();

	context.subscriptions.push(
		initStatusBarItem,
		continueStatusBarItem,
		refreshDebouncer,
		sessionWatcher,
		workflowRelayWatcher,
		contextFileWatcher,
		workflowTreeView,
		Logger.getChannel()
	);
}

export function deactivate() {
	return undefined;
}
