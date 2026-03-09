import * as vscode from 'vscode';
import {
	CONTEXT_FILE_NAME,
	GENERATED_SECTION_END,
	GENERATED_SECTION_START,
	WORKFLOW_BRIEF_FILE,
	WORKFLOW_HISTORY_DIRECTORY,
	WORKFLOW_HISTORY_INDEX_FILE,
	WORKFLOW_STATE_DIRECTORY,
	WORKFLOW_SESSION_FILE
} from '../workflow/constants.js';
import type {
	WorkflowArchiveManifest,
	WorkflowArchivedFile,
	WorkflowBrief,
	WorkflowExecutionPlan,
	WorkflowHistoryEntry,
	WorkflowHistoryIndex,
	WorkflowSessionState
} from '../workflow/types.js';
import { buildWorkspaceUri, fileExists, normalizeWorkspaceRelativePath, readUtf8 } from '../../core/workspace.js';
import { createNonce } from '../../utils/index.js';
import { replaceManagedBlock } from '../aiAgents/promptBuilder.js';
import { WORKFLOW_PRESETS } from '../workflow/presets.js';

interface MutationWriteOperation {
	kind: 'write';
	uri: vscode.Uri;
	content: Uint8Array;
}

interface MutationDeleteOperation {
	kind: 'delete';
	uri: vscode.Uri;
}

type MutationOperation = MutationWriteOperation | MutationDeleteOperation;

function toUtf8Bytes(content: string): Uint8Array {
	return Buffer.from(content, 'utf8');
}

function buildWorkflowSessionContent(session: WorkflowSessionState): string {
	return `${JSON.stringify(session, null, 2)}\n`;
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

function buildManagedMarkdownBlock(content: string): string {
	return `${GENERATED_SECTION_START}\n${content.trim()}\n${GENERATED_SECTION_END}\n`;
}

function extractManagedMarkdownContent(content: string): string | undefined {
	const startIndex = content.indexOf(GENERATED_SECTION_START);
	const endIndex = content.indexOf(GENERATED_SECTION_END);
	if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
		const trimmed = content.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	}

	const managedStart = startIndex + GENERATED_SECTION_START.length;
	const managedContent = content.slice(managedStart, endIndex).replace(/^\r?\n/, '').replace(/\r?\n$/, '').trim();
	return managedContent.length > 0 ? managedContent : undefined;
}

function removeManagedMarkdownBlock(content: string): string {
	const startIndex = content.indexOf(GENERATED_SECTION_START);
	const endIndex = content.indexOf(GENERATED_SECTION_END);
	if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
		return content;
	}

	const afterEndIndex = endIndex + GENERATED_SECTION_END.length;
	const trailingNewlineLength = content.slice(afterEndIndex).startsWith('\r\n') ? 2 : content.slice(afterEndIndex).startsWith('\n') ? 1 : 0;
	const nextContent = `${content.slice(0, startIndex)}${content.slice(afterEndIndex + trailingNewlineLength)}`
		.replace(/\n{3,}/g, '\n\n')
		.trim();
	return nextContent.length > 0 ? `${nextContent}\n` : '';
}

function createWorkflowId(): string {
	return `workflow-${Date.now().toString(36)}-${createNonce().slice(0, 8)}`;
}

function normalizeSessionIdentity(
	session: WorkflowSessionState,
	workflowId?: string,
	branchId?: string,
	label?: string
): WorkflowSessionState {
	const resolvedWorkflowId = workflowId ?? session.workflowId ?? createWorkflowId();
	const resolvedBranchId = branchId ?? session.branchId ?? 'main';
	const createdAt = session.createdAt ?? session.stages[0]?.generatedAt ?? session.updatedAt;
	return {
		...session,
		workflowId: resolvedWorkflowId,
		branchId: resolvedBranchId,
		createdAt,
		label: label ?? session.label ?? session.stages.at(-1)?.briefSummary ?? `${session.currentPreset} workflow`,
		stages: session.stages.map((stage) => ({
			...stage,
			workflowId: resolvedWorkflowId,
			branchId: resolvedBranchId
		}))
	};
}

function buildManifestPath(workflowId: string): string {
	return normalizeWorkspaceRelativePath(`${WORKFLOW_HISTORY_DIRECTORY}/${workflowId}/manifest.json`);
}

function buildArchiveFilePath(workflowId: string, relativePath: string): string {
	return normalizeWorkspaceRelativePath(`${WORKFLOW_HISTORY_DIRECTORY}/${workflowId}/files/${relativePath}`);
}

function buildHistoryLabel(session: WorkflowSessionState, brief?: WorkflowBrief): string {
	const summary = brief?.goal ?? session.stages.at(-1)?.briefSummary ?? `${session.currentPreset} workflow`;
	return summary.length > 80 ? `${summary.slice(0, 77)}...` : summary;
}

function isManagedMarkdownPath(relativePath: string): boolean {
	const normalized = normalizeWorkspaceRelativePath(relativePath);
	return normalized === 'CLAUDE.md'
		|| normalized === 'GEMINI.md'
		|| normalized === '.github/copilot-instructions.md';
}

function collectWorkflowFilePaths(session: WorkflowSessionState, includeBrief: boolean): WorkflowArchivedFile[] {
	const seen = new Set<string>();
	const files: WorkflowArchivedFile[] = [];
	const push = (relativePath: string, kind?: WorkflowArchivedFile['kind']) => {
		const normalized = normalizeWorkspaceRelativePath(relativePath);
		if (!normalized || seen.has(normalized)) {
			return;
		}
		seen.add(normalized);
		files.push({
			relativePath: normalized,
			kind: kind ?? (isManagedMarkdownPath(normalized) ? 'managed-markdown' : 'full')
		});
	};

	push(CONTEXT_FILE_NAME);
	push(WORKFLOW_SESSION_FILE, 'session-json');
	if (includeBrief) {
		push(WORKFLOW_BRIEF_FILE, 'brief-markdown');
	}
	for (const stage of session.stages) {
		push(stage.stageFile);
		for (const artifactFile of stage.artifactFiles) {
			push(artifactFile);
		}
	}

	return files;
}

function isWorkflowHistoryIndex(value: unknown): value is WorkflowHistoryIndex {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const candidate = value as Partial<WorkflowHistoryIndex>;
	return typeof candidate.version === 'number' && Array.isArray(candidate.entries);
}

function isWorkflowArchiveManifest(value: unknown): value is WorkflowArchiveManifest {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const candidate = value as Partial<WorkflowArchiveManifest>;
	return typeof candidate.workflowId === 'string'
		&& typeof candidate.branchId === 'string'
		&& typeof candidate.label === 'string'
		&& typeof candidate.createdAt === 'string'
		&& typeof candidate.updatedAt === 'string'
		&& Boolean(candidate.session)
		&& Array.isArray(candidate.files);
}

async function ensureParentDirectory(fileUri: vscode.Uri): Promise<void> {
	const path = fileUri.path;
	const lastSlashIndex = path.lastIndexOf('/');
	if (lastSlashIndex <= 0) {
		return;
	}

	await vscode.workspace.fs.createDirectory(fileUri.with({ path: path.slice(0, lastSlashIndex) }));
}

async function commitWorkspaceMutationTransaction(operations: MutationOperation[]): Promise<void> {
	const snapshots = new Map<string, { uri: vscode.Uri; existed: boolean; content?: Uint8Array }>();

	try {
		for (const operation of operations) {
			const key = operation.uri.toString();
			if (snapshots.has(key)) {
				continue;
			}

			try {
				snapshots.set(key, {
					uri: operation.uri,
					existed: true,
					content: await vscode.workspace.fs.readFile(operation.uri)
				});
			} catch {
				snapshots.set(key, { uri: operation.uri, existed: false });
			}
		}

		for (const operation of operations) {
			if (operation.kind === 'write') {
				await ensureParentDirectory(operation.uri);
				await vscode.workspace.fs.writeFile(operation.uri, operation.content);
				continue;
			}

			try {
				await vscode.workspace.fs.delete(operation.uri, { recursive: false, useTrash: false });
			} catch {
				continue;
			}
		}
	} catch (error) {
		for (const snapshot of [...snapshots.values()].reverse()) {
			try {
				if (snapshot.existed && snapshot.content) {
					await ensureParentDirectory(snapshot.uri);
					await vscode.workspace.fs.writeFile(snapshot.uri, snapshot.content);
					continue;
				}

				await vscode.workspace.fs.delete(snapshot.uri, { recursive: false, useTrash: false });
			} catch {
				continue;
			}
		}

		throw error;
	}
}

function buildHistoryEntry(
	manifest: WorkflowArchiveManifest,
	manifestPath: string,
	existingEntry?: WorkflowHistoryEntry
): WorkflowHistoryEntry {
	return {
		workflowId: manifest.workflowId,
		branchId: manifest.branchId,
		parentWorkflowId: manifest.session.parentWorkflowId,
		parentStageIndex: manifest.session.parentStageIndex,
		label: manifest.label,
		createdAt: existingEntry?.createdAt ?? manifest.createdAt,
		updatedAt: manifest.updatedAt,
		currentStageIndex: manifest.session.currentStageIndex,
		stageCount: manifest.session.stages.length,
		currentPreset: manifest.session.currentPreset,
		currentProvider: manifest.session.currentProvider,
		briefSummary: manifest.brief?.goal ?? manifest.session.stages.at(-1)?.briefSummary ?? manifest.label,
		manifestPath,
		latestStageFile: manifest.session.stages.at(-1)?.stageFile
	};
}

function buildEmptyHistoryIndex(): WorkflowHistoryIndex {
	return {
		version: 1,
		entries: []
	};
}

async function readManifestAt(workspaceUri: vscode.Uri, manifestPath: string): Promise<WorkflowArchiveManifest | undefined> {
	const manifestUri = buildWorkspaceUri(workspaceUri, manifestPath);
	if (!manifestUri) {
		return undefined;
	}

	try {
		const content = await readUtf8(manifestUri);
		const parsed = JSON.parse(content) as unknown;
		return isWorkflowArchiveManifest(parsed) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

export async function readWorkflowHistoryIndex(workspaceUri: vscode.Uri): Promise<WorkflowHistoryIndex> {
	const indexUri = buildWorkspaceUri(workspaceUri, WORKFLOW_HISTORY_INDEX_FILE);
	if (!indexUri) {
		return buildEmptyHistoryIndex();
	}

	try {
		const content = await readUtf8(indexUri);
		const parsed = JSON.parse(content) as unknown;
		return isWorkflowHistoryIndex(parsed) ? parsed : buildEmptyHistoryIndex();
	} catch {
		return buildEmptyHistoryIndex();
	}
}

export async function readWorkflowArchiveManifest(workspaceUri: vscode.Uri, workflowId: string): Promise<WorkflowArchiveManifest | undefined> {
	return readManifestAt(workspaceUri, buildManifestPath(workflowId));
}

export async function archiveActiveWorkflowState(
	workspaceFolder: vscode.WorkspaceFolder,
	session: WorkflowSessionState,
	brief?: WorkflowBrief,
	workflowIdentity?: { workflowId?: string; branchId?: string; label?: string }
): Promise<WorkflowArchiveManifest> {
	const normalizedSession = normalizeSessionIdentity(session, workflowIdentity?.workflowId, workflowIdentity?.branchId, workflowIdentity?.label);
	const resolvedBrief = brief;
	const label = buildHistoryLabel(normalizedSession, resolvedBrief);
	const files = collectWorkflowFilePaths(normalizedSession, Boolean(resolvedBrief));
	const archivedFiles: WorkflowArchivedFile[] = [];
	const operations: MutationWriteOperation[] = [];

	for (const file of files) {
		if (file.kind === 'session-json' || file.kind === 'brief-markdown') {
			archivedFiles.push(file);
			continue;
		}

		const sourceUri = buildWorkspaceUri(workspaceFolder.uri, file.relativePath);
		if (!sourceUri || !(await fileExists(sourceUri))) {
			continue;
		}

		if (file.kind === 'managed-markdown') {
			const generatedContent = extractManagedMarkdownContent(await readUtf8(sourceUri));
			if (!generatedContent) {
				continue;
			}

			archivedFiles.push({
				...file,
				generatedContent
			});
			continue;
		}

		const archivePath = buildArchiveFilePath(normalizedSession.workflowId!, file.relativePath);
		const archiveUri = buildWorkspaceUri(workspaceFolder.uri, archivePath);
		if (!archiveUri) {
			continue;
		}

		operations.push({
			kind: 'write',
			uri: archiveUri,
			content: await vscode.workspace.fs.readFile(sourceUri)
		});
		archivedFiles.push({
			...file,
			archivePath
		});
	}

	const manifest: WorkflowArchiveManifest = {
		workflowId: normalizedSession.workflowId!,
		branchId: normalizedSession.branchId!,
		label,
		createdAt: normalizedSession.createdAt ?? normalizedSession.updatedAt,
		updatedAt: normalizedSession.updatedAt,
		session: {
			...normalizedSession,
			label
		},
		brief: resolvedBrief,
		files: archivedFiles
	};

	const index = await readWorkflowHistoryIndex(workspaceFolder.uri);
	const manifestPath = buildManifestPath(manifest.workflowId);
	const manifestUri = buildWorkspaceUri(workspaceFolder.uri, manifestPath);
	const indexUri = buildWorkspaceUri(workspaceFolder.uri, WORKFLOW_HISTORY_INDEX_FILE);
	if (!manifestUri || !indexUri) {
		throw new Error('Unable to resolve workflow history paths.');
	}

	const nextEntries = index.entries.filter((entry) => entry.workflowId !== manifest.workflowId);
	const existingEntry = index.entries.find((entry) => entry.workflowId === manifest.workflowId);
	nextEntries.unshift(buildHistoryEntry(manifest, manifestPath, existingEntry));

	operations.push({
		kind: 'write',
		uri: manifestUri,
		content: toUtf8Bytes(`${JSON.stringify(manifest, null, 2)}\n`)
	});
	operations.push({
		kind: 'write',
		uri: indexUri,
		content: toUtf8Bytes(`${JSON.stringify({
			...index,
			activeWorkflowId: manifest.workflowId,
			entries: nextEntries
		}, null, 2)}\n`)
	});

	await commitWorkspaceMutationTransaction(operations);
	return manifest;
}

function buildCleanupOperation(uri: vscode.Uri, relativePath: string, existingContent?: string): MutationOperation | undefined {
	if (!isManagedMarkdownPath(relativePath)) {
		return { kind: 'delete', uri };
	}

	const nextContent = existingContent ? removeManagedMarkdownBlock(existingContent) : '';
	if (!nextContent) {
		return { kind: 'delete', uri };
	}

	return {
		kind: 'write',
		uri,
		content: toUtf8Bytes(nextContent)
	};
}

export async function restoreWorkflowFromHistory(workspaceFolder: vscode.WorkspaceFolder, workflowId: string): Promise<WorkflowArchiveManifest | undefined> {
	const manifest = await readWorkflowArchiveManifest(workspaceFolder.uri, workflowId);
	if (!manifest) {
		return undefined;
	}

	const currentIndex = await readWorkflowHistoryIndex(workspaceFolder.uri);
	const currentManifest = currentIndex.activeWorkflowId && currentIndex.activeWorkflowId !== workflowId
		? await readWorkflowArchiveManifest(workspaceFolder.uri, currentIndex.activeWorkflowId)
		: undefined;
	const currentPaths = new Set((currentManifest?.files ?? []).map((file) => normalizeWorkspaceRelativePath(file.relativePath)));
	const targetPaths = new Set(manifest.files.map((file) => normalizeWorkspaceRelativePath(file.relativePath)));
	const operations: MutationOperation[] = [];

	for (const file of manifest.files) {
		const targetUri = buildWorkspaceUri(workspaceFolder.uri, file.relativePath);
		if (!targetUri) {
			continue;
		}

		if (file.kind === 'session-json') {
			operations.push({
				kind: 'write',
				uri: targetUri,
				content: toUtf8Bytes(buildWorkflowSessionContent(manifest.session))
			});
			continue;
		}

		if (file.kind === 'brief-markdown') {
			if (!manifest.brief) {
				continue;
			}
			operations.push({
				kind: 'write',
				uri: targetUri,
				content: toUtf8Bytes(buildWorkflowBriefContent(manifest.brief))
			});
			continue;
		}

		if (file.kind === 'managed-markdown') {
			const existingContent = await (async () => {
				try {
					return await readUtf8(targetUri);
				} catch {
					return undefined;
				}
			})();
			const nextContent = replaceManagedBlock(existingContent ?? '', buildManagedMarkdownBlock(file.generatedContent ?? ''));
			operations.push({
				kind: 'write',
				uri: targetUri,
				content: toUtf8Bytes(nextContent)
			});
			continue;
		}

		const archiveUri = file.archivePath ? buildWorkspaceUri(workspaceFolder.uri, file.archivePath) : undefined;
		if (!archiveUri || !(await fileExists(archiveUri))) {
			continue;
		}

		operations.push({
			kind: 'write',
			uri: targetUri,
			content: await vscode.workspace.fs.readFile(archiveUri)
		});
	}

	for (const relativePath of currentPaths) {
		if (targetPaths.has(relativePath)) {
			continue;
		}

		const currentUri = buildWorkspaceUri(workspaceFolder.uri, relativePath);
		if (!currentUri || !(await fileExists(currentUri))) {
			continue;
		}

		const existingContent = isManagedMarkdownPath(relativePath) ? await readUtf8(currentUri) : undefined;
		const cleanupOperation = buildCleanupOperation(currentUri, relativePath, existingContent);
		if (cleanupOperation) {
			operations.push(cleanupOperation);
		}
	}

	const historyIndexUri = buildWorkspaceUri(workspaceFolder.uri, WORKFLOW_HISTORY_INDEX_FILE);
	if (historyIndexUri) {
		operations.push({
			kind: 'write',
			uri: historyIndexUri,
			content: toUtf8Bytes(`${JSON.stringify({
				...currentIndex,
				activeWorkflowId: workflowId
			}, null, 2)}\n`)
		});
	}

	await commitWorkspaceMutationTransaction(operations);
	return manifest;
}

export async function cleanActiveWorkflowFiles(workspaceFolder: vscode.WorkspaceFolder): Promise<boolean> {
	const index = await readWorkflowHistoryIndex(workspaceFolder.uri);
	const manifest = index.activeWorkflowId ? await readWorkflowArchiveManifest(workspaceFolder.uri, index.activeWorkflowId) : undefined;
	if (!manifest) {
		return false;
	}

	const operations: MutationOperation[] = [];
	for (const file of manifest.files) {
		const targetUri = buildWorkspaceUri(workspaceFolder.uri, file.relativePath);
		if (!targetUri || !(await fileExists(targetUri))) {
			continue;
		}

		if (file.kind === 'managed-markdown') {
			const cleanupOperation = buildCleanupOperation(targetUri, file.relativePath, await readUtf8(targetUri));
			if (cleanupOperation) {
				operations.push(cleanupOperation);
			}
			continue;
		}

		operations.push({ kind: 'delete', uri: targetUri });
	}

	const indexUri = buildWorkspaceUri(workspaceFolder.uri, WORKFLOW_HISTORY_INDEX_FILE);
	if (indexUri) {
		operations.push({
			kind: 'write',
			uri: indexUri,
			content: toUtf8Bytes(`${JSON.stringify({
				...index,
				activeWorkflowId: undefined
			}, null, 2)}\n`)
		});
	}

	await commitWorkspaceMutationTransaction(operations);
	return true;
}

export async function forkWorkflowFromHistory(
	workspaceFolder: vscode.WorkspaceFolder,
	sourceWorkflowId: string,
	labelOverride?: string
): Promise<WorkflowArchiveManifest | undefined> {
	const sourceManifest = await readWorkflowArchiveManifest(workspaceFolder.uri, sourceWorkflowId);
	if (!sourceManifest) {
		return undefined;
	}

	const forkedWorkflowId = createWorkflowId();
	const forkedBranchId = 'main';
	const now = new Date().toISOString();
	const forkedLabel = labelOverride?.trim() || `Branch of ${sourceManifest.label}`;
	const operations: MutationWriteOperation[] = [];

	const forkedFiles: WorkflowArchivedFile[] = [];
	for (const file of sourceManifest.files) {
		if (file.kind === 'session-json' || file.kind === 'brief-markdown') {
			forkedFiles.push({ ...file });
			continue;
		}

		if (file.kind === 'managed-markdown') {
			forkedFiles.push({
				...file,
				generatedContent: file.generatedContent
			});
			continue;
		}

		const sourceArchiveUri = file.archivePath ? buildWorkspaceUri(workspaceFolder.uri, file.archivePath) : undefined;
		if (!sourceArchiveUri || !(await fileExists(sourceArchiveUri))) {
			continue;
		}

		const forkedArchivePath = buildArchiveFilePath(forkedWorkflowId, file.relativePath);
		const forkedArchiveUri = buildWorkspaceUri(workspaceFolder.uri, forkedArchivePath);
		if (!forkedArchiveUri) {
			continue;
		}

		operations.push({
			kind: 'write',
			uri: forkedArchiveUri,
			content: await vscode.workspace.fs.readFile(sourceArchiveUri)
		});
		forkedFiles.push({
			...file,
			archivePath: forkedArchivePath
		});
	}

	const forkedSession: WorkflowSessionState = {
		...sourceManifest.session,
		workflowId: forkedWorkflowId,
		branchId: forkedBranchId,
		parentWorkflowId: sourceManifest.workflowId,
		parentStageIndex: sourceManifest.session.currentStageIndex,
		createdAt: now,
		updatedAt: now,
		label: forkedLabel,
		stages: sourceManifest.session.stages.map((stage) => ({
			...stage,
			workflowId: forkedWorkflowId,
			branchId: forkedBranchId
		}))
	};

	const forkedManifest: WorkflowArchiveManifest = {
		workflowId: forkedWorkflowId,
		branchId: forkedBranchId,
		label: forkedLabel,
		createdAt: now,
		updatedAt: now,
		session: forkedSession,
		brief: sourceManifest.brief,
		files: forkedFiles
	};

	const currentIndex = await readWorkflowHistoryIndex(workspaceFolder.uri);
	const manifestPath = buildManifestPath(forkedWorkflowId);
	const manifestUri = buildWorkspaceUri(workspaceFolder.uri, manifestPath);
	const indexUri = buildWorkspaceUri(workspaceFolder.uri, WORKFLOW_HISTORY_INDEX_FILE);
	if (!manifestUri || !indexUri) {
		throw new Error('Unable to resolve workflow fork history paths.');
	}

	operations.push({
		kind: 'write',
		uri: manifestUri,
		content: toUtf8Bytes(`${JSON.stringify(forkedManifest, null, 2)}\n`)
	});
	operations.push({
		kind: 'write',
		uri: indexUri,
		content: toUtf8Bytes(`${JSON.stringify({
			...currentIndex,
			entries: [buildHistoryEntry(forkedManifest, manifestPath), ...currentIndex.entries.filter((entry) => entry.workflowId !== forkedWorkflowId)]
		}, null, 2)}\n`)
	});

	await commitWorkspaceMutationTransaction(operations);
	return forkedManifest;
}

export async function forkWorkflowFromHistoryAtStage(
	workspaceFolder: vscode.WorkspaceFolder,
	sourceWorkflowId: string,
	stageIndex: number,
	labelOverride?: string
): Promise<WorkflowArchiveManifest | undefined> {
	const sourceManifest = await readWorkflowArchiveManifest(workspaceFolder.uri, sourceWorkflowId);
	if (!sourceManifest) {
		return undefined;
	}

	const sourceStages = sourceManifest.session.stages.filter((stage) => stage.index <= stageIndex);
	if (sourceStages.length === 0) {
		return undefined;
	}

	const selectedStage = sourceStages.at(-1);
	if (!selectedStage) {
		return undefined;
	}

	const allowedPaths = new Set<string>([
		CONTEXT_FILE_NAME,
		WORKFLOW_SESSION_FILE,
		...(sourceManifest.brief ? [WORKFLOW_BRIEF_FILE] : []),
		...sourceStages.map((stage) => normalizeWorkspaceRelativePath(stage.stageFile))
	]);
	const forkedWorkflowId = createWorkflowId();
	const forkedBranchId = 'main';
	const now = new Date().toISOString();
	const forkedLabel = labelOverride?.trim() || `Branch of ${sourceManifest.label} @ stage ${String(stageIndex).padStart(2, '0')}`;
	const operations: MutationWriteOperation[] = [];

	const forkedFiles: WorkflowArchivedFile[] = [];
	for (const file of sourceManifest.files) {
		const normalizedPath = normalizeWorkspaceRelativePath(file.relativePath);
		if (!allowedPaths.has(normalizedPath)) {
			continue;
		}

		if (file.kind === 'session-json' || file.kind === 'brief-markdown') {
			forkedFiles.push({ ...file });
			continue;
		}

		const sourceArchiveUri = file.archivePath ? buildWorkspaceUri(workspaceFolder.uri, file.archivePath) : undefined;
		if (!sourceArchiveUri || !(await fileExists(sourceArchiveUri))) {
			continue;
		}

		const forkedArchivePath = buildArchiveFilePath(forkedWorkflowId, file.relativePath);
		const forkedArchiveUri = buildWorkspaceUri(workspaceFolder.uri, forkedArchivePath);
		if (!forkedArchiveUri) {
			continue;
		}

		operations.push({
			kind: 'write',
			uri: forkedArchiveUri,
			content: await vscode.workspace.fs.readFile(sourceArchiveUri)
		});
		forkedFiles.push({
			relativePath: normalizedPath,
			kind: 'full',
			archivePath: forkedArchivePath
		});
	}

	const forkedSession: WorkflowSessionState = {
		...sourceManifest.session,
		workflowId: forkedWorkflowId,
		branchId: forkedBranchId,
		parentWorkflowId: sourceManifest.workflowId,
		parentStageIndex: stageIndex,
		createdAt: now,
		updatedAt: now,
		label: forkedLabel,
		currentStageIndex: selectedStage.index,
		currentPreset: selectedStage.preset,
		currentProvider: selectedStage.provider,
		currentProviderModel: selectedStage.providerModel,
		currentProviderAccountId: selectedStage.providerAccountId,
		currentClaudeAccountId: selectedStage.claudeAccountId,
		currentClaudeEffort: selectedStage.claudeEffort,
		stages: sourceStages.map((stage) => ({
			...stage,
			workflowId: forkedWorkflowId,
			branchId: forkedBranchId,
			artifactFiles: []
		}))
	};

	const forkedManifest: WorkflowArchiveManifest = {
		workflowId: forkedWorkflowId,
		branchId: forkedBranchId,
		label: forkedLabel,
		createdAt: now,
		updatedAt: now,
		session: forkedSession,
		brief: sourceManifest.brief,
		files: forkedFiles
	};

	const currentIndex = await readWorkflowHistoryIndex(workspaceFolder.uri);
	const manifestPath = buildManifestPath(forkedWorkflowId);
	const manifestUri = buildWorkspaceUri(workspaceFolder.uri, manifestPath);
	const indexUri = buildWorkspaceUri(workspaceFolder.uri, WORKFLOW_HISTORY_INDEX_FILE);
	if (!manifestUri || !indexUri) {
		throw new Error('Unable to resolve workflow stage fork history paths.');
	}

	operations.push({
		kind: 'write',
		uri: manifestUri,
		content: toUtf8Bytes(`${JSON.stringify(forkedManifest, null, 2)}\n`)
	});
	operations.push({
		kind: 'write',
		uri: indexUri,
		content: toUtf8Bytes(`${JSON.stringify({
			...currentIndex,
			entries: [buildHistoryEntry(forkedManifest, manifestPath), ...currentIndex.entries.filter((entry) => entry.workflowId !== forkedWorkflowId)]
		}, null, 2)}\n`)
	});

	await commitWorkspaceMutationTransaction(operations);
	return forkedManifest;
}

export async function deleteWorkflowFromHistory(
	workspaceFolder: vscode.WorkspaceFolder,
	workflowId: string
): Promise<boolean> {
	const index = await readWorkflowHistoryIndex(workspaceFolder.uri);
	const entryExists = index.entries.some((e) => e.workflowId === workflowId);
	if (!entryExists) {
		return false;
	}

	const operations: MutationOperation[] = [];

	const manifest = await readWorkflowArchiveManifest(workspaceFolder.uri, workflowId);
	if (manifest) {
		for (const file of manifest.files) {
			if (file.archivePath) {
				const archiveUri = buildWorkspaceUri(workspaceFolder.uri, file.archivePath);
				if (archiveUri) {
					operations.push({ kind: 'delete', uri: archiveUri });
				}
			}
		}
	}

	const manifestPath = buildManifestPath(workflowId);
	const manifestUri = buildWorkspaceUri(workspaceFolder.uri, manifestPath);
	if (manifestUri) {
		operations.push({ kind: 'delete', uri: manifestUri });
	}

	const nextEntries = index.entries.filter((e) => e.workflowId !== workflowId);
	const indexUri = buildWorkspaceUri(workspaceFolder.uri, WORKFLOW_HISTORY_INDEX_FILE);
	if (!indexUri) {
		throw new Error('Unable to resolve workflow history index path.');
	}

	operations.push({
		kind: 'write',
		uri: indexUri,
		content: toUtf8Bytes(`${JSON.stringify({
			...index,
			activeWorkflowId: index.activeWorkflowId === workflowId ? undefined : index.activeWorkflowId,
			entries: nextEntries
		}, null, 2)}\n`)
	});

	await commitWorkspaceMutationTransaction(operations);
	return true;
}

export async function repairWorkflowHistoryIndex(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
	const index = await readWorkflowHistoryIndex(workspaceFolder.uri);
	const validEntries: WorkflowHistoryEntry[] = [];

	for (const entry of index.entries) {
		const manifestUri = buildWorkspaceUri(workspaceFolder.uri, entry.manifestPath);
		if (manifestUri && await fileExists(manifestUri)) {
			validEntries.push(entry);
		}
	}

	if (validEntries.length === index.entries.length) {
		return;
	}

	const indexUri = buildWorkspaceUri(workspaceFolder.uri, WORKFLOW_HISTORY_INDEX_FILE);
	if (!indexUri) {
		return;
	}

	const repairedActiveWorkflowId = index.activeWorkflowId && validEntries.some((e) => e.workflowId === index.activeWorkflowId)
		? index.activeWorkflowId
		: undefined;

	await commitWorkspaceMutationTransaction([{
		kind: 'write',
		uri: indexUri,
		content: toUtf8Bytes(`${JSON.stringify({
			...index,
			activeWorkflowId: repairedActiveWorkflowId,
			entries: validEntries
		}, null, 2)}\n`)
	}]);
}

export function buildWorkflowHistoryQuickPickLabel(entry: WorkflowHistoryEntry): string {
	return `${entry.label} (${entry.currentPreset} -> ${entry.currentProvider})`;
}

export function applyWorkflowIdentityToPlan(workflowPlan: WorkflowExecutionPlan, workflowIdentity: { workflowId?: string; branchId?: string; startNewWorkflow?: boolean }): WorkflowExecutionPlan {
	return {
		...workflowPlan,
		workflowId: workflowIdentity.workflowId ?? workflowPlan.workflowId,
		branchId: workflowIdentity.branchId ?? workflowPlan.branchId,
		startNewWorkflow: workflowIdentity.startNewWorkflow ?? workflowPlan.startNewWorkflow
	};
}

function collectGeneratedAgentPaths(): string[] {
	const roles = new Set(Object.values(WORKFLOW_PRESETS).flatMap((preset) => preset.roles));
	return [...roles].flatMap((role) => [
		`.claude/agents/orchestrator-${role}.md`,
		`.gemini/agents/orchestrator-${role}.md`,
		`.github/agents/orchestrator-${role}.agent.md`
	]);
}

function collectGeneratedSkillDirectories(): string[] {
	const skillNames = new Set(Object.values(WORKFLOW_PRESETS).map((preset) => preset.artifactSkillName));
	return [...skillNames].flatMap((skillName) => [
		`.claude/skills/${skillName}`,
		`.gemini/skills/${skillName}`,
		`.github/skills/${skillName}`
	]);
}

export interface ResetWorkspaceFilesResult {
	deletedPaths: number;
	cleanedManagedFiles: number;
}

export async function resetWorkflowRuntimeFiles(workspaceFolder: vscode.WorkspaceFolder): Promise<ResetWorkspaceFilesResult> {
	let deletedPaths = 0;

	const deletePath = async (relativePath: string, recursive: boolean): Promise<void> => {
		const uri = buildWorkspaceUri(workspaceFolder.uri, relativePath);
		if (!uri || !(await fileExists(uri))) {
			return;
		}

		try {
			await vscode.workspace.fs.delete(uri, { recursive, useTrash: false });
			deletedPaths += 1;
		} catch {
			// On Windows, open files or terminals inside the directory cause EBUSY — skip gracefully
		}
	};

	await deletePath(CONTEXT_FILE_NAME, false);
	await deletePath(WORKFLOW_STATE_DIRECTORY, true);

	return {
		deletedPaths,
		cleanedManagedFiles: 0
	};
}

export async function resetOrchestratorWorkspaceFiles(workspaceFolder: vscode.WorkspaceFolder): Promise<ResetWorkspaceFilesResult> {
	let deletedPaths = 0;
	let cleanedManagedFiles = 0;

	const deletePath = async (relativePath: string, recursive: boolean): Promise<void> => {
		const uri = buildWorkspaceUri(workspaceFolder.uri, relativePath);
		if (!uri || !(await fileExists(uri))) {
			return;
		}

		try {
			await vscode.workspace.fs.delete(uri, { recursive, useTrash: false });
			deletedPaths += 1;
		} catch {
			// On Windows, open files or terminals inside the directory cause EBUSY — skip gracefully
		}
	};

	const cleanupManagedMarkdownPath = async (relativePath: string): Promise<void> => {
		const uri = buildWorkspaceUri(workspaceFolder.uri, relativePath);
		if (!uri || !(await fileExists(uri))) {
			return;
		}

		const existingContent = await readUtf8(uri);
		const nextContent = removeManagedMarkdownBlock(existingContent);
		if (!nextContent) {
			await vscode.workspace.fs.delete(uri, { recursive: false, useTrash: false });
			deletedPaths += 1;
			return;
		}

		if (nextContent !== existingContent) {
			await vscode.workspace.fs.writeFile(uri, toUtf8Bytes(nextContent));
			cleanedManagedFiles += 1;
		}
	};

	await deletePath(CONTEXT_FILE_NAME, false);
	await deletePath(WORKFLOW_STATE_DIRECTORY, true);

	for (const managedPath of ['CLAUDE.md', 'GEMINI.md', '.github/copilot-instructions.md']) {
		await cleanupManagedMarkdownPath(managedPath);
	}

	for (const agentPath of collectGeneratedAgentPaths()) {
		await deletePath(agentPath, false);
	}

	for (const skillDirectory of collectGeneratedSkillDirectories()) {
		await deletePath(skillDirectory, true);
	}

	return {
		deletedPaths,
		cleanedManagedFiles
	};
}