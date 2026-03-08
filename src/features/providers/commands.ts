import * as vscode from 'vscode';
import { EventBus } from '../../core/eventBus.js';
import { Logger } from '../../core/logger.js';
import { refreshProviderStatuses, switchActiveProviderAccount, manageProviderAccounts, connectProviderAccount, configureProviderCredential, runProviderAuthAssist, openProviderAccountPortal } from './providerService.js';
import { ProviderTarget } from './types.js';

export function registerProviderCommands(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('ai-context-orchestrator.refreshProviderStatus', async () => {
			await refreshProviderStatuses(context, Logger.getChannel());
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.switchClaudeAccount', async () => {
			const switched = await switchActiveProviderAccount('claude');
			if (!switched) {return;}
			await refreshProviderStatuses(context, Logger.getChannel());
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.manageProviderAccounts', async (provider?: ProviderTarget) => {
			await manageProviderAccounts(context, provider);
			await refreshProviderStatuses(context, Logger.getChannel());
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.connectProviderAccount', async (provider?: ProviderTarget) => {
			await connectProviderAccount(context, provider);
			await refreshProviderStatuses(context, Logger.getChannel());
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.configureProviderCredential', async (provider?: ProviderTarget) => {
			await configureProviderCredential(context, provider);
			await refreshProviderStatuses(context, Logger.getChannel());
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.runProviderAuthAssist', async (provider?: ProviderTarget) => {
			await runProviderAuthAssist(context, provider);
			await refreshProviderStatuses(context, Logger.getChannel());
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.openProviderAccountPortal', async (provider?: ProviderTarget) => {
			await openProviderAccountPortal(provider);
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.switchProviderAccount', async (provider?: ProviderTarget) => {
			const switched = await switchActiveProviderAccount(provider);
			if (!switched) {return;}
			await refreshProviderStatuses(context, Logger.getChannel());
			EventBus.fire('refresh');
		})
	);
}
