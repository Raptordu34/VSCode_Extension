import * as vscode from 'vscode';
import { EventBus } from '../core/eventBus.js';
import { Logger } from '../core/logger.js';
import { resolveWorkspaceFolder } from '../core/workspaceContext.js';
import { getExtensionConfiguration } from '../core/configuration.js';
import { getWorkflowDashboardState, buildDefaultWorkflowPlan, openWorkspaceRelativeFile, promptForWorkflowPlan, promptForWorkflowContinuation, updateSelectedWorkflowStageStatus, buildWorkflowSummaryDocument } from '../features/workflow/workflowService.js';
import { gatherProjectContext, readWorkflowSessionState, buildContextGenerationMessage } from '../features/context/contextBuilder.js';
import { launchClaude, launchGemini } from '../features/aiAgents/agentLauncher.js';
import { buildSharedWorkflowInstruction } from '../features/aiAgents/promptBuilder.js';
import { refreshProviderStatuses, switchActiveProviderAccount, manageProviderAccounts, connectProviderAccount, configureProviderCredential, runProviderAuthAssist, openProviderAccountPortal } from '../features/providers/providerService.js';
import { WORKFLOW_BRIEF_FILE, WORKFLOW_SESSION_FILE, CONTEXT_FILE_NAME } from '../features/workflow/constants.js';
import { buildWorkflowPromptFromDashboardState, buildWorkflowPromptPreviewDocument, type WorkflowUiHelpers } from '../features/workflow/ui.js';
import { WorkflowTreeNode, WorkflowDashboardState, ProjectContext, WorkflowQuickPickItem, ProviderTarget } from '../features/workflow/types.js';
import { buildWorkspaceUri } from '../core/workspace.js';

export function registerAllCommands(
	context: vscode.ExtensionContext,
	loadDashboardState: () => Promise<WorkflowDashboardState>,
	workflowUiHelpers: WorkflowUiHelpers,
	openWorkflowStudio: () => void
) {
	const resolveCommandWorkspaceFolder = async (placeHolder: string): Promise<vscode.WorkspaceFolder | undefined> => {
		return resolveWorkspaceFolder(context, {
			placeHolder,
			showWarning: true
		});
	};

	context.subscriptions.push(
		vscode.commands.registerCommand('ai-context-orchestrator.initAI', async () => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder to initialize');
			if (!workspaceFolder) {return;}
			await runInitAiFlow(workspaceFolder);
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.continueWorkflow', async () => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder whose workflow you want to continue');
			if (!workspaceFolder) {return;}
			await runContinueWorkflowFlow(workspaceFolder);
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.generateContext', async () => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder whose context should be generated');
			if (!workspaceFolder) {return;}
			const configuration = getExtensionConfiguration();
			const workflowPlan = buildDefaultWorkflowPlan(configuration);
			const projectContext = await gatherProjectContext(false, workflowPlan, workspaceFolder);
			if (!projectContext) {return;}
			vscode.window.showInformationMessage(buildContextGenerationMessage(projectContext));
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.openWorkflowBrief', async () => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder whose brief should be opened');
			if (!workspaceFolder) {return;}
			await openWorkspaceRelativeFile(workspaceFolder.uri, WORKFLOW_BRIEF_FILE);
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.openLatestWorkflowHandoff', async () => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder whose latest handoff should be opened');
			if (!workspaceFolder) {return;}
			const session = await readWorkflowSessionState(workspaceFolder.uri);
			const latestStage = session?.stages.at(-1);
			if (!latestStage) {
				void vscode.window.showInformationMessage('No workflow handoff is available yet.');
				return;
			}
			await openWorkspaceRelativeFile(workspaceFolder.uri, latestStage.stageFile);
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.openContextFile', async () => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder whose context file should be opened');
			if (!workspaceFolder) {return;}
			await openWorkspaceRelativeFile(workspaceFolder.uri, CONTEXT_FILE_NAME);
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.openWorkflowSession', async () => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder whose session should be opened');
			if (!workspaceFolder) {return;}
			await openWorkspaceRelativeFile(workspaceFolder.uri, WORKFLOW_SESSION_FILE);
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.openWorkflowTreeNode', async (node?: WorkflowTreeNode) => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder whose workflow file should be opened');
			if (!workspaceFolder || !node?.relativePath) {return;}
			await openWorkspaceRelativeFile(workspaceFolder.uri, node.relativePath);
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.previewWorkflowPrompt', async () => {
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
			await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.Beside, preserveFocus: true });
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.copyWorkflowPrompt', async () => {
			const state = await loadDashboardState();
			const prompt = buildWorkflowPromptFromDashboardState(state, workflowUiHelpers);
			if (!prompt) {
				void vscode.window.showInformationMessage('No active workflow prompt is available yet.');
				return;
			}
			await vscode.env.clipboard.writeText(prompt);
			void vscode.window.showInformationMessage('The current workflow prompt has been copied to the clipboard.');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.openWorkflowStudio', async () => {
			openWorkflowStudio();
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.refreshWorkflowUi', async () => {
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.refreshProviderStatus', async () => {
			await refreshProviderStatuses(context, Logger.getChannel());
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.switchClaudeAccount', async () => {
			const switched = await switchActiveProviderAccount('claude');
			if (!switched) {return;}
			await refreshProviderStatuses(context, Logger.getChannel());
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.manageProviderAccounts', async (provider?: ProviderTarget) => {
			await manageProviderAccounts(provider);
			await refreshProviderStatuses(context, Logger.getChannel());
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.connectProviderAccount', async (provider?: ProviderTarget) => {
			await connectProviderAccount(provider);
			await refreshProviderStatuses(context, Logger.getChannel());
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.configureProviderCredential', async (provider?: ProviderTarget) => {
			await configureProviderCredential(provider);
			await refreshProviderStatuses(context, Logger.getChannel());
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.runProviderAuthAssist', async (provider?: ProviderTarget) => {
			await runProviderAuthAssist(provider);
			await refreshProviderStatuses(context, Logger.getChannel());
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.openProviderAccountPortal', async (provider?: ProviderTarget) => {
			await openProviderAccountPortal(provider);
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.switchProviderAccount', async (provider?: ProviderTarget) => {
			const switched = await switchActiveProviderAccount(provider);
			if (!switched) {return;}
			await refreshProviderStatuses(context, Logger.getChannel());
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.setSelectedStagePrepared', async (node?: WorkflowTreeNode) => {
			await updateSelectedWorkflowStageStatus(loadDashboardState, node, 'prepared');
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.setSelectedStageInProgress', async (node?: WorkflowTreeNode) => {
			await updateSelectedWorkflowStageStatus(loadDashboardState, node, 'in-progress');
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.setSelectedStageCompleted', async (node?: WorkflowTreeNode) => {
			await updateSelectedWorkflowStageStatus(loadDashboardState, node, 'completed');
			EventBus.fire('refresh');
		})
	);
}

async function runInitAiFlow(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
	const configuration = getExtensionConfiguration();
	const workflowPlan = await promptForWorkflowPlan(configuration);
	if (!workflowPlan) {return;}

	const projectContext = await gatherProjectContext(false, workflowPlan, workspaceFolder);
	if (!projectContext) {return;}

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

	Logger.info(`[launch] Started workflow ${workflowPlan.preset} with provider ${workflowPlan.provider}`);
}

async function runContinueWorkflowFlow(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
	const configuration = getExtensionConfiguration();
	const existingSession = await readWorkflowSessionState(workspaceFolder.uri);
	if (!existingSession) {
		vscode.window.showWarningMessage('No workflow session found yet. Start with Init Workflow first.');
		return;
	}

	const workflowPlan = await promptForWorkflowContinuation(configuration, existingSession);
	if (!workflowPlan) {return;}

	const projectContext = await gatherProjectContext(false, workflowPlan, workspaceFolder);
	if (!projectContext) {return;}

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

	Logger.info(`[launch] Continued workflow from ${existingSession.currentPreset} to ${workflowPlan.preset} with provider ${workflowPlan.provider}`);
}

async function showWorkflowLaunchSummary(projectContext: ProjectContext): Promise<WorkflowQuickPickItem | undefined> {
	const document = await vscode.workspace.openTextDocument({
		language: 'markdown',
		content: buildWorkflowSummaryDocument(projectContext)
	});
	await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.Beside, preserveFocus: true });

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
		{ title: 'Generated Native Artifacts', placeHolder: 'Choose a generated file to open', ignoreFocusOut: true }
	);
	if (!selection) {return;}

	const artifactUri = buildWorkspaceUri(projectContext.workspaceFolder.uri, selection.label);
	if (!artifactUri) {return;}
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