import * as vscode from "vscode";
import type { ProjectContext } from "../workflow/types.js";
import { buildProviderLaunchPrompt, buildSharedWorkflowInstruction } from "./promptBuilder.js";
import { getManagedClaudeConfigDir } from "../providers/providerService.js";
import { CONTEXT_FILE_NAME } from "../workflow/constants.js";
import { getExtensionConfiguration } from "../../core/configuration.js";
import { findClaudeAccount, findProviderAccount, buildProviderLaunchEnvironment } from "../providers/providerService.js";

export function buildClaudeLaunchCommand(projectContext: ProjectContext, instruction: string): string {
	const parts = ['claude'];
	if (projectContext.workflowPlan.providerModel) {
		parts.push(`--model "${projectContext.workflowPlan.providerModel}"`);
	}
	parts.push(`--append-system-prompt-file "${CONTEXT_FILE_NAME}"`);
	parts.push(`"${instruction}"`);
	return parts.join(' ');
}
export function buildGeminiLaunchCommand(projectContext: ProjectContext, instruction: string): string {
	const parts = ['gemini'];
	if (projectContext.workflowPlan.providerModel) {
		parts.push(`-m "${projectContext.workflowPlan.providerModel}"`);
	}
	parts.push(`"${instruction}"`);
	return parts.join(' ');
}
export function launchClaude(projectContext: ProjectContext): void {
	const configuration = getExtensionConfiguration();
	const claudeAccount = findClaudeAccount(configuration, projectContext.workflowPlan.claudeAccountId);
	void (async () => {
		const terminal = vscode.window.createTerminal({
			name: claudeAccount ? `Claude Code (${claudeAccount.label})` : 'Claude Code',
			cwd: projectContext.workspaceFolder.uri.fsPath,
			env: {
				...(await buildProviderLaunchEnvironment(claudeAccount)),
				...(projectContext.workflowPlan.providerModel ? { ANTHROPIC_MODEL: projectContext.workflowPlan.providerModel } : {}),
				...(projectContext.workflowPlan.claudeEffort ? { CLAUDE_CODE_EFFORT_LEVEL: projectContext.workflowPlan.claudeEffort } : {})
			}
		});

		terminal.show(true);
		terminal.sendText(buildClaudeLaunchCommand(projectContext, buildSharedWorkflowInstruction(projectContext)), true);
		void vscode.window.showInformationMessage(`Claude Code launched for the ${projectContext.workflowPlan.preset} workflow${claudeAccount ? ` with ${claudeAccount.label}` : ''}.`);
	})();
}
export function launchGemini(projectContext: ProjectContext): void {
	const configuration = getExtensionConfiguration();
	const geminiAccount = findProviderAccount(configuration, 'gemini', projectContext.workflowPlan.providerAccountId);
	void (async () => {
		const terminal = vscode.window.createTerminal({
			name: geminiAccount ? `Gemini CLI (${geminiAccount.label})` : 'Gemini CLI',
			cwd: projectContext.workspaceFolder.uri.fsPath,
			env: await buildProviderLaunchEnvironment(geminiAccount)
		});

		terminal.show(true);
		terminal.sendText(buildGeminiLaunchCommand(projectContext, buildSharedWorkflowInstruction(projectContext)), true);
		void vscode.window.showInformationMessage(`Gemini CLI launched for the ${projectContext.workflowPlan.preset} workflow${geminiAccount ? ` with ${geminiAccount.label}` : ''}.`);
	})();
}
