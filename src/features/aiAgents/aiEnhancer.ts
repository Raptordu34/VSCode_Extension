import * as vscode from 'vscode';
import { getExtensionConfiguration } from '../../core/configuration.js';
import { buildWorkspaceUri, readUtf8 } from '../../core/workspace.js';
import { WORKFLOW_OBJECTIVE_FILE } from '../workflow/constants.js';
import type { WorkflowBrief, WorkflowExecutionPlan, WorkflowObjectiveState } from '../workflow/types.js';
import { getEffectiveWorkflowIntentCopy } from '../workflow/presets.js';

export async function upgradeUserPrompt(rawInput: string): Promise<string> {
	const fallback = rawInput.trim();
	if (!fallback) {
		return '';
	}

	try {
		const configuration = getExtensionConfiguration();
		const selector = configuration.modelFamily
			? { vendor: 'copilot', family: configuration.modelFamily }
			: { vendor: 'copilot' };
		const models = await vscode.lm.selectChatModels(selector);
		if (models.length === 0) {
			return fallback;
		}

		const [model] = models;
		const messages = [
			vscode.LanguageModelChatMessage.User([
				'Tu es un Lead Tech.',
				'Transforme la demande suivante en plan d\'action technique clair pour des agents IA.',
				'Contraintes:',
				'- Reste concret et actionnable.',
				'- Structure la réponse en markdown.',
				'- Commence par un court objectif.',
				'- Ajoute ensuite des étapes techniques, risques, fichiers probables et validations.',
				'- N\'invente pas d\'éléments absents de la demande.',
				'- Retourne uniquement le markdown final.',
				'',
				'Demande brute:',
				fallback
			].join('\n'))
		];

		const tokenSource = new vscode.CancellationTokenSource();
		try {
			const response = await model.sendRequest(messages, {}, tokenSource.token);
			let enhanced = '';
			for await (const fragment of response.text) {
				enhanced += fragment;
			}

			return enhanced.trim() || fallback;
		} finally {
			tokenSource.dispose();
		}
	} catch {
		return fallback;
	}
}

export async function buildWorkflowObjectiveState(
	workflowPlan: WorkflowExecutionPlan,
	brief: WorkflowBrief
): Promise<WorkflowObjectiveState> {
	const rawInput = brief.rawText.trim();
	const upgradedGoal = await upgradeUserPrompt(rawInput);
	const intentCopy = getEffectiveWorkflowIntentCopy(workflowPlan.preset, workflowPlan.workspaceMode, workflowPlan.documentIntentId);
	const generatedAt = new Date().toISOString();
	const content = [
		'# Objectif Actuel',
		'',
		`- Preset: ${workflowPlan.preset}`,
		`- Intent: ${intentCopy.label}`,
		`- Provider: ${workflowPlan.provider}`,
		`- Generated at: ${generatedAt}`,
		'',
		'## Demande brute',
		rawInput,
		'',
		'## Plan technique reformule',
		upgradedGoal,
		''
	].join('\n');

	return {
		relativePath: WORKFLOW_OBJECTIVE_FILE,
		content,
		upgradedGoal,
		rawInput,
		generatedAt
	};
}

export async function readWorkflowObjective(workspaceUri: vscode.Uri): Promise<WorkflowObjectiveState | undefined> {
	const objectiveUri = buildWorkspaceUri(workspaceUri, WORKFLOW_OBJECTIVE_FILE);
	if (!objectiveUri) {
		return undefined;
	}

	try {
		const content = await readUtf8(objectiveUri);
		const rawSection = content.match(/## Demande brute\r?\n([\s\S]*?)\r?\n## Plan technique reformule/);
		const upgradedSection = content.match(/## Plan technique reformule\r?\n([\s\S]*?)\s*$/);
		const generatedAtLine = content.match(/- Generated at: (.+)/);
		return {
			relativePath: WORKFLOW_OBJECTIVE_FILE,
			content,
			upgradedGoal: upgradedSection?.[1]?.trim() ?? '',
			rawInput: rawSection?.[1]?.trim() ?? '',
			generatedAt: generatedAtLine?.[1]?.trim() ?? ''
		};
	} catch {
		return undefined;
	}
}