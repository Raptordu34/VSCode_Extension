import * as vscode from 'vscode';
import { EventBus } from '../../core/eventBus.js';
import { Logger } from '../../core/logger.js';
import { getExtensionConfiguration } from '../../core/configuration.js';
import type { ExtensionConfiguration, ActivePipelineState, PipelineTemplateId, PipelineStepConfig, WorkflowPreset, ProviderTarget, ClaudeEffortLevel } from './types.js';
import { ACTIVE_PIPELINE_STATE_KEY } from './constants.js';
import { PIPELINE_TEMPLATES } from './pipelineTemplates.js';
import { WORKFLOW_PRESETS } from './presets.js';
import { buildSmartDefaultWorkflowPlan, promptForClaudeEffort } from './workflowService.js';
import { gatherProjectContext } from '../context/contextBuilder.js';
import { launchProvider } from '../aiAgents/agentLauncher.js';
import { readWorkflowSessionState } from '../context/workflowPersistence.js';
import { getWorkspaceModeState } from '../workspace/service.js';
import { createBranch, isGitRepository } from '../git/gitService.js';
import { generateBranchName } from '../git/branchNameGenerator.js';
import { getProviderLabel, promptForProviderTarget, promptForProviderModel, promptForProviderAccount, getProviderAccounts, findProviderAccount, getActiveProviderAccountId, getDefaultProviderModel, getDefaultClaudeEffort } from '../providers/providerService.js';
import { formatProviderModel } from '../providers/providerService.js';

function getPipelineStateKey(workspaceFolder: vscode.WorkspaceFolder): string {
	return `${ACTIVE_PIPELINE_STATE_KEY}.${workspaceFolder.uri.toString()}`;
}

export function readActivePipelineState(
	context: vscode.ExtensionContext,
	workspaceFolder: vscode.WorkspaceFolder
): ActivePipelineState | undefined {
	return context.workspaceState.get<ActivePipelineState>(getPipelineStateKey(workspaceFolder));
}

async function saveActivePipelineState(
	context: vscode.ExtensionContext,
	workspaceFolder: vscode.WorkspaceFolder,
	state: ActivePipelineState
): Promise<void> {
	await context.workspaceState.update(getPipelineStateKey(workspaceFolder), state);
}

async function clearActivePipelineState(
	context: vscode.ExtensionContext,
	workspaceFolder: vscode.WorkspaceFolder
): Promise<void> {
	await context.workspaceState.update(getPipelineStateKey(workspaceFolder), undefined);
}

export async function startPipeline(
	context: vscode.ExtensionContext,
	workspaceFolder: vscode.WorkspaceFolder,
	templateId: PipelineTemplateId,
	configuration: ExtensionConfiguration
): Promise<void> {
	const workspaceModeState = getWorkspaceModeState(context, workspaceFolder);
	if (workspaceModeState?.mode !== 'code') {
		void vscode.window.showWarningMessage('Pipeline workflows are only available in Code workspace mode.');
		return;
	}

	const template = PIPELINE_TEMPLATES[templateId];

	// Ask for a brief to drive branch name generation
	const briefInput = await vscode.window.showInputBox({
		title: `Pipeline: ${template.label}`,
		prompt: 'Describe the task briefly (used to generate a branch name and guide the workflow)',
		placeHolder: 'e.g. Add user authentication with OAuth2',
		ignoreFocusOut: true
	});
	if (!briefInput?.trim()) {
		return;
	}
	const briefText = briefInput.trim();

	let branchName: string | undefined;
	if (!template.skipGit && template.gitBranchPrefix) {
		const isGitRepo = await isGitRepository(workspaceFolder.uri.fsPath);
		if (isGitRepo) {
			const generatedName = await generateBranchName(template.gitBranchPrefix, briefText);
			const confirmedName = await vscode.window.showInputBox({
				title: 'Confirm Branch Name',
				prompt: 'Edit the branch name if needed, then press Enter to create it',
				value: generatedName,
				ignoreFocusOut: true
			});
			if (!confirmedName?.trim()) {
				return;
			}

			const result = await createBranch(workspaceFolder.uri.fsPath, confirmedName.trim());
			if (!result.success) {
				void vscode.window.showErrorMessage(`Failed to create branch: ${result.error}`);
				return;
			}
			branchName = confirmedName.trim();
			void vscode.window.showInformationMessage(`Created branch: ${branchName}`);
		}
	}

	const now = new Date().toISOString();
	const pipelineState: ActivePipelineState = {
		templateId,
		branchName,
		currentStepIndex: 0,
		stepConfigs: [],
		createdAt: now,
		updatedAt: now
	};

	await saveActivePipelineState(context, workspaceFolder, pipelineState);
	Logger.info(`[pipeline] Started pipeline ${templateId} with branch ${branchName ?? 'none'}`);

	await advancePipeline(context, workspaceFolder, configuration);
}

export async function advancePipeline(
	context: vscode.ExtensionContext,
	workspaceFolder: vscode.WorkspaceFolder,
	configuration: ExtensionConfiguration
): Promise<void> {
	const pipelineState = readActivePipelineState(context, workspaceFolder);
	if (!pipelineState) {
		void vscode.window.showWarningMessage('No active pipeline found.');
		return;
	}

	const template = PIPELINE_TEMPLATES[pipelineState.templateId];
	if (pipelineState.currentStepIndex >= template.steps.length) {
		await finalizePipeline(context, workspaceFolder);
		return;
	}

	const stepPreset = template.steps[pipelineState.currentStepIndex];
	const stepNumber = pipelineState.currentStepIndex + 1;
	const stepLabel = WORKFLOW_PRESETS[stepPreset]?.label ?? stepPreset;

	// Build default plan to show current provider/model
	const defaultPlan = buildSmartDefaultWorkflowPlan(stepPreset, configuration);
	const defaultProviderLabel = getProviderLabel(defaultPlan.provider);
	const defaultModelLabel = formatProviderModel(defaultPlan.provider, defaultPlan.providerModel);

	const actionItems = [
		{
			label: `$(play) Continue with ${defaultProviderLabel} · ${defaultModelLabel}`,
			description: `Step ${stepNumber}/${template.steps.length}: ${stepLabel}`,
			action: 'continue' as const
		},
		{
			label: '$(settings-gear) Change agent',
			description: 'Select a different provider, account, or model for this step',
			action: 'change-agent' as const
		},
		{
			label: '$(close) Abort pipeline',
			description: 'Stop the pipeline and keep the current branch',
			action: 'abort' as const
		}
	];

	const selection = await vscode.window.showQuickPick(actionItems, {
		title: `Pipeline: ${template.label} — Step ${stepNumber}/${template.steps.length}: ${stepLabel}`,
		placeHolder: 'Choose how to run this step',
		ignoreFocusOut: true
	});

	if (!selection || selection.action === 'abort') {
		await abortPipeline(context, workspaceFolder);
		return;
	}

	let stepConfig: PipelineStepConfig = {
		preset: stepPreset,
		label: stepLabel,
		provider: defaultPlan.provider,
		providerModel: defaultPlan.providerModel,
		providerAccountId: defaultPlan.providerAccountId,
		claudeAccountId: defaultPlan.claudeAccountId,
		claudeEffort: defaultPlan.claudeEffort
	};

	if (selection.action === 'change-agent') {
		const customConfig = await promptForStepAgentConfig(stepPreset, stepLabel, configuration);
		if (!customConfig) {
			return;
		}
		stepConfig = customConfig;
	}

	// Build execution plan
	const workflowPlan = buildSmartDefaultWorkflowPlan(stepPreset, configuration);
	workflowPlan.provider = stepConfig.provider ?? workflowPlan.provider;
	workflowPlan.providerModel = stepConfig.providerModel;
	workflowPlan.providerAccountId = stepConfig.providerAccountId;
	workflowPlan.claudeAccountId = stepConfig.claudeAccountId;
	workflowPlan.claudeEffort = stepConfig.claudeEffort;
	workflowPlan.startNewWorkflow = pipelineState.currentStepIndex === 0;
	workflowPlan.workflowId = pipelineState.workflowId;
	workflowPlan.workspaceMode = 'code';

	const projectContext = await gatherProjectContext(context, false, workflowPlan, workspaceFolder);
	if (!projectContext) {
		return;
	}

	await launchProvider(context, workflowPlan, projectContext);

	// Link workflow session id
	const session = await readWorkflowSessionState(workspaceFolder.uri);
	const updatedStepConfigs = [...pipelineState.stepConfigs];
	updatedStepConfigs[pipelineState.currentStepIndex] = stepConfig;

	const updatedState: ActivePipelineState = {
		...pipelineState,
		currentStepIndex: pipelineState.currentStepIndex + 1,
		stepConfigs: updatedStepConfigs,
		workflowId: session?.workflowId ?? pipelineState.workflowId,
		updatedAt: new Date().toISOString()
	};

	await saveActivePipelineState(context, workspaceFolder, updatedState);
	Logger.info(`[pipeline] Completed step ${stepNumber} (${stepPreset}), advancing to step ${updatedState.currentStepIndex + 1}`);

	EventBus.fire('refresh');
}

async function promptForStepAgentConfig(
	preset: WorkflowPreset,
	stepLabel: string,
	configuration: ExtensionConfiguration
): Promise<PipelineStepConfig | undefined> {
	const enabledProviders: ProviderTarget[] = configuration.enabledProviders.length > 0
		? configuration.enabledProviders
		: ['claude', 'gemini', 'copilot'];

	const presetDefinition = WORKFLOW_PRESETS[preset];
	const providerItems = enabledProviders.map((provider) => ({
		label: getProviderLabel(provider),
		description: provider === presetDefinition.recommendedProvider ? 'Recommended for this step' : undefined,
		provider
	}));

	const providerSelection = await vscode.window.showQuickPick(providerItems, {
		title: `Change Agent: ${stepLabel} — Provider`,
		placeHolder: 'Choose the provider for this step',
		ignoreFocusOut: true
	});
	if (!providerSelection) {
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

	return {
		preset,
		label: stepLabel,
		provider: providerSelection.provider,
		providerModel,
		providerAccountId,
		claudeAccountId,
		claudeEffort
	};
}

export async function finalizePipeline(
	context: vscode.ExtensionContext,
	workspaceFolder: vscode.WorkspaceFolder
): Promise<void> {
	const pipelineState = readActivePipelineState(context, workspaceFolder);
	if (!pipelineState) {
		return;
	}

	const template = PIPELINE_TEMPLATES[pipelineState.templateId];

	if (!template.skipGit && pipelineState.branchName) {
		const mergeChoice = await vscode.window.showInformationMessage(
			`Pipeline "${template.label}" complete. Merge ${pipelineState.branchName} into main?`,
			{ modal: false },
			'Merge',
			'Keep Branch'
		);

		if (mergeChoice === 'Merge') {
			const { mergeInto } = await import('../git/gitService.js');
			const result = await mergeInto(workspaceFolder.uri.fsPath, pipelineState.branchName, 'main');
			if (result.success) {
				void vscode.window.showInformationMessage(`Merged ${pipelineState.branchName} into main successfully.`);
			} else {
				void vscode.window.showErrorMessage(`Merge failed: ${result.error}`);
			}
		} else {
			void vscode.window.showInformationMessage(`Pipeline complete. Branch ${pipelineState.branchName} kept.`);
		}
	} else {
		void vscode.window.showInformationMessage(`Pipeline "${template.label}" complete.`);
	}

	await clearActivePipelineState(context, workspaceFolder);
	EventBus.fire('refresh');
}

export async function abortPipeline(
	context: vscode.ExtensionContext,
	workspaceFolder: vscode.WorkspaceFolder
): Promise<void> {
	const pipelineState = readActivePipelineState(context, workspaceFolder);
	if (pipelineState?.branchName) {
		void vscode.window.showInformationMessage(`Pipeline aborted. Branch ${pipelineState.branchName} kept.`);
	} else {
		void vscode.window.showInformationMessage('Pipeline aborted.');
	}

	await clearActivePipelineState(context, workspaceFolder);
	EventBus.fire('refresh');
}
