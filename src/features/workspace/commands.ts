import * as vscode from 'vscode';
import { EventBus } from '../../core/eventBus.js';
import { resolveWorkspaceFolder } from '../../core/workspaceContext.js';
import { ensureWorkspaceMode, getWorkspaceModeLabel, getWorkspaceModeState } from './service.js';

export function registerWorkspaceCommands(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('ai-context-orchestrator.selectWorkspaceMode', async () => {
			const workspaceFolder = await resolveWorkspaceFolder(context, {
				placeHolder: 'Choisissez le workspace dont vous voulez définir le type',
				showWarning: true
			});
			if (!workspaceFolder) {
				return;
			}

			const previousMode = getWorkspaceModeState(context, workspaceFolder)?.mode;
			const nextState = await ensureWorkspaceMode(context, workspaceFolder, { forcePrompt: true });
			if (nextState && nextState.mode !== previousMode) {
				void vscode.window.showInformationMessage(`Mode du workspace défini sur ${getWorkspaceModeLabel(nextState.mode)}.`);
			}

			EventBus.fire('refresh');
		})
	);
}