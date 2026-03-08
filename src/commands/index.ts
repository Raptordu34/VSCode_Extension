import * as vscode from 'vscode';
import { EventBus } from '../core/eventBus.js';
import { buildWorkflowPromptFromDashboardState, buildWorkflowPromptPreviewDocument, type WorkflowUiHelpers } from '../features/workflow/ui.js';
import { WorkflowDashboardState } from '../features/workflow/types.js';
import { registerWorkflowCommands } from '../features/workflow/commands.js';
import { registerContextCommands } from '../features/context/commands.js';
import { registerProviderCommands } from '../features/providers/commands.js';

export function registerAllCommands(
	context: vscode.ExtensionContext,
	loadDashboardState: () => Promise<WorkflowDashboardState>,
	workflowUiHelpers: WorkflowUiHelpers
) {
	registerWorkflowCommands(context, loadDashboardState);
	registerContextCommands(context);
	registerProviderCommands(context);

	context.subscriptions.push(
		vscode.commands.registerCommand('ai-context-orchestrator.refreshWorkflowUi', async () => {
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.previewWorkflowPrompt', async () => {
			const state = await loadDashboardState();
			const prompt = buildWorkflowPromptFromDashboardState(state, workflowUiHelpers);
			if (!prompt) {
				void vscode.window.showInformationMessage('No active workflow prompt is available yet.');
				return;
			}
			const document = await vscode.workspace.openTextDocument({
				language: 'markdown',
				content: buildWorkflowPromptPreviewDocument(state, prompt, workflowUiHelpers)
			});
			await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.Beside, preserveFocus: true });
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.copyWorkflowPrompt', async () => {
			const state = await loadDashboardState();
			const prompt = buildWorkflowPromptFromDashboardState(state, workflowUiHelpers);
			if (!prompt) {
				void vscode.window.showInformationMessage('No active workflow prompt is available yet.');
				return;
			}
			await vscode.env.clipboard.writeText(prompt);
			void vscode.window.showInformationMessage('The current workflow prompt has been copied to the clipboard.');
		})
	);
}
