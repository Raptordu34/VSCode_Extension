import * as vscode from 'vscode';
import { EventBus } from '../../core/eventBus.js';
import { Logger } from '../../core/logger.js';
import { resolveWorkspaceFolder } from '../../core/workspaceContext.js';
import { getExtensionConfiguration } from '../../core/configuration.js';
import { buildSmartDefaultWorkflowPlan, openWorkspaceRelativeFile, promptForWorkflowPlanWithMode, promptForWorkflowContinuation, updateSelectedWorkflowStageStatus, buildWorkflowSummaryDocument, saveLastWorkflowConfig, inferTaskType, buildSmartContinuationWorkflowPlan, promptForWorkflowBrief } from './workflowService.js';
import { WORKFLOW_PRESETS } from './presets.js';
import { gatherProjectContext, buildContextGenerationMessage } from '../context/contextBuilder.js';
import { readWorkflowBrief, readWorkflowSessionState } from '../context/workflowPersistence.js';
import { initializeSourceAnalysisBatch, readReconciledSourceAnalysisBatch, updateSourceAnalysisJobStatus, writeSourceAnalysisBatch } from '../context/sourceAnalysisBatch.js';
import { launchProvider } from '../aiAgents/agentLauncher.js';
import { CONTEXT_FILE_NAME, WORKFLOW_SOURCE_ANALYSIS_BATCH_FILE } from './constants.js';
import { WorkflowDashboardState, ProjectContext, WorkflowQuickPickItem, ProviderTarget, WorkflowPreset, ClaudeEffortLevel, WorkflowTreeNode, DocumentWorkflowIntentId, SourceAnalysisBatch, SourceAnalysisJob } from './types.js';
import { buildWorkspaceUri } from '../../core/workspace.js';
import { archiveActiveWorkflowState, buildWorkflowHistoryQuickPickLabel, cleanActiveWorkflowFiles, deleteWorkflowFromHistory, forkWorkflowFromHistory, forkWorkflowFromHistoryAtStage, readWorkflowArchiveManifest, readWorkflowHistoryIndex, resetOrchestratorWorkspaceFiles, resetWorkflowRuntimeFiles, restoreWorkflowFromHistory } from '../context/workflowHistory.js';
import { appendGitignoreRules } from './artifactGovernance.js';
import { clearWorkspaceModeState, ensureWorkspaceMode, getWorkspaceModeDefinition, getWorkspaceModeState, supportsLearningDocuments } from '../workspace/service.js';
import { clearLearningDocumentState, getLearningDocuments, LEARNING_DOCUMENTS_ROOT, promptForLearningDocument } from '../documents/service.js';
import { LAST_WORKFLOW_CONFIG_KEY, PENDING_COPILOT_PROMPT_KEY } from './constants.js';
import { saveWorkflowHistoryCollapsedIds } from './workflowService.js';
import { getWorkflowIntentCopy } from './presets.js';
import { getProviderLabel } from '../providers/providerService.js';
import { startPipeline, advancePipeline, abortPipeline, completePendingPipelineStep } from './pipelineService.js';
import { PIPELINE_TEMPLATES } from './pipelineTemplates.js';
import type { PipelineTemplateId } from './types.js';
import { WORKFLOW_OBJECTIVE_FILE } from './constants.js';

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

		vscode.commands.registerCommand('ai-context-orchestrator.openWorkflowObjective', async () => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder whose objective file should be opened');
			if (!workspaceFolder) {return;}
			await openWorkspaceRelativeFile(workspaceFolder.uri, WORKFLOW_OBJECTIVE_FILE);
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

		vscode.commands.registerCommand('ai-context-orchestrator.smartInitAI', async (preset?: string, overrides?: { provider?: string; providerModel?: string; claudeEffort?: string; learningDocumentId?: string; documentIntentId?: DocumentWorkflowIntentId; brief?: string }) => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder to initialize');
			if (!workspaceFolder) {return;}
			const configuration = getExtensionConfiguration();
			const resolvedPreset: WorkflowPreset = (preset as WorkflowPreset | undefined) ?? configuration.defaultPreset;
			const resolvedOverrides = overrides ? {
				provider: overrides.provider as ProviderTarget | undefined,
				providerModel: overrides.providerModel,
				claudeEffort: overrides.claudeEffort as ClaudeEffortLevel | undefined,
				learningDocumentId: overrides.learningDocumentId,
				documentIntentId: overrides.documentIntentId as DocumentWorkflowIntentId | undefined,
				brief: overrides.brief
			} : undefined;
			await runSmartInitAiFlow(context, resolvedPreset, workspaceFolder, resolvedOverrides);
			if (resolvedOverrides) {
				await saveLastWorkflowConfig(context, {
					preset: resolvedPreset,
					documentIntentId: resolvedOverrides.documentIntentId as DocumentWorkflowIntentId | undefined,
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

		vscode.commands.registerCommand('ai-context-orchestrator.smartContinueAI', async (overrides?: { preset?: string; provider?: string; providerModel?: string; claudeEffort?: string; learningDocumentId?: string; documentIntentId?: DocumentWorkflowIntentId; brief?: string }) => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder to continue');
			if (!workspaceFolder) {return;}
			await runSmartContinueAiFlow(context, workspaceFolder, overrides ? {
				preset: overrides.preset as WorkflowPreset | undefined,
				provider: overrides.provider as ProviderTarget | undefined,
				providerModel: overrides.providerModel,
				claudeEffort: overrides.claudeEffort as ClaudeEffortLevel | undefined,
				learningDocumentId: overrides.learningDocumentId,
				documentIntentId: overrides.documentIntentId as DocumentWorkflowIntentId | undefined,
				brief: overrides.brief
			} : undefined);
			if (overrides) {
				const configuration = getExtensionConfiguration();
				await saveLastWorkflowConfig(context, {
					preset: (overrides.preset as WorkflowPreset | undefined) ?? configuration.defaultPreset,
					documentIntentId: overrides.documentIntentId as DocumentWorkflowIntentId | undefined,
					provider: (overrides.provider as ProviderTarget | undefined) ?? configuration.defaultProvider,
					providerModel: overrides.providerModel,
					claudeEffort: overrides.claudeEffort as ClaudeEffortLevel | undefined,
					learningDocumentId: overrides.learningDocumentId,
					brief: overrides.brief
				});
			}
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.startDistributedSourceAnalysis', async () => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder whose learning document sources should be analyzed');
			if (!workspaceFolder) {return;}
			await runDistributedSourceAnalysisFlow(context, workspaceFolder);
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.manageDistributedSourceAnalysis', async () => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder whose distributed source analysis you want to manage');
			if (!workspaceFolder) {return;}
			await runManageDistributedSourceAnalysisFlow(workspaceFolder);
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.openDistributedSourceAnalysisReport', async (relativePath?: string) => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder whose distributed source analysis report should be opened');
			if (!workspaceFolder || !relativePath) {return;}
			await openWorkspaceRelativeFile(workspaceFolder.uri, relativePath);
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.setDistributedSourceAnalysisJobStatus', async (jobId?: string, status?: SourceAnalysisJob['status']) => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder whose distributed source analysis job should be updated');
			if (!workspaceFolder || !jobId || !status) {return;}
			await runSetDistributedSourceAnalysisJobStatusFlow(workspaceFolder, jobId, status);
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.runDistributedSourceSynthesis', async () => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder whose distributed source analysis should be synthesized');
			if (!workspaceFolder) {return;}
			await runDistributedSourceSynthesisFlow(context, workspaceFolder);
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
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.startPipeline', async (templateId?: string) => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder for the pipeline');
			if (!workspaceFolder) {return;}
			const configuration = getExtensionConfiguration();

			let resolvedTemplateId = templateId as PipelineTemplateId | undefined;
			if (!resolvedTemplateId || !(resolvedTemplateId in PIPELINE_TEMPLATES)) {
				const templateItems = Object.values(PIPELINE_TEMPLATES).map((t) => ({
					label: t.label,
					description: t.description,
					detail: `Steps: ${t.steps.join(' → ')}`,
					id: t.id
				}));
				const selection = await vscode.window.showQuickPick(templateItems, {
					title: 'Start Pipeline',
					placeHolder: 'Choose a pipeline template',
					ignoreFocusOut: true
				});
				if (!selection) {return;}
				resolvedTemplateId = selection.id as PipelineTemplateId;
			}

			await startPipeline(context, workspaceFolder, resolvedTemplateId, configuration);
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.advancePipelineStep', async () => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder');
			if (!workspaceFolder) {return;}
			const configuration = getExtensionConfiguration();
			await advancePipeline(context, workspaceFolder, configuration);
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.abortPipeline', async () => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder');
			if (!workspaceFolder) {return;}
			await abortPipeline(context, workspaceFolder);
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.completePendingCopilotPipelineStep', async () => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder');
			if (!workspaceFolder) {return;}
			await completePendingPipelineStep(context, workspaceFolder);
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
		documentIntentId?: DocumentWorkflowIntentId;
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
	if (overrides?.documentIntentId !== undefined) { workflowPlan.documentIntentId = overrides.documentIntentId; }
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
		documentIntentId?: DocumentWorkflowIntentId;
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
	if (overrides?.documentIntentId !== undefined) {
		workflowPlan.documentIntentId = overrides.documentIntentId;
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
		const learningDocuments = await getLearningDocuments(context, workspaceFolder);
		const hasLearningDocuments = learningDocuments.length > 0;
		const action = await vscode.window.showQuickPick([
			{
				label: 'Créer un document learning-kit',
				description: hasLearningDocuments ? 'Ajouter un nouveau document documentaire structuré' : 'Première étape: créer un document de travail structuré',
				action: 'create-document'
			},
			...(hasLearningDocuments ? [{
				label: `Démarrer ${getWorkflowIntentCopy('build', workspaceModeState.mode).label.toLowerCase()}`,
				description: 'Choisir le document cible puis lancer un workflow avec un intent adapté',
				action: 'launch-assistant'
			}] : []),
			{
				label: 'Changer le type de workspace',
				description: `Mode actuel: ${getWorkspaceModeDefinition(workspaceModeState.mode).label}`,
				action: 'change-mode'
			}
		], {
			title: 'Initialisation du workspace',
			placeHolder: hasLearningDocuments
				? (workspaceModeState.mode === 'research'
					? 'Choisissez comment démarrer votre workflow documentaire de recherche'
					: 'Choisissez le document puis le workflow documentaire à lancer')
				: 'Aucun document détecté: commencez par créer un document de travail',
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

		if (!hasLearningDocuments) {
			void vscode.window.showInformationMessage('Commencez par créer un document de travail, par exemple un compte-rendu, avant de lancer un workflow documentaire.');
			return;
		}
	}

	const configuration = getExtensionConfiguration();
	const selectedLearningDocument = supportsLearningDocuments(workspaceModeState.mode)
		? await promptForLearningDocument(context, workspaceFolder, 'Choisissez le document cible pour ce workflow')
		: undefined;
	if (supportsLearningDocuments(workspaceModeState.mode) && !selectedLearningDocument) {
		void vscode.window.showInformationMessage('Sélectionnez d’abord un document de travail pour démarrer un workflow documentaire.');
		return;
	}
	const workflowPlan = await promptForWorkflowPlanWithMode(configuration, workspaceModeState.mode, selectedLearningDocument);
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

function getDistributedSourceProviderOptions(configuration: ReturnType<typeof getExtensionConfiguration>): Array<{
	provider: ProviderTarget;
	providerModel: string;
	providerAccountId?: string;
	claudeAccountId?: string;
	claudeEffort?: ClaudeEffortLevel;
}> {
	const options: Array<{
		provider: ProviderTarget;
		providerModel: string;
		providerAccountId?: string;
		claudeAccountId?: string;
		claudeEffort?: ClaudeEffortLevel;
	}> = [];

	if (configuration.enabledProviders.includes('claude')) {
		options.push({
			provider: 'claude',
			providerModel: configuration.defaultClaudeModel,
			providerAccountId: configuration.activeClaudeAccountId,
			claudeAccountId: configuration.activeClaudeAccountId,
			claudeEffort: configuration.defaultClaudeEffort
		});
	}

	if (configuration.enabledProviders.includes('gemini')) {
		options.push({
			provider: 'gemini',
			providerModel: configuration.defaultGeminiModel,
			providerAccountId: configuration.activeGeminiAccountId
		});
	}

	return options;
}

async function promptForDistributedSourceProvider(configuration: ReturnType<typeof getExtensionConfiguration>): Promise<ReturnType<typeof getDistributedSourceProviderOptions>[number] | undefined> {
	const options = getDistributedSourceProviderOptions(configuration);
	if (options.length === 0) {
		void vscode.window.showWarningMessage('Distributed source analysis currently supports Claude or Gemini only. Configure one of these providers first.');
		return undefined;
	}

	const selection = await vscode.window.showQuickPick(options.map((option) => ({
		label: getProviderLabel(option.provider),
		description: option.providerModel,
		detail: option.provider === 'claude'
			? `Compte actif: ${option.claudeAccountId ?? 'default'} · Effort: ${option.claudeEffort ?? 'default'}`
			: `Compte actif: ${option.providerAccountId ?? 'default'}`,
		provider: option.provider
	})), {
		title: 'Distributed Source Analysis Provider',
		placeHolder: 'Choose the provider that should run one terminal per selected source job',
		ignoreFocusOut: true
	});
	if (!selection?.provider) {
		return undefined;
	}

	return options.find((option) => option.provider === selection.provider);
}

async function promptForSourceAnalysisJobs(batch: SourceAnalysisBatch): Promise<SourceAnalysisJob[] | undefined> {
	const selection = await vscode.window.showQuickPick(batch.jobs.map((job) => ({
		label: job.sourceLabel,
		description: job.status,
		detail: `${job.sourceRelativePath} → ${job.outputFile}`,
		picked: job.status === 'queued' || job.status === 'failed',
		jobId: job.id
	})), {
		title: 'Distributed Source Analysis Jobs',
		placeHolder: 'Choose which source jobs should be launched now',
		ignoreFocusOut: true,
		canPickMany: true
	});

	if (!selection) {
		return undefined;
	}

	const selectedIds = new Set(selection.map((item) => item.jobId));
	return batch.jobs.filter((job) => selectedIds.has(job.id));
}

async function runDistributedSourceAnalysisFlow(context: vscode.ExtensionContext, workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
	const workspaceModeState = await ensureWorkspaceMode(context, workspaceFolder);
	if (!workspaceModeState) {
		return;
	}

	const activeLearningDocument = await promptForLearningDocument(context, workspaceFolder, 'Choisissez le compte-rendu dont les sources doivent être analysées en parallèle');
	if (!activeLearningDocument) {
		void vscode.window.showInformationMessage('Sélectionnez d’abord un compte-rendu cible pour lancer l’analyse distribuée.');
		return;
	}
	if (activeLearningDocument.type !== 'compte-rendu') {
		void vscode.window.showWarningMessage('La V1 de l’analyse distribuée est limitée aux comptes-rendus.');
		return;
	}
	if (activeLearningDocument.sources.length === 0) {
		void vscode.window.showInformationMessage('Importez au moins une source dans le compte-rendu avant de lancer l’analyse distribuée.');
		return;
	}

	const configuration = getExtensionConfiguration();
	const providerSelection = await promptForDistributedSourceProvider(configuration);
	if (!providerSelection) {
		return;
	}

	const brief = await promptForWorkflowBrief('build', undefined, workspaceModeState.mode, 'compte-rendu-source-exploitation');
	if (!brief) {
		return;
	}

	const existingSession = await readWorkflowSessionState(workspaceFolder.uri);
	const workflowPlan = buildSmartDefaultWorkflowPlan('build', configuration);
	workflowPlan.workspaceMode = workspaceModeState.mode;
	workflowPlan.startNewWorkflow = !existingSession;
	workflowPlan.workflowId = existingSession?.workflowId;
	workflowPlan.branchId = existingSession?.branchId;
	workflowPlan.learningDocumentId = activeLearningDocument.id;
	workflowPlan.documentIntentId = 'compte-rendu-source-exploitation';
	workflowPlan.provider = providerSelection.provider;
	workflowPlan.providerModel = providerSelection.providerModel;
	workflowPlan.providerAccountId = providerSelection.providerAccountId;
	workflowPlan.claudeAccountId = providerSelection.claudeAccountId;
	workflowPlan.claudeEffort = providerSelection.claudeEffort;
	workflowPlan.sourceAnalysisMode = 'distributed';
	workflowPlan.brief = {
		...brief,
		taskType: inferTaskType('build', brief.rawText)
	};
	workflowPlan.presetDefinition = WORKFLOW_PRESETS.build;

	const projectContext = await gatherProjectContext(context, false, workflowPlan, workspaceFolder);
	if (!projectContext?.workflowSession) {
		return;
	}

	const batch = await initializeSourceAnalysisBatch(projectContext);
	const selectedJobs = await promptForSourceAnalysisJobs(batch);
	if (!selectedJobs) {
		return;
	}
	if (selectedJobs.length === 0) {
		void vscode.window.showInformationMessage(`Batch ${batch.batchId} created. Open ${WORKFLOW_SOURCE_ANALYSIS_BATCH_FILE} to dispatch jobs later.`);
		return;
	}

	const MAX_CONCURRENT_AGENTS = 3;
	const LAUNCH_DELAY_MS = 2000;

	let currentBatch = batch;
	for (let i = 0; i < selectedJobs.length; i += MAX_CONCURRENT_AGENTS) {
		const jobSlice = selectedJobs.slice(i, i + MAX_CONCURRENT_AGENTS);
		for (const job of jobSlice) {
			currentBatch = (await updateSourceAnalysisJobStatus(workspaceFolder.uri, job.id, 'running', 'Launched from the distributed source analysis command.')) ?? currentBatch;
			const currentJob = currentBatch.jobs.find((candidate) => candidate.id === job.id) ?? job;
			const jobWorkflowPlan = {
				...projectContext.workflowPlan,
				sourceAnalysisMode: 'distributed' as const,
				sourceAnalysisBatchId: currentBatch.batchId,
				sourceAnalysisJobId: currentJob.id,
				targetSourceRelativePath: currentJob.sourceRelativePath,
				targetSourceOutputFile: currentJob.outputFile
			};
			const jobContext: ProjectContext = {
				...projectContext,
				workflowPlan: jobWorkflowPlan,
				sourceAnalysisBatch: currentBatch,
				sourceAnalysisJob: currentJob,
				workflowSession: {
					...projectContext.workflowSession,
					sourceAnalysisBatch: currentBatch
				}
			};
			await launchProvider(context, jobWorkflowPlan, jobContext);
		}
		if (i + MAX_CONCURRENT_AGENTS < selectedJobs.length) {
			await new Promise(resolve => setTimeout(resolve, LAUNCH_DELAY_MS));
		}
	}

	void vscode.window.showInformationMessage(`${selectedJobs.length} source analysis terminal(s) launched for ${activeLearningDocument.title}.`);
}

async function runManageDistributedSourceAnalysisFlow(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
	const batch = await readReconciledSourceAnalysisBatch(workspaceFolder.uri);
	if (!batch) {
		void vscode.window.showInformationMessage('No distributed source analysis batch is available yet.');
		return;
	}

	const selection = await vscode.window.showQuickPick<{
		label: string;
		description?: string;
		detail?: string;
		action: 'open-batch' | 'job';
		jobId?: string;
	}>([
		{
			label: 'Open batch registry',
			description: batch.batchId,
			detail: WORKFLOW_SOURCE_ANALYSIS_BATCH_FILE,
			action: 'open-batch'
		},
		...batch.jobs.map((job) => ({
			label: job.sourceLabel,
			description: job.status,
			detail: `${job.outputFile} · ${job.sourceRelativePath}`,
			action: 'job' as const,
			jobId: job.id
		}))
	], {
		title: 'Manage Distributed Source Analysis',
		placeHolder: 'Open the batch registry or choose a source job to inspect/update',
		ignoreFocusOut: true
	});

	if (!selection) {
		return;
	}
	if (selection.action === 'open-batch') {
		await openWorkspaceRelativeFile(workspaceFolder.uri, WORKFLOW_SOURCE_ANALYSIS_BATCH_FILE);
		return;
	}

	const job = batch.jobs.find((candidate) => candidate.id === selection.jobId);
	if (!job) {
		return;
	}

	const action = await vscode.window.showQuickPick([
		{ label: 'Open analysis report', detail: job.outputFile, action: 'open' },
		{ label: 'Mark queued', detail: 'Set the job back to queued', action: 'queued' },
		{ label: 'Mark running', detail: 'Set the job to running', action: 'running' },
		{ label: 'Mark completed', detail: 'Set the job to completed', action: 'completed' },
		{ label: 'Mark failed', detail: 'Set the job to failed', action: 'failed' }
	], {
		title: job.sourceLabel,
		placeHolder: 'Choose how to manage this source job',
		ignoreFocusOut: true
	});
	if (!action) {
		return;
	}
	if (action.action === 'open') {
		await openWorkspaceRelativeFile(workspaceFolder.uri, job.outputFile);
		return;
	}

	await updateSourceAnalysisJobStatus(workspaceFolder.uri, job.id, action.action as SourceAnalysisJob['status']);
	void vscode.window.showInformationMessage(`${job.sourceLabel} marked as ${action.action}.`);
}

async function runSetDistributedSourceAnalysisJobStatusFlow(
	workspaceFolder: vscode.WorkspaceFolder,
	jobId: string,
	status: SourceAnalysisJob['status']
): Promise<void> {
	const batch = await readReconciledSourceAnalysisBatch(workspaceFolder.uri);
	if (!batch) {
		void vscode.window.showInformationMessage('No distributed source analysis batch is available yet.');
		return;
	}

	const job = batch.jobs.find((candidate) => candidate.id === jobId);
	if (!job) {
		void vscode.window.showWarningMessage('The selected distributed source analysis job could not be found.');
		return;
	}

	await updateSourceAnalysisJobStatus(workspaceFolder.uri, job.id, status);
	void vscode.window.showInformationMessage(`${job.sourceLabel} marked as ${status}.`);
}

async function runDistributedSourceSynthesisFlow(context: vscode.ExtensionContext, workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
	const existingSession = await readWorkflowSessionState(workspaceFolder.uri);
	if (!existingSession?.workflowId) {
		void vscode.window.showWarningMessage('Start a distributed source analysis workflow before launching synthesis.');
		return;
	}

	const batch = await readReconciledSourceAnalysisBatch(workspaceFolder.uri);
	if (!batch) {
		void vscode.window.showInformationMessage('No distributed source analysis batch is available yet.');
		return;
	}
	if (batch.provider === 'copilot') {
		void vscode.window.showWarningMessage('Distributed source synthesis is not supported with Copilot in V1.');
		return;
	}

	const incompleteJobs = batch.jobs.filter((job) => job.status !== 'completed');
	if (incompleteJobs.length > 0) {
		const confirm = await vscode.window.showWarningMessage(
			`${incompleteJobs.length} source job(s) are not marked completed yet. Continue with synthesis anyway?`,
			{ modal: true },
			'Continue'
		);
		if (confirm !== 'Continue') {
			return;
		}
	}

	const configuration = getExtensionConfiguration();
	const workspaceModeState = getWorkspaceModeState(context, workspaceFolder);
	const synthesisBrief = `Synthétiser les analyses distribuées de ${batch.jobs.length} source(s) pour ${batch.learningDocumentTitle} et préparer une intégration cohérente dans le compte-rendu.`;
	const workflowPlan = buildSmartContinuationWorkflowPlan(existingSession, configuration, {
		preset: 'build',
		provider: batch.provider,
		providerModel: batch.providerModel,
		claudeEffort: batch.claudeEffort
	});
	workflowPlan.workspaceMode = workspaceModeState?.mode;
	workflowPlan.workflowId = existingSession.workflowId;
	workflowPlan.branchId = existingSession.branchId;
	workflowPlan.providerAccountId = batch.providerAccountId;
	workflowPlan.claudeAccountId = batch.claudeAccountId;
	workflowPlan.sourceAnalysisMode = 'distributed';
	workflowPlan.sourceAnalysisBatchId = batch.batchId;
	workflowPlan.documentIntentId = batch.documentIntentId;
	workflowPlan.learningDocumentId = batch.learningDocumentId;
	workflowPlan.presetDefinition = WORKFLOW_PRESETS[workflowPlan.preset];
	workflowPlan.brief = {
		taskType: inferTaskType(workflowPlan.preset, synthesisBrief),
		goal: synthesisBrief,
		constraints: [],
		rawText: synthesisBrief
	};

	const projectContext = await gatherProjectContext(context, false, workflowPlan, workspaceFolder);
	if (!projectContext) {
		return;
	}

	await writeSourceAnalysisBatch(workspaceFolder.uri, {
		...batch,
		updatedAt: new Date().toISOString(),
		synthesisStageFile: projectContext.currentStage?.stageFile
	});

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
	Logger.info(`[launch] Distributed source synthesis started for batch ${batch.batchId} with provider ${workflowPlan.provider}`);
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
