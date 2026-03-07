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
	ProjectContext,
	WorkflowBrief,
	WorkflowExecutionPlan,
	WorkflowPreset,
	WorkflowSessionState,
	WorkflowStageRecord
} from '../workflow/types.js';
import { buildWorkspaceUri, normalizeWorkspaceRelativePath, readUtf8, relativizeToWorkspace } from '../../core/workspace.js';
import { formatProviderModel, getProviderLabel } from '../providers/providerService.js';
import { replaceManagedBlock } from '../aiAgents/promptBuilder.js';
import { formatWorkflowRoles } from '../workflow/ui.js';

export interface WorkspaceWriteOperation {
	uri: vscode.Uri;
	content: Uint8Array;
}

export interface TransactionFileSystem {
	readFile(uri: vscode.Uri): Thenable<Uint8Array> | Promise<Uint8Array>;
	writeFile(uri: vscode.Uri, content: Uint8Array): Thenable<void> | Promise<void>;
	delete(uri: vscode.Uri): Thenable<void> | Promise<void>;
	createDirectory?(uri: vscode.Uri): Thenable<void> | Promise<void>;
}

function toUtf8Bytes(content: string): Uint8Array {
	return Buffer.from(content, 'utf8');
}

function isWorkflowSessionState(value: unknown): value is WorkflowSessionState {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const candidate = value as Partial<WorkflowSessionState>;
	return typeof candidate.workspaceName === 'string'
		&& typeof candidate.currentStageIndex === 'number'
		&& typeof candidate.currentPreset === 'string'
		&& typeof candidate.currentProvider === 'string'
		&& Array.isArray(candidate.stages);
}

function isWorkflowBrief(value: WorkflowBrief | undefined): value is WorkflowBrief {
	return Boolean(value && typeof value.goal === 'string' && typeof value.taskType === 'string' && Array.isArray(value.constraints));
}

async function ensureParentDirectoryWith(fileUri: vscode.Uri, createDirectory?: (uri: vscode.Uri) => Thenable<void> | Promise<void>): Promise<void> {
	if (!createDirectory) {
		return;
	}

	const path = fileUri.path;
	const lastSlashIndex = path.lastIndexOf('/');
	if (lastSlashIndex <= 0) {
		return;
	}

	const parentPath = path.slice(0, lastSlashIndex);
	await createDirectory(fileUri.with({ path: parentPath }));
}

export async function commitFileTransaction(fileSystem: TransactionFileSystem, operations: WorkspaceWriteOperation[]): Promise<void> {
	const snapshots = new Map<string, { uri: vscode.Uri; existed: boolean; content?: Uint8Array }>();

	try {
		for (const operation of operations) {
			const operationKey = operation.uri.toString();
			if (snapshots.has(operationKey)) {
				continue;
			}

			try {
				snapshots.set(operationKey, {
					uri: operation.uri,
					existed: true,
					content: await fileSystem.readFile(operation.uri)
				});
			} catch {
				snapshots.set(operationKey, { uri: operation.uri, existed: false });
			}
		}

		for (const operation of operations) {
			await ensureParentDirectoryWith(operation.uri, fileSystem.createDirectory?.bind(fileSystem));
			await fileSystem.writeFile(operation.uri, operation.content);
		}
	} catch (error) {
		for (const snapshot of [...snapshots.values()].reverse()) {
			try {
				if (snapshot.existed && snapshot.content) {
					await fileSystem.writeFile(snapshot.uri, snapshot.content);
					continue;
				}

				await fileSystem.delete(snapshot.uri);
			} catch {
				continue;
			}
		}

		throw error;
	}
}

async function commitWorkspaceWriteTransaction(operations: WorkspaceWriteOperation[]): Promise<void> {
	await commitFileTransaction({
		readFile: (uri) => vscode.workspace.fs.readFile(uri),
		writeFile: (uri, content) => vscode.workspace.fs.writeFile(uri, content),
		delete: (uri) => vscode.workspace.fs.delete(uri, { recursive: false, useTrash: false }),
		createDirectory: (uri) => vscode.workspace.fs.createDirectory(uri)
	}, operations);
}

async function buildManagedMarkdownContent(fileUri: vscode.Uri, generatedContent: string): Promise<string> {
	const managedBlock = `${GENERATED_SECTION_START}\n${generatedContent.trim()}\n${GENERATED_SECTION_END}\n`;
	try {
		const existingContent = await readUtf8(fileUri);
		return replaceManagedBlock(existingContent, managedBlock);
	} catch {
		return managedBlock;
	}
}

async function buildArtifactWriteOperations(workspaceUri: vscode.Uri, artifactPlan: ArtifactPlan): Promise<WorkspaceWriteOperation[]> {
	const operations: WorkspaceWriteOperation[] = [];
	for (const artifact of artifactPlan.files) {
		const fileUri = buildWorkspaceUri(workspaceUri, artifact.relativePath);
		if (!fileUri) {
			continue;
		}

		if (artifact.kind === 'instruction') {
			const nextContent = await buildManagedMarkdownContent(fileUri, artifact.content);
			operations.push({ uri: fileUri, content: toUtf8Bytes(nextContent) });
			continue;
		}

		operations.push({
			uri: fileUri,
			content: toUtf8Bytes(`${artifact.content.trimEnd()}\n`)
		});
	}

	return operations;
}

function buildWorkflowBriefContent(brief: WorkflowBrief): string {
	return [
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
	].join('\n').trimEnd() + '\n';
}

function buildWorkflowSessionContent(session: WorkflowSessionState): string {
	return `${JSON.stringify(session, null, 2)}\n`;
}

export async function readWorkflowSessionState(workspaceUri: vscode.Uri): Promise<WorkflowSessionState | undefined> {
	const sessionUri = buildWorkspaceUri(workspaceUri, WORKFLOW_SESSION_FILE);
	if (!sessionUri) {
		return undefined;
	}

	try {
		const content = await readUtf8(sessionUri);
		const parsed = JSON.parse(content) as unknown;
		return isWorkflowSessionState(parsed) ? parsed : undefined;
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
		const brief: WorkflowBrief = {
			taskType,
			goal,
			constraints: lines.filter((line) => line.startsWith('- ')).map((line) => line.slice(2).trim()),
			rawText: content.trim()
		};
		return isWorkflowBrief(brief) ? brief : undefined;
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
	const nextContent = await buildManagedMarkdownContent(fileUri, generatedContent);
	await vscode.workspace.fs.writeFile(fileUri, toUtf8Bytes(nextContent));
}

export async function writeArtifactPlan(workspaceUri: vscode.Uri, artifactPlan: ArtifactPlan): Promise<void> {
	await commitWorkspaceWriteTransaction(await buildArtifactWriteOperations(workspaceUri, artifactPlan));
}

export async function writeWorkflowBrief(workspaceUri: vscode.Uri, brief: WorkflowBrief): Promise<void> {
	const briefUri = buildWorkspaceUri(workspaceUri, WORKFLOW_BRIEF_FILE);
	if (!briefUri) {
		return;
	}

	await commitWorkspaceWriteTransaction([{ uri: briefUri, content: toUtf8Bytes(buildWorkflowBriefContent(brief)) }]);
}

export async function writeWorkflowSessionState(workspaceUri: vscode.Uri, session: WorkflowSessionState): Promise<void> {
	const sessionUri = buildWorkspaceUri(workspaceUri, WORKFLOW_SESSION_FILE);
	if (!sessionUri) {
		return;
	}

	await commitWorkspaceWriteTransaction([{ uri: sessionUri, content: toUtf8Bytes(buildWorkflowSessionContent(session)) }]);
}

export async function writeWorkflowStageFile(workspaceUri: vscode.Uri, relativePath: string, content: string): Promise<void> {
	const fileUri = buildWorkspaceUri(workspaceUri, relativePath);
	if (!fileUri) {
		return;
	}

	await commitWorkspaceWriteTransaction([{ uri: fileUri, content: toUtf8Bytes(content.trimEnd() + '\n') }]);
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
	artifactPlan?: ArtifactPlan,
	contextContent?: string
): Promise<{ session: WorkflowSessionState; stage: WorkflowStageRecord; brief?: WorkflowBrief }> {
	const existingSession = await readWorkflowSessionState(workspaceFolder.uri);
	const brief = workflowPlan.brief ?? await readWorkflowBrief(workspaceFolder.uri);

	const nextIndex = (existingSession?.currentStageIndex ?? 0) + 1;
	const stageFile = normalizeWorkspaceRelativePath(`${WORKFLOW_STAGE_DIRECTORY}/${String(nextIndex).padStart(2, '0')}-${workflowPlan.preset}.md`);
	const upstreamStageFiles = existingSession?.stages.map((stage) => normalizeWorkspaceRelativePath(stage.stageFile)) ?? [];
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
		artifactFiles: artifactPlan?.files.map((file) => normalizeWorkspaceRelativePath(file.relativePath)) ?? [],
		upstreamStageFiles
	};

	const session: WorkflowSessionState = {
		workspaceName: workspaceFolder.name,
		workspaceFolderId: workspaceFolder.uri.toString(),
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

	const operations: WorkspaceWriteOperation[] = [];
	if (contextContent !== undefined) {
		operations.push({
			uri: contextFile,
			content: toUtf8Bytes(contextContent)
		});
	}
	if (artifactPlan) {
		operations.push(...await buildArtifactWriteOperations(workspaceFolder.uri, artifactPlan));
	}
	if (brief) {
		const briefUri = buildWorkspaceUri(workspaceFolder.uri, WORKFLOW_BRIEF_FILE);
		if (briefUri) {
			operations.push({ uri: briefUri, content: toUtf8Bytes(buildWorkflowBriefContent(brief)) });
		}
	}
	const stageUri = buildWorkspaceUri(workspaceFolder.uri, stageFile);
	if (stageUri) {
		operations.push({
			uri: stageUri,
			content: toUtf8Bytes(buildWorkflowStageContent(workflowPlan, stage, brief).trimEnd() + '\n')
		});
	}
	const sessionUri = buildWorkspaceUri(workspaceFolder.uri, WORKFLOW_SESSION_FILE);
	if (sessionUri) {
		operations.push({ uri: sessionUri, content: toUtf8Bytes(buildWorkflowSessionContent(session)) });
	}

	await commitWorkspaceWriteTransaction(operations);
	return { session, stage, brief };
}
