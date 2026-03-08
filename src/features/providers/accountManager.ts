import * as vscode from 'vscode';
import type { ProviderAccountConfiguration, ProviderTarget } from './types.js';
import type {
	ClaudeEffortLevel,
	ExtensionConfiguration,
	WorkflowPresetDefinition
} from '../workflow/types.js';
import { getProviderCapabilities, getProviderModelCatalog } from './providerCatalog.js';

export function getProviderAccounts(configuration: ExtensionConfiguration, provider: ProviderTarget): ProviderAccountConfiguration[] {
	switch (provider) {
		case 'claude':
			return configuration.claudeAccounts;
		case 'gemini':
			return configuration.geminiAccounts;
		case 'copilot':
			return configuration.copilotAccounts;
	}
}

export function getActiveProviderAccountId(configuration: ExtensionConfiguration, provider: ProviderTarget): string | undefined {
	switch (provider) {
		case 'claude':
			return configuration.activeClaudeAccountId;
		case 'gemini':
			return configuration.activeGeminiAccountId;
		case 'copilot':
			return configuration.activeCopilotAccountId;
	}
}

export async function updateActiveProviderAccountId(provider: ProviderTarget, accountId: string | undefined): Promise<void> {
	const configuration = vscode.workspace.getConfiguration('aiContextOrchestrator');
	switch (provider) {
		case 'claude':
			await configuration.update('activeClaudeAccountId', accountId ?? '', vscode.ConfigurationTarget.Global);
			return;
		case 'gemini':
			await configuration.update('activeGeminiAccountId', accountId ?? '', vscode.ConfigurationTarget.Global);
			return;
		case 'copilot':
			await configuration.update('activeCopilotAccountId', accountId ?? '', vscode.ConfigurationTarget.Global);
			return;
	}
}

export async function writeProviderAccounts(provider: ProviderTarget, accounts: ProviderAccountConfiguration[]): Promise<void> {
	const configuration = vscode.workspace.getConfiguration('aiContextOrchestrator');
	const serializedAccounts = accounts.map((account) => ({
		id: account.id,
		label: account.label,
		defaultModel: account.defaultModel,
		defaultClaudeEffort: account.defaultClaudeEffort,
		configDir: account.configDir,
		authMode: account.authMode,
		authCommand: account.authCommand,
		apiKeyEnvVar: account.apiKeyEnvVar,
		adminApiKeyEnvVar: account.adminApiKeyEnvVar,
		workspaceId: account.workspaceId,
		apiKeyId: account.apiKeyId,
		quotaCommand: account.quotaCommand,
		accountHint: account.accountHint,
		notes: account.notes
	}));

	switch (provider) {
		case 'claude':
			await configuration.update('claudeAccounts', serializedAccounts, vscode.ConfigurationTarget.Global);
			return;
		case 'gemini':
			await configuration.update('geminiAccounts', serializedAccounts, vscode.ConfigurationTarget.Global);
			return;
		case 'copilot':
			await configuration.update('copilotAccounts', serializedAccounts, vscode.ConfigurationTarget.Global);
			return;
	}
}

export function findProviderAccount(
	configuration: ExtensionConfiguration,
	provider: ProviderTarget,
	accountId: string | undefined
): ProviderAccountConfiguration | undefined {
	const accounts = getProviderAccounts(configuration, provider);
	if (accounts.length === 0) {
		return undefined;
	}

	return accounts.find((account) => account.id === accountId) ?? accounts[0];
}

export function findClaudeAccount(configuration: ExtensionConfiguration, accountId: string | undefined): ProviderAccountConfiguration | undefined {
	return findProviderAccount(configuration, 'claude', accountId);
}

export function getProviderLabel(provider: ProviderTarget): string {
	switch (provider) {
		case 'claude':
			return 'Claude';
		case 'gemini':
			return 'Gemini';
		case 'copilot':
			return 'Copilot';
	}
}

export function getDefaultProviderModel(provider: ProviderTarget, configuration: ExtensionConfiguration, accountId?: string): string | undefined {
	const accountDefaultModel = findProviderAccount(configuration, provider, accountId)?.defaultModel?.trim();
	if (accountDefaultModel) {
		return accountDefaultModel;
	}

	switch (provider) {
		case 'claude':
			return configuration.defaultClaudeModel;
		case 'gemini':
			return configuration.defaultGeminiModel;
		case 'copilot':
			return configuration.modelFamily || undefined;
	}
}

export function getDefaultClaudeEffort(configuration: ExtensionConfiguration, accountId?: string): ClaudeEffortLevel {
	return findClaudeAccount(configuration, accountId)?.defaultClaudeEffort ?? configuration.defaultClaudeEffort;
}

export function getProviderModelOptions(
	provider: ProviderTarget,
	configuration: ExtensionConfiguration,
	preferredModel?: string
): Array<{ label: string; value: string | undefined; description?: string; detail: string }> {
	if (provider !== 'copilot') {
		const defaultModel = provider === 'claude' ? configuration.defaultClaudeModel : configuration.defaultGeminiModel;
		const options: Array<{ label: string; value: string | undefined; description?: string; detail: string }> = getProviderModelCatalog(provider).map((model) => ({
			label: model.label,
			value: model.id,
			description: model.id === defaultModel ? `Default ${getProviderLabel(provider)} model` : model.description,
			detail: model.detail
		}));
		if (preferredModel && !options.some((option) => option.value === preferredModel)) {
			options.unshift({
				label: preferredModel,
				value: preferredModel,
				description: 'Saved account model',
				detail: `Custom ${getProviderLabel(provider)} model currently configured for this account.`
			});
		}
		return options;
	}

	const options: Array<{ label: string; value: string | undefined; description?: string; detail: string }> = [{
		label: configuration.modelFamily || 'VS Code default',
		value: configuration.modelFamily || undefined,
		description: configuration.modelFamily ? 'Configured Copilot family' : 'Uses the default chat model exposed by VS Code',
		detail: configuration.modelFamily
			? `Launch preview and setup summaries will use ${configuration.modelFamily}.`
			: 'Leave model selection to the current Copilot Chat configuration.'
	}];
	if (preferredModel && !options.some((option) => option.value === preferredModel)) {
		options.unshift({
			label: preferredModel,
			value: preferredModel,
			description: 'Saved account model',
			detail: 'Custom Copilot model family currently configured for this account.'
		});
	}
	return options;
}

export function formatProviderModel(provider: ProviderTarget, model: string | undefined): string {
	if (!model) {
		return provider === 'copilot' ? 'VS Code default' : 'provider default';
	}

	return model;
}

export function buildProviderDetail(provider: ProviderTarget, presetDefinition: WorkflowPresetDefinition): string {
	return getProviderCapabilities(provider).recommendedDetail[presetDefinition.preset];
}
