import * as vscode from 'vscode';
import { renderDesignShellDocument } from '../../webview/designSystem.js';
import {
	CONTEXT_FILE_NAME,
	WORKFLOW_BRIEF_FILE,
	WORKFLOW_HISTORY_INDEX_FILE,
	WORKFLOW_SESSION_FILE,
	PENDING_COPILOT_PROMPT_KEY
} from './constants.js';
import type {
	MetricDisplay,
	ProviderAccountStatus,
	ProviderStatusSnapshot
} from '../providers/types.js';
import { WORKFLOW_PRESETS } from './presets.js';
import type {
	DocumentWorkflowIntentDefinition,
	ExtensionConfiguration,
	LastWorkflowConfig,
	ProviderAccountConfiguration,
	ProviderTarget,
	SourceAnalysisJob,
	SourceAnalysisJobStatus,
	WorkflowDashboardState,
	WorkflowStageStatus,
	WorkflowHistoryEntry,
	WorkflowRole,
	WorkflowSessionState,
	ClaudeEffortLevel,
	WorkflowPreset,
	PipelineTemplateDefinition,
	ActivePipelineState } from './types.js';
import { PIPELINE_TEMPLATES } from './pipelineTemplates.js';
import { capitalize } from "../../utils/index.js";
import { readLastWorkflowConfig, setWorkflowHistoryCollapsed } from './workflowService.js';
import { getWorkspaceModeDefinition } from '../workspace/service.js';
import { getLearningDocumentTypeLabel } from '../documents/service.js';
import { getDocumentWorkflowIntents, getEffectiveWorkflowIntentCopy, getWorkflowIntentCopy } from './presets.js';

export interface WorkflowUiHelpers {
	createNonce(): string;
	escapeHtml(value: string): string;
	getProviderLabel(provider: ProviderTarget): string;
	getExtensionConfiguration(): ExtensionConfiguration;
	findProviderAccount(
		configuration: ExtensionConfiguration,
		provider: ProviderTarget,
		accountId: string | undefined
	): ProviderAccountConfiguration | undefined;
}

function getSourceAnalysisJobStatusLabel(status: SourceAnalysisJobStatus): string {
	switch (status) {
		case 'completed':
			return 'Completed';
		case 'running':
			return 'Running';
		case 'failed':
			return 'Failed';
		case 'queued':
		default:
			return 'Queued';
	}
}

function buildDistributedSourceJobHtml(job: SourceAnalysisJob, helpers: WorkflowUiHelpers): string {
	const statusLabel = getSourceAnalysisJobStatusLabel(job.status);
	const actions = ['queued', 'running', 'completed', 'failed'] as const;
	return `
	<div class="provider-row provider-card" style="gap:10px; align-items:stretch;">
		<div class="provider-title-row" style="align-items:flex-start; gap:8px;">
			<div>
				<strong>${helpers.escapeHtml(job.sourceLabel)}</strong>
				<div class="small provider-detail">${helpers.escapeHtml(job.sourceRelativePath)}</div>
			</div>
			<span class="history-badge provider-badge">${helpers.escapeHtml(statusLabel)}</span>
		</div>
		<div class="small provider-detail">${helpers.escapeHtml(job.outputFile)}</div>
		<div class="actions dense-actions" style="margin-top:4px; flex-wrap:wrap;">
			<button type="button" class="secondary small-btn" data-command="openDistributedSourceAnalysisReport" data-target="${helpers.escapeHtml(job.outputFile)}">Open report</button>
			${actions.map((status) => `<button type="button" class="secondary small-btn" data-command="setDistributedSourceAnalysisJobStatus" data-target="${helpers.escapeHtml(job.id)}" data-status="${status}" ${status === job.status ? 'disabled' : ''}>${helpers.escapeHtml(getSourceAnalysisJobStatusLabel(status))}</button>`).join('')}
		</div>
		${job.completedAt ? `<div class="small provider-refresh-meta">Completed ${helpers.escapeHtml(job.completedAt)}</div>` : ''}
	</div>`;
}

export class WorkflowControlViewProvider implements vscode.WebviewViewProvider {
	private view?: vscode.WebviewView;
	private drawerOpen = false;
	private drawerMode: 'new' | 'continue' = 'new';

	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly loadState: () => Promise<WorkflowDashboardState>,
		private readonly helpers: WorkflowUiHelpers,
		private readonly context: vscode.ExtensionContext
	) {}

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

		webviewView.webview.onDidReceiveMessage(async (message: { command?: string; provider?: ProviderTarget; preset?: string; providerModel?: string; claudeEffort?: string; learningDocumentId?: string; documentIntentId?: string; brief?: string; stageIndex?: number; target?: string; collapsed?: boolean; status?: SourceAnalysisJobStatus }) => {
			switch (message.command) {
				case 'selectWorkspaceMode':
					await vscode.commands.executeCommand('ai-context-orchestrator.selectWorkspaceMode');
					return;
				case 'createLearningDocument':
					await vscode.commands.executeCommand('ai-context-orchestrator.createLearningDocument');
					return;
				case 'switchLearningDocument':
					await vscode.commands.executeCommand('ai-context-orchestrator.switchLearningDocument');
					return;
				case 'openActiveLearningDocument':
					await vscode.commands.executeCommand('ai-context-orchestrator.openActiveLearningDocument');
					return;
				case 'addLearningDocumentSources':
					await vscode.commands.executeCommand('ai-context-orchestrator.addLearningDocumentSources');
					return;
				case 'startDistributedSourceAnalysis':
					await vscode.commands.executeCommand('ai-context-orchestrator.startDistributedSourceAnalysis');
					return;
				case 'manageDistributedSourceAnalysis':
					await vscode.commands.executeCommand('ai-context-orchestrator.manageDistributedSourceAnalysis');
					return;
				case 'openDistributedSourceAnalysisReport':
					await vscode.commands.executeCommand('ai-context-orchestrator.openDistributedSourceAnalysisReport', message.target);
					return;
				case 'setDistributedSourceAnalysisJobStatus':
					await vscode.commands.executeCommand('ai-context-orchestrator.setDistributedSourceAnalysisJobStatus', message.target, message.status);
					return;
				case 'runDistributedSourceSynthesis':
					await vscode.commands.executeCommand('ai-context-orchestrator.runDistributedSourceSynthesis');
					return;
				case 'init':
					await vscode.commands.executeCommand('ai-context-orchestrator.initAI');
					return;
				case 'smartInit':
					await vscode.commands.executeCommand(
						'ai-context-orchestrator.smartInitAI',
						message.preset,
						{
							provider: message.provider,
							providerModel: message.providerModel,
							claudeEffort: message.claudeEffort,
							learningDocumentId: message.learningDocumentId,
							documentIntentId: message.documentIntentId,
							brief: message.brief
						}
					);
					this.drawerOpen = false;
					this.drawerMode = 'new';
					return;
				case 'smartContinue':
					await vscode.commands.executeCommand(
						'ai-context-orchestrator.smartContinueAI',
						{
							preset: message.preset,
							provider: message.provider,
							providerModel: message.providerModel,
							claudeEffort: message.claudeEffort,
							learningDocumentId: message.learningDocumentId,
							documentIntentId: message.documentIntentId,
							brief: message.brief
						}
					);
					this.drawerOpen = false;
					this.drawerMode = 'new';
					return;
				case 'continue':
					await vscode.commands.executeCommand('ai-context-orchestrator.continueWorkflow');
					return;
				case 'refresh':
					this.refresh();
					return;
				case 'resetWorkspaceWorkflowState':
					await vscode.commands.executeCommand('ai-context-orchestrator.resetWorkspaceWorkflowState');
					return;
				case 'resetWorkspaceExtensionPartial':
					await vscode.commands.executeCommand('ai-context-orchestrator.resetWorkspaceExtensionPartial');
					return;
				case 'resetWorkspaceExtension':
					await vscode.commands.executeCommand('ai-context-orchestrator.resetWorkspaceExtension');
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
				case 'connectProviderAccount':
					await vscode.commands.executeCommand('ai-context-orchestrator.connectProviderAccount', message.provider);
					return;
				case 'configureProviderCredential':
					await vscode.commands.executeCommand('ai-context-orchestrator.configureProviderCredential', message.provider);
					return;
				case 'runProviderAuthAssist':
					await vscode.commands.executeCommand('ai-context-orchestrator.runProviderAuthAssist', message.provider);
					return;
				case 'openProviderPortal':
					await vscode.commands.executeCommand('ai-context-orchestrator.openProviderAccountPortal', message.provider);
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
				case 'openObjective':
					await vscode.commands.executeCommand('ai-context-orchestrator.openWorkflowObjective');
					return;
				case 'restoreWorkflowFromHistory':
					await vscode.commands.executeCommand('ai-context-orchestrator.restoreWorkflowFromHistory', message.target);
					return;
				case 'cleanActiveWorkflowFiles':
					await vscode.commands.executeCommand('ai-context-orchestrator.cleanActiveWorkflowFiles');
					return;
				case 'forkWorkflowFromHistory':
					await vscode.commands.executeCommand('ai-context-orchestrator.forkWorkflowFromHistory', message.target);
					return;
				case 'forkWorkflowFromArchivedStage':
					await vscode.commands.executeCommand('ai-context-orchestrator.forkWorkflowFromArchivedStage', message.target);
					return;
				case 'forkWorkflowFromStage':
					await vscode.commands.executeCommand('ai-context-orchestrator.forkWorkflowFromStage', message.stageIndex);
					return;
				case 'deleteWorkflowFromHistory':
					await vscode.commands.executeCommand('ai-context-orchestrator.deleteWorkflowFromHistory', message.target);
					return;
				case 'openStageFile':
					await vscode.commands.executeCommand('ai-context-orchestrator.openWorkflowTreeNode', message.target ? { relativePath: message.target } : undefined);
					return;
				case 'previewPrompt':
					await vscode.commands.executeCommand('ai-context-orchestrator.previewWorkflowPrompt');
					return;
				case 'copyPrompt':
					await vscode.commands.executeCommand('ai-context-orchestrator.copyWorkflowPrompt');
					return;
				case 'markPrepared':
					await vscode.commands.executeCommand('ai-context-orchestrator.setSelectedStagePrepared', message.stageIndex !== undefined ? { stageIndex: message.stageIndex } : undefined);
					return;
				case 'markInProgress':
					await vscode.commands.executeCommand('ai-context-orchestrator.setSelectedStageInProgress', message.stageIndex !== undefined ? { stageIndex: message.stageIndex } : undefined);
					return;
				case 'markCompleted':
					await vscode.commands.executeCommand('ai-context-orchestrator.setSelectedStageCompleted', message.stageIndex !== undefined ? { stageIndex: message.stageIndex } : undefined);
					return;
				case 'openConfigDrawer':
					this.drawerOpen = true;
					this.drawerMode = 'new';
					void this.render(this.view!);
					return;
				case 'openContinueDrawer':
					this.drawerOpen = true;
					this.drawerMode = 'continue';
					void this.render(this.view!);
					return;
				case 'toggleWorkflowHistoryCollapse': {
					if (!message.target) {
						return;
					}
					const state = await this.loadState();
					if (!state.workspaceFolder) {
						return;
					}
					await setWorkflowHistoryCollapsed(this.context, state.workspaceFolder, message.target, Boolean(message.collapsed));
					this.refresh();
					return;
				}
				case 'closeConfigDrawer':
					this.drawerOpen = false;
					this.drawerMode = 'new';
					void this.render(this.view!);
					return;
				case 'copyCopilotPrompt': {
					const prompt = this.context.globalState.get<string>(PENDING_COPILOT_PROMPT_KEY);
					if (prompt) {
						await vscode.env.clipboard.writeText(prompt);
					}
					return;
				}
				case 'dismissCopilotBanner':
					await this.context.globalState.update(PENDING_COPILOT_PROMPT_KEY, undefined);
					this.refresh();
					return;
				case 'configureGitignore':
					await vscode.commands.executeCommand('ai-context-orchestrator.configureGitignore');
					return;
				case 'startPipeline':
					await vscode.commands.executeCommand('ai-context-orchestrator.startPipeline', message.target);
					return;
				case 'abortPipeline':
					await vscode.commands.executeCommand('ai-context-orchestrator.abortPipeline');
					return;
				case 'advancePipelineStep':
					await vscode.commands.executeCommand('ai-context-orchestrator.advancePipelineStep');
					return;
				case 'completePendingCopilotPipelineStep':
					await vscode.commands.executeCommand('ai-context-orchestrator.completePendingCopilotPipelineStep');
					return;
				case 'fetchStagePreview': {
					const stageFile = message.target;
					if (!stageFile || !this.view) { return; }
					const state = await this.loadState();
					if (!state.workspaceFolder) { return; }
					try {
						const fileUri = vscode.Uri.joinPath(state.workspaceFolder.uri, stageFile);
						const bytes = await vscode.workspace.fs.readFile(fileUri);
						const text = Buffer.from(bytes).toString('utf8');
						const html = await vscode.commands.executeCommand<string>('markdown.api.render', text) ?? text;
						void this.view.webview.postMessage({ command: 'stagePreviewLoaded', stageFile, content: html, isHtml: true });
					} catch {
						void this.view.webview.postMessage({ command: 'stagePreviewLoaded', stageFile, content: 'File not available.' });
					}
					return;
				}
			}
		});

		return this.render(webviewView);
	}

	private async render(webviewView: vscode.WebviewView): Promise<void> {
		const state = await this.loadState();
		const nonce = this.helpers.createNonce();
		const lastConfig = this.drawerOpen ? readLastWorkflowConfig(this.context) : undefined;
		webviewView.webview.html = getWorkflowControlHtml(webviewView.webview, state, nonce, this.helpers, this.drawerOpen, lastConfig, this.drawerMode);
	}
}

export function buildWorkflowPromptFromDashboardState(
	state: WorkflowDashboardState,
	helpers: WorkflowUiHelpers
): string | undefined {
	if (!state.session || !state.latestStage) {
		return undefined;
	}

	const presetDefinition = WORKFLOW_PRESETS[state.session.currentPreset];
	const intentCopy = getWorkflowIntentCopy(state.session.currentPreset, state.workspaceModeState?.mode);
	const stageWriteInstruction = `Read ${state.latestStage.stageFile} and write your findings or results back into that file before stopping.`;
	return [
		`Use the ${intentCopy.label} workflow for this project.`,
		`Start by reading ${CONTEXT_FILE_NAME}.`,
		`Read ${WORKFLOW_SESSION_FILE} if it exists.`,
		`Read ${WORKFLOW_BRIEF_FILE} if it exists.`,
		state.session.currentProviderModel ? `Use provider model ${state.session.currentProviderModel}.` : 'Use the provider default model if nothing more specific is configured.',
		state.session.currentProvider === 'claude' && state.session.currentClaudeEffort
			? `Use Claude effort level ${state.session.currentClaudeEffort}.`
			: 'Use the default provider reasoning depth unless the workflow specifies otherwise.',
		`Read upstream handoffs referenced by ${state.latestStage.stageFile} before acting.`,
		state.artifactCount > 0
			? `Use the generated ${helpers.getProviderLabel(state.session.currentProvider)} artifacts when they help.`
			: 'Work directly from the context pack and shared workflow files.',
		intentCopy.launchInstruction,
		stageWriteInstruction
	].join(' ');
}

export function buildWorkflowPromptPreviewDocument(
	state: WorkflowDashboardState,
	prompt: string,
	helpers: WorkflowUiHelpers
): string {
	const session = state.session;
	const latestStage = state.latestStage;
	const stageLabel = session ? getWorkflowIntentCopy(session.currentPreset, state.workspaceModeState?.mode).label : 'Unknown';
	const providerLabel = session ? helpers.getProviderLabel(session.currentProvider) : 'Unknown';
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
		buildProviderLaunchFormPreview(state, prompt, helpers),
		'```'
	].join('\n');
}

export function getWorkflowStageStatusLabel(status: WorkflowStageStatus): string {
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

export function getWorkflowControlHtml(
	webview: vscode.Webview,
	state: WorkflowDashboardState,
	nonce: string,
	helpers: WorkflowUiHelpers,
	drawerOpen: boolean = false,
	lastConfig?: LastWorkflowConfig,
	drawerMode: 'new' | 'continue' = 'new'
): string {
	const configuration = state.configuration ?? helpers.getExtensionConfiguration();
	const defaultPreset = configuration.defaultPreset;
	const defaultProvider = configuration.defaultProvider;
	const defaultModel = defaultProvider === 'claude'
		? configuration.defaultClaudeModel
		: defaultProvider === 'gemini' ? configuration.defaultGeminiModel : 'Copilot';
	const recommendedPreset = state.nextSuggestedPresets[0];
	const latestHandoff = state.latestStage?.stageFile ?? '';
	const historyEntries = state.historyEntries ?? [];

	const heroHtml = state.session
		? buildActiveHero(state, helpers, recommendedPreset)
		: buildInitHero(state, helpers, defaultPreset, defaultProvider, defaultModel, drawerOpen);

	const copilotBannerHtml = state.copilotPendingPrompt ? buildCopilotBannerHtml(helpers) : '';
	const objectiveHtml = state.currentObjective ? buildCurrentObjectiveHtml(state, helpers) : '';

	const stagesHtml = state.session ? `
<details class="mc-section" open>
<summary class="mc-section-header">
	<span class="mc-section-title">Stages</span>
	<span class="mc-section-badge">${state.session.stages.filter((s) => s.status === 'completed').length}/${state.session.stages.length}</span>
</summary>
<div class="mc-section-body">
	<p class="section-footnote">Track the current stage here, open its file, or branch from a checkpoint when you need to split work.</p>
	<div class="stage-pills">
		${state.session.stages.map((stage) => `
		<div class="stage-pill ${stage.status}">
			<div class="stage-meta-row">
				<span class="pill-label">${String(stage.index).padStart(2, '0')} ${helpers.escapeHtml(getWorkflowIntentCopy(stage.preset, state.workspaceModeState?.mode).label)}</span>
				<span class="history-badge stage-badge">${stage.index === state.session?.currentStageIndex ? 'Current' : getWorkflowStageStatusLabel(stage.status)}</span>
			</div>
			<span class="pill-status">${helpers.escapeHtml(stage.stageFile)}</span>
			<div class="pill-actions">
				<button type="button" class="secondary small-btn" data-command="openStageFile" data-target="${helpers.escapeHtml(stage.stageFile)}">Open</button>
				<button type="button" class="secondary small-btn" title="Create a new workflow rooted at this stage checkpoint." data-command="forkWorkflowFromStage" data-stage-index="${stage.index}">Branch here</button>
						<button type="button" class="secondary small-btn" data-command="markCompleted" data-stage-index="${stage.index}">Mark Done</button>
						${state.activePipeline?.pendingManualCompletion?.stepIndex === stage.index - 1 && state.activePipeline.pendingManualCompletion.provider === 'copilot'
							? `<button type="button" class="secondary small-btn" data-command="completePendingCopilotPipelineStep">Marquer comme termine</button>`
							: ''}
			</div>
			<details class="stage-preview" data-stage-file="${helpers.escapeHtml(stage.stageFile)}">
				<summary>Preview findings</summary>
				<div class="stage-preview-body"></div>
			</details>
		</div>`).join('')}
	</div>
</div>
</details>` : '';

	const historyHtml = historyEntries.length > 0
		? buildHistorySection(historyEntries, state.activeWorkflowId, helpers)
		: '';

	// Providers section
	const providerSummary = `${state.providerStatuses.length} available`;
	const providerBody = state.providerStatuses.map((providerStatus) => `
	<div class="provider-row provider-card">
		<div class="provider-title-row">
			<strong>${helpers.escapeHtml(helpers.getProviderLabel(providerStatus.provider))}</strong>
			<span class="history-badge provider-badge">${helpers.escapeHtml(providerStatus.summary)}</span>
		</div>
		<span class="small provider-detail">${helpers.escapeHtml(providerStatus.detail)}</span>
		${buildProviderMetricHtml(providerStatus.metrics, helpers, 3)}
		${providerStatus.lastCheckedAt ? `<span class="small provider-refresh-meta">Last refresh ${helpers.escapeHtml(formatProviderRefreshTime(providerStatus.lastCheckedAt))}</span>` : ''}
		${buildProviderAccountsHtml(providerStatus, helpers)}
		<div class="actions dense-actions" style="margin-top:8px;">
			<button type="button" class="secondary" data-command="switchProviderAccount" data-provider="${providerStatus.provider}">Switch Active</button>
			<button type="button" class="secondary" data-command="connectProviderAccount" data-provider="${providerStatus.provider}">Connect</button>
		</div>
	</div>`).join('');

	const providersHtml = `
<details class="mc-section">
<summary class="mc-section-header">
	<span class="mc-section-title">Providers</span>
	<span class="mc-section-badge small">${helpers.escapeHtml(providerSummary)}</span>
</summary>
<div class="mc-section-body">
	<p class="section-footnote">Keep providers healthy here. The launcher only exposes the options you need for the current workflow.</p>
	${providerBody}
	<div class="actions" style="margin-top:8px;">
		<button type="button" class="secondary" data-command="refreshProviders">Refresh Provider Status</button>
	</div>
</div>
</details>`;

	const learningMode = state.workspaceModeState ? getWorkspaceModeDefinition(state.workspaceModeState.mode) : undefined;
	const hasLearningDocuments = (state.learningDocuments?.length ?? 0) > 0;
	const distributedSourceBatch = state.sourceAnalysisBatch && state.sourceAnalysisBatch.learningDocumentId === state.activeLearningDocument?.id
		? state.sourceAnalysisBatch
		: undefined;
	const canRunDistributedSourceAnalysis = state.activeLearningDocument?.type === 'compte-rendu' && (state.activeLearningDocument.sources.length ?? 0) > 0;
	const distributedBatchJobsHtml = distributedSourceBatch
		? `<div style="margin-top:12px; display:grid; gap:8px;">${distributedSourceBatch.jobs.map((job) => buildDistributedSourceJobHtml(job, helpers)).join('')}</div>`
		: '';
	const completedDistributedJobs = distributedSourceBatch?.jobs.filter((job) => job.status === 'completed').length ?? 0;
	const distributedSourceHtml = canRunDistributedSourceAnalysis ? `
	<div class="actions" style="margin-top:8px; flex-wrap:wrap;">
		<button type="button" class="secondary" data-command="startDistributedSourceAnalysis">Analyser les sources en parallèle</button>
		<button type="button" class="secondary" data-command="manageDistributedSourceAnalysis" ${distributedSourceBatch ? '' : 'disabled'}>Gérer le batch</button>
		<button type="button" class="secondary" data-command="runDistributedSourceSynthesis" ${distributedSourceBatch ? '' : 'disabled'}>Lancer la synthèse</button>
	</div>
	<p class="section-footnote" style="margin-top:8px;">${distributedSourceBatch
		? helpers.escapeHtml(`Batch ${distributedSourceBatch.batchId} · ${completedDistributedJobs}/${distributedSourceBatch.jobs.length} job(s) completed`)
		: 'Le mode distribué crée un fichier d’analyse par source dans .ai-orchestrator/analysis puis lance une synthèse finale.'}</p>
	${distributedBatchJobsHtml}` : '';
	const learningDocumentsHtml = learningMode?.supportsLearningDocuments ? `
<details class="mc-section" open>
<summary class="mc-section-header">
	<span class="mc-section-title">Learning Documents</span>
	<span class="mc-section-badge">${state.learningDocuments?.length ?? 0} document(s)</span>
</summary>
<div class="mc-section-body">
	<p class="section-footnote">${hasLearningDocuments ? `Le mode ${helpers.escapeHtml(learningMode.label)} active la création de documents et l’import de sources locales.` : `Le mode ${helpers.escapeHtml(learningMode.label)} attend d’abord un document de travail. Commencez par créer un compte-rendu ou un autre document learning-kit.`}</p>
	<div class="shortcuts">
		<button type="button" class="linkButton" data-command="openActiveLearningDocument" ${state.activeLearningDocument ? '' : 'disabled'}>Document actif<span>${helpers.escapeHtml(state.activeLearningDocument ? `${state.activeLearningDocument.title} · ${getLearningDocumentTypeLabel(state.activeLearningDocument.type)}` : 'Aucun')}</span></button>
		<button type="button" class="linkButton" data-command="switchLearningDocument" ${(state.learningDocuments?.length ?? 0) > 0 ? '' : 'disabled'}>Changer<span>${helpers.escapeHtml(state.activeLearningDocument?.relativeDirectory ?? 'Aucun document')}</span></button>
		<button type="button" class="linkButton" data-command="addLearningDocumentSources" ${state.activeLearningDocument ? '' : 'disabled'}>Sources<span>${helpers.escapeHtml(state.activeLearningDocument ? `${state.activeLearningDocument.sources.length} importée(s)` : 'Aucune')}</span></button>
	</div>
	${hasLearningDocuments ? '' : `<div class="actions" style="margin-top:8px;"><button type="button" data-command="createLearningDocument">Créer votre premier document</button></div>`}
	<div class="actions" style="margin-top:8px;">
		<button type="button" class="secondary" data-command="createLearningDocument">Créer un document</button>
	</div>
	${distributedSourceHtml}
</div>
</details>` : '';

	const quickFilesCount = [state.contextFileExists, Boolean(state.brief), Boolean(state.latestStage), Boolean(state.session)].filter(Boolean).length;
	const filesHtml = `
<details class="mc-section">
<summary class="mc-section-header">
	<span class="mc-section-title">Quick Files</span>
	<span class="mc-section-badge">${quickFilesCount} ready</span>
</summary>
<div class="mc-section-body">
	<p class="section-footnote">Open the current workflow assets directly without leaving the sidebar.</p>
	<div class="shortcuts">
		<button type="button" class="linkButton" data-command="openContext" ${state.contextFileExists ? '' : 'disabled'}>Context Pack<span>${helpers.escapeHtml(CONTEXT_FILE_NAME)}</span></button>
		<button type="button" class="linkButton" data-command="openObjective" ${state.currentObjective ? '' : 'disabled'}>Objectif<span>${helpers.escapeHtml(state.currentObjective?.relativePath ?? 'Aucun')}</span></button>
		<button type="button" class="linkButton" data-command="openBrief" ${state.brief ? '' : 'disabled'}>Brief<span>${helpers.escapeHtml(state.brief ? state.brief.taskType : 'No brief')}</span></button>
		<button type="button" class="linkButton" data-command="openLatestHandoff" ${state.latestStage ? '' : 'disabled'}>Latest Handoff<span>${helpers.escapeHtml(latestHandoff || 'None')}</span></button>
		<button type="button" class="linkButton" data-command="openSession" ${state.session ? '' : 'disabled'}>Session<span>${helpers.escapeHtml(WORKFLOW_SESSION_FILE)}</span></button>
		<button type="button" class="linkButton" data-command="previewPrompt" ${state.session ? '' : 'disabled'}>Prompt<span>Preview launch prompt</span></button>
		<button type="button" class="linkButton" data-command="copyPrompt" ${state.session ? '' : 'disabled'}>Copy<span>Copy launch prompt</span></button>
	</div>
	<div class="actions" style="margin-top:8px;">
		<button type="button" class="secondary" data-command="resetWorkspaceWorkflowState">Reset Workflow</button>
		<button type="button" class="secondary" data-command="resetWorkspaceExtensionPartial">Reset Orchestration</button>
		<button type="button" class="secondary" data-command="resetWorkspaceExtension">Reset Complete</button>
		<button type="button" class="secondary" data-command="cleanActiveWorkflowFiles" ${state.activeWorkflowId ? '' : 'disabled'}>Clean Active Generated Files</button>
	</div>
</div>
</details>`;

	const governanceHtml = buildArtifactGovernanceHtml(state, helpers);

	const claudeModels = ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'];
	const geminiModels = ['gemini-3.1-pro-preview', 'gemini-2.5-pro', 'gemini-2.5-flash'];

	const continuePrefill = drawerMode === 'continue' && state.session ? {
		preset: state.nextSuggestedPresets[0] ?? state.session.currentPreset,
		provider: state.session.currentProvider,
		providerModel: state.session.currentProviderModel,
		claudeEffort: state.session.currentClaudeEffort,
		brief: state.brief?.goal
	} : undefined;

	const drawerHtml = drawerOpen
		? buildConfigDrawerHtml(state, helpers, lastConfig, configuration, drawerMode, continuePrefill)
		: '';

	const primarySectionsHtml = learningMode?.supportsLearningDocuments
		? `${learningDocumentsHtml}
${providersHtml}
${filesHtml}`
		: `${providersHtml}
${filesHtml}
${learningDocumentsHtml}`;

	const isCodeMode = state.workspaceModeState?.mode === 'code';
	const activePipelineHtml = isCodeMode && state.activePipeline
		? buildActivePipelineHtml(state.activePipeline, helpers)
		: '';
	const pipelinePickerHtml = isCodeMode && !state.activePipeline && state.availablePipelineTemplates?.length
		? buildPipelinePickerHtml(state.availablePipelineTemplates, helpers)
		: '';

	const contentHtml = `
${copilotBannerHtml}
${objectiveHtml}
${activePipelineHtml}
${drawerHtml}
${heroHtml}
${historyHtml}
${stagesHtml}
${pipelinePickerHtml}
${primarySectionsHtml}
${governanceHtml}
	${state.session ? `<div style="margin-top:4px;">
	<button type="button" data-command="init" class="secondary">+ New Workflow</button>
</div>` : ''}`;

	const scriptBody = `
// ── History tree collapse ──
for (var historyToggle of document.querySelectorAll('.history-toggle')) {
	historyToggle.addEventListener('click', (function(toggleBtn) { return function() {
		var nextCollapsed = toggleBtn.getAttribute('data-collapsed') !== 'true';
		vscode.postMessage({
			command: 'toggleWorkflowHistoryCollapse',
			target: toggleBtn.getAttribute('data-workflow-id') || undefined,
			collapsed: nextCollapsed
		});
	}; })(historyToggle));
}

// ── Stage mark buttons ──
for (var markBtn of document.querySelectorAll('button[data-stage-index]')) {
	markBtn.addEventListener('click', (function(b) { return function() {
		vscode.postMessage({ command: b.dataset.command, stageIndex: Number(b.dataset.stageIndex) });
	}; })(markBtn));
}

// ── Stage preview ──
for (var det of document.querySelectorAll('.stage-preview')) {
	det.addEventListener('toggle', (function(d) { return function() {
		if (d.open && !d.dataset.loaded) {
			vscode.postMessage({ command: 'fetchStagePreview', target: d.dataset.stageFile });
		}
	}; })(det));
}
window.addEventListener('message', function(event) {
	var msg = event.data;
	if (msg.command === 'stagePreviewLoaded') {
		var previewEl = document.querySelector('.stage-preview[data-stage-file="' + msg.stageFile + '"]');
		if (previewEl) {
			previewEl.dataset.loaded = '1';
			var body = previewEl.querySelector('.stage-preview-body');
			if (body) { if (msg.isHtml) { body.innerHTML = msg.content; } else { body.textContent = msg.content; } }
		}
	}
});

// ── Composer state ──
var drawerPreset = '${continuePrefill?.preset ?? lastConfig?.preset ?? defaultPreset}';
var drawerProvider = '${continuePrefill?.provider ?? lastConfig?.provider ?? defaultProvider}';
var drawerEffort = '${continuePrefill?.claudeEffort ?? lastConfig?.claudeEffort ?? 'medium'}';
var drawerMode = '${drawerMode}';
var drawerLearningDocumentEnabled = ${learningMode?.supportsLearningDocuments ? 'true' : 'false'};
var drawerLearningDocumentId = '${lastConfig?.learningDocumentId ?? state.activeLearningDocument?.id ?? ''}';
var drawerDocumentIntentId = '${lastConfig?.documentIntentId ?? ''}';
var DRAWER_INTENT_COPY = ${JSON.stringify(Object.fromEntries(Object.values(WORKFLOW_PRESETS).map((presetDefinition) => [presetDefinition.preset, getWorkflowIntentCopy(presetDefinition.preset, state.workspaceModeState?.mode)])))};
var DRAWER_PRESET_ORDER = ${JSON.stringify(Object.values(WORKFLOW_PRESETS).map((presetDefinition) => presetDefinition.preset))};
var DRAWER_DOCUMENTS = ${JSON.stringify(Object.fromEntries((state.learningDocuments ?? []).map((document) => [document.id, { id: document.id, type: document.type, title: document.title }]))) };
var DRAWER_DOCUMENT_INTENTS = ${JSON.stringify(Object.fromEntries([...new Set((state.learningDocuments ?? []).map((document) => document.type))].map((documentType) => [documentType, getDocumentWorkflowIntents(documentType).map((intent) => ({ id: intent.id, preset: intent.preset, label: intent.label, briefPrompt: intent.briefPrompt, briefPlaceholder: intent.briefPlaceholder }))])))};
var CLAUDE_MODELS = ${JSON.stringify(claudeModels)};
var GEMINI_MODELS = ${JSON.stringify(geminiModels)};

function getIntentCopy(preset) {
	return DRAWER_INTENT_COPY[preset] || {
		briefPrompt: 'Describe the objective for this stage.',
		briefPlaceholder: 'Describe the objective for this stage...'
	};
}

function getSelectedDocumentType() {
	if (!drawerLearningDocumentEnabled || !drawerLearningDocumentId) { return undefined; }
	var documentInfo = DRAWER_DOCUMENTS[drawerLearningDocumentId];
	return documentInfo ? documentInfo.type : undefined;
}

function getDocumentIntentOptions(documentType) {
	return documentType ? (DRAWER_DOCUMENT_INTENTS[documentType] || []) : [];
}

function getCurrentIntentOptions() {
	var documentIntentOptions = getDocumentIntentOptions(getSelectedDocumentType());
	if (documentIntentOptions.length > 0) {
		return documentIntentOptions.map(function(intent) {
			return {
				field: 'intent',
				id: intent.id,
				preset: intent.preset,
				label: intent.label,
				briefPrompt: intent.briefPrompt,
				briefPlaceholder: intent.briefPlaceholder
			};
		});
	}

	return DRAWER_PRESET_ORDER.map(function(preset) {
		var intentCopy = getIntentCopy(preset);
		return {
			field: 'preset',
			id: preset,
			preset: preset,
			label: intentCopy.label || preset,
			briefPrompt: intentCopy.briefPrompt,
			briefPlaceholder: intentCopy.briefPlaceholder
		};
	});
}

function syncIntentSelection() {
	var intentOptions = getCurrentIntentOptions();
	if (!intentOptions.length) {
		drawerDocumentIntentId = '';
		return;
	}
	var documentIntentOption = intentOptions.find(function(option) { return option.field === 'intent' && option.id === drawerDocumentIntentId; });
	if (documentIntentOption) {
		drawerPreset = documentIntentOption.preset;
		return;
	}
	var presetOption = intentOptions.find(function(option) { return option.field === 'preset' && option.id === drawerPreset; }) || intentOptions[0];
		drawerPreset = presetOption.preset;
		drawerDocumentIntentId = presetOption.field === 'intent' ? presetOption.id : '';
	}

function renderIntentPills() {
	var container = document.getElementById('intent-pills');
	if (!container) { return; }
	var intentOptions = getCurrentIntentOptions();
	container.innerHTML = intentOptions.map(function(option) {
		var isActive = option.field === 'intent' ? option.id === drawerDocumentIntentId : option.id === drawerPreset;
		var presetAttr = option.preset ? ' data-preset="' + option.preset + '"' : '';
		return '<button type="button" class="drawer-pill ' + (isActive ? 'active' : '') + '" data-field="' + option.field + '" data-value="' + option.id + '"' + presetAttr + '>' + option.label + '</button>';
	}).join('');
	updateSelectionSummary();
	updateLaunchState();
}

function getCurrentIntentSelection() {
	var intentOptions = getCurrentIntentOptions();
	var selected = intentOptions.find(function(option) { return option.field === 'intent' ? option.id === drawerDocumentIntentId : option.id === drawerPreset; });
	return selected || intentOptions[0] || { preset: drawerPreset, label: drawerPreset, briefPrompt: 'Describe the objective for this stage.', briefPlaceholder: 'Describe the objective for this stage...' };
}

function requiresBrief() {
	return drawerDocumentIntentId ? true : drawerPreset !== 'explore';
}

function getModels(provider) {
	if (provider === 'gemini') { return GEMINI_MODELS; }
	if (provider === 'copilot') { return ['default']; }
	return CLAUDE_MODELS;
}

function updateModelSelect(provider, currentModel) {
	var sel = document.getElementById('drawer-model');
	if (!sel) { return; }
	var models = getModels(provider);
	var resolvedModel = models.indexOf(currentModel) >= 0 ? currentModel : models[0];
	sel.innerHTML = models.map(function(m) {
		return '<option value="' + m + '"' + (m === resolvedModel ? ' selected' : '') + '>' + m + '</option>';
	}).join('');
	updateSelectionSummary();
}

function updateEffortVisibility(provider) {
	var row = document.getElementById('effort-field');
	if (!row) { return; }
	var visible = provider === 'claude';
	row.hidden = !visible;
	row.setAttribute('aria-hidden', visible ? 'false' : 'true');
	updateSelectionSummary();
}

function updateBriefVisibility(preset) {
	var row = document.getElementById('brief-field');
	var help = document.getElementById('brief-help');
	var hint = document.getElementById('brief-hint');
	var visible = requiresBrief();
	if (row) {
		row.hidden = !visible;
		row.setAttribute('aria-hidden', visible ? 'false' : 'true');
	}
	if (help) {
		var intent = getCurrentIntentSelection();
		help.textContent = visible
			? intent.briefPrompt
			: 'Optional for Explore. Leave it empty to start with the current workspace context.';
	}
	if (hint) {
		hint.textContent = visible
			? (drawerLearningDocumentEnabled
				? 'Le brief sert de cible concrète pour le document, ses sections et ses sources.'
				: (drawerMode === 'continue'
					? 'This brief will guide the continuation prompt for the next stage.'
					: 'You can refine scope or constraints here.'))
			: 'Explore starts faster without a brief.';
	}
	var ta = document.getElementById('drawer-brief');
	if (ta) {
		var intent = getCurrentIntentSelection();
		ta.placeholder = intent.briefPlaceholder || 'Describe the objective...';
	}
	updateLaunchState();
	updateSelectionSummary();
}

function updateProviderHelp(provider) {
	var help = document.getElementById('provider-help');
	if (!help) { return; }
	if (provider === 'claude') {
		help.textContent = 'Best when you want deeper reasoning. Effort controls quality, speed, and cost.';
		return;
	}
	if (provider === 'gemini') {
		help.textContent = 'Good default for broad analysis and faster iteration.';
		return;
	}
	help.textContent = 'Uses the active Copilot setup. Model selection stays minimal.';
}

function updateAdvancedSummary() {
	var summary = document.getElementById('advanced-summary');
	var modelEl = document.getElementById('drawer-model');
	if (!summary || !modelEl) { return; }
	var parts = ['Model: ' + modelEl.value];
	if (drawerProvider === 'claude') {
		parts.push('Effort: ' + drawerEffort);
	}
	summary.textContent = parts.join(' · ');
}

function updateSelectionSummary() {
	var summary = document.getElementById('launch-summary');
	var modelEl = document.getElementById('drawer-model');
	if (!summary || !modelEl) { return; }
	var presetLabelEl = document.querySelector('#intent-pills .drawer-pill.active');
	var providerLabelEl = document.querySelector('.drawer-pill[data-field="provider"].active');
	var presetLabel = presetLabelEl ? presetLabelEl.textContent : getCurrentIntentSelection().label;
	var providerLabel = providerLabelEl ? providerLabelEl.textContent : drawerProvider;
	var detail = presetLabel + ' with ' + providerLabel + ' · ' + modelEl.value;
	if (drawerProvider === 'claude') {
		detail += ' · ' + drawerEffort + ' effort';
	}
	if (drawerLearningDocumentEnabled) {
		var docEl = document.getElementById('drawer-learning-document');
		if (docEl && docEl.value) {
			var option = docEl.options[docEl.selectedIndex];
			detail += ' · ' + option.text;
		}
	}
	summary.textContent = detail;
	updateAdvancedSummary();
}

function updateLaunchState() {
	var launchBtn = document.getElementById('drawer-launch-btn');
	var message = document.getElementById('launch-validation');
	var briefEl = document.getElementById('drawer-brief');
	if (!launchBtn || !message) { return; }
	var needsBrief = requiresBrief();
	var briefValue = briefEl ? briefEl.value.trim() : '';
	var docEl = document.getElementById('drawer-learning-document');
	var hasDocument = !drawerLearningDocumentEnabled || (docEl && docEl.value);
	var isValid = (!needsBrief || briefValue.length > 0) && !!hasDocument;
	launchBtn.disabled = !isValid;
	message.textContent = isValid
		? (drawerLearningDocumentEnabled ? 'Launch uses the selected learning document and current provider settings.' : 'Launch uses the current provider and remembers this setup for next time.')
		: (!hasDocument ? 'Create or select a learning document before launching.' : 'Add a brief before launching this workflow.');
	}

function focusComposer() {
	var briefField = document.getElementById('brief-field');
	var focusTarget = !requiresBrief() || (briefField && briefField.hidden)
		? document.querySelector('.drawer-pill[data-field="provider"].active')
		: document.getElementById('drawer-brief');
	if (focusTarget && typeof focusTarget.focus === 'function') {
		focusTarget.focus();
	}
}

document.addEventListener('click', function(event) {
	var target = event.target;
	if (!(target instanceof Element)) { return; }
	var pill = target.closest('.drawer-pill');
	if (!pill) { return; }
	var field = pill.getAttribute('data-field');
	var value = pill.getAttribute('data-value') || '';
	var container = pill.closest('.drawer-pills');
	if (container) {
		for (var activePill of container.querySelectorAll('.drawer-pill')) { activePill.classList.remove('active'); }
	}
	pill.classList.add('active');
	if (field === 'intent') {
		drawerDocumentIntentId = value;
		drawerPreset = pill.getAttribute('data-preset') || drawerPreset;
		updateBriefVisibility(drawerPreset);
		return;
	}
	if (field === 'preset') {
		drawerDocumentIntentId = '';
		drawerPreset = value;
		updateBriefVisibility(value);
		return;
	}
	if (field === 'provider') {
		drawerProvider = value;
		var sel = document.getElementById('drawer-model');
		updateModelSelect(value, sel ? sel.value : '');
		updateEffortVisibility(value);
		updateProviderHelp(value);
		return;
	}
	if (field === 'effort') {
		drawerEffort = value;
		updateSelectionSummary();
	}
});

var modelSelect = document.getElementById('drawer-model');
if (modelSelect) {
	modelSelect.addEventListener('change', updateSelectionSummary);
}
var briefInput = document.getElementById('drawer-brief');
if (briefInput) {
	briefInput.addEventListener('input', updateLaunchState);
}
var learningDocumentSelect = document.getElementById('drawer-learning-document');
if (learningDocumentSelect) {
	learningDocumentSelect.addEventListener('change', function() {
		drawerLearningDocumentId = learningDocumentSelect.value;
		syncIntentSelection();
		renderIntentPills();
		updateBriefVisibility(drawerPreset);
		updateSelectionSummary();
		updateLaunchState();
	});
}

function triggerLaunch() {
	if (!drawerLaunchBtn || drawerLaunchBtn.disabled) {
		return;
	}
	var modelEl = document.getElementById('drawer-model');
	var briefEl = document.getElementById('drawer-brief');
	var cmd = drawerMode === 'continue' ? 'smartContinue' : 'smartInit';
	vscode.postMessage({
		command: cmd,
		preset: drawerPreset,
		provider: drawerProvider,
		providerModel: modelEl ? modelEl.value : undefined,
		claudeEffort: drawerProvider === 'claude' ? drawerEffort : undefined,
		learningDocumentId: drawerLearningDocumentEnabled ? drawerLearningDocumentId || undefined : undefined,
		documentIntentId: drawerDocumentIntentId || undefined,
		brief: (briefEl && briefEl.value.trim()) ? briefEl.value.trim() : undefined
	});
}

// Close composer
function closeDrawer() { vscode.postMessage({ command: 'closeConfigDrawer' }); }
var closeBtn = document.getElementById('drawer-close-btn');
if (closeBtn) { closeBtn.addEventListener('click', closeDrawer); }
var cancelBtn = document.getElementById('drawer-cancel-btn');
if (cancelBtn) { cancelBtn.addEventListener('click', closeDrawer); }
document.addEventListener('keydown', function(event) {
	if (event.key === 'Escape' && document.getElementById('mc-drawer')) {
		event.preventDefault();
		closeDrawer();
	}
	if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && document.getElementById('mc-drawer')) {
		event.preventDefault();
		triggerLaunch();
	}
});

// Launch from composer
var drawerLaunchBtn = document.getElementById('drawer-launch-btn');
if (drawerLaunchBtn) {
	drawerLaunchBtn.addEventListener('click', triggerLaunch);
}

updateModelSelect(drawerProvider, '${continuePrefill?.providerModel ?? lastConfig?.providerModel ?? defaultModel}');
syncIntentSelection();
renderIntentPills();
updateProviderHelp(drawerProvider);
updateEffortVisibility(drawerProvider);
updateBriefVisibility(drawerPreset);
updateLaunchState();
if (document.getElementById('mc-drawer')) {
	focusComposer();
}
`;

	return renderDesignShellDocument({
		webview,
		nonce,
		title: state.workspaceFolder?.name ?? 'AI Workflow',
		kicker: 'Mission Control',
		contentHtml,
		scriptBody,
		layout: 'sidebar'
	});
}

function buildInitHero(state: WorkflowDashboardState, helpers: WorkflowUiHelpers, defaultPreset: string, defaultProvider: string, defaultModel: string, drawerOpen: boolean): string {
	const workspaceMode = state.workspaceModeState ? getWorkspaceModeDefinition(state.workspaceModeState.mode) : undefined;
	const hasLearningDocuments = (state.learningDocuments?.length ?? 0) > 0;
	const defaultIntentLabel = getWorkflowIntentCopy(defaultPreset as WorkflowPreset, state.workspaceModeState?.mode).label;
	const modeLine = workspaceMode
		? `<div class="stat"><strong>Workspace mode</strong><span>${helpers.escapeHtml(workspaceMode.label)}</span></div>`
		: `<div class="stat"><strong>Workspace mode</strong><span>Non défini</span></div>`;
	const secondLine = workspaceMode?.supportsLearningDocuments
		? `<div class="stat"><strong>Document actif</strong><span>${helpers.escapeHtml(state.activeLearningDocument ? `${state.activeLearningDocument.title} · ${getLearningDocumentTypeLabel(state.activeLearningDocument.type)}` : 'Aucun document')}</span></div>`
		: `<div class="stat"><strong>Fast path</strong><span>Goal, provider, optional brief, then launch.</span></div>`;
	const extraActions = workspaceMode?.supportsLearningDocuments
		? `${hasLearningDocuments
			? `<button type="button" class="secondary" data-command="createLearningDocument">Créer un document</button>
		<button type="button" class="secondary" data-command="addLearningDocumentSources" ${state.activeLearningDocument ? '' : 'disabled'}>Importer des sources</button>`
			: `<button type="button" data-command="createLearningDocument">Créer votre premier document</button>`}`
		: `<button type="button" class="secondary" data-command="init">Open full setup</button>`;
	return `
<section class="card hero">
	<div class="kicker">No active workflow</div>
	<h3>${workspaceMode?.supportsLearningDocuments ? 'Piloter un document depuis la sidebar' : 'Start a workflow from the sidebar'}</h3>
	<p class="lead">${workspaceMode?.supportsLearningDocuments ? (hasLearningDocuments ? 'Choisissez un document cible, importez vos sources, puis lancez le provider avec un prompt adapté au template actif.' : 'Commencez par créer un document de travail. Une fois le document détecté, vous pourrez choisir le mode de travail et lancer l’IA dessus.') : 'Use the quick launcher for the common path, then open advanced settings only when you need to change model or provider-specific tuning.'}</p>
	<div class="stat-grid" style="margin-top:12px;">
		${modeLine}
		<div class="stat">
			<strong>Default route</strong>
			<span>${helpers.escapeHtml(defaultIntentLabel)} · ${helpers.escapeHtml(defaultProvider)} · ${helpers.escapeHtml(defaultModel)}</span>
		</div>
		${secondLine}
	</div>
	<div class="actions" style="margin-top:10px;">
		<button type="button" class="secondary" data-command="selectWorkspaceMode">${workspaceMode ? 'Changer le type de workspace' : 'Choisir le type de workspace'}</button>
		<button type="button" data-command="${drawerOpen ? 'closeConfigDrawer' : 'openConfigDrawer'}" aria-expanded="${drawerOpen ? 'true' : 'false'}" aria-controls="mc-drawer" ${drawerOpen ? '' : 'autofocus'} ${workspaceMode?.supportsLearningDocuments && !hasLearningDocuments ? 'disabled' : ''}>${drawerOpen ? 'Hide launcher' : 'Start workflow'}</button>
		${extraActions}
	</div>
</section>`;
}

function buildCopilotBannerHtml(helpers: WorkflowUiHelpers): string {
	return `
<div class="copilot-banner">
	<div class="copilot-banner-header">
		<span class="copilot-banner-title">Copilot Chat is open</span>
		<button type="button" class="secondary small-btn" data-command="dismissCopilotBanner">Dismiss</button>
	</div>
	<p class="copilot-banner-steps">1. Paste the prompt &nbsp;<kbd>Ctrl+V</kbd>&nbsp;&nbsp; 2. Press Enter</p>
	<div class="actions" style="margin-top:8px;">
		<button type="button" class="secondary" data-command="copyCopilotPrompt">Copy prompt again</button>
	</div>
</div>`;
}

function buildProviderAccountsHtml(providerStatus: ProviderStatusSnapshot, helpers: WorkflowUiHelpers): string {
	if (!providerStatus.accounts || providerStatus.accounts.length === 0) {
		return '';
	}

	const accountsHtml = providerStatus.accounts.map((account) => buildProviderAccountHtml(account, helpers)).join('');
	return `
	<div class="provider-account-list">
		${accountsHtml}
	</div>`;
}

function buildProviderAccountHtml(account: ProviderAccountStatus, helpers: WorkflowUiHelpers): string {
	const refreshLabel = account.lastCheckedAt
		? `Last refresh ${formatProviderRefreshTime(account.lastCheckedAt)}`
		: 'Not refreshed yet';
	return `
	<div class="provider-account ${account.isActive ? 'active' : ''}">
		<div class="provider-account-header">
			<strong>${helpers.escapeHtml(account.label)}</strong>
			<div class="provider-account-badges">
				${account.isActive ? '<span class="history-badge provider-account-badge">Active</span>' : ''}
				<span class="history-badge provider-account-badge availability-${helpers.escapeHtml(account.availability)}">${helpers.escapeHtml(capitalize(account.availability))}</span>
			</div>
		</div>
		<div class="provider-account-summary">${helpers.escapeHtml(account.summary)}</div>
		<div class="small provider-account-detail">${helpers.escapeHtml(account.detail)}</div>
		${buildProviderMetricHtml(account.metrics, helpers, 4)}
		<div class="small provider-refresh-meta">${helpers.escapeHtml(refreshLabel)}</div>
	</div>`;
}

function buildProviderMetricHtml(metrics: MetricDisplay[], helpers: WorkflowUiHelpers, limit: number): string {
	if (metrics.length === 0) {
		return '';
	}

	const visibleMetrics = metrics.slice(0, limit);
	return `
	<div class="stat-grid provider-metric-grid">
		${visibleMetrics.map((metric) => `
		<div class="stat tone-${metric.tone ?? 'normal'}">
			<strong>${helpers.escapeHtml(metric.label)}</strong>
			<span>${helpers.escapeHtml(metric.value)}</span>
		</div>`).join('')}
	</div>`;
}

function formatProviderRefreshTime(value: string): string {
	const timestamp = new Date(value);
	if (Number.isNaN(timestamp.getTime())) {
		return value;
	}

	return new Intl.DateTimeFormat(undefined, {
		dateStyle: 'short',
		timeStyle: 'short'
	}).format(timestamp);
}

function buildHistorySection(
	historyEntries: WorkflowHistoryEntry[],
	activeWorkflowId: string | undefined,
	helpers: WorkflowUiHelpers
): string {
	const entryById = new Map(historyEntries.map((entry) => [entry.workflowId, entry]));
	const childrenByParentId = new Map<string, WorkflowHistoryEntry[]>();
	const forcedExpandedIds = new Set<string>();

	for (const entry of historyEntries) {
		if (entry.parentWorkflowId) {
			const children = childrenByParentId.get(entry.parentWorkflowId) ?? [];
			children.push(entry);
			childrenByParentId.set(entry.parentWorkflowId, children);
		}
	}

	// Roots: no parent, or parent not present in current entries
	const roots = historyEntries.filter((entry) =>
		!entry.parentWorkflowId || !entryById.has(entry.parentWorkflowId)
	);

	const historyCount = historyEntries.length;
	const activeEntry = activeWorkflowId ? historyEntries.find((entry) => entry.workflowId === activeWorkflowId) : undefined;
	let ancestorEntry = activeWorkflowId ? entryById.get(activeWorkflowId) : undefined;
	while (ancestorEntry?.parentWorkflowId) {
		forcedExpandedIds.add(ancestorEntry.parentWorkflowId);
		ancestorEntry = entryById.get(ancestorEntry.parentWorkflowId);
	}

	function renderEntry(entry: WorkflowHistoryEntry, depth: number): string {
		const isOrphan = Boolean(entry.parentWorkflowId && !entryById.has(entry.parentWorkflowId));
		const visibleChildren = depth < 3 ? (childrenByParentId.get(entry.workflowId) ?? []) : [];
		const hasChildren = visibleChildren.length > 0;
		const isCollapsed = hasChildren && !forcedExpandedIds.has(entry.workflowId)
			? entry.isCollapsed ?? true
			: false;
		const entryHtml = buildHistoryEntryHtml(entry, activeWorkflowId, entryById, helpers, depth, isOrphan, hasChildren, isCollapsed);
		const childrenHtml = hasChildren && !isCollapsed
			? `<div class="history-children">${visibleChildren.map((child) => renderEntry(child, depth + 1)).join('')}</div>`
			: '';
		return `<div class="history-node" style="--history-depth:${depth};">${entryHtml}${childrenHtml}</div>`;
	}

	const listHtml = roots.map((root) => renderEntry(root, 0)).join('');

	return `
<details class="mc-section" open>
<summary class="mc-section-header">
	<span class="mc-section-title">Workflow History</span>
	<span class="mc-section-badge">${historyCount} archived${activeEntry ? ` · active: ${helpers.escapeHtml(activeEntry.label)}` : ''}</span>
</summary>
<div class="mc-section-body">
	<p class="section-footnote">Restore a previous run, duplicate a workflow, or branch from a saved stage checkpoint.</p>
	<div class="history-list">
		${listHtml}
	</div>
</div>
</details>`;
}

function buildHistoryEntryHtml(
	entry: WorkflowHistoryEntry,
	activeWorkflowId: string | undefined,
	entryById: Map<string, WorkflowHistoryEntry>,
	helpers: WorkflowUiHelpers,
	depth: number = 0,
	isOrphan: boolean = false,
	hasChildren: boolean = false,
	isCollapsed: boolean = false
): string {
	const isActive = entry.workflowId === activeWorkflowId;
	const providerLabel = helpers.getProviderLabel(entry.currentProvider);
	const presetLabel = getWorkflowIntentCopy(entry.currentPreset, undefined).label;
	const parentEntry = entry.parentWorkflowId ? entryById.get(entry.parentWorkflowId) : undefined;
	const lineage = parentEntry
		? `Branch of ${parentEntry.label}${entry.parentStageIndex ? ` @ stage ${entry.parentStageIndex}` : ''}`
		: (isOrphan && entry.parentWorkflowId ? 'Branch (parent removed)' : undefined);

	const classes = [
		'history-entry',
		isActive ? 'active' : '',
		hasChildren ? 'history-entry--parent' : '',
		hasChildren && isCollapsed ? 'history-entry--collapsed' : '',
		depth > 0 ? 'history-entry--child' : '',
		isOrphan ? 'history-entry--orphan' : ''
	].filter(Boolean).join(' ');

	const treePrefix = depth > 0
		? '<span class="history-tree-branch" aria-hidden="true">└─</span>'
		: '<span class="history-tree-branch history-tree-branch--root" aria-hidden="true"></span>';
	const toggleControl = hasChildren
		? `<button type="button" class="history-toggle" data-workflow-id="${helpers.escapeHtml(entry.workflowId)}" data-collapsed="${isCollapsed ? 'true' : 'false'}" aria-expanded="${isCollapsed ? 'false' : 'true'}" title="${isCollapsed ? 'Expand workflow' : 'Collapse workflow'}"><span class="history-toggle-glyph" aria-hidden="true">${isCollapsed ? '▸' : '▾'}</span></button>`
		: '<span class="history-toggle-spacer" aria-hidden="true"></span>';

	return `
	<div class="${classes}">
		<div class="history-meta-row">
			<div class="history-title-row">${treePrefix}${toggleControl}<span class="history-title">${helpers.escapeHtml(entry.label)}</span></div>
			${isActive ? '<span class="history-badge">Active</span>' : ''}
		</div>
		<div class="history-summary">${helpers.escapeHtml(presetLabel)} · ${helpers.escapeHtml(providerLabel)} · ${entry.stageCount} stage(s)</div>
		${lineage ? `<div class="history-lineage">${helpers.escapeHtml(lineage)}</div>` : ''}
		<div class="history-timestamp">Updated ${helpers.escapeHtml(entry.updatedAt)}</div>
		<div class="pill-actions">
			<button type="button" class="secondary small-btn" title="Create a new workflow that starts as a full copy of this one." data-command="forkWorkflowFromHistory" data-target="${helpers.escapeHtml(entry.workflowId)}">Duplicate</button>
			<button type="button" class="secondary small-btn" title="Create a new workflow starting from a checkpoint of this one." data-command="forkWorkflowFromArchivedStage" data-target="${helpers.escapeHtml(entry.workflowId)}">Branch at stage</button>
			<button type="button" class="secondary small-btn" data-command="restoreWorkflowFromHistory" data-target="${helpers.escapeHtml(entry.workflowId)}" ${isActive ? 'disabled' : ''}>Restore</button>
			<button type="button" class="secondary small-btn" data-command="deleteWorkflowFromHistory" data-target="${helpers.escapeHtml(entry.workflowId)}">Delete</button>
		</div>
	</div>`;
}

function buildActiveHero(state: WorkflowDashboardState, helpers: WorkflowUiHelpers, recommendedPreset: string | undefined): string {
	const session = state.session!;
	const presetLabel = getWorkflowIntentCopy(session.currentPreset, state.workspaceModeState?.mode).label;
	const providerLabel = helpers.getProviderLabel(session.currentProvider);
	const stageLabel = `Stage ${session.currentStageIndex}`;
	const nextLabel = recommendedPreset && recommendedPreset in WORKFLOW_PRESETS ? getWorkflowIntentCopy(recommendedPreset as keyof typeof WORKFLOW_PRESETS, state.workspaceModeState?.mode).label : 'Next stage';
	const completedCount = session.stages.filter((s) => s.status === 'completed').length;
	const distributedSourceBatch = state.sourceAnalysisBatch;
	const distributedSourceSummary = distributedSourceBatch
		? `${distributedSourceBatch.jobs.filter((job) => job.status === 'completed').length}/${distributedSourceBatch.jobs.length} distributed source job(s) completed`
		: undefined;
	return `
<section class="card hero">
	<div class="kicker">Active Workflow</div>
	<p class="lead" style="margin-top:6px;"><strong>${helpers.escapeHtml(presetLabel)}</strong> · ${helpers.escapeHtml(providerLabel)} · ${helpers.escapeHtml(stageLabel)}</p>
	<p class="small">${completedCount}/${session.stages.length} stages · Next: ${helpers.escapeHtml(nextLabel)}</p>
	${state.brief ? `<p class="small" style="margin-top:4px;">${helpers.escapeHtml(state.brief.goal)}</p>` : ''}
	${distributedSourceSummary ? `<p class="small" style="margin-top:4px;">${helpers.escapeHtml(distributedSourceSummary)}</p>` : ''}
	<div class="actions" style="margin-top:10px;">
		<button type="button" data-command="openContinueDrawer">Continue ▶</button>
		<button type="button" class="secondary" data-command="openContinueDrawer">Change settings</button>
		<button type="button" class="secondary" data-command="previewPrompt" ${state.session ? '' : 'disabled'}>Prompt</button>
		<button type="button" class="secondary" data-command="manageDistributedSourceAnalysis" ${distributedSourceBatch ? '' : 'disabled'}>Sources</button>
	</div>
	<p class="small" style="margin-top:8px;">Use the sections below to inspect handoffs, restore previous runs, or branch from the current stage.</p>
</section>`;
}

function buildCurrentObjectiveHtml(state: WorkflowDashboardState, helpers: WorkflowUiHelpers): string {
	const objective = state.currentObjective;
	if (!objective) {
		return '';
	}

	return `
<section class="card" style="position:sticky; top:8px; z-index:2; border-left:3px solid var(--vscode-focusBorder);">
	<div class="kicker">Objectif Actuel</div>
	<p class="small" style="margin-top:6px;">${helpers.escapeHtml(objective.relativePath)}</p>
	<pre style="margin-top:10px; white-space:pre-wrap; max-height:240px; overflow:auto; font:inherit; color:var(--text-body); background:var(--panel-strong); border:1px solid var(--glass-border); padding:12px; border-radius:var(--radius-md);">${helpers.escapeHtml(objective.upgradedGoal || objective.content)}</pre>
	<div class="actions dense-actions" style="margin-top:10px;">
		<button type="button" class="secondary" data-command="openObjective">Open objective file</button>
	</div>
</section>`;
}

function buildPipelinePickerHtml(templates: PipelineTemplateDefinition[], helpers: WorkflowUiHelpers): string {
	const cards = templates.map((t) => `
	<div class="provider-row provider-card" style="gap:8px;">
		<div class="provider-title-row">
			<strong>${helpers.escapeHtml(t.label)}</strong>
		</div>
		<div class="small provider-detail">${helpers.escapeHtml(t.description)}</div>
		<div class="small provider-detail" style="margin-top:2px;">${helpers.escapeHtml(t.steps.join(' → '))}</div>
		<div class="actions dense-actions" style="margin-top:6px;">
			<button type="button" data-command="startPipeline" data-target="${helpers.escapeHtml(t.id)}">Start</button>
		</div>
	</div>`).join('');

	return `
<details class="mc-section">
<summary class="mc-section-header">
	<span class="mc-section-title">Pipelines</span>
	<span class="mc-section-badge">${templates.length} templates</span>
</summary>
<div class="mc-section-body">
	<p class="section-footnote">Run a multi-step pipeline that chains presets together and optionally manages a git branch.</p>
	${cards}
</div>
</details>`;
}

function buildActivePipelineHtml(activePipeline: ActivePipelineState, helpers: WorkflowUiHelpers): string {
	const template = PIPELINE_TEMPLATES[activePipeline.templateId];
	if (!template) {
		return '';
	}

	const pills = template.steps.map((step, i) => {
		const isDone = i < activePipeline.currentStepIndex;
		const isCurrent = i === activePipeline.currentStepIndex;
		const statusClass = isDone ? 'completed' : isCurrent ? 'in-progress' : 'prepared';
		const badge = isDone ? 'Done' : isCurrent ? 'Current' : 'Pending';
		return `<span class="stage-pill ${statusClass}" style="display:inline-block; margin:2px 4px 2px 0; padding:2px 8px; font-size:12px;">${helpers.escapeHtml(step)} <span class="history-badge stage-badge">${badge}</span></span>`;
	}).join('');

	const branchInfo = activePipeline.branchName
		? `<div class="small provider-detail" style="margin-top:4px;">Branch: <code>${helpers.escapeHtml(activePipeline.branchName)}</code></div>`
		: '';

	const stepNumber = activePipeline.currentStepIndex + 1;
	const isComplete = activePipeline.currentStepIndex >= template.steps.length;
	const isWaitingForCopilot = Boolean(activePipeline.pendingManualCompletion && activePipeline.pendingManualCompletion.provider === 'copilot');

	return `
<section class="card" style="margin-bottom:12px; border-left:3px solid var(--vscode-focusBorder);">
	<div class="kicker">Active Pipeline</div>
	<h3 style="margin-top:4px;">${helpers.escapeHtml(template.label)}</h3>
	<div style="margin-top:6px;">${pills}</div>
	${branchInfo}
	${isWaitingForCopilot ? `<p class="small" style="margin-top:8px;">Copilot step in progress: validate it manually when the chat task is done.</p>` : ''}
	<div class="actions dense-actions" style="margin-top:8px;">
		${isWaitingForCopilot
			? `<button type="button" data-command="completePendingCopilotPipelineStep">Marquer comme termine</button>`
			: isComplete
			? ''
			: `<button type="button" data-command="advancePipelineStep">Run Step ${stepNumber}</button>`}
		<button type="button" class="secondary" data-command="abortPipeline">Abort pipeline</button>
	</div>
</section>`;
}

function buildArtifactGovernanceHtml(state: WorkflowDashboardState, helpers: WorkflowUiHelpers): string {
	const governance = state.artifactGovernance;
	if (!governance) {
		return '';
	}

	const statusText = governance.managedPathsCovered
		? 'All managed paths are covered in .gitignore.'
		: governance.hasBlock
			? '.gitignore block exists but some paths may be missing.'
			: governance.gitignoreExists
				? '.gitignore exists — no ai-context-orchestrator block found.'
				: 'No .gitignore found in this workspace.';

	const buttonText = governance.hasBlock ? 'Re-apply block' : 'Configure .gitignore';
	const badgeText = governance.managedPathsCovered ? 'covered' : 'attention';

	return `
<details class="mc-section">
<summary class="mc-section-header">
	<span class="mc-section-title">Artifact Governance</span>
	<span class="mc-section-badge">${helpers.escapeHtml(badgeText)}</span>
</summary>
<div class="mc-section-body">
	<p class="section-footnote">Control which generated workflow files are committed to source control.</p>
	<p class="small" style="margin-bottom:8px;">${helpers.escapeHtml(statusText)}</p>
	<div class="actions">
		<button type="button" class="secondary" data-command="configureGitignore">${helpers.escapeHtml(buttonText)}</button>
	</div>
</div>
</details>`;
}

function buildProviderLaunchFormPreview(
	state: WorkflowDashboardState,
	prompt: string,
	helpers: WorkflowUiHelpers
): string {
	if (!state.session) {
		return prompt;
	}

	if (state.session.currentProvider === 'claude') {
		const configuration = state.configuration ?? helpers.getExtensionConfiguration();
		const account = helpers.findProviderAccount(configuration, 'claude', state.session.currentProviderAccountId ?? state.session.currentClaudeAccountId);
		const details = [
			account ? `CLAUDE_CONFIG_DIR=${account.configDir}` : undefined,
			state.session.currentProviderModel ? `ANTHROPIC_MODEL=${state.session.currentProviderModel}` : undefined,
			state.session.currentClaudeEffort ? `CLAUDE_CODE_EFFORT_LEVEL=${state.session.currentClaudeEffort}` : undefined,
			`claude --append-system-prompt-file "${CONTEXT_FILE_NAME}" "${prompt}"`
		].filter((value): value is string => Boolean(value));
		return details.join(' ');
	}

	if (state.session.currentProvider === 'gemini') {
		const configuration = state.configuration ?? helpers.getExtensionConfiguration();
		const account = helpers.findProviderAccount(configuration, 'gemini', state.session.currentProviderAccountId);
		const prefix = account?.apiKeyEnvVar && process.env[account.apiKeyEnvVar]
			? `GEMINI_API_KEY=${process.env[account.apiKeyEnvVar]} GOOGLE_API_KEY=${process.env[account.apiKeyEnvVar]} `
			: '';
		return state.session.currentProviderModel
			? `${prefix}gemini -m "${state.session.currentProviderModel}" "${prompt}"`
			: `${prefix}gemini "${prompt}"`;
	}

	return prompt;
}

function buildIntentPillsHtml(
	helpers: WorkflowUiHelpers,
	workspaceMode: WorkflowDashboardState['workspaceModeState'],
	selectedLearningDocumentType: string | undefined,
	preset: WorkflowPreset,
	documentIntentId: string | undefined
): string {
	const documentIntents = getDocumentWorkflowIntents(selectedLearningDocumentType as Parameters<typeof getDocumentWorkflowIntents>[0]);
	if (documentIntents.length > 0) {
		const resolvedDocumentIntentId = documentIntents.some((intent) => intent.id === documentIntentId)
			? documentIntentId
			: documentIntents[0]?.id;
		return documentIntents.map((intent) =>
			`<button type="button" class="drawer-pill ${intent.id === resolvedDocumentIntentId ? 'active' : ''}" data-field="intent" data-value="${intent.id}" data-preset="${intent.preset}">${helpers.escapeHtml(intent.label)}</button>`
		).join('');
	}

	return Object.values(WORKFLOW_PRESETS).map((presetDefinition) =>
		`<button type="button" class="drawer-pill ${presetDefinition.preset === preset ? 'active' : ''}" data-field="preset" data-value="${presetDefinition.preset}">${helpers.escapeHtml(getWorkflowIntentCopy(presetDefinition.preset, workspaceMode?.mode).label)}</button>`
	).join('');
}

function buildConfigDrawerHtml(
	state: WorkflowDashboardState,
	helpers: WorkflowUiHelpers,
	lastConfig: LastWorkflowConfig | undefined,
	configuration: ExtensionConfiguration,
	mode: 'new' | 'continue' = 'new',
	sessionPrefill?: { preset?: WorkflowPreset; provider?: ProviderTarget; providerModel?: string; claudeEffort?: ClaudeEffortLevel; brief?: string }
): string {
	const workspaceMode = state.workspaceModeState ? getWorkspaceModeDefinition(state.workspaceModeState.mode) : undefined;
	const supportsLearningDocuments = Boolean(workspaceMode?.supportsLearningDocuments);
	const availableLearningDocuments = state.learningDocuments ?? [];
	const hasLearningDocuments = availableLearningDocuments.length > 0;
	const provider = sessionPrefill?.provider ?? lastConfig?.provider ?? configuration.defaultProvider;
	const model = sessionPrefill?.providerModel ?? lastConfig?.providerModel ?? '';
	const effort = sessionPrefill?.claudeEffort ?? lastConfig?.claudeEffort ?? configuration.defaultClaudeEffort;
	const learningDocumentId = supportsLearningDocuments
		? (lastConfig?.learningDocumentId ?? state.activeLearningDocument?.id ?? availableLearningDocuments[0]?.id ?? '')
		: '';
	const selectedLearningDocument = availableLearningDocuments.find((document) => document.id === learningDocumentId) ?? availableLearningDocuments[0];
	const availableDocumentIntents = getDocumentWorkflowIntents(selectedLearningDocument?.type);
	const documentIntentId = availableDocumentIntents.length > 0
		? (availableDocumentIntents.some((intent) => intent.id === lastConfig?.documentIntentId)
			? lastConfig?.documentIntentId
			: availableDocumentIntents[0]?.id)
		: undefined;
	const preset = sessionPrefill?.preset
		?? availableDocumentIntents.find((intent) => intent.id === documentIntentId)?.preset
		?? lastConfig?.preset
		?? configuration.defaultPreset;
	const brief = sessionPrefill?.brief ?? lastConfig?.brief ?? '';

	const claudeModels = ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'];
	const geminiModels = ['gemini-3.1-pro-preview', 'gemini-2.5-pro', 'gemini-2.5-flash'];

	const intentPills = buildIntentPillsHtml(helpers, state.workspaceModeState, selectedLearningDocument?.type, preset, documentIntentId);

	const providers: ProviderTarget[] = ['claude', 'gemini', 'copilot'];
	const providerPills = providers.map((p) =>
		`<button type="button" class="drawer-pill ${p === provider ? 'active' : ''}" data-field="provider" data-value="${p}">${helpers.escapeHtml(helpers.getProviderLabel(p))}</button>`
	).join('');

	const activeModels = provider === 'gemini' ? geminiModels : provider === 'copilot' ? ['default'] : claudeModels;
	const modelOptions = activeModels.map((m) =>
		`<option value="${m}" ${m === model ? 'selected' : ''}>${m}</option>`
	).join('');

	const effortPills = (['low', 'medium', 'high'] as const).map((e) =>
		`<button type="button" class="drawer-pill ${e === effort ? 'active' : ''}" data-field="effort" data-value="${e}">${e.charAt(0).toUpperCase() + e.slice(1)}</button>`
	).join('');

	const isNewMode = mode === 'new';
	const selectedIntent = getEffectiveWorkflowIntentCopy(preset, workspaceMode?.mode, documentIntentId);
	const briefPlaceholder = selectedIntent.briefPlaceholder;
	const providerHelp = provider === 'claude'
		? 'Best when you want deeper reasoning. Effort controls quality, speed, and cost.'
		: provider === 'gemini'
			? 'Good default for broad analysis and faster iteration.'
			: 'Uses the active Copilot setup. Model selection stays minimal.';
	const documentOptions = availableLearningDocuments.map((document) =>
		`<option value="${helpers.escapeHtml(document.id)}" ${document.id === learningDocumentId ? 'selected' : ''}>${helpers.escapeHtml(`${document.title} · ${getLearningDocumentTypeLabel(document.type)}`)}</option>`
	).join('');
	const briefVisible = documentIntentId ? true : preset !== 'explore';
	const selectionSummary = `${selectedIntent.label} with ${helpers.getProviderLabel(provider)} · ${model || activeModels[0]}${provider === 'claude' ? ` · ${effort} effort` : ''}${selectedLearningDocument ? ` · ${selectedLearningDocument.title}` : ''}`;
	const drawerTitle = supportsLearningDocuments && !hasLearningDocuments
		? 'Créer votre document de travail'
		: isNewMode ? 'New workflow' : 'Resume workflow';
	const drawerSubtitle = isNewMode
		? (supportsLearningDocuments
			? (hasLearningDocuments
				? 'Choisissez le document cible puis le mode de travail adapté avant d’ajuster le provider si besoin.'
				: 'Aucun document détecté. Commencez par créer un document de travail, par exemple un compte-rendu.')
			: 'Keep the common path short. Advanced settings are available below when needed.')
		: (supportsLearningDocuments ? 'Continue on the selected learning document with an updated preset, provider, or brief.' : 'Override the preset, provider, model, and brief for this continuation step.');
	const launchBtnLabel = isNewMode ? 'Launch ▶' : 'Continue →';
	const noDocumentNotice = supportsLearningDocuments && !hasLearningDocuments
		? `<div class="drawer-group">
			<div class="drawer-field">
				<label class="drawer-label">Première étape</label>
				<p class="drawer-help">Créez d’abord un document de travail dans ce workspace. Tant qu’aucun document n’est détecté, le workflow documentaire reste désactivé.</p>
				<div class="actions" style="margin-top:8px;">
					<button type="button" data-command="createLearningDocument">Créer un compte-rendu ou un autre document</button>
				</div>
				<span class="drawer-hint">Ensuite vous pourrez importer des sources, choisir un mode de travail et lancer l’IA sur ce document.</span>
			</div>
		</div>`
		: '';

	return `

<section class="card mc-drawer" id="mc-drawer" aria-labelledby="drawer-title">
	<div class="drawer-header">
		<div>
			<div class="drawer-title" id="drawer-title">${helpers.escapeHtml(drawerTitle)}</div>
			<p class="drawer-subtitle">${helpers.escapeHtml(drawerSubtitle)}</p>
		</div>
		<button type="button" class="drawer-close" id="drawer-close-btn" aria-label="Close workflow launcher">Close</button>
	</div>
	<div class="drawer-body">
		<div class="drawer-intro">
			<strong id="launch-summary" aria-live="polite">${helpers.escapeHtml(selectionSummary)}</strong>
			<span>${supportsLearningDocuments ? (hasLearningDocuments ? 'Launch targets the selected learning document and remembers that choice next time.' : 'Create a learning document first to unlock the documentary workflow launcher.') : 'Launch remembers this setup and reuses it the next time you open the sidebar launcher.'}</span>
		</div>
		${noDocumentNotice}
		${supportsLearningDocuments ? `<div class="drawer-group">
			<div class="drawer-field">
				<label class="drawer-label" for="drawer-learning-document">Document cible</label>
				<p class="drawer-help">Choisissez le document learning-kit sur lequel le provider doit travailler.</p>
				<select class="drawer-select" id="drawer-learning-document" ${hasLearningDocuments ? '' : 'disabled'}>${documentOptions || '<option value="">Aucun document disponible</option>'}</select>
				<span class="drawer-hint">${hasLearningDocuments ? 'Le prompt et le contexte utiliseront ce document, son template et ses sources importées.' : 'Créez d’abord un document depuis la section Learning Documents.'}</span>
			</div>
		</div>` : ''}
		${hasLearningDocuments || !supportsLearningDocuments ? `<div class="drawer-group">
			<div class="drawer-field">
				<label class="drawer-label">${supportsLearningDocuments ? 'Mode de travail' : 'Goal'}</label>
				<p class="drawer-help">${supportsLearningDocuments ? 'Choisissez le mode adapté au document sélectionné. Pour un compte-rendu, les intents proposés remplacent les presets génériques.' : 'Pick the workflow outcome first. This controls whether a brief is required.'}</p>
			<div class="drawer-pills" id="intent-pills">${intentPills}</div>
			</div>
			<div class="drawer-field" id="brief-field"${briefVisible ? '' : ' hidden aria-hidden="true"'}>
				<label class="drawer-label" for="drawer-brief">Brief</label>
				<p class="drawer-help" id="brief-help">${briefVisible ? selectedIntent.briefPrompt : 'Optional for Explore. Leave it empty to start with the current workspace context.'}</p>
				<textarea class="drawer-textarea" id="drawer-brief" placeholder="${helpers.escapeHtml(briefPlaceholder)}" aria-describedby="brief-help brief-hint">${helpers.escapeHtml(brief)}</textarea>
				<span class="drawer-hint" id="brief-hint">${briefVisible ? (supportsLearningDocuments ? 'Le brief sert de cible concrète pour le document, ses sections et ses sources.' : (isNewMode ? 'You can refine scope or constraints here.' : 'This brief will guide the continuation prompt for the next stage.')) : 'Explore starts faster without a brief.'}</span>
			</div>
		</div>
		<div class="drawer-group">
			<div class="drawer-field">
				<label class="drawer-label">Provider</label>
				<p class="drawer-help" id="provider-help">${helpers.escapeHtml(providerHelp)}</p>
			<div class="drawer-pills" id="provider-pills">${providerPills}</div>
			</div>
		</div>
		<details class="advanced-details drawer-advanced">
			<summary>
				<span>Advanced settings</span>
				<span class="drawer-summary-chip" id="advanced-summary">Model: ${helpers.escapeHtml(model || activeModels[0])}${provider === 'claude' ? ` · Effort: ${helpers.escapeHtml(effort)}` : ''}</span>
			</summary>
			<div class="drawer-advanced-body">
				<div class="drawer-field">
					<label class="drawer-label" for="drawer-model">Model</label>
					<p class="drawer-help">Model options update with the selected provider.</p>
					<select class="drawer-select" id="drawer-model">${modelOptions}</select>
				</div>
				<div class="drawer-field" id="effort-field"${provider === 'claude' ? '' : ' hidden aria-hidden="true"'}>
					<label class="drawer-label">Claude effort</label>
					<p class="drawer-help">Low is cheaper and faster. High is slower but usually stronger.</p>
					<div class="drawer-pills" id="effort-pills">${effortPills}</div>
				</div>
				<div class="drawer-utility-row">
					<span class="drawer-hint">Need the full command flow or account selection?</span>
					<button type="button" class="secondary" data-command="init">Open full setup</button>
				</div>
			</div>
		</details>
		` : ''}
	</div>
	<div class="drawer-footer">
		<span class="drawer-validation" id="launch-validation" aria-live="polite">${supportsLearningDocuments ? (hasLearningDocuments ? 'Launch uses the selected document and current provider settings.' : 'Create a learning document first.') : 'Launch uses the current provider and remembers this setup for next time.'}</span>
		<button type="button" class="secondary" id="drawer-cancel-btn">Cancel</button>
		<button type="button" id="drawer-launch-btn" ${supportsLearningDocuments && !hasLearningDocuments ? 'disabled' : ''}>${helpers.escapeHtml(launchBtnLabel)}</button>
	</div>
</section>`;
}

export function formatWorkflowRoles(roles: WorkflowRole[]): string {
	return roles.map((role) => capitalize(role)).join(', ');
}
