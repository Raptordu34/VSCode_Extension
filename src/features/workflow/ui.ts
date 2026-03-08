import * as vscode from 'vscode';
import { renderDesignShellDocument } from '../../webview/designSystem.js';
import {
	CONTEXT_FILE_NAME,
	WORKFLOW_BRIEF_FILE,
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

		webviewView.webview.onDidReceiveMessage(async (message: { command?: string; provider?: ProviderTarget; preset?: string; stageIndex?: number }) => {
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
							providerModel: (message as any).providerModel,
							claudeEffort: (message as any).claudeEffort,
							brief: (message as any).brief
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
				case 'openStudio':
					await vscode.commands.executeCommand('ai-context-orchestrator.openWorkflowStudio');
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

	// Hero — no session
	const heroHtml = state.session
		? buildActiveHero(state, helpers, recommendedPreset)
		: buildInitHero(helpers, defaultPreset, defaultProvider, defaultModel);

	// Étapes section
	const stagesHtml = state.session ? `
<details class="mc-section" open>
<summary class="mc-section-header">
	<span class="mc-section-title">Étapes</span>
	<span class="mc-section-badge">${state.session.stages.filter((s) => s.status === 'completed').length}/${state.session.stages.length}</span>
</summary>
<div class="mc-section-body">
	<div class="stage-pills">
		${state.session.stages.map((stage) => `
		<div class="stage-pill ${stage.status}">
			<span class="pill-label">${String(stage.index).padStart(2, '0')} ${helpers.escapeHtml(WORKFLOW_PRESETS[stage.preset].label)}</span>
			<span class="pill-status">${getWorkflowStageStatusLabel(stage.status)}</span>
			<div class="pill-actions">
				<button type="button" class="secondary small-btn" data-command="openLatestHandoff">Ouvrir</button>
				<button type="button" class="secondary small-btn" data-command="markCompleted" data-stage-index="${stage.index}">✓ Fait</button>
			</div>
		</div>`).join('')}
	</div>
</div>
</details>` : '';

	// Providers section
	const providerSummary = state.providerStatuses.map((p) => `${helpers.escapeHtml(helpers.getProviderLabel(p.provider))} · ${helpers.escapeHtml(p.summary)}`).join('  ');
	const providerBody = state.providerStatuses.map((providerStatus) => `
	<div class="provider-row">
		<strong>${helpers.escapeHtml(helpers.getProviderLabel(providerStatus.provider))}</strong>
		<span class="small">${helpers.escapeHtml(providerStatus.detail)}</span>
		<div class="actions" style="margin-top:8px;">
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
	${providerBody}
	<div class="actions" style="margin-top:8px;">
		<button type="button" class="secondary" data-command="refreshProviders">Actualiser les statuts</button>
	</div>
</div>
</details>`;

	// Fichiers section
	const filesHtml = `
<details class="mc-section">
<summary class="mc-section-header">
	<span class="mc-section-title">Fichiers rapides</span>
</summary>
<div class="mc-section-body">
	<div class="shortcuts">
		<button type="button" class="linkButton" data-command="openContext" ${state.contextFileExists ? '' : 'disabled'}>Context Pack<span>${helpers.escapeHtml(CONTEXT_FILE_NAME)}</span></button>
		<button type="button" class="linkButton" data-command="openBrief" ${state.brief ? '' : 'disabled'}>Brief<span>${helpers.escapeHtml(state.brief ? state.brief.taskType : 'Aucun brief')}</span></button>
		<button type="button" class="linkButton" data-command="openLatestHandoff" ${state.latestStage ? '' : 'disabled'}>Handoff<span>${helpers.escapeHtml(latestHandoff || 'Aucun')}</span></button>
		<button type="button" class="linkButton" data-command="openSession" ${state.session ? '' : 'disabled'}>Session<span>${helpers.escapeHtml(WORKFLOW_SESSION_FILE)}</span></button>
		<button type="button" class="linkButton" data-command="previewPrompt" ${state.session ? '' : 'disabled'}>Prompt<span>Aperçu du prompt</span></button>
		<button type="button" class="linkButton" data-command="copyPrompt" ${state.session ? '' : 'disabled'}>Copier<span>Copier le prompt</span></button>
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
${stagesHtml}
${providersHtml}
${filesHtml}
<div style="margin-top:4px;">
	<button type="button" data-command="init" class="secondary">+ Nouveau workflow</button>
</div>`;

	const scriptBody = `
// ── Preset selector (hero) ──
var selectedPreset = '${defaultPreset}';
for (var btn of document.querySelectorAll('.preset-btn')) {
	btn.addEventListener('click', (function(b) { return function() {
		selectedPreset = b.dataset.preset;
		for (var x of document.querySelectorAll('.preset-btn')) { x.classList.toggle('active', x.dataset.preset === selectedPreset); }
	}; })(btn));
}

// ── Stage mark buttons ──
for (var markBtn of document.querySelectorAll('button[data-stage-index]')) {
	markBtn.addEventListener('click', (function(b) { return function() {
		vscode.postMessage({ command: b.dataset.command, stageIndex: Number(b.dataset.stageIndex) });
	}; })(markBtn));
}

// ── Drawer state ──
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
	sel.innerHTML = models.map(function(m) {
		return '<option value="' + m + '"' + (m === currentModel ? ' selected' : '') + '>' + m + '</option>';
	}).join('');
}

function updateEffortVisibility(provider) {
	var row = document.getElementById('effort-field');
	if (row) { row.style.display = provider === 'claude' ? '' : 'none'; }
}

function updateBriefVisibility(preset) {
	var row = document.getElementById('brief-field');
	if (row) { row.style.display = preset === 'explore' ? 'none' : ''; }
	var ta = document.getElementById('drawer-brief');
	if (ta) {
		var ph = { explore: 'Quelle zone explorer ?', plan: 'Que planifier ?', build: 'Que construire ?', debug: 'Quel bug corriger ?', review: 'Que reviewer ?', test: 'Quelle surface tester ?' };
		ta.placeholder = ph[preset] || 'Décris l\\'objectif…';
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
		} else if (field === 'effort') {
			drawerEffort = value;
		}
	}; })(pill));
}

// Close drawer
function closeDrawer() { vscode.postMessage({ command: 'closeConfigDrawer' }); }
var closeBtn = document.getElementById('drawer-close-btn');
if (closeBtn) { closeBtn.addEventListener('click', closeDrawer); }
var backdrop = document.getElementById('mc-backdrop');
if (backdrop) { backdrop.addEventListener('click', closeDrawer); }

// Launch from drawer
var drawerLaunchBtn = document.getElementById('drawer-launch-btn');
if (drawerLaunchBtn) {
	drawerLaunchBtn.addEventListener('click', function() {
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
	});
}
`;

	return renderDesignShellDocument({
		webview,
		nonce,
		title: state.workspaceFolder?.name ?? 'AI Workflow',
		kicker: state.session ? 'Mission Control' : 'Mission Control',
		contentHtml,
		scriptBody,
		layout: 'sidebar'
	});
}

function buildInitHero(helpers: WorkflowUiHelpers, defaultPreset: string, defaultProvider: string, defaultModel: string): string {
	const presets = Object.values(WORKFLOW_PRESETS);
	const presetButtons = presets.map((p) => `<button type="button" class="preset-btn ${p.preset === defaultPreset ? 'active' : ''}" data-preset="${p.preset}">${helpers.escapeHtml(p.label)}</button>`).join('');
	return `
<section class="card hero">
	<div class="kicker">Pas de workflow actif</div>
	<div class="preset-selector">${presetButtons}</div>
	<p class="small" style="margin-top:8px;">Avec : ${helpers.escapeHtml(defaultProvider)} · ${helpers.escapeHtml(defaultModel)}</p>
	<div class="actions" style="margin-top:10px;">
		<button type="button" data-command="openConfigDrawer">Lancer ▶</button>
	</div>
	<details class="advanced-details" style="margin-top:8px;">
		<summary>▸ Configuration complète</summary>
		<div style="margin-top:8px;">
			<button type="button" class="secondary" data-command="init">Choisir preset, provider, modèle…</button>
		</div>
	</details>
</section>`;
}

function buildActiveHero(state: WorkflowDashboardState, helpers: WorkflowUiHelpers, recommendedPreset: string | undefined): string {
	const session = state.session!;
	const presetLabel = WORKFLOW_PRESETS[session.currentPreset].label;
	const providerLabel = helpers.getProviderLabel(session.currentProvider);
	const stageLabel = `Étape ${session.currentStageIndex}`;
	const nextLabel = recommendedPreset && recommendedPreset in WORKFLOW_PRESETS ? WORKFLOW_PRESETS[recommendedPreset as keyof typeof WORKFLOW_PRESETS].label : 'Prochaine étape';
	const completedCount = session.stages.filter((s) => s.status === 'completed').length;
	return `
<section class="card hero">
	<div class="kicker">Workflow actif</div>
	<p class="lead" style="margin-top:6px;"><strong>${helpers.escapeHtml(presetLabel)}</strong> · ${helpers.escapeHtml(providerLabel)} · ${helpers.escapeHtml(stageLabel)}</p>
	<p class="small">${completedCount}/${session.stages.length} étapes · Suivant : ${helpers.escapeHtml(nextLabel)}</p>
	${state.brief ? `<p class="small" style="margin-top:4px;">${helpers.escapeHtml(state.brief.goal)}</p>` : ''}
	<div class="actions" style="margin-top:10px;">
		<button type="button" data-command="continue">Continuer ▶</button>
		<button type="button" class="secondary" data-command="previewPrompt" ${state.session ? '' : 'disabled'}>Prompt</button>
	</div>
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

	const briefPlaceholder = preset === 'explore' ? 'Quelle zone explorer ?' : 'Décris l\'objectif de cette étape…';

	return `
<div class="mc-backdrop" id="mc-backdrop"></div>
<div class="mc-drawer" id="mc-drawer">
	<div class="drawer-header">
		<span class="drawer-title">Nouveau workflow</span>
		<button type="button" class="drawer-close" id="drawer-close-btn">✕</button>
	</div>
	<div class="drawer-body">
		<div class="drawer-field">
			<label class="drawer-label">Objectif</label>
			<div class="drawer-pills" id="preset-pills">${presetPills}</div>
		</div>
		<div class="drawer-field" id="brief-field"${preset === 'explore' ? ' style="display:none"' : ''}>
			<label class="drawer-label">Brief</label>
			<textarea class="drawer-textarea" id="drawer-brief" placeholder="${helpers.escapeHtml(briefPlaceholder)}">${helpers.escapeHtml(brief)}</textarea>
		</div>
		<div class="drawer-field">
			<label class="drawer-label">Provider</label>
			<div class="drawer-pills" id="provider-pills">${providerPills}</div>
		</div>
		<div class="drawer-field">
			<label class="drawer-label">Modèle</label>
			<select class="drawer-select" id="drawer-model">${modelOptions}</select>
		</div>
		<div class="drawer-field" id="effort-field"${provider !== 'claude' ? ' style="display:none"' : ''}>
			<label class="drawer-label">Effort Claude</label>
			<div class="drawer-pills" id="effort-pills">${effortPills}</div>
		</div>
		<details class="advanced-details">
			<summary>▸ Paramètres avancés</summary>
			<div style="margin-top:8px;">
				<button type="button" class="secondary" data-command="init">Configuration complète (QuickPick)…</button>
			</div>
		</details>
	</div>
	<div class="drawer-footer">
		<button type="button" id="drawer-launch-btn">Lancer ▶</button>
	</div>
</div>`;
}

export function formatWorkflowRoles(roles: WorkflowRole[]): string {
	return roles.map((role) => capitalize(role)).join(', ');
}
