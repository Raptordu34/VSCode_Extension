import * as vscode from 'vscode';
import { EventBus } from '../../core/eventBus.js';
import { resolveWorkspaceFolder } from '../../core/workspaceContext.js';
import { getExtensionConfiguration } from '../../core/configuration.js';
import { buildDefaultWorkflowPlan, openWorkspaceRelativeFile } from '../workflow/workflowService.js';
import { gatherProjectContext, buildContextGenerationMessage } from './contextBuilder.js';
import { readWorkflowSessionState } from './workflowPersistence.js';
import { WORKFLOW_BRIEF_FILE, WORKFLOW_SESSION_FILE, CONTEXT_FILE_NAME } from '../workflow/constants.js';
import { WorkflowTreeNode } from '../workflow/types.js';

export function registerContextCommands(context: vscode.ExtensionContext): void {
	const resolveCommandWorkspaceFolder = async (placeHolder: string): Promise<vscode.WorkspaceFolder | undefined> => {
		return resolveWorkspaceFolder(context, { placeHolder, showWarning: true });
	};

	context.subscriptions.push(
		vscode.commands.registerCommand('ai-context-orchestrator.generateContext', async () => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder whose context should be generated');
			if (!workspaceFolder) {return;}
			const configuration = getExtensionConfiguration();
			const workflowPlan = buildDefaultWorkflowPlan(configuration);
			const projectContext = await gatherProjectContext(false, workflowPlan, workspaceFolder);
			if (!projectContext) {return;}
			vscode.window.showInformationMessage(buildContextGenerationMessage(projectContext));
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.openWorkflowBrief', async () => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder whose brief should be opened');
			if (!workspaceFolder) {return;}
			await openWorkspaceRelativeFile(workspaceFolder.uri, WORKFLOW_BRIEF_FILE);
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.openLatestWorkflowHandoff', async () => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder whose latest handoff should be opened');
			if (!workspaceFolder) {return;}
			const session = await readWorkflowSessionState(workspaceFolder.uri);
			const latestStage = session?.stages.at(-1);
			if (!latestStage) {
				void vscode.window.showInformationMessage('No workflow handoff is available yet.');
				return;
			}
			await openWorkspaceRelativeFile(workspaceFolder.uri, latestStage.stageFile);
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.openContextFile', async () => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder whose context file should be opened');
			if (!workspaceFolder) {return;}
			await openWorkspaceRelativeFile(workspaceFolder.uri, CONTEXT_FILE_NAME);
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.openWorkflowSession', async () => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder whose session should be opened');
			if (!workspaceFolder) {return;}
			await openWorkspaceRelativeFile(workspaceFolder.uri, WORKFLOW_SESSION_FILE);
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.openWorkflowTreeNode', async (node?: WorkflowTreeNode) => {
			const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder whose workflow file should be opened');
			if (!workspaceFolder || !node?.relativePath) {return;}
			await openWorkspaceRelativeFile(workspaceFolder.uri, node.relativePath);
		})
	);
}
