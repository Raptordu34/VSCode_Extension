import * as vscode from 'vscode';
import { PROVIDER_STATUS_CACHE_KEY } from '../workflow/constants.js';
import type {
	ExtensionConfiguration,
	MetricDisplay,
	ProviderAccountConfiguration,
	ProviderAccountStatus,
	ProviderStatusAvailability,
	ProviderStatusCache,
	ProviderStatusSnapshot,
	ProviderTarget
} from '../workflow/types.js';
import { execShellCommand } from '../../utils/index.js';
import { getExtensionConfiguration } from '../../core/configuration.js';
import { fileExists } from '../../core/workspace.js';
import {
	findProviderAccount,
	getActiveProviderAccountId,
	getDefaultClaudeEffort,
	getDefaultProviderModel,
	getProviderAccounts,
	getProviderLabel
} from './accountManager.js';
import {
	buildDefaultAuthAssistCommand,
	getEnvProviderCredential,
	getStoredProviderCredential
} from './credentialService.js';

export function buildDefaultAccountSummary(account: ProviderAccountConfiguration): string {
	if (account.provider === 'claude') {
		return account.configDir ? 'Ready to inspect, authenticate, or switch' : 'Missing Claude config directory';
	}

	if (account.provider === 'gemini') {
		return account.apiKeyEnvVar || account.authMode ? 'Gemini account ready for direct connection' : 'Gemini account without auth metadata';
	}

	return account.accountHint ? 'Tracked Copilot account reference' : 'Tracked Copilot account';
}

export function buildDefaultAccountDetail(account: ProviderAccountConfiguration): string {
	if (account.provider === 'claude') {
		return account.configDir
			? 'Use Connect Account or Auth Assist to bind this Claude profile to a dedicated login or API key.'
			: 'Set or generate a Claude config directory before trying to switch or inspect this account.';
	}

	if (account.provider === 'gemini') {
		return 'Use Connect Account to store a Gemini credential in the extension or run the auth assist for browser-based login.';
	}

	return 'Use this account as a workflow ownership reference. Copilot auth switching is not exposed by VS Code APIs.';
}

export function buildDefaultAccountMetrics(account: ProviderAccountConfiguration): MetricDisplay[] {
	if (account.provider === 'claude') {
		return [
			{ label: 'Model', value: account.defaultModel || 'workspace default', tone: account.defaultModel ? 'normal' : 'warning' },
			{ label: 'Effort', value: account.defaultClaudeEffort || 'workspace default', tone: account.defaultClaudeEffort ? 'normal' : 'warning' },
			{ label: 'Config Dir', value: account.configDir || 'not configured', tone: account.configDir ? 'normal' : 'critical' },
			{ label: 'Auth', value: account.authMode || 'profile login', tone: account.authMode ? 'normal' : 'warning' },
			{ label: 'Quota', value: account.quotaCommand || account.adminApiKeyEnvVar ? 'refresh available' : 'no data source', tone: account.quotaCommand || account.adminApiKeyEnvVar ? 'normal' : 'warning' }
		];
	}

	if (account.provider === 'gemini') {
		return [
			{ label: 'Model', value: account.defaultModel || 'workspace default', tone: account.defaultModel ? 'normal' : 'warning' },
			{ label: 'Auth', value: account.authMode || 'not set', tone: account.authMode ? 'normal' : 'warning' },
			{ label: 'Auth Assist', value: account.authCommand || 'default available', tone: 'normal' },
			{ label: 'API Key Env', value: account.apiKeyEnvVar || 'not set', tone: account.apiKeyEnvVar ? 'normal' : 'warning' },
			{ label: 'Quota', value: account.quotaCommand ? 'refresh available' : 'no data source', tone: account.quotaCommand ? 'normal' : 'warning' }
		];
	}

	return [
		{ label: 'Model', value: account.defaultModel || 'workspace default', tone: account.defaultModel ? 'normal' : 'warning' },
		{ label: 'Identity', value: account.accountHint || 'not set', tone: account.accountHint ? 'normal' : 'warning' },
		{ label: 'Notes', value: account.notes || 'none' }
	];
}

export function buildDefaultAccountStatuses(provider: ProviderTarget, configuration: ExtensionConfiguration): ProviderAccountStatus[] {
	const accounts = getProviderAccounts(configuration, provider);
	const activeAccountId = getActiveProviderAccountId(configuration, provider);
	return accounts.map((account, index) => ({
		id: account.id,
		provider,
		label: account.label,
		configDir: account.configDir,
		authMode: account.authMode,
		accountHint: account.accountHint,
		isActive: account.id === activeAccountId || (!activeAccountId && index === 0),
		availability: (account.provider === 'claude' && !account.configDir) ? 'needs-config' : 'ready',
		summary: buildDefaultAccountSummary(account),
		detail: account.notes ?? buildDefaultAccountDetail(account),
		metrics: buildDefaultAccountMetrics(account)
	}));
}

export function buildDefaultProviderStatuses(configuration: ExtensionConfiguration): ProviderStatusSnapshot[] {
	const claudeAccounts = buildDefaultAccountStatuses('claude', configuration);
	const geminiAccounts = buildDefaultAccountStatuses('gemini', configuration);
	const copilotAccounts = buildDefaultAccountStatuses('copilot', configuration);

	return [
		{
			provider: 'claude',
			availability: claudeAccounts.length > 0 ? 'ready' : 'needs-config',
			summary: claudeAccounts.length > 0 ? `${claudeAccounts.length} account(s) configured` : 'No Claude accounts configured',
			detail: claudeAccounts.length > 0
				? 'Account switching uses CLAUDE_CONFIG_DIR. Quota can come from a custom command or Anthropic Admin API.'
				: 'Add Claude accounts in the UI to enable switching and quota tracking.',
			metrics: claudeAccounts.length > 0
				? [
					{ label: 'Active Account', value: findProviderAccount(configuration, 'claude', configuration.activeClaudeAccountId)?.label ?? claudeAccounts[0].label },
					{ label: 'Default Model', value: getDefaultProviderModel('claude', configuration, configuration.activeClaudeAccountId) ?? 'provider default' },
					{ label: 'Default Effort', value: getDefaultClaudeEffort(configuration, configuration.activeClaudeAccountId) }
				]
				: [{ label: 'Active Account', value: 'none', tone: 'warning' }],
			accounts: claudeAccounts
		},
		{
			provider: 'gemini',
			availability: geminiAccounts.length > 0 ? 'ready' : 'needs-config',
			summary: geminiAccounts.length > 0 ? `${geminiAccounts.length} account(s) configured` : 'No Gemini accounts configured',
			detail: geminiAccounts.length > 0
				? 'Gemini accounts can carry auth mode, API key env references, and an optional quota command.'
				: 'Add Gemini accounts in the UI to keep linked identities and launch context together.',
			metrics: [
				{ label: 'Default Model', value: getDefaultProviderModel('gemini', configuration, configuration.activeGeminiAccountId) ?? configuration.defaultGeminiModel },
				{ label: 'Active Account', value: findProviderAccount(configuration, 'gemini', configuration.activeGeminiAccountId)?.label ?? (geminiAccounts[0]?.label ?? 'none'), tone: geminiAccounts.length > 0 ? 'normal' : 'warning' }
			],
			accounts: geminiAccounts
		},
		{
			provider: 'copilot',
			availability: copilotAccounts.length > 0 ? 'warning' : 'needs-config',
			summary: copilotAccounts.length > 0 ? `${copilotAccounts.length} account reference(s) configured` : 'No Copilot accounts configured',
			detail: copilotAccounts.length > 0
				? 'Copilot accounts are tracked in the extension UI, but VS Code does not expose programmable session switching for Copilot auth.'
				: 'Add Copilot account references in the UI if you want explicit workflow ownership or labeling.',
			metrics: [
				{ label: 'Model Family', value: getDefaultProviderModel('copilot', configuration, configuration.activeCopilotAccountId) ?? (configuration.modelFamily || 'VS Code default') },
				{ label: 'Active Account', value: findProviderAccount(configuration, 'copilot', configuration.activeCopilotAccountId)?.label ?? (copilotAccounts[0]?.label ?? 'none'), tone: copilotAccounts.length > 0 ? 'normal' : 'warning' }
			],
			accounts: copilotAccounts
		}
	];
}

export function mergeProviderStatusCache(
	configuration: ExtensionConfiguration,
	cache: ProviderStatusCache | undefined
): ProviderStatusSnapshot[] {
	const defaults = buildDefaultProviderStatuses(configuration);
	if (!cache) {
		return defaults;
	}

	return defaults.map((defaultProviderStatus) => {
		const cachedProviderStatus = cache.providers.find((providerStatus) => providerStatus.provider === defaultProviderStatus.provider);
		if (!cachedProviderStatus) {
			return defaultProviderStatus;
		}

		if (defaultProviderStatus.provider !== 'claude') {
			return { ...defaultProviderStatus, ...cachedProviderStatus };
		}

		const cachedAccounts = cachedProviderStatus.accounts ?? [];
		const defaultAccounts = defaultProviderStatus.accounts ?? [];
		return {
			...defaultProviderStatus,
			...cachedProviderStatus,
			accounts: defaultAccounts.map((defaultAccount) => {
				const cachedAccount = cachedAccounts.find((account) => account.id === defaultAccount.id);
				return cachedAccount ? { ...defaultAccount, ...cachedAccount, isActive: defaultAccount.isActive } : defaultAccount;
			})
		};
	});
}

export async function runQuotaCommand(command: string, configDir: string): Promise<{
	availability: ProviderStatusAvailability;
	summary: string;
	detail: string;
	metrics: MetricDisplay[];
}> {
	const stdout = await execShellCommand(command, {
		...process.env,
		CLAUDE_CONFIG_DIR: configDir
	});
	const payload = JSON.parse(stdout) as {
		summary?: string;
		detail?: string;
		availability?: ProviderStatusAvailability;
		metrics?: Array<{ label?: string; value?: string; tone?: MetricDisplay['tone'] }>;
	};
	const metrics = (payload.metrics ?? [])
		.filter((metric) => metric.label && metric.value)
		.map((metric) => ({
			label: metric.label as string,
			value: metric.value as string,
			tone: metric.tone ?? 'normal'
		}));

	return {
		availability: payload.availability ?? 'ready',
		summary: payload.summary ?? 'Quota refreshed',
		detail: payload.detail ?? 'Quota command returned successfully.',
		metrics
	};
}

export async function resolveClaudeAccountStatus(
	account: ProviderAccountConfiguration,
	configuration: ExtensionConfiguration,
	outputChannel: vscode.OutputChannel
): Promise<ProviderAccountStatus> {
	const configDirExists = account.configDir ? await fileExists(vscode.Uri.file(account.configDir)) : false;
	const storedCredential = await getStoredProviderCredential(account);
	const envCredential = getEnvProviderCredential(account);
	const baseStatus: ProviderAccountStatus = {
		id: account.id,
		provider: 'claude',
		label: account.label,
		configDir: account.configDir,
		authMode: account.authMode,
		accountHint: account.accountHint,
		isActive: account.id === configuration.activeClaudeAccountId || (!configuration.activeClaudeAccountId && configuration.claudeAccounts[0]?.id === account.id),
		availability: configDirExists ? 'ready' : 'error',
		summary: configDirExists ? 'Claude config directory reachable' : 'Claude config directory missing',
		detail: account.notes ?? (configDirExists ? 'Ready for account switching.' : 'Update configDir to an existing Claude config directory.'),
		metrics: [
			{ label: 'Model', value: account.defaultModel || configuration.defaultClaudeModel, tone: 'normal' },
			{ label: 'Effort', value: account.defaultClaudeEffort || configuration.defaultClaudeEffort, tone: 'normal' },
			{ label: 'Config Dir', value: configDirExists ? 'available' : 'missing', tone: configDirExists ? 'normal' : 'critical' },
			{ label: 'Credential', value: storedCredential ? 'stored in extension' : (envCredential ? `env:${account.apiKeyEnvVar}` : 'profile login or none'), tone: storedCredential || envCredential || account.authMode !== 'api-key' ? 'normal' : 'warning' },
			{ label: 'Auth Assist', value: account.authCommand || buildDefaultAuthAssistCommand('claude', account.authMode) || 'not configured', tone: account.authCommand || account.authMode !== 'api-key' ? 'normal' : 'warning' }
		]
	};

	if (!configDirExists) {
		return baseStatus;
	}

	if (account.quotaCommand) {
		try {
			const customQuota = await runQuotaCommand(account.quotaCommand, account.configDir ?? '');
			return {
				...baseStatus,
				availability: customQuota.availability,
				summary: customQuota.summary,
				detail: customQuota.detail,
				metrics: [...baseStatus.metrics, ...customQuota.metrics],
				lastCheckedAt: new Date().toISOString()
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			outputChannel.appendLine(`[providers] Claude quota command failed for ${account.label}: ${message}`);
			return {
				...baseStatus,
				availability: 'warning',
				summary: 'Account ready, quota command failed',
				detail: message,
				metrics: [...baseStatus.metrics, { label: 'Quota Source', value: 'command error', tone: 'warning' }],
				lastCheckedAt: new Date().toISOString(),
				errorMessage: message
			};
		}
	}

	if (account.adminApiKeyEnvVar && process.env[account.adminApiKeyEnvVar]) {
		return {
			...baseStatus,
			availability: 'warning',
			summary: 'Admin API key detected',
			detail: 'Admin API telemetry is configured, but this extension currently expects either a quota command or future Anthropic analytics parsing for live remaining quota.',
			metrics: [...baseStatus.metrics, { label: 'Quota Source', value: `env:${account.adminApiKeyEnvVar}` }],
			lastCheckedAt: new Date().toISOString()
		};
	}

	return {
		...baseStatus,
		availability: 'warning',
		summary: 'Account ready, quota source missing',
		detail: 'Add quotaCommand for rolling or weekly Claude quota, or add adminApiKeyEnvVar for API usage telemetry.',
		metrics: [...baseStatus.metrics, { label: 'Quota Source', value: 'not configured', tone: 'warning' }],
		lastCheckedAt: new Date().toISOString()
	};
}

export async function resolveGenericAccountStatus(
	account: ProviderAccountConfiguration,
	configuration: ExtensionConfiguration,
	outputChannel: vscode.OutputChannel
): Promise<ProviderAccountStatus> {
	const isActive = account.id === getActiveProviderAccountId(configuration, account.provider) || (!getActiveProviderAccountId(configuration, account.provider) && getProviderAccounts(configuration, account.provider)[0]?.id === account.id);
	const envVarValue = getEnvProviderCredential(account);
	const storedCredential = await getStoredProviderCredential(account);
	const baseStatus: ProviderAccountStatus = {
		id: account.id,
		provider: account.provider,
		label: account.label,
		configDir: account.configDir,
		authMode: account.authMode,
		accountHint: account.accountHint,
		isActive,
		availability: account.provider === 'copilot' ? 'warning' : (account.authMode || account.apiKeyEnvVar || storedCredential ? 'ready' : 'warning'),
		summary: buildDefaultAccountSummary(account),
		detail: account.notes ?? buildDefaultAccountDetail(account),
		metrics: [
			...buildDefaultAccountMetrics(account),
			...(account.provider === 'copilot'
				? []
				: [{
					label: 'Credential',
					value: storedCredential ? 'stored in extension' : (envVarValue ? `env:${account.apiKeyEnvVar}` : 'not stored'),
					tone: storedCredential || envVarValue ? 'normal' as const : 'warning' as const
				}])
		]
	};

	if (account.quotaCommand) {
		try {
			const customQuota = await runQuotaCommand(account.quotaCommand, account.configDir ?? '');
			return {
				...baseStatus,
				availability: account.provider === 'copilot' ? 'warning' : customQuota.availability,
				summary: customQuota.summary,
				detail: customQuota.detail,
				metrics: [...baseStatus.metrics, ...customQuota.metrics],
				lastCheckedAt: new Date().toISOString()
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			outputChannel.appendLine(`[providers] ${account.provider} quota command failed for ${account.label}: ${message}`);
			return {
				...baseStatus,
				availability: 'warning',
				summary: 'Account tracked, quota command failed',
				detail: message,
				metrics: [...baseStatus.metrics, { label: 'Quota Source', value: 'command error', tone: 'warning' }],
				lastCheckedAt: new Date().toISOString(),
				errorMessage: message
			};
		}
	}

	if (envVarValue) {
		return {
			...baseStatus,
			metrics: [...baseStatus.metrics, { label: 'Env', value: `env:${account.apiKeyEnvVar}` }],
			lastCheckedAt: new Date().toISOString()
		};
	}

	if (storedCredential) {
		return {
			...baseStatus,
			lastCheckedAt: new Date().toISOString()
		};
	}

	return {
		...baseStatus,
		lastCheckedAt: new Date().toISOString()
	};
}

export async function resolveClaudeProviderStatus(
	configuration: ExtensionConfiguration,
	outputChannel: vscode.OutputChannel
): Promise<ProviderStatusSnapshot> {
	if (configuration.claudeAccounts.length === 0) {
		return buildDefaultProviderStatuses(configuration).find((status) => status.provider === 'claude') as ProviderStatusSnapshot;
	}

	const accounts = await Promise.all(configuration.claudeAccounts.map((account) => resolveClaudeAccountStatus(account, configuration, outputChannel)));
	const activeAccount = accounts.find((account) => account.isActive) ?? accounts[0];
	const healthyAccounts = accounts.filter((account) => account.availability === 'ready' || account.availability === 'warning').length;
	return {
		provider: 'claude',
		availability: healthyAccounts > 0 ? 'ready' : 'needs-config',
		summary: `${healthyAccounts}/${accounts.length} Claude account(s) ready`,
		detail: activeAccount
			? `Active account: ${activeAccount.label}. Switch accounts directly from the workflow panel.`
			: 'Configure at least one Claude account to launch Claude with a dedicated config directory.',
		metrics: [
			{ label: 'Active Account', value: activeAccount?.label ?? 'none', tone: activeAccount ? 'normal' : 'warning' },
			{ label: 'Default Model', value: getDefaultProviderModel('claude', configuration, activeAccount?.id) ?? configuration.defaultClaudeModel },
			{ label: 'Default Effort', value: getDefaultClaudeEffort(configuration, activeAccount?.id) }
		],
		lastCheckedAt: new Date().toISOString(),
		accounts
	};
}

export async function resolveGenericProviderStatus(
	provider: 'gemini' | 'copilot',
	configuration: ExtensionConfiguration,
	outputChannel: vscode.OutputChannel
): Promise<ProviderStatusSnapshot> {
	const accounts = getProviderAccounts(configuration, provider);
	if (accounts.length === 0) {
		return buildDefaultProviderStatuses(configuration).find((status) => status.provider === provider) as ProviderStatusSnapshot;
	}

	const statuses = await Promise.all(accounts.map((account) => resolveGenericAccountStatus(account, configuration, outputChannel)));
	const activeAccount = statuses.find((account) => account.isActive) ?? statuses[0];
	return {
		provider,
		availability: statuses.some((status) => status.availability === 'ready' || status.availability === 'warning') ? (provider === 'copilot' ? 'warning' : 'ready') : 'needs-config',
		summary: `${statuses.length} ${getProviderLabel(provider)} account(s) tracked`,
		detail: provider === 'gemini'
			? `Active account: ${activeAccount?.label ?? 'none'}. Gemini accounts are stored and can drive env-based launches.`
			: `Active account: ${activeAccount?.label ?? 'none'}. Copilot accounts are tracked in the extension only; auth switching remains manual in VS Code.`,
		metrics: provider === 'gemini'
			? [
				{ label: 'Default Model', value: getDefaultProviderModel('gemini', configuration, activeAccount?.id) ?? configuration.defaultGeminiModel },
				{ label: 'Active Account', value: activeAccount?.label ?? 'none', tone: activeAccount ? 'normal' : 'warning' }
			]
			: [
				{ label: 'Model Family', value: getDefaultProviderModel('copilot', configuration, activeAccount?.id) ?? (configuration.modelFamily || 'VS Code default') },
				{ label: 'Active Account', value: activeAccount?.label ?? 'none', tone: activeAccount ? 'normal' : 'warning' }
			],
		lastCheckedAt: new Date().toISOString(),
		accounts: statuses
	};
}

export async function refreshProviderStatuses(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel): Promise<void> {
	const configuration = getExtensionConfiguration();
	const providerStatuses = await Promise.all([
		resolveClaudeProviderStatus(configuration, outputChannel),
		resolveGenericProviderStatus('gemini', configuration, outputChannel),
		resolveGenericProviderStatus('copilot', configuration, outputChannel)
	]);
	const cache: ProviderStatusCache = {
		updatedAt: new Date().toISOString(),
		providers: providerStatuses
	};
	await context.globalState.update(PROVIDER_STATUS_CACHE_KEY, cache);
	outputChannel.appendLine(`[providers] Refreshed provider status snapshot at ${cache.updatedAt}`);
	void vscode.window.showInformationMessage('Provider status refreshed.');
}
