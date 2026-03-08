import * as vscode from 'vscode';
import { EventBus } from '../../core/eventBus.js';
import { Logger } from '../../core/logger.js';
import { resolveWorkspaceFolder } from '../../core/workspaceContext.js';
import { getExtensionConfiguration } from '../../core/configuration.js';
import { buildSmartDefaultWorkflowPlan, openWorkspaceRelativeFile, promptForWorkflowPlan, promptForWorkflowContinuation, updateSelectedWorkflowStageStatus, buildWorkflowSummaryDocument, saveLastWorkflowConfig, inferTaskType } from './workflowService.js';
import { WORKFLOW_PRESETS } from './presets.js';
import { gatherProjectContext, buildContextGenerationMessage } from '../context/contextBuilder.js';
import { readWorkflowBrief, readWorkflowSessionState } from '../context/workflowPersistence.js';
import { launchProvider } from '../aiAgents/agentLauncher.js';
import { CONTEXT_FILE_NAME } from './constants.js';
import { WorkflowDashboardState, ProjectContext, WorkflowQuickPickItem, ProviderTarget, WorkflowPreset, ClaudeEffortLevel, WorkflowTreeNode } from './types.js';
import { buildWorkspaceUri } from '../../core/workspace.js';
import { archiveActiveWorkflowState, buildWorkflowHistoryQuickPickLabel, cleanActiveWorkflowFiles, forkWorkflowFromHistory, forkWorkflowFromHistoryAtStage, readWorkflowArchiveManifest, readWorkflowHistoryIndex, restoreWorkflowFromHistory } from '../context/workflowHistory.js';

export function registerWorkflowCommands(
	context: vscode.ExtensionContext,
	loadDashboardState: () => Promise<WorkflowDashboardState>
): void {
	const resolveCommandWorkspaceFolder = async (placeHolder: string): Promise<vscode.WorkspaceFolder | undefined> => {
		return resolveWorkspaceFolder(context, { placeHolder, showWarning: true });
	};

	context.subscriptions.push(
		vscode.commands.registerCommand('ai-context-orchestrator.initAI', async () => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder to initialize');
			if (!workspaceFolder) {return;}
			await runInitAiFlow(context, workspaceFolder);
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.continueWorkflow', async () => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder whose workflow you want to continue');
			if (!workspaceFolder) {return;}
			await runContinueWorkflowFlow(context, workspaceFolder);
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.restoreWorkflowFromHistory', async (workflowId?: string) => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder whose workflow history you want to restore');
			if (!workspaceFolder) {return;}
			await runRestoreWorkflowFromHistoryFlow(workspaceFolder, workflowId);
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.forkWorkflowFromHistory', async (workflowId?: string) => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder whose workflow should be forked');
			if (!workspaceFolder) {return;}
			await runForkWorkflowFromHistoryFlow(workspaceFolder, workflowId);
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.forkWorkflowFromStage', async (stageIndex?: number) => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder whose workflow stage should be forked');
			if (!workspaceFolder) {return;}
			await runForkWorkflowFromStageFlow(workspaceFolder, stageIndex);
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.forkWorkflowFromArchivedStage', async (workflowId?: string) => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder whose archived workflow stage should be forked');
			if (!workspaceFolder) {return;}
			await runForkWorkflowFromArchivedStageFlow(workspaceFolder, workflowId);
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.cleanActiveWorkflowFiles', async () => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder whose generated workflow files should be cleaned');
			if (!workspaceFolder) {return;}
			await runCleanActiveWorkflowFilesFlow(workspaceFolder);
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.smartInitAI', async (preset?: string, overrides?: { provider?: string; providerModel?: string; claudeEffort?: string; brief?: string }) => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder to initialize');
			if (!workspaceFolder) {return;}
			const configuration = getExtensionConfiguration();
			const resolvedPreset: WorkflowPreset = (preset as WorkflowPreset | undefined) ?? configuration.defaultPreset;
			const resolvedOverrides = overrides ? {
				provider: overrides.provider as ProviderTarget | undefined,
				providerModel: overrides.providerModel,
				claudeEffort: overrides.claudeEffort as ClaudeEffortLevel | undefined,
				brief: overrides.brief
			} : undefined;
			await runSmartInitAiFlow(context, resolvedPreset, workspaceFolder, resolvedOverrides);
			if (resolvedOverrides) {
				await saveLastWorkflowConfig(context, {
					preset: resolvedPreset,
					provider: resolvedOverrides.provider ?? configuration.defaultProvider,
					providerModel: resolvedOverrides.providerModel,
					claudeEffort: resolvedOverrides.claudeEffort,
					brief: resolvedOverrides.brief
				});
			}
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

async function runSmartInitAiFlow(
	context: vscode.ExtensionContext,
	preset: WorkflowPreset,
	workspaceFolder: vscode.WorkspaceFolder,
	overrides?: {
		provider?: ProviderTarget;
		providerModel?: string;
		claudeEffort?: ClaudeEffortLevel;
		brief?: string;
	}
): Promise<void> {
	const configuration = getExtensionConfiguration();
	const workflowPlan = buildSmartDefaultWorkflowPlan(preset, configuration);
	workflowPlan.startNewWorkflow = true;
	if (overrides?.provider) { workflowPlan.provider = overrides.provider; }
	if (overrides?.providerModel !== undefined) { workflowPlan.providerModel = overrides.providerModel; }
	if (overrides?.claudeEffort) { workflowPlan.claudeEffort = overrides.claudeEffort; }
	if (overrides?.brief) {
		workflowPlan.brief = {
			taskType: inferTaskType(preset, overrides.brief),
			goal: overrides.brief,
			constraints: [],
			rawText: overrides.brief
		};
	}
	workflowPlan.presetDefinition = WORKFLOW_PRESETS[preset];
	const projectContext = await gatherProjectContext(false, workflowPlan, workspaceFolder);
	if (!projectContext) {return;}

	await launchProvider(context, workflowPlan, projectContext);

	Logger.info(`[launch] Smart-init workflow ${workflowPlan.preset} with provider ${workflowPlan.provider}`);
}

async function runInitAiFlow(context: vscode.ExtensionContext, workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
	const configuration = getExtensionConfiguration();
	const workflowPlan = await promptForWorkflowPlan(configuration);
	if (!workflowPlan) {return;}
	workflowPlan.startNewWorkflow = true;

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

	await launchProvider(context, workflowPlan, projectContext);

	Logger.info(`[launch] Started workflow ${workflowPlan.preset} with provider ${workflowPlan.provider}`);
}

async function runContinueWorkflowFlow(context: vscode.ExtensionContext, workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
	const configuration = getExtensionConfiguration();
	const existingSession = await readWorkflowSessionState(workspaceFolder.uri);
	if (!existingSession) {
		vscode.window.showWarningMessage('No workflow session found yet. Start with Init Workflow first.');
		return;
	}

	const workflowPlan = await promptForWorkflowContinuation(configuration, existingSession);
	if (!workflowPlan) {return;}
	workflowPlan.startNewWorkflow = false;
	workflowPlan.workflowId = existingSession.workflowId;
	workflowPlan.branchId = existingSession.branchId;

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

	await launchProvider(context, workflowPlan, projectContext);

	Logger.info(`[launch] Continued workflow from ${existingSession.currentPreset} to ${workflowPlan.preset} with provider ${workflowPlan.provider}`);
}

async function runRestoreWorkflowFromHistoryFlow(workspaceFolder: vscode.WorkspaceFolder, workflowId?: string): Promise<void> {
	const historyIndex = await readWorkflowHistoryIndex(workspaceFolder.uri);
	if (historyIndex.entries.length === 0) {
		void vscode.window.showInformationMessage('No archived workflows are available yet.');
		return;
	}

	if (workflowId) {
		const entry = historyIndex.entries.find((candidate) => candidate.workflowId === workflowId);
		if (!entry) {
			void vscode.window.showWarningMessage('The requested workflow archive could not be found.');
			return;
		}
		await restoreArchivedWorkflow(workspaceFolder, workflowId);
		return;
	}

	const selection = await vscode.window.showQuickPick(
		historyIndex.entries.map((entry) => ({
			label: buildWorkflowHistoryQuickPickLabel(entry),
			description: entry.updatedAt,
			detail: `${entry.stageCount} stage(s)${historyIndex.activeWorkflowId === entry.workflowId ? ' · active' : ''}`,
			workflowId: entry.workflowId
		})),
		{
			title: 'Restore Workflow History',
			placeHolder: 'Choose the archived workflow to restore into the active workspace',
			ignoreFocusOut: true
		}
	);
	if (!selection?.workflowId) {
		return;
	}

	await restoreArchivedWorkflow(workspaceFolder, selection.workflowId);
}

async function restoreArchivedWorkflow(workspaceFolder: vscode.WorkspaceFolder, workflowId: string): Promise<void> {
	const currentSession = await readWorkflowSessionState(workspaceFolder.uri);
	if (currentSession && currentSession.workflowId !== workflowId) {
		await archiveActiveWorkflowState(workspaceFolder, currentSession, await readWorkflowBrief(workspaceFolder.uri));
	}

	const restoredManifest = await restoreWorkflowFromHistory(workspaceFolder, workflowId);
	if (!restoredManifest) {
		void vscode.window.showWarningMessage('The selected workflow archive could not be restored.');
		return;
	}

	void vscode.window.showInformationMessage(`Workflow restored: ${restoredManifest.label}.`);
}

async function runCleanActiveWorkflowFilesFlow(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
	const currentSession = await readWorkflowSessionState(workspaceFolder.uri);
	if (currentSession) {
		await archiveActiveWorkflowState(workspaceFolder, currentSession, await readWorkflowBrief(workspaceFolder.uri));
	}

	const cleaned = await cleanActiveWorkflowFiles(workspaceFolder);
	if (!cleaned) {
		void vscode.window.showInformationMessage('No active archived workflow was found to clean.');
		return;
	}

	void vscode.window.showInformationMessage('Active workflow-generated files cleaned from the workspace.');
}

async function runForkWorkflowFromHistoryFlow(workspaceFolder: vscode.WorkspaceFolder, workflowId?: string): Promise<void> {
	const historyIndex = await readWorkflowHistoryIndex(workspaceFolder.uri);
	if (historyIndex.entries.length === 0) {
		void vscode.window.showInformationMessage('No archived workflows are available yet to fork.');
		return;
	}

	let sourceWorkflowId = workflowId;
	if (!sourceWorkflowId) {
		const selection = await vscode.window.showQuickPick(
			historyIndex.entries.map((entry) => ({
				label: buildWorkflowHistoryQuickPickLabel(entry),
				description: entry.updatedAt,
				detail: `${entry.stageCount} stage(s)${historyIndex.activeWorkflowId === entry.workflowId ? ' · active' : ''}`,
				workflowId: entry.workflowId
			})),
			{
				title: 'Fork Workflow History',
				placeHolder: 'Choose the workflow to fork into a new lineage',
				ignoreFocusOut: true
			}
		);
		if (!selection?.workflowId) {
			return;
		}
		sourceWorkflowId = selection.workflowId;
	}

	const currentSession = await readWorkflowSessionState(workspaceFolder.uri);
	if (currentSession?.workflowId === sourceWorkflowId) {
		await archiveActiveWorkflowState(workspaceFolder, currentSession, await readWorkflowBrief(workspaceFolder.uri));
	}

	const forkedManifest = await forkWorkflowFromHistory(workspaceFolder, sourceWorkflowId);
	if (!forkedManifest) {
		void vscode.window.showWarningMessage('The selected workflow archive could not be forked.');
		return;
	}

	const restoredFork = await restoreWorkflowFromHistory(workspaceFolder, forkedManifest.workflowId);
	if (!restoredFork) {
		void vscode.window.showWarningMessage('The fork was created but could not be restored as the active workflow.');
		return;
	}

	void vscode.window.showInformationMessage(`Workflow forked: ${restoredFork.label}.`);
}

async function runForkWorkflowFromStageFlow(workspaceFolder: vscode.WorkspaceFolder, stageIndex?: number): Promise<void> {
	const currentSession = await readWorkflowSessionState(workspaceFolder.uri);
	if (!currentSession?.workflowId) {
		void vscode.window.showInformationMessage('No active workflow is available to fork from a stage.');
		return;
	}

	const resolvedStageIndex = stageIndex ?? currentSession.currentStageIndex;
	const targetStage = currentSession.stages.find((stage) => stage.index === resolvedStageIndex);
	if (!targetStage) {
		void vscode.window.showWarningMessage('The selected stage could not be found in the active workflow.');
		return;
	}

	await archiveActiveWorkflowState(workspaceFolder, currentSession, await readWorkflowBrief(workspaceFolder.uri));

	const forkedManifest = await forkWorkflowFromHistoryAtStage(workspaceFolder, currentSession.workflowId, resolvedStageIndex);
	if (!forkedManifest) {
		void vscode.window.showWarningMessage('The selected workflow stage could not be forked.');
		return;
	}

	const restoredFork = await restoreWorkflowFromHistory(workspaceFolder, forkedManifest.workflowId);
	if (!restoredFork) {
		void vscode.window.showWarningMessage('The stage fork was created but could not be restored as the active workflow.');
		return;
	}

	void vscode.window.showInformationMessage(`Workflow forked from stage ${String(targetStage.index).padStart(2, '0')}: ${restoredFork.label}.`);
}

async function runForkWorkflowFromArchivedStageFlow(workspaceFolder: vscode.WorkspaceFolder, workflowId?: string): Promise<void> {
	const historyIndex = await readWorkflowHistoryIndex(workspaceFolder.uri);
	if (historyIndex.entries.length === 0) {
		void vscode.window.showInformationMessage('No archived workflows are available yet to fork from a stage.');
		return;
	}

	let sourceWorkflowId = workflowId;
	if (!sourceWorkflowId) {
		const workflowSelection = await vscode.window.showQuickPick(
			historyIndex.entries.map((entry) => ({
				label: buildWorkflowHistoryQuickPickLabel(entry),
				description: entry.updatedAt,
				detail: `${entry.stageCount} stage(s)${historyIndex.activeWorkflowId === entry.workflowId ? ' · active' : ''}`,
				workflowId: entry.workflowId
			})),
			{
				title: 'Fork Archived Workflow From Stage',
				placeHolder: 'Choose the archived workflow whose stage should become a new workflow lineage',
				ignoreFocusOut: true
			}
		);
		if (!workflowSelection?.workflowId) {
			return;
		}
		sourceWorkflowId = workflowSelection.workflowId;
	}

	const sourceManifest = await readWorkflowArchiveManifest(workspaceFolder.uri, sourceWorkflowId);
	if (!sourceManifest || sourceManifest.session.stages.length === 0) {
		void vscode.window.showWarningMessage('The selected archived workflow does not contain any stages to fork.');
		return;
	}

	const stageSelection = await vscode.window.showQuickPick(
		sourceManifest.session.stages.map((stage) => ({
			label: `${String(stage.index).padStart(2, '0')} ${WORKFLOW_PRESETS[stage.preset].label}`,
			description: stage.providerModel ? `${stage.provider} · ${stage.providerModel}` : stage.provider,
			detail: stage.briefSummary,
			stageIndex: stage.index
		})),
		{
			title: 'Fork Archived Workflow From Stage',
			placeHolder: 'Choose the archived stage that should become the tip of the new workflow lineage',
			ignoreFocusOut: true
		}
	);
	if (stageSelection?.stageIndex === undefined) {
		return;
	}

	const currentSession = await readWorkflowSessionState(workspaceFolder.uri);
	if (currentSession?.workflowId) {
		await archiveActiveWorkflowState(workspaceFolder, currentSession, await readWorkflowBrief(workspaceFolder.uri));
	}

	const forkedManifest = await forkWorkflowFromHistoryAtStage(workspaceFolder, sourceWorkflowId, stageSelection.stageIndex);
	if (!forkedManifest) {
		void vscode.window.showWarningMessage('The selected archived workflow stage could not be forked.');
		return;
	}

	const restoredFork = await restoreWorkflowFromHistory(workspaceFolder, forkedManifest.workflowId);
	if (!restoredFork) {
		void vscode.window.showWarningMessage('The archived stage fork was created but could not be restored as the active workflow.');
		return;
	}

	void vscode.window.showInformationMessage(`Workflow forked from archived stage ${String(stageSelection.stageIndex).padStart(2, '0')}: ${restoredFork.label}.`);
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
