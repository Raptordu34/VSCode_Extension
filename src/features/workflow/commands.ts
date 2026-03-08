import * as vscode from 'vscode';
import { EventBus } from '../../core/eventBus.js';
import { Logger } from '../../core/logger.js';
import { resolveWorkspaceFolder } from '../../core/workspaceContext.js';
import { getExtensionConfiguration } from '../../core/configuration.js';
import { buildSmartDefaultWorkflowPlan, openWorkspaceRelativeFile, promptForWorkflowPlanWithMode, promptForWorkflowContinuation, updateSelectedWorkflowStageStatus, buildWorkflowSummaryDocument, saveLastWorkflowConfig, inferTaskType, buildSmartContinuationWorkflowPlan } from './workflowService.js';
import { WORKFLOW_PRESETS } from './presets.js';
import { gatherProjectContext, buildContextGenerationMessage } from '../context/contextBuilder.js';
import { readWorkflowBrief, readWorkflowSessionState } from '../context/workflowPersistence.js';
import { launchProvider } from '../aiAgents/agentLauncher.js';
import { CONTEXT_FILE_NAME } from './constants.js';
import { WorkflowDashboardState, ProjectContext, WorkflowQuickPickItem, ProviderTarget, WorkflowPreset, ClaudeEffortLevel, WorkflowTreeNode } from './types.js';
import { buildWorkspaceUri } from '../../core/workspace.js';
import { archiveActiveWorkflowState, buildWorkflowHistoryQuickPickLabel, cleanActiveWorkflowFiles, deleteWorkflowFromHistory, forkWorkflowFromHistory, forkWorkflowFromHistoryAtStage, readWorkflowArchiveManifest, readWorkflowHistoryIndex, resetOrchestratorWorkspaceFiles, resetWorkflowRuntimeFiles, restoreWorkflowFromHistory } from '../context/workflowHistory.js';
import { appendGitignoreRules } from './artifactGovernance.js';
import { clearWorkspaceModeState, ensureWorkspaceMode, getWorkspaceModeDefinition, getWorkspaceModeState, supportsLearningDocuments } from '../workspace/service.js';
import { clearLearningDocumentState, LEARNING_DOCUMENTS_ROOT } from '../documents/service.js';
import { LAST_WORKFLOW_CONFIG_KEY, PENDING_COPILOT_PROMPT_KEY } from './constants.js';
import { saveWorkflowHistoryCollapsedIds } from './workflowService.js';
import { getWorkflowIntentCopy } from './presets.js';

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

		vscode.commands.registerCommand('ai-context-orchestrator.resetWorkspaceExtension', async () => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder to reset');
			if (!workspaceFolder) {return;}
			await runResetWorkspaceExtensionFlow(context, workspaceFolder, 'full');
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.resetWorkspaceWorkflowState', async () => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder whose workflow runtime should be reset');
			if (!workspaceFolder) {return;}
			await runResetWorkspaceExtensionFlow(context, workspaceFolder, 'workflow');
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.resetWorkspaceExtensionPartial', async () => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder to partially reset');
			if (!workspaceFolder) {return;}
			await runResetWorkspaceExtensionFlow(context, workspaceFolder, 'orchestration');
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.smartInitAI', async (preset?: string, overrides?: { provider?: string; providerModel?: string; claudeEffort?: string; learningDocumentId?: string; brief?: string }) => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder to initialize');
			if (!workspaceFolder) {return;}
			const configuration = getExtensionConfiguration();
			const resolvedPreset: WorkflowPreset = (preset as WorkflowPreset | undefined) ?? configuration.defaultPreset;
			const resolvedOverrides = overrides ? {
				provider: overrides.provider as ProviderTarget | undefined,
				providerModel: overrides.providerModel,
				claudeEffort: overrides.claudeEffort as ClaudeEffortLevel | undefined,
				learningDocumentId: overrides.learningDocumentId,
				brief: overrides.brief
			} : undefined;
			await runSmartInitAiFlow(context, resolvedPreset, workspaceFolder, resolvedOverrides);
			if (resolvedOverrides) {
				await saveLastWorkflowConfig(context, {
					preset: resolvedPreset,
					provider: resolvedOverrides.provider ?? configuration.defaultProvider,
					providerModel: resolvedOverrides.providerModel,
					claudeEffort: resolvedOverrides.claudeEffort,
					learningDocumentId: resolvedOverrides.learningDocumentId,
					brief: resolvedOverrides.brief
				});
			}
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.deleteWorkflowFromHistory', async (workflowId?: string) => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder');
			if (!workspaceFolder) {return;}

			const confirm = await vscode.window.showWarningMessage(
				'Delete this workflow archive? This cannot be undone.',
				{ modal: true },
				'Delete'
			);
			if (confirm !== 'Delete') {return;}

			const deleted = await deleteWorkflowFromHistory(workspaceFolder, workflowId ?? '');
			if (deleted) {
				void vscode.window.showInformationMessage('Workflow archive deleted.');
			} else {
				void vscode.window.showWarningMessage('Workflow archive not found.');
			}
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.smartContinueAI', async (overrides?: { preset?: string; provider?: string; providerModel?: string; claudeEffort?: string; learningDocumentId?: string; brief?: string }) => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder to continue');
			if (!workspaceFolder) {return;}
			await runSmartContinueAiFlow(context, workspaceFolder, overrides ? {
				preset: overrides.preset as WorkflowPreset | undefined,
				provider: overrides.provider as ProviderTarget | undefined,
				providerModel: overrides.providerModel,
				claudeEffort: overrides.claudeEffort as ClaudeEffortLevel | undefined,
				learningDocumentId: overrides.learningDocumentId,
				brief: overrides.brief
			} : undefined);
			if (overrides) {
				const configuration = getExtensionConfiguration();
				await saveLastWorkflowConfig(context, {
					preset: (overrides.preset as WorkflowPreset | undefined) ?? configuration.defaultPreset,
					provider: (overrides.provider as ProviderTarget | undefined) ?? configuration.defaultProvider,
					providerModel: overrides.providerModel,
					claudeEffort: overrides.claudeEffort as ClaudeEffortLevel | undefined,
					learningDocumentId: overrides.learningDocumentId,
					brief: overrides.brief
				});
			}
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.configureGitignore', async () => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder');
			if (!workspaceFolder) {return;}
			try {
				await appendGitignoreRules(workspaceFolder);
				void vscode.window.showInformationMessage('.gitignore updated with ai-context-orchestrator paths.');
			} catch {
				void vscode.window.showWarningMessage('Could not update .gitignore.');
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
		learningDocumentId?: string;
		brief?: string;
	}
): Promise<void> {
	const workspaceModeState = await ensureWorkspaceMode(context, workspaceFolder);
	if (!workspaceModeState) {
		return;
	}

	const configuration = getExtensionConfiguration();
	const workflowPlan = buildSmartDefaultWorkflowPlan(preset, configuration);
	workflowPlan.workspaceMode = workspaceModeState.mode;
	workflowPlan.startNewWorkflow = true;
	if (overrides?.provider) { workflowPlan.provider = overrides.provider; }
	if (overrides?.providerModel !== undefined) { workflowPlan.providerModel = overrides.providerModel; }
	if (overrides?.claudeEffort) { workflowPlan.claudeEffort = overrides.claudeEffort; }
	if (overrides?.learningDocumentId !== undefined) { workflowPlan.learningDocumentId = overrides.learningDocumentId; }
	if (overrides?.brief) {
		workflowPlan.brief = {
			taskType: inferTaskType(preset, overrides.brief),
			goal: overrides.brief,
			constraints: [],
			rawText: overrides.brief
		};
	}
	workflowPlan.presetDefinition = WORKFLOW_PRESETS[preset];
	const projectContext = await gatherProjectContext(context, false, workflowPlan, workspaceFolder);
	if (!projectContext) {return;}

	await launchProvider(context, workflowPlan, projectContext);

	Logger.info(`[launch] Smart-init workflow ${workflowPlan.preset} with provider ${workflowPlan.provider}`);
}

async function runSmartContinueAiFlow(
	context: vscode.ExtensionContext,
	workspaceFolder: vscode.WorkspaceFolder,
	overrides?: {
		preset?: WorkflowPreset;
		provider?: ProviderTarget;
		providerModel?: string;
		claudeEffort?: ClaudeEffortLevel;
		learningDocumentId?: string;
		brief?: string;
	}
): Promise<void> {
	const configuration = getExtensionConfiguration();
	const workspaceModeState = getWorkspaceModeState(context, workspaceFolder);
	const existingSession = await readWorkflowSessionState(workspaceFolder.uri);
	if (!existingSession) {
		vscode.window.showWarningMessage('No workflow session found yet. Start with Init Workflow first.');
		return;
	}

	const workflowPlan = buildSmartContinuationWorkflowPlan(existingSession, configuration, overrides);
	workflowPlan.workspaceMode = workspaceModeState?.mode;
	if (overrides?.brief) {
		workflowPlan.brief = {
			taskType: inferTaskType(workflowPlan.preset, overrides.brief),
			goal: overrides.brief,
			constraints: [],
			rawText: overrides.brief
		};
	}
	if (overrides?.learningDocumentId !== undefined) {
		workflowPlan.learningDocumentId = overrides.learningDocumentId;
	}
	const projectContext = await gatherProjectContext(context, false, workflowPlan, workspaceFolder);
	if (!projectContext) {return;}

	await launchProvider(context, workflowPlan, projectContext);

	Logger.info(`[launch] Smart-continue workflow ${workflowPlan.preset} with provider ${workflowPlan.provider}`);
}

async function runInitAiFlow(context: vscode.ExtensionContext, workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
	const workspaceModeState = await ensureWorkspaceMode(context, workspaceFolder);
	if (!workspaceModeState) {
		return;
	}

	if (supportsLearningDocuments(workspaceModeState.mode)) {
		const action = await vscode.window.showQuickPick([
			{
				label: 'Créer un document learning-kit',
				description: 'Initialiser un document documentaire structuré',
				action: 'create-document'
			},
			{
				label: `Démarrer ${getWorkflowIntentCopy('build', workspaceModeState.mode).label.toLowerCase()}`,
				description: 'Ouvrir la configuration de workflow avec des intents adaptés au mode documentaire',
				action: 'launch-assistant'
			},
			{
				label: 'Changer le type de workspace',
				description: `Mode actuel: ${getWorkspaceModeDefinition(workspaceModeState.mode).label}`,
				action: 'change-mode'
			}
		], {
			title: 'Initialisation du workspace',
			placeHolder: workspaceModeState.mode === 'research'
				? 'Choisissez comment démarrer votre workflow documentaire de recherche'
				: 'Choisissez comment démarrer votre workflow documentaire',
			ignoreFocusOut: true
		});

		if (!action) {
			return;
		}

		if (action.action === 'change-mode') {
			await vscode.commands.executeCommand('ai-context-orchestrator.selectWorkspaceMode');
			return;
		}

		if (action.action === 'create-document') {
			await vscode.commands.executeCommand('ai-context-orchestrator.createLearningDocument');
			return;
		}
	}

	const configuration = getExtensionConfiguration();
	const workflowPlan = await promptForWorkflowPlanWithMode(configuration, workspaceModeState.mode);
	if (!workflowPlan) {return;}
	workflowPlan.startNewWorkflow = true;

	const projectContext = await gatherProjectContext(context, false, workflowPlan, workspaceFolder);
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

async function runResetWorkspaceExtensionFlow(
	context: vscode.ExtensionContext,
	workspaceFolder: vscode.WorkspaceFolder,
	requestedScope: 'workflow' | 'orchestration' | 'full'
): Promise<void> {
	const scope = requestedScope;
	const isWorkflowReset = scope === 'workflow';
	const isFullReset = scope === 'full';
	const isOrchestrationReset = scope === 'orchestration';
	const confirm = await vscode.window.showWarningMessage(
		isFullReset
			? 'Reset complet AI Context Orchestrator dans ce workspace ? Cela supprime les fichiers de workflow générés, l’historique, les learning documents et le mode du workspace pour repartir depuis zéro.'
			: isOrchestrationReset
				? 'Reset orchestration AI Context Orchestrator dans ce workspace ? Cela supprime les fichiers de workflow générés, les artefacts provider et l’état d’orchestration, tout en conservant les learning documents et le mode du workspace.'
				: 'Reset workflow AI Context Orchestrator dans ce workspace ? Cela supprime seulement le contexte courant, la session active et l’historique de workflow, sans toucher aux learning documents, au mode du workspace ni aux artefacts provider.',
		{ modal: true },
		isFullReset ? 'Reset complet' : isOrchestrationReset ? 'Reset orchestration' : 'Reset workflow'
	);
	if (confirm !== (isFullReset ? 'Reset complet' : isOrchestrationReset ? 'Reset orchestration' : 'Reset workflow')) {
		return;
	}

	const learningDocumentsUri = vscode.Uri.joinPath(workspaceFolder.uri, ...LEARNING_DOCUMENTS_ROOT.split('/'));
	const learningDocumentsExists = isFullReset
		? await vscode.workspace.fs.stat(learningDocumentsUri).then(() => true, () => false)
		: false;
	const resetResult = isWorkflowReset
		? await resetWorkflowRuntimeFiles(workspaceFolder)
		: await resetOrchestratorWorkspaceFiles(workspaceFolder);
	if (isFullReset && learningDocumentsExists) {
		await vscode.workspace.fs.delete(learningDocumentsUri, { recursive: true, useTrash: false });
	}

	const cleanupTasks: Array<Thenable<void> | Promise<void>> = [
		saveWorkflowHistoryCollapsedIds(context, workspaceFolder, []),
		context.globalState.update(LAST_WORKFLOW_CONFIG_KEY, undefined),
		context.globalState.update(PENDING_COPILOT_PROMPT_KEY, undefined)
	];
	if (isFullReset) {
		cleanupTasks.push(clearLearningDocumentState(context, workspaceFolder));
		cleanupTasks.push(clearWorkspaceModeState(context, workspaceFolder));
	}
	await Promise.all(cleanupTasks);

	const removedLearningDocuments = learningDocumentsExists ? 1 : 0;
	void vscode.window.showInformationMessage(
		isFullReset
			? `Reset complet terminé. ${resetResult.deletedPaths + removedLearningDocuments} chemin(s) généré(s) supprimé(s) et ${resetResult.cleanedManagedFiles} fichier(s) managé(s) nettoyé(s).`
			: isOrchestrationReset
				? `Reset orchestration terminé. ${resetResult.deletedPaths} chemin(s) d’orchestration supprimé(s) et ${resetResult.cleanedManagedFiles} fichier(s) managé(s) nettoyé(s). Les learning documents et le mode du workspace sont conservés.`
				: `Reset workflow terminé. ${resetResult.deletedPaths} chemin(s) de contexte et d’historique supprimé(s). Les learning documents, le mode du workspace et les artefacts provider sont conservés.`
	);
}

async function runContinueWorkflowFlow(context: vscode.ExtensionContext, workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
	const configuration = getExtensionConfiguration();
	const workspaceModeState = getWorkspaceModeState(context, workspaceFolder);
	const existingSession = await readWorkflowSessionState(workspaceFolder.uri);
	if (!existingSession) {
		vscode.window.showWarningMessage('No workflow session found yet. Start with Init Workflow first.');
		return;
	}

	const workflowPlan = await promptForWorkflowContinuation(configuration, existingSession, workspaceModeState?.mode);
	if (!workflowPlan) {return;}
	workflowPlan.startNewWorkflow = false;
	workflowPlan.workflowId = existingSession.workflowId;
	workflowPlan.branchId = existingSession.branchId;

	const projectContext = await gatherProjectContext(context, false, workflowPlan, workspaceFolder);
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
		void vscode.window.showInformationMessage('No archived workflows are available yet to duplicate.');
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
				title: 'Duplicate Workflow',
				placeHolder: 'Choose the workflow to duplicate into a new lineage',
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
		void vscode.window.showWarningMessage('The selected workflow archive could not be duplicated.');
		return;
	}

	const restoredFork = await restoreWorkflowFromHistory(workspaceFolder, forkedManifest.workflowId);
	if (!restoredFork) {
		void vscode.window.showWarningMessage('The duplicate was created but could not be restored as the active workflow.');
		return;
	}

	void vscode.window.showInformationMessage(`Workflow duplicated: ${restoredFork.label}.`);
}

async function runForkWorkflowFromStageFlow(workspaceFolder: vscode.WorkspaceFolder, stageIndex?: number): Promise<void> {
	const currentSession = await readWorkflowSessionState(workspaceFolder.uri);
	if (!currentSession?.workflowId) {
		void vscode.window.showInformationMessage('No active workflow is available to branch from a stage.');
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
		void vscode.window.showWarningMessage('The selected workflow stage could not be branched.');
		return;
	}

	const restoredFork = await restoreWorkflowFromHistory(workspaceFolder, forkedManifest.workflowId);
	if (!restoredFork) {
		void vscode.window.showWarningMessage('The branch was created but could not be restored as the active workflow.');
		return;
	}

	void vscode.window.showInformationMessage(`Workflow branched from stage ${String(targetStage.index).padStart(2, '0')}: ${restoredFork.label}.`);
}

async function runForkWorkflowFromArchivedStageFlow(workspaceFolder: vscode.WorkspaceFolder, workflowId?: string): Promise<void> {
	const historyIndex = await readWorkflowHistoryIndex(workspaceFolder.uri);
	if (historyIndex.entries.length === 0) {
		void vscode.window.showInformationMessage('No archived workflows are available yet to branch from a stage.');
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
				title: 'Branch Workflow From Stage',
				placeHolder: 'Choose the archived workflow whose stage checkpoint to branch from',
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
		void vscode.window.showWarningMessage('The selected archived workflow does not contain any stages to branch from.');
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
			title: 'Branch Workflow From Stage',
			placeHolder: 'Choose the stage checkpoint that should become the root of the new workflow',
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
		void vscode.window.showWarningMessage('The selected archived workflow stage could not be branched.');
		return;
	}

	const restoredFork = await restoreWorkflowFromHistory(workspaceFolder, forkedManifest.workflowId);
	if (!restoredFork) {
		void vscode.window.showWarningMessage('The branch was created but could not be restored as the active workflow.');
		return;
	}

	void vscode.window.showInformationMessage(`Workflow branched from stage ${String(stageSelection.stageIndex).padStart(2, '0')}: ${restoredFork.label}.`);
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
