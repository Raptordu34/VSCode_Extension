import * as vscode from 'vscode';
import {
	CLAUDE_DEFAULT_MODELS,
	DEFAULT_CONTEXT_FILES,
	GEMINI_DEFAULT_MODELS
} from '../features/workflow/constants.js';
import type {
	ClaudeEffortLevel,
	ContextRefreshMode,
	CostProfile,
	ExtensionConfiguration,
	ProviderAccountConfiguration,
	ProviderTarget,
	WorkflowPreset
} from '../features/workflow/types.js';
import { clampNumber } from '../utils/index.js';

export function normalizeProviderAccounts(
	rawAccounts: Array<Partial<ProviderAccountConfiguration>>,
	provider: ProviderTarget
): ProviderAccountConfiguration[] {
	return rawAccounts
		.map((account, index): ProviderAccountConfiguration | undefined => {
			const label = account.label?.trim();
			const configDir = account.configDir?.trim();
			if (!label) {
				return undefined;
			}

			const id = account.id?.trim() || `${provider}-account-${index + 1}`;
			return {
				id,
				provider,
				label,
				defaultModel: account.defaultModel?.trim() || undefined,
				defaultClaudeEffort: account.defaultClaudeEffort,
				configDir: configDir || undefined,
				authMode: account.authMode?.trim() || undefined,
				authCommand: account.authCommand?.trim() || undefined,
				apiKeyEnvVar: account.apiKeyEnvVar?.trim() || undefined,
				adminApiKeyEnvVar: account.adminApiKeyEnvVar?.trim() || undefined,
				workspaceId: account.workspaceId?.trim() || undefined,
				apiKeyId: account.apiKeyId?.trim() || undefined,
				quotaCommand: account.quotaCommand?.trim() || undefined,
				accountHint: account.accountHint?.trim() || undefined,
				notes: account.notes?.trim() || undefined
			};
		})
		.filter((account): account is ProviderAccountConfiguration => Boolean(account));
}

export function getExtensionConfiguration(): ExtensionConfiguration {
	const configuration = vscode.workspace.getConfiguration('aiContextOrchestrator');
	const treeDepth = clampNumber(configuration.get<number>('treeDepth', 2), 1, 6);
	const readmePreviewLines = clampNumber(configuration.get<number>('readmePreviewLines', 20), 5, 200);
	const contextFilePreviewLines = clampNumber(configuration.get<number>('contextFilePreviewLines', 80), 10, 400);
	const maxEntriesPerDirectory = clampNumber(configuration.get<number>('maxEntriesPerDirectory', 40), 5, 200);
	const extraContextFiles = configuration.get<string[]>('extraContextFiles', DEFAULT_CONTEXT_FILES);
	const showIgnoredDirectories = configuration.get<boolean>('showIgnoredDirectories', true);
	const optimizeWithCopilot = configuration.get<boolean>('optimizeWithCopilot', false);
	const modelFamily = configuration.get<string>('modelFamily', '').trim();
	const defaultClaudeModel = configuration.get<string>('defaultClaudeModel', CLAUDE_DEFAULT_MODELS[0]).trim() || CLAUDE_DEFAULT_MODELS[0];
	const defaultGeminiModel = configuration.get<string>('defaultGeminiModel', GEMINI_DEFAULT_MODELS[0]).trim() || GEMINI_DEFAULT_MODELS[0];
	const defaultClaudeEffort = configuration.get<ClaudeEffortLevel>('defaultClaudeEffort', 'medium');
	const rawClaudeAccounts = configuration.get<Array<Partial<ProviderAccountConfiguration>>>('claudeAccounts', []);
	const rawGeminiAccounts = configuration.get<Array<Partial<ProviderAccountConfiguration>>>('geminiAccounts', []);
	const rawCopilotAccounts = configuration.get<Array<Partial<ProviderAccountConfiguration>>>('copilotAccounts', []);
	const activeClaudeAccountId = configuration.get<string>('activeClaudeAccountId', '').trim() || undefined;
	const activeGeminiAccountId = configuration.get<string>('activeGeminiAccountId', '').trim() || undefined;
	const activeCopilotAccountId = configuration.get<string>('activeCopilotAccountId', '').trim() || undefined;
	const autoGenerateOnStartup = configuration.get<boolean>('autoGenerateOnStartup', false);
	const defaultPreset = configuration.get<WorkflowPreset>('defaultPreset', 'build');
	const defaultProvider = configuration.get<ProviderTarget>('defaultProvider', 'copilot');
	const contextRefreshMode = configuration.get<ContextRefreshMode>('contextRefreshMode', 'smart-refresh');
	const costProfile = configuration.get<CostProfile>('costProfile', 'balanced');
	const generateNativeArtifacts = configuration.get<boolean>('generateNativeArtifacts', true);
	const enabledProviders = configuration.get<ProviderTarget[]>('enabledProviders', ['claude', 'gemini', 'copilot']);
	const claudeAccounts = normalizeProviderAccounts(rawClaudeAccounts, 'claude');
	const geminiAccounts = normalizeProviderAccounts(rawGeminiAccounts, 'gemini');
	const copilotAccounts = normalizeProviderAccounts(rawCopilotAccounts, 'copilot');

	return {
		treeDepth,
		readmePreviewLines,
		contextFilePreviewLines,
		extraContextFiles: extraContextFiles.filter((entry) => entry.trim().length > 0),
		showIgnoredDirectories,
		maxEntriesPerDirectory,
		optimizeWithCopilot,
		modelFamily,
		defaultClaudeModel,
		defaultGeminiModel,
		defaultClaudeEffort,
		claudeAccounts,
		activeClaudeAccountId,
		geminiAccounts,
		activeGeminiAccountId,
		copilotAccounts,
		activeCopilotAccountId,
		autoGenerateOnStartup,
		defaultPreset,
		defaultProvider,
		contextRefreshMode,
		costProfile,
		generateNativeArtifacts,
		enabledProviders: enabledProviders.filter((provider): provider is ProviderTarget => ['claude', 'gemini', 'copilot'].includes(provider))
	};
}
