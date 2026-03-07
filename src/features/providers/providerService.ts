import * as vscode from "vscode";
import { promises } from "fs";
import { CLAUDE_DEFAULT_MODELS, GEMINI_DEFAULT_MODELS, PROVIDER_STATUS_CACHE_KEY, PROVIDER_ACCOUNT_SECRET_PREFIX } from "../workflow/constants.js";
import type { ExtensionConfiguration, ProviderStatusSnapshot, ProviderTarget, ProviderAccountStatus, ProviderAccountConfiguration, MetricDisplay, ProviderStatusCache, ProviderStatusAvailability, ClaudeEffortLevel, WorkflowPresetDefinition, WorkflowQuickPickItem } from "../workflow/types.js";
import { execShellCommand, capitalize } from "../../utils/index.js";
import { getExtensionConfiguration } from "../../core/configuration.js";
import { extensionContextRef } from "../../extension.js";
import { fileExists } from "../../core/workspace.js";

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
		availability: account.label ? 'needs-config' : 'error',
		summary: buildDefaultAccountSummary(account),
		detail: account.notes ?? buildDefaultAccountDetail(account),
		metrics: buildDefaultAccountMetrics(account)
	}));
}
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
export function getAccountSecretStorageKey(account: ProviderAccountConfiguration): string {
	return `${PROVIDER_ACCOUNT_SECRET_PREFIX}:${account.provider}:${account.id}`;
}
export async function getStoredProviderCredential(account: ProviderAccountConfiguration): Promise<string | undefined> {
	return extensionContextRef?.secrets.get(getAccountSecretStorageKey(account));
}
export async function setStoredProviderCredential(account: ProviderAccountConfiguration, value: string | undefined): Promise<void> {
	if (!extensionContextRef) {
		throw new Error('Extension context is not available.');
	}

	const storageKey = getAccountSecretStorageKey(account);
	if (value && value.trim().length > 0) {
		await extensionContextRef.secrets.store(storageKey, value.trim());
		return;
	}

	await extensionContextRef.secrets.delete(storageKey);
}
export function getEnvProviderCredential(account: ProviderAccountConfiguration): string | undefined {
	return account.apiKeyEnvVar ? process.env[account.apiKeyEnvVar] : undefined;
}
export async function getResolvedProviderCredential(account: ProviderAccountConfiguration): Promise<string | undefined> {
	const storedCredential = await getStoredProviderCredential(account);
	if (storedCredential) {
		return storedCredential;
	}

	return getEnvProviderCredential(account);
}
export function getManagedClaudeConfigDir(accountId: string): vscode.Uri | undefined {
	if (!extensionContextRef) {
		return undefined;
	}

	return vscode.Uri.joinPath(extensionContextRef.globalStorageUri, 'claude-profiles', accountId);
}
export function getProviderAccountPortalUrl(provider: ProviderTarget, authMode: string | undefined): string {
	if (provider === 'claude') {
		return authMode === 'api-key'
			? 'https://console.anthropic.com/settings/keys'
			: 'https://claude.ai/login';
	}

	if (provider === 'gemini') {
		return authMode === 'api-key'
			? 'https://aistudio.google.com/app/apikey'
			: 'https://gemini.google.com/';
	}

	return 'https://github.com/settings/copilot';
}
export function buildDefaultAuthAssistCommand(provider: ProviderTarget, authMode: string | undefined): string | undefined {
	if (provider === 'claude') {
		return authMode === 'api-key' ? undefined : 'claude login';
	}

	if (provider === 'gemini') {
		return authMode === 'api-key' ? undefined : 'gemini auth login';
	}

	return undefined;
}
export async function buildProviderLaunchEnvironment(account: ProviderAccountConfiguration | undefined): Promise<Record<string, string>> {
	if (!account) {
		return {};
	}

	const resolvedCredential = await getResolvedProviderCredential(account);
	if (account.provider === 'claude') {
		return {
			...(account.configDir ? { CLAUDE_CONFIG_DIR: account.configDir } : {}),
			...(resolvedCredential ? { ANTHROPIC_API_KEY: resolvedCredential } : {})
		};
	}

	if (account.provider === 'gemini' && resolvedCredential) {
		return {
			GEMINI_API_KEY: resolvedCredential,
			GOOGLE_API_KEY: resolvedCredential
		};
	}

	return {};
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
export async function switchActiveProviderAccount(provider?: ProviderTarget): Promise<boolean> {
	const resolvedProvider = provider ?? await promptForProviderTarget('Choose the provider account to activate');
	if (!resolvedProvider) {
		return false;
	}

	const configuration = getExtensionConfiguration();
	const accounts = getProviderAccounts(configuration, resolvedProvider);
	if (accounts.length === 0) {
		void vscode.window.showInformationMessage(`No ${getProviderLabel(resolvedProvider)} accounts are configured yet.`);
		return false;
	}

	const currentAccount = findProviderAccount(configuration, resolvedProvider, getActiveProviderAccountId(configuration, resolvedProvider));
	const selection = await vscode.window.showQuickPick(accounts.map((account) => ({
		label: account.label,
		description: account.id === currentAccount?.id ? 'Active account' : undefined,
		detail: account.configDir || account.accountHint || account.apiKeyEnvVar || account.notes,
		picked: account.id === currentAccount?.id
	})), {
		title: `Switch ${getProviderLabel(resolvedProvider)} Account`,
		placeHolder: `Choose which ${getProviderLabel(resolvedProvider)} account should be active in the orchestrator UI`,
		ignoreFocusOut: true
	});

	if (!selection) {
		return false;
	}

	const nextAccount = accounts.find((account) => account.label === selection.label);
	if (!nextAccount) {
		return false;
	}

	await updateActiveProviderAccountId(resolvedProvider, nextAccount.id);
	void vscode.window.showInformationMessage(`Active ${getProviderLabel(resolvedProvider)} account set to ${nextAccount.label}.`);
	return true;
}
export async function manageProviderAccounts(provider?: ProviderTarget): Promise<void> {
	const resolvedProvider = provider ?? await promptForProviderTarget('Choose the provider whose linked accounts you want to manage');
	if (!resolvedProvider) {
		return;
	}

	const configuration = getExtensionConfiguration();
	const accounts = getProviderAccounts(configuration, resolvedProvider);
	const action = await vscode.window.showQuickPick([
		{ label: 'Connect Account', detail: `Create or update a ${getProviderLabel(resolvedProvider)} account and optionally store its credential in the extension.` },
		{ label: 'Add Account', detail: `Create a new ${getProviderLabel(resolvedProvider)} account entry in the extension settings.` },
		{ label: 'Edit Account', detail: accounts.length > 0 ? `Edit an existing ${getProviderLabel(resolvedProvider)} account.` : 'No account to edit yet.', alwaysShow: true },
		{ label: 'Configure Stored Credential', detail: accounts.length > 0 ? `Store or remove a ${getProviderLabel(resolvedProvider)} credential in VS Code SecretStorage.` : 'No account to configure yet.', alwaysShow: true },
		{ label: 'Run Auth Assist', detail: accounts.length > 0 ? `Open a terminal with the selected account environment and run its auth command.` : 'No account to authenticate yet.', alwaysShow: true },
		{ label: 'Open Provider Portal', detail: `Open the ${getProviderLabel(resolvedProvider)} login or account portal in the browser.` },
		{ label: 'Remove Account', detail: accounts.length > 0 ? `Remove an existing ${getProviderLabel(resolvedProvider)} account.` : 'No account to remove yet.', alwaysShow: true },
		{ label: 'Set Active Account', detail: accounts.length > 0 ? `Choose which ${getProviderLabel(resolvedProvider)} account should be active.` : 'No account to activate yet.', alwaysShow: true },
		{ label: 'Open Extension Settings', detail: 'Open the raw settings if you prefer direct JSON editing.' }
	], {
		title: `Manage ${getProviderLabel(resolvedProvider)} Accounts`,
		placeHolder: `Choose how to manage linked ${getProviderLabel(resolvedProvider)} accounts`,
		ignoreFocusOut: true
	});

	if (!action) {
		return;
	}

	if (action.label === 'Open Extension Settings') {
		await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:ai-context-orchestrator aiContextOrchestrator');
		return;
	}

	if (action.label === 'Set Active Account') {
		await switchActiveProviderAccount(resolvedProvider);
		return;
	}

	if (action.label === 'Connect Account') {
		await connectProviderAccount(resolvedProvider);
		return;
	}

	if (action.label === 'Configure Stored Credential') {
		await configureProviderCredential(resolvedProvider);
		return;
	}

	if (action.label === 'Run Auth Assist') {
		await runProviderAuthAssist(resolvedProvider);
		return;
	}

	if (action.label === 'Open Provider Portal') {
		await openProviderAccountPortal(resolvedProvider);
		return;
	}

	if ((action.label === 'Edit Account' || action.label === 'Remove Account') && accounts.length === 0) {
		void vscode.window.showInformationMessage(`No ${getProviderLabel(resolvedProvider)} accounts are configured yet.`);
		return;
	}

	if (action.label === 'Add Account') {
		const newAccount = await promptForProviderAccountDetails(resolvedProvider);
		if (!newAccount) {
			return;
		}

		await writeProviderAccounts(resolvedProvider, [...accounts, newAccount]);
		if (!getActiveProviderAccountId(getExtensionConfiguration(), resolvedProvider)) {
			await updateActiveProviderAccountId(resolvedProvider, newAccount.id);
		}
		void vscode.window.showInformationMessage(`${getProviderLabel(resolvedProvider)} account ${newAccount.label} added.`);
		return;
	}

	const targetAccount = await promptForExistingProviderAccount(resolvedProvider, accounts, action.label);
	if (!targetAccount) {
		return;
	}

	if (action.label === 'Remove Account') {
		const nextAccounts = accounts.filter((account) => account.id !== targetAccount.id);
		await writeProviderAccounts(resolvedProvider, nextAccounts);
		const activeId = getActiveProviderAccountId(getExtensionConfiguration(), resolvedProvider);
		if (activeId === targetAccount.id) {
			await updateActiveProviderAccountId(resolvedProvider, nextAccounts[0]?.id);
		}
		void vscode.window.showInformationMessage(`${getProviderLabel(resolvedProvider)} account ${targetAccount.label} removed.`);
		return;
	}

	const editedAccount = await promptForProviderAccountDetails(resolvedProvider, targetAccount);
	if (!editedAccount) {
		return;
	}

	await writeProviderAccounts(resolvedProvider, accounts.map((account) => account.id === targetAccount.id ? editedAccount : account));
	void vscode.window.showInformationMessage(`${getProviderLabel(resolvedProvider)} account ${editedAccount.label} updated.`);
}
export async function connectProviderAccount(provider?: ProviderTarget): Promise<void> {
	const resolvedProvider = provider ?? await promptForProviderTarget('Choose the provider account to connect');
	if (!resolvedProvider) {
		return;
	}

	const configuration = getExtensionConfiguration();
	const accounts = getProviderAccounts(configuration, resolvedProvider);
	const selection = await vscode.window.showQuickPick([
		{ label: 'New Account', description: `Create and connect a new ${getProviderLabel(resolvedProvider)} account.`, detail: 'Guided setup with optional stored credential and auth assist.' },
		...accounts.map((account) => ({
			label: account.label,
			description: account.accountHint,
			detail: account.configDir || account.apiKeyEnvVar || account.notes
		}))
	], {
		title: `Connect ${getProviderLabel(resolvedProvider)} Account`,
		placeHolder: 'Choose an existing account to complete or create a new one',
		ignoreFocusOut: true
	});
	if (!selection) {
		return;
	}

	const existingAccount = selection.label === 'New Account'
		? undefined
		: accounts.find((account) => account.label === selection.label);
	const nextAccount = await promptForProviderAccountDetails(resolvedProvider, existingAccount);
	if (!nextAccount) {
		return;
	}

	const nextAccounts = existingAccount
		? accounts.map((account) => account.id === existingAccount.id ? nextAccount : account)
		: [...accounts, nextAccount];
	await writeProviderAccounts(resolvedProvider, nextAccounts);
	await updateActiveProviderAccountId(resolvedProvider, nextAccount.id);

	if (resolvedProvider !== 'copilot') {
		await promptForStoredCredential(nextAccount, existingAccount ? 'update' : 'connect');
	}

	const nextStep = await vscode.window.showQuickPick([
		{ label: 'Run Auth Assist', detail: 'Open a terminal with this account selected and run its auth command when available.' },
		{ label: 'Open Provider Portal', detail: 'Open the provider account or login page in the browser.' },
		{ label: 'Done', detail: 'Keep the account as-is and continue.' }
	], {
		title: `${getProviderLabel(resolvedProvider)} Account Connected`,
		placeHolder: `Choose the next step for ${nextAccount.label}`,
		ignoreFocusOut: true
	});

	if (nextStep?.label === 'Run Auth Assist') {
		await runProviderAuthAssist(resolvedProvider, nextAccount.id);
		return;
	}

	if (nextStep?.label === 'Open Provider Portal') {
		await openProviderAccountPortal(resolvedProvider, nextAccount.id);
		return;
	}

	void vscode.window.showInformationMessage(`${getProviderLabel(resolvedProvider)} account ${nextAccount.label} connected and activated.`);
}
export async function configureProviderCredential(provider?: ProviderTarget, accountId?: string): Promise<void> {
	const resolvedProvider = provider ?? await promptForProviderTarget('Choose the provider credential to configure');
	if (!resolvedProvider) {
		return;
	}

	if (resolvedProvider === 'copilot') {
		void vscode.window.showInformationMessage('Copilot authentication cannot be stored or switched by this extension because VS Code does not expose programmable Copilot session auth.');
		return;
	}

	const configuration = getExtensionConfiguration();
	const accounts = getProviderAccounts(configuration, resolvedProvider);
	if (accounts.length === 0) {
		void vscode.window.showInformationMessage(`No ${getProviderLabel(resolvedProvider)} accounts are configured yet.`);
		return;
	}

	const targetAccount = accountId
		? accounts.find((account) => account.id === accountId)
		: await promptForExistingProviderAccount(resolvedProvider, accounts, 'Configure');
	if (!targetAccount) {
		return;
	}

	const existingCredential = await getStoredProviderCredential(targetAccount);
	const action = await vscode.window.showQuickPick([
		{ label: existingCredential ? 'Update Stored Credential' : 'Store Credential', detail: 'Save the provider secret in VS Code SecretStorage and inject it when this account launches.' },
		{ label: 'Remove Stored Credential', detail: existingCredential ? 'Delete the stored provider secret for this account.' : 'No stored credential exists yet.', alwaysShow: true },
		{ label: 'Cancel', detail: 'Leave the current credential state unchanged.' }
	], {
		title: `${getProviderLabel(resolvedProvider)} Credential`,
		placeHolder: `Manage the stored credential for ${targetAccount.label}`,
		ignoreFocusOut: true
	});
	if (!action || action.label === 'Cancel') {
		return;
	}

	if (action.label === 'Remove Stored Credential') {
		await setStoredProviderCredential(targetAccount, undefined);
		void vscode.window.showInformationMessage(`Stored credential removed for ${targetAccount.label}.`);
		return;
	}

	await promptForStoredCredential(targetAccount, existingCredential ? 'update' : 'connect');
}
export async function runProviderAuthAssist(provider?: ProviderTarget, accountId?: string): Promise<void> {
	const resolvedProvider = provider ?? await promptForProviderTarget('Choose the provider account to authenticate');
	if (!resolvedProvider) {
		return;
	}

	if (resolvedProvider === 'copilot') {
		await openProviderAccountPortal('copilot');
		void vscode.window.showInformationMessage('Copilot auth remains managed by VS Code and GitHub. The extension can only open the account portal.');
		return;
	}

	const configuration = getExtensionConfiguration();
	const accounts = getProviderAccounts(configuration, resolvedProvider);
	if (accounts.length === 0) {
		void vscode.window.showInformationMessage(`No ${getProviderLabel(resolvedProvider)} accounts are configured yet.`);
		return;
	}

	const targetAccount = accountId
		? accounts.find((account) => account.id === accountId)
		: await promptForExistingProviderAccount(resolvedProvider, accounts, 'Authenticate');
	if (!targetAccount) {
		return;
	}

	const authCommand = targetAccount.authCommand || buildDefaultAuthAssistCommand(resolvedProvider, targetAccount.authMode);
	if (!authCommand) {
		const action = await vscode.window.showQuickPick([
			{ label: 'Store Credential', detail: 'Store an API key in the extension instead of running an auth command.' },
			{ label: 'Open Provider Portal', detail: 'Open the provider login or account page in the browser.' },
			{ label: 'Cancel', detail: 'Do nothing for now.' }
		], {
			title: `${getProviderLabel(resolvedProvider)} Auth Assist`,
			placeHolder: `No auth command is configured for ${targetAccount.label}`,
			ignoreFocusOut: true
		});
		if (action?.label === 'Store Credential') {
			await configureProviderCredential(resolvedProvider, targetAccount.id);
			return;
		}
		if (action?.label === 'Open Provider Portal') {
			await openProviderAccountPortal(resolvedProvider, targetAccount.id);
		}
		return;
	}

	const terminal = vscode.window.createTerminal({
		name: `${getProviderLabel(resolvedProvider)} Auth (${targetAccount.label})`,
		cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
		env: await buildProviderLaunchEnvironment(targetAccount)
	});
	terminal.show(true);
	terminal.sendText(authCommand, true);
	void vscode.window.showInformationMessage(`${getProviderLabel(resolvedProvider)} auth assist started for ${targetAccount.label}.`);
}
export async function openProviderAccountPortal(provider?: ProviderTarget, accountId?: string): Promise<void> {
	const resolvedProvider = provider ?? await promptForProviderTarget('Choose the provider portal to open');
	if (!resolvedProvider) {
		return;
	}

	const configuration = getExtensionConfiguration();
	const targetAccount = accountId
		? getProviderAccounts(configuration, resolvedProvider).find((account) => account.id === accountId)
		: findProviderAccount(configuration, resolvedProvider, getActiveProviderAccountId(configuration, resolvedProvider));
	const url = getProviderAccountPortalUrl(resolvedProvider, targetAccount?.authMode);
	await vscode.env.openExternal(vscode.Uri.parse(url));
}
export async function promptForExistingProviderAccount(
	provider: ProviderTarget,
	accounts: ProviderAccountConfiguration[],
	actionLabel: string
): Promise<ProviderAccountConfiguration | undefined> {
	const selection = await vscode.window.showQuickPick(accounts.map((account) => ({
		label: account.label,
		description: account.accountHint,
		detail: account.configDir || account.apiKeyEnvVar || account.notes
	})), {
		title: `${actionLabel} ${getProviderLabel(provider)} Account`,
		placeHolder: `Choose the ${getProviderLabel(provider)} account to ${actionLabel.toLowerCase()}`,
		ignoreFocusOut: true
	});

	return accounts.find((account) => account.label === selection?.label);
}
export async function promptForProviderAccountDetails(
	provider: ProviderTarget,
	existing?: ProviderAccountConfiguration
): Promise<ProviderAccountConfiguration | undefined> {
	const id = existing?.id ?? `${provider}-account-${Date.now()}`;
	const managedClaudePath = provider === 'claude' ? getManagedClaudeConfigDir(id)?.fsPath : undefined;
	const label = await vscode.window.showInputBox({
		title: `${existing ? 'Edit' : 'Add'} ${getProviderLabel(provider)} Account`,
		prompt: 'Account label shown in the UI',
		value: existing?.label,
		ignoreFocusOut: true,
		validateInput: (value) => value.trim().length === 0 ? 'Label is required.' : undefined
	});
	if (!label) {
		return undefined;
	}

	const accountHint = await vscode.window.showInputBox({
		title: `${getProviderLabel(provider)} Account Identity`,
		prompt: provider === 'copilot' ? 'Optional email or tenant hint for this Copilot account' : 'Optional email, org, or identity hint for this account',
		value: existing?.accountHint,
		ignoreFocusOut: true
	});
	if (accountHint === undefined) {
		return undefined;
	}

	const configuration = getExtensionConfiguration();
	const defaultModel = await vscode.window.showInputBox({
		title: `${getProviderLabel(provider)} Default Model`,
		prompt: `Optional model id used by default for this account. Leave empty to inherit ${getDefaultProviderModel(provider, configuration) ?? 'the workspace default'}.`,
		value: existing?.defaultModel,
		ignoreFocusOut: true
	});
	if (defaultModel === undefined) {
		return undefined;
	}

	const defaultClaudeEffort = provider === 'claude'
		? await promptForAccountClaudeEffort(existing?.defaultClaudeEffort, configuration.defaultClaudeEffort)
		: existing?.defaultClaudeEffort;
	if (defaultClaudeEffort === null) {
		return undefined;
	}

	const authMode = provider === 'copilot'
		? existing?.authMode
		: await vscode.window.showInputBox({
			title: `${getProviderLabel(provider)} Auth Mode`,
			prompt: provider === 'claude'
				? 'Optional auth mode, for example claudeai, console, api-key, vertex, or bedrock'
				: 'Optional auth mode, for example google-login, api-key, vertex, or service-account',
			value: existing?.authMode,
			ignoreFocusOut: true
		});
	if (authMode === undefined) {
		return undefined;
	}

	const configDir = provider === 'claude'
		? await vscode.window.showInputBox({
			title: 'Claude Config Directory',
			prompt: `Absolute CLAUDE_CONFIG_DIR for this Claude account. Leave empty to use a managed profile at ${managedClaudePath ?? 'the extension storage path'}.`,
			value: existing?.configDir,
			ignoreFocusOut: true
		})
		: await vscode.window.showInputBox({
			title: `${getProviderLabel(provider)} Config Directory`,
			prompt: 'Optional local config directory or profile path reference for this account',
			value: existing?.configDir,
			ignoreFocusOut: true
		});
	if (configDir === undefined) {
		return undefined;
	}

	const apiKeyEnvVar = provider === 'copilot'
		? existing?.apiKeyEnvVar
		: await vscode.window.showInputBox({
			title: `${getProviderLabel(provider)} API Key Env Var`,
			prompt: provider === 'gemini' ? 'Optional env var name containing the Gemini API key for this account' : 'Optional env var name containing the API key for this account',
			value: existing?.apiKeyEnvVar,
			ignoreFocusOut: true
		});
	if (apiKeyEnvVar === undefined) {
		return undefined;
	}

	const authCommand = provider === 'copilot'
		? existing?.authCommand
		: await vscode.window.showInputBox({
			title: `${getProviderLabel(provider)} Auth Assist Command`,
			prompt: provider === 'claude'
				? 'Optional command run by the extension to authenticate this Claude account, for example claude login'
				: 'Optional command run by the extension to authenticate this Gemini account, for example gemini auth login',
			value: existing?.authCommand ?? buildDefaultAuthAssistCommand(provider, authMode),
			ignoreFocusOut: true
		});
	if (authCommand === undefined) {
		return undefined;
	}

	const quotaCommand = await vscode.window.showInputBox({
		title: `${getProviderLabel(provider)} Quota Command`,
		prompt: 'Optional shell command that prints JSON quota status for this account',
		value: existing?.quotaCommand,
		ignoreFocusOut: true
	});
	if (quotaCommand === undefined) {
		return undefined;
	}

	const notes = await vscode.window.showInputBox({
		title: `${getProviderLabel(provider)} Notes`,
		prompt: 'Optional note shown in the provider account UI',
		value: existing?.notes,
		ignoreFocusOut: true
	});
	if (notes === undefined) {
		return undefined;
	}

	const normalizedConfigDir = provider === 'claude'
		? (configDir.trim().length > 0 ? configDir.trim() : await ensureManagedClaudeConfigDir(id))
		: (configDir.trim() || undefined);

	return {
		id,
		provider,
		label: label.trim(),
		defaultModel: defaultModel.trim() || undefined,
		defaultClaudeEffort: provider === 'claude' ? defaultClaudeEffort || undefined : undefined,
		configDir: normalizedConfigDir,
		authMode: authMode?.trim() || undefined,
		authCommand: authCommand?.trim() || undefined,
		apiKeyEnvVar: apiKeyEnvVar?.trim() || undefined,
		adminApiKeyEnvVar: existing?.adminApiKeyEnvVar,
		workspaceId: existing?.workspaceId,
		apiKeyId: existing?.apiKeyId,
		quotaCommand: quotaCommand.trim() || undefined,
		accountHint: accountHint.trim() || undefined,
		notes: notes.trim() || undefined
	};
}
export async function promptForProviderTarget(placeHolder: string): Promise<ProviderTarget | undefined> {
	const selection = await vscode.window.showQuickPick<WorkflowQuickPickItem>([
		{ label: 'Claude', provider: 'claude', detail: 'Manage Claude Code accounts and config directories.' },
		{ label: 'Gemini', provider: 'gemini', detail: 'Manage Gemini CLI or API-backed account references.' },
		{ label: 'Copilot', provider: 'copilot', detail: 'Manage Copilot account references tracked by the extension.' }
	], {
		title: 'Provider Accounts',
		placeHolder,
		ignoreFocusOut: true
	});

	return selection?.provider;
}
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
	if (provider === 'claude') {
		const options: Array<{ label: string; value: string | undefined; description?: string; detail: string }> = CLAUDE_DEFAULT_MODELS.map((model) => ({
			label: model,
			value: model,
			description: model === configuration.defaultClaudeModel ? 'Default Claude model' : undefined,
			detail: model.includes('opus') ? 'Highest reasoning quality, typically the most expensive.' : 'Fastest Claude default for implementation and debugging.'
		}));
		if (preferredModel && !options.some((option) => option.value === preferredModel)) {
			options.unshift({
				label: preferredModel,
				value: preferredModel,
				description: 'Saved account model',
				detail: 'Custom Claude model currently configured for this account.'
			});
		}
		return options;
	}

	if (provider === 'gemini') {
		const options: Array<{ label: string; value: string | undefined; description?: string; detail: string }> = GEMINI_DEFAULT_MODELS.map((model) => ({
			label: model,
			value: model,
			description: model === configuration.defaultGeminiModel ? 'Default Gemini model' : undefined,
			detail: model.includes('flash') ? 'Lower latency and cost, good for tight loops.' : 'Higher reasoning depth for planning and review.'
		}));
		if (preferredModel && !options.some((option) => option.value === preferredModel)) {
			options.unshift({
				label: preferredModel,
				value: preferredModel,
				description: 'Saved account model',
				detail: 'Custom Gemini model currently configured for this account.'
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
export async function promptForProviderModel(
	provider: ProviderTarget,
	configuration: ExtensionConfiguration,
	accountId?: string
): Promise<string | undefined> {
	const preferredModel = getDefaultProviderModel(provider, configuration, accountId);
	const options = getProviderModelOptions(provider, configuration, preferredModel);
	const selection = await vscode.window.showQuickPick(
		[
			...options.map((option) => ({
			label: option.label,
			description: option.description,
			detail: option.detail,
			picked: option.value === preferredModel
			})),
			{
				label: 'Custom model...',
				description: 'Enter a provider-specific model identifier manually',
				detail: 'Use this when the built-in model list does not contain the target model.'
			}
		],
		{
			title: 'Provider Model',
			placeHolder: `Choose the ${getProviderLabel(provider)} model for this workflow`,
			ignoreFocusOut: true
		}
	);

	if (!selection) {
		return undefined;
	}

	if (selection.label === 'Custom model...') {
		const customModel = await vscode.window.showInputBox({
			title: `${getProviderLabel(provider)} Custom Model`,
			prompt: 'Enter the provider-specific model identifier to use for this workflow',
			value: preferredModel,
			ignoreFocusOut: true,
			validateInput: (value) => value.trim().length === 0 ? 'Model identifier is required.' : undefined
		});
		return customModel?.trim();
	}

	const matchedOption = options.find((option) => option.label === selection.label);
	return matchedOption?.value;
}
export async function promptForProviderAccount(
	provider: ProviderTarget,
	configuration: ExtensionConfiguration,
	preferredId?: string
): Promise<string | undefined> {
	if (provider === 'claude') {
		return promptForClaudeAccount(configuration, preferredId);
	}

	const accounts = getProviderAccounts(configuration, provider);
	if (accounts.length === 0) {
		return undefined;
	}

	const selection = await vscode.window.showQuickPick(accounts.map((account) => ({
		label: account.label,
		description: account.id === (preferredId ?? getActiveProviderAccountId(configuration, provider)) ? 'Active account' : undefined,
		detail: account.accountHint || account.apiKeyEnvVar || account.notes,
		picked: account.id === (preferredId ?? getActiveProviderAccountId(configuration, provider))
	})), {
		title: `${getProviderLabel(provider)} Account`,
		placeHolder: `Choose which ${getProviderLabel(provider)} account should own this workflow`,
		ignoreFocusOut: true
	});

	return accounts.find((account) => account.label === selection?.label)?.id;
}
export function buildProviderDetail(provider: ProviderTarget, presetDefinition: WorkflowPresetDefinition): string {
	switch (provider) {
		case 'claude':
			return `Best when ${presetDefinition.label.toLowerCase()} needs strong delegation, specialized subagents, deeper parallel investigation, or explicit account switching.`;
		case 'gemini':
			return `Best when ${presetDefinition.label.toLowerCase()} should stay terminal-first with explicit model control, fast delegation, and scriptable automation.`;
		case 'copilot':
			return `Best when ${presetDefinition.label.toLowerCase()} should stay inside VS Code with custom agents, handoffs, and chat review tools.`;
	}
	return '';
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
export async function promptForStoredCredential(account: ProviderAccountConfiguration, mode: 'connect' | 'update'): Promise<void> {
	const providerLabel = getProviderLabel(account.provider);
	const action = await vscode.window.showQuickPick([
		{ label: 'Store Credential In Extension', detail: `Save the ${providerLabel} secret in VS Code SecretStorage for ${account.label}.` },
		{ label: 'Skip For Now', detail: 'Keep using env vars or browser login instead.' }
	], {
		title: `${providerLabel} Credential`,
		placeHolder: mode === 'connect'
			? `Choose whether to store a ${providerLabel} credential for ${account.label}`
			: `Update the stored ${providerLabel} credential for ${account.label}`,
		ignoreFocusOut: true
	});
	if (!action || action.label === 'Skip For Now') {
		return;
	}

	const secretLabel = account.provider === 'claude' ? 'Anthropic API key' : 'Gemini API key';
	const credential = await vscode.window.showInputBox({
		title: `${providerLabel} Stored Credential`,
		prompt: `Paste the ${secretLabel} for ${account.label}. It will be stored in VS Code SecretStorage.`,
		password: true,
		ignoreFocusOut: true,
		validateInput: (value) => value.trim().length === 0 ? `${secretLabel} is required.` : undefined
	});
	if (!credential) {
		return;
	}

	await setStoredProviderCredential(account, credential);
	void vscode.window.showInformationMessage(`${providerLabel} credential stored for ${account.label}.`);
}
export async function promptForAccountClaudeEffort(
	existingEffort: ClaudeEffortLevel | undefined,
	globalDefault: ClaudeEffortLevel
): Promise<ClaudeEffortLevel | undefined | null> {
	const selection = await vscode.window.showQuickPick([
		{ label: 'Use Workspace Default', detail: `Inherit the workspace default Claude effort (${globalDefault}).`, picked: !existingEffort },
		{ label: 'Low', detail: 'Fastest and cheapest reasoning for this Claude account.', picked: existingEffort === 'low' },
		{ label: 'Medium', detail: 'Balanced reasoning depth for this Claude account.', picked: existingEffort === 'medium' },
		{ label: 'High', detail: 'Deepest reasoning for this Claude account.', picked: existingEffort === 'high' }
	], {
		title: 'Claude Account Default Effort',
		placeHolder: 'Choose the default Claude effort to associate with this account',
		ignoreFocusOut: true
	});

	if (!selection) {
		return null;
	}

	if (selection.label === 'Use Workspace Default') {
		return undefined;
	}

	return selection.label.toLowerCase() as ClaudeEffortLevel;
}
export async function ensureManagedClaudeConfigDir(accountId: string): Promise<string> {
	const managedUri = getManagedClaudeConfigDir(accountId);
	if (!managedUri) {
		throw new Error('Extension storage is not available yet for managed Claude profiles.');
	}

	await vscode.workspace.fs.createDirectory(managedUri);
	return managedUri.fsPath;
}
export async function promptForClaudeAccount(configuration: ExtensionConfiguration, preferredId?: string): Promise<string | undefined> {
	if (configuration.claudeAccounts.length === 0) {
		return undefined;
	}

	const items = configuration.claudeAccounts.map((account) => ({
		label: account.label,
		description: account.id === (preferredId ?? configuration.activeClaudeAccountId) ? 'Active account' : undefined,
		detail: account.configDir,
		picked: account.id === (preferredId ?? configuration.activeClaudeAccountId)
	}));
	const selection = await vscode.window.showQuickPick(items, {
		title: 'Claude Account',
		placeHolder: 'Choose which Claude account/config should own this workflow',
		ignoreFocusOut: true
	});

	return configuration.claudeAccounts.find((account) => account.label === selection?.label)?.id;
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
