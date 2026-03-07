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
	ProviderAccountConfiguration,
	ProviderTarget,
	WorkflowDashboardState,
	WorkflowStageStatus,
	WorkflowTreeNode, WorkflowRole } from './types.js';
import { capitalize } from "../../utils/index.js";

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

export class WorkflowTreeDataProvider implements vscode.TreeDataProvider<WorkflowTreeNode> {
	private readonly emitter = new vscode.EventEmitter<WorkflowTreeNode | undefined>();
	readonly onDidChangeTreeData = this.emitter.event;

	constructor(
		private readonly loadState: () => Promise<WorkflowDashboardState>,
		private readonly helpers: WorkflowUiHelpers
	) {}

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
		return buildWorkflowTreeNodes(state, this.helpers);
	}
}

export class WorkflowControlViewProvider implements vscode.WebviewViewProvider {
	private view?: vscode.WebviewView;

	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly loadState: () => Promise<WorkflowDashboardState>,
		private readonly helpers: WorkflowUiHelpers
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
		const nonce = this.helpers.createNonce();
		webviewView.webview.html = getWorkflowControlHtml(webviewView.webview, state, nonce, this.helpers);
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

export function buildWorkflowTreeMessage(state: WorkflowDashboardState, helpers: WorkflowUiHelpers): string | undefined {
	if (state.workspaceSelectionRequired) {
		return 'Choose a workspace folder by opening a file in that folder or by starting a workflow command.';
	}

	if (!state.workspaceFolder) {
		return 'Open a workspace to inspect the orchestrator workflow.';
	}

	if (!state.session) {
		return state.contextFileExists
			? 'Context file ready. Start Init Workflow to create the first stage.'
			: 'No active workflow. Use Init Workflow to prepare the first stage.';
	}

	return `${WORKFLOW_PRESETS[state.session.currentPreset].label} with ${helpers.getProviderLabel(state.session.currentProvider)} · ${state.session.stages.length} stage(s)`;
}

export function buildWorkflowTreeNodes(state: WorkflowDashboardState, helpers: WorkflowUiHelpers): WorkflowTreeNode[] {
	if (state.workspaceSelectionRequired) {
		return [{
			id: 'workflow.select-workspace',
			label: 'Choose a workspace folder',
			description: 'Open a file from the target folder or run Init Workflow to select one explicitly.',
			icon: new vscode.ThemeIcon('folder-library'),
			contextValue: 'workflow-empty'
		}];
	}

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
		command: state.contextFileExists
			? {
				title: 'Open Context File',
				command: 'ai-context-orchestrator.openWorkflowTreeNode'
			}
			: undefined
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

	nodes.push({
		id: 'workflow.session',
		label: `${WORKFLOW_PRESETS[state.session.currentPreset].label} in progress`,
		description: `${helpers.getProviderLabel(state.session.currentProvider)} · Stage ${state.session.currentStageIndex}`,
		tooltip: `Last updated ${new Date(state.session.updatedAt).toLocaleString()}`,
		icon: new vscode.ThemeIcon('run-all'),
		contextValue: 'workflow-session',
		collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
		children: state.session.stages.map((stage) => {
			const stageId = `workflow.stage.${stage.index}`;
			const isCurrentStage = stage.index === state.session?.currentStageIndex;
			const stageChildren: WorkflowTreeNode[] = [
				buildFileTreeNode(`${stageId}.handoff`, 'Stage Handoff', stage.stageFile, 'output', `${getWorkflowStageStatusLabel(stage.status)} · ${helpers.getProviderLabel(stage.provider)}`, stage.briefSummary),
				buildFileTreeNode(`${stageId}.context`, 'Context Snapshot', stage.contextFile, 'file-code', CONTEXT_FILE_NAME)
			];

			for (const artifactPath of stage.artifactFiles) {
				stageChildren.push(buildFileTreeNode(`${stageId}.artifact.${artifactPath}`, artifactPath.split('/').at(-1) ?? artifactPath, artifactPath, 'tools', 'Native artifact'));
			}

			return {
				id: stageId,
				label: `Stage ${String(stage.index).padStart(2, '0')} ${WORKFLOW_PRESETS[stage.preset].label}`,
				description: `${helpers.getProviderLabel(stage.provider)} · ${getWorkflowStageStatusLabel(stage.status)}`,
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

export function getWorkflowControlHtml(
	webview: vscode.Webview,
	state: WorkflowDashboardState,
	nonce: string,
	helpers: WorkflowUiHelpers
): string {
	const recommendedPreset = state.nextSuggestedPresets[0];
	const selectedStage = state.selectedStage;
	const currentStageLabel = state.session
		? `${WORKFLOW_PRESETS[state.session.currentPreset].label} with ${helpers.getProviderLabel(state.session.currentProvider)}`
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
			<div class="account-card">
				<div class="account-header">
					<strong>${helpers.escapeHtml(account.label)}${account.isActive ? ' · active' : ''}</strong>
					<span>${helpers.escapeHtml(account.summary)}</span>
				</div>
				<span>${helpers.escapeHtml(account.detail)}</span>
				${account.lastCheckedAt ? `<span class="small">Last refresh: ${helpers.escapeHtml(new Date(account.lastCheckedAt).toLocaleString())}</span>` : ''}
				<div class="grid account-metrics">
					${account.metrics.map((metric) => `
						<div class="stat">
							<strong>${helpers.escapeHtml(metric.value)}</strong>
							<span>${helpers.escapeHtml(metric.label)}</span>
						</div>`).join('')}
				</div>
			</div>`).join('') ?? '';
		return `
			<section class="card">
				<h2>${helpers.escapeHtml(helpers.getProviderLabel(providerStatus.provider))}</h2>
				<p class="lead">${helpers.escapeHtml(providerStatus.summary)}</p>
				<p class="small">${helpers.escapeHtml(providerStatus.detail)}</p>
				<div class="actions" style="margin-top: 12px;">
					<button type="button" class="secondary" data-command="connectProviderAccount" data-provider="${providerStatus.provider}">Connect Account</button>
					<button type="button" class="secondary" data-command="switchProviderAccount" data-provider="${providerStatus.provider}">Switch Active</button>
					<button type="button" class="secondary" data-command="configureProviderCredential" data-provider="${providerStatus.provider}">Stored Credential</button>
					<button type="button" class="secondary" data-command="runProviderAuthAssist" data-provider="${providerStatus.provider}">Auth Assist</button>
					<button type="button" class="secondary" data-command="openProviderPortal" data-provider="${providerStatus.provider}">Open Portal</button>
				</div>
				<div class="grid" style="margin-top: 12px;">
					${providerStatus.metrics.map((metric) => `
						<div class="stat">
							<strong>${helpers.escapeHtml(metric.value)}</strong>
							<span>${helpers.escapeHtml(metric.label)}</span>
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
					<strong>${helpers.escapeHtml(`Stage ${String(stage.index).padStart(2, '0')} ${WORKFLOW_PRESETS[stage.preset].label}`)}</strong>
					<span>${helpers.escapeHtml(`${helpers.getProviderLabel(stage.provider)} · ${getWorkflowStageStatusLabel(stage.status)}`)}</span>
				</div>
			</li>`).join('')
		: '<li class="timeline-item empty"><div><strong>No stages yet</strong><span>Run Init Workflow to create the first handoff.</span></div></li>';

	const contentHtml = `
	<div class="tab-panel active" data-tab-panel="ctrl-overview">
		<section class="card hero">
			<div class="kicker">${helpers.escapeHtml(state.session ? 'Active workflow' : 'Guided setup')}</div>
			<h2>${helpers.escapeHtml(workspaceName)}</h2>
			<p class="lead">${helpers.escapeHtml(primaryActionTitle)}. This view keeps the current state, the likely next move, and the key files one click away.</p>
			<div class="actions" style="margin-top: 12px;">
				<button type="button" data-command="${state.session ? 'continue' : 'init'}">${helpers.escapeHtml(primaryActionTitle)}</button>
				<button type="button" class="secondary" data-command="openStudio">Open Workflow Studio</button>
			</div>
		</section>
		<section class="card">
			<h2>Current State</h2>
			<div class="grid">
				<div class="stat">
					<strong>${helpers.escapeHtml(currentStageLabel)}</strong>
					<span>${state.session ? `${stageCount} stage(s) recorded` : 'Start with Init Workflow'}</span>
				</div>
				<div class="stat">
					<strong>${helpers.escapeHtml(state.contextFileExists ? 'Context ready' : 'Context missing')}</strong>
					<span>${helpers.escapeHtml(latestHandoff)}</span>
				</div>
				<div class="stat">
					<strong>${helpers.escapeHtml(updatedAt)}</strong>
					<span>Last session update</span>
				</div>
				<div class="stat">
					<strong>${artifactCount}</strong>
					<span>native artifact file(s) across all stages</span>
				</div>
				<div class="stat">
					<strong>${helpers.escapeHtml(completionRatio)}</strong>
					<span>completed stage(s)</span>
				</div>
			</div>
		</section>
		<section class="card">
			<h2>Next Move</h2>
			<p class="lead">${helpers.escapeHtml(recommendedPreset ? `${WORKFLOW_PRESETS[recommendedPreset].label}: ${WORKFLOW_PRESETS[recommendedPreset].description}` : 'Use Continue Workflow to choose the next stage.')}</p>
			<p class="small">Suggested flow: ${helpers.escapeHtml(suggestions)}</p>
		</section>
	</div>
	<div class="tab-panel" data-tab-panel="ctrl-providers">
		<section class="card">
			<h2>Providers</h2>
			<p class="lead">Connect provider accounts directly from the extension, store optional credentials in SecretStorage, and run auth assists without leaving the workflow panel.</p>
			<p class="small">Last provider refresh: ${helpers.escapeHtml(providerStatusTimestamp)}</p>
			<div class="actions" style="margin-top: 12px;">
				<button type="button" class="secondary" data-command="refreshProviders">Refresh Provider Status</button>
				<button type="button" class="secondary" data-command="connectProviderAccount" data-provider="claude">Connect Claude</button>
				<button type="button" class="secondary" data-command="connectProviderAccount" data-provider="gemini">Connect Gemini</button>
			</div>
		</section>
		${providerCards}
	</div>
	<div class="tab-panel" data-tab-panel="ctrl-stage">
		<section class="card">
			<h2>Selected Stage</h2>
			<p class="lead">${helpers.escapeHtml(selectedStage ? `${WORKFLOW_PRESETS[selectedStage.preset].label} with ${helpers.getProviderLabel(selectedStage.provider)}` : 'Select a stage in the tree to inspect it here.')}</p>
			<p class="small">${helpers.escapeHtml(selectedStage ? selectedStage.briefSummary : 'The latest stage is shown by default until you select another one.')}</p>
			<div class="grid" style="margin-top: 12px;">
				<div class="stat">
					<strong>${helpers.escapeHtml(selectedStage ? getWorkflowStageStatusLabel(selectedStage.status) : 'No selection')}</strong>
					<span>Status</span>
				</div>
				<div class="stat">
					<strong>${helpers.escapeHtml(selectedStage ? selectedStage.stageFile : 'No handoff')}</strong>
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
				<button type="button" class="secondary" data-command="markPrepared" ${selectedStage ? '' : 'disabled'}>Mark Prepared</button>
				<button type="button" class="secondary" data-command="markInProgress" ${selectedStage ? '' : 'disabled'}>Mark In Progress</button>
				<button type="button" class="secondary" data-command="markCompleted" ${selectedStage ? '' : 'disabled'}>Mark Completed</button>
			</div>
		</section>
		<section class="card">
			<h2>Brief</h2>
			<p class="lead">${helpers.escapeHtml(briefGoal)}</p>
		</section>
		<section class="card">
			<h2>Recent Stages</h2>
			<ul class="timeline">${stageTimeline}</ul>
		</section>
	</div>
	<div class="tab-panel" data-tab-panel="ctrl-files">
		<section class="card">
			<h2>Quick Access</h2>
			<div class="shortcuts">
				<button type="button" class="linkButton" data-command="openContext" ${state.contextFileExists ? '' : 'disabled'}>Context Pack<span>${helpers.escapeHtml(CONTEXT_FILE_NAME)}</span></button>
				<button type="button" class="linkButton" data-command="openBrief" ${state.brief ? '' : 'disabled'}>Current Brief<span>${helpers.escapeHtml(state.brief ? state.brief.taskType : 'No brief yet')}</span></button>
				<button type="button" class="linkButton" data-command="openLatestHandoff" ${state.latestStage ? '' : 'disabled'}>Latest Handoff<span>${helpers.escapeHtml(latestHandoff)}</span></button>
				<button type="button" class="linkButton" data-command="openSession" ${state.session ? '' : 'disabled'}>Session State<span>${helpers.escapeHtml(WORKFLOW_SESSION_FILE)}</span></button>
				<button type="button" class="linkButton" data-command="previewPrompt" ${state.session ? '' : 'disabled'}>Prompt Preview<span>Open the current launch instruction</span></button>
				<button type="button" class="linkButton" data-command="copyPrompt" ${state.session ? '' : 'disabled'}>Copy Prompt<span>Copy the current launch instruction</span></button>
			</div>
		</section>
	</div>
	<div class="tab-panel" data-tab-panel="ctrl-actions">
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
	</div>
	`;

	const tabBarHtml = buildWorkflowControlTabBar([
		{ id: 'ctrl-overview', label: 'Overview' },
		{ id: 'ctrl-providers', label: 'Providers' },
		{ id: 'ctrl-stage', label: 'Stage' },
		{ id: 'ctrl-files', label: 'Files' },
		{ id: 'ctrl-actions', label: 'Actions' }
	]);

	return renderDesignShellDocument({
		webview,
		nonce,
		title: workspaceName,
		subtitle: 'Workflow Control keeps the current state, provider routing, and next actions aligned in one place.',
		kicker: state.session ? 'Active workflow' : 'Guided setup',
		contentHtml: tabBarHtml + contentHtml,
		layout: 'sidebar'
	});
}

export function getWorkflowStudioHtml(
	webview: vscode.Webview,
	state: WorkflowDashboardState,
	nonce: string,
	helpers: WorkflowUiHelpers
): string {
	const recommendedPreset = state.nextSuggestedPresets[0];
	const currentStageLabel = state.session
		? `${WORKFLOW_PRESETS[state.session.currentPreset].label} with ${helpers.getProviderLabel(state.session.currentProvider)}`
		: 'No active workflow';
	const updatedAt = state.session ? new Date(state.session.updatedAt).toLocaleString() : 'Not started';
	const providerStatusTimestamp = state.providerStatusUpdatedAt ? new Date(state.providerStatusUpdatedAt).toLocaleString() : 'Not refreshed yet';
	const selectedStage = state.selectedStage;
	const latestStage = state.latestStage;
	const studioSummary = state.providerStatuses.map((providerStatus) => `
		<div class="stat">
			<strong>${helpers.escapeHtml(providerStatus.summary)}</strong>
			<span>${helpers.escapeHtml(`${helpers.getProviderLabel(providerStatus.provider)} · ${providerStatus.detail}`)}</span>
		</div>`).join('');
	const accountColumns = state.providerStatuses.map((providerStatus) => `
		<section class="card">
			<h3>${helpers.escapeHtml(helpers.getProviderLabel(providerStatus.provider))}</h3>
			<p class="small">${helpers.escapeHtml(providerStatus.detail)}</p>
			<div class="actions" style="margin-top: 12px;">
				<button type="button" data-command="switchProviderAccount" data-provider="${providerStatus.provider}">Switch Active</button>
				<button type="button" class="secondary" data-command="manageProviderAccounts" data-provider="${providerStatus.provider}">Manage Accounts</button>
			</div>
			<div class="grid" style="margin-top: 12px;">
				${(providerStatus.accounts ?? []).map((account) => `
					<div class="stat">
						<strong>${helpers.escapeHtml(account.label)}${account.isActive ? ' · active' : ''}</strong>
						<span>${helpers.escapeHtml(account.metrics.slice(0, 3).map((metric) => `${metric.label}: ${metric.value}`).join(' · ') || account.summary)}</span>
					</div>`).join('') || '<div class="stat"><strong>No linked accounts</strong><span>Add an account to configure this provider.</span></div>'}
			</div>
		</section>`).join('');
	const stageList = state.session?.stages.map((stage) => `
		<div class="stat">
			<strong>${helpers.escapeHtml(`Stage ${String(stage.index).padStart(2, '0')} · ${WORKFLOW_PRESETS[stage.preset].label}`)}</strong>
			<span>${helpers.escapeHtml(`${helpers.getProviderLabel(stage.provider)} · ${getWorkflowStageStatusLabel(stage.status)} · ${stage.stageFile}`)}</span>
		</div>`).join('') ?? '<div class="stat"><strong>No stages yet</strong><span>Run Init Workflow to create the first handoff.</span></div>';

	const contentHtml = `
	<div class="tab-panel active" data-tab-panel="studio-overview">
		<section class="card hero">
			<div class="kicker">Workflow Studio</div>
			<h2>${helpers.escapeHtml(state.workspaceFolder?.name ?? 'No workspace')}</h2>
			<p class="lead">A larger surface for the orchestrator design system: workflow state, provider routing, detailed account views, and future AI console work can live here without the width constraints of the sidebar.</p>
			<div class="actions" style="margin-top: 12px;">
				<button type="button" data-command="${state.session ? 'continue' : 'init'}">${helpers.escapeHtml(state.session ? 'Continue Current Workflow' : 'Start First Workflow')}</button>
				<button type="button" class="secondary" data-command="refresh">Refresh Studio</button>
			</div>
		</section>
		<section class="card">
			<h2>Workflow Snapshot</h2>
			<div class="grid">
				<div class="stat"><strong>${helpers.escapeHtml(currentStageLabel)}</strong><span>Current stage</span></div>
				<div class="stat"><strong>${helpers.escapeHtml(updatedAt)}</strong><span>Last session update</span></div>
				<div class="stat"><strong>${state.artifactCount}</strong><span>Native artifact file(s)</span></div>
				<div class="stat"><strong>${helpers.escapeHtml(providerStatusTimestamp)}</strong><span>Last provider refresh</span></div>
			</div>
			<div class="grid" style="margin-top: 12px;">${studioSummary}</div>
		</section>
	</div>
	<div class="tab-panel" data-tab-panel="studio-providers">
		<section class="card">
			<h2>Provider Routing</h2>
			<p class="lead">This area is the first implementation slice of the richer design. It gives each provider more horizontal space and will become the natural home for deeper account, quota, and console experiences.</p>
			<div class="actions" style="margin-top: 12px;">
				<button type="button" class="secondary" data-command="refreshProviders">Refresh Provider Status</button>
				<button type="button" class="secondary" data-command="connectProviderAccount" data-provider="claude">Connect Claude</button>
				<button type="button" class="secondary" data-command="connectProviderAccount" data-provider="gemini">Connect Gemini</button>
			</div>
			<div class="grid" style="margin-top: 12px;">${accountColumns}</div>
		</section>
	</div>
	<div class="tab-panel" data-tab-panel="studio-stage-detail">
		<section class="card">
			<h2>Selected Stage Detail</h2>
			<div class="grid">
				<div class="stat"><strong>${helpers.escapeHtml(selectedStage ? `${WORKFLOW_PRESETS[selectedStage.preset].label} with ${helpers.getProviderLabel(selectedStage.provider)}` : 'No selection')}</strong><span>Focus</span></div>
				<div class="stat"><strong>${helpers.escapeHtml(selectedStage ? getWorkflowStageStatusLabel(selectedStage.status) : 'No selection')}</strong><span>Status</span></div>
				<div class="stat"><strong>${helpers.escapeHtml(selectedStage?.stageFile ?? latestStage?.stageFile ?? 'No handoff yet')}</strong><span>Stage handoff</span></div>
				<div class="stat"><strong>${helpers.escapeHtml(recommendedPreset ? WORKFLOW_PRESETS[recommendedPreset].label : 'No suggestion')}</strong><span>Suggested next move</span></div>
			</div>
			<p class="lead" style="margin-top: 12px;">${helpers.escapeHtml(selectedStage?.briefSummary ?? state.brief?.goal ?? 'No brief captured yet.')}</p>
			<div class="actions" style="margin-top: 12px;">
				<button type="button" class="secondary" data-command="openLatestHandoff" ${latestStage ? '' : 'disabled'}>Open Latest Handoff</button>
				<button type="button" class="secondary" data-command="previewPrompt" ${state.session ? '' : 'disabled'}>Preview Current Prompt</button>
				<button type="button" class="secondary" data-command="copyPrompt" ${state.session ? '' : 'disabled'}>Copy Current Prompt</button>
			</div>
		</section>
	</div>
	<div class="tab-panel" data-tab-panel="studio-stage-history">
		<section class="card">
			<h2>Stage History</h2>
			<div class="grid">${stageList}</div>
		</section>
	</div>
	<div class="tab-panel" data-tab-panel="studio-files">
		<section class="card">
			<h2>Quick Files</h2>
			<div class="shortcuts">
				<button type="button" class="linkButton" data-command="openContext" ${state.contextFileExists ? '' : 'disabled'}>Context Pack<span>${helpers.escapeHtml(CONTEXT_FILE_NAME)}</span></button>
				<button type="button" class="linkButton" data-command="openBrief" ${state.brief ? '' : 'disabled'}>Current Brief<span>${helpers.escapeHtml(state.brief?.taskType ?? 'No brief yet')}</span></button>
				<button type="button" class="linkButton" data-command="openLatestHandoff" ${latestStage ? '' : 'disabled'}>Latest Handoff<span>${helpers.escapeHtml(latestStage?.stageFile ?? 'No handoff')}</span></button>
				<button type="button" class="linkButton" data-command="openSession" ${state.session ? '' : 'disabled'}>Session State<span>${helpers.escapeHtml(WORKFLOW_SESSION_FILE)}</span></button>
			</div>
		</section>
	</div>
	`;

	return renderDesignShellDocument({
		webview,
		nonce,
		title: state.workspaceFolder?.name ?? 'AI Workflow Studio',
		subtitle: 'A wider orchestrator surface for navigation, provider management, stage review, and future console-oriented workflows.',
		kicker: 'Design system preview',
		navigationHtml: buildWorkflowTabNavigation([
			{ id: 'studio-overview', label: 'Overview', detail: currentStageLabel, emphasis: true },
			{ id: 'studio-providers', label: 'Provider Routing', detail: providerStatusTimestamp },
			{ id: 'studio-stage-detail', label: 'Stage Detail', detail: selectedStage ? getWorkflowStageStatusLabel(selectedStage.status) : 'No selection' },
			{ id: 'studio-stage-history', label: 'Stage History', detail: state.session ? `${state.session.stages.length} stage(s)` : 'No session' },
			{ id: 'studio-files', label: 'Quick Files', detail: state.contextFileExists ? 'Context ready' : 'Context missing' }
		]),
		contentHtml,
		layout: 'panel'
	});
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

function getWorkflowStageStatusIcon(status: WorkflowStageStatus, isCurrentStage: boolean): vscode.ThemeIcon {
	if (status === 'completed') {
		return new vscode.ThemeIcon('pass-filled');
	}

	if (status === 'in-progress' || isCurrentStage) {
		return new vscode.ThemeIcon('play-circle');
	}

	return new vscode.ThemeIcon('history');
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

function buildWorkflowTabNavigation(items: Array<{ id: string; label: string; detail: string; emphasis?: boolean }>): string {
	return items.map((item, index) => `
		<button type="button" class="nav-btn ${index === 0 ? 'active' : ''}" data-tab-target="${item.id}" ${item.emphasis ? 'data-emphasis="strong"' : ''}>
			<strong>${item.label}</strong>
			<span>${item.detail}</span>
		</button>`).join('');
}

function buildWorkflowControlTabBar(items: Array<{ id: string; label: string }>): string {
	const buttons = items.map((item, index) => `<button type="button" class="tab-bar-btn ${index === 0 ? 'active' : ''}" data-tab-target="${item.id}">${item.label}</button>`).join('');
	return `<div class="tab-bar">${buttons}</div>`;
}
export function formatWorkflowRoles(roles: WorkflowRole[]): string {
	return roles.map((role) => capitalize(role)).join(', ');
}
