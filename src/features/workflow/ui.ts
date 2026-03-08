import * as vscode from 'vscode';
import { renderDesignShellDocument } from '../../webview/designSystem.js';
import {
	CONTEXT_FILE_NAME,
	WORKFLOW_BRIEF_FILE,
	WORKFLOW_HISTORY_INDEX_FILE,
	WORKFLOW_SESSION_FILE
} from './constants.js';
import { WORKFLOW_PRESETS } from './presets.js';
import type {
	ExtensionConfiguration,
	LastWorkflowConfig,
	ProviderAccountConfiguration,
	ProviderTarget,
	WorkflowDashboardState,
	WorkflowStageStatus,
	WorkflowHistoryEntry,
	WorkflowRole } from './types.js';
import { capitalize } from "../../utils/index.js";
import { readLastWorkflowConfig } from './workflowService.js';

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

export class WorkflowControlViewProvider implements vscode.WebviewViewProvider {
	private view?: vscode.WebviewView;
	private drawerOpen = false;

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

		webviewView.webview.onDidReceiveMessage(async (message: { command?: string; provider?: ProviderTarget; preset?: string; providerModel?: string; claudeEffort?: string; brief?: string; stageIndex?: number; target?: string }) => {
			switch (message.command) {
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
							brief: message.brief
						}
					);
					this.drawerOpen = false;
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
					void this.render(this.view!);
					return;
				case 'closeConfigDrawer':
					this.drawerOpen = false;
					void this.render(this.view!);
					return;
			}
		});

		return this.render(webviewView);
	}

	private async render(webviewView: vscode.WebviewView): Promise<void> {
		const state = await this.loadState();
		const nonce = this.helpers.createNonce();
		const lastConfig = this.drawerOpen ? readLastWorkflowConfig(this.context) : undefined;
		webviewView.webview.html = getWorkflowControlHtml(webviewView.webview, state, nonce, this.helpers, this.drawerOpen, lastConfig);
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
			? `Use the generated ${helpers.getProviderLabel(state.session.currentProvider)} artifacts when they help.`
			: 'Work directly from the context pack and shared workflow files.',
		presetDefinition.launchInstruction,
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
	const stageLabel = session ? WORKFLOW_PRESETS[session.currentPreset].label : 'Unknown';
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
	lastConfig?: LastWorkflowConfig
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
		: buildInitHero(helpers, defaultPreset, defaultProvider, defaultModel, drawerOpen);

	const stagesHtml = state.session ? `
<details class="mc-section" open>
<summary class="mc-section-header">
	<span class="mc-section-title">Stages</span>
	<span class="mc-section-badge">${state.session.stages.filter((s) => s.status === 'completed').length}/${state.session.stages.length}</span>
</summary>
<div class="mc-section-body">
	<p class="section-footnote">Track the current stage here, open its file, or fork from a checkpoint when you need a branch.</p>
	<div class="stage-pills">
		${state.session.stages.map((stage) => `
		<div class="stage-pill ${stage.status}">
			<div class="stage-meta-row">
				<span class="pill-label">${String(stage.index).padStart(2, '0')} ${helpers.escapeHtml(WORKFLOW_PRESETS[stage.preset].label)}</span>
				<span class="history-badge stage-badge">${stage.index === state.session?.currentStageIndex ? 'Current' : getWorkflowStageStatusLabel(stage.status)}</span>
			</div>
			<span class="pill-status">${helpers.escapeHtml(stage.stageFile)}</span>
			<div class="pill-actions">
				<button type="button" class="secondary small-btn" data-command="openStageFile" data-target="${helpers.escapeHtml(stage.stageFile)}">Open</button>
				<button type="button" class="secondary small-btn" data-command="forkWorkflowFromStage" data-stage-index="${stage.index}">Fork Here</button>
				<button type="button" class="secondary small-btn" data-command="markCompleted" data-stage-index="${stage.index}">Mark Done</button>
			</div>
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
		<button type="button" class="linkButton" data-command="openBrief" ${state.brief ? '' : 'disabled'}>Brief<span>${helpers.escapeHtml(state.brief ? state.brief.taskType : 'No brief')}</span></button>
		<button type="button" class="linkButton" data-command="openLatestHandoff" ${state.latestStage ? '' : 'disabled'}>Latest Handoff<span>${helpers.escapeHtml(latestHandoff || 'None')}</span></button>
		<button type="button" class="linkButton" data-command="openSession" ${state.session ? '' : 'disabled'}>Session<span>${helpers.escapeHtml(WORKFLOW_SESSION_FILE)}</span></button>
		<button type="button" class="linkButton" data-command="previewPrompt" ${state.session ? '' : 'disabled'}>Prompt<span>Preview launch prompt</span></button>
		<button type="button" class="linkButton" data-command="copyPrompt" ${state.session ? '' : 'disabled'}>Copy<span>Copy launch prompt</span></button>
	</div>
	<div class="actions" style="margin-top:8px;">
		<button type="button" class="secondary" data-command="cleanActiveWorkflowFiles" ${state.activeWorkflowId ? '' : 'disabled'}>Clean Active Generated Files</button>
	</div>
</div>
</details>`;

	const claudeModels = ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'];
	const geminiModels = ['gemini-3.1-pro-preview', 'gemini-2.5-pro', 'gemini-2.5-flash'];
	const drawerHtml = drawerOpen
		? buildConfigDrawerHtml(helpers, lastConfig, configuration)
		: '';

	const contentHtml = `
${drawerHtml}
${heroHtml}
${historyHtml}
${stagesHtml}
${providersHtml}
${filesHtml}
	${state.session ? `<div style="margin-top:4px;">
	<button type="button" data-command="init" class="secondary">+ New Workflow</button>
</div>` : ''}`;

	const scriptBody = `
// ── Stage mark buttons ──
for (var markBtn of document.querySelectorAll('button[data-stage-index]')) {
	markBtn.addEventListener('click', (function(b) { return function() {
		vscode.postMessage({ command: b.dataset.command, stageIndex: Number(b.dataset.stageIndex) });
	}; })(markBtn));
}

// ── Composer state ──
var drawerPreset = '${lastConfig?.preset ?? defaultPreset}';
var drawerProvider = '${lastConfig?.provider ?? defaultProvider}';
var drawerEffort = '${lastConfig?.claudeEffort ?? 'medium'}';
var CLAUDE_MODELS = ${JSON.stringify(claudeModels)};
var GEMINI_MODELS = ${JSON.stringify(geminiModels)};

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
	var visible = preset !== 'explore';
	if (row) {
		row.hidden = !visible;
		row.setAttribute('aria-hidden', visible ? 'false' : 'true');
	}
	if (help) {
		help.textContent = visible
			? 'One sentence on the expected outcome. Keep it concrete.'
			: 'Optional for Explore. Leave it empty to start with the current workspace context.';
	}
	if (hint) {
		hint.textContent = visible
			? 'You can refine scope or constraints here.'
			: 'Explore starts faster without a brief.';
	}
	var ta = document.getElementById('drawer-brief');
	if (ta) {
		var ph = { explore: 'What area to explore?', plan: 'What to plan?', build: 'What to build?', debug: 'What bug to fix?', review: 'What to review?', test: 'What to test?' };
		ta.placeholder = ph[preset] || 'Describe the objective...';
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
	var presetLabelEl = document.querySelector('.drawer-pill[data-field="preset"].active');
	var providerLabelEl = document.querySelector('.drawer-pill[data-field="provider"].active');
	var presetLabel = presetLabelEl ? presetLabelEl.textContent : drawerPreset;
	var providerLabel = providerLabelEl ? providerLabelEl.textContent : drawerProvider;
	var detail = presetLabel + ' with ' + providerLabel + ' · ' + modelEl.value;
	if (drawerProvider === 'claude') {
		detail += ' · ' + drawerEffort + ' effort';
	}
	summary.textContent = detail;
	updateAdvancedSummary();
}

function updateLaunchState() {
	var launchBtn = document.getElementById('drawer-launch-btn');
	var message = document.getElementById('launch-validation');
	var briefEl = document.getElementById('drawer-brief');
	if (!launchBtn || !message) { return; }
	var requiresBrief = drawerPreset !== 'explore';
	var briefValue = briefEl ? briefEl.value.trim() : '';
	var isValid = !requiresBrief || briefValue.length > 0;
	launchBtn.disabled = !isValid;
	message.textContent = isValid
		? 'Launch uses the current provider and remembers this setup for next time.'
		: 'Add a brief before launching this workflow.';
	}

function focusComposer() {
	var focusTarget = drawerPreset === 'explore'
		? document.querySelector('.drawer-pill[data-field="provider"].active')
		: document.getElementById('drawer-brief');
	if (focusTarget && typeof focusTarget.focus === 'function') {
		focusTarget.focus();
	}
}

// Pill clicks (preset / provider / effort)
for (var pill of document.querySelectorAll('.drawer-pill')) {
	pill.addEventListener('click', (function(p) { return function() {
		var field = p.dataset.field;
		var value = p.dataset.value;
		var container = p.closest('.drawer-pills');
		if (container) {
			for (var s of container.querySelectorAll('.drawer-pill')) { s.classList.remove('active'); }
		}
		p.classList.add('active');
		if (field === 'preset') {
			drawerPreset = value;
			updateBriefVisibility(value);
		} else if (field === 'provider') {
			drawerProvider = value;
			var sel = document.getElementById('drawer-model');
			updateModelSelect(value, sel ? sel.value : '');
			updateEffortVisibility(value);
			updateProviderHelp(value);
		} else if (field === 'effort') {
			drawerEffort = value;
			updateSelectionSummary();
		}
	}; })(pill));
}

var modelSelect = document.getElementById('drawer-model');
if (modelSelect) {
	modelSelect.addEventListener('change', updateSelectionSummary);
}
var briefInput = document.getElementById('drawer-brief');
if (briefInput) {
	briefInput.addEventListener('input', updateLaunchState);
}

function triggerLaunch() {
	if (!drawerLaunchBtn || drawerLaunchBtn.disabled) {
		return;
	}
	var modelEl = document.getElementById('drawer-model');
	var briefEl = document.getElementById('drawer-brief');
	vscode.postMessage({
		command: 'smartInit',
		preset: drawerPreset,
		provider: drawerProvider,
		providerModel: modelEl ? modelEl.value : undefined,
		claudeEffort: drawerProvider === 'claude' ? drawerEffort : undefined,
		brief: briefEl && briefEl.value.trim() ? briefEl.value.trim() : undefined
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

updateModelSelect(drawerProvider, '${lastConfig?.providerModel ?? defaultModel}');
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

function buildInitHero(helpers: WorkflowUiHelpers, defaultPreset: string, defaultProvider: string, defaultModel: string, drawerOpen: boolean): string {
	return `
<section class="card hero">
	<div class="kicker">No active workflow</div>
	<h3>Start a workflow from the sidebar</h3>
	<p class="lead">Use the quick launcher for the common path, then open advanced settings only when you need to change model or provider-specific tuning.</p>
	<div class="stat-grid" style="margin-top:12px;">
		<div class="stat">
			<strong>Default route</strong>
			<span>${helpers.escapeHtml(defaultPreset)} · ${helpers.escapeHtml(defaultProvider)} · ${helpers.escapeHtml(defaultModel)}</span>
		</div>
		<div class="stat">
			<strong>Fast path</strong>
			<span>Goal, provider, optional brief, then launch.</span>
		</div>
	</div>
	<div class="actions" style="margin-top:10px;">
		<button type="button" data-command="${drawerOpen ? 'closeConfigDrawer' : 'openConfigDrawer'}" aria-expanded="${drawerOpen ? 'true' : 'false'}" aria-controls="mc-drawer" ${drawerOpen ? '' : 'autofocus'}>${drawerOpen ? 'Hide launcher' : 'Start workflow'}</button>
		<button type="button" class="secondary" data-command="init">Open full setup</button>
	</div>
</section>`;
}

function buildHistorySection(
	historyEntries: WorkflowHistoryEntry[],
	activeWorkflowId: string | undefined,
	helpers: WorkflowUiHelpers
): string {
	const entryById = new Map(historyEntries.map((entry) => [entry.workflowId, entry]));
	const historyCount = historyEntries.length;
	const activeEntry = activeWorkflowId ? historyEntries.find((entry) => entry.workflowId === activeWorkflowId) : undefined;
	return `
<details class="mc-section" open>
<summary class="mc-section-header">
	<span class="mc-section-title">Workflow History</span>
	<span class="mc-section-badge">${historyCount} archived${activeEntry ? ` · active: ${helpers.escapeHtml(activeEntry.label)}` : ''}</span>
</summary>
<div class="mc-section-body">
	<p class="section-footnote">Restore a previous run, fork from an archived workflow, or branch from a saved stage.</p>
	<div class="history-list">
		${historyEntries.map((entry) => buildHistoryEntryHtml(entry, activeWorkflowId, entryById, helpers)).join('')}
	</div>
</div>
</details>`;
}

function buildHistoryEntryHtml(
	entry: WorkflowHistoryEntry,
	activeWorkflowId: string | undefined,
	entryById: Map<string, WorkflowHistoryEntry>,
	helpers: WorkflowUiHelpers
): string {
	const isActive = entry.workflowId === activeWorkflowId;
	const providerLabel = helpers.getProviderLabel(entry.currentProvider);
	const presetLabel = WORKFLOW_PRESETS[entry.currentPreset].label;
	const parentEntry = entry.parentWorkflowId ? entryById.get(entry.parentWorkflowId) : undefined;
	const lineage = parentEntry
		? `Forked from ${parentEntry.label}${entry.parentStageIndex ? ` @ stage ${entry.parentStageIndex}` : ''}`
		: undefined;
	return `
	<div class="history-entry ${isActive ? 'active' : ''}">
		<div class="history-meta-row">
			<span class="history-title">${helpers.escapeHtml(entry.label)}</span>
			${isActive ? '<span class="history-badge">Active</span>' : ''}
		</div>
		<div class="history-summary">${helpers.escapeHtml(presetLabel)} · ${helpers.escapeHtml(providerLabel)} · ${entry.stageCount} stage(s)</div>
		${lineage ? `<div class="history-lineage">${helpers.escapeHtml(lineage)}</div>` : ''}
		<div class="history-timestamp">Updated ${helpers.escapeHtml(entry.updatedAt)}</div>
		<div class="pill-actions">
			<button type="button" class="secondary small-btn" data-command="forkWorkflowFromHistory" data-target="${helpers.escapeHtml(entry.workflowId)}">Fork</button>
			<button type="button" class="secondary small-btn" data-command="forkWorkflowFromArchivedStage" data-target="${helpers.escapeHtml(entry.workflowId)}">Fork From Stage</button>
			<button type="button" class="secondary small-btn" data-command="restoreWorkflowFromHistory" data-target="${helpers.escapeHtml(entry.workflowId)}" ${isActive ? 'disabled' : ''}>Restore</button>
		</div>
	</div>`;
}

function buildActiveHero(state: WorkflowDashboardState, helpers: WorkflowUiHelpers, recommendedPreset: string | undefined): string {
	const session = state.session!;
	const presetLabel = WORKFLOW_PRESETS[session.currentPreset].label;
	const providerLabel = helpers.getProviderLabel(session.currentProvider);
	const stageLabel = `Stage ${session.currentStageIndex}`;
	const nextLabel = recommendedPreset && recommendedPreset in WORKFLOW_PRESETS ? WORKFLOW_PRESETS[recommendedPreset as keyof typeof WORKFLOW_PRESETS].label : 'Next stage';
	const completedCount = session.stages.filter((s) => s.status === 'completed').length;
	return `
<section class="card hero">
	<div class="kicker">Active Workflow</div>
	<p class="lead" style="margin-top:6px;"><strong>${helpers.escapeHtml(presetLabel)}</strong> · ${helpers.escapeHtml(providerLabel)} · ${helpers.escapeHtml(stageLabel)}</p>
	<p class="small">${completedCount}/${session.stages.length} stages · Next: ${helpers.escapeHtml(nextLabel)}</p>
	${state.brief ? `<p class="small" style="margin-top:4px;">${helpers.escapeHtml(state.brief.goal)}</p>` : ''}
	<div class="actions" style="margin-top:10px;">
		<button type="button" data-command="continue">Continue ▶</button>
		<button type="button" class="secondary" data-command="forkWorkflowFromHistory" data-target="${helpers.escapeHtml(session.workflowId ?? '')}" ${session.workflowId ? '' : 'disabled'}>Fork</button>
		<button type="button" class="secondary" data-command="previewPrompt" ${state.session ? '' : 'disabled'}>Prompt</button>
	</div>
	<p class="small" style="margin-top:8px;">Use the sections below to inspect handoffs, restore previous runs, or branch from the current stage.</p>
</section>`;
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

function buildConfigDrawerHtml(
	helpers: WorkflowUiHelpers,
	lastConfig: LastWorkflowConfig | undefined,
	configuration: ExtensionConfiguration
): string {
	const preset = lastConfig?.preset ?? configuration.defaultPreset;
	const provider = lastConfig?.provider ?? configuration.defaultProvider;
	const model = lastConfig?.providerModel ?? '';
	const effort = lastConfig?.claudeEffort ?? configuration.defaultClaudeEffort;
	const brief = lastConfig?.brief ?? '';

	const claudeModels = ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'];
	const geminiModels = ['gemini-3.1-pro-preview', 'gemini-2.5-pro', 'gemini-2.5-flash'];

	const presets = Object.values(WORKFLOW_PRESETS);
	const presetPills = presets.map((p) =>
		`<button type="button" class="drawer-pill ${p.preset === preset ? 'active' : ''}" data-field="preset" data-value="${p.preset}">${helpers.escapeHtml(p.label)}</button>`
	).join('');

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

	const briefPlaceholder = preset === 'explore' ? 'What area to explore?' : 'Describe the objective for this stage...';
	const providerHelp = provider === 'claude'
		? 'Best when you want deeper reasoning. Effort controls quality, speed, and cost.'
		: provider === 'gemini'
			? 'Good default for broad analysis and faster iteration.'
			: 'Uses the active Copilot setup. Model selection stays minimal.';
	const briefVisible = preset !== 'explore';
	const selectionSummary = `${WORKFLOW_PRESETS[preset].label} with ${helpers.getProviderLabel(provider)} · ${model || activeModels[0]}${provider === 'claude' ? ` · ${effort} effort` : ''}`;

	return `

<section class="card mc-drawer" id="mc-drawer" aria-labelledby="drawer-title">
	<div class="drawer-header">
		<div>
			<div class="drawer-title" id="drawer-title">New workflow</div>
			<p class="drawer-subtitle">Keep the common path short. Advanced settings are available below when needed.</p>
		</div>
		<button type="button" class="drawer-close" id="drawer-close-btn" aria-label="Close workflow launcher">Close</button>
	</div>
	<div class="drawer-body">
		<div class="drawer-intro">
			<strong id="launch-summary" aria-live="polite">${helpers.escapeHtml(selectionSummary)}</strong>
			<span>Launch remembers this setup and reuses it the next time you open the sidebar launcher.</span>
		</div>
		<div class="drawer-group">
			<div class="drawer-field">
				<label class="drawer-label">Goal</label>
				<p class="drawer-help">Pick the workflow outcome first. This controls whether a brief is required.</p>
			<div class="drawer-pills" id="preset-pills">${presetPills}</div>
			</div>
			<div class="drawer-field" id="brief-field"${briefVisible ? '' : ' hidden aria-hidden="true"'}>
				<label class="drawer-label" for="drawer-brief">Brief</label>
				<p class="drawer-help" id="brief-help">${briefVisible ? 'One sentence on the expected outcome. Keep it concrete.' : 'Optional for Explore. Leave it empty to start with the current workspace context.'}</p>
				<textarea class="drawer-textarea" id="drawer-brief" placeholder="${helpers.escapeHtml(briefPlaceholder)}" aria-describedby="brief-help brief-hint">${helpers.escapeHtml(brief)}</textarea>
				<span class="drawer-hint" id="brief-hint">${briefVisible ? 'You can refine scope or constraints here.' : 'Explore starts faster without a brief.'}</span>
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
	</div>
	<div class="drawer-footer">
		<span class="drawer-validation" id="launch-validation" aria-live="polite">Launch uses the current provider and remembers this setup for next time.</span>
		<button type="button" class="secondary" id="drawer-cancel-btn">Cancel</button>
		<button type="button" id="drawer-launch-btn">Launch ▶</button>
	</div>
</section>`;
}

export function formatWorkflowRoles(roles: WorkflowRole[]): string {
	return roles.map((role) => capitalize(role)).join(', ');
}
