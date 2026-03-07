import * as vscode from 'vscode';
import { PROVIDER_ACCOUNT_SECRET_PREFIX } from '../workflow/constants.js';
import type { ProviderAccountConfiguration, ProviderTarget } from '../workflow/types.js';
import { extensionContextRef } from '../../extension.js';

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

export async function ensureManagedClaudeConfigDir(accountId: string): Promise<string> {
	const managedUri = getManagedClaudeConfigDir(accountId);
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
