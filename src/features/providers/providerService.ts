import * as vscode from 'vscode';
import type { ClaudeEffortLevel, ExtensionConfiguration, ProviderAccountConfiguration, ProviderTarget, WorkflowQuickPickItem } from '../workflow/types.js';
import { getExtensionConfiguration } from '../../core/configuration.js';
import {
	findProviderAccount,
	getActiveProviderAccountId,
	getDefaultProviderModel,
	getProviderAccounts,
	getProviderLabel,
	updateActiveProviderAccountId,
	writeProviderAccounts
} from './accountManager.js';
import {
	buildDefaultAuthAssistCommand,
	buildProviderLaunchEnvironment,
	ensureManagedClaudeConfigDir,
	getManagedClaudeConfigDir,
	getProviderAccountPortalUrl,
	getStoredProviderCredential,
	setStoredProviderCredential
} from './credentialService.js';
import { getImplicitWorkspaceFolder } from '../../core/workspaceContext.js';
import { extensionContextRef } from '../../extension.js';

export * from './accountManager.js';
export * from './credentialService.js';
export * from './statusService.js';

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
		cwd: getImplicitWorkspaceFolder(extensionContextRef)?.uri.fsPath,
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

export async function promptForProviderModel(
	provider: ProviderTarget,
	configuration: ExtensionConfiguration,
	accountId?: string
): Promise<string | undefined> {
	const { getDefaultProviderModel: getModel, getProviderModelOptions } = await import('./accountManager.js');
	const preferredModel = getModel(provider, configuration, accountId);
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

	const { getProviderModelOptions: getOpts } = await import('./accountManager.js');
	const opts = getOpts(provider, configuration, preferredModel);
	const matchedOption = opts.find((option) => option.label === selection.label);
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
