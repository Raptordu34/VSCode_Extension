import * as vscode from 'vscode';
import { PROVIDER_ACCOUNT_SECRET_PREFIX } from '../workflow/constants.js';
import type { ProviderAccountConfiguration, ProviderTarget } from '../workflow/types.js';

export function getAccountSecretStorageKey(account: ProviderAccountConfiguration): string {
	return `${PROVIDER_ACCOUNT_SECRET_PREFIX}:${account.provider}:${account.id}`;
}

export async function getStoredProviderCredential(context: vscode.ExtensionContext, account: ProviderAccountConfiguration): Promise<string | undefined> {
	return context.secrets.get(getAccountSecretStorageKey(account));
}

export async function setStoredProviderCredential(context: vscode.ExtensionContext, account: ProviderAccountConfiguration, value: string | undefined): Promise<void> {
	const storageKey = getAccountSecretStorageKey(account);
	if (value && value.trim().length > 0) {
		await context.secrets.store(storageKey, value.trim());
		return;
	}

	await context.secrets.delete(storageKey);
}

export function getEnvProviderCredential(account: ProviderAccountConfiguration): string | undefined {
	return account.apiKeyEnvVar ? process.env[account.apiKeyEnvVar] : undefined;
}

export async function getResolvedProviderCredential(context: vscode.ExtensionContext, account: ProviderAccountConfiguration): Promise<string | undefined> {
	const storedCredential = await getStoredProviderCredential(context, account);
	if (storedCredential) {
		return storedCredential;
	}

	return getEnvProviderCredential(account);
}

export function getManagedClaudeConfigDir(context: vscode.ExtensionContext, accountId: string): vscode.Uri | undefined {
	return vscode.Uri.joinPath(context.globalStorageUri, 'claude-profiles', accountId);
}

export async function ensureManagedClaudeConfigDir(context: vscode.ExtensionContext, accountId: string): Promise<string> {
	const managedUri = getManagedClaudeConfigDir(context, accountId);
	if (!managedUri) {
		throw new Error('Extension storage is not available yet for managed Claude profiles.');
	}

	await vscode.workspace.fs.createDirectory(managedUri);
	return managedUri.fsPath;
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

export async function buildProviderLaunchEnvironment(context: vscode.ExtensionContext, account: ProviderAccountConfiguration | undefined): Promise<Record<string, string>> {
	if (!account) {
		return {};
	}

	const resolvedCredential = await getResolvedProviderCredential(context, account);
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
