import * as vscode from "vscode";
import type { ProjectContext, WorkflowExecutionPlan } from "../workflow/types.js";
import { buildProviderLaunchPrompt, buildSharedWorkflowInstruction } from "./promptBuilder.js";
import { getManagedClaudeConfigDir } from "../providers/providerService.js";
import { CONTEXT_FILE_NAME } from "../workflow/constants.js";
import { getExtensionConfiguration } from "../../core/configuration.js";
import { findClaudeAccount, findProviderAccount, buildProviderLaunchEnvironment } from "../providers/providerService.js";
import { escapeShellArg } from "../../utils/index.js";

export function buildClaudeLaunchCommand(projectContext: ProjectContext, instruction: string): string {
	const parts = ['claude'];
	if (projectContext.workflowPlan.providerModel) {
		parts.push(`--model "${escapeShellArg(projectContext.workflowPlan.providerModel)}"`);
	}
	parts.push(`--append-system-prompt-file "${CONTEXT_FILE_NAME}"`);
	parts.push(`"${escapeShellArg(instruction)}"`);
	return parts.join(' ');
}
export function buildGeminiLaunchCommand(projectContext: ProjectContext, instruction: string): string {
	const parts = ['gemini'];
	if (projectContext.workflowPlan.providerModel) {
		parts.push(`-m "${escapeShellArg(projectContext.workflowPlan.providerModel)}"`);
	}
	parts.push(`"${escapeShellArg(instruction)}"`);
	return parts.join(' ');
}
export function launchClaude(context: vscode.ExtensionContext, projectContext: ProjectContext): void {
	const configuration = getExtensionConfiguration();
	const claudeAccount = findClaudeAccount(configuration, projectContext.workflowPlan.claudeAccountId);
	void (async () => {
		const terminal = vscode.window.createTerminal({
			name: claudeAccount ? `Claude Code (${claudeAccount.label})` : 'Claude Code',
			cwd: projectContext.workspaceFolder.uri.fsPath,
			env: {
				...(await buildProviderLaunchEnvironment(context, claudeAccount)),
				...(projectContext.workflowPlan.providerModel ? { ANTHROPIC_MODEL: projectContext.workflowPlan.providerModel } : {}),
				...(projectContext.workflowPlan.claudeEffort ? { CLAUDE_CODE_EFFORT_LEVEL: projectContext.workflowPlan.claudeEffort } : {})
			}
		});

		terminal.show(true);
		terminal.sendText(buildClaudeLaunchCommand(projectContext, buildSharedWorkflowInstruction(projectContext)), true);
		void vscode.window.showInformationMessage(`Claude Code launched for the ${projectContext.workflowPlan.preset} workflow${claudeAccount ? ` with ${claudeAccount.label}` : ''}.`);
	})();
}

export async function launchCopilot(projectContext: ProjectContext): Promise<void> {
	const prompt = buildSharedWorkflowInstruction(projectContext);
	await vscode.env.clipboard.writeText(prompt);
	await vscode.commands.executeCommand('workbench.action.chat.open');

	const action = await vscode.window.showInformationMessage(
		'Copilot Chat opened. The workflow prompt has been copied to the clipboard.',
		'Copy Prompt Again',
		'Open Context File'
	);

	if (action === 'Copy Prompt Again') {
		await vscode.env.clipboard.writeText(prompt);
		return;
	}
	if (action === 'Open Context File') {
		await vscode.window.showTextDocument(projectContext.contextFile);
	}
}

export async function launchProvider(context: vscode.ExtensionContext, workflowPlan: WorkflowExecutionPlan, projectContext: ProjectContext): Promise<void> {
	switch (workflowPlan.provider) {
		case 'claude':
			launchClaude(context, projectContext);
			break;
		case 'gemini':
			launchGemini(context, projectContext);
			break;
		case 'copilot':
			await launchCopilot(projectContext);
			break;
	}
}

export function launchGemini(context: vscode.ExtensionContext, projectContext: ProjectContext): void {
	const configuration = getExtensionConfiguration();
	const geminiAccount = findProviderAccount(configuration, 'gemini', projectContext.workflowPlan.providerAccountId);
	void (async () => {
		const terminal = vscode.window.createTerminal({
			name: geminiAccount ? `Gemini CLI (${geminiAccount.label})` : 'Gemini CLI',
			cwd: projectContext.workspaceFolder.uri.fsPath,
			env: await buildProviderLaunchEnvironment(context, geminiAccount)
		});

		terminal.show(true);
		terminal.sendText(buildGeminiLaunchCommand(projectContext, buildSharedWorkflowInstruction(projectContext)), true);
		void vscode.window.showInformationMessage(`Gemini CLI launched for the ${projectContext.workflowPlan.preset} workflow${geminiAccount ? ` with ${geminiAccount.label}` : ''}.`);
	})();
}
