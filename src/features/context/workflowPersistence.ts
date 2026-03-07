import * as vscode from 'vscode';
import {
	GENERATED_SECTION_END,
	GENERATED_SECTION_START,
	WORKFLOW_BRIEF_FILE,
	WORKFLOW_SESSION_FILE,
	WORKFLOW_STAGE_DIRECTORY
} from '../workflow/constants.js';
import type {
	ArtifactPlan,
	ContextMetadata,
	OptimizationResult,
	ProjectContext,
	WorkflowBrief,
	WorkflowExecutionPlan,
	WorkflowPreset,
	WorkflowSessionState,
	WorkflowStageRecord
} from '../workflow/types.js';
import { buildWorkspaceUri, readUtf8, relativizeToWorkspace } from '../../core/workspace.js';
import { formatProviderModel, getProviderLabel } from '../providers/providerService.js';
import { replaceManagedBlock } from '../aiAgents/promptBuilder.js';
import { formatWorkflowRoles } from '../workflow/ui.js';

export async function readWorkflowSessionState(workspaceUri: vscode.Uri): Promise<WorkflowSessionState | undefined> {
	const sessionUri = buildWorkspaceUri(workspaceUri, WORKFLOW_SESSION_FILE);
	if (!sessionUri) {
		return undefined;
	}

	try {
		const content = await readUtf8(sessionUri);
		return JSON.parse(content) as WorkflowSessionState;
	} catch {
		return undefined;
	}
}

export async function readWorkflowBrief(workspaceUri: vscode.Uri): Promise<WorkflowBrief | undefined> {
	const briefUri = buildWorkspaceUri(workspaceUri, WORKFLOW_BRIEF_FILE);
	if (!briefUri) {
		return undefined;
	}

	try {
		const content = await readUtf8(briefUri);
		const lines = content.split(/\r?\n/);
		const taskType = lines.find((line) => line.startsWith('Type:'))?.slice('Type:'.length).trim() ?? 'general';
		const goal = lines.find((line) => line.startsWith('Goal:'))?.slice('Goal:'.length).trim() ?? '';
		return {
			taskType,
			goal,
			constraints: lines.filter((line) => line.startsWith('- ')).map((line) => line.slice(2).trim()),
			rawText: content.trim()
		};
	} catch {
		return undefined;
	}
}

export async function ensureParentDirectory(fileUri: vscode.Uri): Promise<void> {
	const path = fileUri.path;
	const lastSlashIndex = path.lastIndexOf('/');
	if (lastSlashIndex <= 0) {
		return;
	}

	const parentPath = path.slice(0, lastSlashIndex);
	const parentUri = fileUri.with({ path: parentPath });
	await vscode.workspace.fs.createDirectory(parentUri);
}

export async function upsertManagedMarkdown(fileUri: vscode.Uri, generatedContent: string): Promise<void> {
	const managedBlock = `${GENERATED_SECTION_START}\n${generatedContent.trim()}\n${GENERATED_SECTION_END}\n`;
	try {
		const existingContent = await readUtf8(fileUri);
		const nextContent = replaceManagedBlock(existingContent, managedBlock);
		await vscode.workspace.fs.writeFile(fileUri, Buffer.from(nextContent, 'utf8'));
	} catch {
		await vscode.workspace.fs.writeFile(fileUri, Buffer.from(managedBlock, 'utf8'));
	}
}

export async function writeArtifactPlan(workspaceUri: vscode.Uri, artifactPlan: ArtifactPlan): Promise<void> {
	for (const artifact of artifactPlan.files) {
		const fileUri = buildWorkspaceUri(workspaceUri, artifact.relativePath);
		if (!fileUri) {
			continue;
		}

		await ensureParentDirectory(fileUri);
		if (artifact.kind === 'instruction') {
			await upsertManagedMarkdown(fileUri, artifact.content);
			continue;
		}

		await vscode.workspace.fs.writeFile(fileUri, Buffer.from(artifact.content.trimEnd() + '\n', 'utf8'));
	}
}

export async function writeWorkflowBrief(workspaceUri: vscode.Uri, brief: WorkflowBrief): Promise<void> {
	const briefUri = buildWorkspaceUri(workspaceUri, WORKFLOW_BRIEF_FILE);
	if (!briefUri) {
		return;
	}

	await ensureParentDirectory(briefUri);
	const content = [
		'# User Brief',
		'',
		`Type: ${brief.taskType}`,
		`Goal: ${brief.goal}`,
		'',
		'Constraints:',
		...(brief.constraints.length > 0 ? brief.constraints.map((constraint) => `- ${constraint}`) : ['- none provided']),
		'',
		'Raw:',
		brief.rawText
	].join('\n');
	await vscode.workspace.fs.writeFile(briefUri, Buffer.from(content.trimEnd() + '\n', 'utf8'));
}

export async function writeWorkflowSessionState(workspaceUri: vscode.Uri, session: WorkflowSessionState): Promise<void> {
	const sessionUri = buildWorkspaceUri(workspaceUri, WORKFLOW_SESSION_FILE);
	if (!sessionUri) {
		return;
	}

	await ensureParentDirectory(sessionUri);
	await vscode.workspace.fs.writeFile(sessionUri, Buffer.from(`${JSON.stringify(session, null, 2)}\n`, 'utf8'));
}

export async function writeWorkflowStageFile(workspaceUri: vscode.Uri, relativePath: string, content: string): Promise<void> {
	const fileUri = buildWorkspaceUri(workspaceUri, relativePath);
	if (!fileUri) {
		return;
	}

	await ensureParentDirectory(fileUri);
	await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content.trimEnd() + '\n', 'utf8'));
}

export function buildSuggestedNextPresets(currentPreset: WorkflowPreset): WorkflowPreset[] {
	switch (currentPreset) {
		case 'explore':
			return ['plan', 'debug', 'review', 'build', 'test'];
		case 'plan':
			return ['build', 'review', 'debug', 'test', 'explore'];
		case 'build':
			return ['review', 'test', 'debug', 'plan', 'explore'];
		case 'debug':
			return ['test', 'review', 'build', 'plan', 'explore'];
		case 'review':
			return ['build', 'test', 'debug', 'plan', 'explore'];
		case 'test':
		default:
			return ['build', 'review', 'debug', 'plan', 'explore'];
	}
}

export function buildWorkflowStageContent(
	workflowPlan: WorkflowExecutionPlan,
	stage: WorkflowStageRecord,
	brief?: WorkflowBrief
): string {
	return [
		`# Stage ${String(stage.index).padStart(2, '0')} ${workflowPlan.presetDefinition.label}`,
		'',
		`- Provider: ${getProviderLabel(workflowPlan.provider)}`,
		`- Provider model: ${formatProviderModel(workflowPlan.provider, stage.providerModel)}`,
		`- Provider account: ${stage.providerAccountId ?? 'default'}`,
		workflowPlan.provider === 'claude' ? `- Claude account: ${stage.claudeAccountId ?? 'default'}` : undefined,
		workflowPlan.provider === 'claude' ? `- Claude effort: ${stage.claudeEffort ?? 'default'}` : undefined,
		`- Preset: ${workflowPlan.preset}`,
		`- Roles: ${formatWorkflowRoles(workflowPlan.roles)}`,
		`- Status: ${stage.status}`,
		`- Generated at: ${stage.generatedAt}`,
		'',
		'## Objective',
		workflowPlan.presetDefinition.launchInstruction,
		'',
		'## User Brief',
		brief ? brief.goal : 'No explicit brief provided for this stage.',
		'',
		'## Upstream Handoffs',
		...(stage.upstreamStageFiles.length > 0 ? stage.upstreamStageFiles.map((file) => `- ${file}`) : ['- none']),
		'',
		'## Instructions For The Active Provider',
		'- Read .ai-context.md first.',
		'- Read .ai-orchestrator/brief.md if it exists.',
		'- Read upstream stage handoffs before acting.',
		'- Write findings, decisions, or results back into this file before stopping.',
		'- Keep the content concrete and reusable by the next provider.',
		'',
		'## Working Notes',
		'- Fill this section with exploration findings, plans, implementation notes, review findings, or test results.',
		'',
		'## Recommended Next Step',
		`- Suggested preset: ${buildSuggestedNextPresets(workflowPlan.preset)[0]}`,
		'- Suggested provider: choose the assistant best suited for the next stage.'
	].filter((value): value is string => Boolean(value)).join('\n');
}

export function buildContextGenerationMessage(projectContext: ProjectContext): string {
	const parts = [
		`${projectContext.workflowPlan.presetDefinition.label} workflow prepared for ${projectContext.workflowPlan.provider}.`,
		projectContext.reused
			? 'Existing context pack reused.'
			: projectContext.optimization.applied
				? `Context optimized by Copilot (${projectContext.optimization.modelName ?? 'model unknown'}).`
				: `Context generated without Copilot optimization. ${projectContext.optimization.reason}`
	];

	if (projectContext.artifactPlan) {
		parts.push(`${projectContext.artifactPlan.files.length} native artifact(s) prepared.`);
	}

	if (projectContext.currentStage) {
		parts.push(`Shared handoff prepared at ${projectContext.currentStage.stageFile}.`);
	}

	return parts.join(' ');
}

export async function persistWorkflowArtifacts(
	workspaceFolder: vscode.WorkspaceFolder,
	workflowPlan: WorkflowExecutionPlan,
	metadata: ContextMetadata,
	contextFile: vscode.Uri,
	artifactPlan?: ArtifactPlan
): Promise<{ session: WorkflowSessionState; stage: WorkflowStageRecord; brief?: WorkflowBrief }> {
	const existingSession = await readWorkflowSessionState(workspaceFolder.uri);
	const brief = workflowPlan.brief ?? await readWorkflowBrief(workspaceFolder.uri);
	if (brief) {
		await writeWorkflowBrief(workspaceFolder.uri, brief);
	}

	const nextIndex = (existingSession?.currentStageIndex ?? 0) + 1;
	const stageFile = `${WORKFLOW_STAGE_DIRECTORY}/${String(nextIndex).padStart(2, '0')}-${workflowPlan.preset}.md`;
	const upstreamStageFiles = existingSession?.stages.map((stage) => stage.stageFile) ?? [];
	const stage: WorkflowStageRecord = {
		index: nextIndex,
		preset: workflowPlan.preset,
		provider: workflowPlan.provider,
		providerModel: workflowPlan.providerModel,
		providerAccountId: workflowPlan.providerAccountId,
		status: 'prepared',
		stageFile,
		generatedAt: new Date().toISOString(),
		briefSummary: brief?.goal ?? (workflowPlan.preset === 'explore' ? 'Explore the repository and identify reusable patterns.' : 'No brief provided.'),
		contextFile: relativizeToWorkspace(workspaceFolder.uri, contextFile),
		claudeAccountId: workflowPlan.claudeAccountId,
		claudeEffort: workflowPlan.claudeEffort,
		artifactFiles: artifactPlan?.files.map((file) => file.relativePath) ?? [],
		upstreamStageFiles
	};

	await writeWorkflowStageFile(workspaceFolder.uri, stageFile, buildWorkflowStageContent(workflowPlan, stage, brief));

	const session: WorkflowSessionState = {
		workspaceName: workspaceFolder.name,
		updatedAt: new Date().toISOString(),
		currentStageIndex: nextIndex,
		currentPreset: workflowPlan.preset,
		currentProvider: workflowPlan.provider,
		currentProviderModel: workflowPlan.providerModel,
		currentProviderAccountId: workflowPlan.providerAccountId,
		currentClaudeAccountId: workflowPlan.claudeAccountId,
		currentClaudeEffort: workflowPlan.claudeEffort,
		briefFile: WORKFLOW_BRIEF_FILE,
		stages: [...(existingSession?.stages ?? []), stage]
	};

	await writeWorkflowSessionState(workspaceFolder.uri, session);
	return { session, stage, brief };
}
